/* Module: system/settings/sleep - Settings > Page Sleep (page-sleep controls, owner 2026-07-18).
   UI face of system/page-sleep (CCPageSleep). Rebuilt 2026-07-19 with the NATIVE settings
   vocabulary (settings-section-title / settings-form / sp-accordion / pref-rail-row /
   pref-toggle switch / sbtn) so it matches Preferences 1:1 instead of raw inline HTML.
   Exposed as window.CCPageSleepSettings { build, wire }, dispatched from settings/screen.js
   (data-section="sleep"). */
(function () {
  'use strict';
  var SS = window.__ccSettings;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function icon(name, size) { return (SS && SS.profileIcon) ? SS.profileIcon(name, size || 16) : (typeof getIcon === 'function' ? getIcon(name, size || 16) : ''); }
  var MOON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function build() {
    if (typeof CCPageSleep === 'undefined') {
      return '<div class="settings-section-title">Page Sleep</div><div class="settings-form"><p style="font-size:12px;color:var(--text-dim)">Sleep module not loaded.</p></div>';
    }
    var s = CCPageSleep.stats();
    var awakePresets = [10, 20, 50, 100];
    var awakeBtns = awakePresets.map(function (v) {
      return '<button type="button" class="sbtn ps-awake-btn' + (s.maxAwake === v ? ' active' : '') + '" data-ps-awake="' + v + '" style="padding:6px 14px;width:auto;height:auto;font-size:12px">' + v + '</button>';
    }).join('');
    var nbPresets = [0, 1, 2, 3];
    var nbBtns = nbPresets.map(function (v) {
      return '<button type="button" class="sbtn ps-nb-btn' + (s.neighborWindow === v ? ' active' : '') + '" data-ps-nb="' + v + '" style="padding:6px 12px;width:auto;height:auto;font-size:12px">' + v + '</button>';
    }).join('');

    return '<div class="settings-section-title">Page Sleep</div>' +
      '<div class="settings-form">' +

        '<p style="font-size:12px;color:var(--text-dim);line-height:1.55;margin:0">' +
          'In multi-page projects, to keep the app fast, pages you haven\'t opened for a long time are put to sleep in the background. Their content is safely stored and instantly returns when you click its tab. ' +
          'The page you\'re working on, a few nearby pages, and video / infinite canvas / slide / board pages always stay open.' +
        '</p>' +

        // ── Otomatik uyku accordion ──
        '<div class="sp-accordion open" id="ps-acc-auto">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico" style="color:var(--text-dim)">' + MOON + '</span>' +
            '<span class="sp-acc-title">Automatic sleep</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +

            '<div class="pref-rail-row">' +
              '<span class="pref-rail-label">Automatic sleep</span>' +
              '<label class="pref-toggle">' +
                '<input type="checkbox" id="ps-enabled"' + (s.enabled ? ' checked' : '') + '>' +
                '<span class="pref-toggle-slider"></span>' +
              '</label>' +
            '</div>' +

            '<p style="font-size:11px;color:var(--text-dim);margin:12px 0 6px">Maximum awake pages <span style="color:var(--text-faint)">(pages older than this number sleep)</span></p>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + awakeBtns +
              '<input class="settings-input ps-awake-custom" id="ps-max-awake" type="number" min="5" max="500" step="1" value="' + esc(s.maxAwake) + '" style="width:74px;padding:6px 8px;height:auto" title="Custom value">' +
            '</div>' +

            '<p style="font-size:11px;color:var(--text-dim);margin:14px 0 6px">Neighbor window <span style="color:var(--text-faint)">(pages kept awake on each side of the active page)</span></p>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' + nbBtns + '</div>' +

          '</div>' +
        '</div>' +

        // ── Status + Sleep all accordion ──
        '<div class="sp-accordion open" id="ps-acc-status">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico" style="color:var(--text-dim)">' + icon('templates', 16) + '</span>' +
          '<span class="sp-acc-title">Status</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +
            '<div id="ps-stats" class="ps-stats">' + _statsCard(s) + '</div>' +
            '<button type="button" class="sbtn" id="ps-sleep-all" style="margin-top:12px;padding:8px 16px;width:auto;height:auto;font-size:12px">' + MOON + '<span style="margin-left:6px">Sleep all</span></button>' +
          '</div>' +
        '</div>' +

      '</div>';
  }

  function _statsCard(s) {
    var pct = s.total ? Math.round((s.awake / s.total) * 100) : 100;
    return '' +
      '<div class="ps-stats-row">' +
        '<div class="ps-stat"><div class="ps-stat-num" style="color:var(--gold)">' + s.awake + '</div><div class="ps-stat-lbl">awake</div></div>' +
        '<div class="ps-stat"><div class="ps-stat-num">' + s.slept + '</div><div class="ps-stat-lbl">asleep</div></div>' +
        '<div class="ps-stat"><div class="ps-stat-num">' + s.total + '</div><div class="ps-stat-lbl">total</div></div>' +
      '</div>' +
      '<div class="ps-bar"><span style="width:' + pct + '%"></span></div>';
  }

  function _refresh() {
    var el = document.getElementById('ps-stats');
    if (el && typeof CCPageSleep !== 'undefined') el.innerHTML = _statsCard(CCPageSleep.stats());
  }

  function _syncAwakeButtons(v) {
    document.querySelectorAll('.ps-awake-btn').forEach(function (b) { b.classList.toggle('active', parseInt(b.getAttribute('data-ps-awake'), 10) === v); });
  }
  function _syncNbButtons(v) {
    document.querySelectorAll('.ps-nb-btn').forEach(function (b) { b.classList.toggle('active', parseInt(b.getAttribute('data-ps-nb'), 10) === v); });
  }

  function wire() {
    if (typeof CCPageSleep === 'undefined') return;
    var en = document.getElementById('ps-enabled');
    var mx = document.getElementById('ps-max-awake');
    var all = document.getElementById('ps-sleep-all');

    if (en) en.onchange = function () { CCPageSleep.configure({ enabled: !!en.checked }); _refresh(); if (typeof renderPageTabs === 'function') renderPageTabs(); };

    document.querySelectorAll('.ps-awake-btn').forEach(function (btn) {
      btn.onclick = function () {
        var v = parseInt(btn.getAttribute('data-ps-awake'), 10);
        CCPageSleep.configure({ maxAwake: v });
        if (mx) mx.value = v;
        _syncAwakeButtons(v);
        _refresh();
      };
    });
    if (mx) mx.onchange = function () {
      var v = parseInt(mx.value, 10);
      if (v >= 5 && v <= 500) { CCPageSleep.configure({ maxAwake: v }); _syncAwakeButtons(v); _refresh(); }
    };

    document.querySelectorAll('.ps-nb-btn').forEach(function (btn) {
      btn.onclick = function () {
        var v = parseInt(btn.getAttribute('data-ps-nb'), 10);
        CCPageSleep.configure({ neighborWindow: v });
        _syncNbButtons(v);
        _refresh();
      };
    });

    if (all) all.onclick = function () {
      var n = CCPageSleep.sleepAllNow();
      if (typeof showToast === 'function') showToast(n + ' page put to sleep');
      _refresh();
      if (typeof renderPageTabs === 'function') renderPageTabs();
    };
  }

  window.CCPageSleepSettings = { build: build, wire: wire };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'sleep', parent: 'system.settings', title: 'settings: sleep', mount: function () {}, unmount: function () {} });
  }
})();
