/* Module: left-panel/gallery/canvas/audio — on-canvas audio player + transport
   FLAT sub-module of canvas — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 1944-line FLAT file. */

function _galAudioStop() {
  if (_galAudioState.audio) {
    _galAudioState.audio.pause();
    _galAudioState.audio.currentTime = 0;
    _galAudioState.audio = null;
  }
  _galAudioReleaseResolvedUrl();
  _galAudioPlayerHide();
}

function _galAudioReleaseResolvedUrl() {
  var owned = _galAudioState._resolvedObjectUrl;
  if (owned) {
    try { URL.revokeObjectURL(owned); } catch (_) {}
    _galAudioState._resolvedObjectUrl = null;
  }
}

// /editor runs under COEP (require-corp), which BLOCKS no-cors cross-origin
// <audio>. fetch() is a CORS request (allowed), so we turn cross-origin stock
// audio into a same-origin blob URL — otherwise the preview player loads nothing
// (duration 0:00, no sound) even though the same track plays on canvas/video
// (those already go through a blob). Same trick the video editor uses.
function _galAudioResolveSrc(url, cb) {
  if (!url || /^(blob:|data:|\/)/.test(url) || url.indexOf(location.origin + '/') === 0) { cb(url, false); return; }
  fetch(url).then(function (r) { return r.ok ? r.blob() : null; })
    .then(function (b) { cb(b ? URL.createObjectURL(b) : url, !!b); })
    .catch(function () { cb(url, false); });
}

function _galAudioPlay(url, name, author) {
  // Stop current playback
  if (_galAudioState.audio) {
    _galAudioState.audio.pause();
    _galAudioState.audio = null;
  }
  _galAudioReleaseResolvedUrl();
  // Also stop any stock preview audios
  document.querySelectorAll('.stock-audio-play').forEach(function(btn) {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text)"><polygon points="5,3 19,12 5,21"/></svg>';
  });

  _galAudioState.name = name || 'Audio';
  _galAudioState.author = author || '';
  _galAudioState.url = url;
  // Show player immediately (resolving the source may take a moment for stock URLs)
  _galAudioPlayerShow();

  _galAudioResolveSrc(url, function (src, owned) {
    if (_galAudioState.url !== url) {
      if (owned) { try { URL.revokeObjectURL(src); } catch (_) {} }
      return; // a newer track started while resolving
    }
    _galAudioState._resolvedObjectUrl = owned ? src : null;
    var a = new Audio(src);
    a.volume = (_galAudioState.volume != null) ? _galAudioState.volume : 0.7;
    a.muted = !!_galAudioState.muted;
    a.playbackRate = _galAudioState.speed || 1;
    _galAudioState.audio = a;

    a.addEventListener('loadedmetadata', function() {
      _galAudioPlayerShow();
      _galAudioPlayerSync();
    });
    a.addEventListener('timeupdate', function() { _galAudioPlayerSync(); });
    a.addEventListener('ended', function() {
      _galAudioState.audio = null;
      _galAudioReleaseResolvedUrl();
      _galAudioPlayerHide();
    });
    a.play().catch(function() {});
  });
}

function _galAudioToggle() {
  var a = _galAudioState.audio;
  if (!a) return;
  if (a.paused) a.play().catch(function() {});
  else a.pause();
  _galAudioPlayerSync();
}

function _galAudioSeekBy(delta) {
  var a = _galAudioState.audio;
  if (!a) return;
  a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
}

function _galAudioSetSpeed(spd) {
  _galAudioState.speed = spd;
  if (_galAudioState.audio) _galAudioState.audio.playbackRate = spd;
  _galAudioPlayerSync();
}

function _galAudioSetVolume(vol) {
  var v = Math.max(0, Math.min(1, vol));
  // Persist in state: the audio element is created async (COEP blob resolve),
  // so a volume set while it is still resolving must survive to _galAudioPlay.
  _galAudioState.volume = v;
  if (v > 0) _galAudioState.muted = false;
  if (_galAudioState.audio) {
    _galAudioState.audio.volume = v;
    _galAudioState.audio.muted = !!_galAudioState.muted;
  }
  _galAudioPlayerSync();
}

function _galAudioToggleMute() {
  _galAudioState.muted = !_galAudioState.muted;
  if (_galAudioState.audio) _galAudioState.audio.muted = _galAudioState.muted;
  _galAudioPlayerSync();
}

