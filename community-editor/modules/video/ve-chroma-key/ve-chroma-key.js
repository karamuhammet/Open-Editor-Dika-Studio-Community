// ═══════════════════════════════════════════════════════════════
//  VE-CHROMA-KEY  —  Green Screen Removal (Phase 12)
//  Canvas pixel manipulation for chroma key compositing
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── Default settings ──
  var DEFAULT_KEY_COLOR = [0, 177, 64]; // green screen RGB
  var DEFAULT_SIMILARITY = 0.4;         // 0–1 range
  var DEFAULT_SMOOTHNESS = 0.1;         // edge softness
  var DEFAULT_SPILL = 0.5;              // spill suppression

  // ── Temp canvas for pixel ops ──
  var _tmpCanvas = null;
  var _tmpCtx = null;

  function _ensureTmp(w, h) {
    if (!_tmpCanvas) {
      _tmpCanvas = document.createElement('canvas');
      _tmpCtx = _tmpCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (_tmpCanvas.width !== w || _tmpCanvas.height !== h) {
      _tmpCanvas.width = w;
      _tmpCanvas.height = h;
    }
    return _tmpCtx;
  }

  // ── Parse hex color to [R, G, B] ──
  function _hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  // ── RGB to YCbCr for better chroma comparison ──
  function _rgbToYCbCr(r, g, b) {
    var y  =  0.299 * r + 0.587 * g + 0.114 * b;
    var cb = -0.169 * r - 0.331 * g + 0.500 * b + 128;
    var cr =  0.500 * r - 0.419 * g - 0.081 * b + 128;
    return [y, cb, cr];
  }

  // ── Core chroma key processing ──
  // Takes an ImageData and modifies it in place
  function processImageData(imageData, settings) {
    if (!settings || !settings.enabled) return imageData;

    var keyColor = settings.color || DEFAULT_KEY_COLOR;
    if (typeof keyColor === 'string') keyColor = _hexToRgb(keyColor);

    var similarity = settings.similarity != null ? settings.similarity : DEFAULT_SIMILARITY;
    var smoothness = settings.smoothness != null ? settings.smoothness : DEFAULT_SMOOTHNESS;
    var spill = settings.spill != null ? settings.spill : DEFAULT_SPILL;

    var keyYCbCr = _rgbToYCbCr(keyColor[0], keyColor[1], keyColor[2]);
    var keyCb = keyYCbCr[1];
    var keyCr = keyYCbCr[2];

    var data = imageData.data;
    var len = data.length;

    // Precompute thresholds
    var simThreshold = similarity * 255;
    var smoothRange = smoothness * 255;
    var smoothMax = simThreshold + smoothRange;

    for (var i = 0; i < len; i += 4) {
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];

      // Convert to YCbCr
      var cb = -0.169 * r - 0.331 * g + 0.500 * b + 128;
      var cr =  0.500 * r - 0.419 * g - 0.081 * b + 128;

      // Chroma distance in CbCr plane
      var dCb = cb - keyCb;
      var dCr = cr - keyCr;
      var dist = Math.sqrt(dCb * dCb + dCr * dCr);

      if (dist < simThreshold) {
        // Fully transparent — this pixel matches the key color
        data[i + 3] = 0;
      } else if (dist < smoothMax) {
        // Smooth edge — partial transparency
        var alpha = (dist - simThreshold) / smoothRange;
        data[i + 3] = Math.round(alpha * data[i + 3]);

        // Spill suppression — reduce green channel contribution
        if (spill > 0) {
          var spillFactor = 1 - (1 - alpha) * spill;
          data[i + 1] = Math.round(g * spillFactor + (r + b) * 0.5 * (1 - spillFactor));
        }
      } else if (spill > 0) {
        // Outside threshold but still apply mild spill suppression
        var sFactor = Math.max(0, 1 - (dist - smoothMax) / 128);
        if (sFactor > 0.01) {
          var sf = 1 - sFactor * spill * 0.3;
          data[i + 1] = Math.round(g * sf + (r + b) * 0.5 * (1 - sf));
        }
      }
    }

    return imageData;
  }

  // ── Apply chroma key to a canvas region ──
  // Draws the source frame, processes pixels, returns processed canvas
  function applyToFrame(sourceCanvas, sx, sy, sw, sh, settings) {
    if (!settings || !settings.enabled) return null;

    var ctx = _ensureTmp(sw, sh);
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    var imageData = ctx.getImageData(0, 0, sw, sh);
    processImageData(imageData, settings);
    ctx.putImageData(imageData, 0, 0);

    return _tmpCanvas;
  }

  // ── Apply chroma key to a video element frame ──
  function applyToVideo(videoEl, w, h, settings) {
    if (!settings || !settings.enabled) return null;

    var ctx = _ensureTmp(w, h);
    ctx.drawImage(videoEl, 0, 0, w, h);

    var imageData = ctx.getImageData(0, 0, w, h);
    processImageData(imageData, settings);
    ctx.putImageData(imageData, 0, 0);

    return _tmpCanvas;
  }

  // ── Color sampler: get pixel color at coordinates ──
  function sampleColor(canvas, x, y) {
    var ctx = canvas.getContext('2d');
    var pixel = ctx.getImageData(x, y, 1, 1).data;
    return [pixel[0], pixel[1], pixel[2]];
  }

  // ── Format RGB to hex ──
  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ── Expose ──
  window.VEChromaKey = {
    processImageData: processImageData,
    applyToFrame: applyToFrame,
    applyToVideo: applyToVideo,
    sampleColor: sampleColor,
    rgbToHex: rgbToHex,
    DEFAULT_KEY_COLOR: DEFAULT_KEY_COLOR,
    DEFAULT_SIMILARITY: DEFAULT_SIMILARITY,
    DEFAULT_SMOOTHNESS: DEFAULT_SMOOTHNESS,
    DEFAULT_SPILL: DEFAULT_SPILL
  };
})();

// Modular skeleton hook (Faz 8) — ve-chroma-key is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-chroma-key', parent: 'video', title: 've-chroma-key', mount: function () {}, unmount: function () {} });
