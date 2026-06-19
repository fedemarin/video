// ==UserScript==
// @name         Canal TV - STREAMWISH (anti-ads + autoplay + auto-siguiente)
// @namespace    https://github.com/fedemarin/video
// @version      1.1.0
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

  try {
    // b) pop-under via <a target="_blank"> clickeado por codigo:
    //    le sacamos el target a cualquier ancla que apunte afuera.
    const _click = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () {
      if (this.tagName === "A" && this.target === "_blank") {
        // no abrimos pestaña nueva
        return;
      }
      return _click.apply(this, arguments);
    };
  } catch (e) {}

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
    v.muted = false;
    // autoplay (si el navegador exige gesto, igual queda listo para 1 clic)
    const intentarPlay = () => v.play().catch(() => {});
    intentarPlay();
    v.addEventListener("canplay", intentarPlay, { once: true });
    v.addEventListener("ended", () => avisarPadre("ended"));
    v.addEventListener("play", () => avisarPadre("play"));
    v.addEventListener("timeupdate", () => {
      // respaldo: si quedan <1s y casi termino, avisamos igual
      if (v.duration && v.currentTime >= v.duration - 0.8) avisarPadre("casi-fin");
    });
  }

  // jwplayer expone eventos mas confiables que el <video> crudo
  function engancharJW() {
    try {
      if (window.jwplayer && jwplayer().on) {
        jwplayer().on("complete", () => avisarPadre("ended"));
        jwplayer().on("ready", () => { try { jwplayer().play(); } catch (e) {} });
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
