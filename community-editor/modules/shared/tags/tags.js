/* Module: shared/tags — CCTags, the project-wide tagging DATA LAYER (G0). Pure model + storage; no UI
   (that's shared/tag-modal G1 and scene/frame-tags G2). It owns three things:

     1. PROJECT tags + tag-groups — globals `ccTags` / `ccTagGroups`, persisted in autosave v2 right next
        to `pageGroups` (autosave reads/writes these globals in place — same pattern as pageGroups).
     2. ASSIGNMENTS — a global central map `ccTagAssignments` keyed 'page:<pageId>' / 'frame:<frameId>'
        → [tagId]. We do NOT embed tags on the page/frame object: the autosave page payload is a fixed
        whitelist (it strips unknown props) and `page._scene` isn't persisted yet, so an embedded
        `page._tags` / `frame.tags` would silently vanish on reload. The central map round-trips
        self-contained, independent of the page/scene serialization gaps. See docs/tagging-system-plan.md §3.
     3. A cross-project LIBRARY — IndexedDB (`dika_tags_db`) with a localStorage fallback
        (`cc_tag_library`). Library tags keep their id when pulled into a project so cross-project
        assignments still match.

   Target = { type:'page'|'frame', id }. A raw page object (has _pageId/_productType/_scene) or frame
   model (bare .id) is also accepted and coerced. Every mutation fires cc.emit('tags:changed', {target?})
   — UIs (chips, filter, modal) listen to refresh, and autosave debounce-saves on it. */
