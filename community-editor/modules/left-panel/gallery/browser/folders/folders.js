/* gallery/browser/folders — folder UI — create/rename/delete/icon popups, folder cards, folder navigation. Split from gallery.js (approved plan). FLAT sub-module:
   functions stay window globals (the panel/each other call them at runtime). Registers under left-panel.gallery.browser. */


/* ── Folder Creation Popup ── */
function openFolderCreatePopup(presetParentId) {
  var store = _galInit();
  var overlay = document.getElementById('folder-create-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  var nameInput = document.getElementById('fc-name');
  var typeMain = document.getElementById('fc-type-main');
  var typeSub = document.getElementById('fc-type-sub');
  var parentRow = document.getElementById('fc-parent-row');
  var parentSel = document.getElementById('fc-parent-select');
  var iconGrid = document.getElementById('fc-icon-grid');
  var createBtn = document.getElementById('fc-create-btn');
  var titleEl = document.getElementById('fc-title');

  // ── Tab switching ──
  var tabs = overlay.querySelectorAll('.fc-tab');
  var tabCreate = document.getElementById('fc-tab-create');
  var tabUpload = document.getElementById('fc-tab-upload');
  var tabsRow = document.getElementById('fc-tabs');
  tabs.forEach(function(tab) {
    tab.onclick = function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var which = tab.dataset.tab;
      if (tabCreate) tabCreate.style.display = which === 'create' ? '' : 'none';
      if (tabUpload) tabUpload.style.display = which === 'upload' ? '' : 'none';
      if (titleEl) titleEl.textContent = which === 'upload' ? 'Upload Folder' : 'New Folder';
    };
  });
  // Reset to Create tab
  tabs.forEach(function(t) { t.classList.remove('active'); });
  if (tabs[0]) tabs[0].classList.add('active');
  if (tabCreate) tabCreate.style.display = '';
  if (tabUpload) tabUpload.style.display = 'none';
  if (titleEl) titleEl.textContent = 'New Folder';
  if (tabsRow) tabsRow.style.display = '';

  // ── Upload zone setup ──
  var uploadZone = document.getElementById('fc-upload-zone');
  if (uploadZone) {
    // Set icon
    var iconEl = uploadZone.querySelector('.fc-upload-icon');
    if (iconEl) iconEl.innerHTML = (typeof getIcon === 'function') ? getIcon('folderUp', 36) : '';

    // Click to browse
    uploadZone.onclick = function() {
      _uploadFolderToGallery(presetParentId || null);
      overlay.style.display = 'none';
    };

    // Drag-drop onto zone
    uploadZone.ondragenter = function(e) { e.preventDefault(); e.stopPropagation(); uploadZone.classList.add('drag-over'); };
    uploadZone.ondragover = function(e) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; };
    uploadZone.ondragleave = function(e) { e.preventDefault(); e.stopPropagation(); uploadZone.classList.remove('drag-over'); };
    uploadZone.ondrop = function(e) {
      e.preventDefault(); e.stopPropagation();
      uploadZone.classList.remove('drag-over');
      overlay.style.display = 'none';
      var items = e.dataTransfer.items;
      if (!items) return;
      var parentForUpload = presetParentId || null;
      // Capture legacy entries synchronously (DataTransferItemList empties after handler)
      var legEntries = [];
      for (var li = 0; li < items.length; li++) {
        var le = items[li].webkitGetAsEntry ? items[li].webkitGetAsEntry() : (items[li].getAsEntry ? items[li].getAsEntry() : null);
        if (le && le.isDirectory) legEntries.push(le);
      }
      // Try modern API first
      var useModern = items[0] && typeof items[0].getAsFileSystemHandle === 'function';
      if (window.UploadQueue) window.UploadQueue.reset();
      if (useModern) {
        var promises = [];
        for (var mi = 0; mi < items.length; mi++) {
          if (items[mi].kind === 'file') promises.push(items[mi].getAsFileSystemHandle());
        }
        Promise.all(promises).then(function(handles) {
          handles.forEach(function(h) {
            if (h.kind === 'directory') _readDroppedFolderModern(h, parentForUpload);
          });
        }).catch(function() {
          legEntries.forEach(function(le) { _readDroppedFolder(le, parentForUpload); });
        });
      } else {
        legEntries.forEach(function(le) { _readDroppedFolder(le, parentForUpload); });
      }
    };
  }

  if (nameInput) nameInput.value = '';

  // Hide role input (only used in edit mode)
  var roleInput = document.getElementById('fc-role');
  if (roleInput) roleInput.style.display = 'none';

  // Determine if we have main folders available for sub-folder creation (same mediaType)
  var fcMediaType = _activeMediaCat || 'image';
  var mainFolders = store.folders.filter(function(f) { return !f.parentId && (f.mediaType || 'image') === fcMediaType; });
  var sameCatFolders = store.folders.filter(function(f) { return (f.mediaType || 'image') === fcMediaType; });

  if (presetParentId) {
    // Opening as sub-folder with preset parent
    if (typeSub) typeSub.checked = true;
    if (typeMain) typeMain.checked = false;
    if (parentRow) parentRow.style.display = '';
    _populateParentSelect(parentSel, store.folders, presetParentId, fcMediaType);
  } else if (mainFolders.length === 0) {
    // No main folders exist — force main
    if (typeMain) typeMain.checked = true;
    if (typeSub) typeSub.checked = false;
    if (parentRow) parentRow.style.display = 'none';
  } else {
    if (typeMain) typeMain.checked = true;
    if (typeSub) typeSub.checked = false;
    if (parentRow) parentRow.style.display = 'none';
  }

  // Type radio toggle
  var typeRadios = overlay.querySelectorAll('input[name="fc-type"]');
  typeRadios.forEach(function(r) {
    r.onchange = function() {
      if (typeSub && typeSub.checked) {
        if (mainFolders.length === 0) {
          if (typeof showToast === 'function') showToast('Create a main folder first', 'warning');
          if (typeMain) typeMain.checked = true;
          if (typeSub) typeSub.checked = false;
          return;
        }
        if (parentRow) parentRow.style.display = '';
        _populateParentSelect(parentSel, store.folders, null, fcMediaType);
      } else {
        if (parentRow) parentRow.style.display = 'none';
      }
    };
  });

  // Icon picker (searchable, full Lucide library)
  var selectedIcon = 'folder';
  if (iconGrid) _galIconPicker(iconGrid, selectedIcon, function(ic) { selectedIcon = ic; });

  // Create button
  if (createBtn) {
    createBtn.onclick = function() {
      var name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        if (nameInput) nameInput.focus();
        return;
      }
      var parentId = null;
      if (typeSub && typeSub.checked && parentSel) {
        parentId = parentSel.value;
      }
      galAddFolder(name, selectedIcon, parentId, _activeMediaCat || 'image');
      overlay.style.display = 'none';
      if (typeof showToast === 'function') showToast('Folder created: ' + name);
      // Stay in current folder view if we were inside one
      var subView = document.getElementById('images-sub-view');
      var subContent = document.getElementById('images-sub-content');
      var currentViewFolderId = (subView && subView.style.display !== 'none' && subContent) ? subContent.dataset.folderId : null;
      setTimeout(function() {
        if (currentViewFolderId) {
          drillIntoFolder(currentViewFolderId);
        } else {
          renderImagesCategoryView();
        }
      }, 50);
    };
  }

  // Close button
  var closeBtn = document.getElementById('fc-close-btn');
  if (closeBtn) {
    closeBtn.onclick = function() { overlay.style.display = 'none'; };
  }

  // Click outside to close
  overlay.onclick = function(e) {
    if (e.target === overlay) overlay.style.display = 'none';
  };

  if (nameInput) setTimeout(function() { nameInput.focus(); }, 100);
}


