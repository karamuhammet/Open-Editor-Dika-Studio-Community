/* gallery/browser/grid — media grid — image/video cells, category view, context menu, info/edit popups, grid-place wizard. Split from gallery.js (approved plan). FLAT sub-module:
   functions stay window globals (the panel/each other call them at runtime). Registers under left-panel.gallery.browser. */


/* ── Gallery Category View (main view when Images flyout opens) ── */
function renderImagesCategoryView() {
  var catView = document.getElementById('images-cat-view');
  var subView = document.getElementById('images-sub-view');
  if (catView) catView.style.display = '';
  _initGalleryFolderDrop();
  if (subView) {
    subView.style.display = 'none';
    // Clear stale folderId so folder-card drop handler doesn't teleport to a ghost folder
    var subContentClear = document.getElementById('images-sub-content');
    if (subContentClear) subContentClear.dataset.folderId = '';
  }

  var grid = document.getElementById('img-cat-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Clean up dynamically appended elements from previous render
  var oldDynamic = grid.parentNode.querySelectorAll('.gal-recent-section, .gal-image-grid[data-folder-id="__recent"], .gal-empty-msg, .gal-fixed-section, .gal-fixed-grid, .gal-section-body:not(#img-cat-grid), .gal-section-header, .gal-remote-more-btn');
  oldDynamic.forEach(function(el) { el.remove(); });
  grid.classList.remove('gal-section-body', 'collapsed');

  var store = _galInit();
  var mediaCat = _activeMediaCat || 'image';
  var labels = _galMediaLabels[mediaCat] || _galMediaLabels.image;

  // Filter data by current media category
  var catFolders = _galFilterFolders(store.folders, mediaCat);
  var catRecent = _galFilterRecent(store.recent, mediaCat);

  // ── "All Gallery" card (always first) ──
  var totalItems = 0;
  catFolders.forEach(function(f) { totalItems += (f.images ? f.images.length : 0); });
  totalItems += catRecent.length;

  var allCard = document.createElement('div');
  allCard.className = 'img-cat-card gal-all-gallery-card';
  var allIcon = (typeof getIcon === 'function') ? getIcon(labels.icon, 22) : '';
  allCard.innerHTML =
    '<div class="img-cat-icon">' + allIcon + '</div>' +
    '<div class="img-cat-text">' +
      '<div class="img-cat-name">' + labels.allTitle + '</div>' +
      '<div class="img-cat-desc">' + totalItems + ' ' + (totalItems !== 1 ? labels.plural : labels.singular) + '</div>' +
    '</div>';
  allCard.addEventListener('click', function() { drillIntoAllGallery(); });
  grid.appendChild(allCard);

  // ── Folder cards (main folders for current media type, 3-col grid) ──
  var mainFolders = catFolders.filter(function(f) { return !f.parentId; });
  if (mainFolders.length > 0) {
    mainFolders.forEach(function(folder) {
      var card = _createFolderCard(folder);
      grid.appendChild(card);
    });
  } else {
    var emptyFolderMsg = document.createElement('p');
    emptyFolderMsg.className = 'gal-empty-msg';
    emptyFolderMsg.textContent = 'No folders yet. Click the button above to create one.';
    grid.appendChild(emptyFolderMsg);
  }

  // ── Folders accordion wrapper ──
  var foldersAccKey = 'gal_acc_folders';
  var foldersCollapsed = localStorage.getItem(foldersAccKey) === '1';
  var foldersHeader = document.createElement('div');
  foldersHeader.className = 'gal-section-header' + (foldersCollapsed ? ' collapsed' : '');
  foldersHeader.innerHTML = '<span class="gal-section-title">' +
    ((typeof getIcon === 'function') ? getIcon('folder', 14) : '') + ' Folders</span>' +
    '<span style="display:flex;align-items:center;gap:4px">' +
    '<span class="gal-section-count">' + mainFolders.length + '</span>' +
    '<span class="gal-section-chevron">&#9662;</span></span>';
  grid.parentNode.insertBefore(foldersHeader, grid);
  if (foldersCollapsed) grid.classList.add('collapsed'); else grid.classList.remove('collapsed');
  grid.classList.add('gal-section-body');
  foldersHeader.addEventListener('click', function() {
    var c = grid.classList.toggle('collapsed');
    foldersHeader.classList.toggle('collapsed', c);
    localStorage.setItem(foldersAccKey, c ? '1' : '0');
  });

  // ── Recent Uploads section ──
  var recentAccKey = 'gal_acc_recent';
  var recentCollapsed = localStorage.getItem(recentAccKey) === '1';
  // Filter out corrupted/null entries from recent, then filter by media type
  var safeRecent = (store.recent || []).filter(function(e) {
    return e && (typeof e === 'string' || (typeof e === 'object' && (e.type === 'video' || e.type === 'audio')));
  });
  if (safeRecent.length !== (store.recent || []).length) {
    store.recent = safeRecent;
    _galSave(store);
  }
  // Apply media type filter — keep original indices for CRUD
  var filteredRecent = [];
  var filteredRecentOrigIdx = [];
  safeRecent.forEach(function(e, i) {
    var isVideo = (typeof e === 'object' && e.type === 'video');
    var isAudio = (typeof e === 'object' && e.type === 'audio');
    var isImage = (typeof e === 'string');
    if ((mediaCat === 'image' && isImage) || (mediaCat === 'video' && isVideo) || (mediaCat === 'audio' && isAudio)) {
      filteredRecent.push(e);
      filteredRecentOrigIdx.push(i);
    }
  });
  var recentSection = document.createElement('div');
  recentSection.className = 'gal-recent-section';
  var recentHeader = document.createElement('div');
  recentHeader.className = 'gal-section-header' + (recentCollapsed ? ' collapsed' : '');
  recentHeader.innerHTML = '<span class="gal-section-title">' +
    ((typeof getIcon === 'function') ? getIcon('clock', 14) : '') + ' ' + labels.recentTitle + '</span>' +
    '<span style="display:flex;align-items:center;gap:4px">' +
    '<span class="gal-section-count">' + filteredRecent.length + '</span>' +
    '<span class="gal-section-chevron">&#9662;</span></span>';
  recentSection.appendChild(recentHeader);
  grid.parentNode.appendChild(recentSection);

  var recentBody = document.createElement('div');
  recentBody.className = 'gal-section-body' + (recentCollapsed ? ' collapsed' : '');
  if (filteredRecent.length > 0) {
    var recentGrid = document.createElement('div');
    recentGrid.className = 'gal-image-grid';
    recentGrid.dataset.folderId = '__recent';
    var visibleCount = Math.min(_galRecentShowCount, filteredRecent.length);
    for (var ri = 0; ri < visibleCount; ri++) {
      try {
        var origIdx = filteredRecentOrigIdx[ri];
        var entry = filteredRecent[ri];
        var isVideo = (typeof entry === 'object' && entry.type === 'video');
        var isAudio = (typeof entry === 'object' && entry.type === 'audio');
        var dataUrl = isVideo ? (entry.poster || '') : (isAudio ? '' : entry);
        if (!dataUrl && !isVideo && !isAudio) continue;

        if (isAudio) {
          // Render audio entry with drag-drop, context menu, preview
          var audioCell = _createGalleryAudioCell(entry, '__recent', origIdx);
          recentGrid.appendChild(audioCell);
          continue;
        }

        // Image or video cell. No-poster videos ALSO go through _createImageCell so they
        // stay clickable / selectable / draggable; _patchVideoCell fills the poster lazily.
        var cell = _createImageCell(dataUrl, '__recent', origIdx, isVideo ? (entry.name || 'Video') : null);
        if (isVideo) {
          _patchVideoCell(cell, entry, '__recent', origIdx);
          var badge = document.createElement('div');
          badge.className = 'gallery-cell-play-badge';
          badge.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>';
          cell.style.position = 'relative';
          cell.appendChild(badge);
        }
        recentGrid.appendChild(cell);
      } catch(e) { /* skip corrupted entry */ }
    }
    recentBody.appendChild(recentGrid);
    // Load More button
    if (visibleCount < filteredRecent.length) {
      var remaining = filteredRecent.length - visibleCount;
      var loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'gal-load-more-btn';
      loadMoreBtn.textContent = 'Load More (' + remaining + ' remaining)';
      loadMoreBtn.addEventListener('click', function() {
        _galRecentShowCount += GAL_RECENT_PAGE_SIZE;
        renderImagesCategoryView();
      });
      recentBody.appendChild(loadMoreBtn);
    }
  } else {
    var emptyMsg = document.createElement('p');
    emptyMsg.className = 'gal-empty-msg';
    emptyMsg.textContent = mediaCat === 'video' ? 'No videos yet.' : mediaCat === 'audio' ? 'No audio tracks yet.' : 'No images uploaded yet.';
    recentBody.appendChild(emptyMsg);
  }
  grid.parentNode.appendChild(recentBody);
  recentHeader.addEventListener('click', function() {
    var c = recentBody.classList.toggle('collapsed');
    recentHeader.classList.toggle('collapsed', c);
    localStorage.setItem(recentAccKey, c ? '1' : '0');
  });

  if (window.CCAssets && CCAssets.active && typeof CCAssets.hasMoreAssets === 'function' && CCAssets.hasMoreAssets() && typeof galLoadMoreRemote === 'function') {
    var remoteMoreBtn = document.createElement('button');
    remoteMoreBtn.className = 'gal-load-more-btn gal-remote-more-btn';
    remoteMoreBtn.textContent = 'Load More Library Items';
    remoteMoreBtn.addEventListener('click', function () {
      remoteMoreBtn.disabled = true;
      remoteMoreBtn.textContent = 'Loading...';
      galLoadMoreRemote().then(function () { renderImagesCategoryView(); });
    });
    grid.parentNode.appendChild(remoteMoreBtn);
  }

  // Device Mockups / QR Code / Barcode Generator now live in the Tools tab
  // (see #tools-cat-generators) — they are no longer shown in the Media gallery.

  // Re-apply the toolbar filters (density / sort / size) to the fresh grids.
  if (typeof _galApplyGridFilters === 'function') _galApplyGridFilters();
}


/* ── Create an image cell (used in folder views and recent) ── */
function _createImageCell(dataUrl, folderId, idx, displayName) {
  dataUrl = dataUrl || '';
  var cell = document.createElement('div');
  cell.className = 'gallery-cell';
  cell.setAttribute('draggable', 'true');
  cell.dataset.srcFolder = folderId;
  cell.dataset.imgIdx = idx;
  cell.dataset.dataUrl = dataUrl;

  var store = _galInit();
  var customName = _galGetImgName(store, dataUrl, idx);
  var nameLabel = customName || displayName || ('Image ' + (parseInt(idx, 10) + 1));
  var editIconHtml = (typeof getIcon === 'function') ? getIcon('pencil', 10) : '&#9998;';
  var infoIconHtml = (typeof getIcon === 'function') ? getIcon('info', 10) : 'i';
  var checkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  cell.innerHTML =
    '<div class="gal-select-cb">' + checkSvg + '</div>' +
    '<img draggable="false" loading="lazy" decoding="async" style="width:100%;height:80px;object-fit:cover;border-radius:4px;cursor:pointer">' +
    '<span class="gallery-cell-name" title="' + _escHtml(nameLabel) + '">' + _escHtml(nameLabel) + '</span>' +
    '<button class="gallery-img-info" title="Image info">' + infoIconHtml + '</button>' +
    '<button class="gallery-img-edit" title="Edit image">' + editIconHtml + '</button>' +
    '<button class="gallery-del" title="Remove">&times;</button>';

  // Selection checkbox
  cell.querySelector('.gal-select-cb').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!_galSelectionMode) galEnterSelectionMode();
    galToggleSelectImage(cell, folderId, idx, dataUrl);
  });

  // Edit button
  cell.querySelector('.gallery-img-edit').addEventListener('click', function(e) {
    e.stopPropagation();
    if (_galSelectionMode) return;
    _openImageEditPopup(dataUrl, folderId, idx, nameLabel);
  });

  // Info button
  cell.querySelector('.gallery-img-info').addEventListener('click', function(e) {
    e.stopPropagation();
    if (_galSelectionMode) return;
    _showGalImageInfo(dataUrl, folderId, idx, nameLabel, e);
  });

  cell.querySelector('img').src = (typeof _galThumbUrl === 'function') ? _galThumbUrl(dataUrl) : dataUrl;

  cell.querySelector('img').addEventListener('click', function() {
    if (_galSelectionMode) {
      galToggleSelectImage(cell, folderId, idx, dataUrl);
      return;
    }
    // Check if this is a video gallery entry (recent OR folder)
    var store = _galInit();
    var galEntry = null;
    if (folderId === '__recent') {
      galEntry = (store.recent && store.recent[idx]) ? store.recent[idx] : null;
    } else {
      var fld = store.folders.filter(function(f){ return f.id === folderId; })[0];
      galEntry = (fld && fld.images && fld.images[idx]) ? fld.images[idx] : null;
    }
    var isVidEntry = galEntry && typeof galEntry === 'object' && galEntry.type === 'video';
    if (isVidEntry) {
      var posterUrl = galEntry.poster || dataUrl;
      var vidSrc = galEntry.src || null;
      var vidName = galEntry.name || 'Video';
      var vidIdbKey = galEntry.idbKey || null;
      var vidDuration = galEntry.duration || 0;

      // Video Editor active: route video to VE timeline instead of Fabric canvas
      var _veIsOn = typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive();

      // This entry may already BE a library asset (portal store: `_remoteUrl`/library `src`;
      // local store: `remoteUrl`). Stamp that URL on the imported File so the video-editor
      // save does not upload a duplicate copy on every click-add (owner bug).
      var vidRemote = (typeof _galEntryRemoteUrl === 'function') ? _galEntryRemoteUrl(galEntry)
                      : (galEntry.remoteUrl || galEntry._remoteUrl || null);

      // Restore video from IDB or blob URL
      var addVideoFromGallery = function (blobUrl, blob) {
        // If VE mode is active, route to timeline as File
        if (_veIsOn && window.VideoEditor && VideoEditor.importMediaFile) {
          var vidBlob = blob || null;
          var _doImport = function(b) {
            if (!b) { if (typeof showToast === 'function') showToast('Could not load video', 'error'); return; }
            var ext = 'mp4';
            if (b.type && b.type.indexOf('webm') !== -1) ext = 'webm';
            var f = new File([b], (vidName || 'video') + '.' + ext, { type: b.type || 'video/mp4' });
            if (vidRemote) f._ccAssetUrl = vidRemote;
            VideoEditor.importMediaFile(f, vidDuration);
            if (typeof showToast === 'function') showToast('Video added to timeline');
          };
          if (vidBlob) { _doImport(vidBlob); return; }
          // If we only have a blobUrl, fetch it to get the blob
          if (blobUrl) {
            fetch(blobUrl).then(function(r) { return r.blob(); }).then(_doImport)
              .catch(function() { if (typeof showToast === 'function') showToast('Could not add video to timeline', 'error'); });
          }
          return;
        }
        fabric.Image.fromURL(posterUrl, function (img) {
          var iw = Math.round(200 * getCanvasScale());
          img.scaleToWidth(iw);
          var c = getCanvasCenter();
          img.set({
            left: c.x - iw / 2,
            top: c.y - iw / 2,
            _isVideoMedia: true,
            _videoSrc: blobUrl,
            _videoPoster: posterUrl,
            _videoName: vidName,
            _videoIdbKey: vidIdbKey,
            objectCaching: false
          });
          canvas.add(img);
          canvas.setActiveObject(img);
          if (blobUrl) _ccAttachVideoElement(img, blobUrl);
          canvas.renderAll();
          if (typeof snap === 'function') snap();
        });
      };
      var _dispatch = function () {
        if (vidIdbKey) {
          _ccVideoIdbGet(vidIdbKey).then(function (blob) {
            if (blob) {
              var url = URL.createObjectURL(blob);
              addVideoFromGallery(url, blob);
            } else if (vidSrc) {
              addVideoFromGallery(vidSrc);
            } else {
              addVideoFromGallery(null);
            }
          }).catch(function () { addVideoFromGallery(vidSrc); });
        } else if (vidSrc) {
          addVideoFromGallery(vidSrc);
        } else {
          addVideoFromGallery(null);
        }
      };
      // Portal videos have no poster: generate one first so fabric has an image to place.
      if (!galEntry.poster && (galEntry.src || galEntry._remoteUrl) && typeof _galEnsureVideoPoster === 'function') {
        _galEnsureVideoPoster(galEntry, function (p) { if (p) posterUrl = p; _dispatch(); });
      } else {
        _dispatch();
      }
      return;
    }
    fabric.Image.fromURL(dataUrl, function(img) {
      var iw = Math.round(140 * getCanvasScale());
      img.scaleToWidth(iw);
      var c = getCanvasCenter();
      img.set({ left: c.x - iw / 2, top: c.y - iw / 2 });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
    });
  });

  cell.querySelector('.gallery-del').addEventListener('click', function(e) {
    e.stopPropagation();
    if (_galSelectionMode) return;
    // Move to trash instead of permanent delete
    galTrashAdd(dataUrl);
    if (folderId === '__recent') {
      galRemoveRecent(idx);
    } else {
      galRemoveImageFromFolder(folderId, idx);
    }
    // Refresh current view
    var subView = document.getElementById('images-sub-view');
    var subTitle = document.getElementById('images-sub-title');
    if (subView && subView.style.display !== 'none' && subTitle && subTitle.textContent === 'All Images') {
      drillIntoAllGallery();
    } else if (subView && subView.style.display !== 'none' && folderId !== '__recent') {
      drillIntoFolder(folderId);
    } else {
      renderImagesCategoryView();
    }
    if (typeof showToast === 'function') showToast('Moved to trash');
  });

  // Drag start — honours data-drag-payload override set by _patchVideoCell
  cell.addEventListener('dragstart', function(e) {
    if (_galSelectionMode) { e.preventDefault(); return; }
    var override = cell.getAttribute('data-drag-payload');
    var payload = override ? JSON.parse(override) : { type: 'image', srcFolder: folderId, imgIdx: idx, dataUrl: dataUrl };
    var json = JSON.stringify(payload);
    // Specific MIME so the canvas drop target matches only gallery items (not
    // arbitrary text/link drags). text/plain kept as a fallback for folder-drop.
    e.dataTransfer.setData('application/x-dika-gallery-item', json);
    e.dataTransfer.setData('text/plain', json);
    // copyMove: canvas drop is a 'copy', folder drop is a 'move'; a bare 'move'
    // made the browser reject the canvas 'copy' dropEffect and the drop never fired.
    e.dataTransfer.effectAllowed = 'copyMove';
    cell.classList.add('gal-dragging');
  });
  cell.addEventListener('dragend', function() {
    cell.classList.remove('gal-dragging');
    document.querySelectorAll('.gal-dragover').forEach(function(el) { el.classList.remove('gal-dragover'); });
  });

  // Right-click context menu
  cell.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    _showGalImageContextMenu(e, dataUrl, folderId, idx, nameLabel);
  });

  return cell;
}