function _fmtAudioTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function _galAudioPlayerShow() {
  var flyout = document.getElementById('flyout-panel');
  if (!flyout) return;
  if (_galAudioState.playerEl) {
    _galAudioState.playerEl.style.display = '';
    return;
  }
  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  var el = document.createElement('div');
  el.className = 'gal-audio-player';
  el.innerHTML =
    '<div class="gal-ap-seek-wrap">' +
      '<input type="range" class="gal-ap-seek" min="0" max="100" value="0" step="0.1">' +
    '</div>' +
    '<div class="gal-ap-row">' +
      '<div class="gal-ap-info">' +
        '<span class="gal-ap-name"></span>' +
        '<span class="gal-ap-author"></span>' +
      '</div>' +
      '<div class="gal-ap-controls">' +
        '<button class="gal-ap-btn gal-ap-sm" data-action="rw" title="Rewind 5s">' + iconFn('rewind', 12) + '</button>' +
        '<button class="gal-ap-btn gal-ap-play-btn" data-action="toggle" title="Play/Pause">' + iconFn('play', 14) + '</button>' +
        '<button class="gal-ap-btn gal-ap-sm" data-action="ff" title="Forward 5s">' + iconFn('fast-forward', 12) + '</button>' +
      '</div>' +
      '<div class="gal-ap-right">' +
        '<span class="gal-ap-time-display">0:00 / 0:00</span>' +
        '<select class="gal-ap-speed" title="Playback speed">' +
          '<option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1" selected>1x</option>' +
          '<option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option>' +
        '</select>' +
        '<div class="gal-ap-vol-wrap" title="Volume">' +
          '<button class="gal-ap-btn gal-ap-sm gal-ap-vol-btn">' + iconFn('volume-2', 12) + '</button>' +
          '<div class="gal-ap-vol-slider">' +
            '<input type="range" class="gal-ap-vol" min="0" max="100" value="70">' +
          '</div>' +
        '</div>' +
        '<button class="gal-ap-btn gal-ap-sm gal-ap-popup-btn" title="Pop out">' + iconFn('external-link', 12) + '</button>' +
        '<button class="gal-ap-btn gal-ap-sm gal-ap-close-btn" title="Close">' + iconFn('x', 12) + '</button>' +
      '</div>' +
    '</div>';

  // Wire events
  el.querySelector('.gal-ap-close-btn').addEventListener('click', function() { _galAudioStop(); });
  el.querySelector('.gal-ap-popup-btn').addEventListener('click', function() { _galAudioPopup(); });
  el.querySelector('[data-action="toggle"]').addEventListener('click', function() { _galAudioToggle(); });
  el.querySelector('[data-action="rw"]').addEventListener('click', function() { _galAudioSeekBy(-5); });
  el.querySelector('[data-action="ff"]').addEventListener('click', function() { _galAudioSeekBy(5); });
  el.querySelector('.gal-ap-seek').addEventListener('input', function() {
    var a = _galAudioState.audio;
    if (a && a.duration) a.currentTime = (parseFloat(this.value) / 100) * a.duration;
  });
  el.querySelector('.gal-ap-speed').addEventListener('change', function() {
    _galAudioSetSpeed(parseFloat(this.value));
  });
  el.querySelector('.gal-ap-vol').addEventListener('input', function() {
    _galAudioSetVolume(parseInt(this.value, 10) / 100);
  });
  el.querySelector('.gal-ap-vol-btn').addEventListener('click', function() { _galAudioToggleMute(); });

  // Volume hover with delay + mouse wheel
  var volWrap = el.querySelector('.gal-ap-vol-wrap');
  var volHoverTimer = null, volLeaveTimer = null;
  volWrap.addEventListener('mouseenter', function() {
    clearTimeout(volLeaveTimer);
    clearTimeout(volHoverTimer);
    volHoverTimer = setTimeout(function() { volWrap.classList.add('gal-ap-vol-open'); }, 120);
  });
  volWrap.addEventListener('mouseleave', function() {
    clearTimeout(volHoverTimer);
    volLeaveTimer = setTimeout(function() { volWrap.classList.remove('gal-ap-vol-open'); }, 300);
  });
  volWrap.addEventListener('wheel', function(e) {
    e.preventDefault();
    var a = _galAudioState.audio;
    if (!a) return;
    var delta = e.deltaY < 0 ? 0.05 : -0.05;
    var newVol = Math.max(0, Math.min(1, a.volume + delta));
    _galAudioSetVolume(newVol);
    var volInput = volWrap.querySelector('.gal-ap-vol');
    if (volInput) volInput.value = Math.round(newVol * 100);
    // Update vol icon
    var volBtn = volWrap.querySelector('.gal-ap-vol-btn');
    if (volBtn) {
      var vIcon = newVol === 0 ? 'volume-x' : newVol < 0.4 ? 'volume-1' : 'volume-2';
      volBtn.innerHTML = iconFn(vIcon, 12);
    }
  }, { passive: false });

  flyout.appendChild(el);
  _galAudioState.playerEl = el;
}

function _galAudioPlayerHide() {
  if (_galAudioState.playerEl) _galAudioState.playerEl.style.display = 'none';
}

function _galAudioPlayerSync() {
  var els = [_galAudioState.playerEl, _galAudioState.popupEl];
  var a = _galAudioState.audio;
  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  els.forEach(function(el) {
    if (!el) return;
    var nameEl = el.querySelector('.gal-ap-name');
    var authorEl = el.querySelector('.gal-ap-author');
    var timeEl = el.querySelector('.gal-ap-time-display');
    var seekEl = el.querySelector('.gal-ap-seek');
    var playBtn = el.querySelector('.gal-ap-play-btn');
    var volEl = el.querySelector('.gal-ap-vol');
    var speedEl = el.querySelector('.gal-ap-speed');
    var volBtn = el.querySelector('.gal-ap-vol-btn');
    if (nameEl) nameEl.textContent = _galAudioState.name;
    if (authorEl) authorEl.textContent = _galAudioState.author;
    // Update popup title with song name
    var popTitle = el.querySelector('.gal-ap-popup-title');
    if (popTitle) popTitle.innerHTML = iconFn('music', 10) + ' ' + _escHtml(_galAudioState.name || 'Audio');
    if (a) {
      if (timeEl) timeEl.textContent = _fmtAudioTime(a.currentTime) + ' / ' + _fmtAudioTime(a.duration);
      if (seekEl && a.duration) seekEl.value = (a.currentTime / a.duration) * 100;
      if (playBtn) playBtn.innerHTML = a.paused ? iconFn('play', 14) : iconFn('pause', 14);
      if (volEl) volEl.value = Math.round(a.volume * 100);
      if (speedEl) speedEl.value = String(a.playbackRate);
      if (volBtn) {
        var vIcon = (a.muted || a.volume === 0) ? 'volume-x' : a.volume < 0.4 ? 'volume-1' : 'volume-2';
        volBtn.innerHTML = iconFn(vIcon, 12);
        volBtn.title = a.muted ? 'Unmute' : 'Mute';
      }
    } else {
      if (playBtn) playBtn.innerHTML = iconFn('play', 14);
    }
  });
}

