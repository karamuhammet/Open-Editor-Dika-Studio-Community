/* ============================================================
   dika studio module: canvas/page-preview — the MULTI-PAGE PREVIEW overlay (owner: "yazılımızın büyük
   özelliği … toplu önizleme … filtreleme aracı"). The full-screen #split-preview-wrap grid that shows
   every page with Search + Group/Size/Orientation/Colour filters, opened by the page-tabs "Preview"
   button (core/pages.js) + switchFace("split"). Flat module so enableSplitMode/disableSplitMode stay
   window globals (pages/autosave/view call them, all typeof-guarded). splitMode flag stays in app.js §1.
   NOTE: the old business-card front+back dual-canvas (backCanvas) was removed (Faz 8) — this is the
   live, kept feature, just relocated out of app.js §7 into its own fault-isolated module.
   ============================================================ */

function enableSplitMode() {
  var oldPreview = document.getElementById('split-preview-wrap');
  if (oldPreview) oldPreview.remove();
  var area = document.getElementById('canvas-area');
  if (area) {
    area.querySelectorAll('.split-note').forEach(function (n) { n.remove(); });
  }
  document.querySelectorAll('.split-label').forEach(function (l) { l.remove(); });

  if (typeof saveCurrentPage === 'function') saveCurrentPage();
  splitMode = true;

  if (area) area.classList.add('split-mode');

  var container = document.getElementById('card-stage-container');
  if (container) container.style.display = 'none';

  var zoomPill = document.querySelector('.zoom-pill');
  if (zoomPill) zoomPill.style.display = 'none';

  // Scene/infinite floating toolbar (#sc-toolbar, z-index 120) would otherwise paint on top of
  // the preview overlay (z-index 10) and hide its own controls. Hide it while preview is open
  // (mirrors the .zoom-pill / #card-stage-container hide above); restored in disableSplitMode.
  // Purely visual display toggle - does not touch SceneEditor state or the toolbar's .show class.
  var scToolbar = document.getElementById('sc-toolbar');
  if (scToolbar) scToolbar.style.display = 'none';

  /* The VIDEO timeline (#ve-timeline-host) is a sibling inside #canvas-area and paints over the
     preview, so opening the preview from a video page showed the track list on top of the grid
     (owner 2026-08-06). Its own inline display is REMEMBERED rather than blanked: the video editor
     drives that value ('none' when no video page is active), so restoring '' would show a timeline
     that should be hidden. */
  var veHost = document.getElementById('ve-timeline-host');
  if (veHost) {
    veHost._spPrevDisplay = veHost.style.display;
    veHost.style.display = 'none';
  }

  var gi = function (n, s) { return (typeof getIcon === 'function') ? getIcon(n, s || 14) : ''; };

  var previewWrap = document.createElement('div');
  previewWrap.id = 'split-preview-wrap';
  previewWrap.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;position:absolute;inset:0;z-index:10;background:var(--bg);';

  var pageList = (typeof pages !== 'undefined' && pages.length) ? pages : [{ json: canvas.toJSON(CUSTOM_PROPS), bg: canvas.backgroundColor, label: 'Page 1' }];

  /* ── helpers for custom dropdowns ── */
  var _openDrop = null;
  function closeDrop() { if (_openDrop) { _openDrop.classList.remove('open'); _openDrop = null; } }
  document.addEventListener('click', closeDrop, true);
  window._spCloseDropHandler = closeDrop;

  function makeCustomDropdown(label, options, onChange) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';

    var trigger = document.createElement('button');
    trigger.className = 'sp-drop-trigger';
    trigger.innerHTML = '<span class="sp-drop-label">' + label + '</span><span class="sp-drop-arrow">\u25BE</span>';
    wrap.appendChild(trigger);

    var menu = document.createElement('div');
    menu.className = 'sp-drop-menu';
    options.forEach(function (opt) {
      var item = document.createElement('div');
      item.className = 'sp-drop-item' + (opt.active ? ' active' : '');
      item.dataset.value = opt.value;
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '6px';
      if (opt.icon) {
        var icoSpan = document.createElement('span');
        icoSpan.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
        icoSpan.innerHTML = opt.icon;
        item.appendChild(icoSpan);
      }
      if (opt.color) {
        var dot = document.createElement('span');
        dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + opt.color + ';flex-shrink:0;';
        item.appendChild(dot);
      }
      item.appendChild(document.createTextNode(opt.text));
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.querySelectorAll('.sp-drop-item').forEach(function (el) { el.classList.remove('active'); });
        item.classList.add('active');
        trigger.querySelector('.sp-drop-label').textContent = opt.text;
        closeDrop();
        onChange(opt.value);
      });
      menu.appendChild(item);
    });
    wrap.appendChild(menu);

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_openDrop === menu) { closeDrop(); return; }
      closeDrop();
      menu.classList.add('open');
      _openDrop = menu;
    });

    return wrap;
  }

  /* ═══════════════════ SELECTION STATE ═══════════════════ */
  var _spSelected = {};
  var _spSelMode = false;

  function spUpdateSelUI() {
    var count = Object.keys(_spSelected).length;
    _spSelMode = count > 0;
    selBar.style.display = _spSelMode ? 'flex' : 'none';
    selCount.textContent = count + ' selected';
    pageCards.forEach(function (card) {
      var cb = card.el.querySelector('.sp-card-cb');
      if (_spSelected[card.idx]) {
        card.el.classList.add('sp-selected');
        if (cb) cb.classList.add('checked');
      } else {
        card.el.classList.remove('sp-selected');
        if (cb) cb.classList.remove('checked');
      }
    });
  }

  function spToggle(idx) {
    if (_spSelected[idx]) delete _spSelected[idx];
    else _spSelected[idx] = true;
    spUpdateSelUI();
  }

  function spSelectAll() {
    pageCards.forEach(function (card) {
      if (card.el.style.display !== 'none') _spSelected[card.idx] = true;
    });
    spUpdateSelUI();
  }

  function spDeselectAll() {
    _spSelected = {};
    spUpdateSelUI();
  }

  function spDeleteSelected() {
    var sel = Object.keys(_spSelected).map(Number).sort(function (a, b) { return b - a; });
    if (!sel.length) return;
    if (sel.length >= pages.length) {
      if (typeof showToast === 'function') showToast('Cannot delete all pages');
      return;
    }
    sel.forEach(function (idx) {
      if (typeof removePage === 'function' && pages.length > 1) removePage(idx);
    });
    _spSelected = {};
    if (typeof disableSplitMode === 'function') disableSplitMode();
    enableSplitMode();
  }

  function spMoveToGroup(groupId) {
    var sel = Object.keys(_spSelected).map(Number);
    sel.forEach(function (idx) {
      if (pages[idx]) pages[idx].groupId = groupId || null;
    });
    _spSelected = {};
    if (typeof renderPageTabs === 'function') renderPageTabs();
    if (typeof disableSplitMode === 'function') disableSplitMode();
    enableSplitMode();
  }

  /* ═══════════════════ TOP TOOLBAR ═══════════════════ */
  var toolbar = document.createElement('div');
  toolbar.className = 'sp-toolbar';

  // Search
  var searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'position:relative;display:flex;align-items:center;';
  var searchIcon = document.createElement('span');
  searchIcon.style.cssText = 'position:absolute;left:8px;color:var(--text-faint);pointer-events:none;display:flex;';
  searchIcon.innerHTML = gi('search', 12);
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search pages\u2026';
  searchInput.className = 'sp-search';
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);

  // Filter values
  var _fGroup = 'all', _fSize = 'all', _fOrient = 'all', _fColor = 'all', _fMode = 'all';

  // page mode (matches the page-tab mode glyphs): single(Page) / scene(Infinite) / slide / video / board
  function _pageMode(p) {
    if (!p) return 'single';
    if (p._isBoard) return 'board';
    var t = p._productType;
    if (t === 'scene') return 'scene';
    if (t === 'slide') return 'slide';
    if (t === 'video') return 'video';
    return 'single';
  }

  // Color buckets for dominant-color filter
  var _colorBuckets = [
    { name: 'Red',    hex: '#e74c3c', h: [345, 15] },
    { name: 'Orange', hex: '#e67e22', h: [15, 40] },
    { name: 'Yellow', hex: '#f1c40f', h: [40, 65] },
    { name: 'Green',  hex: '#2ecc71', h: [65, 170] },
    { name: 'Cyan',   hex: '#00bcd4', h: [170, 200] },
    { name: 'Blue',   hex: '#3498db', h: [200, 260] },
    { name: 'Purple', hex: '#9b59b6', h: [260, 300] },
    { name: 'Pink',   hex: '#e91e8b', h: [300, 345] },
    { name: 'Dark',   hex: '#2c2c2c', h: null, lMax: 20 },
    { name: 'Light',  hex: '#f0f0f0', h: null, lMin: 80 }
  ];

  function extractDominantColor(cvs) {
    var w = cvs.width, h = cvs.height;
    if (!w || !h) return 'none';
    var ctx = cvs.getContext('2d');
    var step = Math.max(1, Math.floor(Math.sqrt(w * h) / 16));
    var data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return 'none'; }
    var rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (var i = 0; i < data.length; i += step * 4) {
      var a = data[i + 3];
      if (a < 128) continue;
      rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++;
    }
    if (!count) return 'none';
    var r = rSum / count, g = gSum / count, b = bSum / count;
    // RGB → HSL
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var hue = 0, sat = 0, lum = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) hue = ((b - r) / d + 2) * 60;
      else hue = ((r - g) / d + 4) * 60;
    }
    lum *= 100; sat *= 100;
    if (sat < 8) return lum < 20 ? 'Dark' : (lum > 80 ? 'Light' : 'none');
    if (lum < 15) return 'Dark';
    if (lum > 88) return 'Light';
    for (var ci = 0; ci < _colorBuckets.length; ci++) {
      var b2 = _colorBuckets[ci];
      if (!b2.h) continue;
      if (b2.h[0] > b2.h[1]) { if (hue >= b2.h[0] || hue < b2.h[1]) return b2.name; }
      else { if (hue >= b2.h[0] && hue < b2.h[1]) return b2.name; }
    }
    return 'none';
  }

  // Group dropdown
  var groupOpts = [{ value: 'all', text: 'All Groups', active: true }, { value: 'ungrouped', text: 'Ungrouped' }];
  if (typeof pageGroups !== 'undefined' && pageGroups.length) {
    pageGroups.forEach(function (g) {
      groupOpts.push({ value: g.id, text: g.name || g.id, color: g.color });
    });
  }
  var groupDrop = makeCustomDropdown('All Groups', groupOpts, function (v) { _fGroup = v; applyFilters(); });

  // Size dropdown
  var sizeMap = {};
  pageList.forEach(function (p) {
    var w = p.w || CW; var h = p.h || CH;
    sizeMap[w + '\u00d7' + h] = true;
  });
  var sizeOpts = [{ value: 'all', text: 'All Sizes', active: true }];
  Object.keys(sizeMap).sort().forEach(function (k) { sizeOpts.push({ value: k, text: k }); });
  var sizeDrop = makeCustomDropdown('All Sizes', sizeOpts, function (v) { _fSize = v; applyFilters(); });

  // Orientation dropdown
  var _orientIcoL = '<svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"><rect x=".75" y=".75" width="12.5" height="8.5" rx="2"/></svg>';
  var _orientIcoP = '<svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x=".75" y=".75" width="8.5" height="12.5" rx="2"/></svg>';
  var _orientIcoS = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x=".75" y=".75" width="10.5" height="10.5" rx="2"/></svg>';
  var orientOpts = [
    { value: 'all', text: 'All Orientations', active: true },
    { value: 'landscape', text: 'Landscape', icon: _orientIcoL },
    { value: 'portrait', text: 'Portrait', icon: _orientIcoP },
    { value: 'square', text: 'Square', icon: _orientIcoS }
  ];
  var orientDrop = makeCustomDropdown('All Orientations', orientOpts, function (v) { _fOrient = v; applyFilters(); });

  // Page-mode dropdown — icons match the page-tab mode glyphs; only modes actually present are listed.
  var _MODE_META = { single: { t: 'Page', i: 'file' }, scene: { t: 'Infinite', i: 'layout-grid' }, slide: { t: 'Slide', i: 'presentation' }, video: { t: 'Video', i: 'video' }, board: { t: 'Board', i: 'square-dashed' } };
  var _modePresent = {};
  pageList.forEach(function (p) { _modePresent[_pageMode(p)] = true; });
  var modeOpts = [{ value: 'all', text: 'All Modes', active: true }];
  ['single', 'scene', 'slide', 'video', 'board'].forEach(function (m) {
    if (_modePresent[m]) modeOpts.push({ value: m, text: _MODE_META[m].t, icon: gi(_MODE_META[m].i, 14) });
  });
  var modeDrop = makeCustomDropdown('All Modes', modeOpts, function (v) { _fMode = v; applyFilters(); });

  // Color dropdown (initially only "All Colors"; rebuilt after thumbnails render)
  var _colorAllIcon = '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  var colorDrop = makeCustomDropdown('All Colors', [{ value: 'all', text: 'All Colors', active: true, icon: _colorAllIcon }], function (v) { _fColor = v; applyFilters(); });

  /* ── Grid density: 3 / 6 / 9 per row (owner 2026-08-06) ──────────────────────────────────────
     The grid used to be flex-wrap with every card sized from its own page, so a long page name
     widened its card and the rows went ragged. It is a real CSS grid now: N fixed columns, one
     uniform tile per page, the name clipped to the card's width. The choice is remembered. */
  var gridWrap;                 // built in the PAGE GRID section below; applyCols only runs on click
  var SP_COLS_KEY = 'dika_previewCols';
  var _spCols = 6;
  try {
    var _savedCols = parseInt(localStorage.getItem(SP_COLS_KEY), 10);
    if (_savedCols === 3 || _savedCols === 6 || _savedCols === 9) _spCols = _savedCols;
  } catch (e) {}
  function _colsIcon(n) {
    var cells = '', per = n === 3 ? 2 : (n === 6 ? 3 : 4), s = 12 / per;
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < per; c++) {
        cells += '<rect x="' + (c * s + 0.6) + '" y="' + (r * 6 + 0.6) + '" width="' + (s - 1.2) + '" height="' + (6 - 1.2) + '" rx="0.8"/>';
      }
    }
    return '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">' + cells + '</svg>';
  }
  var colsOpts = [3, 6, 9].map(function (n) {
    return { value: String(n), text: n + ' per row', icon: _colsIcon(n), active: n === _spCols };
  });
  function applyCols(n) {
    _spCols = n;
    try { localStorage.setItem(SP_COLS_KEY, String(n)); } catch (e) {}
    gridWrap.className = 'sp-grid sp-cols-' + n;
    gridWrap.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
  }
  var colsDrop = makeCustomDropdown(_spCols + ' per row', colsOpts, function (v) { applyCols(parseInt(v, 10)); });

  var _thumbRenderDone = 0;
  var _thumbRenderTotal = 0;

  function rebuildColorDropdown() {
    var detected = {};
    pageCards.forEach(function (c) { var dc = c.el.dataset.domColor; if (dc) detected[dc] = true; });
    var menu = colorDrop.querySelector('.sp-drop-menu');
    if (!menu) return;
    menu.innerHTML = '';
    // "All Colors" option
    var allItem = document.createElement('div');
    allItem.className = 'sp-drop-item' + (_fColor === 'all' ? ' active' : '');
    allItem.dataset.value = 'all';
    allItem.style.cssText = 'display:flex;align-items:center;gap:6px;';
    var allIco = document.createElement('span');
    allIco.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
    allIco.innerHTML = _colorAllIcon;
    allItem.appendChild(allIco);
    allItem.appendChild(document.createTextNode('All Colors'));
    allItem.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.querySelectorAll('.sp-drop-item').forEach(function (el) { el.classList.remove('active'); });
      allItem.classList.add('active');
      colorDrop.querySelector('.sp-drop-label').textContent = 'All Colors';
      closeDrop();
      _fColor = 'all'; applyFilters();
    });
    menu.appendChild(allItem);
    // Only buckets that exist
    _colorBuckets.forEach(function (b) {
      if (!detected[b.name]) return;
      var item = document.createElement('div');
      item.className = 'sp-drop-item' + (_fColor === b.name ? ' active' : '');
      item.dataset.value = b.name;
      item.style.cssText = 'display:flex;align-items:center;gap:6px;';
      var ico = document.createElement('span');
      ico.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
      ico.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="' + b.hex + '"/></svg>';
      item.appendChild(ico);
      item.appendChild(document.createTextNode(b.name));
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.querySelectorAll('.sp-drop-item').forEach(function (el) { el.classList.remove('active'); });
        item.classList.add('active');
        colorDrop.querySelector('.sp-drop-label').textContent = b.name;
        closeDrop();
        _fColor = b.name; applyFilters();
      });
      menu.appendChild(item);
    });
    // If current filter no longer exists in detected, reset to 'all'
    if (_fColor !== 'all' && !detected[_fColor]) {
      _fColor = 'all';
      colorDrop.querySelector('.sp-drop-label').textContent = 'All Colors';
      applyFilters();
    }
  }

  // Floating selection bar (hidden by default)
  var selBar = document.createElement('div');
  selBar.className = 'sp-sel-bar';
  selBar.style.display = 'none';

  var selCount = document.createElement('span');
  selCount.className = 'sp-sel-count';

  var btnSelAll = document.createElement('button');
  btnSelAll.className = 'sp-bulk-btn';
  btnSelAll.title = 'Select all visible';
  btnSelAll.innerHTML = gi('check', 16);
  btnSelAll.onclick = spSelectAll;

  var btnDesel = document.createElement('button');
  btnDesel.className = 'sp-bulk-btn';
  btnDesel.title = 'Deselect all';
  btnDesel.innerHTML = gi('close', 16);
  btnDesel.onclick = spDeselectAll;

  // Divider
  var selDivider = document.createElement('span');
  selDivider.className = 'sp-sel-divider';

  // Move to group dropdown
  var moveWrap = document.createElement('div');
  moveWrap.style.cssText = 'position:relative;';
  var moveBtn = document.createElement('button');
  moveBtn.className = 'sp-bulk-btn';
  moveBtn.title = 'Move to group';
  moveBtn.innerHTML = gi('move', 16);
  var moveMenu = document.createElement('div');
  moveMenu.className = 'sp-drop-menu';
  var removeOpt = document.createElement('div');
  removeOpt.className = 'sp-drop-item';
  removeOpt.textContent = 'Remove from group';
  removeOpt.addEventListener('click', function (e) { e.stopPropagation(); closeDrop(); spMoveToGroup(null); });
  moveMenu.appendChild(removeOpt);
  if (typeof pageGroups !== 'undefined' && pageGroups.length) {
    pageGroups.forEach(function (g) {
      var item = document.createElement('div');
      item.className = 'sp-drop-item';
      item.style.cssText = 'display:flex;align-items:center;gap:6px;';
      var dot = document.createElement('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + (g.color || '#888') + ';flex-shrink:0;';
      item.appendChild(dot);
      item.appendChild(document.createTextNode(g.name || g.id));
      item.addEventListener('click', function (e) { e.stopPropagation(); closeDrop(); spMoveToGroup(g.id); });
      moveMenu.appendChild(item);
    });
  }
  moveWrap.appendChild(moveBtn);
  moveWrap.appendChild(moveMenu);
  moveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (_openDrop === moveMenu) { closeDrop(); return; }
    closeDrop();
    moveMenu.classList.add('open');
    _openDrop = moveMenu;
  });

  var btnDel = document.createElement('button');
  btnDel.className = 'sp-bulk-btn danger';
  btnDel.title = 'Delete selected pages';
  btnDel.innerHTML = gi('trash', 16);
  btnDel.onclick = function () {
    var cnt = Object.keys(_spSelected).length;
    if (typeof showCustomConfirm === 'function') {
      showCustomConfirm(cnt + ' page will be deleted. Are you sure?', function () { spDeleteSelected(); });
    } else {
      spDeleteSelected();
    }
  };

  selBar.appendChild(selCount);
  selBar.appendChild(btnSelAll);
  selBar.appendChild(btnDesel);
  selBar.appendChild(selDivider);
  selBar.appendChild(moveWrap);
  selBar.appendChild(btnDel);

  // Count badge
  var countBadge = document.createElement('span');
  countBadge.style.cssText = 'font-size:10px;color:var(--text-faint);white-space:nowrap;margin-left:auto;';

  toolbar.appendChild(searchWrap);
  toolbar.appendChild(modeDrop);
  toolbar.appendChild(groupDrop);
  toolbar.appendChild(sizeDrop);
  toolbar.appendChild(orientDrop);
  toolbar.appendChild(colorDrop);
  toolbar.appendChild(colsDrop);
  toolbar.appendChild(countBadge);
  previewWrap.appendChild(toolbar);
  previewWrap.appendChild(selBar);

  /* ═══════════════════ PAGE GRID ═══════════════════ */
  // Uniform tiles in N columns (see the density dropdown above). Sizes and the layout live in CSS
  // now; nothing here measures the viewport, so a long name can no longer push a card out of line.
  gridWrap = document.createElement('div');
  gridWrap.className = 'sp-grid sp-cols-' + _spCols;
  gridWrap.style.gridTemplateColumns = 'repeat(' + _spCols + ', minmax(0, 1fr))';

  var pageCards = [];
  var checkSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  _thumbRenderTotal = pageList.length;
  _thumbRenderDone = 0;

  pageList.forEach(function (page, idx) {
    var pw = (page.w || CW);
    var ph = (page.h || CH);

    var col = document.createElement('div');
    col.className = 'split-page-card';
    col.dataset.pageIdx = idx;
    col.dataset.pageLabel = (page.label || ('Page ' + (idx + 1))).toLowerCase();
    col.dataset.groupId = page.groupId || '';
    col.dataset.size = pw + '\u00d7' + ph;
    col.dataset.orient = pw > ph ? 'landscape' : (pw < ph ? 'portrait' : 'square');
    col.dataset.mode = _pageMode(page);

    /* Header row */
    var headerRow = document.createElement('div');
    headerRow.className = 'sp-card-header';

    if (page.groupId && typeof pageGroups !== 'undefined') {
      var grp = null;
      for (var gii = 0; gii < pageGroups.length; gii++) {
        if (pageGroups[gii].id === page.groupId) { grp = pageGroups[gii]; break; }
      }
      if (grp) {
        var badge = document.createElement('span');
        badge.className = 'sp-grp-badge';
        badge.style.background = grp.color || '#888';
        badge.textContent = grp.name || 'Group';
        headerRow.appendChild(badge);
      }
    }

    var label = document.createElement('div');
    label.className = 'split-label';
    label.textContent = page.label || ('Page ' + (idx + 1));
    label.title = 'Click to rename';

    (function (lbl, pageIdx) {
      lbl.addEventListener('click', function (e) {
        e.stopPropagation();
        var input = document.createElement('input');
        input.type = 'text';
        input.value = pages[pageIdx].label || ('Page ' + (pageIdx + 1));
        input.className = 'sp-rename-input';
        lbl.textContent = '';
        lbl.appendChild(input);
        input.focus();
        input.select();
        var finish = function () {
          var val = input.value.trim();
          if (val && val !== pages[pageIdx].label) {
            if (typeof renamePage === 'function') renamePage(pageIdx, val);
          }
          lbl.textContent = pages[pageIdx].label || ('Page ' + (pageIdx + 1));
          col.dataset.pageLabel = lbl.textContent.toLowerCase();
        };
        input.onblur = finish;
        input.onkeydown = function (ev) {
          if (ev.key === 'Enter') input.blur();
          if (ev.key === 'Escape') { lbl.textContent = pages[pageIdx].label || ('Page ' + (pageIdx + 1)); }
        };
      });
    })(label, idx);

    headerRow.appendChild(label);

    var sizeInfo = document.createElement('span');
    sizeInfo.className = 'sp-size-info';
    sizeInfo.textContent = pw + '\u00d7' + ph;
    headerRow.appendChild(sizeInfo);

    col.appendChild(headerRow);

    /* Thumbnail wrapper (for checkbox overlay) */
    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'sp-thumb-wrap';

    /* 3-dot menu button */
    var menuBtn = document.createElement('button');
    menuBtn.className = 'sp-card-menu-btn';
    menuBtn.title = 'Page options';
    menuBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
    (function (pageIdx, parentEl) {
      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        showCardContextMenu(e, pageIdx, parentEl);
      });
    })(idx, thumbWrap);
    thumbWrap.appendChild(menuBtn);

    /* Hidden overlay */
    if (page.hidden) {
      var hiddenOvr = document.createElement('div');
      hiddenOvr.className = 'sp-hidden-overlay';
      hiddenOvr.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      thumbWrap.appendChild(hiddenOvr);
      col.classList.add('sp-page-hidden');
    }

    var cbDiv = document.createElement('div');
    cbDiv.className = 'sp-card-cb';
    cbDiv.innerHTML = checkSvg;
    cbDiv.addEventListener('click', function (e) { e.stopPropagation(); spToggle(idx); });
    thumbWrap.appendChild(cbDiv);

    var imgCanvas = document.createElement('canvas');
    imgCanvas.width = pw;
    imgCanvas.height = ph;
    imgCanvas.className = 'sp-thumb';
    // No inline size: the tile is a fixed grid cell and CSS contains the canvas inside it, so a
    // 1080x1350 and a 1920x1080 page occupy the same box and the rows stay aligned.
    imgCanvas.title = 'Double-click to edit';

    (function (pageIdx) {
      imgCanvas.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        if (_spSelMode) { spDeselectAll(); return; }
        if (typeof disableSplitMode === 'function') disableSplitMode();
        if (typeof switchPage === 'function') switchPage(pageIdx);
      });
      imgCanvas.addEventListener('click', function (e) {
        if (_spSelMode) { e.stopPropagation(); spToggle(pageIdx); }
      });
    })(idx);

    thumbWrap.appendChild(imgCanvas);
    col.appendChild(thumbWrap);
    gridWrap.appendChild(col);

    pageCards.push({ el: col, idx: idx, canvas: imgCanvas });

    // Render thumbnail. Page-sleep v2: a slept page hydrates from IndexedDB first (async),
    // then renders; hot pages render directly.
    var pageData = page._slept ? null : page.json;
    var pageBg = page.bg || '#0d0d0d';
    if (idx === currentPageIndex && !pageData && !page._slept) {
      pageData = canvas.toJSON(CUSTOM_PROPS);
      pageBg = canvas.backgroundColor;
    }
    if (pageData || page._slept) {
      (function (card, fabricCanvas, pIdx) {
        var draw = function (json) {
          if (!json) { _thumbRenderDone++; if (_thumbRenderDone >= _thumbRenderTotal) rebuildColorDropdown(); return; }
          // Unified render core (core/render-part.js) draws the offscreen render straight onto the thumb canvas.
          renderPart({ kind: 'page', json: json, w: pw, h: ph, bg: pageBg }, { out: 'draw', drawTo: fabricCanvas }).then(function () {
            card.el.dataset.domColor = extractDominantColor(fabricCanvas);
            _thumbRenderDone++;
            if (_thumbRenderDone >= _thumbRenderTotal) rebuildColorDropdown();
          });
        };
        if (page._slept && typeof _psHydratePage === 'function') {
          _psHydratePage(pIdx, function () { draw(pages[pIdx] ? pages[pIdx].json : null); });
        } else {
          draw(pageData);
        }
      })(pageCards[pageCards.length - 1], imgCanvas, idx);
    } else {
      _thumbRenderDone++;
      if (_thumbRenderDone >= _thumbRenderTotal) rebuildColorDropdown();
    }
  });

  /* ═══════════════════ FILTER LOGIC ═══════════════════ */
  function applyFilters() {
    var q = searchInput.value.trim().toLowerCase();
    var visible = 0;

    pageCards.forEach(function (card) {
      var show = true;
      if (q && card.el.dataset.pageLabel.indexOf(q) === -1) show = false;
      if (_fGroup === 'ungrouped') { if (card.el.dataset.groupId) show = false; }
      else if (_fGroup !== 'all') { if (card.el.dataset.groupId !== _fGroup) show = false; }
      if (_fSize !== 'all' && card.el.dataset.size !== _fSize) show = false;
      if (_fOrient !== 'all' && card.el.dataset.orient !== _fOrient) show = false;
      if (_fMode !== 'all' && card.el.dataset.mode !== _fMode) show = false;
      if (_fColor !== 'all' && card.el.dataset.domColor !== _fColor) show = false;
      card.el.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    countBadge.textContent = visible + ' / ' + pageCards.length + ' pages';
  }

  searchInput.addEventListener('input', applyFilters);
  applyFilters();

  previewWrap.appendChild(gridWrap);

  // Double-click on empty grid area deselects all
  gridWrap.addEventListener('dblclick', function (e) {
    if (e.target === gridWrap && _spSelMode) spDeselectAll();
  });

  /* ═══════════════════ CONTEXT MENU ═══════════════════ */
  var _activeCtx = null;
  function closeCardContextMenu() {
    if (_activeCtx) { _activeCtx.remove(); _activeCtx = null; }
  }
  // scan-3000 H19: this handler leaked per split-preview open (its two named
  // siblings were removed in disableSplitMode, this one never was) and its
  // closure retained the full preview DOM incl. page thumbnails.
  var _spCtxCloseHandler = function () { closeCardContextMenu(); };
  document.addEventListener('click', _spCtxCloseHandler, true);
  window._spCtxCloseHandler = _spCtxCloseHandler;

  function showCardContextMenu(ev, pageIdx, parentEl) {
    closeCardContextMenu();
    var menu = document.createElement('div');
    menu.className = 'sp-ctx-menu';
    var isHidden = pages[pageIdx] && pages[pageIdx].hidden;

    var items = [
      { text: 'View page', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>', action: function () {
        if (typeof disableSplitMode === 'function') disableSplitMode();
        if (typeof switchPage === 'function') switchPage(pageIdx);
      }},
      { text: 'Duplicate page', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', action: function () {
        if (typeof duplicatePage === 'function') duplicatePage(pageIdx);
        if (typeof disableSplitMode === 'function') disableSplitMode();
        enableSplitMode();
      }},
      { text: 'Export page', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', action: function () {
        if (typeof ExportService !== 'undefined' && ExportService.exportPageAsImage) {
          ExportService.exportPageAsImage(pageIdx, 'png', 300);
        }
      }},
      { divider: true },
      { text: isHidden ? 'Show page' : 'Hide page', icon: isHidden
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
        action: function () {
          pages[pageIdx].hidden = !pages[pageIdx].hidden;
          if (typeof disableSplitMode === 'function') disableSplitMode();
          enableSplitMode();
        }},
      { text: 'Delete page', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', danger: true, action: function () {
        if (pages.length <= 1) return;
        showCustomConfirm('Are you sure you want to delete this page?', function () {
          if (typeof removePage === 'function') removePage(pageIdx);
          if (typeof disableSplitMode === 'function') disableSplitMode();
          enableSplitMode();
        });
      }}
    ];

    items.forEach(function (it) {
      if (it.divider) {
        var d = document.createElement('div');
        d.className = 'sp-ctx-divider';
        menu.appendChild(d);
        return;
      }
      var row = document.createElement('div');
      row.className = 'sp-ctx-item' + (it.danger ? ' sp-ctx-danger' : '');
      row.innerHTML = '<span class="sp-ctx-ico">' + it.icon + '</span><span>' + it.text + '</span>';
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        closeCardContextMenu();
        it.action();
      });
      menu.appendChild(row);
    });

    menu.style.position = 'fixed';
    menu.style.top = ev.clientY + 'px';
    menu.style.left = ev.clientX + 'px';
    menu.style.right = 'auto';
    menu.style.zIndex = '10000';
    document.body.appendChild(menu);
    _activeCtx = menu;

    // Position: ensure it stays within viewport
    requestAnimationFrame(function () {
      var rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        menu.style.left = Math.max(8, ev.clientX - rect.width) + 'px';
      }
      if (rect.bottom > window.innerHeight - 8) {
        menu.style.top = Math.max(8, ev.clientY - rect.height) + 'px';
      }
    });
  }

  var note = document.createElement('div');
  note.className = 'split-note';
  note.textContent = 'Double-click to edit \u2022 Click name to rename \u2022 Checkbox to select';
  note.style.cssText = 'width:100%;text-align:center;padding:8px;font-size:11px;color:var(--text-faint);flex-shrink:0;border-top:1px solid var(--border);';
  previewWrap.appendChild(note);

  area.appendChild(previewWrap);

  // ESC key: deselect or exit preview
  var _spKeyHandler = function (e) {
    if (e.key === 'Escape') {
      if (_spSelMode) { spDeselectAll(); }
      else { if (typeof disableSplitMode === 'function') disableSplitMode(); }
    }
  };
  document.addEventListener('keydown', _spKeyHandler);
  window._spKeyHandler = _spKeyHandler;

  var faceLabel = document.getElementById('canvas-face-label');
  if (faceLabel) faceLabel.style.display = 'none';

  if (typeof renderPageTabs === 'function') renderPageTabs();
}

