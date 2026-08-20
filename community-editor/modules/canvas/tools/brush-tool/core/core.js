/* Module: canvas/tools/brush-tool/core — Canvas helper + activate/deactivate + init.
   Part of the brush-tool group (decomposed from the 1532-line IIFE). Functions hang off the
   shared namespace BT (window.__ccBrushTool, created by the parent); cross-module refs resolve
   through BT at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var BT = window.__ccBrushTool;
  if (!BT) return;

  BT._getCvs = function () {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
           (typeof canvas !== 'undefined' ? canvas : null);
  };

  BT.activateBrushTool = function () {
    if (BT._active) { BT.deactivateBrushTool(); return; }
    if (typeof deactivateFillBucketTool === 'function' && typeof window._fillBucketToolActive === 'function' && window._fillBucketToolActive()) deactivateFillBucketTool();
    if (typeof deactivateSelectionTool === 'function') deactivateSelectionTool();
    if (typeof deactivatePenTool === 'function') deactivatePenTool();
    if (typeof exitCropMode === 'function') exitCropMode(false);
    if (typeof exitPerspectiveMode === 'function') exitPerspectiveMode(false);
    if (typeof exitPolygonEdit === 'function') exitPolygonEdit(false);
    BT._active = true;
    BT._phase = BT.PHASE_PAINT;
    BT._paintUndoStack.length = 0;   // fresh paint-undo history per session
    BT._paintRedoStack.length = 0;

    var cvs = BT._getCvs();
    if (!cvs) return;

    BT._lockedObjs = [];
    cvs.discardActiveObject();
    cvs.getObjects().forEach(function (o) {
      if (o._isPaintOverlay || o._isPaintCursor || o._isPaintSelPreview) return;
      BT._lockedObjs.push({ obj: o, selectable: o.selectable, evented: o.evented });
      o.set({ selectable: false, evented: false });
    });

    cvs.defaultCursor = 'none';
    cvs.hoverCursor   = 'none';
    cvs.selection = false;
    cvs.renderAll();

    BT._ensurePaintLayer(cvs);

    cvs.on('mouse:down', BT._onDown);
    cvs.on('mouse:move', BT._onMove);
    cvs.on('mouse:up',   BT._onUp);
    cvs.on('object:removed', BT._onObjectRemoved);

    document.querySelectorAll('.tools-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.getElementById('tool-paint-brush');
    if (btn) btn.classList.add('active');

    var floatTB = document.getElementById('float-tb');
    if (floatTB) floatTB.classList.remove('show');

    BT._showFloatingBar();
    if (typeof showToast === 'function')
      showToast('Paint Brush: Click and drag to paint');
  };

  BT.deactivateBrushTool = function () {
    if (!BT._active) return;
    BT._active   = false;
    BT._painting = false;
    BT._phase    = BT.PHASE_PAINT;

    var cvs = BT._getCvs();
    if (cvs) {
      cvs.off('mouse:down', BT._onDown);
      cvs.off('mouse:move', BT._onMove);
      cvs.off('mouse:up',   BT._onUp);
      cvs.off('object:removed', BT._onObjectRemoved);
    }

    BT._lockedObjs.forEach(function (e) {
      if (e.obj.canvas) e.obj.set({ selectable: e.selectable, evented: e.evented });
    });
    BT._lockedObjs = [];

    if (cvs) {
      cvs.defaultCursor = 'default';
      cvs.hoverCursor   = 'move';
      cvs.selection = true;
      BT._removeCursor(cvs);
      cvs.renderAll();
    }

    /* Remove overlay */
    if (cvs && BT._fabricOverlay) {
      cvs.remove(BT._fabricOverlay);
      BT._fabricOverlay = null;
    }

    /* Clear off-screen paint canvases so old paint doesn't return */
    if (BT._paintCanvas && BT._paintCtx) {
      BT._paintCtx.clearRect(0, 0, BT._paintCanvas.width, BT._paintCanvas.height);
    }
    if (BT._strokeCanvas && BT._strokeCtx) {
      BT._strokeCtx.clearRect(0, 0, BT._strokeCanvas.width, BT._strokeCanvas.height);
    }
    BT._paintUndoStack.length = 0;
    BT._paintRedoStack.length = 0;

    BT._clearSelectionPreview();
    window._paintSelection = null;
    document.querySelectorAll('.tools-btn').forEach(function (b) { b.classList.remove('active'); });
    BT._hideFloatingBar();
  };

  BT._brushToolActive = function () { return BT._active; };

  BT._init = function () {
    setTimeout(function () { BT._renderMyShapesPanel(); }, 500);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'core', parent: 'canvas.tools.brush-tool', title: 'brush-tool: core', mount: function () {}, unmount: function () {} });
  }
})();