/* ── Gallery Image Context Menu ── */
function _showGalImageContextMenu(e, dataUrl, folderId, idx, nameLabel) {
  var existing = document.querySelector('.gal-folder-ctx');
  if (existing) existing.remove();

  var dlIconHtml = (typeof getIcon === 'function') ? getIcon('download', 13) + ' ' : '';
  var editIconHtml = (typeof getIcon === 'function') ? getIcon('pencil', 13) + ' ' : '';
  var infoIconHtml = (typeof getIcon === 'function') ? getIcon('info', 13) + ' ' : '';
  var trashIconHtml = (typeof getIcon === 'function') ? getIcon('trash2', 13) + ' ' : '';
  var copyIconHtml = (typeof getIcon === 'function') ? getIcon('copy', 13) + ' ' : '';
  var tagIconHtml = (typeof getIcon === 'function') ? getIcon('tag', 13) + ' ' : '';
  var moveIconHtml = (typeof getIcon === 'function') ? getIcon('folder', 13) + ' ' : '';
  var brandIconHtml = (typeof getIcon === 'function') ? getIcon('palette', 13) + ' ' : '';
  // Etiketle / Markaya ekle need a portal asset id + loaded palette; Klasore tasi works
  // locally too (galMoveImage carries the Phase 4 portal write-through).
  var _assetId = (typeof _galEntryAssetId === 'function') ? _galEntryAssetId(dataUrl) : null;
  var _pback = (typeof _galPortalBacked === 'function') && _galPortalBacked();
  var _canTag = _pback && _assetId && window._galAllTags && _galAllTags.length;
  var _canBrand = _pback && _assetId && window._galAllBrands && _galAllBrands.length;
  var sep = '<div style="height:1px;background:var(--border);margin:3px 0"></div>';

  var menu = document.createElement('div');
  menu.className = 'gal-folder-ctx';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  menu.innerHTML =
    '<button data-act="export-png">' + dlIconHtml + 'Export as PNG</button>' +
    '<button data-act="export-jpg">' + dlIconHtml + 'Export as JPG</button>' +
    '<button data-act="export-webp">' + dlIconHtml + 'Export as WebP</button>' +
    sep +
    '<button data-act="copy">' + copyIconHtml + 'Copy to Clipboard</button>' +
    sep +
    (_canTag ? '<button data-act="tag">' + tagIconHtml + 'Tag</button>' : '') +
    '<button data-act="move">' + moveIconHtml + 'Move to folder</button>' +
    (_canBrand ? '<button data-act="brand">' + brandIconHtml + 'Add to brand</button>' : '') +
    sep +
    '<button data-act="edit">' + editIconHtml + 'Edit</button>' +
    '<button data-act="info">' + infoIconHtml + 'Info</button>' +
    sep +
    '<button data-act="delete" style="color:#e74c3c">' + trashIconHtml + 'Delete</button>';

  document.body.appendChild(menu);

  // Keep menu within viewport
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

  menu.addEventListener('click', function(ev) {
    var btn = ev.target.closest('[data-act]');
    var act = btn ? btn.dataset.act : '';
    menu.remove();

    if (act === 'export-png') {
      _galExportImage(dataUrl, nameLabel, 'image/png', '.png');
    } else if (act === 'export-jpg') {
      _galExportImage(dataUrl, nameLabel, 'image/jpeg', '.jpg');
    } else if (act === 'export-webp') {
      _galExportImage(dataUrl, nameLabel, 'image/webp', '.webp');
    } else if (act === 'copy') {
      _galCopyImageToClipboard(dataUrl);
    } else if (act === 'tag') {
      _galTagPickerPopup(e, [{ id: _assetId, url: dataUrl, meta: (typeof _galAssetMeta !== 'undefined' ? _galAssetMeta[dataUrl] : null) }]);
    } else if (act === 'move') {
      _galFolderPickerPopup(e, function(destId) {
        galMoveImage(folderId, idx, destId);
        if (typeof _refreshGalleryView === 'function') _refreshGalleryView(folderId);
        if (typeof showToast === 'function') showToast('Moved to folder');
      });
    } else if (act === 'brand') {
      _galBrandPickerPopup(e, [{ id: _assetId, url: dataUrl, meta: (typeof _galAssetMeta !== 'undefined' ? _galAssetMeta[dataUrl] : null) }]);
    } else if (act === 'edit') {
      _openImageEditPopup(dataUrl, folderId, idx, nameLabel);
    } else if (act === 'info') {
      _showGalImageInfo(dataUrl, folderId, idx, nameLabel, e);
    } else if (act === 'delete') {
      galTrashAdd(dataUrl);
      if (folderId === '__recent') {
        var st = _galInit();
        st.recent.splice(idx, 1);
        _galSave(st);
      } else {
        galRemoveImageFromFolder(folderId, idx);
      }
      var subView = document.getElementById('images-sub-view');
      var subTitle = document.getElementById('images-sub-title');
      if (subView && subView.style.display !== 'none' && subTitle && subTitle.textContent === 'All Images') {
        drillIntoAllGallery();
      } else if (subView && subView.style.display !== 'none' && folderId !== '__recent') {
        drillIntoFolder(folderId);
      } else {
        renderImagesCategoryView();
      }
      if (typeof showToast === 'function') showToast('Moved to trash');
    }
  });

  setTimeout(function() {
    document.addEventListener('click', function handler() {
      if (menu.parentNode) menu.remove();
      document.removeEventListener('click', handler);
    });
  }, 10);
}


