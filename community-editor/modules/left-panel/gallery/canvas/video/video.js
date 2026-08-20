/* Module: left-panel/gallery/canvas/video — on-canvas video engine (IDB, render loop, hover controls)
   FLAT sub-module of canvas — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 1944-line FLAT file. */

/* Ensure a video entry has a poster frame. Portal videos have no server-side poster, so
   the FIRST view captures one client-side; to stay fast (like images) this:
   1) reads a persisted poster from IndexedDB (instant on repeat views / reloads),
   2) captures with preload='metadata' + a seek (Range-fetches only the needed segment,
      NOT the whole video — that was the slowness),
   3) runs through a small concurrency queue so 27 videos don't hammer the network at once,
   4) caches the result back to IndexedDB keyed by the asset id. */
var _galPosterQueue = [];
var _galPosterActive = 0;
var _galPosterMax = 4;

function _galEnsureVideoPoster(entry, cb) {
  if (!entry) { if (cb) cb(''); return; }
  if (entry.poster) { if (cb) cb(entry.poster); return; }
  var url = entry.src || entry._remoteUrl || null;
  if (!url) { if (cb) cb(''); return; }
  var cacheKey = 'vpost:' + (entry._assetId || (typeof _galImgHash === 'function' ? _galImgHash(url) : url));
  if (typeof _galIDBGet === 'function') {
    _galIDBGet(cacheKey, function (cached) {
      if (cached) { entry.poster = cached; if (cb) cb(cached); return; }
      _galPosterQueue.push({ entry: entry, url: url, cacheKey: cacheKey, cb: cb });
      _galPosterPump();
    });
  } else {
    _galPosterQueue.push({ entry: entry, url: url, cacheKey: cacheKey, cb: cb });
    _galPosterPump();
  }
}
function _galPosterPump() {
  while (_galPosterActive < _galPosterMax && _galPosterQueue.length) {
    var job = _galPosterQueue.shift();
    _galPosterActive++;
    _galCaptureVideoPoster(job, function (poster) {
      _galPosterActive--;
      _galPosterPump();
      if (poster) {
        job.entry.poster = poster;
        if (typeof _galIDBPut === 'function') { try { _galIDBPut(job.cacheKey, poster); } catch (_) {} }
      }
      if (job.cb) job.cb(poster || '');
    });
  }
}
function _galCaptureVideoPoster(job, done) {
  var v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.preload = 'metadata';         // metadata + a seek Range-fetches only the needed bytes
  v.muted = true; v.playsInline = true;
  v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  var fin = false;
  function finish(poster) {
    if (fin) return; fin = true;
    if ((job.entry.duration == null || !job.entry.duration) && v.duration && isFinite(v.duration)) job.entry.duration = v.duration;
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {}
    if (v.parentNode) v.parentNode.removeChild(v);
    done(poster || '');
  }
  v.addEventListener('loadedmetadata', function () { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (_) {} });
  v.addEventListener('seeked', function () {
    try {
      var vw = v.videoWidth || 320, vh = v.videoHeight || 180;
      var oc = document.createElement('canvas'); oc.width = vw; oc.height = vh;
      oc.getContext('2d').drawImage(v, 0, 0, vw, vh);
      finish(oc.toDataURL('image/jpeg', 0.72));
    } catch (_) { finish(''); }
  });
  v.addEventListener('error', function () { finish(''); });
  setTimeout(function () { finish(''); }, 8000);
  v.src = job.url;
}

