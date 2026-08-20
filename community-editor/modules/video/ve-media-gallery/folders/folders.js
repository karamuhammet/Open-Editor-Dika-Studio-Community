/* Module: video/ve-media-gallery/folders — Folder + item CRUD (create/rename/icon/delete/move).
   Part of the ve-media-gallery group (decomposed from the 1480-line IIFE). Functions hang off the
   shared namespace VMG (window.__ccVEMediaGallery, created by the parent); cross-module refs resolve
   through VMG at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMG = window.__ccVEMediaGallery;
  if (!VMG) return;

  VMG._createFolder = function (name, icon, parentId) {
    var folder = {
      id: 'mf-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: name || 'New Folder',
      type: VMG._activeCategory,
      icon: icon || 'folder',
      parentId: parentId || null,
      color: null,
      order: VMG._getFoldersForCategory().length,
      createdAt: Date.now()
    };
    VMG._folders.push(folder);
    VMG._dbPut(VMG.STORE_FOLDERS, folder);
    VMG._renderContent();
    return folder;
  };

  VMG._renameFolder = function (folderId, newName) {
    for (var i = 0; i < VMG._folders.length; i++) {
      if (VMG._folders[i].id === folderId) {
        VMG._folders[i].name = newName;
        VMG._dbPut(VMG.STORE_FOLDERS, VMG._folders[i]);
        break;
      }
    }
    VMG._renderContent();
  };

  VMG._changeFolderIcon = function (folderId, newIcon) {
    for (var i = 0; i < VMG._folders.length; i++) {
      if (VMG._folders[i].id === folderId) {
        VMG._folders[i].icon = newIcon;
        VMG._dbPut(VMG.STORE_FOLDERS, VMG._folders[i]);
        break;
      }
    }
    VMG._renderContent();
  };

  VMG._deleteFolder = function (folderId) {
    // Move items to root (unfiled)
    for (var i = 0; i < VMG._mediaItems.length; i++) {
      if (VMG._mediaItems[i].folderId === folderId) {
        VMG._mediaItems[i].folderId = null;
        VMG._saveItemToDB(VMG._mediaItems[i]);
      }
    }
    // Delete subfolders recursively
    var subs = VMG._getSubfolders(folderId);
    for (var j = 0; j < subs.length; j++) VMG._deleteFolder(subs[j].id);
    // Remove folder
    VMG._folders = VMG._folders.filter(function(f) { return f.id !== folderId; });
    VMG._dbDelete(VMG.STORE_FOLDERS, folderId);
    VMG._renderContent();
  };

  VMG._deleteItem = function (itemId) {
    // scan-3000 M-M5: revoke the item's blob URL so the media bytes are
    // actually freed (they used to stay registered for the whole session).
    var gone = null;
    VMG._mediaItems = VMG._mediaItems.filter(function(it) { if (it.id === itemId) gone = it; return it.id !== itemId; });
    if (gone && typeof gone.url === 'string' && gone.url.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(gone.url); } catch (e) {}
    }
    VMG._dbDelete(VMG.STORE_MEDIA, itemId);
    VMG._renderContent();
  };

  VMG._moveItemToFolder = function (itemId, folderId) {
    for (var i = 0; i < VMG._mediaItems.length; i++) {
      if (VMG._mediaItems[i].id === itemId) {
        VMG._mediaItems[i].folderId = folderId;
        VMG._saveItemToDB(VMG._mediaItems[i]);
        break;
      }
    }
    VMG._renderContent();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'folders', parent: 'video.ve-media-gallery', title: 've-media-gallery: folders', mount: function () {}, unmount: function () {} });
  }
})();
