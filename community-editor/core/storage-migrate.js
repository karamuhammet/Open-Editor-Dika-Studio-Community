/* ============================================================
   core/storage-migrate.js - MOVES the stored data when a name changes.

   The product's working name was retired (docs/dika-rename-plan.md). Renaming a `localStorage` key or
   an IndexedDB database does not move anything: the old value stays under the old name and the app
   starts from empty, which reads exactly like "it deleted my work". This file is the copy step that
   makes a rename safe, and it is the ONLY place allowed to do it.

   Two mechanisms, because the two storages behave differently:

   - localStorage is SYNCHRONOUS, so the sweep runs at load time, from a script tag placed directly
     after core/edition.js and before every module. Nothing can read a key before it has moved.
     It is a PREFIX sweep, not a table of 45 names: keys like `cardcraft_plugin_<id>` and
     `cardcraft_pending_<x>` are built at runtime and a hand-written table could never list them.

   - IndexedDB is ASYNCHRONOUS and cannot be migrated from here without a race: a module that opens
     the new name while the copy is still running would create an empty database beside it. So the
     copy is exposed as `CCMigrate.db(oldName, newName)`, a cached promise, and each of the seven
     database owners awaits it before opening. Seven small edits, and no timing assumption.

   RULES that keep this safe:
   - Copy, verify, THEN delete. Never delete first.
   - Idempotent: if the new name already exists, do nothing at all. Running twice is a no-op.
   - Never overwrite: a key already present under the new name wins, and the old copy is dropped.
   - Fail SOFT: any error leaves the old data exactly where it was and the app keeps working with it.
     Losing a rename is an inconvenience; losing somebody's project is not recoverable.
   ============================================================ */
