/* system/page-sleep - Page LRU virtualization ("Sayfa Uykusu"), enterprise scale.
   docs/editor-sleep-mode-plan.md. v2 (owner 2026-07-18: "gercek uyku + UI + acik gelsin").

   WHY: a non-active page is already OFF the fabric canvas, so a sleep FLAG frees nothing
   (the dead group-sleep mistake). Real sleep PARKS `page.json` into IndexedDB and drops
   it from RAM entirely, keeping only light metadata in `pages[]`. Covers EVERY source of
   many pages (bulk builder, manual duplication, imports), not just bulk image runs.

   v2 storage model (the v1 `_psRam` permanent mirror kept base64 strings in RAM and was
   MEASURED not to free memory - removed):
   - park: json string -> IndexedDB; `_psRam[key]` holds it ONLY until the IDB write
     confirms, then is deleted. Steady-state RAM for a slept page = ~0 (light metadata).
   - `_psObjCount` is stamped on the page at park (works/content-score readouts).
   - hydrate: transient `_psRam` (sync) else IndexedDB (async).
   - SAVE paths: standalone localStorage docs store slept pages as MARKERS
     (`json:null,_slept,_sleptKey`; content lives in IndexedDB, same browser) - this also
     kills the localStorage quota blowup at 500 pages. REMOTE saves must ship the FULL
     doc (cross-device): callers run `prefetchForSave(cb)` first, which loads all slept
     strings into a TEMP `_psSaveMap` consumed by jsonForSave, then `releaseSaveMap()`.
     A marker doc must NEVER reach the server.

   SCOPE: auto-sleep only for PLAIN pages (content in page.json). Video / scene / slide /
   board pages are excluded (subsystem state); the active page + a neighbor window and
   PINNED (manually woken) pages never auto-sleep. Enabled by default, maxAwake 20
   (owner), configurable in Settings > Uyku + per-tab right-click sleep/wake. */