function _patchVideoCell(cell, entry, folderId, idx) {
  if (!cell || !entry) return;
  // Portal videos arrive with no poster: show a video placeholder immediately, then
  // generate a real poster from the source and swap it in.
  if (!entry.poster && (entry.src || entry._remoteUrl)) {
    var _im0 = cell.querySelector('img');
    if (_im0 && !_im0.getAttribute('src')) {
      _im0.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#2e2e36"/><polygon points="52,30 52,50 70,40" fill="#8888a0"/></svg>');
    }
    (function (c2, ent) {
      _galEnsureVideoPoster(ent, function (poster) {
        if (!poster) return;
        var im = c2.querySelector('img');
        if (im) im.src = poster;
        if (typeof _galApplyGridFilters === 'function') _galApplyGridFilters();
      });
    })(cell, entry);
  }
  cell.setAttribute('draggable', 'true');
  cell.setAttribute('data-media-type', 'video');
  if (entry.idbKey) cell.setAttribute('data-video-idb-key', entry.idbKey);
  if (entry.name)   cell.setAttribute('data-video-name', entry.name);

  // Fix: update displayed name — _createImageCell may have set it to "Image X"
  if (entry.name) {
    var nameEl = cell.querySelector('.gallery-cell-name');
    if (nameEl) { nameEl.textContent = entry.name; nameEl.title = entry.name; }
  }

  // Override info button to show video-specific popup
  var infoBtn = cell.querySelector('.gallery-img-info');
  if (infoBtn) {
    // Replace node to remove old listeners cleanly
    var newInfoBtn = infoBtn.cloneNode(true);
    infoBtn.parentNode.replaceChild(newInfoBtn, infoBtn);
    newInfoBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (typeof _galSelectionMode !== 'undefined' && _galSelectionMode) return;
      _showGalVideoInfoPopup(entry, folderId, e);
    });
  }

  var payload = JSON.stringify({
    type: 'video',
    srcFolder: folderId,
    imgIdx: idx,
    idbKey: entry.idbKey || null,
    src: entry.src || null,
    poster: entry.poster || null,
    name: entry.name || 'Video'
  });

  // Add duration badge overlay if duration is known
  if (entry.duration && isFinite(entry.duration) && entry.duration > 0) {
    var dm = Math.floor(entry.duration / 60);
    var ds = Math.floor(entry.duration % 60);
    var durBadge = document.createElement('span');
    durBadge.className = 'gal-duration-badge';
    durBadge.textContent = dm + ':' + (ds < 10 ? '0' : '') + ds;
    cell.style.position = 'relative';
    // Remove any existing badge first
    var oldBadge = cell.querySelector('.gal-duration-badge');
    if (oldBadge) oldBadge.parentNode.removeChild(oldBadge);
    cell.appendChild(durBadge);
  } else if (entry.idbKey && typeof _ccVideoIdbGet === 'function') {
    // Async duration detection for old entries without duration
    (function(cell2, ent) {
      _ccVideoIdbGet(ent.idbKey).then(function(blob) {
        if (!blob) return;
        var blobUrl = URL.createObjectURL(blob);
        var v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
        document.body.appendChild(v);
        var done = false;
        var cleanup = function() {
          if (done) return; done = true;
          v.src = ''; if (v.parentNode) v.parentNode.removeChild(v);
          try { URL.revokeObjectURL(blobUrl); } catch(_) {}
        };
        v.addEventListener('loadedmetadata', function() {
          if (v.duration && isFinite(v.duration) && v.duration > 0) {
            ent.duration = v.duration;
            var dm2 = Math.floor(v.duration / 60);
            var ds2 = Math.floor(v.duration % 60);
            var badge = document.createElement('span');
            badge.className = 'gal-duration-badge';
            badge.textContent = dm2 + ':' + (ds2 < 10 ? '0' : '') + ds2;
            cell2.style.position = 'relative';
            var old2 = cell2.querySelector('.gal-duration-badge');
            if (old2) old2.remove();
            cell2.appendChild(badge);
            // Persist updated duration back to store
            try { var st = _galInit(); _galSave(st); } catch(_) {}
          }
          cleanup();
        });
        v.addEventListener('error', cleanup);
        setTimeout(cleanup, 5000);
        v.src = blobUrl;
      }).catch(function() {});
    })(cell, entry);
  } else if (entry.src || entry._remoteUrl) {
    // Remote (portal / AI-generated) video: no idbKey and no local blob, so probe the URL directly.
    // loadedmetadata exposes duration + videoWidth/videoHeight without needing CORS — this is why
    // AI-saved videos showed no duration/size (owner bug: "AI ile ekledigimiz videolarin suresi yok").
    (function(cell2, ent) {
      var url = ent.src || ent._remoteUrl;
      var v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true;
      v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
      document.body.appendChild(v);
      var done = false;
      var cleanup = function() { if (done) return; done = true; v.src = ''; if (v.parentNode) v.parentNode.removeChild(v); };
      v.addEventListener('loadedmetadata', function() {
        if (v.videoWidth) { ent.width = v.videoWidth; ent.height = v.videoHeight; }
        if (v.duration && isFinite(v.duration) && v.duration > 0) {
          ent.duration = v.duration;
          var dmr = Math.floor(v.duration / 60), dsr = Math.floor(v.duration % 60);
          var badge = document.createElement('span');
          badge.className = 'gal-duration-badge';
          badge.textContent = dmr + ':' + (dsr < 10 ? '0' : '') + dsr;
          cell2.style.position = 'relative';
          var old3 = cell2.querySelector('.gal-duration-badge'); if (old3) old3.remove();
          cell2.appendChild(badge);
        }
        cleanup();
      });
      v.addEventListener('error', cleanup);
      setTimeout(cleanup, 8000);
      v.src = url;
    })(cell, entry);
  }
  // For _createImageCell cells this attribute is read by the existing dragstart handler.
  // For no-poster placeholder cells the listener below is the only dragstart handler.
  cell.setAttribute('data-drag-payload', payload);
  cell.addEventListener('dragstart', function(e) {
    if (typeof _galSelectionMode !== 'undefined' && _galSelectionMode) { e.preventDefault(); return; }
    // Same specific MIME + copyMove as the image cells so a video drops onto the canvas.
    e.dataTransfer.setData('application/x-dika-gallery-item', payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'copyMove';
    cell.classList.add('gal-dragging');
  });
  cell.addEventListener('dragend', function() {
    cell.classList.remove('gal-dragging');
    document.querySelectorAll('.gal-dragover').forEach(function(el) { el.classList.remove('gal-dragover'); });
  });
}

