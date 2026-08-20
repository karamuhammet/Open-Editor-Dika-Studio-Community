/* gallery/browser/panel — panel shell + views — trash badge/view, refresh, prompt/icon-picker helpers, all/images drill, tool generator, search wiring. Split from gallery.js (approved plan). FLAT sub-module:
   functions stay window globals (the panel/each other call them at runtime). Registers under left-panel.gallery.browser. */


function _updateTrashBadge() {
  var btn = document.getElementById('gal-trash-header-btn');
  if (!btn) return;
  var count = galTrashCount();
  var badge = btn.querySelector('.gal-trash-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'gal-trash-badge';
      btn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = '';
  } else if (badge) {
    badge.style.display = 'none';
  }
}


/* ── Trash View ── */
function drillIntoTrash() {
  // Clear main gallery search to avoid stuck state
  var searchInput = document.getElementById('gal-search-input');
  if (searchInput) searchInput.value = '';

  var catView = document.getElementById('images-cat-view');
  var subView = document.getElementById('images-sub-view');
  var titleEl = document.getElementById('images-sub-title');
  var content = document.getElementById('images-sub-content');
  if (catView) catView.style.display = 'none';
  if (subView) subView.style.display = '';
  if (titleEl) titleEl.textContent = 'Trash';
  if (!content) return;
  content.innerHTML = '';

  var backBtn = document.getElementById('images-back-btn');
  if (backBtn) {
    backBtn.onclick = function() { renderImagesCategoryView(); };
  }

  var items = galTrashGetItems();
  var autoCleanDays = galTrashGetAutoCleanDays();

  // Info text
  var info = document.createElement('p');
  info.style.cssText = 'font-size:11px;color:var(--text-dim);margin:0 0 10px';
  info.textContent = 'Items are automatically deleted after ' + autoCleanDays + ' day' + (autoCleanDays > 1 ? 's' : '') + '.';
  content.appendChild(info);

  if (items.length > 0) {
    // Empty trash button
    var emptyBtn = document.createElement('button');
    emptyBtn.className = 'gal-trash-empty-btn';
    emptyBtn.textContent = 'Empty Trash (' + items.length + ')';
    emptyBtn.addEventListener('click', function() {
      if (confirm('Permanently delete all ' + items.length + ' items in trash?')) {
        galTrashEmpty();
        drillIntoTrash();
        _updateTrashBadge();
        if (typeof showToast === 'function') showToast('Trash emptied');
      }
    });
    content.appendChild(emptyBtn);

    var grid = document.createElement('div');
    grid.className = 'gal-image-grid';
    items.forEach(function(item, idx) {
      var cell = document.createElement('div');
      cell.className = 'gal-trash-cell';
      var daysAgo = Math.floor((Date.now() - item.deletedAt) / (1000*60*60*24));
      var timeLabel = daysAgo === 0 ? 'Today' : daysAgo + 'd ago';
      cell.innerHTML =
        '<img loading="lazy" decoding="async" style="width:100%;height:80px;object-fit:cover;border-radius:4px">' +
        '<span class="gallery-cell-name" style="font-size:10px;color:var(--text-faint)">' + timeLabel + '</span>' +
        '<button class="gal-trash-restore" title="Restore">↩</button>';
      cell.querySelector('img').src = (typeof _galThumbUrl === 'function') ? _galThumbUrl(item.dataUrl) : item.dataUrl;
      cell.querySelector('.gal-trash-restore').addEventListener('click', function(e) {
        e.stopPropagation();
        galTrashRestore(idx);
        drillIntoTrash();
        _updateTrashBadge();
        if (typeof showToast === 'function') showToast('Image restored to Recent');
      });
      grid.appendChild(cell);
    });
    content.appendChild(grid);
  } else {
    var empty = document.createElement('p');
    empty.className = 'gal-empty-msg';
    empty.textContent = 'Trash is empty.';
    content.appendChild(empty);
  }
}

/* Refresh whatever gallery view is currently visible (folder view or home) */
function _galRefreshCurrentView() {
  var subView = document.getElementById('images-sub-view');
  var catView = document.getElementById('images-cat-view');
  if (subView && subView.style.display !== 'none' && catView && catView.style.display === 'none') {
    var content = document.getElementById('images-sub-content');
    if (content && content.dataset.folderId) { drillIntoFolder(content.dataset.folderId); return; }
  }
  renderImagesCategoryView();
}

function _galScheduleRefresh() {
  clearTimeout(_galDropRefreshTimer);
  _galDropRefreshTimer = setTimeout(_galRefreshCurrentView, 500);
}


