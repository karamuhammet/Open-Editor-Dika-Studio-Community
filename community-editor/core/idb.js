/* ============================================================
   core/idb.js - THE IndexedDB opener for the Community Editor. One database, one opener.

   Why it exists: this build has no server, so the browser IS the storage. localStorage cannot carry
   it - the quota is 5 MB and it was measured FULL on a real machine (5120 KB of 5 MB, mostly
   `dika_versions__*`), and a full quota rejects a 25-byte write exactly like a 5 MB one. In the
   cloud editor that is an annoyance; here it would be silent, total data loss.

   Rules:
   - ONE database, ONE place that opens it. A second opener with a different version number makes
     every later `onupgradeneeded` a race, and the loser gets `VersionError` forever.
   - Stores are declared HERE, in `STORES`, in one list. Adding one is a version bump plus a line.
   - Never throws at import time and never assumes IndexedDB exists (private mode, old engines):
     `CCIdb.available()` answers, and every call rejects with a real Error rather than hanging.
   - No schema on top: this is get/put/del/all/keys/clear plus quota. What a record MEANS belongs to
     the module that owns its store.

   Existing IndexedDB use in the editor (fonts, video media blobs) has its OWN databases and is
   deliberately untouched: that code works offline already.

   Record: internal Community Edition plan §7.2.
   ============================================================ */
(function () {
  'use strict';

  var DB_NAME = 'dika-community';
  var DB_VERSION = 1;

  /* store name -> keyPath (null = the key is passed in, not read off the value) */
  var STORES = {
    projects: 'id',   // the project INDEX: {id,title,kind,createdAt,updatedAt,coverThumb,pageCount,bytes}
    docs: null,       // projectId -> the serialized document
    versions: null,   // "<projectId>:<ts>" -> a version-history entry
    settings: null,   // key -> preferences, brand sets, radial menu, keyboard map
    secrets: null     // provider -> a stock media API key (six providers, nothing else)
  };

  var _db = null;
  var _opening = null;

  function available() {
    try {
      return typeof indexedDB !== 'undefined' && !!indexedDB;
    } catch (e) {
      return false;
    }
  }

  /* THE RENAME MOVES FIRST, THEN WE OPEN. This database was called `cardcraft-community` before the
     product name was retired; opening the new name while the copy is still running would create an
     empty database beside somebody's projects. `CCMigrate.db` is a cached promise, so the copy
     happens once and every later open just waits on a resolved value.
     Record: docs/dika-rename-plan.md P5. */
  function migrated() {
    if (window.CCMigrate && CCMigrate.db) return CCMigrate.db('cardcraft-community', DB_NAME);
    return Promise.resolve(false);
  }

  function open() {
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;
    if (!available()) {
      return Promise.reject(new Error('IndexedDB is not available in this browser session'));
    }
    _opening = migrated().then(function () { return new Promise(function (resolve, reject) {
      var req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        for (var name in STORES) {
          if (!Object.prototype.hasOwnProperty.call(STORES, name)) continue;
          if (db.objectStoreNames.contains(name)) continue;
          var kp = STORES[name];
          db.createObjectStore(name, kp ? { keyPath: kp } : undefined);
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        /* Another tab upgrading the schema closes this handle. Drop it so the next call reopens
           instead of failing forever on a dead connection. */
        _db.onversionchange = function () { try { _db.close(); } catch (e) {} _db = null; };
        resolve(_db);
      };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
      req.onblocked = function () { reject(new Error('IndexedDB open blocked by another tab')); };
    }); });
    _opening.catch(function () { _opening = null; });
    return _opening;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t, s, req;
        try {
          t = db.transaction(store, mode);
          s = t.objectStore(store);
          req = fn(s);
        } catch (e) {
          reject(e);
          return;
        }
        t.onabort = function () { reject(t.error || new Error('IndexedDB transaction aborted')); };
        t.onerror = function () { reject(t.error || new Error('IndexedDB transaction failed')); };
        t.oncomplete = function () { resolve(req ? req.result : undefined); };
      });
    });
  }

  var CCIdb = {
    name: DB_NAME,
    version: DB_VERSION,
    stores: STORES,
    available: available,
    open: open,

    /* Drop our handle so somebody else can delete the database. `indexedDB.deleteDatabase` on a
       database with an open connection fires `onblocked` and then waits for ever, so the "remove all
       local data" button would sit there saying "Removing..." with no error. The next call to
       `open()` reconnects, which is why this is safe to call at any time. */
    close: function () {
      try { if (_db) _db.close(); } catch (e) {}
      _db = null;
      _opening = null;
    },

    get: function (store, key) {
      return tx(store, 'readonly', function (s) { return s.get(key); });
    },
    put: function (store, value, key) {
      return tx(store, 'readwrite', function (s) {
        return STORES[store] ? s.put(value) : s.put(value, key);
      });
    },
    del: function (store, key) {
      return tx(store, 'readwrite', function (s) { return s['delete'](key); });
    },
    all: function (store) {
      return tx(store, 'readonly', function (s) { return s.getAll(); });
    },
    keys: function (store) {
      return tx(store, 'readonly', function (s) { return s.getAllKeys(); });
    },
    clear: function (store) {
      return tx(store, 'readwrite', function (s) { return s.clear(); });
    },

    /* How much room is left, in bytes. Returns null when the browser will not say, so a caller can
       tell "no answer" from "no space" instead of drawing a full bar over a shrug. */
    estimate: function () {
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
      return navigator.storage.estimate().then(function (e) {
        var usage = e && typeof e.usage === 'number' ? e.usage : null;
        var quota = e && typeof e.quota === 'number' ? e.quota : null;
        if (usage === null || quota === null) return null;
        return { usage: usage, quota: quota, free: Math.max(0, quota - usage) };
      })['catch'](function () { return null; });
    },

    /* Ask the browser not to evict this origin. Without it the whole database can be cleared under
       storage pressure, and the user will call that data loss, correctly. Best effort, never throws. */
    persist: function () {
      if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
      return navigator.storage.persist()['catch'](function () { return false; });
    },
    persisted: function () {
      if (!navigator.storage || !navigator.storage.persisted) return Promise.resolve(false);
      return navigator.storage.persisted()['catch'](function () { return false; });
    }
  };

  window.CCIdb = CCIdb;
})();
