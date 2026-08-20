/* ══════════════════════════════════════════════════════════════
   dika studio – Perspective Mockup Fit
   Post-selection placement: warp any image/selection into a
   4-point perspective surface.  Non-destructive, keeps the
   original pixel data and applies a live homography transform.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── State ────────────────────────────────────────────────── */
  var _active   = false;     // perspective mode active?
  var _srcObj   = null;      // source fabric.Image being warped
  var _srcData  = null;      // { canvas, w, h } original pixels
  var _handles  = [];        // 4 fabric.Circle corner handles
  var _outline  = null;      // fabric.Polyline connecting handles
  var _warpImg  = null;      // fabric.Image showing the warped result
  var _offCvs   = null;      // offscreen <canvas> for warp render
  var _offCtx   = null;

  /* ── Options (right-panel driven) ─────────────────────────── */
  var _feather  = 0;         // 0-10  edge feather px
  var _blendMode = 'normal'; // normal | multiply | overlay | screen
  var _opacity  = 100;       // 0-100
  var _shadow   = false;     // shadow/highlight overlay
  var _aa       = true;      // anti-aliasing (bilinear sampling)

  /* ── Floating bar ── */
  var _perspBar = null;

  /* ── Constants ────────────────────────────────────────────── */
  var HANDLE_RADIUS  = 7;
  var HANDLE_FILL    = 'rgba(242, 255, 88,0.85)';
  var HANDLE_STROKE  = '#f2ff58';
  var OUTLINE_STROKE = 'rgba(242, 255, 88,0.5)';

  /* ─────────────────────────────────────────────────────────── */
  /*  PUBLIC API                                                 */
  /* ─────────────────────────────────────────────────────────── */

  /** Enter perspective-fit mode for the selected image */
  window.enterPerspectiveMode = function () {
    var cvs = _cvs();
    var obj = cvs.getActiveObject();
    if (typeof deactivateFillBucketTool === 'function' && typeof window._fillBucketToolActive === 'function' && window._fillBucketToolActive()) deactivateFillBucketTool();
    if (!obj || obj.type !== 'image') {
      if (typeof showToast === 'function') showToast('Select an image first');
      return;
    }
    if (_active) exitPerspectiveMode();

    _active = true;
    _srcObj = obj;

    // Capture original pixel data
    _captureSource(obj);

    // Place 4 corner handles at the image's current bounding rect
    var b = obj.getBoundingRect(true);
    var corners = [
      { x: b.left,            y: b.top },             // TL
      { x: b.left + b.width,  y: b.top },             // TR
      { x: b.left + b.width,  y: b.top + b.height },  // BR
      { x: b.left,            y: b.top + b.height }    // BL
    ];
    _createHandles(corners);

    // Hide original while warping
    _srcObj.set({ opacity: 0.12 });
    cvs.discardActiveObject();
    cvs.renderAll();

    // Show panel
    var panel = document.getElementById('rp-perspective');
    if (panel) panel.style.display = '';

    // Initial render
    _renderWarp();
    _showPerspBar();

    if (typeof showToast === 'function')
      showToast('Perspective mode: drag corners to fit surface');
  };

  /** Exit perspective mode, apply or discard */
  window.exitPerspectiveMode = function (apply) {
    if (!_active) return;
    var cvs = _cvs();

    // Save references and computed values before clearing state
    var savedObj    = _srcObj;
    var wasClipped  = savedObj && savedObj._isClippedImage;
    var savedOffCvs = _offCvs;
    var bounds      = _getQuadBounds();      // capture while _handles still valid

    // Cleanup canvas overlay objects immediately
    _removeOverlay(cvs);
    _active  = false;
    _srcObj  = null;
    _srcData = null;
    _handles = [];
    _outline = null;
    _warpImg = null;

    var panel = document.getElementById('rp-perspective');
    if (panel) panel.style.display = 'none';
    _hidePerspBar();

    if (apply && savedObj && savedOffCvs) {
      // Commit: replace original image's src with warped version
      var dataUrl = savedOffCvs.toDataURL('image/png');

      // Safety: restore opacity before async setSrc in case callback fails
      savedObj.set({ opacity: _opacity / 100 });

      savedObj.setSrc(dataUrl, function () {
        savedObj.set({
          left:    bounds.minX,
          top:     bounds.minY,
          scaleX:  (bounds.maxX - bounds.minX) / savedObj.width,
          scaleY:  (bounds.maxY - bounds.minY) / savedObj.height,
          opacity: _opacity / 100,
          _perspectiveApplied: true
        });
        // For clipped images: remove clipPath since warped result already
        // contains only the visible (clipped) area
        if (wasClipped) {
          savedObj.clipPath = null;
          delete savedObj._isClippedImage;
          delete savedObj._clipPosition;
          delete savedObj._clipShapeW;
          delete savedObj._clipShapeH;
        }
        savedObj.setCoords();
        cvs.setActiveObject(savedObj);
        cvs.renderAll();
        if (typeof snap === 'function') snap();
        if (typeof refreshStructure === 'function') refreshStructure();
      }, { crossOrigin: 'anonymous' });
    } else {
      // Discard: restore original opacity
      if (savedObj) savedObj.set({ opacity: 1 });
      cvs.renderAll();
    }
  };

  /** Is perspective mode active? */
  window.isPerspectiveActive = function () { return _active; };

  /* ── Floating bar (bottom of screen) ── */
  function _showPerspBar() {
    if (_perspBar) { _perspBar.style.display = 'flex'; return; }
    _perspBar = document.createElement('div');
    _perspBar.className = 'selection-remove-bar';
    _perspBar.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' +
      '<span style="color:#f2ff58">Perspective Fit</span>' +
      '<button onclick="exitPerspectiveMode(true)" style="margin-left:12px">Apply (Enter)</button>' +
      '<button onclick="exitPerspectiveMode(false)">Cancel (Esc)</button>';
    document.body.appendChild(_perspBar);
  }
  function _hidePerspBar() {
    if (_perspBar) _perspBar.style.display = 'none';
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  CAPTURE SOURCE PIXELS                                      */
  /* ─────────────────────────────────────────────────────────── */
  function _captureSource(obj) {
    // For clipped images, render the visible (clipped) pixels
    if (obj._isClippedImage && obj.clipPath) {
      var el2 = obj.toCanvasElement();
      var w2 = el2.width;
      var h2 = el2.height;
      var ctx2 = el2.getContext('2d');
      _srcData = { canvas: el2, w: w2, h: h2, pixels: ctx2.getImageData(0, 0, w2, h2) };
      return;
    }
    var el = obj._element || obj._originalElement;
    if (!el) return;
    var nw = el.naturalWidth  || el.width;
    var nh = el.naturalHeight || el.height;

    // Account for cropX/cropY — use only the visible cropped region
    var cx = obj.cropX || 0;
    var cy = obj.cropY || 0;
    var w = obj.width || (nw - cx);
    var h = obj.height || (nh - cy);

    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(el, cx, cy, w, h, 0, 0, w, h);

    _srcData = { canvas: c, w: w, h: h, pixels: ctx.getImageData(0, 0, w, h) };
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  HANDLE MANAGEMENT                                          */
  /* ─────────────────────────────────────────────────────────── */
  function _createHandles(corners) {
    var cvs = _cvs();
    _handles = [];

    for (var i = 0; i < 4; i++) {
      var h = new fabric.Circle({
        left: corners[i].x,
        top:  corners[i].y,
        radius: HANDLE_RADIUS,
        fill: HANDLE_FILL,
        stroke: HANDLE_STROKE,
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        hasBorders: false,
        hasControls: false,
        selectable: true,
        evented: true,
        objectCaching: false,
        excludeFromExport: true,
        _isPerspHandle: true,
        _handleIdx: i
      });
      _handles.push(h);
      cvs.add(h);
    }

    // Outline polyline
    _outline = new fabric.Polyline(
      corners.concat(corners[0]),
      {
        fill: 'transparent',
        stroke: OUTLINE_STROKE,
        strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        objectCaching: false,
        excludeFromExport: true,
        _isPerspOutline: true
      }
    );
    cvs.add(_outline);

    // Bring handles to top
    _handles.forEach(function (h) { cvs.bringToFront(h); });

    // Listen to handle movement
    cvs.on('object:moving', _onHandleMove);
  }

  function _onHandleMove(e) {
    if (!_active) return;
    var obj = e.target;
    if (!obj || !obj._isPerspHandle) return;
    _updateOutline();
    _renderWarp();
  }

  function _updateOutline() {
    if (!_outline || _handles.length < 4) return;
    var pts = _handles.map(function (h) {
      return { x: h.left, y: h.top };
    });
    pts.push({ x: _handles[0].left, y: _handles[0].top });
    _outline.set({ points: pts });
    _outline.dirty = true;
    _cvs().renderAll();
  }

  function _removeOverlay(cvs) {
    _handles.forEach(function (h) { cvs.remove(h); });
    if (_outline) cvs.remove(_outline);
    if (_warpImg) cvs.remove(_warpImg);
    cvs.off('object:moving', _onHandleMove);
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  PERSPECTIVE WARP RENDER                                    */
  /* ─────────────────────────────────────────────────────────── */
  function _renderWarp() {
    if (!_active || !_srcData || _handles.length < 4) return;

    var dst = _handles.map(function (h) { return { x: h.left, y: h.top }; });
    var bounds = _getQuadBounds();
    var outW = Math.round(bounds.maxX - bounds.minX);
    var outH = Math.round(bounds.maxY - bounds.minY);
    if (outW < 2 || outH < 2) return;

    // Prepare offscreen canvas
    if (!_offCvs) {
      _offCvs = document.createElement('canvas');
      _offCtx = _offCvs.getContext('2d');
    }
    _offCvs.width  = outW;
    _offCvs.height = outH;
    _offCtx.clearRect(0, 0, outW, outH);

    // Translate destination points relative to output canvas
    var relDst = dst.map(function (p) {
      return { x: p.x - bounds.minX, y: p.y - bounds.minY };
    });

    // Source corners (full image rect)
    var sw = _srcData.w, sh = _srcData.h;
    var src = [
      { x: 0,  y: 0 },   // TL
      { x: sw, y: 0 },    // TR
      { x: sw, y: sh },   // BR
      { x: 0,  y: sh }    // BL
    ];

    // Compute inverse homography: dest → source
    var H = _computeHomography(relDst, src);
    if (!H) {
      if (typeof showToast === 'function') showToast('Invalid perspective shape — adjust corners');
      return;
    }

    // Render via inverse mapping
    var srcPix = _srcData.pixels.data;
    var outImg = _offCtx.createImageData(outW, outH);
    var od = outImg.data;

    for (var y = 0; y < outH; y++) {
      for (var x = 0; x < outW; x++) {
        // Apply homography: map (x,y) in dest → (sx,sy) in source
        var denom = H[6] * x + H[7] * y + H[8];
        if (Math.abs(denom) < 1e-10) continue;
        var sx = (H[0] * x + H[1] * y + H[2]) / denom;
        var sy = (H[3] * x + H[4] * y + H[5]) / denom;

        if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) continue;

        var idx = (y * outW + x) * 4;

        if (_aa) {
          // Bilinear interpolation for anti-aliasing
          var fx = Math.floor(sx), fy = Math.floor(sy);
          var dx = sx - fx, dy = sy - fy;
          var i00 = (fy * sw + fx) * 4;
          var i10 = i00 + 4;
          var i01 = i00 + sw * 4;
          var i11 = i01 + 4;

          for (var c = 0; c < 4; c++) {
            var v = (1 - dx) * (1 - dy) * srcPix[i00 + c] +
                    dx       * (1 - dy) * srcPix[i10 + c] +
                    (1 - dx) * dy       * srcPix[i01 + c] +
                    dx       * dy       * srcPix[i11 + c];
            od[idx + c] = v | 0;
          }
        } else {
          // Nearest-neighbour
          var isx = Math.round(sx), isy = Math.round(sy);
          var si  = (isy * sw + isx) * 4;
          od[idx]     = srcPix[si];
          od[idx + 1] = srcPix[si + 1];
          od[idx + 2] = srcPix[si + 2];
          od[idx + 3] = srcPix[si + 3];
        }
      }
    }

    // Edge feather
    if (_feather > 0) _applyEdgeFeather(od, outW, outH, _feather);

    // Shadow/highlight overlay
    if (_shadow) _applyShadowHighlight(od, outW, outH, relDst);

    _offCtx.putImageData(outImg, 0, 0);

    // Place/update fabric image on canvas
    _placeWarpImage(bounds);
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  HOMOGRAPHY (3×3 perspective matrix)                        */
  /*  Maps 4 source points → 4 destination points.               */
  /*  We solve for H such that dst = H * src (homogeneous).      */
  /*  Uses direct linear transform (DLT) with 8-equation system. */
  /* ─────────────────────────────────────────────────────────── */
  function _computeHomography(srcPts, dstPts) {
    // Build the 8×9 matrix A for Ah = 0
    var A = [];
    for (var i = 0; i < 4; i++) {
      var sx = srcPts[i].x, sy = srcPts[i].y;
      var dx = dstPts[i].x, dy = dstPts[i].y;
      A.push([-sx, -sy, -1, 0, 0, 0, dx * sx, dx * sy, dx]);
      A.push([0, 0, 0, -sx, -sy, -1, dy * sx, dy * sy, dy]);
    }

    // Solve via SVD-like approach: Gaussian elimination on 8×9 → null space
    // For exactly 4 point pairs, we have 8 equations for 8 unknowns (h9=1)
    // Rewrite as Bh' = c where h' = [h1..h8], h9 = 1
    var B = [], c = [];
    for (var i = 0; i < 8; i++) {
      var row = [];
      for (var j = 0; j < 8; j++) row.push(A[i][j]);
      B.push(row);
      c.push(-A[i][8]);
    }

    var h = _solveLinear8(B, c);
    if (!h) return null;

    // Return 3×3 matrix as flat array [h0..h7, 1]
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  /** Solve 8×8 linear system via Gaussian elimination with partial pivoting */
  function _solveLinear8(A, b) {
    var n = 8;
    // Augmented matrix
    var M = [];
    for (var i = 0; i < n; i++) {
      M[i] = A[i].slice();
      M[i].push(b[i]);
    }

    // Forward elimination
    for (var col = 0; col < n; col++) {
      // Partial pivoting
      var maxRow = col, maxVal = Math.abs(M[col][col]);
      for (var row = col + 1; row < n; row++) {
        var v = Math.abs(M[row][col]);
        if (v > maxVal) { maxVal = v; maxRow = row; }
      }
      if (maxVal < 1e-12) return null; // singular
      if (maxRow !== col) { var tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp; }

      var pivot = M[col][col];
      for (var j = col; j <= n; j++) M[col][j] /= pivot;

      for (var row = 0; row < n; row++) {
        if (row === col) continue;
        var factor = M[row][col];
        for (var j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
      }
    }

    var x = [];
    for (var i = 0; i < n; i++) x.push(M[i][n]);
    return x;
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  EDGE FEATHER                                               */
  /* ─────────────────────────────────────────────────────────── */
  function _applyEdgeFeather(data, w, h, radius) {
    // Simple: fade alpha near transparent boundary
    var r = Math.ceil(radius);
    // Build distance-to-edge map (approximate: distance to transparent pixel)
    var dist = new Float32Array(w * h);
    dist.fill(999);

    // Forward pass
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        var a = data[idx * 4 + 3];
        if (a === 0) { dist[idx] = 0; continue; }
        if (x > 0) dist[idx] = Math.min(dist[idx], dist[idx - 1] + 1);
        if (y > 0) dist[idx] = Math.min(dist[idx], dist[idx - w] + 1);
      }
    }
    // Backward pass
    for (var y = h - 1; y >= 0; y--) {
      for (var x = w - 1; x >= 0; x--) {
        var idx = y * w + x;
        if (x < w - 1) dist[idx] = Math.min(dist[idx], dist[idx + 1] + 1);
        if (y < h - 1) dist[idx] = Math.min(dist[idx], dist[idx + w] + 1);
      }
    }

    // Apply feather
    for (var i = 0; i < w * h; i++) {
      if (dist[i] < r && dist[i] > 0) {
        var t = dist[i] / r;
        data[i * 4 + 3] = Math.round(data[i * 4 + 3] * t * t); // quadratic falloff
      }
    }
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  SHADOW / HIGHLIGHT OVERLAY                                 */
  /*  Simulates light falloff across the perspective surface.    */
  /* ─────────────────────────────────────────────────────────── */
  function _applyShadowHighlight(data, w, h, quadPts) {
    // Compute a simple left-to-right gradient based on quad shape
    // Narrower side = further away = darker
    var leftH  = Math.abs(quadPts[3].y - quadPts[0].y);
    var rightH = Math.abs(quadPts[2].y - quadPts[1].y);
    var darkLeft  = leftH < rightH;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        if (data[idx + 3] === 0) continue;
        var t = x / w; // 0 = left, 1 = right
        var factor;
        if (darkLeft) {
          factor = 0.7 + 0.3 * t; // left darker
        } else {
          factor = 1.0 - 0.3 * t; // right darker
        }
        data[idx]     = Math.min(255, Math.round(data[idx]     * factor));
        data[idx + 1] = Math.min(255, Math.round(data[idx + 1] * factor));
        data[idx + 2] = Math.min(255, Math.round(data[idx + 2] * factor));
      }
    }
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  PLACE WARPED IMAGE ON CANVAS                               */
  /* ─────────────────────────────────────────────────────────── */
  function _placeWarpImage(bounds) {
    var cvs = _cvs();

    if (!_warpImg) {
      _warpImg = new fabric.Image(_offCvs, {
        left: bounds.minX,
        top:  bounds.minY,
        selectable: false,
        evented: false,
        objectCaching: false,
        excludeFromExport: true,
        _isPerspWarp: true,
        opacity: _opacity / 100
      });
      cvs.add(_warpImg);
    } else {
      _warpImg.setElement(_offCvs);
      _warpImg.set({
        left: bounds.minX,
        top:  bounds.minY,
        opacity: _opacity / 100
      });
      _warpImg.dirty = true;
    }

    // Apply blend mode via globalCompositeOperation
    if (_blendMode !== 'normal') {
      _warpImg.globalCompositeOperation = _blendMode;
    } else {
      _warpImg.globalCompositeOperation = 'source-over';
    }

    // Keep handles on top
    _handles.forEach(function (h) { cvs.bringToFront(h); });
    cvs.renderAll();
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  HELPERS                                                    */
  /* ─────────────────────────────────────────────────────────── */
  function _cvs() {
    return typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  }

  function _getQuadBounds() {
    var xs = _handles.map(function (h) { return h.left; });
    var ys = _handles.map(function (h) { return h.top; });
    return {
      minX: Math.min.apply(null, xs),
      minY: Math.min.apply(null, ys),
      maxX: Math.max.apply(null, xs),
      maxY: Math.max.apply(null, ys)
    };
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  RIGHT PANEL BINDINGS                                       */
  /* ─────────────────────────────────────────────────────────── */
  function _initPanelBindings() {
    // Feather slider
    var featherSlider = document.getElementById('p-persp-feather');
    var featherVal    = document.getElementById('p-persp-feather-val');
    if (featherSlider) {
      featherSlider.addEventListener('input', function () {
        _feather = parseInt(featherSlider.value) || 0;
        if (featherVal) featherVal.textContent = _feather;
        if (_active) _renderWarp();
      });
    }

    // Opacity slider
    var opSlider = document.getElementById('p-persp-opacity');
    var opVal    = document.getElementById('p-persp-opacity-val');
    if (opSlider) {
      opSlider.addEventListener('input', function () {
        _opacity = parseInt(opSlider.value) || 100;
        if (opVal) opVal.textContent = _opacity + '%';
        if (_active && _warpImg) {
          _warpImg.set({ opacity: _opacity / 100 });
          _cvs().renderAll();
        }
      });
    }

    // Blend mode
    var blendSel = document.getElementById('p-persp-blend');
    if (blendSel) {
      blendSel.addEventListener('change', function () {
        _blendMode = blendSel.value;
        if (_active) _renderWarp();
      });
    }

    // Shadow toggle
    var shadowChk = document.getElementById('p-persp-shadow');
    if (shadowChk) {
      shadowChk.addEventListener('change', function () {
        _shadow = shadowChk.checked;
        if (_active) _renderWarp();
      });
    }

    // Anti-aliasing toggle
    var aaChk = document.getElementById('p-persp-aa');
    if (aaChk) {
      aaChk.addEventListener('change', function () {
        _aa = aaChk.checked;
        if (_active) _renderWarp();
      });
    }

    // Apply button
    var applyBtn = document.getElementById('p-persp-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        exitPerspectiveMode(true);
      });
    }

    // Cancel button
    var cancelBtn = document.getElementById('p-persp-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        exitPerspectiveMode(false);
      });
    }

    // Reset corners
    var resetBtn = document.getElementById('p-persp-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!_active || !_srcObj) return;
        var b = _srcObj.getBoundingRect(true);
        var corners = [
          { x: b.left,            y: b.top },
          { x: b.left + b.width,  y: b.top },
          { x: b.left + b.width,  y: b.top + b.height },
          { x: b.left,            y: b.top + b.height }
        ];
        _handles.forEach(function (h, i) {
          h.set({ left: corners[i].x, top: corners[i].y });
          h.setCoords();
        });
        _updateOutline();
        _renderWarp();
      });
    }
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  INIT                                                       */
  /* ─────────────────────────────────────────────────────────── */
  function _init() {
    _initPanelBindings();

    // Escape key exits perspective mode
    document.addEventListener('keydown', function (e) {
      if (!_active) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitPerspectiveMode(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        exitPerspectiveMode(true);
      }
    });
  }

  // Faz 8: canvas-tool module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('canvas.tools.perspective-mockup', _init); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();

})();

// Modular skeleton hook (Faz 8) — perspective-mockup is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'perspective-mockup', parent: 'canvas.tools', title: 'Perspective mockup', mount: function () {}, unmount: function () {} });