function _galAudioPopup() {
  if (_galAudioState.popupEl) {
    // Already popped out — just focus it
    _galAudioState.popupEl.style.display = '';
    return;
  }
  _galAudioState.popupActive = true;
  // Hide inline player
  _galAudioPlayerHide();

  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  var popup = document.createElement('div');
  popup.className = 'gal-audio-popup';
  popup.innerHTML =
    '<div class="gal-ap-header">' +
      '<span class="gal-ap-popup-title">' + iconFn('music', 10) + ' ' + _escHtml(_galAudioState.name || 'Audio') + '</span>' +
      '<div class="gal-ap-header-btns">' +
        '<button class="gal-ap-resize-btn" title="Toggle size">' + iconFn('minimize-2', 12) + '</button>' +
        '<button class="gal-ap-close" title="Close">' + iconFn('x', 14) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="gal-audio-player">' +
      '<div class="gal-ap-seek-wrap">' +
        '<input type="range" class="gal-ap-seek" min="0" max="100" value="0" step="0.1">' +
      '</div>' +
      '<div class="gal-ap-row">' +
        '<div class="gal-ap-controls">' +
          '<button class="gal-ap-btn gal-ap-sm" data-action="rw" title="Rewind 5s">' + iconFn('rewind', 12) + '</button>' +
          '<button class="gal-ap-btn gal-ap-play-btn" data-action="toggle" title="Play/Pause">' + iconFn('play', 14) + '</button>' +
          '<button class="gal-ap-btn gal-ap-sm" data-action="ff" title="Forward 5s">' + iconFn('fast-forward', 12) + '</button>' +
        '</div>' +
        '<div class="gal-ap-right">' +
          '<span class="gal-ap-time-display">0:00 / 0:00</span>' +
          '<select class="gal-ap-speed" title="Playback speed">' +
            '<option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1" selected>1x</option>' +
            '<option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option>' +
          '</select>' +
          '<div class="gal-ap-vol-wrap" title="Volume">' +
            '<button class="gal-ap-btn gal-ap-sm gal-ap-vol-btn">' + iconFn('volume-2', 12) + '</button>' +
            '<div class="gal-ap-vol-slider">' +
              '<input type="range" class="gal-ap-vol" min="0" max="100" value="70">' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Wire events
  popup.querySelector('.gal-ap-close').addEventListener('click', function() {
    _galAudioState.popupActive = false;
    popup.remove();
    _galAudioState.popupEl = null;
    _galAudioStop();
  });
  popup.querySelector('[data-action="toggle"]').addEventListener('click', function() { _galAudioToggle(); });
  popup.querySelector('[data-action="rw"]').addEventListener('click', function() { _galAudioSeekBy(-5); });
  popup.querySelector('[data-action="ff"]').addEventListener('click', function() { _galAudioSeekBy(5); });
  popup.querySelector('.gal-ap-seek').addEventListener('input', function() {
    var a = _galAudioState.audio;
    if (a && a.duration) a.currentTime = (parseFloat(this.value) / 100) * a.duration;
  });
  popup.querySelector('.gal-ap-speed').addEventListener('change', function() {
    _galAudioSetSpeed(parseFloat(this.value));
  });
  popup.querySelector('.gal-ap-vol').addEventListener('input', function() {
    _galAudioSetVolume(parseInt(this.value, 10) / 100);
  });
  popup.querySelector('.gal-ap-vol-btn').addEventListener('click', function() { _galAudioToggleMute(); });

  // Minimize — close popup, return to inline player in library
  popup.querySelector('.gal-ap-resize-btn').addEventListener('click', function() {
    _galAudioState.popupActive = false;
    popup.remove();
    _galAudioState.popupEl = null;
    _galAudioPlayerShow();
    _galAudioPlayerSync();
  });

  // Volume hover + wheel for popup
  var popVolWrap = popup.querySelector('.gal-ap-vol-wrap');
  var popVolTimer = null, popVolLeave = null;
  popVolWrap.addEventListener('mouseenter', function() {
    clearTimeout(popVolLeave);
    clearTimeout(popVolTimer);
    popVolTimer = setTimeout(function() { popVolWrap.classList.add('gal-ap-vol-open'); }, 120);
  });
  popVolWrap.addEventListener('mouseleave', function() {
    clearTimeout(popVolTimer);
    popVolLeave = setTimeout(function() { popVolWrap.classList.remove('gal-ap-vol-open'); }, 300);
  });
  popVolWrap.addEventListener('wheel', function(e) {
    e.preventDefault();
    var a = _galAudioState.audio;
    if (!a) return;
    var delta = e.deltaY < 0 ? 0.05 : -0.05;
    var newVol = Math.max(0, Math.min(1, a.volume + delta));
    _galAudioSetVolume(newVol);
    var vi = popVolWrap.querySelector('.gal-ap-vol');
    if (vi) vi.value = Math.round(newVol * 100);
    var vb = popVolWrap.querySelector('.gal-ap-vol-btn');
    if (vb) vb.innerHTML = iconFn(newVol === 0 ? 'volume-x' : newVol < 0.4 ? 'volume-1' : 'volume-2', 12);
  }, { passive: false });

  // Draggable. scan-3000 H18: the popup is rebuilt on every open; permanent
  // document mousemove/mouseup listeners leaked per open (and kept firing on
  // every mouse move for the whole session). Listeners now live only for the
  // duration of an active drag.
  var handle = popup.querySelector('.gal-ap-header');
  var startX = 0, startY = 0, origL = 0, origT = 0;
  handle.addEventListener('mousedown', function(e) {
    startX = e.clientX; startY = e.clientY;
    var r = popup.getBoundingClientRect();
    origL = r.left; origT = r.top;
    var onMove = function (ev) {
      popup.style.left = (origL + ev.clientX - startX) + 'px';
      popup.style.top = (origT + ev.clientY - startY) + 'px';
      popup.style.right = 'auto';
      popup.style.bottom = 'auto';
    };
    var onUp = function () {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });

  document.body.appendChild(popup);
  _galAudioState.popupEl = popup;
  _galAudioPlayerSync();
}

function _galAudioOnPanelLeave() {
  if (_galAudioState.popupActive) return; // Keep playing in popup mode
  _galAudioStop();
}

function _createGalleryAudioCell(entry, folderId, idx) {
  var cell = document.createElement('div');
  cell.className = 'gallery-cell gallery-audio-entry';
  cell.setAttribute('draggable', 'true');
  cell.dataset.srcFolder = folderId;
  cell.dataset.imgIdx = idx;

  var audioName = entry.tags || entry.name || 'Audio';
  var audioAuthor = entry.author || entry.provider || '';
  var audioUrl = entry.url || '';
  var duration = (entry.duration && entry.duration > 0) ? _fmtAudioTime(entry.duration) : '';
  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  var checkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  cell.innerHTML =
    '<div class="gal-select-cb">' + checkSvg + '</div>' +
    '<div class="gal-audio-card-cover">' +
      '<div class="gal-audio-card-wave">' +
        '<svg viewBox="0 0 80 40" preserveAspectRatio="none"><path d="M0,20 Q5,8 10,20 Q15,32 20,20 Q25,6 30,20 Q35,34 40,20 Q45,10 50,20 Q55,30 60,20 Q65,8 70,20 Q75,32 80,20" fill="none" stroke="rgba(242, 255, 88,0.3)" stroke-width="1.5"/><path d="M0,20 Q10,10 20,20 Q30,30 40,20 Q50,10 60,20 Q70,30 80,20" fill="none" stroke="rgba(242, 255, 88,0.15)" stroke-width="1"/></svg>' +
      '</div>' +
      '<div class="gal-audio-card-icon">' + iconFn('music', 28) + '</div>' +
      '<div class="gallery-cell-play-badge">' +
        '<button class="gallery-cell-play-btn gal-audio-play-trigger" title="Preview">' + iconFn('play', 16) + '</button>' +
      '</div>' +
      '<span class="gal-audio-card-dur">' + (duration || '--:--') + '</span>' +
    '</div>' +
    '<span class="gallery-cell-name" title="' + _escHtml(audioName) + '">' + _escHtml(audioName) + '</span>' +
    '<button class="gallery-img-info" title="Info">' + iconFn('info', 10) + '</button>' +
    '<button class="gallery-img-edit" title="Edit">' + iconFn('pencil', 10) + '</button>' +
    '<button class="gallery-del" title="Remove">&times;</button>';

  // If duration unknown, probe now and update badge + persist to entry
  if (!entry.duration || entry.duration <= 0) {
    var durBadge = cell.querySelector('.gal-audio-card-dur');
    var probeEl = new Audio();
    probeEl.preload = 'metadata';
    probeEl.onloadedmetadata = function() {
      var secs = probeEl.duration;
      if (isFinite(secs) && secs > 0) {
        entry.duration = Math.round(secs);
        if (durBadge) durBadge.textContent = _fmtAudioTime(entry.duration);
        // Persist back to localStorage
        try {
          var st = _galInit();
          if (st.recent) {
            for (var ri = 0; ri < st.recent.length; ri++) {
              if (st.recent[ri].url === audioUrl) { st.recent[ri].duration = entry.duration; break; }
            }
            _galSave(st);
          }
        } catch (_) {}
      }
      probeEl.src = '';
    };
    probeEl.src = audioUrl;
  }

  // Selection checkbox
  cell.querySelector('.gal-select-cb').addEventListener('click', function(e) {
    e.stopPropagation();
    if (!_galSelectionMode) galEnterSelectionMode();
    galToggleSelectImage(cell, folderId, idx, audioUrl);
  });

  // Play/preview button
  cell.querySelector('.gal-audio-play-trigger').addEventListener('click', function(e) {
    e.stopPropagation();
    if (_galAudioState.audio && _galAudioState.url === audioUrl && !_galAudioState.audio.paused) {
      _galAudioToggle();
    } else {
      _galAudioPlay(audioUrl, audioName, audioAuthor);
    }
  });

  // Info button
  cell.querySelector('.gallery-img-info').addEventListener('click', function(e) {
    e.stopPropagation();
    _showGalAudioInfoPopup(entry, e);
  });

  // Edit button (rename) — custom modal
  cell.querySelector('.gallery-img-edit').addEventListener('click', function(e) {
    e.stopPropagation();
    _showGalAudioEditModal(entry, function() { renderImagesCategoryView(); });
  });

  // Click to add to canvas / video editor
  cell.addEventListener('click', function(e) {
    if (e.target.closest('.gallery-del') || e.target.closest('.gal-audio-play-trigger') ||
        e.target.closest('.gallery-img-info') || e.target.closest('.gallery-img-edit') ||
        e.target.closest('.gal-select-cb')) return;
    if (_galSelectionMode) {
      galToggleSelectImage(cell, folderId, idx, audioUrl);
      return;
    }
    _addAudioToCanvas(audioUrl, audioName, audioAuthor);
  });

  // Delete button — custom confirm modal
  cell.querySelector('.gallery-del').addEventListener('click', function(e) {
    e.stopPropagation();
    _showGalAudioDeleteConfirm(audioName, function() {
      if (folderId === '__recent') {
        var st = _galInit();
        if (st.recent) { st.recent.splice(idx, 1); _galSave(st); renderImagesCategoryView(); }
      } else {
        galRemoveImageFromFolder(folderId, idx);
        _refreshGalleryView(folderId);
      }
      if (typeof showToast === 'function') showToast('Audio removed');
    });
  });

  // Drag start
  cell.addEventListener('dragstart', function(e) {
    if (_galSelectionMode) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'audio', audioUrl: audioUrl, audioName: audioName, audioAuthor: audioAuthor, srcFolder: folderId, imgIdx: idx }));
    e.dataTransfer.effectAllowed = 'move';
    cell.classList.add('gal-dragging');
  });
  cell.addEventListener('dragend', function() {
    cell.classList.remove('gal-dragging');
  });

  // Right-click context menu
  cell.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    _showGalAudioContextMenu(e, entry, folderId, idx);
  });

  return cell;
}