/* ══════════════════════════════════════════════════════════════════════════
   Context-menu action pickers (Phase 6): Etiketle / Klasore tasi / Markaya ekle.
   Reused by the single-item menu AND the bulk bar. targets = [{id, url, meta?}]
   where id is the panel asset id. All write through CCAssets to the org API.
   ══════════════════════════════════════════════════════════════════════════ */
function _galMountPicker(pop, evt) {
  document.querySelectorAll('.gal-picker-pop').forEach(function(p){ p.remove(); });
  document.body.appendChild(pop);
  var x = (evt && evt.clientX) || 120, y = (evt && evt.clientY) || 120;
  var r = pop.getBoundingClientRect();
  if (x + r.width > window.innerWidth) x = window.innerWidth - r.width - 8;
  if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 8;
  pop.style.left = Math.max(4, x) + 'px';
  pop.style.top = Math.max(4, y) + 'px';
  setTimeout(function() {
    function close() { if (pop.parentNode) pop.remove(); document.removeEventListener('mousedown', h, true); document.removeEventListener('keydown', k, true); }
    function h(e) { if (!pop.parentNode) { close(); return; } if (!pop.contains(e.target)) close(); }
    function k(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('mousedown', h, true);
    document.addEventListener('keydown', k, true);
  }, 10);
}

function _galTagPickerPopup(evt, targets) {
  if (!window._galAllTags || !_galAllTags.length) { if (typeof showToast === 'function') showToast('First create a tag'); return; }
  var ids = targets.map(function(t){ return t.id; }).filter(Boolean);
  if (!ids.length) return;
  var current = (targets.length === 1 && targets[0].meta) ? (targets[0].meta.tags || []) : [];
  var pop = document.createElement('div');
  pop.className = 'gal-picker-pop';
  pop.innerHTML = '<div class="gal-picker-title">Tag items</div><div class="gal-ss" id="gal-tagpick-host"></div>' +
    '<div class="gal-picker-actions"><button type="button" class="gal-picker-cancel">Cancel</button><button type="button" class="gal-picker-ok">Save</button></div>';
  _galMountPicker(pop, evt);
  var sel = _galSearchSelect(pop.querySelector('#gal-tagpick-host'), {
    name: 'tagpick', placeholder: 'Search tag...',
    items: _galAllTags.map(function(t){ return { v: t.id, t: t.name }; }), selected: current
  });
  pop.querySelector('.gal-picker-cancel').onclick = function() { pop.remove(); };
  pop.querySelector('.gal-picker-ok').onclick = function() {
    var checked = sel.getSelected();
    ids.forEach(function(id) { if (window.CCAssets && CCAssets.setAssetTags) CCAssets.setAssetTags(id, checked); });
    targets.forEach(function(t) { if (t.url && typeof _galAssetMeta !== 'undefined' && _galAssetMeta[t.url]) _galAssetMeta[t.url].tags = checked.slice(); });
    pop.remove();
    if (typeof showToast === 'function') showToast(ids.length + ' item(s) tagged');
    if (typeof _galApplyGridFilters === 'function') _galApplyGridFilters();
  };
}

function _galBrandPickerPopup(evt, targets) {
  if (!window._galAllBrands || !_galAllBrands.length) { if (typeof showToast === 'function') showToast('First create a brand'); return; }
  var ids = targets.map(function(t){ return t.id; }).filter(Boolean);
  if (!ids.length) return;
  var current = (targets.length === 1 && targets[0].meta) ? (targets[0].meta.brand || '') : '';
  var pop = document.createElement('div');
  pop.className = 'gal-picker-pop';
  pop.innerHTML = '<div class="gal-picker-title">Add to brand</div><div class="gal-ss" id="gal-brandpick-host"></div>' +
    '<div class="gal-picker-actions"><button type="button" class="gal-picker-cancel">Cancel</button><button type="button" class="gal-picker-ok">Save</button></div>';
  _galMountPicker(pop, evt);
  // single-select searchable; "Remove brand" is the empty-value option (selected when no brand).
  var items = [{ v: '', t: 'Remove brand' }].concat(_galAllBrands.map(function(b){ return { v: b.id, t: b.name }; }));
  var sel = _galSearchSelect(pop.querySelector('#gal-brandpick-host'), {
    name: 'brandpick', single: true, placeholder: 'Search brand...', items: items, selected: [current || '']
  });
  pop.querySelector('.gal-picker-cancel').onclick = function() { pop.remove(); };
  pop.querySelector('.gal-picker-ok').onclick = function() {
    var picked = sel.getSelected();
    var brand = picked.length ? picked[0] : '';
    ids.forEach(function(id) { if (window.CCAssets && CCAssets.patchAsset) CCAssets.patchAsset(id, { brand: brand || null }); });
    targets.forEach(function(t) { if (t.url && typeof _galAssetMeta !== 'undefined' && _galAssetMeta[t.url]) _galAssetMeta[t.url].brand = brand; });
    pop.remove();
    if (typeof showToast === 'function') showToast(brand ? 'Added to brand' : 'Brand removed');
    if (typeof _galApplyGridFilters === 'function') _galApplyGridFilters();
  };
}

function _galFolderPickerPopup(evt, onPick) {
  var store = _galInit();
  var mediaCat = _activeMediaCat || 'image';
  var folders = (typeof _galFilterFolders === 'function') ? _galFilterFolders(store.folders || [], mediaCat) : (store.folders || []);
  var pop = document.createElement('div');
  pop.className = 'gal-picker-pop';
  var rows = '<button type="button" class="gal-picker-item" data-fid="__recent">' +
    ((typeof getIcon === 'function') ? getIcon('clock', 13) : '') + ' Remove from folder</button>';
  folders.forEach(function(f) {
    var pad = f.parentId ? ' style="padding-left:22px"' : '';
    rows += '<button type="button" class="gal-picker-item" data-fid="' + f.id + '"' + pad + '>' +
      ((typeof getIcon === 'function') ? getIcon(f.icon || 'folder', 13) : '') + ' ' + _escHtml(f.name) + '</button>';
  });
  pop.innerHTML = '<div class="gal-picker-title">Move to folder</div><div class="gal-picker-list">' + rows + '</div>';
  _galMountPicker(pop, evt);
  pop.querySelector('.gal-picker-list').addEventListener('click', function(e) {
    var b = e.target.closest('[data-fid]');
    if (!b) return;
    pop.remove();
    if (typeof onPick === 'function') onPick(b.dataset.fid);
  });
}


/* ── Export gallery image to file ── */
function _galExportImage(dataUrl, nameLabel, mimeType, ext) {
  var safeName = (nameLabel || 'image').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'image';
  var img = new Image();
  img.onload = function() {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(img, 0, 0);
    var quality = mimeType === 'image/png' ? undefined : 0.92;
    var outUrl = c.toDataURL(mimeType, quality);
    var a = document.createElement('a');
    a.href = outUrl;
    a.download = safeName + ext;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); }, 200);
    if (typeof showToast === 'function') showToast('Exported: ' + safeName + ext);
  };
  img.onerror = function() {
    if (typeof showToast === 'function') showToast('Export failed', 'error');
  };
  img.src = dataUrl;
}


