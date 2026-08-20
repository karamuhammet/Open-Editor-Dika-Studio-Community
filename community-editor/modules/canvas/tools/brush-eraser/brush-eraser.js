/* ══════════════════════════════════════════════════════════════
   dika studio – Brush Eraser
   Paint-to-erase mode: overlay a temporary canvas on the image
   and erase (make transparent) wherever the user paints.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _active = false;
  var _targetImg = null;      // fabric.Image being erased
  var _overlay = null;        // DOM overlay container
  var _eraserCanvas = null;   // offscreen canvas (full image res)
  var _eraserCtx = null;
  var _displayCanvas = null;  // visible canvas element
  var _displayCtx = null;
  var _cursorEl = null;       // circular brush cursor indicator
  var _painting = false;
  var _brushSize = 20;
  var _lastPt = null;

  function _getCvs() {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  }

  /* ── Activate ── */
  window.activateBrushEraser = function () {
    var cvs = _getCvs();
    var obj = cvs.getActiveObject();
    if (!obj || obj.type !== 'image' || obj.isQR || obj._isChart || obj._isEffect) {
      if (typeof showToast === 'function') showToast('Select an image first');
      return;
    }

    _active = true;
    _targetImg = obj;
    obj._origOpacity = obj.opacity;

    // Get the raw image element
    var el = obj._element || obj._originalElement;
    if (!el) { if (typeof showToast === 'function') showToast('Cannot access image data'); return; }

    var iw = el.naturalWidth || el.width;
    var ih = el.naturalHeight || el.height;

    // Create offscreen canvas with image data
    _eraserCanvas = document.createElement('canvas');
    _eraserCanvas.width = iw;
    _eraserCanvas.height = ih;
    _eraserCtx = _eraserCanvas.getContext('2d');
    _eraserCtx.drawImage(el, 0, 0, iw, ih);

    // Calculate display position from fabric object bounds
    var canvasEl = cvs.lowerCanvasEl;
    var rect = canvasEl.getBoundingClientRect();
    var bound = obj.getBoundingRect();
    var sx = rect.width / cvs.getWidth();
    var sy = rect.height / cvs.getHeight();

    var dispLeft = rect.left + bound.left * sx;
    var dispTop = rect.top + bound.top * sy;
    var dispW = bound.width * sx;
    var dispH = bound.height * sy;

    // Create overlay
    _overlay = document.createElement('div');
    _overlay.id = 'brush-eraser-overlay';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;cursor:crosshair;';

    // Checkerboard background behind display canvas to show transparency
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:' + dispLeft + 'px;top:' + dispTop + 'px;width:' + dispW + 'px;height:' + dispH + 'px;' +
      'background:repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 0 0 / 12px 12px;border:2px solid var(--gold,#f2ff58);border-radius:4px;overflow:hidden;';

    _displayCanvas = document.createElement('canvas');
    _displayCanvas.width = iw;
    _displayCanvas.height = ih;
    _displayCanvas.style.cssText = 'width:100%;height:100%;display:block;';
    _displayCtx = _displayCanvas.getContext('2d');
    _displayCtx.drawImage(_eraserCanvas, 0, 0);

    wrapper.appendChild(_displayCanvas);

    // Brush cursor indicator circle
    _cursorEl = document.createElement('div');
    _cursorEl.style.cssText = 'position:absolute;border:2px solid rgba(242, 255, 88,0.8);border-radius:50%;pointer-events:none;display:none;transform:translate(-50%,-50%);';
    wrapper.appendChild(_cursorEl);
    _updateCursorSize();

    _overlay.appendChild(wrapper);

    // Floating bar
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;' +
      'background:var(--surface,#131316);border:1px solid var(--border2,#35353c);border-radius:10px;padding:8px 16px;z-index:9999;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:"DM Sans",sans-serif;';
    bar.innerHTML =
      '<span style="color:var(--gold,#f2ff58);font-size:12px;font-weight:600">Brush Eraser</span>' +
      '<span style="color:var(--text-dim);font-size:11px;margin-left:4px">Size:</span>' +
      '<input id="be-size" type="range" min="3" max="100" value="' + _brushSize + '" style="width:80px;accent-color:var(--gold,#f2ff58)">' +
      '<span id="be-size-val" style="color:var(--text,#ededf0);font-size:11px;min-width:28px">' + _brushSize + 'px</span>' +
      '<button id="be-apply" style="background:var(--gold,#f2ff58);color:#000;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer">Apply</button>' +
      '<button id="be-cancel" style="background:none;color:var(--text,#ededf0);border:1px solid var(--border2,#35353c);border-radius:6px;padding:5px 14px;font-size:12px;cursor:pointer">Cancel</button>';
    _overlay.appendChild(bar);

    document.body.appendChild(_overlay);

    // Brush size control
    var sizeInput = document.getElementById('be-size');
    var sizeVal = document.getElementById('be-size-val');
    if (sizeInput) {
      sizeInput.oninput = function () {
        _brushSize = parseInt(sizeInput.value) || 20;
        if (sizeVal) sizeVal.textContent = _brushSize + 'px';
        _updateCursorSize();
      };
    }

    // Apply button
    var applyBtn = document.getElementById('be-apply');
    if (applyBtn) applyBtn.onclick = _applyErase;

    // Cancel button
    var cancelBtn = document.getElementById('be-cancel');
    if (cancelBtn) cancelBtn.onclick = _deactivate;

    // Mouse events on display canvas
    _displayCanvas.addEventListener('mousedown', _onDown);
    _displayCanvas.addEventListener('mousemove', _onMove);
    _displayCanvas.addEventListener('mouseup', _onUp);
    _displayCanvas.addEventListener('mouseleave', _onLeave);

    // Hide the fabric object while editing
    _targetImg.set('opacity', 0);
    cvs.renderAll();
  };

  /* ── Mouse handlers ── */
  function _updateCursorSize() {
    if (!_cursorEl || !_displayCanvas) return;
    var rect = _displayCanvas.getBoundingClientRect();
    var displaySize = _brushSize * (rect.width / (_eraserCanvas ? _eraserCanvas.width : rect.width));
    _cursorEl.style.width = displaySize + 'px';
    _cursorEl.style.height = displaySize + 'px';
  }

  function _updateCursorPos(e) {
    if (!_cursorEl || !_displayCanvas) return;
    var rect = _displayCanvas.getBoundingClientRect();
    var wrapper = _displayCanvas.parentNode;
    if (!wrapper) return;
    var wRect = wrapper.getBoundingClientRect();
    var x = e.clientX - wRect.left;
    var y = e.clientY - wRect.top;
    _cursorEl.style.left = x + 'px';
    _cursorEl.style.top = y + 'px';
    _cursorEl.style.display = 'block';
  }

  function _onDown(e) {
    _painting = true;
    _lastPt = _getCanvasPt(e);
    _eraseAt(_lastPt);
  }

  function _onMove(e) {
    _updateCursorPos(e);
    if (!_painting) return;
    var pt = _getCanvasPt(e);
    // Interpolate between last and current point
    _eraseLine(_lastPt, pt);
    _lastPt = pt;
  }

  function _onUp() {
    _painting = false;
    _lastPt = null;
  }

  function _onLeave() {
    _painting = false;
    _lastPt = null;
    if (_cursorEl) _cursorEl.style.display = 'none';
  }

  function _getCanvasPt(e) {
    var rect = _displayCanvas.getBoundingClientRect();
    var scaleX = _eraserCanvas.width / rect.width;
    var scaleY = _eraserCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function _eraseAt(pt) {
    var r = _brushSize * (_eraserCanvas.width / _displayCanvas.getBoundingClientRect().width);
    _eraserCtx.save();
    _eraserCtx.globalCompositeOperation = 'destination-out';
    _eraserCtx.beginPath();
    _eraserCtx.arc(pt.x, pt.y, r / 2, 0, Math.PI * 2);
    _eraserCtx.fill();
    _eraserCtx.restore();
    _refreshDisplay();
  }

  function _eraseLine(from, to) {
    var r = _brushSize * (_eraserCanvas.width / _displayCanvas.getBoundingClientRect().width);
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(dist / (r * 0.3)));

    _eraserCtx.save();
    _eraserCtx.globalCompositeOperation = 'destination-out';
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var x = from.x + dx * t;
      var y = from.y + dy * t;
      _eraserCtx.beginPath();
      _eraserCtx.arc(x, y, r / 2, 0, Math.PI * 2);
      _eraserCtx.fill();
    }
    _eraserCtx.restore();
    _refreshDisplay();
  }

  function _refreshDisplay() {
    _displayCtx.clearRect(0, 0, _displayCanvas.width, _displayCanvas.height);
    _displayCtx.drawImage(_eraserCanvas, 0, 0);
  }

  /* ── Apply erased result ── */
  function _applyErase() {
    if (!_targetImg || !_eraserCanvas) { _deactivate(); return; }

    var cvs = _getCvs();
    var dataURL = _eraserCanvas.toDataURL('image/png');

    var props = {
      left: _targetImg.left, top: _targetImg.top,
      scaleX: _targetImg.scaleX, scaleY: _targetImg.scaleY,
      angle: _targetImg.angle, opacity: _targetImg._origOpacity || 1,
      flipX: _targetImg.flipX, flipY: _targetImg.flipY
    };

    // Store reference before cleanup nullifies it
    var origObj = _targetImg;
    var origOpacity = _targetImg._origOpacity || 1;

    fabric.Image.fromURL(dataURL, function (newImg) {
      if (!newImg) {
        // fromURL failed — restore original image visibility
        if (origObj) origObj.set('opacity', origOpacity);
        cvs.renderAll();
        _cleanup();
        if (typeof showToast === 'function') showToast('Eraser apply failed');
        return;
      }
      newImg.set(props);
      cvs.remove(origObj);
      cvs.add(newImg);
      cvs.setActiveObject(newImg);
      cvs.renderAll();
      _cleanup();
      if (typeof snap === 'function') snap();
      if (typeof updateFloatTB === 'function') updateFloatTB();
      if (typeof showToast === 'function') showToast('Eraser applied');
    }, { crossOrigin: 'anonymous' });
  }

  /* ── Deactivate / cancel ── */
  function _deactivate() {
    if (_targetImg) {
      _targetImg.set('opacity', _targetImg._origOpacity || 1);
      var cvs = _getCvs();
      cvs.renderAll();
    }
    _cleanup();
    if (typeof showToast === 'function') showToast('Eraser cancelled');
  }

  function _cleanup() {
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    _eraserCanvas = null;
    _eraserCtx = null;
    _displayCanvas = null;
    _displayCtx = null;
    _cursorEl = null;
    _targetImg = null;
    _painting = false;
    _lastPt = null;
    _active = false;
  }
})();

// Modular skeleton hook (Faz 8) — brush-eraser is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'brush-eraser', parent: 'canvas.tools', title: 'Eraser', mount: function () {}, unmount: function () {} });