function _showGalAudioInfoPopup(entry, e) {
  var old = document.querySelectorAll('.gal-audio-info-popup');
  old.forEach(function(m) { m.remove(); });
  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  var name = entry.tags || entry.name || 'Audio';
  var author = entry.author || entry.provider || '';
  var dur = entry.duration ? _fmtAudioTime(entry.duration) : 'Unknown';
  var source = entry.provider ? entry.provider.charAt(0).toUpperCase() + entry.provider.slice(1) : (entry.url && entry.url.indexOf('blob:') === 0 ? 'Local Upload' : entry.url && entry.url.indexOf('data:') === 0 ? 'Local Upload' : 'External');
  var addedDate = entry._addedAt ? new Date(entry._addedAt).toLocaleDateString() : 'Unknown';
  var fileSize = entry._fileSize ? _fmtFileSize(entry._fileSize) : 'Unknown';

  var overlay = document.createElement('div');
  overlay.className = 'ccmodal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div class="ccmodal" style="width:320px;max-width:90vw;">' +
      '<div class="ccmodal-header">' +
        '<span>' + iconFn('info', 14) + ' Audio Info</span>' +
        '<button class="ccmodal-close">' + iconFn('x', 16) + '</button>' +
      '</div>' +
      '<div class="ccmodal-body">' +
        '<div class="gal-ai-row"><span class="gal-ai-label">' + iconFn('music', 12) + ' Name</span><span class="gal-ai-val">' + _escHtml(name) + '</span></div>' +
        (author ? '<div class="gal-ai-row"><span class="gal-ai-label">' + iconFn('user', 12) + ' Artist</span><span class="gal-ai-val">' + _escHtml(author) + '</span></div>' : '') +
        '<div class="gal-ai-row"><span class="gal-ai-label">' + iconFn('clock', 12) + ' Duration</span><span class="gal-ai-val">' + dur + '</span></div>' +
        '<div class="gal-ai-row"><span class="gal-ai-label">' + iconFn('calendar', 12) + ' Added</span><span class="gal-ai-val">' + addedDate + '</span></div>' +
        '<div class="gal-ai-row"><span class="gal-ai-label">' + iconFn('hard-drive', 12) + ' Size</span><span class="gal-ai-val">' + fileSize + '</span></div>' +
        '<div class="gal-ai-row"><span class="gal-ai-label">' + iconFn('globe', 12) + ' Source</span><span class="gal-ai-val">' + _escHtml(source) + '</span></div>' +
      '</div>' +
    '</div>';
  overlay.querySelector('.ccmodal-close').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function _showGalAudioDeleteConfirm(audioName, onConfirm) {
  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  var overlay = document.createElement('div');
  overlay.className = 'ccmodal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div class="ccmodal" style="width:300px;max-width:90vw;">' +
      '<div class="ccmodal-header">' +
        '<span>' + iconFn('trash-2', 14) + ' Delete Audio</span>' +
        '<button class="ccmodal-close">' + iconFn('x', 16) + '</button>' +
      '</div>' +
      '<div class="ccmodal-body" style="text-align:center;padding:16px 20px;">' +
        '<p style="font-size:12px;color:var(--text);margin:0 0 6px">Are you sure you want to delete</p>' +
        '<p style="font-size:13px;color:var(--gold);font-weight:600;margin:0 0 16px;word-break:break-word">' + _escHtml(audioName) + '</p>' +
      '</div>' +
      '<div class="ccmodal-footer">' +
        '<button class="ccmodal-btn ccmodal-btn-cancel">Cancel</button>' +
        '<button class="ccmodal-btn ccmodal-btn-danger">Delete</button>' +
      '</div>' +
    '</div>';
  overlay.querySelector('.ccmodal-close').addEventListener('click', function() { overlay.remove(); });
  overlay.querySelector('.ccmodal-btn-cancel').addEventListener('click', function() { overlay.remove(); });
  overlay.querySelector('.ccmodal-btn-danger').addEventListener('click', function() { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function _showGalAudioEditModal(entry, onDone) {
  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  var currentName = entry.tags || entry.name || 'Audio';
  var overlay = document.createElement('div');
  overlay.className = 'ccmodal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div class="ccmodal" style="width:320px;max-width:90vw;">' +
      '<div class="ccmodal-header">' +
        '<span>' + iconFn('pencil', 14) + ' Rename Audio</span>' +
        '<button class="ccmodal-close">' + iconFn('x', 16) + '</button>' +
      '</div>' +
      '<div class="ccmodal-body" style="padding:16px 20px;">' +
        '<label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:6px">Audio Name</label>' +
        '<input type="text" class="ccmodal-input" value="' + _escHtml(currentName) + '" style="width:100%;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;outline:none;">' +
      '</div>' +
      '<div class="ccmodal-footer">' +
        '<button class="ccmodal-btn ccmodal-btn-cancel">Cancel</button>' +
        '<button class="ccmodal-btn ccmodal-btn-primary">Save</button>' +
      '</div>' +
    '</div>';
  var input = overlay.querySelector('.ccmodal-input');
  overlay.querySelector('.ccmodal-close').addEventListener('click', function() { overlay.remove(); });
  overlay.querySelector('.ccmodal-btn-cancel').addEventListener('click', function() { overlay.remove(); });
  overlay.querySelector('.ccmodal-btn-primary').addEventListener('click', function() {
    var val = input.value.trim();
    if (val) {
      entry.tags = val;
      entry.name = val;
      overlay.remove();
      if (onDone) onDone();
      if (typeof showToast === 'function') showToast('Renamed');
    }
  });
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') overlay.querySelector('.ccmodal-btn-primary').click();
    if (ev.key === 'Escape') overlay.remove();
  });
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(function() { input.focus(); input.select(); }, 50);
}

function _showGalAudioContextMenu(e, entry, folderId, idx) {
  // Remove any existing context menu
  var old = document.querySelectorAll('.gal-ctx-menu');
  old.forEach(function(m) { m.remove(); });

  var audioUrl = entry.url || '';
  var audioName = entry.tags || entry.name || 'Audio';
  var audioAuthor = entry.author || entry.provider || '';
  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };

  var menu = document.createElement('div');
  menu.className = 'gal-ctx-menu';
  menu.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;z-index:10005;min-width:160px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);padding:4px 0;font-size:12px;';

  var items = [
    { label: 'Preview', icon: 'play', fn: function() { _galAudioPlay(audioUrl, audioName, audioAuthor); } },
    { label: 'Add to Canvas', icon: 'plus-circle', fn: function() { _addAudioToCanvas(audioUrl, audioName, audioAuthor); } }
  ];

  // Add to timeline (if video editor active)
  if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive()) {
    items.push({ label: 'Add to Timeline', icon: 'film', fn: function() { _addAudioToVideoEditor(audioUrl, audioName); } });
  }

  // Move to folder
  var st = _galInit();
  var audioFolders = _galFilterFolders(st.folders, 'audio');
  if (audioFolders.length > 0) {
    items.push({ label: 'Move to Folder \u25b8', icon: 'folder', fn: function() {
      menu.remove();
      _showGalAudioMoveMenu(e, folderId, idx, audioFolders);
    }});
  }

  items.push({ label: 'Delete', icon: 'trash-2', fn: function() {
    _showGalAudioDeleteConfirm(audioName, function() {
      if (folderId === '__recent') {
        var s = _galInit();
        if (s.recent) { s.recent.splice(idx, 1); _galSave(s); renderImagesCategoryView(); }
      } else {
        galRemoveImageFromFolder(folderId, idx);
        _refreshGalleryView(folderId);
      }
      if (typeof showToast === 'function') showToast('Audio removed');
    });
  }});

  items.forEach(function(item) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;color:var(--text);transition:background .1s;';
    row.innerHTML = iconFn(item.icon, 13) + ' ' + item.label;
    row.addEventListener('mouseenter', function() { row.style.background = 'var(--surface3)'; });
    row.addEventListener('mouseleave', function() { row.style.background = ''; });
    row.addEventListener('click', function() { menu.remove(); item.fn(); });
    menu.appendChild(row);
  });

  document.body.appendChild(menu);
  // Keep menu in viewport
  requestAnimationFrame(function() {
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
  });
  setTimeout(function() {
    document.addEventListener('click', function rmCtx() {
      menu.remove();
      document.removeEventListener('click', rmCtx);
    });
  }, 10);
}

