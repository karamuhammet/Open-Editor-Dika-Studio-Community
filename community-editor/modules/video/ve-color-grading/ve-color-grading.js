// ═══════════════════════════════════════════════════════════════
//  VE-COLOR-GRADING  —  Professional Color Correction (Phase 14)
//  Curves, levels, color wheels, LUT, presets
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── LUT (1D lookup table for curves) ──
  // Generated from curve control points via cubic spline interpolation
  function _buildLUT(points) {
    // points: [{x, y}, ...] sorted by x, range 0–255
    // Returns Uint8Array[256]
    var lut = new Uint8Array(256);
    if (!points || points.length < 2) {
      for (var i = 0; i < 256; i++) lut[i] = i;
      return lut;
    }

    // Sort by x
    var sorted = points.slice().sort(function(a, b) { return a.x - b.x; });

    // Linear interpolation between control points
    for (var i = 0; i < 256; i++) {
      // Find surrounding points
      var lo = sorted[0], hi = sorted[sorted.length - 1];
      for (var j = 0; j < sorted.length - 1; j++) {
        if (i >= sorted[j].x && i <= sorted[j + 1].x) {
          lo = sorted[j];
          hi = sorted[j + 1];
          break;
        }
      }
      if (i <= lo.x) { lut[i] = Math.max(0, Math.min(255, Math.round(lo.y))); continue; }
      if (i >= hi.x) { lut[i] = Math.max(0, Math.min(255, Math.round(hi.y))); continue; }

      var t = (hi.x - lo.x) > 0 ? (i - lo.x) / (hi.x - lo.x) : 0;
      // Smooth step for better curve feel
      t = t * t * (3 - 2 * t);
      var val = lo.y + (hi.y - lo.y) * t;
      lut[i] = Math.max(0, Math.min(255, Math.round(val)));
    }
    return lut;
  }

  // ── Default identity curve ──
  var IDENTITY_POINTS = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

  // ── Color Grading data structure ──
  // clip.colorGrading = {
  //   enabled: true,
  //   curves: { rgb: [{x,y}...], r: [...], g: [...], b: [...] },
  //   levels: { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 },
  //   wheels: { shadows: {r:0,g:0,b:0}, midtones: {r:0,g:0,b:0}, highlights: {r:0,g:0,b:0} },
  //   preset: null
  // }

  // ── Presets ──
  var PRESETS = {
    'none': null,
    'cinematic-warm': {
      curves: { rgb: IDENTITY_POINTS, r: [{x:0,y:10},{x:128,y:140},{x:255,y:255}], g: IDENTITY_POINTS, b: [{x:0,y:0},{x:128,y:115},{x:255,y:235}] },
      levels: { inBlack: 10, inWhite: 245, gamma: 1.1, outBlack: 5, outWhite: 250 }
    },
    'cold-blue': {
      curves: { rgb: IDENTITY_POINTS, r: [{x:0,y:0},{x:128,y:118},{x:255,y:240}], g: IDENTITY_POINTS, b: [{x:0,y:15},{x:128,y:145},{x:255,y:255}] },
      levels: { inBlack: 5, inWhite: 250, gamma: 0.95, outBlack: 0, outWhite: 255 }
    },
    'vintage': {
      curves: { rgb: [{x:0,y:20},{x:128,y:138},{x:255,y:235}], r: [{x:0,y:10},{x:128,y:135},{x:255,y:245}], g: [{x:0,y:5},{x:128,y:125},{x:255,y:240}], b: [{x:0,y:15},{x:128,y:120},{x:255,y:220}] },
      levels: { inBlack: 15, inWhite: 240, gamma: 1.05, outBlack: 10, outWhite: 245 }
    },
    'bw': {
      curves: { rgb: [{x:0,y:0},{x:64,y:50},{x:192,y:210},{x:255,y:255}], r: IDENTITY_POINTS, g: IDENTITY_POINTS, b: IDENTITY_POINTS },
      desaturate: true,
      levels: { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 }
    },
    'sepia': {
      curves: { rgb: IDENTITY_POINTS, r: [{x:0,y:10},{x:128,y:148},{x:255,y:255}], g: [{x:0,y:5},{x:128,y:128},{x:255,y:235}], b: [{x:0,y:0},{x:128,y:100},{x:255,y:200}] },
      desaturate: true,
      levels: { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 }
    },
    'high-contrast': {
      curves: { rgb: [{x:0,y:0},{x:64,y:20},{x:192,y:235},{x:255,y:255}], r: IDENTITY_POINTS, g: IDENTITY_POINTS, b: IDENTITY_POINTS },
      levels: { inBlack: 20, inWhite: 235, gamma: 1.0, outBlack: 0, outWhite: 255 }
    },
    'low-contrast': {
      curves: { rgb: [{x:0,y:30},{x:128,y:128},{x:255,y:225}], r: IDENTITY_POINTS, g: IDENTITY_POINTS, b: IDENTITY_POINTS },
      levels: { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 20, outWhite: 235 }
    },
    'teal-orange': {
      curves: { rgb: IDENTITY_POINTS, r: [{x:0,y:5},{x:128,y:148},{x:255,y:255}], g: IDENTITY_POINTS, b: [{x:0,y:22},{x:128,y:118},{x:255,y:230}] },
      levels: { inBlack: 8, inWhite: 248, gamma: 1.05, outBlack: 5, outWhite: 250 }
    },
    'bleach-bypass': {
      curves: { rgb: [{x:0,y:0},{x:64,y:35},{x:192,y:228},{x:255,y:255}], r: IDENTITY_POINTS, g: IDENTITY_POINTS, b: IDENTITY_POINTS },
      levels: { inBlack: 25, inWhite: 230, gamma: 1.1, outBlack: 0, outWhite: 255 }
    },
    'film-noir': {
      curves: { rgb: [{x:0,y:0},{x:60,y:28},{x:200,y:238},{x:255,y:255}], r: IDENTITY_POINTS, g: IDENTITY_POINTS, b: IDENTITY_POINTS },
      desaturate: true,
      levels: { inBlack: 15, inWhite: 245, gamma: 0.95, outBlack: 0, outWhite: 255 }
    }
  };

  // ── Apply levels to a single value ──
  function _applyLevels(val, levels) {
    if (!levels) return val;
    var inB = levels.inBlack || 0;
    var inW = levels.inWhite != null ? levels.inWhite : 255;
    var gamma = levels.gamma || 1.0;
    var outB = levels.outBlack || 0;
    var outW = levels.outWhite != null ? levels.outWhite : 255;

    // Input levels
    var v = (val - inB) / (inW - inB);
    v = Math.max(0, Math.min(1, v));
    // Gamma
    if (gamma !== 1.0) v = Math.pow(v, 1.0 / gamma);
    // Output levels
    v = outB + v * (outW - outB);
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  // ── Apply color wheels (offset adjustments) ──
  function _applyWheels(r, g, b, wheels) {
    if (!wheels) return [r, g, b];
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    var normLum = lum / 255;

    // Shadows (dark regions)
    var sw = 1 - normLum;
    sw = sw * sw; // stronger in darks
    if (wheels.shadows) {
      r += wheels.shadows.r * sw;
      g += wheels.shadows.g * sw;
      b += wheels.shadows.b * sw;
    }

    // Midtones (mid regions)
    var mw = 1 - Math.abs(normLum - 0.5) * 2;
    mw = mw * mw;
    if (wheels.midtones) {
      r += wheels.midtones.r * mw;
      g += wheels.midtones.g * mw;
      b += wheels.midtones.b * mw;
    }

    // Highlights (bright regions)
    var hw = normLum * normLum;
    if (wheels.highlights) {
      r += wheels.highlights.r * hw;
      g += wheels.highlights.g * hw;
      b += wheels.highlights.b * hw;
    }

    return [
      Math.max(0, Math.min(255, Math.round(r))),
      Math.max(0, Math.min(255, Math.round(g))),
      Math.max(0, Math.min(255, Math.round(b)))
    ];
  }

  // ── Main pixel processing ──
  // Pre-computed combined LUT cache
  var _lutCache = { key: '', lutR: null, lutG: null, lutB: null };

  function _gradingCacheKey(grading) {
    // Build a lightweight key from grading parameters
    var parts = [];
    if (grading.preset) parts.push('p:' + grading.preset);
    if (grading.desaturate) parts.push('ds');
    if (grading.curves) {
      var c = grading.curves;
      if (c.rgb) parts.push('rgb:' + c.rgb.length + ':' + (c.rgb[0] ? c.rgb[0].x + ',' + c.rgb[0].y : ''));
      if (c.r) parts.push('r:' + c.r.length + ':' + (c.r[0] ? c.r[0].x + ',' + c.r[0].y : ''));
      if (c.g) parts.push('g:' + c.g.length + ':' + (c.g[0] ? c.g[0].x + ',' + c.g[0].y : ''));
      if (c.b) parts.push('b:' + c.b.length + ':' + (c.b[0] ? c.b[0].x + ',' + c.b[0].y : ''));
    }
    if (grading.levels) {
      var l = grading.levels;
      parts.push('lv:' + (l.inBlack||0) + ',' + (l.inWhite||255) + ',' + (l.gamma||1) + ',' + (l.outBlack||0) + ',' + (l.outWhite||255));
    }
    if (grading.wheels) parts.push('wh:' + JSON.stringify(grading.wheels));
    return parts.join('|');
  }

  function _getOrBuildCombinedLUT(grading) {
    var key = _gradingCacheKey(grading);
    if (_lutCache.key === key && _lutCache.lutR) return _lutCache;

    var preset = grading.preset && PRESETS[grading.preset] ? PRESETS[grading.preset] : null;
    var curves = grading.curves || (preset ? preset.curves : null);
    var levels = grading.levels || (preset ? preset.levels : null);
    var wheels = grading.wheels || null;
    var desaturate = grading.desaturate || (preset ? preset.desaturate : false);

    var srcLutRGB = curves && curves.rgb ? _buildLUT(curves.rgb) : null;
    var srcLutR = curves && curves.r ? _buildLUT(curves.r) : null;
    var srcLutG = curves && curves.g ? _buildLUT(curves.g) : null;
    var srcLutB = curves && curves.b ? _buildLUT(curves.b) : null;

    // Build combined LUTs that bake in curves + levels (not wheels — those depend on pixel luminance)
    var combinedR = new Uint8Array(256);
    var combinedG = new Uint8Array(256);
    var combinedB = new Uint8Array(256);

    for (var i = 0; i < 256; i++) {
      var r = i, g = i, b = i;
      if (srcLutRGB) { r = srcLutRGB[r]; g = srcLutRGB[g]; b = srcLutRGB[b]; }
      if (srcLutR) r = srcLutR[r];
      if (srcLutG) g = srcLutG[g];
      if (srcLutB) b = srcLutB[b];
      if (levels) {
        r = _applyLevels(r, levels);
        g = _applyLevels(g, levels);
        b = _applyLevels(b, levels);
      }
      combinedR[i] = r;
      combinedG[i] = g;
      combinedB[i] = b;
    }

    _lutCache = { key: key, lutR: combinedR, lutG: combinedG, lutB: combinedB, wheels: wheels, desaturate: desaturate };
    return _lutCache;
  }

  // ── Apply LUT Browser presets (VEAdvancedFeatures 3D LUTs) ──
  // Cache generated 3D LUTs to avoid recomputation every frame
  var _lut3dCache = { id: '', lut: null };

  function _applyLutBrowser(imageData, grading) {
    if (!grading) return;
    var customLUT = grading._customLUT;
    var lutId = grading.lutId;
    var intensity = grading.lutIntensity != null ? grading.lutIntensity : 1.0;
    if (intensity <= 0) return;

    if (customLUT) {
      // Custom imported .cube LUT
      if (window.VEAdvancedFeatures && VEAdvancedFeatures.applyLUT) {
        VEAdvancedFeatures.applyLUT(imageData, customLUT, intensity);
      }
    } else if (lutId) {
      // Preset LUT from LUT Browser
      if (window.VEAdvancedFeatures && VEAdvancedFeatures.generatePresetLUT && VEAdvancedFeatures.applyLUT) {
        var lut3d;
        if (_lut3dCache.id === lutId) {
          lut3d = _lut3dCache.lut;
        } else {
          lut3d = VEAdvancedFeatures.generatePresetLUT(lutId);
          _lut3dCache.id = lutId;
          _lut3dCache.lut = lut3d;
        }
        if (lut3d) {
          VEAdvancedFeatures.applyLUT(imageData, lut3d, intensity);
        }
      }
    }
  }

  // ── White balance (temp warms +R/-B, tint shifts green/magenta ±G) ──
  function _applyWb(r, g, b, wb) {
    var t = wb.temp || 0, ti = wb.tint || 0;
    if (t) { r += t * 0.6; b -= t * 0.6; }
    if (ti) { g += ti * 0.6; }
    return [r, g, b];
  }
  // ── Saturation (0..200, 100 = neutral) + Vibrance (weights the boost by how UNsaturated a pixel
  //    already is, so muted colours lift more than already-saturated ones — protects skin/sky) ──
  function _applySat(r, g, b, sat) {
    var s = (sat.saturation != null ? sat.saturation : 100) / 100;
    var vib = (sat.vibrance || 0) / 100;
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (vib) {
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var curSat = mx > 0 ? (mx - mn) / mx : 0;
      var vs = 1 + vib * (1 - curSat);
      r = lum + (r - lum) * vs; g = lum + (g - lum) * vs; b = lum + (b - lum) * vs;
    }
    if (s !== 1) {
      r = lum + (r - lum) * s; g = lum + (g - lum) * s; b = lum + (b - lum) * s;
    }
    return [r, g, b];
  }
  function _clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  function processImageData(imageData, grading) {
    // _bypass = before/after preview (owner): skip grading entirely.
    if (!grading || !grading.enabled || grading._bypass) return imageData;
    // Grade opacity (owner): mix graded result back toward the original by (1 - opacity).
    var _op = grading.opacity != null ? grading.opacity / 100 : 1;
    if (_op <= 0) return imageData;
    var _origData = (_op < 1) ? new Uint8ClampedArray(imageData.data) : null;

    var _wb = grading.wb || null;
    var _sat = grading.sat || null;
    var _hasWb = !!(_wb && (_wb.temp || _wb.tint));
    var _hasSat = !!(_sat && ((_sat.saturation != null && _sat.saturation !== 100) || _sat.vibrance));

    // 1) Apply curves/levels/wheels (internal color grading)
    var hasCurvesOrPreset = !!(grading.curves || grading.levels || grading.wheels ||
      _hasWb || _hasSat ||
      (grading.preset && grading.preset !== 'none' && PRESETS[grading.preset]));

    if (hasCurvesOrPreset) {
      var luts = _getOrBuildCombinedLUT(grading);
      var lutR = luts.lutR;
      var lutG = luts.lutG;
      var lutB = luts.lutB;
      var wheels = luts.wheels;
      var desaturate = luts.desaturate;
      var hasWheels = !!(wheels && (wheels.shadows || wheels.midtones || wheels.highlights));

      var data = imageData.data;
      var len = data.length;

      var _needsPerPixel = hasWheels || _hasWb || _hasSat;
      if (desaturate && !_needsPerPixel) {
        for (var i = 0; i < len; i += 4) {
          var gray = (data[i] * 77 + data[i+1] * 150 + data[i+2] * 29) >> 8;
          data[i]   = lutR[gray];
          data[i+1] = lutG[gray];
          data[i+2] = lutB[gray];
        }
      } else if (!desaturate && !_needsPerPixel) {
        for (var i = 0; i < len; i += 4) {
          data[i]   = lutR[data[i]];
          data[i+1] = lutG[data[i+1]];
          data[i+2] = lutB[data[i+2]];
        }
      } else {
        for (var i = 0; i < len; i += 4) {
          var r = data[i], g = data[i+1], b = data[i+2];
          if (desaturate) {
            var gray = (r * 77 + g * 150 + b * 29) >> 8;
            r = g = b = gray;
          }
          r = lutR[r]; g = lutG[g]; b = lutB[b];
          if (hasWheels) {
            var rgb = _applyWheels(r, g, b, wheels);
            r = rgb[0]; g = rgb[1]; b = rgb[2];
          }
          if (_hasWb) { var wbo = _applyWb(r, g, b, _wb); r = wbo[0]; g = wbo[1]; b = wbo[2]; }
          if (_hasSat) { var sto = _applySat(r, g, b, _sat); r = sto[0]; g = sto[1]; b = sto[2]; }
          data[i] = _clamp255(r); data[i+1] = _clamp255(g); data[i+2] = _clamp255(b);
        }
      }
    }

    // 2) Apply LUT Browser 3D LUT on top (if any)
    _applyLutBrowser(imageData, grading);

    // 3) Grade opacity: blend the graded result back toward the untouched original.
    if (_origData) {
      var d2 = imageData.data;
      for (var m = 0; m < d2.length; m += 4) {
        d2[m]   = _origData[m]   + (d2[m]   - _origData[m])   * _op;
        d2[m+1] = _origData[m+1] + (d2[m+1] - _origData[m+1]) * _op;
        d2[m+2] = _origData[m+2] + (d2[m+2] - _origData[m+2]) * _op;
      }
    }

    return imageData;
  }

  // ── Apply to canvas region ──
  var _tmpCanvas = null;
  var _tmpCtx = null;
  // Downscaled processing canvas for playback performance
  var _dsCanvas = null;
  var _dsCtx = null;
  // Frame cache: skip processing if source hasn't changed
  var _frameCache = { lastTime: -1, canvas: null };
  var DOWNSCALE = 0.5; // Process at half resolution during playback

  function _ensureTmp(w, h) {
    if (!_tmpCanvas) {
      _tmpCanvas = document.createElement('canvas');
      _tmpCtx = _tmpCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (_tmpCanvas.width !== w || _tmpCanvas.height !== h) {
      _tmpCanvas.width = w; _tmpCanvas.height = h;
    }
    return _tmpCtx;
  }

  function applyToFrame(sourceCanvas, x, y, w, h, grading, isExport) {
    if (!grading || !grading.enabled) return null;

    // During playback (not export): process at reduced resolution
    if (!isExport && w > 320 && h > 180) {
      var dw = Math.round(w * DOWNSCALE);
      var dh = Math.round(h * DOWNSCALE);

      if (!_dsCanvas) {
        _dsCanvas = document.createElement('canvas');
        _dsCtx = _dsCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (_dsCanvas.width !== dw || _dsCanvas.height !== dh) {
        _dsCanvas.width = dw; _dsCanvas.height = dh;
      }

      _dsCtx.drawImage(sourceCanvas, x, y, w, h, 0, 0, dw, dh);
      var imageData = _dsCtx.getImageData(0, 0, dw, dh);
      processImageData(imageData, grading);
      _dsCtx.putImageData(imageData, 0, 0);

      // Upscale result to output canvas
      var outCtx = _ensureTmp(w, h);
      outCtx.imageSmoothingEnabled = true;
      outCtx.drawImage(_dsCanvas, 0, 0, dw, dh, 0, 0, w, h);
      return _tmpCanvas;
    }

    // Full resolution path (export or small canvas)
    var ctx = _ensureTmp(w, h);
    ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
    var imageData = ctx.getImageData(0, 0, w, h);
    processImageData(imageData, grading);
    ctx.putImageData(imageData, 0, 0);
    return _tmpCanvas;
  }

  // ── Expose ──
  window.VEColorGrading = {
    processImageData: processImageData,
    applyToFrame: applyToFrame,
    buildLUT: _buildLUT,
    _getOrBuildCombinedLUT: _getOrBuildCombinedLUT,
    PRESETS: PRESETS,
    PRESET_NAMES: Object.keys(PRESETS)
  };
})();

// Modular skeleton hook (Faz 8) — ve-color-grading is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-color-grading', parent: 'video', title: 've-color-grading', mount: function () {}, unmount: function () {} });