/* Reusable styled text-prompt modal (replaces native prompt() in the gallery flow) */
function _galPromptModal(opts) {
  opts = opts || {};
  var ov = document.createElement('div');
  ov.className = 'folder-create-overlay';
  ov.style.display = 'flex';
  var box = document.createElement('div');
  box.className = 'folder-create-box';
  box.style.width = '340px';
  box.innerHTML =
    '<button class="fc-close" type="button" aria-label="Close">&times;</button>' +
    '<div class="fc-title-text">' + _escHtml(opts.title || 'Rename') + '</div>' +
    '<input type="text" class="fc-name-input gal-prompt-input" maxlength="' + (opts.maxlength || 60) + '" placeholder="' + _escHtml(opts.placeholder || '') + '">' +
    '<div class="gal-prompt-actions">' +
      '<button type="button" class="gal-prompt-cancel">Cancel</button>' +
      '<button type="button" class="fc-create-btn gal-prompt-ok">' + _escHtml(opts.confirmText || 'Save') + '</button>' +
    '</div>';
  ov.appendChild(box);
  document.body.appendChild(ov);
  var input = box.querySelector('.gal-prompt-input');
  input.value = opts.value || '';
  setTimeout(function () { input.focus(); input.select(); }, 30);
  function close() { ov.remove(); }
  function submit() {
    var v = input.value.trim();
    if (!v) { input.focus(); return; }
    close();
    if (typeof opts.onConfirm === 'function') opts.onConfirm(v);
  }
  box.querySelector('.fc-close').onclick = close;
  box.querySelector('.gal-prompt-cancel').onclick = close;
  box.querySelector('.gal-prompt-ok').onclick = submit;
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') close();
  });
}


/* Primary button label with a leading icon (Create → plus, Save → check) */
function _galBtnLabel(text) {
  var icon = text === 'Save' ? 'check' : 'plus';
  return ((typeof getIcon === 'function') ? getIcon(icon, 15) : '') + '<span>' + _escHtml(text) + '</span>';
}


/* All Lucide icon names (kebab-case), cached */
function _allLucideIconNames() {
  if (window.__lucideNames) return window.__lucideNames;
  var out = [], seen = {};
  try {
    if (typeof lucide !== 'undefined' && lucide && lucide.icons) {
      Object.keys(lucide.icons).forEach(function (p) {
        var k = p.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        if (!seen[k]) { seen[k] = 1; out.push(k); }
      });
      out.sort();
    }
  } catch (e) {}
  window.__lucideNames = out;
  return out;
}

function _galIconPicker(host, current, onSelect) {
  if (!host) return;
  current = current || 'folder';
  host.style.cssText = 'position:relative;display:block;margin-bottom:16px';
  host.innerHTML = '';
  var ic = function (n, s) { return (typeof getIcon === 'function') ? getIcon(n, s) : ''; };

  var trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ipick-trigger';
  function paintTrigger() {
    trigger.innerHTML = '<span class="ipick-cur">' + ic(current, 17) + '</span><span class="ipick-label">' + current + '</span><span class="ipick-arr">' + ic('chevron-down', 15) + '</span>';
  }
  paintTrigger();
  host.appendChild(trigger);

  var pop = null;
  function outside(e) { if (pop && !pop.contains(e.target) && !trigger.contains(e.target)) close(); }
  function close() { if (pop) { pop.remove(); pop = null; trigger.classList.remove('open'); document.removeEventListener('mousedown', outside); } }
  function open() {
    if (pop) { close(); return; }
    trigger.classList.add('open');
    pop = document.createElement('div');
    pop.className = 'ipick-pop';
    pop.innerHTML = '<div class="ipick-search-wrap">' + ic('search', 14) + '<input type="text" class="ipick-search" placeholder="Search ' + _allLucideIconNames().length + ' icons…"></div><div class="ipick-grid"></div><div class="ipick-empty" style="display:none">No icons found</div>';
    host.appendChild(pop);
    var search = pop.querySelector('.ipick-search');
    var grid = pop.querySelector('.ipick-grid');
    var emptyEl = pop.querySelector('.ipick-empty');
    function paint(q) {
      q = (q || '').trim().toLowerCase();
      var names;
      if (!q) {
        var all = _allLucideIconNames();
        names = _GAL_ICON_FAVS.filter(function (n) { return all.indexOf(n) !== -1; });
        names = names.concat(all.filter(function (n) { return _GAL_ICON_FAVS.indexOf(n) === -1; })).slice(0, 140);
      } else {
        names = _allLucideIconNames().filter(function (n) { return n.indexOf(q) !== -1; }).slice(0, 140);
      }
      emptyEl.style.display = names.length ? 'none' : '';
      grid.innerHTML = names.map(function (n) {
        return '<button type="button" class="ipick-cell' + (n === current ? ' active' : '') + '" data-ic="' + n + '" title="' + n + '">' + ic(n, 18) + '</button>';
      }).join('');
    }
    paint('');
    search.addEventListener('input', function () { paint(search.value); });
    search.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ic]');
      if (!b) return;
      current = b.getAttribute('data-ic');
      paintTrigger();
      if (typeof onSelect === 'function') onSelect(current);
      close();
    });
    setTimeout(function () { search.focus(); }, 30);
    setTimeout(function () { document.addEventListener('mousedown', outside); }, 0);
  }
  trigger.addEventListener('click', function (e) { e.stopPropagation(); open(); });
  return { get: function () { return current; } };
}


function _refreshGalleryView(folderId) {
  var subView = document.getElementById('images-sub-view');
  var subTitle = document.getElementById('images-sub-title');
  if (subView && subView.style.display !== 'none') {
    var titleText = subTitle ? subTitle.textContent : '';
    if (titleText === 'All Images' || titleText === 'All Videos' || titleText === 'All Audio') {
      drillIntoAllGallery();
    } else if (folderId && folderId !== '__recent') {
      drillIntoFolder(folderId);
    } else {
      renderImagesCategoryView();
    }
  } else {
    renderImagesCategoryView();
  }
}


