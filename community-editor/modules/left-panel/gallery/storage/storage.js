/* gallery/storage — the gallery DATA LAYER. IndexedDB backend (open/get/put/delete + boot),
   in-memory mirror, and the folder/media data model (get/add/rename/delete folders, add/move/remove
   images, recent, counts). Split from gallery.js (decomposition, approved plan). FLAT sub-module:
   functions stay window globals; the mutable handles (_galIDB/_galMemStore/_galMemTrash) + keys stay
   in the parent gallery.js (loaded first); these functions read/write them at runtime. The load-time
   _galBootIDB() boot runs here (state is a parent global, declared before this child loads). */

function _galOpenIDB(cb) {
  if (typeof indexedDB === 'undefined') { cb && cb(null); return; }
  /* The gallery moved from `cardcraft_gallery_db` when the product name was retired. The copy has to
     finish BEFORE this open, or the app creates an empty database beside the pictures somebody put
     there (docs/dika-rename-plan.md P5). */
  var moved = (window.CCMigrate && window.CCMigrate.db)
    ? window.CCMigrate.db('cardcraft_gallery_db', 'dika_gallery_db')
    : Promise.resolve(false);
  moved.then(function () {
    try {
      var req = indexedDB.open('dika_gallery_db', 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('gallery')) db.createObjectStore('gallery');
      };
      req.onsuccess = function(e) { _galIDB = e.target.result; cb && cb(_galIDB); };
      req.onerror = function() { cb && cb(null); };
    } catch (e) { cb && cb(null); }
  });
}

function _galIDBGet(key, cb) {
  if (!_galIDB) { cb(null); return; }
  try {
    var tx = _galIDB.transaction('gallery', 'readonly');
    var r = tx.objectStore('gallery').get(key);
    r.onsuccess = function() { cb(r.result !== undefined ? r.result : null); };
    r.onerror = function() { cb(null); };
  } catch (e) { cb(null); }
}

function _galIDBPut(key, val) {
  if (!_galIDB) return;
  try {
    var tx = _galIDB.transaction('gallery', 'readwrite');
    tx.objectStore('gallery').put(val, key);
  } catch (e) { /* IDB write failed — data still in memory */ }
}

function _galIDBDelete(key) {
  if (!_galIDB) return;
  try {
    var tx = _galIDB.transaction('gallery', 'readwrite');
    tx.objectStore('gallery').delete(key);
  } catch (e) {}
}

/* Boot: open IDB → migrate localStorage → load into memory */
function _galBootIDB(cb) {
  _galOpenIDB(function(db) {
    if (!db) { _galIDBReady = true; cb && cb(); return; }
    var pending = 2;
    function done() { if (--pending <= 0) { _galIDBReady = true; cb && cb(); } }

    // Gallery store
    _galIDBGet('store', function(val) {
      if (val) {
        _galMemStore = val;
      } else {
        // Migrate from localStorage
        var ls = null;
        try { ls = JSON.parse(localStorage.getItem(GALLERY_FOLDERS_KEY)); } catch(e) {}
        if (!ls) {
          var old = [];
          try { old = JSON.parse(localStorage.getItem(GALLERY_KEY)) || []; } catch(e) {}
          ls = { folders: [], recent: old };
        }
        _galMemStore = ls;
        _galIDBPut('store', ls);
        // Clear from localStorage to free space
        try { localStorage.removeItem(GALLERY_FOLDERS_KEY); } catch(e) {}
        try { localStorage.removeItem(GALLERY_KEY); } catch(e) {}
      }
      done();
    });

    // Trash store
    _galIDBGet('trash', function(val) {
      if (val) {
        _galMemTrash = val;
      } else {
        var ts = null;
        try { ts = JSON.parse(localStorage.getItem(GAL_TRASH_KEY)); } catch(e) {}
        _galMemTrash = ts || { items: [], autoCleanDays: 7 };
        _galIDBPut('trash', _galMemTrash);
        try { localStorage.removeItem(GAL_TRASH_KEY); } catch(e) {}
      }
      done();
    });
  });
}

/* Kick off IDB boot immediately */
_galBootIDB(function() {
  // Re-run auto-clean once IDB is ready
  try { galTrashAutoClean(); } catch(e) {}
  // Dilim 5: pull the panel's media library in (no-op standalone / when CCAssets absent)
  try { galSyncRemote(); } catch(e) {}
});

