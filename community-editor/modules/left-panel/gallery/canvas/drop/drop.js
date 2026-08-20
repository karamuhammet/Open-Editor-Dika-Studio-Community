/* Module: left-panel/gallery/canvas/drop — file/gallery drop onto canvas + media import
   FLAT sub-module of canvas — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 1944-line FLAT file. */

function _initCanvasFileDrop() {
  var area = document.getElementById('canvas-area');
  if (!area || area._fileDropBound) return;
  area._fileDropBound = true;

  // Create drop overlay
  var overlay = document.createElement('div');
  overlay.className = 'canvas-drop-overlay';
  overlay.innerHTML =
    '<div class="canvas-drop-card">' +
      '<div class="canvas-drop-icon">' + ((typeof getIcon === 'function') ? getIcon('upload', 40) : '⬆') + '</div>' +
      '<div class="canvas-drop-title">Drop to add</div>' +
      '<div class="canvas-drop-sub">Images & Videos</div>' +
    '</div>';
  area.appendChild(overlay);

  var dragCounter = 0;
  function _isMediaDrag(e) { return _hasDragFiles(e) || _hasDragGalleryItem(e); }
  function _resetDropOverlay() { dragCounter = 0; overlay.classList.remove('show'); }

  area.addEventListener('dragenter', function (e) {
    if (!_isMediaDrag(e)) return;
    e.preventDefault();
    dragCounter++;
    overlay.classList.add('show');
  });
  area.addEventListener('dragover', function (e) {
    if (!_isMediaDrag(e)) return;
    e.preventDefault();                 // required or the browser refuses the drop
    e.dataTransfer.dropEffect = 'copy';
  });
  // Symmetric guard: only a media drag incremented the counter on enter, so
  // only a media drag may decrement it on leave (an unguarded decrement on
  // unrelated drags desynced the counter and left the overlay stuck).
  area.addEventListener('dragleave', function (e) {
    if (!_isMediaDrag(e)) return;
    dragCounter--;
    if (dragCounter <= 0) _resetDropOverlay();
  });
  area.addEventListener('drop', function (e) {
    _resetDropOverlay();
    // Gallery cell drag (specific MIME, text/plain fallback for older payloads)
    if (_hasDragGalleryItem(e) && (!e.dataTransfer.files || !e.dataTransfer.files.length)) {
      e.preventDefault();
      e.stopPropagation();
      try {
        var json = e.dataTransfer.getData('application/x-dika-gallery-item') || e.dataTransfer.getData('text/plain');
        var data = JSON.parse(json);
        if (data.type === 'image' || data.type === 'video') {
          _handleGalleryCanvasDrop(data);
        }
      } catch(_) {}
      return;
    }
    // Handle file drop from OS
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    for (var i = 0; i < e.dataTransfer.files.length; i++) {
      var file = e.dataTransfer.files[i];
      if (_isImageFile(file) || (file.type && file.type.indexOf('video/') === 0) || (file.type && file.type.indexOf('audio/') === 0)) {
        _handleImportedMediaFile(file);
      }
    }
  });

  // Safety net: force-clear the overlay whenever any drag ends or drops anywhere,
  // even if the drop missed the canvas or was aborted. dragend fires on the drag
  // source (a gallery cell) regardless of where (or whether) the drop landed.
  if (!document._ccDropSafetyBound) {
    document._ccDropSafetyBound = true;
    document.addEventListener('dragend', _resetDropOverlay);
    document.addEventListener('drop', _resetDropOverlay);
  }
}

function _hasDragFiles(e) {
  if (!e.dataTransfer) return false;
  if (e.dataTransfer.types && e.dataTransfer.types.indexOf('Files') !== -1) return true;
  if (e.dataTransfer.types && typeof e.dataTransfer.types.contains === 'function' && e.dataTransfer.types.contains('Files')) return true;
  return false;
}

function _hasDragGalleryItem(e) {
  if (!e.dataTransfer || !e.dataTransfer.types) return false;
  var t = e.dataTransfer.types;
  var type = 'application/x-dika-gallery-item';
  return t.indexOf ? t.indexOf(type) !== -1 : (typeof t.contains === 'function' && t.contains(type));
}