/* ── Copy gallery image to clipboard ── */
function _galCopyImageToClipboard(dataUrl) {
  var img = new Image();
  img.onload = function() {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    c.toBlob(function(blob) {
      if (blob && navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function() {
          if (typeof showToast === 'function') showToast('Copied to clipboard');
        }).catch(function() {
          if (typeof showToast === 'function') showToast('Copy failed', 'error');
        });
      } else {
        if (typeof showToast === 'function') showToast('Clipboard not supported', 'error');
      }
    }, 'image/png');
  };
  img.src = dataUrl;
}


/* ── Image Info Popup ── */
function _showGalImageInfo(dataUrl, folderId, imgIdx, nameLabel, evt) {
  // Remove any existing info popup
  var old = document.querySelector('.gal-info-popup');
  if (old) old.remove();

  var store = _galInit();
  // Find folder name
  var folderName = 'Recent';
  if (folderId && folderId !== '__recent') {
    for (var i = 0; i < store.folders.length; i++) {
      if (store.folders[i].id === folderId) { folderName = store.folders[i].name; break; }
    }
  }

  // Estimate dataUrl size in KB
  var sizeKB = dataUrl ? Math.round((dataUrl.length * 3 / 4) / 1024) : 0;

  // Detect format from dataUrl MIME type
  var fmt = 'JPEG';
  if (dataUrl && typeof dataUrl === 'string') {
    var mimeM = dataUrl.match(/^data:([^;,]+)/);
    if (mimeM) {
      fmt = (mimeM[1].split('/')[1] || 'jpeg').toUpperCase();
    } else {
      var extM = dataUrl.split('?')[0].split('.');
      if (extM.length > 1) fmt = extM[extM.length - 1].toUpperCase();
    }
  }

  // Get image dimensions
  var img = new Image();
  img.onload = function() {
    _renderGalInfoPopup(nameLabel, img.naturalWidth, img.naturalHeight, sizeKB, folderName, evt, fmt);
  };
  img.onerror = function() {
    _renderGalInfoPopup(nameLabel, 0, 0, sizeKB, folderName, evt, fmt);
  };
  img.src = dataUrl;
}