/* ── Folder icon presets for folder creation popup ── */
var FOLDER_ICON_OPTIONS = [
  'folder','star','heart','images','image','briefcase','lightning',
  'tag','crown','shield','badge','flame','leaf','sun','moon','clock'
];

/* ── Data helpers ── */
function _galImgHash(dataUrl) {
  // Short hash from dataUrl for keying image names
  if (!dataUrl || typeof dataUrl !== 'string') return 'img0';
  var h = 0;
  var s = dataUrl.length > 200 ? dataUrl.substring(0, 100) + dataUrl.substring(dataUrl.length - 100) : dataUrl;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return 'img' + Math.abs(h).toString(36);
}
function _galGetImgName(store, dataUrl, fallbackIdx) {
  if (!store.imageNames) return '';
  return store.imageNames[_galImgHash(dataUrl)] || '';
}
function _galSetImgName(dataUrl, name) {
  var store = _galInit();
  if (!store.imageNames) store.imageNames = {};
  if (name) { store.imageNames[_galImgHash(dataUrl)] = name; }
  else { delete store.imageNames[_galImgHash(dataUrl)]; }
  _galSave(store);
  // Phase 4: propagate the rename to the org library asset.
  if (name && _galPortalBacked() && window.CCAssets && CCAssets.patchAsset) {
    var aid = _galEntryAssetId(dataUrl);
    if (aid) CCAssets.patchAsset(aid, { name: name });
  }
}
function _galTrackRecentFolder(folderId) {
  if (!folderId || folderId === '__recent') return;
  var store = _galInit();
  if (!store.recentFolderIds) store.recentFolderIds = [];
  store.recentFolderIds = store.recentFolderIds.filter(function(id) { return id !== folderId; });
  store.recentFolderIds.unshift(folderId);
  if (store.recentFolderIds.length > 10) store.recentFolderIds = store.recentFolderIds.slice(0, 10);
  _galSave(store);
}
var _IMAGE_EXTS = /\.(jpe?g|png|gif|webp|bmp|svg|ico|tiff?|avif|heic)$/i;
var _VIDEO_EXTS = /\.(mp4|webm|ogg|mov|avi|mkv|m4v|flv)$/i;
var _AUDIO_EXTS = /\.(mp3|wav|ogg|aac|flac|m4a|opus|weba)$/i;

/* ── Gallery thumbnail URL ──
   The panel media library serves full-resolution originals through the local fs route
   /api/assets/blob/<key>. Rendering a grid of those full-size images freezes the browser
   (Canva-killer). For DISPLAY cells we request a small resized variant via ?w=; the blob
   route resizes on the fly and caches it (see api/assets/blob). Only the local serve route
   is rewritten — S3/presigned URLs are left as-is (extra query params can break the signature),
   and data:/blob: URLs are already in memory. The full-res original is still used for
   canvas-add / edit / export (those paths keep the untouched dataUrl). */
function _galThumbUrl(url, w) {
  if (!url || typeof url !== 'string') return url;
  if (url.indexOf('/api/assets/blob/') !== 0) return url; // only the local fs route supports ?w= resize
  return url + (url.indexOf('?') < 0 ? '?' : '&') + 'w=' + (w || 240) + '&q=72';
}

function _isMediaFile(file) {
  if (!file) return false;
  if (file.type) {
    if (file.type.indexOf('image/') === 0) return true;
    if (file.type.indexOf('video/') === 0) return true;
    if (file.type.indexOf('audio/') === 0) return true;
  }
  if (file.name) {
    if (_IMAGE_EXTS.test(file.name)) return true;
    if (_VIDEO_EXTS.test(file.name)) return true;
    if (_AUDIO_EXTS.test(file.name)) return true;
  }
  return false;
}
function _isImageFile(file) {
  if (file.type && file.type.indexOf('image/') === 0) return true;
  if (file.name && _IMAGE_EXTS.test(file.name)) return true;
  return false;
}
function _galStore() {
  // Read from in-memory mirror (backed by IndexedDB)
  if (_galMemStore) return _galMemStore;
  // Fallback: IDB not ready yet — try localStorage (pre-migration)
  try { return JSON.parse(localStorage.getItem(GALLERY_FOLDERS_KEY)) || null; }
  catch(e) { return null; }
}
/* ── Dilim 5: remote overlay bookkeeping ──
   Panel media is merged into _galMemStore in-memory for DISPLAY only. It is tracked
   here so it is NEVER written to the local IndexedDB store (panel stays the source
   of truth) — standalone editing is byte-for-byte unchanged (fast-path below). */
