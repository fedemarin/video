// ==UserScript==
// @name         Canal TV - STREAMWISH (anti-ads + autoplay + auto-siguiente)
// @namespace    https://github.com/fedemarin/video
// @version      1.6.0
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

  // b) Interceptar HTMLElement.prototype.click: los popunders crean un
  //    <a target=_blank> DESPEGADO del DOM y le llaman .click() por codigo.
  //    Eso no burbujea hasta window, asi que solo se atrapa aca. Bloqueamos
  //    SOLO anclas con target=_blank que no sean parte de jwplayer; el resto
  //    (incluidos los botones internos del player) pasan normal.
  try {
    const _click = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () {
      if (this.tagName === "A" && this.target === "_blank" &&
          !(this.closest && this.closest(".jwplayer, .jw-wrapper"))) {
        return; // popunder bloqueado
      }
      return _click.apply(this, arguments);
    };
  } catch (e) {}

  // c) Bloquear popunders: los ads ponen un <a target=_blank> (o capturan el
  //    primer clic) por ENCIMA del player. El reproductor jwplayer usa <div>,
  //    no <a>. Asi que bloqueamos cualquier clic sobre un <a> que NO sea parte
  //    de jwplayer, en varias fases (mousedown/pointerdown/click/auxclick).
  function esAnclaDeAd(target) {
    if (!target || !target.closest) return null;
    const a = target.closest("a");
    if (!a) return null;
    if (a.closest(".jwplayer, .jw-wrapper")) return null; // respetar el player
    return a;
  }
  ["pointerdown", "mousedown", "mouseup", "click", "auxclick"].forEach((tipo) => {
    window.addEventListener(tipo, function (e) {
      const a = esAnclaDeAd(e.target);
      if (a) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
    }, true);
  });

  // d) Sacar target=_blank de las anclas a medida que aparecen (mata el popunder
  //    sin navegar la pestaña), salvo dentro de jwplayer.
  function limpiarAnclas(root) {
    (root.querySelectorAll ? root.querySelectorAll('a[target="_blank"]') : []).forEach((a) => {
      if (!a.closest(".jwplayer, .jw-wrapper")) a.removeAttribute("target");
    });
  }
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes && m.addedNodes.forEach((n) => { if (n.nodeType === 1) limpiarAnclas(n); }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  // e) evitar prompts de "¿seguro que querés salir?" de los ads.
  window.addEventListener("beforeunload", function () {});

  // 2) OCULTAR ADS: estilos que esconden overlays tipico de estos hosts.
  const css = `
    /* ocultar SOLO contenedores de publicidad conocidos, sin tocar jwplayer */
    .advertisement, .video-ads, #overlay-ads, .vast, .vpaid,
    iframe[src*="ads"], iframe[src*="adserver"],
    a[href*="//"][target="_blank"]:empty {
      display: none !important; pointer-events: none !important; opacity: 0 !important;
    }
    /* NO escondemos clases genericas tipo [class*=ad] ni .jw-overlays
       porque ahi viven los controles del reproductor. */

    /* forzar que los controles de jwplayer sean usables/visibles */
    .jw-controls, .jw-controlbar, .jw-display, .jw-display-icon-container,
    .jw-icon, .jw-svg-icon { opacity: 1 !important; visibility: visible !important;
      pointer-events: auto !important; z-index: 2147483647 !important; }
    .jwplayer.jw-flag-user-inactive .jw-controls { opacity: 1 !important; }
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

    // Al primer clic/tecla del usuario quitamos el mute (sin parpadeos: NO
    // intentamos desmutear solos, porque Chrome lo bloquea y suena cortado).
    const desmutear = () => { v.muted = false; try { if (window.jwplayer) jwplayer().setMute(false); } catch (e) {} };
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
