/* Module: video/ve-advanced-features/lut — LUT — .cube parsing + preset LUT application
   Part of the ve-advanced-features group (decomposed from the 2015-line IIFE). Functions hang off the
   shared namespace VEA (window.__ccVEAdvanced, created by the parent); cross-module refs resolve
   through VEA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;

  VEA.parseCubeFile = function (text) {
    if (!text || typeof text !== 'string') return null;

    var title = '';
    var size = 0;
    var domainMin = [0, 0, 0];
    var domainMax = [1, 1, 1];
    var data = [];

    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') continue;

      if (line.indexOf('TITLE') === 0) {
        title = line.replace(/^TITLE\s+/, '').replace(/^"(.*)"$/, '$1');
      } else if (line.indexOf('LUT_3D_SIZE') === 0) {
        size = parseInt(line.split(/\s+/)[1], 10);
      } else if (line.indexOf('DOMAIN_MIN') === 0) {
        var dmin = line.split(/\s+/);
        domainMin = [parseFloat(dmin[1]), parseFloat(dmin[2]), parseFloat(dmin[3])];
      } else if (line.indexOf('DOMAIN_MAX') === 0) {
        var dmax = line.split(/\s+/);
        domainMax = [parseFloat(dmax[1]), parseFloat(dmax[2]), parseFloat(dmax[3])];
      } else {
        var parts = line.split(/\s+/);
        if (parts.length >= 3) {
          var r = parseFloat(parts[0]);
          var g = parseFloat(parts[1]);
          var b = parseFloat(parts[2]);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            data.push(r, g, b);
          }
        }
      }
    }

    if (size < 2 || data.length < size * size * size * 3) {
      console.warn('[VEAdvanced] Invalid .cube file: expected', size * size * size * 3, 'values, got', data.length);
      return null;
    }

    return {
      title: title || 'Untitled LUT',
      size: size,
      domainMin: domainMin,
      domainMax: domainMax,
      data: new Float32Array(data)
    };
  };

  VEA.applyLUT = function (imageData, lut, intensity) {
    if (!lut || !lut.data || !imageData) return imageData;
    intensity = (intensity !== undefined) ? intensity : 1.0;
    if (intensity <= 0) return imageData;

    var d = imageData.data;
    var size = lut.size;
    var sm1 = size - 1;
    var lutData = lut.data;

    for (var i = 0; i < d.length; i += 4) {
      var rn = d[i] / 255;
      var gn = d[i + 1] / 255;
      var bn = d[i + 2] / 255;

      // Scale to LUT coords
      var rf = rn * sm1;
      var gf = gn * sm1;
      var bf = bn * sm1;

      var r0 = Math.min(sm1 - 1, Math.floor(rf));
      var g0 = Math.min(sm1 - 1, Math.floor(gf));
      var b0 = Math.min(sm1 - 1, Math.floor(bf));

      var dr = rf - r0;
      var dg = gf - g0;
      var db = bf - b0;

      // Trilinear interpolation
      var idx000 = (r0 + g0 * size + b0 * size * size) * 3;
      var idx100 = ((r0 + 1) + g0 * size + b0 * size * size) * 3;
      var idx010 = (r0 + (g0 + 1) * size + b0 * size * size) * 3;
      var idx110 = ((r0 + 1) + (g0 + 1) * size + b0 * size * size) * 3;
      var idx001 = (r0 + g0 * size + (b0 + 1) * size * size) * 3;
      var idx101 = ((r0 + 1) + g0 * size + (b0 + 1) * size * size) * 3;
      var idx011 = (r0 + (g0 + 1) * size + (b0 + 1) * size * size) * 3;
      var idx111 = ((r0 + 1) + (g0 + 1) * size + (b0 + 1) * size * size) * 3;

      for (var ch = 0; ch < 3; ch++) {
        var c000 = lutData[idx000 + ch] || 0;
        var c100 = lutData[idx100 + ch] || 0;
        var c010 = lutData[idx010 + ch] || 0;
        var c110 = lutData[idx110 + ch] || 0;
        var c001 = lutData[idx001 + ch] || 0;
        var c101 = lutData[idx101 + ch] || 0;
        var c011 = lutData[idx011 + ch] || 0;
        var c111 = lutData[idx111 + ch] || 0;

        var c00 = c000 * (1 - dr) + c100 * dr;
        var c10 = c010 * (1 - dr) + c110 * dr;
        var c01 = c001 * (1 - dr) + c101 * dr;
        var c11 = c011 * (1 - dr) + c111 * dr;

        var c0 = c00 * (1 - dg) + c10 * dg;
        var c1 = c01 * (1 - dg) + c11 * dg;

        var val = (c0 * (1 - db) + c1 * db) * 255;
        d[i + ch] = d[i + ch] + (val - d[i + ch]) * intensity;
      }
    }

    return imageData;
  };

  VEA.generatePresetLUT = function (presetId) {
    var preset = VEA.LUT_LIBRARY[presetId];
    if (!preset) return null;

    // Build identity LUT with modifications
    var size = 17; // Smaller for preset efficiency
    var data = new Float32Array(size * size * size * 3);
    var sm1 = size - 1;

    for (var bi = 0; bi < size; bi++) {
      for (var gi = 0; gi < size; gi++) {
        for (var ri = 0; ri < size; ri++) {
          var idx = (ri + gi * size + bi * size * size) * 3;
          var r = ri / sm1;
          var g = gi / sm1;
          var b = bi / sm1;

          // Apply preset modifications
          if (preset.brightness) { r += preset.brightness; g += preset.brightness; b += preset.brightness; }
          if (preset.contrast) {
            r = (r - 0.5) * (1 + preset.contrast) + 0.5;
            g = (g - 0.5) * (1 + preset.contrast) + 0.5;
            b = (b - 0.5) * (1 + preset.contrast) + 0.5;
          }
          if (preset.gamma) {
            r = Math.pow(Math.max(0, r), preset.gamma);
            g = Math.pow(Math.max(0, g), preset.gamma);
            b = Math.pow(Math.max(0, b), preset.gamma);
          }
          if (preset.saturation) {
            var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            var sat = 1 + preset.saturation;
            r = lum + (r - lum) * sat;
            g = lum + (g - lum) * sat;
            b = lum + (b - lum) * sat;
          }
          if (preset.desaturate) {
            var lum2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = r + (lum2 - r) * preset.desaturate;
            g = g + (lum2 - g) * preset.desaturate;
            b = b + (lum2 - b) * preset.desaturate;
          }
          if (preset.temperature) {
            r += preset.temperature * 0.1;
            b -= preset.temperature * 0.1;
          }
          if (preset.warmth) {
            r += preset.warmth * 0.08;
            g += preset.warmth * 0.03;
            b -= preset.warmth * 0.06;
          }
          if (preset.fadedBlacks) {
            r = r * (1 - preset.fadedBlacks) + preset.fadedBlacks * 0.15;
            g = g * (1 - preset.fadedBlacks) + preset.fadedBlacks * 0.13;
            b = b * (1 - preset.fadedBlacks) + preset.fadedBlacks * 0.12;
          }
          if (preset.shadowLift) {
            var inv = 1 - Math.max(0, Math.min(1, (r + g + b) / 3));
            r += preset.shadowLift * inv * 0.5;
            g += preset.shadowLift * inv * 0.5;
            b += preset.shadowLift * inv * 0.5;
          }
          if (preset.tealShadows) {
            var invL = 1 - Math.max(0, Math.min(1, (r + g + b) / 3));
            g += preset.tealShadows * invL * 0.08;
            b += preset.tealShadows * invL * 0.12;
            r -= preset.tealShadows * invL * 0.06;
          }
          if (preset.orangeHighlights) {
            var hiL = Math.max(0, Math.min(1, (r + g + b) / 3));
            r += preset.orangeHighlights * hiL * 0.12;
            g += preset.orangeHighlights * hiL * 0.04;
            b -= preset.orangeHighlights * hiL * 0.08;
          }
          if (preset.sepiaTone) {
            var sl = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            var sr = sl + preset.sepiaTone * 0.12;
            var sg = sl + preset.sepiaTone * 0.05;
            var sb = sl - preset.sepiaTone * 0.06;
            r = r + (sr - r) * preset.sepiaTone;
            g = g + (sg - g) * preset.sepiaTone;
            b = b + (sb - b) * preset.sepiaTone;
          }
          if (preset.cyanTone) {
            var cl = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            var cr2 = cl - preset.cyanTone * 0.08;
            var cg2 = cl + preset.cyanTone * 0.04;
            var cb2 = cl + preset.cyanTone * 0.12;
            r = r + (cr2 - r) * preset.cyanTone;
            g = g + (cg2 - g) * preset.cyanTone;
            b = b + (cb2 - b) * preset.cyanTone;
          }

          data[idx]     = Math.max(0, Math.min(1, r));
          data[idx + 1] = Math.max(0, Math.min(1, g));
          data[idx + 2] = Math.max(0, Math.min(1, b));
        }
      }
    }

    return { title: preset.name, size: size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data: data };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'lut', parent: 'video.ve-advanced-features', title: 've-advanced-features: lut', mount: function () {}, unmount: function () {} });
  }
})();