/* ── All Gallery view — shows every item from all folders + recent, filtered by media type ── */
function drillIntoAllGallery(searchQuery) {
  // Clear main gallery search when entering All Gallery manually
  if (!searchQuery) {
    var si = document.getElementById('gal-search-input');
    if (si) si.value = '';
  }
  var catView = document.getElementById('images-cat-view');
  var subView = document.getElementById('images-sub-view');
  var titleEl = document.getElementById('images-sub-title');
  var content = document.getElementById('images-sub-content');
  if (catView) catView.style.display = 'none';
  if (subView) subView.style.display = '';
  var mediaCat = _activeMediaCat || 'image';
  var labels = _galMediaLabels[mediaCat] || _galMediaLabels.image;
  if (titleEl) titleEl.textContent = labels.allTitle;
  if (!content) return;
  content.innerHTML = '';

  // Hide dynamically appended sections
  var extras = document.querySelectorAll('.gal-recent-section, .gal-image-grid[data-folder-id="__recent"], .gal-empty-msg, .gal-fixed-section, .gal-fixed-grid');
  extras.forEach(function(el) { el.style.display = 'none'; });

  var backBtn = document.getElementById('images-back-btn');
  if (backBtn) {
    backBtn.onclick = function() { renderImagesCategoryView(); };
  }

  var store = _galInit();
  var q = (searchQuery || '').toLowerCase();
  var totalShown = 0;
  var globalIdx = 0;

  // Filter folders by media type
  var catFolders = _galFilterFolders(store.folders, mediaCat);

  // ── Items from each folder ──
  catFolders.forEach(function(folder) {
    if (!folder.images || folder.images.length === 0) return;
    var matchingCells = [];
    folder.images.forEach(function(entry, idx) {
      var isVideo = (typeof entry === 'object' && entry !== null && entry.type === 'video');
      var isAudio = (typeof entry === 'object' && entry !== null && entry.type === 'audio');
      var dataUrl = isVideo ? (entry.poster || '') : (typeof entry === 'string' ? entry : '');
      var itemName = isVideo ? (entry.name || folder.name + ' — video ' + (idx + 1)) : (folder.name + ' — ' + labels.singular + ' ' + (idx + 1));
      if (q && itemName.toLowerCase().indexOf(q) === -1) return;
      if (isAudio) {
        var audioCell = _createGalleryAudioCell(entry, folder.id, idx);
        matchingCells.push(audioCell);
        return;
      }
      var cell = _createImageCell(dataUrl, folder.id, idx, itemName);
      if (isVideo) {
        _patchVideoCell(cell, entry, folder.id, idx);
        var badge = document.createElement('div');
        badge.className = 'gallery-cell-play-badge';
        badge.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>';
        cell.style.position = 'relative';
        cell.appendChild(badge);
      }
      matchingCells.push(cell);
    });
    if (matchingCells.length === 0) return;

    // Folder header
    var header = document.createElement('div');
    header.className = 'gal-section-header';
    var folderIcon = (typeof getIcon === 'function') ? getIcon(folder.icon || 'folder', 14) : '';
    header.innerHTML =
      '<span class="gal-section-title">' + folderIcon + ' ' + _escHtml(folder.name) + '</span>' +
      '<span class="gal-section-count">' + matchingCells.length + '</span>';
    content.appendChild(header);

    var imgGrid = document.createElement('div');
    imgGrid.className = 'gal-image-grid';
    matchingCells.forEach(function(cell) { imgGrid.appendChild(cell); });
    content.appendChild(imgGrid);
    totalShown += matchingCells.length;
  });

  // ── Recent items section (filtered by media type) ──
  var catRecent = _galFilterRecent(store.recent, mediaCat);
  if (catRecent.length > 0) {
    var recentCells = [];
    // Build index map to find original store.recent index for each filteredRecent entry
    var origIndices = [];
    var fi = 0;
    (store.recent || []).forEach(function(e, oi) {
      if (fi < catRecent.length && e === catRecent[fi]) {
        origIndices.push(oi);
        fi++;
      }
    });
    catRecent.forEach(function(entry, fIdx) {
      var origIdx = origIndices[fIdx] !== undefined ? origIndices[fIdx] : fIdx;
      var isVideo = (typeof entry === 'object' && entry.type === 'video');
      var isAudio = (typeof entry === 'object' && entry.type === 'audio');
      var dataUrl = isVideo ? (entry.poster || '') : (isAudio ? '' : entry);
      var itemName = isVideo ? (entry.name || 'Video ' + (fIdx + 1)) :
                     isAudio ? (entry.tags || entry.author || 'Audio ' + (fIdx + 1)) :
                     ('Recent — Image ' + (fIdx + 1));
      if (q && itemName.toLowerCase().indexOf(q) === -1) return;
      if (isAudio) {
        // Audio row with drag-drop, context menu, preview
        var audioCell = _createGalleryAudioCell(entry, '__recent', origIdx);
        recentCells.push(audioCell);
        return;
      }
      var cell = _createImageCell(dataUrl || '', '__recent', origIdx, itemName);
      if (isVideo) {
        _patchVideoCell(cell, entry, '__recent', origIdx);
        var badge = document.createElement('div');
        badge.className = 'gallery-cell-play-badge';
        badge.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>';
        cell.style.position = 'relative';
        cell.appendChild(badge);
      }
      recentCells.push(cell);
    });
    if (recentCells.length > 0) {
      var recHeader = document.createElement('div');
      recHeader.className = 'gal-section-header';
      recHeader.innerHTML =
        '<span class="gal-section-title">' + ((typeof getIcon === 'function') ? getIcon('clock', 14) : '') + ' ' + labels.recentTitle + '</span>' +
        '<span class="gal-section-count">' + recentCells.length + '</span>';
      content.appendChild(recHeader);

      var recGrid = document.createElement('div');
      recGrid.className = 'gal-image-grid';
      recentCells.forEach(function(cell) { recGrid.appendChild(cell); });
      content.appendChild(recGrid);
      totalShown += recentCells.length;
    }
  }

  if (totalShown === 0) {
    var empty = document.createElement('p');
    empty.className = 'gal-empty-msg';
    empty.textContent = q ? 'No ' + labels.plural + ' matching "' + q + '".' : 'No ' + labels.plural + ' in the library yet.';
    content.appendChild(empty);
  }

  // Re-apply the toolbar filters (density / sort / size) to the fresh grids.
  if (typeof _galApplyGridFilters === 'function') _galApplyGridFilters();
}


