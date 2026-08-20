/**
 * VideoCanvas — Video mode canvas dimension controller.
 *
 * Design principles:
 *  - Dimensions are ALWAYS computed from the current aspect-ratio key (_ar).
 *    No stale _expectedW/_expectedH that can desync.
 *  - activate() sets all globals DIRECTLY (CW, CH, canvas, activeProduct)
 *    without calling setProductType() — avoids the re-entrant
 *    setProductType → applyView → enforceDimensions race.
 *  - enforceDimensions() re-computes from _ar on every call.
 *  - PRODUCT_TYPES.video is synced so external code (export) reads correct values,
 *    but is NEVER used as a dimension source.
 *
 * Public API: window.VideoCanvas
 */
(function() {
  'use strict';

  // ── Supported aspect ratios ─────────────────────────────────
  var AR_TABLE = {
    '16:9':  { w: 1920, h: 1080 },
    '9:16':  { w: 1080, h: 1920 },
    '4:3':   { w: 1440, h: 1080 },
    '1:1':   { w: 1080, h: 1080 },
    '21:9':  { w: 2520, h: 1080 },
    '4:5':   { w: 1080, h: 1350 }
  };

  // ── State ──────────────────────────────────────────────────
  var _active = false;
  var _ar = '16:9';       // current aspect-ratio key — THE source of truth
  var _customDims = null; // explicit {w,h} when the user sets a free canvas size
  var _resizeObserver = null;
  var _resizeTimer = null;
  var MAX_SIDE = 3840;       // hard cap for an adopted free size (H.264 hardware encoders top out ~4096)

  // ── Pure: compute pixel dimensions from any AR string ──────
  function _dims(ar) {
    if (ar === 'custom' && _customDims) return { w: _customDims.w, h: _customDims.h };
    if (AR_TABLE[ar]) return { w: AR_TABLE[ar].w, h: AR_TABLE[ar].h };
    var p = (ar || '16:9').split(':');
    var rw = parseInt(p[0], 10) || 16;
    var rh = parseInt(p[1], 10) || 9;
    return { w: Math.round(1080 * rw / rh), h: 1080 };
  }

  // ── Apply dimensions to every global that matters ──────────
  //    Does NOT call setProductType / setCustomCanvasSize to avoid
  //    re-entrant applyView → enforceDimensions loops.
  function _apply(d) {
    // 1. Global vars
    CW = d.w;
    CH = d.h;

    // 2. Fabric canvas
    if (typeof canvas !== 'undefined' && canvas && canvas.setWidth) {
      canvas.setWidth(d.w);
      canvas.setHeight(d.h);
    }

    // 3. PRODUCT_TYPES.video (so external readers see correct values)
    if (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES.video) {
      PRODUCT_TYPES.video.w = d.w;
      PRODUCT_TYPES.video.h = d.h;
    }

    // 4. Current page record
    if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined' && pages[currentPageIndex]) {
      pages[currentPageIndex].w = d.w;
      pages[currentPageIndex].h = d.h;
    }
  }

  // ── Auto-fit zoom: scale canvas to fit available viewport ───
  //    Like CapCut/Clipchamp: compute the largest zoom that fits CW×CH
  //    inside canvas-area with a fixed pixel margin (24px each side).
  //    Called on activate, ratio change, AND on every container resize
  //    (via ResizeObserver) so the canvas adapts to monitor switches,
  //    panel toggles, and window resizes automatically.
  var CANVAS_MARGIN = 24; // px breathing room on each side (like CapCut)

  function _zoomToFit() {
    var area = document.getElementById('canvas-area');
    if (!area) return;
    var d = _dims(_ar);

    // Available space — subtract CSS padding (VE timeline adds paddingBottom)
    var cs = window.getComputedStyle(area);
    var padL = parseFloat(cs.paddingLeft)   || 0;
    var padR = parseFloat(cs.paddingRight)  || 0;
    var padT = parseFloat(cs.paddingTop)    || 0;
    var padB = parseFloat(cs.paddingBottom) || 0;
    var availW = area.clientWidth  - padL - padR - (CANVAS_MARGIN * 2);
    var availH = area.clientHeight - padT - padB - (CANVAS_MARGIN * 2);
    if (availW <= 0 || availH <= 0) return;

    // Contain: largest scale where both dimensions fit
    var fitZoom = Math.min(availW / d.w, availH / d.h);
    fitZoom = Math.max(0.1, Math.min(2.5, fitZoom));

    // Set globals directly (viewZoom, panX, panY are in app.js)
    if (typeof viewZoom !== 'undefined') {
      viewZoom = fitZoom;
      panX = 0;
      panY = 0;
    }
  }

  // ── Resize observer: auto-refit when canvas-area changes size ──
  //    Handles monitor switch, window resize, panel open/close.
  //    Debounced to 100ms to avoid excessive recalculations.
  function _startResizeWatch() {
    _stopResizeWatch();
    var area = document.getElementById('canvas-area');
    if (!area) return;

    var handler = function() {
      if (!_active) return;
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(function() {
        _zoomToFit();
        if (typeof applyView === 'function') applyView();
      }, 100);
    };

    // ResizeObserver — fires on element size changes (panel toggle, etc.)
    if (typeof ResizeObserver !== 'undefined') {
      _resizeObserver = new ResizeObserver(handler);
      _resizeObserver.observe(area);
    }

    // Fallback: window resize (catches monitor switch even if RO misses it)
    window.addEventListener('resize', handler);
    area._vcResizeHandler = handler;
  }

  function _stopResizeWatch() {
    if (_resizeObserver) {
      _resizeObserver.disconnect();
      _resizeObserver = null;
    }
    clearTimeout(_resizeTimer);
    var area = document.getElementById('canvas-area');
    if (area && area._vcResizeHandler) {
      window.removeEventListener('resize', area._vcResizeHandler);
      delete area._vcResizeHandler;
    }
  }

  // ── Trigger a non-destructive UI refresh ───────────────────
  //    Calls the UI updates that setProductType would normally do,
  //    but without overwriting CW/CH from PRODUCT_TYPES.
  function _syncUi() {
    _zoomToFit();
    if (typeof canvas !== 'undefined' && canvas && canvas.renderAll) canvas.renderAll();
    if (typeof applyView === 'function') applyView();
    if (typeof updateSizeBadge === 'function') updateSizeBadge();
    if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
    if (typeof updateRpTabBarVisibility === 'function') updateRpTabBarVisibility();
  }

  // ═══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════

  /** Enter video canvas mode with the given aspect ratio.
   *  Sets CW/CH/canvas/activeProduct directly — no setProductType(). */
  function activate(ar) {
    _ar = ar || '16:9';
    var d = _dims(_ar);

    // Set state BEFORE anything that might call enforceDimensions
    _active = true;

    // Set activeProduct so the rest of the app knows we're in video mode
    if (typeof activeProduct !== 'undefined') activeProduct = 'video';

    // Apply dimensions everywhere
    _apply(d);

    // UI refresh (applyView will call enforceDimensions — safe now)
    _syncUi();

    // Start watching for resize events (monitor switch, panel toggle)
    _startResizeWatch();
  }

  /** Leave video canvas mode, restore previous product type & dims. */
  function deactivate(prevType, prevCW, prevCH) {
    _active = false;
    _stopResizeWatch();

    // Reset PRODUCT_TYPES.video to canonical defaults
    if (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES.video) {
      PRODUCT_TYPES.video.w = 1920;
      PRODUCT_TYPES.video.h = 1080;
    }

    // Restore previous product type via the normal path
    if (prevType && prevType !== 'video' && typeof setProductType === 'function') {
      setProductType(prevType);
    } else if (typeof setCustomCanvasSize === 'function' && prevCW && prevCH) {
      if (typeof activeProduct !== 'undefined') activeProduct = prevType || 'custom';
      setCustomCanvasSize(prevCW, prevCH);
    }
  }

  /** Guard — re-computes from _ar and corrects CW/CH if anything drifted.
   *  Called by applyView() on every render. */
  function enforceDimensions() {
    if (!_active) return;
    var d = _dims(_ar);           // always fresh, never stale
    if (CW !== d.w || CH !== d.h) {
      _apply(d);
    }
  }

  /** Mirror the current size choice into the live VE project so it survives a
   *  reload: _ar/_customDims are module memory, gone on F5. events.js activates
   *  from _veProject.aspectRatio and re-applies customW/customH (owner bug:
   *  canvas size reverted to 1920x1080 on every reload). */
  function _persistToProject() {
    var VE = window.__ccVideoEditor;
    if (!VE || !VE._veProject) return;
    VE._veProject.aspectRatio = _ar;
    if (_ar === 'custom' && _customDims) {
      VE._veProject.customW = _customDims.w;
      VE._veProject.customH = _customDims.h;
    } else {
      VE._veProject.customW = null;
      VE._veProject.customH = null;
    }
  }

  /** Change aspect ratio while active. */
  function changeAspectRatio(ar) {
    _ar = ar || '16:9';
    _customDims = null; // picking a preset clears any free size
    _persistToProject();
    if (!_active) return;
    var d = _dims(_ar);
    _apply(d);
    _syncUi();
  }

  /** Set a free (custom) video resolution. Routed here from the Canvas size
   *  panel in video mode: enforceDimensions would otherwise revert a plain
   *  setCustomCanvasSize back to the aspect-derived size (owner: canvas size
   *  wouldn't change in video mode). */
  function setCustomSize(w, h) {
    w = Math.round(w); h = Math.round(h);
    if (w < 50 || h < 50) return;
    _ar = 'custom';
    _customDims = { w: w, h: h };
    _persistToProject();
    if (!_active) return;
    _apply(_customDims);
    _syncUi();
  }

  /** Adopt the EXACT size of the first video dropped on an empty timeline (owner rule: track boşken
   *  eklenen videonun boyutu canvas boyutu olur — a 1080x1920 clip in a 1920x1080 project makes the
   *  canvas 1080x1920). No ratio guessing and no "the user already picked a size" veto: the caller
   *  owns the "is the timeline empty" decision. Only >4K sources are scaled down (encoder ceiling).
   *  Returns true when the canvas actually changed. */
  function adoptMediaSize(mw, mh) {
    mw = Math.round(mw); mh = Math.round(mh);
    if (!_active || !(mw > 0) || !(mh > 0)) return false;
    var m = Math.max(mw, mh);
    if (m > MAX_SIDE) { var s = MAX_SIDE / m; mw = Math.round(mw * s); mh = Math.round(mh * s); }
    if (mw < 50 || mh < 50) return false;
    if (CW === mw && CH === mh) return false;   // already the right size — nothing to do
    _ar = 'custom';
    _customDims = { w: mw, h: mh };
    _persistToProject();
    _apply(_customDims);
    _syncUi();
    return true;
  }

  /** Get current dimensions (computed fresh from _ar). */
  function getExpectedSize() {
    var d = _dims(_ar);
    return { w: d.w, h: d.h };
  }

  function isActive()       { return _active; }
  function getAspectRatio() { return _ar; }
  function getPresets()     { return AR_TABLE; }

  // ── Export ─────────────────────────────────────────────────
  window.VideoCanvas = {
    activate:           activate,
    deactivate:         deactivate,
    enforceDimensions:  enforceDimensions,
    changeAspectRatio:  changeAspectRatio,
    setCustomSize:      setCustomSize,
    adoptMediaSize:     adoptMediaSize,
    getExpectedSize:    getExpectedSize,
    isActive:           isActive,
    getAspectRatio:     getAspectRatio,
    getPresets:         getPresets,
    zoomToFit:          _zoomToFit
  };

})();

// Modular skeleton hook (Faz 8) — video-canvas is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 'video-canvas', parent: 'video', title: 'video-canvas', mount: function () {}, unmount: function () {} });