function _ccFixVideoSrcInJson(json) {
  if (!json || !json.objects) return json;
  for (var i = 0; i < json.objects.length; i++) {
    var o = json.objects[i];
    if (o._isVideoMedia && o._videoPoster) {
      o.src = o._videoPoster;
    }
  }
  return json;
}

function _ccDuplicateCanvasObject(srcObj, targetCanvas, opts, cb) {
  opts = opts || {};
  var offsetX = opts.offsetX || 0;
  var offsetY = opts.offsetY || 0;
  var addToCanvas = opts.addToCanvas !== false;

  // Video objects: clone from poster image (blob URL can't load as <img>)
  if (srcObj._isVideoMedia && srcObj._videoPoster) {
    fabric.Image.fromURL(srcObj._videoPoster, function (cl) {
      if (!cl) { if (cb) cb(null); return; }
      // Copy positioning & transform from source
      cl.set({
        left: (srcObj.left || 0) + offsetX,
        top: (srcObj.top || 0) + offsetY,
        scaleX: srcObj.scaleX,
        scaleY: srcObj.scaleY,
        angle: srcObj.angle || 0,
        flipX: srcObj.flipX || false,
        flipY: srcObj.flipY || false,
        opacity: srcObj.opacity != null ? srcObj.opacity : 1,
        _isVideoMedia: true,
        _videoSrc: srcObj._videoSrc,
        _videoPoster: srcObj._videoPoster,
        _videoName: srcObj._videoName,
        _videoIdbKey: srcObj._videoIdbKey,
        objectCaching: false
      });
      // Preserve clip path (video embedded in shape)
      if (srcObj.clipPath) {
        srcObj.clipPath.clone(function (clonedClip) {
          cl.set({ clipPath: clonedClip, _isClippedImage: true });
          if (addToCanvas && targetCanvas) {
            targetCanvas.add(cl);
            if (cl._videoSrc) _ccAttachVideoElement(cl, cl._videoSrc);
          }
          if (cb) cb(cl);
        });
        return;
      }
      if (addToCanvas && targetCanvas) {
        targetCanvas.add(cl);
        if (cl._videoSrc) {
          _ccAttachVideoElement(cl, cl._videoSrc);
        }
      }
      if (cb) cb(cl);
    });
    return;
  }

  srcObj.clone(function (cl) {
    cl.set({ left: (cl.left || 0) + offsetX, top: (cl.top || 0) + offsetY });
    if (addToCanvas && targetCanvas) {
      targetCanvas.add(cl);
    }
    if (cb) cb(cl);
  }, CUSTOM_PROPS);
}

function _ccVideoIdb() {
  if (_ccVideoIdbCache) return Promise.resolve(_ccVideoIdbCache);
  /* THE RENAME MOVES FIRST, THEN WE OPEN. The store was `cardcraft_videos` before the rename
     (docs/dika-rename-plan.md P5). It was one of two that got the new NAME without the copy, so
     every video anybody had placed on a canvas opened as a missing blob. Found by deriving the
     database list instead of trusting a hand-written one: tools/_idb-migration-derive.mjs. */
  var moved = (window.CCMigrate && CCMigrate.db)
    ? CCMigrate.db('cardcraft_videos', _ccVideoIdbName) : Promise.resolve(false);
  return moved.catch(function () { return false; }).then(function () { return _ccVideoIdbOpen(); });
}

function _ccVideoIdbOpen() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(_ccVideoIdbName, _ccVideoIdbVersion);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
    };
    req.onsuccess = function (e) {
      _ccVideoIdbCache = e.target.result;
      resolve(_ccVideoIdbCache);
    };
    req.onerror = function () { reject(new Error('IndexedDB open failed')); };
  });
}

