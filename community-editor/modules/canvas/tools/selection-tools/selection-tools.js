/* ============================================================
   selection-tools — GROUP PARENT (decomposed)
   The lasso/quick-select/refine-edge/frame-convert tool IIFE split per concern. Shared state
   on VST = window.__ccSelectionTools; functions go to children. The 19 public window.* API
   fns become forwarders. The 3 load-time init calls (_initEvents/_initCanvasSync/_watchSelection)
   are deferred: on cc:canvas-ready, poll until children load, then run them once.
   ============================================================ */
(function () {
  'use strict';

  var VST = window.__ccSelectionTools || (window.__ccSelectionTools = {});
  // Children build UI as HTML strings with inline onclick="VST.xxx()" handlers; inline
  // attributes resolve in GLOBAL scope, so the namespace must exist on window too.
  window.VST = VST;

  // ── shared state ──
  VST._activeTool = null;   // 'quick' | 'lasso' | 'polygon' | null;
  VST._drawing = false;
  VST._points = [];          // [{x,y}, ...] for lasso / polygon;
  VST._previewLine = null;
  VST._previewPath = null;
  VST._frameBar = null;      // floating "frame active" bar;
  VST._frameCounter = 0;
  VST._polyFinishing = false;
  VST._lockedObjs = [];
  VST._sourceImage = null;   // image that drawing is on top of;
  VST._qsActive = false;
  VST._qsDrawing = false;
  VST._qsImg = null;
  VST._qsMask = null;
  VST._qsEdge = null;
  VST._qsPix = null;
  VST._qsW = 0;
  VST._qsH = 0;
  VST._qsOverlay = null;
  VST._qsOffCvs = null;
  VST._qsOffCtx = null;
  VST._qsBrushCvs = null;
  VST._qsLastPt = null;
  VST._qsBrushR = 18;
  VST._qsColorTol = 32;
  VST._qsEdgeThr = 30;
  VST._qsBar = null;
  VST._qsBfsQ = null;
  VST._qsBfsVis = null;
  VST._reSmooth = 3;      // Gaussian smooth radius (0–10);
  VST._reFeather = 1;     // Feather radius (0–10);
  VST._reContrast = 30;   // Edge contrast re-tightening (0–100);
  VST._reShift = 0;       // Shift edge inward(-) / outward(+) pixels (-10 to +10);
  VST._rePanel = null;    // Refine Edge floating panel DOM;

  // ── public API: thin forwarders → VST ──
  function fwd(name) { return function () { return VST[name] ? VST[name].apply(null, arguments) : undefined; }; }
  window.activateSelectionTool = fwd('activateSelectionTool');
  window.deactivateSelectionTool = fwd('deactivateSelectionTool');
  window._selToolActive = fwd('_selToolActive');
  window.toggleToolsCat = fwd('toggleToolsCat');
  window._reOnSlider = fwd('_reOnSlider');
  window._reReset = fwd('_reReset');
  window._reClose = fwd('_reClose');
  window._reOpen = fwd('_reOpen');
  window._qsApply = fwd('_qsApply');
  window._qsCancelBtn = fwd('_qsCancelBtn');
  window._qsSetBrush = fwd('_qsSetBrush');
  window._qsInvert = fwd('_qsInvert');
  window.mergeImageIntoFrame = fwd('mergeImageIntoFrame');
  window.detachFrameFromImage = fwd('detachFrameFromImage');
  window.lockFrameToImage = fwd('lockFrameToImage');
  window.removeActiveFrame = fwd('removeActiveFrame');
  window.isFrameConvertibleObject = fwd('isFrameConvertibleObject');
  window.convertObjectToFrame = fwd('convertObjectToFrame');
  window.convertFrameToShape = fwd('convertFrameToShape');

  // ── self-init on cc:canvas-ready, deferred until children load ──
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      var tries = 0;
      var iv = setInterval(function () {
        if (typeof VST._initEvents === 'function' && typeof VST._initCanvasSync === 'function' &&
            typeof VST._watchSelection === 'function' && typeof VST._qsBegin === 'function' &&
            typeof VST._reRefine === 'function' && typeof VST._traceAlphaContours === 'function' &&
            typeof VST._createFrameFromPoints === 'function') {
          clearInterval(iv);
          cc.safe('canvas.tools.selection-tools', function () { VST._initEvents(); VST._initCanvasSync(); VST._watchSelection(); });
        } else if (++tries > 250) { clearInterval(iv); }
      }, 16);
    });
  }
})();

if (window.cc && cc.modules) cc.modules.register({ id: 'selection-tools', parent: 'canvas.tools', title: 'Selection tool', mount: function () {}, unmount: function () {} });