function _populateParentSelect(sel, folders, selectedId, mediaType) {
  if (!sel) return;
  sel.innerHTML = '';
  var filterType = mediaType || _activeMediaCat || 'image';
  // Only allow selecting folders at depth 0 or 1 (max nesting = 3 levels)
  // Filter by same media type
  folders.forEach(function(f) {
    if ((f.mediaType || 'image') !== filterType) return;
    // Calculate folder depth
    var depth = 0;
    var pid = f.parentId;
    while (pid) {
      depth++;
      var pf = folders.filter(function(x){ return x.id === pid; })[0];
      pid = pf ? pf.parentId : null;
    }
    if (depth > 1) return; // Don't allow creating children of deep folders
    var prefix = '';
    for (var i = 0; i < depth; i++) prefix += '─ ';
    var opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = prefix + f.name;
    if (f.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}


/* ── Show/hide folder create button in flyout header ── */
function _showFolderCreateHeaderBtn(show) {
  var header = document.querySelector('.flyout-header');
  if (!header) return;
  // Ensure a grouped container for header action buttons
  var btnGroup = document.getElementById('gal-header-btn-group');
  if (!btnGroup) {
    btnGroup = document.createElement('div');
    btnGroup.id = 'gal-header-btn-group';
    btnGroup.className = 'gal-header-btn-group';
    header.appendChild(btnGroup);
  }
  var existing = document.getElementById('gal-folder-create-btn');
  if (!show) {
    if (existing) existing.style.display = 'none';
    var tb = document.getElementById('gal-trash-header-btn');
    if (tb) tb.style.display = 'none';
    // Hide the Library/Stock switcher too (it lives in this same header).
    var seg = document.getElementById('media-mode-seg');
    if (seg) seg.style.display = 'none';
    header.classList.remove('has-media-seg');
    return;
  }
  if (!existing) {
    existing = document.createElement('button');
    existing.id = 'gal-folder-create-btn';
    existing.className = 'gal-header-folder-btn';
    existing.title = 'Create New Folder';
    existing.innerHTML = (typeof getIcon === 'function') ? getIcon('folderPlus', 16) : '+';
    existing.addEventListener('click', function() { openFolderCreatePopup(null); });
    btnGroup.appendChild(existing);
  }
  existing.style.display = '';

  // ── Trash button ──
  var trashBtn = document.getElementById('gal-trash-header-btn');
  if (!trashBtn) {
    trashBtn = document.createElement('button');
    trashBtn.id = 'gal-trash-header-btn';
    trashBtn.className = 'gal-header-trash-btn';
    trashBtn.title = 'Trash';
    trashBtn.style.position = 'relative';
    trashBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    trashBtn.addEventListener('click', function() { drillIntoTrash(); });
    // Insert before folder button inside the group
    btnGroup.insertBefore(trashBtn, existing);
  }
  trashBtn.style.display = '';
  _updateTrashBadge();
}


/* ── Create a folder card element ── (folders share one calm neutral look; the per-folder random
   accent palette was removed — owner: "çok renkli ve kötü") */
function _createFolderCard(folder) {
  var card = document.createElement('div');
  card.className = 'img-cat-card gal-folder-card';
  card.dataset.folderId = folder.id;
  card.setAttribute('draggable', 'true');

  var iconHtml = (typeof getIcon === 'function') ? getIcon(folder.icon || 'folder', 22) : '';
  var editIconHtml = (typeof getIcon === 'function') ? getIcon('pencil', 12) : '&#9998;';
  var count = galCountImages(folder.id);
  var children = galGetChildren(folder.id);
  var subText = children.length > 0 ? (children.length + ' subfolder' + (children.length > 1 ? 's' : '')) : '';
  var folderMediaType = folder.mediaType || 'image';
  var fLabels = _galMediaLabels[folderMediaType] || _galMediaLabels.image;

  var imgLabel = count + ' ' + (count !== 1 ? fLabels.plural : fLabels.singular);
  var meta = subText ? (subText + (count > 0 ? ' · ' + imgLabel : '')) : imgLabel;
  card.innerHTML =
    '<button class="gal-folder-edit" title="Edit folder">' + editIconHtml + '</button>' +
    '<div class="img-cat-icon">' + iconHtml + '</div>' +
    '<div class="img-cat-text">' +
      '<div class="img-cat-name">' + _escHtml(folder.name) + '</div>' +
      '<div class="img-cat-desc">' + meta + '</div>' +
    '</div>';

  // Edit button click
  card.querySelector('.gal-folder-edit').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    _openFolderEditPopup(folder);
  });

  card.addEventListener('click', function(e) {
    if (e.defaultPrevented) return;
    drillIntoFolder(folder.id);
  });

  // Drag start for folder
  card.addEventListener('dragstart', function(e) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', folderId: folder.id }));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('gal-dragging');
  });
  card.addEventListener('dragend', function() {
    card.classList.remove('gal-dragging');
    document.querySelectorAll('.gal-dragover').forEach(function(el) { el.classList.remove('gal-dragover'); });
  });

  // Drop target for images and folders
  card.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    card.classList.add('gal-dragover');
  });
  card.addEventListener('dragleave', function() {
    card.classList.remove('gal-dragover');
  });
  card.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('gal-dragover');
    // Determine where we currently are — stay in that view after move
    // Only use folderId if subView is actually visible (prevents ghost-ID teleport after folder delete)
    var subView = document.getElementById('images-sub-view');
    var subContent = document.getElementById('images-sub-content');
    var currentViewFolderId = (subView && subView.style.display !== 'none' && subContent) ? subContent.dataset.folderId : null;
    var refreshView = function() {
      if (currentViewFolderId) {
        drillIntoFolder(currentViewFolderId);
      } else {
        renderImagesCategoryView();
      }
    };
    try {
      var data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type === 'image') {
        galMoveImage(data.srcFolder, data.imgIdx, folder.id);
        refreshView();
        if (typeof showToast === 'function') showToast('Image moved to ' + _escHtml(folder.name));
      } else if (data.type === 'video') {
        galMoveImage(data.srcFolder, data.imgIdx, folder.id);
        refreshView();
        if (typeof showToast === 'function') showToast('Video moved to ' + _escHtml(folder.name));
      } else if (data.type === 'audio') {
        galMoveImage(data.srcFolder, data.imgIdx, folder.id);
        refreshView();
        if (typeof showToast === 'function') showToast('Audio moved to ' + _escHtml(folder.name));
      } else if (data.type === 'folder' && data.folderId !== folder.id) {
        galMoveFolder(data.folderId, folder.id);
        refreshView();
        if (typeof showToast === 'function') showToast('Folder moved');
      }
    } catch(ex) {}
  });

  // Context menu for folder actions
  card.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    _showFolderContextMenu(e, folder);
  });

  return card;
}


