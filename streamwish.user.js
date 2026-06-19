// ==UserScript==
// @name         Canal TV - STREAMWISH (anti-ads + autoplay + auto-siguiente)
// @namespace    https://github.com/fedemarin/video
// @version      2.1.1
// @description  Bloquea popups, arranca el video solo, sube el volumen gradual y avisa al padre cuando termina. Con logs [CanalTV] para depurar.
// @author       vos
// @match        https://streamwish.top/e/*
// @match        https://*.streamwish.top/e/*
// @match        https://streamwish.to/e/*
// @run-at       document-start
// @grant        none
// @updateURL    https://fedemarin.github.io/video/streamwish.user.js
// @downloadURL  https://fedemarin.github.io/video/streamwish.user.js
// ==/UserScript==

/* global jwplayer */
(function () {
  "use strict";

  // ---------- LOG ----------
  const T0 = performance.now();
  const log = (...a) => console.log("[CanalTV +" + (performance.now() - T0).toFixed(0) + "ms]", ...a);
  log("userscript v2.1.1 iniciado. window.open era nativo?:",
      String(window.open).indexOf("native code") >= 0);

  // ---------- 1) BLOQUEO DE POPUPS (varias vias) ----------

  // a) window.open -> noop, blindado contra reasignacion.
  let openBloqueos = 0;
  try {
    Object.defineProperty(window, "open", {
      configurable: false,
      get() { return function () { openBloqueos++; log("BLOQUEADO window.open #" + openBloqueos); return null; }; },
      set() { log("el host intento reasignar window.open (ignorado)"); },
    });
    log("window.open blindado OK");
  } catch (e) {
    try { window.open = function () { openBloqueos++; return null; }; log("window.open reasignado (fallback)"); } catch (e2) { log("no se pudo tocar window.open", e2); }
  }

  // b) HTMLElement.prototype.click -> bloquea popunders que crean un
  //    <a target=_blank> despegado del DOM y le llaman .click() por codigo.
  try {
    const _click = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () {
      if (this.tagName === "A" && this.target === "_blank" &&
          !(this.closest && this.closest(".jwplayer, .jw-wrapper"))) {
        log("BLOQUEADO a.click() popunder ->", (this.href || "").slice(0, 60));
        return;
      }
      return _click.apply(this, arguments);
    };
    log("HTMLElement.click interceptado OK");
  } catch (e) { log("no se pudo interceptar click", e); }

  // c) Clics sobre <a> que NO sean del player, en varias fases.
  function anclaDeAd(t) {
    if (!t || !t.closest) return null;
    const a = t.closest("a");
    if (!a) return null;
    if (a.closest(".jwplayer, .jw-wrapper")) return null;
    return a;
  }
  ["pointerdown", "mousedown", "mouseup", "click", "auxclick"].forEach((tipo) => {
    window.addEventListener(tipo, function (e) {
      const a = anclaDeAd(e.target);
      if (a) {
        log("BLOQUEADO " + tipo + " sobre ancla ->", (a.href || "").slice(0, 60));
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
    }, true);
  });

  // d) Sacar target=_blank de anclas nuevas (fuera del player).
  function limpiarAnclas(root) {
    (root.querySelectorAll ? root.querySelectorAll('a[target="_blank"]') : []).forEach((a) => {
      if (!a.closest(".jwplayer, .jw-wrapper")) { a.removeAttribute("target"); }
    });
  }
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes && m.addedNodes.forEach((n) => { if (n.nodeType === 1) limpiarAnclas(n); }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("beforeunload", function () {});

  // ---------- 2) DEJAR SOLO EL VIDEO ----------
  //   Ocultamos los controles y carteles del host (los reemplazan los botones
  //   propios de la pagina padre) y la publicidad sobre el video.
  const css = `
    /* publicidad */
    .advertisement, .video-ads, #overlay-ads, .vast, .vpaid,
    iframe[src*="ads"], iframe[src*="adserver"],
    a[href*="//"][target="_blank"]:empty { display: none !important; }

    /* controles y adornos del reproductor del host: fuera */
    .jw-controls, .jw-controlbar, .jw-display, .jw-display-icon-container,
    .jw-title, .jw-logo, .jw-overlays, .jw-nextup-container,
    .jw-rightclick, .jw-preview, .jw-captions, .jw-float-icon {
      display: none !important; opacity: 0 !important; pointer-events: none !important;
    }

    /* el video ocupa todo y nada mas tapa */
    video, .jwplayer, .jw-wrapper, .jw-media {
      background: #000 !important; }
    video { width: 100% !important; height: 100% !important; object-fit: contain !important; }
    html, body { background:#000 !important; margin:0 !important; overflow:hidden !important; }
  `;
  function inyectarCss() {
    const s = document.createElement("style");
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  inyectarCss();

  // ---------- 3) AVISAR AL PADRE ----------
  function avisarPadre(tipo, extra) {
    try { parent.postMessage(Object.assign({ canal: "streamwish", tipo }, extra || {}), "*"); } catch (e) {}
  }

  // ---------- 3b) RECIBIR COMANDOS DE LA PAGINA PADRE ----------
  function jw() { try { return window.jwplayer ? jwplayer() : null; } catch (e) { return null; } }
  window.addEventListener("message", (ev) => {
    const d = ev.data || {};
    if (d.canal !== "canal-cmd") return;
    const v = document.querySelector("video");
    const p = jw();
    try {
      switch (d.cmd) {
        case "toggle":
          if (p && p.getState) { (p.getState() === "playing") ? p.pause() : p.play(); }
          else if (v) { v.paused ? v.play() : v.pause(); }
          break;
        case "play":  p ? p.play() : v && v.play(); break;
        case "pause": p ? p.pause() : v && v.pause(); break;
        case "seek":  if (p && p.seek) p.seek(d.value); else if (v) v.currentTime = d.value; break;
        case "volume":
          if (v) { v.muted = d.value === 0; v.volume = d.value; }
          if (p) { p.setMute(d.value === 0); p.setVolume(Math.round(d.value * 100)); }
          break;
        case "mute":
          if (v) v.muted = !v.muted;
          if (p) p.setMute(v ? v.muted : true);
          break;
      }
    } catch (e) { log("cmd error", d.cmd, e); }
  });

  // ---------- 4) VOLUMEN GRADUAL (fade-in) ----------
  function fadeIn(v, ms) {
    if (v.__fading) return;
    v.__fading = true;
    v.muted = false;
    try { if (window.jwplayer) jwplayer().setMute(false); } catch (e) {}
    const pasos = 20, dt = (ms || 2500) / pasos;
    let i = 0;
    log("fade-in de volumen iniciando");
    const id = setInterval(() => {
      i++;
      // si el navegador pauso por desmutear sin gesto, abortamos y reintentamos muteado
      if (v.paused) {
        clearInterval(id); v.__fading = false;
        log("fade-in abortado: el navegador pauso (requiere gesto). Vuelvo a mute.");
        v.muted = true; try { if (window.jwplayer) jwplayer().setMute(true); } catch (e) {}
        v.play().catch(() => {});
        return;
      }
      v.volume = Math.min(1, i / pasos);
      try { if (window.jwplayer) jwplayer().setVolume(Math.round(v.volume * 100)); } catch (e) {}
      if (i >= pasos) { clearInterval(id); log("fade-in completo, volumen al 100%"); }
    }, dt);
  }

  // ---------- 5) AUTOPLAY + ENGANCHES ----------
  function engancharVideo(v) {
    if (!v || v.__canalEnganchado) return;
    v.__canalEnganchado = true;
    log("video encontrado. Arranco muteado.");
    v.muted = true; v.setAttribute("muted", "");
    const intentarPlay = () => v.play().then(() => log("play() OK")).catch((e) => log("play() rechazado:", e.name));
    intentarPlay();
    v.addEventListener("canplay", intentarPlay, { once: true });
    v.addEventListener("loadeddata", intentarPlay, { once: true });
    v.addEventListener("play", () => { log("evento play"); avisarPadre("play"); });
    v.addEventListener("ended", () => { log("evento ended -> aviso al padre"); avisarPadre("ended"); });
    v.addEventListener("timeupdate", () => {
      avisarPadre("estado", { playing: !v.paused, t: v.currentTime, dur: v.duration || 0, volume: v.volume, muted: v.muted });
      if (v.duration && v.currentTime >= v.duration - 0.8) avisarPadre("casi-fin");
    });
    v.addEventListener("pause", () => avisarPadre("estado", { playing: false, t: v.currentTime, dur: v.duration || 0, volume: v.volume, muted: v.muted }));

    // Intento de fade-in automatico ~1s despues (si Chrome lo permite).
    setTimeout(() => { if (!v.paused) fadeIn(v, 2500); }, 1000);

    // Garantia: al primer gesto del usuario, fade-in con sonido.
    const alGesto = () => { log("gesto del usuario -> fade-in"); fadeIn(v, 1500); };
    document.addEventListener("click", alGesto, { once: true });
    document.addEventListener("keydown", alGesto, { once: true });
  }

  function engancharJW() {
    try {
      if (window.jwplayer && jwplayer().on && !window.__jwEnganchado) {
        window.__jwEnganchado = true;
        log("jwplayer detectado, enganchando eventos");
        jwplayer().on("complete", () => { log("jw complete -> aviso al padre"); avisarPadre("ended"); });
        jwplayer().on("ready", () => {
          log("jw ready -> setMute(true)+play()");
          try { jwplayer().setMute(true); } catch (e) {}
          try { jwplayer().play(); } catch (e) {}
        });
        return true;
      }
    } catch (e) {}
    return false;
  }

  new MutationObserver(() => {
    const v = document.querySelector("video");
    if (v) engancharVideo(v);
    engancharJW();
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("load", () => {
    log("window load");
    const v = document.querySelector("video");
    if (v) engancharVideo(v);
    engancharJW();
    avisarPadre("listo");
  });
})();