function _handleGalleryCanvasDrop(data) {
  if (data.type === 'image') {
    // Prefer the dataUrl captured at dragstart: it is immune to a mid-drag grid
    // re-render (background sync, video-poster gen, IDB boot) shifting imgIdx and
    // mis-resolving to the wrong image or silently no-opping the drop.
    var dataUrl = data.dataUrl || null;
    if (!dataUrl) {
      var st = _galInit();
      if (data.srcFolder === '__recent' && st.recent && typeof st.recent[data.imgIdx] === 'string') {
        dataUrl = st.recent[data.imgIdx];
      } else if (data.srcFolder && data.srcFolder !== '__recent') {
        var fld = st.folders.filter(function(f) { return f.id === data.srcFolder; })[0];
        if (fld && fld.images && typeof fld.images[data.imgIdx] === 'string') {
          dataUrl = fld.images[data.imgIdx];
        }
      }
    }
    if (!dataUrl) return;
    fabric.Image.fromURL(dataUrl, function(img) {
      var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
      var iw = Math.round(140 * s);
      img.scaleToWidth(iw);
      var c = (typeof getCanvasCenter === 'function') ? getCanvasCenter() : { x: CW/2, y: CH/2 };
      img.set({ left: c.x - iw/2, top: c.y - iw/2 });
      canvas.add(img); canvas.setActiveObject(img); canvas.renderAll();
      if (typeof snap === 'function') snap();
    });
  } else if (data.type === 'video') {
    var st = _galInit();
    // Resolve video entry from both __recent and folders
    var entry = null;
    if (data.srcFolder === '__recent' && st.recent) {
      entry = st.recent[data.imgIdx];
    } else if (data.srcFolder && data.srcFolder !== '__recent') {
      var fld = st.folders.filter(function(f) { return f.id === data.srcFolder; })[0];
      if (fld && fld.images) entry = fld.images[data.imgIdx];
    }
    if (!entry || typeof entry !== 'object') return;
    var posterUrl = entry.poster || data.poster || '';
    var vidName = entry.name || data.name || 'Video';
    var vidIdbKey = entry.idbKey || data.idbKey || null;
    var vidSrc = entry.src || data.src || null;
    var vidDuration = entry.duration || 0;

    // If Video Editor is active, route to timeline
    var _veIsOn = typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive();

    // Library entries carry a durable URL (remoteUrl local / _remoteUrl portal); stamp it on
    // the File so the video-editor save does not re-upload a duplicate copy per add.
    var vidRemote = (typeof _galEntryRemoteUrl === 'function') ? _galEntryRemoteUrl(entry)
                    : (entry.remoteUrl || entry._remoteUrl || null);

    var _resolveAndAct = function(blobUrl, blob) {
      if (_veIsOn && window.VideoEditor && VideoEditor.importMediaFile) {
        var _doImport = function(b) {
          if (!b) return;
          var ext = 'mp4';
          if (b.type && b.type.indexOf('webm') !== -1) ext = 'webm';
          var f = new File([b], (vidName || 'video') + '.' + ext, { type: b.type || 'video/mp4' });
          if (vidRemote) f._ccAssetUrl = vidRemote;
          VideoEditor.importMediaFile(f, vidDuration);
          if (typeof showToast === 'function') showToast('Video added to timeline');
        };
        if (blob) { _doImport(blob); return; }
        if (blobUrl) {
          fetch(blobUrl).then(function(r) { return r.blob(); }).then(_doImport).catch(function() {});
        }
        return;
      }
      // Normal mode: add as Fabric object
      fabric.Image.fromURL(posterUrl, function(img) {
        var iw = Math.round(200 * ((typeof getCanvasScale === 'function') ? getCanvasScale() : 1));
        img.scaleToWidth(iw);
        var c = (typeof getCanvasCenter === 'function') ? getCanvasCenter() : { x: CW/2, y: CH/2 };
        img.set({ left: c.x - iw/2, top: c.y - iw/2, _isVideoMedia: true, _videoSrc: blobUrl, _videoPoster: posterUrl, _videoName: vidName, _videoIdbKey: vidIdbKey, objectCaching: false });
        canvas.add(img); canvas.setActiveObject(img);
        if (blobUrl && typeof _ccAttachVideoElement === 'function') _ccAttachVideoElement(img, blobUrl);
        canvas.renderAll();
        if (typeof snap === 'function') snap();
        if (typeof showToast === 'function') showToast('Video added: ' + vidName);
      });
    };
    var _dispatchDrop = function () {
      if (vidIdbKey && typeof _ccVideoIdbGet === 'function') {
        _ccVideoIdbGet(vidIdbKey).then(function(blob) {
          var url = blob ? URL.createObjectURL(blob) : vidSrc;
          _resolveAndAct(url, blob);
        }).catch(function() { _resolveAndAct(vidSrc); });
      } else if (vidSrc) {
        _resolveAndAct(vidSrc);
      }
    };
    // Portal videos have no poster: generate one first so fabric has an image to place.
    if (!entry.poster && (entry.src || entry._remoteUrl) && typeof _galEnsureVideoPoster === 'function') {
      _galEnsureVideoPoster(entry, function (p) { if (p) posterUrl = p; _dispatchDrop(); });
    } else {
      _dispatchDrop();
    }
  }
}