var _galRemoteUrls = {};      // url → 1   (panel assets currently loaded)
var _galRemoteFolders = {};   // editor-folder-id ('cc:'+panelId) → panelId
var _galRemoteAssetIds = {};  // url → panel asset id (for PATCH/DELETE write-through)
var _galAssetMeta = {};       // url → { brand, tags:[], bytes }  (Phase 5 brand/tag/size filter)
var _galSyncInFlight = false;

/* ── Phase 4: portal-backed helpers ──
   When a design is open (CCAssets.active), the org library is the single source of
   truth: galSyncRemote builds _galMemStore from it (marked _portalBacked) and editor
   CRUD mirrors to the same API. Standalone: all of this is a no-op. */
function _galPortalBacked() {
  return !!(_galMemStore && _galMemStore._portalBacked);
}
/* Map an editor folder id -> panel folder uuid (or null for root / local-only). */
function _galFolderPanelId(editorId) {
  if (!editorId || editorId === '__recent') return null;
  if (editorId.indexOf('cc:') === 0) return editorId.slice(3);
  var s = _galStore();
  var f = (s && s.folders) ? s.folders.filter(function(x){ return x.id === editorId; })[0] : null;
  return (f && f.remoteId) ? f.remoteId : null;
}
/* Map a gallery entry (image url string OR video/audio object) -> panel asset id. */
function _galEntryAssetId(entry) {
  if (typeof entry === 'string') return _galRemoteAssetIds[entry] || null;
  return (entry && entry._assetId) ? entry._assetId : null;
}

function _galHasRemote(store) {
  if (store && store.folders) {
    for (var i = 0; i < store.folders.length; i++) if (store.folders[i].remote) return true;
  }
  for (var u in _galRemoteUrls) { if (_galRemoteUrls.hasOwnProperty(u)) return true; }
  return false;
}
function _galStripRemote(store) {
  if (!_galHasRemote(store)) return store; // standalone fast-path — persist as-is
  var clone = {}; for (var k in store) if (store.hasOwnProperty(k)) clone[k] = store[k];
  clone.folders = (store.folders || []).filter(function(f){ return !f.remote; }).map(function(f){
    var nf = {}; for (var kk in f) if (f.hasOwnProperty(kk)) nf[kk] = f[kk];
    if (nf.images) nf.images = nf.images.filter(function(u){ return !(typeof u === 'string' && _galRemoteUrls[u]); });
    return nf;
  });
  clone.recent = (store.recent || []).filter(function(e){ return !(typeof e === 'string' && _galRemoteUrls[e]); });
  return clone;
}

function _galSave(store) {
  _galMemStore = store;                        // sync in-memory update
  // Phase 4: when portal-backed, the org API is the source of truth — do NOT persist
  // the portal library into the local IndexedDB (that was the old overlay-duplication).
  if (store && store._portalBacked) return true;
  _galIDBPut('store', _galStripRemote(store)); // standalone: persist LOCAL-only, byte-for-byte as before
  return true;
}
function _galInit() {
  var s = _galStore();
  if (s && s.folders) {
    for (var i = 0; i < s.folders.length; i++) {
      if (!s.folders[i].images) s.folders[i].images = [];
    }
    if (s.recent) {
      var cl = s.recent.length;
      s.recent = s.recent.filter(function(e) { return e && (typeof e === 'string' || typeof e === 'object'); });
      if (s.recent.length !== cl) _galSave(s);
    }
    return s;
  }
  // Fresh store (migration handled by _galBootIDB)
  var store = { folders: [], recent: [] };
  _galSave(store);
  return store;
}
function _genId() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ── Folder CRUD ── */
function galGetFolders() { return _galInit().folders; }
function galGetRecent()  { return _galInit().recent || []; }

