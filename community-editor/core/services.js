/* ============================================================
   dika studio core — cc.* services (the stable module API).
   A thin, LAZY facade over the existing app globals: every call
   resolves the underlying global at call-time, so (a) script load
   order never matters and (b) nothing existing is renamed or
   removed — the old globals (canvas, snap, pages, CUSTOM_PROPS…)
   stay exactly as they are, with the old names still working.
   RULE: modules depend ONLY on cc.*, never on raw globals.
   ============================================================ */
(function (global) {
  'use strict';
  var cc = global.cc || {};

  // ── canvas / drawing ──
  cc.canvas = function () {
    if (typeof getActiveCanvas === 'function') return getActiveCanvas();
    return (typeof canvas !== 'undefined') ? canvas : null;
  };
  cc.rawCanvas = function () { return (typeof canvas !== 'undefined') ? canvas : null; };
  cc.canvases = function () {            // all live canvases (main + back/split) for event hooks
    var out = [];
    if (typeof canvas !== 'undefined' && canvas) out.push(canvas);
    if (typeof backCanvas !== 'undefined' && backCanvas) out.push(backCanvas);
    return out;
  };
  cc.snap = function () { if (typeof snap === 'function') return snap.apply(null, arguments); };
  cc.addToCenter = function (obj) {
    if (typeof global.addToCenter === 'function') return global.addToCenter(obj);
    if (typeof addToCenter === 'function') return addToCenter(obj);
  };
  cc.scale = function () { return (typeof getCanvasScale === 'function') ? getCanvasScale() : 1; };
  cc.center = function () { return (typeof getCanvasCenter === 'function') ? getCanvasCenter() : { x: 0, y: 0 }; };

  // ── pages (read-only accessors; a module must NOT mutate these directly) ──
  cc.pages = function () { return (typeof pages !== 'undefined') ? pages : []; };
  cc.pageIndex = function () { return (typeof currentPageIndex !== 'undefined') ? (currentPageIndex | 0) : 0; };

  // ── serialization whitelist (CUSTOM_PROPS is sacred — register new props here) ──
  cc.customProps = function () { return (typeof CUSTOM_PROPS !== 'undefined') ? CUSTOM_PROPS : []; };
  cc.registerProps = function (props) {
    if (typeof CUSTOM_PROPS === 'undefined' || !props || !props.length) return;
    for (var i = 0; i < props.length; i++) {
      if (CUSTOM_PROPS.indexOf(props[i]) === -1) CUSTOM_PROPS.push(props[i]);
    }
  };

  // ── ui feedback ──
  cc.toast = function (msg, type) { if (typeof showToast === 'function') return showToast(msg, type); };
  cc.confirm = function (msg, onOk, onCancel) {
    if (typeof showCustomConfirm === 'function') return showCustomConfirm(msg, onOk, onCancel);
    if (global.confirm(msg)) { if (onOk) onOk(); } else if (onCancel) onCancel();
  };

  // ── fonts ──
  cc.loadFont = function (family) {
    if (typeof loadGoogleFont === 'function') return loadGoogleFont(family);
    return global.Promise ? global.Promise.resolve() : null;
  };

  cc.version = '0.1.0-skeleton';
  global.cc = cc;
})(window);
