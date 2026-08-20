/* Module: video/ve-media-gallery/stock — Stock-media search + add-to-timeline.
   Part of the ve-media-gallery group (decomposed from the 1480-line IIFE). Functions hang off the
   shared namespace VMG (window.__ccVEMediaGallery, created by the parent); cross-module refs resolve
   through VMG at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMG = window.__ccVEMediaGallery;
  if (!VMG) return;

  VMG._renderStock = function (container) {
    var source = VMG._activeSource;
    var cat = VMG._activeCategory;

    var html = '';

    // Search area with quick chips
    html += '<div class="ve-mg-stock-search">';
    html += '<div class="ve-mg-stock-chips" id="ve-mg-stock-chips"></div>';
    html += '</div>';
    html += '<div class="ve-mg-stock-results" id="ve-mg-stock-results"></div>';

    container.innerHTML = html;

    // Build chips
    var chipsEl = document.getElementById('ve-mg-stock-chips');
    var chips = VMG._getStockChips(source, cat);
    for (var i = 0; i < chips.length; i++) {
      (function(chip) {
        var btn = document.createElement('button');
        btn.className = 've-mg-stock-chip';
        btn.textContent = chip;
        btn.addEventListener('click', function() {
          var searchEl = document.getElementById('ve-mg-search');
          if (searchEl) searchEl.value = chip;
          VMG._filterText = chip;
          VMG._stockSearchAPI(source, chip, false);
        });
        chipsEl.appendChild(btn);
      })(chips[i]);
    }

    // If there's already a filter text, search immediately
    if (VMG._filterText) {
      VMG._stockSearchAPI(source, VMG._filterText, false);
    }

    // Wire search on Enter
    var searchEl = document.getElementById('ve-mg-search');
    if (searchEl) {
      // Remove old listener and add stock-specific one
      var newSearch = searchEl.cloneNode(true);
      searchEl.parentNode.replaceChild(newSearch, searchEl);
      newSearch.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && newSearch.value.trim()) {
          VMG._filterText = newSearch.value.trim();
          VMG._stockSearchAPI(source, VMG._filterText, false);
        }
      });
      newSearch.addEventListener('input', function() {
        VMG._filterText = newSearch.value;
      });
    }
  };

  VMG._getStockChips = function (source, cat) {
    if (source === 'unsplash') {
      return ['Nature', 'Business', 'Technology', 'Food', 'People', 'Architecture', 'Abstract', 'Travel'];
    }
    if (source === 'pexels' && cat === 'image') {
      return ['Minimal', 'City', 'Fitness', 'Flowers', 'Dark', 'Ocean', 'Coffee', 'Fashion'];
    }
    if (source === 'pexels' && cat === 'video') {
      return ['Cinematic', 'Nature', 'City', 'Business', 'Abstract', 'Drone', 'Timelapse', 'Ocean'];
    }
    return [];
  };

  VMG._stockSearchAPI = function (source, query, loadMore) {
    if (VMG._stockLoading) return;

    var state = (typeof _aiGetState === 'function') ? _aiGetState() : null;
    var keys = state && state.providerKeys ? state.providerKeys : {};

    var resultsEl = document.getElementById('ve-mg-stock-results');
    if (!resultsEl) return;

    if (!loadMore) {
      VMG._stockPage[source] = 1;
      VMG._stockQuery[source] = query;
      resultsEl.innerHTML = '';
    } else {
      VMG._stockPage[source] = (VMG._stockPage[source] || 1) + 1;
      var oldBtn = resultsEl.querySelector('.ve-mg-stock-load-more');
      if (oldBtn) oldBtn.remove();
    }

    // Loading indicator
    var loadEl = document.createElement('div');
    loadEl.className = 've-mg-stock-loading';
    loadEl.textContent = 'Searching...';
    resultsEl.appendChild(loadEl);
    VMG._stockLoading = true;

    var page = VMG._stockPage[source] || 1;
    var perPage = 20;
    var orient = VMG._stockOrientation[source] || '';
    var url, headers;

    if (source === 'unsplash') {
      var uKey = keys._unsplash;
      if (!uKey && typeof window.ccStockSearch !== 'function') { loadEl.textContent = 'Unsplash API key not set. Add it in Settings \u2192 AI Settings \u2192 API Keys.'; loadEl.style.color = '#ff6b6b'; VMG._stockLoading = false; return; }
      if (orient === 'square') orient = 'squarish';
      url = 'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page + '&content_filter=high';
      if (orient) url += '&orientation=' + orient;
      headers = { 'Authorization': 'Client-ID ' + uKey };
    } else if (source === 'pexels') {
      var pKey = keys._pexels;
      if (!pKey && typeof window.ccStockSearch !== 'function') { loadEl.textContent = 'Pexels API key not set. Add it in Settings \u2192 AI Settings \u2192 API Keys.'; loadEl.style.color = '#ff6b6b'; VMG._stockLoading = false; return; }
      if (VMG._activeCategory === 'video') {
        url = 'https://api.pexels.com/videos/search?query=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page;
        if (orient) url += '&orientation=' + orient;
      } else {
        url = 'https://api.pexels.com/v1/search?query=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page;
        if (orient) url += '&orientation=' + orient;
      }
      headers = { 'Authorization': pKey };
    }

    if (!url) {
      // Unknown source: fail visibly instead of fetch(undefined) throwing.
      loadEl.textContent = 'Unsupported stock source: ' + source;
      loadEl.style.color = '#ff6b6b';
      VMG._stockLoading = false;
      return;
    }

    var request = typeof window.ccStockSearch === 'function'
      ? window.ccStockSearch(source, query, page, VMG._activeCategory === 'video' ? 'video' : 'image', VMG._stockOrientation[source] || 'all')
      : fetch(url, { headers: headers }).then(function(r) {
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return r.json();
    });
    request.then(function(data) {
      loadEl.remove();
      VMG._stockLoading = false;

      var results = [];

      if (Array.isArray(data.items)) {
        results = data.items.map(function(item) {
          return { type: item.type, url: item.url, thumb: item.thumb, alt: item.title || query, name: item.title || '', author: item.author || '', w: item.w || 0, h: item.h || 0, duration: item.duration || 0 };
        });
      } else if (source === 'unsplash' && data.results) {
        // Unsplash — images only
        results = data.results.map(function(img) {
          return { type: 'image', url: img.urls.regular, thumb: img.urls.small, alt: img.alt_description || query, author: img.user.name, w: img.width, h: img.height };
        });
      } else if (source === 'pexels' && VMG._activeCategory === 'video' && data.videos) {
        // Pexels videos
        results = data.videos.map(function(vid) {
          var bestFile = null;
          if (vid.video_files && vid.video_files.length) {
            // Prefer HD mp4
            for (var vf = 0; vf < vid.video_files.length; vf++) {
              var f = vid.video_files[vf];
              if (f.file_type === 'video/mp4' && f.quality === 'hd') { bestFile = f; break; }
            }
            if (!bestFile) {
              for (var vf2 = 0; vf2 < vid.video_files.length; vf2++) {
                if (vid.video_files[vf2].file_type === 'video/mp4') { bestFile = vid.video_files[vf2]; break; }
              }
            }
            if (!bestFile) bestFile = vid.video_files[0];
          }
          var pxAuthor = vid.user ? vid.user.name : '';
          return {
            type: 'video',
            url: bestFile ? bestFile.link : '',
            thumb: vid.image || '',
            alt: vid.url ? vid.url.split('/').pop().replace(/-/g, ' ') : query,
            name: 'Pexels #' + vid.id + (pxAuthor ? ' \u2014 ' + pxAuthor : ''),
            author: pxAuthor,
            w: bestFile ? bestFile.width : vid.width,
            h: bestFile ? bestFile.height : vid.height,
            duration: vid.duration || 0
          };
        });
      } else if (source === 'pexels' && data.photos) {
        // Pexels images
        results = data.photos.map(function(img) {
          return { type: 'image', url: img.src.large2x, thumb: img.src.medium, alt: img.alt || query, author: img.photographer, w: img.width, h: img.height };
        });
      }

      if (!results.length && !loadMore) {
        var noRes = document.createElement('div');
        noRes.className = 've-mg-stock-loading';
        noRes.textContent = 'No results for "' + query + '"';
        resultsEl.appendChild(noRes);
        return;
      }

      // Render results
      var grid = resultsEl.querySelector('.ve-mg-stock-grid');
      if (!grid) {
        grid = document.createElement('div');
        grid.className = 've-mg-stock-grid';
        resultsEl.appendChild(grid);
      }

      results.forEach(function(res) {
        var cell = document.createElement('div');
        cell.className = 've-mg-stock-cell';
        cell.title = res.alt;
        var img = document.createElement('img');
        img.src = res.thumb;
        img.alt = res.alt || '';
        img.loading = 'lazy';
        cell.appendChild(img);

        // Duration badge for videos
        if (res.type === 'video' && res.duration) {
          var badge = document.createElement('span');
          badge.className = 've-mg-duration-badge';
          badge.textContent = VMG._fmtDuration(res.duration);
          cell.appendChild(badge);
        }

        var credit = document.createElement('div');
        credit.className = 've-mg-stock-credit';
        credit.textContent = res.author;
        cell.appendChild(credit);

        cell.addEventListener('click', function() {
          VMG._stockAddToTimeline(res);
        });
        grid.appendChild(cell);
      });

      // Load more
      var hasMore = data.hasMore === true;
      if (Array.isArray(data.items)) hasMore = data.hasMore === true;
      else if (source === 'unsplash') hasMore = data.total_pages && page < data.total_pages;
      else if (source === 'pexels') hasMore = !!data.next_page;

      if (hasMore) {
        var moreBtn = document.createElement('button');
        moreBtn.className = 've-mg-stock-load-more';
        moreBtn.textContent = 'Load more...';
        moreBtn.addEventListener('click', function() {
          VMG._stockSearchAPI(source, VMG._stockQuery[source], true);
        });
        resultsEl.appendChild(moreBtn);
      }
    }).catch(function(err) {
      loadEl.remove();
      VMG._stockLoading = false;
      var errEl = document.createElement('div');
      errEl.className = 've-mg-stock-loading';
      errEl.textContent = 'Error: ' + err.message;
      errEl.style.color = '#ff6b6b';
      resultsEl.appendChild(errEl);
    });
  };

  VMG._stockAddToTimeline = function (res) {
    if (typeof showToast === 'function') showToast('Downloading ' + (res.type || 'media') + '...');

    fetch(res.url, { mode: 'cors' }).then(function(r) {
      if (!r.ok) throw new Error('Download failed: ' + r.status);
      return r.blob();
    }).then(function(blob) {
      var ext = res.type === 'video' ? '.mp4' : '.jpg';
      var mimeType = res.type === 'video' ? 'video/mp4' : 'image/jpeg';
      var fileName = (res.name || res.alt || 'stock').replace(/[^a-z0-9]/gi, '_').substring(0, 40) + ext;
      var file = new File([blob], fileName, { type: mimeType });

      if (res.type === 'video') {
        // Import as video clip — pass API duration as hint
        if (window.VideoEditor && VideoEditor.importMediaFile) {
          VideoEditor.importMediaFile(file, res.duration || 0);
          if (typeof showToast === 'function') showToast('Video added to timeline');
        }
      } else {
        // Import as image → still clip (5s)
        VMG._addImageToTimeline(file);
        if (typeof showToast === 'function') showToast('Image added as 5s clip');
      }
    }).catch(function(err) {
      if (typeof showToast === 'function') showToast('Download error: ' + err.message, 'error');
    });
  };

  VMG._addToTimeline = function (itemId) {
    var item = VMG.getItemById(itemId);
    if (!item) return;

    if (item.type === 'image') {
      // Create File from stored blob or URL
      var file = item._file || null;
      if (!file && item.blob) {
        try {
          var b = new Blob([item.blob], { type: item.blobType || 'image/jpeg' });
          file = new File([b], item.name, { type: item.blobType || 'image/jpeg' });
        } catch (e) {}
      }
      if (file) VMG._addImageToTimeline(file);
    } else {
      // Video / Audio — use existing pipeline
      var file2 = item._file || item.file || null;
      if (!file2 && item.blob) {
        try {
          var b2 = new Blob([item.blob], { type: item.blobType || 'video/mp4' });
          file2 = new File([b2], item.name, { type: item.blobType });
        } catch (e) {}
      }
      if (file2 && window.VideoEditor && VideoEditor.importMediaFile) {
        VideoEditor.importMediaFile(file2, item.duration || 0);
      }
    }
  };

  VMG._addImageToTimeline = function (file) {
    // Add image as a still clip (5s default) on the first video track
    if (!window.VideoEditor) return;
    var project = VideoEditor.getProject();
    if (!project || !project.tracks || !project.tracks.length) return;

    var track = project.tracks[0];
    var endTime = 0;
    track.clips.forEach(function(c) {
      var e = c.startTime + c.duration;
      if (e > endTime) endTime = e;
    });

    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function() {
      var clip = {
        id: 'clip-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        src: url,
        fileName: file.name,
        name: file.name.replace(/\.[^.]+$/, ''),
        type: 'image',
        startTime: endTime,
        duration: 5,
        trimStart: 0,
        trimEnd: 0,
        volume: 0,
        speed: 1.0,
        filters: {},
        transitions: { in: null, out: null },
        _thumbCache: [],
        _waveformUrl: null,
        _mediaWidth: img.naturalWidth || img.width,
        _mediaHeight: img.naturalHeight || img.height,
        _imgElement: img
      };

      // Check overlap
      var hasOverlap = false;
      track.clips.forEach(function(c) {
        var cEnd = c.startTime + c.duration;
        if (clip.startTime < cEnd && (clip.startTime + clip.duration) > c.startTime) hasOverlap = true;
      });

      track.clips.push(clip);

      // Store image element for preview rendering
      if (window.VideoEditor && VideoEditor.getProject && VideoEditor.getProject()._vePlayback) {
        VideoEditor.getProject()._vePlayback.videoPool[clip.id] = img;
      }

      // Generate thumbnail
      try {
        var tc = document.createElement('canvas');
        tc.width = 80; tc.height = 45;
        var tCtx = tc.getContext('2d');
        var scale = Math.min(80 / img.width, 45 / img.height);
        var tw = img.width * scale, th = img.height * scale;
        tCtx.drawImage(img, (80 - tw) / 2, (45 - th) / 2, tw, th);
        clip._thumbCache = [tc.toDataURL('image/jpeg', 0.6)];
      } catch (e) {}

      if (VideoEditor.render) VideoEditor.render();
      if (typeof showToast === 'function') showToast('Image added as 5s clip');
    };
    img.onerror = function() {
      if (typeof showToast === 'function') showToast('Failed to load image', 'error');
    };
    img.src = url;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'stock', parent: 'video.ve-media-gallery', title: 've-media-gallery: stock', mount: function () {}, unmount: function () {} });
  }
})();