(function () {
  'use strict';

  var OLD = 'cardcraft';
  var NEW = 'dika';
  var log = [];

  /* ── localStorage / sessionStorage ──────────────────────────────────────────────────────────── */

  function sweep(store, label) {
    var moved = 0, kept = 0, keys = [];
    try {
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        if (k && (k.indexOf(OLD + '_') === 0 || k.indexOf(OLD + '-') === 0)) keys.push(k);
      }
    } catch (e) { return; }   // storage disabled entirely: nothing to do, and nothing to break

    for (var j = 0; j < keys.length; j++) {
      var oldKey = keys[j];
      var newKey = NEW + oldKey.slice(OLD.length);
      try {
        if (store.getItem(newKey) === null) {
          store.setItem(newKey, store.getItem(oldKey));
          /* Read it back before dropping the original. A quota error on setItem throws, but a
             silently truncated write would not, and the delete below is not reversible. */
          if (store.getItem(newKey) === null) continue;
          moved++;
        } else {
          kept++;   // the new key already has a value: it is the newer one, keep it
        }
        store.removeItem(oldKey);
      } catch (e) {
        /* Out of quota, or a value we cannot copy. Leave the old key alone: the app still reads it
           through the fallback below, so nothing is lost by giving up here. */
      }
    }
    if (moved || kept) log.push(label + ': moved ' + moved + ', already present ' + kept);
  }

  try { sweep(window.localStorage, 'localStorage'); } catch (e) {}
  try { sweep(window.sessionStorage, 'sessionStorage'); } catch (e) {}

  /* ── IndexedDB ──────────────────────────────────────────────────────────────────────────────── */

  var dbJobs = {};

  function dbExists(name) {
    /* `indexedDB.databases()` is the only way to ask without creating one. Where it is missing
       (older Safari), report "unknown" as false: the caller then just opens the new name, which is
       correct for a fresh profile and only costs the rename on an old one. */
    if (!window.indexedDB || typeof indexedDB.databases !== 'function') return Promise.resolve(false);
    return indexedDB.databases().then(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].name === name) return true;
      return false;
    })['catch'](function () { return false; });
  }

  function openRaw(name) {
    return new Promise(function (resolve, reject) {
      var rq = indexedDB.open(name);
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error || new Error('open failed: ' + name)); };
      rq.onblocked = function () { reject(new Error('blocked: ' + name)); };
    });
  }

  function deleteDb(name) {
    return new Promise(function (resolve) {
      var rq = indexedDB.deleteDatabase(name);
      rq.onsuccess = rq.onerror = rq.onblocked = function () { resolve(); };
    });
  }

  /* Everything about a store that has to survive the move: its key configuration and its indexes.
     Copying rows without these produces a database that looks full and cannot be queried. */
  function readEverything(db) {
    var stores = Array.prototype.slice.call(db.objectStoreNames);
    if (!stores.length) return Promise.resolve({ schema: [], rows: {} });
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(stores, 'readonly');
      var schema = [], rows = {}, left = stores.length;
      stores.forEach(function (name) {
        var os = tx.objectStore(name);
        var indexes = [];
        for (var i = 0; i < os.indexNames.length; i++) {
          var ix = os.index(os.indexNames[i]);
          indexes.push({ name: ix.name, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry });
        }
        schema.push({ name: name, keyPath: os.keyPath, autoIncrement: os.autoIncrement, indexes: indexes });
        /* Keys are read separately: an out-of-line store (no keyPath) needs them to write the rows
           back, and getAll() alone would silently drop them. */
        var vals = os.getAll(), keys = os.getAllKeys();
        var pair = {};
        vals.onsuccess = function () { pair.values = vals.result; if (pair.keys) { rows[name] = pair; if (!--left) resolve({ schema: schema, rows: rows }); } };
        keys.onsuccess = function () { pair.keys = keys.result; if (pair.values) { rows[name] = pair; if (!--left) resolve({ schema: schema, rows: rows }); } };
      });
      tx.onerror = function () { reject(tx.error || new Error('read failed')); };
    });
  }

  function writeEverything(name, version, schema, rows) {
    return new Promise(function (resolve, reject) {
      var rq = indexedDB.open(name, version || 1);
      rq.onupgradeneeded = function () {
        var db = rq.result;
        schema.forEach(function (s) {
          if (db.objectStoreNames.contains(s.name)) return;
          var os = db.createObjectStore(s.name, { keyPath: s.keyPath, autoIncrement: s.autoIncrement });
          s.indexes.forEach(function (ix) {
            try { os.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry }); } catch (e) {}
          });
        });
      };
      rq.onerror = function () { reject(rq.error || new Error('create failed: ' + name)); };
      rq.onsuccess = function () {
        var db = rq.result;
        var names = schema.map(function (s) { return s.name; });
        if (!names.length) { db.close(); resolve(0); return; }
        var tx = db.transaction(names, 'readwrite');
        var written = 0;
        names.forEach(function (n) {
          var os = tx.objectStore(n);
          var pair = rows[n] || { values: [], keys: [] };
          for (var i = 0; i < pair.values.length; i++) {
            try {
              if (os.keyPath === null || os.keyPath === undefined) os.put(pair.values[i], pair.keys[i]);
              else os.put(pair.values[i]);
              written++;
            } catch (e) { /* one unwritable row must not cost the other thousand */ }
          }
        });
        tx.oncomplete = function () { db.close(); resolve(written); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('write failed: ' + name)); };
      };
    });
  }

  /* THE PUBLIC CALL. Every owner of a renamed database awaits this before opening its new name. */
  function migrateDb(oldName, newName) {
    if (dbJobs[newName]) return dbJobs[newName];
    dbJobs[newName] = dbExists(newName).then(function (hasNew) {
      if (hasNew) return false;                       // already migrated, or already in use
      return dbExists(oldName).then(function (hasOld) {
        if (!hasOld) return false;                    // fresh profile: nothing to move
        return openRaw(oldName).then(function (src) {
          var version = src.version;
          return readEverything(src).then(function (payload) {
            src.close();
            if (!payload.schema.length) return deleteDb(oldName).then(function () { return false; });
            return writeEverything(newName, version, payload.schema, payload.rows).then(function (n) {
              log.push('IndexedDB ' + oldName + ' -> ' + newName + ': ' + n + ' record(s)');
              return deleteDb(oldName).then(function () { return true; });
            });
          })['catch'](function (e) { try { src.close(); } catch (e2) {} throw e; });
        });
      });
    })['catch'](function (e) {
      /* The old database stays exactly as it was. The caller opens the new name and gets an empty
         one, which is wrong but recoverable; deleting anything here would not be. */
      log.push('IndexedDB ' + oldName + ' -> ' + newName + ' FAILED: ' + (e && e.message ? e.message : e));
      return false;
    });
    return dbJobs[newName];
  }

  window.CCMigrate = {
    db: migrateDb,
    /* Read by the About screen and by the proof; also the one place to look when somebody asks
       "did my settings survive the update". */
    report: function () { return log.slice(); }
  };

  if (log.length && window.console && console.info) console.info('[cc.migrate] ' + log.join(' | '));
})();
