/* ============================================================
   brush-tool — GROUP PARENT (decomposed)
   The paint-brush / convert / My-Shapes tool IIFE split per concern. Shared state + consts on
   BT = window.__ccBrushTool; functions go to children. The public window.* API (19 fns +
   2 store consts + the BrushTool object) is rebuilt here as forwarders/getters. Self-inits on
   cc:canvas-ready (poll until children load, then _init).
   ============================================================ */
(function () {
  'use strict';

  var BT = window.__ccBrushTool || (window.__ccBrushTool = {});

  // ── shared state + consts ──
  BT._active = false;
  BT._painting = false;       // mouse held down;
  BT._paintCanvas = null;     // off-screen canvas for paint layer;
  BT._paintCtx = null;
  BT._fabricOverlay = null;   // fabric.Image shown on canvas;
  BT._lastPt = null;
  BT._strokeCanvas = null;    // per-stroke canvas (for flow/opacity);
  BT._strokeCtx = null;
  BT._lockedObjs = [];
  BT._cursorCircle = null;
  BT._floatBar = null;     // floating brush menu DOM;
  BT._selPreviewObj = null;   // selection preview dashed path;
  BT._ptHistory = [];
  BT._paintUndoStack = [];
  BT._paintRedoStack = [];
  BT.PAINT_UNDO_CAP = 25;
  BT._internalPreviewRemoval = false;  // true while WE remove the selection preview;
  BT.PHASE_PAINT = 'paint';
  BT.PHASE_SELECTION = 'selection';
  BT._phase = BT.PHASE_PAINT;
  BT._cfg = {
    brushType: 'normal',  // 'normal' | 'oil' | 'watercolor'
    size: 20,
    hardness: 80,
    opacity: 100,
    flow: 60,
    spacing: 25,
    smoothing: 40,
    color: '#ffffff'
  };
  BT._selPreviewObj = null;
  BT.MY_SHAPES_DB = 'DikaMyShapes';
  BT.MY_SHAPES_STORE = 'shapes';
  BT.MY_SHAPES_FOLDER_STORE = 'shapeFolders';   // enterprise folder browser (my-shapes-browser.js);

  // ── public API: forwarders → BT + the 2 store consts + the BrushTool object ──
  function fwd(name) { return function () { return BT[name] ? BT[name].apply(null, arguments) : undefined; }; }
  var map = {"activateBrushTool":"activateBrushTool","deactivateBrushTool":"deactivateBrushTool","_brushToolActive":"_brushToolActive","_brushPaintUndo":"_brushPaintUndo","_brushPaintRedo":"_brushPaintRedo","convertObjectToShapeAsset":"convertObjectToShapeAsset","saveToMyShapes":"saveToMyShapes","deleteMyShape":"deleteMyShape","renameMyShape":"renameMyShape","insertMyShape":"insertMyShape","clearPaintLayer":"_doClear","savePaintAsImage":"_doSavePaintAsImage","convertPaintToSelection":"_doConvertToSelection","convertSelectionToShape":"_doConvertToShape","_openMyShapesDB":"_openShapesDB","markObjectAsMyShapeAsset":"_markObjectAsMyShapeAsset","isSavableMyShapeObject":"_isSavableMyShape","canConvertObjectToShapeAsset":"_canConvertToShapeAsset"};
  Object.keys(map).forEach(function (k) { window[k] = fwd(map[k]); });
  window._MY_SHAPES_STORE = BT.MY_SHAPES_STORE;
  window._MY_SHAPES_FOLDER_STORE = BT.MY_SHAPES_FOLDER_STORE;
  window.BrushTool = {
    activate: window.activateBrushTool,
    deactivate: window.deactivateBrushTool,
    isActive: function () { return BT._active; },
    clearPaint: window.clearPaintLayer,
    convertToSelection: window.convertPaintToSelection,
    convertToShape: window.convertSelectionToShape,
    saveToMyShapes: window.saveToMyShapes,
    refreshShapesPanel: fwd('_renderMyShapesPanel')
  };

  // ── self-init on cc:canvas-ready, deferred until children load ──
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      var tries = 0;
      var iv = setInterval(function () {
        if (typeof BT._init === 'function' && typeof BT._showFloatingBar === 'function' &&
            typeof BT._onDown === 'function' && typeof BT._doConvertToSelection === 'function' &&
            typeof BT._renderMyShapesPanel === 'function') {
          clearInterval(iv);
          cc.safe('canvas.tools.brush-tool', BT._init);
        } else if (++tries > 250) { clearInterval(iv); }
      }, 16);
    });
  }
})();

if (window.cc && cc.modules) cc.modules.register({ id: 'brush-tool', parent: 'canvas.tools', title: 'Brush tool', mount: function () {}, unmount: function () {} });