/* ── drillIntoImagesSub (kept for mockups/qrcode/gallery compat) ── */
function drillIntoImagesSub(subId, label) {
  if (subId === 'gallery') {
    // Show main gallery view with folders
    renderImagesCategoryView();
    return;
  }

  var catView = document.getElementById('images-cat-view');
  var subView = document.getElementById('images-sub-view');
  var titleEl = document.getElementById('images-sub-title');
  var content = document.getElementById('images-sub-content');
  if (catView) catView.style.display = 'none';
  if (subView) subView.style.display = '';
  if (titleEl) titleEl.textContent = label;
  if (!content) return;
  content.innerHTML = '';

  // Hide recent section
  var recentEls = document.querySelectorAll('.gal-recent-section, .gal-image-grid[data-folder-id="__recent"], .gal-empty-msg, .gal-fixed-section, .gal-fixed-grid');
  recentEls.forEach(function(el) { el.style.display = 'none'; });

  var backBtn = document.getElementById('images-back-btn');
  if (backBtn) {
    backBtn.onclick = function() { renderImagesCategoryView(); };
  }

  if (subId === 'mockups') {
    var mockupGrid = document.createElement('div');
    mockupGrid.id = 'mockup-grid';
    mockupGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';
    content.appendChild(mockupGrid);
    if (typeof initMockups === 'function') initMockups();
  }

  if (subId === 'barcode') {
    if (typeof renderBarcodeToolPanel === 'function') {
      renderBarcodeToolPanel(content);
    } else {
      content.innerHTML = '<p style="color:var(--text-dim)">Barcode tool not available.</p>';
    }
  }

  if (subId === 'qrcode') {
    if (typeof renderQrToolPanel === 'function') {
      renderQrToolPanel(content);
    } else {
      content.innerHTML = '<p style="color:var(--text-dim)">QR tool not available.</p>';
    }
  }
}

function openToolGenerator(subId, label) {
  var catsView = document.getElementById('tools-cats-view');
  var subView = document.getElementById('tools-sub-view');
  var titleEl = document.getElementById('tools-sub-title');
  var content = document.getElementById('tools-sub-content');
  if (!subView || !content) return;
  if (catsView) catsView.style.display = 'none';
  subView.style.display = '';
  if (titleEl) titleEl.textContent = label || 'Tool';
  content.innerHTML = '';
  if (subId === 'mockups') {
    var mockupGrid = document.createElement('div');
    mockupGrid.id = 'mockup-grid';
    mockupGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';
    content.appendChild(mockupGrid);
    if (typeof initMockups === 'function') initMockups();
  } else if (subId === 'barcode') {
    if (typeof renderBarcodeToolPanel === 'function') renderBarcodeToolPanel(content);
    else content.innerHTML = '<p style="color:var(--text-dim)">Barcode tool not available.</p>';
  } else if (subId === 'qrcode') {
    if (typeof renderQrToolPanel === 'function') renderQrToolPanel(content);
    else content.innerHTML = '<p style="color:var(--text-dim)">QR tool not available.</p>';
  }
}

function closeToolGenerator() {
  var catsView = document.getElementById('tools-cats-view');
  var subView = document.getElementById('tools-sub-view');
  var content = document.getElementById('tools-sub-content');
  if (subView) subView.style.display = 'none';
  if (catsView) catsView.style.display = '';
  if (content) content.innerHTML = '';
}


/* ══════════════════════════════════════════════════════════════════════════
   MEDIA TOOLBAR + FILTER MEGA-DROPDOWN (portal .cc-mediabar parity)
   Sort / density / size act on the currently-rendered flat grids. Marka + Etiketler
   join the same dropdown in Phase 5. The state is the single source that the render
   paths re-apply (see _galApplyGridFilters, called at the end of each grid render).
   ══════════════════════════════════════════════════════════════════════════ */
