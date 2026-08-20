/* Module: shared/smart-views — CCSmartViews (G5). "Akıllı görünümler": COMPUTED, read-only filters that are
   never assigned (kept deliberately separate from manual CCTags — see docs/tagging-system-plan.md §8). Each
   view derives its members live from existing data (no new storage except the download counter on CCTags
   meta). Returns plain targets [{type,id}] so the same consumers (filter bar, navigator, AI) can use them. */
(function (global) {
  'use strict';

  function _pages() { return (typeof pages !== 'undefined' && Array.isArray(pages)) ? pages : []; }
  function _ensureId(p) { return (typeof _pgEnsurePageId === 'function') ? _pgEnsurePageId(p) : p._pageId; }

  // every taggable target in the project: pages + every frame in every scene
  function _allTargets() {
    var out = [];
    var ps = _pages();
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      out.push({ type: 'page', id: _ensureId(p), _obj: p });
      if (p._scene && p._scene.frames) for (var f = 0; f < p._scene.frames.length; f++) {
        var fr = p._scene.frames[f];
        out.push({ type: 'frame', id: fr.id, _obj: fr });
      }
    }
    return out;
  }
  function _idsOf(t) { return global.CCTags ? CCTags.idsOf({ type: t.type, id: t.id }) : []; }
  function _dl(t) { return (global.CCTags && CCTags.meta) ? (CCTags.meta({ type: t.type, id: t.id }).dl || 0) : 0; }
  function _le(t) { var m = (global.CCTags && CCTags.meta) ? CCTags.meta({ type: t.type, id: t.id }) : {}; return m.lastEdited || m.createdAt || 0; }
  function _now() { try { return Date.now(); } catch (e) { return 0; } }
  var DAY = 86400000;
  // content objects in a frame = children minus the artboard bg. _isFrameBg isn't in CUSTOM_PROPS, so the
  // serialized json may not carry it → fall back to "every frame has exactly one bg child" and subtract 1.
  function _frameContentCount(fr) {
    var objs = (fr && fr.json && fr.json.objects) ? fr.json.objects : null;
    if (!objs || !objs.length) return 0;
    var flagged = 0;
    for (var i = 0; i < objs.length; i++) if (objs[i]._isFrameBg) flagged++;
    return flagged ? (objs.length - flagged) : Math.max(0, objs.length - 1);
  }

  var VIEWS = [
    { id: 'untagged', name: 'Untagged', icon: 'circle', test: function (t) { return _idsOf(t).length === 0; } },
    { id: 'downloaded', name: 'Downloaded', icon: 'download', test: function (t) { return _dl(t) > 0; } },
    { id: 'undownloaded', name: 'Not downloaded', icon: 'circle-dashed', test: function (t) { return t.type === 'frame' && _dl(t) === 0; } },
    { id: 'empty', name: 'Empty frame', icon: 'square-dashed', test: function (t) { return t.type === 'frame' && _frameContentCount(t._obj) === 0; } },
    { id: 'filled', name: 'With content', icon: 'layers', test: function (t) { return t.type === 'frame' && _frameContentCount(t._obj) > 0; } },
    { id: 'recent', name: 'This week', icon: 'clock', test: function (t) { var le = _le(t); return le > 0 && (_now() - le) <= 7 * DAY; } },
    { id: 'stale', name: 'Stale (30d+)', icon: 'clock-pause', test: function (t) { var le = _le(t); return le > 0 && (_now() - le) > 30 * DAY; } }
  ];

  var CCSmartViews = {
    views: function () { return VIEWS.map(function (v) { return { id: v.id, name: v.name, icon: v.icon }; }); },
    // compute one view → [{type,id}] (live, never stored)
    compute: function (viewId, opts) {
      var v = null; for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].id === viewId) { v = VIEWS[i]; break; }
      if (!v) return [];
      var wantType = opts && opts.type;
      var out = [];
      var all = _allTargets();
      for (var j = 0; j < all.length; j++) {
        var t = all[j];
        if (wantType && t.type !== wantType) continue;
        if (v.test(t)) out.push({ type: t.type, id: t.id });
      }
      return out;
    },
    count: function (viewId, opts) { return CCSmartViews.compute(viewId, opts).length; }
  };
  global.CCSmartViews = CCSmartViews;

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'smart-views', parent: 'shared', title: 'shared: smart-views', mount: function () {}, unmount: function () {} });
  }
})(window);