/* ── Folder context menu ── */
function _showFolderContextMenu(e, folder) {
  // Remove any existing
  var existing = document.querySelector('.gal-folder-ctx');
  if (existing) existing.remove();

  var menu = document.createElement('div');
  menu.className = 'gal-folder-ctx';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  menu.innerHTML =
    '<button data-act="gridWizard">Place as Grid</button>' +
    '<div style="height:1px;background:var(--border);margin:3px 0"></div>' +
    '<button data-act="rename">Rename</button>' +
    '<button data-act="icon">Change Icon</button>' +
    '<button data-act="subfolder">Add Subfolder</button>' +
    '<button data-act="export">' + (typeof getIcon === 'function' ? getIcon('download', 13) + ' ' : '') + 'Export as ZIP</button>' +
    '<div style="height:1px;background:var(--border);margin:3px 0"></div>' +
    '<button data-act="delete" style="color:#e74c3c">Delete Folder</button>';

  document.body.appendChild(menu);

  menu.addEventListener('click', function(ev) {
    var btn = ev.target.closest('[data-act]');
    var act = btn ? btn.dataset.act : '';
    menu.remove();
    if (act === 'gridWizard') {
      _showGridPlaceWizard(folder);
    } else if (act === 'rename') {
      _galPromptModal({
        title: 'Rename folder',
        value: folder.name,
        placeholder: 'Folder name…',
        confirmText: 'Rename',
        onConfirm: function (newName) {
          galRenameFolder(folder.id, newName);
          _galRefreshCurrentView();
        }
      });
    } else if (act === 'icon') {
      _showFolderIconPicker(folder);
    } else if (act === 'subfolder') {
      openFolderCreatePopup(folder.id);
    } else if (act === 'export') {
      _exportFolderAsZip(folder);
    } else if (act === 'delete') {
      _showFolderDeleteConfirm(folder, function() {
        renderImagesCategoryView();
        if (typeof showToast === 'function') showToast('Folder "' + folder.name + '" deleted');
      });
    }
  });

  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function handler() {
      if (menu.parentNode) menu.remove();
      document.removeEventListener('click', handler);
    });
  }, 10);
}


