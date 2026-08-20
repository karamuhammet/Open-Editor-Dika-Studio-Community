/* ============================================================
   system/telemetry - the install count, and nothing else.

   IT IS LIVE NOW (owner decision 2026-08-15, plan D4). It shipped inert, behind an opt-in that
   defaulted off; the owner turned it on and chose the destination: **the member log that already
   exists under the :3001 users console**, not a new table. It is therefore DISCLOSED rather than
   asked about, in the setup wizard and again in Settings > Account, in the same words as the payload
   below. The failure mode of a live beacon is somebody finding it in a network tab and concluding it
   was hidden, and disclosure is the only defence against that.

   THE PAYLOAD IS A CONTRACT, not a starting point. Exactly these fields go out:

       { installId, appVersion, edition, platform, locale, sentAt, accountId }

   `accountId` is present only once the person signs in, and it is what lets one install be joined to
   one member. Every other field is the same as before. Adding an eighth means changing the wizard,
   Settings and the README in the same commit, because they all state this list in words and a
   promise that grows quietly is a broken one. In particular there is NO document data, no project
   title, no file name, no key material, and nothing derived from the machine.

   `installId` IS RANDOM AND MUST STAY RANDOM. `core/account.js` owns it. Deriving it from hardware,
   MAC, hostname, username or a fingerprint would turn a counter into personal data, with every duty
   that carries.

   WHAT THE NUMBER IS WORTH: the source is published, so this file is one line to delete, and the owner has
   explicitly accepted that ("fork eden siler, önemli değil"). The count is a FLOOR, never a
   population, and any screen quoting it must say so. The release download counter needs no code and
   cannot be patched out; it stays the primary measurement.

   Record: docs/community-edition-release-plan.md §8 and §18b
   ============================================================ */
(function () {
  'use strict';

  /* Built from THE one address (core/edition.js `apiBase`), never a second hard-coded host. Read at
     call time so a build that points somewhere else does not need this file changed too. */
  function _endpoint() {
    var b = (window.CCEdition && CCEdition.apiBase) || null;
    return b ? String(b).replace(/\/+$/, '') + '/api/community/install' : null;
  }

  var APP_VERSION = '1.0.0';
  var DAY = 24 * 60 * 60 * 1000;
  var SENT_KEY = 'telemetryLastSent';

  function _enabled() {
    return !!(_endpoint() && window.CCFirstRun && CCFirstRun.telemetryEnabled());
  }

  function _lastSent() {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(0);
    return CCIdb.get('settings', SENT_KEY).then(function (v) { return (v && v.at) || 0; })
      ['catch'](function () { return 0; });
  }

  function _markSent(at) {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
    return CCIdb.put('settings', { at: at }, SENT_KEY)['catch'](function () { return false; });
  }

  /* The whole payload, in one place, so a reviewer can read the contract in ten lines. `accountId`
     is the ONLY field that is ever absent, and it is absent for exactly one reason: they have not
     signed in. It is read from the account record, never from a design, a profile or a form. */
  function _payload() {
    var p = {
      installId: CCFirstRun.installId(),
      appVersion: APP_VERSION,
      edition: 'community',
      platform: (navigator.platform || 'unknown'),
      locale: (navigator.language || 'unknown').slice(0, 5),
      sentAt: new Date().toISOString()
    };
    /* The ACCOUNT ID, never the token. The token is a credential; putting one in a beacon body puts
       it in every access log and every proxy on the way, to identify somebody the server could have
       identified from a header. The id is an opaque identifier and is all this call needs. */
    var u = window.CCAccount && CCAccount.user();
    if (u && u.id) p.accountId = u.id;
    return p;
  }

  /* ONE attempt. No retry loop: an offline app that hammers a beacon the moment a network appears is
     a bug report waiting to happen, and a missed count is worth nothing next to that. */
  function ping() {
    if (!_enabled()) return Promise.resolve('disabled');
    return _lastSent().then(function (at) {
      if (Date.now() - at < DAY) return 'too-soon';
      var body = _payload();
      var url = _endpoint();
      if (!url) return 'disabled';
      /* A timeout, like everything else that leaves this build. `keepalive` caps the body at 64 KB
         and survives a tab closing, which is exactly the shape of this call. */
      var ctl = null;
      var timer = null;
      try { ctl = new AbortController(); } catch (e) { ctl = null; }
      if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 8000);
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-store',
        redirect: 'error'
      };
      if (ctl) opts.signal = ctl.signal;
      return fetch(url, opts).then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) return 'refused:' + r.status;
        return _markSent(Date.now()).then(function () { return 'sent'; });
      })['catch'](function () {
        if (timer) clearTimeout(timer);
        return 'unreachable';
      });
    });
  }

  window.CCTelemetry = {
    /* Read by Settings so a screen can state the truth rather than guess. */
    configured: function () { return !!_endpoint(); },
    endpoint: _endpoint,
    enabled: _enabled,
    lastSent: _lastSent,
    payloadShape: function () { return Object.keys(_payload()); },
    ping: ping,
    APP_VERSION: APP_VERSION
  };

  /* Once per app start, and `ping` itself refuses more than once a day. */
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      setTimeout(function () { cc.safe('system.telemetry', ping); }, 6000);
    });
  }

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'telemetry', parent: 'system', title: 'Telemetry', mount: function () {}, unmount: function () {} });
  }
})();
