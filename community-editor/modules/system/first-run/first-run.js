/* ============================================================
   system/first-run - the setup wizard AND the launch gate. Two jobs, one surface, on purpose.

   IT IS NO LONGER SHOWN ONCE. Owner decision 2026-08-15 (plan §18b, D3): registration is required
   and is asked **on every launch** until the install has an account. The Adobe model, and the owner
   named it as such. What that means precisely, because "mandatory" and "skippable" sound like a
   contradiction and are not:

   - **Every boot while signed out**, not just the first.
   - **"Later" walks past it for that session only.** Nobody is locked out of work already on their
     own disk, and the app still runs with no network at all.
   - **Nothing is written that suppresses the next launch.** There is no "do not show again", by
     decision. The only way to stop being asked is to register.
   - **Once signed in it never renders again**, and `_boot` returns before building anything.

   WHY THE STORAGE SCREEN STILL MATTERS MORE THAN THE GATE: this build stores everything in one
   browser profile and there is no copy anywhere else. Clearing site data deletes somebody's
   projects. Screen 2 is the reason this wizard was worth building, and a returning visitor who has
   already read it does not get it again: the gate shows the account screen alone.

   Design rules that must survive an edit:

   - IT WAITS FOR `CCLocalStore.ready` AND `CCAccount.ready`. Both are async and this runs at boot.
     Reading either directly is a race: the first resolves to "no previous work" on a slow disk (it
     would greet a returning user as a new one), the second to "signed out" (it would ask somebody
     who registered last week).
   - STATE LIVES IN IndexedDB (`CCIdb` store `settings`, key `firstRun`), never in localStorage. The
     5 MB localStorage quota was measured FULL on a real machine, and this build has no server to
     fall back on.
   - `version` EXISTS SO A LATER RELEASE CAN ASK ONE NEW QUESTION without re-running the whole
     wizard. Bump it and add the screen; do not reset the record.
   - ESCAPE AND THE BACKDROP DO NOT DISMISS IT. A wizard that closes by accident on screen 2 never
     delivers the one warning it exists for, and a gate that closes on a stray keypress is not one.
   - IT DOES NOT OWN THE ACCOUNT UI. `CCAccount.signInPanelHtml()` renders it, here and in Settings,
     so the code, the states and the copy exist once.
   - IT MUST BE RE-OPENABLE (Settings > About), or somebody who registered can never see it again.

   Record: docs/community-edition-release-plan.md §7 and §18b
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'firstRun';
  var VERSION = 1;

  var _state = null;
  var _el = null;
  var _step = 0;
  var _forced = false;   // opened from Settings rather than at boot
  var _screens = null;   // the screen list THIS opening uses: the full wizard, or the gate alone

  function _defaults() {
    return {
      version: VERSION,
      completedAt: null,
      skipped: false,
      telemetry: false,
      /* Kept as the record of "has this install ever finished the wizard", which is what decides
         between the full wizard and the gate alone. It is NOT the answer to "are they signed in":
         that is CCAccount.signedIn(), and asking the wrong one is how somebody who registered on
         another machine gets asked forever. */
      registered: false,
      installId: _uid(),
      exportReminder: 'off',     // off | weekly | monthly
      exportRemindedAt: null
    };
  }

  function _uid() {
    var a = 'i' + Date.now().toString(36);
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

  function load() {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(null);
    return CCIdb.get('settings', KEY)['catch'](function () { return null; });
  }

  function save() {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
    return CCIdb.put('settings', _state, KEY).then(function () { return true; })
      ['catch'](function () { return false; });
  }

  /* ── screens ───────────────────────────────────────────────────────────── */

  var SCREENS = [
    {
      id: 'welcome',
      title: 'dika studio Community Editor',
      body: function () {
        return '<p>A design and video studio that runs on this machine.</p>' +
          '<p><b>Your work stays here.</b> Documents, media and version history never leave this computer.</p>' +
          '<p class="cc-fr-dim">Free to use. Source available under the Business Source License 1.1.</p>';
      }
    },
    {
      id: 'storage',
      title: 'Where your work lives',
      body: function () {
        return '<p>Your projects are stored <b>in this browser profile</b>. That is the only copy.</p>' +
          '<p class="cc-fr-warn">Clearing site data deletes them. So does a different browser, or a fresh profile.</p>' +
          '<p>Export a project file for anything you want to keep. It carries the design and its media, and it opens on any machine.</p>' +
          '<div class="cc-fr-row">' +
            '<button type="button" class="cc-fr-btn" data-fr="export-now">Export a project file now</button>' +
          '</div>' +
          '<label class="cc-fr-field"><span>Remind me to export</span>' +
            '<select data-fr="remind">' +
              '<option value="off">Never</option>' +
              '<option value="weekly">Weekly</option>' +
              '<option value="monthly">Monthly</option>' +
            '</select></label>';
      }
    },
    /* THE "What this app sends" SCREEN WAS HERE AND IS DELETED (owner, 2026-08-15).
       It listed the beacon payload in full, as a wall of text, on the second screen a new person
       ever sees. Two things were wrong with it: consent is now asked ONCE, in the registration
       wizard, next to the terms link, which is where somebody expects to meet it; and a payload
       dump reads like a warning label rather than a product.

       The full list is NOT hidden as a result. It is still in Settings > Account and in the README,
       verbatim, and `system/telemetry` still enforces it field by field. Moving where a thing is
       said is fine; quietly saying less than the code does is not, and the proof still asserts the
       payload key by key. */
    /* THE SIGN-IN SCREEN WAS HERE AND IS ALSO DELETED (owner, 2026-08-15: "zaten ilk kayıt
       wizardında onay alıyoruz"). `system/register-wizard` is the full-screen flow that runs FIRST
       on every launch while signed out; it collects the account, the terms and the consent. Asking
       again on the third screen of the wizard behind it was the same question twice in one minute.

       What is left is what this wizard was built for: where your work is stored, and that clearing
       site data deletes it. Three screens. Settings > Account remains the place to sign in or out
       afterwards. */
    {
      id: 'done',
      title: 'Ready',
      body: function () {
        return '<p>That is everything. Your work stays on this machine.</p>' +
          '<p class="cc-fr-dim">You can reopen this from Settings > About.</p>';
      }
    }
  ];

  /* `gateOnly` used to mean "the account screen alone" for a returning visitor. The account screen
     is gone (system/register-wizard asks on every launch and asks better), so a returning visitor
     who has already walked this wizard needs NOTHING from it: `_boot` simply does not open it. The
     argument is kept because the callers pass it and because a wizard with one screen left is not a
     shape worth inventing a second time. */
  function _screenList() {
    return SCREENS;
  }

  /* ── rendering ─────────────────────────────────────────────────────────── */

  function _render() {
    var list = _screens || SCREENS;
    var s = list[_step];
    var last = _step === list.length - 1;

    _el.querySelector('.cc-fr-title').textContent = s.title;
    _el.querySelector('.cc-fr-body').innerHTML = s.body();
    /* One screen needs no progress dots; N of N is information, 1 of 1 is furniture. */
    _el.querySelector('.cc-fr-dots').innerHTML = list.length < 2 ? '' : list.map(function (x, i) {
      return '<i class="cc-fr-dot' + (i === _step ? ' is-on' : '') + '"></i>';
    }).join('');

    var back = _el.querySelector('[data-fr="back"]');
    back.style.visibility = _step === 0 ? 'hidden' : '';

    var next = _el.querySelector('[data-fr="next"]');
    var alt = _el.querySelector('[data-fr="alt"]');

    next.textContent = last ? 'Start using it' : 'Next';
    alt.style.display = 'none';

    /* Restore the controls this screen owns. */
    var rem = _el.querySelector('[data-fr="remind"]');
    if (rem) rem.value = _state.exportReminder || 'off';
  }

  function _collect() {
    var rem = _el.querySelector('[data-fr="remind"]');
    if (rem) _state.exportReminder = rem.value;
  }

  function _finish(skipped) {
    _collect();
    _state.skipped = !!skipped;
    _state.completedAt = Date.now();
    _state.version = VERSION;
    save().then(function () {
      try { if (window.cc && cc.emit) cc.emit('first-run:done', { telemetry: _state.telemetry }); } catch (e) {}
    });
    _close();
  }

  function _close() {
    if (!_el) return;
    document.removeEventListener('keydown', _onKey, true);
    _el.remove();
    _el = null;
  }

  /* Escape does NOT close it. Screen 2 is the only warning a user gets about losing their work, and
     a wizard that vanishes on a stray keypress never delivers it. */
  function _onKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
  }

  function _onClick(e) {
    var b = e.target.closest && e.target.closest('[data-fr]');
    if (!b) return;
    var act = b.getAttribute('data-fr');

    if (act === 'export-now') {
      /* The EXISTING export path, not a new one. */
      if (typeof window.exportCardFile === 'function') window.exportCardFile();
      else if (typeof window.openShareMenu === 'function') window.openShareMenu();
      return;
    }
    if (act === 'alt') {
      var u = window.CCEdition && CCEdition.upsellUrl;
      if (u) window.open(u, '_blank', 'noopener');
      return;
    }
    if (act === 'back') { _collect(); _step = Math.max(0, _step - 1); _render(); return; }
    if (act === 'next') {
      _collect();
      var list = _screens || SCREENS;
      /* The single-screen "gate" branch lived here and went with the account screen. This wizard is
         informational again: walking it to the end is what stamps `completedAt`, and the thing that
         asks every launch is system/register-wizard. */
      if (_step === list.length - 1) { _finish(false); return; }
      _step++;
      _render();
      return;
    }
  }

  function open(force, gateOnly) {
    if (_el) return;
    _forced = !!force;
    _screens = _screenList(!!gateOnly);
    _step = 0;
    var ov = document.createElement('div');
    ov.className = 'cc-fr-ov';
    ov.innerHTML =
      '<div class="cc-fr" role="dialog" aria-modal="true" aria-labelledby="cc-fr-h">' +
        '<div class="cc-fr-title" id="cc-fr-h"></div>' +
        '<div class="cc-fr-body"></div>' +
        '<div class="cc-fr-foot">' +
          '<div class="cc-fr-dots"></div>' +
          '<button type="button" class="cc-fr-btn" data-fr="back">Back</button>' +
          '<button type="button" class="cc-fr-btn" data-fr="alt"></button>' +
          '<button type="button" class="cc-fr-btn cc-fr-go" data-fr="next"></button>' +
        '</div>' +
      '</div>';
    ov.addEventListener('click', _onClick);
    document.addEventListener('keydown', _onKey, true);
    document.body.appendChild(ov);
    _el = ov;
    _render();
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */

  /* BOTH promises, or the decision is a race with two wrong answers: an unresolved store says "new
     user" to somebody with a year of work, and an unresolved account says "signed out" to somebody
     who registered last week and would then be asked on every launch forever. */
  function _boot() {
    var store = (window.CCLocalStore && CCLocalStore.ready && CCLocalStore.ready.then)
      ? CCLocalStore.ready
      : Promise.resolve(true);
    var account = (window.CCAccount && CCAccount.ready && CCAccount.ready.then)
      ? CCAccount.ready
      : Promise.resolve(true);

    Promise.all([store, account]).then(load).then(function (row) {
      _state = row && typeof row === 'object' ? row : null;
      if (!_state) _state = _defaults();
      _state.version = VERSION;

      /* Registered: this surface does not exist for them any more. */
      if (window.CCAccount && CCAccount.signedIn()) {
        if (!_state.registered) { _state.registered = true; save(); }
        return;
      }

      /* SIGNED OUT: THE REGISTRATION WIZARD COMES FIRST, FULL SCREEN, EVERY LAUNCH.
         (Owner, 2026-08-15: "önce kayıt wizardı gelecek tam ekran".) It is
         `system/register-wizard`, and its steps are published from :3001 rather than written into
         the app, so the owner edits the flow in the admin console and this shows it on the next
         launch. This module no longer asks about the account at all: it went back to being the
         setup wizard, which is the one screen that explains where somebody's work is stored.

         Order on a first launch: register first, then the storage warning. On every launch after
         that, only the registration wizard, until they have an account. */
      var seenSetup = !!(_state.version === VERSION && _state.completedAt);
      setTimeout(function () {
        if (window.CCRegisterWizard) {
          CCRegisterWizard.start(function (registered) {
            if (registered) { _state.registered = true; save(); }
            /* The setup wizard follows only if it has never been walked. Two full-screen flows back
               to back on every launch would be a reason to uninstall. */
            if (!seenSetup) setTimeout(function () { open(false, false); }, 350);
          });
          return;
        }
        /* No registration module (an older build, or it failed to load): fall back to the setup
           wizard rather than showing nothing. */
        open(false, seenSetup);
      }, 1200);
    })['catch'](function () { /* no store: the app still works, it just cannot remember */ });
  }

  window.CCFirstRun = {
    open: function () { if (!_state) _state = _defaults(); open(true, false); },
    /* The gate on its own, which is what a boot shows a returning visitor. Exposed so a proof can
       exercise it without restarting the browser. */
    openGate: function () { if (!_state) _state = _defaults(); open(true, true); },
    isOpen: function () { return !!_el; },
    state: function () { return _state; },
    /* Read by system/telemetry. ONE gate, ONE place.
       It went disclosure-only for a few hours (D4) and is a real consent again (owner, 2026-08-15):
       the registration wizard asks for it beside the terms, and this is what it wrote. A checkbox
       that does not gate the thing it names is worse than no checkbox, because it tells somebody
       they had a choice. Default false: an untouched install sends nothing. */
    telemetryEnabled: function () { return !!(_state && _state.telemetry); },
    setTelemetry: function (on) {
      if (!_state) _state = _defaults();
      _state.telemetry = !!on;
      return save();
    },
    /* The install id has ONE owner and it is core/account.js, which loads before this module and
       adopts the value this wizard minted in earlier builds. Kept as a delegate because
       system/telemetry has always read it here. */
    installId: function () {
      if (window.CCAccount && CCAccount.installId()) return CCAccount.installId();
      return _state ? _state.installId : null;
    },

    /* FORGET THAT THIS WAS EVER WALKED, so the next boot behaves exactly like a first run.
       It exists because "open it again" and "reset it" are different things and only the second one
       can be tested: `open()` shows the screens but leaves `completedAt` stamped, so the launch
       AFTER it still skips them. Deliberately narrow: it clears the wizard's own record and NOTHING
       else. No project, no document, no version history, no account, no stored key. */
    reset: function () {
      var keep = _state ? _state.installId : null;
      _state = _defaults();
      if (keep) _state.installId = keep;   // the install id survives, or one machine counts twice
      return save().then(function () { return true; });
    }
  };

  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('system.first-run', _boot); });
  else _boot();

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'first-run', parent: 'system', title: 'First run', mount: function () {}, unmount: function () {} });
  }
})();
