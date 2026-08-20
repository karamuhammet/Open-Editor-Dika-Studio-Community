/* ============================================================
   dika studio – Image filters (Fabric.js filter chain)
   Depends on: fabric, app.js (getActiveCanvas, snap, syncRightPanel)
   ============================================================ */

(function () {
  function getImageObj() {
    var c = typeof getActiveCanvas === 'function' ? getActiveCanvas() : null;
    if (!c) return null;
    var o = c.getActiveObject();
    if (!o || !(typeof _isCanvasMediaObject === 'function' ? _isCanvasMediaObject(o) : (o.type === 'image' && !o.isQR))) return null;
    return o;
  }

  function isVideoObj(obj) {
    return !!(typeof _isCanvasVideoObject === 'function' && _isCanvasVideoObject(obj));
  }

  function findFilterByType(filters, type) {
    if (!filters || !filters.length) return null;
    for (var i = 0; i < filters.length; i++) {
      if (filters[i] && filters[i].type === type) return filters[i];
    }
    return null;
  }

  function detectPreset(filters) {
    if (findFilterByType(filters, 'Grayscale')) return 'grayscale';
    if (findFilterByType(filters, 'Sepia')) return 'sepia';
    if (findFilterByType(filters, 'Invert')) return 'invert';
    return 'none';
  }

  function readSliderFromFilters(filters) {
    var b = findFilterByType(filters, 'Brightness');
    var c = findFilterByType(filters, 'Contrast');
    var s = findFilterByType(filters, 'Saturation');
    var bl = findFilterByType(filters, 'Blur');
    return {
      brightness: b && b.brightness != null ? Math.round(Number(b.brightness) * 100) : 0,
      contrast: c && c.contrast != null ? Math.round(Number(c.contrast) * 100) : 0,
      saturation: s && s.saturation != null ? Math.round(Number(s.saturation) * 100) : 0,
      blur: bl && bl.blur != null ? Number(bl.blur) : 0,
    };
  }

  function roundBlurStep(v) {
    return Math.round(v / 0.05) * 0.05;
  }

  function buildFilters(brightness, contrast, saturation, blur, preset) {
    var list = [];
    var b = Math.max(-100, Math.min(100, brightness)) / 100;
    var c = Math.max(-100, Math.min(100, contrast)) / 100;
    var s = Math.max(-100, Math.min(100, saturation)) / 100;
    var bl = Math.max(0, Math.min(1, roundBlurStep(blur)));

    /* Only add non-zero adjustment filters to avoid unnecessary processing */
    if (b !== 0) list.push(new fabric.Image.filters.Brightness({ brightness: b }));
    if (c !== 0) list.push(new fabric.Image.filters.Contrast({ contrast: c }));
    if (s !== 0) list.push(new fabric.Image.filters.Saturation({ saturation: s }));

    if (preset === 'grayscale') list.push(new fabric.Image.filters.Grayscale());
    else if (preset === 'sepia') list.push(new fabric.Image.filters.Sepia());
    else if (preset === 'invert') list.push(new fabric.Image.filters.Invert());

    if (bl > 0) list.push(new fabric.Image.filters.Blur({ blur: bl }));
    return list;
  }
  // Shared so the right-panel "Effects" dropdown builds the SAME proven filter chain
  // (brightness/contrast/saturation/preset/blur) for the page background image.
  window._ccBuildImgFilters = buildFilters;

  function applyFiltersFromUI() {
    var o = getImageObj();
    if (!o) return;
    var elB = document.getElementById('if-brightness');
    var elC = document.getElementById('if-contrast');
    var elS = document.getElementById('if-saturation');
    var elBl = document.getElementById('if-blur');
    var preset = window.__ifPreset || 'none';

    var brightness = elB ? parseInt(elB.value, 10) : 0;
    var contrast = elC ? parseInt(elC.value, 10) : 0;
    var saturation = elS ? parseInt(elS.value, 10) : 0;
    var blur = elBl ? parseFloat(elBl.value) : 0;

    if (isVideoObj(o)) {
      o._videoFxPreset = preset;
      o._videoFxBrightness = brightness;
      o._videoFxContrast = contrast;
      o._videoFxSaturation = saturation;
      o._videoFxBlur = blur;
      o.filters = [];
    } else if (
      brightness === 0 &&
      contrast === 0 &&
      saturation === 0 &&
      (blur === 0 || blur < 0.0001) &&
      preset === 'none'
    ) {
      o.filters = [];
    } else {
      o.filters = buildFilters(brightness, contrast, saturation, blur, preset);
    }

    /* Ensure the image element has not been tainted / lost */
    if (!o._originalElement && o._element) {
      o._originalElement = o._element;
    }

    if (!isVideoObj(o)) {
      try {
        o.applyFilters();
      } catch(err) {
        /* If WebGL filter fails, try falling back */
        try {
          fabric.filterBackend = new fabric.Canvas2dFilterBackend();
          o.applyFilters();
        } catch(e2) { /* silent */ }
      }
    }
    o.dirty = true;
    var c = getActiveCanvas();
    if (c) { c.requestRenderAll(); }
  }

  window.syncImageFilters = function (obj) {
    if (!obj || !(typeof _isCanvasMediaObject === 'function' ? _isCanvasMediaObject(obj) : (obj.type === 'image' && !obj.isQR))) return;

    var vals;
    var preset;
    if (isVideoObj(obj)) {
      vals = {
        brightness: Number(obj._videoFxBrightness) || 0,
        contrast: Number(obj._videoFxContrast) || 0,
        saturation: Number(obj._videoFxSaturation) || 0,
        blur: Number(obj._videoFxBlur) || 0
      };
      preset = obj._videoFxPreset || 'none';
    } else {
      var filters = obj.filters || [];
      vals = readSliderFromFilters(filters);
      preset = detectPreset(filters);
    }
    window.__ifPreset = preset;

    var elB = document.getElementById('if-brightness');
    var elC = document.getElementById('if-contrast');
    var elS = document.getElementById('if-saturation');
    var elBl = document.getElementById('if-blur');
    var vb = document.getElementById('if-brightness-val');
    var vc = document.getElementById('if-contrast-val');
    var vs = document.getElementById('if-saturation-val');
    var vbl = document.getElementById('if-blur-val');

    if (elB) elB.value = vals.brightness;
    if (elC) elC.value = vals.contrast;
    if (elS) elS.value = vals.saturation;
    if (elBl) elBl.value = String(roundBlurStep(vals.blur));

    if (vb) vb.textContent = String(vals.brightness);
    if (vc) vc.textContent = String(vals.contrast);
    if (vs) vs.textContent = String(vals.saturation);
    if (vbl) vbl.textContent = String(roundBlurStep(vals.blur));

    var pg = document.getElementById('if-preset-gray');
    var ps = document.getElementById('if-preset-sepia');
    var pi = document.getElementById('if-preset-invert');
    var pn = document.getElementById('if-preset-none');
    if (pg) pg.classList.toggle('on', preset === 'grayscale');
    if (ps) ps.classList.toggle('on', preset === 'sepia');
    if (pi) pi.classList.toggle('on', preset === 'invert');
    if (pn) pn.classList.toggle('on', preset === 'none');
  };

  window.initImageFilters = function initImageFilters() {
    var rpImage = document.getElementById('rp-image');
    if (!rpImage) return;

    // Insert before the actions block (last prop-block with del-btn)
    var delBtn = rpImage.querySelector('.del-btn');
    var actionsBlock = delBtn && delBtn.closest('.prop-block');
    if (!actionsBlock) return;

    var block = document.createElement('div');
    block.className = 'rp-accordion';
    block.id = 'rp-image-filters';
    block.innerHTML =
      '<div class="rp-accordion-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
        '<span class="rp-accordion-title">Filters</span>' +
        '<span class="rp-accordion-arrow">▼</span>' +
      '</div>' +
      '<div class="rp-accordion-body">' +
        '<div class="prow" style="flex-direction:column;align-items:flex-start;gap:5px">' +
          '<span class="plabel">Brightness <span id="if-brightness-val" style="color:var(--gold)">0</span></span>' +
          '<input type="range" id="if-brightness" min="-100" max="100" value="0" style="width:100%;accent-color:var(--gold)">' +
        '</div>' +
        '<div class="prow" style="flex-direction:column;align-items:flex-start;gap:5px">' +
          '<span class="plabel">Contrast <span id="if-contrast-val" style="color:var(--gold)">0</span></span>' +
          '<input type="range" id="if-contrast" min="-100" max="100" value="0" style="width:100%;accent-color:var(--gold)">' +
        '</div>' +
        '<div class="prow" style="flex-direction:column;align-items:flex-start;gap:5px">' +
          '<span class="plabel">Saturation <span id="if-saturation-val" style="color:var(--gold)">0</span></span>' +
          '<input type="range" id="if-saturation" min="-100" max="100" value="0" style="width:100%;accent-color:var(--gold)">' +
        '</div>' +
        '<div class="prow" style="flex-direction:column;align-items:flex-start;gap:5px">' +
          '<span class="plabel">Blur <span id="if-blur-val" style="color:var(--gold)">0</span></span>' +
          '<input type="range" id="if-blur" min="0" max="1" step="0.05" value="0" style="width:100%;accent-color:var(--gold)">' +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">' +
          '<button type="button" class="sbtn" id="if-preset-gray" style="flex:1;padding:7px 0;font-size:11px;text-align:center">Grayscale</button>' +
          '<button type="button" class="sbtn" id="if-preset-sepia" style="flex:1;padding:7px 0;font-size:11px;text-align:center">Sepia</button>' +
          '<button type="button" class="sbtn" id="if-preset-invert" style="flex:1;padding:7px 0;font-size:11px;text-align:center">Invert</button>' +
        '</div>' +
        '<button type="button" class="sbtn" id="if-preset-none" style="width:100%;padding:7px 0;font-size:11px;text-align:center;margin-top:4px;border:1px solid var(--gold);color:var(--gold)">Reset All</button>' +
      '</div>';

    actionsBlock.parentNode.insertBefore(block, actionsBlock);

    window.__ifPreset = 'none';

    function bindRange(id, valId, isFloat) {
      var el = document.getElementById(id);
      var vEl = document.getElementById(valId);
      if (!el) return;
      el.oninput = function () {
        var disp = isFloat ? String(roundBlurStep(parseFloat(el.value))) : el.value;
        if (vEl) vEl.textContent = disp;
        applyFiltersFromUI();
      };
      el.onchange = function () {
        if (typeof snap === 'function') snap();
      };
    }

    bindRange('if-brightness', 'if-brightness-val', false);
    bindRange('if-contrast', 'if-contrast-val', false);
    bindRange('if-saturation', 'if-saturation-val', false);
    bindRange('if-blur', 'if-blur-val', true);

    function setPreset(p) {
      window.__ifPreset = p;
      var pg = document.getElementById('if-preset-gray');
      var ps = document.getElementById('if-preset-sepia');
      var pi = document.getElementById('if-preset-invert');
      var pn = document.getElementById('if-preset-none');
      if (pg) pg.classList.toggle('on', p === 'grayscale');
      if (ps) ps.classList.toggle('on', p === 'sepia');
      if (pi) pi.classList.toggle('on', p === 'invert');
      if (pn) pn.classList.toggle('on', p === 'none');
      applyFiltersFromUI();
      if (typeof snap === 'function') snap();
    }

    var pg = document.getElementById('if-preset-gray');
    var ps = document.getElementById('if-preset-sepia');
    var pi = document.getElementById('if-preset-invert');
    var pn = document.getElementById('if-preset-none');
    if (pg) pg.onclick = function () {
      setPreset('grayscale');
    };
    if (ps) ps.onclick = function () {
      setPreset('sepia');
    };
    if (pi) pi.onclick = function () {
      setPreset('invert');
    };
    if (pn) {
      pn.onclick = function () {
        window.__ifPreset = 'none';
        var elB = document.getElementById('if-brightness');
        var elC = document.getElementById('if-contrast');
        var elS = document.getElementById('if-saturation');
        var elBl = document.getElementById('if-blur');
        if (elB) elB.value = '0';
        if (elC) elC.value = '0';
        if (elS) elS.value = '0';
        if (elBl) elBl.value = '0';
        var vb = document.getElementById('if-brightness-val');
        var vc = document.getElementById('if-contrast-val');
        var vs = document.getElementById('if-saturation-val');
        var vbl = document.getElementById('if-blur-val');
        if (vb) vb.textContent = '0';
        if (vc) vc.textContent = '0';
        if (vs) vs.textContent = '0';
        if (vbl) vbl.textContent = '0';
        if (pg) pg.classList.remove('on');
        if (ps) ps.classList.remove('on');
        if (pi) pi.classList.remove('on');
        if (pn) pn.classList.add('on');
        var o = getImageObj();
        if (o) {
          if (isVideoObj(o)) {
            o._videoFxPreset = 'none';
            o._videoFxBrightness = 0;
            o._videoFxContrast = 0;
            o._videoFxSaturation = 0;
            o._videoFxBlur = 0;
            o.filters = [];
          } else {
            o.filters = [];
            o.applyFilters();
          }
          o.dirty = true;
          var c2 = getActiveCanvas();
          if (c2) { c2.requestRenderAll(); }
        }
        if (typeof snap === 'function') snap();
      };
    }

    if (typeof syncRightPanel === 'function') {
      var _prevSync = syncRightPanel;
      syncRightPanel = function () {
        _prevSync.apply(null, arguments);
        var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : null;
        if (!cvs) return;
        var obj = cvs.getActiveObject();
        if (obj && (typeof _isCanvasMediaObject === 'function' ? _isCanvasMediaObject(obj) : (obj.type === 'image' && !obj.isQR))) {
          window.syncImageFilters(obj);
        }
      };
    }
  };

  /* ============================================================
     Background Image Effects
     Applies Fabric.js filters to canvas.backgroundImage
     ============================================================ */

  var _bgfPreset = 'none';

  function _bgfGetBgImage() {
    var c = typeof getActiveCanvas === 'function' ? getActiveCanvas() : null;
    if (!c || !c.backgroundImage) return null;
    return c.backgroundImage;
  }

  function _bgfBuildFilters(brightness, contrast, saturation, blur, preset) {
    return buildFilters(brightness, contrast, saturation, blur, preset);
  }

  function _bgfApply() {
    var bg = _bgfGetBgImage();
    if (!bg) return;
    var elB = document.getElementById('bgf-brightness');
    var elC = document.getElementById('bgf-contrast');
    var elS = document.getElementById('bgf-saturation');
    var elBl = document.getElementById('bgf-blur');

    var brightness = elB ? parseInt(elB.value, 10) : 0;
    var contrast = elC ? parseInt(elC.value, 10) : 0;
    var saturation = elS ? parseInt(elS.value, 10) : 0;
    var blur = elBl ? parseFloat(elBl.value) : 0;

    if (brightness === 0 && contrast === 0 && saturation === 0 && (blur === 0 || blur < 0.0001) && _bgfPreset === 'none') {
      bg.filters = [];
    } else {
      bg.filters = _bgfBuildFilters(brightness, contrast, saturation, blur, _bgfPreset);
    }

    if (!bg._originalElement && bg._element) {
      bg._originalElement = bg._element;
    }

    try {
      bg.applyFilters();
    } catch(err) {
      try {
        fabric.filterBackend = new fabric.Canvas2dFilterBackend();
        bg.applyFilters();
      } catch(e2) { /* silent */ }
    }
    var c = typeof getActiveCanvas === 'function' ? getActiveCanvas() : null;
    if (c) c.requestRenderAll();
  }

  function _bgfSyncUI() {
    var bg = _bgfGetBgImage();
    if (!bg) return;
    var filters = bg.filters || [];
    var vals = readSliderFromFilters(filters);
    var preset = detectPreset(filters);
    _bgfPreset = preset;

    var elB = document.getElementById('bgf-brightness');
    var elC = document.getElementById('bgf-contrast');
    var elS = document.getElementById('bgf-saturation');
    var elBl = document.getElementById('bgf-blur');
    var vb = document.getElementById('bgf-brightness-val');
    var vc = document.getElementById('bgf-contrast-val');
    var vs = document.getElementById('bgf-saturation-val');
    var vbl = document.getElementById('bgf-blur-val');

    if (elB) elB.value = vals.brightness;
    if (elC) elC.value = vals.contrast;
    if (elS) elS.value = vals.saturation;
    if (elBl) elBl.value = String(roundBlurStep(vals.blur));
    if (vb) vb.textContent = String(vals.brightness);
    if (vc) vc.textContent = String(vals.contrast);
    if (vs) vs.textContent = String(vals.saturation);
    if (vbl) vbl.textContent = String(roundBlurStep(vals.blur));

    var pg = document.getElementById('bgf-preset-gray');
    var ps = document.getElementById('bgf-preset-sepia');
    var pi = document.getElementById('bgf-preset-invert');
    if (pg) pg.classList.toggle('on', preset === 'grayscale');
    if (ps) ps.classList.toggle('on', preset === 'sepia');
    if (pi) pi.classList.toggle('on', preset === 'invert');
  }

  window.initBgEffects = function () {
    function bindBgRange(id, valId, isFloat) {
      var el = document.getElementById(id);
      var vEl = document.getElementById(valId);
      if (!el) return;
      el.oninput = function () {
        var disp = isFloat ? String(roundBlurStep(parseFloat(el.value))) : el.value;
        if (vEl) vEl.textContent = disp;
        _bgfApply();
      };
      el.onchange = function () {
        if (typeof snap === 'function') snap();
      };
    }

    bindBgRange('bgf-brightness', 'bgf-brightness-val', false);
    bindBgRange('bgf-contrast', 'bgf-contrast-val', false);
    bindBgRange('bgf-saturation', 'bgf-saturation-val', false);
    bindBgRange('bgf-blur', 'bgf-blur-val', true);

    function setBgPreset(p) {
      _bgfPreset = p;
      var pg = document.getElementById('bgf-preset-gray');
      var ps = document.getElementById('bgf-preset-sepia');
      var pi = document.getElementById('bgf-preset-invert');
      if (pg) pg.classList.toggle('on', p === 'grayscale');
      if (ps) ps.classList.toggle('on', p === 'sepia');
      if (pi) pi.classList.toggle('on', p === 'invert');
      _bgfApply();
      if (typeof snap === 'function') snap();
    }

    var pg = document.getElementById('bgf-preset-gray');
    var ps = document.getElementById('bgf-preset-sepia');
    var pi = document.getElementById('bgf-preset-invert');
    var rst = document.getElementById('bgf-reset');

    if (pg) pg.onclick = function () { setBgPreset('grayscale'); };
    if (ps) ps.onclick = function () { setBgPreset('sepia'); };
    if (pi) pi.onclick = function () { setBgPreset('invert'); };
    if (rst) rst.onclick = function () {
      _bgfPreset = 'none';
      var ids = ['bgf-brightness', 'bgf-contrast', 'bgf-saturation', 'bgf-blur'];
      var valIds = ['bgf-brightness-val', 'bgf-contrast-val', 'bgf-saturation-val', 'bgf-blur-val'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        var vEl = document.getElementById(valIds[i]);
        if (el) el.value = i === 3 ? '0' : '0';
        if (vEl) vEl.textContent = '0';
      }
      if (pg) pg.classList.remove('on');
      if (ps) ps.classList.remove('on');
      if (pi) pi.classList.remove('on');
      var bg = _bgfGetBgImage();
      if (bg) {
        bg.filters = [];
        try { bg.applyFilters(); } catch(e) { /* silent */ }
        var c2 = typeof getActiveCanvas === 'function' ? getActiveCanvas() : null;
        if (c2) c2.requestRenderAll();
      }
      if (typeof snap === 'function') snap();
    };
  };

  /** Show/hide BG effects panel based on whether a background image exists */
  window.syncBgEffectsPanel = function () {
    var panel = document.getElementById('rp-bg-effects');
    if (!panel) return;
    var c = typeof getActiveCanvas === 'function' ? getActiveCanvas() : null;
    var obj = c ? c.getActiveObject() : null;
    if (!obj && c && c.backgroundImage) {
      panel.style.display = '';
      _bgfSyncUI();
    } else {
      panel.style.display = 'none';
    }
  };
})();

// Faz 8: canvas module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
function _imgFiltersBoot() { if (typeof initImageFilters === 'function') initImageFilters(); if (typeof initBgEffects === 'function') initBgEffects(); }
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('canvas.image-filters', _imgFiltersBoot); });
else document.addEventListener('DOMContentLoaded', _imgFiltersBoot);

// Modular skeleton hook (Faz 8) — image-filters is now a canvas subsystem loader module (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'image-filters', parent: 'canvas', title: 'Image filters', mount: function () {}, unmount: function () {} });
