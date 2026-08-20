/* ============================================================
   system/settings/account - Settings > Account. Sign in, sign out, and what an account is for.

   WHY IT EXISTS: this build asks for registration on every launch until you have an account
   (plan §18b), so it must also be possible to leave. A product that can only be joined is not one
   people trust with an email address.

   THREE RULES:

   - IT RENDERS NOTHING OF ITS OWN ABOUT THE FLOW. `CCAccount.signInPanelHtml()` draws every state
     (signed out, asking, waiting on a code, expired, declined, signed in) and `wireSignInPanel`
     owns its buttons. This file is a Settings section around it. A second copy of those six states
     is six chances for the two to disagree.
   - SIGNING OUT SAYS WHAT IT COSTS, before the press: the launch gate comes back. A person who
     signs out and then meets the gate on the next boot with no warning reads it as a bug.
   - IT STATES WHERE THE SESSION IS KEPT, and the sentence is different in the two builds because
     the fact is. Measured 2026-08-15: every `file://` page in one browser profile shares ONE
     storage origin, so another local HTML file opened in the same browser can read this database.
     The desktop build is a real isolated origin. That difference is the person's to know, not ours
     to smooth over.

   Record: docs/community-edition-release-plan.md §18b.5
   ============================================================ */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function storageNote() {
    var desktop = !!(window.CCDesktop && CCDesktop.isDesktop);
    if (desktop) {
      return 'Your session is kept in this app\'s own data folder, which no other program on this ' +
        'machine can read through the browser.';
    }
    var hours = (window.CCAccount && CCAccount.lifeHintHoursOnFile) || 24;
    return 'You are running the browser build, where every local page shares one storage area, so ' +
      'another local file opened in this browser could read this session. It is therefore ' +
      'short-lived (about ' + hours + ' hours) and can only read the template library. ' +
      'The desktop app keeps its own isolated storage.';
  }

  SS.buildAccountSection = function () {
    var acc = window.CCAccount;
    var signedIn = !!(acc && acc.signedIn());
    var u = (acc && acc.user()) || {};
    var installId = (acc && acc.installId()) || null;

    var head = '<div class="settings-section-title">Account</div>';

    var panel = '<div class="settings-field" id="account-panel" style="margin-bottom:18px">' +
      (acc && acc.signInPanelHtml ? acc.signInPanelHtml() : '<p>Accounts are not available in this build.</p>') +
    '</div>';

    var out = '';
    if (signedIn) {
      out = '<div class="settings-field" style="margin-bottom:18px">' +
        '<label class="settings-label">Your details</label>' +
        '<div style="font-size:12px;color:var(--text-dim);line-height:1.7">' +
          (u.name ? '<div>Name: ' + esc(u.name) + '</div>' : '') +
          (u.email ? '<div>Email: ' + esc(u.email) + '</div>' : '') +
          (u.plan ? '<div>Plan: ' + esc(u.plan) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
          '<button type="button" class="btn-xs" id="account-manage" style="padding:7px 14px;background:var(--surface3);border:1px solid var(--border);border-radius:4px;color:var(--text-dim);cursor:pointer;font-size:12px">Manage account</button>' +
          '<button type="button" class="btn-xs" id="account-signout" style="padding:7px 14px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text-dim);cursor:pointer;font-size:12px">Sign out</button>' +
        '</div>' +
        /* Said BEFORE the press, not after it. */
        '<p style="font-size:11px;color:var(--text-faint);margin-top:8px;line-height:1.5">' +
          'Signing out brings back the sign-in screen at every launch. Your projects are untouched: they are stored on this machine, not in the account.' +
        '</p>' +
      '</div>';
    }

    var privacy = '<div class="settings-field" style="margin-bottom:18px">' +
      '<label class="settings-label">What this app sends</label>' +
      '<div style="font-size:12px;color:var(--text-dim);line-height:1.7">' +
        '<div>Once a day: an install id, the app version, your platform and language, and your account id once you sign in.</div>' +
        '<div style="color:var(--text-faint)">Nothing about your designs. No document, no title, no file name, no image.</div>' +
        (installId ? '<div style="margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--text-faint)">Install id: ' + esc(installId) + '</div>' : '') +
      '</div>' +
    '</div>';

    var storage = '<div class="settings-field">' +
      '<label class="settings-label">Where the session is kept</label>' +
      '<p style="font-size:11px;color:var(--text-faint);line-height:1.55;margin:0">' + esc(storageNote()) + '</p>' +
    '</div>';

    return head +
      '<p style="color:var(--text-dim);font-size:13px;margin-bottom:18px">' +
        'An account unlocks the online template and asset library, and release news. The editor itself works either way, online or offline.' +
      '</p>' +
      panel + out + privacy + storage;
  };

  function rerender() {
    var ct = document.getElementById('settings-content');
    if (!ct) return;
    ct.innerHTML = SS.buildAccountSection();
    SS.wireAccountHandlers();
  }

  SS.wireAccountHandlers = function () {
    var acc = window.CCAccount;
    var panel = document.getElementById('account-panel');
    if (panel && acc && acc.wireSignInPanel) acc.wireSignInPanel(panel, rerender);

    var manage = document.getElementById('account-manage');
    if (manage) manage.onclick = function () {
      var base = (window.CCEdition && CCEdition.apiBase) || null;
      if (acc && acc.openExternal) acc.openExternal(base ? base + '/settings' : null);
    };

    var out = document.getElementById('account-signout');
    if (out) out.onclick = function () {
      if (!acc) return;
      out.disabled = true;
      out.textContent = 'Signing out...';
      /* Local first. It resolves whether or not the server was reachable, which is the point. */
      acc.signOut().then(function () {
        rerender();
        if (typeof showToast === 'function') showToast('Signed out');
      });
    };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'account', parent: 'system.settings', title: 'settings: account', mount: function () {}, unmount: function () {} });
  }
})();