function _renderGalInfoPopup(name, w, h, sizeKB, folderName, evt, format) {
  var old = document.querySelector('.gal-info-popup');
  if (old) old.remove();

  var popup = document.createElement('div');
  popup.className = 'gal-info-popup';

  var sizeStr = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB';
  var dimStr = (w && h) ? w + ' × ' + h + ' px' : 'Unknown';

  var rows = [
    { label: 'Dimensions', value: dimStr },
    { label: 'Size (est.)', value: sizeStr },
    { label: 'Folder', value: folderName },
    { label: 'Format', value: format || 'JPEG' }
  ];

  var html = '<div class="gal-info-popup-title">' + _escHtml(name) + '</div>';
  for (var i = 0; i < rows.length; i++) {
    html += '<div class="gal-info-popup-row">' +
      '<span class="gal-info-popup-label">' + rows[i].label + '</span>' +
      '<span class="gal-info-popup-value">' + _escHtml(rows[i].value) + '</span>' +
      '</div>';
  }
  popup.innerHTML = html;

  document.body.appendChild(popup);

  // Position near the clicked button
  var bx = evt.clientX || 0, by = evt.clientY || 0;
  var pw = popup.offsetWidth, ph = popup.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight;
  var left = Math.min(bx + 8, vw - pw - 12);
  var top = Math.min(by + 8, vh - ph - 12);
  if (left < 4) left = 4;
  if (top < 4) top = 4;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  // Close on click outside
  var closeHandler = function(e) {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('mousedown', closeHandler, true);
    }
  };
  setTimeout(function() {
    document.addEventListener('mousedown', closeHandler, true);
  }, 50);
}


