/* core/bg-image-position.js — shared background-image positioning helper.
   Moved VERBATIM from js/app.js (Faz 3, cautious core slimming). Self-contained: takes the
   target fabric canvas as a parameter (no global canvas/state/fabric) and fits its
   backgroundImage per a position keyword (cover / contain / stretch / 9-grid anchors).
   Used as a global by app.js, structure.js and wireframe.js. Kept as a flat top-level
   function + the window._bgImagePosition state var so all callers work unchanged; loaded as
   an always-loaded <script> in index.html (not a loader module) → no load-order risk. */

window._bgImagePosition = 'cover';

function _applyBgImagePosition(cvs, position) {
  var bgImg = cvs.backgroundImage;
  if (!bgImg) return;
  window._bgImagePosition = position;
  var cw = cvs.getWidth();
  var ch = cvs.getHeight();
  var iw = bgImg.width;
  var ih = bgImg.height;

  if (position === 'cover') {
    var s = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s, scaleY: s, left: (cw - iw * s) / 2, top: (ch - ih * s) / 2, originX: 'left', originY: 'top' });
  } else if (position === 'contain') {
    var s2 = Math.min(cw / iw, ch / ih);
    bgImg.set({ scaleX: s2, scaleY: s2, left: (cw - iw * s2) / 2, top: (ch - ih * s2) / 2, originX: 'left', originY: 'top' });
  } else if (position === 'stretch') {
    bgImg.set({ scaleX: cw / iw, scaleY: ch / ih, left: 0, top: 0, originX: 'left', originY: 'top' });
  } else if (position === 'top-left') {
    var s3 = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s3, scaleY: s3, left: 0, top: 0, originX: 'left', originY: 'top' });
  } else if (position === 'top-center') {
    var s4 = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s4, scaleY: s4, left: (cw - iw * s4) / 2, top: 0, originX: 'left', originY: 'top' });
  } else if (position === 'top-right') {
    var s5 = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s5, scaleY: s5, left: cw - iw * s5, top: 0, originX: 'left', originY: 'top' });
  } else if (position === 'center') {
    var s6 = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s6, scaleY: s6, left: (cw - iw * s6) / 2, top: (ch - ih * s6) / 2, originX: 'left', originY: 'top' });
  } else if (position === 'bottom-left') {
    var s7 = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s7, scaleY: s7, left: 0, top: ch - ih * s7, originX: 'left', originY: 'top' });
  } else if (position === 'bottom-center') {
    var s8 = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s8, scaleY: s8, left: (cw - iw * s8) / 2, top: ch - ih * s8, originX: 'left', originY: 'top' });
  } else if (position === 'bottom-right') {
    var s9 = Math.max(cw / iw, ch / ih);
    bgImg.set({ scaleX: s9, scaleY: s9, left: cw - iw * s9, top: ch - ih * s9, originX: 'left', originY: 'top' });
  }
  cvs.renderAll();
}

// Faz 6 — shared loader module (moved from core/). Pure function library, no init;
// runtime callers resolve it once loaded. Register for the module registry + error boundary.
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'bg-image-position', parent: 'shared', title: 'BG image fit', mount: function () {}, unmount: function () {} });
}
