/* Module: system/settings/version-history — VERSION HISTORY — autosave snapshot list + restore.
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  SS.formatVersionTs = function (ts) {
    if (ts == null || ts === '') return '—';
    var n = typeof ts === 'number' ? ts : parseInt(ts, 10);
    if (isNaN(n)) return '—';
    try {
      return new Date(n).toLocaleString();
    } catch (e) {
      return '—';
    }
  };

  SS.readAutosavePayload = function () {
    try {
      var raw = localStorage.getItem('dika_autosave');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  SS.readVersionSnapshots = function () {
    try {
      var raw = localStorage.getItem('dika_versions');
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  SS.buildVersionHistorySection = function () {
    var payload = SS.readAutosavePayload();
    var snapshots = SS.readVersionSnapshots();
    var lastTs = payload && payload.timestamp;
    var html = '<div class="settings-section-title">Version History</div>' +
      '<p style="color:var(--text-dim);font-size:13px;margin-bottom:12px">Auto-save times from this browser. The latest state is stored under <span style="color:var(--text-faint);font-size:12px">dika_autosave</span>; rolling snapshots use <span style="color:var(--text-faint);font-size:12px">dika_versions</span>.</p>';

    html += '<div class="settings-form" style="margin-bottom:12px">';
    if (lastTs) {
      html += '<div class="settings-field">' +
        '<label class="settings-label">Latest auto-save</label>' +
        '<div style="font-size:14px;color:var(--text)">' + SS.escAttr(SS.formatVersionTs(lastTs)) + '</div>' +
        '</div>';
    } else {
      html += '<p style="color:var(--text-dim);font-size:13px;margin:0">No <code>dika_autosave</code> entry yet.</p>';
    }
    html += '</div>';

    if (snapshots.length) {
      html += '<div class="settings-label" style="margin-bottom:8px">Snapshot timestamps</div>' +
        '<ul id="settings-vh-list" style="margin:0 0 12px 0;padding:0 0 0 18px;color:var(--text-dim);font-size:12px;max-height:240px;overflow-y:auto;line-height:1.4">';
      snapshots.forEach(function (v) {
        var t = v && v.timestamp;
        var line = (v && v.label) ? String(v.label) : SS.formatVersionTs(t);
        html += '<li style="margin-bottom:6px">' + SS.escAttr(line) + ' — <span style="color:var(--text-faint)">' + SS.escAttr(SS.formatVersionTs(t)) + '</span></li>';
      });
      html += '</ul>';
    } else {
      html += '<p style="color:var(--text-faint);font-size:12px;margin-bottom:12px">No rolling snapshots yet (they are added on each auto-save tick).</p>';
    }

    html += '<button type="button" class="sbtn" id="settings-vh-clear" style="padding:8px 16px;width:auto;height:auto;font-size:12px">Clear History</button>' +
      '<span style="font-size:10px;color:var(--text-faint);margin-top:6px;display:block">Clears stored version snapshots (<code>dika_versions</code>). Current canvas and latest auto-save file are not removed.</span>';

    return html;
  };

  SS.wireVersionHistoryHandlers = function () {
    var clearBtn = document.getElementById('settings-vh-clear');
    if (!clearBtn) return;
    clearBtn.onclick = function () {
      try {
        localStorage.removeItem('dika_versions');
      } catch (e) {}
      var ct = document.getElementById('settings-content');
      if (ct) {
        ct.innerHTML = SS.buildVersionHistorySection();
        SS.wireVersionHistoryHandlers();
      }
      if (typeof showToast === 'function') showToast('Version history cleared');
    };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'version-history', parent: 'system.settings', title: 'settings: version-history', mount: function () {}, unmount: function () {} });
  }
})();