/* ── Video Info Popup ── */
function _showGalVideoInfoPopup(entry, folderId, evt) {
  var old = document.querySelector('.gal-info-popup');
  if (old) old.remove();

  var store = _galInit();
  var folderName = 'Recent';
  if (folderId && folderId !== '__recent') {
    for (var i = 0; i < store.folders.length; i++) {
      if (store.folders[i].id === folderId) { folderName = store.folders[i].name; break; }
    }
  }

  var name = entry.name || 'Video';

  // Detect format from filename extension
  var fmt = 'MP4';
  var extMatch = name.match(/\.([a-zA-Z0-9]+)$/);
  if (extMatch) {
    var ext = extMatch[1].toUpperCase();
    if (['MP4','WEBM','OGG','MOV','AVI','MKV','M4V'].indexOf(ext) !== -1) fmt = ext;
  }

  // Format duration
  var durStr = 'N/A';
  if (entry.duration && isFinite(entry.duration)) {
    var dm = Math.floor(entry.duration / 60);
    var ds = Math.floor(entry.duration % 60);
    durStr = dm + ':' + (ds < 10 ? '0' : '') + ds;
  }

  // Dimensions
  var dimStr = (entry.width && entry.height) ? entry.width + ' × ' + entry.height + ' px' : 'Unknown';

  var rows = [
    { label: 'Name', value: name },
    { label: 'Format', value: fmt },
    { label: 'Duration', value: durStr },
    { label: 'Dimensions', value: dimStr },
    { label: 'Folder', value: folderName }
  ];

  var popup = document.createElement('div');
  popup.className = 'gal-info-popup';

  var html = '<div class="gal-info-popup-title">' + _escHtml(name) + '</div>';
  for (var j = 0; j < rows.length; j++) {
    html += '<div class="gal-info-popup-row">' +
      '<span class="gal-info-popup-label">' + rows[j].label + '</span>' +
      '<span class="gal-info-popup-value">' + _escHtml(rows[j].value) + '</span>' +
      '</div>';
  }
  popup.innerHTML = html;
  document.body.appendChild(popup);

  var bx = evt ? (evt.clientX || 0) : 0;
  var by = evt ? (evt.clientY || 0) : 0;
  var pw = popup.offsetWidth, ph = popup.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight;
  var left = Math.min(bx + 8, vw - pw - 12);
  var top = Math.min(by + 8, vh - ph - 12);
  if (left < 4) left = 4;
  if (top < 4) top = 4;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  var closeVidInfo = function(e) {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('mousedown', closeVidInfo, true);
    }
  };
  setTimeout(function() {
    document.addEventListener('mousedown', closeVidInfo, true);
  }, 50);
}


/* ── Image Edit Popup (rename + move to folder) ── */
function _openImageEditPopup(dataUrl, currentFolderId, imgIdx, currentName) {
  // Remove any existing popup
  var existing = document.querySelector('.gal-img-edit-overlay');
  if (existing) existing.remove();

  var store = _galInit();

  var overlay = document.createElement('div');
  overlay.className = 'gal-img-edit-overlay';

  // Build folder list: recent 10 first, then all remaining, subfolders indented
  // Filter by current media type so audio folders don't appear when moving images, etc.
  var mediaCat = _activeMediaCat || 'image';
  var recentIds = store.recentFolderIds || [];
  var allFolders = _galFilterFolders(store.folders || [], mediaCat);

  function _buildFolderTree() {
    var tree = [];
    // Build hierarchy
    function addChildren(parentId, depth) {
      allFolders.forEach(function(f) {
        if ((f.parentId || null) === (parentId || null)) {
          tree.push({ id: f.id, name: f.name, icon: f.icon, depth: depth, parentId: f.parentId });
          addChildren(f.id, depth + 1);
        }
      });
    }
    addChildren(null, 0);
    return tree;
  }

  var folderTree = _buildFolderTree();

  // Split into recent and others
  var recentFolders = [];
  var otherFolders = [];
  var recentSet = {};
  recentIds.forEach(function(rid) {
    var match = folderTree.filter(function(f) { return f.id === rid; })[0];
    if (match) { recentFolders.push(match); recentSet[rid] = true; }
  });
  folderTree.forEach(function(f) {
    if (!recentSet[f.id]) otherFolders.push(f);
  });

  function _renderFolderOption(f, selected) {
    var prefix = '';
    for (var d = 0; d < f.depth; d++) prefix += '&nbsp;&nbsp;&nbsp;';
    if (f.depth > 0) prefix += '<span style="color:var(--text-faint)">\u2514 </span>';
    var iconHtml = (typeof getIcon === 'function') ? getIcon(f.icon || 'folder', 12) : '';
    var isActive = (f.id === selected) ? ' gal-imgpop-opt-active' : '';
    return '<div class="gal-imgpop-opt' + isActive + '" data-folder-id="' + f.id + '">' +
      prefix + '<span class="gal-imgpop-opt-icon">' + iconHtml + '</span> ' + _escHtml(f.name) + '</div>';
  }

  var popupHtml =
    '<div class="gal-img-edit-box">' +
      '<button class="fc-close gal-imgpop-close">&times;</button>' +
      '<div class="fc-title-text">Edit Image</div>' +
      '<label class="gal-imgpop-label">Image Name</label>' +
      '<input type="text" class="wiz-input gal-imgpop-name" value="' + _escHtml(currentName || '') + '" placeholder="Image name..." maxlength="80">' +
      '<label class="gal-imgpop-label">Move to Folder</label>' +
      '<div class="gal-imgpop-dropdown">' +
        '<div class="gal-imgpop-selected" data-folder-id="' + (currentFolderId || '__recent') + '">' +
          _escHtml(_getFolderLabel(currentFolderId, store)) +
          ' <span class="gal-imgpop-arrow">▾</span>' +
        '</div>' +
        '<div class="gal-imgpop-list" style="display:none">' +
          '<div class="gal-imgpop-search-wrap">' +
            '<input type="text" class="wiz-input gal-imgpop-search" placeholder="Search folders...">' +
          '</div>' +
          '<div class="gal-imgpop-opt' + (currentFolderId === '__recent' ? ' gal-imgpop-opt-active' : '') + '" data-folder-id="__recent">' +
            ((typeof getIcon === 'function') ? getIcon('clock', 12) : '') + ' Recent Uploads</div>' +
          (recentFolders.length > 0 ? '<div class="gal-imgpop-divider">Recently Used</div>' : '') +
          recentFolders.map(function(f) { return _renderFolderOption(f, currentFolderId); }).join('') +
          '<div class="gal-imgpop-divider">All Folders</div>' +
          otherFolders.map(function(f) { return _renderFolderOption(f, currentFolderId); }).join('') +
          (folderTree.length === 0 ? '<div class="gal-imgpop-empty">No folders yet</div>' : '') +
        '</div>' +
      '</div>' +
      '<button class="el-btn gal-imgpop-save" style="width:100%;margin-top:12px">Save</button>' +
    '</div>';

  overlay.innerHTML = popupHtml;
  document.body.appendChild(overlay);

  var selectedFolderId = currentFolderId || '__recent';
  var nameInput = overlay.querySelector('.gal-imgpop-name');
  var selectedEl = overlay.querySelector('.gal-imgpop-selected');
  var listEl = overlay.querySelector('.gal-imgpop-list');
  var searchInput = overlay.querySelector('.gal-imgpop-search');

  // Toggle dropdown
  selectedEl.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = listEl.style.display !== 'none';
    listEl.style.display = isOpen ? 'none' : '';
    if (!isOpen && searchInput) setTimeout(function() { searchInput.focus(); }, 50);
  });

  // Search filter
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.trim().toLowerCase();
      listEl.querySelectorAll('.gal-imgpop-opt').forEach(function(opt) {
        if (!q || opt.textContent.toLowerCase().indexOf(q) !== -1) {
          opt.style.display = '';
        } else {
          opt.style.display = 'none';
        }
      });
      // Show/hide dividers based on visible options
      listEl.querySelectorAll('.gal-imgpop-divider').forEach(function(div) {
        var next = div.nextElementSibling;
        var hasVisible = false;
        while (next && !next.classList.contains('gal-imgpop-divider')) {
          if (next.classList.contains('gal-imgpop-opt') && next.style.display !== 'none') hasVisible = true;
          next = next.nextElementSibling;
        }
        div.style.display = hasVisible || !q ? '' : 'none';
      });
    });
    searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
  }

  // Select folder
  listEl.addEventListener('click', function(e) {
    var opt = e.target.closest('.gal-imgpop-opt');
    if (!opt) return;
    selectedFolderId = opt.dataset.folderId;
    listEl.querySelectorAll('.gal-imgpop-opt').forEach(function(o) { o.classList.remove('gal-imgpop-opt-active'); });
    opt.classList.add('gal-imgpop-opt-active');
    selectedEl.innerHTML = opt.innerHTML.replace(/<span class="gal-imgpop-arrow">.*?<\/span>/, '') +
      ' <span class="gal-imgpop-arrow">▾</span>';
    selectedEl.dataset.folderId = selectedFolderId;
    listEl.style.display = 'none';
  });

  // Close dropdown on outside click
  function closeList(e) {
    if (!listEl.contains(e.target) && !selectedEl.contains(e.target)) {
      listEl.style.display = 'none';
    }
  }
  overlay.addEventListener('click', closeList);

  // Save
  overlay.querySelector('.gal-imgpop-save').addEventListener('click', function() {
    var newName = nameInput ? nameInput.value.trim() : '';
    // Save name
    _galSetImgName(dataUrl, newName);
    // Move if folder changed
    if (selectedFolderId !== currentFolderId) {
      galMoveImage(currentFolderId, imgIdx, selectedFolderId);
      _galTrackRecentFolder(selectedFolderId);
    }
    overlay.remove();
    // Refresh view
    _refreshGalleryView(currentFolderId);
    if (typeof showToast === 'function') showToast('Image updated');
  });

  // Close
  overlay.querySelector('.gal-imgpop-close').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  if (nameInput) setTimeout(function() { nameInput.focus(); nameInput.select(); }, 100);
}


