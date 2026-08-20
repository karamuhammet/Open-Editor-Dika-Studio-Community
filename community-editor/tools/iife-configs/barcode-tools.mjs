/* Decompose modules/left-panel/tools/barcode-tools/barcode-tools.js (1364-line IIFE, the barcode
   generator tool panel). Namespace VBC. 67 fns → 5 groups, all vars are small state/consts → parent.
   6 public window.* ref-exports → forwarders. Lazy (renderBarcodeToolPanel on tool open). */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/left-panel/tools/barcode-tools';
const NS = 'VBC';
const DESC = {
  util: 'State persistence + small helpers (clone/merge/esc/icon/type checks).',
  core: 'Barcode engine — type catalog, validation, bwip options, render to canvas/svg/dataurl/fabric.',
  single: 'Single-barcode mode — preview, add-to-canvas, export, bindings.',
  bulk: 'Bulk/CSV mode — mapping, per-row generation across pages, progress/results.',
  panel: 'Panel shell — markup, history, sequence mode, render/update/sync.'
};
const FWD = ['isBarcodeObject', 'renderBarcodeToolPanel', 'generateBarcodePreview', 'addBarcodeToCanvas', 'updateBarcodeObjectFromPanel', 'syncBarcodePanel'];
run({
  src: DIR + '/barcode-tools.js',
  parentFile: DIR + '/barcode-tools.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccBarcodeTools',
  parentId: 'barcode-tools',
  idPrefix: 'bc',
  parentDotted: 'left-panel.tools.barcode-tools',
  childComment: g => 'left-panel/tools/barcode-tools/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  parentVarsSkip: ['_state'],   // `var _state = _loadState()` — _loadState lives in the util child; defer
  groups: {
    util: ['_clone', '_loadState', '_saveState', '_mergeDeep', '_esc', '_icon', '_isTextObjectType', '_isImageUrl'],
    core: ['isBarcodeObject', '_barcodeTypes', '_barcodeMeta', '_normalizeBcid', '_validateBarcode', '_needsCheckDigit', '_cleanHex',
      '_isTwoDimensionalBcid', '_isSquareMatrixBcid', '_buildBwipOptions', '_normalizeSvg', '_renderBarcodeCanvas', '_renderBarcodeHiRes',
      '_renderBarcodeDataUrl', '_buildBarcodeFabricObject'],
    single: ['_previewHtml', '_setSinglePreview', '_setSizeReadout', 'generateBarcodePreview', '_getCanvasCenterSafe', '_pushHistoryEntry',
      'addBarcodeToCanvas', '_syncSingleStateFromInputs', '_bindSingleMode', '_singleMarkup', '_renderBarcodeSvg', '_bcDownloadBlob',
      '_exportBarcode', '_bindSingleExtras'],
    bulk: ['_sourceCanvasJson', '_currentPageTemplate', '_getSourceFieldTargets', '_defaultMapping', '_parseCsvFile', '_renderBulkMappingRows',
      '_renderBulkPreviewRows', '_renderBulkProgress', '_renderBulkResults', '_resolveRowTargets', '_uniquePageLabel', '_fitBarcodeObjectJson',
      '_createBarcodeObjectJson', '_applyBulkRowToPage', '_flushBulkPages', '_runBulkGeneration', '_bindBulkMode', '_bulkMarkup'],
    panel: ['_renderHistory', '_bcAcc', '_bcAccHint', '_bcAccColors', '_bcField2', '_bcTypeOptions', '_historyMarkup', '_sequenceMarkup',
      '_bindSequenceMode', 'renderBarcodeToolPanel', 'updateBarcodeObjectFromPanel', 'syncBarcodePanel']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   barcode-tools — GROUP PARENT (decomposed)\n' +
      '   The barcode-generator tool-panel IIFE split per concern (util/core/single/bulk/panel).\n' +
      '   Shared state + consts stay on ' + NS + ' = window.__ccBarcodeTools; functions go to children.\n' +
      '   The 6 public window.* exports become thin forwarders (lazy → ' + NS + '), so the tools hub +\n' +
      '   canvas barcode-object sync are unchanged.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccBarcodeTools || (window.__ccBarcodeTools = {});\n\n' +
      (stateLines.trim() ? '  // ── shared state + consts ──\n' + stateLines + '\n\n' : '') +
      '  // ── _state: deferred — its init calls _loadState() which lives in the util child (loads\n' +
      '  //    after this parent). Initialize once all sub-modules are loaded; read only at panel render. ──\n' +
      '  ' + NS + '._state = null;\n' +
      "  if (window.cc && cc.on) cc.on('modules:ready', function () { if (" + NS + '._state == null && typeof ' + NS + "._loadState === 'function') " + NS + '._state = ' + NS + '._loadState(); });\n\n' +
      '  // ── public API: thin forwarders → ' + NS + ' (call-time, load-order-proof) ──\n' +
      '  function fwd(name) { return function () { return ' + NS + '[name] ? ' + NS + '[name].apply(null, arguments) : undefined; }; }\n' +
      FWD.map(n => "  window." + n + " = fwd('" + n + "');").join('\n') + '\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'barcode-tools', parent: 'left-panel.tools', title: 'Barcode tools', mount: function () {}, unmount: function () {} });\n";
  }
});
