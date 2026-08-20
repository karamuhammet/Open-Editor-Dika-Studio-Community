(function () {
  'use strict';

  var _active = false;
  var _bucketColor = '#f2ff58';
  var _floatBar = null;
  var _lockedObjs = [];

  function _getCvs() {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
      (typeof canvas !== 'undefined' ? canvas : null);
  }

  function _clearToolState() {
    document.querySelectorAll('.tools-btn').forEach(function (b) { b.classList.remove('active'); });
  }

  function _isTextType(obj) {
    return !!obj && (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox');
  }

  function _isFillableLeaf(obj) {
    if (!obj) return false;
    if (obj.excludeFromExport || obj._isPerspHandle || obj._isPerspOutline || obj._isPeHandle || obj._isPeOutline || obj._isPaintOverlay || obj._isPaintCursor || obj._isPaintSelPreview) return false;
    return _isTextType(obj) ||
      obj.type === 'rect' ||
      obj.type === 'circle' ||
      obj.type === 'ellipse' ||
      obj.type === 'triangle' ||
      obj.type === 'polygon' ||
      obj.type === 'path' ||
      obj.type === 'line' ||
      obj.type === 'polyline';
  }

  function _applyFillToObject(obj, color) {
    var applied = false;
    if (!obj) return false;
    if (obj.type === 'group' && obj._objects && obj._objects.length) {
      obj._objects.forEach(function (child) {
        if (_isFillableLeaf(child)) {
          child.set('fill', color);
          child.dirty = true;
          applied = true;
        }
      });
      if (applied) obj.dirty = true;
      return applied;
    }
    if (_isFillableLeaf(obj)) {
      obj.set('fill', color);
      obj.dirty = true;
      applied = true;
    }
    return applied;
  }

  function _syncBarColor() {
    if (!_floatBar) return;
    var btn = document.getElementById('bucket-fill-swatch');
    if (!btn) return;
    btn.dataset.color = _bucketColor;
    var dot = btn.querySelector('.bucket-fill-dot');
    if (dot) dot.style.background = _bucketColor;
  }

  function _openColorManager() {
    if (typeof switchRpTab === 'function') switchRpTab('properties');
    if (typeof openColorPanel === 'function') openColorPanel('bucketFill', _bucketColor);
  }

  function _ensureFloatBar() {
    if (_floatBar) {
      _floatBar.style.display = 'flex';
      _syncBarColor();
      return;
    }
    var bar = document.createElement('div');
    bar.className = 'bucket-float-bar';
    bar.id = 'bucket-float-bar';
    bar.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11l-6 6a2 2 0 0 1-2.83 0L4 10.83a2 2 0 0 1 0-2.83l6-6a2 2 0 0 1 2.83 0L19 8.17a2 2 0 0 1 0 2.83z"></path><path d="M2 20h20"></path><path d="M14 5l5 5"></path></svg>' +
      '<span class="bucket-float-title">Fill Bucket</span>' +
      '<button type="button" id="bucket-fill-swatch" class="bucket-fill-swatch" data-color="' + _bucketColor + '">' +
        '<span class="bucket-fill-dot"></span><span>Color</span>' +
      '</button>' +
      '<span class="bucket-float-hint">Click object or canvas</span>' +
      '<button type="button" class="bucket-float-cancel" id="bucket-fill-cancel">Cancel (Esc)</button>';
    document.body.appendChild(bar);
    _floatBar = bar;
    var swatch = document.getElementById('bucket-fill-swatch');
    if (swatch) swatch.addEventListener('click', _openColorManager);
    var cancel = document.getElementById('bucket-fill-cancel');
    if (cancel) cancel.addEventListener('click', function () {
      if (typeof deactivateFillBucketTool === 'function') deactivateFillBucketTool();
    });
    _syncBarColor();
  }

  function _hideFloatBar() {
    if (_floatBar) _floatBar.style.display = 'none';
  }

  function _lockCanvasObjects(cvs) {
    _lockedObjs = [];
    cvs.discardActiveObject();
    cvs.getObjects().forEach(function (o) {
      if (o._isPaintOverlay || o._isPaintCursor || o._isPaintSelPreview) return;
      _lockedObjs.push({ obj: o, selectable: o.selectable, evented: o.evented });
      o.set({ selectable: false, evented: true });
    });
    cvs.selection = false;
    cvs.defaultCursor = 'crosshair';
    cvs.hoverCursor = 'pointer';
    cvs.requestRenderAll();
  }

  function _unlockCanvasObjects(cvs) {
    _lockedObjs.forEach(function (entry) {
      if (!entry || !entry.obj || !entry.obj.canvas) return;
      entry.obj.set({ selectable: entry.selectable, evented: entry.evented });
    });
    _lockedObjs = [];
    cvs.selection = true;
    cvs.defaultCursor = 'default';
    cvs.hoverCursor = 'move';
    cvs.requestRenderAll();
  }

  function _applyBucketFill(opt) {
    if (!_active) return;
    var e = opt && opt.e;
    if (!e || e.button !== 0) return;
    var cvs = _getCvs();
    if (!cvs) return;
    var target = opt ? opt.target : null;
    var didApply = false;
    if (target) {
      didApply = _applyFillToObject(target, _bucketColor);
      if (didApply && typeof refreshInlineLayers === 'function') refreshInlineLayers();
      if (didApply && typeof syncRightPanel === 'function') syncRightPanel();
    } else {
      cvs.setBackgroundColor(_bucketColor, function () {
        cvs.renderAll();
      });
      didApply = true;
    }
    if (didApply) {
      cvs.requestRenderAll();
      if (typeof snap === 'function') snap();
    }
  }

  function _onKeyDown(e) {
    if (!_active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (typeof deactivateFillBucketTool === 'function') deactivateFillBucketTool();
    }
  }

  window._bucketFillToolSetColor = function (nextColor) {
    if (!nextColor) return;
    _bucketColor = nextColor;
    _syncBarColor();
  };

  window.activateFillBucketTool = function () {
    if (_active) {
      window.deactivateFillBucketTool();
      return;
    }
    if (typeof deactivateBrushTool === 'function' && typeof window._brushToolActive === 'function' && window._brushToolActive()) deactivateBrushTool();
    if (typeof deactivateSelectionTool === 'function') deactivateSelectionTool();
    if (typeof deactivatePenTool === 'function') deactivatePenTool();
    if (typeof exitCropMode === 'function') exitCropMode(false);
    if (typeof exitPerspectiveMode === 'function') exitPerspectiveMode(false);
    if (typeof exitPolygonEdit === 'function') exitPolygonEdit(false);
    var cvs = _getCvs();
    if (!cvs) return;
    _active = true;
    _lockCanvasObjects(cvs);
    cvs.on('mouse:down', _applyBucketFill);
    document.addEventListener('keydown', _onKeyDown, true);
    _clearToolState();
    var btn = document.getElementById('tool-paint-bucket');
    if (btn) btn.classList.add('active');
    var floatTB = document.getElementById('float-tb');
    if (floatTB) floatTB.classList.remove('show');
    _ensureFloatBar();
    if (typeof showToast === 'function') showToast('Fill Bucket: click an object or the canvas background');
  };

  window.deactivateFillBucketTool = function () {
    if (!_active) return;
    _active = false;
    var cvs = _getCvs();
    if (cvs) {
      cvs.off('mouse:down', _applyBucketFill);
      _unlockCanvasObjects(cvs);
    }
    document.removeEventListener('keydown', _onKeyDown, true);
    _hideFloatBar();
    _clearToolState();
  };

  window._fillBucketToolActive = function () {
    return _active;
  };
})();

// Modular skeleton hook (Faz 8) — fill-bucket is now a canvas TOOL loader module
// (modules/canvas/tools/fill-bucket/). Event-driven (activated from the toolbar), so no
// load-time init to convert — just register under the 'tools' sub-group for fault isolation.
if (window.cc && cc.modules) cc.modules.register({ id: 'fill-bucket', parent: 'canvas.tools', title: 'Fill bucket', mount: function () {}, unmount: function () {} });