function galAddFolder(name, icon, parentId, mediaType) {
  var store = _galInit();
  // Validate max nesting depth of 2 (main → sub → sub-sub)
  if (parentId) {
    var depth = 0;
    var pid = parentId;
    while (pid) {
      depth++;
      if (depth > 2) return null; // too deep
      var pf = store.folders.filter(function(f){ return f.id === pid; })[0];
      pid = pf ? pf.parentId : null;
    }
  }
  var folder = { id: _genId(), name: name, icon: icon || 'folder', parentId: parentId || null, role: '', images: [], mediaType: mediaType || 'image' };
  store.folders.push(folder);
  _galSave(store);
  // Phase 4: mirror the folder into the org library (panel) when a design is open, and
  // stamp the returned panel id so later rename/move/delete/uploads target the portal.
  if (_galPortalBacked() && window.CCAssets && CCAssets.createFolder) {
    CCAssets.createFolder(name, { icon: folder.icon, parentId: _galFolderPanelId(parentId), mediaType: folder.mediaType })
      .then(function(pf){ if (pf && pf.id) { folder.remoteId = pf.id; folder.remote = true; _galRemoteFolders['cc:' + pf.id] = pf.id; } });
  }
  return folder;
}

/* ── Media-type filtering helpers ── */
function _galFilterRecent(recentArr, mediaCat) {
  if (!recentArr) return [];
  return recentArr.filter(function(e) {
    if (!e) return false;
    if (mediaCat === 'video') return (typeof e === 'object' && e.type === 'video');
    if (mediaCat === 'audio') return (typeof e === 'object' && e.type === 'audio');
    // image: plain strings (dataURLs)
    return (typeof e === 'string');
  });
}
function _galFilterFolders(foldersArr, mediaCat) {
  if (!foldersArr) return [];
  return foldersArr.filter(function(f) {
    return (f.mediaType || 'image') === mediaCat;
  });
}
var _galMediaLabels = {
  image: { singular: 'image', plural: 'images', allTitle: 'All Images', recentTitle: 'Recent Images', icon: 'images' },
  video: { singular: 'video', plural: 'videos', allTitle: 'All Videos', recentTitle: 'Recent Videos', icon: 'film' },
  audio: { singular: 'track', plural: 'tracks', allTitle: 'All Audio', recentTitle: 'Recent Audio', icon: 'music' }
};

function galRenameFolder(folderId, newName) {
  var store = _galInit();
  var f = store.folders.filter(function(f){ return f.id === folderId; })[0];
  if (f) {
    f.name = newName; _galSave(store);
    if (_galPortalBacked() && window.CCAssets && CCAssets.updateFolder) {
      var pid = _galFolderPanelId(folderId);
      if (pid) CCAssets.updateFolder(pid, { name: newName });
    }
  }
}

function galDeleteFolder(folderId) {
  var store = _galInit();
  // Collect folder + all descendants
  var toRemove = [folderId];
  function collectChildren(pid) {
    store.folders.forEach(function(f) {
      if (f.parentId === pid) { toRemove.push(f.id); collectChildren(f.id); }
    });
  }
  collectChildren(folderId);
  // Phase 4: map the removed folders to panel ids BEFORE the local delete drops them.
  var panelIds = [];
  if (_galPortalBacked()) {
    toRemove.forEach(function(rid){ var pid = _galFolderPanelId(rid); if (pid) panelIds.push(pid); });
  }
  // Move images from deleted folders to recent
  toRemove.forEach(function(rid) {
    var f = store.folders.filter(function(f){ return f.id === rid; })[0];
    if (f && f.images && f.images.length) {
      store.recent = (store.recent || []).concat(f.images);
    }
  });
  store.folders = store.folders.filter(function(f) { return toRemove.indexOf(f.id) === -1; });
  _galSave(store);
  if (panelIds.length && window.CCAssets && CCAssets.deleteFolder) {
    panelIds.forEach(function(pid){ CCAssets.deleteFolder(pid); });
  }
}

function galChangeFolderIcon(folderId, icon) {
  var store = _galInit();
  var f = store.folders.filter(function(f){ return f.id === folderId; })[0];
  if (f) { f.icon = icon; _galSave(store); }
}

function galAddImageToFolder(folderId, dataUrl) {
  var store = _galInit();
  var f = store.folders.filter(function(f){ return f.id === folderId; })[0];
  if (f) {
    if (!f.images) f.images = [];
    if (f.images.indexOf(dataUrl) === -1) f.images.unshift(dataUrl);
    _galSave(store);
    _galTrackRecentFolder(folderId);
    _galBridgeImage(dataUrl, folderId);
    return true;
  }
  return false;
}

