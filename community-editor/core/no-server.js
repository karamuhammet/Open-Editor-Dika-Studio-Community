/* ============================================================
   core/no-server.js - CCRemote / CCAssets / CCProducts, permanently inactive.

   Upstream these three are real HTTP adapters (`core/storage-remote.js`, `core/storage-remote-assets.js`,
   ~730 lines between them) that switch on a `?designId=` in the URL. This build has no server, so
   both files are DELETED and this is what stands in their place.

   WHY A STUB AND NOT NOTHING. Thirty-plus call sites across the editor already branch on
   `CCAssets.active` / `CCProducts.active` / `CCRemote.active`, which is the seam that made an
   offline build possible in the first place. Deleting the objects outright would turn every one of
   those guarded reads into a thrown TypeError in a module that is otherwise perfectly happy offline.
   So the objects exist, they answer `active: false`, and every method refuses the same way.

   WHY EVERY METHOD IS PRESENT. A guard is `CCAssets && CCAssets.active && CCAssets.uploadBlob` in
   most places and `CCAssets.uploadBlob(...)` in a few. Naming every method here means the few fail
   with a clear rejected promise instead of "uploadBlob is not a function", and it means this file
   is a readable inventory of exactly what the cloud build does that this one does not.

   IT MUST NEVER GROW A REAL IMPLEMENTATION. If something here starts making requests, the offline
   guarantee is gone and the offline build is quietly phoning home.

   Record: internal Community Edition plan §3, §7.
   ============================================================ */
(function () {
  'use strict';

  var WHY = 'This is the offline Community Edition: there is no dika studio server to talk to.';

  function refuse(name) {
    return function () {
      return Promise.reject(new Error(name + ': ' + WHY));
    };
  }
  function refuseSync(value) {
    return function () { return value; };
  }

  /* ── CCRemote: design load/save/versions/settings ─────────────────────────
     `core/autosave.js` asks `CCRemote.active && CCRemote.designId` and falls back to local storage
     when either is missing, so `active:false` is the whole switch. */
  window.CCRemote = {
    active: false,
    designId: null,
    designTitle: null,
    lastSaveOk: null,
    lastSaveError: null,
    isConflicted: refuseSync(false),
    load: refuse('CCRemote.load'),
    save: function () { /* autosave calls this unconditionally on the remote path only */ },
    saveNow: function () { return Promise.resolve(false); },
    listVersions: refuse('CCRemote.listVersions'),
    createVersion: refuse('CCRemote.createVersion'),
    restore: refuse('CCRemote.restore'),
    saveThumb: function () { return Promise.resolve(false); },
    beaconDownload: function () {},
    beaconExport: function () {},
    getSetting: function () { return Promise.resolve(null); },
    setSetting: function () { return Promise.resolve(false); },
    rename: refuse('CCRemote.rename')
  };

  /* ── CCAssets: the org media library ──────────────────────────────────────
     `proxyBase` is null on purpose. Upstream it is `/api/proxy` inside the panel and a local relay
     otherwise; a caller that reads it must find nothing rather than a URL that 404s. */
  window.CCAssets = {
    active: false,
    proxyBase: null,
    lastLibraryReadFailed: false,
    uploadBlob: refuse('CCAssets.uploadBlob'),
    saveStock: refuse('CCAssets.saveStock'),
    listAssets: function () { return Promise.resolve([]); },
    listMoreAssets: function () { return Promise.resolve([]); },
    hasMoreAssets: refuseSync(false),
    listFolders: function () { return Promise.resolve([]); },
    createFolder: refuse('CCAssets.createFolder'),
    updateFolder: refuse('CCAssets.updateFolder'),
    deleteFolder: refuse('CCAssets.deleteFolder'),
    patchAsset: refuse('CCAssets.patchAsset'),
    deleteAsset: refuse('CCAssets.deleteAsset'),
    listTags: function () { return Promise.resolve([]); },
    listBrands: function () { return Promise.resolve([]); },
    setAssetTags: refuse('CCAssets.setAssetTags')
  };

  /* ── CCProducts: the marketing product catalogue ──────────────────────────
     The Products panel is one of the two ad surfaces in this build, so it never asks these. */
  window.CCProducts = {
    active: false,
    listProducts: function () { return Promise.resolve({ items: [], total: 0 }); },
    getProduct: refuse('CCProducts.getProduct'),
    listCategories: function () { return Promise.resolve([]); },
    listAttributes: function () { return Promise.resolve([]); }
  };

  /* Upstream `storage-remote.js` also exports this bounded-fetch helper, and modules outside it use
     it for their own requests (a timeout plus caller cancellation). It has nothing to do with our
     API, so it stays: dropping it would break unrelated, perfectly offline code paths. */
  if (typeof window.CCFetchBounded !== 'function') {
    window.CCFetchBounded = function (path, opts, defaultTimeoutMs) {
      opts = opts || {};
      var init = {}, key;
      for (key in opts) if (key !== 'timeoutMs') init[key] = opts[key];
      var timeoutMs = Number(opts.timeoutMs || defaultTimeoutMs || 20000);
      if (typeof AbortController === 'undefined') return fetch(path, init);
      var controller = new AbortController();
      var callerSignal = init.signal;
      var timer = null;
      var onCallerAbort = function () { try { controller.abort(); } catch (e) {} };
      if (callerSignal) {
        if (callerSignal.aborted) onCallerAbort();
        else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
      }
      init.signal = controller.signal;
      if (isFinite(timeoutMs) && timeoutMs > 0) timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      function cleanup() {
        if (timer) clearTimeout(timer);
        if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
      }
      return Promise.resolve().then(function () { return fetch(path, init); })
        .then(function (r) { cleanup(); return r; }, function (e) { cleanup(); throw e; });
    };
  }
})();