(function (global) {
  'use strict';

  // ── project state (globals; autosave mutates these in place, mirroring pageGroups) ──
  var ccTags = global.ccTags || (global.ccTags = []);                  // [{id,name,color,icon,groupId,scope,_createdAt,_builtin?}]
  var ccTagGroups = global.ccTagGroups || (global.ccTagGroups = []);   // [{id,name,color,order,collapsed,tagIds:[]}]
  var ccTagAssignments = global.ccTagAssignments || (global.ccTagAssignments = {}); // 'type:id' -> [tagId]

  // ── library state (IndexedDB-backed; NOT in autosave) ──
  var _libTags = [], _libGroups = [], _libDB = null, _libReady = false;
  var LIB_DB = 'dika_tags_db', LIB_STORE = 'library', LIB_KEY = 'data', LIB_LS = 'cc_tag_library';

  // Reuse the page-group palette (so tags feel native) + a few extra tones.
  var PALETTE = (typeof _pgGroupColors !== 'undefined' && _pgGroupColors.length)
    ? _pgGroupColors.concat(['#f59e0b', '#14b8a6', '#f43f5e', '#8b5cf6'])
    : ['#f2ff58', '#e05252', '#e0a852', '#52e0a8', '#5290e0', '#a852e0', '#52e0e0', '#e0e052', '#f59e0b', '#14b8a6', '#f43f5e', '#8b5cf6'];

  function _uid(pfx) { return pfx + Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
  function _emit(target) { if (global.cc && cc.emit) cc.emit('tags:changed', target ? { target: target } : {}); }
  function _nextColor() { return PALETTE[(ccTags.length + _libTags.length) % PALETTE.length]; }
  function _ensurePageId(p) { return (typeof _pgEnsurePageId === 'function') ? _pgEnsurePageId(p) : (p._pageId || (p._pageId = _uid('pg-'))); }

  // ── target → stable key ──
  function _key(t) {
    if (!t) return null;
    if (t.type && t.id != null) return t.type + ':' + t.id;
    // coerce a raw object: pages carry _pageId/_productType/_scene; a frame model is a bare id + geometry
    if (t._pageId !== undefined || t._productType !== undefined || t._scene !== undefined) return 'page:' + _ensurePageId(t);
    if (t.id != null) return 'frame:' + t.id;
    return null;
  }
  function _parseKey(k) { var i = k.indexOf(':'); return { type: k.slice(0, i), id: k.slice(i + 1) }; }

  // ── tag/group lookup ──
  function _idx(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return i; return -1; }
  function _find(arr, id) { var i = _idx(arr, id); return i < 0 ? null : arr[i]; }
  function _findTag(id) { return _find(ccTags, id) || _find(_libTags, id); }
  function _findGroup(id) { return _find(ccTagGroups, id); }

  // ── library storage ──
  function _saveLib() {
    var data = { tags: _libTags, groups: _libGroups };
    try { localStorage.setItem(LIB_LS, JSON.stringify(data)); } catch (e) { /* full — IDB still holds it */ }
    if (_libDB) { try { _libDB.transaction(LIB_STORE, 'readwrite').objectStore(LIB_STORE).put(data, LIB_KEY); } catch (e) {} }
  }
  function _loadLibLS() { try { var v = JSON.parse(localStorage.getItem(LIB_LS)); if (v) { _libTags = v.tags || []; _libGroups = v.groups || []; } } catch (e) {} }
  function _openLibDB(cb) {
    if (typeof indexedDB === 'undefined') { cb(null); return; }
    /* THE RENAME MOVES FIRST, THEN WE OPEN. The library was `cardcraft_tags_db` before the rename
       (docs/dika-rename-plan.md P5) and this was the one store that got the new NAME without the
       copy, so every cross-project tag anybody had built up opened empty and looked deleted. The
       other five stores (presets, pages, fonts, templates, shapes, gallery) all do exactly this. */
    var moved = (window.CCMigrate && CCMigrate.db)
      ? CCMigrate.db('cardcraft_tags_db', LIB_DB) : Promise.resolve(false);
    moved.then(function () { _openLibDBNow(cb); }, function () { _openLibDBNow(cb); });
  }
  function _openLibDBNow(cb) {
    try {
      var req = indexedDB.open(LIB_DB, 1);
      req.onupgradeneeded = function (e) { var db = e.target.result; if (!db.objectStoreNames.contains(LIB_STORE)) db.createObjectStore(LIB_STORE); };
      req.onsuccess = function (e) { _libDB = e.target.result; cb(_libDB); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function _bootLib(cb) {
    _openLibDB(function (db) {
      if (!db) { _loadLibLS(); _libReady = true; cb && cb(); return; }
      try {
        var r = db.transaction(LIB_STORE, 'readonly').objectStore(LIB_STORE).get(LIB_KEY);
        r.onsuccess = function () { var v = r.result; if (v) { _libTags = v.tags || []; _libGroups = v.groups || []; } else { _loadLibLS(); } _libReady = true; _emit(); cb && cb(); };
        r.onerror = function () { _loadLibLS(); _libReady = true; cb && cb(); };
      } catch (e) { _loadLibLS(); _libReady = true; cb && cb(); }
    });
  }

  // ════════════════════════════ public API ════════════════════════════
  var CCTags = {};

  // ── tags ──
  CCTags.create = function (opts) {
    opts = opts || {};
    var scope = opts.scope === 'library' ? 'library' : 'project';
    var tag = {
      id: opts.id || _uid('tag-'),
      name: opts.name != null ? String(opts.name) : 'Tag',
      color: opts.color || _nextColor(),
      icon: opts.icon || 'tag',
      groupId: opts.groupId || null,
      scope: scope,
      _createdAt: Date.now()
    };
    if (opts._builtin) tag._builtin = true;
    if (scope === 'library') { _libTags.push(tag); _saveLib(); }
    else { ccTags.push(tag); }
    if (tag.groupId) { var g = _findGroup(tag.groupId); if (g) { g.tagIds = g.tagIds || []; if (g.tagIds.indexOf(tag.id) < 0) g.tagIds.push(tag.id); } }
    _emit();
    return tag;
  };

  CCTags.update = function (tagId, patch) {
    var t = _findTag(tagId); if (!t) return null;
    patch = patch || {};
    var oldGroup = t.groupId;
    ['name', 'color', 'icon', 'groupId'].forEach(function (k) { if (patch[k] !== undefined) t[k] = patch[k]; });
    if (patch.groupId !== undefined && patch.groupId !== oldGroup) {
      var og = _findGroup(oldGroup); if (og && og.tagIds) { var oi = og.tagIds.indexOf(tagId); if (oi >= 0) og.tagIds.splice(oi, 1); }
      var ng = _findGroup(t.groupId); if (ng) { ng.tagIds = ng.tagIds || []; if (ng.tagIds.indexOf(tagId) < 0) ng.tagIds.push(tagId); }
    }
    if (t.scope === 'library') _saveLib();
    _emit();
    return t;
  };

  CCTags.remove = function (tagId) {
    var t = _findTag(tagId); if (!t) return false;
    var g = _findGroup(t.groupId); if (g && g.tagIds) { var gi = g.tagIds.indexOf(tagId); if (gi >= 0) g.tagIds.splice(gi, 1); }
    if (t.scope === 'library') { var li = _idx(_libTags, tagId); if (li >= 0) _libTags.splice(li, 1); _saveLib(); }
    else { var pi = _idx(ccTags, tagId); if (pi >= 0) ccTags.splice(pi, 1); }
    // strip the dead id from every assignment
    for (var k in ccTagAssignments) if (ccTagAssignments.hasOwnProperty(k)) {
      var arr = ccTagAssignments[k], ai = arr.indexOf(tagId);
      if (ai >= 0) { arr.splice(ai, 1); if (!arr.length) delete ccTagAssignments[k]; }
    }
    _emit();
    return true;
  };

  CCTags.get = function (tagId) { return _findTag(tagId); };
  // N10: favourite (pin) a tag → sorts to the top of facet lists. Persisted via the tag object (`_fav`).
  CCTags.toggleFavorite = function (tagId) { var t = _findTag(tagId); if (!t) return false; t._fav = !t._fav; if (t.scope === 'library') _saveLib(); _emit(); return !!t._fav; };
  CCTags.isFavorite = function (tagId) { var t = _findTag(tagId); return !!(t && t._fav); };
  CCTags.list = function (opts) {
    var scope = opts && opts.scope;
    if (scope === 'library') return _libTags.slice();
    if (scope === 'project') return ccTags.slice();
    return ccTags.concat(_libTags);
  };

  // ── groups (v2: rule = free|exclusive|required, parentId = hierarchy, inheritColor) ──
  CCTags.createGroup = function (opts) {
    opts = opts || {};
    var g = {
      id: opts.id || _uid('tgr-'), name: opts.name != null ? String(opts.name) : 'Group',
      color: opts.color || _nextColor(), order: ccTagGroups.length, collapsed: false, tagIds: [],
      rule: (opts.rule === 'exclusive' || opts.rule === 'required') ? opts.rule : 'free',
      parentId: opts.parentId || null, inheritColor: !!opts.inheritColor
    };
    ccTagGroups.push(g); _emit(); return g;
  };
  CCTags.updateGroup = function (groupId, patch) {
    var g = _findGroup(groupId); if (!g || !patch) return null;
    ['name', 'color', 'rule', 'parentId', 'collapsed', 'inheritColor'].forEach(function (k) { if (patch[k] !== undefined) g[k] = patch[k]; });
    _emit(); return g;
  };
  CCTags.removeGroup = function (groupId) {
    var i = _idx(ccTagGroups, groupId); if (i < 0) return false;
    for (var t = 0; t < ccTags.length; t++) if (ccTags[t].groupId === groupId) ccTags[t].groupId = null;
    for (var c = 0; c < ccTagGroups.length; c++) if (ccTagGroups[c].parentId === groupId) ccTagGroups[c].parentId = null;   // orphan children
    ccTagGroups.splice(i, 1); _emit(); return true;
  };
  CCTags.groups = function () { return ccTagGroups.slice(); };
  // N4 hierarchy: groups whose parent is `parentId` (pass null/undefined for top-level).
  CCTags.childGroups = function (parentId) { var p = parentId || null; return ccTagGroups.filter(function (g) { return (g.parentId || null) === p; }); };
  // Q1: required groups (rule==='required') that have NO tag assigned on this target.
  CCTags.requiredMissing = function (target) {
    var have = CCTags.idsOf(target), out = [];
    for (var i = 0; i < ccTagGroups.length; i++) {
      var g = ccTagGroups[i]; if (g.rule !== 'required') continue;
      var ok = false; for (var j = 0; j < g.tagIds.length; j++) if (have.indexOf(g.tagIds[j]) >= 0) { ok = true; break; }
      if (!ok) out.push(g);
    }
    return out;
  };
  // Q1: all data-quality issues on a target — required-missing + exclusive-group-has-multiple.
  CCTags.violations = function (target) {
    var out = [];
    CCTags.requiredMissing(target).forEach(function (g) { out.push({ type: 'required-missing', group: g.id, name: g.name }); });
    var have = CCTags.idsOf(target), byGroup = {};
    for (var i = 0; i < have.length; i++) { var t = _findTag(have[i]); if (t && t.groupId) (byGroup[t.groupId] = byGroup[t.groupId] || []).push(have[i]); }
    for (var gid in byGroup) if (byGroup.hasOwnProperty(gid)) { var grp = _findGroup(gid); if (grp && grp.rule === 'exclusive' && byGroup[gid].length > 1) out.push({ type: 'exclusive-multi', group: gid, name: grp.name }); }
    return out;
  };

  // K7: built-in tag taxonomy presets (one-click scaffold for a workflow).
  var TAG_PRESETS = {
    agency: { name: 'Agency set', groups: [
      { name: 'Status', rule: 'exclusive', color: '#52e0a8', tags: ['Draft', 'Review', 'Approved', 'Delivered'] },
      { name: 'Customer', rule: 'required', color: '#5290e0', tags: [] },
      { name: 'Campaign', rule: 'free', color: '#e0a852', tags: [] }
    ] },
    social: { name: 'Social media', groups: [
      { name: 'Platform', rule: 'free', color: '#a852e0', tags: ['Instagram', 'Story', 'Reel', 'Facebook'] },
      { name: 'Status', rule: 'exclusive', color: '#52e0a8', tags: ['Draft', 'Approved', 'Published'] }
    ] }
  };
  CCTags.presets = function () { var out = []; for (var k in TAG_PRESETS) if (TAG_PRESETS.hasOwnProperty(k)) out.push({ id: k, name: TAG_PRESETS[k].name }); return out; };
  CCTags.applyPreset = function (id) {
    var p = TAG_PRESETS[id]; if (!p) return null;
    p.groups.forEach(function (gp) {
      var g = CCTags.createGroup({ name: gp.name, rule: gp.rule, color: gp.color });
      (gp.tags || []).forEach(function (tn) { CCTags.create({ name: tn, groupId: g.id, color: gp.color }); });
    });
    return p.name;
  };

  // ── assignments (central map) ──
  function _slot(key, create) {
    if (!key) return null;
    if (!ccTagAssignments[key] && create) ccTagAssignments[key] = [];
    return ccTagAssignments[key] || null;
  }
  CCTags.assign = function (target, tagId) {
    var key = _key(target); if (!key) return false;
    var a = _slot(key, true);
    if (a.indexOf(tagId) < 0) {
      // D1/Q3: exclusive group → drop sibling tags of the same group from this target first (one status at a time)
      var tag = _findTag(tagId), grp = tag ? _findGroup(tag.groupId) : null;
      if (grp && grp.rule === 'exclusive') {
        for (var i = a.length - 1; i >= 0; i--) { var other = _findTag(a[i]); if (other && other.groupId === grp.id) a.splice(i, 1); }
      }
      a.push(tagId); _emit(target);
    }
    return true;
  };
  CCTags.unassign = function (target, tagId) {
    var key = _key(target), a = _slot(key, false); if (!a) return false;
    var i = a.indexOf(tagId);
    if (i >= 0) { a.splice(i, 1); if (!a.length) delete ccTagAssignments[key]; _emit(target); }
    return true;
  };
  CCTags.toggle = function (target, tagId) {
    var a = _slot(_key(target), false);
    if (a && a.indexOf(tagId) >= 0) { CCTags.unassign(target, tagId); return false; }
    CCTags.assign(target, tagId); return true;
  };
  CCTags.has = function (target, tagId) { var a = _slot(_key(target), false); return !!a && a.indexOf(tagId) >= 0; };
  CCTags.idsOf = function (target) { var a = _slot(_key(target), false); return a ? a.slice() : []; };
  CCTags.of = function (target) {
    var ids = CCTags.idsOf(target), out = [];
    for (var i = 0; i < ids.length; i++) { var t = _findTag(ids[i]); if (t) out.push(t); }
    return out;
  };
  CCTags.clear = function (target) {
    var key = _key(target);
    if (key && ccTagAssignments[key]) { delete ccTagAssignments[key]; _emit(target); }
  };

  // filter = {all:[ids], any:[ids], not:[ids], type?}; returns [{type,id}] over the TAGGED targets only
  CCTags.query = function (filter) {
    filter = filter || {};
    var all = filter.all || [], any = filter.any || [], not = filter.not || [], type = filter.type || null;
    var out = [];
    function test(ids) {
      var i;
      for (i = 0; i < all.length; i++) if (ids.indexOf(all[i]) < 0) return false;
      if (any.length) { var ok = false; for (i = 0; i < any.length; i++) if (ids.indexOf(any[i]) >= 0) { ok = true; break; } if (!ok) return false; }
      for (i = 0; i < not.length; i++) if (ids.indexOf(not[i]) >= 0) return false;
      return true;
    }
    for (var k in ccTagAssignments) if (ccTagAssignments.hasOwnProperty(k)) {
      var tk = _parseKey(k);
      if (type && tk.type !== type) continue;
      if (test(ccTagAssignments[k])) out.push(tk);
    }
    return out;
  };

  // ── library <-> project (keep the SAME id so cross-project assignments still resolve) ──
  CCTags.libraryReady = function () { return _libReady; };
  CCTags.libraryGroups = function () { return _libGroups.slice(); };
  CCTags.fromLibrary = function (tagId) {
    var src = _find(_libTags, tagId); if (!src) return null;
    var exist = _find(ccTags, tagId); if (exist) return exist;
    var clone = { id: src.id, name: src.name, color: src.color, icon: src.icon, groupId: null, scope: 'project', _createdAt: Date.now() };
    ccTags.push(clone); _emit(); return clone;
  };
  CCTags.toLibrary = function (tagId) {
    var src = _find(ccTags, tagId); if (!src) return null;
    var exist = _find(_libTags, tagId); if (exist) return exist;
    var clone = { id: src.id, name: src.name, color: src.color, icon: src.icon, groupId: null, scope: 'library', _createdAt: Date.now() };
    _libTags.push(clone); _saveLib(); _emit(); return clone;
  };

  // ── export / import (carry a design's tags across projects) ──
  CCTags.export = function () {
    return { tags: ccTags.slice(), tagGroups: ccTagGroups.slice(), tagAssignments: JSON.parse(JSON.stringify(ccTagAssignments)) };
  };
  CCTags.import = function (data) {
    if (!data) return;
    if (Array.isArray(data.tags)) data.tags.forEach(function (t) { if (_idx(ccTags, t.id) < 0) ccTags.push(t); });
    if (Array.isArray(data.tagGroups)) data.tagGroups.forEach(function (g) { if (_idx(ccTagGroups, g.id) < 0) ccTagGroups.push(g); });
    if (data.tagAssignments) for (var k in data.tagAssignments) if (data.tagAssignments.hasOwnProperty(k)) {
      var src = data.tagAssignments[k], dst = ccTagAssignments[k] || (ccTagAssignments[k] = []);
      for (var i = 0; i < src.length; i++) if (dst.indexOf(src[i]) < 0) dst.push(src[i]);
    }
    _emit();
  };

  // ── reverse reconcile: pull org tag DEFINITIONS + this design's assignments from the
  //    relational store (portal writes) and merge into CCTags (portal-tags-page Phase 9).
  //    ADDITIVE + extId-keyed: portal-created/renamed tags + portal assignments appear in
  //    the editor; the next autosave writes them into the doc so doc->relational sync keeps
  //    them (this is what stops portal writes being wiped by the editor's rebuild-on-save).
  //    Not a remover (the doc stays authoritative for the editor's own content); no loop
  //    (extId self-reference means the re-synced relational state is identical). ──
  CCTags.reconcileFromServer = function () {
    var designId = (global.CCRemote && CCRemote.designId) ? CCRemote.designId : null;
    if (!designId || !global.fetch || !global.Promise) return;
    function j(url) { return fetch(url, { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    return global.Promise.all([j('/api/tags'), j('/api/tag-groups'), j('/api/tag-assignments?designId=' + encodeURIComponent(designId))])
      .then(function (res) {
        var sTags = (res[0] && res[0].tags) || [];
        var sGroups = (res[1] && (res[1].groups || res[1].tagGroups)) || [];
        var sAsg = (res[2] && res[2].assignments) || [];
        var gUuidToExt = {}, uuidToExt = {};
        sGroups.forEach(function (g) {
          var ext = g.extId || g.id; gUuidToExt[g.id] = ext;
          var ex = _find(ccTagGroups, ext);
          if (ex) { if (g.name) ex.name = g.name; if (g.color != null) ex.color = g.color; }
          else { CCTags.createGroup({ id: ext, name: g.name || 'Group', color: g.color, rule: g.rule || 'free' }); }
        });
        sTags.forEach(function (t) {
          var ext = t.extId || t.id; uuidToExt[t.id] = ext;
          var gid = t.groupId ? (gUuidToExt[t.groupId] || null) : null;
          var ex = _find(ccTags, ext);
          if (ex) { if (t.name) ex.name = t.name; if (t.color != null) ex.color = t.color; if (t.icon != null) ex.icon = t.icon; if (gid) ex.groupId = gid; }
          else { CCTags.create({ id: ext, name: t.name || 'Tag', color: t.color, icon: t.icon, groupId: gid, scope: t.scope || 'project' }); }
        });
        var added = 0;
        sAsg.forEach(function (a) {
          var ext = uuidToExt[a.tagId]; if (!ext) return;
          var target = { type: a.targetType, id: a.targetId };
          if (!CCTags.has(target, ext)) { CCTags.assign(target, ext); added++; }
        });
        _emit();
        if (typeof console !== 'undefined') console.log('[CCTags] reconciled from server: ' + sTags.length + ' tags, ' + sGroups.length + ' groups, +' + added + ' assignments');
      });
  };

  // ── per-target computed meta (G5 smart views): download counts etc. (persisted, read-only-ish) ──
  var ccTagMeta = global.ccTagMeta || (global.ccTagMeta = {});      // 'type:id' -> { dl: <count> }
  CCTags._bumpDownload = function (target) {
    var key = _key(target); if (!key) return;
    var m = ccTagMeta[key] || (ccTagMeta[key] = {});
    m.dl = (m.dl || 0) + 1;
    _emit(target);
  };
  CCTags.meta = function (target) { var key = _key(target); return (key && ccTagMeta[key]) ? ccTagMeta[key] : {}; };
  // merge a patch into a target's meta record (G7 WorkMeta: createdAt/lastEdited/lastOpened/opens/edits…).
  // silent=true skips the event — used by CCWorks edit/open stamps so they don't re-trigger autosave in a loop.
  CCTags.setMeta = function (target, patch, silent) {
    var key = _key(target); if (!key || !patch) return;
    var m = ccTagMeta[key] || (ccTagMeta[key] = {});
    for (var k in patch) if (patch.hasOwnProperty(k)) m[k] = patch[k];
    if (!silent) _emit(target);
  };

  // ── automation rules + AI auto-tagging (G4) ──
  var ccTagRules = global.ccTagRules || (global.ccTagRules = []);   // [{id, when, tagId?, tagName?, color?, icon?}]

  function _tagByName(name) {
    var lc = String(name).toLowerCase();
    for (var i = 0; i < ccTags.length; i++) if (String(ccTags[i].name).toLowerCase() === lc) return ccTags[i];
    return null;
  }
  function _ensureProjectTag(spec) {       // create-or-reuse a project tag (by id, then by name)
    spec = spec || {};
    if (spec.id) { var byId = _find(ccTags, spec.id); if (byId) return byId; }
    var ex = _tagByName(spec.name); if (ex) return ex;
    return CCTags.create({ id: spec.id, name: spec.name, color: spec.color, icon: spec.icon, scope: 'project' });
  }

  // AI convenience: assign tags to a target by NAME, creating any that don't exist. names = string | [string|spec]
  CCTags.autoTag = function (target, names) {
    if (!names) return [];
    if (typeof names === 'string') names = [names];
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var spec = (typeof names[i] === 'string') ? { name: names[i] } : names[i];
      var tag = _ensureProjectTag(spec);
      CCTags.assign(target, tag.id); out.push(tag.id);
    }
    return out;
  };

  CCTags.addRule = function (rule) {
    rule = rule || {};
    var r = { id: rule.id || _uid('rule-'), when: rule.when || 'export', tagId: rule.tagId || null, tagName: rule.tagName || null, color: rule.color || null, icon: rule.icon || null };
    ccTagRules.push(r); _emit(); return r;
  };
  CCTags.rules = function () { return ccTagRules.slice(); };
  CCTags.removeRule = function (id) { var i = _idx(ccTagRules, id); if (i < 0) return false; ccTagRules.splice(i, 1); _emit(); return true; };

  // Fire an automation event for a target → every rule with that `when` ensures its tag + assigns it.
  // Wired triggers: 'export' (frame download). AI/campaign code can fire 'aiGenerate'/'share' or call autoTag.
  CCTags.fire = function (when, target) {
    if (!target) return;
    for (var i = 0; i < ccTagRules.length; i++) {
      var r = ccTagRules[i]; if (r.when !== when) continue;
      var tag = r.tagId ? _findTag(r.tagId) : null;
      if (!tag) tag = _ensureProjectTag({ id: r.tagId, name: r.tagName || when, color: r.color, icon: r.icon });
      if (tag) CCTags.assign(target, tag.id);
    }
  };

  global.CCTags = CCTags;
  _bootLib();

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'tags', parent: 'shared', title: 'shared: tags', mount: function () {}, unmount: function () {} });
  }
})(window);