(function (global) {
  'use strict';

  var DB_NAME = 'DikaPagesDB';
  var DB_VERSION = 1;
  var STORE = 'sleptPages';
  var LS_KEY = 'cc_page_sleep';

  var settings = { enabled: true, maxAwake: 20, neighborWindow: 2 };
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.enabled === 'boolean') settings.enabled = saved.enabled;
      if (typeof saved.maxAwake === 'number' && saved.maxAwake >= 1) settings.maxAwake = saved.maxAwake;
      if (typeof saved.neighborWindow === 'number' && saved.neighborWindow >= 0) settings.neighborWindow = saved.neighborWindow;
    }
  } catch (e) { /* defaults */ }

  var _psRam = {};      // key -> json string, TRANSIENT (until the IDB write confirms)
  var _psSaveMap = {};  // key -> json string, TEMP during a prefetched (remote/file) save
  var _psSaveMapOn = false;
  var _pinned = {};     // pageId -> true (manually woken; LRU skips)
  var _lru = {};        // pageId -> tick
  var _clock = 0;

  function _touch(pageId) { if (pageId) _lru[pageId] = ++_clock; }

  /* Parked pages moved from `CardCraftPagesDB` with the rename; the copy runs before this open
     (docs/dika-rename-plan.md P5). */
  function openDB() {
    var moved = (window.CCMigrate && CCMigrate.db)
      ? CCMigrate.db('CardCraftPagesDB', DB_NAME) : Promise.resolve(false);
    return moved.then(function () { return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    }); });
  }
  function idbPut(key, json) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ key: key, json: json });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result ? req.result.json : null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbGetMany(keys) {
    if (!keys.length) return Promise.resolve({});
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var out = {};
        var tx = db.transaction(STORE, 'readonly');
        var store = tx.objectStore(STORE);
        var left = keys.length;
        keys.forEach(function (k) {
          var req = store.get(k);
          req.onsuccess = function () { if (req.result) out[k] = req.result.json; if (--left === 0) resolve(out); };
          req.onerror = function () { if (--left === 0) resolve(out); };
        });
      });
    });
  }

  function isSleepable(page) {
    if (!page) return false;
    if (page._isBoard || page._slideDeck || page._videoProject || page._scene) return false;
    var t = page._productType;
    if (t === 'video' || t === 'scene' || t === 'slide') return false;
    return true;
  }

  function _parkKey(page) {
    if (typeof _pgEnsurePageId === 'function') _pgEnsurePageId(page);
    return page._pageId ? ('sp-' + page._pageId) : null;
  }

  function _countObjs(json) {
    return (json && json.objects && json.objects.length) || 0;
  }

  /* Park one page. Returns true when it slept. `manual` clears the pin. */
  function sleepPage(index, manual) {
    var page = pages[index];
    if (!page || page._slept || index === currentPageIndex) return false;
    if (!isSleepable(page) || page.json == null) return false;
    var key = _parkKey(page);
    if (!key) return false;
    if (manual) delete _pinned[page._pageId];
    var jsonStr = (typeof page.json === 'string') ? page.json : JSON.stringify(page.json);
    page._psObjCount = _countObjs(page.json);
    _psRam[key] = jsonStr;                 // transient: guards data until IDB confirms
    idbPut(key, jsonStr).then(function () {
      if (!_psSaveMapOn) delete _psRam[key];   // TRUE eviction: string leaves RAM
    }).catch(function () { /* IDB failed: keep the transient copy, data never lost */ });
    page._slept = true;
    page._sleptKey = key;
    page.json = null;
    if (typeof renderPageTabs === 'function') { try { renderPageTabs(); } catch (e) {} }
    return true;
  }

  /* Ensure pages[index].json exists, then cb(). Sync when the transient copy is around. */
  function ensurePageHydrated(index, cb) {
    cb = cb || function () {};
    var page = pages[index];
    if (!page) { cb(); return; }
    _touch(page._pageId);
    if (!page._slept) { cb(); return; }
    var key = page._sleptKey || _parkKey(page);
    function apply(s) {
      if (s != null && page._slept) {
        page.json = JSON.parse(s);
        page._slept = false;
        page._sleptKey = null;
        _touch(page._pageId);
        if (typeof renderPageTabs === 'function') { try { renderPageTabs(); } catch (e) {} }
      }
      cb();
    }
    if (_psRam[key] != null) { apply(_psRam[key]); return; }
    if (_psSaveMap[key] != null) { apply(_psSaveMap[key]); return; }
    idbGet(key).then(apply).catch(function () { cb(); });
  }

  /* Manual wake: hydrate + PIN so auto-evict leaves it alone until re-slept manually. */
  function wakePage(index, cb) {
    var page = pages[index];
    if (page && page._pageId) _pinned[page._pageId] = true;
    ensurePageHydrated(index, cb);
  }

  function _countSlept() {
    var n = 0;
    for (var i = 0; i < pages.length; i++) if (pages[i] && pages[i]._slept) n++;
    return n;
  }

  /* Evict LRU sleepable pages beyond the awake budget. */
  function evictIfNeeded() {
    if (!settings.enabled) return 0;
    if (typeof pages === 'undefined' || !pages) return 0;
    var lo = Math.max(0, currentPageIndex - settings.neighborWindow);
    var hi = Math.min(pages.length - 1, currentPageIndex + settings.neighborWindow);
    var cand = [];
    for (var i = 0; i < pages.length; i++) {
      if (i >= lo && i <= hi) continue;
      var p = pages[i];
      if (!p || p._slept || !isSleepable(p) || p.json == null) continue;
      if (p._pageId && _pinned[p._pageId]) continue;
      cand.push(i);
    }
    var awake = pages.length - _countSlept();
    var overflow = awake - settings.maxAwake;
    if (overflow <= 0) return 0;
    cand.sort(function (a, b) { return (_lru[pages[a]._pageId] || 0) - (_lru[pages[b]._pageId] || 0); });
    var slept = 0;
    for (var c = 0; c < cand.length && slept < overflow; c++) if (sleepPage(cand[c])) slept++;
    return slept;
  }

  /* "Tumunu uyut": sleep every eligible page regardless of budget (active+window excluded). */
  function sleepAllNow() {
    var lo = Math.max(0, currentPageIndex - settings.neighborWindow);
    var hi = Math.min(pages.length - 1, currentPageIndex + settings.neighborWindow);
    var n = 0;
    for (var i = 0; i < pages.length; i++) {
      if (i >= lo && i <= hi) continue;
      if (pages[i] && pages[i]._pageId) delete _pinned[pages[i]._pageId];
      if (sleepPage(i)) n++;
    }
    return n;
  }

  /* SAVE-path sync accessor. Hot -> json. Slept -> transient/saveMap string, else null
     (null = the caller emits MARKERS; only the standalone localStorage doc may do that). */
  function jsonForSave(page) {
    if (!page) return null;
    if (!page._slept) return page.json;
    var key = page._sleptKey || (page._pageId ? 'sp-' + page._pageId : null);
    if (!key) return null;
    var s = (_psRam[key] != null) ? _psRam[key] : _psSaveMap[key];
    return s != null ? JSON.parse(s) : null;
  }

  /* Load every slept page's string into the TEMP save map (remote/file exports need the
     FULL doc). Caller runs its sync serialize inside cb, then releaseSaveMap(). */
  function prefetchForSave(cb) {
    cb = cb || function () {};
    var keys = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      if (p && p._slept && p._sleptKey && _psRam[p._sleptKey] == null) keys.push(p._sleptKey);
    }
    _psSaveMapOn = true;
    if (!keys.length) { cb(); return; }
    idbGetMany(keys).then(function (map) {
      for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) _psSaveMap[k] = map[k];
      cb();
    }).catch(function () { cb(); });
  }
  function releaseSaveMap() {
    _psSaveMap = {};
    _psSaveMapOn = false;
  }
  function hasSlept() { return _countSlept() > 0; }

  function stats() {
    var slept = _countSlept();
    return { enabled: settings.enabled, maxAwake: settings.maxAwake, neighborWindow: settings.neighborWindow, total: (typeof pages !== 'undefined' && pages) ? pages.length : 0, slept: slept, awake: ((typeof pages !== 'undefined' && pages) ? pages.length : 0) - slept };
  }

  function configure(patch) {
    if (!patch) return;
    if (typeof patch.enabled === 'boolean') settings.enabled = patch.enabled;
    if (typeof patch.maxAwake === 'number' && patch.maxAwake >= 1) settings.maxAwake = Math.round(patch.maxAwake);
    if (typeof patch.neighborWindow === 'number' && patch.neighborWindow >= 0) settings.neighborWindow = Math.round(patch.neighborWindow);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ enabled: settings.enabled, maxAwake: settings.maxAwake, neighborWindow: settings.neighborWindow })); } catch (e) {}
    if (settings.enabled) evictIfNeeded();
  }

  global.CCPageSleep = {
    ensurePageHydrated: ensurePageHydrated,
    sleepPage: sleepPage,
    wakePage: wakePage,
    sleepAllNow: sleepAllNow,
    evictIfNeeded: evictIfNeeded,
    isSleepable: isSleepable,
    jsonForSave: jsonForSave,
    prefetchForSave: prefetchForSave,
    releaseSaveMap: releaseSaveMap,
    hasSlept: hasSlept,
    configure: configure,
    stats: stats,
    touch: function (pageId) { _touch(pageId); },
    settings: settings
  };
  global._psHydratePage = ensurePageHydrated;
  global._psEvictIfNeeded = evictIfNeeded;
  global._psJsonForSave = jsonForSave;

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'page-sleep', parent: 'system', title: 'Page sleep (LRU virtualization)', mount: function () {}, unmount: function () {} });
  }
})(window);