/* ── Folder icon picker (inline popup) ── */
function _showFolderIconPicker(folder) {
  var overlay = document.getElementById('folder-create-overlay');
  if (!overlay) return;
  // Reuse popup but in "icon change" mode
  overlay.style.display = 'flex';
  var nameInput = document.getElementById('fc-name');
  var typeRow = document.querySelector('.fc-type-row');
  var parentRow = document.getElementById('fc-parent-row');
  var createBtn = document.getElementById('fc-create-btn');
  var iconGrid = document.getElementById('fc-icon-grid');
  var titleEl = document.getElementById('fc-title');

  if (nameInput) nameInput.style.display = 'none';
  if (typeRow) typeRow.style.display = 'none';
  if (parentRow) parentRow.style.display = 'none';
  if (titleEl) titleEl.textContent = 'Choose Icon';
  if (createBtn) createBtn.innerHTML = _galBtnLabel('Save');
  var roleInput = document.getElementById('fc-role');
  if (roleInput) roleInput.style.display = 'none';

  var selectedIcon = folder.icon || 'folder';
  if (iconGrid) _galIconPicker(iconGrid, selectedIcon, function(ic) { selectedIcon = ic; });

  if (createBtn) {
    createBtn.onclick = function() {
      galChangeFolderIcon(folder.id, selectedIcon);
      overlay.style.display = 'none';
      // Restore popup to normal mode
      if (nameInput) nameInput.style.display = '';
      if (typeRow) typeRow.style.display = '';
      if (titleEl) titleEl.textContent = 'New Folder';
      if (createBtn) createBtn.innerHTML = _galBtnLabel('Create');
      renderImagesCategoryView();
    };
  }

  var closeBtn = document.getElementById('fc-close-btn');
  if (closeBtn) {
    closeBtn.onclick = function() {
      overlay.style.display = 'none';
      if (nameInput) nameInput.style.display = '';
      if (typeRow) typeRow.style.display = '';
      if (titleEl) titleEl.textContent = 'New Folder';
      if (createBtn) createBtn.innerHTML = _galBtnLabel('Create');
    };
  }
  overlay.onclick = function(ev) {
    if (ev.target === overlay) {
      overlay.style.display = 'none';
      if (nameInput) nameInput.style.display = '';
      if (typeRow) typeRow.style.display = '';
      if (titleEl) titleEl.textContent = 'New Folder';
      if (createBtn) createBtn.innerHTML = _galBtnLabel('Create');
    }
  };
}


