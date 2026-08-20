/* Decompose modules/left-panel/whiteboard/whiteboard.js (1236-line IIFE, the whiteboard/board mode).
   Namespace WB. 58 fns → 8 groups, all vars state/consts → parent. window.wbActive is a window flag
   (read/written directly, untouched). Self-inits on readyState → parent polls on canvas-ready. */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/left-panel/whiteboard';
const NS = 'WB';
const DESC = {
  util: 'Geometry/pointer/snap helpers + brush size/colour getters.',
  bar: 'Floating board toolbar (build/drag/destroy/highlight/zen).',
  brush: 'Brush colour + the hover settings popover.',
  tools: 'Tool switching + hand/select/shape/draw/text/eraser setup.',
  lines: 'Board line + arrow (fabric.BoardLine) — native Line subclass + endpoint controls.',
  sticky: 'Sticky notes — create/make/edit/dblclick.',
  interaction: 'Zoom/pan + tool keyboard shortcuts.',
  mode: 'Board mode lifecycle (enter/exit) + flyout settings + init.'
};
const FWD_MAP = { _wbSetBrushColor: '_setBrushColor', enterWhiteboardMode: 'enterWhiteboardMode', exitWhiteboardMode: 'exitWhiteboardMode', setWbTool: 'setWbTool' };
run({
  src: DIR + '/whiteboard.js',
  parentFile: DIR + '/whiteboard.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccWhiteboard',
  parentId: 'whiteboard',
  idPrefix: 'wb',
  parentDotted: 'left-panel.whiteboard',
  childComment: g => 'left-panel/whiteboard/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    util: ['areaSize', 'getPointer', 'findSnapPoint', 'brushSize', 'brushColor'],
    bar: ['buildBar', '_setupBarDrag', 'destroyBar', 'highlightBar', 'toggleZenMode'],
    brush: ['_setBrushColor', '_openBrushColorPicker', '_ensureBrushPopover', '_showBrushPopover', '_hideBrushPopoverSoon', '_destroyBrushPopover'],
    tools: ['teardownCurrentTool', 'setWbTool', 'setupHand', 'setupSelect', '_diamondPoly', 'setupShape', 'setupDraw', 'setupText', 'setupEraser'],
    lines: ['setupLine', 'setupArrow', '_setupBoardLineTool', '_boardLineControl'],
    sticky: ['setupSticky', 'addStickyNote', '_makeSticky', '_editSticky', '_stickyDblClick'],
    interaction: ['setupZoomPan', 'teardownZoomPan', 'setupToolShortcuts', 'teardownToolShortcuts'],
    mode: ['enterWhiteboardMode', 'exitWhiteboardMode', 'initFlyoutSettings', 'initWhiteboard']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   whiteboard — GROUP PARENT (decomposed)\n' +
      '   The board-mode IIFE split per concern. Shared state + the TOOLS table stay on\n' +
      '   ' + NS + ' = window.__ccWhiteboard; functions go to children. window.wbActive is a plain window\n' +
      '   flag (other files read/write it directly), kept as-is. Self-inits on cc:canvas-ready (poll\n' +
      '   until children load). Public enter/exit/setWbTool + _wbSetBrushColor stay via forwarders.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccWhiteboard || (window.__ccWhiteboard = {});\n\n' +
      (stateLines.trim() ? '  // ── shared state + TOOLS table ──\n' + stateLines + '\n\n' : '') +
      '  // ── public API ──\n' +
      '  window.wbActive = false;\n' +
      '  function fwd(name) { return function () { return ' + NS + '[name] ? ' + NS + '[name].apply(null, arguments) : undefined; }; }\n' +
      Object.keys(FWD_MAP).map(k => "  window." + k + " = fwd('" + FWD_MAP[k] + "');").join('\n') + '\n\n' +
      '  // ── self-init on cc:canvas-ready, deferred until every child has loaded ──\n' +
      '  if (window.cc && cc.on) {\n' +
      "    cc.on('cc:canvas-ready', function () {\n" +
      '      var tries = 0;\n' +
      '      var iv = setInterval(function () {\n' +
      "        if (typeof " + NS + ".initWhiteboard === 'function' && typeof " + NS + ".buildBar === 'function' &&\n" +
      "            typeof " + NS + "._setBrushColor === 'function' && typeof " + NS + ".setWbTool === 'function' &&\n" +
      "            typeof " + NS + ".setupLine === 'function' && typeof " + NS + ".setupSticky === 'function' &&\n" +
      "            typeof " + NS + ".setupZoomPan === 'function' && typeof " + NS + ".areaSize === 'function') {\n" +
      '          clearInterval(iv);\n' +
      "          cc.safe('left-panel.whiteboard', " + NS + '.initWhiteboard);\n' +
      '        } else if (++tries > 250) { clearInterval(iv); }\n' +
      '      }, 16);\n' +
      '    });\n' +
      '  }\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'whiteboard', parent: 'left-panel', title: 'Board', icon: 'pen-tool', mount: function () {}, unmount: function () {} });\n";
  }
});