function disableSplitMode() {
  splitMode = false;
  activeCanvasRef = null;

  // Clean up keyboard listener
  if (window._spKeyHandler) {
    document.removeEventListener('keydown', window._spKeyHandler);
    window._spKeyHandler = null;
  }

  // Clean up dropdown click-outside listener
  if (window._spCloseDropHandler) {
    document.removeEventListener('click', window._spCloseDropHandler, true);
    window._spCloseDropHandler = null;
  }

  // Clean up the context-menu close listener (scan-3000 H19)
  if (window._spCtxCloseHandler) {
    document.removeEventListener('click', window._spCtxCloseHandler, true);
    window._spCtxCloseHandler = null;
  }

  var area = document.getElementById('canvas-area');
  if (area) area.classList.remove('split-mode');

  var previewWrap = document.getElementById('split-preview-wrap');
  if (previewWrap) previewWrap.remove();

  if (area) {
    area.querySelectorAll('.split-note').forEach(function (n) { n.remove(); });
    area.querySelectorAll('.split-label').forEach(function (n) { n.remove(); });
  }
  document.querySelectorAll('.split-label').forEach(function (l) { l.remove(); });

  // Faz 8: dead dual-canvas teardown (backCanvas / #split-back-wrap / #card-stage-back) removed —
  // backCanvas was never created (the old business-card front+back side-by-side editor is retired).

  var container = document.getElementById('card-stage-container');
  if (container) container.style.display = '';

  var zoomPill = document.querySelector('.zoom-pill');
  if (zoomPill) zoomPill.style.display = '';

  // Restore the scene floating toolbar hidden in enableSplitMode. Setting display:'' hands
  // visibility back to its own .show class, so it only reappears if a scene page is still active.
  var scToolbar = document.getElementById('sc-toolbar');
  if (scToolbar) scToolbar.style.display = '';

  // Video timeline: hand back exactly the display the video editor had set (see enableSplitMode).
  var veHost = document.getElementById('ve-timeline-host');
  if (veHost && veHost._spPrevDisplay !== undefined) {
    veHost.style.display = veHost._spPrevDisplay;
    delete veHost._spPrevDisplay;
  }

  if (typeof updateCanvasLabel === 'function') updateCanvasLabel();
  if (typeof renderPageTabs === 'function') renderPageTabs();
  // Page-sleep: the preview grid hydrated many pages for thumbnails; re-evict to budget.
  if (typeof _psEvictIfNeeded === 'function') _psEvictIfNeeded();
}


// Register under the canvas group (fault isolation). No self-init: triggered by the Preview button.
if (window.cc && cc.modules) cc.modules.register({ id: 'page-preview', parent: 'canvas', title: 'Multi-page preview', mount: function () {}, unmount: function () {} });
