/* Module: video/ve-performance/advanced — Katman 4 — advanced frame cache, texture atlas, memory monitor.
   Part of the ve-performance group (decomposed from the 1654-line IIFE). Functions hang off the
   shared namespace VEP (window.__ccVEPerformance, created by the parent); cross-module refs resolve
   through VEP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEP = window.__ccVEPerformance;
  if (!VEP) return;

  VEP.FrameCacheAdvanced = {
    _cache: {},
    _order: [],
    _size: 0,
    _maxSize: 100,
    _maxBytes: 800 * 1024 * 1024, // 800 MB
    _bytesUsed: 0,

    get: function(key) {
      var entry = this._cache[key];
      if (!entry) return null;
      // LRU: move to front
      var idx = this._order.indexOf(key);
      if (idx > 0) {
        this._order.splice(idx, 1);
        this._order.unshift(key);
      }
      return entry.data;
    },

    put: function(key, imageBitmap, byteSize) {
      var bs = byteSize || (imageBitmap.width * imageBitmap.height * 4);

      // Evict until we're under limits
      while ((this._size >= this._maxSize || this._bytesUsed + bs > this._maxBytes) && this._order.length > 0) {
        var evictKey = this._order.pop();
        var evicted = this._cache[evictKey];
        if (evicted) {
          if (evicted.data && typeof evicted.data.close === 'function') {
            try { evicted.data.close(); } catch (e) {}
          }
          this._bytesUsed -= (evicted.bytes || 0);
          delete this._cache[evictKey];
          this._size--;
        }
      }

      this._cache[key] = { data: imageBitmap, bytes: bs };
      this._order.unshift(key);
      this._size++;
      this._bytesUsed += bs;
    },

    invalidate: function(prefix) {
      var toRemove = [];
      for (var k in this._cache) {
        if (k.indexOf(prefix) === 0) toRemove.push(k);
      }
      for (var i = 0; i < toRemove.length; i++) {
        var key = toRemove[i];
        var entry = this._cache[key];
        if (entry && entry.data && typeof entry.data.close === 'function') {
          try { entry.data.close(); } catch (e) {}
        }
        this._bytesUsed -= (entry ? entry.bytes || 0 : 0);
        delete this._cache[key];
        this._size--;
        var idx = this._order.indexOf(key);
        if (idx >= 0) this._order.splice(idx, 1);
      }
    },

    clear: function() {
      for (var k in this._cache) {
        var entry = this._cache[k];
        if (entry && entry.data && typeof entry.data.close === 'function') {
          try { entry.data.close(); } catch (e) {}
        }
      }
      this._cache = {};
      this._order = [];
      this._size = 0;
      this._bytesUsed = 0;
    },

    getStats: function() {
      return {
        entries: this._size,
        maxEntries: this._maxSize,
        bytesUsed: this._bytesUsed,
        mbUsed: (this._bytesUsed / (1024 * 1024)).toFixed(1)
      };
    }
  };

  VEP.TextureAtlas = {
    _canvas: null,
    _ctx: null,
    _entries: {},
    _nextX: 0,
    _nextY: 0,
    _rowHeight: 0,
    _size: 4096,

    init: function(size) {
      this._size = size || 4096;
      this._canvas = document.createElement('canvas');
      this._canvas.width = this._size;
      this._canvas.height = this._size;
      this._ctx = this._canvas.getContext('2d');
      this._entries = {};
      this._nextX = 0;
      this._nextY = 0;
      this._rowHeight = 0;
    },

    /**
     * Add an image/canvas to the atlas
     * @returns {{x, y, w, h}} UV coordinates in the atlas
     */
    add: function(key, source, w, h) {
      if (this._entries[key]) return this._entries[key];

      // Ensure we fit
      if (this._nextX + w > this._size) {
        this._nextX = 0;
        this._nextY += this._rowHeight + 1;
        this._rowHeight = 0;
      }

      if (this._nextY + h > this._size) {
        console.warn('[VEP.TextureAtlas] Atlas full, cannot add:', key);
        return null;
      }

      this._ctx.drawImage(source, this._nextX, this._nextY, w, h);

      var entry = {
        x: this._nextX,
        y: this._nextY,
        w: w,
        h: h,
        u0: this._nextX / this._size,
        v0: this._nextY / this._size,
        u1: (this._nextX + w) / this._size,
        v1: (this._nextY + h) / this._size
      };

      this._entries[key] = entry;
      this._nextX += w + 1;
      if (h > this._rowHeight) this._rowHeight = h;

      return entry;
    },

    get: function(key) {
      return this._entries[key] || null;
    },

    getCanvas: function() {
      return this._canvas;
    },

    clear: function() {
      if (this._ctx) this._ctx.clearRect(0, 0, this._size, this._size);
      this._entries = {};
      this._nextX = 0;
      this._nextY = 0;
      this._rowHeight = 0;
    }
  };

  VEP.MemoryMonitor = {
    _enabled: false,
    _callbacks: [],

    init: function() {
      var self = this;

      // navigator.deviceMemory
      if (navigator.deviceMemory) {
        var totalGB = navigator.deviceMemory;
        // Reduce cache limits on low-memory devices
        if (totalGB <= 4) {
          VEP.FrameCacheAdvanced._maxSize = 50;
          VEP.FrameCacheAdvanced._maxBytes = 400 * 1024 * 1024;
        }
      }

      // Performance observer for memory pressure (experimental)
      if (typeof PerformanceObserver !== 'undefined') {
        try {
          var observer = new PerformanceObserver(function(list) {
            var entries = list.getEntries();
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].entryType === 'memory-pressure') {
                self._onPressure();
              }
            }
          });
          observer.observe({ type: 'memory-pressure', buffered: false });
          this._enabled = true;
        } catch (e) {
          // Not supported — that's ok
        }
      }
    },

    _onPressure: function() {
      console.warn('[VEPerformance] Memory pressure detected, cleaning up...');
      VEP.FrameCacheAdvanced.clear();
      if (VEP.WebGLPipeline._initialized) {
        // Don't VEP.destroy but clean FBO textures content
      }
      for (var i = 0; i < this._callbacks.length; i++) {
        try { this._callbacks[i](); } catch (e) {}
      }
    },

    onPressure: function(fn) {
      this._callbacks.push(fn);
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'advanced', parent: 'video.ve-performance', title: 've-performance: advanced', mount: function () {}, unmount: function () {} });
  }
})();