function _ccVideoIdbPut(key, blob) {
  return _ccVideoIdb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(blob, key);
      tx.oncomplete = function () { resolve(key); };
      tx.onerror = function () { reject(new Error('IDB put failed')); };
    });
  });
}

function _ccVideoIdbGet(key) {
  return _ccVideoIdb().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('blobs', 'readonly');
      var req = tx.objectStore('blobs').get(key);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  });
}

function _ccVideoIdbDelete(key) {
  return _ccVideoIdb().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').delete(key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  });
}

function _ccVideoGenKey() {
  return 'vid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

var _ccActiveVideoObjects = [];

function _ccVideoTrackActive(obj) {
  if (obj && _ccActiveVideoObjects.indexOf(obj) === -1) _ccActiveVideoObjects.push(obj);
}

function _ccVideoUntrack(obj) {
  var at = _ccActiveVideoObjects.indexOf(obj);
  if (at !== -1) _ccActiveVideoObjects.splice(at, 1);
}

function _ccVideoRenderLoop() {
  if (!_ccVideoPlaying) return;
  var changed = false;
  for (var i = _ccActiveVideoObjects.length - 1; i >= 0; i--) {
    var obj = _ccActiveVideoObjects[i];
    if (!obj || obj.canvas !== canvas || !obj._isVideoMedia || !obj._videoElement || obj._videoElement.paused) {
      _ccActiveVideoObjects.splice(i, 1);
      continue;
    }
    if (document.hidden || (typeof obj.isOnScreen === 'function' && !obj.isOnScreen())) continue;
    obj.dirty = true;
    changed = true;
  }
  if (changed) canvas.renderAll();
  if (_ccActiveVideoObjects.length) _ccVideoRafId = requestAnimationFrame(_ccVideoRenderLoop);
  else { _ccVideoPlaying = false; _ccVideoRafId = 0; }
}

function _ccVideoStartLoop(obj) {
  _ccVideoTrackActive(obj);
  if (_ccVideoPlaying || !_ccActiveVideoObjects.length) return;
  _ccVideoPlaying = true;
  _ccVideoRafId = requestAnimationFrame(_ccVideoRenderLoop);
}

function _ccVideoStopLoopIfIdle() {
  for (var i = _ccActiveVideoObjects.length - 1; i >= 0; i--) {
    var obj = _ccActiveVideoObjects[i];
    if (!obj || obj.canvas !== canvas || !obj._videoElement || obj._videoElement.paused) _ccActiveVideoObjects.splice(i, 1);
  }
  if (_ccActiveVideoObjects.length) return;
  _ccVideoPlaying = false;
  if (_ccVideoRafId) { cancelAnimationFrame(_ccVideoRafId); _ccVideoRafId = 0; }
}

function _ccVideoPauseAll() {
  var objs = canvas.getObjects();
  for (var i = 0; i < objs.length; i++) {
    if (objs[i]._isVideoMedia && objs[i]._videoElement && !objs[i]._videoElement.paused) {
      try { objs[i]._videoElement.pause(); } catch (_) {}
    }
  }
  _ccVideoPlaying = false;
  _ccActiveVideoObjects.length = 0;
  if (_ccVideoRafId) { cancelAnimationFrame(_ccVideoRafId); _ccVideoRafId = 0; }
}

function _ccAttachVideoElement(fabricImg, blobUrl) {
  if (!fabricImg || !blobUrl) return;
  // Destroy previous if any
  if (fabricImg._videoElement) _ccDestroyVideoElement(fabricImg);
  var vid = document.createElement('video');
  vid.muted = true;
  vid.loop = true;
  vid.playsInline = true;
  vid.preload = 'auto';
  // Keep video off-screen but NOT display:none (browsers may skip decoding hidden video)
  vid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  vid.src = blobUrl;
  document.body.appendChild(vid);
  fabricImg._videoElement = vid;
  var _attached = false;
  function _doAttach() {
    if (_attached) return;
    _attached = true;
    try { vid.currentTime = 0; } catch (_) {}
    // Save current dimensions & scale before setElement resets them
    var prevW = fabricImg.width;
    var prevH = fabricImg.height;
    var prevSx = fabricImg.scaleX;
    var prevSy = fabricImg.scaleY;
    var hadClip = !!(fabricImg.clipPath && fabricImg._isClippedImage);
    var clipSx = hadClip ? (fabricImg.clipPath.scaleX || 1) : 1;
    var clipSy = hadClip ? (fabricImg.clipPath.scaleY || 1) : 1;
    // Set video element width/height attributes so Fabric can read them
    var vw = vid.videoWidth || prevW || 640;
    var vh = vid.videoHeight || prevH || 360;
    vid.width = vw;
    vid.height = vh;
    fabricImg.setElement(vid);
    // setElement resets width/height — restore video native dimensions
    fabricImg.width = vw;
    fabricImg.height = vh;
    if (hadClip) {
      // When clipped, keep the exact scale that was set during clipping
      // Just compensate for the width/height change from poster→video
      if (prevW && prevW > 0 && prevSx) {
        var visualW = prevW * prevSx;
        fabricImg.scaleX = visualW / vw;
      }
      if (prevH && prevH > 0 && prevSy) {
        var visualH = prevH * prevSy;
        fabricImg.scaleY = visualH / vh;
      }
      // Re-compensate clipPath scale for new image scale
      fabricImg.clipPath.scaleX = clipSx * (prevSx || 1) / (fabricImg.scaleX || 1);
      fabricImg.clipPath.scaleY = clipSy * (prevSy || 1) / (fabricImg.scaleY || 1);
    } else {
      // Unclipped: recalculate scale to preserve the visual size from poster
      if (prevW && prevW > 0 && prevSx) {
        var visW = prevW * prevSx;
        fabricImg.scaleX = visW / vw;
      }
      if (prevH && prevH > 0 && prevSy) {
        var visH = prevH * prevSy;
        fabricImg.scaleY = visH / vh;
      }
    }
    fabricImg.set({ dirty: true, objectCaching: false });
    canvas.renderAll();
  }
  vid.addEventListener('loadeddata', _doAttach);
  vid.addEventListener('canplay', function () { setTimeout(_doAttach, 50); });
}

function _ccToggleVideoPlayback(fabricImg) {
  if (!fabricImg || !fabricImg._videoElement) {
    // No video element — try to re-attach from stored src
    if (fabricImg && fabricImg._isVideoMedia && fabricImg._videoSrc) {
      _ccAttachVideoElement(fabricImg, fabricImg._videoSrc);
      // Retry play after a short delay for loading
      setTimeout(function () { _ccToggleVideoPlayback(fabricImg); }, 300);
    }
    return;
  }
  var vid = fabricImg._videoElement;
  if (vid.paused) {
    // Ensure video is ready to play
    if (vid.readyState < 2) {
      // Not enough data yet — wait for canplay then play
      var _waited = false;
      vid.addEventListener('canplay', function _onReady() {
        vid.removeEventListener('canplay', _onReady);
        if (_waited) return;
        _waited = true;
        _doPlay();
      });
      // Also try loading explicitly
      try { vid.load(); } catch (_) {}
      setTimeout(function () {
        if (!_waited) { _waited = true; _doPlay(); }
      }, 500);
      return;
    }
    _doPlay();
  } else {
    vid.pause();
    _ccVideoUntrack(fabricImg);
    _ccUpdateVideoHoverIcon(false);
    _ccVideoStopLoopIfIdle();
  }
  function _doPlay() {
    var p = vid.play();
    if (p && typeof p.then === 'function') {
      p.then(function () {
        _ccVideoStartLoop(fabricImg);
        _ccUpdateVideoHoverIcon(true);
      }).catch(function (err) {
        console.warn('[dika studio] Video play failed:', err);
        // Try again with explicit load
        vid.load();
        vid.addEventListener('canplay', function _retry() {
          vid.removeEventListener('canplay', _retry);
          var p2 = vid.play();
          if (p2 && typeof p2.then === 'function') {
            p2.then(function () {
              _ccVideoStartLoop(fabricImg);
              _ccUpdateVideoHoverIcon(true);
            }).catch(function () {
              _ccUpdateVideoHoverIcon(false);
            });
          }
        });
      });
    } else {
      _ccVideoStartLoop(fabricImg);
      _ccUpdateVideoHoverIcon(true);
    }
  }
}

function _ccDestroyVideoElement(fabricImg) {
  if (!fabricImg || !fabricImg._videoElement) return;
  _ccVideoUntrack(fabricImg);
  try { fabricImg._videoElement.pause(); } catch (_) {}
  try { fabricImg._videoElement.src = ''; } catch (_) {}
  if (fabricImg._videoElement.parentNode) {
    fabricImg._videoElement.parentNode.removeChild(fabricImg._videoElement);
  }
  fabricImg._videoElement = null;
}

function _ccEnsureVideoHoverBtn() {
  var btn = document.getElementById('cc-video-hover-btn');
  if (btn) return btn;
  btn = document.createElement('div');
  btn.id = 'cc-video-hover-btn';
  btn.className = 'canvas-video-hover-btn';
  btn.innerHTML = _ccVideoPlaySvg;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (_ccVideoHoverTarget && _ccVideoHoverTarget._isVideoMedia) {
      _ccToggleVideoPlayback(_ccVideoHoverTarget);
    }
  });
  var area = document.getElementById('canvas-area');
  if (area) area.appendChild(btn);
  return btn;
}

