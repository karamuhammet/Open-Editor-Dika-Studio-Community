/* ============================================================
   core/i18n.js - THE translation runtime for the offline editor.

   Built 2026-08-15. `scripts/i18n/RULES.md` deferred the editor to "its own approved project"
   because it is ES5 with no bundler; this is that project's foundation. Read
   `docs/dika-studio-i18n-tasks.md` before adding to it.

   ── FIVE CONSTRAINTS THAT DECIDED EVERY CHOICE HERE ─────────────────────────────────────────────

   1. THE APP RUNS FROM `file://`, WHERE `fetch()` OF A LOCAL FILE IS REFUSED. Measured: the origin
      is opaque and the scheme is unsupported. So a dictionary CANNOT be a `.json` loaded at runtime.
      It is a `.js` file that calls `CCI18n.add()`, injected as a `<script>` tag, because a script
      tag is the one way this build can read a local file at all.
   2. NO BUNDLER. A new file needs a `<script>` in `index.dev.html` or it silently does not exist.
      This one is in `core/`, which the module bundle does not cover.
   3. THE KEY IS THE ENGLISH SOURCE STRING, not an invented id. 3,669 unique strings across 312
      files: a key-naming project would have to touch every one of them before a single word could be
      translated. With the source as the key, `t('Save')` can be added one file at a time and an
      untranslated string renders as itself rather than as `editor.toolbar.save`.
   4. IT MUST NEVER BLOCK THE BOOT. An absent or broken dictionary leaves the app in English. There
      is no loading state, because the fallback is the finished product.
   5. IT MUST BE ABLE TO CHANGE LANGUAGE WITHOUT A RELOAD. A reload throws away unsaved work, and
      this editor's whole storage story is that the work is local.

   ── WHAT A TRANSLATION MUST NOT DO ──────────────────────────────────────────────────────────────
   Never translate an identifier: an object key, an enum or switch value, an event name, a CSS class,
   an element id, a localStorage key, an API path, a `data-*` key. `RULES.md` §2 is the list and it
   applies here unchanged. Brand names stay verbatim: dika, dika.studio.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'uiLocale';
  var DEFAULT = 'en';

  /* Every language the app can be switched INTO. A locale not listed here cannot be loaded, which is
     what stops a stray `?lang=` or a stale stored value from asking for a file that does not exist.
     `dir` is carried from the start: adding Arabic later must be a dictionary plus one line, not a
     retrofit of the layout code. */
  var LOCALES = [
    { code: 'en', label: 'English', dir: 'ltr' },
    { code: 'es', label: 'Español', dir: 'ltr' },
    { code: 'zh', label: '简体中文', dir: 'ltr' },
    { code: 'fr', label: 'Français', dir: 'ltr' },
    { code: 'de', label: 'Deutsch', dir: 'ltr' },
    { code: 'tr', label: 'Türkçe', dir: 'ltr' },
    { code: 'pt', label: 'Português', dir: 'ltr' },
    { code: 'ja', label: '日本語', dir: 'ltr' },
    { code: 'pl', label: 'Polski', dir: 'ltr' },
    { code: 'ru', label: 'Русский', dir: 'ltr' },
    { code: 'hi', label: 'हिन्दी', dir: 'ltr' }
  ];

  var _dicts = { en: {} };     // code -> { source string: translation }
  // Runtime modules may register a small vocabulary before locale file loads. Keep file-load state
  // separate from dictionary existence so those early additions never suppress full locale load.
  var _loaded = { en: true };  // code -> locale file has completed loading
  var _active = DEFAULT;
  var _loading = {};           // code -> Promise, so two callers cannot inject two script tags
  var _listeners = [];
  var _domObserver = null;
  var _domTranslating = false;
  var _pending = [];           // roots waiting for the next batched pass
  var _pendingScheduled = false;
  var _pendingAll = false;     // past MAX_ROOTS one document pass replaces the queue entirely
  var MAX_ROOTS = 40;
  var _passId = 0;             // bumps per pass, so the exclusion cache cannot go stale

  /* Which `data-i18n-*` marker guards which attribute, so an attribute mutation can be answered by
     translating THAT attribute instead of re-walking a subtree. */
  var ATTR_MARKER = {
    title: 'data-i18n-title',
    placeholder: 'data-i18n-placeholder',
    'aria-label': 'data-i18n-aria',
    alt: null
  };

  function known(code) {
    for (var i = 0; i < LOCALES.length; i++) if (LOCALES[i].code === code) return LOCALES[i];
    return null;
  }

  /* ── translate ───────────────────────────────────────────────────────────
     `t(s)` returns the translation or the source. `vars` interpolates `{name}` placeholders, which
     is what stops a translator having to rebuild a sentence out of concatenated fragments: a string
     split as 'Deleted ' + n + ' pages' cannot be translated into a language that orders it
     differently, and `t('Deleted {n} pages', { n: n })` can. */
  function t(source, vars) {
    var s = String(source == null ? '' : source);
    var d = _dicts[_active];
    var out = (d && Object.prototype.hasOwnProperty.call(d, s) && d[s]) || s;
    if (!vars) return out;
    return out.replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  /* ── dictionaries ────────────────────────────────────────────────────────
     A dictionary FILE calls this. It merges rather than replaces, so a dictionary can be split
     across several files (per area, per release) without one clobbering another. */
  function add(code, entries) {
    if (!code || !entries || typeof entries !== 'object') return false;
    if (!_dicts[code]) _dicts[code] = {};
    for (var k in entries) {
      if (!Object.prototype.hasOwnProperty.call(entries, k)) continue;
      if (typeof entries[k] === 'string') _dicts[code][k] = entries[k];
    }
    return true;
  }

  /* A `<script>` tag, not `fetch`: see constraint 1. Resolves either way, because a missing
     dictionary means English, not an error. */
  function load(code) {
    if (code === DEFAULT || _loaded[code]) return Promise.resolve(true);
    if (!known(code)) return Promise.resolve(false);
    if (_loading[code]) return _loading[code];

    _loading[code] = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'locales/' + code + '.js';
      s.async = true;
      s.onload = function () {
        _loaded[code] = !!_dicts[code];
        resolve(_loaded[code]);
      };
      s.onerror = function () { resolve(false); };
      (document.head || document.documentElement).appendChild(s);
    });
    return _loading[code];
  }

  /* ── applying it to the DOM ──────────────────────────────────────────────
     For markup, an element carries `data-i18n` (its text), `data-i18n-title`, `data-i18n-placeholder`
     or `data-i18n-aria`. The ORIGINAL English is kept in `data-i18n-src` on first pass, so switching
     back and forth cannot translate a translation. */
  function apply(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.hasAttribute('data-i18n')) {
        if (!el.hasAttribute('data-i18n-src')) el.setAttribute('data-i18n-src', el.textContent);
        el.textContent = t(el.getAttribute('data-i18n-src'));
      }
      swapAttr(el, 'data-i18n-title', 'title');
      swapAttr(el, 'data-i18n-placeholder', 'placeholder');
      swapAttr(el, 'data-i18n-aria', 'aria-label');
    }
    translateDom(scope);
    installDomObserver();
    return nodes.length;
  }

  function swapAttr(el, flag, attr) {
    if (!el.hasAttribute(flag)) return;
    var srcKey = flag + '-src';
    if (!el.hasAttribute(srcKey)) el.setAttribute(srcKey, el.getAttribute(attr) || '');
    el.setAttribute(attr, t(el.getAttribute(srcKey)));
  }

  /* Most community-editor modules predate the i18n runtime and build their UI with innerHTML.
     Translate exact user-facing text nodes and common display attributes at the DOM boundary so
     those modules do not need to be rewritten in one risky sweep. Identifiers, user-editable text,
     canvas content, scripts and styles are deliberately excluded. */
  function patternValue(key, vars) {
    var d = _dicts[_active];
    if (!d || !Object.prototype.hasOwnProperty.call(d, key) || !d[key]) return null;
    return d[key].replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
    });
  }

  function dictValue(source) {
    var d = _dicts[_active];
    if (!d) return null;
    if (Object.prototype.hasOwnProperty.call(d, source) && d[source]) return d[source];
    var normalized = String(source).replace(/\s+/g, ' ').trim();
    if (normalized !== source && Object.prototype.hasOwnProperty.call(d, normalized) && d[normalized]) return d[normalized];
    var match = normalized.match(/^(\d+)\s+distinct pages$/i);
    if (match) return patternValue('{n} distinct pages', { n: match[1] }) || match[1] + ' páginas distintas';
    match = normalized.match(/^(\d+)\s+sessions$/i);
    if (match) return patternValue('{n} sessions', { n: match[1] }) || match[1] + ' sesiones';
    match = normalized.match(/^(\d+)\s+pomodoros$/i);
    if (match) return patternValue('{n} pomodoros', { n: match[1] }) || match[1] + ' pomodoros';
    match = normalized.match(/^last\s+(\d+)\s+days$/i);
    if (match) return patternValue('last {n} days', { n: match[1] }) || 'últimos ' + match[1] + ' días';
    match = normalized.match(/^(\d+)\s+active days$/i);
    if (match) return patternValue('{n} active days', { n: match[1] }) || match[1] + ' días activos';
    match = normalized.match(/^(\d+)\s+days$/i);
    if (match) return patternValue('{n} days', { n: match[1] }) || match[1] + ' días';
    match = normalized.match(/^Best:\s*(.+)$/i);
    if (match) return patternValue('Best: {value}', { value: match[1] }) || 'Mejor: ' + match[1];
    match = normalized.match(/^Busiest day:\s*(.+)$/i);
    if (match) return patternValue('Busiest day: {value}', { value: match[1] }) || 'Día más activo: ' + match[1];
    match = normalized.match(/^Slots\s+\((\d+)\/(\d+)\)$/i);
    if (match) return patternValue('Slots ({n}/{total})', { n: match[1], total: match[2] }) || 'Posiciones (' + match[1] + '/' + match[2] + ')';
    match = normalized.match(/^(\d+[\u00d7x]\d+)\s*\u00b7\s*(Horizontal|Vertical|Square)$/i);
    if (match) {
      var orientation = t(match[2]);
      return patternValue('{size} · {orientation}', { size: match[1], orientation: orientation }) || match[1] + ' · ' + orientation;
    }
    match = normalized.match(/^(\d+)\s+images$/i);
    if (match) return patternValue('{n} images', { n: match[1] }) || match[1] + ' imágenes';
    return null;
  }

  function hasMarkedAncestor(node, attr) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el) {
      if (el.hasAttribute && el.hasAttribute(attr)) return true;
      el = el.parentElement;
    }
    return false;
  }

  /* Walks to the root, so it is called once per node and costs the depth of the tree every time. On
     the editor's DOM that is the single biggest constant in a pass, and the answer cannot change
     inside one pass, so it is cached on the element and the cache is invalidated by bumping _passId. */
  function domExcluded(el) {
    if (el && el.__ccI18nExPass === _passId) return el.__ccI18nEx;
    var start = el, answer = false;
    while (el) {
      if (el.__ccI18nExPass === _passId) { answer = el.__ccI18nEx; break; }
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'canvas' || tag === 'code' || tag === 'pre') { answer = true; break; }
      if (el.hasAttribute && (el.hasAttribute('data-i18n-ignore') || el.getAttribute('translate') === 'no')) { answer = true; break; }
      if (el.isContentEditable || el.getAttribute && el.getAttribute('contenteditable') === 'true') { answer = true; break; }
      el = el.parentElement;
    }
    if (start) { start.__ccI18nExPass = _passId; start.__ccI18nEx = answer; }
    return answer;
  }

  function preserveWhitespace(raw, value) {
    var lead = raw.match(/^\s*/)[0];
    var trail = raw.match(/\s*$/)[0];
    return lead + value + trail;
  }

  function translateTextNode(node) {
    if (!node || !node.parentElement || domExcluded(node.parentElement)) return;
    if (hasMarkedAncestor(node, 'data-i18n')) return;
    if (typeof node.__ccI18nSource !== 'string') node.__ccI18nSource = node.nodeValue;
    var source = node.__ccI18nSource;
    var value = _active === DEFAULT ? source : dictValue(source);
    if (value == null && _active !== DEFAULT) {
      var compact = source.replace(/\s+/g, ' ').trim();
      value = compact ? dictValue(compact) : null;
      if (value != null) value = preserveWhitespace(source, value);
    }
    if (value == null) value = source;
    if (node.nodeValue !== value) node.nodeValue = value;
  }

  function translateAttribute(el, attr, marker) {
    if (!el || domExcluded(el) || (marker && hasMarkedAncestor(el, marker))) return;
    if (!el.hasAttribute(attr)) return;
    if (!el.__ccI18nAttrs) el.__ccI18nAttrs = {};
    if (typeof el.__ccI18nAttrs[attr] !== 'string') el.__ccI18nAttrs[attr] = el.getAttribute(attr) || '';
    var source = el.__ccI18nAttrs[attr];
    var value = _active === DEFAULT ? source : dictValue(source);
    if (value == null) value = source;
    if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
  }

  function translateOwnAttributes(el) {
    translateAttribute(el, 'title', 'data-i18n-title');
    translateAttribute(el, 'placeholder', 'data-i18n-placeholder');
    translateAttribute(el, 'aria-label', 'data-i18n-aria');
    translateAttribute(el, 'alt', null);
  }

  function translateDom(root) {
    if (!root || _domTranslating) return;
    _domTranslating = true;
    _passId++;
    try {
      var scope = root.nodeType === 9 ? root.body : root;
      if (!scope) return;
      var walker = document.createTreeWalker(scope, 4, null, false);
      var node;
      while ((node = walker.nextNode())) translateTextNode(node);
      /* `querySelectorAll('*')` returns DESCENDANTS, so the root's own attributes are not in it. That
         went unnoticed while every pass was handed a parent container; once a pass is handed the
         node that was actually inserted, the inserted node is exactly the one that would be skipped.
         Measured: a div appended with `title="Settings"` kept its English title. */
      var elements = scope.querySelectorAll ? scope.querySelectorAll('*') : [];
      if (scope.nodeType === 1) translateOwnAttributes(scope);
      for (var i = 0; i < elements.length; i++) translateOwnAttributes(elements[i]);
    } finally {
      _domTranslating = false;
    }
  }

  /* ── ANSWERING A MUTATION MUST COST WHAT THE MUTATION COST ───────────────────────────────────────
     The first version of this observer answered every record by calling `translateDom(record.target)`,
     which walks that element's ENTIRE subtree: every text node through a TreeWalker, then
     `querySelectorAll('*')` and four attribute checks each, each of those walking to the root. So one
     appended `<div>` on a panel re-translated the panel, and an attribute change did the same.

     MEASURED on the real editor with a locale active (tools/_i18n-cost-probe.mjs), as main-thread
     time a zero timer had to wait for:
         one childList mutation   326 ms
         ten                     7272 ms
         thirty                  9188 ms
     The video timeline rebuilds clips continuously while a clip is added or scrubbed, which is
     hundreds of mutations, and that is the freeze the owner reported after adding a long video: no
     CPU worth noticing on a many-threaded machine, no memory growth, no disk, just one thread that
     never gets back to the event loop.

     Now a record is answered in proportion to itself: a text mutation translates that text node, an
     attribute mutation translates that attribute, and an insertion queues only the ADDED nodes. The
     queue is drained once per frame, roots already covered by a queued ancestor are dropped, and past
     forty roots one document pass is cheaper than forty subtree passes. */
  /* THE DEDUPE SCAN IS BOUNDED, because it was the next quadratic in the same place.
     Dropping a root already covered by a queued ancestor needs a `contains` against everything
     queued, so N insertions in one burst cost N x queue length. MEASURED 2026-08-15 on the packaged
     app (tools/_rp-cost-probe.mjs): opening the font picker inserts ~7000 elements at once, and the
     profiler put 300 ms in native `contains` and 275 ms in this function, for ONE gesture.
     Past MAX_ROOTS the flush already gave up on per-root passes and translated the document, so the
     queue stops growing at that point and every further node is free. The scan is then at most
     MAX_ROOTS comparisons, once. */
  function queueRoot(node) {
    if (!node || node.nodeType !== 1) return;
    if (_pendingAll) return;
    if (_pending.length >= MAX_ROOTS) {
      _pendingAll = true;
      _pending.length = 0;
      scheduleFlush();
      return;
    }
    for (var i = 0; i < _pending.length; i++) {
      if (_pending[i] === node || (_pending[i].contains && _pending[i].contains(node))) return;
    }
    _pending.push(node);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (_pendingScheduled) return;
    _pendingScheduled = true;
    var run = function () {
      _pendingScheduled = false;
      var roots = _pending;
      _pending = [];
      if (_pendingAll) { _pendingAll = false; translateDom(document.body); return; }
      for (var i = 0; i < roots.length; i++) {
        if (roots[i].parentNode) translateDom(roots[i]);
      }
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function installDomObserver() {
    if (_domObserver || !window.MutationObserver || !document.body) return;
    _domObserver = new MutationObserver(function (records) {
      if (_domTranslating || _active === DEFAULT) return;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        if (rec.type === 'characterData') { translateTextNode(rec.target); continue; }
        if (rec.type === 'attributes') {
          var attr = rec.attributeName;
          if (attr && Object.prototype.hasOwnProperty.call(ATTR_MARKER, attr)) {
            _passId++;
            translateAttribute(rec.target, attr, ATTR_MARKER[attr]);
          }
          continue;
        }
        var added = rec.addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) queueRoot(added[j]);
          else if (added[j].nodeType === 3) translateTextNode(added[j]);
        }
      }
    });
    _domObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label', 'alt'] });
  }

  /* Native dialogs sit outside DOM translation. Wrap them once so prompts and confirmations use
     current locale too; source strings still remain keys and the English fallback stays unchanged. */
  function installNativeDialogs() {
    if (window.__ccI18nNativeDialogs) return;
    var native = {
      alert: window.alert,
      confirm: window.confirm,
      prompt: window.prompt
    };
    window.__ccI18nNativeDialogs = native;
    if (typeof native.alert === 'function') window.alert = function (message) {
      return native.alert.call(window, t(message));
    };
    if (typeof native.confirm === 'function') window.confirm = function (message) {
      return native.confirm.call(window, t(message));
    };
    if (typeof native.prompt === 'function') window.prompt = function (message, value) {
      return native.prompt.call(window, t(message), value);
    };
  }

  /* ── switching ───────────────────────────────────────────────────────────
     No reload: this editor's storage is local and a reload throws away unsaved work. Modules that
     build their own markup subscribe with `onChange` and re-render themselves. */
  function setLocale(code, opts) {
    var meta = known(code);
    if (!meta) return Promise.resolve(false);
    return load(code).then(function () {
      _active = code;
      try {
        document.documentElement.setAttribute('lang', code);
        document.documentElement.setAttribute('dir', meta.dir);
      } catch (e) {}
      apply(document);
      for (var i = 0; i < _listeners.length; i++) { try { _listeners[i](code); } catch (e) {} }
      if (!opts || opts.persist !== false) persist(code);
      return true;
    });
  }

  function persist(code) {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
    return CCIdb.put('settings', { code: code }, STORE_KEY)['catch'](function () { return false; });
  }

  /* ── boot ────────────────────────────────────────────────────────────────
     Order: the stored choice, then the account's locale answer from the registration wizard, then
     the browser. A STORED choice wins over the browser for ever, because somebody who picked a
     language meant it and a machine's locale can change under them. */
  function _pick() {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(null);
    return CCIdb.get('settings', STORE_KEY)['catch'](function () { return null; })
      .then(function (row) {
        if (row && known(row.code)) return row.code;
        try {
          var acc = window.CCAccount && CCAccount.state();
          var fromAccount = acc && acc.user && acc.user.locale;
          if (fromAccount && known(String(fromAccount).slice(0, 2))) return String(fromAccount).slice(0, 2);
        } catch (e) {}
        var nav = (navigator.language || '').slice(0, 2).toLowerCase();
        return known(nav) ? nav : null;
      });
  }

  var ready = _pick().then(function (code) {
    if (!code || code === DEFAULT) {
      _active = DEFAULT;
      return DEFAULT;
    }
    /* `persist: false`: adopting the browser's language is not a choice the person made, and storing
       it would silently overrule a later change of system locale. */
    return setLocale(code, { persist: false }).then(function () { return _active; });
  })['catch'](function () { return DEFAULT; });

  installNativeDialogs();

  window.CCI18n = {
    t: t,
    add: add,
    apply: apply,
    load: load,
    setLocale: setLocale,
    locale: function () { return _active; },
    locales: LOCALES,
    ready: ready,
    /* How many of the strings a dictionary claims are actually filled in. Read by the settings
       picker so a half-finished language can say so instead of looking finished and reading half
       English. */
    coverage: function (code) {
      var d = _dicts[code];
      if (!d) return 0;
      var n = 0;
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k) && d[k]) n++;
      return n;
    },
    onChange: function (fn) { if (typeof fn === 'function') _listeners.push(fn); }
  };

  /* The short alias every module will use. Assigned only if nothing else owns it: a global called
     `t` is a common name and silently replacing somebody else's would be a very confusing bug. */
  if (typeof window.t === 'undefined') window.t = t;
})();
