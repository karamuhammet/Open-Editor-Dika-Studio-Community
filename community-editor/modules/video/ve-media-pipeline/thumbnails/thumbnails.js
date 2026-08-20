/* Module: video/ve-media-pipeline/thumbnails — Thumbnail generation + IndexedDB cache.
   Part of the ve-media-pipeline group (decomposed from the 1385-line IIFE). Functions hang off the
   shared namespace VMP (window.__ccVEMediaPipeline, created by the parent); cross-module refs resolve
   through VMP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMP = window.__ccVEMediaPipeline;
  if (!VMP) return;

  VMP._mpOpenThumbDB = function () {
    if (VMP._mpThumbDB) return Promise.resolve(VMP._mpThumbDB);
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(VMP._mpThumbDBName, VMP._mpThumbDBVersion);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('thumbs')) {
          db.createObjectStore('thumbs', { keyPath: 'key' });
        }
      };
      req.onsuccess = function(e) {
        VMP._mpThumbDB = e.target.result;
        resolve(VMP._mpThumbDB);
      };
      req.onerror = function() { reject(new Error('IndexedDB failed')); };
    });
  };

  VMP.ThumbnailCache = {
    /**
     * Get cached thumbnails for a clip
     * @param {string} clipId
     * @returns {Promise<string[]|null>} array of data URLs or null
     */
    get: function(clipId) {
      return VMP._mpOpenThumbDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('thumbs', 'readonly');
          var store = tx.objectStore('thumbs');
          var req = store.get(clipId);
          req.onsuccess = function() {
            resolve(req.result ? req.result.thumbs : null);
          };
          req.onerror = function() { resolve(null); };
        });
      }).catch(function() { return null; });
    },

    /**
     * Store thumbnails for a clip
     * @param {string} clipId
     * @param {string[]} thumbs - data URLs
     * @param {Object} meta - { duration, zoom, count }
     */
    put: function(clipId, thumbs, meta) {
      return VMP._mpOpenThumbDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('thumbs', 'readwrite');
          var store = tx.objectStore('thumbs');
          store.put({ key: clipId, thumbs: thumbs, meta: meta || {}, ts: Date.now() });
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        });
      }).catch(function() {});
    },

    /**
     * Invalidate thumbnails for a clip
     */
    invalidate: function(clipId) {
      return VMP._mpOpenThumbDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('thumbs', 'readwrite');
          tx.objectStore('thumbs').delete(clipId);
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        });
      }).catch(function() {});
    },

    /**
     * Clear all cached thumbnails
     */
    clear: function() {
      return VMP._mpOpenThumbDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('thumbs', 'readwrite');
          tx.objectStore('thumbs').clear();
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        });
      }).catch(function() {});
    }
  };

  VMP._mpGenerateThumbnails = function (clip, videoEl, opts) {
    opts = opts || {};
    var zoom = opts.zoom || 50;
    var clipPx = Math.max(4, Math.round(clip.duration * zoom));
    var count = Math.min(VMP.THUMB_MAX_COUNT, Math.max(VMP.THUMB_MIN_COUNT, Math.ceil(clipPx / VMP.THUMB_WIDTH)));

    // Check cache first
    if (!opts.forceRegenerate) {
      return VMP.ThumbnailCache.get(clip.id).then(function(cached) {
        if (cached && cached.length >= count) {
          clip._thumbCache = cached;
          return cached;
        }
        return VMP._mpGenerateThumbnailsCore(clip, videoEl, count);
      });
    }
    return VMP._mpGenerateThumbnailsCore(clip, videoEl, count);
  };

  VMP._mpGenerateThumbnailsCore = function (clip, videoEl, count) {
    return new Promise(function(resolve) {
      var thumbs = [];
      var generated = 0;
      var thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = VMP.THUMB_WIDTH;
      thumbCanvas.height = VMP.THUMB_HEIGHT;
      var tCtx = thumbCanvas.getContext('2d');
      var srcDur = clip._srcDuration || (videoEl && isFinite(videoEl.duration) ? videoEl.duration : 0) || 0;

      // Timeout safeguard
      var timeout = setTimeout(function() {
        clip._thumbCache = thumbs;
        VMP.ThumbnailCache.put(clip.id, thumbs, { duration: clip.duration, count: count });
        resolve(thumbs);
      }, count * 1000 + 5000); // generous timeout

      function captureFrame(idx) {
        if (idx >= count) {
          clearTimeout(timeout);
          clip._thumbCache = thumbs;
          VMP.ThumbnailCache.put(clip.id, thumbs, { duration: clip.duration, count: count });
          resolve(thumbs);
          return;
        }

        var seekTime = (clip.duration / count) * (idx + 0.5);
        // Loop-aware wrapping
        if (srcDur > 0 && seekTime > srcDur) {
          var loopStart = clip.trimStart || 0;
          var loopLen = srcDur - loopStart;
          if (loopLen > 0) seekTime = loopStart + ((seekTime - loopStart) % loopLen);
        }

        var targetTime = Math.min(seekTime, (videoEl.duration || srcDur) - 0.05);
        if (!isFinite(targetTime) || targetTime < 0) targetTime = 0;

        function onSeeked() {
          videoEl.removeEventListener('seeked', onSeeked);
          clearTimeout(seekTimeout);
          try {
            tCtx.drawImage(videoEl, 0, 0, VMP.THUMB_WIDTH, VMP.THUMB_HEIGHT);
            thumbs.push(thumbCanvas.toDataURL('image/jpeg', VMP.THUMB_QUALITY));
          } catch (ex) {
            thumbs.push('');
          }
          generated++;
          captureFrame(generated);
        }

        var seekTimeout = setTimeout(function() {
          videoEl.removeEventListener('seeked', onSeeked);
          thumbs.push('');
          generated++;
          captureFrame(generated);
        }, 2000);

        videoEl.addEventListener('seeked', onSeeked);
        videoEl.currentTime = targetTime;
      }

      captureFrame(0);
    });
  };

  VMP._mpGenerateThumbnailsWebCodecs = function (clip, chunks, config) {
    return Promise.resolve([]);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'thumbnails', parent: 'video.ve-media-pipeline', title: 've-media-pipeline: thumbnails', mount: function () {}, unmount: function () {} });
  }
})();
