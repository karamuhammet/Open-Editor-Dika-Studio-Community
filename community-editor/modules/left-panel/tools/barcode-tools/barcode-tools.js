/* ============================================================
   barcode-tools — GROUP PARENT (decomposed)
   The barcode-generator tool-panel IIFE split per concern (util/core/single/bulk/panel).
   Shared state + consts stay on VBC = window.__ccBarcodeTools; functions go to children.
   The 6 public window.* exports become thin forwarders (lazy → VBC), so the tools hub +
   canvas barcode-object sync are unchanged.
   ============================================================ */
(function () {
  'use strict';

  var VBC = window.__ccBarcodeTools || (window.__ccBarcodeTools = {});

  // ── shared state + consts ──
  VBC.STORAGE_KEY = 'dika_barcode_state';
  VBC.RESULT_CHUNK = 20;
  VBC._bcExportCloser = null;
  VBC._bcExportKey = null;
  VBC._panelEl = null;
  VBC.DEFAULT_STATE = {
    mode: 'single',
    single: {
      type: 'code128',
      value: '',
      lineColor: '#111111',
      backgroundColor: '#ffffff',
      humanReadable: true,
      width: 3,
      height: 28,
      padding: 8,
      scale: 2,
      rotation: 0,
      outputMode: 'vector',
      createFieldAware: false,
      transparentBackground: false,
      autoFitFrame: false,
      snapCenter: true,
      previewSvg: '',
      previewDataUrl: '',
      previewError: ''
    },
    bulk: {
      rows: [],
      headers: [],
      fileName: '',
      mapping: {},
      strictMode: false,
      globalBarcodeType: 'code128',
      previewRows: [],
      progress: { total: 0, processed: 0, success: 0, failed: 0, running: false, canceled: false },
      results: []
    },
    history: []
  };
  VBC._bulkRunToken = 0;

  // ── _state: deferred — its init calls _loadState() which lives in the util child (loads
  //    after this parent). Initialize once all sub-modules are loaded; read only at panel render. ──
  VBC._state = null;
  if (window.cc && cc.on) cc.on('modules:ready', function () { if (VBC._state == null && typeof VBC._loadState === 'function') VBC._state = VBC._loadState(); });

  // ── public API: thin forwarders → VBC (call-time, load-order-proof) ──
  function fwd(name) { return function () { return VBC[name] ? VBC[name].apply(null, arguments) : undefined; }; }
  window.isBarcodeObject = fwd('isBarcodeObject');
  window.renderBarcodeToolPanel = fwd('renderBarcodeToolPanel');
  window.generateBarcodePreview = fwd('generateBarcodePreview');
  window.addBarcodeToCanvas = fwd('addBarcodeToCanvas');
  window.updateBarcodeObjectFromPanel = fwd('updateBarcodeObjectFromPanel');
  window.syncBarcodePanel = fwd('syncBarcodePanel');
})();

if (window.cc && cc.modules) cc.modules.register({ id: 'barcode-tools', parent: 'left-panel.tools', title: 'Barcode tools', mount: function () {}, unmount: function () {} });
