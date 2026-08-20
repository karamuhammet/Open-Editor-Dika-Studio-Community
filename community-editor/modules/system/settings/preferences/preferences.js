/* Module: system/settings/preferences — PREFERENCES — general app preferences.
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  SS.buildPreferencesSection = function () {
    var soundsOn = (typeof _ccSoundEnabled !== 'undefined') ? _ccSoundEnabled : true;
    var wizDisabled = false;
    try { wizDisabled = localStorage.getItem('dika_wizDisabled') === '1'; } catch(e) {}
    var bulkGalSave = false;
    try { bulkGalSave = localStorage.getItem('dika_bulkGallerySave') === '1'; } catch(e) {}
    var vis = SS._getRailVisibility();
    var activeLocale = (window.CCI18n && typeof CCI18n.locale === 'function') ? CCI18n.locale() : 'en';
    var localeOptions = '';
    if (window.CCI18n && Array.isArray(CCI18n.locales)) {
      CCI18n.locales.forEach(function (meta) {
        localeOptions += '<option value="' + SS.escAttr(meta.code) + '"' + (meta.code === activeLocale ? ' selected' : '') + '>' + SS.escAttr(meta.label) + '</option>';
      });
    }

    // build rail toggle rows with real SVG icons from ICONS
    var railRows = '';
    SS.RAIL_ITEMS.forEach(function(ri) {
      var checked = (vis[ri.tab] !== false) ? 'checked' : '';
      var ico = SS.profileIcon(ri.tab, 16);
      railRows +=
        '<div class="pref-rail-row">' +
          '<span class="pref-rail-icon">' + ico + '</span>' +
          '<span class="pref-rail-label">' + ri.label + '</span>' +
          '<label class="pref-toggle">' +
            '<input type="checkbox" data-rail-tab="' + ri.tab + '" ' + checked + '>' +
            '<span class="pref-toggle-slider"></span>' +
          '</label>' +
        '</div>';
    });

    return '<div class="settings-section-title">Preferences</div>' +
      '<div class="settings-form">' +

        // ── Left Menu Organization accordion ──
        '<div class="sp-accordion pref-rail-accordion open" id="pref-rail-acc">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico">' + SS.profileIcon('templates', 16) + '</span>' +
            '<span class="sp-acc-title">Left Menu Organization</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +
            '<p style="font-size:11px;color:var(--text-dim);margin:0 0 12px">Show or hide items in the left sidebar rail.</p>' +
            '<div id="pref-rail-list">' + railRows + '</div>' +
            '<div style="margin-top:12px;display:flex;gap:8px">' +
              '<button id="pref-rail-all" class="sbtn" style="padding:6px 14px;width:auto;height:auto;font-size:11px">Show All</button>' +
              '<button id="pref-rail-none" class="sbtn" style="padding:6px 14px;width:auto;height:auto;font-size:11px">Hide All</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // ── General accordion ──
        '<div class="sp-accordion open" id="pref-general-acc">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico">' + SS.profileIcon('gear', 16) + '</span>' +
            '<span class="sp-acc-title">General</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +
            '<div class="pref-rail-row">' +
              '<span class="pref-rail-icon" style="color:var(--text-dim)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></span>' +
              '<span class="pref-rail-label">Sound Effects</span>' +
              '<label class="pref-toggle">' +
                '<input type="checkbox" id="set-sounds" ' + (soundsOn ? 'checked' : '') + '>' +
                '<span class="pref-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="pref-rail-row">' +
              '<span class="pref-rail-icon" style="color:var(--text-dim)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-6 0v4"/><rect x="5" y="9" width="14" height="12" rx="2"/></svg></span>' +
              '<span class="pref-rail-label">Skip Startup Wizard</span>' +
              '<label class="pref-toggle">' +
                '<input type="checkbox" id="set-wiz-disable" ' + (wizDisabled ? 'checked' : '') + '>' +
                '<span class="pref-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="pref-rail-row">' +
              '<span class="pref-rail-icon" style="color:var(--text-dim)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg></span>' +
              '<span class="pref-rail-label">Save Bulk Images to Gallery</span>' +
              '<label class="pref-toggle">' +
                '<input type="checkbox" id="set-bulk-gallery" ' + (bulkGalSave ? 'checked' : '') + '>' +
                '<span class="pref-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // ── Language accordion ──
        '<div class="sp-accordion open" id="pref-language-acc">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico">' + SS.profileIcon('globe', 16) + '</span>' +
            '<span class="sp-acc-title">Language</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +
            '<div class="settings-field">' +
              '<label class="settings-label" for="set-locale">App language</label>' +
              '<select class="settings-input" id="set-locale" style="cursor:pointer">' + localeOptions + '</select>' +
            '</div>' +
            '<p data-i18n="Select a language. Changes apply immediately." style="font-size:11px;color:var(--text-dim);margin:0">Select a language. Changes apply immediately.</p>' +
          '</div>' +
        '</div>' +

        // ── Trash Auto-Clean accordion ──
        '<div class="sp-accordion" id="pref-trash-acc">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico" style="color:var(--text-dim)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span>' +
            '<span class="sp-acc-title">Trash Auto-Clean</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +
            '<p style="font-size:11px;color:var(--text-dim);margin:0 0 12px">Automatically delete items in the gallery trash after a set period.</p>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              '<button class="sbtn set-trash-day' + ((typeof galTrashGetAutoCleanDays === 'function' && galTrashGetAutoCleanDays() === 1) ? ' active' : '') + '" data-trash-days="1" style="padding:6px 14px;width:auto;height:auto;font-size:11px">1 Day</button>' +
              '<button class="sbtn set-trash-day' + ((typeof galTrashGetAutoCleanDays === 'function' && galTrashGetAutoCleanDays() === 7) ? ' active' : '') + '" data-trash-days="7" style="padding:6px 14px;width:auto;height:auto;font-size:11px">7 Days</button>' +
              '<button class="sbtn set-trash-day' + ((typeof galTrashGetAutoCleanDays === 'function' && galTrashGetAutoCleanDays() === 30) ? ' active' : '') + '" data-trash-days="30" style="padding:6px 14px;width:auto;height:auto;font-size:11px">30 Days</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // ── Danger Zone accordion ──
        '<div class="sp-accordion" id="pref-danger-acc">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico" style="color:var(--red)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>' +
            '<span class="sp-acc-title" style="color:var(--red)">Danger Zone</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +
            '<p style="font-size:11px;color:var(--text-dim);margin:0 0 10px">This will clear all saved data including profile, templates, preferences, and downloaded AI subtitle models.</p>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px">' +
              '<span style="font-size:11px;color:var(--text-dim)">AI subtitle models cache</span>' +
              '<span id="set-model-cache-size" style="font-size:12px;font-weight:600;color:var(--text)">&hellip;</span>' +
            '</div>' +
            '<button id="set-clear-cache" class="sbtn" style="padding:8px 16px;width:auto;height:auto;font-size:12px;border-color:var(--red);color:var(--red)">Clear All Cache</button>' +
          '</div>' +
        '</div>' +

        // Page Group Sleep accordion REMOVED 2026-07-19: it drove `pgSleepSettings` /
        // `_pgScheduleSleep`, which only flip a `group.sleepState` flag that NOTHING reads
        // (grep-proven dead). The real, working feature is the page-level "Page Sleep"
        // (Settings > Page Sleep, modules/system/page-sleep). A control that looks live but does
        // nothing is a ghost (CLAUDE.md), so it is gone rather than duplicated.

      '</div>';
  };

  SS.wirePreferencesHandlers = function () {
    // ── Rail visibility toggles ──
    document.querySelectorAll('#pref-rail-list input[data-rail-tab]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var vis = SS._getRailVisibility();
        vis[cb.dataset.railTab] = cb.checked;
        SS._saveRailVisibility(vis);
        SS.applyRailVisibility();
        // close flyout if the hidden tab was active
        if (!cb.checked && typeof activeFlyoutTab !== 'undefined' && activeFlyoutTab === cb.dataset.railTab) {
          if (typeof closeFlyout === 'function') closeFlyout();
        }
      });
    });

    var showAllBtn = document.getElementById('pref-rail-all');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', function() {
        var vis = {};
        SS.RAIL_ITEMS.forEach(function(ri) { vis[ri.tab] = true; });
        SS._saveRailVisibility(vis);
        SS.applyRailVisibility();
        document.querySelectorAll('#pref-rail-list input[data-rail-tab]').forEach(function(cb) { cb.checked = true; });
      });
    }

    var hideAllBtn = document.getElementById('pref-rail-none');
    if (hideAllBtn) {
      hideAllBtn.addEventListener('click', function() {
        var vis = {};
        SS.RAIL_ITEMS.forEach(function(ri) { vis[ri.tab] = false; });
        SS._saveRailVisibility(vis);
        SS.applyRailVisibility();
        document.querySelectorAll('#pref-rail-list input[data-rail-tab]').forEach(function(cb) { cb.checked = false; });
        if (typeof closeFlyout === 'function') closeFlyout();
      });
    }

    // ── Existing handlers ──
    var soundsCb = document.getElementById('set-sounds');
    if (soundsCb) {
      soundsCb.onchange = function() {
        if (typeof _ccSoundEnabled !== 'undefined') _ccSoundEnabled = soundsCb.checked;
        try { localStorage.setItem('dika_sounds', soundsCb.checked ? 'on' : 'off'); } catch(e) {}
      };
    }
    var wizCb = document.getElementById('set-wiz-disable');
    if (wizCb) {
      wizCb.onchange = function() {
        try { localStorage.setItem('dika_wizDisabled', wizCb.checked ? '1' : '0'); } catch(e) {}
        if (typeof showToast === 'function') showToast(wizCb.checked ? 'Wizard disabled — editor will open directly next time' : 'Wizard re-enabled');
      };
    }
    var bulkGalCb = document.getElementById('set-bulk-gallery');
    if (bulkGalCb) {
      bulkGalCb.onchange = function() {
        try { localStorage.setItem('dika_bulkGallerySave', bulkGalCb.checked ? '1' : '0'); } catch(e) {}
        if (typeof showToast === 'function') showToast(bulkGalCb.checked ? 'Bulk images will be saved to Gallery' : 'Bulk gallery save disabled');
      };
    }
    var localeSelect = document.getElementById('set-locale');
    if (localeSelect) {
      localeSelect.onchange = function() {
        if (!window.CCI18n || typeof CCI18n.setLocale !== 'function') return;
        CCI18n.setLocale(localeSelect.value).then(function (ok) {
          if (!ok) return;
          if (typeof showToast === 'function') {
            var meta = null;
            if (window.CCI18n && Array.isArray(CCI18n.locales)) {
              CCI18n.locales.forEach(function (item) { if (item.code === localeSelect.value) meta = item; });
            }
            var label = meta ? meta.label : localeSelect.value;
            showToast(window.CCI18n && typeof CCI18n.t === 'function'
              ? CCI18n.t('Language set to {language}', { language: label })
              : 'Language set to ' + label);
          }
        });
      };
    }
    var clearBtn = document.getElementById('set-clear-cache');
    if (clearBtn) {
      var cacheSizeEl = document.getElementById('set-model-cache-size');
      var _fmtMB = function(bytes) {
        if (!bytes || bytes < 1) return '0 MB';
        var mb = bytes / (1024 * 1024);
        if (mb < 1) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
        return (mb >= 100 ? Math.round(mb) : mb.toFixed(1)) + ' MB';
      };
      // Show the current AI model cache size (async, read from Cache Storage).
      if (cacheSizeEl) {
        if (window.VEAutoSubtitle && VEAutoSubtitle.getCacheBytes) {
          VEAutoSubtitle.getCacheBytes()
            .then(function(b) { cacheSizeEl.textContent = _fmtMB(b); })
            .catch(function() { cacheSizeEl.textContent = '0 MB'; });
        } else {
          cacheSizeEl.textContent = '0 MB';
        }
      }
      clearBtn.onclick = function() {
        ['dika_userInfo', 'dika_wizDone', 'dika_sounds', 'dika_coupon',
         'dika_autosave', 'dika-autosave', 'dika_versions',
         'dika_saved_templates', 'dika_brandsets'].forEach(function(k) {
          try { localStorage.removeItem(k); } catch(e) {}
        });
        // Reset pages to blank
        if (typeof pages !== 'undefined' && typeof initPages === 'function') {
          initPages();
          if (typeof canvas !== 'undefined' && canvas) {
            canvas.clear();
            canvas.setBackgroundColor('#0d0d0d', function() { canvas.renderAll(); });
          }
        }
        // Clear downloaded AI subtitle models and report how much was freed.
        var _report = function(freedBytes) {
          if (cacheSizeEl) cacheSizeEl.textContent = '0 MB';
          var msg = (freedBytes > 0)
            ? 'All cache cleared. Freed ' + _fmtMB(freedBytes) + ' of AI models.'
            : 'All cache cleared, starting fresh.';
          if (typeof showToast === 'function') showToast(msg);
        };
        if (window.VEAutoSubtitle && VEAutoSubtitle.clearModelCache) {
          VEAutoSubtitle.clearModelCache().then(_report).catch(function() { _report(0); });
        } else {
          _report(0);
        }
      };
    }

    // ── Trash auto-clean buttons ──
    document.querySelectorAll('.set-trash-day').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var days = parseInt(btn.dataset.trashDays, 10);
        if (typeof galTrashSetAutoCleanDays === 'function') galTrashSetAutoCleanDays(days);
        document.querySelectorAll('.set-trash-day').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (typeof showToast === 'function') showToast('Trash auto-clean set to ' + days + ' day' + (days > 1 ? 's' : ''));
      });
    });

    // Page Group Sleep handlers REMOVED 2026-07-19 (dead feature, see buildPreferencesSection).
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'preferences', parent: 'system.settings', title: 'settings: preferences', mount: function () {}, unmount: function () {} });
  }
})();
