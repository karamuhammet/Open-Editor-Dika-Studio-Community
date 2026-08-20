/* Module: video/ve-media-pipeline/framecache — Decoded-frame LRU cache + memory budget.
   Part of the ve-media-pipeline group (decomposed from the 1385-line IIFE). Functions hang off the
   shared namespace VMP (window.__ccVEMediaPipeline, created by the parent); cross-module refs resolve
   through VMP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMP = window.__ccVEMediaPipeline;
  if (!VMP) return;

  VMP.FrameCache = {
    get: function(key) {
      var entry = VMP._mpFrameCache[key];
      if (!entry) return null;
      // Move to front (most recent)
      var idx = VMP._mpFrameCacheOrder.indexOf(key);
      if (idx > 0) {
        VMP._mpFrameCacheOrder.splice(idx, 1);
        VMP._mpFrameCacheOrder.unshift(key);
      }
      return entry;
    },

    put: function(key, bitmap) {
      if (VMP._mpFrameCache[key]) {
        // Replace existing
        if (VMP._mpFrameCache[key] !== bitmap && typeof VMP._mpFrameCache[key].close === 'function') {
          try { VMP._mpFrameCache[key].close(); } catch(e) {}
        }
        VMP._mpFrameCache[key] = bitmap;
        return;
      }

      // Evict if at capacity
      while (VMP._mpFrameCacheSize >= VMP.FRAME_CACHE_MAX && VMP._mpFrameCacheOrder.length > 0) {
        var evictKey = VMP._mpFrameCacheOrder.pop();
        var evicted = VMP._mpFrameCache[evictKey];
        if (evicted && typeof evicted.close === 'function') {
          try { evicted.close(); } catch(e) {}
        }
        delete VMP._mpFrameCache[evictKey];
        VMP._mpFrameCacheSize--;
      }

      VMP._mpFrameCache[key] = bitmap;
      VMP._mpFrameCacheOrder.unshift(key);
      VMP._mpFrameCacheSize++;
    },

    invalidate: function(clipId) {
      var prefix = clipId + '_';
      var toRemove = [];
      for (var key in VMP._mpFrameCache) {
        if (key.indexOf(prefix) === 0) toRemove.push(key);
      }
      for (var i = 0; i < toRemove.length; i++) {
        var entry = VMP._mpFrameCache[toRemove[i]];
        if (entry && typeof entry.close === 'function') {
          try { entry.close(); } catch(e) {}
        }
        delete VMP._mpFrameCache[toRemove[i]];
        var idx = VMP._mpFrameCacheOrder.indexOf(toRemove[i]);
        if (idx >= 0) VMP._mpFrameCacheOrder.splice(idx, 1);
        VMP._mpFrameCacheSize--;
      }
    },

    clear: function() {
      for (var key in VMP._mpFrameCache) {
        if (VMP._mpFrameCache[key] && typeof VMP._mpFrameCache[key].close === 'function') {
          try { VMP._mpFrameCache[key].close(); } catch(e) {}
        }
      }
      VMP._mpFrameCache = {};
      VMP._mpFrameCacheOrder = [];
      VMP._mpFrameCacheSize = 0;
    },

    getSize: function() { return VMP._mpFrameCacheSize; },
    getMaxSize: function() { return VMP.FRAME_CACHE_MAX; }
  };

  VMP.MemoryBudget = {
    _maxMB: 800,  // 800MB budget for media

    /**
     * Estimate current memory usage from caches
     */
    estimate: function() {
      var thumbMB = 0; // Rough estimate: each thumb ~5KB
      var frameMB = VMP.FrameCache.getSize() * 8; // ~8MB per 1080p frame (uncompressed)
      return { thumbMB: thumbMB, frameMB: frameMB, totalMB: thumbMB + frameMB };
    },

    /**
     * Check if we're within budget
     */
    isWithinBudget: function() {
      return this.estimate().totalMB < this._maxMB;
    },

    /**
     * Free memory by evicting caches
     */
    freeMemory: function(targetMB) {
      var current = this.estimate().totalMB;
      if (current <= targetMB) return;
      // Evict frame cache first (larger)
      while (VMP.FrameCache.getSize() > 0 && this.estimate().totalMB > targetMB) {
        var evictKey = VMP._mpFrameCacheOrder.pop();
        if (evictKey) {
          var evicted = VMP._mpFrameCache[evictKey];
          if (evicted && typeof evicted.close === 'function') {
            try { evicted.close(); } catch(e) {}
          }
          delete VMP._mpFrameCache[evictKey];
          VMP._mpFrameCacheSize--;
        }
      }
    },

    setMaxMB: function(mb) { this._maxMB = mb; }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'framecache', parent: 'video.ve-media-pipeline', title: 've-media-pipeline: framecache', mount: function () {}, unmount: function () {} });
  }
})();