/* ── Folder Delete: 2-step overlay confirmation ── */
function _showFolderDeleteConfirm(folder, onDone) {
  var existing = document.getElementById('folder-delete-overlay');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'folder-delete-overlay';
  ov.className = 'kit-overlay';

  var box = document.createElement('div');
  box.className = 'kit-dialog kit-dialog--center';

  function close() { ov.remove(); }
  ov.addEventListener('click', function(ev) { if (ev.target === ov) close(); });

  // Step 1
  box.innerHTML =
    '<div class="kit-dialog-title kit-dialog-title--danger">Delete Folder</div>' +
    '<div class="kit-dialog-text">Are you sure you want to delete <strong>' + _escHtml(folder.name) + '</strong> and all its subfolders?<br>Images will be moved to Recent Uploads.</div>' +
    '<div class="kit-dialog-actions">' +
      '<button id="fd-cancel" class="kit-btn-ghost">Cancel</button>' +
      '<button id="fd-next" class="kit-btn-danger">Yes, delete</button>' +
    '</div>';

  ov.appendChild(box);
  document.body.appendChild(ov);

  document.getElementById('fd-cancel').onclick = close;
  document.getElementById('fd-next').onclick = function() {
    // Step 2: type name
    box.innerHTML =
      '<div class="kit-dialog-title kit-dialog-title--danger">Confirm Deletion</div>' +
      '<div class="kit-dialog-text">Type <strong>' + _escHtml(folder.name) + '</strong> to confirm</div>' +
      '<input type="text" id="fd-name" class="wiz-input" style="width:100%;margin-bottom:12px;box-sizing:border-box" placeholder="Folder name" autocomplete="off">' +
      '<div class="kit-dialog-actions">' +
        '<button id="fd-cancel2" class="kit-btn-ghost">Cancel</button>' +
        '<button id="fd-final" class="kit-btn-danger" disabled>Delete</button>' +
      '</div>';
    var inp = document.getElementById('fd-name');
    var btn = document.getElementById('fd-final');
    inp.oninput = function() { btn.disabled = inp.value.trim() !== folder.name; };
    document.getElementById('fd-cancel2').onclick = close;
    btn.onclick = function() {
      if (inp.value.trim() !== folder.name) return;
      galDeleteFolder(folder.id);
      close();
      if (onDone) onDone();
    };
    setTimeout(function() { inp.focus(); }, 50);
  };
}


