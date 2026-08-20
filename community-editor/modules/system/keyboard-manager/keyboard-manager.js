/* ═══════════════════════════════════════════════════════════════════
   dika studio — Keyboard Manager  (Command Registry + Shortcut Engine)
   A central command/shortcut architecture for the entire application.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── Constants ─────────────────────────────────────────────── */
  var STORAGE_KEY  = 'dika_kb_profiles';
  var ACTIVE_PROF  = 'dika_kb_active_profile';

  var CATEGORIES = [
    'Global', 'Pages & Groups', 'Navigation', 'Tools',
    'Selection Tools', 'Pen Tools', 'Paint Brush', 'Board',
    'Template', 'Wireframe', 'Text', 'Export / Import',
    'Panels / UI', 'View / Zoom'
  ];

  var CONTEXTS = [
    'global', 'page-browser', 'design-editor', 'board-editor',
    'wireframe-editor', 'template-editor', 'text-editing',
    'selection-active', 'pen-tools-active', 'paint-brush-active',
    'modal-open', 'input-focused'
  ];

  /* ─── Reserved / Unsafe shortcuts (browser / OS) ────────────── */
  var RESERVED_SHORTCUTS = [
    'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+T', 'Ctrl+Shift+N',
    'Ctrl+F4', 'Ctrl+Shift+I',
    'Ctrl+Shift+J', 'Ctrl+Shift+C', 'Ctrl+L', 'Ctrl+H',
    'F5', 'F11', 'F12', 'Alt+F4', 'Ctrl+F5'
  ];

  /* ─── Command Registry ─────────────────────────────────────── */
  var _commands = {};   // id → command object
  var _profiles = {};   // profileId → { name, bindings:{}, meta:{} }
  var _activeProfileId = 'default';
  var _activeContext = 'design-editor';
  var _listeners = [];  // change listeners

  /*  Command schema:
      { id, label, description, category, contexts:[],
        defaultShortcut, userShortcut, isEditable,
        platformOverrides:{}, priority, whenCondition, fn }  */

  /* ─── Core API ──────────────────────────────────────────────── */

  function registerCommand(cmd) {
    if (!cmd || !cmd.id) return;
    _commands[cmd.id] = {
      id:                cmd.id,
      label:             cmd.label || cmd.id,
      description:       cmd.description || '',
      category:          cmd.category || 'Global',
      contexts:          cmd.contexts || ['global'],
      defaultShortcut:   cmd.defaultShortcut || null,
      userShortcut:      undefined,        // undefined = use default
      isEditable:        cmd.isEditable !== false,
      platformOverrides: cmd.platformOverrides || {},
      priority:          cmd.priority || 0,
      whenCondition:     cmd.whenCondition || null,
      fn:                cmd.fn || null
    };
  }

  function getCommand(id) { return _commands[id] || null; }

  function getAllCommands() {
    var list = [];
    for (var k in _commands) list.push(_commands[k]);
    return list;
  }

  function getCommandsByCategory(cat) {
    return getAllCommands().filter(function (c) { return c.category === cat; });
  }

  function getCategories() { return CATEGORIES.slice(); }
  function getContexts()   { return CONTEXTS.slice(); }

  /* ─── Effective shortcut (user override > profile > default) ── */
  function getEffectiveShortcut(id) {
    var cmd = _commands[id];
    if (!cmd) return null;
    // 1. user override (session-level)
    if (cmd.userShortcut !== undefined) return cmd.userShortcut;
    // 2. profile binding
    var prof = _profiles[_activeProfileId];
    if (prof && prof.bindings && prof.bindings[id] !== undefined) return prof.bindings[id];
    // 3. default
    return cmd.defaultShortcut;
  }

  /* ─── Shortcut Normalization ────────────────────────────────── */

  function normalizeShortcut(raw) {
    if (!raw) return null;
    // Smart split: treat consecutive '+' as the Plus key
    var cleaned = raw.replace(/\s+/g, '');
    var parts = [];
    var buf = '';
    for (var ci = 0; ci < cleaned.length; ci++) {
      if (cleaned[ci] === '+') {
        if (buf) { parts.push(buf); buf = ''; }
        else { parts.push('Plus'); }
      } else {
        buf += cleaned[ci];
      }
    }
    if (buf) parts.push(buf);
    var mods = { ctrl: false, shift: false, alt: false };
    var key = null;
    parts.forEach(function (p) {
      var low = p.toLowerCase();
      if (low === 'ctrl' || low === 'meta' || low === 'cmd') mods.ctrl = true;
      else if (low === 'shift') mods.shift = true;
      else if (low === 'alt') mods.alt = true;
      else key = p;
    });
    var canon = [];
    if (mods.ctrl)  canon.push('Ctrl');
    if (mods.shift) canon.push('Shift');
    if (mods.alt)   canon.push('Alt');
    if (key) canon.push(key.length === 1 ? key.toUpperCase() : key);
    return canon.join('+') || null;
  }

  function shortcutToLabel(sc) {
    if (!sc) return '—';
    return sc.replace(/\+/g, ' + ');
  }

  function shortcutFromEvent(e) {
    var parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey)             parts.push('Shift');
    if (e.altKey)               parts.push('Alt');
    var k = e.key;
    // Alt key on Windows produces special chars (e.g. Alt+M → 'µ')
    // Fall back to e.code for reliable letter detection
    if (e.altKey && e.code && /^Key[A-Z]$/.test(e.code)) {
      k = e.code.charAt(3);
    } else if (e.altKey && e.code && /^Digit[0-9]$/.test(e.code)) {
      k = e.code.charAt(5);
    } else if (k === ' ') k = 'Space';
    else if (k === '+') k = 'Plus';
    else if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') k = null;
    else if (typeof k === 'string' && k.length === 1) k = k.toUpperCase();
    else if (typeof k !== 'string') k = null;
    if (k) parts.push(k);
    return parts.length ? parts.join('+') : null;
  }

  /* ─── Context Management ────────────────────────────────────── */

  function setContext(ctx) { _activeContext = ctx; _notify('context'); }
  function getContext()    { return _activeContext; }

  function _contextMatches(cmd) {
    if (!cmd.contexts || cmd.contexts.length === 0) return true;
    if (cmd.contexts.indexOf('global') >= 0) return true;
    return cmd.contexts.indexOf(_activeContext) >= 0;
  }

  function executeCommand(id) {
    var cmd = _commands[id];
    if (!cmd || typeof cmd.fn !== 'function') return false;
    if (!_contextMatches(cmd)) return false;
    if (cmd.whenCondition && typeof cmd.whenCondition === 'function' && !cmd.whenCondition()) return false;
    return cmd.fn();
  }

  /* ─── Dispatch Engine ───────────────────────────────────────── */

  function dispatch(e) {
    // Prevent double dispatch (e.g. if listeners were registered more than once)
    if (e._kmHandled) return;

    var pressed = shortcutFromEvent(e);
    if (!pressed) return;

    var tag = (e.target.tagName || '').toLowerCase();
    var isEditable = e.target.matches && e.target.matches('input, textarea, select, [contenteditable="true"]');

    // Check Fabric.js text editing (IText/Textbox in edit mode)
    var _cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
    var _aObj = _cvs && _cvs.getActiveObject ? _cvs.getActiveObject() : null;
    var isFabricTextEditing = _aObj && _aObj.isEditing;

    // Alt+key combos are never used for text input — always allow them through
    var isAltCombo = e.altKey && e.key !== 'Alt';
    var forcedGlobalShortcut = normalizeShortcut(pressed) === 'Ctrl+K';

    // In input-focused / text-editing, only Escape and Alt combos pass through
    if (!forcedGlobalShortcut && !isAltCombo && (isEditable || (e.target && e.target.isContentEditable) || isFabricTextEditing)) {
      if (e.key === 'Escape') {
        var escCmd = _commands['escape'];
        if (escCmd && escCmd.fn) escCmd.fn();
      }
      return;
    }

    // Ignore modifier-only presses (Ctrl, Shift, Alt alone or combos without a key)
    var _modOnly = /^(Ctrl|Shift|Alt)(\+(Ctrl|Shift|Alt))*$/;
    if (_modOnly.test(pressed)) return;

    // Collect matching commands, sort by priority desc
    var matches = [];
    for (var id in _commands) {
      var cmd = _commands[id];
      var eff = getEffectiveShortcut(id);
      if (!eff) continue;
      if (normalizeShortcut(eff) !== normalizeShortcut(pressed)) continue;
      if (!_contextMatches(cmd)) continue;
      // whenCondition check
      if (cmd.whenCondition && typeof cmd.whenCondition === 'function' && !cmd.whenCondition()) continue;
      matches.push(cmd);
    }

    if (matches.length === 0) return;

    matches.sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });

    var winner = matches[0];
    if (winner.fn) {
      var result = winner.fn();
      if (result !== false) e.preventDefault();
      e._kmHandled = true;
    }
  }

  /* ─── Shortcut Assignment ───────────────────────────────────── */

  function assignShortcut(cmdId, newShortcut) {
    var cmd = _commands[cmdId];
    if (!cmd || !cmd.isEditable) return { ok: false, reason: 'not-editable' };
    var norm = normalizeShortcut(newShortcut);
    if (!norm) return { ok: false, reason: 'invalid' };

    // Reject modifier-only shortcuts (Ctrl, Shift, Alt alone)
    var _modOnlyRx = /^(Ctrl|Shift|Alt)(\+(Ctrl|Shift|Alt))*$/;
    if (_modOnlyRx.test(norm)) return { ok: false, reason: 'invalid', detail: 'Modifier keys alone cannot be assigned as shortcuts' };

    // Check reserved
    if (RESERVED_SHORTCUTS.indexOf(norm) >= 0) {
      return { ok: false, reason: 'reserved', detail: norm + ' is a browser / OS shortcut' };
    }

    // Detect conflicts
    var conflicts = findConflicts(norm, cmdId);

    // Apply
    cmd.userShortcut = norm;
    // Also persist to active profile
    var prof = _profiles[_activeProfileId];
    if (prof) { prof.bindings[cmdId] = norm; }
    _persist();
    _notify('assign');
    return { ok: true, conflicts: conflicts };
  }

  function resetShortcut(cmdId) {
    var cmd = _commands[cmdId];
    if (!cmd) return;
    cmd.userShortcut = undefined;
    var prof = _profiles[_activeProfileId];
    if (prof) delete prof.bindings[cmdId];
    _persist();
    _notify('reset');
  }

  function resetCategory(cat) {
    getAllCommands().forEach(function (cmd) {
      if (cmd.category === cat) resetShortcut(cmd.id);
    });
  }

  function resetAll() {
    getAllCommands().forEach(function (cmd) { cmd.userShortcut = undefined; });
    var prof = _profiles[_activeProfileId];
    if (prof) prof.bindings = {};
    _persist();
    _notify('reset-all');
  }

  /* ─── Conflict Detection ────────────────────────────────────── */

  function findConflicts(shortcut, excludeId) {
    var norm = normalizeShortcut(shortcut);
    if (!norm) return [];
    var results = [];
    for (var id in _commands) {
      if (id === excludeId) continue;
      var eff = getEffectiveShortcut(id);
      if (!eff) continue;
      if (normalizeShortcut(eff) !== norm) continue;
      var cmd = _commands[id];
      // Determine conflict type
      var sameScope = false;
      if (excludeId && _commands[excludeId]) {
        var srcCtxs = _commands[excludeId].contexts || ['global'];
        var tgtCtxs = cmd.contexts || ['global'];
        for (var i = 0; i < srcCtxs.length; i++) {
          if (tgtCtxs.indexOf(srcCtxs[i]) >= 0) { sameScope = true; break; }
        }
        if (srcCtxs.indexOf('global') >= 0 || tgtCtxs.indexOf('global') >= 0) sameScope = true;
      }
      results.push({
        commandId: id,
        label: cmd.label,
        category: cmd.category,
        contexts: cmd.contexts,
        type: sameScope ? 'hard' : 'soft',
        shortcut: eff
      });
    }
    return results;
  }

  function getAllConflicts() {
    var seen = {};
    var conflicts = [];
    for (var id in _commands) {
      var eff = getEffectiveShortcut(id);
      if (!eff) continue;
      var norm = normalizeShortcut(eff);
      if (!norm) continue;
      if (!seen[norm]) seen[norm] = [];
      seen[norm].push(id);
    }
    for (var key in seen) {
      if (seen[key].length > 1) {
        conflicts.push({
          shortcut: key,
          commands: seen[key].map(function (cid) {
            var c = _commands[cid];
            return { id: cid, label: c.label, category: c.category, contexts: c.contexts };
          })
        });
      }
    }
    return conflicts;
  }

  function isReserved(shortcut) {
    return RESERVED_SHORTCUTS.indexOf(normalizeShortcut(shortcut)) >= 0;
  }

  /* ─── Profile System ────────────────────────────────────────── */

  function _initProfiles() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') _profiles = parsed;
      }
    } catch (e) {}
    try {
      var active = localStorage.getItem(ACTIVE_PROF);
      if (active && _profiles[active]) _activeProfileId = active;
    } catch (e) {}
    // Ensure default profile exists
    if (!_profiles['default']) {
      _profiles['default'] = { name: 'Default', bindings: {}, meta: { createdAt: Date.now(), updatedAt: Date.now() } };
    }
    // Apply profile bindings to commands (skip corrupted modifier-only bindings)
    var _modOnlyRx = /^(Ctrl|Shift|Alt)(\+(Ctrl|Shift|Alt))*$/;
    var prof = _profiles[_activeProfileId];
    if (prof && prof.bindings) {
      for (var id in prof.bindings) {
        var norm = normalizeShortcut(prof.bindings[id]);
        if (norm && _modOnlyRx.test(norm)) {
          delete prof.bindings[id];
          continue;
        }
        if (_commands[id]) _commands[id].userShortcut = prof.bindings[id];
      }
    }
  }

  function _persist() {
    try {
      // Update meta
      var prof = _profiles[_activeProfileId];
      if (prof && prof.meta) prof.meta.updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_profiles));
      localStorage.setItem(ACTIVE_PROF, _activeProfileId);
    } catch (e) {}
  }

  function getProfiles() {
    var list = [];
    for (var k in _profiles) {
      list.push({ id: k, name: _profiles[k].name, isActive: k === _activeProfileId, meta: _profiles[k].meta || {} });
    }
    return list;
  }

  function getActiveProfile() { return _activeProfileId; }

  function createProfile(name) {
    var id = 'prof_' + Date.now();
    _profiles[id] = { name: name || 'New Profile', bindings: {}, meta: { createdAt: Date.now(), updatedAt: Date.now() } };
    _persist();
    _notify('profile-create');
    return id;
  }

  function duplicateProfile(srcId, newName) {
    var src = _profiles[srcId];
    if (!src) return null;
    var id = 'prof_' + Date.now();
    _profiles[id] = {
      name: newName || (src.name + ' Copy'),
      bindings: JSON.parse(JSON.stringify(src.bindings || {})),
      meta: { createdAt: Date.now(), updatedAt: Date.now() }
    };
    _persist();
    _notify('profile-duplicate');
    return id;
  }

  function renameProfile(id, newName) {
    if (!_profiles[id]) return;
    _profiles[id].name = newName;
    _persist();
    _notify('profile-rename');
  }

  function deleteProfile(id) {
    if (id === 'default') return false;
    delete _profiles[id];
    if (_activeProfileId === id) switchProfile('default');
    _persist();
    _notify('profile-delete');
    return true;
  }

  function switchProfile(id) {
    if (!_profiles[id]) return;
    // Clear current user shortcuts
    for (var k in _commands) _commands[k].userShortcut = undefined;
    _activeProfileId = id;
    var prof = _profiles[id];
    if (prof && prof.bindings) {
      for (var cid in prof.bindings) {
        if (_commands[cid]) _commands[cid].userShortcut = prof.bindings[cid];
      }
    }
    _persist();
    _notify('profile-switch');
  }

  function exportProfile(id) {
    var prof = _profiles[id || _activeProfileId];
    if (!prof) return null;
    return JSON.stringify({
      _dika_kb_profile: true,
      name: prof.name,
      bindings: prof.bindings,
      meta: prof.meta,
      exportedAt: Date.now()
    }, null, 2);
  }

  function importProfile(jsonStr, mode) {
    // mode: 'replace' | 'merge'
    try {
      var data = JSON.parse(jsonStr);
      /* BOTH markers are accepted, forever. This one is written INTO a file a person keeps: a profile
         exported before the rename carries `_cardcraft_kb_profile`, and refusing it would turn a
         cosmetic rename into "your keyboard file is invalid". We write the new one only. */
      if (!data || !(data._dika_kb_profile || data._cardcraft_kb_profile)) return { ok: false, reason: 'Invalid profile format' };
      var id = 'prof_' + Date.now();
      var bindings = data.bindings || {};
      // Validate bindings - remove any for commands that don't exist
      var cleaned = {};
      for (var k in bindings) {
        if (_commands[k]) cleaned[k] = normalizeShortcut(bindings[k]) || bindings[k];
      }
      _profiles[id] = {
        name: data.name || 'Imported Profile',
        bindings: cleaned,
        meta: { createdAt: Date.now(), updatedAt: Date.now(), importedFrom: data.name }
      };
      _persist();
      _notify('profile-import');
      return { ok: true, profileId: id, name: _profiles[id].name };
    } catch (e) {
      return { ok: false, reason: 'Failed to parse: ' + e.message };
    }
  }

  /* ─── Change listeners ──────────────────────────────────────── */

  function onChange(fn) { _listeners.push(fn); }
  function _notify(type) {
    _listeners.forEach(function (fn) { try { fn(type); } catch (e) {} });
  }

  /* ─── Search / Filter ──────────────────────────────────────── */

  function searchCommands(query, filters) {
    var q = (query || '').toLowerCase();
    var list = getAllCommands();
    if (q) {
      list = list.filter(function (c) {
        if (c.label.toLowerCase().indexOf(q) >= 0) return true;
        if (c.description.toLowerCase().indexOf(q) >= 0) return true;
        if (c.category.toLowerCase().indexOf(q) >= 0) return true;
        var eff = getEffectiveShortcut(c.id);
        if (eff && eff.toLowerCase().indexOf(q) >= 0) return true;
        return false;
      });
    }
    if (filters) {
      if (filters.category) list = list.filter(function (c) { return c.category === filters.category; });
      if (filters.assignedOnly) list = list.filter(function (c) { return !!getEffectiveShortcut(c.id); });
      if (filters.unassignedOnly) list = list.filter(function (c) { return !getEffectiveShortcut(c.id); });
      if (filters.conflictsOnly) {
        var conflictIds = {};
        getAllConflicts().forEach(function (cf) { cf.commands.forEach(function (c) { conflictIds[c.id] = true; }); });
        list = list.filter(function (c) { return conflictIds[c.id]; });
      }
      if (filters.customizedOnly) list = list.filter(function (c) { return c.userShortcut !== undefined; });
    }
    return list;
  }

  /* ═══════════════════════════════════════════════════════════════
     REGISTER ALL EXISTING APP COMMANDS
     ═══════════════════════════════════════════════════════════════ */

  function _registerAllCommands() {

    /* ── Global ───────────────────────────────────────────────── */
    registerCommand({ id: 'undo',              label: 'Undo',                    description: 'Undo the last action',                   category: 'Global',           contexts: ['global'],          defaultShortcut: 'Ctrl+Z',           fn: function () { if (typeof undo === 'function') undo(); } });
    registerCommand({ id: 'redo',              label: 'Redo',                    description: 'Redo the last undone action',             category: 'Global',           contexts: ['global'],          defaultShortcut: 'Ctrl+Y',           fn: function () { if (typeof redo === 'function') redo(); } });
    registerCommand({ id: 'save',              label: 'Export Card (Save)',       description: 'Save / export the card file',             category: 'Export / Import',  contexts: ['global'],          defaultShortcut: 'Ctrl+S',           fn: function () { if (typeof exportCardFile === 'function') exportCardFile(); } });
    registerCommand({ id: 'download',          label: 'Share',                  description: 'Open Share menu',                      category: 'Export / Import',  contexts: ['global'],          defaultShortcut: 'Ctrl+Shift+S',     fn: function () { if (typeof toggleShareMenu === 'function') toggleShareMenu(); } });
    registerCommand({ id: 'delete',            label: 'Delete Selected',         description: 'Delete the selected object(s)',           category: 'Global',           contexts: ['design-editor', 'board-editor'], defaultShortcut: 'Delete', fn: function () { if (typeof delSelected === 'function') delSelected(); } });
    registerCommand({ id: 'backspace-delete',  label: 'Delete (Backspace)',      description: 'Delete selected via Backspace',           category: 'Global',           contexts: ['design-editor', 'board-editor'], defaultShortcut: 'Backspace', isEditable: false, fn: function () { if (typeof delSelected === 'function') delSelected(); } });
    registerCommand({ id: 'escape',            label: 'Deselect / Close',        description: 'Deselect all or close modals',            category: 'Global',           contexts: ['global'],          defaultShortcut: 'Escape',  isEditable: false, fn: function () { if (typeof handleEscape === 'function') handleEscape(); } });

    /* ── Edit ─────────────────────────────────────────────────── */
    registerCommand({ id: 'duplicate',         label: 'Duplicate Selected',      description: 'Duplicate the selected object',           category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+D',           fn: function () { if (typeof duplicateSelected === 'function') duplicateSelected(); } });
    registerCommand({ id: 'copy',              label: 'Copy',                    description: 'Copy selected object',                    category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+C',           fn: function () { if (typeof copySelected === 'function') copySelected(); } });
    registerCommand({ id: 'paste',             label: 'Paste',                   description: 'Paste copied object',                     category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+V',           fn: function () { if (typeof clipboardObj !== 'undefined' && clipboardObj) { if (typeof pasteClipboard === 'function') pasteClipboard(); return true; } return false; } });
    registerCommand({ id: 'cut',               label: 'Cut',                     description: 'Cut selected object',                     category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+X',           fn: function () { if (typeof cutSelected === 'function') cutSelected(); } });
    registerCommand({ id: 'select-all',        label: 'Select All',              description: 'Select all objects on canvas',             category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+A',           fn: function () { if (typeof selectAll === 'function') selectAll(); } });
    registerCommand({ id: 'lock-unlock',       label: 'Lock / Unlock Selected',  description: 'Toggle lock on selected object',          category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+L',           fn: function () { if (typeof toggleLockSelected === 'function') toggleLockSelected(); } });
    registerCommand({ id: 'clip-image',        label: 'Clip Image into Shape',   description: 'Clip an image inside a shape',            category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+M',           fn: function () { if (typeof clipImageIntoShape === 'function') clipImageIntoShape(); } });
    registerCommand({ id: 'copy-style',        label: 'Copy Style',              description: 'Copy style from selected object',         category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+Alt+C',       fn: function () { if (typeof copyStyle === 'function') copyStyle(); } });
    registerCommand({ id: 'paste-style',       label: 'Paste Style',             description: 'Paste copied style to selected object',   category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+Alt+V',       fn: function () { if (typeof pasteStyle === 'function') pasteStyle(); } });
    registerCommand({ id: 'frame-rmbg',        label: 'Punch Out with Frame',    description: 'Erase frame-shaped area from image',   category: 'Global',           contexts: ['design-editor'],   defaultShortcut: 'Ctrl+Alt+R',       fn: function () { if (typeof removeImageBgWithFrame === 'function') removeImageBgWithFrame(); } });

    /* ── Layer ────────────────────────────────────────────────── */
    registerCommand({ id: 'bring-forward',     label: 'Bring Forward',           description: 'Move selected object one layer up',       category: 'Global',           contexts: ['design-editor'],   defaultShortcut: ']',                fn: function () { if (typeof bringForwardSelected === 'function') bringForwardSelected(); } });
    registerCommand({ id: 'send-backward',     label: 'Send Backward',           description: 'Move selected object one layer down',     category: 'Global',           contexts: ['design-editor'],   defaultShortcut: '[',                fn: function () { if (typeof sendBackwardSelected === 'function') sendBackwardSelected(); } });

    /* ── Pages & Groups ───────────────────────────────────────── */
    registerCommand({ id: 'next-page-fast',    label: 'Next Page (Fast)',             description: 'Switch to next page (group-aware)',  category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+S',            fn: function () { if (typeof _switchPageGroupAware === 'function') _switchPageGroupAware(1); } });
    registerCommand({ id: 'prev-page-fast',    label: 'Previous Page (Fast)',         description: 'Switch to previous page (group-aware)', category: 'Pages & Groups', contexts: ['global'],         defaultShortcut: 'Alt+A',            fn: function () { if (typeof _switchPageGroupAware === 'function') _switchPageGroupAware(-1); } });
    registerCommand({ id: 'next-page',         label: 'Next Page',                    description: 'Go to the next page',                category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Ctrl+PageDown',    fn: function () { if (typeof switchPage === 'function' && typeof currentPageIndex !== 'undefined' && typeof pages !== 'undefined') { if (currentPageIndex < pages.length - 1) switchPage(currentPageIndex + 1); } } });
    registerCommand({ id: 'prev-page',         label: 'Previous Page',                description: 'Go to the previous page',             category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Ctrl+PageUp',      fn: function () { if (typeof switchPage === 'function' && typeof currentPageIndex !== 'undefined') { if (currentPageIndex > 0) switchPage(currentPageIndex - 1); } } });
    registerCommand({ id: 'add-page',          label: 'Add New Page',                 description: 'Create a new page',                   category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Ctrl+Shift+N',     fn: function () { if (typeof addPage === 'function') addPage(); } });
    registerCommand({ id: 'duplicate-page',     label: 'Duplicate Page',               description: 'Duplicate the current page',          category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Ctrl+Shift+D',     fn: function () { if (typeof duplicatePage === 'function' && typeof currentPageIndex !== 'undefined') duplicatePage(currentPageIndex); } });
    registerCommand({ id: 'bulk-builder',       label: 'Bulk Builder',                 description: 'Generate pages from CSV/Excel',       category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Ctrl+Shift+B',     fn: function () { if (typeof openBulkBuilder === 'function') openBulkBuilder(); } });
    registerCommand({ id: 'slide-presenter-open',  label: 'Open Slide Presenter',        description: 'Open presenter mode for the active slide deck', category: 'Pages & Groups', contexts: ['global'], defaultShortcut: 'Ctrl+Alt+P', whenCondition: function () { return typeof pageHasSlideDeck === 'function' && typeof pages !== 'undefined' && !!pages[currentPageIndex] && pageHasSlideDeck(pages[currentPageIndex]); }, fn: function () { if (typeof openSlidePresenter === 'function') openSlidePresenter(); } });
    registerCommand({ id: 'slide-presenter-next',  label: 'Presenter Next Slide',        description: 'Advance presenter mode to the next slide', category: 'Pages & Groups', contexts: ['global'], defaultShortcut: 'ArrowRight', priority: 20, whenCondition: function () { return typeof _isSlidePresenterOpen === 'function' && _isSlidePresenterOpen(); }, fn: function () { if (typeof _sdPresenterStep === 'function') _sdPresenterStep('next'); } });
    registerCommand({ id: 'slide-presenter-prev',  label: 'Presenter Previous Slide',    description: 'Go back to the previous presenter slide', category: 'Pages & Groups', contexts: ['global'], defaultShortcut: 'ArrowLeft', priority: 20, whenCondition: function () { return typeof _isSlidePresenterOpen === 'function' && _isSlidePresenterOpen(); }, fn: function () { if (typeof _sdPresenterStep === 'function') _sdPresenterStep('prev'); } });
    registerCommand({ id: 'slide-presenter-space', label: 'Presenter Next Slide (Space)', description: 'Advance presenter mode with Space', category: 'Pages & Groups', contexts: ['global'], defaultShortcut: 'Space', priority: 20, whenCondition: function () { return typeof _isSlidePresenterOpen === 'function' && _isSlidePresenterOpen(); }, fn: function () { if (typeof _sdPresenterStep === 'function') _sdPresenterStep('next'); } });
    registerCommand({ id: 'goto-page-1',        label: 'Go to Page 1',                description: 'Jump to page 1 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+1',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(1); } });
    registerCommand({ id: 'goto-page-2',        label: 'Go to Page 2',                description: 'Jump to page 2 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+2',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(2); } });
    registerCommand({ id: 'goto-page-3',        label: 'Go to Page 3',                description: 'Jump to page 3 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+3',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(3); } });
    registerCommand({ id: 'goto-page-4',        label: 'Go to Page 4',                description: 'Jump to page 4 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+4',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(4); } });
    registerCommand({ id: 'goto-page-5',        label: 'Go to Page 5',                description: 'Jump to page 5 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+5',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(5); } });
    registerCommand({ id: 'goto-page-6',        label: 'Go to Page 6',                description: 'Jump to page 6 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+6',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(6); } });
    registerCommand({ id: 'goto-page-7',        label: 'Go to Page 7',                description: 'Jump to page 7 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+7',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(7); } });
    registerCommand({ id: 'goto-page-8',        label: 'Go to Page 8',                description: 'Jump to page 8 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+8',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(8); } });
    registerCommand({ id: 'goto-page-9',        label: 'Go to Page 9',                description: 'Jump to page 9 (group-aware)',        category: 'Pages & Groups',   contexts: ['global'],          defaultShortcut: 'Alt+Shift+9',      fn: function () { if (typeof _jumpToPageGroupAware === 'function') _jumpToPageGroupAware(9); } });

    /* ── View / Zoom ──────────────────────────────────────────── */
    registerCommand({ id: 'toggle-layers',     label: 'Toggle Layers Panel',     description: 'Show / hide the structure panel',         category: 'Panels / UI',      contexts: ['global'],          defaultShortcut: 'Ctrl+Shift+L',     fn: function () { if (typeof toggleStructurePanel === 'function') toggleStructurePanel(); } });
    registerCommand({ id: 'open-command-bar',  label: 'Quick Search',            description: 'Open the command palette',                category: 'Panels / UI',      contexts: ['global'],          defaultShortcut: 'Ctrl+K',           fn: function () { if (typeof openCommandBar === 'function') { openCommandBar(); return true; } return false; } });
    registerCommand({ id: 'toggle-left-panel', label: 'Toggle Left Sidebar',     description: 'Show or hide the icon rail and tool panels (triple-tap Alt)', category: 'Panels / UI', contexts: ['global'], defaultShortcut: 'Alt (triple tap)', isEditable: false, fn: function () { if (typeof toggleLeftPanel === 'function') toggleLeftPanel(); } });
    registerCommand({ id: 'zoom-in',           label: 'Zoom In',                 description: 'Increase canvas zoom',                    category: 'View / Zoom',      contexts: ['global'],          defaultShortcut: 'Ctrl+=',           fn: function () { if (typeof zoomBy === 'function') zoomBy(0.1); } });
    registerCommand({ id: 'zoom-out',          label: 'Zoom Out',                description: 'Decrease canvas zoom',                    category: 'View / Zoom',      contexts: ['global'],          defaultShortcut: 'Ctrl+-',           fn: function () { if (typeof zoomBy === 'function') zoomBy(-0.1); } });
    registerCommand({ id: 'reset-view',        label: 'Reset View',              description: 'Reset zoom and pan to default',           category: 'View / Zoom',      contexts: ['global'],          defaultShortcut: 'Ctrl+0',           fn: function () { if (typeof resetView === 'function') resetView(); } });
    registerCommand({ id: 'show-shortcuts',    label: 'Show Keyboard Shortcuts', description: 'Open keyboard shortcuts reference',       category: 'Panels / UI',      contexts: ['global'],          defaultShortcut: '?',                fn: function () { if (typeof showShortcutsModal === 'function') showShortcutsModal(); } });

    /* ── Flyout Panels (Alt+digit) ────────────────────────────── */
    registerCommand({ id: 'flyout-templates',  label: 'Open Templates Panel',    description: 'Open the templates flyout',               category: 'Panels / UI',      contexts: ['design-editor'],   defaultShortcut: 'Alt+1',            fn: function () { if (typeof openFlyout === 'function') openFlyout('templates'); } });
    registerCommand({ id: 'flyout-text',       label: 'Open Text Panel',         description: 'Open the text / shapes flyout',           category: 'Panels / UI',      contexts: ['design-editor'],   defaultShortcut: 'Alt+2',            fn: function () { if (typeof openFlyout === 'function') openFlyout('text'); } });
    registerCommand({ id: 'flyout-background', label: 'Open Background Panel',   description: 'Open the background flyout',              category: 'Panels / UI',      contexts: ['design-editor'],   defaultShortcut: 'Alt+3',            fn: function () { if (typeof openFlyout === 'function') openFlyout('background'); } });
    registerCommand({ id: 'flyout-icons',      label: 'Open Icons Panel',        description: 'Open the icons flyout',                   category: 'Panels / UI',      contexts: ['design-editor'],   defaultShortcut: 'Alt+4',            fn: function () { if (typeof openFlyout === 'function') openFlyout('icons'); } });
    registerCommand({ id: 'flyout-shapes',     label: 'Open Shapes Panel',       description: 'Open the shapes flyout',                  category: 'Panels / UI',      contexts: ['design-editor'],   defaultShortcut: 'Alt+5',            fn: function () { if (typeof openFlyout === 'function') openFlyout('shape'); } });
    registerCommand({ id: 'flyout-images',     label: 'Open Images Panel',       description: 'Open the images flyout',                  category: 'Panels / UI',      contexts: ['design-editor'],   defaultShortcut: 'Alt+6',            fn: function () { if (typeof openFlyout === 'function') openFlyout('images'); } });
    registerCommand({ id: 'flyout-patterns',   label: 'Open Patterns Panel',     description: 'Open the patterns flyout',                category: 'Panels / UI',      contexts: ['design-editor'],   defaultShortcut: 'Alt+7',            fn: function () { if (typeof openFlyout === 'function') openFlyout('patterns'); } });

    /* ── Board Tools ──────────────────────────────────────────── */
    registerCommand({ id: 'wb-hand',           label: 'Hand Tool',               description: 'Board hand / pan tool',                   category: 'Board',            contexts: ['board-editor'],    defaultShortcut: '1',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('hand'); } });
    registerCommand({ id: 'wb-select',         label: 'Select Tool',             description: 'Board selection tool',                    category: 'Board',            contexts: ['board-editor'],    defaultShortcut: '2',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('select'); } });
    registerCommand({ id: 'wb-rect',           label: 'Rectangle Tool',          description: 'Board rectangle tool',                    category: 'Board',            contexts: ['board-editor'],    defaultShortcut: '3',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('rect'); } });
    registerCommand({ id: 'wb-ellipse',        label: 'Ellipse Tool',            description: 'Board ellipse tool',                      category: 'Board',            contexts: ['board-editor'],    defaultShortcut: '4',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('ellipse'); } });
    registerCommand({ id: 'wb-diamond',        label: 'Diamond Tool',            description: 'Board diamond tool',                      category: 'Board',            contexts: ['board-editor'],    defaultShortcut: '5',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('diamond'); } });
    registerCommand({ id: 'wb-arrow',          label: 'Arrow Tool',              description: 'Board arrow / connector tool',             category: 'Board',            contexts: ['board-editor'],    defaultShortcut: 'Q',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('arrow'); } });
    registerCommand({ id: 'wb-line',           label: 'Line Tool',               description: 'Board line tool',                         category: 'Board',            contexts: ['board-editor'],    defaultShortcut: 'W',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('line'); } });
    registerCommand({ id: 'wb-draw',           label: 'Pencil Tool',             description: 'Board freehand draw tool',                category: 'Board',            contexts: ['board-editor'],    defaultShortcut: 'E',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('draw'); } });
    registerCommand({ id: 'wb-text',           label: 'Text Tool',               description: 'Board text tool',                         category: 'Board',            contexts: ['board-editor'],    defaultShortcut: 'T',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('text'); } });
    registerCommand({ id: 'design-text',       label: 'Text Tool',               description: 'Text tool — click canvas to add/edit text',category: 'Design',           contexts: ['design-editor'],   defaultShortcut: 'T',                fn: function () { if (typeof window.activateTextTool === 'function') { window.activateTextTool(); return true; } return false; } });
    registerCommand({ id: 'wb-sticky',         label: 'Sticky Note',             description: 'Board sticky note tool',                  category: 'Board',            contexts: ['board-editor'],    defaultShortcut: 'N',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('sticky'); } });
    registerCommand({ id: 'wb-eraser',         label: 'Eraser',                  description: 'Board eraser tool',                       category: 'Board',            contexts: ['board-editor'],    defaultShortcut: 'X',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof setWbTool === 'function') setWbTool('eraser'); } });
    registerCommand({ id: 'wb-zen',            label: 'Toggle Zen Mode',         description: 'Toggle zen distraction-free mode',        category: 'Board',            contexts: ['board-editor'],    defaultShortcut: 'Z',                priority: 10, whenCondition: function () { return !!window.wbActive; }, fn: function () { if (typeof toggleZenMode === 'function') toggleZenMode(); } });

    /* ── Radial Menu ── */
    registerCommand({ id: 'radial-pin',          label: 'Toggle Radial Menu',      description: 'Pin/unpin the radial tool menu on screen', category: 'Panels / UI',      contexts: ['global'],          defaultShortcut: 'Alt+M',            fn: function () { if (typeof rmTogglePin === 'function') rmTogglePin(); } });
    registerCommand({ id: 'radial-quick',        label: 'Quick Radial Menu',       description: 'Show radial menu briefly at cursor',       category: 'Panels / UI',      contexts: ['global'],          defaultShortcut: 'Alt+Shift+M',      fn: function () { if (typeof rmQuickShow === 'function') rmQuickShow(); } });

    /* ── Comments ── */
    registerCommand({ id: 'comment-panel',        label: 'Toggle Comments Panel',   description: 'Show/hide the floating comments panel',   category: 'Panels / UI',      contexts: ['global'],          defaultShortcut: 'Alt+C',            fn: function () { if (typeof toggleCommentPanel === 'function') toggleCommentPanel(); } });
    registerCommand({ id: 'comment-add',          label: 'Add Comment',             description: 'Enter comment placement mode',             category: 'Panels / UI',      contexts: ['global'],          defaultShortcut: 'Alt+Shift+C',      fn: function () { if (typeof enterCommentMode === 'function') enterCommentMode(); } });
  }

  /* ═══════════════════════════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    _registerAllCommands();
    _initProfiles();
  }

  /* ─── Public API ────────────────────────────────────────────── */
  window.KeyboardManager = {
    init:               init,
    registerCommand:    registerCommand,
    getCommand:         getCommand,
    getAllCommands:      getAllCommands,
    getCommandsByCategory: getCommandsByCategory,
    getCategories:      getCategories,
    getContexts:        getContexts,
    getEffectiveShortcut: getEffectiveShortcut,
    normalizeShortcut:  normalizeShortcut,
    shortcutToLabel:    shortcutToLabel,
    shortcutFromEvent:  shortcutFromEvent,
    setContext:         setContext,
    getContext:         getContext,
    executeCommand:     executeCommand,
    dispatch:           dispatch,
    assignShortcut:     assignShortcut,
    resetShortcut:      resetShortcut,
    resetCategory:      resetCategory,
    resetAll:           resetAll,
    findConflicts:      findConflicts,
    getAllConflicts:     getAllConflicts,
    isReserved:         isReserved,
    getProfiles:        getProfiles,
    getActiveProfile:   getActiveProfile,
    createProfile:      createProfile,
    duplicateProfile:   duplicateProfile,
    renameProfile:      renameProfile,
    deleteProfile:      deleteProfile,
    switchProfile:      switchProfile,
    exportProfile:      exportProfile,
    importProfile:      importProfile,
    searchCommands:     searchCommands,
    onChange:           onChange,
    RESERVED_SHORTCUTS: RESERVED_SHORTCUTS
  };

})();

// Modular skeleton hook (Faz 8) — keyboard-manager is now a system loader module (modules/system/).
if (window.cc && cc.modules) cc.modules.register({ id: 'keyboard-manager', parent: 'system', title: 'Keyboard manager', mount: function () {}, unmount: function () {} });
