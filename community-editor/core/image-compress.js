/* Editor client-side image compressor (docs/image-compression-plan.md Phase 6).
 * ES5, no bundler. Global: window.ccCompressImage(file) -> Promise<File> (compressed
 * or the original on off/skip/error, so it never blocks an import). Wraps the vendored
 * browser-image-compression UMD (global `imageCompression`). Preset numbers MIRROR
 * apps/web/src/lib/upload-prefs.ts COMPRESS_PRESETS (3.2) - keep them in sync. */
(function () {
  'use strict';

  // Preset contract (single source of truth is upload-prefs.ts; mirrored here).
  var PRESETS = {
    light: { quality: 0.9, maxDim: 2560 },
    balanced: { quality: 0.8, maxDim: 1920 },
    aggressive: { quality: 0.6, maxDim: 1280 }
  };
  var DEFAULT_PREFS = { autoCompress: true, intensity: 'balanced', skipUnderKB: 200, format: 'auto' };
  // animation / vector / HEIC(engine can't decode): never re-encode -> upload the original.
  var NEVER = { 'image/gif': 1, 'image/svg+xml': 1, 'image/heic': 1, 'image/heif': 1 };

  // Absolute URL to the vendored engine so the worker's importScripts resolves in
  // both the embedded (/editor/) and standalone (:8200) contexts.
  var LIB = (function () {
    try { return new URL('js/vendor/browser-image-compression.js', document.baseURI).href; }
    catch (e) { return 'js/vendor/browser-image-compression.js'; }
  })();

  // Concurrency cap so a folder of 500 images never spawns 500 workers. When OffscreenCanvas/
  // Worker are missing the engine runs on the main thread, so drop to 1 to avoid janking the UI.
  var OFF_THREAD = (typeof Worker !== 'undefined') && (typeof OffscreenCanvas !== 'undefined');
  var MAX = OFF_THREAD ? Math.min((navigator.hardwareConcurrency || 4), 6) : 1;
  var active = 0;
  var waiters = [];
  function acquire() {
    if (active < MAX) { active++; return Promise.resolve(); }
    return new Promise(function (res) { waiters.push(function () { active++; res(); }); });
  }
  function release() { active--; var w = waiters.shift(); if (w) w(); }

  function resolvePrefs(raw) {
    var p = raw || {};
    return {
      autoCompress: typeof p.autoCompress === 'boolean' ? p.autoCompress : DEFAULT_PREFS.autoCompress,
      intensity: PRESETS[p.intensity] ? p.intensity : DEFAULT_PREFS.intensity,
      skipUnderKB: typeof p.skipUnderKB === 'number' ? p.skipUnderKB : DEFAULT_PREFS.skipUnderKB,
      format: (p.format === 'keep' || p.format === 'auto') ? p.format : DEFAULT_PREFS.format
    };
  }

  // Read the user's prefs once per editor session. Only fetch when portal-embedded
  // (same-origin /api with the portal session cookie); standalone falls back to defaults.
  var prefsPromise = null;
  function getPrefs() {
    if (prefsPromise) return prefsPromise;
    var embedded = (typeof getDesignId === 'function' && getDesignId()) || (window.CCAssets && window.CCAssets.active);
    if (!embedded) { prefsPromise = Promise.resolve(DEFAULT_PREFS); return prefsPromise; }
    prefsPromise = fetch('/api/user-settings', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (d) { return resolvePrefs(d && d.settings && d.settings.uploadPrefs); })
      .catch(function () { return DEFAULT_PREFS; });
    return prefsPromise;
  }

  function shouldCompress(file, prefs) {
    if (!prefs.autoCompress) return false;
    if (!file.type || file.type.indexOf('image/') !== 0) return false;
    if (NEVER[file.type]) return false;
    if (file.size <= prefs.skipUnderKB * 1024) return false;
    return true;
  }

  function renameForType(blob, name, type) {
    var ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : ((name.split('.').pop()) || 'img');
    var base = name.replace(/\.[^.]+$/, '') || 'image';
    try { return new File([blob], base + '.' + ext, { type: type }); }
    catch (e) { try { blob.name = base + '.' + ext; } catch (e2) {} return blob; }
  }

  // Compress one image File per the user's prefs. Never rejects.
  function compressImageFile(file) {
    if (!file || typeof imageCompression === 'undefined') return Promise.resolve(file);
    return getPrefs().then(function (prefs) {
      if (!shouldCompress(file, prefs)) return file;
      var preset = PRESETS[prefs.intensity];
      var type = prefs.format === 'keep' ? file.type : 'image/webp';
      return acquire().then(function () {
        return imageCompression(file, {
          maxWidthOrHeight: preset.maxDim,
          initialQuality: preset.quality,
          useWebWorker: true,
          libURL: LIB,
          fileType: prefs.format === 'keep' ? undefined : 'image/webp',
          preserveExif: file.type === 'image/jpeg'
        }).then(function (out) {
          release();
          if (!out || out.size >= file.size) return file; // no gain -> keep original
          return renameForType(out, file.name, type);
        }, function () { release(); return file; }); // engine error -> original
      });
    })['catch'](function () { return file; });
  }

  // Compress a File and resolve to a dataURL (compressed, or the original's dataURL on
  // skip/error). Convenience for the gallery intake paths that store dataURLs.
  function compressToDataUrl(file) {
    return compressImageFile(file).then(function (cfile) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function (ev) { resolve(ev.target.result); };
        r.onerror = function () { reject(new Error('read failed')); };
        r.readAsDataURL(cfile);
      });
    });
  }

  window.ccCompressImage = compressImageFile;
  window.ccCompressToDataUrl = compressToDataUrl;
})();