/* ── Folder Edit Popup (icon, name, role) ── */
function _openFolderEditPopup(folder) {
  var overlay = document.getElementById('folder-create-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  var nameInput = document.getElementById('fc-name');
  var typeRow = document.querySelector('.fc-type-row');
  var parentRow = document.getElementById('fc-parent-row');
  var createBtn = document.getElementById('fc-create-btn');
  var iconGrid = document.getElementById('fc-icon-grid');
  var titleEl = document.getElementById('fc-title');
  var tabsRow = document.getElementById('fc-tabs');
  var tabCreate = document.getElementById('fc-tab-create');
  var tabUpload = document.getElementById('fc-tab-upload');

  // Hide tabs and upload tab in edit mode — show only create content
  if (tabsRow) tabsRow.style.display = 'none';
  if (tabCreate) tabCreate.style.display = '';
  if (tabUpload) tabUpload.style.display = 'none';

  // Switch to edit mode
  if (typeRow) typeRow.style.display = 'none';
  if (parentRow) parentRow.style.display = 'none';
  if (titleEl) titleEl.textContent = 'Edit Folder';
  if (createBtn) createBtn.innerHTML = _galBtnLabel('Save');
  if (nameInput) {
    nameInput.style.display = '';
    nameInput.value = folder.name || '';
  }

  // Insert role input if not present
  var roleInput = document.getElementById('fc-role');
  if (!roleInput) {
    roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.id = 'fc-role';
    roleInput.className = 'wiz-input fc-role-input';
    roleInput.placeholder = 'Folder role (e.g. Logos, Backgrounds...)';
    roleInput.maxLength = 60;
    if (nameInput && nameInput.parentNode) {
      nameInput.parentNode.insertBefore(roleInput, nameInput.nextSibling);
    }
  }
  roleInput.style.display = '';
  roleInput.value = folder.role || '';

  // Icon grid
  var selectedIcon = folder.icon || 'folder';
  if (iconGrid) _galIconPicker(iconGrid, selectedIcon, function(ic) { selectedIcon = ic; });

  function _restorePopup() {
    overlay.style.display = 'none';
    if (nameInput) { nameInput.style.display = ''; nameInput.value = ''; }
    if (typeRow) typeRow.style.display = '';
    if (titleEl) titleEl.textContent = 'New Folder';
    if (createBtn) createBtn.innerHTML = _galBtnLabel('Create');
    if (roleInput) roleInput.style.display = 'none';
    if (tabsRow) tabsRow.style.display = '';
    // Remove delete zone if present
    var dz = document.getElementById('fc-delete-zone');
    if (dz) dz.remove();
  }

  // ── Delete Folder button (danger zone) ──
  var existingDz = document.getElementById('fc-delete-zone');
  if (existingDz) existingDz.remove();
  var deleteZone = document.createElement('div');
  deleteZone.id = 'fc-delete-zone';
  deleteZone.style.cssText = 'margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)';
  deleteZone.innerHTML =
    '<button type="button" id="fc-delete-btn" style="width:100%;padding:8px 0;border:1px solid #e5555544;border-radius:8px;background:transparent;color:#e55;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s">' +
      (typeof getIcon === 'function' ? getIcon('trash-2', 14) : '') +
      '<span>Delete Folder</span>' +
    '</button>';
  var modalBody = createBtn ? createBtn.parentNode : null;
  if (modalBody) modalBody.appendChild(deleteZone);

  var delBtn = deleteZone.querySelector('#fc-delete-btn');
  delBtn.onmouseenter = function() { delBtn.style.background = '#e5555522'; };
  delBtn.onmouseleave = function() { delBtn.style.background = 'transparent'; };
  delBtn.onclick = function() {
    _showFolderDeleteConfirm(folder, function() {
      _restorePopup();
      renderImagesCategoryView();
      if (typeof showToast === 'function') showToast('Folder "' + folder.name + '" deleted');
    });
  };

  if (createBtn) {
    createBtn.onclick = function() {
      var newName = nameInput ? nameInput.value.trim() : '';
      if (!newName) { if (nameInput) nameInput.focus(); return; }
      var newRole = roleInput ? roleInput.value.trim() : '';
      // Save changes
      galRenameFolder(folder.id, newName);
      galChangeFolderIcon(folder.id, selectedIcon);
      // Save role
      var store = _galInit();
      var f = store.folders.filter(function(x){ return x.id === folder.id; })[0];
      if (f) { f.role = newRole; _galSave(store); }
      _restorePopup();
      renderImagesCategoryView();
      if (typeof showToast === 'function') showToast('Folder updated');
    };
  }

  var closeBtn = document.getElementById('fc-close-btn');
  if (closeBtn) { closeBtn.onclick = function() { _restorePopup(); }; }
  overlay.onclick = function(ev) { if (ev.target === overlay) _restorePopup(); };

  if (nameInput) setTimeout(function() { nameInput.focus(); }, 100);
}


/* ── Drill into a folder (show sub-folders + images) ── */
function drillIntoFolder(folderId) {
  var catView = document.getElementById('images-cat-view');
  var subView = document.getElementById('images-sub-view');
  var titleEl = document.getElementById('images-sub-title');
  var content = document.getElementById('images-sub-content');
  if (catView) catView.style.display = 'none';
  if (subView) subView.style.display = '';

  // Also hide recently generated elements below cat view
  var recentEls = document.querySelectorAll('.gal-recent-section, .gal-image-grid[data-folder-id="__recent"], .gal-empty-msg, .gal-fixed-section, .gal-fixed-grid');
  recentEls.forEach(function(el) { el.style.display = 'none'; });

  var store = _galInit();
  var folder = store.folders.filter(function(f){ return f.id === folderId; })[0];
  if (!folder) return;

  if (titleEl) titleEl.textContent = folder.name;
  if (!content) return;
  content.innerHTML = '';
  content.dataset.folderId = folderId;

  // Breadcrumb-aware back button
  var backBtn = document.getElementById('images-back-btn');
  if (backBtn) {
    backBtn.onclick = function() {
      if (folder.parentId) {
        drillIntoFolder(folder.parentId);
      } else {
        renderImagesCategoryView();
      }
    };

    // Drop onto back/title bar → move item to parent folder (or recent if no parent)
    backBtn.ondragover = function(e) {
      var json = e.dataTransfer.types && (e.dataTransfer.types.indexOf('text/plain') !== -1 ||
        (typeof e.dataTransfer.types.contains === 'function' && e.dataTransfer.types.contains('text/plain')));
      if (!json) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      backBtn.classList.add('gal-back-drop-hover');
    };
    backBtn.ondragleave = function() {
      backBtn.classList.remove('gal-back-drop-hover');
    };
    backBtn.ondrop = function(e) {
      e.preventDefault();
      e.stopPropagation();
      backBtn.classList.remove('gal-back-drop-hover');
      try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));
        var destId = folder.parentId || '__recent';
        if (data.type === 'image' || data.type === 'video' || data.type === 'audio') {
          galMoveImage(data.srcFolder, data.imgIdx, destId);
          if (folder.parentId) {
            drillIntoFolder(folder.parentId);
          } else {
            renderImagesCategoryView();
          }
          if (typeof showToast === 'function') showToast('Moved to ' + (folder.parentId ? 'parent folder' : 'library'));
        }
      } catch(ex) {}
    };
  }

  // ── In-folder search ──
  var searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'margin-bottom:10px';
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search in ' + folder.name + '...';
  searchInput.className = 'gal-folder-search';
  searchWrap.appendChild(searchInput);
  content.appendChild(searchWrap);

  searchInput.addEventListener('input', function() {
    var q = searchInput.value.trim().toLowerCase();
    content.querySelectorAll('.gallery-cell').forEach(function(cell) {
      var nameEl = cell.querySelector('.gallery-cell-name');
      var txt = nameEl ? nameEl.textContent.toLowerCase() : '';
      cell.style.display = (!q || txt.indexOf(q) !== -1) ? '' : 'none';
    });
    content.querySelectorAll('.gal-folder-card').forEach(function(card) {
      var nameEl = card.querySelector('.img-cat-name');
      var txt = nameEl ? nameEl.textContent.toLowerCase() : '';
      card.style.display = (!q || txt.indexOf(q) !== -1) ? '' : 'none';
    });
  });

  // ── Sub-folders ──
  var children = galGetChildren(folderId);
  if (children.length > 0) {
    var subGrid = document.createElement('div');
    subGrid.className = 'gal-subfolder-grid';
    children.forEach(function(child) {
      var card = _createFolderCard(child);
      subGrid.appendChild(card);
    });
    // "Add sub-folder" card
    var addCard = document.createElement('div');
    addCard.className = 'img-cat-card gal-add-folder-card';
    addCard.innerHTML =
      '<div class="img-cat-icon">' + ((typeof getIcon === 'function') ? getIcon('folderPlus', 18) : '+') + '</div>' +
      '<div class="img-cat-name" style="font-size:10px">Subfolder</div>';
    addCard.addEventListener('click', function() { openFolderCreatePopup(folderId); });
    subGrid.appendChild(addCard);
    content.appendChild(subGrid);
  } else {
    // Add sub-folder button (inline)
    var addBtn = document.createElement('button');
    addBtn.className = 'el-btn gal-add-sub-btn';
    addBtn.innerHTML = ((typeof getIcon === 'function') ? getIcon('folderPlus', 14) : '+') + ' Add Subfolder';
    addBtn.addEventListener('click', function() { openFolderCreatePopup(folderId); });
    content.appendChild(addBtn);
  }

  // ── Images in this folder ──
  if (folder.images && folder.images.length > 0) {
    var imgGrid = document.createElement('div');
    imgGrid.className = 'gal-image-grid';
    imgGrid.dataset.folderId = folderId;
    folder.images.forEach(function(entry, idx) {
      var isVideo = (typeof entry === 'object' && entry !== null && entry.type === 'video');
      var isAudio = (typeof entry === 'object' && entry !== null && entry.type === 'audio');
      if (isAudio) {
        var audioCell = _createGalleryAudioCell(entry, folderId, idx);
        imgGrid.appendChild(audioCell);
        return;
      }
      var dataUrl = isVideo ? (entry.poster || '') : (typeof entry === 'string' ? entry : '');
      var displayName = isVideo ? (entry.name || 'Video ' + (idx + 1)) : null;
      var cell = _createImageCell(dataUrl, folderId, idx, displayName);
      if (isVideo) {
        _patchVideoCell(cell, entry, folderId, idx);
        var badge = document.createElement('div');
        badge.className = 'gallery-cell-play-badge';
        badge.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>';
        cell.style.position = 'relative';
        cell.appendChild(badge);
      }
      imgGrid.appendChild(cell);
    });
    content.appendChild(imgGrid);
  } else if (children.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'gal-empty-msg';
    empty.textContent = 'This folder is empty. Drag images here.';
    content.appendChild(empty);
  }

  // Drop zone for the entire folder content area. Handles BOTH internal gallery
  // moves (text/plain JSON) AND desktop file/folder drops (→ sub-folders + files).
  if (!content._dropHandlerAttached) {
    content._dropHandlerAttached = true;
    var _dtHasFiles = function(dt) {
      if (!dt || !dt.types) return false;
      return dt.types.indexOf ? dt.types.indexOf('Files') !== -1 : (dt.types.contains && dt.types.contains('Files'));
    };
    content.addEventListener('dragover', function(e) {
      // Don't interfere if hovering over a folder card (it handles its own drag)
      if (e.target.closest && e.target.closest('.gal-folder-card')) return;
      e.preventDefault();
      var fromDesktop = _dtHasFiles(e.dataTransfer);
      e.dataTransfer.dropEffect = fromDesktop ? 'copy' : 'move';
      content.classList.add('gal-folder-drop-active');
    });
    content.addEventListener('dragleave', function(e) {
      // Only clear when the pointer actually leaves the content box
      if (!e.relatedTarget || !content.contains(e.relatedTarget)) content.classList.remove('gal-folder-drop-active');
    });
    content.addEventListener('drop', function(e) {
      // Let folder card drop handlers handle their own drops
      if (e.target.closest && e.target.closest('.gal-folder-card')) return;
      content.classList.remove('gal-folder-drop-active');
      var targetFolderId = content.dataset.folderId;
      // Desktop file/folder drop → import into THIS folder (folders become sub-folders)
      if (_dtHasFiles(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        _handleGalleryDesktopDrop(e, targetFolderId);
        return;
      }
      // Internal move of an existing gallery item
      e.preventDefault();
      try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.type === 'image' || data.type === 'video' || data.type === 'audio') {
          galMoveImage(data.srcFolder, data.imgIdx, targetFolderId);
          drillIntoFolder(targetFolderId);
          if (typeof showToast === 'function') showToast((data.type.charAt(0).toUpperCase() + data.type.slice(1)) + ' moved');
        }
      } catch(ex) {}
    });
  }

  // Re-apply the toolbar filters (density / sort / size) to the fresh grid.
  if (typeof _galApplyGridFilters === 'function') _galApplyGridFilters();
}


function _getFolderLabel(folderId, store) {
  if (!folderId || folderId === '__recent') return 'Recent Uploads';
  var f = (store || _galInit()).folders.filter(function(x) { return x.id === folderId; })[0];
  return f ? f.name : 'Unknown';
}


if (window.cc && cc.modules) cc.modules.register({ id: 'folders', parent: 'left-panel.gallery.browser', title: 'Gallery: folders', mount: function(){}, unmount: function(){} });
