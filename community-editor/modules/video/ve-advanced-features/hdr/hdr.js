/* Module: video/ve-advanced-features/hdr — HDR / Wide Gamut — P3 canvas + tone mapping
   Part of the ve-advanced-features group (decomposed from the 2015-line IIFE). Functions hang off the
   shared namespace VEA (window.__ccVEAdvanced, created by the parent); cross-module refs resolve
   through VEA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;

  VEA.detectHDRSupport = function () {
    // Check Display P3 canvas support
    try {
      var testCanvas = document.createElement('canvas');
      testCanvas.width = 1;
      testCanvas.height = 1;
      var ctx = testCanvas.getContext('2d', { colorSpace: 'display-p3' });
      VEA._hdrSupport.displayP3 = ctx && ctx.getContextAttributes &&
        ctx.getContextAttributes().colorSpace === 'display-p3';
    } catch (e) {
      VEA._hdrSupport.displayP3 = false;
    }

    // Check HDR display
    VEA._hdrSupport.hdr = window.matchMedia && window.matchMedia('(dynamic-range: high)').matches;

    // Check 10-bit via WebGPU/WebGL
    try {
      var gl = document.createElement('canvas').getContext('webgl2');
      if (gl) {
        var ext = gl.getExtension('EXT_color_buffer_half_float');
        VEA._hdrSupport.tenBit = !!ext;
      }
    } catch (e) {
      VEA._hdrSupport.tenBit = false;
    }

    return VEA._hdrSupport;
  };

  VEA.createP3Canvas = function (width, height) {
    var cvs = document.createElement('canvas');
    cvs.width = width;
    cvs.height = height;
    var ctx;
    if (VEA._hdrSupport.displayP3) {
      try {
        ctx = cvs.getContext('2d', { colorSpace: 'display-p3' });
      } catch (e) {
        ctx = cvs.getContext('2d');
      }
    } else {
      ctx = cvs.getContext('2d');
    }
    return { canvas: cvs, ctx: ctx };
  };

  VEA.toneMapHDR = function (imageData, maxLuminance) {
    maxLuminance = maxLuminance || 1000; // nits
    var d = imageData.data;
    var invMax = 1 / (maxLuminance / 100); // Normalize to 0-1 range

    for (var i = 0; i < d.length; i += 4) {
      for (var ch = 0; ch < 3; ch++) {
        var val = d[i + ch] / 255;
        // Reinhard tone mapping
        val = val * invMax;
        val = val / (1 + val);
        d[i + ch] = Math.min(255, Math.max(0, val * 255));
      }
    }
    return imageData;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'hdr', parent: 'video.ve-advanced-features', title: 've-advanced-features: hdr', mount: function () {}, unmount: function () {} });
  }
})();
