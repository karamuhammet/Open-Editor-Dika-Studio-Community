/* Module: video/ve-media-gallery/panel — Panel shell, source tabs, filter UI + show/hide/toggle lifecycle.
   Part of the ve-media-gallery group (decomposed from the 1480-line IIFE). Functions hang off the
   shared namespace VMG (window.__ccVEMediaGallery, created by the parent); cross-module refs resolve
   through VMG at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMG = window.__ccVEMediaGallery;
  if (!VMG) return;

  VMG._buildPanel = function () {
    if (VMG._panel) return;
    VMG._panel = document.createElement('div');
    VMG._panel.className = 've-media-gallery';
    VMG._panel.innerHTML =
      '<div class="ve-mg-header">' +
        '<span class="ve-mg-title">' + VMG._icon('library', 14) + ' Media Gallery</span>' +
        '<div class="ve-mg-header-actions">' +
          '<button class="ve-mg-btn" id="ve-mg-import" title="Import Media">' + VMG._icon('plus', 14) + '</button>' +
          '<button class="ve-mg-btn" id="ve-mg-view-VMG.toggle" title="Toggle View">' + VMG._icon('grid', 14) + '</button>' +
          '<button class="ve-mg-btn" id="ve-mg-close" title="Close">' + VMG._icon('x', 14) + '</button>' +
        '</div>' +
      '</div>' +
      // Category tabs
      '<div class="ve-mg-categories" id="ve-mg-categories">' +
        '<button class="ve-mg-cat-btn ve-mg-cat-btn--active" data-cat="image">' + VMG._icon('image', 12) + ' Image</button>' +
        '<button class="ve-mg-cat-btn" data-cat="video">' + VMG._icon('film', 12) + ' Video</button>' +
        '<button class="ve-mg-cat-btn" data-cat="audio">' + VMG._icon('music', 12) + ' Audio</button>' +
      '</div>' +
      // Source tabs (dynamic)
      '<div class="ve-mg-sources" id="ve-mg-sources"></div>' +
      // Filters
      '<div class="ve-mg-filters" id="ve-mg-filters">' +
        '<input type="text" class="ve-mg-search" id="ve-mg-search" placeholder="Search media...">' +
      '</div>' +
      // Content
      '<div class="ve-mg-content" id="ve-mg-content"></div>';

    document.body.appendChild(VMG._panel);
    VMG._wireEvents();
    VMG._updateSourceTabs();
  };

  VMG._wireEvents = function () {
    document.getElementById('ve-mg-close').addEventListener('click', VMG.hide);
    document.getElementById('ve-mg-import').addEventListener('click', VMG._importFiles);

    document.getElementById('ve-mg-view-VMG.toggle').addEventListener('click', function() {
      VMG._viewMode = VMG._viewMode === 'grid' ? 'list' : 'grid';
      this.innerHTML = VMG._icon(VMG._viewMode === 'grid' ? 'grid' : 'list', 14);
      VMG._renderContent();
    });

    document.getElementById('ve-mg-search').addEventListener('input', function() {
      VMG._filterText = this.value;
      VMG._renderContent();
    });

    // Category tab clicks
    document.getElementById('ve-mg-categories').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-cat]');
      if (!btn) return;
      var cat = btn.getAttribute('data-cat');
      if (cat === VMG._activeCategory) return;
      VMG._activeCategory = cat;
      VMG._drillFolderId = null;
      VMG._filterText = '';
      var searchEl = document.getElementById('ve-mg-search');
      if (searchEl) searchEl.value = '';

      // Update active state
      var btns = document.getElementById('ve-mg-categories').querySelectorAll('.ve-mg-cat-btn');
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove('ve-mg-cat-btn--active');
      btn.classList.add('ve-mg-cat-btn--active');

      // Reset source to library for new category
      VMG._activeSource = 'library';
      VMG._updateSourceTabs();
      VMG._renderContent();
    });
  };

  VMG._updateSourceTabs = function () {
    var container = document.getElementById('ve-mg-sources');
    if (!container) return;
    var sources = VMG.SOURCES[VMG._activeCategory] || ['library'];
    var html = '';
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      var active = (s === VMG._activeSource) ? ' ve-mg-src-btn--active' : '';
      var iconName = s === 'library' ? 'folder' : (s === 'unsplash' ? 'camera' : 'image');
      html += '<button class="ve-mg-src-btn' + active + '" data-src="' + s + '">' + VMG._icon(iconName, 11) + ' ' + VMG.SOURCE_LABELS[s] + '</button>';
    }
    container.innerHTML = html;

    // Ensure active source is valid for this category
    if (sources.indexOf(VMG._activeSource) === -1) {
      VMG._activeSource = 'library';
    }

    // Wire source clicks
    container.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-src]');
      if (!btn) return;
      var src = btn.getAttribute('data-src');
      if (src === VMG._activeSource) return;
      VMG._activeSource = src;
      VMG._drillFolderId = null;
      VMG._filterText = '';
      var searchEl = document.getElementById('ve-mg-search');
      if (searchEl) searchEl.value = '';

      var btns = container.querySelectorAll('.ve-mg-src-btn');
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove('ve-mg-src-btn--active');
      btn.classList.add('ve-mg-src-btn--active');

      // Update search placeholder
      VMG._updateFilterUI();
      VMG._renderContent();
    });

    VMG._updateFilterUI();
  };

  VMG._updateFilterUI = function () {
    var filtersEl = document.getElementById('ve-mg-filters');
    var searchEl = document.getElementById('ve-mg-search');
    if (!filtersEl || !searchEl) return;

    if (VMG._activeSource === 'library') {
      searchEl.placeholder = 'Search ' + VMG._activeCategory + 's...';
      // Remove orientation dropdown if exists
      var oldOrient = filtersEl.querySelector('.ve-mg-orient');
      if (oldOrient) oldOrient.remove();
    } else {
      searchEl.placeholder = 'Search ' + VMG.SOURCE_LABELS[VMG._activeSource] + ' ' + VMG._activeCategory + 's...';
      // Add orientation filter for stock sources
      if (!filtersEl.querySelector('.ve-mg-orient')) {
        var sel = document.createElement('select');
        sel.className = 've-mg-orient';
        sel.innerHTML = '<option value="">All</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option>' +
          (VMG._activeSource === 'unsplash' ? '<option value="squarish">Square</option>' : '<option value="square">Square</option>');
        sel.addEventListener('change', function() {
          VMG._stockOrientation[VMG._activeSource] = this.value;
          // Apply immediately: re-run the active query (the left-panel stock
          // module does the same); without this the filter looks dead until
          // the user manually searches again.
          var q = VMG._stockQuery && VMG._stockQuery[VMG._activeSource];
          if (q && typeof VMG._stockSearchAPI === 'function') {
            VMG._stockSearchAPI(VMG._activeSource, q, false);
          }
        });
        filtersEl.appendChild(sel);
      }
    }
  };

  VMG.show = function () {
    VMG._buildPanel();
    VMG._isOpen = true;
    VMG._panel.classList.add('ve-media-gallery--open');
    VMG._loadFromDB(function() {
      VMG._hydrateItems();
      VMG._renderContent();
    });
  };

  VMG.hide = function () {
    if (!VMG._panel) return;
    VMG._isOpen = false;
    VMG._panel.classList.remove('ve-media-gallery--open');
  };

  VMG.toggle = function () {
    if (VMG._isOpen) VMG.hide(); else VMG.show();
  };

  VMG.isOpen = function () {
    return VMG._isOpen;
  };

  VMG.getItemById = function (id) {
    for (var i = 0; i < VMG._mediaItems.length; i++) {
      if (VMG._mediaItems[i].id === id) return VMG._mediaItems[i];
    }
    return null;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'panel', parent: 'video.ve-media-gallery', title: 've-media-gallery: panel', mount: function () {}, unmount: function () {} });
  }
})();
