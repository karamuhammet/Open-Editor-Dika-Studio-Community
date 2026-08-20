/* Module: video/ve-media-gallery/core — Formatters + IndexedDB layer + item/folder queries.
   Part of the ve-media-gallery group (decomposed from the 1480-line IIFE). Functions hang off the
   shared namespace VMG (window.__ccVEMediaGallery, created by the parent); cross-module refs resolve
   through VMG at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMG = window.__ccVEMediaGallery;
  if (!VMG) return;

  VMG._icon = function (name, size) {
    if (typeof getIcon === 'function') {
      var r = getIcon(name, size || 14);
      if (r) return r;
    }
    return '';
  };

  VMG._fmtDuration = function (sec) {
    if (!sec || !isFinite(sec)) return '0:00';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  VMG._fmtSize = function (bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  VMG._fmtRes = function (w, h) {
    if (!w || !h) return '';
    return w + '\u00d7' + h;
  };

  VMG._escHtml = function (str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  };

  VMG._dbOpen = function (cb) {
    if (VMG._db) { cb(VMG._db); return; }
    var req = indexedDB.open(VMG.DB_NAME, VMG.DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(VMG.STORE_MEDIA)) {
        db.createObjectStore(VMG.STORE_MEDIA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(VMG.STORE_FOLDERS)) {
        db.createObjectStore(VMG.STORE_FOLDERS, { keyPath: 'id' });
      }
    };
    req.onsuccess = function(e) { VMG._db = e.target.result; cb(VMG._db); };
    req.onerror = function() { cb(null); };
  };

  VMG._dbGetAll = function (storeName, cb) {
    VMG._dbOpen(function(db) {
      if (!db) { cb([]); return; }
      var tx = db.transaction(storeName, 'readonly');
      var store = tx.objectStore(storeName);
      var req = store.getAll();
      req.onsuccess = function() { cb(req.result || []); };
      req.onerror = function() { cb([]); };
    });
  };

  VMG._dbPut = function (storeName, item, cb) {
    VMG._dbOpen(function(db) {
      if (!db) { if (cb) cb(false); return; }
      var tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(item);
      tx.oncomplete = function() { if (cb) cb(true); };
      tx.onerror = function() { if (cb) cb(false); };
    });
  };

  VMG._dbDelete = function (storeName, id, cb) {
    VMG._dbOpen(function(db) {
      if (!db) { if (cb) cb(false); return; }
      var tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = function() { if (cb) cb(true); };
      tx.onerror = function() { if (cb) cb(false); };
    });
  };

  VMG._loadFromDB = function (cb) {
    VMG._releaseHydratedUrls();
    var loaded = 0;
    function check() { if (++loaded === 2 && cb) cb(); }
    VMG._dbGetAll(VMG.STORE_MEDIA, function(items) { VMG._mediaItems = items || []; check(); });
    VMG._dbGetAll(VMG.STORE_FOLDERS, function(folders) { VMG._folders = folders || []; check(); });
  };

  VMG._getItemsForCategory = function () {
    return VMG._mediaItems.filter(function(it) { return it.type === VMG._activeCategory; });
  };

  VMG._getFoldersForCategory = function () {
    return VMG._folders.filter(function(f) { return f.type === VMG._activeCategory; });
  };

  VMG._getFilteredItems = function (items) {
    if (!VMG._filterText) return items;
    var q = VMG._filterText.toLowerCase();
    return items.filter(function(it) {
      return it.name && it.name.toLowerCase().indexOf(q) !== -1;
    });
  };

  VMG._getItemsInFolder = function (folderId) {
    return VMG._getItemsForCategory().filter(function(it) { return it.folderId === folderId; });
  };

  VMG._getSubfolders = function (parentId) {
    return VMG._getFoldersForCategory().filter(function(f) { return (f.parentId || null) === parentId; });
  };

  VMG._countItemsInFolder = function (folderId) {
    var count = VMG._getItemsInFolder(folderId).length;
    var subs = VMG._getSubfolders(folderId);
    for (var i = 0; i < subs.length; i++) count += VMG._countItemsInFolder(subs[i].id);
    return count;
  };

  VMG._saveItemToDB = function (item) {
    // Save to IDB (store ArrayBuffer blob, not object URL)
    var dbItem = {
      id: item.id,
      type: item.type,
      name: item.name,
      folderId: item.folderId,
      blob: item.blob,
      blobType: item.blobType,
      duration: item.duration,
      width: item.width,
      height: item.height,
      size: item.size,
      thumb: item.thumb,
      createdAt: item.createdAt
    };
    VMG._dbPut(VMG.STORE_MEDIA, dbItem);
  };

  VMG._hydrateItems = function () {
    for (var i = 0; i < VMG._mediaItems.length; i++) {
      var it = VMG._mediaItems[i];
      if (it.blob && !it.url) {
        try {
          var blob = new Blob([it.blob], { type: it.blobType || 'application/octet-stream' });
          it.url = URL.createObjectURL(blob);
          it._ownsObjectUrl = true;
          it._file = new File([blob], it.name, { type: it.blobType });
        } catch (e) {}
      }
    }
  };

  VMG._releaseHydratedUrls = function () {
    for (var i = 0; i < VMG._mediaItems.length; i++) {
      var it = VMG._mediaItems[i];
      if (it && it._ownsObjectUrl && it.url) {
        try { URL.revokeObjectURL(it.url); } catch (e) {}
        it.url = null;
        it._ownsObjectUrl = false;
      }
    }
  };

  if (!VMG._urlCleanupBound) {
    VMG._urlCleanupBound = true;
    window.addEventListener('pagehide', VMG._releaseHydratedUrls);
  }

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'core', parent: 'video.ve-media-gallery', title: 've-media-gallery: core', mount: function () {}, unmount: VMG._releaseHydratedUrls });
  }
})();
