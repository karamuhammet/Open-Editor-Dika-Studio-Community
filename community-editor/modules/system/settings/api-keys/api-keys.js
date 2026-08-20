/* ============================================================
   system/settings/api-keys - Settings > API Keys. SIX stock media keys, and nothing else.

   WHAT THIS REPLACES. Upstream `settings/ai-api` held two unrelated things: the AI provider key +
   Skills Manager (deleted in this build, §6.4 of the plan) and, until 2026-08-10, a stock media key
   form. The stock form was removed for being unreachable dead code - the settings router had no
   `data-section="api"` entry - while `items/gif`, `items/stickers`, the Stock tab and the image
   modal kept telling people to "add your key in Settings > API Keys". This screen is that screen,
   rebuilt, and the router entry ships with it so it cannot go unreachable again.

   WHY THESE SIX AND NO SEVENTH. A stock key buys pictures under a documented free quota. An LLM key
   in a browser is an uncapped bill attached to a secret in a local database, in a build we do not
   operate and cannot rate-limit. The AI panel here is an ad surface with no local escape hatch, and
   this screen is not a way around it.

   FOUR THINGS THE PRE-SaaS VERSION DID THAT ARE NOT REPEATED HERE:
     1. It rendered the raw key back as value="...". A field that repaints the secret puts it in
        every screenshot and every accessibility tree. This one shows a masked hint and the last 4;
        an empty submit means "leave unchanged".
     2. It stored keys in a localStorage blob. These live in IndexedDB (core/stock-keys.js).
     3. Its "Test Keys" button fired one request per provider at once. Testing is per provider, on
        an explicit press: a background test is a key leak with no user intent behind it.
     4. It had no way to remove a key. Every field has one, and removing clears the in-memory copy
        too, not only the store.

   Record: internal Community Edition plan §6.3.
   ============================================================ */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  /* Each provider states where to get the key and what it actually buys, because "enter your API
     key" with no address is a support ticket. Figures are the providers' own published limits. */
  var PROVIDERS = [
    {
      field: '_unsplash', label: 'Unsplash Access Key', placeholder: 'e.g. AbCdEf123456...',
      steps: ['Go to unsplash.com/oauth/applications and create an app',
              'Copy the <b>Access Key</b>, not the Secret Key'],
      note: 'Header: <code>Authorization: Client-ID YOUR_KEY</code> - 50 req/hr on demo, 5000 req/hr in production',
      test: { url: 'https://api.unsplash.com/photos?per_page=1', header: function (k) { return { Authorization: 'Client-ID ' + k }; } }
    },
    {
      field: '_pexels', label: 'Pexels API Key', placeholder: 'e.g. AbCdEf123456...',
      steps: ['Go to pexels.com/api and request a key', 'It is issued instantly'],
      note: 'Header: <code>Authorization: YOUR_KEY</code> - 200 req/hr, 20K req/month',
      test: { url: 'https://api.pexels.com/v1/search?query=test&per_page=1', header: function (k) { return { Authorization: k }; } }
    },
    {
      field: '_pixabay', label: 'Pixabay API Key', placeholder: 'e.g. 12345678-abcdef...',
      steps: ['Go to pixabay.com/api/docs/ and sign up', 'Copy the key shown on the docs page'],
      note: 'Images, video AND audio - 100 req/min, no monthly cap',
      test: { url: function (k) { return 'https://pixabay.com/api/?key=' + encodeURIComponent(k) + '&q=test&per_page=3'; } }
    },
    {
      field: '_freesound', label: 'Freesound API Token', placeholder: 'e.g. AbCdEf123456...',
      steps: ['Go to freesound.org/apiv2/apply and create an API app', 'Copy the <b>API Token</b>'],
      note: '500K+ CC-licensed sound effects - header: <code>Authorization: Token YOUR_KEY</code>',
      test: { url: 'https://freesound.org/apiv2/search/text/?query=test&page_size=1', header: function (k) { return { Authorization: 'Token ' + k }; } }
    },
    {
      field: '_jamendo', label: 'Jamendo Client ID', placeholder: 'e.g. abc1d2e3...',
      steps: ['Go to devportal.jamendo.com and register an app', 'Copy the <b>Client ID</b>'],
      note: '600K+ CC-licensed music tracks - free for non-commercial use',
      test: { url: function (k) { return 'https://api.jamendo.com/v3.0/tracks/?client_id=' + encodeURIComponent(k) + '&format=json&limit=1'; } }
    },
    {
      field: '_giphy', label: 'GIPHY API Key', placeholder: 'e.g. AbCdEf123456...',
      steps: ['Go to developers.giphy.com and create an app', 'Copy the <b>API Key</b>'],
      note: 'Fills the GIFs and Stickers tabs in Items - 100 req/hr on a beta key',
      test: { url: function (k) { return 'https://api.giphy.com/v1/gifs/trending?limit=1&api_key=' + encodeURIComponent(k); } }
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fieldId(f) { return 'apikey-' + f.replace(/^_/, ''); }

  function localizeStep(s) {
    if (!window.CCI18n || typeof CCI18n.t !== 'function') return s;
    if (s === 'Copy the <b>Access Key</b>, not the Secret Key') return 'Copia la <b>clave de acceso</b>, no la clave secreta';
    if (s === 'Copy the <b>API Token</b>') return 'Copia el <b>token de API</b>';
    if (s === 'Copy the <b>Client ID</b>') return 'Copia el <b>ID de cliente</b>';
    if (s === 'Copy the <b>API Key</b>') return 'Copia la <b>clave de API</b>';
    return CCI18n.t(s);
  }

  function row(p) {
    var hint = window.CCStockKeys ? CCStockKeys.hint(p.field) : null;
    var id = fieldId(p.field);
    var status = hint
      ? '<span style="color:var(--gold);font-size:11px;font-weight:600">Saved &middot; ends in ' + esc(hint.last4) + '</span>'
      : '<span style="color:var(--text-faint);font-size:11px">Not set</span>';
    var steps = p.steps.map(function (s, i) {
      return '<div style="font-size:11px;color:var(--text-faint);margin-top:' + (i ? '2px' : '4px') + '">' + (i + 1) + '. ' + localizeStep(s) + '</div>';
    }).join('');
    return '' +
      '<div class="settings-field" style="margin-bottom:18px" data-apikey-row="' + esc(p.field) + '">' +
        '<label class="settings-label" style="display:flex;justify-content:space-between;align-items:baseline">' +
          '<span>' + esc(p.label) + '</span>' + status +
        '</label>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          /* The stored key is NEVER written into value. The placeholder says what is already there. */
          '<input id="' + id + '" class="settings-input" type="password" autocomplete="off" spellcheck="false" style="flex:1"' +
            ' placeholder="' + (hint ? 'Saved - leave empty to keep it' : esc(p.placeholder)) + '">' +
          '<button type="button" class="btn-xs" data-apikey-test="' + esc(p.field) + '" style="padding:6px 10px;background:var(--surface3);border:1px solid var(--border);border-radius:4px;color:var(--text-dim);cursor:pointer;font-size:11px">Test</button>' +
          (hint ? '<button type="button" class="btn-xs" data-apikey-remove="' + esc(p.field) + '" style="padding:6px 10px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text-dim);cursor:pointer;font-size:11px">Remove</button>' : '') +
        '</div>' +
        steps +
        '<div style="font-size:11px;color:var(--text-faint);margin-top:2px">' + p.note + '</div>' +
        '<div data-apikey-result="' + esc(p.field) + '" style="font-size:11px;margin-top:6px;display:none"></div>' +
      '</div>';
  }

  SS.buildApiKeysSection = function () {
    return '<div class="settings-section-title">API Keys</div>' +
      '<p style="color:var(--text-dim);font-size:13px;margin-bottom:6px">' +
        'Your own keys for the stock media providers. They fill the Images and Audio search tabs, and the GIFs and Stickers tabs in Items. Every provider below has a free tier.' +
      '</p>' +
      /* Said once, plainly. Storing a secret in a browser is not the same as protecting it, and a
         sentence here is worth more than encryption theatre the app would have to undo to use it. */
      '<p style="color:var(--text-faint);font-size:11px;margin-bottom:18px;line-height:1.5">' +
        'These keys are stored in this browser only, and this build never sends them anywhere except to the provider itself. ' +
        'Anyone with access to this computer or its browser profile can read them, so use a restricted key with the lowest quota you need.' +
      '</p>' +
      '<div class="settings-form" id="apikeys-form">' + PROVIDERS.map(row).join('') + '</div>' +
      '<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end;align-items:center">' +
        '<span id="apikeys-save-note" style="font-size:11px;color:var(--text-faint);margin-right:auto"></span>' +
        '<button id="apikeys-save-btn" class="btn-primary" style="padding:8px 24px;border-radius:6px;font-size:13px;cursor:pointer">Save keys</button>' +
      '</div>';
  };

  function setResult(field, text, ok) {
    var el = document.querySelector('[data-apikey-result="' + field + '"]');
    if (!el) return;
    el.style.display = '';
    el.textContent = text;
    el.style.color = ok === true ? 'var(--gold)' : (ok === false ? '#ff6b6b' : 'var(--text-dim)');
  }

  /* One provider, one press, one visible answer - including the provider's own words when it
     refuses, because "invalid key" and "you are out of quota" are different problems. */
  function testProvider(p, key) {
    var url = typeof p.test.url === 'function' ? p.test.url(key) : p.test.url;
    var headers = p.test.header ? p.test.header(key) : {};
    setResult(p.field, 'Testing...', null);
    return fetch(url, { headers: headers })
      .then(function (r) {
        if (r.ok) { setResult(p.field, 'Works.', true); return; }
        return r.text().then(function (body) {
          setResult(p.field, 'Refused (' + r.status + '): ' + String(body || '').slice(0, 160), false);
        });
      })
      ['catch'](function (err) {
        /* A browser-side failure here is usually the network or the provider's CORS policy, not the
           key. Say which, or the person edits a key that was never the problem. */
        setResult(p.field, 'Could not reach the provider: ' + (err && err.message ? err.message : 'network error') +
          '. This is the connection or the provider blocking the browser, not necessarily the key.', false);
      });
  }

  SS.wireApiKeysHandlers = function () {
    var form = document.getElementById('apikeys-form');
    if (!form) return;

    form.querySelectorAll('[data-apikey-test]').forEach(function (btn) {
      btn.onclick = function () {
        var field = btn.getAttribute('data-apikey-test');
        var p = PROVIDERS.filter(function (x) { return x.field === field; })[0];
        var input = document.getElementById(fieldId(field));
        var typed = input && input.value ? input.value.trim() : '';
        if (!typed && !(window.CCStockKeys && CCStockKeys.has(field))) {
          setResult(field, 'Enter a key first.', false);
          return;
        }
        /* Test what is TYPED when something is typed (that is the value about to be saved), and the
           stored one otherwise. Testing the saved key while a new one sits unsaved in the box is a
           green tick for the wrong secret. */
        if (typed) { testProvider(p, typed); return; }
        var state = window._aiGetState ? window._aiGetState() : null;
        var stored = state && state.providerKeys ? state.providerKeys[field] : '';
        if (stored) testProvider(p, stored);
      };
    });

    form.querySelectorAll('[data-apikey-remove]').forEach(function (btn) {
      btn.onclick = function () {
        var field = btn.getAttribute('data-apikey-remove');
        if (!window.CCStockKeys) return;
        CCStockKeys.remove(field).then(function () {
          var ct = document.getElementById('settings-content');
          if (ct) { ct.innerHTML = SS.buildApiKeysSection(); SS.wireApiKeysHandlers(); }
          if (typeof showToast === 'function') showToast('Key removed');
        });
      };
    });

    var save = document.getElementById('apikeys-save-btn');
    if (save) save.onclick = function () {
      var stockKeys = {};
      var changed = 0;
      PROVIDERS.forEach(function (p) {
        var input = document.getElementById(fieldId(p.field));
        if (!input) return;
        var v = (input.value || '').trim();
        if (!v) return;                 // empty means "leave unchanged", never "delete"
        stockKeys[p.field] = v;
        changed++;
      });
      if (!changed) {
        var note0 = document.getElementById('apikeys-save-note');
        if (note0) note0.textContent = 'Nothing to save. An empty box keeps the key already stored; use Remove to delete one.';
        return;
      }
      window._aiApplySettings({ stockKeys: stockKeys }).then(function () {
        var ct = document.getElementById('settings-content');
        if (ct) { ct.innerHTML = SS.buildApiKeysSection(); SS.wireApiKeysHandlers(); }
        if (typeof showToast === 'function') showToast(changed === 1 ? 'Key saved' : changed + ' keys saved');
      }, function (err) {
        var note = document.getElementById('apikeys-save-note');
        if (note) { note.textContent = 'Could not save: ' + (err && err.message ? err.message : 'storage error'); note.style.color = '#ff6b6b'; }
      });
    };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'api-keys', parent: 'system.settings', title: 'settings: api-keys', mount: function () {}, unmount: function () {} });
  }
})();
