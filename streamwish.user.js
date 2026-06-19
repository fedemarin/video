// ==UserScript==
// @name         Canal TV - STREAMWISH (anti-ads + autoplay + auto-siguiente)
// @namespace    https://github.com/fedemarin/video
// @version      1.2.0
// @description  Oculta publicidad, arranca el video solo y avisa a la pagina padre cuando termina, para pasar al siguiente capitulo.
// @author       vos
// @match        https://streamwish.top/e/*
// @match        https://*.streamwish.top/e/*
// @match        https://streamwish.to/e/*
// @run-at       document-start
// @grant        none
// @updateURL    https://fedemarin.github.io/video/streamwish.user.js
// @downloadURL  https://fedemarin.github.io/video/streamwish.user.js
// ==/UserScript==

(function () {
  "use strict";

  // 1) MATAR POPUPS (varias vias que usan estos hosts).
  try {
    // a) window.open bloqueado y NO reescribible por el host.
    Object.defineProperty(window, "open", {
      configurable: false,
      get() { return function () { return null; }; },
      set() { /* ignorar intentos de reasignar */ },
    });
  } catch (e) {
    try { window.open = function () { return null; }; } catch (e2) {}
  }

  // (b) Nota: NO sobreescribimos HTMLElement.prototype.click porque jwplayer
  //     lo usa internamente para arrancar; hacerlo rompia el reproductor.

  // c) en fase de captura, frenamos clics que abririan pestaña externa,
  //    sin estorbar los clics sobre el <video>/controles.
  window.addEventListener("click", function (e) {
    const a = e.target && e.target.closest && e.target.closest('a[target="_blank"]');
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // d) bloquear redirecciones forzadas de toda la pestaña.
  window.addEventListener("beforeunload", function (e) {
    // no hacemos nada destructivo, solo evitamos prompts de salida de ads
  });

  // 2) OCULTAR ADS: estilos que esconden overlays tipico de estos hosts.
  const css = `
    /* contenedores de publicidad / overlays frecuentes */
    .ad, .ads, .advertisement, [id*="ad_"], [class*="ad_"],
    [id^="ad"], iframe[src*="ads"], .pop, .popup, .vast, .vpaid,
    a[href*="//"][target="_blank"]:not(.jw-video):empty,
    #overlay-ads, .video-ads, .jw-overlays > div:not(.jw-controls) {
      display: none !important; visibility: hidden !important;
      pointer-events: none !important; opacity: 0 !important;
    }
    /* asegurar que el player se vea completo */
    video, .jwplayer, #vplayer { z-index: 2147483646 !important; }
  `;
  function inyectarCss() {
    const s = document.createElement("style");
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  inyectarCss();

  // 3) AUTOPLAY + 4) AVISAR "terminó" al padre.
  function avisarPadre(tipo, extra) {
    try {
      parent.postMessage(Object.assign({ canal: "streamwish", tipo: tipo }, extra || {}), "*");
    } catch (e) {}
  }

  function engancharVideo(v) {
    if (!v || v.__canalEnganchado) return;
    v.__canalEnganchado = true;
    // CLAVE: arrancamos MUTEADO. El navegador permite autoplay solo si esta
    // en silencio; embebido cross-origin no hay gesto que destrabe el sonido,
    // asi que muteado es la unica forma de que el video arranque solo.
    v.muted = true;
    v.setAttribute("muted", "");
    const intentarPlay = () => v.play().catch(() => {});
    intentarPlay();
    v.addEventListener("canplay", intentarPlay, { once: true });
    v.addEventListener("loadeddata", intentarPlay, { once: true });
    v.addEventListener("ended", () => avisarPadre("ended"));
    v.addEventListener("play", () => avisarPadre("play"));
    v.addEventListener("timeupdate", () => {
      if (v.duration && v.currentTime >= v.duration - 0.8) avisarPadre("casi-fin");
    });

    // Al primer clic/tecla del usuario dentro del player, quitamos el mute.
    const desmutear = () => { v.muted = false; };
    document.addEventListener("click", desmutear, { once: true });
    document.addEventListener("keydown", desmutear, { once: true });
  }

  // jwplayer expone eventos mas confiables que el <video> crudo
  function engancharJW() {
    try {
      if (window.jwplayer && jwplayer().on) {
        jwplayer().on("complete", () => avisarPadre("ended"));
        jwplayer().on("ready", () => {
          try { jwplayer().setMute(true); } catch (e) {}
          try { jwplayer().play(); } catch (e) {}
        });
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Observamos el DOM hasta que aparezca el <video> / jwplayer.
  const obs = new MutationObserver(() => {
    const v = document.querySelector("video");
    if (v) engancharVideo(v);
    engancharJW();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // primer intento por las dudas
  window.addEventListener("load", () => {
    const v = document.querySelector("video");
    if (v) engancharVideo(v);
    engancharJW();
    avisarPadre("listo");
  });
})();
