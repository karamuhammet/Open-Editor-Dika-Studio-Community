/* Module: shared/works — CCWorks (G7). The project's WORK INDEX: it unifies every work unit (each single/
   slide/board PAGE + each FRAME of every infinite-canvas scene) into one queryable list, joins the manual
   tag layer (CCTags) with a dynamic META layer (CCTags meta: createdAt/lastEdited/lastOpened/downloads),
   and derives fields (platform, content count, productType). This is the data engine behind the Çalışma
   Tarayıcısı panel (shared/works-browser). See docs/tagging-system-plan.md §"asset browser". */
(function (global) {
  'use strict';

  function _pages() { return (typeof pages !== 'undefined' && Array.isArray(pages)) ? pages : []; }
  function _ensureId(p) { return (typeof _pgEnsurePageId === 'function') ? _pgEnsurePageId(p) : (p._pageId || (p._pageId = 'pg-' + Date.now().toString(36))); }

  function _platform(w, h) {
    if (!w || !h) return 'bilinmiyor';
    var r = w / h;
    if (Math.abs(r - 1) < 0.06) return 'kare';
    if (r < 0.85) return (r < 0.62) ? 'story' : 'dikey';
    return (r > 1.62) ? 'wide' : 'yatay';
  }
  // content objects in a frame = children minus the artboard bg (see smart-views note on _isFrameBg)
  function _frameContent(fr) {
    var objs = (fr && fr.json && fr.json.objects) ? fr.json.objects : null;
    if (!objs || !objs.length) return 0;
    var flagged = 0;
    for (var i = 0; i < objs.length; i++) if (objs[i]._isFrameBg) flagged++;
    return flagged ? (objs.length - flagged) : Math.max(0, objs.length - 1);
  }
  function _pageType(p) {
    if (p._isBoard || p._isWfBoard) return 'board';
    if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(p)) return 'slide';
    if (p._productType === 'video') return 'video';
    if (p._productType === 'scene') return 'scene';
    return p._productType || 'single';
  }
  function _tags(target) {
    if (!global.CCTags) return [];
    return CCTags.of(target).map(function (t) { return { id: t.id, name: t.name, color: t.color, icon: t.icon }; });
  }
  // meta with a lazy createdAt stamp the first time a work is seen (≈ first-seen time)
  function _meta(target) {
    if (!global.CCTags) return {};
    var m = CCTags.meta(target);
    if (!m.createdAt) { var now = _now(); CCTags.setMeta(target, { createdAt: now, lastEdited: m.lastEdited || now }, true); m = CCTags.meta(target); }
    return m;
  }
  function _now() { try { return Date.now(); } catch (e) { return 0; } }

  function _pageRecord(p, idx) {
    var id = _ensureId(p), target = { type: 'page', id: id }, m = _meta(target);
    return {
      type: 'page', id: id, pageIndex: idx, label: p.label || 'Page',
      productType: _pageType(p), w: p.w || 0, h: p.h || 0, platform: _platform(p.w, p.h), bg: p.bg || '',
      // Page-sleep v2: a slept page's count comes from the _psObjCount stamped at park time.
      contentCount: p._slept ? (p._psObjCount || 0) : ((p.json && p.json.objects) ? p.json.objects.length : 0),
      tags: _tags(target), dl: m.dl || 0, createdAt: m.createdAt || 0, lastEdited: m.lastEdited || m.createdAt || 0, lastOpened: m.lastOpened || 0,
      archived: !!m.archived
    };
  }
  function _frameRecord(p, fr, idx) {
    var target = { type: 'frame', id: fr.id }, m = _meta(target);
    return {
      type: 'frame', id: fr.id, pageIndex: idx, pageId: _ensureId(p), label: fr.label || 'Frame',
      productType: 'frame', w: fr.w || 0, h: fr.h || 0, platform: _platform(fr.w, fr.h), bg: fr.bg || '',
      contentCount: _frameContent(fr),
      tags: _tags(target), dl: m.dl || 0, createdAt: m.createdAt || 0, lastEdited: m.lastEdited || m.createdAt || 0, lastOpened: m.lastOpened || 0,
      archived: !!m.archived
    };
  }

  // C2: each inner slide of a slide-deck page is its own taggable work.
  function _slideRecord(p, slide, idx) {
    var target = { type: 'slide', id: slide.id }, m = _meta(target);
    return {
      type: 'slide', id: slide.id, pageIndex: idx, pageId: _ensureId(p), label: slide.label || 'Slide',
      productType: 'slide', w: slide.w || 0, h: slide.h || 0, platform: _platform(slide.w, slide.h), bg: slide.bg || (p && p.bg) || '',
      contentCount: (slide.json && slide.json.objects) ? slide.json.objects.length : 0,
      tags: _tags(target), dl: m.dl || 0, createdAt: m.createdAt || 0, lastEdited: m.lastEdited || m.createdAt || 0, lastOpened: m.lastOpened || 0,
      archived: !!m.archived
    };
  }
  function _hasSlides(p) { return p._slideDeck && p._slideDeck.enabled && Array.isArray(p._slideDeck.slides) && p._slideDeck.slides.length; }

  var CCWorks = {};

  // Every work unit in the project: scene pages contribute their FRAMES, other pages contribute themselves.
  // K6: archived works are hidden by default — pass {includeArchived:true} (or {archivedOnly:true}) to see them.
  CCWorks.all = function (opts) {
    var out = [], ps = _pages();
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p._scene && p._scene.frames && p._scene.frames.length) {
        for (var f = 0; f < p._scene.frames.length; f++) out.push(_frameRecord(p, p._scene.frames[f], i));
      } else if (_hasSlides(p)) {
        for (var s = 0; s < p._slideDeck.slides.length; s++) out.push(_slideRecord(p, p._slideDeck.slides[s], i));   // C2
      } else {
        out.push(_pageRecord(p, i));
      }
    }
    if (opts && opts.archivedOnly) return out.filter(function (w) { return w.archived; });
    if (opts && opts.includeArchived) return out;
    return out.filter(function (w) { return !w.archived; });
  };
  CCWorks.archive = function (target, on) { if (global.CCTags) CCTags.setMeta(target, { archived: on !== false }); };

  // D6: tag usage counts across all (non-archived) works — [{id,name,color,count}] desc.
  CCWorks.tagStats = function () {
    var counts = {}, all = CCWorks.all();
    all.forEach(function (w) { w.tags.forEach(function (t) { (counts[t.id] = counts[t.id] || { id: t.id, name: t.name, color: t.color, count: 0 }).count++; }); });
    var arr = []; for (var k in counts) if (counts.hasOwnProperty(k)) arr.push(counts[k]);
    arr.sort(function (a, b) { return b.count - a.count; });
    return arr;
  };

  CCWorks.get = function (target) {
    var ps = _pages();
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (target.type === 'page' && p._pageId === target.id) return _pageRecord(p, i);
      if (target.type === 'frame' && p._scene && p._scene.frames) {
        for (var f = 0; f < p._scene.frames.length; f++) if (p._scene.frames[f].id === target.id) return _frameRecord(p, p._scene.frames[f], i);
      }
      if (target.type === 'slide' && _hasSlides(p)) {
        for (var s = 0; s < p._slideDeck.slides.length; s++) if (p._slideDeck.slides[s].id === target.id) return _slideRecord(p, p._slideDeck.slides[s], i);
      }
    }
    return null;
  };

  // counts by facet — { types:{single:n,…}, platforms:{…}, total }
  CCWorks.summary = function () {
    var all = CCWorks.all(), types = {}, plats = {};
    all.forEach(function (w) { types[w.productType] = (types[w.productType] || 0) + 1; plats[w.platform] = (plats[w.platform] || 0) + 1; });
    return { total: all.length, types: types, platforms: plats };
  };

  // D7 coverage matrix: rows = project tags (+ "Etiketsiz"), cols = types present, cells = work counts.
  // A multi-tagged work counts in each of its tag rows (coverage view), so grandTotal can exceed total.
  CCWorks.matrix = function () {
    var all = CCWorks.all();
    var colSeen = {}; all.forEach(function (w) { colSeen[w.productType] = true; });
    var PREF = { single: 0, frame: 1, slide: 2, board: 3, video: 4, scene: 5 };
    var cols = Object.keys(colSeen).sort(function (a, b) { return (PREF[a] == null ? 9 : PREF[a]) - (PREF[b] == null ? 9 : PREF[b]); })
      .map(function (t) { return { key: t, label: t }; });   // browser maps key → pretty label
    var rows = [], byId = {};
    (global.CCTags ? CCTags.list({ scope: 'project' }) : []).forEach(function (t) {
      var row = { id: t.id, label: t.name, color: t.color, cells: {}, total: 0 }; rows.push(row); byId[t.id] = row;
    });
    var untag = { id: '__none', label: 'Untagged', color: null, cells: {}, total: 0 };
    all.forEach(function (w) {
      var ck = w.productType;
      if (!w.tags.length) { untag.cells[ck] = (untag.cells[ck] || 0) + 1; untag.total++; return; }
      w.tags.forEach(function (tg) { var row = byId[tg.id]; if (row) { row.cells[ck] = (row.cells[ck] || 0) + 1; row.total++; } });
    });
    rows.push(untag);
    var colTotals = {}, grand = 0;
    rows.forEach(function (row) { for (var ck in row.cells) if (row.cells.hasOwnProperty(ck)) { colTotals[ck] = (colTotals[ck] || 0) + row.cells[ck]; grand += row.cells[ck]; } });
    return { rows: rows, cols: cols, colTotals: colTotals, grandTotal: grand };
  };

  // N9: most-recently-edited works (activity feed) — top n.
  CCWorks.recent = function (n) {
    return CCWorks.all().sort(function (a, b) { return (b.lastEdited || 0) - (a.lastEdited || 0); }).slice(0, n || 20);
  };
  // D5: change-log ("ne yaptım") — append a capped history entry to the work's meta.
  CCWorks.log = function (target, what) {
    if (!global.CCTags) return;
    var m = CCTags.meta(target), h = (m.history || []).slice();
    h.unshift({ at: _now(), what: String(what == null ? '' : what) });
    if (h.length > 20) h = h.slice(0, 20);
    CCTags.setMeta(target, { history: h }, true);
  };
  CCWorks.history = function (target) { var m = global.CCTags ? CCTags.meta(target) : {}; return (m.history || []).slice(); };

  CCWorks.platform = _platform;
  CCWorks.touch = function (target) { if (global.CCTags) { var m = CCTags.meta(target); CCTags.setMeta(target, { lastEdited: _now(), edits: (m.edits || 0) + 1 }, true); } };
  CCWorks._stampOpen = function (target) { if (global.CCTags) { var m = CCTags.meta(target); CCTags.setMeta(target, { lastOpened: _now(), opens: (m.opens || 0) + 1 }, true); } };

  // Navigate to a work: switch to its page; for a frame, select its live CCFrame once the scene renders.
  CCWorks.open = function (target) {
    var rec = (target.type && target.id) ? CCWorks.get(target) : null;
    if (!rec) return false;
    if (typeof switchPage === 'function') switchPage(rec.pageIndex);
    CCWorks._stampOpen({ type: rec.type, id: rec.id });
    if (rec.type === 'frame' && global.canvas) {
      setTimeout(function () {
        try {
          var fo = canvas.getObjects().filter(function (o) { return o._ccFrame && o._frameId === rec.id; })[0];
          if (fo) { canvas.discardActiveObject(); canvas.setActiveObject(fo); canvas.requestRenderAll(); }
        } catch (e) {}
      }, 350);
    } else if (rec.type === 'slide' && typeof loadInnerSlide === 'function') {   // C2: open the inner slide
      var p = _pages()[rec.pageIndex], si = 0;
      if (p && p._slideDeck) for (var s = 0; s < p._slideDeck.slides.length; s++) if (p._slideDeck.slides[s].id === rec.id) { si = s; break; }
      setTimeout(function () { try { loadInnerSlide(rec.pageIndex, si); } catch (e) {} }, 120);
    }
    return true;
  };

  // ── portal deep-link reveal (portal-tags-page Phase 8) ──
  // The portal opens /editor?designId=..&reveal=<kind>:<targetId>. After the design
  // loads, reveal that exact target. Returns true when found+revealed, false when the
  // scene isn't ready yet (the URL runner retries) or the target is gone.
  CCWorks.reveal = function (kind, id) {
    if (!kind || !id) return false;
    if (kind === 'design') return true;                 // whole project already open
    if (kind === 'page') return CCWorks.open({ type: 'page', id: id });
    if (kind === 'frame') return CCWorks.open({ type: 'frame', id: id });
    if (kind === 'slide') return CCWorks.open({ type: 'slide', id: id });
    if (kind === 'object') return _revealObject(id);
    return false;
  };

  function _selectLiveObject(ccId) {
    if (!global.canvas) return false;
    var top = canvas.getObjects(), o = null;
    for (var i = 0; i < top.length && !o; i++) { if (top[i]._ccId === ccId) o = top[i]; }
    if (!o) {                                            // scene children live INSIDE CCFrame groups
      for (var g = 0; g < top.length && !o; g++) {
        var grp = top[g];
        if (grp._ccFrame && grp.getObjects) { var kids = grp.getObjects(); for (var k = 0; k < kids.length; k++) if (kids[k]._ccId === ccId) { o = kids[k]; break; } }
      }
    }
    if (!o) return false;
    try {
      canvas.discardActiveObject();
      var sel = o.group || o;                            // can't activate a grouped child directly -> select its frame
      canvas.setActiveObject(sel);
      if (typeof canvas.viewportCenterObject === 'function') { try { canvas.viewportCenterObject(sel); } catch (e) {} }
      canvas.requestRenderAll();
    } catch (e) {}
    return true;
  }

  function _findObjOwnerPage(ccId) {
    var ps = _pages();
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], sc = p._scene, dk = p._slideDeck, j, o;
      if (sc && sc.frames) {
        for (var f = 0; f < sc.frames.length; f++) { j = sc.frames[f].json; if (j && j.objects) for (o = 0; o < j.objects.length; o++) if (j.objects[o]._ccId === ccId) return i; }
        if (sc.freeElements) for (o = 0; o < sc.freeElements.length; o++) if (sc.freeElements[o]._ccId === ccId) return i;
      }
      if (dk && dk.slides) for (var s = 0; s < dk.slides.length; s++) { var sj = dk.slides[s].json; if (sj && sj.objects) for (o = 0; o < sj.objects.length; o++) if (sj.objects[o]._ccId === ccId) return i; }
      var _pjson = (typeof _psJsonForSave === 'function') ? _psJsonForSave(p) : p.json;   // page-sleep: parked json (no-op when off)
      if (_pjson && _pjson.objects) for (o = 0; o < _pjson.objects.length; o++) if (_pjson.objects[o]._ccId === ccId) return i;
    }
    return -1;
  }

  function _revealObject(ccId) {
    if (_selectLiveObject(ccId)) return true;            // already on the live canvas
    var pi = _findObjOwnerPage(ccId);
    if (pi < 0) return false;
    if (typeof switchPage === 'function') switchPage(pi);
    setTimeout(function () { _selectLiveObject(ccId); }, 400);
    return true;
  }

  function _clearRevealParam() {
    try { var u = new URL(window.location.href); if (u.searchParams.has('reveal')) { u.searchParams.delete('reveal'); window.history.replaceState({}, '', u.toString()); } } catch (e) {}
  }
  var _ccRevealDone = false;
  global._ccRevealFromUrl = function () {
    if (_ccRevealDone) return;
    var rv; try { rv = new URLSearchParams(window.location.search).get('reveal'); } catch (e) { _ccRevealDone = true; return; }
    if (!rv) { _ccRevealDone = true; return; }
    var sep = rv.indexOf(':'); if (sep < 0) { _ccRevealDone = true; return; }
    var kind = rv.slice(0, sep), id = rv.slice(sep + 1);
    if (!kind || !id) { _ccRevealDone = true; return; }
    var tries = 0;
    (function attempt() {
      tries++;
      var ok = false;
      try { ok = CCWorks.reveal(kind, id); } catch (e) { ok = false; }
      if (ok) { _ccRevealDone = true; _clearRevealParam(); return; }
      if (tries < 20) { setTimeout(attempt, 400); }     // ~8s window for a heavy scene to enliven
      else { _ccRevealDone = true; if (typeof showToast === 'function') showToast('Tagged target not found (may have been deleted).', 'error'); _clearRevealParam(); }
    })();
  };

  global.CCWorks = CCWorks;

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'works', parent: 'shared', title: 'shared: works', mount: function () {}, unmount: function () {} });
  }
})(window);
