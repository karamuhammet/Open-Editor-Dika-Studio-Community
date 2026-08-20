/* Module: shared/works-browser — CCWorksBrowser (G7). The "Çalışma Tarayıcısı": a project-wide asset
   browser modal over CCWorks. One grid of EVERY work (single/slide/board pages + every scene frame), a
   facet sidebar (types · tags · smart views), live text search + sort, multi-select with bulk tag/export,
   and click-to-jump navigation. Chrome mirrors CCImageModal/CCTagModal. Open: CCWorksBrowser.open(). */
(function (global) {
  'use strict';

  var _overlay = null, _panel = null, _sideEl = null, _gridEl = null, _chipsEl = null, _barEl = null, _countEl = null, _searchEl = null, _sortEl = null, _compareEl = null, _filterEl = null;
  var _built = false, _open = false;
  var _filter = { types: [], tags: [], smart: null, search: '', tagMode: 'all', tagNot: false, archived: false, orient: 'all', size: 'all', color: 'all' };
  var _sort = 'edited';
  var _view = 'grid';   // 'grid' | 'matrix' (D7 coverage matrix)
  var _group = 'none';  // 'none' | 'date' (D3 time-axis grouping)
  var _scope = 'project'; // 'project' | 'all' — portal-tags-page Phase 10 (D2) cross-project browsing
  var _xpTagMap = null;   // editor tag id (extId) -> relational uuid, for cross-project tag filters
  var _sel = {};
  var _unsub = null;

  function _icon(names, size) {
    if (typeof getIcon !== 'function') return '';
    for (var i = 0; i < names.length; i++) { var s = getIcon(names[i], size || 16); if (s) return s; }
    return '';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function _key(w) { return w.type + ':' + w.id; }
  function _selCount() { var n = 0; for (var k in _sel) if (_sel[k]) n++; return n; }
  function _ago(ts) {
    if (!ts) return '—';
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'd';
    if (s < 86400) return Math.round(s / 3600) + 's';
    if (s < 604800) return Math.round(s / 86400) + 'g';
    return Math.round(s / 604800) + 'h';
  }
  // Valid Lucide names that match the page-tab mode glyphs (photo/movie/artboard don't exist → blanked before).
  var TYPE_ICON = { single: 'file', custom: 'file', slide: 'presentation', board: 'square-dashed', frame: 'frame', video: 'video', scene: 'layout-grid' };
  var TYPE_LABEL = { single: 'Single', slide: 'Slide', board: 'Board', frame: 'Canvas frame', video: 'Video', scene: 'Canvas' };

  function _build() {
    if (_built) return;
    _overlay = document.createElement('div');
    _overlay.className = 'ccwb-overlay';
    _overlay.addEventListener('mousedown', function (e) { if (e.target === _overlay) close(); });
    _panel = document.createElement('div');
    _panel.className = 'ccwb';
    _panel.setAttribute('role', 'dialog'); _panel.setAttribute('aria-modal', 'true');
    _panel.innerHTML =
      '<div class="ccwb-head">' +
        '<span class="ccwb-title">' + (_icon(['layout-grid']) || '') + '<span>Works browser</span></span>' +
        '<div class="ccwb-search">' + (_icon(['search'], 15) || '') + '<input type="text" placeholder="search…" class="ccwb-search-in"></div>' +
        '<div class="ccwb-sortwrap">' + (_icon(['arrow-up-down', 'arrow-down-up', 'chevrons-up-down'], 15) || '') + '<select class="ccwb-sort"><option value="edited">Last edited</option><option value="created">Created</option><option value="downloads">Downloads</option><option value="name">Name</option><option value="dategroup">Group by date</option></select></div>' +
        '<div class="ccwb-views">' +
          '<button class="ccwb-vbtn on" type="button" data-view="grid" title="Izgara">' + (_icon(['layout-grid'], 15) || '▦') + '</button>' +
          '<button class="ccwb-vbtn" type="button" data-view="list" title="List">' + (_icon(['list'], 15) || '☰') + '</button>' +
          '<button class="ccwb-vbtn" type="button" data-view="matrix" title="Matris">' + (_icon(['table'], 15) || '⊞') + '</button>' +
        '</div>' +
        '<div class="ccwb-scope">' +
          '<button class="ccwb-scopebtn on" type="button" data-scope="project">Bu proje</button>' +
          '<button class="ccwb-scopebtn" type="button" data-scope="all">All projects</button>' +
        '</div>' +
        '<button class="ccwb-x" type="button">' + (_icon(['x']) || '✕') + '</button>' +
      '</div>' +
      '<div class="ccwb-chips"></div>' +
      '<div class="ccwb-body"><div class="ccwb-side"></div><div class="ccwb-main"><div class="ccwb-filterbar"></div><div class="ccwb-grid"></div></div></div>' +
      '<div class="ccwb-bar"></div>' +
      '<div class="ccwb-compare"></div>';
    _overlay.appendChild(_panel);
    document.body.appendChild(_overlay);
    _sideEl = _panel.querySelector('.ccwb-side');
    _gridEl = _panel.querySelector('.ccwb-grid');
    _filterEl = _panel.querySelector('.ccwb-filterbar');
    _chipsEl = _panel.querySelector('.ccwb-chips');
    _barEl = _panel.querySelector('.ccwb-bar');
    _countEl = _panel.querySelector('.ccwb-count');
    _searchEl = _panel.querySelector('.ccwb-search-in');
    _sortEl = _panel.querySelector('.ccwb-sort');
    _panel.querySelector('.ccwb-x').addEventListener('click', close);
    _searchEl.addEventListener('input', function () { _filter.search = _searchEl.value || ''; _renderGrid(); });
    _sortEl.addEventListener('change', function () {           // last option folds date-grouping in
      if (_sortEl.value === 'dategroup') { _group = 'date'; } else { _group = 'none'; _sort = _sortEl.value; }
      _renderGrid();
    });
    _panel.querySelector('.ccwb-views').addEventListener('click', function (e) {   // grid | list | matrix segments
      var b = e.target.closest ? e.target.closest('.ccwb-vbtn') : null; if (!b) return;
      _view = b.getAttribute('data-view');
      var bts = _panel.querySelectorAll('.ccwb-vbtn'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i] === b);
      _renderGrid();
    });
    _panel.querySelector('.ccwb-scope').addEventListener('click', function (e) {   // D2: Bu proje | Tüm projeler
      var b = e.target.closest ? e.target.closest('.ccwb-scopebtn') : null; if (!b) return;
      _scope = b.getAttribute('data-scope');
      var bts = _panel.querySelectorAll('.ccwb-scopebtn'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i] === b);
      _renderFacets(); _renderGrid();
    });
    _filterEl.addEventListener('change', function (e) {          // top-of-grid attribute filters (yön · boyut · renk)
      var s = e.target.closest ? e.target.closest('.ccwb-fsel') : null; if (!s) return;
      var key = s.getAttribute('data-f'); if (key) { _filter[key] = s.value; _renderGrid(); }
    });
    _filterEl.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-act="fclear"]')) { _filter.orient = 'all'; _filter.size = 'all'; _filter.color = 'all'; _renderGrid(); }
    });
    _sideEl.addEventListener('click', _onSideClick);
    _gridEl.addEventListener('click', _onGridClick);
    _barEl.addEventListener('click', _onBarClick);
    _chipsEl.addEventListener('click', _onChipsClick);
    _compareEl = _panel.querySelector('.ccwb-compare');
    _compareEl.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-cmp-close]')) { _compareEl.classList.remove('show'); } });
    _gridEl.addEventListener('dragstart', _onDragStart);        // K4 drag a card…
    _sideEl.addEventListener('dragover', _onSideDragOver);      // …onto a tag facet
    _sideEl.addEventListener('dragleave', _onSideDragLeave);
    _sideEl.addEventListener('drop', _onSideDrop);
    _built = true;
  }

  // ── K4: drag-drop tagging (card → tag facet) ──
  function _facetTagAt(node) { return (node && node.closest) ? node.closest('.ccwb-facet[data-facet="tag"]') : null; }
  function _onDragStart(e) {
    var card = e.target.closest ? e.target.closest('.ccwb-card') : null;
    if (card && e.dataTransfer) { e.dataTransfer.setData('text/cc-work', card.getAttribute('data-k')); e.dataTransfer.effectAllowed = 'copy'; }
  }
  function _onSideDragOver(e) {
    var f = _facetTagAt(e.target); if (!f) return;
    e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    var prev = _sideEl.querySelector('.ccwb-facet.dragover'); if (prev && prev !== f) prev.classList.remove('dragover');
    f.classList.add('dragover');
  }
  function _onSideDragLeave(e) { var f = _facetTagAt(e.target); if (f) f.classList.remove('dragover'); }
  function _onSideDrop(e) {
    var f = _facetTagAt(e.target); if (!f) return;
    e.preventDefault(); f.classList.remove('dragover');
    var key = e.dataTransfer ? e.dataTransfer.getData('text/cc-work') : ''; if (!key) return;
    var i = key.indexOf(':');
    if (global.CCTags) CCTags.assign({ type: key.slice(0, i), id: key.slice(i + 1) }, f.getAttribute('data-id'));
    _renderFacets(); _renderGrid();
  }

  function _onChipsClick(e) {
    var el = e.target.closest ? e.target.closest('[data-rm],[data-act],[data-stat]') : null; if (!el) return;
    if (el.hasAttribute('data-stat')) {                        // D6 stat chip → filter to that tag
      _filter.tags = [el.getAttribute('data-stat')]; _filter.smart = null;
      _renderFacets(); _renderGrid(); return;
    }
    if (el.hasAttribute('data-rm')) {                          // remove an active filter chip
      var kind = el.getAttribute('data-rm'), id = el.getAttribute('data-id');
      if (kind === 'type') { var i = _filter.types.indexOf(id); if (i >= 0) _filter.types.splice(i, 1); }
      else if (kind === 'tag') { var j = _filter.tags.indexOf(id); if (j >= 0) _filter.tags.splice(j, 1); }
      else if (kind === 'smart') { _filter.smart = null; }
      _renderFacets(); _renderGrid(); return;
    }
    var act = el.getAttribute('data-act');                     // N7 boolean toggles + K3 save
    if (act === 'tagmode') { _filter.tagMode = _filter.tagMode === 'all' ? 'any' : 'all'; _renderGrid(); }
    else if (act === 'tagnot') { _filter.tagNot = !_filter.tagNot; _renderGrid(); }
    else if (act === 'savews') { _saveWorkspace(); }
  }
  // K3: save the current filter as a named, pinned workspace (SmartCollection) in tagCollections.
  function _saveWorkspace() {
    var cols = window.tagCollections || (window.tagCollections = []);
    var snap = JSON.parse(JSON.stringify(_filter));
    var doSave = function (name) {
      if (!name) return;
      cols.push({ id: 'col-' + (typeof Date !== 'undefined' ? Date.now() : cols.length) + '-' + cols.length, name: name, filter: snap });
      if (global.cc && cc.emit) cc.emit('tags:changed', {});
      _renderFacets();
    };
    if (typeof showCustomPrompt === 'function') showCustomPrompt('Workspace name:', 'Area ' + (cols.length + 1), doSave);
    else doSave('Area ' + (cols.length + 1));
  }

  function _onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  // ── filtering ──
  function _smartSet(id) {
    if (!id || !global.CCSmartViews) return null;
    var set = {}; CCSmartViews.compute(id).forEach(function (t) { set[t.type + ':' + t.id] = true; }); return set;
  }
  function _wHas(w, id) { for (var j = 0; j < w.tags.length; j++) if (w.tags[j].id === id) return true; return false; }
  // base = sidebar facets (type/tag/smart) + search; attr = top-bar Önizleme-style filters (yön/boyut/renk)
  function _matchBase(w, smartSet) {
    if (_filter.types.length && _filter.types.indexOf(w.productType) < 0) return false;
    if (_filter.tags.length) {                                  // N7: VE / VEYA / DEĞİL
      var hit;
      if (_filter.tagMode === 'any') { hit = false; for (var i = 0; i < _filter.tags.length; i++) if (_wHas(w, _filter.tags[i])) { hit = true; break; } }
      else { hit = true; for (var k = 0; k < _filter.tags.length; k++) if (!_wHas(w, _filter.tags[k])) { hit = false; break; } }
      if (_filter.tagNot) hit = !hit;
      if (!hit) return false;
    }
    if (smartSet && !smartSet[_key(w)]) return false;
    if (_filter.search) { if (String(w.label).toLowerCase().indexOf(_filter.search.toLowerCase()) < 0) return false; }
    return true;
  }
  function _matchAttr(w) {
    if (_filter.orient !== 'all' && w.platform !== _filter.orient) return false;
    if (_filter.size !== 'all' && (w.w + '×' + w.h) !== _filter.size) return false;
    if (_filter.color !== 'all' && _colorBucket(w.bg) !== _filter.color) return false;
    return true;
  }
  function _match(w, smartSet) { return _matchBase(w, smartSet) && _matchAttr(w); }
  // dominant-colour bucket from a work's background hex (Önizleme parity, but synchronous on bg)
  var _PLAT_LABEL = { kare: 'Square', dikey: 'Vertical', story: 'Story', yatay: 'Horizontal', geniş: 'Wide', bilinmiyor: 'Other' };
  function _hexRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function _colorBucket(hex) {
    var rgb = _hexRgb(hex); if (!rgb) return '';
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), hh = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) * 60; else if (max === g) hh = ((b - r) / d + 2) * 60; else hh = ((r - g) / d + 4) * 60;
    }
    l *= 100; s *= 100;
    if (s < 8) return l < 22 ? 'Dark' : (l > 80 ? 'Open' : 'Gray');
    if (l < 14) return 'Dark'; if (l > 90) return 'Open';
    if (hh >= 345 || hh < 15) return 'Red';
    if (hh < 40) return 'Orange'; if (hh < 65) return 'Yellow';
    if (hh < 170) return 'Green'; if (hh < 200) return 'Cyan';
    if (hh < 260) return 'Blue'; if (hh < 300) return 'Purple'; return 'Pink';
  }
  var _COLOR_SWATCH = { 'Red': '#e74c3c', 'Orange': '#e67e22', 'Yellow': '#f1c40f', 'Green': '#2ecc71', 'Cyan': '#00bcd4', 'Blue': '#3498db', 'Purple': '#9b59b6', 'Pink': '#e91e8b', 'Dark': '#2c2c2c', 'Open': '#e8e8e8', 'Gray': '#9aa0a6' };
  function _sorted(list) {
    var l = list.slice();
    if (_sort === 'name') l.sort(function (a, b) { return String(a.label).localeCompare(b.label); });
    else if (_sort === 'downloads') l.sort(function (a, b) { return (b.dl || 0) - (a.dl || 0); });
    else if (_sort === 'created') l.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    else l.sort(function (a, b) { return (b.lastEdited || 0) - (a.lastEdited || 0); });
    return l;
  }

  // ── render ──
  function _render() { _renderFacets(); _renderGrid(); }

  function _renderFacets() {
    var sum = global.CCWorks ? CCWorks.summary() : { types: {}, total: 0 };
    var html = '<div class="ccwb-fg">Types</div>';
    var PREF = { single: 0, frame: 1, slide: 2, board: 3, video: 4, scene: 5 };
    var order = Object.keys(sum.types).sort(function (a, b) { return (PREF[a] == null ? 9 : PREF[a]) - (PREF[b] == null ? 9 : PREF[b]); });
    order.forEach(function (t) {
      html += _facet('type', t, (_icon([TYPE_ICON[t] || 'file'], 15) || ''), TYPE_LABEL[t] || t, sum.types[t], _filter.types.indexOf(t) >= 0);
    });
    if (global.CCTags) {
      var tags = CCTags.list({ scope: 'project' });
      if (tags.length) {
        html += '<div class="ccwb-fg">Tags</div>';
        tags.slice().sort(function (a, b) { return (b._fav ? 1 : 0) - (a._fav ? 1 : 0); }).forEach(function (t) {   // N10 favourites first
          var on = _filter.tags.indexOf(t.id) >= 0;
          html += '<button type="button" class="ccwb-facet' + (on ? ' on' : '') + '" data-facet="tag" data-id="' + _esc(t.id) + '">' +
            '<span class="ccwb-facet-ico"><span class="ccwb-dot" style="background:' + _esc(t.color) + '"></span></span>' +
            '<span class="ccwb-facet-nm">' + _esc(t.name) + '</span>' +
            '<span class="ccwb-fav' + (t._fav ? ' on' : '') + '" data-fav="' + _esc(t.id) + '" title="Favori">' + (_icon(['star'], 13) || '★') + '</span></button>';
        });
      }
    }
    if (global.CCSmartViews) {
      html += '<div class="ccwb-fg">Smart views</div>';
      CCSmartViews.views().forEach(function (v) {
        var sv = CCSmartViews.compute(v.id);                                       // count per smart view (mockup: "İndirilmemiş 40")
        html += _facet('smart', v.id, (_icon([v.icon, 'circle'], 15) || ''), v.name, (sv ? sv.length : ''), _filter.smart === v.id);
      });
    }
    var cols = window.tagCollections || [];                                       // K3 saved workspaces
    if (cols.length) {
      html += '<div class="ccwb-fg">Workspaces</div>';
      cols.forEach(function (c) {
        html += '<button type="button" class="ccwb-facet ccwb-ws" data-facet="ws" data-id="' + _esc(c.id) + '">' +
          '<span class="ccwb-facet-ico">' + (_icon(['bookmark'], 15) || '') + '</span><span class="ccwb-facet-nm">' + _esc(c.name) + '</span>' +
          '<span class="ccwb-wsx" data-wsx="' + _esc(c.id) + '" title="Delete">' + (_icon(['x'], 12) || '×') + '</span></button>';
      });
    }
    var arc = global.CCWorks ? CCWorks.all({ archivedOnly: true }).length : 0;   // K6 archive toggle
    html += '<div class="ccwb-fg"></div>' + _facet('archive', 'arsiv', (_icon(['archive'], 15) || ''), 'Archive', arc, _filter.archived);
    _sideEl.innerHTML = html;
  }
  function _facet(kind, id, ico, name, count, on) {
    return '<button type="button" class="ccwb-facet' + (on ? ' on' : '') + '" data-facet="' + kind + '" data-id="' + _esc(id) + '">' +
      '<span class="ccwb-facet-ico">' + ico + '</span><span class="ccwb-facet-nm">' + _esc(name) + '</span>' +
      (count !== '' ? '<span class="ccwb-facet-ct">' + count + '</span>' : '') + '</button>';
  }

  function _renderMatrix() {
    var m = global.CCWorks ? CCWorks.matrix() : { rows: [], cols: [], colTotals: {}, grandTotal: 0 };
    var lbl = function (k) { return TYPE_LABEL[k] || k; };
    var hcol = function (k) { return '<span class="ccwb-mxhc">' + (_icon([TYPE_ICON[k] || 'file'], 14) || '') + ' ' + _esc(lbl(k)) + '</span>'; };
    var h = '<table class="ccwb-matrix"><thead><tr><th class="ccwb-mxh">Tag</th>';
    m.cols.forEach(function (c) { h += '<th class="ccwb-mxnum">' + hcol(c.key) + '</th>'; });
    h += '<th class="ccwb-mxnum ccwb-mxtoth">Total</th></tr></thead><tbody>';
    m.rows.forEach(function (row) {
      var dot = row.color ? '<span class="ccwb-mxdot" style="background:' + _esc(row.color) + '"></span>' : '<span class="ccwb-mxdot ccwb-mxdotempty"></span>';
      h += '<tr><td class="ccwb-mxrow"><span class="ccwb-mxrowin">' + dot + _esc(row.label) + '</span></td>';
      m.cols.forEach(function (c) {
        var n = row.cells[c.key] || 0;
        if (n) h += '<td class="ccwb-mxnum ccwb-mxcell" data-row="' + _esc(row.id) + '" data-col="' + _esc(c.key) + '">' + n + '</td>';
        else h += '<td class="ccwb-mxnum ccwb-mxzero">–</td>';
      });
      h += '<td class="ccwb-mxnum ccwb-mxtot">' + row.total + '</td></tr>';
    });
    h += '<tr class="ccwb-mxfoot"><td>Total</td>';
    m.cols.forEach(function (c) { h += '<td class="ccwb-mxnum">' + (m.colTotals[c.key] || 0) + '</td>'; });
    h += '<td class="ccwb-mxnum ccwb-mxgrand">' + m.grandTotal + '</td></tr></tbody></table>';
    _gridEl.innerHTML = h;
  }

  // Önizleme-style attribute filters at the top of the card view: Yön (platform) · Boyut (w×h) · Renk (bg bucket)
  function _renderFilterBar(base) {
    var orients = {}, sizes = {}, colors = {};
    base.forEach(function (w) {
      if (w.platform) orients[w.platform] = (orients[w.platform] || 0) + 1;
      if (w.w && w.h) sizes[w.w + '×' + w.h] = (sizes[w.w + '×' + w.h] || 0) + 1;
      var cb = _colorBucket(w.bg); if (cb) colors[cb] = (colors[cb] || 0) + 1;
    });
    function _pill(key, icoNames, allLabel, opts, cur) {
      var ico = (key === 'color' && cur !== 'all')
        ? '<span class="ccwb-fswatch" style="background:' + (_COLOR_SWATCH[cur] || '#888') + '"></span>'
        : (_icon(icoNames, 14) || '');
      var h = '<label class="ccwb-fpill' + (cur !== 'all' ? ' on' : '') + '">' + ico +
        '<select class="ccwb-fsel" data-f="' + key + '"><option value="all">' + allLabel + '</option>';
      opts.forEach(function (o) { h += '<option value="' + _esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + _esc(o.t) + ' (' + o.c + ')</option>'; });
      return h + '</select></label>';
    }
    var PLAT_ORDER = ['kare', 'dikey', 'story', 'yatay', 'wide', 'bilinmiyor'];
    var oOpts = PLAT_ORDER.filter(function (p) { return orients[p]; }).map(function (p) { return { v: p, t: _PLAT_LABEL[p] || p, c: orients[p] }; });
    var sOpts = Object.keys(sizes).sort().map(function (k) { return { v: k, t: k, c: sizes[k] }; });
    var C_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Dark', 'Gray', 'Open'];
    var cOpts = C_ORDER.filter(function (c) { return colors[c]; }).map(function (c) { return { v: c, t: c, c: colors[c] }; });
    var html = _pill('orient', ['rectangle-horizontal', 'frame'], 'All directions', oOpts, _filter.orient) +
      _pill('size', ['ruler', 'move'], 'All sizes', sOpts, _filter.size) +
      _pill('color', ['palette', 'droplet'], 'All colors', cOpts, _filter.color);
    if (_filter.orient !== 'all' || _filter.size !== 'all' || _filter.color !== 'all')
      html += '<button type="button" class="ccwb-fclear" data-act="fclear" title="Clear direction/size/color filters">' + (_icon(['x'], 13) || '×') + ' Clear</button>';
    _filterEl.innerHTML = html;
  }

  function _renderGrid() {
    /* COMMUNITY EDITION: "Bu proje" is local and works offline, so it is untouched. "All projects"
       is the org-wide read model over /api/tags/entities, which this build has no server for, so it
       shows the card instead of an empty grid or a "Failed to load." that explains nothing. */
    if (_scope === 'all') {
      if (window.CCEdition && CCEdition.serverless && CCEdition.lockSurface) {
        CCEdition.lockSurface(_gridEl, 'works');
        return;
      }
      _renderCrossProject(); return;   // D2: org-wide list from the shared read model
    }
    if (_view === 'matrix') {
      _gridEl.classList.remove('ccwb-listmode');
      if (_filterEl) _filterEl.style.display = 'none';
      _chipsEl.innerHTML = '<span class="ccwb-chips-l">Coverage matrix — empty cell (–) = missing · click cell → go to that filter</span>';
      _renderMatrix(); _renderBar(); return;
    }
    var all = global.CCWorks ? CCWorks.all(_filter.archived ? { archivedOnly: true } : undefined) : [];
    var smartSet = _smartSet(_filter.smart);
    var base = all.filter(function (w) { return _matchBase(w, smartSet); });   // before attr filters → drives filter-bar options
    if (_filterEl) { _filterEl.style.display = ''; _renderFilterBar(base); }
    var list = _sorted(base.filter(_matchAttr));
    var active = (_filter.types.length || _filter.tags.length || _filter.smart || _filter.search || _filter.archived || _filter.orient !== 'all' || _filter.size !== 'all' || _filter.color !== 'all');
    var bool = _filter.tags.length > 1 || _filter.tagNot ? (
      '<button type="button" class="ccwb-bool" data-act="tagmode" title="AND/OR">' + (_filter.tagMode === 'all' ? 'AND' : 'OR') + '</button>' +
      '<button type="button" class="ccwb-bool' + (_filter.tagNot ? ' on' : '') + '" data-act="tagnot" title="Invert">NOT</button>'
    ) : (_filter.tags.length === 1 ? '<button type="button" class="ccwb-bool' + (_filter.tagNot ? ' on' : '') + '" data-act="tagnot" title="Invert">NOT</button>' : '');
    var lead = active ? '<span class="ccwb-chips-l">filter:</span>' + _activeChips() + bool : _statsHtml();   // D6 stats when no filter
    var save = active ? '<button type="button" class="ccwb-savews" data-act="savews" title="Save this filter as a workspace">' + (_icon(['bookmark-plus', 'bookmark']) || '★') + ' Save workspace</button>' : '';   // K3
    _chipsEl.innerHTML = lead + save + '<span class="ccwb-result">' + list.length + ' / ' + all.length + ' workspace</span>';
    _gridEl.classList.toggle('ccwb-listmode', _view === 'list');
    if (!list.length) { _gridEl.innerHTML = '<div class="ccwb-empty">No matching works.</div>'; _renderBar(); return; }
    var html = '';
    if (_view === 'list') {                                    // list view
      for (var li = 0; li < list.length; li++) html += _listRow(list[li]);
    } else if (_group === 'date') {                            // D3: time-axis grouping
      var byDate = list.slice().sort(function (a, b) { return (b.lastEdited || 0) - (a.lastEdited || 0); }), cur = null;
      byDate.forEach(function (w) { var bk = _dateBucket(w.lastEdited); if (bk !== cur) { cur = bk; html += '<div class="ccwb-grouphdr">' + bk + '</div>'; } html += _card(w); });
    } else {
      for (var i = 0; i < list.length; i++) html += _card(list[i]);
    }
    _gridEl.innerHTML = html;
    _loadThumbs();
    _renderBar();
  }
  function _listRow(w) {
    var k = _key(w), sel = !!_sel[k], dots = '';
    for (var i = 0; i < w.tags.length && i < 4; i++) dots += '<span class="ccwb-tagdot" style="background:' + _esc(w.tags[i].color) + '" title="' + _esc(w.tags[i].name) + '"></span>';
    return '<div class="ccwb-card ccwb-row' + (sel ? ' sel' : '') + '" draggable="true" data-k="' + _esc(k) + '" data-type="' + w.type + '" data-id="' + _esc(w.id) + '">' +
      '<div class="ccwb-thumb" data-thumb="1"><span class="ccwb-ph">' + (_icon([TYPE_ICON[w.productType] || 'file'], 16) || '') + '</span><span class="ccwb-sel" data-selbox="1">' + (_icon(['check'], 11) || '✓') + '</span></div>' +
      '<div class="ccwb-rownm">' + _esc(w.label) + '</div>' +
      '<div class="ccwb-rowtags">' + dots + '</div>' +
      '<div class="ccwb-rowmeta">' + _esc(w.platform) + '</div>' +
      '<div class="ccwb-rowmeta">' + _ago(w.lastEdited) + '</div>' +
      '<div class="ccwb-rowmeta">' + (_icon(['download'], 12) || '') + ' ' + (w.dl || 0) + '</div>' +
      '<button class="ccwb-jump" type="button" data-jump="1" title="Open">' + (_icon(['arrow-up-right', 'external-link'], 14) || '↗') + '</button>' +
    '</div>';
  }
  function _dateBucket(ts) {
    if (!ts) return 'Tarihsiz';
    var d = Math.floor(((typeof Date !== 'undefined' ? Date.now() : 0) - ts) / 86400000);
    if (d <= 0) return 'Today'; if (d <= 7) return 'This week'; if (d <= 30) return 'Bu ay'; return 'Older';
  }
  function _activeChips() {
    var c = '';
    _filter.types.forEach(function (t) { c += _chip('type', t, TYPE_LABEL[t] || t); });
    if (global.CCTags) _filter.tags.forEach(function (id) { var t = CCTags.get(id); if (t) c += _chip('tag', id, t.name); });
    if (_filter.smart && global.CCSmartViews) { var v = CCSmartViews.views().filter(function (x) { return x.id === _filter.smart; })[0]; if (v) c += _chip('smart', _filter.smart, v.name); }
    return c;
  }
  function _chip(kind, id, label) { return '<span class="ccwb-chip" data-rm="' + kind + '" data-id="' + _esc(id) + '">' + _esc(label) + ' ' + (_icon(['x'], 13) || '×') + '</span>'; }
  // D6: light stats — the most-used tags as clickable chips (click → filter to that tag).
  function _statsHtml() {
    if (!global.CCWorks || !CCWorks.tagStats) return '';
    var s = CCWorks.tagStats().slice(0, 5);
    if (!s.length) return '<span class="ccwb-chips-l">no tags yet</span>';
    var h = '<span class="ccwb-chips-l">most:</span>';
    s.forEach(function (t) { h += '<span class="ccwb-stat" data-stat="' + _esc(t.id) + '"><span class="ccwb-statdot" style="background:' + _esc(t.color) + '"></span>' + _esc(t.name) + ' <b>' + t.count + '</b></span>'; });
    return h;
  }

  function _card(w) {
    var k = _key(w), sel = !!_sel[k];
    var dots = '';
    for (var i = 0; i < w.tags.length && i < 4; i++) dots += '<span class="ccwb-tagdot" style="background:' + _esc(w.tags[i].color) + '" title="' + _esc(w.tags[i].name) + '"></span>';
    var meta = _esc(w.platform) + ' · ' + _ago(w.lastEdited) + (w.dl ? ' · ' + (_icon(['download'], 11) || '') + ' ' + w.dl : '');
    return '<div class="ccwb-card' + (sel ? ' sel' : '') + '" draggable="true" data-k="' + _esc(k) + '" data-type="' + w.type + '" data-id="' + _esc(w.id) + '">' +
      '<div class="ccwb-thumb" data-thumb="1">' +
        '<span class="ccwb-ph">' + (_icon([TYPE_ICON[w.productType] || 'file'], 28) || '') + '</span>' +
        '<span class="ccwb-sel" data-selbox="1">' + (_icon(['check'], 12) || '✓') + '</span>' +
        '<button class="ccwb-jump" type="button" data-jump="1" title="Open">' + (_icon(['arrow-up-right', 'external-link'], 14) || '↗') + '</button>' +
      '</div>' +
      '<div class="ccwb-meta"><div class="ccwb-nm">' + _esc(w.label) + '</div>' +
        '<div class="ccwb-sub">' + (dots ? '<span class="ccwb-tagdots">' + dots + '</span>' : '') + '<span class="ccwb-metatxt">' + meta + '</span></div>' +
      '</div></div>';
  }

  // ── D2 cross-project mode: list org-wide tagged entities from the SAME server read model the
  //    portal uses (/api/tags/entities), covers from persisted subThumbs keys. Click = save current
  //    project + navigate to the target design with a ?reveal (Phase 8 reveals it on the new load). ──
  var XP_KIND_LABEL = { design: 'Design', page: 'Page', frame: 'Frame', slide: 'Slide', object: 'Object', asset: 'Media' };
  var XP_KIND_ICON = { design: 'layout-grid', page: 'file', frame: 'frame', slide: 'presentation', object: 'shapes', asset: 'photo' };
  function _xpEnsureTagMap(cb) {
    if (_xpTagMap || !global.fetch) { cb(); return; }
    fetch('/api/tags', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      _xpTagMap = {}; ((d && d.tags) || []).forEach(function (t) { if (t.extId) _xpTagMap[t.extId] = t.id; });
      cb();
    }).catch(function () { _xpTagMap = {}; cb(); });
  }
  function _xpCard(e) {
    var cover = e.coverKey ? ('/api/assets/blob/' + e.coverKey + '?w=400') : '';
    var thumb = cover
      ? '<div class="ccwb-thumb has-thumb" data-thumb="1" style="background-image:url(\'' + _esc(cover) + '\')"></div>'
      : '<div class="ccwb-thumb" data-thumb="1"><span class="ccwb-ph">' + (_icon([XP_KIND_ICON[e.kind] || 'file'], 28) || '') + '</span></div>';
    return '<div class="ccwb-card ccwb-xp" data-cross="1" data-designid="' + _esc(e.designId || '') + '" data-kind="' + _esc(e.kind) + '" data-target="' + _esc(e.targetId || '') + '">' +
      thumb +
      '<div class="ccwb-meta"><div class="ccwb-nm">' + _esc(e.label || 'Untitled') + '</div>' +
        '<div class="ccwb-sub"><span class="ccwb-metatxt">' + _esc(XP_KIND_LABEL[e.kind] || e.kind) + '</span></div>' +
      '</div></div>';
  }
  function _renderCrossProject() {
    if (_filterEl) _filterEl.style.display = 'none';
    _gridEl.classList.remove('ccwb-listmode');
    _chipsEl.innerHTML = '<span class="ccwb-chips-l">All projects — tagged items org-wide (click → open that project)</span>';
    _gridEl.innerHTML = '<div class="ccwb-empty">Loading…</div>';
    if (!global.fetch) { _gridEl.innerHTML = '<div class="ccwb-empty">Unavailable in this environment.</div>'; return; }
    var token = (_scope === 'all') ? (_xpToken = (_xpToken || 0) + 1) : 0;
    _xpEnsureTagMap(function () {
      if (_scope !== 'all' || token !== _xpToken) return;   // scope changed while loading
      var qs = ['types=design,page,frame,slide,object', 'limit=200'];
      if (_filter.search) qs.push('search=' + encodeURIComponent(_filter.search));
      if (_filter.tags.length && _xpTagMap) {
        var uu = _filter.tags.map(function (id) { return _xpTagMap[id]; }).filter(Boolean);
        if (uu.length) { qs.push('tagIds=' + encodeURIComponent(uu.join(','))); if (_filter.tags.length > 1) qs.push('mode=' + (_filter.tagMode === 'all' ? 'all' : 'any')); }
      }
      if (_sort && _sort !== 'dategroup') qs.push('sort=' + encodeURIComponent(_sort));
      fetch('/api/tags/entities?' + qs.join('&'), { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (_scope !== 'all' || token !== _xpToken) return;
        var rows = (d && d.rows) || [];
        _chipsEl.innerHTML = '<span class="ccwb-chips-l">All projects</span><span class="ccwb-result">' + rows.length + ' item</span>';
        if (!rows.length) { _gridEl.innerHTML = '<div class="ccwb-empty">No matching tagged item in other projects.</div>'; _renderBar(); return; }
        var html = ''; for (var i = 0; i < rows.length; i++) html += _xpCard(rows[i]);
        _gridEl.innerHTML = html; _renderBar();
      }).catch(function () { if (_scope === 'all' && token === _xpToken) _gridEl.innerHTML = '<div class="ccwb-empty">Failed to load.</div>'; });
    });
  }
  function _openCrossProject(designId, kind, targetId) {
    if (!designId) return;
    if (kind === 'asset') { if (typeof showToast === 'function') showToast('Media opens in portal preview.'); return; }
    var cur = (global.CCRemote && CCRemote.designId) ? CCRemote.designId : null;
    if (cur && designId === cur) { close(); if (global.CCWorks && CCWorks.reveal) CCWorks.reveal(kind, targetId); return; }
    var url = '/editor?designId=' + encodeURIComponent(designId);
    if (kind && kind !== 'design' && targetId) url += '&reveal=' + encodeURIComponent(kind + ':' + targetId);
    function go() { try { window.location.assign(url); } catch (e) { window.location.href = url; } }
    if (global.CCRemote && CCRemote.active && CCRemote.saveNow) {   // guard unsaved changes: flush first
      if (typeof showToast === 'function') showToast('Saving and opening the other project…');
      try { var p = CCRemote.saveNow(); if (p && p.then) { p.then(go, go); return; } } catch (e) {}
    }
    go();
  }
  var _xpToken = 0;

  // Lazy thumbnail previews — frames render off-screen via _scRenderFrameToDataURL (safe: temp StaticCanvas),
  // sleeping frames reuse their stored _thumb. Cached by id so re-renders are instant. Pages/slides: placeholder.
  var _thumbCache = {};
  function _frameModelById(id) {
    if (typeof pages === 'undefined') return null;
    for (var i = 0; i < pages.length; i++) { var sc = pages[i]._scene; if (sc && sc.frames) for (var f = 0; f < sc.frames.length; f++) if (sc.frames[f].id === id) return sc.frames[f]; }
    return null;
  }
  function _setThumb(thumb, url) { if (thumb && url) { thumb.style.backgroundImage = 'url("' + url + '")'; thumb.classList.add('has-thumb'); } }
  function _loadThumbs() {
    if (!_gridEl) return;
    var cards = _gridEl.querySelectorAll('.ccwb-card');
    for (var i = 0; i < cards.length && i < 80; i++) {
      var card = cards[i];
      if (card.getAttribute('data-type') !== 'frame') continue;
      var id = card.getAttribute('data-id'), thumb = card.querySelector('.ccwb-thumb');
      if (!thumb) continue;
      if (_thumbCache[id]) { _setThumb(thumb, _thumbCache[id]); continue; }
      // portal-tags-page Phase 9: prefer the persisted server cover (shared with the portal) over a live render.
      var _sk = (window.__ccSubThumbs && window.__ccSubThumbs['frame:' + id]) ? window.__ccSubThumbs['frame:' + id] : null;
      if (_sk) { var _su = '/api/assets/blob/' + _sk + '?w=400'; _thumbCache[id] = _su; _setThumb(thumb, _su); continue; }
      var fr = _frameModelById(id); if (!fr) continue;
      if (fr._thumb) { _thumbCache[id] = fr._thumb; _setThumb(thumb, fr._thumb); continue; }
      if (typeof _scRenderFrameToDataURL === 'function') {
        (function (id2, thumb2, fr2) {
          try { _scRenderFrameToDataURL(fr2, 0.3, function (url) { if (url) { _thumbCache[id2] = url; _setThumb(thumb2, url); } }); } catch (e) {}
        })(id, thumb, fr);
      }
    }
  }

  function _renderBar() {
    var n = _selCount();
    if (_countEl) _countEl.textContent = (global.CCWorks ? CCWorks.all().length : 0) + ' work' + (n ? ' · ' + n + ' selected' : '');
    if (!n) { _barEl.classList.remove('show'); _barEl.innerHTML = ''; return; }
    _barEl.classList.add('show');
    // K2: quick status set — buttons for the first exclusive ("Durum") group's tags; click → apply to all selected.
    var status = '';
    if (global.CCTags) {
      var exGrp = CCTags.groups().filter(function (g) { return g.rule === 'exclusive'; })[0];
      if (exGrp) {
        var stags = CCTags.list({ scope: 'project' }).filter(function (t) { return t.groupId === exGrp.id; });
        if (stags.length) { status = '<span class="ccwb-statusset">' + _esc(exGrp.name) + ':</span>'; stags.forEach(function (t) { status += '<button type="button" class="ccwb-statusbtn" data-status="' + _esc(t.id) + '" style="--c:' + _esc(t.color) + '"><span class="ccwb-statdot" style="background:' + _esc(t.color) + '"></span>' + _esc(t.name) + '</button>'; }); }
      }
    }
    var canCmp = n >= 2 && n <= 4;                              // mockup order: Etiketle · Karşılaştır · Export (Arşivle = subtle icon)
    _barEl.innerHTML = '<span class="ccwb-seln">' + (_icon(['checkbox'], 16) || '') + ' ' + n + ' selected</span>' +
      '<span class="ccwb-clearsel" data-act="clearsel">Clear selection</span>' + status +
      '<div class="ccwb-actions">' +
        '<button type="button" class="ccwb-act ccwb-act-ic" data-act="archive" title="Archive">' + (_icon(['archive']) || '') + '</button>' +
        '<button type="button" class="ccwb-act" data-act="tag">' + (_icon(['tag']) || '') + ' Tag</button>' +
        '<button type="button" class="ccwb-act' + (canCmp ? '' : ' ccwb-act-off') + '" data-act="compare" title="Select 2–4 works">' + (_icon(['columns', 'layout-columns']) || '') + ' Compare</button>' +
        '<button type="button" class="ccwb-act" data-act="export">' + (_icon(['package-export', 'download']) || '') + ' Export</button>' +
      '</div>';
  }
  // K5: side-by-side compare overlay for 2–4 selected works.
  function _renderCompare(targets) {
    if (!global.CCWorks || !_compareEl) return;
    var cols = '';
    targets.forEach(function (t) {
      var w = CCWorks.get(t) || { label: '?', tags: [], platform: '', dl: 0, productType: '', lastEdited: 0 };
      var dots = '';
      w.tags.forEach(function (tg) { dots += '<span class="ccwb-cmp-tag"><span class="ccwb-tagdot" style="background:' + _esc(tg.color) + '"></span>' + _esc(tg.name) + '</span>'; });
      cols += '<div class="ccwb-cmp-col"><div class="ccwb-cmp-thumb">' + (_icon([TYPE_ICON[w.productType] || 'file'], 30) || '') + '</div>' +
        '<div class="ccwb-cmp-nm">' + _esc(w.label) + '</div>' +
        '<div class="ccwb-cmp-meta">' + _esc(TYPE_LABEL[w.productType] || w.productType) + ' · ' + _esc(w.platform) + '</div>' +
        '<div class="ccwb-cmp-meta">' + (_icon(['calendar'], 12) || '') + ' ' + _ago(w.lastEdited) + ' · ' + (_icon(['download'], 12) || '') + ' ' + (w.dl || 0) + '</div>' +
        '<div class="ccwb-cmp-tags">' + (dots || '<span class="ccwb-cmp-none">untagged</span>') + '</div></div>';
    });
    _compareEl.innerHTML = '<div class="ccwb-cmp-head"><span>' + targets.length + ' works comparison</span>' +
      '<button type="button" class="ccwb-cmp-close" data-cmp-close="1">' + (_icon(['x']) || '✕') + ' Back</button></div>' +
      '<div class="ccwb-cmp-cols">' + cols + '</div>';
    _compareEl.classList.add('show');
  }

  // ── events ──
  function _onSideClick(e) {
    var fav = e.target.closest ? e.target.closest('[data-fav]') : null;          // N10: toggle favourite (don't select)
    if (fav) { if (global.CCTags) CCTags.toggleFavorite(fav.getAttribute('data-fav')); _renderFacets(); return; }
    var x = e.target.closest ? e.target.closest('[data-wsx]') : null;            // K3: remove a saved workspace
    if (x) { var wid = x.getAttribute('data-wsx'), cs = window.tagCollections || []; for (var ci = 0; ci < cs.length; ci++) if (cs[ci].id === wid) { cs.splice(ci, 1); break; } if (global.cc && cc.emit) cc.emit('tags:changed', {}); _renderFacets(); return; }
    var b = e.target.closest ? e.target.closest('.ccwb-facet') : null; if (!b) return;
    var kind = b.getAttribute('data-facet'), id = b.getAttribute('data-id');
    if (kind === 'type') { var i = _filter.types.indexOf(id); if (i >= 0) _filter.types.splice(i, 1); else _filter.types.push(id); }
    else if (kind === 'tag') { var j = _filter.tags.indexOf(id); if (j >= 0) _filter.tags.splice(j, 1); else _filter.tags.push(id); }
    else if (kind === 'smart') { _filter.smart = (_filter.smart === id) ? null : id; }
    else if (kind === 'archive') { _filter.archived = !_filter.archived; }
    else if (kind === 'ws') { var c = (window.tagCollections || []).filter(function (z) { return z.id === id; })[0]; if (c) _filter = JSON.parse(JSON.stringify(c.filter)); }
    _renderFacets(); _renderGrid();
  }
  function _onGridClick(e) {
    var xcard = e.target.closest ? e.target.closest('.ccwb-card.ccwb-xp') : null;   // D2: cross-project card → open that design
    if (xcard) { _openCrossProject(xcard.getAttribute('data-designid'), xcard.getAttribute('data-kind'), xcard.getAttribute('data-target')); return; }
    var cell = e.target.closest ? e.target.closest('.ccwb-mxcell') : null;   // D7: matrix cell → jump to that filter
    if (cell) {
      var rid = cell.getAttribute('data-row'), col = cell.getAttribute('data-col');
      _filter.types = [col]; _filter.tagMode = 'all'; _filter.tagNot = false;
      if (rid === '__none') { _filter.smart = 'untagged'; _filter.tags = []; }
      else { _filter.tags = [rid]; _filter.smart = null; }
      _view = 'grid'; var _vb = _panel.querySelectorAll('.ccwb-vbtn'); for (var _vi = 0; _vi < _vb.length; _vi++) _vb[_vi].classList.toggle('on', _vb[_vi].getAttribute('data-view') === 'grid');
      _renderFacets(); _renderGrid(); return;
    }
    var jump = e.target.closest ? e.target.closest('[data-jump]') : null;
    var card = e.target.closest ? e.target.closest('.ccwb-card') : null;
    if (!card) return;
    if (jump) { if (global.CCWorks) CCWorks.open({ type: card.getAttribute('data-type'), id: card.getAttribute('data-id') }); close(); return; }
    var k = card.getAttribute('data-k'); _sel[k] = !_sel[k];
    card.classList.toggle('sel', !!_sel[k]);   // check mark is CSS-driven (.ccwb-card.sel .ccwb-check)
    _renderBar();
  }
  function _onBarClick(e) {
    var b = e.target.closest ? e.target.closest('[data-act],[data-status]') : null; if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'clearsel') { _sel = {}; _renderGrid(); return; }
    var targets = _selectedTargets();
    if (!targets.length) return;
    var st = b.getAttribute('data-status');                    // K2: bulk status (exclusive group auto-swaps)
    if (st) { if (global.CCTags) targets.forEach(function (t) { CCTags.assign(t, st); }); _renderGrid(); _renderFacets(); return; }
    if (act === 'tag') { if (global.CCTagModal) CCTagModal.open({ target: targets, onChange: function () { _renderGrid(); _renderFacets(); } }); }
    else if (act === 'compare') { if (targets.length < 2 || targets.length > 4) { if (typeof showToast === 'function') showToast('Select 2–4 works to compare'); return; } _renderCompare(targets); }   // K5
    else if (act === 'export') { _bulkExport(targets); }
    else if (act === 'archive') {                              // K6 bulk archive (toggle based on first selection)
      if (global.CCWorks) { var on = !(global.CCTags && CCTags.meta(targets[0]).archived); targets.forEach(function (t) { CCWorks.archive(t, on); }); }
      _sel = {}; _renderFacets(); _renderGrid();
      if (typeof showToast === 'function') showToast(targets.length + ' works ' + (targets.length ? 'archive updated' : ''));
    }
  }
  function _selectedTargets() {
    var out = []; for (var k in _sel) if (_sel[k]) { var i = k.indexOf(':'); out.push({ type: k.slice(0, i), id: k.slice(i + 1) }); } return out;
  }
  // Resolve a {type,id} work target to a renderPart source (+ label). Scene pages contribute frames,
  // slide-deck pages contribute slides, other pages contribute themselves (via resolvePartSource).
  function _workRenderTarget(t) {
    var ps = (typeof pages !== 'undefined' && pages) ? pages : [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (t.type === 'page' && p._pageId === t.id) {
        var src = (typeof resolvePartSource === 'function') ? resolvePartSource(p) : { kind: 'page', json: p.json, w: p.w, h: p.h, bg: p.bg };
        return { render: src, label: p.label || ('page-' + (i + 1)) };
      }
      if (t.type === 'frame' && p._scene && p._scene.frames) {
        for (var f = 0; f < p._scene.frames.length; f++) { var fr = p._scene.frames[f]; if (fr.id === t.id) return { frame: fr, label: fr.label || ('cerceve-' + (f + 1)) }; }
      }
      if (t.type === 'slide' && p._slideDeck && p._slideDeck.slides) {
        for (var s = 0; s < p._slideDeck.slides.length; s++) { var sl = p._slideDeck.slides[s]; if (sl.id === t.id) return { render: { kind: 'slide', json: sl.json, w: sl.w, h: sl.h, bg: sl.bg }, label: sl.label || ('slide-' + (s + 1)) }; }
      }
    }
    return null;
  }

  // Render one resolved work to a PNG dataURL (frames via the canonical frame renderer that serializes the
  // live frame if it's current; pages/slides via the unified render core).
  function _renderWork(r) {
    return new Promise(function (res) {
      if (r.frame && typeof _scRenderFrameToDataURL === 'function') {
        _scRenderFrameToDataURL(r.frame, 1, function (url) { res({ url: url, label: r.label }); });
      } else if (r.render && typeof renderPart === 'function') {
        renderPart(
          { kind: r.render.kind, json: r.render.json, w: r.render.w, h: r.render.h, bg: r.render.bg, x: r.render.x, y: r.render.y },
          { format: 'png', dpi: 300 }
        ).then(function (url) { res({ url: url, label: r.label }); });
      } else { res({ url: null, label: r.label }); }
    });
  }

  // Part-aware bulk export: any mix of page + frame + slide together → a single ZIP of PNGs (or a direct
  // download when only one is selected). Replaces the old frames-only stub.
  function _bulkExport(targets) {
    if (!targets || !targets.length) return;
    var ES = (typeof ExportService !== 'undefined') ? ExportService : null;
    var safe = function (s) { return (ES && ES.safeName) ? ES.safeName(s) : String(s || 'is').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-') || 'is'; };
    var resolved = targets.map(_workRenderTarget).filter(Boolean);
    if (!resolved.length) { if (typeof showToast === 'function') showToast('No work found to export'); return; }
    if (typeof showToast === 'function') showToast(resolved.length + ' exporting work…');

    Promise.all(resolved.map(_renderWork)).then(function (items) {
      items = items.filter(function (it) { return it && it.url; });
      if (!items.length) { if (typeof showToast === 'function') showToast('Render failed'); return; }
      if (items.length === 1 || typeof JSZip === 'undefined') {
        items.forEach(function (it) { if (ES && ES.downloadDataURL) ES.downloadDataURL(it.url, safe(it.label) + '.png'); });
        if (typeof showToast === 'function') showToast(items.length + ' work downloaded');
        return;
      }
      var zip = new JSZip(), used = {};
      items.forEach(function (it, i) { var nm = safe(it.label); if (used[nm]) nm += '-' + (i + 1); used[nm] = 1; zip.file(nm + '.png', it.url.split(',')[1], { base64: true }); });
      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        if (ES && ES.downloadBlob) ES.downloadBlob(blob, 'calismalar-export.zip');
        if (typeof showToast === 'function') showToast(items.length + ' work downloaded as ZIP');
      });
    });
  }

  // ── public ──
  function open() {
    _build();
    _filter = { types: [], tags: [], smart: null, search: '', tagMode: 'all', tagNot: false, archived: false, orient: 'all', size: 'all', color: 'all' }; _sel = {}; _sort = 'edited'; _view = 'grid'; _group = 'none'; _scope = 'project';
    if (_searchEl) _searchEl.value = ''; if (_sortEl) _sortEl.value = 'edited';
    var _sbs = _panel.querySelectorAll('.ccwb-scopebtn'); for (var si = 0; si < _sbs.length; si++) _sbs[si].classList.toggle('on', _sbs[si].getAttribute('data-scope') === 'project');
    var _bts = _panel.querySelectorAll('.ccwb-vbtn'); for (var bi = 0; bi < _bts.length; bi++) _bts[bi].classList.toggle('on', _bts[bi].getAttribute('data-view') === 'grid');
    if (_compareEl) _compareEl.classList.remove('show');
    _render();
    _overlay.classList.add('show'); _open = true;
    document.addEventListener('keydown', _onKey, true);
    if (!_unsub && global.cc && cc.on) _unsub = cc.on('tags:changed', function () { if (_open) { _renderFacets(); _renderGrid(); } });
  }
  function close() { if (_overlay) _overlay.classList.remove('show'); document.removeEventListener('keydown', _onKey, true); _open = false; }
  function isOpen() { return _open; }

  global.CCWorksBrowser = { open: open, close: close, isOpen: isOpen };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'works-browser', parent: 'shared', title: 'shared: works-browser', mount: function () {}, unmount: function () {} });
  }
})(window);
