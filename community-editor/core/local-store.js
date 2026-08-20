/* ============================================================
   core/local-store.js - THE local persistence layer for the Community Edition.

   In this build the browser IS the storage. That is why this file exists and why it is not
   localStorage: the quota there is 5 MB and it was measured FULL on a real machine (5120 KB of
   5 MB, most of it `dika_versions__*`). A full quota rejects a 25-byte write exactly like a
   5 MB one. In the cloud editor that is an annoyance; with no server it is silent, total data loss.

   THE SHAPE, and why it looks like this:

   - A SYNCHRONOUS FACADE over an asynchronous store. `core/autosave.js` reads and writes storage
     synchronously in a dozen places (it was written against localStorage). Rewriting all of it to
     be async would be a large change to the one subsystem that must not break, so the active
     project is held in memory and IndexedDB is written behind it. Reads are memory. Writes are
     memory-then-flush, and a FAILED flush is reported rather than swallowed, because "saved" is the
     only word in this app that must never be a guess.

   - ONE ACTIVE PROJECT, NAMED IN THE URL. `?project=<id>` (English key, rule 11). The URL is a
     REQUEST to open, never a claim: an unknown id falls back to a new project rather than being
     trusted. The row is the truth (rule 10).

   - THE INDEX IS WRITTEN IN THE SAME TRANSACTION AS THE DOC. An index that can disagree with the
     document is a project list that lies about what is inside it.

   - `updatedAt` IS WRITTEN BY WRITES ONLY. Opening a project must not touch it, or "newest first"
     silently becomes "last opened" - the exact defect that hit portal/db-sync.js.

   - QUOTA IS A FIRST-CLASS ERROR, with numbers, and it offers the export. A save that fails quietly
     is the worst outcome this file can produce.

   Record: internal Community Edition plan §7.
   ============================================================ */
