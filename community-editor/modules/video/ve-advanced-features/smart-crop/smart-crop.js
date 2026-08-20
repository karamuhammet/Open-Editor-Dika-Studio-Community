/* Module: video/ve-advanced-features/smart-crop — Smart Crop — subject detection + reframe-to-aspect
   Part of the ve-advanced-features group (decomposed from the 2015-line IIFE). Functions hang off the
   shared namespace VEA (window.__ccVEAdvanced, created by the parent); cross-module refs resolve
   through VEA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;

  VEA.SmartCrop = function () {
    this._offCanvas = document.createElement('canvas');
    this._offCtx = this._offCanvas.getContext('2d');
  };

  VEA.SmartCrop.prototype.findSubject = function(sourceCanvas) {
    var w = 64;
    var h = 36;
    this._offCanvas.width = w;
    this._offCanvas.height = h;
    this._offCtx.drawImage(sourceCanvas, 0, 0, w, h);

    var imgData = this._offCtx.getImageData(0, 0, w, h);
    var d = imgData.data;

    // Edge detection (simple Sobel magnitude)
    var edgeMap = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx = (y * w + x) * 4;
        var l = 0.2126 * d[idx] + 0.7152 * d[idx + 1] + 0.0722 * d[idx + 2];
        var idxL = (y * w + (x - 1)) * 4;
        var idxR = (y * w + (x + 1)) * 4;
        var idxU = ((y - 1) * w + x) * 4;
        var idxD = ((y + 1) * w + x) * 4;

        var gx = (0.2126 * d[idxR] + 0.7152 * d[idxR + 1] + 0.0722 * d[idxR + 2]) -
                 (0.2126 * d[idxL] + 0.7152 * d[idxL + 1] + 0.0722 * d[idxL + 2]);
        var gy = (0.2126 * d[idxD] + 0.7152 * d[idxD + 1] + 0.0722 * d[idxD + 2]) -
                 (0.2126 * d[idxU] + 0.7152 * d[idxU + 1] + 0.0722 * d[idxU + 2]);

        edgeMap[y * w + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    // Find center of mass of edge energy
    var totalWeight = 0;
    var weightedX = 0;
    var weightedY = 0;

    for (var y2 = 0; y2 < h; y2++) {
      for (var x2 = 0; x2 < w; x2++) {
        var weight = edgeMap[y2 * w + x2];
        totalWeight += weight;
        weightedX += x2 * weight;
        weightedY += y2 * weight;
      }
    }

    if (totalWeight < 1) {
      return { x: 0.5, y: 0.5, confidence: 0 };
    }

    return {
      x: (weightedX / totalWeight) / w,
      y: (weightedY / totalWeight) / h,
      confidence: Math.min(1, totalWeight / (w * h * 10))
    };
  };

  VEA.SmartCrop.prototype.computeCropRect = function(sourceW, sourceH, targetAspect, subjectPos) {
    var srcAspect = sourceW / sourceH;

    var cropW, cropH;
    if (targetAspect > srcAspect) {
      // Target is wider → full width, crop height
      cropW = sourceW;
      cropH = sourceW / targetAspect;
    } else {
      // Target is taller → full height, crop width
      cropH = sourceH;
      cropW = sourceH * targetAspect;
    }

    // Center on subject
    var cx = subjectPos.x * sourceW;
    var cy = subjectPos.y * sourceH;

    var x = cx - cropW / 2;
    var y = cy - cropH / 2;

    // Clamp to bounds
    x = Math.max(0, Math.min(sourceW - cropW, x));
    y = Math.max(0, Math.min(sourceH - cropH, y));

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(cropW),
      height: Math.round(cropH)
    };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'smart-crop', parent: 'video.ve-advanced-features', title: 've-advanced-features: smart-crop', mount: function () {}, unmount: function () {} });
  }
})();