var _galFilterState = null;
var _galAllTags = [];
var _galAllBrands = [];
var _galFilterSourcesLoaded = false;

function _galLoadFilterState() {
  if (_galFilterState) return _galFilterState;
  // brands/tags are session-only + portal-specific: never persisted (a stale id in a
  // later/standalone session would filter invisibly). Only sort/density/size5 persist.
  var def = { sort: 'date', density: 'md', size5: false, aspect: 'all', brands: [], tags: [] };
  try {
    var s = JSON.parse(localStorage.getItem('gal_filter_state'));
    if (s) { def.sort = s.sort || 'date'; def.density = s.density || 'md'; def.size5 = !!s.size5; def.aspect = s.aspect || 'all'; }
  } catch (e) {}
  _galFilterState = def;
  return _galFilterState;
}
function _galSaveFilterState() {
  try {
    var st = _galFilterState || {};
    localStorage.setItem('gal_filter_state', JSON.stringify({ sort: st.sort, density: st.density, size5: st.size5, aspect: st.aspect }));
  } catch (e) {}
}
/* Load the org tag palette + brand sets once (portal-backed only) for the dropdown.
   Re-renders an open filter dropdown when they arrive (owner: "loadingli yukleme"). */
function _galLoadFilterSources() {
  if (_galFilterSourcesLoaded || !(window.CCAssets && CCAssets.active)) return;
  _galFilterSourcesLoaded = true;
  try {
    if (CCAssets.listTags) CCAssets.listTags().then(function (t) { _galAllTags = t || []; _galRefreshFilterSources(); });
    if (CCAssets.listBrands) CCAssets.listBrands().then(function (b) { _galAllBrands = b || []; _galRefreshFilterSources(); });
  } catch (e) {}
}
function _galRefreshFilterSources() {
  if (!document.getElementById('gal-filter-pop')) return;   // menu closed → nothing to refresh
  if (_galBrandSelect) _galBrandSelect.setItems(_galAllBrands.map(function (b) { return { v: b.id, t: b.name }; }), false);
  if (_galTagSelect) _galTagSelect.setItems(_galAllTags.map(function (t) { return { v: t.id, t: t.name }; }), false);
}
var _galBrandSelect = null, _galTagSelect = null;

/* ── Reusable COLLAPSED searchable dropdown — a trigger button that opens a floating
   panel holding the search box + a capped result list. The list lives INSIDE the opened
   dropdown (not inline), so 1000s of tags never bloat / crash the host panel. The panel is
   position:fixed (escapes any overflow clip) and positioned at the trigger.
   host = element to render into. opts: { items:[{v,t}], selected:[], single, maxShow=60,
   placeholder, emptyLabel, loading, onChange(selectedArr) }. ── */
