/* Decompose modules/slide-deck/slide-deck-final/slide-deck-final.js (1631-line IIFE — "Final overrides
   for nested slide deck UI"). 51 private helpers + 16 public overrides (originally bare `_sdX = function`
   global leaks that replace slide-deck.js originals; normalized to `window._sdX = function` first).
   Namespace SDF. Private helpers move onto SDF (no global leak → _sdFinalClamp stops colliding with
   slide-deck-runtime). The 16 overrides are re-exported as window forwarders in the parent (same global
   override, same timing). The trailing syncSlideDeckUi monkey-patch (external refs only) rides the panel
   child via rawBlocks. External _sd* deps (_sdEnsureCurrentPage, _sdSlideAction, _commitDraftToSlide, …)
   are not defined here → never prefixed. */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/slide-deck/slide-deck-final';
const NS = 'SDF';
const DESC = {
  metrics: 'runtime layout metrics — stage width, size buckets, clamp, get/apply.',
  selection: 'slide multi-select state, card indicators, selection toolbar, bulk duplicate/delete/move.',
  dragselect: 'DragSelect integration + marquee selection-drag overlay.',
  transition: 'transition popover/modal — presets, portal, drag, open/hide, labels.',
  overlays: 'gap popover + end popover + close-all-overlays.',
  panel: 'deck panel/shell, slide strip, template grid + category cards (+ the syncSlideDeckUi patch).'
};
const PUBLIC = ['_sdGetRuntimeMetrics','_sdApplyRuntimeMetrics','_sdHideTransitionPopover','_sdHideGapPopover',
  '_sdCloseAllOverlays','_sdShowGapPopover','_sdOpenTransitionPopover','_sdToggleEndPopover','_sdEnsureDeckPanel',
  '_sdRefreshDeckPanel','_sdCreateShell','_sdRenderStripSlides','_sdSlideCategoryCount','_sdMakeSlideBlankCard',
  '_sdRenderSlideCategoryCards','_sdRenderSlideTemplateGrid'];
run({
  src: DIR + '/slide-deck-final.js',
  parentFile: DIR + '/slide-deck-final.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccSdFinal',
  parentId: 'slide-deck-final',
  parentDotted: 'slide-deck.slide-deck-final',
  childComment: g => 'slide-deck/slide-deck-final/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groupFn: function (n) {
    if (/Transition/.test(n)) return 'transition';
    if (/Gap|EndPopover|CloseAllOverlays/.test(n)) return 'overlays';
    if (/DragSelect|SelectionDrag|SelectionOverlay|HitTest|LocalRect/.test(n)) return 'dragselect';
    if (/Selection|Selected|CardShell|CardSelection/.test(n)) return 'selection';
    if (/RuntimeMetrics|StageWidth|Bucket|Clamp|FinalMetrics/.test(n)) return 'metrics';
    return 'panel';
  },
  buildParent: function (stateLines, NS) {
    return '/* ============================================================\n' +
      '   slide-deck-final — GROUP PARENT (decomposed)\n' +
      '   "Final overrides for nested slide deck UI": 67 helper/override fns split per concern onto the\n' +
      '   shared namespace ' + NS + ' (window.__ccSdFinal). The 16 PUBLIC overrides are re-exported here as\n' +
      '   window globals (forwarders → ' + NS + '), so they replace the slide-deck.js originals at parent load,\n' +
      '   exactly as the old bare `_sdX = function` leaks did. Private helpers stay on ' + NS + ' (no global\n' +
      '   pollution — e.g. _sdFinalClamp no longer collides with slide-deck-runtime). The trailing\n' +
      '   syncSlideDeckUi monkey-patch is rebuilt here, deferred to modules:ready.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n" +
      '  var ' + NS + ' = window.__ccSdFinal || (window.__ccSdFinal = {});\n\n' +
      (stateLines.trim() ? '  // ── shared state ──\n' + stateLines + '\n\n' : '') +
      '  // ── public overrides → window forwarders (replace slide-deck.js originals, call SDF impl) ──\n' +
      '  var PUBLIC = ' + JSON.stringify(PUBLIC) + ';\n' +
      '  PUBLIC.forEach(function (n) { window[n] = function () { return ' + NS + '[n] ? ' + NS + '[n].apply(this, arguments) : undefined; }; });\n\n' +
      '  // ── final syncSlideDeckUi wrap — deferred to modules:ready so it runs AFTER slide-deck-runtime\n' +
      '  //    defines syncSlideDeckUi (this group can load before that sibling). External refs only;\n' +
      '  //    idempotent via the _sdFinalWrapped flag. ──\n' +
      '  function _sdFinalWrapSync() {\n' +
      "    if (typeof syncSlideDeckUi !== 'function' || syncSlideDeckUi._sdFinalWrapped) return;\n" +
      '    var _orig = syncSlideDeckUi;\n' +
      '    syncSlideDeckUi = function () {\n' +
      '      var result = _orig.apply(this, arguments);\n' +
      "      var area = document.getElementById('canvas-area');\n" +
      "      var zoomPill = area ? area.querySelector('.zoom-pill') : null;\n" +
      "      var page = (typeof _sdEnsureCurrentPage === 'function') ? _sdEnsureCurrentPage() : null;\n" +
      '      if (area && (!page || !pageHasSlideDeck(page))) {\n' +
      "        area.classList.remove('slide-lane-active');\n" +
      "        area.style.removeProperty('--sd-active-lane-total-h');\n" +
      "        if (zoomPill) { zoomPill.style.top = ''; zoomPill.style.bottom = ''; zoomPill.style.zIndex = ''; }\n" +
      '      }\n' +
      '      return result;\n' +
      '    };\n' +
      '    syncSlideDeckUi._sdFinalWrapped = true;\n' +
      '  }\n' +
      "  if (window.cc && cc.on) cc.on('modules:ready', _sdFinalWrapSync); else _sdFinalWrapSync();\n" +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'slide-deck-final', parent: 'slide-deck', title: 'Slide deck export', mount: function () {}, unmount: function () {} });\n";
  }
});