function _showGalAudioMoveMenu(e, currentFolderId, idx, folders) {
  var old = document.querySelectorAll('.gal-ctx-menu');
  old.forEach(function(m) { m.remove(); });

  var iconFn = (typeof getIcon === 'function') ? getIcon : function() { return ''; };
  var menu = document.createElement('div');
  menu.className = 'gal-ctx-menu';
  menu.style.cssText = 'position:fixed;left:' + (e.clientX + 10) + 'px;top:' + e.clientY + 'px;z-index:10006;min-width:140px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);padding:4px 0;font-size:12px;';

  folders.forEach(function(f) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;color:var(--text);transition:background .1s;';
    row.innerHTML = iconFn(f.icon || 'folder', 13) + ' ' + _escHtml(f.name);
    row.addEventListener('mouseenter', function() { row.style.background = 'var(--surface3)'; });
    row.addEventListener('mouseleave', function() { row.style.background = ''; });
    row.addEventListener('click', function() {
      menu.remove();
      // Move audio entry from current folder to target folder
      galMoveImageToFolder(currentFolderId, idx, f.id);
      _refreshGalleryView(currentFolderId);
      if (typeof showToast === 'function') showToast('Moved to ' + f.name);
    });
    menu.appendChild(row);
  });

  document.body.appendChild(menu);
  setTimeout(function() {
    document.addEventListener('click', function rmCtx() {
      menu.remove();
      document.removeEventListener('click', rmCtx);
    });
  }, 10);
}

