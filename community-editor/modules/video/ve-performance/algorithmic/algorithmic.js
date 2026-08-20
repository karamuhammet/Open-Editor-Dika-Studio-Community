/* Module: video/ve-performance/algorithmic — Katman 1 — single-pass processor, LUT baker, frame-skip, dirty-region tracker.
   Part of the ve-performance group (decomposed from the 1654-line IIFE). Functions hang off the
   shared namespace VEP (window.__ccVEPerformance, created by the parent); cross-module refs resolve
   through VEP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEP = window.__ccVEPerformance;
  if (!VEP) return;

  VEP.SinglePassProcessor = {
    _tmpCanvas: null,
    _tmpCtx: null,

    _ensure: function(w, h) {
      if (!this._tmpCanvas || this._tmpCanvas.width !== w || this._tmpCanvas.height !== h) {
        this._tmpCanvas = document.createElement('canvas');
        this._tmpCanvas.width = w;
        this._tmpCanvas.height = h;
        this._tmpCtx = this._tmpCanvas.getContext('2d');
      }
      return this._tmpCtx;
    },

    /**
     * Process a canvas region with chroma key + color grading in a single pass
     * @param {HTMLCanvasElement} sourceCanvas
     * @param {number} x, y, w, h — region
     * @param {Object} chromaSettings — {enabled, keyColor, tolerance, ...}
     * @param {Object} gradingSettings — {enabled, curves, levels, wheels, ...}
     * @returns {HTMLCanvasElement|null}
     */
    process: function(sourceCanvas, x, y, w, h, chromaSettings, gradingSettings) {
      var hasChroma = chromaSettings && chromaSettings.enabled;
      var hasGrading = gradingSettings && gradingSettings.enabled;
      if (!hasChroma && !hasGrading) return null;

      var ctx = this._ensure(w, h);
      ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);

      var imageData = ctx.getImageData(0, 0, w, h);
      var data = imageData.data;
      var pixelCount = w * h;

      // ── Pre-compute chroma key params ──
      var ckR, ckG, ckB, ckTol, ckSmooth, ckSpill, ckY, ckCb, ckCr;
      if (hasChroma) {
        var kc = chromaSettings.keyColor || { r: 0, g: 255, b: 0 };
        ckR = kc.r; ckG = kc.g; ckB = kc.b;
        ckTol = (chromaSettings.tolerance || 40) / 100;
        ckSmooth = (chromaSettings.smoothness || 10) / 100;
        ckSpill = (chromaSettings.spillSuppression || 50) / 100;
        // Pre-compute key color in YCbCr
        ckY  = 0.299 * ckR + 0.587 * ckG + 0.114 * ckB;
        ckCb = 128 - 0.168736 * ckR - 0.331264 * ckG + 0.5 * ckB;
        ckCr = 128 + 0.5 * ckR - 0.418688 * ckG - 0.081312 * ckB;
      }

      // ── Pre-compute LUT for color grading ──
      var lutR, lutG, lutB;
      if (hasGrading && window.VEColorGrading && VEColorGrading._getOrBuildCombinedLUT) {
        var luts = VEColorGrading._getOrBuildCombinedLUT(gradingSettings);
        if (luts) { lutR = luts.r; lutG = luts.g; lutB = luts.b; }
      }

      // ── Uint32Array view for faster 4-byte reads ──
      var buf32 = new Uint32Array(data.buffer);

      // ── Single-pass pixel loop ──
      for (var i = 0; i < pixelCount; i++) {
        var off = i << 2; // i * 4
        var r = data[off], g = data[off + 1], b = data[off + 2], a = data[off + 3];

        // ── Chroma key pass ──
        if (hasChroma && a > 0) {
          var pY  = 0.299 * r + 0.587 * g + 0.114 * b;
          var pCb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          var pCr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

          var dCb = pCb - ckCb;
          var dCr = pCr - ckCr;
          var dist = Math.sqrt(dCb * dCb + dCr * dCr) / 181.02; // normalized

          if (dist < ckTol) {
            a = 0; // fully transparent
          } else if (dist < ckTol + ckSmooth) {
            a = Math.round(((dist - ckTol) / ckSmooth) * 255);
          }

          // Spill suppression
          if (a > 0 && ckSpill > 0) {
            var spillAmt = g - Math.max(r, b);
            if (spillAmt > 0) {
              g = Math.round(g - spillAmt * ckSpill);
            }
          }
        }

        // ── Color grading pass ──
        if (hasGrading && a > 0) {
          if (lutR) { r = lutR[r]; g = lutG[g]; b = lutB[b]; }
        }

        // ── Write back ──
        data[off] = r;
        data[off + 1] = g;
        data[off + 2] = b;
        data[off + 3] = a;
      }

      ctx.putImageData(imageData, 0, 0);
      return this._tmpCanvas;
    }
  };

  VEP.LUTBaker = {
    _cache: {},
    _cacheKey: '',

    /**
     * Build or reuse cached 256-entry LUT for curve evaluation
     * @param {Array} curvePoints — [{x, y}, ...] control points
     * @returns {Uint8Array} 256-entry lookup table
     */
    buildCurveLUT: function(curvePoints) {
      if (!curvePoints || curvePoints.length < 2) return null;
      var key = JSON.stringify(curvePoints);
      if (this._cache[key]) return this._cache[key];

      var lut = new Uint8Array(256);
      for (var i = 0; i < 256; i++) {
        var t = i / 255;
        var val = VEP._cubicSplineEval(curvePoints, t);
        lut[i] = Math.max(0, Math.min(255, Math.round(val * 255)));
      }

      // Keep cache bounded
      var keys = Object.keys(this._cache);
      if (keys.length > 20) delete this._cache[keys[0]];
      this._cache[key] = lut;
      return lut;
    },

    /**
     * Build combined R/G/B LUTs from grading settings
     */
    buildGradingLUTs: function(settings) {
      if (!settings) return null;
      var lutR = new Uint8Array(256);
      var lutG = new Uint8Array(256);
      var lutB = new Uint8Array(256);

      for (var i = 0; i < 256; i++) {
        lutR[i] = i; lutG[i] = i; lutB[i] = i;
      }

      // Apply curves
      if (settings.curves) {
        if (settings.curves.rgb) {
          var rgbLut = this.buildCurveLUT(settings.curves.rgb);
          if (rgbLut) for (var r = 0; r < 256; r++) { lutR[r] = rgbLut[lutR[r]]; lutG[r] = rgbLut[lutG[r]]; lutB[r] = rgbLut[lutB[r]]; }
        }
        if (settings.curves.r) {
          var rLut = this.buildCurveLUT(settings.curves.r);
          if (rLut) for (var ri = 0; ri < 256; ri++) lutR[ri] = rLut[lutR[ri]];
        }
        if (settings.curves.g) {
          var gLut = this.buildCurveLUT(settings.curves.g);
          if (gLut) for (var gi = 0; gi < 256; gi++) lutG[gi] = gLut[lutG[gi]];
        }
        if (settings.curves.b) {
          var bLut = this.buildCurveLUT(settings.curves.b);
          if (bLut) for (var bi = 0; bi < 256; bi++) lutB[bi] = bLut[lutB[bi]];
        }
      }

      // Apply levels
      if (settings.levels) {
        var lvl = settings.levels;
        var inMin = (lvl.inputMin || 0), inMax = (lvl.inputMax || 255);
        var outMin = (lvl.outputMin || 0), outMax = (lvl.outputMax || 255);
        var gamma = lvl.gamma || 1.0;
        for (var li = 0; li < 256; li++) {
          var v = (li - inMin) / (inMax - inMin);
          v = Math.max(0, Math.min(1, v));
          if (gamma !== 1.0) v = Math.pow(v, 1 / gamma);
          v = outMin + v * (outMax - outMin);
          var mapped = Math.max(0, Math.min(255, Math.round(v)));
          lutR[li] = lutR[mapped] !== undefined ? lutR[mapped] : mapped;
          lutG[li] = lutG[mapped] !== undefined ? lutG[mapped] : mapped;
          lutB[li] = lutB[mapped] !== undefined ? lutB[mapped] : mapped;
        }
      }

      return { r: lutR, g: lutG, b: lutB };
    },

    invalidate: function() {
      this._cache = {};
    }
  };

  VEP._cubicSplineEval = function (points, t) {
    if (points.length < 2) return t;
    var x = t;
    // Find segment
    for (var i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        var segT = (x - points[i].x) / (points[i + 1].x - points[i].x);
        return points[i].y + segT * (points[i + 1].y - points[i].y);
      }
    }
    return points[points.length - 1].y;
  };

  VEP.FrameSkipManager = {
    _targetFps: 30,
    _frameTimeMs: 33.33,
    _lastRenderTime: 0,
    _droppedFrames: 0,
    _totalFrames: 0,
    _enabled: true,

    setTargetFps: function(fps) {
      this._targetFps = fps;
      this._frameTimeMs = 1000 / fps;
    },

    /**
     * Should we render this frame or skip it?
     * @param {number} now — current time from RAF
     * @returns {boolean} true = render, false = skip
     */
    shouldRender: function(now) {
      if (!this._enabled) return true;
      this._totalFrames++;

      var elapsed = now - this._lastRenderTime;
      if (elapsed < this._frameTimeMs * 0.8) {
        this._droppedFrames++;
        return false;
      }
      this._lastRenderTime = now;
      return true;
    },

    reset: function() {
      this._lastRenderTime = 0;
      this._droppedFrames = 0;
      this._totalFrames = 0;
    },

    getStats: function() {
      return {
        droppedFrames: this._droppedFrames,
        totalFrames: this._totalFrames,
        dropRate: this._totalFrames > 0 ? (this._droppedFrames / this._totalFrames * 100).toFixed(1) + '%' : '0%'
      };
    }
  };

  VEP.DirtyRegionTracker = {
    _regions: [],
    _fullDirty: true,
    _cachedBg: null,
    _cachedBgW: 0,
    _cachedBgH: 0,

    markFullDirty: function() {
      this._fullDirty = true;
      this._regions = [];
    },

    markRegion: function(x, y, w, h) {
      this._regions.push({ x: x, y: y, w: w, h: h });
    },

    isFullDirty: function() {
      return this._fullDirty;
    },

    /**
     * Cache static background
     * @param {HTMLCanvasElement} canvas
     */
    cacheBg: function(canvas) {
      if (!this._cachedBg) {
        this._cachedBg = document.createElement('canvas');
      }
      this._cachedBg.width = canvas.width;
      this._cachedBg.height = canvas.height;
      this._cachedBgW = canvas.width;
      this._cachedBgH = canvas.height;
      this._cachedBg.getContext('2d').drawImage(canvas, 0, 0);
    },

    getCachedBg: function() {
      return this._cachedBg;
    },

    clearFrame: function() {
      this._fullDirty = false;
      this._regions = [];
    },

    getRegions: function() {
      return this._regions;
    },

    invalidateBg: function() {
      this._cachedBg = null;
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'algorithmic', parent: 'video.ve-performance', title: 've-performance: algorithmic', mount: function () {}, unmount: function () {} });
  }
})();
