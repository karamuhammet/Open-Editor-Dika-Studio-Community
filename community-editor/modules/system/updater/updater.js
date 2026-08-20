/* Module: system/updater - the update NOTICE. Presentation only.
 *
 * Every decision that matters happens in the main process (`apps/community-desktop/updater.js`): the
 * URL, the signature, the hash, the host pin and the version comparison. This file cannot choose what
 * is downloaded or run, and that is deliberate - this tree ships unpacked into a user-writable folder
 * and is served with `script-src 'unsafe-eval'`, so it is the most writable and most executable place
 * in the product. It asks four questions with no arguments that steer anything, and it draws a card.
 *
 * THREE RULES THIS FILE OWES THE PERSON USING IT:
 *
 * 1. NOTHING BLOCKS. Owner decision 2026-08-16: a free, offline build never forces an update.
 *    The card is dismissible every single time, including when the release is marked important.
 * 2. IT NEVER ASKS TWICE FOR THE SAME THING. "Later" is a state the main process records, not a
 *    checkbox: asking on every launch is how people learn to dismiss without reading.
 * 3. INSTALLING FLUSHES THEIR WORK FIRST. The installer terminates this process, and IndexedDB is the
 *    only copy of what they have made. `flushSaveNow()` runs and has to return before we hand over.
 *
 * Record: docs/desktop-update-channel-plan.md
 */