function _ccUpdateVideoHoverIcon(isPlaying) {
  var btn = document.getElementById('cc-video-hover-btn');
  if (!btn) return;
  btn.innerHTML = isPlaying ? _ccVideoPauseSvg : _ccVideoPlaySvg;
  if (isPlaying) btn.classList.add('is-playing');
  else btn.classList.remove('is-playing');
}

function _ccPositionVideoHoverBtn(obj) {
  var btn = _ccEnsureVideoHoverBtn();
  if (!obj) { btn.style.display = 'none'; return; }
  var area = document.getElementById('canvas-area');
  if (!area) { btn.style.display = 'none'; return; }
  var areaRect = area.getBoundingClientRect();
  var canvasEl = canvas.upperCanvasEl || canvas.lowerCanvasEl;
  if (!canvasEl) { btn.style.display = 'none'; return; }
  var canvasRect = canvasEl.getBoundingClientRect();
  // Canvas element actual screen size vs internal pixel size
  var cw = canvas.getWidth() || 1;
  var ch = canvas.getHeight() || 1;
  var screenScaleX = canvasRect.width / cw;
  var screenScaleY = canvasRect.height / ch;
  // Get object bounding rect in canvas pixel coords
  var bound = obj.getBoundingRect(true);
  // Convert to screen coords relative to canvas-area
  var screenLeft = canvasRect.left - areaRect.left + bound.left * screenScaleX;
  var screenTop = canvasRect.top - areaRect.top + bound.top * screenScaleY;
  var screenW = bound.width * screenScaleX;
  var screenH = bound.height * screenScaleY;
  // Center of the object on screen
  var cx = screenLeft + screenW / 2;
  var cy = screenTop + screenH / 2;
  // Scale button: proportional to shortest side, clamped between 32-72px
  var minSide = Math.min(screenW, screenH);
  var btnSize = Math.max(32, Math.min(72, Math.round(minSide * 0.35)));
  var iconSize = Math.max(14, Math.round(btnSize * 0.42));
  btn.style.left = cx + 'px';
  btn.style.top = cy + 'px';
  btn.style.width = btnSize + 'px';
  btn.style.height = btnSize + 'px';
  btn.style.setProperty('--cc-video-btn-icon-size', iconSize + 'px');
  btn.style.display = 'flex';
  var isPlaying = obj._videoElement && !obj._videoElement.paused;
  _ccUpdateVideoHoverIcon(!!isPlaying);
}

