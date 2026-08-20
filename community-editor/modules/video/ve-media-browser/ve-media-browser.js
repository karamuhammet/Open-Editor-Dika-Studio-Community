/* ============================================================
   dika studio – Video Editor Media Browser
   Left-side flyout panel for managing imported media.
   Public API: window.VEMediaBrowser
   ============================================================ */
(function() {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  var _panel = null;
  var _isOpen = false;
  var _viewMode = 'grid';   // 'grid' | 'list'
  var _filterText = '';
  var _filterType = 'all';  // 'all' | 'video' | 'audio'
  var _mediaItems = [];     // {id, file, url, type, name, duration, width, height, size, thumb}
  var _recentIds = [];      // last 10 imported item ids

  // ── Icon helper ───────────────────────────────────────────
  function _icon(name, size) {
    if (typeof getIcon === 'function') {
      var r = getIcon(name, size || 14);
      if (r) return r;
    }
    return '';
  }

  // ── Format helpers ────────────────────────────────────────
  function _fmtDuration(sec) {
    if (!sec || !isFinite(sec)) return '0:00';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function _fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function _fmtRes(w, h) {
    if (!w || !h) return '';
    return w + '×' + h;
  }

  // ── Build panel ───────────────────────────────────────────
  function _buildPanel() {
    if (_panel) return;
    _panel = document.createElement('div');
    _panel.className = 've-media-browser';
    _panel.innerHTML =
      '<div class="ve-mb-header">' +
        '<span class="ve-mb-title">' + _icon('film', 14) + ' Media Browser</span>' +
        '<div class="ve-mb-header-actions">' +
          '<button class="ve-mb-btn ve-mb-import-btn" id="ve-mb-import" title="Import Media">' + _icon('plus', 14) + '</button>' +
          '<button class="ve-mb-btn ve-mb-view-btn" id="ve-mb-view-toggle" title="Toggle View">' + _icon('grid', 14) + '</button>' +
          '<button class="ve-mb-btn ve-mb-close-btn" id="ve-mb-close" title="Close">' + _icon('x', 14) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ve-mb-filters">' +
        '<input type="text" class="ve-mb-search" id="ve-mb-search" placeholder="Search media...">' +
        '<select class="ve-mb-type-filter" id="ve-mb-type-filter">' +
          '<option value="all">All</option>' +
          '<option value="video">Video</option>' +
          '<option value="audio">Audio</option>' +
        '</select>' +
      '</div>' +
      '<div class="ve-mb-content" id="ve-mb-content"></div>';

    document.body.appendChild(_panel);

    // Wire events
    document.getElementById('ve-mb-close').addEventListener('click', hide);
    document.getElementById('ve-mb-import').addEventListener('click', _importFiles);
    document.getElementById('ve-mb-view-toggle').addEventListener('click', function() {
      _viewMode = _viewMode === 'grid' ? 'list' : 'grid';
      this.innerHTML = _icon(_viewMode === 'grid' ? 'grid' : 'list', 14);
      _renderItems();
    });
    document.getElementById('ve-mb-search').addEventListener('input', function() {
      _filterText = this.value.toLowerCase();
      _renderItems();
    });
    document.getElementById('ve-mb-type-filter').addEventListener('change', function() {
      _filterType = this.value;
      _renderItems();
    });
  }

  // ── Import files ──────────────────────────────────────────
  function _importFiles() {
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,audio/*';
    input.addEventListener('change', function() {
      if (!input.files || !input.files.length) return;
      for (var i = 0; i < input.files.length; i++) {
        _addFile(input.files[i]);
      }
    });
    input.click();
  }

  function _addFile(file) {
    var isVideo = file.type && file.type.indexOf('video') === 0;
    var isAudio = file.type && file.type.indexOf('audio') === 0;
    if (!isVideo && !isAudio) return;

    var id = 'mb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    var url = URL.createObjectURL(file);
    var item = {
      id: id,
      file: file,
      url: url,
      type: isVideo ? 'video' : 'audio',
      name: file.name,
      duration: 0,
      width: 0,
      height: 0,
      size: file.size,
      thumb: null
    };

    _mediaItems.push(item);
    _recentIds.unshift(id);
    if (_recentIds.length > 10) _recentIds.pop();

    // Load metadata
    var el = document.createElement(isVideo ? 'video' : 'audio');
    el.preload = 'metadata';
    el.src = url;
    el.addEventListener('loadedmetadata', function() {
      item.duration = el.duration || 0;
      item.width = el.videoWidth || 0;
      item.height = el.videoHeight || 0;

      // Generate thumbnail for video
      if (isVideo) {
        el.currentTime = Math.min(1, el.duration / 4);
        el.addEventListener('seeked', function onSeek() {
          el.removeEventListener('seeked', onSeek);
          try {
            var tc = document.createElement('canvas');
            tc.width = 120;
            tc.height = 68;
            tc.getContext('2d').drawImage(el, 0, 0, 120, 68);
            item.thumb = tc.toDataURL('image/jpeg', 0.6);
          } catch (e) {}
          _renderItems();
        }, { once: true });
      } else {
        _renderItems();
      }
    });

    _renderItems();
  }

  // ── Add item from external import (called by video-editor) ──
  function addExternalItem(file, url, mediaEl) {
    var isVideo = file.type && file.type.indexOf('video') === 0;
    var id = 'mb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    var item = {
      id: id,
      file: file,
      url: url,
      type: isVideo ? 'video' : 'audio',
      name: file.name,
      duration: mediaEl.duration || 0,
      width: mediaEl.videoWidth || 0,
      height: mediaEl.videoHeight || 0,
      size: file.size,
      thumb: null
    };

    // Avoid duplicates by name+size
    for (var i = 0; i < _mediaItems.length; i++) {
      if (_mediaItems[i].name === file.name && _mediaItems[i].size === file.size) return;
    }

    _mediaItems.push(item);
    _recentIds.unshift(id);
    if (_recentIds.length > 10) _recentIds.pop();

    if (isVideo && mediaEl.videoWidth) {
      try {
        var tc = document.createElement('canvas');
        tc.width = 120;
        tc.height = 68;
        tc.getContext('2d').drawImage(mediaEl, 0, 0, 120, 68);
        item.thumb = tc.toDataURL('image/jpeg', 0.6);
      } catch (e) {}
    }

    if (_isOpen) _renderItems();
  }

  // ── Get filtered items ────────────────────────────────────
  function _getFiltered() {
    return _mediaItems.filter(function(item) {
      if (_filterType !== 'all' && item.type !== _filterType) return false;
      if (_filterText && item.name.toLowerCase().indexOf(_filterText) === -1) return false;
      return true;
    });
  }

  // ── Render items ──────────────────────────────────────────
  function _renderItems() {
    var container = document.getElementById('ve-mb-content');
    if (!container) return;

    var items = _getFiltered();
    if (!items.length) {
      container.innerHTML = '<div class="ve-mb-empty">' + _icon('inbox', 24) + '<br>No media files. Click + to import.</div>';
      return;
    }

    var html = '';

    // Recent section
    var recentItems = items.filter(function(it) { return _recentIds.indexOf(it.id) !== -1; });
    if (recentItems.length > 0 && !_filterText) {
      html += '<div class="ve-mb-section-title">Recent</div>';
      html += _viewMode === 'grid' ? _renderGrid(recentItems) : _renderList(recentItems);
      var otherItems = items.filter(function(it) { return _recentIds.indexOf(it.id) === -1; });
      if (otherItems.length) {
        html += '<div class="ve-mb-section-title">All Media</div>';
        html += _viewMode === 'grid' ? _renderGrid(otherItems) : _renderList(otherItems);
      }
    } else {
      html += _viewMode === 'grid' ? _renderGrid(items) : _renderList(items);
    }

    container.innerHTML = html;

    // Wire drag + click events
    var cards = container.querySelectorAll('[data-mb-id]');
    for (var i = 0; i < cards.length; i++) {
      (function(card) {
        var itemId = card.getAttribute('data-mb-id');
        card.draggable = true;
        card.addEventListener('dragstart', function(e) {
          e.dataTransfer.setData('text/ve-media-id', itemId);
          e.dataTransfer.effectAllowed = 'copy';
        });
        card.addEventListener('dblclick', function() {
          _addToTimeline(itemId);
        });
      })(cards[i]);
    }
  }

  function _renderGrid(items) {
    var html = '<div class="ve-mb-grid">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html += '<div class="ve-mb-card" data-mb-id="' + it.id + '" title="' + it.name + '">';
      if (it.thumb) {
        html += '<div class="ve-mb-thumb" style="background-image:url(' + it.thumb + ')"></div>';
      } else {
        html += '<div class="ve-mb-thumb ve-mb-thumb--audio">' + _icon(it.type === 'video' ? 'film' : 'music', 24) + '</div>';
      }
      html += '<div class="ve-mb-card-info">';
      html += '<div class="ve-mb-card-name">' + _escHtml(it.name) + '</div>';
      html += '<div class="ve-mb-card-meta">' + _fmtDuration(it.duration);
      if (it.width) html += ' · ' + _fmtRes(it.width, it.height);
      html += '</div>';
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function _renderList(items) {
    var html = '<div class="ve-mb-list">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html += '<div class="ve-mb-list-item" data-mb-id="' + it.id + '">';
      html += '<span class="ve-mb-list-icon">' + _icon(it.type === 'video' ? 'film' : 'music', 14) + '</span>';
      html += '<span class="ve-mb-list-name">' + _escHtml(it.name) + '</span>';
      html += '<span class="ve-mb-list-dur">' + _fmtDuration(it.duration) + '</span>';
      if (it.width) html += '<span class="ve-mb-list-res">' + _fmtRes(it.width, it.height) + '</span>';
      html += '<span class="ve-mb-list-size">' + _fmtSize(it.size) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ── Add to timeline ───────────────────────────────────────
  function _addToTimeline(itemId) {
    var item = null;
    for (var i = 0; i < _mediaItems.length; i++) {
      if (_mediaItems[i].id === itemId) { item = _mediaItems[i]; break; }
    }
    if (!item) return;

    // Use VideoEditor's import mechanism
    if (window.VideoEditor && VideoEditor.importMediaFile) {
      VideoEditor.importMediaFile(item.file);
    }
  }

  // ── HTML escape ───────────────────────────────────────────
  function _escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ── Show / hide ───────────────────────────────────────────
  function show() {
    _buildPanel();
    _isOpen = true;
    _panel.classList.add('ve-media-browser--open');
    _renderItems();
  }

  function hide() {
    if (!_panel) return;
    _isOpen = false;
    _panel.classList.remove('ve-media-browser--open');
  }

  function toggle() {
    if (_isOpen) hide(); else show();
  }

  function isOpen() {
    return _isOpen;
  }

  // ── Get item by drag ID ───────────────────────────────────
  function getItemById(id) {
    for (var i = 0; i < _mediaItems.length; i++) {
      if (_mediaItems[i].id === id) return _mediaItems[i];
    }
    return null;
  }

  // ── Public API ────────────────────────────────────────────
  window.VEMediaBrowser = {
    show: show,
    hide: hide,
    toggle: toggle,
    isOpen: isOpen,
    addExternalItem: addExternalItem,
    getItemById: getItemById,
    importFiles: _importFiles
  };

})();

// Modular skeleton hook (Faz 8) — ve-media-browser is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-media-browser', parent: 'video', title: 've-media-browser', mount: function () {}, unmount: function () {} });