function _handleImportedMediaFile(file) {
  if (!file) return;
  if (file.type.indexOf('video/') === 0) {
    _addVideoFileToCanvas(file);
    return;
  }
  if (file.type.indexOf('audio/') === 0) {
    _addAudioFileToCanvas(file);
    return;
  }
  // Image: browser-side auto-compress (docs/image-compression-plan.md Phase 6), then place.
  // ccCompressImage returns the original file on off/skip/error, so import never blocks.
  var p = (typeof ccCompressImage === 'function') ? ccCompressImage(file) : Promise.resolve(file);
  p.then(function (cfile) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var finalUrl = ev.target.result;
      if (typeof saveToGallery === 'function') saveToGallery(finalUrl);
      _placeImportedImage(finalUrl);
    };
    reader.onerror = function () {
      // A blob: URL must never reach the doc: it dies on reload (the object is
      // then a dead reference) and it skips the gallery/asset save entirely.
      // Fail loudly so the user re-drops instead of losing the image later.
      if (typeof showToast === 'function') showToast('Image could not be read, please try again: ' + (file.name || 'image'), 'error');
    };
    reader.readAsDataURL(cfile);
  });
}

// Add an imported image (data/object URL) to the canvas, centered.
function _placeImportedImage(url) {
  fabric.Image.fromURL(url, function (img) {
    var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
    var iw = Math.round(140 * s);
    img.scaleToWidth(iw);
    var c = getCanvasCenter();
    img.set({ left: c.x - iw / 2, top: c.y - iw / 2 });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
    if (typeof snap === 'function') snap();
  });
}

function _fmtFileSize(bytes) {
  if (!bytes || bytes <= 0) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function _galTrashStore() {
  if (_galMemTrash) return _galMemTrash;
  try { return JSON.parse(localStorage.getItem(GAL_TRASH_KEY)) || { items: [], autoCleanDays: 7 }; }
  catch(e) { return { items: [], autoCleanDays: 7 }; }
}

function _galTrashSave(ts) {
  _galMemTrash = ts;           // sync in-memory
  _galIDBPut('trash', ts);     // async persist to IndexedDB
}

function galTrashAdd(dataUrl) {
  var ts = _galTrashStore();
  if (!ts.items) ts.items = [];
  ts.items.unshift({ dataUrl: dataUrl, deletedAt: Date.now() });
  // Limit to 100 items max
  if (ts.items.length > 100) ts.items = ts.items.slice(0, 100);
  _galTrashSave(ts);
}

function galTrashAddBulk(dataUrls) {
  var ts = _galTrashStore();
  if (!ts.items) ts.items = [];
  dataUrls.forEach(function(url) {
    ts.items.unshift({ dataUrl: url, deletedAt: Date.now() });
  });
  if (ts.items.length > 100) ts.items = ts.items.slice(0, 100);
  _galTrashSave(ts);
}

function galTrashRestore(index) {
  var ts = _galTrashStore();
  if (!ts.items || !ts.items[index]) return null;
  var item = ts.items.splice(index, 1)[0];
  _galTrashSave(ts);
  // Restore to recent
  var store = _galInit();
  store.recent.unshift(item.dataUrl);
  _galSave(store);
  return item.dataUrl;
}

function galTrashEmpty() {
  var ts = _galTrashStore();
  ts.items = [];
  _galTrashSave(ts);
}

function galTrashGetItems() {
  return _galTrashStore().items || [];
}

function galTrashCount() {
  return (_galTrashStore().items || []).length;
}

function galTrashAutoClean() {
  var ts = _galTrashStore();
  if (!ts.items || !ts.items.length) return;
  var days = ts.autoCleanDays || 7;
  var cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  var before = ts.items.length;
  ts.items = ts.items.filter(function(item) { return item.deletedAt > cutoff; });
  if (ts.items.length !== before) _galTrashSave(ts);
}

function galTrashGetAutoCleanDays() {
  return _galTrashStore().autoCleanDays || 7;
}

function galTrashSetAutoCleanDays(days) {
  var ts = _galTrashStore();
  ts.autoCleanDays = days;
  _galTrashSave(ts);
}

if (window.cc && cc.modules) cc.modules.register({ id: 'drop', parent: 'left-panel.gallery.canvas', title: 'canvas: drop', mount: function () {}, unmount: function () {} });
