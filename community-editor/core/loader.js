/* ============================================================
   dika studio core — module LOADER (build-free).
   Reads modules/manifest.json (a JSON array of module folder names)
   and loads each module's <name>.css + <name>.js. Each module loads
   in a way that a failure is logged and SKIPPED — it never blocks the
   rest. With an empty manifest (Faz 0) the loader is dormant and the
   app is unchanged.

   Adding a module = create modules/<name>/ + regenerate manifest.json
   (node tools/build-manifest.mjs). index.html is NEVER edited to add
   a module — that is what keeps parallel sessions conflict-free.
   ============================================================ */
(function (global) {
  'use strict';
  var cc = global.cc || (global.cc = {});
  var BASE = 'modules/';
  var _started = false;

  // Cache-bust injected module assets so edits never go stale (no-build dev workflow).
  // The JSON fetches below already use {cache:'no-store'}; injected <script>/<link> are
  // cached normally by the browser, so without a version query a changed module file would
  // keep serving the OLD cached copy — silently out of sync with a freshly-loaded app.js.
  // Per page-load timestamp → all modules in one load share it (consistent), fresh each
  // reload. Set window.CC_MODVER (e.g. a build hash) before this script for prod caching.
  var MODVER = (typeof global.CC_MODVER !== 'undefined' && global.CC_MODVER !== null)
    ? global.CC_MODVER : (global.Date && global.Date.now ? global.Date.now() : '1');
  function _ver(url) { return url + (url.indexOf('?') < 0 ? '?v=' : '&v=') + MODVER; }

  function _addCss(href) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onerror = function () { /* a module without a CSS file is fine */ };
    document.head.appendChild(link);
  }
  function _addJs(src) {
    return new global.Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;   // preserve order
      s.onload = function () { resolve(true); };
      s.onerror = function () {
        console.error('[cc.loader] could not load ' + src + ' — module skipped, app continues');
        resolve(false);
      };
      document.body.appendChild(s);
    });
  }

  function _loadFiles(dir, base) {
    _addCss(_ver(BASE + dir + '/' + base + '.css'));    // optional file; missing is harmless
    return _addJs(_ver(BASE + dir + '/' + base + '.js')); // entry: must call cc.modules.register(...)
  }
  // Load a module node, then recurse into its children — to ANY depth:
  //   modules/left-panel/  →  left-panel/text/  →  left-panel/text/styles/ …
  // Children are listed in each node's module.json "children" (kept up to date by
  // tools/build-manifest.mjs). A node with no children just loads flat.
  function _loadNode(dir, base) {
    return global.fetch(BASE + dir + '/module.json', { cache: 'no-store' })
      .then(function (r) { return (r && r.ok) ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (meta) {
        return _loadFiles(dir, base).then(function () {
          var kids = (meta && (meta.children || meta.submodules)) || [];
          if (!kids.length) return;
          var chain = global.Promise.resolve();
          kids.forEach(function (kid) {
            chain = chain.then(function () { return _loadNode(dir + '/' + kid, kid); });
          });
          return chain;
        });
      });
  }
  function loadModule(name) { return _loadNode(name, name); }

  /* COMMUNITY EDITION banner. The constraint is real but narrower than upstream's message said, and
     upstream's fix ("run pnpm dev, open localhost:3000/editor") does not exist in this build.

     What actually happens: index.html loads modules with fetch(manifest.json), and on a file:// page
     fetch is blocked by CORS (origin "null"), so no module loads while the plain <script> files keep
     working - which looks like "half the app is broken" rather than "this page needs a server".

     index.prod.html does NOT have that problem. It is one bundle in one <script> tag, so it opens
     from file:// perfectly well, and it is what this edition ships. So the banner points there
     first, and offers serving the folder as the alternative rather than as the only answer. */
  function _fileProtoWarn() {
    var msg = 'This page needs a web server. The bundled page does not.';
    var how = 'Open index.prod.html instead - it is a single bundle and works straight from a file. ' +
      'To use this page (index.html, which loads each module separately for development), serve the ' +
      'folder first: node scripts/static-server.js 8300';
    console.error('[cc.loader] ' + msg + ' ' + how);
    try {
      if (document.getElementById('cc-fileproto-banner')) return;
      var b = document.createElement('div');
      b.id = 'cc-fileproto-banner';
      b.style.cssText = 'position:fixed;inset:0 0 auto 0;z-index:2147483647;background:#7f1d1d;color:#fff;' +
        'font:600 14px/1.5 system-ui,Segoe UI,sans-serif;padding:14px 18px;text-align:center;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.5)';
      var here = '';
      try { here = location.href.replace(/[^/]*$/, 'index.prod.html'); } catch (e) { here = 'index.prod.html'; }
      b.innerHTML = '&#9888; ' + msg + '<br><span style="font-weight:400">' + how +
        '</span> &nbsp;<a href="' + here + '" style="color:#fde68a;font-weight:700">Open index.prod.html &rarr;</a>';
      var put = function () { if (document.body) document.body.appendChild(b); };
      if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
    } catch (e) { /* the console message above is the fallback */ }
  }

  // Load each module individually (dev path / bundle fallback). Reports progress to the boot overlay.
  function _loadList(list) {
    var total = list.length || 1, n = 0;
    if (global.__ccBoot) global.__ccBoot.set(8);
    var chain = global.Promise.resolve();
    list.forEach(function (name) {
      chain = chain.then(function () { return loadModule(name); }).then(function () {
        n++;
        if (global.__ccBoot) global.__ccBoot.set(8 + Math.round((n / total) * 84));
      });
    });
    return chain.then(function () {
      console.info('[cc.loader] loaded ' + list.length + ' module(s): ' + list.join(', '));
      if (cc.emit) cc.emit('modules:ready', list);
      if (global.__ccBoot) global.__ccBoot.done();
    });
  }

  function init() {
    if (_started) return; _started = true;

    /* COMMUNITY EDITION: THE BUNDLE NEEDS NO fetch AT ALL, so it must be handled BEFORE the file://
       guard, not after it. Upstream returned here on file: and the CC_BUNDLED branch below was
       therefore unreachable from a double-clicked file - the page loaded its <script> tags, showed
       the banner, and mounted zero modules. That is "the files are not loading".

       A bundle is two tags, `<script src="dist/modules.bundle.js">` and a `<link>`, and a tag is not
       a fetch: the browser loads both from file:// exactly as it does over http. The only two things
       that DID need fetch here are skipped:
         - manifest.json, which is read only for a module count in the log and the modules:ready
           payload. Consumers use that event as a signal, and the loader already emits it with an
           empty array in the zero-module case.
         - dist/bundle.meta.json, the stale-page self-heal. It exists because a SERVER can hand back
           cached HTML whose baked hash lags the bundle on disk. Opening a file has no such layer. */
    if (global.CC_BUNDLED) {
      _addCss(_ver('dist/modules.bundle.css'));
      var _fromFile = global.location && global.location.protocol === 'file:';
      if (_fromFile) {
        _addJs(_ver('dist/modules.bundle.js')).then(function (ok) {
          if (!ok) {
            console.error('[cc.loader] bundle failed to load from ' + global.location.href +
              ' - run tools/build-bundle.mjs, or open index.dev.html through a web server.');
            if (typeof _fileProtoWarn === 'function') _fileProtoWarn();
            return;
          }
          console.info('[cc.loader] bundle loaded from file://');
          if (cc.emit) cc.emit('modules:ready', []);
          if (global.__ccBoot) global.__ccBoot.done();
        });
        return;
      }
    }

    if (global.location && global.location.protocol === 'file:') {
      _fileProtoWarn();
      return;
    }
    if (!global.fetch || !global.Promise) {
      console.warn('[cc.loader] fetch/Promise unavailable — no modules loaded');
      return;
    }
    global.fetch(BASE + 'manifest.json', { cache: 'no-store' })
      .then(function (r) { return (r && r.ok) ? r.json() : []; })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) {
          console.info('[cc.loader] 0 modules (skeleton dormant)');
          if (cc.emit) cc.emit('modules:ready', []);
          if (global.__ccBoot) global.__ccBoot.done();
          return;
        }
        // PROD bundle mode (editor-perf-auth-plan B2): when window.CC_BUNDLED is set, all modules are
        // pre-concatenated into ONE file (tools/build-bundle.mjs, in THIS exact loader order). Load it
        // instead of ~880 per-module requests; fall back to per-module loading if it can't be fetched.
        if (global.CC_BUNDLED) {
          // RB6: self-heal a STALE page. The bundle URL is pinned by ?v=CC_MODVER
          // baked into the HTML; if the HTML itself came from browser cache, its
          // CC_MODVER lags the dist build on disk and the tab keeps running OLD
          // code no matter how many bundles we ship. bundle.meta.json is fetched
          // no-store, so a hash mismatch means exactly that: reload ONCE per
          // fresh hash to pick up the current HTML (session-guarded, no loops).
          try {
            fetch('dist/bundle.meta.json', { cache: 'no-store' })
              .then(function (r) { return r.json(); })
              .then(function (meta) {
                if (!meta || !meta.hash || String(meta.hash) === String(global.CC_MODVER)) return;
                var k = 'cc_bundle_reloaded_' + meta.hash;
                try {
                  if (sessionStorage.getItem(k)) { console.error('[cc.loader] bundle drift persists after reload (' + global.CC_MODVER + ' vs ' + meta.hash + ')'); return; }
                  sessionStorage.setItem(k, '1');
                } catch (eS) {}
                console.warn('[cc.loader] stale page (bundle ' + global.CC_MODVER + ' vs server ' + meta.hash + ') — reloading');
                // location.reload() can re-serve the CACHED html (it does not bypass cache), which
                // leaves CC_MODVER stale forever and the session-guard then blocks any retry. Navigate
                // to a hash-stamped URL instead so the browser MUST fetch fresh html (owner: changes
                // kept showing old until a manual cache clear). Existing params (?designId=) preserved.
                try {
                  var _u = new global.URL(global.location.href);
                  _u.searchParams.set('_ccv', String(meta.hash));
                  global.location.replace(_u.toString());
                } catch (eU) { global.location.reload(); }
              })
              .catch(function () { /* meta fetch is best-effort */ });
          } catch (eF) {}
          _addCss(_ver('dist/modules.bundle.css'));
          return _addJs(_ver('dist/modules.bundle.js')).then(function (ok) {
            if (ok) {
              console.info('[cc.loader] bundle loaded (' + list.length + ' modules)');
              if (cc.emit) cc.emit('modules:ready', list);
              if (global.__ccBoot) global.__ccBoot.done();
            } else {
              console.warn('[cc.loader] bundle failed — per-module fallback');
              return _loadList(list);
            }
          });
        }
        return _loadList(list);
      })
      .catch(function (e) { console.warn('[cc.loader] manifest load failed — no modules loaded:', e); });
  }

  // Lazy-load a CDN/vendor script ONCE on demand (editor-perf-auth-plan B3). Returns a cached promise
  // that resolves when the lib is ready. Heavy libs (Three, ExcelJS, …) are removed from index.html
  // and loaded here the first time their feature is opened, keeping them off the boot critical path.
  var _libs = {};
  var LIB_INTEGRITY = {
    'js/vendor/chart.umd.min.js': '',
    'js/vendor/bwip-js-min.js': '',
    'js/vendor/exceljs.min.js': '',
    'js/vendor/ag-psd-bundle.js': '',
    'js/vendor/pptxgen.bundle.js': '',
    'js/vendor/pdf.min.js': '',
    'js/vendor/pdf.worker.min.js': '',
    'js/vendor/jspdf.umd.min.js': '',
    'js/vendor/opentype.min.js': ''
  };
  function requireLib(url) {
    if (_libs[url]) return _libs[url];
    if (!Object.prototype.hasOwnProperty.call(LIB_INTEGRITY, url)) {
      return global.Promise.reject(new Error('[cc.loader] lib not allowlisted: ' + url));
    }
    _libs[url] = new global.Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url; s.async = false;
      if (LIB_INTEGRITY[url]) {
        s.integrity = LIB_INTEGRITY[url];
        s.crossOrigin = 'anonymous';
        s.referrerPolicy = 'no-referrer';
      }
      s.onload = function () { resolve(true); };
      s.onerror = function () { _libs[url] = null; reject(new Error('[cc.loader] lib failed: ' + url)); };
      document.head.appendChild(s);
    });
    return _libs[url];
  }

  cc.loader = { init: init, loadModule: loadModule, requireLib: requireLib, base: BASE };
  cc.requireLib = requireLib;
  global.cc = cc;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
