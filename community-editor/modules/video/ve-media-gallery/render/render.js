/* Module: video/ve-media-gallery/render — Library / grid / list / folder drill-in rendering.
   Part of the ve-media-gallery group (decomposed from the 1480-line IIFE). Functions hang off the
   shared namespace VMG (window.__ccVEMediaGallery, created by the parent); cross-module refs resolve
   through VMG at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMG = window.__ccVEMediaGallery;
  if (!VMG) return;

  VMG._renderContent = function () {
    var container = document.getElementById('ve-mg-content');
    if (!container) return;

    if (VMG._activeSource === 'library') {
      VMG._renderLibrary(container);
    } else {
      VMG._renderStock(container);
    }
  };

  VMG._renderLibrary = function (container) {
    if (VMG._drillFolderId) {
      VMG._renderFolderDrillIn(container);
      return;
    }

    var allItems = VMG._getItemsForCategory();
    var filtered = VMG._getFilteredItems(allItems);
    var rootFolders = VMG._getSubfolders(null);
    var catLabel = VMG._activeCategory.charAt(0).toUpperCase() + VMG._activeCategory.slice(1);

    var html = '';

    // "All [Category]" summary card
    html += '<div class="ve-mg-all-card" id="ve-mg-all-card">' +
      '<div class="ve-mg-all-icon">' + VMG._icon(VMG.CAT_ICONS[VMG._activeCategory], 20) + '</div>' +
      '<div class="ve-mg-all-info">' +
        '<div class="ve-mg-all-title">All ' + catLabel + 's</div>' +
        '<div class="ve-mg-all-count">' + allItems.length + ' item' + (allItems.length !== 1 ? 's' : '') + '</div>' +
      '</div>' +
    '</div>';

    // Folders section
    if (rootFolders.length > 0 || !VMG._filterText) {
      html += '<div class="ve-mg-section">';
      html += '<div class="ve-mg-section-header">' +
        '<span>' + VMG._icon('folder', 12) + ' Folders</span>' +
        '<button class="ve-mg-btn ve-mg-add-folder-btn" title="New Folder">' + VMG._icon('folder-plus', 12) + '</button>' +
      '</div>';
      html += '<div class="ve-mg-folder-grid">';
      for (var i = 0; i < rootFolders.length; i++) {
        var f = rootFolders[i];
        if (VMG._filterText && f.name.toLowerCase().indexOf(VMG._filterText.toLowerCase()) === -1) continue;
        var cnt = VMG._countItemsInFolder(f.id);
        var subCnt = VMG._getSubfolders(f.id).length;
        html += '<div class="ve-mg-folder-card" data-folder-id="' + f.id + '" draggable="true">' +
          '<div class="ve-mg-folder-icon">' + VMG._icon(f.icon || 'folder', 18) + '</div>' +
          '<div class="ve-mg-folder-name">' + VMG._escHtml(f.name) + '</div>' +
          '<div class="ve-mg-folder-meta">' + cnt + ' item' + (cnt !== 1 ? 's' : '') +
            (subCnt > 0 ? ' \u00b7 ' + subCnt + ' subfolder' + (subCnt !== 1 ? 's' : '') : '') +
          '</div>' +
        '</div>';
      }
      html += '</div></div>';
    }

    // Recent section
    var recentList = VMG._recentIds[VMG._activeCategory] || [];
    var recentItems = [];
    for (var r = 0; r < recentList.length; r++) {
      for (var ri = 0; ri < filtered.length; ri++) {
        if (filtered[ri].id === recentList[r]) { recentItems.push(filtered[ri]); break; }
      }
    }
    if (recentItems.length > 0 && !VMG._filterText) {
      html += '<div class="ve-mg-section">';
      html += '<div class="ve-mg-section-header"><span>' + VMG._icon('clock', 12) + ' Recent</span></div>';
      html += VMG._viewMode === 'grid' ? VMG._renderGrid(recentItems) : VMG._renderList(recentItems);
      html += '</div>';
    }

    // Unfiled items (no folder)
    var unfiledItems = VMG._getFilteredItems(VMG._getItemsInFolder(null));
    if (unfiledItems.length > 0) {
      html += '<div class="ve-mg-section">';
      html += '<div class="ve-mg-section-header"><span>' + VMG._icon('inbox', 12) + ' Unfiled</span></div>';
      html += VMG._viewMode === 'grid' ? VMG._renderGrid(unfiledItems) : VMG._renderList(unfiledItems);
      html += '</div>';
    }

    if (!rootFolders.length && !allItems.length) {
      html = '<div class="ve-mg-empty">' + VMG._icon('inbox', 28) +
        '<br>No ' + VMG._activeCategory + ' files yet.<br>Click + to import.</div>';
    }

    container.innerHTML = html;
    VMG._wireLibraryEvents(container);
  };

  VMG._renderFolderDrillIn = function (container) {
    var folder = null;
    for (var fi = 0; fi < VMG._folders.length; fi++) {
      if (VMG._folders[fi].id === VMG._drillFolderId) { folder = VMG._folders[fi]; break; }
    }
    if (!folder) { VMG._drillFolderId = null; VMG._renderLibrary(container); return; }

    var subfolders = VMG._getSubfolders(folder.id);
    var items = VMG._getFilteredItems(VMG._getItemsInFolder(folder.id));

    var html = '';

    // Back button + breadcrumb
    html += '<div class="ve-mg-breadcrumb">' +
      '<button class="ve-mg-back-btn" id="ve-mg-back">' + VMG._icon('arrow-left', 14) + '</button>' +
      '<span class="ve-mg-breadcrumb-name">' + VMG._icon(folder.icon || 'folder', 14) + ' ' + VMG._escHtml(folder.name) + '</span>' +
      '<span class="ve-mg-breadcrumb-count">(' + items.length + ')</span>' +
    '</div>';

    // Subfolders
    if (subfolders.length > 0) {
      html += '<div class="ve-mg-folder-grid">';
      for (var s = 0; s < subfolders.length; s++) {
        var sf = subfolders[s];
        var cnt = VMG._countItemsInFolder(sf.id);
        html += '<div class="ve-mg-folder-card" data-folder-id="' + sf.id + '">' +
          '<div class="ve-mg-folder-icon">' + VMG._icon(sf.icon || 'folder', 18) + '</div>' +
          '<div class="ve-mg-folder-name">' + VMG._escHtml(sf.name) + '</div>' +
          '<div class="ve-mg-folder-meta">' + cnt + ' item' + (cnt !== 1 ? 's' : '') + '</div>' +
        '</div>';
      }
      html += '</div>';
    }

    // Items
    if (items.length > 0) {
      html += VMG._viewMode === 'grid' ? VMG._renderGrid(items) : VMG._renderList(items);
    } else if (subfolders.length === 0) {
      html += '<div class="ve-mg-empty">' + VMG._icon('inbox', 24) + '<br>Empty folder</div>';
    }

    container.innerHTML = html;

    // Back button
    var backBtn = document.getElementById('ve-mg-back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        VMG._drillFolderId = folder.parentId || null;
        VMG._renderContent();
      });
    }

    VMG._wireLibraryEvents(container);
  };

  VMG._renderGrid = function (items) {
    var html = '<div class="ve-mg-grid">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html += '<div class="ve-mg-card" data-mg-id="' + it.id + '" title="' + VMG._escHtml(it.name) + '">';
      if (it.thumb) {
        html += '<div class="ve-mg-thumb" style="background-image:url(' + it.thumb + ')">';
      } else {
        html += '<div class="ve-mg-thumb ve-mg-thumb--icon">' + VMG._icon(VMG.CAT_ICONS[it.type] || 'file', 24);
      }
      // Duration badge for video/audio
      if ((it.type === 'video' || it.type === 'audio') && it.duration) {
        html += '<span class="ve-mg-duration-badge">' + VMG._fmtDuration(it.duration) + '</span>';
      }
      html += '</div>';
      html += '<div class="ve-mg-card-info">';
      html += '<div class="ve-mg-card-name">' + VMG._escHtml(it.name) + '</div>';
      html += '<div class="ve-mg-card-meta">';
      if (it.width) html += VMG._fmtRes(it.width, it.height);
      if (it.size) html += (it.width ? ' \u00b7 ' : '') + VMG._fmtSize(it.size);
      html += '</div></div></div>';
    }
    html += '</div>';
    return html;
  };

  VMG._renderList = function (items) {
    var html = '<div class="ve-mg-list">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html += '<div class="ve-mg-list-item" data-mg-id="' + it.id + '">';
      html += '<span class="ve-mg-list-icon">' + VMG._icon(VMG.CAT_ICONS[it.type] || 'file', 14) + '</span>';
      html += '<span class="ve-mg-list-name">' + VMG._escHtml(it.name) + '</span>';
      if (it.duration) html += '<span class="ve-mg-list-dur">' + VMG._fmtDuration(it.duration) + '</span>';
      if (it.width) html += '<span class="ve-mg-list-res">' + VMG._fmtRes(it.width, it.height) + '</span>';
      html += '<span class="ve-mg-list-size">' + VMG._fmtSize(it.size) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  };

  VMG._wireLibraryEvents = function (container) {
    // "All" card click → VMG.show all items for category (no folder filter)
    var allCard = container.querySelector('#ve-mg-all-card');
    if (allCard) {
      allCard.addEventListener('click', function() {
        VMG._drillFolderId = '__all__';
        VMG._renderAllItems(container);
      });
    }

    // Folder card clicks
    var folderCards = container.querySelectorAll('.ve-mg-folder-card');
    for (var f = 0; f < folderCards.length; f++) {
      (function(card) {
        var fid = card.getAttribute('data-folder-id');
        card.addEventListener('click', function() {
          VMG._drillFolderId = fid;
          VMG._renderContent();
        });
        // Right-click context menu
        card.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          VMG._showFolderContextMenu(e, fid);
        });
        // Drop target for items
        card.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.classList.add('ve-mg-folder-card--dragover'); });
        card.addEventListener('dragleave', function() { card.classList.remove('ve-mg-folder-card--dragover'); });
        card.addEventListener('drop', function(e) {
          e.preventDefault();
          card.classList.remove('ve-mg-folder-card--dragover');
          var dragId = e.dataTransfer.getData('text/ve-mg-item-id');
          if (dragId) VMG._moveItemToFolder(dragId, fid);
        });
      })(folderCards[f]);
    }

    // New folder button
    var addFolderBtn = container.querySelector('.ve-mg-add-folder-btn');
    if (addFolderBtn) {
      addFolderBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        VMG._showNewFolderPrompt(VMG._drillFolderId);
      });
    }

    // Media item events (drag, dblclick, right-click)
    var cards = container.querySelectorAll('[data-mg-id]');
    for (var c = 0; c < cards.length; c++) {
      (function(card) {
        var itemId = card.getAttribute('data-mg-id');
        card.draggable = true;
        card.addEventListener('dragstart', function(e) {
          e.dataTransfer.setData('text/ve-media-id', itemId);
          e.dataTransfer.setData('text/ve-mg-item-id', itemId);
          e.dataTransfer.effectAllowed = 'copyMove';
        });
        card.addEventListener('dblclick', function() {
          VMG._addToTimeline(itemId);
        });
        card.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          VMG._showItemContextMenu(e, itemId);
        });
      })(cards[c]);
    }
  };

  VMG._renderAllItems = function (container) {
    var allItems = VMG._getFilteredItems(VMG._getItemsForCategory());
    var catLabel = VMG._activeCategory.charAt(0).toUpperCase() + VMG._activeCategory.slice(1);

    var html = '<div class="ve-mg-breadcrumb">' +
      '<button class="ve-mg-back-btn" id="ve-mg-back">' + VMG._icon('arrow-left', 14) + '</button>' +
      '<span class="ve-mg-breadcrumb-name">' + VMG._icon(VMG.CAT_ICONS[VMG._activeCategory], 14) + ' All ' + catLabel + 's</span>' +
      '<span class="ve-mg-breadcrumb-count">(' + allItems.length + ')</span>' +
    '</div>';

    if (allItems.length > 0) {
      html += VMG._viewMode === 'grid' ? VMG._renderGrid(allItems) : VMG._renderList(allItems);
    } else {
      html += '<div class="ve-mg-empty">' + VMG._icon('inbox', 24) + '<br>No items</div>';
    }

    container.innerHTML = html;

    var backBtn = document.getElementById('ve-mg-back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        VMG._drillFolderId = null;
        VMG._renderContent();
      });
    }

    VMG._wireLibraryEvents(container);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'render', parent: 'video.ve-media-gallery', title: 've-media-gallery: render', mount: function () {}, unmount: function () {} });
  }
})();
