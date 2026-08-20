/* Sub-module: left-panel/items/stickers — GIPHY sticker slider + drill-in
   (search, infinite scroll). Fetch/add via the shared ItemsCore engine. */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[items.stickers] cc skeleton missing'); return; }

  var _offset = 0, _query = '', _loading = false, _hasMore = true;
  function _core() { return window.ItemsCore || null; }

  function fillSlider(slider) {
    var c = _core(); if (!c) return;
    if (!c.getGiphyKey()) { slider.innerHTML = '<div class="items-no-key">Add GIPHY key in Settings → API</div>'; return; }
    c.giphyFetch('stickers', 'trending', '', 0, 15, function (items) {
      slider.innerHTML = '';
      items.forEach(function (g) {
        var cell = document.createElement('div');
        cell.className = 'items-slider-cell items-sticker-cell';
        var img = document.createElement('img');
        img.src = g.images.fixed_height_small.url || g.images.fixed_height.url;
        img.alt = g.title || ''; img.loading = 'lazy';
        cell.appendChild(img);
        cell.addEventListener('click', function () { c.addGiphy(g, 'sticker'); });
        slider.appendChild(cell);
      });
    });
  }

  function _loadGrid(grid) {
    var c = _core(); if (!c) return;
    if (!c.getGiphyKey()) { grid.innerHTML = '<div class="items-no-key" style="padding:20px;text-align:center">Add your GIPHY API key in<br>Settings → API Keys</div>'; return; }
    if (_loading || !_hasMore) return;
    _loading = true;
    var loader = document.createElement('div');
    loader.className = 'items-loading-indicator';
    loader.textContent = 'Loading…';
    grid.appendChild(loader);
    var ep = _query ? 'search' : 'trending';
    c.giphyFetch('stickers', ep, _query, _offset, 20, function (items) {
      var ld = grid.querySelector('.items-loading-indicator'); if (ld) ld.remove();
      items.forEach(function (g) {
        var cell = document.createElement('div');
        cell.className = 'items-masonry-cell';
        var img = document.createElement('img');
        img.src = g.images.fixed_width.url;
        img.alt = g.title || ''; img.loading = 'lazy';
        img.style.width = '100%'; img.style.display = 'block'; img.style.borderRadius = '6px';
        cell.appendChild(img);
        cell.addEventListener('click', function () { c.addGiphy(g, 'sticker'); });
        grid.appendChild(cell);
      });
      _offset += items.length;
      _loading = false;
      if (items.length < 20) _hasMore = false;
    });
  }

  function renderDrill() {
    var c = _core(); if (!c) return;
    var view = document.getElementById('items-stickers-view');
    if (!view) return;
    var grid = view.querySelector('.items-giphy-grid');
    var search = view.querySelector('.items-sticker-search');
    if (!grid) return;
    _offset = 0; _query = ''; _hasMore = true; _loading = false;
    grid.innerHTML = '';
    if (search && !search._wired) {
      search._wired = true;
      var _debounce = null;
      search.addEventListener('input', function () {
        clearTimeout(_debounce);
        _debounce = setTimeout(function () { _query = (search.value || '').trim(); _offset = 0; _hasMore = true; grid.innerHTML = ''; _loadGrid(grid); }, 400);
      });
    }
    c.attachInfiniteScroll(view, function () { if (!_loading && _hasMore) _loadGrid(grid); });
    _loadGrid(grid);
  }

  var _reg = false;
  function mount() { if (_reg) return; _reg = true; if (window.ItemsCore) ItemsCore.registerTab({ key: 'stickers', label: 'Stickers', order: 4, fillSlider: fillSlider, renderDrill: renderDrill }); }

  cc.modules.register({ id: 'stickers', parent: 'left-panel.items', title: 'Stickers', mount: mount, unmount: function () {} });
})();