/* ── Grid Place Wizard (folder → grid) ── */
function _showGridPlaceWizard(folder) {
  var store = _galInit();
  var fObj = store.folders.filter(function(f) { return f.id === folder.id; })[0];
  if (!fObj) return;

  // Collect only direct images (not subfolders)
  var allItems = [];
  (fObj.images || []).forEach(function(entry, idx) {
    var isVideo = (typeof entry === 'object' && entry.type === 'video');
    allItems.push({
      idx: idx,
      dataUrl: isVideo ? (entry.poster || '') : entry,
      isVideo: isVideo,
      entry: entry,
      selected: true
    });
  });

  if (allItems.length === 0) {
    if (typeof showToast === 'function') showToast('No images in this folder');
    return;
  }

  // State
  var step = 1;
  var gridCols = Math.ceil(Math.sqrt(allItems.length));
  var gridRows = Math.ceil(allItems.length / gridCols);
  var gridGap = 4;
  var gridRadius = 0;

  // Build overlay
  var overlay = document.createElement('div');
  overlay.className = 'grid-wiz-overlay';

  var box = document.createElement('div');
  box.className = 'grid-wiz-box';
  overlay.appendChild(box);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
  });

  function close() { overlay.remove(); }

  function render() {
    var selectedCount = allItems.filter(function(i) { return i.selected; }).length;

    if (step === 1) {
      // Step 1: Grid settings
      box.innerHTML =
        '<div class="grid-wiz-header">' +
          '<span class="grid-wiz-title">Place as Grid</span>' +
          '<button class="grid-wiz-close">&times;</button>' +
        '</div>' +
        '<div class="grid-wiz-steps"><span class="active">1. Settings</span><span>2. Select Images</span></div>' +
        '<div class="grid-wiz-body">' +
          '<div class="grid-wiz-info">' +
            '<span style="color:var(--gold)">' + fObj.name + '</span> — ' +
            allItems.length + ' media item' + (allItems.length !== 1 ? 's' : '') +
            ' (direct, no subfolders)' +
          '</div>' +
          '<div class="grid-wiz-row">' +
            '<label>Columns</label>' +
            '<input type="number" id="gwiz-cols" min="1" max="12" value="' + gridCols + '">' +
          '</div>' +
          '<div class="grid-wiz-row">' +
            '<label>Rows</label>' +
            '<input type="number" id="gwiz-rows" min="1" max="12" value="' + gridRows + '">' +
          '</div>' +
          '<div class="grid-wiz-row">' +
            '<label>Gap (px)</label>' +
            '<input type="number" id="gwiz-gap" min="0" max="40" value="' + gridGap + '">' +
          '</div>' +
          '<div class="grid-wiz-row">' +
            '<label>Corner Radius</label>' +
            '<input type="number" id="gwiz-radius" min="0" max="40" value="' + gridRadius + '">' +
          '</div>' +
          '<div class="grid-wiz-hint">Grid will have ' + gridCols + '×' + gridRows + ' = ' + (gridCols * gridRows) + ' cells. ' +
            'You have ' + selectedCount + ' selected item' + (selectedCount !== 1 ? 's' : '') + '.</div>' +
        '</div>' +
        '<div class="grid-wiz-footer">' +
          '<button class="grid-wiz-btn secondary" id="gwiz-cancel">Cancel</button>' +
          '<button class="grid-wiz-btn primary" id="gwiz-next">Next →</button>' +
        '</div>';

      box.querySelector('.grid-wiz-close').onclick = close;
      box.querySelector('#gwiz-cancel').onclick = close;

      // Live update hint
      var colsIn = box.querySelector('#gwiz-cols');
      var rowsIn = box.querySelector('#gwiz-rows');
      function updateHint() {
        gridCols = Math.max(1, Math.min(12, parseInt(colsIn.value) || 1));
        gridRows = Math.max(1, Math.min(12, parseInt(rowsIn.value) || 1));
        gridGap = Math.max(0, Math.min(40, parseInt(box.querySelector('#gwiz-gap').value) || 0));
        gridRadius = Math.max(0, Math.min(40, parseInt(box.querySelector('#gwiz-radius').value) || 0));
        var hint = box.querySelector('.grid-wiz-hint');
        if (hint) hint.textContent = 'Grid will have ' + gridCols + '×' + gridRows + ' = ' + (gridCols * gridRows) + ' cells. You have ' + selectedCount + ' selected item' + (selectedCount !== 1 ? 's' : '') + '.';
      }
      colsIn.addEventListener('input', updateHint);
      rowsIn.addEventListener('input', updateHint);
      box.querySelector('#gwiz-gap').addEventListener('input', updateHint);
      box.querySelector('#gwiz-radius').addEventListener('input', updateHint);

      box.querySelector('#gwiz-next').onclick = function() {
        updateHint();
        step = 2;
        render();
      };

    } else if (step === 2) {
      // Step 2: Image selector
      var selectedCount2 = allItems.filter(function(i) { return i.selected; }).length;
      var totalCells = gridCols * gridRows;

      box.innerHTML =
        '<div class="grid-wiz-header">' +
          '<span class="grid-wiz-title">Select Images</span>' +
          '<button class="grid-wiz-close">&times;</button>' +
        '</div>' +
        '<div class="grid-wiz-steps"><span>1. Settings</span><span class="active">2. Select Images</span></div>' +
        '<div class="grid-wiz-body">' +
          '<div class="grid-wiz-sel-bar">' +
            '<span id="gwiz-sel-count">' + selectedCount2 + '/' + allItems.length + ' selected</span>' +
            '<span style="margin-left:4px;color:var(--text-dim)">(' + totalCells + ' cells available)</span>' +
            '<button class="grid-wiz-link" id="gwiz-sel-all">Select All</button>' +
            '<button class="grid-wiz-link" id="gwiz-sel-none">Deselect All</button>' +
          '</div>' +
          '<div class="grid-wiz-img-grid" id="gwiz-img-grid"></div>' +
        '</div>' +
        '<div class="grid-wiz-footer">' +
          '<button class="grid-wiz-btn secondary" id="gwiz-back">← Back</button>' +
          '<button class="grid-wiz-btn primary" id="gwiz-apply">Create Grid (' + selectedCount2 + ')</button>' +
        '</div>';

      box.querySelector('.grid-wiz-close').onclick = close;
      box.querySelector('#gwiz-back').onclick = function() { step = 1; render(); };

      var imgGrid = box.querySelector('#gwiz-img-grid');
      allItems.forEach(function(item, arrIdx) {
        var thumb = document.createElement('div');
        thumb.className = 'grid-wiz-thumb' + (item.selected ? ' selected' : '');
        thumb.dataset.arrIdx = arrIdx;
        var badge = item.isVideo ? '<span class="grid-wiz-vid-badge">▶</span>' : '';
        thumb.innerHTML =
          '<img src="' + (typeof _galThumbUrl === 'function' ? _galThumbUrl(item.dataUrl || '') : (item.dataUrl || '')) + '" loading="lazy" decoding="async">' +
          badge +
          '<span class="grid-wiz-check">✓</span>' +
          '<span class="grid-wiz-num">' + (arrIdx + 1) + '</span>';
        thumb.addEventListener('click', function() {
          item.selected = !item.selected;
          thumb.classList.toggle('selected', item.selected);
          updateSelCount();
        });
        imgGrid.appendChild(thumb);
      });

      function updateSelCount() {
        var sc = allItems.filter(function(i) { return i.selected; }).length;
        var el = box.querySelector('#gwiz-sel-count');
        if (el) el.textContent = sc + '/' + allItems.length + ' selected';
        var btn = box.querySelector('#gwiz-apply');
        if (btn) btn.textContent = 'Create Grid (' + sc + ')';
      }

      box.querySelector('#gwiz-sel-all').onclick = function() {
        allItems.forEach(function(i) { i.selected = true; });
        imgGrid.querySelectorAll('.grid-wiz-thumb').forEach(function(el) { el.classList.add('selected'); });
        updateSelCount();
      };
      box.querySelector('#gwiz-sel-none').onclick = function() {
        allItems.forEach(function(i) { i.selected = false; });
        imgGrid.querySelectorAll('.grid-wiz-thumb').forEach(function(el) { el.classList.remove('selected'); });
        updateSelCount();
      };

      box.querySelector('#gwiz-apply').onclick = function() {
        var selected = allItems.filter(function(i) { return i.selected; });
        if (selected.length === 0) {
          if (typeof showToast === 'function') showToast('Select at least one image');
          return;
        }
        close();
        _applyGridFromWizard(selected, gridCols, gridRows, gridGap, gridRadius);
      };
    }
  }

  document.body.appendChild(overlay);
  render();
}