(function () {
  'use strict';

  var LEGACY_DOC_KEY = 'dika_autosave';
  var LEGACY_VER_PREFIX = 'dika_versions';
  var LAST_OPEN_KEY = 'cc_last_project';      // a pointer, not data: safe in localStorage
  var FLUSH_MS = 400;
  var VERSION_BYTES_CAP = 40 * 1024 * 1024;   // history is a convenience; the doc is the work

  var _id = null;
  var _doc = null;         // the active project's payload, in memory
  var _versions = [];      // the active project's history, in memory
  var _meta = null;        // its index row
  var _docDirty = false, _verDirty = false;
  var _flushTimer = null;
  var _lastError = null;
  var _listeners = [];
  var _readyResolve = null;

  function _uid() {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return 'p' + t + r;
  }

  function _param(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; }
  }

  function _setUrlProject(id) {
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get('project') === id) return;
      u.searchParams.set('project', id);
      window.history.replaceState(null, '', u.toString());   // replace, never push: this is not navigation
    } catch (e) {}
  }

  function _emit(kind, detail) {
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](kind, detail); } catch (e) {}
    }
    try { if (window.cc && cc.emit) cc.emit('local-store:' + kind, detail || {}); } catch (e) {}
  }

  function _bytes(obj) {
    try { return JSON.stringify(obj).length; } catch (e) { return 0; }
  }

  function _title() {
    try {
      var t = (window.pages && window.pages[0] && window.pages[0].label) || '';
      if (t) return String(t).slice(0, 120);
    } catch (e) {}
    return 'Untitled project';
  }

  function _kind() {
    try {
      var p = window.pages && window.pages[window.currentPageIndex || 0];
      return (p && p._productType) || 'card';
    } catch (e) { return 'card'; }
  }

  /* ── flush ─────────────────────────────────────────────────────────────── */

  function _scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(function () { _flushTimer = null; flush(); }, FLUSH_MS);
  }

  function flush() {
    if (!window.CCIdb || !CCIdb.available() || !_id) return Promise.resolve(false);
    var jobs = [];
    if (_docDirty) {
      var doc = _doc, id = _id;
      _docDirty = false;
      _meta = _meta || { id: id, createdAt: Date.now() };
      _meta.title = _title();
      _meta.kind = _kind();
      _meta.updatedAt = Date.now();          // writes only. Opening never lands here.
      _meta.pageCount = (doc && doc.pages && doc.pages.length) || 0;
      _meta.bytes = _bytes(doc);
      jobs.push(CCIdb.put('docs', doc, id));
      jobs.push(CCIdb.put('projects', _meta));
    }
    if (_verDirty) {
      _verDirty = false;
      jobs.push(CCIdb.put('versions', _versions, _id));
    }
    if (!jobs.length) return Promise.resolve(true);
    return Promise.all(jobs).then(function () {
      if (_lastError) { _lastError = null; _emit('write-ok', {}); }
      return true;
    })['catch'](function (err) {
      _docDirty = true;   // the memory copy is still the truth; try again on the next write
      _lastError = err;
      _reportWriteFailure(err);
      return false;
    });
  }

  function _reportWriteFailure(err) {
    var quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err && err.message)));
    CCIdb.estimate().then(function (est) {
      var detail = { error: err, quota: !!quota, estimate: est };
      _emit('write-failed', detail);
      if (typeof window.showToast === 'function') {
        window.showToast(quota
          ? 'This browser is out of storage, so your work could not be saved. Export the project to a file to keep it.'
          : 'Could not save to this browser: ' + (err && err.message ? err.message : 'unknown error'), 'error');
      }
    });
  }

  /* ── migration ─────────────────────────────────────────────────────────── */

  /* Somebody may already have work in the standalone editor's localStorage. Import it, and KEEP the
     source until the destination reads back. A migration that deletes its input before verifying its
     output is how a cleanup becomes a data-loss report. */
  function _migrateLegacy(targetId) {
    var raw = null, vraw = null;
    try { raw = localStorage.getItem(LEGACY_DOC_KEY); } catch (e) {}
    try { vraw = localStorage.getItem(LEGACY_VER_PREFIX); } catch (e) {}
    if (!raw) return Promise.resolve(false);
    var payload = null, versions = [];
    try { payload = JSON.parse(raw); } catch (e) { return Promise.resolve(false); }
    try { versions = vraw ? (JSON.parse(vraw) || []) : []; } catch (e) { versions = []; }
    if (!payload) return Promise.resolve(false);
    var meta = {
      id: targetId, title: 'Imported project', kind: 'card',
      createdAt: Date.now(), updatedAt: Date.now(),
      pageCount: (payload.pages && payload.pages.length) || 0, bytes: _bytes(payload)
    };
    return Promise.all([
      CCIdb.put('docs', payload, targetId),
      CCIdb.put('versions', versions, targetId),
      CCIdb.put('projects', meta)
    ]).then(function () {
      return CCIdb.get('docs', targetId);
    }).then(function (readBack) {
      if (!readBack) return false;
      /* Verified. Only now is the old copy removed. */
      try { localStorage.removeItem(LEGACY_DOC_KEY); } catch (e) {}
      try { localStorage.removeItem(LEGACY_VER_PREFIX); } catch (e) {}
      _doc = payload; _versions = versions; _meta = meta;
      return true;
    })['catch'](function () { return false; });
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */

  var ready = new Promise(function (resolve) { _readyResolve = resolve; });

  function _resolveActiveId() {
    var wanted = _param('project');
    if (wanted) return CCIdb.get('projects', wanted).then(function (row) {
      /* The URL is a request, not a claim: an id nobody has is not opened, it is replaced. */
      return row ? wanted : null;
    })['catch'](function () { return null; });
    var last = null;
    try { last = localStorage.getItem(LAST_OPEN_KEY); } catch (e) {}
    if (!last) return Promise.resolve(null);
    return CCIdb.get('projects', last).then(function (row) { return row ? last : null; })
      ['catch'](function () { return null; });
  }

  function _boot() {
    if (!window.CCIdb || !CCIdb.available()) {
      /* No IndexedDB at all (private mode in some engines). Say it once, plainly: this session
         cannot keep anything, and the export menu is the only way out. */
      _emit('unavailable', {});
      if (typeof window.showToast === 'function') {
        setTimeout(function () {
          window.showToast('This browser will not let the editor store anything, so nothing you do here is kept. Export your work to a file before closing the tab.', 'error');
        }, 2000);
      }
      _readyResolve(false);
      return;
    }
    CCIdb.persist();   // best effort, before the first write
    _resolveActiveId().then(function (id) {
      if (id) {
        _id = id;
        return Promise.all([CCIdb.get('docs', id), CCIdb.get('versions', id), CCIdb.get('projects', id)])
          .then(function (r) { _doc = r[0] || null; _versions = r[1] || []; _meta = r[2] || null; });
      }
      _id = _uid();
      return _migrateLegacy(_id);
    }).then(function () {
      _setUrlProject(_id);
      try { localStorage.setItem(LAST_OPEN_KEY, _id); } catch (e) {}
      _emit('ready', { id: _id, hasDoc: !!_doc });
      _readyResolve(true);
    })['catch'](function (err) {
      _lastError = err;
      _emit('ready', { id: _id, hasDoc: false, error: err });
      _readyResolve(false);
    });
  }

  /* ── public API ────────────────────────────────────────────────────────── */

  var CCLocalStore = {
    ready: ready,
    id: function () { return _id; },
    meta: function () { return _meta; },
    lastError: function () { return _lastError; },
    onChange: function (fn) { if (typeof fn === 'function') _listeners.push(fn); },

    /* The doc. Sync in both directions; the write lands in IndexedDB within FLUSH_MS. */
    readDoc: function () { return _doc; },
    writeDoc: function (payload) {
      _doc = payload;
      _docDirty = true;
      _scheduleFlush();
      return true;
    },
    clearDoc: function () {
      _doc = null; _versions = [];
      if (!_id || !window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
      return Promise.all([CCIdb.del('docs', _id), CCIdb.del('versions', _id)]).then(function () { return true; })
        ['catch'](function () { return false; });
    },

    /* Version history. Capped by BYTES as well as count: the count cap is what let localStorage
       fill up, because one 5 MB version is not the same as one 5 KB version. */
    getVersions: function () { return _versions.slice(); },
    setVersions: function (arr) {
      var list = Array.isArray(arr) ? arr.slice() : [];
      var total = 0, kept = [];
      for (var i = 0; i < list.length; i++) {          // newest first, as autosave keeps them
        var b = _bytes(list[i]);
        if (total + b > VERSION_BYTES_CAP && kept.length) break;
        total += b; kept.push(list[i]);
      }
      _versions = kept;
      _verDirty = true;
      _scheduleFlush();
      return kept.length !== list.length ? { trimmed: list.length - kept.length } : true;
    },

    /* The project index. */
    listProjects: function () {
      if (!window.CCIdb || !CCIdb.available()) return Promise.resolve([]);
      return CCIdb.all('projects').then(function (rows) {
        return (rows || []).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      })['catch'](function () { return []; });
    },
    openProject: function (id) {
      if (!id || id === _id) return Promise.resolve(false);
      return flush().then(function () {
        try { localStorage.setItem(LAST_OPEN_KEY, id); } catch (e) {}
        var u = new URL(window.location.href);
        u.searchParams.set('project', id);
        window.location.assign(u.toString());   // a full reload: the canvas is rebuilt from the doc
        return true;
      });
    },
    newProject: function () {
      return flush().then(function () {
        var u = new URL(window.location.href);
        u.searchParams['delete']('project');
        try { localStorage.removeItem(LAST_OPEN_KEY); } catch (e) {}
        window.location.assign(u.toString());
        return true;
      });
    },
    renameProject: function (id, title) {
      if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
      return CCIdb.get('projects', id).then(function (row) {
        if (!row) return false;
        row.title = String(title || '').slice(0, 120) || row.title;
        if (id === _id && _meta) _meta.title = row.title;
        return CCIdb.put('projects', row).then(function () { return true; });
      });
    },
    deleteProject: function (id) {
      if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
      return Promise.all([CCIdb.del('projects', id), CCIdb.del('docs', id), CCIdb.del('versions', id)])
        .then(function () { return true; });
    },

    flush: flush,
    estimate: function () { return window.CCIdb ? CCIdb.estimate() : Promise.resolve(null); },
    persisted: function () { return window.CCIdb ? CCIdb.persisted() : Promise.resolve(false); }
  };

  window.CCLocalStore = CCLocalStore;
  _boot();

  /* A tab being hidden or closed is the last chance to land the current work. The flush is async and
     unload cannot wait for it, so the memory copy is also written straight through here. */
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', function () { flush(); });
})();