function _addAudioToCanvas(audioUrl, name, author) {
  if (!audioUrl) return;
  var label = name || 'Audio';
  var subLabel = author || '';

  // If Video Editor is active, add as audio clip to a track
  if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive()) {
    _addAudioToVideoEditor(audioUrl, label);
    return;
  }

  // --- Normal canvas: create a visual audio block ---
  var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
  var boxW = Math.round(220 * s);
  var boxH = Math.round(56 * s);
  var r = 8 * s;
  var fontSize = Math.round(12 * s);
  var subFontSize = Math.round(9 * s);

  // Background rect
  var bg = new fabric.Rect({
    width: boxW, height: boxH, rx: r, ry: r,
    fill: '#1e1e24', stroke: '#f2ff58', strokeWidth: 1.5,
    originX: 'left', originY: 'top'
  });

  // Music icon (simple note)
  var iconPath = new fabric.Path('M 9 18 V 5 l 12 -2 v 13 M 6 18 a 3 3 0 1 0 0.01 0 M 18 16 a 3 3 0 1 0 0.01 0', {
    stroke: '#f2ff58', fill: 'none', strokeWidth: 1.8,
    scaleX: s * 0.75, scaleY: s * 0.75,
    left: 10 * s, top: 12 * s,
    originX: 'left', originY: 'top'
  });

  // Title text
  var titleText = new fabric.Text(label.length > 24 ? label.substring(0, 24) + '…' : label, {
    fontSize: fontSize, fill: '#ededf0', fontFamily: 'Inter, system-ui, sans-serif',
    left: 34 * s, top: 12 * s,
    originX: 'left', originY: 'top'
  });

  // Sub text (author)
  var subText = new fabric.Text(subLabel.length > 30 ? subLabel.substring(0, 30) + '…' : subLabel, {
    fontSize: subFontSize, fill: '#888', fontFamily: 'Inter, system-ui, sans-serif',
    left: 34 * s, top: 30 * s,
    originX: 'left', originY: 'top'
  });

  // Waveform bars (decorative)
  var bars = [];
  var barCount = 12;
  var barW = 2.5 * s;
  var barGap = 3.5 * s;
  var barStartX = boxW - (barCount * (barW + barGap)) - 8 * s;
  var barBaseY = boxH / 2;
  for (var bi = 0; bi < barCount; bi++) {
    var bh = (6 + Math.random() * 16) * s;
    bars.push(new fabric.Rect({
      width: barW, height: bh, rx: 1, ry: 1,
      fill: 'rgba(242, 255, 88,0.45)',
      left: barStartX + bi * (barW + barGap),
      top: barBaseY - bh / 2,
      originX: 'left', originY: 'top'
    }));
  }

  var groupObjects = [bg, iconPath, titleText, subText].concat(bars);
  var group = new fabric.Group(groupObjects, {
    _isAudioMedia: true,
    _audioSrc: audioUrl,
    _audioName: name || 'Audio',
    _audioAuthor: author || '',
    objectCaching: true
  });

  var c = getCanvasCenter();
  group.set({ left: c.x - boxW / 2, top: c.y - boxH / 2 });
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.renderAll();
  if (typeof snap === 'function') snap();
  if (typeof showToast === 'function') showToast('Audio added: ' + label);
}