function galRemoveImageFromFolder(folderId, imgIdx) {
  var store = _galInit();
  var f = store.folders.filter(function(f){ return f.id === folderId; })[0];
  if (f && f.images) {
    var removed = f.images.splice(imgIdx, 1)[0];
    _galSave(store);
    if (_galPortalBacked() && window.CCAssets && CCAssets.deleteAsset) {
      var aid = _galEntryAssetId(removed);
      if (aid) CCAssets.deleteAsset(aid);
    }
  }
}

/* Remove a Recent-Uploads entry by index, with portal soft-delete write-through so a
   portal asset shown in Recent (folderId=null) doesn't reappear on the next re-sync. */
function galRemoveRecent(idx) {
  var store = _galInit();
  if (!store.recent || idx < 0 || idx >= store.recent.length) return;
  var removed = store.recent.splice(idx, 1)[0];
  _galSave(store);
  if (_galPortalBacked() && window.CCAssets && CCAssets.deleteAsset) {
    var aid = _galEntryAssetId(removed);
    if (aid) CCAssets.deleteAsset(aid);
  }
}

function galMoveImage(srcFolderId, imgIdx, destFolderId) {
  var store = _galInit();
  var src, dest;
  if (srcFolderId === '__recent') {
    src = { images: store.recent };
  } else {
    src = store.folders.filter(function(f){ return f.id === srcFolderId; })[0];
  }
  if (destFolderId === '__recent') {
    dest = { images: store.recent };
  } else {
    dest = store.folders.filter(function(f){ return f.id === destFolderId; })[0];
  }
  if (!src || !dest || !src.images || !dest.images) return;
  var img = src.images.splice(imgIdx, 1)[0];
  if (img) dest.images.unshift(img);
  if (srcFolderId === '__recent') store.recent = src.images;
  if (destFolderId === '__recent') store.recent = dest.images;
  _galSave(store);
  _galTrackRecentFolder(destFolderId);
  // Phase 4: re-point the asset's folder in the org library.
  if (_galPortalBacked() && img && window.CCAssets && CCAssets.patchAsset) {
    var aid = _galEntryAssetId(img);
    if (aid) CCAssets.patchAsset(aid, { folderId: _galFolderPanelId(destFolderId) });
  }
}

function galMoveFolder(folderId, newParentId) {
  var store = _galInit();
  var f = store.folders.filter(function(f){ return f.id === folderId; })[0];
  if (!f) return;
  // Prevent circular: newParent can't be descendant of folderId
  if (newParentId) {
    var check = newParentId;
    while (check) {
      if (check === folderId) return; // circular
      var p = store.folders.filter(function(x){ return x.id === check; })[0];
      check = p ? p.parentId : null;
    }
    // Check depth: max 2 levels deep after move
    var parentDepth = 0;
    var pd = newParentId;
    while (pd) {
      parentDepth++;
      var pp = store.folders.filter(function(x){ return x.id === pd; })[0];
      pd = pp ? pp.parentId : null;
    }
    // Check max child depth from folderId
    function maxChildDepth(fid) {
      var children = store.folders.filter(function(x){ return x.parentId === fid; });
      if (!children.length) return 0;
      var mx = 0;
      children.forEach(function(c) { mx = Math.max(mx, 1 + maxChildDepth(c.id)); });
      return mx;
    }
    if (parentDepth + 1 + maxChildDepth(folderId) > 3) return; // too deep
  }
  f.parentId = newParentId || null;
  _galSave(store);
  // Phase 4: re-parent in the org library.
  if (_galPortalBacked() && window.CCAssets && CCAssets.updateFolder) {
    var pid = _galFolderPanelId(folderId);
    if (pid) CCAssets.updateFolder(pid, { parentId: _galFolderPanelId(newParentId) });
  }
}

function galGetChildren(parentId) {
  var store = _galInit();
  return store.folders.filter(function(f) { return f.parentId === (parentId || null); });
}

function galCountImages(folderId) {
  var store = _galInit();
  var f = store.folders.filter(function(f){ return f.id === folderId; })[0];
  var count = f && f.images ? f.images.length : 0;
  // Count children too
  store.folders.forEach(function(cf) {
    if (cf.parentId === folderId) count += galCountImages(cf.id);
  });
  return count;
}

/* ── Old compat wrappers ── */
function getGallery() { return galGetRecent(); }

