/* Module: video/ve-media-gallery/menus — Context menus + prompts (folder/item/move/new/rename/icon).
   Part of the ve-media-gallery group (decomposed from the 1480-line IIFE). Functions hang off the
   shared namespace VMG (window.__ccVEMediaGallery, created by the parent); cross-module refs resolve
   through VMG at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMG = window.__ccVEMediaGallery;
  if (!VMG) return;

  VMG._showFolderContextMenu = function (e, folderId) {
    VMG._removeContextMenu();
    var menu = document.createElement('div');
    menu.className = 've-mg-ctx';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    var items = [
      { label: 'Rename', icon: 'pencil', action: function() { VMG._showRenamePrompt(folderId); } },
      { label: 'Change Icon', icon: 'palette', action: function() { VMG._showIconPicker(folderId); } },
      { label: 'Add Subfolder', icon: 'folder-plus', action: function() { VMG._showNewFolderPrompt(folderId); } },
      { label: 'Delete Folder', icon: 'trash-2', action: function() { if (confirm('Delete this folder? Items will be moved to Unfiled.')) VMG._deleteFolder(folderId); } }
    ];

    for (var i = 0; i < items.length; i++) {
      (function(item) {
        var row = document.createElement('div');
        row.className = 've-mg-ctx-item';
        row.innerHTML = VMG._icon(item.icon, 13) + ' ' + item.label;
        row.addEventListener('click', function() { VMG._removeContextMenu(); item.action(); });
        menu.appendChild(row);
      })(items[i]);
    }

    document.body.appendChild(menu);
    // Ensure menu stays in viewport
    requestAnimationFrame(function() {
      var rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
    });
    setTimeout(function() {
      document.addEventListener('click', VMG._removeContextMenu, { once: true });
    }, 10);
  };

  VMG._showItemContextMenu = function (e, itemId) {
    VMG._removeContextMenu();
    var item = VMG.getItemById(itemId);
    if (!item) return;

    var menu = document.createElement('div');
    menu.className = 've-mg-ctx';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    var actions = [
      { label: 'Add to Timeline', icon: 'plus-circle', action: function() { VMG._addToTimeline(itemId); } },
      { label: 'Delete', icon: 'trash-2', action: function() { if (confirm('Delete "' + (item.name || 'item') + '"?')) VMG._deleteItem(itemId); } }
    ];

    // Move to folder submenu
    var catFolders = VMG._getFoldersForCategory();
    if (catFolders.length > 0) {
      actions.splice(1, 0, {
        label: 'Move to Folder \u25b8', icon: 'folder', action: function() {
          VMG._showMoveToFolderMenu(e, itemId, catFolders);
        }
      });
    }

    for (var i = 0; i < actions.length; i++) {
      (function(act) {
        var row = document.createElement('div');
        row.className = 've-mg-ctx-item';
        row.innerHTML = VMG._icon(act.icon, 13) + ' ' + act.label;
        row.addEventListener('click', function() { VMG._removeContextMenu(); act.action(); });
        menu.appendChild(row);
      })(actions[i]);
    }

    document.body.appendChild(menu);
    requestAnimationFrame(function() {
      var rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
    });
    setTimeout(function() {
      document.addEventListener('click', VMG._removeContextMenu, { once: true });
    }, 10);
  };

  VMG._showMoveToFolderMenu = function (e, itemId, folders) {
    VMG._removeContextMenu();
    var menu = document.createElement('div');
    menu.className = 've-mg-ctx';
    menu.style.left = (e.clientX + 10) + 'px';
    menu.style.top = e.clientY + 'px';

    // Unfiled option
    var unRow = document.createElement('div');
    unRow.className = 've-mg-ctx-item';
    unRow.innerHTML = VMG._icon('inbox', 13) + ' Unfiled';
    unRow.addEventListener('click', function() { VMG._removeContextMenu(); VMG._moveItemToFolder(itemId, null); });
    menu.appendChild(unRow);

    for (var i = 0; i < folders.length; i++) {
      (function(f) {
        var row = document.createElement('div');
        row.className = 've-mg-ctx-item';
        row.innerHTML = VMG._icon(f.icon || 'folder', 13) + ' ' + VMG._escHtml(f.name);
        row.addEventListener('click', function() { VMG._removeContextMenu(); VMG._moveItemToFolder(itemId, f.id); });
        menu.appendChild(row);
      })(folders[i]);
    }

    document.body.appendChild(menu);
    setTimeout(function() {
      document.addEventListener('click', VMG._removeContextMenu, { once: true });
    }, 10);
  };

  VMG._removeContextMenu = function () {
    var old = document.querySelectorAll('.ve-mg-ctx');
    for (var i = 0; i < old.length; i++) old[i].remove();
  };

  VMG._showNewFolderPrompt = function (parentId) {
    var name = prompt('Folder name:');
    if (!name || !name.trim()) return;
    VMG._createFolder(name.trim(), 'folder', parentId);
  };

  VMG._showRenamePrompt = function (folderId) {
    var folder = null;
    for (var i = 0; i < VMG._folders.length; i++) {
      if (VMG._folders[i].id === folderId) { folder = VMG._folders[i]; break; }
    }
    if (!folder) return;
    var name = prompt('Rename folder:', folder.name);
    if (!name || !name.trim()) return;
    VMG._renameFolder(folderId, name.trim());
  };

  VMG._showIconPicker = function (folderId) {
    VMG._removeContextMenu();
    var overlay = document.createElement('div');
    overlay.className = 've-mg-icon-picker-overlay';
    var picker = document.createElement('div');
    picker.className = 've-mg-icon-picker';
    picker.innerHTML = '<div class="ve-mg-icon-picker-title">Choose Folder Icon</div>';
    var grid = document.createElement('div');
    grid.className = 've-mg-icon-picker-grid';
    for (var i = 0; i < VMG.FOLDER_ICONS.length; i++) {
      (function(iconName) {
        var btn = document.createElement('button');
        btn.className = 've-mg-icon-picker-btn';
        btn.innerHTML = VMG._icon(iconName, 20);
        btn.title = iconName;
        btn.addEventListener('click', function() {
          VMG._changeFolderIcon(folderId, iconName);
          overlay.remove();
        });
        grid.appendChild(btn);
      })(VMG.FOLDER_ICONS[i]);
    }
    picker.appendChild(grid);
    overlay.appendChild(picker);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'menus', parent: 'video.ve-media-gallery', title: 've-media-gallery: menus', mount: function () {}, unmount: function () {} });
  }
})();
