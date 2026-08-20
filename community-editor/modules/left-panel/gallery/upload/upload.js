/* gallery/upload — user file/folder INTAKE — drag-drop zone, desktop folder drop, loose-file import, folder→zip export. Split from gallery.js (approved plan). FLAT sub-module:
   functions stay window globals (the panel/each other call them at runtime). Registers under left-panel.gallery. */


/* ── Upload Desktop Folder to Gallery ── */
function _uploadFolderToGallery(parentId) {
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.webkitdirectory = true;
  inp.multiple = true;
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', function() {
    var files = Array.prototype.slice.call(inp.files || []);
    document.body.removeChild(inp);
    if (!files.length) return;
    _processUploadedFolderFiles(files, parentId);
  });
  inp.click();
}


function _processUploadedFolderFiles(files, parentId) {
  // Filter to image files only
  var imageFiles = files.filter(function(f) {
    return _isImageFile(f);
  });
  if (!imageFiles.length) {
    if (typeof showToast === 'function') showToast('No images found in folder');
    return;
  }

  // Build folder tree from webkitRelativePath
  // Paths look like: "RootFolder/sub/image.jpg"
  var folderMap = {}; // relative dir path → { name, parentPath, galleryId }
  var rootName = '';

  imageFiles.forEach(function(f) {
    var parts = f.webkitRelativePath.split('/');
    if (!rootName && parts.length > 0) rootName = parts[0];
    // Build folder entries for each directory level (skip last part = filename)
    for (var i = 0; i < parts.length - 1; i++) {
      var dirPath = parts.slice(0, i + 1).join('/');
      if (!folderMap[dirPath]) {
        folderMap[dirPath] = {
          name: parts[i],
          parentPath: i > 0 ? parts.slice(0, i).join('/') : null,
          galleryId: null
        };
      }
    }
  });

  // Create gallery folders (breadth-first: root first, then children)
  var dirPaths = Object.keys(folderMap).sort(function(a, b) {
    return a.split('/').length - b.split('/').length;
  });
  dirPaths.forEach(function(dp) {
    var entry = folderMap[dp];
    var galParent = parentId || null;
    if (entry.parentPath && folderMap[entry.parentPath]) {
      galParent = folderMap[entry.parentPath].galleryId;
    }
    var created = galAddFolder(entry.name, 'folder', galParent);
    if (created) entry.galleryId = created.id;
  });

  // Show folders immediately, then load images async
  renderImagesCategoryView();

  // Use upload queue if available, otherwise fall back to direct processing
  if (window.UploadQueue) {
    window.UploadQueue.reset();
    imageFiles.forEach(function(file) {
      var parts = file.webkitRelativePath.split('/');
      var dirPath = parts.slice(0, parts.length - 1).join('/');
      var folderId = folderMap[dirPath] ? folderMap[dirPath].galleryId : null;
      if (folderId) window.UploadQueue.enqueue(file, folderId);
    });
    window.UploadQueue.start();
    return;
  }

  // Fallback: Read images and add to their respective folders
  var processed = 0;
  var total = imageFiles.length;
  if (typeof showToast === 'function') showToast('Importing ' + total + ' images...');

  // Process images sequentially to avoid localStorage race condition
  function processFileAt(fi) {
    if (fi >= imageFiles.length) {
      _galScheduleRefresh();
      if (typeof showToast === 'function') showToast(processed + ' images imported');
      return;
    }
    var file = imageFiles[fi];
    var parts = file.webkitRelativePath.split('/');
    var dirPath = parts.slice(0, parts.length - 1).join('/');
    var folderId = folderMap[dirPath] ? folderMap[dirPath].galleryId : null;
    if (!folderId) { processed++; processFileAt(fi + 1); return; }

    // Shared compressor (Settings -> Depolama -> Performans) then store; no inline resize.
    var _next = function () { processed++; _galScheduleRefresh(); processFileAt(fi + 1); };
    ccCompressToDataUrl(file).then(function (url) { galAddImageToFolder(folderId, url); _next(); }, _next);
  }
  processFileAt(0);
}