function _ccUpdateVideoHoverButton(obj) {
  if (!obj || !obj._isVideoMedia) {
    var btn = document.getElementById('cc-video-hover-btn');
    if (btn) btn.style.display = 'none';
    _ccVideoHoverTarget = null;
    return;
  }
  _ccVideoHoverTarget = obj;
  _ccPositionVideoHoverBtn(obj);
}

function _ccSyncVideoObjectUi(obj) {
  if (!obj || !obj._isVideoMedia) return;
  var isPlaying = obj._videoElement && !obj._videoElement.paused;
  _ccUpdateVideoHoverIcon(!!isPlaying);
}

function _ccInitVideoCanvasEvents() {
  canvas.on('mouse:over', function (opt) {
    var t = opt.target;
    if (t && t._isVideoMedia) {
      _ccVideoHoverTarget = t;
      _ccPositionVideoHoverBtn(t);
    }
  });
  canvas.on('mouse:out', function (opt) {
    var t = opt.target;
    if (t && t === _ccVideoHoverTarget) {
      // Delay hide so user can click the button
      setTimeout(function () {
        var btn = document.getElementById('cc-video-hover-btn');
        if (btn && btn.matches(':hover')) return;
        if (_ccVideoHoverTarget === t) {
          btn && (btn.style.display = 'none');
          _ccVideoHoverTarget = null;
        }
      }, 120);
    }
  });
  canvas.on('object:moving', function (opt) {
    if (opt.target && opt.target === _ccVideoHoverTarget) _ccPositionVideoHoverBtn(opt.target);
  });
  canvas.on('object:scaling', function (opt) {
    if (opt.target && opt.target === _ccVideoHoverTarget) _ccPositionVideoHoverBtn(opt.target);
  });
  canvas.on('object:modified', function (opt) {
    if (opt.target && opt.target._isVideoMedia) _ccPositionVideoHoverBtn(opt.target);
  });
  canvas.on('object:removed', function (opt) {
    var obj = opt.target;
    if (obj && obj._isVideoMedia) {
      _ccDestroyVideoElement(obj);
      // scan-3000 M-M1: free the (up to 100MB) blob once nothing references it.
      // Delayed + re-checked so transient remove/re-add flows (grouping, page
      // restores) keep their URL; rehydrate re-mints from IndexedDB anyway,
      // so a false revoke self-heals on the next page load.
      var src = obj._videoSrc;
      if (typeof src === 'string' && src.indexOf('blob:') === 0) {
        setTimeout(function () {
          try {
            var inUse = canvas.getObjects().some(function (o) { return o._videoSrc === src; });
            if (!inUse) URL.revokeObjectURL(src);
          } catch (e) { /* best-effort */ }
        }, 5000);
      }
      if (obj === _ccVideoHoverTarget) _ccUpdateVideoHoverButton(null);
    }
  });
  // Hide button on mouse leave from the canvas area
  var hoverBtn = _ccEnsureVideoHoverBtn();
  hoverBtn.addEventListener('mouseleave', function () {
    if (!_ccVideoHoverTarget) {
      hoverBtn.style.display = 'none';
    }
  });
}