/* ── Apply grid from wizard ── */
function _applyGridFromWizard(items, cols, rows, gap, radius) {
  var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  // Remove existing grid if any
  if (typeof findGridLayout === 'function') {
    var existing = findGridLayout(cvs);
    if (existing) {
      if (typeof _glRemoveAllPlusOverlays === 'function') _glRemoveAllPlusOverlays(cvs);
      if (typeof _glExitSelectMode === 'function') _glExitSelectMode();
      if (typeof _glRemoveAllVideos === 'function') _glRemoveAllVideos();
      if (typeof _glHideGridToolbar === 'function') _glHideGridToolbar();
      cvs.remove(existing);
    }
  }

  var grid = (typeof createGridLayout === 'function') ? createGridLayout(cols, rows, gap, '#1b1b1f', '#35353c', radius, 100) : null;
  if (!grid) return;

  cvs.add(grid);
  cvs.sendToBack(grid);
  cvs.renderAll();

  // Place images into cells sequentially
  var totalCells = cols * rows;
  var placed = 0;

  function placeNext() {
    if (placed >= items.length || placed >= totalCells) {
      // Done placing
      cvs.setActiveObject(grid);
      cvs.renderAll();
      if (typeof _glRenderPlusOverlays === 'function') setTimeout(function() { _glRenderPlusOverlays(grid); }, 100);
      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
      if (typeof showToast === 'function') showToast(placed + ' image' + (placed !== 1 ? 's' : '') + ' placed in ' + cols + '×' + rows + ' grid');
      return;
    }

    var item = items[placed];
    var row = Math.floor(placed / cols);
    var col = placed % cols;
    var cell = grid.getCell(row, col);
    if (!cell) { placed++; placeNext(); return; }

    var src = item.isVideo ? (item.entry.poster || item.dataUrl) : item.dataUrl;
    if (!src) { placed++; placeNext(); return; }

    if (typeof _glPlaceImageInCell === 'function') {
      _glPlaceImageInCell(grid, cell, src);
    }
    placed++;
    // Small delay to avoid overloading image loading
    setTimeout(placeNext, 80);
  }

  placeNext();
}


if (window.cc && cc.modules) cc.modules.register({ id: 'grid', parent: 'left-panel.gallery.browser', title: 'Gallery: grid', mount: function(){}, unmount: function(){} });
