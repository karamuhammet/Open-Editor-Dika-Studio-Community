/* Module: video/ve-media-pipeline/demux — Demuxers (Packet, BaseDemuxer, NativeDemuxer + factory) + lazy decode / stream read.
   Part of the ve-media-pipeline group (decomposed from the 1385-line IIFE). Functions hang off the
   shared namespace VMP (window.__ccVEMediaPipeline, created by the parent); cross-module refs resolve
   through VMP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMP = window.__ccVEMediaPipeline;
  if (!VMP) return;

  VMP.Packet = function (streamIndex, pts, dts, data, isKeyframe, duration) {
    this.streamIndex = streamIndex;
    this.pts = pts;
    this.dts = dts;
    this.data = data;
    this.isKeyframe = isKeyframe;
    this.duration = duration || 0;
  };

  VMP.BaseDemuxer = function () {
    this._opened = false;
    this._info = null;
    this._selectedStreams = null;
    this._keyframeIndex = [];
  };

  VMP.BaseDemuxer.prototype.open = function(/*source*/) { return Promise.reject(new Error('Not implemented')); };

  VMP.BaseDemuxer.prototype.getInfo = function() { return this._info; };

  VMP.BaseDemuxer.prototype.readPacket = function() { return Promise.reject(new Error('Not implemented')); };

  VMP.BaseDemuxer.prototype.seek = function(/*pts*/) { return Promise.reject(new Error('Not implemented')); };

  VMP.BaseDemuxer.prototype.selectStreams = function(indices) { this._selectedStreams = indices; };

  VMP.BaseDemuxer.prototype.getKeyframeIndex = function() { return this._keyframeIndex; };

  VMP.BaseDemuxer.prototype.close = function() { this._opened = false; };

  VMP.NativeDemuxer = function () {
    VMP.BaseDemuxer.call(this);
    this._el = null;
    this._url = null;
  };

  VMP.NativeDemuxer.prototype = Object.create(VMP.BaseDemuxer.prototype);

  VMP.NativeDemuxer.prototype.constructor = VMP.NativeDemuxer;

  VMP.NativeDemuxer.prototype.open = function(source) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var url = source instanceof File ? URL.createObjectURL(source) : source;
      self._url = url;
      var el = document.createElement('video');
      el.preload = 'auto';
      el.muted = true;

      var timeout = setTimeout(function() {
        reject(new Error('Demuxer open timeout'));
      }, 10000);

      el.addEventListener('loadedmetadata', function() {
        clearTimeout(timeout);
        self._el = el;
        self._opened = true;
        self._info = {
          duration: el.duration,
          videoWidth: el.videoWidth,
          videoHeight: el.videoHeight,
          streams: [{
            index: 0, type: 'video',
            codec: 'unknown',
            width: el.videoWidth,
            height: el.videoHeight
          }]
        };
        resolve(self._info);
      });

      el.addEventListener('error', function() {
        clearTimeout(timeout);
        reject(new Error('Cannot open media'));
      });

      el.src = url;
    });
  };

  VMP.NativeDemuxer.prototype.seekAndGetFrame = function(timeSeconds) {
    var el = this._el;
    if (!el) return Promise.reject(new Error('Not opened'));

    return new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() { reject(new Error('Seek timeout')); }, 3000);

      function onSeeked() {
        el.removeEventListener('seeked', onSeeked);
        clearTimeout(timeout);
        // Draw to canvas and create ImageBitmap
        var c = document.createElement('canvas');
        c.width = el.videoWidth;
        c.height = el.videoHeight;
        var ctx = c.getContext('2d');
        ctx.drawImage(el, 0, 0);
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(c).then(resolve).catch(function() {
            resolve(c); // fallback to canvas
          });
        } else {
          resolve(c);
        }
      }

      el.addEventListener('seeked', onSeeked);
      el.currentTime = Math.max(0, Math.min(timeSeconds, el.duration - 0.01));
    });
  };

  VMP.NativeDemuxer.prototype.close = function() {
    if (this._el) {
      this._el.pause();
      this._el.src = '';
      this._el = null;
    }
    if (this._url && this._url.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(this._url); } catch(e) {}
    }
    this._opened = false;
  };

  VMP.DemuxerFactory = {
    create: function(format) {
      // For now, VMP.NativeDemuxer handles all browser-playable formats
      // Future: MP4Demuxer for mp4box.js, WebMDemuxer for mkv
      return new VMP.NativeDemuxer();
    }
  };

  VMP._mpLazyDecode = function (clip, videoEl, viewStart, viewEnd, fps) {
    fps = fps || 30;
    var frameInterval = 1 / fps;
    var startFrame = Math.floor(viewStart * fps);
    var endFrame = Math.ceil(viewEnd * fps);
    var results = {};
    var needed = [];

    for (var i = startFrame; i <= endFrame; i++) {
      var key = clip.id + '_' + i;
      var cached = VMP.FrameCache.get(key);
      if (cached) {
        results[i] = cached;
      } else {
        needed.push(i);
      }
    }

    if (needed.length === 0) return Promise.resolve(results);

    // Decode needed frames via seek
    var chain = Promise.resolve();
    for (var n = 0; n < needed.length; n++) {
      (function(frameIdx) {
        chain = chain.then(function() {
          var time = frameIdx * frameInterval;
          return new Promise(function(resolve) {
            var timeout = setTimeout(function() { resolve(); }, 1000);
            function onSeeked() {
              videoEl.removeEventListener('seeked', onSeeked);
              clearTimeout(timeout);
              var c = document.createElement('canvas');
              c.width = videoEl.videoWidth || 640;
              c.height = videoEl.videoHeight || 360;
              var ctx = c.getContext('2d');
              try { ctx.drawImage(videoEl, 0, 0); } catch(e) {}
              var createBmp = typeof createImageBitmap === 'function'
                ? createImageBitmap(c)
                : Promise.resolve(c);
              createBmp.then(function(bmp) {
                var key = clip.id + '_' + frameIdx;
                VMP.FrameCache.put(key, bmp);
                results[frameIdx] = bmp;
                resolve();
              }).catch(function() { resolve(); });
            }
            videoEl.addEventListener('seeked', onSeeked);
            videoEl.currentTime = time;
          });
        });
      })(needed[n]);
    }

    return chain.then(function() { return results; });
  };

  VMP._mpStreamRead = function (file, onChunk, opts) {
    opts = opts || {};
    if (typeof file.stream !== 'function') {
      // Fallback: read entire file
      return file.arrayBuffer().then(function(buf) {
        onChunk(new Uint8Array(buf));
      });
    }

    var reader = file.stream().getReader();

    function pump() {
      return reader.read().then(function(result) {
        if (result.done) return;
        onChunk(result.value);
        return pump();
      });
    }

    return pump();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'demux', parent: 'video.ve-media-pipeline', title: 've-media-pipeline: demux', mount: function () {}, unmount: function () {} });
  }
})();
