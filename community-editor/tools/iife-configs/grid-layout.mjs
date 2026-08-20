/* Decompose modules/canvas/grid-layout/grid-layout.js (1337-line IIFE, the collage/grid-layout
   feature). Namespace GL. 44 fns + a big load-time `fabric.GridLayout = fabric.util.createClass(…)`
   custom class (rawBlock → core child). Self-inits on cc:canvas-ready → parent polls then inits. */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/canvas/grid-layout';
const NS = 'GL';
const DESC = {
  core: 'fabric.GridLayout custom class + create/find/remove/apply + cell geometry helpers.',
  cells: 'Cell image placement + the "+" add overlays.',
  select: 'Cell-pick / select mode + gallery click interception.',
  menu: 'Cell context menu + hover highlight.',
  video: 'Per-cell video element placement + sync.',
  toolbar: 'Grid toolbar + layers highlight.',
  panel: 'Preset cards + panel sync + live update + init.'
};
// all 26 public window.* exports (public create/apply + internal _gl* helpers + 4 state accessors)
const FWD = ['createGridLayout', 'findGridLayout', 'removeGridLayout', 'applyGridToCanvas',
  '_glRenderPlusOverlays', '_glRemoveAllPlusOverlays', '_glExitSelectMode', '_glIsSelectMode',
  '_glSyncVideoPositions', '_glRemoveAllVideos', '_glShowGridToolbar', '_glHideGridToolbar',
  '_glSyncPanelFromGrid', '_glUpdateToolbar', '_glEnterSelectMode', '_glPlaceImageInCell',
  '_glRemoveCellImage', '_glRemoveCellVideo', '_glPlaceVideoFileInCell', '_glGetCellAt',
  '_glShowCellHighlight', '_glRestoreGridCellImages',
  '_glGetSelectingGrid', '_glGetSelectingCell', '_glGetActiveCell', '_glGetActiveGrid'];
run({
  src: DIR + '/grid-layout.js',
  parentFile: DIR + '/grid-layout.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccGridLayout',
  parentId: 'grid-layout',
  idPrefix: 'gl',
  parentDotted: 'canvas.grid-layout',
  childComment: g => 'canvas/grid-layout/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  rawBlocks: [{ start: 43, end: 216, group: 'core' }],   // fabric.GridLayout = fabric.util.createClass(...)
  groups: {
    core: ['_glRoundRect', '_glCanvasDim', '_glGetCanvas', '_glRestoreGridCellImages', 'createGridLayout', 'findGridLayout', 'removeGridLayout', 'applyGridToCanvas', '_glGetCellAt',
      '_glGetSelectingGrid', '_glGetSelectingCell', '_glGetActiveCell', '_glGetActiveGrid'],
    cells: ['_glPlaceImageInCell', '_glRemoveCellImage', '_glCellHasImage', '_glRenderPlusOverlays', '_glCreatePlusIcon', '_glRemoveAllPlusOverlays', '_glRemovePlusForCell'],
    select: ['_glEnterSelectMode', '_glExitSelectMode', '_glIsSelectMode', '_glShowSelectionBanner', '_glHideSelectionBanner', '_glGalleryClickInterceptor', '_glCanvasClickHandler'],
    menu: ['_glShowCellContextMenu', '_glCanvasContextHandler', '_glShowCellHighlight', '_glRemoveCellHighlight', '_glSyncHighlightPosition'],
    video: ['_glEnsureVideoContainer', '_glRemoveCellVideo', '_glRemoveAllVideos', '_glCssPosition', '_glSyncVideoPositions', '_glPlaceVideoFileInCell', '_glPlaceVideoUrlInCell'],
    toolbar: ['_glShowGridToolbar', '_glHideGridToolbar', '_glHighlightCellInLayers', '_glUpdateToolbar'],
    panel: ['_glBuildPresetSVG', '_glRenderPresetCards', '_glSyncPanelFromGrid', '_glLiveUpdateGrid', 'initGridLayout']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   grid-layout — GROUP PARENT (decomposed)\n' +
      '   The collage/grid-layout IIFE split per concern. The fabric.GridLayout custom class +\n' +
      '   create/apply helpers live in the core child; shared state on ' + NS + ' = window.__ccGridLayout.\n' +
      '   Self-inits on cc:canvas-ready (emitted before children load) → poll until the child fns are\n' +
      '   present, then initGridLayout once. Public createGridLayout/… stay via thin forwarders.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccGridLayout || (window.__ccGridLayout = {});\n\n' +
      (stateLines.trim() ? '  // ── shared state ──\n' + stateLines + '\n\n' : '') +
      '  // ── public API: thin forwarders → ' + NS + ' ──\n' +
      '  function fwd(name) { return function () { return ' + NS + '[name] ? ' + NS + '[name].apply(null, arguments) : undefined; }; }\n' +
      FWD.map(n => "  window." + n + " = fwd('" + n + "');").join('\n') + '\n\n' +
      '  // ── self-init on cc:canvas-ready, deferred until every child has loaded ──\n' +
      '  if (window.cc && cc.on) {\n' +
      "    cc.on('cc:canvas-ready', function () {\n" +
      '      var tries = 0;\n' +
      '      var iv = setInterval(function () {\n' +
      "        if (typeof " + NS + ".initGridLayout === 'function' && typeof " + NS + ".createGridLayout === 'function' &&\n" +
      "            typeof " + NS + "._glPlaceImageInCell === 'function' && typeof " + NS + "._glEnterSelectMode === 'function' &&\n" +
      "            typeof " + NS + "._glShowCellContextMenu === 'function' && typeof " + NS + "._glPlaceVideoFileInCell === 'function' &&\n" +
      "            typeof " + NS + "._glShowGridToolbar === 'function') {\n" +
      '          clearInterval(iv);\n' +
      "          setTimeout(function () { cc.safe('canvas.grid-layout', " + NS + '.initGridLayout); }, 200);\n' +
      '        } else if (++tries > 250) { clearInterval(iv); }\n' +
      '      }, 16);\n' +
      '    });\n' +
      '  }\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'grid-layout', parent: 'canvas', title: 'Grid layout', mount: function () {}, unmount: function () {} });\n";
  }
});
