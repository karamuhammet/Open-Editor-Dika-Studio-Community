/* ═══════════════════════════════════════════════════════════════
   VE Adjustment Layer — Semi-transparent adjustment strip
   Faz 9 — Applies effects to all tracks below
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;

  var ADJUSTMENT_EFFECTS = [
    { id: 'brightness',     label: 'Brightness',      cat: 'color',  min: -100, max: 100, def: 0, unit: '%' },
    { id: 'contrast',       label: 'Contrast',        cat: 'color',  min: -100, max: 100, def: 0, unit: '%' },
    { id: 'saturation',     label: 'Saturation',      cat: 'color',  min: -100, max: 100, def: 0, unit: '%' },
    { id: 'hue',            label: 'Hue Shift',       cat: 'color',  min: -180, max: 180, def: 0, unit: '°' },
    { id: 'temperature',    label: 'Temperature',     cat: 'color',  min: -100, max: 100, def: 0, unit: '' },
    { id: 'exposure',       label: 'Exposure',        cat: 'color',  min: -3, max: 3, def: 0, step: 0.1, unit: 'EV' },
    { id: 'gamma',          label: 'Gamma',           cat: 'color',  min: 0.1, max: 3, def: 1, step: 0.1, unit: '' },
    { id: 'blur',           label: 'Gaussian Blur',   cat: 'filter', min: 0, max: 50, def: 0, unit: 'px' },
    { id: 'sharpen',        label: 'Sharpen',         cat: 'filter', min: 0, max: 100, def: 0, unit: '%' },
    { id: 'vignette',       label: 'Vignette',        cat: 'filter', min: 0, max: 100, def: 0, unit: '%' },
    { id: 'grain',          label: 'Film Grain',      cat: 'filter', min: 0, max: 100, def: 0, unit: '%' },
    { id: 'chromatic',      label: 'Chromatic Aberr.', cat: 'filter', min: 0, max: 20, def: 0, unit: 'px' },
    { id: 'sepia',          label: 'Sepia',           cat: 'tone',   min: 0, max: 100, def: 0, unit: '%' },
    { id: 'bw',             label: 'Black & White',   cat: 'tone',   min: 0, max: 100, def: 0, unit: '%' },
    { id: 'tint',           label: 'Color Tint',      cat: 'tone',   min: 0, max: 100, def: 0, unit: '%' }
  ];

  var _currentValues = {};
  var _activeLayerId = null;

  /* ═══ THE ENGINE ═══════════════════════════════════════════════════════════════════════════════
     This panel used to be a ghost: the sliders moved, and "Add Adjustment Layer" called
     `VideoEditor.addAdjustmentLayer`, which did not exist. Fifteen controls that changed nothing.

     The effects are applied HERE, in the module that defines them, so the list and its
     implementation cannot drift apart. The compositor just asks (preview-render calls
     VE._veApplyAdjustmentLayers per frame), which also means the EXPORT gets it for free: the export
     composites through the same `_veRenderPreviewFrame`.

     Pipeline order is deliberate, and it is the order a colourist works in:
       1. input pass    temperature / tint / exposure / gamma      (white balance + tone, ImageData)
       2. CSS filters   brightness / contrast / saturation / hue / sepia / b&w / blur   (GPU, 1 draw)
       3. detail pass   chromatic aberration / sharpen                                  (ImageData)
       4. overlays      grain / vignette                                                (cheap draws)

     Stage 1 MUST come before stage 2, and the first version had it backwards. White balance is an
     input correction; a creative look is applied on top of it. Reversed, `bw: 100` greyed the frame
     and then `temperature: 60` tinted the grey back to orange - measured as [164,128,92] on a
     mid-grey frame, i.e. the Black & White slider looked broken.

     Each stage is SKIPPED entirely when its inputs are at their defaults, so a layer that only
     touches brightness costs one GPU draw and no pixel walk at all. */

  var _DEFAULTS = null;
  function _defaults() {
    if (_DEFAULTS) return _DEFAULTS;
    _DEFAULTS = {};
    ADJUSTMENT_EFFECTS.forEach(function (fx) { _DEFAULTS[fx.id] = fx.def; });
    return _DEFAULTS;
  }

  /** Non-default values only. Returns null when the layer does nothing (the common early-out). */
  function _activeValues(effects) {
    if (!effects) return null;
    var d = _defaults();
    var out = null;
    for (var k in d) {
      if (!d.hasOwnProperty(k)) continue;
      var v = effects[k];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (Math.abs(v - d[k]) < 1e-6) continue;
      if (!out) out = {};
      out[k] = v;
    }
    return out;
  }

  var _buf = null, _bufCtx = null;
  function _scratch(w, h) {
    if (!_buf) { _buf = document.createElement('canvas'); _bufCtx = _buf.getContext('2d'); }
    if (_buf.width !== w) _buf.width = w;
    if (_buf.height !== h) _buf.height = h;
    return _buf;
  }

  /** Stage 1: the filters the browser can do on the GPU, in one composite draw. */
  function _cssFilter(v) {
    var parts = [];
    if (v.brightness != null) parts.push('brightness(' + (100 + v.brightness) + '%)');
    if (v.contrast != null) parts.push('contrast(' + (100 + v.contrast) + '%)');
    if (v.saturation != null) parts.push('saturate(' + (100 + v.saturation) + '%)');
    if (v.hue != null) parts.push('hue-rotate(' + v.hue + 'deg)');
    if (v.sepia != null) parts.push('sepia(' + v.sepia + '%)');
    if (v.bw != null) parts.push('grayscale(' + v.bw + '%)');
    if (v.blur != null && v.blur > 0) parts.push('blur(' + v.blur + 'px)');
    return parts.length ? parts.join(' ') : null;
  }

  /**
   * Apply one adjustment layer's effects to a whole canvas, in place.
   * `ctx` is the destination 2D context, `w`/`h` its pixel size.
   */
  function applyToCanvas(ctx, effects, w, h) {
    var v = _activeValues(effects);
    if (!v || !ctx || w <= 0 || h <= 0) return false;

    // ── 1. input pass: white balance + tone, BEFORE any creative look ──
    var expMul = v.exposure != null ? Math.pow(2, v.exposure) : 1;
    var invGamma = (v.gamma != null && v.gamma > 0) ? 1 / v.gamma : 1;
    var temp = v.temperature != null ? v.temperature * 0.6 : 0;   // +warm / -cool, in 0-255 units
    var tint = v.tint != null ? v.tint * 0.4 : 0;                 // magenta lift (R+B up, G down)
    if (expMul !== 1 || invGamma !== 1 || temp !== 0 || tint !== 0) {
      _pixels(ctx, w, h, function (d) {
        // 256-entry LUT for the channel-independent part: one pow() per level, not per pixel.
        var lut = new Uint8ClampedArray(256);
        for (var n = 0; n < 256; n++) {
          var t = (n / 255) * expMul;
          if (invGamma !== 1) t = Math.pow(t < 0 ? 0 : t, invGamma);
          lut[n] = t * 255;
        }
        for (var p = 0; p < d.length; p += 4) {
          var r = lut[d[p]], g = lut[d[p + 1]], b = lut[d[p + 2]];
          if (temp !== 0) { r += temp; b -= temp; }
          if (tint !== 0) { r += tint * 0.5; b += tint * 0.5; g -= tint * 0.5; }
          d[p] = r; d[p + 1] = g; d[p + 2] = b;
        }
      });
    }

    // ── 2. the creative look, on the GPU in one composite draw ──
    var filter = _cssFilter(v);
    if (filter) {
      var buf = _scratch(w, h);
      _bufCtx.setTransform(1, 0, 0, 1, 0, 0);
      _bufCtx.filter = 'none';
      _bufCtx.clearRect(0, 0, w, h);
      _bufCtx.drawImage(ctx.canvas, 0, 0);
      var prevFilter = ctx.filter;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.filter = filter;
      ctx.drawImage(buf, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
      ctx.filter = prevFilter;
    }

    // ── 3. detail: chromatic aberration then sharpen, both read a pre-pass copy ──
    var chroma = (v.chromatic != null && v.chromatic > 0) ? Math.round(v.chromatic) : 0;
    var sharpen = (v.sharpen != null && v.sharpen > 0) ? v.sharpen / 100 : 0;
    if (chroma || sharpen) {
      _pixels(ctx, w, h, function (d) {
        if (chroma) {
          var src = new Uint8ClampedArray(d);
          for (var y = 0; y < h; y++) {
            var row = y * w;
            for (var x = 0; x < w; x++) {
              var i = (row + x) * 4;
              var xr = x - chroma; if (xr < 0) xr = 0;
              var xb = x + chroma; if (xb >= w) xb = w - 1;
              d[i] = src[(row + xr) * 4];
              d[i + 2] = src[(row + xb) * 4 + 2];
            }
          }
        }
        if (sharpen) {
          // Unsharp mask against the post-chromatic pixels, so the two do not fight.
          var base = new Uint8ClampedArray(d);
          for (var sy = 1; sy < h - 1; sy++) {
            for (var sx = 1; sx < w - 1; sx++) {
              var si = (sy * w + sx) * 4;
              for (var c = 0; c < 3; c++) {
                var centre = base[si + c];
                var around = base[si - 4 + c] + base[si + 4 + c] +
                             base[si - w * 4 + c] + base[si + w * 4 + c];
                d[si + c] = centre + sharpen * (centre * 4 - around);
              }
            }
          }
        }
      });
    }

    // ── 4. overlays ──
    if (v.grain != null && v.grain > 0) {
      var gBuf = _grainTile();
      if (gBuf) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = Math.min(0.6, v.grain / 100 * 0.5);
        ctx.globalCompositeOperation = 'overlay';
        var pat = ctx.createPattern(gBuf, 'repeat');
        if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h); }
        ctx.restore();
      }
    }
    if (v.vignette != null && v.vignette > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var cx = w / 2, cy = h / 2;
      var outer = Math.sqrt(cx * cx + cy * cy);
      var grad = ctx.createRadialGradient(cx, cy, outer * 0.35, cx, cy, outer);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,' + (v.vignette / 100 * 0.85).toFixed(3) + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    return true;
  }

  /* One getImageData/putImageData round trip. A tainted canvas (cross-origin media with no CORS)
     cannot be read at all: the GPU stages still applied, so warn once and carry on rather than
     failing the whole frame. */
  function _pixels(ctx, w, h, fn) {
    try {
      var img = ctx.getImageData(0, 0, w, h);
      fn(img.data);
      ctx.putImageData(img, 0, 0);
    } catch (e) {
      if (!_pixels._warned) {
        _pixels._warned = true;
        console.warn('[VEAdjustmentLayer] pixel effects skipped (canvas is not readable):', e && e.message);
      }
    }
  }

  /* One 128x128 noise tile, generated once and tiled. Regenerating noise per frame would make the
     grain crawl at the render rate rather than the footage rate, and cost a full-frame random walk. */
  var _grain = null;
  function _grainTile() {
    if (_grain) return _grain;
    var t = document.createElement('canvas');
    t.width = 128; t.height = 128;
    var tc = t.getContext('2d');
    var im = tc.createImageData(128, 128);
    for (var i = 0; i < im.data.length; i += 4) {
      var n = 110 + Math.random() * 36;
      im.data[i] = n; im.data[i + 1] = n; im.data[i + 2] = n; im.data[i + 3] = 255;
    }
    tc.putImageData(im, 0, 0);
    _grain = t;
    return _grain;
  }

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  function _resetValues() {
    _currentValues = {};
    ADJUSTMENT_EFFECTS.forEach(function(fx) { _currentValues[fx.id] = fx.def; });
  }
  _resetValues();

  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-adjustment-layer';
    _panel.style.cssText = 'position:fixed;top:80px;right:60px;width:280px;max-height:560px;' +
      'background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);border-radius:10px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.55);z-index:10050;display:none;flex-direction:column;overflow:hidden;';

    var html = '';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border,#27272d);">' +
      '<span style="color:var(--text,#ededf0);font-weight:600;font-size:13px;">' + _icon('layers', 16) + ' Adjustment Layer</span>' +
      '<button id="ve-adj-close" style="background:none;border:none;color:var(--text-dim,#888);cursor:pointer;font-size:16px;">✕</button></div>';

    // Add layer button
    html += '<div style="padding:8px 14px;border-bottom:1px solid var(--border,#27272d);display:flex;gap:6px;">' +
      '<button id="ve-adj-add" style="flex:1;padding:6px;border-radius:6px;border:none;font-size:11px;cursor:pointer;' +
      'background:linear-gradient(135deg,#9b59b6,#e67e22);color:#fff;font-weight:600;">' + _icon('plus', 12) + ' Add Adjustment Layer</button>' +
      '<button id="ve-adj-reset" style="padding:6px 10px;border-radius:6px;border:none;font-size:10px;cursor:pointer;' +
      'background:var(--surface3,#232328);color:var(--text-dim,#888);">Reset All</button></div>';

    // Effects sliders
    var cats = { color: 'Color', filter: 'Filter', tone: 'Tone Map' };
    Object.keys(cats).forEach(function(cat) {
      html += '<div style="padding:6px 14px 2px;"><span style="color:var(--text-dim,#888);font-size:10px;text-transform:uppercase;letter-spacing:1px;">' + cats[cat] + '</span></div>';
      ADJUSTMENT_EFFECTS.filter(function(fx) { return fx.cat === cat; }).forEach(function(fx) {
        var step = fx.step || 1;
        html += '<div style="padding:2px 14px;display:flex;align-items:center;gap:6px;">' +
          '<label style="color:var(--text,#ededf0);font-size:10px;min-width:90px;">' + fx.label + '</label>' +
          '<input type="range" class="ve-adj-slider" data-fx="' + fx.id + '" min="' + fx.min + '" max="' + fx.max + '" step="' + step + '" value="' + fx.def + '" ' +
          'style="flex:1;height:4px;accent-color:var(--gold,#f2ff58);">' +
          '<span class="ve-adj-val" data-fx="' + fx.id + '" style="color:var(--gold,#f2ff58);font-size:10px;min-width:40px;text-align:right;">' + fx.def + fx.unit + '</span></div>';
      });
    });

    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    _panel.querySelector('#ve-adj-close').addEventListener('click', _hide);
    _panel.querySelector('#ve-adj-add').addEventListener('click', _addAdjustmentLayer);
    _panel.querySelector('#ve-adj-reset').addEventListener('click', function() {
      _resetValues();
      _syncSlidersToValues();
      _applyEffects();
    });

    // Slider changes
    _panel.querySelectorAll('.ve-adj-slider').forEach(function(slider) {
      slider.addEventListener('input', function() {
        var fxId = this.dataset.fx;
        var val = parseFloat(this.value);
        _currentValues[fxId] = val;
        var fx = ADJUSTMENT_EFFECTS.find(function(f) { return f.id === fxId; });
        var label = _panel.querySelector('.ve-adj-val[data-fx="' + fxId + '"]');
        if (label && fx) label.textContent = val + (fx.unit || '');
        _applyEffects();
      });
    });

    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  function _syncSlidersToValues() {
    if (!_panel) return;
    _panel.querySelectorAll('.ve-adj-slider').forEach(function(slider) {
      var fxId = slider.dataset.fx;
      slider.value = _currentValues[fxId] || 0;
      var fx = ADJUSTMENT_EFFECTS.find(function(f) { return f.id === fxId; });
      var label = _panel.querySelector('.ve-adj-val[data-fx="' + fxId + '"]');
      if (label && fx) label.textContent = (_currentValues[fxId] || 0) + (fx.unit || '');
    });
  }

  function _addAdjustmentLayer() {
    if (typeof VideoEditor === 'undefined' || !VideoEditor.addAdjustmentLayer) {
      if (typeof showToast === 'function') showToast('Open the video editor first', 'error');
      return;
    }
    _activeLayerId = VideoEditor.addAdjustmentLayer({
      label: 'Adjustment',
      color: '#9b59b6',
      effects: JSON.parse(JSON.stringify(_currentValues)),
      opacity: 1
    });
  }

  function _applyEffects() {
    if (!_activeLayerId) return;
    if (typeof VideoEditor !== 'undefined' && VideoEditor.updateAdjustmentLayer) {
      VideoEditor.updateAdjustmentLayer(_activeLayerId, {
        effects: JSON.parse(JSON.stringify(_currentValues))
      });
    }
  }

  function _show() { _buildPanel().style.display = 'flex'; _isOpen = true; }
  function _hide() { if (_panel) _panel.style.display = 'none'; _isOpen = false; }
  function _toggle() { _isOpen ? _hide() : _show(); }

  window.VEAdjustmentLayer = {
    show: _show, hide: _hide, toggle: _toggle,
    isOpen: function() { return _isOpen; },
    EFFECTS: ADJUSTMENT_EFFECTS,
    getValues: function() { return JSON.parse(JSON.stringify(_currentValues)); },
    setActiveLayer: function(id) {
      _activeLayerId = id;
      // Selecting an existing layer must load ITS values, or the next slider move silently
      // overwrites them with whatever the panel happened to be showing.
      var clip = id && VE_findClip(id);
      if (clip && clip.effects) {
        _currentValues = JSON.parse(JSON.stringify(clip.effects));
        _syncSlidersToValues();
      }
    },
    applyToCanvas: applyToCanvas
  };

  function VE_findClip(id) {
    var VE = window.__ccVideoEditor;
    return (VE && VE._findClipById) ? VE._findClipById(id) : null;
  }
})();

// Modular skeleton hook (Faz 8) — ve-adjustment-layer is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-adjustment-layer', parent: 'video', title: 've-adjustment-layer', mount: function () {}, unmount: function () {} });
