/* gallery/browser/selection — multi-select + bulk operations (enter/exit selection mode, toggle
   select, bulk delete / move-to-folder, the bulk bar UI). Split from gallery.js (approved plan). FLAT
   sub-module; selection state (_galSelectedItems/_galSelectionMode) moves here (selection-domain only,
   not shared with ve-media-gallery). Registers under left-panel.gallery.browser. */

/* ══════════════════════════════════════════════════════════════
   GALLERY SELECTION MODE
   ════════════════════════════════════════════════════════════ */
var _galSelectedItems = [];   // [{folderId, imgIdx, dataUrl}]
var _galSelectionMode = false;

function galEnterSelectionMode() {
  _galSelectionMode = true;
  _galSelectedItems = [];
  document.body.classList.add('gal-selection-mode');
  _galShowBulkBar();
  _galUpdateBulkCount();
  // Phase 6: bulk Etiketle + Marka only make sense in portal-backed mode (org assets).
  var portal = (typeof _galPortalBacked === 'function') && _galPortalBacked();
  ['gal-bulk-tag', 'gal-bulk-brand'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.style.display = portal ? '' : 'none';
  });
}

function galExitSelectionMode() {
  _galSelectionMode = false;
  _galSelectedItems = [];
  document.body.classList.remove('gal-selection-mode');
  document.querySelectorAll('.gallery-cell.gal-selected').forEach(function(el) {
    el.classList.remove('gal-selected');
  });
  _galHideBulkBar();
}

function galToggleSelectImage(cell, folderId, imgIdx, dataUrl) {
  var existing = _galSelectedItems.findIndex(function(item) {
    return item.folderId === folderId && item.imgIdx === imgIdx;
  });
  if (existing >= 0) {
    _galSelectedItems.splice(existing, 1);
    cell.classList.remove('gal-selected');
  } else {
    _galSelectedItems.push({ folderId: folderId, imgIdx: imgIdx, dataUrl: dataUrl });
    cell.classList.add('gal-selected');
  }
  _galUpdateBulkCount();
  // If no items selected, don't exit — keep the mode
}

function _galShowBulkBar() {
  var bar = document.getElementById('gal-bulk-bar');
  if (bar) bar.classList.add('show');
}

function _galHideBulkBar() {
  var bar = document.getElementById('gal-bulk-bar');
  if (bar) bar.classList.remove('show');
}

function _galUpdateBulkCount() {
  var el = document.getElementById('gal-bulk-count');
  if (el) el.textContent = _galSelectedItems.length + ' selected';
}

function galBulkDelete() {
  if (!_galSelectedItems.length) return;
  var urls = _galSelectedItems.map(function(it) { return it.dataUrl; });
  // Sort by idx descending to avoid index shifting
  var grouped = {};
  _galSelectedItems.forEach(function(item) {
    if (!grouped[item.folderId]) grouped[item.folderId] = [];
    grouped[item.folderId].push(item.imgIdx);
  });
  Object.keys(grouped).forEach(function(fid) {
    grouped[fid].sort(function(a, b) { return b - a; }); // descending
    grouped[fid].forEach(function(idx) {
      if (fid === '__recent') {
        galRemoveRecent(idx);
      } else {
        galRemoveImageFromFolder(fid, idx);
      }
    });
  });
  galTrashAddBulk(urls);
  galExitSelectionMode();
  _refreshGalleryView(null);
  if (typeof showToast === 'function') showToast(urls.length + ' image(s) moved to trash');
}

function galBulkMoveToFolder() {
  if (!_galSelectedItems.length) return;
  _openBulkMovePopup();
}

/* Phase 6: bulk Etiketle + Marka via the shared context-menu pickers (grid.js). */
function _galBulkTargets() {
  return _galSelectedItems
    .map(function(it) { return { id: (typeof _galEntryAssetId === 'function') ? _galEntryAssetId(it.dataUrl) : null, url: it.dataUrl }; })
    .filter(function(t) { return t.id; });
}
function galBulkTag(evt) {
  if (!_galSelectedItems.length) return;
  var targets = _galBulkTargets();
  if (!targets.length) { if (typeof showToast === 'function') showToast('Selected items are not cloud assets'); return; }
  if (typeof _galTagPickerPopup === 'function') _galTagPickerPopup(evt, targets);
}
function galBulkBrand(evt) {
  if (!_galSelectedItems.length) return;
  var targets = _galBulkTargets();
  if (!targets.length) { if (typeof showToast === 'function') showToast('Selected items are not cloud assets'); return; }
  if (typeof _galBrandPickerPopup === 'function') _galBrandPickerPopup(evt, targets);
}