function _galSearchSelect(host, opts) {
  opts = opts || {};
  var items = opts.items || [];
  var selected = (opts.selected || []).slice();
  var maxShow = opts.maxShow || 60;
  var single = !!opts.single;
  var loading = !!opts.loading;
  var open = false;

  host.classList.add('gal-dd');
  host.innerHTML =
    '<button type="button" class="gal-dd-trigger"><span class="gal-dd-label"></span>' +
      '<svg class="gal-dd-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>' +
    '<div class="gal-dd-panel" style="display:none">' +
      '<input type="text" class="gal-ss-search" placeholder="' + _escHtml(opts.placeholder || 'Search...') + '">' +
      '<div class="gal-ss-list"></div></div>';
  var trigger = host.querySelector('.gal-dd-trigger');
  var labelEl = host.querySelector('.gal-dd-label');
  var panel = host.querySelector('.gal-dd-panel');
  var search = host.querySelector('.gal-ss-search');
  var list = host.querySelector('.gal-ss-list');

  function paintLabel() {
    var txt;
    if (!selected.length) txt = opts.emptyLabel || 'Tumu';
    else if (single) { var it = items.filter(function (i) { return i.v === selected[0]; })[0]; txt = it ? it.t : (opts.emptyLabel || 'Secildi'); }
    else txt = selected.length + ' secili';
    labelEl.textContent = txt;
    trigger.classList.toggle('has-sel', !!selected.length);
  }
  function renderList() {
    if (loading) { list.innerHTML = '<div class="gal-ss-empty">Loading...</div>'; return; }
    var q = (search.value || '').trim().toLowerCase();
    var pool;
    if (q) pool = items.filter(function (it) { return (it.t || '').toLowerCase().indexOf(q) !== -1; });
    else {
      var sel = items.filter(function (it) { return selected.indexOf(it.v) !== -1; });
      var rest = items.filter(function (it) { return selected.indexOf(it.v) === -1; });
      pool = sel.concat(rest);
    }
    var total = pool.length, shown = pool.slice(0, maxShow), itype = single ? 'radio' : 'checkbox';
    var html = shown.map(function (it) {
      var ck = selected.indexOf(it.v) !== -1 ? ' checked' : '';
      return '<label class="gal-ss-row"><input type="' + itype + '" name="galss-' + (opts.name || 'x') + '" value="' + _escHtml(it.v) + '"' + ck + '> ' + _escHtml(it.t) + '</label>';
    }).join('');
    if (!shown.length) html = '<div class="gal-ss-empty">' + (q ? 'No result' : 'No record') + '</div>';
    else if (total > shown.length) html += '<div class="gal-ss-more">+' + (total - shown.length) + ' more - narrow by search</div>';
    list.innerHTML = html;
  }
  function place() {
    var r = trigger.getBoundingClientRect();
    panel.style.width = r.width + 'px';
    panel.style.left = r.left + 'px';
    var below = window.innerHeight - r.bottom;
    if (below < 240 && r.top > below) { panel.style.top = 'auto'; panel.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
    else { panel.style.bottom = 'auto'; panel.style.top = (r.bottom + 4) + 'px'; }
  }
  function openDD() { if (open) return; open = true; panel.style.display = ''; trigger.classList.add('open'); place(); renderList(); setTimeout(function () { try { search.focus(); } catch (e) {} }, 30); }
  function closeDD() { if (!open) return; open = false; panel.style.display = 'none'; trigger.classList.remove('open'); }

  trigger.addEventListener('click', function (e) { e.stopPropagation(); if (open) closeDD(); else openDD(); });
  search.addEventListener('input', renderList);
  search.addEventListener('click', function (e) { e.stopPropagation(); });
  list.addEventListener('change', function (e) {
    var inp = e.target;
    if (!inp || (inp.type !== 'checkbox' && inp.type !== 'radio')) return;
    if (single) { selected = inp.checked ? [inp.value] : []; closeDD(); }
    else {
      var i = selected.indexOf(inp.value);
      if (inp.checked && i === -1) selected.push(inp.value);
      else if (!inp.checked && i !== -1) selected.splice(i, 1);
    }
    paintLabel();
    if (opts.onChange) opts.onChange(selected.slice());
  });
  // scan-3000 H17: these widgets are rebuilt on every popup open; the capture
  // listener leaked (with its detached DOM in the closure) each time. Self-
  // healing: once the host leaves the document, the next mousedown unhooks it.
  var _outside = function (e) {
    if (!document.body.contains(host)) { document.removeEventListener('mousedown', _outside, true); return; }
    if (open && !host.contains(e.target)) closeDD();
  };
  document.addEventListener('mousedown', _outside, true);
  paintLabel();

  return {
    setItems: function (newItems, resetSelected) { items = newItems || []; loading = false; if (resetSelected) selected = []; paintLabel(); if (open) renderList(); },
    getSelected: function () { return selected.slice(); },
    destroy: function () { document.removeEventListener('mousedown', _outside, true); }
  };
}

/* Re-apply density (section class) + sort (reorder) + size (class) to every flat grid. */
function _galApplyGridFilters() {
  var st = _galLoadFilterState();
  var section = document.querySelector('.flyout-section[data-section="images"]');
  if (!section) return;
  section.classList.remove('dens-sm', 'dens-md', 'dens-lg');
  section.classList.add('dens-' + (st.density || 'md'));

  var grids = section.querySelectorAll('.gal-image-grid');
  grids.forEach(function (grid) {
    var cells = Array.prototype.slice.call(grid.children).filter(function (c) {
      return c.classList && (c.classList.contains('gallery-cell') || c.classList.contains('gal-audio-card'));
    });
    // Size / brand / tag filters: one dedicated class so they AND-compose with the
    // search's inline display. brand + tag need portal asset metadata (_galAssetMeta);
    // cells without meta (video/audio/local) are left visible, not filtered out.
    var brandOn = st.brands && st.brands.length;
    var tagOn = st.tags && st.tags.length;
    var aspectOn = st.aspect && st.aspect !== 'all';
    cells.forEach(function (cell) {
      var hide = false;
      if (st.size5 && _galCellBytes(cell) < 5 * 1024 * 1024) hide = true;
      if (!hide && (brandOn || tagOn)) {
        var meta = _galCellMeta(cell);
        if (meta) {
          if (brandOn && st.brands.indexOf(meta.brand) === -1) hide = true;
          if (!hide && tagOn) {
            var any = false;
            for (var ti = 0; ti < st.tags.length; ti++) {
              if (meta.tags && meta.tags.indexOf(st.tags[ti]) !== -1) { any = true; break; }
            }
            if (!any) hide = true;
          }
        }
      }
      // Aspect (Kare / Dikey / Yatay): read the thumbnail's natural dims. If not loaded
      // yet, leave it visible and re-apply once it loads (bound once per img).
      if (!hide && aspectOn) {
        var im = cell.querySelector('img');
        if (im && im.naturalWidth && im.naturalHeight) {
          var ratio = im.naturalWidth / im.naturalHeight;
          var orient = ratio > 1.1 ? 'landscape' : (ratio < 0.9 ? 'portrait' : 'square');
          if (orient !== st.aspect) hide = true;
        } else if (im && !im._galAspectBound) {
          im._galAspectBound = true;
          im.addEventListener('load', function () { if (typeof _galApplyGridFilters === 'function') _galApplyGridFilters(); });
        }
      }
      cell.classList.toggle('gal-filter-hidden', hide);
    });
    // Sort: reorder in place. 'date' = store order (recency) = no reorder.
    if (st.sort === 'name' || st.sort === 'size') {
      cells.slice().sort(function (a, b) {
        if (st.sort === 'name') {
          var na = (a.querySelector('.gallery-cell-name') || {}).textContent || '';
          var nb = (b.querySelector('.gallery-cell-name') || {}).textContent || '';
          return na.localeCompare(nb);
        }
        return _galCellBytes(b) - _galCellBytes(a);
      }).forEach(function (c) { grid.appendChild(c); });
    }
  });
  _galUpdateFilterBadge();
}
function _galCellMeta(cell) {
  if (typeof _galAssetMeta === 'undefined') return null;
  var du = cell.dataset ? cell.dataset.dataUrl : '';
  return (du && _galAssetMeta[du]) ? _galAssetMeta[du] : null;
}
function _galCellBytes(cell) {
  var du = cell.dataset ? cell.dataset.dataUrl : '';
  if (typeof _galAssetMeta !== 'undefined' && du && _galAssetMeta[du] && _galAssetMeta[du].bytes) return _galAssetMeta[du].bytes;
  if (cell.dataset && cell.dataset.bytes) return parseInt(cell.dataset.bytes, 10) || 0;
  if (du && du.indexOf('data:') === 0) return Math.round(du.length * 3 / 4);
  return 0;
}
function _galUpdateFilterBadge() {
  var st = _galLoadFilterState();
  var n = (st.size5 ? 1 : 0) + (st.sort && st.sort !== 'date' ? 1 : 0) +
    (st.aspect && st.aspect !== 'all' ? 1 : 0) + (st.brands ? st.brands.length : 0) + (st.tags ? st.tags.length : 0);
  var badge = document.getElementById('gal-filter-badge');
  var btn = document.getElementById('gal-filter-btn');
  if (badge) { badge.textContent = n; badge.style.display = n ? '' : 'none'; }
  if (btn) btn.classList.toggle('is-active', n > 0);
}

/* Bind the toolbar (upload icon + filter button). Called on panel open. */
function _initMediaToolbar() {
  _galLoadFilterState();
  _galLoadFilterSources();
  var upBtn = document.getElementById('gal-upload-icon-btn');
  if (upBtn && !upBtn._bound) {
    upBtn._bound = true;
    upBtn.addEventListener('click', function () {
      var fi = document.getElementById('logo-file');
      if (fi) fi.click();
    });
  }
  var fBtn = document.getElementById('gal-filter-btn');
  if (fBtn && !fBtn._bound) {
    fBtn._bound = true;
    fBtn.addEventListener('click', function (e) { e.stopPropagation(); _toggleFilterMenu(); });
  }
  _galApplyGridFilters();
}

function _galFilterCloseMenu() {
  var pop = document.getElementById('gal-filter-pop');
  if (pop) pop.remove();
  _galBrandSelect = null; _galTagSelect = null;
  document.removeEventListener('click', _galFilterOutside, true);
  document.removeEventListener('keydown', _galFilterEsc, true);
}
function _galFilterOutside(e) {
  var pop = document.getElementById('gal-filter-pop');
  var btn = document.getElementById('gal-filter-btn');
  if (pop && !pop.contains(e.target) && (!btn || !btn.contains(e.target))) _galFilterCloseMenu();
}
function _galFilterEsc(e) { if (e.key === 'Escape') _galFilterCloseMenu(); }
function _toggleFilterMenu() {
  // Kendi barina sabitle: baska panellerde de .cc-filter-wrap var (or. Urunler paneli);
  // dokumandaki ilk eslesme yanlis panele popup takar.
  var wrap = document.querySelector('#gal-mediabar .cc-filter-wrap');
  if (!wrap) return;
  if (document.getElementById('gal-filter-pop')) { _galFilterCloseMenu(); return; }
  wrap.appendChild(_buildFilterMenu());
  setTimeout(function () {
    document.addEventListener('click', _galFilterOutside, true);
    document.addEventListener('keydown', _galFilterEsc, true);
  }, 0);
}
function _buildFilterMenu() {
  var st = _galLoadFilterState();
  var pop = document.createElement('div');
  pop.id = 'gal-filter-pop';
  pop.className = 'cc-filter-pop';
  function seg(label, name, opts) {
    var h = '<div class="cc-filter-sec"><div class="cc-filter-label">' + label + '</div><div class="cc-seg" data-seg="' + name + '">';
    opts.forEach(function (o) { h += '<button type="button" data-val="' + o.v + '"' + (st[name] === o.v ? ' class="active"' : '') + '>' + o.t + '</button>'; });
    return h + '</div></div>';
  }
  var portal = !!(window.CCAssets && CCAssets.active);
  var sourcesReady = _galFilterSourcesLoaded && (_galAllBrands.length || _galAllTags.length);

  pop.innerHTML =
    seg('Siralama', 'sort', [{ v: 'date', t: 'Date' }, { v: 'name', t: 'Name' }, { v: 'size', t: 'Size' }]) +
    seg('Gorunum', 'aspect', [{ v: 'all', t: 'Tumu' }, { v: 'square', t: 'Square' }, { v: 'portrait', t: 'Vertical' }, { v: 'landscape', t: 'Horizontal' }]) +
    seg('Thumbnail', 'density', [{ v: 'sm', t: 'Kucuk' }, { v: 'md', t: 'Medium' }, { v: 'lg', t: 'Buyuk' }]) +
    '<div class="cc-filter-sec"><div class="cc-filter-label">File size</div>' +
      '<label class="cc-fcheck"><input type="checkbox" id="gal-f-size5"' + (st.size5 ? ' checked' : '') + '> 5 MB and above</label></div>' +
    (portal ? '<div class="cc-filter-sec"><div class="cc-filter-label">Brand</div><div id="gal-f-brands-host" class="gal-ss"></div></div>' : '') +
    (portal ? '<div class="cc-filter-sec"><div class="cc-filter-label">Tags</div><div id="gal-f-tags-host" class="gal-ss"></div></div>' : '') +
    '<button type="button" class="cc-filter-clear" id="gal-f-clear">Clear filters</button>';

  pop.querySelectorAll('.cc-seg').forEach(function (sg) {
    sg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-val]');
      if (!b) return;
      _galFilterState[sg.dataset.seg] = b.dataset.val;
      sg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      _galSaveFilterState();
      _galApplyGridFilters();
    });
  });
  var sz = pop.querySelector('#gal-f-size5');
  if (sz) sz.addEventListener('change', function () { _galFilterState.size5 = sz.checked; _galSaveFilterState(); _galApplyGridFilters(); });

  // Searchable Marka + Etiketler (portal only) with a loading state until the palette arrives.
  _galBrandSelect = null; _galTagSelect = null;
  if (portal) {
    var bh = pop.querySelector('#gal-f-brands-host');
    var th = pop.querySelector('#gal-f-tags-host');
    if (bh) _galBrandSelect = _galSearchSelect(bh, {
      name: 'brands', placeholder: 'Search brand...', loading: !sourcesReady && !_galAllBrands.length,
      items: _galAllBrands.map(function (b) { return { v: b.id, t: b.name }; }), selected: _galFilterState.brands,
      onChange: function (sel) { _galFilterState.brands = sel; _galApplyGridFilters(); }
    });
    if (th) _galTagSelect = _galSearchSelect(th, {
      name: 'tags', placeholder: 'Search tag...', loading: !sourcesReady && !_galAllTags.length,
      items: _galAllTags.map(function (t) { return { v: t.id, t: t.name }; }), selected: _galFilterState.tags,
      onChange: function (sel) { _galFilterState.tags = sel; _galApplyGridFilters(); }
    });
  }

  var clr = pop.querySelector('#gal-f-clear');
  if (clr) clr.addEventListener('click', function () {
    _galFilterState = { sort: 'date', density: 'md', size5: false, aspect: 'all', brands: [], tags: [] };
    _galSaveFilterState();
    pop.querySelectorAll('.cc-seg').forEach(function (sg) {
      sg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x.dataset.val === _galFilterState[sg.dataset.seg]); });
    });
    var s5 = pop.querySelector('#gal-f-size5'); if (s5) s5.checked = false;
    if (_galBrandSelect) _galBrandSelect.setItems(_galAllBrands.map(function (b) { return { v: b.id, t: b.name }; }), true);
    if (_galTagSelect) _galTagSelect.setItems(_galAllTags.map(function (t) { return { v: t.id, t: t.name }; }), true);
    _galApplyGridFilters();
  });
  return pop;
}


