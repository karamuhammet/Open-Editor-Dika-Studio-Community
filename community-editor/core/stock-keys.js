/* ============================================================
   core/stock-keys.js - the SIX stock media API keys, and the two globals five modules read them
   through.

   WHY THIS FILE EXISTS AT ALL. Upstream, `_aiGetState` / `_aiApplySettings` live inside the AI
   panel (`modules/left-panel/ai/shell/shell.js`), and five modules that have nothing to do with AI
   read `providerKeys` off them: the left gallery's Stock tab, the video media gallery's Stock tab,
   Items > GIF + Stickers, the shared image modal, and the AI tools. This build deletes the AI tree,
   so those two functions had to live somewhere. Keeping one AI file alive "just for this" is how the
   rest of the tree grows back, so they moved here, to a file that is about stock media and says so.

   WHAT IS AND IS NOT STORED HERE (owner, 2026-08-13):
   - Six STOCK MEDIA keys: Unsplash, Pexels, Pixabay, Freesound, Jamendo, GIPHY. Nothing else.
   - NO LLM key, ever. A stock key buys pictures under a documented free quota; an LLM key in a
     browser is an uncapped bill attached to a secret sitting in a local database, in a build we do
     not operate and cannot rate-limit. The AI panel in this edition is an ad surface with no local
     escape hatch, and this file is not the seventh field.

   HONESTY ABOUT WHAT THIS IS. The key is stored in this browser, in plain form. IndexedDB is not
   secure storage; it is used because it is not swept up by a stray `JSON.stringify(localStorage)` in
   a log or a bug report, and because it survives the 5 MB quota. The settings screen says this in
   one sentence. Do not add encryption theatre: a passphrase the app must also hold to make the
   request protects nobody and makes the promise false.

   Rules for anything touching this file:
   - The raw value is NEVER rendered back into the DOM. `hint()` is what a UI may show.
   - The raw value is NEVER logged, never put in a URL query we build for our own logs, and never
     included in an exported project package.
   - `_aiGetState()` returns a COPY. A caller that mutates the result must not mutate the store.

   Record: internal Community Edition plan §6.1, §7.5.
   ============================================================ */
(function () {
  'use strict';

  /* The vocabulary. A key not in this list cannot be stored, which is what stops the screen from
     quietly growing a seventh field. The `_` prefix is upstream's shape and is kept so the five
     readers work unchanged. */
  var FIELDS = ['_unsplash', '_pexels', '_pixabay', '_freesound', '_jamendo', '_giphy'];

  var STORE = 'secrets';

  /* The live copy every reader sees. IndexedDB is async and the Stock tab reads synchronously, so
     the store is loaded once at boot and this object is the answer from then on. */
  var providerKeys = {};
  var _loaded = false;
  var _loadPromise = null;

  function isField(k) {
    return FIELDS.indexOf(k) !== -1;
  }

  function load() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (window.CCIdb && CCIdb.available()
      ? CCIdb.all(STORE).then(function (rows) { return rows || []; })['catch'](function () { return []; })
      : Promise.resolve([])
    ).then(function (rows) {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r && isField(r.field) && typeof r.value === 'string' && r.value) providerKeys[r.field] = r.value;
      }
      _loaded = true;
      /* Late readers: the GIF slider paints its "no key" state on first open and does not re-render
         itself, so tell the app once the real answer is in. */
      try { if (window.cc && cc.emit) cc.emit('stock-keys:ready', { fields: Object.keys(providerKeys) }); } catch (e) {}
      return providerKeys;
    });
    return _loadPromise;
  }

  function save(field, value) {
    if (!isField(field)) return Promise.reject(new Error('unknown stock key field: ' + field));
    var v = String(value == null ? '' : value).trim();
    if (v) providerKeys[field] = v; else delete providerKeys[field];
    if (!(window.CCIdb && CCIdb.available())) return Promise.resolve(false);
    return (v ? CCIdb.put(STORE, { field: field, value: v }, field) : CCIdb.del(STORE, field))
      .then(function () { return true; });
  }

  function remove(field) {
    return save(field, '');
  }

  /* What a UI is allowed to show: whether a key is set, and its last four characters. Never the key.
     A field that repaints the secret is a secret in every screenshot and every accessibility tree,
     which is exactly what the pre-SaaS build did with `value="' + key + '"`. */
  function hint(field) {
    var v = providerKeys[field];
    if (!v) return null;
    return { set: true, last4: v.length > 4 ? v.slice(-4) : v, length: v.length };
  }

  function copyKeys() {
    var out = {};
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      if (providerKeys[f]) out[f] = providerKeys[f];
    }
    return out;
  }

  /* ── The two globals the five readers call ────────────────────────────────
     Upstream shape, deliberately: `state.providerKeys[keyField]`. The AI fields those readers never
     touch (provider, model, apiKey) are reported as empty rather than omitted, so a `state.provider`
     read cannot throw on a build where AI is gone. */
  window._aiGetState = function () {
    return {
      provider: '',
      model: '',
      apiKey: '',
      providerKeys: copyKeys()
    };
  };

  window._aiApplySettings = function (s) {
    if (!s || !s.stockKeys) return Promise.resolve(false);
    var jobs = [];
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      if (s.stockKeys[f] === undefined) continue;
      jobs.push(save(f, s.stockKeys[f]));
    }
    return Promise.all(jobs).then(function () {
      try { if (window.cc && cc.emit) cc.emit('stock-keys:changed', { fields: Object.keys(copyKeys()) }); } catch (e) {}
      return true;
    });
  };

  window.CCStockKeys = {
    FIELDS: FIELDS,
    load: load,
    save: save,
    remove: remove,
    hint: hint,
    has: function (field) { return !!providerKeys[field]; },
    any: function () { return Object.keys(copyKeys()).length > 0; },
    loaded: function () { return _loaded; },
    /* Deliberately NOT exposed: a getter for the raw value by field. The five readers go through
       `_aiGetState()`, which is one door and one place to audit. */
    ready: load()
  };
})();