function _openBulkMovePopup() {
  var existing = document.getElementById('gal-bulk-move-overlay');
  if (existing) existing.remove();

  var store = _galInit();
  var mediaCat = _activeMediaCat || 'image';
  var folders = _galFilterFolders(store.folders || [], mediaCat);
  var recentIds = store.recentFolderIds || [];

  var overlay = document.createElement('div');
  overlay.id = 'gal-bulk-move-overlay';
  overlay.className = 'gal-img-edit-overlay';
  overlay.style.display = 'flex';

  var box = document.createElement('div');
  box.className = 'gal-img-edit-box gal-move-box';
  box.style.maxWidth = '320px';

  // Track selected folder
  var selectedFolder = '__recent';

  // Title
  var title = document.createElement('div');
  title.className = 'gal-img-edit-title';
  title.textContent = 'Move to Folder';
  box.appendChild(title);

  // Custom select trigger
  var selectWrap = document.createElement('div');
  selectWrap.className = 'gal-move-select-wrap';

  var trigger = document.createElement('button');
  trigger.className = 'gal-move-trigger';
  trigger.type = 'button';
  var triggerIcon = (typeof getIcon === 'function') ? getIcon('clock', 14) : '';
  trigger.innerHTML = '<span class="gal-move-trigger-icon">' + triggerIcon + '</span>' +
    '<span class="gal-move-trigger-text">Recent Uploads</span>' +
    '<svg class="gal-move-trigger-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
  selectWrap.appendChild(trigger);

  // Dropdown panel
  var dropdown = document.createElement('div');
  dropdown.className = 'gal-move-dropdown';

  // Search input inside dropdown
  var searchWrap = document.createElement('div');
  searchWrap.className = 'gal-move-search-wrap';
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search folders...';
  searchInput.className = 'gal-move-search';
  searchWrap.appendChild(searchInput);
  dropdown.appendChild(searchWrap);

  // Folder list container
  var listWrap = document.createElement('div');
  listWrap.className = 'gal-move-list';

  function renderFolderList(query) {
    listWrap.innerHTML = '';
    var q = (query || '').toLowerCase();

    // "Recent Uploads" always first
    if (!q || 'recent uploads'.indexOf(q) !== -1) {
      var recentItem = _createMoveItem('__recent', 'Recent Uploads', 'clock', 0);
      if (selectedFolder === '__recent') recentItem.classList.add('active');
      listWrap.appendChild(recentItem);
    }

    // Recently used folders
    var recentFolders = [];
    recentIds.forEach(function(rid) {
      var f = folders.filter(function(ff) { return ff.id === rid; })[0];
      if (f && (!q || f.name.toLowerCase().indexOf(q) !== -1)) recentFolders.push(f);
    });
    if (recentFolders.length > 0) {
      var recLabel = document.createElement('div');
      recLabel.className = 'gal-move-section-label';
      recLabel.textContent = 'RECENTLY USED';
      listWrap.appendChild(recLabel);
      recentFolders.forEach(function(f) {
        var item = _createMoveItem(f.id, f.name, f.icon || 'folder', 0);
        if (selectedFolder === f.id) item.classList.add('active');
        listWrap.appendChild(item);
      });
    }

    // All folders (tree structure)
    var mainFolders = folders.filter(function(f) { return !f.parentId; });
    var hasMatch = false;
    mainFolders.forEach(function(f) {
      var match = !q || f.name.toLowerCase().indexOf(q) !== -1;
      var children = folders.filter(function(c) { return c.parentId === f.id; });
      var childMatch = children.some(function(c) { return c.name.toLowerCase().indexOf(q) !== -1; });
      if (match || childMatch) hasMatch = true;
    });

    if (hasMatch) {
      var allLabel = document.createElement('div');
      allLabel.className = 'gal-move-section-label';
      allLabel.textContent = 'ALL FOLDERS';
      listWrap.appendChild(allLabel);

      mainFolders.forEach(function(f) {
        var match = !q || f.name.toLowerCase().indexOf(q) !== -1;
        var children = folders.filter(function(c) { return c.parentId === f.id; });
        var childMatch = children.some(function(c) { return c.name.toLowerCase().indexOf(q) !== -1; });
        if (!match && !childMatch) return;

        if (match) {
          var item = _createMoveItem(f.id, f.name, f.icon || 'folder', 0);
          if (selectedFolder === f.id) item.classList.add('active');
          listWrap.appendChild(item);
        }

        children.forEach(function(child) {
          if (!q || child.name.toLowerCase().indexOf(q) !== -1) {
            var childItem = _createMoveItem(child.id, child.name, child.icon || 'folder', 1);
            if (selectedFolder === child.id) childItem.classList.add('active');
            listWrap.appendChild(childItem);
          }
        });
      });
    }
  }

  function _createMoveItem(id, name, icon, depth) {
    var item = document.createElement('button');
    item.className = 'gal-move-item';
    item.type = 'button';
    if (depth > 0) item.classList.add('gal-move-item-sub');
    var iconHtml = (typeof getIcon === 'function') ? getIcon(icon, 14) : '';
    var prefix = depth > 0 ? '<span class="gal-move-tree-line">└</span>' : '';
    item.innerHTML = prefix + '<span class="gal-move-item-icon">' + iconHtml + '</span>' +
      '<span class="gal-move-item-name">' + _escHtml(name) + '</span>';
    item.addEventListener('click', function() {
      selectedFolder = id;
      // Update trigger
      trigger.querySelector('.gal-move-trigger-icon').innerHTML = iconHtml;
      trigger.querySelector('.gal-move-trigger-text').textContent = name;
      // Update active state
      listWrap.querySelectorAll('.gal-move-item').forEach(function(el) { el.classList.remove('active'); });
      item.classList.add('active');
      // Close dropdown
      dropdown.classList.remove('open');
      selectWrap.classList.remove('open');
    });
    return item;
  }

  renderFolderList('');

  searchInput.addEventListener('input', function() {
    renderFolderList(searchInput.value.trim());
  });

  dropdown.appendChild(listWrap);
  selectWrap.appendChild(dropdown);
  box.appendChild(selectWrap);

  // Toggle dropdown
  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = selectWrap.classList.contains('open');
    selectWrap.classList.toggle('open');
    dropdown.classList.toggle('open');
    if (!isOpen) {
      searchInput.value = '';
      renderFolderList('');
      setTimeout(function() { searchInput.focus(); }, 50);
    }
  });

  // Close dropdown when clicking elsewhere in box
  box.addEventListener('click', function(e) {
    if (!selectWrap.contains(e.target)) {
      selectWrap.classList.remove('open');
      dropdown.classList.remove('open');
    }
  });

  // Action buttons
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:14px';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'sbtn';
  cancelBtn.style.cssText = 'padding:8px 16px;flex:1';
  cancelBtn.textContent = 'Cancel';
  var okBtn = document.createElement('button');
  okBtn.className = 'el-btn';
  okBtn.style.cssText = 'padding:8px 16px;flex:1';
  okBtn.textContent = 'Move';
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(okBtn);
  box.appendChild(btnRow);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  cancelBtn.addEventListener('click', function() { overlay.remove(); });
  okBtn.addEventListener('click', function() {
    var destId = selectedFolder;
    var grouped = {};
    _galSelectedItems.forEach(function(item) {
      if (!grouped[item.folderId]) grouped[item.folderId] = [];
      grouped[item.folderId].push({ idx: item.imgIdx });
    });
    // Use galMoveImage to preserve full entry objects (video metadata etc.)
    Object.keys(grouped).forEach(function(fid) {
      grouped[fid].sort(function(a, b) { return b.idx - a.idx; });
      grouped[fid].forEach(function(item) {
        if (fid === destId) return;
        galMoveImage(fid, item.idx, destId);
      });
    });
    overlay.remove();
    galExitSelectionMode();
    _refreshGalleryView(null);
    if (typeof showToast === 'function') showToast('Items moved');
  });
}


if (window.cc && cc.modules) cc.modules.register({ id: 'selection', parent: 'left-panel.gallery.browser', title: 'Gallery: selection', mount: function(){}, unmount: function(){} });