/* ── Gallery Search ── */
function _initGallerySearch() {
  var input = document.getElementById('gal-search-input');
  if (!input || input._galSearchBound) return;
  input._galSearchBound = true;
  input.addEventListener('input', function() {
    var q = input.value.trim().toLowerCase();
    var grid = document.getElementById('img-cat-grid');
    if (!grid) return;
    // Show/hide folder cards based on search
    grid.querySelectorAll('.gal-folder-card, .gal-all-gallery-card').forEach(function(card) {
      var name = card.querySelector('.img-cat-name');
      if (!name) return;
      if (!q || name.textContent.toLowerCase().indexOf(q) !== -1) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
    // Show/hide image cells (recent section + all-gallery) by name
    var parent = grid.parentNode;
    if (parent) {
      parent.querySelectorAll('.gallery-cell').forEach(function(cell) {
        var nameEl = cell.querySelector('.gallery-cell-name');
        if (!nameEl) return;
        if (!q || nameEl.textContent.toLowerCase().indexOf(q) !== -1) {
          cell.style.display = '';
        } else {
          cell.style.display = 'none';
        }
      });
    }
    // If searching, auto-drill into All Gallery to show matching images
    if (q && q.length >= 2) {
      var subView = document.getElementById('images-sub-view');
      if (!subView || subView.style.display === 'none') {
        drillIntoAllGallery(q);
      } else {
        // Already in sub-view, filter there
        var content = document.getElementById('images-sub-content');
        if (content) {
          content.querySelectorAll('.gallery-cell').forEach(function(cell) {
            var nameEl = cell.querySelector('.gallery-cell-name');
            if (!nameEl) return;
            if (nameEl.textContent.toLowerCase().indexOf(q) !== -1) {
              cell.style.display = '';
            } else {
              cell.style.display = 'none';
            }
          });
        }
      }
    }
  });
}


if (window.cc && cc.modules) cc.modules.register({ id: 'panel', parent: 'left-panel.gallery.browser', title: 'Gallery: panel', mount: function(){}, unmount: function(){} });
