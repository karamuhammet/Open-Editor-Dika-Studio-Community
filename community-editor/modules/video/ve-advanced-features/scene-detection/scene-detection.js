/* Module: video/ve-advanced-features/scene-detection — Scene Detection — histogram-difference cut finder
   Part of the ve-advanced-features group (decomposed from the 2015-line IIFE). Functions hang off the
   shared namespace VEA (window.__ccVEAdvanced, created by the parent); cross-module refs resolve
   through VEA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;

  VEA.SceneDetector = function (opts) {
    opts = opts || {};
    this.threshold = opts.threshold || 30;     // Histogram difference threshold
    this.minSceneLength = opts.minSceneLength || 0.5; // Min scene length in seconds
    this._lastHistogram = null;
    this._scenes = [];
    this._offCanvas = document.createElement('canvas');
    this._offCtx = this._offCanvas.getContext('2d');
  };

  VEA._computeHistogram = function (data) {
    var hist = new Uint32Array(64); // 64-bin grayscale
    for (var i = 0; i < data.length; i += 4) {
      var luma = Math.round((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 4);
      hist[Math.min(63, luma)]++;
    }
    return hist;
  };

  VEA._histogramDifference = function (histA, histB) {
    var diff = 0;
    var totalA = 0;
    for (var i = 0; i < histA.length; i++) {
      diff += Math.abs(histA[i] - histB[i]);
      totalA += histA[i];
    }
    return totalA > 0 ? (diff / totalA) * 100 : 0;
  };

  VEA.SceneDetector.prototype.analyzeVideo = function(videoEl, callback) {
    if (!videoEl || !videoEl.duration) {
      if (callback) callback([]);
      return;
    }

    var self = this;
    var fps = 10; // Analyze at 10fps for speed
    var dt = 1.0 / fps;
    var totalFrames = Math.ceil(videoEl.duration * fps);
    var currentFrame = 0;
    var scenes = [{ start: 0, end: 0 }];

    self._offCanvas.width = 64;
    self._offCanvas.height = 36; // Low-res for speed

    var lastHist = null;

    function processFrame() {
      if (currentFrame >= totalFrames) {
        scenes[scenes.length - 1].end = videoEl.duration;
        self._scenes = scenes;
        if (callback) callback(scenes);
        return;
      }

      var time = currentFrame * dt;
      videoEl.currentTime = time;

      videoEl.onseeked = function() {
        videoEl.onseeked = null;
        self._offCtx.drawImage(videoEl, 0, 0, 64, 36);
        var imgData = self._offCtx.getImageData(0, 0, 64, 36);
        var hist = VEA._computeHistogram(imgData.data);

        if (lastHist) {
          var diff = VEA._histogramDifference(lastHist, hist);
          if (diff > self.threshold && (time - scenes[scenes.length - 1].start) > self.minSceneLength) {
            scenes[scenes.length - 1].end = time;
            scenes.push({ start: time, end: 0 });
          }
        }

        lastHist = hist;
        currentFrame++;
        // Use setTimeout to avoid call stack overflow
        setTimeout(processFrame, 0);
      };
    }

    processFrame();
  };

  VEA.SceneDetector.prototype.getScenes = function() {
    return this._scenes.slice();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'scene-detection', parent: 'video.ve-advanced-features', title: 've-advanced-features: scene-detection', mount: function () {}, unmount: function () {} });
  }
})();
