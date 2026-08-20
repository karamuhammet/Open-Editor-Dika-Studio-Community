/* Module: system/settings/keyboard — KEYBOARD MANAGER — the shortcut editor (tabs, record/rebind, conflicts, profiles, fallbacks).
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  SS.buildKeyboardManagerSection = function () {
    if (typeof KeyboardManager === 'undefined') return SS._buildFallbackShortcuts();

    var html = '<div class="settings-section-title" style="margin-bottom:8px">' +
      (typeof getIcon === 'function' ? '<span style="color:var(--gold);margin-right:8px;vertical-align:middle">' + getIcon('keyboard', 20) + '</span>' : '') +
      'Keyboard Manager</div>' +
      '<p style="color:var(--text-dim);font-size:12px;margin-bottom:16px">Customize shortcuts, manage profiles, and resolve conflicts across all app modules.</p>';

    // Tabs
    html += '<div class="km-tabs">';
    var tabs = [
      { id: 'shortcuts',  label: 'Shortcuts' },
      { id: 'categories', label: 'Categories' },
      { id: 'conflicts',  label: 'Conflicts' },
      { id: 'profiles',   label: 'Profiles' },
      { id: 'advanced',   label: 'Advanced' }
    ];
    tabs.forEach(function (t) {
      var active = t.id === SS._kbActiveTab ? ' km-tab-active' : '';
      var badge = '';
      if (t.id === 'conflicts') {
        var cCount = KeyboardManager.getAllConflicts().length;
        if (cCount > 0) badge = '<span class="km-badge">' + cCount + '</span>';
      }
      html += '<button class="km-tab' + active + '" data-km-tab="' + t.id + '">' + SS.escAttr(t.label) + badge + '</button>';
    });
    html += '</div>';

    // Tab content
    html += '<div class="km-tab-content" id="km-tab-content">';
    html += SS._buildKmTabContent(SS._kbActiveTab);
    html += '</div>';

    return html;
  };

  SS._buildKmTabContent = function (tab) {
    if (tab === 'shortcuts')  return SS._buildShortcutsTab();
    if (tab === 'categories') return SS._buildCategoriesTab();
    if (tab === 'conflicts')  return SS._buildConflictsTab();
    if (tab === 'profiles')   return SS._buildProfilesTab();
    if (tab === 'advanced')   return SS._buildAdvancedTab();
    return '';
  };

  SS._buildShortcutsTab = function () {
    var html = '<div class="km-toolbar">' +
      '<div class="km-search-wrap">' +
        (typeof getIcon === 'function' ? '<span class="km-search-ico">' + getIcon('search', 14) + '</span>' : '') +
        '<input type="text" class="km-search" id="km-search" placeholder="Search commands..." value="' + SS.escAttr(SS._kbSearchQuery) + '">' +
      '</div>' +
      '<div class="km-filters">' +
        '<select class="km-select" id="km-filter-cat"><option value="">All Categories</option>';
    KeyboardManager.getCategories().forEach(function (c) {
      var sel = SS._kbFilter.category === c ? ' selected' : '';
      html += '<option value="' + SS.escAttr(c) + '"' + sel + '>' + SS.escAttr(c) + '</option>';
    });
    html += '</select>' +
        '<select class="km-select" id="km-filter-state">' +
          '<option value="">All</option>' +
          '<option value="assigned"' + (SS._kbFilter.assignedOnly ? ' selected' : '') + '>Assigned</option>' +
          '<option value="unassigned"' + (SS._kbFilter.unassignedOnly ? ' selected' : '') + '>Unassigned</option>' +
          '<option value="customized"' + (SS._kbFilter.customizedOnly ? ' selected' : '') + '>Customized</option>' +
          '<option value="conflicts"' + (SS._kbFilter.conflictsOnly ? ' selected' : '') + '>Conflicts</option>' +
        '</select>' +
      '</div>' +
    '</div>';

    var cmds = KeyboardManager.searchCommands(SS._kbSearchQuery, SS._kbFilter);
    if (cmds.length === 0) {
      html += '<div class="km-empty">No commands match your search.</div>';
      return html;
    }

    html += '<div class="km-cmd-list" id="km-cmd-list">';
    cmds.forEach(function (cmd) {
      html += SS._buildCommandRow(cmd);
    });
    html += '</div>';
    return html;
  };

  SS._buildCommandRow = function (cmd) {
    var eff = KeyboardManager.getEffectiveShortcut(cmd.id);
    var isCustom = cmd.userShortcut !== undefined;
    var conflicts = eff ? KeyboardManager.findConflicts(eff, cmd.id) : [];
    var hasConflict = conflicts.length > 0;

    var html = '<div class="km-cmd-row' + (hasConflict ? ' km-conflict' : '') + '" data-cmd-id="' + SS.escAttr(cmd.id) + '">' +
      '<div class="km-cmd-info">' +
        '<span class="km-cmd-label">' + SS.escAttr(cmd.label) + '</span>' +
        '<span class="km-cmd-cat">' + SS.escAttr(cmd.category) + '</span>' +
      '</div>' +
      '<div class="km-cmd-shortcut">';

    if (SS._kbRecordingCmd === cmd.id) {
      html += '<span class="km-recording">Press keys…</span>' +
        '<button class="km-btn km-btn-cancel" onclick="event.stopPropagation(); if(typeof SS._kbCancelRecording===\'function\') SS._kbCancelRecording();" title="Cancel recording">&times;</button>';
    } else if (eff) {
      html += '<span class="km-key-combo' + (isCustom ? ' km-custom' : '') + '">' + SS._renderKeyBadges(eff) + '</span>';
    } else {
      html += '<span class="km-unassigned">—</span>';
    }

    html += '</div>' +
      '<div class="km-cmd-actions">';

    if (cmd.isEditable) {
      html += '<button class="km-btn km-btn-record" data-cmd="' + SS.escAttr(cmd.id) + '" title="Record shortcut">' +
        (typeof getIcon === 'function' ? getIcon('keyboard', 14) : '⌨') + '</button>';
      if (isCustom) {
        html += '<button class="km-btn km-btn-reset" data-cmd="' + SS.escAttr(cmd.id) + '" title="Reset to default">' +
          (typeof getIcon === 'function' ? getIcon('reset', 14) : '↺') + '</button>';
      }
    }

    if (hasConflict) {
      html += '<span class="km-conflict-badge" title="' + conflicts.length + ' conflict(s)">⚠</span>';
    }

    html += '</div></div>';
    return html;
  };

  SS._renderKeyBadges = function (shortcut) {
    if (!shortcut) return '';
    var norm = typeof KeyboardManager !== 'undefined' && KeyboardManager.normalizeShortcut
      ? KeyboardManager.normalizeShortcut(shortcut) : shortcut;
    if (!norm) return '';
    // Display-only: special pseudo shortcut for triple-tap Alt
    if (/^Alt\s*\(\s*triple\s*tap\s*\)$/i.test(norm)) {
      return ['Alt', 'Alt', 'Alt'].map(function (k) {
        return '<span class="km-key">' + SS.escAttr(k) + '</span>';
      }).join('<span class="km-key-plus">·</span>');
    }
    return norm.split('+').map(function (k) {
      var display = k === 'Plus' ? '+' : k;
      return '<span class="km-key">' + SS.escAttr(display) + '</span>';
    }).join('<span class="km-key-plus">·</span>');
  };

  SS._buildCategoriesTab = function () {
    var cats = KeyboardManager.getCategories();
    var html = '<div class="km-cat-grid">';
    cats.forEach(function (cat) {
      var cmds = KeyboardManager.getCommandsByCategory(cat);
      var assigned = cmds.filter(function (c) { return !!KeyboardManager.getEffectiveShortcut(c.id); }).length;
      html += '<div class="km-cat-card" data-cat="' + SS.escAttr(cat) + '">' +
        '<div class="km-cat-name">' + SS.escAttr(cat) + '</div>' +
        '<div class="km-cat-stats">' + cmds.length + ' commands · ' + assigned + ' assigned</div>' +
      '</div>';
    });
    html += '</div>';

    // Show commands for selected category (default: first)
    html += '<div id="km-cat-detail"></div>';
    return html;
  };

  SS._buildCategoryDetail = function (cat) {
    var cmds = KeyboardManager.getCommandsByCategory(cat);
    var html = '<div class="km-cat-detail-header">' +
      '<span class="km-cat-detail-title">' + SS.escAttr(cat) + '</span>' +
      '<button class="km-btn km-btn-sm" id="km-reset-cat" data-cat="' + SS.escAttr(cat) + '">Reset Category</button>' +
    '</div>';
    html += '<div class="km-cmd-list">';
    cmds.forEach(function (cmd) { html += SS._buildCommandRow(cmd); });
    html += '</div>';
    return html;
  };

  SS._buildConflictsTab = function () {
    var conflicts = KeyboardManager.getAllConflicts();
    if (conflicts.length === 0) {
      return '<div class="km-empty km-no-conflicts">' +
        '<span style="font-size:28px;display:block;margin-bottom:8px">✓</span>' +
        'No shortcut conflicts detected.' +
      '</div>';
    }

    var html = '<div class="km-conflict-list">';
    conflicts.forEach(function (cf) {
      html += '<div class="km-conflict-group">' +
        '<div class="km-conflict-shortcut">' + SS._renderKeyBadges(cf.shortcut) + '</div>' +
        '<div class="km-conflict-cmds">';
      cf.commands.forEach(function (c) {
        html += '<div class="km-conflict-cmd">' +
          '<span class="km-cmd-label">' + SS.escAttr(c.label) + '</span>' +
          '<span class="km-cmd-cat">' + SS.escAttr(c.category) + '</span>' +
          '<span class="km-conflict-ctx">' + (c.contexts || []).join(', ') + '</span>' +
          '<button class="km-btn km-btn-sm km-btn-resolve" data-cmd="' + SS.escAttr(c.id) + '">Change</button>' +
        '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  };

  SS._buildProfilesTab = function () {
    var profiles = KeyboardManager.getProfiles();
    var html = '<div class="km-prof-header">' +
      '<span class="km-prof-title">Shortcut Profiles</span>' +
      '<button class="km-btn km-btn-primary" id="km-prof-create">' +
        (typeof getIcon === 'function' ? getIcon('plus', 14) : '+') + ' New Profile</button>' +
    '</div>';

    html += '<div class="km-prof-list">';
    profiles.forEach(function (p) {
      var isActive = p.isActive;
      html += '<div class="km-prof-card' + (isActive ? ' km-prof-active' : '') + '" data-prof-id="' + SS.escAttr(p.id) + '">' +
        '<div class="km-prof-info">' +
          '<span class="km-prof-name">' + SS.escAttr(p.name) + '</span>' +
          (isActive ? '<span class="km-prof-badge">Active</span>' : '') +
          '<span class="km-prof-meta">' + (p.meta.updatedAt ? 'Updated ' + SS._relativeTime(p.meta.updatedAt) : '') + '</span>' +
        '</div>' +
        '<div class="km-prof-actions">';

      if (!isActive) {
        html += '<button class="km-btn km-btn-sm" data-prof-switch="' + SS.escAttr(p.id) + '">Activate</button>';
      }
      html += '<button class="km-btn km-btn-sm" data-prof-dup="' + SS.escAttr(p.id) + '">Duplicate</button>';
      if (p.id !== 'default') {
        html += '<button class="km-btn km-btn-sm" data-prof-rename="' + SS.escAttr(p.id) + '">Rename</button>';
        html += '<button class="km-btn km-btn-sm km-btn-danger" data-prof-del="' + SS.escAttr(p.id) + '">Delete</button>';
      }
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  };

  SS._relativeTime = function (ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  };

  SS._buildAdvancedTab = function () {
    var html = '<div class="km-adv-section">' +
      '<h3 class="km-adv-title">Import / Export</h3>' +
      '<p class="km-adv-desc">Export your shortcuts profile as JSON or import from a file.</p>' +
      '<div class="km-adv-btns">' +
        '<button class="km-btn km-btn-primary" id="km-export-prof">' +
          (typeof getIcon === 'function' ? getIcon('export', 14) : '↗') + ' Export Profile</button>' +
        '<button class="km-btn" id="km-import-prof">' +
          (typeof getIcon === 'function' ? getIcon('import', 14) : '↙') + ' Import Profile</button>' +
        '<input type="file" id="km-import-file" accept=".json" style="display:none">' +
      '</div>' +
    '</div>';

    html += '<div class="km-adv-section">' +
      '<h3 class="km-adv-title">Reset Options</h3>' +
      '<p class="km-adv-desc">Reset shortcuts to their defaults. This cannot be undone.</p>' +
      '<div class="km-adv-btns">' +
        '<button class="km-btn km-btn-danger" id="km-reset-all">' +
          (typeof getIcon === 'function' ? getIcon('reset', 14) : '↺') + ' Reset All Shortcuts</button>' +
      '</div>' +
    '</div>';

    html += '<div class="km-adv-section">' +
      '<h3 class="km-adv-title">Platform</h3>' +
      '<p class="km-adv-desc">Detected: <strong>' + SS._detectPlatform() + '</strong>. Keyboard shortcuts use Ctrl on Windows/Linux and Cmd on macOS.</p>' +
    '</div>';

    html += '<div class="km-adv-section">' +
      '<h3 class="km-adv-title">Reserved Shortcuts</h3>' +
      '<p class="km-adv-desc">These shortcuts are used by the browser or OS and may not work reliably:</p>' +
      '<div class="km-reserved-list">';
    KeyboardManager.RESERVED_SHORTCUTS.forEach(function (s) {
      html += '<span class="km-key-combo km-reserved">' + SS._renderKeyBadges(s) + '</span> ';
    });
    html += '</div></div>';

    return html;
  };

  SS._detectPlatform = function () {
    var p = navigator.platform || '';
    if (p.indexOf('Mac') >= 0) return 'macOS';
    if (p.indexOf('Win') >= 0) return 'Windows';
    if (p.indexOf('Linux') >= 0) return 'Linux';
    return 'Unknown';
  };

  SS._buildFallbackShortcuts = function () {
    var rows = [
      ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+D', 'Duplicate'],
      ['Ctrl+G', 'Group'], ['Ctrl+Shift+G', 'Ungroup'], ['Delete', 'Delete selected'],
      ['Space+Drag', 'Pan canvas'], ['Ctrl+Mouse wheel', 'Zoom'],
      ['Alt+1', 'Templates'], ['Alt+2', 'Text & Shapes'], ['Alt+3', 'Background'],
      ['Alt+4', 'Icons'], ['Alt+5', 'Patterns'],
      ['Board mode', '1–5 for tools; Q / W / E / T / N / X for other tools']
    ];
    var html = '<div class="settings-section-title">Keyboard Shortcuts</div>' +
      '<p style="color:var(--text-dim);font-size:13px;margin-bottom:8px">Reference for the editor and board mode.</p>' +
      '<div class="settings-shortcuts-wrap" style="border:1px solid var(--border);border-radius:8px;padding:0 12px;margin-top:4px">';
    rows.forEach(function (r, i) {
      var border = i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : '';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:10px 0;' + border + 'font-size:13px">' +
        '<span style="color:var(--text);font-weight:600;white-space:nowrap;font-family:system-ui,Segoe UI,sans-serif">' + SS.escAttr(r[0]) + '</span>' +
        '<span style="color:var(--text-dim);text-align:right;line-height:1.35">' + SS.escAttr(r[1]) + '</span>' +
        '</div>';
    });
    html += '</div>';
    return html;
  };

  SS.wireKeyboardManagerHandlers = function () {
    if (typeof KeyboardManager === 'undefined') return;

    // Tab switching
    document.querySelectorAll('.km-tab').forEach(function (btn) {
      btn.onclick = function () {
        SS._kbActiveTab = btn.dataset.kmTab;
        var ct = document.getElementById('settings-content');
        if (ct) { ct.innerHTML = SS.buildKeyboardManagerSection(); SS.wireKeyboardManagerHandlers(); }
      };
    });

    // Search
    var searchEl = document.getElementById('km-search');
    if (searchEl) {
      searchEl.oninput = function () {
        SS._kbSearchQuery = searchEl.value;
        SS._refreshKmList();
      };
      searchEl.focus();
    }

    // Filters
    var filterCat = document.getElementById('km-filter-cat');
    if (filterCat) filterCat.onchange = function () {
      SS._kbFilter.category = filterCat.value || undefined;
      SS._refreshKmList();
    };
    var filterState = document.getElementById('km-filter-state');
    if (filterState) filterState.onchange = function () {
      SS._kbFilter = { category: SS._kbFilter.category };
      var v = filterState.value;
      if (v === 'assigned') SS._kbFilter.assignedOnly = true;
      if (v === 'unassigned') SS._kbFilter.unassignedOnly = true;
      if (v === 'customized') SS._kbFilter.customizedOnly = true;
      if (v === 'conflicts') SS._kbFilter.conflictsOnly = true;
      SS._refreshKmList();
    };

    // Record buttons
    SS._wireRecordButtons();

    // Reset buttons
    document.querySelectorAll('.km-btn-reset').forEach(function (btn) {
      btn.onclick = function () {
        var cmdId = btn.dataset.cmd;
        KeyboardManager.resetShortcut(cmdId);
        SS._refreshKmList();
        if (typeof showToast === 'function') showToast('Shortcut reset to default');
      };
    });

    // Category cards
    document.querySelectorAll('.km-cat-card').forEach(function (card) {
      card.onclick = function () {
        document.querySelectorAll('.km-cat-card').forEach(function (c) { c.classList.remove('km-cat-selected'); });
        card.classList.add('km-cat-selected');
        var detail = document.getElementById('km-cat-detail');
        if (detail) {
          detail.innerHTML = SS._buildCategoryDetail(card.dataset.cat);
          SS._wireRecordButtons();
          SS._wireCategoryResetBtn();
        }
      };
    });

    // Conflict resolve buttons
    document.querySelectorAll('.km-btn-resolve').forEach(function (btn) {
      btn.onclick = function () {
        var cmdId = btn.dataset.cmd;
        SS._kbActiveTab = 'shortcuts';
        SS._kbSearchQuery = '';
        SS._kbFilter = {};
        var ct = document.getElementById('settings-content');
        if (ct) { ct.innerHTML = SS.buildKeyboardManagerSection(); SS.wireKeyboardManagerHandlers(); }
        // Start recording for that command
        setTimeout(function () { SS._startRecording(cmdId); }, 100);
      };
    });

    // Profile handlers
    SS._wireProfileButtons();

    // Advanced handlers
    SS._wireAdvancedButtons();
  };

  SS._refreshKmList = function () {
    var listEl = document.getElementById('km-cmd-list');
    if (!listEl) {
      // Rebuild the full tab
      var tc = document.getElementById('km-tab-content');
      if (tc) {
        tc.innerHTML = SS._buildKmTabContent(SS._kbActiveTab);
        SS._wireRecordButtons();
        // Re-wire search
        var searchEl = document.getElementById('km-search');
        if (searchEl) {
          searchEl.oninput = function () { SS._kbSearchQuery = searchEl.value; SS._refreshKmList(); };
          searchEl.focus();
          searchEl.selectionStart = searchEl.selectionEnd = searchEl.value.length;
        }
        var filterCat = document.getElementById('km-filter-cat');
        if (filterCat) filterCat.onchange = function () { SS._kbFilter.category = filterCat.value || undefined; SS._refreshKmList(); };
        var filterState = document.getElementById('km-filter-state');
        if (filterState) filterState.onchange = function () {
          SS._kbFilter = { category: SS._kbFilter.category };
          var v = filterState.value;
          if (v === 'assigned') SS._kbFilter.assignedOnly = true;
          if (v === 'unassigned') SS._kbFilter.unassignedOnly = true;
          if (v === 'customized') SS._kbFilter.customizedOnly = true;
          if (v === 'conflicts') SS._kbFilter.conflictsOnly = true;
          SS._refreshKmList();
        };
        document.querySelectorAll('.km-btn-reset').forEach(function (btn) {
          btn.onclick = function () {
            KeyboardManager.resetShortcut(btn.dataset.cmd);
            SS._refreshKmList();
            if (typeof showToast === 'function') showToast('Shortcut reset to default');
          };
        });
      }
      return;
    }
    var cmds = KeyboardManager.searchCommands(SS._kbSearchQuery, SS._kbFilter);
    if (cmds.length === 0) {
      listEl.outerHTML = '<div class="km-empty">No commands match your search.</div>';
      return;
    }
    var html = '';
    cmds.forEach(function (cmd) { html += SS._buildCommandRow(cmd); });
    listEl.innerHTML = html;
    SS._wireRecordButtons();
    document.querySelectorAll('.km-btn-reset').forEach(function (btn) {
      btn.onclick = function () {
        KeyboardManager.resetShortcut(btn.dataset.cmd);
        SS._refreshKmList();
        if (typeof showToast === 'function') showToast('Shortcut reset to default');
      };
    });
  };

  SS._wireRecordButtons = function () {
    document.querySelectorAll('.km-btn-record').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        SS._startRecording(btn.dataset.cmd);
      };
    });
  };

  SS._startRecording = function (cmdId) {
    SS._kbRecordingCmd = cmdId;
    SS._refreshKmList();

    // Remove previous handler
    if (SS._kbRecordHandler) document.removeEventListener('keydown', SS._kbRecordHandler, true);

    SS._kbRecordHandler = function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Ignore modifier-only presses
      if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(e.key) >= 0) return;

      // Escape cancels recording
      if (e.key === 'Escape') {
        SS._stopRecording();
        return;
      }

      var sc = KeyboardManager.shortcutFromEvent(e);
      if (!sc) { SS._stopRecording(); return; }

      // Check reserved
      if (KeyboardManager.isReserved(sc)) {
        SS._stopRecording();
        if (typeof showToast === 'function') showToast(KeyboardManager.shortcutToLabel(sc) + ' is a browser / OS shortcut', 'error');
        return;
      }

      // Check conflicts
      var conflicts = KeyboardManager.findConflicts(sc, cmdId);
      if (conflicts.length > 0) {
        var hardConflicts = conflicts.filter(function (c) { return c.type === 'hard'; });
        if (hardConflicts.length > 0) {
          SS._showConflictDialog(cmdId, sc, hardConflicts);
          document.removeEventListener('keydown', SS._kbRecordHandler, true);
          SS._kbRecordHandler = null;
          SS._kbRecordingCmd = null;
          return;
        }
      }

      // Assign
      var result = KeyboardManager.assignShortcut(cmdId, sc);
      SS._stopRecording();
      if (result.ok) {
        if (typeof showToast === 'function') showToast('Shortcut set: ' + KeyboardManager.shortcutToLabel(sc));
      } else {
        if (typeof showToast === 'function') showToast('Could not assign: ' + (result.reason || ''), 'error');
      }
    };

    document.addEventListener('keydown', SS._kbRecordHandler, true);
  };

  SS._stopRecording = function () {
    if (SS._kbRecordHandler) document.removeEventListener('keydown', SS._kbRecordHandler, true);
    SS._kbRecordHandler = null;
    SS._kbRecordingCmd = null;
    SS._refreshKmList();
  };

  SS._kbCancelRecording = function () { SS._stopRecording(); };

  SS._showConflictDialog = function (cmdId, shortcut, conflicts) {
    var existing = document.getElementById('km-conflict-dialog');
    if (existing) existing.remove();

    var cmd = KeyboardManager.getCommand(cmdId);
    var conflictLabels = conflicts.map(function (c) { return '<strong>' + SS.escAttr(c.label) + '</strong> (' + SS.escAttr(c.category) + ')'; }).join(', ');

    var dialog = document.createElement('div');
    dialog.id = 'km-conflict-dialog';
    dialog.className = 'km-dialog-overlay';
    dialog.innerHTML = '<div class="km-dialog">' +
      '<div class="km-dialog-title">⚠ Shortcut Conflict</div>' +
      '<p class="km-dialog-text"><span class="km-key-combo">' + SS._renderKeyBadges(shortcut) + '</span> is already used by ' + conflictLabels + '.</p>' +
      '<p class="km-dialog-text" style="color:var(--text-dim);font-size:12px">Replacing will remove the shortcut from the conflicting command(s).</p>' +
      '<div class="km-dialog-btns">' +
        '<button class="km-btn km-btn-primary" id="km-conflict-replace">Replace</button>' +
        '<button class="km-btn" id="km-conflict-cancel">Cancel</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(dialog);

    document.getElementById('km-conflict-replace').onclick = function () {
      // Remove from conflicting commands
      conflicts.forEach(function (c) { KeyboardManager.resetShortcut(c.commandId); });
      // Assign to new command
      KeyboardManager.assignShortcut(cmdId, shortcut);
      dialog.remove();
      SS._refreshKmList();
      if (typeof showToast === 'function') showToast('Shortcut reassigned to ' + (cmd ? cmd.label : cmdId));
    };

    document.getElementById('km-conflict-cancel').onclick = function () {
      dialog.remove();
      SS._refreshKmList();
    };
  };

  SS._wireCategoryResetBtn = function () {
    var btn = document.getElementById('km-reset-cat');
    if (!btn) return;
    btn.onclick = function () {
      KeyboardManager.resetCategory(btn.dataset.cat);
      var detail = document.getElementById('km-cat-detail');
      if (detail) {
        detail.innerHTML = SS._buildCategoryDetail(btn.dataset.cat);
        SS._wireRecordButtons();
        SS._wireCategoryResetBtn();
      }
      if (typeof showToast === 'function') showToast('Category shortcuts reset');
    };
  };

  SS._wireProfileButtons = function () {
    var createBtn = document.getElementById('km-prof-create');
    if (createBtn) createBtn.onclick = function () {
      var name = prompt('Profile name:');
      if (!name) return;
      KeyboardManager.createProfile(name);
      SS._rebuildTab();
    };

    document.querySelectorAll('[data-prof-switch]').forEach(function (btn) {
      btn.onclick = function () {
        KeyboardManager.switchProfile(btn.dataset.profSwitch);
        SS._rebuildTab();
        if (typeof showToast === 'function') showToast('Profile activated');
      };
    });

    document.querySelectorAll('[data-prof-dup]').forEach(function (btn) {
      btn.onclick = function () {
        var name = prompt('Name for the copy:');
        if (!name) return;
        KeyboardManager.duplicateProfile(btn.dataset.profDup, name);
        SS._rebuildTab();
      };
    });

    document.querySelectorAll('[data-prof-rename]').forEach(function (btn) {
      btn.onclick = function () {
        var name = prompt('New name:');
        if (!name) return;
        KeyboardManager.renameProfile(btn.dataset.profRename, name);
        SS._rebuildTab();
      };
    });

    document.querySelectorAll('[data-prof-del]').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('Delete this profile?')) return;
        KeyboardManager.deleteProfile(btn.dataset.profDel);
        SS._rebuildTab();
        if (typeof showToast === 'function') showToast('Profile deleted');
      };
    });
  };

  SS._wireAdvancedButtons = function () {
    var exportBtn = document.getElementById('km-export-prof');
    if (exportBtn) exportBtn.onclick = function () {
      var json = KeyboardManager.exportProfile();
      if (!json) return;
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'dika-shortcuts.json';
      a.click();
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('Profile exported');
    };

    var importBtn = document.getElementById('km-import-prof');
    var importFile = document.getElementById('km-import-file');
    if (importBtn && importFile) {
      importBtn.onclick = function () { importFile.click(); };
      importFile.onchange = function () {
        var file = importFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          var result = KeyboardManager.importProfile(ev.target.result);
          if (result.ok) {
            if (typeof showToast === 'function') showToast('Profile "' + result.name + '" imported');
            SS._rebuildTab();
          } else {
            if (typeof showToast === 'function') showToast('Import failed: ' + result.reason, 'error');
          }
        };
        reader.readAsText(file);
      };
    }

    var resetAllBtn = document.getElementById('km-reset-all');
    if (resetAllBtn) resetAllBtn.onclick = function () {
      if (!confirm('Reset ALL shortcuts to defaults? This cannot be undone.')) return;
      KeyboardManager.resetAll();
      SS._rebuildTab();
      if (typeof showToast === 'function') showToast('All shortcuts reset to defaults');
    };
  };

  SS._rebuildTab = function () {
    var ct = document.getElementById('settings-content');
    if (ct) { ct.innerHTML = SS.buildKeyboardManagerSection(); SS.wireKeyboardManagerHandlers(); }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'keyboard', parent: 'system.settings', title: 'settings: keyboard', mount: function () {}, unmount: function () {} });
  }
})();