function saveToGallery(dataUrl) {
  var store = _galInit();
  if (!store.recent) store.recent = [];
  if (store.recent.indexOf(dataUrl) !== -1) return true;
  store.recent.unshift(dataUrl);
  if (store.recent.length > 50) store.recent = store.recent.slice(0, 50);
  _galSave(store);
  _galBridgeImage(dataUrl, null);
  return true;
}

/* ── P3 cloud bridge ──
   When the editor runs in the panel (CCAssets.active), upload a freshly-added
   gallery image (a data: URL) to the assets API and swap the stored entry to the
   returned same-origin URL. Shrinks the design doc (canvas references the asset
   key, not embedded base64) and persists the media to the org library. No-op
   standalone or when the entry is already a URL. Fire-and-forget; on failure the
   local dataURL is left untouched (editor keeps working offline). */
var _galBridgeFailToastAt = 0;
/* Bridge failure (expired session / presign 429 / PUT fail): in portal mode the
   image lives ONLY in this tab's memory and silently VANISHES on reload. Retry
   once; if it still fails, persist a local IndexedDB fallback copy (the bytes
   survive, recoverable) and tell the user instead of a green-looking loss. */
function _galBridgeFailed(dataUrl, folderId, err) {
  try {
    var store = _galStore();
    if (store && store._portalBacked && typeof _galIDBPut === 'function') {
      var s = _galStripRemote(store);
      s.recent = s.recent || [];
      if (s.recent.indexOf(dataUrl) === -1) s.recent.unshift(dataUrl);
      _galIDBPut('store', s);
    }
  } catch (e) {}
  if (typeof console !== 'undefined') console.warn('[CCAssets] bridge failed — local fallback kept', err);
  var now = Date.now();
  if (typeof showToast === 'function' && now - _galBridgeFailToastAt > 4000) {
    _galBridgeFailToastAt = now;
    /* Sunucunun gerçek sebebini yaz. Genel bir "yükleme başarısız" cümlesi, bir gün sunucunun
       modül grafiği takıldığında hiçbir şey söylemedi ve kaybın nedenini bulmak saatler aldı. */
    var why = (window.CCAssets && CCAssets.lastError) ? ' (' + CCAssets.lastError + ')' : '';
    showToast('Image couldn\'t be uploaded to the cloud, local copy remains.' + why, 'error');
  }
}

function _galBridgeImage(dataUrl, folderId, _opts) {
  if (!window.CCAssets || !CCAssets.active) return;
  if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) return;
  function _bridgeFail(err) {
    if (!_opts || !_opts._retried) {
      // transient (429 / hiccup): one delayed retry before declaring failure
      setTimeout(function () { _galBridgeImage(dataUrl, folderId, { _retried: true }); }, 5000);
      return;
    }
    _galBridgeFailed(dataUrl, folderId, err);
  }
  // Upload as a blob (not uploadDataUrl) so we capture the returned asset id + can
  // target the current folder — a later move/delete of this fresh upload then propagates.
  fetch(dataUrl).then(function(r){ return r.blob(); }).then(function(blob){
    var ext = ((blob.type || 'image/png').split('/')[1] || 'png').replace('+xml', '');
    return CCAssets.uploadBlob(blob, { name: 'gallery-' + Date.now() + '.' + ext, mime: blob.type || 'image/png', folderId: _galFolderPanelId(folderId) });
  }).then(function(res) {
    if (!res || !res.url) { _bridgeFail(null); return; }
    var url = res.url;
    var store = _galStore();
    if (!store) return;
    var swapped = false;
    if (store.folders) {
      for (var i = 0; i < store.folders.length; i++) {
        var imgs = store.folders[i].images;
        if (!imgs) continue;
        var fi = imgs.indexOf(dataUrl);
        if (fi !== -1) { imgs[fi] = url; swapped = true; }
      }
    }
    if (store.recent) {
      var ri = store.recent.indexOf(dataUrl);
      if (ri !== -1) { store.recent[ri] = url; swapped = true; }
    }
    // Track the panel asset id for THIS fresh upload (move/delete write-through).
    if (res.asset && res.asset.id) { _galRemoteUrls[url] = 1; _galRemoteAssetIds[url] = res.asset.id; }
    if (!swapped) return;
    // carry any saved image name onto the new key
    try {
      if (store.imageNames) {
        var oldH = _galImgHash(dataUrl), newH = _galImgHash(url);
        if (store.imageNames[oldH] && !store.imageNames[newH]) store.imageNames[newH] = store.imageNames[oldH];
      }
    } catch (e) {}
    _galSave(store);
    try { if (typeof _galScheduleRefresh === 'function') _galScheduleRefresh(); } catch (e) {}
  }).catch(function(e){ _bridgeFail(e); });
}

