/* ============================================================
   core/account.js - THE account reader and THE account writer for the Community Editor.

   This build asks every person to register, on every launch, until they do (owner decision
   2026-08-15, plan §18b). That is a real change to what the edition is, so the rules here are about
   keeping the promise that survived it: **the app still runs with no network, and no document ever
   leaves the machine.**

   Rules that must survive any edit:

   - ONE OWNER. Every read and every write of account state goes through `window.CCAccount`. The gate
     and Settings > Account both render from it and neither keeps a copy. Two copies of "am I signed
     in" is how a sign-out leaves half the app still signed in.
   - THE APP NEVER BLOCKS ON THIS. Nothing here is awaited at boot by anything that draws a canvas.
     Every request carries a timeout and every failure resolves to a state, never a rejection that
     somebody forgets to catch.
   - A DEVICE-CODE FLOW, and it is not a preference. A cookie session cannot reach this build: a
     `file://` page sends `Origin: null` and the desktop shell is on `app://`, which is not https, so
     the session cookie is neither stored nor sent. A redirect flow has nowhere to redirect back to.
     RFC 8628 is the standard answer for an app that cannot host a browser, and it is what a TV app
     or a CLI uses.
   - SIGNING OUT WORKS OFFLINE. The local record is deleted FIRST, then the server is told
     best-effort. The other order means somebody on a plane cannot sign out of their own machine.
   - THE TOKEN IS READ-ONLY AND NARROW. Measured 2026-08-15: every `file://` page in one browser
     profile shares ONE storage origin, so a second local HTML file can read this database. The token
     therefore identifies the install and opens the template library, and may never reach the
     account, billing, designs or any write path. On `file://` it is also short-lived and no refresh
     token is ever written to disk.
   - POLLING STOPS. On a terminal answer, on cancel, and at the deadline. An offline app quietly
     retrying forever is a battery bug and a support ticket.

   Record: docs/community-edition-release-plan.md §18b
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'account';
  var RECORD_VERSION = 1;

  /* `file://` shares its storage with every other local page (see the header), so a long-lived
     credential there is a credential in a shared drawer. The desktop shell is a real isolated
     origin and keeps a normal session length. */
  var LIFE_HINT_HOURS_FILE = 24;

  var _state = null;         // the stored record, or null before ready
  var _flow = null;          // { deviceCode, userCode, verifyUrl, interval, expiresAt, status, message }
  var _timer = null;
  var _listeners = [];
  var _ready = null;

  function _now() { return Date.now(); }

  function _uid() {
    var a = 'i' + _now().toString(36);
    try {
      if (window.crypto && crypto.getRandomValues) {
        var b = new Uint8Array(8);
        crypto.getRandomValues(b);
        for (var i = 0; i < b.length; i++) a += b[i].toString(36);
        return a;
      }
    } catch (e) {}
    return a + Math.random().toString(36).slice(2, 10);
  }

  function _blank() {
    return {
      v: RECORD_VERSION,
      installId: null,
      token: null,
      tokenExpiresAt: null,
      scope: null,
      user: null,
      connectedAt: null,
      lastCheckAt: null
    };
  }

  function _emit() {
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](); } catch (e) {}
    }
  }

  function _save() {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
    return CCIdb.put('settings', _state, KEY).then(function () { return true; })
      ['catch'](function () { return false; });
  }

  /* The install id is ONE value. It was minted by the setup wizard in earlier builds, so adopt that
     one when it exists rather than giving an existing install a second identity and counting it
     twice. `CCFirstRun.installId()` delegates here now. */
  function _adoptInstallId() {
    if (_state.installId) return Promise.resolve();
    if (!window.CCIdb || !CCIdb.available()) { _state.installId = _uid(); return Promise.resolve(); }
    return CCIdb.get('settings', 'firstRun')['catch'](function () { return null; })
      .then(function (fr) {
        _state.installId = (fr && fr.installId) || _uid();
      });
  }

  function _load() {
    if (!window.CCIdb || !CCIdb.available()) {
      _state = _blank();
      _state.installId = _uid();
      return Promise.resolve();
    }
    return CCIdb.get('settings', KEY)['catch'](function () { return null; })
      .then(function (row) {
        _state = (row && typeof row === 'object') ? row : _blank();
        if (_state.v !== RECORD_VERSION) _state.v = RECORD_VERSION;
        /* An expired token is not an error and not a signed-in state. Clear it quietly so every
           caller sees one truth instead of each one re-checking the clock. */
        if (_state.token && _state.tokenExpiresAt && _now() > _state.tokenExpiresAt) {
          _state.token = null;
          _state.user = null;
          _state.scope = null;
        }
        return _adoptInstallId();
      })
      .then(function () { return _save(); })
      .then(function () { _emit(); });
  }

  /* ── the network, and it is the only place in this file that touches it ─── */

  function _base() {
    var b = (window.CCEdition && CCEdition.apiBase) || null;
    if (!b) return null;
    return String(b).replace(/\/+$/, '');
  }

  /* The API response is not authority over where a password-capable browser window opens. Device
     approval belongs to the configured portal origin. A proxy once echoed its bind address here
     (`https://0.0.0.0:3000/device`), so reject every cross-origin answer and fall back to the one
     origin this build already trusts. Local development still works because localhost matches the
     configured development apiBase. */
  function _safeVerifyUrl(candidate) {
    var b = _base();
    if (!b) return null;
    var fallback = b + '/device';
    if (!candidate) return fallback;
    try {
      var expected = new URL(b + '/');
      var target = new URL(String(candidate), expected.href);
      if ((target.protocol === 'http:' || target.protocol === 'https:') && target.origin === expected.origin) {
        return target.href;
      }
    } catch (e) {}
    return fallback;
  }

  /* One request, one timeout, one shape of answer: `{ ok: true, data }` or `{ ok: false, reason }`.
     It never rejects, so no caller can forget a catch and take the boot path down with it. */
  function _post(path, body, ms) {
    var base = _base();
    if (!base) return Promise.resolve({ ok: false, reason: 'not-configured' });
    var ctl = null;
    var timer = null;
    try { ctl = new AbortController(); } catch (e) { ctl = null; }
    if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, ms || 10000);

    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
      redirect: 'error'
    };
    if (ctl) opts.signal = ctl.signal;

    return fetch(base + path, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) return { ok: false, reason: 'http-' + r.status };
      return r.json().then(function (j) { return { ok: true, data: j }; },
        function () { return { ok: false, reason: 'bad-json' }; });
    })['catch'](function () {
      if (timer) clearTimeout(timer);
      return { ok: false, reason: 'unreachable' };
    });
  }

  function _platform() {
    if (window.CCDesktop && CCDesktop.isDesktop) return 'desktop';
    if (typeof location !== 'undefined' && location.protocol === 'file:') return 'file';
    return 'web';
  }

  /* ── the device-code flow ────────────────────────────────────────────────── */

  function _stopPolling() {
    if (_timer) { clearTimeout(_timer); _timer = null; }
  }

  function _fail(message) {
    _stopPolling();
    if (_flow) { _flow.status = 'error'; _flow.message = message; }
    else _flow = { status: 'error', message: message };
    _emit();
    return _flow;
  }

  function startSignIn() {
    _stopPolling();
    _flow = { status: 'starting', message: null };
    _emit();
    return _post('/api/community/device/start', {
      installId: _state ? _state.installId : null,
      appVersion: (window.CCTelemetry && CCTelemetry.APP_VERSION) || null,
      edition: 'community',
      platform: _platform()
    }).then(function (r) {
      if (!r.ok) {
        return _fail(r.reason === 'not-configured'
          ? 'This build has no server address configured, so signing in is not available.'
          : 'Could not reach dika studio. Check your connection and try again. The editor works either way.');
      }
      var d = r.data || {};
      if (!d.deviceCode || !d.userCode) return _fail('dika studio answered with something this build could not read.');
      _flow = {
        status: 'pending',
        deviceCode: d.deviceCode,
        userCode: String(d.userCode),
        verifyUrl: _safeVerifyUrl(d.verifyUrl),
        interval: Math.max(2, Number(d.interval) || 5),
        expiresAt: _now() + (Math.max(60, Number(d.expiresIn) || 600) * 1000),
        message: null
      };
      _emit();
      _schedule();
      return _flow;
    });
  }

  function _schedule() {
    _stopPolling();
    if (!_flow || _flow.status !== 'pending') return;
    _timer = setTimeout(pollOnce, _flow.interval * 1000);
  }

  function pollOnce() {
    if (!_flow || _flow.status !== 'pending') return Promise.resolve(_flow);
    if (_now() > _flow.expiresAt) {
      _stopPolling();
      _flow.status = 'expired';
      _flow.message = 'That code expired. Start again when you are ready.';
      _emit();
      return Promise.resolve(_flow);
    }
    return _post('/api/community/device/poll', { deviceCode: _flow.deviceCode }, 8000).then(function (r) {
      if (!_flow || _flow.status !== 'pending') return _flow;
      if (!r.ok) {
        /* A dropped connection mid-flow is not a failure of the flow: keep the code alive and try
           again on the next tick, up to the deadline the server set. */
        if (_flow.probing) { _flow.probing = false; _emit(); }
        _schedule();
        return _flow;
      }
      var d = r.data || {};
      if (d.status === 'pending') {
        if (_flow.probing) { _flow.probing = false; _emit(); }
        _schedule();
        return _flow;
      }
      if (d.status === 'slow_down') {
        _flow.interval = Math.min(30, _flow.interval + 5);
        if (_flow.probing) { _flow.probing = false; _emit(); }
        _schedule();
        return _flow;
      }
      if (d.status === 'expired') {
        _stopPolling();
        _flow.status = 'expired';
        _flow.message = 'That code expired. Start again when you are ready.';
        _emit();
        return _flow;
      }
      if (d.status === 'denied') {
        _stopPolling();
        _flow.status = 'denied';
        _flow.message = 'That request was declined in the browser.';
        _emit();
        return _flow;
      }
      if (d.token) return _adopt(d);
      _schedule();
      return _flow;
    });
  }

  function _adopt(d) {
    _stopPolling();
    _state.token = String(d.token);
    _state.scope = d.scope || null;
    /* `id` is the opaque account identifier and is the ONLY thing the beacon may carry to say who
       this install belongs to. The token stays here and never leaves this module. */
    _state.user = (d.user && typeof d.user === 'object') ? {
      id: d.user.id || null,
      name: d.user.name || null,
      email: d.user.email || null,
      plan: d.user.plan || null
    } : null;
    _state.connectedAt = _now();
    _state.lastCheckAt = _now();
    _state.tokenExpiresAt = d.expiresAt ? Number(d.expiresAt) : null;
    _flow = { status: 'done', message: null };
    return _save().then(function () {
      _emit();
      try { if (window.cc && cc.emit) cc.emit('account:changed', { signedIn: true }); } catch (e) {}
      return _flow;
    });
  }

  /* The registration wizard creates the account in one POST and is handed the token here, so there
     is still exactly ONE writer of account state. It reuses `_adopt`, the same function the device
     poll uses, so a token from either door lands identically. */
  function adoptToken(payload) {
    if (!payload || !payload.token) return Promise.resolve(false);
    return _adopt(payload).then(function () { return true; });
  }

  /* The registration endpoint answers with a DEVICE FLOW rather than a token: an email address is a
     claim, not a proof, so nothing hands out a credential for one. This takes that answer and enters
     exactly the same waiting state `startSignIn` produces, so the panel, the polling, the cancel
     button and the six states are the one implementation rather than two. */
  function adoptDeviceFlow(d) {
    if (!d || !d.deviceCode || !d.userCode) return false;
    _stopPolling();
    _flow = {
      status: 'pending',
      /* Registration may return a pre-approved flow for a brand-new account. Probe it before
         showing the human code: without this flag the code flashes for one network round-trip and
         vanishes, which looks like a broken verification screen. If the probe says pending, the
         same flow becomes visible and continues with the normal polling schedule. */
      probing: true,
      deviceCode: d.deviceCode,
      userCode: String(d.userCode),
      verifyUrl: _safeVerifyUrl(d.verifyUrl),
      interval: Math.max(2, Number(d.interval) || 5),
      expiresAt: _now() + (Math.max(60, Number(d.expiresIn) || 600) * 1000),
      message: null
    };
    _emit();
    /* Poll once immediately, but keep the code hidden until that probe says a person must act. */
    pollOnce();
    return true;
  }

  function cancelSignIn() {
    _stopPolling();
    _flow = null;
    _emit();
  }

  /* Local first, server second, and the server half is never awaited by the caller. */
  function signOut() {
    var token = _state ? _state.token : null;
    if (_state) {
      _state.token = null;
      _state.user = null;
      _state.scope = null;
      _state.tokenExpiresAt = null;
      _state.connectedAt = null;
    }
    _stopPolling();
    _flow = null;
    return _save().then(function () {
      _emit();
      try { if (window.cc && cc.emit) cc.emit('account:changed', { signedIn: false }); } catch (e) {}
      if (token) _post('/api/community/device/revoke', { token: token }, 6000);
      return true;
    });
  }

  /* ── the shared sign-in panel ────────────────────────────────────────────
     ONE implementation, rendered by BOTH the launch gate and Settings > Account. A second copy is a
     second set of states to keep in step, and the states are the hard part. */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var WHAT_IT_BUYS =
    '<ul class="cc-acc-list">' +
      '<li>The online template and asset library</li>' +
      '<li>Release news and early access to new features</li>' +
    '</ul>';

  /* Injected from here rather than added as a <link> in two HTML files, exactly like
     core/edition.js. One file to change, and it cannot go missing from one of the two pages. */
  var CSS_ID = 'cc-account-style';
  var CSS = [
    '.cc-acc{font-size:13px;line-height:1.6;color:var(--text,#e8e8ea)}',
    '.cc-acc-lead{margin:0 0 10px}',
    '.cc-acc-dim{color:var(--text-faint,#6e6e78);font-size:12px;margin:8px 0 0}',
    '.cc-acc-warn{color:#ff9b6b;margin:0 0 12px}',
    '.cc-acc-list{margin:0 0 12px;padding-left:18px;color:var(--text-dim,#9b9ba3);font-size:12px}',
    '.cc-acc-list li{margin:3px 0}',
    '.cc-acc-url{font-size:12px;color:var(--text-dim,#9b9ba3);word-break:break-all;margin-bottom:10px}',
    '.cc-acc-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:.16em;',
    'font-weight:600;color:var(--gold,#f2ff58);background:var(--surface3,#212128);border:1px solid var(--border,#2c2c33);',
    'border-radius:var(--r-md,8px);padding:14px 10px;text-align:center;margin-bottom:14px;user-select:all}',
    '.cc-acc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px}',
    '.cc-acc-btn{padding:8px 16px;border-radius:6px;border:1px solid var(--border,#2c2c33);',
    'background:var(--surface3,#212128);color:var(--text,#e8e8ea);font-size:12px;cursor:pointer;font-family:inherit}',
    '.cc-acc-btn:hover{border-color:var(--border-strong,#3a3a44)}',
    '.cc-acc-go{background:var(--gold,#f2ff58);color:#16161b;border-color:transparent;font-weight:600}',
    '.cc-acc-go:hover{filter:brightness(1.08)}'
  ].join('');

  function injectCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function signInPanelHtml() {
    injectCss();
    var f = _flow;
    if (signedIn()) {
      var u = _state.user || {};
      return '<div class="cc-acc" data-cc-acc="in">' +
        '<p class="cc-acc-lead">Signed in as <b>' + esc(u.name || u.email || 'your account') + '</b>' +
          (u.email && u.name ? ' <span class="cc-acc-dim">' + esc(u.email) + '</span>' : '') + '</p>' +
        (u.plan ? '<p class="cc-acc-dim">Plan: ' + esc(u.plan) + '</p>' : '') +
      '</div>';
    }
    if (f && f.status === 'starting') {
      return '<div class="cc-acc" data-cc-acc="starting"><p class="cc-acc-lead">Asking dika studio for a code...</p></div>';
    }
    if (f && f.status === 'pending') {
      if (f.probing) {
        return '<div class="cc-acc" data-cc-acc="checking"><p class="cc-acc-lead">Finishing your account setup...</p></div>';
      }
      var url = _safeVerifyUrl(f.verifyUrl) || '';
      return '<div class="cc-acc" data-cc-acc="pending">' +
        '<p class="cc-acc-lead">Open this page and enter the code:</p>' +
        '<div class="cc-acc-url">' + esc(url) + '</div>' +
        '<div class="cc-acc-code" data-cc-acc-code>' + esc(f.userCode) + '</div>' +
        '<div class="cc-acc-row">' +
          '<button type="button" class="cc-acc-btn" data-acc="open">Open in browser</button>' +
          '<button type="button" class="cc-acc-btn" data-acc="copy">Copy code</button>' +
          '<button type="button" class="cc-acc-btn" data-acc="cancel">Cancel</button>' +
        '</div>' +
        '<p class="cc-acc-dim" data-cc-acc-count>Waiting for you to finish in the browser.</p>' +
      '</div>';
    }
    if (f && (f.status === 'error' || f.status === 'expired' || f.status === 'denied')) {
      return '<div class="cc-acc" data-cc-acc="' + esc(f.status) + '">' +
        '<p class="cc-acc-warn">' + esc(f.message || 'That did not work.') + '</p>' +
        '<div class="cc-acc-row">' +
          '<button type="button" class="cc-acc-btn cc-acc-go" data-acc="signin">Try again</button>' +
        '</div>' +
      '</div>';
    }
    return '<div class="cc-acc" data-cc-acc="out">' +
      '<p class="cc-acc-lead">Sign in to unlock:</p>' + WHAT_IT_BUYS +
      '<p class="cc-acc-dim">The editor itself works either way, with or without an account, online or offline.</p>' +
      '<div class="cc-acc-row">' +
        '<button type="button" class="cc-acc-btn cc-acc-go" data-acc="signin">Sign in</button>' +
        '<button type="button" class="cc-acc-btn" data-acc="create">Create an account</button>' +
      '</div>' +
    '</div>';
  }

  /* Opening a URL: the desktop shell hands it to the real browser through ONE named bridge method,
     and the file build uses window.open. Never an embedded window in either: nobody should type a
     password into a frame this app controls. */
  function openExternal(url) {
    if (!url) return false;
    if (window.CCDesktop && typeof CCDesktop.openExternal === 'function') {
      CCDesktop.openExternal(url);
      return true;
    }
    try { window.open(url, '_blank', 'noopener'); return true; } catch (e) { return false; }
  }

  function verifyUrl() {
    return _safeVerifyUrl(_flow && _flow.verifyUrl);
  }

  function signUpUrl() {
    var b = _base();
    return b ? b + '/register' : ((window.CCEdition && CCEdition.upsellUrl) || null);
  }

  /* `root` is the element containing the panel HTML; `onChange` re-renders it. The panel owns its own
     buttons so neither host has to know the flow's states. */
  function wireSignInPanel(root, onChange) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-acc]');
      if (!b) return;
      var act = b.getAttribute('data-acc');
      if (act === 'signin') {
        startSignIn().then(function () { if (onChange) onChange(); });
        if (onChange) onChange();
        return;
      }
      if (act === 'create') { openExternal(signUpUrl()); return; }
      if (act === 'open') { openExternal(verifyUrl()); return; }
      if (act === 'copy') {
        var code = _flow && _flow.userCode;
        if (!code) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code);
        } catch (err) {}
        b.textContent = 'Copied';
        setTimeout(function () { b.textContent = 'Copy code'; }, 1500);
        return;
      }
      if (act === 'cancel') { cancelSignIn(); if (onChange) onChange(); return; }
    });
  }

  /* ── public surface ──────────────────────────────────────────────────────── */

  function signedIn() {
    if (!_state || !_state.token) return false;
    if (_state.tokenExpiresAt && _now() > _state.tokenExpiresAt) return false;
    return true;
  }

  _ready = _load()['catch'](function () {
    _state = _blank();
    _state.installId = _uid();
  });

  window.CCAccount = {
    ready: _ready,
    signedIn: signedIn,
    user: function () { return (_state && _state.user) || null; },
    token: function () { return signedIn() ? _state.token : null; },
    installId: function () { return _state ? _state.installId : null; },
    state: function () { return _state; },
    flow: function () { return _flow; },

    startSignIn: startSignIn,
    pollOnce: pollOnce,
    cancelSignIn: cancelSignIn,
    adoptToken: adoptToken,
    adoptDeviceFlow: adoptDeviceFlow,
    signOut: signOut,

    signInPanelHtml: signInPanelHtml,
    wireSignInPanel: wireSignInPanel,
    openExternal: openExternal,
    signUpUrl: signUpUrl,
    verifyUrl: verifyUrl,
    whatItBuysHtml: WHAT_IT_BUYS,
    lifeHintHoursOnFile: LIFE_HINT_HOURS_FILE,

    onChange: function (fn) { if (typeof fn === 'function') _listeners.push(fn); }
  };
})();