function _addVideoFileToCanvas(file) {
  if (file.size > _CC_VIDEO_MAX_SIZE) {
    // The number comes from the plan, so the message must too: a hardcoded "max 100 MB" was still
    // being shown after the ceiling moved, which is worse than no message.
    var _lbl = typeof _ccVideoMaxLabel === 'function' ? _ccVideoMaxLabel() : '1 GB';
    if (typeof showToast === 'function') showToast('Video file too large (max ' + _lbl + ')', 'error');
    return;
  }
  var blobUrl = URL.createObjectURL(file);
  var idbKey = _ccVideoGenKey();
  var vid = document.createElement('video');
  vid.preload = 'auto';
  vid.muted = true;
  vid.playsInline = true;
  // Must be in DOM for reliable frame decoding in all browsers
  vid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(vid);
  var _posterCaptured = false;

  function _capturePosterAndAdd() {
    if (_posterCaptured) return;
    _posterCaptured = true;
    var vw = vid.videoWidth || 640;
    var vh = vid.videoHeight || 360;
    var vidDuration = (vid.duration && isFinite(vid.duration)) ? vid.duration : 0;
    var oc = document.createElement('canvas');
    oc.width = vw;
    oc.height = vh;
    var octx = oc.getContext('2d');
    octx.drawImage(vid, 0, 0, vw, vh);
    var posterUrl = oc.toDataURL('image/jpeg', 0.8);
    vid.pause();
    // Clean up poster-capture video element from DOM
    try { vid.src = ''; } catch (_) {}
    if (vid.parentNode) vid.parentNode.removeChild(vid);

    function _finishAdd(storedIdbKey) {
      _saveVideoToGallery(posterUrl, blobUrl, file.name, storedIdbKey, vidDuration);
      fabric.Image.fromURL(posterUrl, function (img) {
        var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
        var iw = Math.round(200 * s);
        img.scaleToWidth(iw);
        var c = getCanvasCenter();
        img.set({
          left: c.x - iw / 2,
          top: c.y - iw / 2,
          _isVideoMedia: true,
          _videoSrc: blobUrl,
          _videoPoster: posterUrl,
          _videoName: file.name,
          _videoIdbKey: storedIdbKey,
          objectCaching: false
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        _ccAttachVideoElement(img, blobUrl);
        canvas.renderAll();
        if (typeof snap === 'function') snap();
        _galBridgeVideo(file, blobUrl, img);
        if (typeof showToast === 'function') showToast('Video added (' + file.name + ')');
      });
    }

    // Store video blob in IndexedDB
    var readBlob;
    if (typeof file.arrayBuffer === 'function') {
      readBlob = file.arrayBuffer().then(function (ab) {
        return new Blob([ab], { type: file.type || 'video/mp4' });
      });
    } else {
      readBlob = new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve(new Blob([fr.result], { type: file.type || 'video/mp4' })); };
        fr.onerror = function () { resolve(null); };
        fr.readAsArrayBuffer(file);
      });
    }
    readBlob.then(function (blob) {
      if (!blob) { _finishAdd(null); return; }
      return _ccVideoIdbPut(idbKey, blob).then(function () {
        _finishAdd(idbKey);
      });
    }).catch(function () {
      _finishAdd(null);
    });
  }

  vid.addEventListener('loadeddata', function () {
    // Try to seek to 0.5s for a better poster frame
    if (vid.duration > 0.5) {
      vid.currentTime = 0.5;
    } else {
      _capturePosterAndAdd();
    }
  });
  vid.addEventListener('seeked', function () {
    _capturePosterAndAdd();
  });
  // Fallback: if loadeddata fires but seeked never does
  vid.addEventListener('canplay', function () {
    setTimeout(function () { _capturePosterAndAdd(); }, 300);
  });
  vid.addEventListener('error', function () {
    URL.revokeObjectURL(blobUrl);
    if (typeof showToast === 'function') showToast('Failed to load video file', 'error');
  });
  vid.src = blobUrl;
}