function _initGalleryFolderDrop() {
  var catView = document.getElementById('images-cat-view');
  if (!catView || catView._galDropInit) return;
  catView._galDropInit = true;
  var dragCounter = 0;

  catView.addEventListener('dragenter', function(e) {
    if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') === -1) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (dragCounter === 1) catView.classList.add('gal-drop-active');
  });

  catView.addEventListener('dragover', function(e) {
    if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') === -1) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  });

  catView.addEventListener('dragleave', function(e) {
    if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') === -1) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; catView.classList.remove('gal-drop-active'); }
  });

  catView.addEventListener('drop', function(e) {
    if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') === -1) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    catView.classList.remove('gal-drop-active');
    // parentId === null → import into the library/home (top-level folders + loose files)
    _handleGalleryDesktopDrop(e, null);
  });
}

function _handleGalleryDesktopDrop(e, parentId) {
  var items = e.dataTransfer ? e.dataTransfer.items : null;
  var legacyFiles = e.dataTransfer ? e.dataTransfer.files : null;
  if (!items || !items.length) {
    // No items API — fall back to the plain FileList
    if (legacyFiles) for (var f = 0; f < legacyFiles.length; f++) _importLooseFile(legacyFiles[f], parentId);
    return;
  }

  // CRITICAL: capture legacy entries SYNCHRONOUSLY — DataTransferItemList is live and
  // Chrome empties it after the handler returns, so async callbacks would see nothing.
  var legacyEntries = [];
  var legacyHasFolder = false;
  for (var i = 0; i < items.length; i++) {
    var legEntry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : (items[i].getAsEntry ? items[i].getAsEntry() : null);
    if (legEntry) legacyEntries.push(legEntry);
    if (legEntry && legEntry.isDirectory) legacyHasFolder = true;
  }

  // Try the modern File System Access API first (Chrome 86+)
  var useModern = items[0] && typeof items[0].getAsFileSystemHandle === 'function';
  if (useModern) {
    var handlePromises = [];
    for (var k = 0; k < items.length; k++) {
      if (items[k].kind === 'file') handlePromises.push(items[k].getAsFileSystemHandle());
    }
    Promise.all(handlePromises).then(function(handles) {
      var hasDir = handles.some(function(h) { return h.kind === 'directory'; });
      if (hasDir) {
        if (typeof showToast === 'function') showToast('Importing folders...');
        if (window.UploadQueue) window.UploadQueue.reset();
      }
      handles.forEach(function(handle) {
        if (handle.kind === 'directory') _readDroppedFolderModern(handle, parentId, true);
        else if (handle.kind === 'file') handle.getFile().then(function(file) { _importLooseFile(file, parentId); });
      });
    }).catch(function() {
      _galDropLegacyInto(legacyEntries, legacyHasFolder, legacyFiles, parentId);
    });
  } else {
    _galDropLegacyInto(legacyEntries, legacyHasFolder, legacyFiles, parentId);
  }
}


/* Legacy drop handler using pre-captured webkitGetAsEntry data, target-aware */
function _galDropLegacyInto(entries, hasFolder, fileList, parentId) {
  if (hasFolder) {
    if (typeof showToast === 'function') showToast('Importing folders...');
    if (window.UploadQueue) window.UploadQueue.reset();
    entries.forEach(function(entry) {
      if (entry.isDirectory) _readDroppedFolder(entry, parentId, true);
      else if (entry.isFile) entry.file(function(file) { _importLooseFile(file, parentId); });
    });
  } else if (fileList) {
    for (var j = 0; j < fileList.length; j++) _importLooseFile(fileList[j], parentId);
  }
}


/* A single loose file: into the library (parentId null) or a specific folder */
function _importLooseFile(file, parentId) {
  if (!file) return;
  if (!parentId) { if (_isMediaFile(file)) _handleImportedMediaFile(file); return; }
  if (_isImageFile(file)) _addImageFileToFolderFallback(file, parentId);
  else if (_isMediaFile(file)) _handleImportedMediaFile(file); // video/audio keep existing behaviour
}


/* Compress + add an image file directly into a gallery folder (shared compressor). */
function _addImageFileToFolderFallback(file, parentId) {
  ccCompressToDataUrl(file).then(function (url) {
    if (galAddImageToFolder(parentId, url)) _galScheduleRefresh();
  });
}


/* Modern File System Access API folder reader (Chrome 86+) */
function _readDroppedFolderModern(dirHandle, parentId, isRoot) {
  var folder = galAddFolder(dirHandle.name, 'folder', parentId);
  if (!folder) return;
  _galScheduleRefresh();

  var allEntries = [];
  var iter = dirHandle.values();

  function collectEntries() {
    return iter.next().then(function(result) {
      if (result.done) return allEntries;
      allEntries.push(result.value);
      return collectEntries();
    });
  }

  collectEntries().then(function(entries) {
    var fileHandles = entries.filter(function(e) { return e.kind === 'file'; });
    var dirHandles  = entries.filter(function(e) { return e.kind === 'directory'; });

    // Process subdirectories (never the root call)
    dirHandles.forEach(function(sub) { _readDroppedFolderModern(sub, folder.id, false); });

    // Use upload queue if available
    if (window.UploadQueue) {
      var fileIdx = 0;
      function enqueueNext() {
        if (fileIdx >= fileHandles.length) {
          // Start the queue once, from the top-level drop call — works whether the
          // drop targets the library (parentId null) or an open folder.
          if (isRoot) window.UploadQueue.start();
          return;
        }
        var fh = fileHandles[fileIdx];
        fh.getFile().then(function(file) {
          if (_isImageFile(file)) window.UploadQueue.enqueue(file, folder.id);
          fileIdx++;
          enqueueNext();
        }).catch(function() { fileIdx++; enqueueNext(); });
      }
      enqueueNext();
      return;
    }

    // Fallback: Process files sequentially
    var idx = 0;
    var saved = 0;
    function processNext() {
      if (idx >= fileHandles.length) {
        _galScheduleRefresh();
        if (saved > 0 && typeof showToast === 'function') showToast(saved + ' image' + (saved > 1 ? 's' : '') + ' imported');
        return;
      }
      var fh = fileHandles[idx];
      fh.getFile().then(function(file) {
        if (!_isImageFile(file)) { idx++; processNext(); return; }
        ccCompressToDataUrl(file).then(function (url) {
          if (galAddImageToFolder(folder.id, url)) saved++;
          idx++;
          _galScheduleRefresh();
          processNext();
        }, function () { idx++; processNext(); });
      }).catch(function() { idx++; processNext(); });
    }
    processNext();
  }).catch(function() {
    if (typeof showToast === 'function') showToast('Failed to read folder contents', 'error');
  });
}


function _readDroppedFolder(dirEntry, parentId, isRoot) {
  var folder = galAddFolder(dirEntry.name, 'folder', parentId);
  if (!folder) return;
  _galScheduleRefresh();
  var dirReader = dirEntry.createReader();
  var allEntries = [];

  function readBatch() {
    dirReader.readEntries(function(entries) {
      if (!entries.length) {
        var imageEntries = allEntries.filter(function(e) { return e.isFile; });
        var dirEntries   = allEntries.filter(function(e) { return e.isDirectory; });

        // Use upload queue if available
        if (window.UploadQueue) {
          var eIdx = 0;
          function enqueueEntry() {
            if (eIdx >= imageEntries.length) {
              // Start once from the top-level drop call (library or open folder)
              if (isRoot) window.UploadQueue.start();
              return;
            }
            imageEntries[eIdx].file(function(file) {
              if (_isImageFile(file)) window.UploadQueue.enqueue(file, folder.id);
              eIdx++;
              enqueueEntry();
            }, function() { eIdx++; enqueueEntry(); });
          }
          enqueueEntry();
          dirEntries.forEach(function(sub) { _readDroppedFolder(sub, folder.id, false); });
          return;
        }

        // Fallback: Process images sequentially to avoid localStorage race condition
        var idx = 0;
        function processNext() {
          if (idx >= imageEntries.length) {
            _galScheduleRefresh();
            if (idx > 0 && typeof showToast === 'function') showToast(idx + ' image' + (idx > 1 ? 's' : '') + ' imported');
            return;
          }
          var fileEntry = imageEntries[idx];
          fileEntry.file(function(file) {
            if (!_isImageFile(file)) { idx++; processNext(); return; }
            ccCompressToDataUrl(file).then(function (url) {
              galAddImageToFolder(folder.id, url);
              idx++;
              _galScheduleRefresh();
              processNext();
            }, function () { idx++; processNext(); });
          }, function() { idx++; processNext(); });
        }
        processNext();

        dirEntries.forEach(function(sub) {
          _readDroppedFolder(sub, folder.id);
        });
        return;
      }
      allEntries = allEntries.concat(Array.prototype.slice.call(entries));
      readBatch();
    }, function() { /* readEntries error — skip silently */ });
  }
  readBatch();
}


/* ── Folder Export as ZIP ── */
function _exportFolderAsZip(folder) {
  if (typeof JSZip === 'undefined') {
    if (typeof showToast === 'function') showToast('JSZip not loaded', 'error');
    return;
  }
  var store = _galInit();
  var zip = new JSZip();
  var imgCount = 0;

  function addFolderToZip(folderId, zipFolder) {
    var f = store.folders.filter(function(x) { return x.id === folderId; })[0];
    if (!f) return;
    (f.images || []).forEach(function(dataUrl, i) {
      if (!dataUrl || typeof dataUrl !== 'string') return;
      if (dataUrl.indexOf('data:') === 0) {
        var ext = 'png';
        var m = dataUrl.match(/^data:image\/(\w+);/);
        if (m) ext = m[1] === 'jpeg' ? 'jpg' : m[1];
        var b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        if (!b64) return;
        zipFolder.file('image_' + (i + 1) + '.' + ext, b64, { base64: true });
        imgCount++;
      } else {
        // P3: remote asset URL (cloud bridge) — fetch the bytes; JSZip accepts a Promise<Blob>
        var clean = dataUrl.split('?')[0];
        var em = clean.match(/\.(\w+)$/);
        zipFolder.file('image_' + (i + 1) + '.' + (em ? em[1] : 'png'),
          fetch(dataUrl, { credentials: 'include' }).then(function(r) { return r.blob(); }));
        imgCount++;
      }
    });
    // Add subfolders
    var children = store.folders.filter(function(x) { return x.parentId === folderId; });
    children.forEach(function(child) {
      var sub = zipFolder.folder(child.name || 'subfolder');
      addFolderToZip(child.id, sub);
    });
  }

  addFolderToZip(folder.id, zip);
  if (!imgCount) {
    if (typeof showToast === 'function') showToast('Folder has no images to export');
    return;
  }
  if (typeof showToast === 'function') showToast('Zipping ' + imgCount + ' images...');
  zip.generateAsync({ type: 'blob' }).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (folder.name || 'folder') + '.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
    if (typeof showToast === 'function') showToast(imgCount + ' images exported as ZIP');
  });
}


if (window.cc && cc.modules) cc.modules.register({ id: 'upload', parent: 'left-panel.gallery', title: 'Gallery: upload', mount: function(){}, unmount: function(){} });