/* ── Dilim 5: hydrate the panel's media library into the gallery (panel → editor READ) ──
   When in the panel (CCAssets.active), pull the org's typed folders + image assets and
   merge them as a READ-ONLY in-memory overlay (folders tagged remote:true; urls tracked
   in _galRemoteUrls) so the SAME library shows in both the editor and the panel. Never
   persisted (see _galStripRemote) → standalone IDB stays clean. Idempotent: a re-run
   replaces the prior overlay. Images only for now; video/audio + write-back = next step. */
/* Resolve a gallery video entry's DURABLE library URL, whatever the store flavor:
   local entries carry `remoteUrl` (_galBridgeVideo writes it back after upload),
   portal-backed entries carry `_remoteUrl` (galSyncRemote, line below), and for a
   portal entry `src` itself IS the library URL (tracked in _galRemoteUrls). The
   timeline import paths stamp this onto the File as _ccAssetUrl so the video-editor
   save NEVER re-uploads bytes the library already holds. (The remoteUrl/_remoteUrl
   name drift made every "kütüphaneden tracke ekle" mint a duplicate asset.) */
function _galEntryRemoteUrl(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.remoteUrl) return entry.remoteUrl;
  if (entry._remoteUrl) return entry._remoteUrl;
  if (entry.src && typeof _galRemoteUrls !== 'undefined' && _galRemoteUrls[entry.src]) return entry.src;
  return null;
}
var _galSyncDeferred = false;
var _galRemoteRetryTimer = null;
function _galAppendRemoteAssets(store, pAssets) {
  if (!store || !pAssets || !pAssets.length) return;
  var idMap = {};
  var byId = {};
  (store.folders || []).forEach(function(f){
    byId[f.id] = f;
    if (f.remoteId) idMap[f.remoteId] = f.id;
  });
  pAssets.forEach(function(a){
    if (!a || !a.url || _galRemoteUrls[a.url]) return;
    _galRemoteUrls[a.url] = 1;
    if (a.id) _galRemoteAssetIds[a.url] = a.id;
    _galAssetMeta[a.url] = { brand: a.brand || '', tags: a.tags || [], bytes: a.bytes || 0 };
    var entry;
    if (a.kind === 'video') {
      entry = { type: 'video', src: a.url, poster: a.poster || '', name: a.name || 'Video', duration: 0, _assetId: a.id || null, _remoteUrl: a.url };
    } else if (a.kind === 'audio') {
      entry = { type: 'audio', url: a.url, author: a.name || 'Audio', name: a.name || 'Audio', tags: a.name || '', duration: 0, _assetId: a.id || null };
    } else {
      entry = a.url;
      if (a.name) store.imageNames[_galImgHash(a.url)] = a.name;
    }
    var eid = a.folderId ? idMap[a.folderId] : null;
    if (eid && byId[eid]) byId[eid].images.push(entry);
    else store.recent.push(entry);
  });
}