function _saveVideoToGallery(posterUrl, videoSrc, fileName, idbKey, duration) {
  var store = _galInit();
  if (!store.recent) store.recent = [];
  var entry = {
    poster: posterUrl,
    src: videoSrc,
    name: fileName,
    type: 'video',
    idbKey: idbKey || null,
    duration: (duration && isFinite(duration)) ? duration : 0,
    ts: Date.now()
  };
  store.recent.unshift(entry);
  if (store.recent.length > 50) store.recent = store.recent.slice(0, 50);
  _galSave(store);
  // Refresh gallery UI if visible
  if (typeof _refreshGalleryView === 'function') {
    try { _refreshGalleryView(null); } catch (_) {}
  }
}

/* ── P3 cloud bridge (video) ──
   When the editor runs in the panel (CCAssets.active), upload the video file to
   the assets API and record the durable remote URL on the gallery entry +
   canvas object (_videoUrl). IndexedDB is local-only, so this is what lets the
   video survive a reload on another device. No-op standalone; failure is silent
   (the local blob + IndexedDB path keeps working). */
function _galBridgeVideo(file, blobUrl, fabricObj) {
  if (!window.CCAssets || !CCAssets.active || !file) return;
  CCAssets.uploadBlob(file, { name: file.name || ('video-' + Date.now() + '.mp4'), mime: file.type || 'video/mp4' }).then(function (res) {
    if (!res || !res.url) return;
    if (fabricObj) { try { fabricObj.set('_videoUrl', res.url); } catch (_) { fabricObj._videoUrl = res.url; } }
    try {
      var store = _galStore();
      if (store && store.recent) {
        for (var i = 0; i < store.recent.length; i++) {
          var e = store.recent[i];
          if (e && typeof e === 'object' && e.type === 'video' && e.src === blobUrl) e.remoteUrl = res.url;
        }
        _galSave(store);
      }
    } catch (_) {}
    try { if (typeof snap === 'function') snap(); } catch (_) {}
  });
}

function _isCanvasVideoObject(obj) {
  return !!(obj && obj._isVideoMedia);
}

function _rehydrateCanvasVideoMedia(cvs, cb) {
  if (!cvs) { if (cb) cb(); return; }
  var objects = cvs.getObjects ? cvs.getObjects() : [];
  var pending = 0;
  var done = false;
  function finish() {
    if (done) return;
    done = true;
    if (cb) cb();
  }
  objects.forEach(function (obj) {
    if (!obj._isVideoMedia) return;
    // If blob URL still valid, just attach
    if (obj._videoSrc && obj._videoSrc.indexOf('blob:') === 0) {
      _ccAttachVideoElement(obj, obj._videoSrc);
      return;
    }
    // Restore from IndexedDB (local), then the durable remote URL (cross-device, P3)
    if (obj._videoIdbKey) {
      pending++;
      _ccVideoIdbGet(obj._videoIdbKey).then(function (blob) {
        if (blob) {
          var newUrl = URL.createObjectURL(blob);
          obj.set({ _videoSrc: newUrl, opacity: 1 });
          _ccAttachVideoElement(obj, newUrl);
        } else if (obj._videoUrl) {
          obj.set({ _videoSrc: obj._videoUrl, opacity: 1 });
          _ccAttachVideoElement(obj, obj._videoUrl);
        } else {
          obj.set({ opacity: 0.6 });
        }
      }).catch(function () {
        obj.set({ opacity: 0.6 });
      }).finally(function () {
        pending--;
        if (pending <= 0) finish();
      });
    } else if (obj._videoUrl) {
      obj.set({ _videoSrc: obj._videoUrl, opacity: 1 });
      _ccAttachVideoElement(obj, obj._videoUrl);
    } else {
      obj.set({ opacity: 0.6 });
    }
  });
  if (pending === 0) finish();
  // Reattach animated GIF elements (they lose DOM refs after JSON load)
  if (typeof window._gifReattachElements === 'function') window._gifReattachElements();
}

if (window.cc && cc.modules) cc.modules.register({ id: 'video', parent: 'left-panel.gallery.canvas', title: 'canvas: video', mount: function () {}, unmount: function () {} });
