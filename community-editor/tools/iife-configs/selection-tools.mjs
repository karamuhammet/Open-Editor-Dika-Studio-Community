/* Decompose modules/canvas/tools/selection-tools/selection-tools.js (1541-line IIFE — lasso/
   quick-select/refine-edge/frame-convert tool). Namespace VST. 50 fns + 19 inline window.* API
   fns. 3 load-time init calls (_initEvents/_initCanvasSync/_watchSelection) + a keydown handler →
   deferred (poll on canvas-ready / rawBlock). */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/canvas/tools/selection-tools';
const NS = 'VST';
const DESC = {
  core: 'Init/canvas-sync + uid/offset helpers + the activate/deactivate API.',
  quickselect: 'Quick-select (flood/Sobel) — grow, overlay, contour trace, brush bar.',
  refine: 'Refine-edge — smooth/feather/contrast/shift + the floating panel.',
  contour: 'Contour math — simplify, normalize, area, frame-path/alpha trace.',
  frame: 'Frame creation + image↔frame merge/detach/lock + object↔frame convert.',
  preview: 'Selection watch + lasso/polygon live preview.'
};
const FWD = ['activateSelectionTool', 'deactivateSelectionTool', '_selToolActive', 'toggleToolsCat',
  '_reOnSlider', '_reReset', '_reClose', '_reOpen', '_qsApply', '_qsCancelBtn', '_qsSetBrush', '_qsInvert',
  'mergeImageIntoFrame', 'detachFrameFromImage', 'lockFrameToImage', 'removeActiveFrame',
  'isFrameConvertibleObject', 'convertObjectToFrame', 'convertFrameToShape'];
run({
  src: DIR + '/selection-tools.js',
  parentFile: DIR + '/selection-tools.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccSelectionTools',
  parentId: 'selection-tools',
  idPrefix: 'sel',
  parentDotted: 'canvas.tools.selection-tools',
  childComment: g => 'canvas/tools/selection-tools/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  rawBlocks: [{ start: 1507, end: 1536, group: 'quickselect' }],   // global keydown ([ ]) brush-size handler
  groups: {
    core: ['_initEvents', '_initCanvasSync', '_ensureUid', '_storeFrameOffset', '_syncFramePos', '_findByUid', '_getCvs', '_findImageAt',
      'activateSelectionTool', 'deactivateSelectionTool', '_selToolActive', 'toggleToolsCat'],
    quickselect: ['_qsBegin', '_qsSobel', '_qsPtr2Px', '_qsWBR', '_qsGrowAt', '_qsRefreshOverlay', '_qsFinalize', '_qsMorphClose',
      '_qsTraceContour', '_qsMoveCursor', '_qsShowBar', '_qsHideBar', '_qsUpdateSlider', '_qsInvertMask', '_qsCleanup',
      '_qsApply', '_qsCancelBtn', '_qsSetBrush', '_qsInvert'],
    refine: ['_reRefine', '_reGaussBlur', '_reShiftEdge', '_reChaikin', '_reShowPanel', '_reSliderHTML', '_rePreview', '_reHidePanel',
      '_reOnSlider', '_reReset', '_reClose', '_reOpen'],
    contour: ['_dpSimplify', '_dpDist', '_cloneContourPoints', '_normalizeContourPoints', '_contourArea', '_limitContourPoints',
      '_frameStyleFromObject', '_buildFramePathFromContours', '_traceAlphaContours', '_rasterContoursFromObject'],
    frame: ['_createFrameFromPoints', '_showFrameBar', '_hideFrameBar', '_replaceObjectWithFrame',
      'mergeImageIntoFrame', 'detachFrameFromImage', 'lockFrameToImage', 'removeActiveFrame', 'isFrameConvertibleObject',
      'convertObjectToFrame', 'convertFrameToShape'],
    preview: ['_watchSelection', '_onSelectionChange', '_clearPreview', '_drawLassoPreview', '_drawPolygonPreview']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   selection-tools — GROUP PARENT (decomposed)\n' +
      '   The lasso/quick-select/refine-edge/frame-convert tool IIFE split per concern. Shared state\n' +
      '   on ' + NS + ' = window.__ccSelectionTools; functions go to children. The 19 public window.* API\n' +
      '   fns become forwarders. The 3 load-time init calls (_initEvents/_initCanvasSync/_watchSelection)\n' +
      '   are deferred: on cc:canvas-ready, poll until children load, then run them once.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccSelectionTools || (window.__ccSelectionTools = {});\n\n' +
      (stateLines.trim() ? '  // ── shared state ──\n' + stateLines + '\n\n' : '') +
      '  // ── public API: thin forwarders → ' + NS + ' ──\n' +
      '  function fwd(name) { return function () { return ' + NS + '[name] ? ' + NS + '[name].apply(null, arguments) : undefined; }; }\n' +
      FWD.map(n => "  window." + n + " = fwd('" + n + "');").join('\n') + '\n\n' +
      '  // ── self-init on cc:canvas-ready, deferred until children load ──\n' +
      '  if (window.cc && cc.on) {\n' +
      "    cc.on('cc:canvas-ready', function () {\n" +
      '      var tries = 0;\n' +
      '      var iv = setInterval(function () {\n' +
      "        if (typeof " + NS + "._initEvents === 'function' && typeof " + NS + "._initCanvasSync === 'function' &&\n" +
      "            typeof " + NS + "._watchSelection === 'function' && typeof " + NS + "._qsBegin === 'function' &&\n" +
      "            typeof " + NS + "._reRefine === 'function' && typeof " + NS + "._traceAlphaContours === 'function' &&\n" +
      "            typeof " + NS + "._createFrameFromPoints === 'function') {\n" +
      '          clearInterval(iv);\n' +
      "          cc.safe('canvas.tools.selection-tools', function () { " + NS + '._initEvents(); ' + NS + '._initCanvasSync(); ' + NS + '._watchSelection(); });\n' +
      '        } else if (++tries > 250) { clearInterval(iv); }\n' +
      '      }, 16);\n' +
      '    });\n' +
      '  }\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'selection-tools', parent: 'canvas.tools', title: 'Selection tool', mount: function () {}, unmount: function () {} });\n";
  }
});