(function () {
  'use strict';

  /* The browser build has nothing to install, so this module is inert there rather than hidden. */
  if (typeof window === 'undefined' || !window.CCDesktop || !window.CCDesktop.update) return;

  var UP = window.CCDesktop.update;
  var _card = null;
  var _state = null;

  function t(s) { return (window.CCI18n && CCI18n.t) ? CCI18n.t(s) : s; }

  /* The rollout bucket. The install id lives in this browser's IndexedDB and the main process cannot
     read it, so the renderer computes the bucket and passes it. It can only ever make this client MORE
     likely to be offered something, which is why it is allowed to cross the bridge at all. */
  function bucketFor(version) {
    var id = '';
    try { id = (window.CCFirstRun && CCFirstRun.installId && CCFirstRun.installId()) || ''; } catch (e) { id = ''; }
    var s = String(id) + '|' + String(version || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h % 100;
  }

  function esc(v) { return String(v == null ? '' : v); }

  function close() {
    if (_card && _card.parentNode) _card.parentNode.removeChild(_card);
    _card = null;
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); later(); } }

  function later() {
    close();
    try { UP.postpone(); } catch (e) { /* a postpone that fails only means we ask again */ }
  }

  function show(st) {
    if (_card) return;
    _state = st;
    var wrap = document.createElement('div');
    wrap.className = 'cc-upd-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'false');   // it is a notice, not a trap: the editor stays usable

    var box = document.createElement('div');
    box.className = 'cc-upd';

    var h = document.createElement('div');
    h.className = 'cc-upd-title';
    h.textContent = t('Version') + ' ' + esc(st.available) + ' ' + t('is available');
    box.appendChild(h);

    var sub = document.createElement('div');
    sub.className = 'cc-upd-sub';
    sub.textContent = t('You have') + ' ' + esc(st.currentVersion);
    box.appendChild(sub);

    if (st.notes) {
      var n = document.createElement('div');
      n.className = 'cc-upd-notes';
      /* textContent, NEVER innerHTML. These are publisher-authored strings arriving over the network,
         and the house style in this tree is innerHTML with a hand-rolled escaper. Not here. */
      n.textContent = st.notes;
      box.appendChild(n);
    }

    var row = document.createElement('div');
    row.className = 'cc-upd-row';

    if (st.platformCanInstall) {
      var go = document.createElement('button');
      go.className = 'cc-upd-btn cc-upd-primary';
      go.type = 'button';
      go.textContent = t('Update now');
      go.onclick = function () { install(go); };
      row.appendChild(go);
    } else {
      /* No install path on this platform. A button that cannot work is the ghost UI this project
         bans, so it is a link to the release page and the card says why. */
      var open = document.createElement('button');
      open.className = 'cc-upd-btn cc-upd-primary';
      open.type = 'button';
      open.textContent = t('Open the download page');
      open.onclick = function () { try { UP.openReleases(); } catch (e) {} close(); };
      row.appendChild(open);

      var why = document.createElement('div');
      why.className = 'cc-upd-why';
      why.textContent = t('This build cannot install updates for you on this platform, so it will not pretend to.');
      box.appendChild(why);
    }

    var not = document.createElement('button');
    not.className = 'cc-upd-btn';
    not.type = 'button';
    not.textContent = t('Later');
    not.onclick = later;
    row.appendChild(not);

    box.appendChild(row);

    var foot = document.createElement('div');
    foot.className = 'cc-upd-foot';
    foot.textContent = st.important
      ? t('This release fixes something important, so it will be offered again next time. You can always dismiss it.')
      : t('You will not be asked about this version again for a week.');
    box.appendChild(foot);

    wrap.appendChild(box);
    document.body.appendChild(wrap);
    _card = wrap;
    document.addEventListener('keydown', onKey, true);
    not.focus();
  }

  function install(btn) {
    btn.disabled = true;
    btn.textContent = t('Saving your work...');

    /* THE FLUSH IS NOT OPTIONAL AND ITS FAILURE STOPS THE INSTALL. The installer kills this process;
       anything not written is gone, and it is the only copy. */
    var flushed = true;
    try { if (typeof window.flushSaveNow === 'function') window.flushSaveNow(); }
    catch (e) { flushed = false; }
    if (!flushed) {
      btn.disabled = false;
      btn.textContent = t('Update now');
      if (typeof showToast === 'function') showToast(t('Could not save your work, so the update was not started.'), 'error');
      return;
    }

    btn.textContent = t('Downloading...');
    try {
      UP.onProgress(function (pct) {
        if (btn && btn.isConnected) btn.textContent = t('Downloading') + ' ' + pct + '%';
      });
    } catch (e) { /* progress is a nicety */ }

    UP.install().then(function (res) {
      if (res && res.ok) {
        btn.textContent = t('Starting the installer...');
        return;
      }
      btn.disabled = false;
      btn.textContent = t('Update now');
      /* Say WHICH failure. "Update failed" is the message that generates a support thread. */
      var why = {
        disk: t('There is not enough free space to download the update.'),
        hash: t('The downloaded file did not match what the release says it should be, so it was deleted.'),
        download: t('The download did not finish.'),
        host: t('The update pointed somewhere unexpected and was refused.'),
        'notify-only': t('This build cannot install updates for you on this platform.'),
        'nothing-to-install': t('There is no download for this platform.')
      }[res && res.reason] || t('The update could not be installed.');
      if (typeof showToast === 'function') showToast(why, 'error');
    })['catch'](function () {
      btn.disabled = false;
      btn.textContent = t('Update now');
    });
  }

  /* ── boot ───────────────────────────────────────────────────────────────────────────────────────
     After the window is interactive, never on the boot path, and never awaited by anything. A person
     opening a design must not wait on our availability. */
  function boot() {
    setTimeout(function () {
      UP.state().then(function (st) {
        if (!st || !st.enabled) return;
        return UP.check(bucketFor(st.available || '')).then(function (after) {
          if (after && after.available) show(after);
        });
      })['catch'](function () { /* silence is the correct failure */ });
    }, 4000);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  /* Settings > About uses these; nothing else should. */
  window.CCUpdater = {
    state: function () { return UP.state(); },
    checkNow: function () { return UP.checkNow().then(function (st) { if (st && st.available) show(st); return st; }); },
    setOptOut: function (v) { return UP.optOut(!!v); },
    openReleases: function () { return UP.openReleases(); }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'updater', parent: 'system', title: 'system: updater', mount: function () {}, unmount: function () {} });
  }
})();
