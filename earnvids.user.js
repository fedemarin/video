// ==UserScript==
// @name         Canal TV - EARNVIDS (anti-ads + autoplay + auto-siguiente)
// @namespace    https://github.com/fedemarin/video
// @version      1.0.0
// @description  Igual que el de STREAMWISH pero para EarnVids (filelions). Bloquea popups, arranca el video, volumen gradual y avisa al padre cuando termina.
// @author       vos
// @match        https://filelions.top/v/*
// @match        https://filelions.top/e/*
// @match        https://filelions.top/embed/*
// @match        https://*.filelions.top/v/*
// @match        https://*.filelions.top/e/*
// @match        https://filelions.to/*
// @match        https://filelions.live/*
// @match        https://filelions.online/*
// @run-at       document-start
// @grant        none
// @updateURL    https://fedemarin.github.io/video/earnvids.user.js
// @downloadURL  https://fedemarin.github.io/video/earnvids.user.js
// ==/UserScript==

/* global jwplayer */
(function () {
  "use strict";
  const CANAL = "earnvids";

  const T0 = performance.now();
  const log = (...a) => console.log("[CanalTV-EV +" + (performance.now() - T0).toFixed(0) + "ms]", ...a);
  log("userscript EARNVIDS v1.0.0 iniciado");

  // ---------- 1) BLOQUEO DE POPUPS ----------
  try {
    Object.defineProperty(window, "open", {
      configurable: false,
      get() { return function () { log("BLOQUEADO window.open"); return null; }; },
      set() {},
    });
  } catch (e) { try { window.open = function () { return null; }; } catch (e2) {} }

  try {
    const _click = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () {
      if (this.tagName === "A" && this.target === "_blank" &&
          !(this.closest && this.closest(".jwplayer, .jw-wrapper"))) {
        log("BLOQUEADO a.click() popunder"); return;
      }
      return _click.apply(this, arguments);
    };
  } catch (e) {}

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
      if (a) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
    }, true);
  });

  function limpiarAnclas(root) {
    (root.querySelectorAll ? root.querySelectorAll('a[target="_blank"]') : []).forEach((a) => {
      if (!a.closest(".jwplayer, .jw-wrapper")) a.removeAttribute("target");
    });
  }
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes && m.addedNodes.forEach((n) => { if (n.nodeType === 1) limpiarAnclas(n); }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("beforeunload", function () {});

  // ---------- 2) DEJAR SOLO EL VIDEO ----------
  const css = `
    .advertisement, .video-ads, #overlay-ads, .vast, .vpaid,
    iframe[src*="ads"], iframe[src*="adserver"],
    a[href*="//"][target="_blank"]:empty { display: none !important; }
    .jw-controls, .jw-controlbar, .jw-display, .jw-display-icon-container,
    .jw-title, .jw-logo, .jw-overlays, .jw-nextup-container,
    .jw-rightclick, .jw-preview, .jw-captions, .jw-float-icon {
      display: none !important; opacity: 0 !important; pointer-events: none !important;
    }
    video, .jwplayer, .jw-wrapper, .jw-media { background: #000 !important; }
    video { width: 100% !important; height: 100% !important; object-fit: contain !important; }
    html, body { background:#000 !important; margin:0 !important; overflow:hidden !important; }
  `;
  const s = document.createElement("style");
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);

  // ---------- 3) AVISAR AL PADRE ----------
  function avisarPadre(tipo, extra) {
    try { parent.postMessage(Object.assign({ canal: CANAL, tipo }, extra || {}), "*"); } catch (e) {}
  }

  // ---------- 3b) RECIBIR COMANDOS ----------
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

  // ---------- 4) VOLUMEN GRADUAL ----------
  function fadeIn(v, ms) {
    if (v.__fading) return;
    v.__fading = true; v.muted = false;
    try { if (window.jwplayer) jwplayer().setMute(false); } catch (e) {}
    const pasos = 20, dt = (ms || 2500) / pasos; let i = 0;
    const id = setInterval(() => {
      i++;
      if (v.paused) { clearInterval(id); v.__fading = false; v.muted = true; try { if (window.jwplayer) jwplayer().setMute(true); } catch (e) {} v.play().catch(() => {}); return; }
      v.volume = Math.min(1, i / pasos);
      try { if (window.jwplayer) jwplayer().setVolume(Math.round(v.volume * 100)); } catch (e) {}
      if (i >= pasos) clearInterval(id);
    }, dt);
  }

  // ---------- 5) AUTOPLAY + ENGANCHES ----------
  function engancharVideo(v) {
    if (!v || v.__canalEnganchado) return;
    v.__canalEnganchado = true;
    v.muted = true; v.setAttribute("muted", "");
    const intentarPlay = () => v.play().catch(() => {});
    intentarPlay();
    v.addEventListener("canplay", intentarPlay, { once: true });
    v.addEventListener("loadeddata", intentarPlay, { once: true });
    v.addEventListener("play", () => avisarPadre("play"));
    v.addEventListener("ended", () => avisarPadre("ended"));
    v.addEventListener("timeupdate", () => {
      avisarPadre("estado", { playing: !v.paused, t: v.currentTime, dur: v.duration || 0, volume: v.volume, muted: v.muted });
      if (v.duration && v.currentTime >= v.duration - 0.8) avisarPadre("casi-fin");
    });
    v.addEventListener("pause", () => avisarPadre("estado", { playing: false, t: v.currentTime, dur: v.duration || 0, volume: v.volume, muted: v.muted }));
    setTimeout(() => { if (!v.paused) fadeIn(v, 2500); }, 1000);
    const alGesto = () => fadeIn(v, 1500);
    document.addEventListener("click", alGesto, { once: true });
    document.addEventListener("keydown", alGesto, { once: true });
  }
  function engancharJW() {
    try {
      if (window.jwplayer && jwplayer().on && !window.__jwEnganchado) {
        window.__jwEnganchado = true;
        jwplayer().on("complete", () => avisarPadre("ended"));
        jwplayer().on("ready", () => { try { jwplayer().setMute(true); } catch (e) {} try { jwplayer().play(); } catch (e) {} });
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
    const v = document.querySelector("video");
    if (v) engancharVideo(v);
    engancharJW();
    avisarPadre("listo");
  });
})();
