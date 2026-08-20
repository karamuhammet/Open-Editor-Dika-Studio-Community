/* Module: system/settings/about — ABOUT / SUPPORT info sections.
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  /* One text-button style, written once. It matches the buttons in Settings > Account rather than
     inventing a fourth look, and it sets its own width behaviour so no shared class can collapse it
     again. */
  var BTN = 'padding:9px 16px;border-radius:6px;border:1px solid var(--border);' +
    'background:var(--surface3);color:var(--text);font:inherit;font-size:12px;' +
    'width:auto;height:auto;white-space:nowrap;cursor:pointer;';

  SS.buildAboutSection = function () {
    return '<div class="settings-section-title">About</div>' +
      '<div style="text-align:center;padding:30px 0">' +
        '<div style="font-size:28px;font-weight:700;color:var(--text);margin-bottom:4px">dika studio</div>' +
        '<div style="font-size:13px;color:var(--text-dim);margin-bottom:20px">Multi-Product Design Platform</div>' +
        '<div style="font-size:12px;color:var(--text-faint);margin-bottom:4px">Version 2.0</div>' +
        '<div style="font-size:12px;color:var(--text-faint);margin-bottom:4px">Built by <a href="https://dika.studio" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:none">dika.studio</a></div>' +
        '<div style="font-size:11px;color:var(--text-faint);margin-bottom:26px">&copy; 2026 dika.studio. Released under the Business Source License 1.1.</div>' +
        /* THE THREE WIZARD BUTTONS ARE GONE (owner: "ona özel düğme koyma, uninstall seçeneği koy").
           They were the wrong answer to the right complaint. What was actually wanted is a way to
           put the app back to how it arrived, and a per-wizard reset does not do that: the storage
           survives, which is what "bellek aldı gitmiyor" describes.

           NOT `.sbtn` on the button below. That class is a 28x28 SQUARE ICON BUTTON in styles.css,
           and with border-box sizing a text button's padding wins over the 28px, so every label
           collapsed to a 38px column and wrapped down four lines. */
        '<div style="border-top:1px solid var(--border);margin:0 auto 18px;max-width:420px"></div>' +
        '<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Remove everything</div>' +
        '<div style="font-size:11px;color:var(--text-faint);margin:0 auto 14px;max-width:430px;line-height:1.6">' +
          'Deletes every project, page, version, uploaded file, font, brand set, saved key, setting and account on this machine, and puts the app back to how it arrived. It cannot be undone.' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
          '<button type="button" id="about-wipe" style="' + BTN + 'color:#ff8a6b;border-color:#43302c">Remove all local data</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-faint);margin-top:10px;line-height:1.5">Export a project file first if you want to keep anything. This does not uninstall the program itself: use Windows Settings for that.</div>' +
      '</div>';
  };

  /* Everything this build keeps on the machine, in one list, so "remove everything" can be read
     rather than trusted. `CCIdb.name` is the community store (projects, docs, versions, settings,
     the six stock keys, the account); the other three are the editor's own long-standing databases
     for pages, fonts and templates. `dika_` is the localStorage prefix every editor key uses,
     and it is matched as a PREFIX rather than listed, because there are about fifty of them and a
     list would go stale the first time somebody adds the fifty-first. */
  var IDB_NAMES = ['DikaPagesDB', 'DikaFontsDB', 'DikaTemplatesDB'];
  var LS_PREFIX = 'dika_';

  function wipeEverything() {
    var jobs = [];

    /* localStorage first: it is synchronous, so if the page is closed mid-wipe the slow half is the
       one still standing rather than a half-emptied one. Collect the keys BEFORE removing: removing
       inside a `for (i < length)` loop skips every other key as the list shortens under it. */
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j++) localStorage.removeItem(keys[j]);
    } catch (e) {}

    var names = IDB_NAMES.slice();
    if (window.CCIdb && CCIdb.name) names.push(CCIdb.name);
    /* Close our own handle first: `deleteDatabase` on an open connection BLOCKS silently and the
       promise never settles, which would leave the button saying "Removing..." for ever. */
    try { if (window.CCIdb && CCIdb.close) CCIdb.close(); } catch (e) {}

    for (var n = 0; n < names.length; n++) {
      jobs.push(new Promise(function (resolve) {
        var name = names[this.i];
        var req;
        try { req = indexedDB.deleteDatabase(name); } catch (e) { resolve(name + ': ' + e.name); return; }
        req.onsuccess = function () { resolve(null); };
        req.onerror = function () { resolve(name + ': error'); };
        /* BLOCKED IS NOT A FAILURE HERE, and treating it as one is what made the first version of
           this button report a problem and change nothing. The editor's other stores (pages, fonts,
           templates) are opened by their own modules at boot and we cannot close somebody else's
           handle. IndexedDB QUEUES the delete: it completes the moment the last connection closes,
           and any later `open` of the same name waits behind it. The reload below closes every
           connection this page holds, so a blocked delete finishes during the reload and the app
           comes back empty. Resolving null keeps it out of the error list; the console still says
           which ones took that path. */
        req.onblocked = function () {
          if (window.console) console.info('[wipe] ' + name + ' is open; the delete will finish on reload');
          resolve(null);
        };
        /* A real hang, as opposed to blocked, must not leave the button saying "Removing..." for
           ever. Reported, because a database that neither deleted nor blocked is a genuine fault. */
        setTimeout(function () { resolve(name + ': timed out'); }, 8000);
      }.bind({ i: n })));
    }
    return Promise.all(jobs).then(function (problems) {
      return problems.filter(Boolean);
    });
  }

  SS.wireAboutHandlers = function () {
    var w = document.getElementById('about-wipe');
    if (!w) return;
    w.onclick = function () {
      /* TYPE THE WORD. This deletes everything somebody has made, and a single click on a button
         beside two harmless ones is not a decision. The word is checked case-insensitively because
         asking somebody to match capitals is a puzzle, not a safeguard. */
      var tr = window.CCI18n && typeof CCI18n.t === 'function' ? CCI18n.t : function (s) { return s; };
      var typed = window.prompt(
        tr('This deletes every project, page, version, uploaded file, font, brand set, saved key and setting on this machine. It cannot be undone.') + '\n\n' +
        tr('Type  SIL  to confirm.')
      );
      if (typed === null) return;
      if (String(typed).trim().toLowerCase() !== 'sil') {
        if (typeof showToast === 'function') showToast(tr('Not removed: the word did not match.'), 'error');
        return;
      }
      w.disabled = true;
      w.textContent = tr('Removing...');
      wipeEverything().then(function (problems) {
        if (problems.length) {
          w.disabled = false;
          w.textContent = tr('Remove all local data');
          if (typeof showToast === 'function') showToast(tr('Could not remove everything: ') + problems.join('; '), 'error');
          return;
        }
        /* Reload rather than trying to put a running editor back to an empty state by hand: every
           module holds its own copy of what it read at boot, and a reload is the only honest way to
           show what a fresh install looks like. */
        w.textContent = 'Removed. Restarting...';
        setTimeout(function () { location.href = location.pathname; }, 600);
      });
    };
  };

  SS.buildSupportSection = function () {
    return '<div class="settings-section-title">Support</div>' +
      '<div style="padding:10px 0">' +
        '<p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">Need help? Contact us:</p>' +
        '<div style="margin-bottom:12px"><a href="https://mirexagency.com" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:none;font-size:13px">Visit our website</a></div>' +
        '<div style="margin-bottom:12px"><a href="mailto:support@dika.studio" style="color:var(--gold);text-decoration:none;font-size:13px">Email support@dika.studio</a></div>' +
      '</div>';
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'about', parent: 'system.settings', title: 'settings: about', mount: function () {}, unmount: function () {} });
  }
})();
