/* Module: video/ve-media-pipeline/proxy — Proxy (low-res) media workflow.
   Part of the ve-media-pipeline group (decomposed from the 1385-line IIFE). Functions hang off the
   shared namespace VMP (window.__ccVEMediaPipeline, created by the parent); cross-module refs resolve
   through VMP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMP = window.__ccVEMediaPipeline;
  if (!VMP) return;

  VMP._mpOpenProxyDB = function () {
    if (VMP._mpProxyDB) return Promise.resolve(VMP._mpProxyDB);
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(VMP._mpProxyDBName, 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('proxies')) {
          db.createObjectStore('proxies', { keyPath: 'clipId' });
        }
      };
      req.onsuccess = function(e) { VMP._mpProxyDB = e.target.result; resolve(VMP._mpProxyDB); };
      req.onerror = function() { reject(new Error('Proxy DB failed')); };
    });
  };

  VMP.ProxyManager = {
    _proxies: {},  // clipId → { proxyUrl, originalUrl, resolution, generated }
    _mode: 'edit', // 'edit' | 'export'

    /**
     * Generate a proxy for a clip
     * @param {string} clipId
     * @param {File|Blob} originalFile
     * @param {Object} opts - { resolution, codec, bitrate, onProgress }
     * @returns {Promise<{proxyUrl: string}>}
     */
    generate: function(clipId, originalFile, opts) {
      return Promise.reject(new Error('Codec Pipeline not available'));
    },

    /**
     * Check if proxy is available for a clip
     */
    isAvailable: function(clipId) {
      return !!this._proxies[clipId];
    },

    /**
     * Get the active URL (proxy for edit mode, original for export)
     */
    getActiveUrl: function(clipId) {
      var entry = this._proxies[clipId];
      if (!entry) return null;
      return this._mode === 'edit' ? entry.proxyUrl : entry.originalUrl;
    },

    /**
     * Get proxy URL
     */
    getProxyUrl: function(clipId) {
      var entry = this._proxies[clipId];
      return entry ? entry.proxyUrl : null;
    },

    /**
     * Get original URL
     */
    getOriginalUrl: function(clipId) {
      var entry = this._proxies[clipId];
      return entry ? entry.originalUrl : null;
    },

    /**
     * Switch between edit and export modes
     */
    setMode: function(mode) {
      this._mode = mode === 'export' ? 'export' : 'edit';
    },

    /**
     * Generate proxies for multiple clips
     */
    generateAll: function(clips, opts) {
      var self = this;
      opts = opts || {};
      var completed = 0;
      var chain = Promise.resolve();

      for (var i = 0; i < clips.length; i++) {
        (function(clip) {
          chain = chain.then(function() {
            if (!clip._file) return; // No original file reference
            return self.generate(clip.id, clip._file, {
              resolution: opts.resolution,
              onProgress: function(pct) {
                if (opts.onProgress) {
                  opts.onProgress((completed + pct) / clips.length);
                }
              }
            }).then(function() {
              completed++;
            }).catch(function() {
              completed++;
            });
          });
        })(clips[i]);
      }

      return chain;
    },

    /**
     * Get total proxy cache size
     */
    getTotalSize: function() {
      var total = 0;
      for (var key in this._proxies) {
        if (this._proxies[key] && this._proxies[key].size) {
          total += this._proxies[key].size;
        }
      }
      return total;
    },

    /**
     * Purge old proxies
     */
    purge: function(maxAgeMs) {
      maxAgeMs = maxAgeMs || 24 * 60 * 60 * 1000; // 24h default
      var now = Date.now();
      for (var key in this._proxies) {
        if (this._proxies[key] && now - this._proxies[key].generated > maxAgeMs) {
          if (this._proxies[key].proxyUrl) {
            try { URL.revokeObjectURL(this._proxies[key].proxyUrl); } catch(e) {}
          }
          delete this._proxies[key];
        }
      }
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'proxy', parent: 'video.ve-media-pipeline', title: 've-media-pipeline: proxy', mount: function () {}, unmount: function () {} });
  }
})();
