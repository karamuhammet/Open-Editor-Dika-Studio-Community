/* Module: scene/frame-filter — CCTagFilter (G3). A Figma-style "filter by tag" for the infinite canvas:
   pick tags → frames that don't match are dimmed by a translucent MASK layer (never the frame object's
   own opacity, so nothing leaks into the serialized _scene). Also the data-level filter the page navigator
   / AI use: CCTagFilter.pages(filter) and .framesInScene(filter). Saved views persist via the `tagViews`
   global (autosave v2). Bar shows in scene mode when the project has tags. See docs/tagging-system-plan.md §7. */
(function (global) {
  'use strict';

  var _bar = null, _maskLayer = null, _maskEls = [];
  var _filter = { tags: [], mode: 'all', not: false };
  var _active = false, _ready = false;

  function _host() { return document.getElementById('canvas-area') || document.querySelector('.canvas-area'); }
  function _icon(names, size) {
    if (typeof getIcon !== 'function') return '';
    for (var i = 0; i < names.length; i++) { var s = getIcon(names[i], size || 14); if (s) return s; }
    return '';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function _projTags() { return global.CCTags ? CCTags.list({ scope: 'project' }) : []; }
  function _hasFilter() { return _filter.tags.length > 0; }

  // ── matching ──
  function _matchIds(ids) {
    if (!_filter.tags.length) return true;
    var hit;
    if (_filter.mode === 'all') { hit = true; for (var i = 0; i < _filter.tags.length; i++) if (ids.indexOf(_filter.tags[i]) < 0) { hit = false; break; } }
    else { hit = false; for (var j = 0; j < _filter.tags.length; j++) if (ids.indexOf(_filter.tags[j]) >= 0) { hit = true; break; } }
    return _filter.not ? !hit : hit;
  }
  function _frameMatches(id) { return _matchIds(global.CCTags ? CCTags.idsOf({ type: 'frame', id: id }) : []); }

  // ── bar UI ──
  function _build() {
    if (_bar) return;
    var host = _host(); if (!host) return;
    _bar = document.createElement('div');
    _bar.className = 'scff';
    _bar.addEventListener('click', _onClick);
    host.appendChild(_bar);
    _maskLayer = document.createElement('div');
    _maskLayer.className = 'scff-masks';
    host.appendChild(_maskLayer);
  }

  function _render() {
    if (!_bar) return;
    var tags = _projTags();
    if (!_active || !tags.length) { _bar.classList.remove('show'); return; }
    _bar.classList.add('show');
    var chips = '';
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i], on = _filter.tags.indexOf(t.id) >= 0;
      chips += '<button type="button" class="scff-chip' + (on ? ' on' : '') + '" data-tag="' + _esc(t.id) + '" style="--c:' + _esc(t.color) + '">' +
        '<span class="scff-dot" style="background:' + _esc(t.color) + '">' + (_icon([t.icon], 11) || '') + '</span>' + _esc(t.name) + '</button>';
    }
    var views = global.tagViews || [];
    var vopt = '';
    for (var v = 0; v < views.length; v++) vopt += '<button type="button" class="scff-view" data-view="' + v + '">' + _esc(views[v].name) + '</button>';

    _bar.innerHTML =
      '<span class="scff-lbl">' + (_icon(['filter']) || '') + ' Filter</span>' +
      '<span class="scff-chips">' + chips + '</span>' +
      '<button type="button" class="scff-mode" data-act="mode" title="AND/OR">' + (_filter.mode === 'all' ? 'AND' : 'OR') + '</button>' +
      '<button type="button" class="scff-not' + (_filter.not ? ' on' : '') + '" data-act="not" title="Invert">NOT</button>' +
      '<button type="button" class="scff-cluster" data-act="cluster" title="Cluster frames by tag (ungroup)">' + (_icon(['layout-grid', 'group']) || '▦') + ' Cluster</button>' +
      (_hasFilter() ? '<button type="button" class="scff-save" data-act="save" title="Save view">' + (_icon(['bookmark', 'save']) || '★') + '</button>' : '') +
      (views.length ? '<span class="scff-views">' + vopt + '</span>' : '') +
      (_hasFilter() ? '<button type="button" class="scff-clear" data-act="clear" title="Clear">' + (_icon(['x']) || '✕') + '</button>' : '');
  }

  function _onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-tag],[data-act],[data-view]') : null;
    if (!el) return;
    if (el.hasAttribute('data-tag')) {
      var id = el.getAttribute('data-tag'), k = _filter.tags.indexOf(id);
      if (k >= 0) _filter.tags.splice(k, 1); else _filter.tags.push(id);
      _apply(); return;
    }
    if (el.hasAttribute('data-view')) { var vw = (global.tagViews || [])[+el.getAttribute('data-view')]; if (vw) { _filter = { tags: (vw.filter.tags || []).slice(), mode: vw.filter.mode || 'all', not: !!vw.filter.not }; _apply(); } return; }
    var act = el.getAttribute('data-act');
    if (act === 'mode') { _filter.mode = _filter.mode === 'all' ? 'any' : 'all'; _apply(); }
    else if (act === 'not') { _filter.not = !_filter.not; _apply(); }
    else if (act === 'clear') { _filter.tags = []; _filter.not = false; _apply(); }
    else if (act === 'save') { _saveViewPrompt(); }
    else if (act === 'cluster') {   // N2: reorganize frames into spatial blocks by tag
      if (typeof _scClusterFramesByTag === 'function') {
        var n = _scClusterFramesByTag();
        if (typeof showToast === 'function') showToast(n > 1 ? ('Frame\'ler ' + n + ' clustered by tag') : 'Tag frames to cluster');
        _renderMasks();
      }
    }
  }

  function _saveViewPrompt() {
    var name = (typeof showCustomPrompt === 'function') ? null : null;
    var doSave = function (nm) {
      if (!nm) return;
      global.tagViews = global.tagViews || [];
      global.tagViews.push({ name: nm, filter: { tags: _filter.tags.slice(), mode: _filter.mode, not: _filter.not } });
      if (global.cc && cc.emit) cc.emit('tags:changed', {});   // debounce-saves + re-renders
      _render();
    };
    if (typeof showCustomPrompt === 'function') showCustomPrompt('View name:', 'Filter ' + ((global.tagViews || []).length + 1), doSave);
    else doSave('Filter ' + ((global.tagViews || []).length + 1));
  }

  // ── dim mask (safe — overlay rects, never frame opacity) ──
  function _renderMasks() {
    if (!_maskLayer) return;
    if (!_active || !_hasFilter() || !global.canvas) { _clearMasks(); return; }
    var host = _host(); if (!host) return;
    var frames = canvas.getObjects().filter(function (o) { return o._ccFrame && !o._isSleepThumb; });
    var cEl = canvas.lowerCanvasEl, r = cEl.getBoundingClientRect(), area = host.getBoundingClientRect();
    var sx = r.width / canvas.getWidth(), sy = r.height / canvas.getHeight();
    var n = 0;
    frames.forEach(function (fo) {
      if (_frameMatches(fo._frameId)) return;       // matching frames stay bright
      var el = _maskEls[n] || (_maskEls[n] = (function () { var d = document.createElement('div'); d.className = 'scff-mask'; _maskLayer.appendChild(d); return d; })());
      var b = fo.getBoundingRect();
      el.style.display = '';
      el.style.left = (r.left + b.left * sx - area.left) + 'px';
      el.style.top = (r.top + b.top * sy - area.top) + 'px';
      el.style.width = (b.width * sx) + 'px';
      el.style.height = (b.height * sy) + 'px';
      n++;
    });
    for (var i = n; i < _maskEls.length; i++) _maskEls[i].style.display = 'none';
  }
  function _clearMasks() { for (var i = 0; i < _maskEls.length; i++) _maskEls[i].style.display = 'none'; }

  function _apply() { _render(); _renderMasks(); }

  // ── public API ──
  var CCTagFilter = {
    apply: function (filter) { _filter = { tags: (filter && filter.tags || []).slice(), mode: (filter && filter.mode) || 'all', not: !!(filter && filter.not) }; _apply(); return CCTagFilter; },
    clear: function () { _filter = { tags: [], mode: 'all', not: false }; _apply(); },
    current: function () { return { tags: _filter.tags.slice(), mode: _filter.mode, not: _filter.not }; },
    // data-level: which frame ids in the active scene match `filter` (defaults to the live filter)
    framesInScene: function (filter) {
      var f = filter || _filter, out = [];
      var SC = global.SceneEditor;
      var sc = (SC && SC._curScene) ? SC._curScene() : (typeof pages !== 'undefined' && pages[currentPageIndex] ? pages[currentPageIndex]._scene : null);
      if (!sc || !sc.frames) return out;
      var save = _filter; _filter = { tags: (f.tags || []).slice(), mode: f.mode || 'all', not: !!f.not };
      sc.frames.forEach(function (fr) { if (_frameMatches(fr.id)) out.push(fr.id); });
      _filter = save;
      return out;
    },
    // data-level: page indices whose page matches `filter` (for the navigator / AI)
    pages: function (filter) {
      var f = filter || _filter, out = [];
      if (typeof pages === 'undefined') return out;
      var save = _filter; _filter = { tags: (f.tags || []).slice(), mode: f.mode || 'all', not: !!f.not };
      for (var i = 0; i < pages.length; i++) {
        var pid = pages[i]._pageId; var ids = (global.CCTags && pid) ? CCTags.idsOf({ type: 'page', id: pid }) : [];
        if (_matchIds(ids)) out.push(i);
      }
      _filter = save;
      return out;
    },
    // saved views
    saveView: function (name, filter) { global.tagViews = global.tagViews || []; var f = filter || _filter; global.tagViews.push({ name: name, filter: { tags: (f.tags || []).slice(), mode: f.mode || 'all', not: !!f.not } }); if (global.cc && cc.emit) cc.emit('tags:changed', {}); return global.tagViews[global.tagViews.length - 1]; },
    views: function () { return (global.tagViews || []).slice(); },
    applyView: function (name) { var vs = global.tagViews || []; for (var i = 0; i < vs.length; i++) if (vs[i].name === name) { return CCTagFilter.apply(vs[i].filter); } return null; },
    removeView: function (name) { var vs = global.tagViews || []; for (var i = 0; i < vs.length; i++) if (vs[i].name === name) { vs.splice(i, 1); if (global.cc && cc.emit) cc.emit('tags:changed', {}); _render(); return true; } return false; }
  };
  global.CCTagFilter = CCTagFilter;

  function _init() {
    if (_ready) return; _ready = true;
    _build();
    _active = !!(global.SceneEditor && SceneEditor._active);   // catch a scene already active before we subscribed
    if (global.cc && cc.on) {
      cc.on('scene:active', function (on) { _active = on; if (!on) { _filter.tags = []; _filter.not = false; } _render(); _renderMasks(); });
      cc.on('tags:changed', function () { if (_active) { _render(); _renderMasks(); } });
    }
    if (global.canvas && canvas.on) canvas.on('after:render', function () { if (_active && _hasFilter()) _renderMasks(); });
  }

  if (global.cc && cc.on) cc.on('cc:canvas-ready', _init);
  if (global.canvas) _init();

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'frame-filter', parent: 'scene', title: 'scene: frame-filter', mount: function () {}, unmount: function () {} });
  }
})(window);
