/* ============================================================
   grid-layout — GROUP PARENT (decomposed)
   The collage/grid-layout IIFE split per concern. The fabric.GridLayout custom class +
   create/apply helpers live in the core child; shared state on GL = window.__ccGridLayout.
   Self-inits on cc:canvas-ready (emitted before children load) → poll until the child fns are
   present, then initGridLayout once. Public createGridLayout/… stay via thin forwarders.
   ============================================================ */
(function () {
  'use strict';

  var GL = window.__ccGridLayout || (window.__ccGridLayout = {});

  // ── shared state ──
  GL._glToolbar = null;
  GL._glActiveCell = null;   // cell meta shown in toolbar;
  GL._glSelectingCell = null;   // cell awaiting gallery pick;
  GL._glSelectingGrid = null;   // parent grid for selection;
  GL._glBannerEl = null;
  GL._glHighlightRect = null;
  GL._glVideoElements = [];

  // ── public API: thin forwarders → GL ──
  function fwd(name) { return function () { return GL[name] ? GL[name].apply(null, arguments) : undefined; }; }
  window.createGridLayout = fwd('createGridLayout');
  window.findGridLayout = fwd('findGridLayout');
  window.removeGridLayout = fwd('removeGridLayout');
  window.applyGridToCanvas = fwd('applyGridToCanvas');
  window._glRenderPlusOverlays = fwd('_glRenderPlusOverlays');
  window._glRemoveAllPlusOverlays = fwd('_glRemoveAllPlusOverlays');
  window._glExitSelectMode = fwd('_glExitSelectMode');
  window._glIsSelectMode = fwd('_glIsSelectMode');
  window._glSyncVideoPositions = fwd('_glSyncVideoPositions');
  window._glRemoveAllVideos = fwd('_glRemoveAllVideos');
  window._glShowGridToolbar = fwd('_glShowGridToolbar');
  window._glHideGridToolbar = fwd('_glHideGridToolbar');
  window._glSyncPanelFromGrid = fwd('_glSyncPanelFromGrid');
  window._glUpdateToolbar = fwd('_glUpdateToolbar');
  window._glEnterSelectMode = fwd('_glEnterSelectMode');
  window._glPlaceImageInCell = fwd('_glPlaceImageInCell');
  window._glRemoveCellImage = fwd('_glRemoveCellImage');
  window._glRemoveCellVideo = fwd('_glRemoveCellVideo');
  window._glPlaceVideoFileInCell = fwd('_glPlaceVideoFileInCell');
  window._glGetCellAt = fwd('_glGetCellAt');
  window._glShowCellHighlight = fwd('_glShowCellHighlight');
  window._glRestoreGridCellImages = fwd('_glRestoreGridCellImages');
  window._glGetSelectingGrid = fwd('_glGetSelectingGrid');
  window._glGetSelectingCell = fwd('_glGetSelectingCell');
  window._glGetActiveCell = fwd('_glGetActiveCell');
  window._glGetActiveGrid = fwd('_glGetActiveGrid');

  // ── self-init on cc:canvas-ready, deferred until every child has loaded ──
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      var tries = 0;
      var iv = setInterval(function () {
        if (typeof GL.initGridLayout === 'function' && typeof GL.createGridLayout === 'function' &&
            typeof GL._glPlaceImageInCell === 'function' && typeof GL._glEnterSelectMode === 'function' &&
            typeof GL._glShowCellContextMenu === 'function' && typeof GL._glPlaceVideoFileInCell === 'function' &&
            typeof GL._glShowGridToolbar === 'function') {
          clearInterval(iv);
          setTimeout(function () { cc.safe('canvas.grid-layout', GL.initGridLayout); }, 200);
        } else if (++tries > 250) { clearInterval(iv); }
      }, 16);
    });
  }
})();

if (window.cc && cc.modules) cc.modules.register({ id: 'grid-layout', parent: 'canvas', title: 'Grid layout', mount: function () {}, unmount: function () {} });
