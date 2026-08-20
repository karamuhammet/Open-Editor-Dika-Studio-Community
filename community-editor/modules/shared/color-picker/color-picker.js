/* ============================================================
   Advanced Color Picker — GROUP PARENT (decomposed)
   Figma-inspired solid / gradient workflow with multi-stop fills.

   This 1698-line single IIFE was split into cohesive sub-modules. To keep the shared
   mutable state (the live picker/gradient selection) reachable across files WITHOUT
   polluting globals, everything hangs off ONE namespace object:

       CP  ==  window.__ccColorPicker

   - This parent owns the shared STATE + CONSTANTS (below) and the public window.* API.
   - The children (engine / solid / gradient / swatches / panel) attach their functions as
     CP.<name> and reference each other through CP at CALL time, so sibling load order is
     irrelevant. See modules/shared/color-picker/<child>/<child>.js.
   - Public window.* exports are thin forwarders → CP, so external callers (right-panel
     swatches, fill-bucket, whiteboard, gradient bg…) are unchanged.

   Init: the panel self-inits on the sticky cc:canvas-ready event. But that event is emitted
   by app.js synchronously (before the loader's async module scripts run), so a naive handler
   would fire before the child files exist. We therefore POLL until every child's init-critical
   function is present, then init once — load-order-proof. (Pattern for the other IIFE modules.)
   ============================================================ */
