/* Module: video/ve-advanced-features/stabilization — Stabilization — motion estimate + smoothing transform
   Part of the ve-advanced-features group (decomposed from the 2015-line IIFE). Functions hang off the
   shared namespace VEA (window.__ccVEAdvanced, created by the parent); cross-module refs resolve
   through VEA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;

  VEA.VideoStabilizer = function (opts) {
    opts = opts || {};
    this.smoothing = opts.smoothing || 10; // Gaussian kernel radius in frames
    this.cropZoom = opts.cropZoom || 1.1;  // 10% zoom for border compensation
    this._motionData = []; // [{dx, dy, rotation}] per frame
    this._smoothedData = [];
    this._status = 'idle';
    this._offCanvas = document.createElement('canvas');
    this._offCtx = this._offCanvas.getContext('2d');
  };

  VEA._gaussianSmooth = function (data, radius) {
    var n = data.length;
    var result = new Float32Array(n);
    var kernel = [];
    var sigma = radius / 3;
    var sum = 0;

    for (var k = -radius; k <= radius; k++) {
      var w = Math.exp(-(k * k) / (2 * sigma * sigma));
      kernel.push(w);
      sum += w;
    }
    for (var k2 = 0; k2 < kernel.length; k2++) kernel[k2] /= sum;

    for (var i = 0; i < n; i++) {
      var val = 0;
      for (var j = 0; j < kernel.length; j++) {
        var idx = i + j - radius;
        idx = Math.max(0, Math.min(n - 1, idx));
        val += data[idx] * kernel[j];
      }
      result[i] = val;
    }
    return result;
  };

  VEA.VideoStabilizer.prototype.analyze = function(videoEl, callback) {
    if (!videoEl || !videoEl.duration) return;

    var self = this;
    self._status = 'analyzing';
    self._motionData = [];

    var w = 128;
    var h = 72;
    self._offCanvas.width = w;
    self._offCanvas.height = h;

    var fps = 30;
    var dt = 1 / fps;
    var totalFrames = Math.ceil(videoEl.duration * fps);
    var currentFrame = 0;
    var prevGray = null;

    function processFrame() {
      if (currentFrame >= totalFrames || self._status !== 'analyzing') {
        self._smooth();
        self._status = 'done';
        if (callback) callback(self._motionData.length);
        return;
      }

      var time = currentFrame * dt;
      videoEl.currentTime = time;

      videoEl.onseeked = function() {
        videoEl.onseeked = null;
        self._offCtx.drawImage(videoEl, 0, 0, w, h);
        var imgData = self._offCtx.getImageData(0, 0, w, h);
        var gray = VEA._toGrayscale(imgData.data, w, h);

        if (prevGray) {
          var motion = self._estimateMotion(prevGray, gray, w, h);
          self._motionData.push(motion);
        } else {
          self._motionData.push({ dx: 0, dy: 0, rotation: 0 });
        }

        prevGray = gray;
        currentFrame++;
        setTimeout(processFrame, 0);
      };
    }

    processFrame();
  };

  VEA.VideoStabilizer.prototype._estimateMotion = function(prev, curr, w, h) {
    // Sample grid of points and average their optical flow
    var gridStep = 8;
    var totalDx = 0, totalDy = 0, count = 0;
    var halfWin = 3;

    // Collect per-point flows for rotation estimation
    var flows = [];

    for (var gy = gridStep; gy < h - gridStep; gy += gridStep) {
      for (var gx = gridStep; gx < w - gridStep; gx += gridStep) {
        var flow = VEA._lucasKanade(prev, curr, w, h, gx, gy, halfWin);
        if (flow.confidence > 0.1) {
          totalDx += flow.dx;
          totalDy += flow.dy;
          flows.push({ x: gx, y: gy, dx: flow.dx, dy: flow.dy });
          count++;
        }
      }
    }

    if (count === 0) return { dx: 0, dy: 0, rotation: 0 };

    var avgDx = totalDx / count;
    var avgDy = totalDy / count;

    // Estimate rotation from flow pairs around center
    // For each flow point, compute the angle of (flow - translation) relative to center
    var cx = w / 2, cy = h / 2;
    var totalRot = 0, rotCount = 0;
    for (var fi = 0; fi < flows.length; fi++) {
      var f = flows[fi];
      var rx = f.x - cx, ry = f.y - cy;
      var dist = Math.sqrt(rx * rx + ry * ry);
      if (dist < gridStep * 2) continue; // skip near-center points
      // Residual flow after removing translation
      var rdx = f.dx - avgDx, rdy = f.dy - avgDy;
      // Cross product gives rotation: (r × residual) / |r|²
      var cross = rx * rdy - ry * rdx;
      totalRot += cross / (dist * dist);
      rotCount++;
    }

    return {
      dx: avgDx,
      dy: avgDy,
      rotation: rotCount > 0 ? totalRot / rotCount : 0
    };
  };

  VEA.VideoStabilizer.prototype._smooth = function() {
    var n = this._motionData.length;
    if (n === 0) return;

    // Cumulative motion
    var cumX = new Float32Array(n);
    var cumY = new Float32Array(n);
    var cumR = new Float32Array(n);
    cumX[0] = this._motionData[0].dx;
    cumY[0] = this._motionData[0].dy;
    cumR[0] = this._motionData[0].rotation || 0;

    for (var i = 1; i < n; i++) {
      cumX[i] = cumX[i - 1] + this._motionData[i].dx;
      cumY[i] = cumY[i - 1] + this._motionData[i].dy;
      cumR[i] = cumR[i - 1] + (this._motionData[i].rotation || 0);
    }

    // Gaussian smooth cumulative path
    var smoothX = VEA._gaussianSmooth(cumX, this.smoothing);
    var smoothY = VEA._gaussianSmooth(cumY, this.smoothing);
    var smoothR = VEA._gaussianSmooth(cumR, this.smoothing);

    // Compute correction = smoothed - original cumulative
    this._smoothedData = [];
    for (var j = 0; j < n; j++) {
      this._smoothedData.push({
        dx: smoothX[j] - cumX[j],
        dy: smoothY[j] - cumY[j],
        rotation: smoothR[j] - cumR[j]
      });
    }
  };

  VEA.VideoStabilizer.prototype.getTransform = function(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this._smoothedData.length) {
      return { dx: 0, dy: 0, rotation: 0, scale: this.cropZoom };
    }
    var d = this._smoothedData[frameIndex];
    return {
      dx: d.dx,
      dy: d.dy,
      rotation: d.rotation,
      scale: this.cropZoom
    };
  };

  VEA.VideoStabilizer.prototype.applyToFrame = function(sourceCanvas, frameIndex) {
    var transform = this.getTransform(frameIndex);
    var w = sourceCanvas.width;
    var h = sourceCanvas.height;

    var outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    var ctx = outCanvas.getContext('2d');

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(transform.scale, transform.scale);
    if (transform.rotation) ctx.rotate(transform.rotation);
    ctx.translate(transform.dx - w / 2, transform.dy - h / 2);
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();

    return outCanvas;
  };

  VEA.VideoStabilizer.prototype.getStatus = function() { return this._status; };

  VEA.VideoStabilizer.prototype.getFrameCount = function() { return this._smoothedData.length; };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'stabilization', parent: 'video.ve-advanced-features', title: 've-advanced-features: stabilization', mount: function () {}, unmount: function () {} });
  }
})();