function _addAudioToVideoEditor(audioUrl, name) {
  // Fetch audio as blob, then import as file into the video editor
  fetch(audioUrl).then(function(resp) {
    if (!resp.ok) throw new Error('fetch failed');
    return resp.blob();
  }).then(function(blob) {
    var ext = 'mp3';
    if (blob.type && blob.type.indexOf('ogg') !== -1) ext = 'ogg';
    else if (blob.type && blob.type.indexOf('wav') !== -1) ext = 'wav';
    var fileName = (name || 'audio') + '.' + ext;
    var file = new File([blob], fileName, { type: blob.type || 'audio/mpeg' });

    // importMediaFile handles audio track creation via _veEnsureAudioTrack
    VideoEditor.importMediaFile(file);
    if (typeof showToast === 'function') showToast('Audio added to timeline: ' + (name || 'Audio'));
  }).catch(function(err) {
    console.warn('[Audio] Failed to add audio to video editor:', err);
    if (typeof showToast === 'function') showToast('Audio could not be added', 'error');
  });
}

function _addAudioFileToCanvas(file) {
  if (!file) return;
  var url = URL.createObjectURL(file);
  var name = file.name ? file.name.replace(/\.[^.]+$/, '') : 'Audio';
  // Probe duration before saving to gallery
  var probeAudio = new Audio();
  probeAudio.preload = 'metadata';
  probeAudio.onloadedmetadata = function() {
    var dur = isFinite(probeAudio.duration) ? Math.round(probeAudio.duration) : 0;
    _stockSaveAudioToGallery(url, 'local', '', name, dur);
  };
  probeAudio.onerror = function() {
    _stockSaveAudioToGallery(url, 'local', '', name, 0);
  };
  probeAudio.src = url;
  _addAudioToCanvas(url, name, '');
  _galBridgeAudio(file, url);
}