(function () {
  'use strict';

  var CP = window.__ccColorPicker || (window.__ccColorPicker = {});

  // ── shared mutable STATE (was the IIFE's private vars; now reachable by every child) ──
  CP._cpTarget = null;
  CP._cpColor = '#ffffff';
  CP._cpTab = 'solid';
  CP._hue = 0;
  CP._sat = 1;
  CP._val = 1;
  CP._draggingSV = false;
  CP._draggingHue = false;
  // Pending slide-out timer id (panel.js). Shared state because BOTH open and close must be able
  // to cancel it: an uncancelled one hides a panel that was re-opened in the meantime.
  CP._cpCloseTimer = 0;

  CP._gradState = {
    type: 'linear',
    angle: 90,
    stops: [
      { id: 1, offset: 0, color: '#f2ff58', opacity: 100 },
      { id: 2, offset: 100, color: '#6c63ff', opacity: 100 }
    ]
  };
  CP._gradSelectedStopId = 1;
  CP._gradStopSeq = 3;
  CP._gradDraggingStopId = 0;
  CP._gradTypeMenuOpen = false;

  CP._gpHue = 0;
  CP._gpSat = 1;
  CP._gpVal = 1;
  CP._gpDraggingSV = false;
  CP._gpDraggingHue = false;

  // ── shared CONSTANTS ──
  CP.DEFAULT_COLORS = [
    '#ffffff','#000000','#f44336','#e91e63','#9c27b0','#673ab7',
    '#3f51b5','#2196f3','#03a9f4','#00bcd4','#009688','#4caf50',
    '#8bc34a','#cddc39','#ffeb3b','#ffc107','#ff9800','#ff5722',
    '#795548','#607d8b','#9e9e9e','#e0e0e0','#b71c1c','#880e4f',
    '#4a148c','#311b92','#1a237e','#0d47a1','#006064','#1b5e20',
    '#f57f17','#e65100','#bf360c','#3e2723','#263238','#fce4ec',
    '#e8eaf6','#e3f2fd','#e0f7fa','#e8f5e9','#fffde7','#fff3e0'
  ];

  CP.GRADIENT_PRESETS = [
    { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#f2ff58', opacity: 100 }, { offset: 100, color: '#6c63ff', opacity: 100 }] },
    { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#f44336', opacity: 100 }, { offset: 100, color: '#ff9800', opacity: 100 }] },
    { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#e91e63', opacity: 100 }, { offset: 100, color: '#673ab7', opacity: 100 }] },
    { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#2196f3', opacity: 100 }, { offset: 100, color: '#00bcd4', opacity: 100 }] },
    { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#4caf50', opacity: 100 }, { offset: 100, color: '#cddc39', opacity: 100 }] },
    { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000', opacity: 100 }, { offset: 100, color: '#434343', opacity: 100 }] },
    { type: 'radial', angle: 0, stops: [{ offset: 0, color: '#ff9a9e', opacity: 100 }, { offset: 100, color: '#fecfef', opacity: 100 }] },
    { type: 'radial', angle: 0, stops: [{ offset: 0, color: '#a18cd1', opacity: 100 }, { offset: 100, color: '#fbc2eb', opacity: 100 }] },
    { type: 'angular', angle: 0, stops: [{ offset: 0, color: '#667eea', opacity: 100 }, { offset: 50, color: '#764ba2', opacity: 100 }, { offset: 100, color: '#667eea', opacity: 100 }] },
    { type: 'diamond', angle: 0, stops: [{ offset: 0, color: '#89f7fe', opacity: 100 }, { offset: 50, color: '#66a6ff', opacity: 100 }, { offset: 100, color: '#1a237e', opacity: 100 }] },
    { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fddb92', opacity: 100 }, { offset: 100, color: '#d1fdff', opacity: 100 }] },
    { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#a1c4fd', opacity: 100 }, { offset: 100, color: '#c2e9fb', opacity: 100 }] }
  ];

  CP.GRADIENT_TYPES = [
    { value: 'linear', label: 'Linear' },
    { value: 'radial', label: 'Radial' },
    { value: 'angular', label: 'Angular' },
    { value: 'diamond', label: 'Diamond' }
  ];

  // ── init orchestrator (was window.initColorPickerPanel) — calls into the child modules ──
  CP.initColorPickerPanel = function () {
    CP.initColorPanel();
    if (typeof CP.initColorSwatchButtons === 'function') CP.initColorSwatchButtons();
    CP.addFloatTBColorButton();
  };

  // ── public API: thin forwarders to CP (call-time resolution → load-order-proof) ──
  function fwd(name) { return function () { return CP[name] ? CP[name].apply(null, arguments) : undefined; }; }
  window.openColorPanel = fwd('openColorPanel');
  window.closeColorPanel = fwd('closeColorPanel');
  window.rebuildObjectGradientFill = fwd('rebuildObjectGradientFill');
  window.cpBuildSwatchPreviewBackground = fwd('buildSwatchPreviewBackground');
  window.cpBuildGradientSourceCanvas = fwd('buildGradientSourceCanvas');
  window.cpCloneGradientState = fwd('cloneGradientState');
  window.initColorSwatchButtons = fwd('initColorSwatchButtons');
  window.syncColorSwatches = fwd('syncColorSwatches');
  window.initColorPickerPanel = fwd('initColorPickerPanel');
  window.cpGetGradientState = function () { return CP.cloneGradientState ? CP.cloneGradientState(CP._gradState) : null; };

  // ── Modular skeleton hook — self-init on the sticky cc:canvas-ready event, but DEFER until
  // all child sub-modules have loaded (canvas-ready is emitted before the async module scripts
  // run, so the children may not exist yet). Poll a few seconds, then init once inside cc.safe. ──
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      var tries = 0;
      var iv = setInterval(function () {
        // one representative fn per child must exist → all sub-modules loaded
        if (typeof CP.cloneGradientState === 'function' &&   // engine
            typeof CP.drawHueBar === 'function' &&            // solid
            typeof CP.renderGradientPresets === 'function' && // gradient
            typeof CP.renderDefaultColors === 'function' &&   // swatches
            typeof CP.initColorPanel === 'function') {        // panel
          clearInterval(iv);
          cc.safe('shared.color-picker.init', function () { CP.initColorPickerPanel(); });
        } else if (++tries > 250) {   // ~4s — a child failed to load; give up quietly
          clearInterval(iv);
          console.warn('[color-picker] sub-modules did not all load — init skipped');
        }
      }, 16);
    });
  }

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'color-picker', parent: 'shared', title: 'Color Picker', mount: function () {}, unmount: function () {} });
  }
})();
