/* Decompose modules/canvas/tools/brush-tool/brush-tool.js (1531-line IIFE — the paint brush +
   paint→selection/shape convert + My Shapes asset tool). Namespace BT. 51 fns + 10 inline window.*
   fns + 9 aliased ref-exports + 2 const exports + a window.BrushTool object. canvas-ready self-init. */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/canvas/tools/brush-tool';
const NS = 'BT';
const DESC = {
  core: 'Canvas helper + activate/deactivate + init.',
  bar: 'Floating brush toolbar.',
  paint: 'Paint layer + stroke engine (down/move/up, composite, bake, undo, cursor).',
  convert: 'Paint → selection / shape conversion (contour trace, simplify, preview).',
  myshapes: 'My Shapes asset DB + save/delete/rename/insert + the My Shapes panel.'
};
// export name → internal name (identity for the 10 inline window fns; aliased for the 8 ref-exports)
const FWD_MAP = {
  activateBrushTool: 'activateBrushTool', deactivateBrushTool: 'deactivateBrushTool', _brushToolActive: '_brushToolActive',
  _brushPaintUndo: '_brushPaintUndo', _brushPaintRedo: '_brushPaintRedo', convertObjectToShapeAsset: 'convertObjectToShapeAsset',
  saveToMyShapes: 'saveToMyShapes', deleteMyShape: 'deleteMyShape', renameMyShape: 'renameMyShape', insertMyShape: 'insertMyShape',
  clearPaintLayer: '_doClear', savePaintAsImage: '_doSavePaintAsImage', convertPaintToSelection: '_doConvertToSelection',
  convertSelectionToShape: '_doConvertToShape', _openMyShapesDB: '_openShapesDB', markObjectAsMyShapeAsset: '_markObjectAsMyShapeAsset',
  isSavableMyShapeObject: '_isSavableMyShape', canConvertObjectToShapeAsset: '_canConvertToShapeAsset'
};
run({
  src: DIR + '/brush-tool.js',
  parentFile: DIR + '/brush-tool.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccBrushTool',
  parentId: 'brush-tool',
  idPrefix: 'brush',
  parentDotted: 'canvas.tools.brush-tool',
  childComment: g => 'canvas/tools/brush-tool/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    core: ['_getCvs', '_init', 'activateBrushTool', 'deactivateBrushTool', '_brushToolActive'],
    bar: ['_showFloatingBar', '_hideFloatingBar', '_updateBarState', '_mkDiv', '_mkSlider'],
    paint: ['_hasPaint', '_ensurePaintLayer', '_syncOverlay', '_updateOverlay', '_ensureOverlay', '_snapshotPaint', '_pushPaintUndo',
      '_restorePaint', '_createBrushTip', '_parseColor', '_stampAt', '_strokeBetween', '_smooth', '_showCursor', '_removeCursor',
      '_getCanvasPt', '_onDown', '_onMove', '_onUp', '_compositeStroke', '_bakeStroke', '_brushPaintUndo', '_brushPaintRedo'],
    convert: ['_doClear', '_doSavePaintAsImage', '_doConvertToSelection', '_morphClose', '_traceContour', '_smoothContour',
      '_drawSelectionPreview', '_clearSelectionPreview', '_returnToPaintPhase', '_onObjectRemoved', '_doConvertToShape',
      '_douglasPeucker', '_pointToLineDist'],
    myshapes: ['_openShapesDB', '_isTextLikeMyShape', '_isBaseShapeType', '_isSavableMyShape', '_canConvertToShapeAsset',
      '_getMyShapeDefaultName', '_markObjectAsMyShapeAsset', '_showShapeNameModal', '_renderMyShapesPanel', '_buildMyShapesGrid',
      'convertObjectToShapeAsset', 'saveToMyShapes', 'deleteMyShape', 'renameMyShape', 'insertMyShape']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   brush-tool — GROUP PARENT (decomposed)\n' +
      '   The paint-brush / convert / My-Shapes tool IIFE split per concern. Shared state + consts on\n' +
      '   ' + NS + ' = window.__ccBrushTool; functions go to children. The public window.* API (19 fns +\n' +
      '   2 store consts + the BrushTool object) is rebuilt here as forwarders/getters. Self-inits on\n' +
      '   cc:canvas-ready (poll until children load, then _init).\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccBrushTool || (window.__ccBrushTool = {});\n\n' +
      (stateLines.trim() ? '  // ── shared state + consts ──\n' + stateLines + '\n\n' : '') +
      '  // ── public API: forwarders → ' + NS + ' + the 2 store consts + the BrushTool object ──\n' +
      '  function fwd(name) { return function () { return ' + NS + '[name] ? ' + NS + '[name].apply(null, arguments) : undefined; }; }\n' +
      '  var map = ' + JSON.stringify(FWD_MAP) + ';\n' +
      '  Object.keys(map).forEach(function (k) { window[k] = fwd(map[k]); });\n' +
      '  window._MY_SHAPES_STORE = ' + NS + '.MY_SHAPES_STORE;\n' +
      '  window._MY_SHAPES_FOLDER_STORE = ' + NS + '.MY_SHAPES_FOLDER_STORE;\n' +
      '  window.BrushTool = {\n' +
      '    activate: window.activateBrushTool,\n' +
      '    deactivate: window.deactivateBrushTool,\n' +
      '    isActive: function () { return ' + NS + '._active; },\n' +
      '    clearPaint: window.clearPaintLayer,\n' +
      '    convertToSelection: window.convertPaintToSelection,\n' +
      '    convertToShape: window.convertSelectionToShape,\n' +
      '    saveToMyShapes: window.saveToMyShapes,\n' +
      '    refreshShapesPanel: fwd(\'_renderMyShapesPanel\')\n' +
      '  };\n\n' +
      '  // ── self-init on cc:canvas-ready, deferred until children load ──\n' +
      '  if (window.cc && cc.on) {\n' +
      "    cc.on('cc:canvas-ready', function () {\n" +
      '      var tries = 0;\n' +
      '      var iv = setInterval(function () {\n' +
      "        if (typeof " + NS + "._init === 'function' && typeof " + NS + "._showFloatingBar === 'function' &&\n" +
      "            typeof " + NS + "._onDown === 'function' && typeof " + NS + "._doConvertToSelection === 'function' &&\n" +
      "            typeof " + NS + "._renderMyShapesPanel === 'function') {\n" +
      '          clearInterval(iv);\n' +
      "          cc.safe('canvas.tools.brush-tool', " + NS + '._init);\n' +
      '        } else if (++tries > 250) { clearInterval(iv); }\n' +
      '      }, 16);\n' +
      '    });\n' +
      '  }\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'brush-tool', parent: 'canvas.tools', title: 'Brush tool', mount: function () {}, unmount: function () {} });\n";
  }
});
