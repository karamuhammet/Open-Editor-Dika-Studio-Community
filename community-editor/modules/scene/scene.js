/* ============================================================
   scene — GROUP PARENT (frame-canvas / infinite-canvas subsystem)
   A THIRD page mode alongside video-editor and slide-deck: it takes over the single fabric.Canvas when
   a page's _productType === 'scene', rendering an infinite world of freely-placed frames (artboards).
   Faz 0 = FLAG-GATED SKELETON: everything is a no-op and nothing is dispatched while ccFlag('scene') is
   off, so classic/video/slide pages are byte-identical. Real behavior lands in Faz 1+.
   Namespace SC = window.__ccSceneEditor (the VideoEditor VE pattern); public facade = window.SceneEditor
   (same signature surface as window.VideoEditor). See docs/frame-canvas-migration-plan.md.
   ============================================================ */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor || (global.__ccSceneEditor = {});
  SC._active = false;
  SC.isActive    = function () { return SC._active; };
  SC.activate    = function () { /* Faz 1+ */ };
  SC.deactivate  = function () { /* Faz 1+ */ };
  SC.saveForPage = function (pageId) { /* Faz 1+ */ };
  SC.loadForPage = function (pageId) { /* Faz 1+ */ };

  // Public facade — mirrors window.VideoEditor's surface so the page dispatcher can treat the three
  // modes (classic/video/slide vs scene) uniformly once Faz 1 wires switchPage/saveCurrentPage.
  global.SceneEditor = {
    activate:    function () { return SC.activate(); },
    deactivate:  function () { return SC.deactivate(); },
    isActive:    function () { return SC.isActive(); },
    saveForPage: function (id) { return SC.saveForPage(id); },
    loadForPage: function (id) { return SC.loadForPage(id); }
  };

  // self-init on cc:canvas-ready (no-op in Faz 0; Faz 1+ registers CUSTOM_PROPS + dispatch hooks here)
  if (global.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      cc.safe && cc.safe('scene.init', function () { /* Faz 1+ */ });
    });
  }

  // register the scene GROUP (top-level, sibling of video/slide-deck); children auto-maintained by build-manifest
  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'scene', title: 'Scene (frames)', icon: 'layout-grid', mount: function () {}, unmount: function () {} });
  }
})(window);