function galSyncRemote(force, allowRetry) {
  if (!window.CCAssets || !CCAssets.active || typeof CCAssets.listFolders !== 'function') return Promise.resolve(false);
  if (allowRetry === undefined) allowRetry = true;
  // The sync REPLACES the in-memory store (folder ids become cc:*). Doing that
  // while the upload queue is grinding invalidates the local folder ids the
  // queued items captured at drop time, so the rest of the batch stores
  // nowhere. Defer until the batch finishes.
  if (typeof UploadQueue !== 'undefined' && UploadQueue.isBusy && UploadQueue.isBusy()) {
    if (!_galSyncDeferred) {
      _galSyncDeferred = true;
      var _resync = function () {
        if (typeof UploadQueue !== 'undefined' && UploadQueue.isBusy && UploadQueue.isBusy()) { setTimeout(_resync, 1500); return; }
        _galSyncDeferred = false;
        galSyncRemote();
      };
      setTimeout(_resync, 1500);
    }
    return Promise.resolve(false);
  }
  if (_galSyncInFlight) return Promise.resolve(false);
  _galSyncInFlight = true;
  return Promise.all([CCAssets.listFolders(), CCAssets.listAssets()]).then(function(res) {
    // Read helpers preserve their historical [] fallback contract. Distinguish a REAL empty library
    // from a timeout/error before replacing the current store, otherwise one transient timeout makes
    // the Media Library look permanently disconnected until full-page reload.
    if (typeof CCAssets.lastLibraryReadFailed === 'function' && CCAssets.lastLibraryReadFailed()) {
      throw new Error('portal media read failed');
    }
    var pFolders = res[0] || [], pAssets = res[1] || [];
    // Portal is the SINGLE SOURCE when a design is open: build the store ENTIRELY from
    // the org library (all media kinds), not as an overlay merged onto the local store.
    var store = { folders: [], recent: [], imageNames: {}, recentFolderIds: [], _portalBacked: true };
    _galRemoteUrls = {}; _galRemoteFolders = {}; _galRemoteAssetIds = {}; _galAssetMeta = {};
    var idMap = {};
    pFolders.forEach(function(pf){
      var eid = 'cc:' + pf.id; idMap[pf.id] = eid; _galRemoteFolders[eid] = pf.id;
      store.folders.push({ id: eid, remoteId: pf.id, name: pf.name, icon: pf.icon || 'folder',
        parentId: pf.parentId ? ('cc:' + pf.parentId) : null, role: pf.role || '', images: [],
        mediaType: pf.mediaType || 'image', remote: true });
    });
    _galAppendRemoteAssets(store, pAssets);
    _galMemStore = store;                                // portal-backed in-memory store (not persisted; see _galSave)
    try { if (typeof _galScheduleRefresh === 'function') _galScheduleRefresh(); } catch (e) {}
    try { if (typeof _updateTypeCounts === 'function') _updateTypeCounts(); } catch (e) {}
    return true;
  }).catch(function(){
    if (allowRetry && !_galRemoteRetryTimer) {
      _galRemoteRetryTimer = setTimeout(function () {
        _galRemoteRetryTimer = null;
        galSyncRemote(true, false);
      }, 1200);
    }
    return false;
  }).then(function(ok) {
    _galSyncInFlight = false;
    return ok;
  });
}

function galLoadMoreRemote() {
  if (_galSyncInFlight || !window.CCAssets || !CCAssets.active || typeof CCAssets.listMoreAssets !== 'function') return Promise.resolve([]);
  var store = _galStore();
  if (!store || !store._portalBacked) return Promise.resolve([]);
  _galSyncInFlight = true;
  return CCAssets.listMoreAssets().then(function (assets) {
    _galAppendRemoteAssets(store, assets || []);
    _galMemStore = store;
    try { if (typeof _galScheduleRefresh === 'function') _galScheduleRefresh(); } catch (e) {}
    try { if (typeof _updateTypeCounts === 'function') _updateTypeCounts(); } catch (e) {}
    return assets || [];
  }).catch(function () { return []; }).then(function (assets) {
    _galSyncInFlight = false;
    return assets;
  });
}

/* ── Convert current canvas to image and save to gallery ── */
function convertCanvasToImage() {
  var cvs = getActiveCanvas();
  cvs.discardActiveObject();
  cvs.renderAll();

  var dataUrl = cvs.toDataURL({ format: 'jpeg', multiplier: 1, quality: 0.85 });
  var saved = saveToGallery(dataUrl);

  if (!saved) {
    dataUrl = cvs.toDataURL({ format: 'jpeg', multiplier: 0.5, quality: 0.7 });
    saved = saveToGallery(dataUrl);
  }

  if (!saved) {
    if (typeof showToast === 'function') showToast('Image too large to save to gallery', 'error');
    return;
  }

  if (typeof openFlyout === 'function') openFlyout('images');
  setTimeout(function () {
    if (typeof drillIntoImagesSub === 'function') drillIntoImagesSub('gallery', 'Gallery');
  }, 100);

  if (typeof showToast === 'function') showToast('Canvas saved to gallery!');
}

/* ══════════════════════════════════════════════════════════════
   DRAG & DROP + VIDEO MEDIA SUPPORT
   ════════════════════════════════════════════════════════════ */


if (window.cc && cc.modules) cc.modules.register({ id: 'storage', parent: 'left-panel.gallery', title: 'Gallery: storage', mount: function(){}, unmount: function(){} });