/* ── P3 cloud bridge (audio) ──
   When the editor runs in the panel (CCAssets.active), upload the audio file to
   the assets API and swap the gallery entry + canvas object from the volatile
   blob: URL to the durable remote URL — so the audio survives a reload (blob:
   URLs die with the session). No-op standalone; failure is silent (keeps blob URL). */
function _galBridgeAudio(file, blobUrl) {
  if (!window.CCAssets || !CCAssets.active || !file) return;
  CCAssets.uploadBlob(file, { name: file.name || ('audio-' + Date.now() + '.mp3'), mime: file.type || 'audio/mpeg' }).then(function (res) {
    if (!res || !res.url) return;
    try {
      var store = _galStore();
      if (store && store.recent) {
        for (var i = 0; i < store.recent.length; i++) {
          var e = store.recent[i];
          if (e && typeof e === 'object' && e.type === 'audio' && e.url === blobUrl) e.url = res.url;
        }
        _galSave(store);
      }
    } catch (_) {}
    try {
      if (typeof canvas !== 'undefined' && canvas.getObjects) {
        canvas.getObjects().forEach(function (o) {
          if (o && o._isAudioMedia && o._audioSrc === blobUrl) {
            try { o.set('_audioSrc', res.url); } catch (_) { o._audioSrc = res.url; }
          }
        });
        if (typeof snap === 'function') snap();
      }
    } catch (_) {}
    if (_galAudioState.url === blobUrl) _galAudioState.url = res.url;
    setTimeout(function () {
      var active = _galAudioState.audio && _galAudioState.audio.src === blobUrl;
      if (!active) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} }
    }, 0);
  });
}

function _ccToggleAudioPlayback(fabricObj) {
  if (!fabricObj || !fabricObj._audioSrc) return;
  var key = fabricObj._audioSrc;
  if (_ccAudioPlayers[key] && !_ccAudioPlayers[key].paused) {
    _ccAudioPlayers[key].pause();
    if (typeof showToast === 'function') showToast('Audio paused');
    return;
  }
  // Stop any currently playing audio
  Object.keys(_ccAudioPlayers).forEach(function(k) {
    try { _ccAudioPlayers[k].pause(); } catch(_) {}
  });
  var audio = new Audio(key);
  audio.volume = 0.7;
  audio.play().catch(function() {});
  audio.onended = function() { delete _ccAudioPlayers[key]; };
  _ccAudioPlayers[key] = audio;
  if (typeof showToast === 'function') showToast('Playing: ' + (fabricObj._audioName || 'Audio'));
}

function _isCanvasAudioObject(obj) {
  return !!(obj && obj._isAudioMedia);
}

if (typeof canvas !== 'undefined' && canvas.on && !canvas._ccAudioUrlCleanupBound) {
  canvas._ccAudioUrlCleanupBound = true;
  canvas.on('object:removed', function (opt) {
    var obj = opt && opt.target;
    var src = obj && obj._isAudioMedia ? obj._audioSrc : '';
    if (typeof src !== 'string' || src.indexOf('blob:') !== 0) return;
    setTimeout(function () {
      try {
        var canvasUses = canvas.getObjects().some(function (candidate) { return candidate && candidate._audioSrc === src; });
        var store = typeof _galStore === 'function' ? _galStore() : null;
        var galleryUses = !!(store && store.recent && store.recent.some(function (entry) { return entry && entry.url === src; }));
        if (!canvasUses && !galleryUses && (!_galAudioState.audio || _galAudioState.audio.src !== src)) URL.revokeObjectURL(src);
      } catch (_) {}
    }, 5000);
  });
}

if (window.cc && cc.modules) cc.modules.register({ id: 'audio', parent: 'left-panel.gallery.canvas', title: 'canvas: audio', mount: function () {}, unmount: function () {} });
