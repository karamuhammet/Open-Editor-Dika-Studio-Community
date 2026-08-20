/* Module: shared/image-modal — CCImageModal, a global Figma/Canva-style image picker usable ANYWHERE
   (CCImageModal.open({onPick})). A thin UI over our existing gallery + stock engines — it adds no new
   data logic. Sources v1 (decision D5): Kütüphane (folder images) · Son (recent) · Unsplash (search via
   the user's own key). Pick → default insert: fabric.Image.fromURL → addToCenter (scene-aware: routes
   into the active frame) → saveToGallery → snap. See docs/infinite-canvas-toolbar-plan.md §4. */
(function (global) {
  'use strict';

  var _overlay = null, _panel = null, _navEl = null, _gridEl = null, _searchEl = null, _searchWrap = null, _titleEl = null;
  var _built = false, _open = false, _src = 'library', _onPick = null, _sources = null, _searchTimer = 0, _stockCache = {};

  function _icon(names, size) {
    if (typeof getIcon !== 'function') return '';
    for (var i = 0; i < names.length; i++) { var s = getIcon(names[i], size || 16); if (s) return s; }
    return '';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var ALL_SOURCES = [
    { id: 'library', label: 'Library', icons: ['folder', 'image'] },
    { id: 'recent',  label: 'Last',       icons: ['history', 'clock'] },
    { sep: true },
    { id: 'unsplash', label: 'Unsplash', icons: ['camera', 'image'], stock: true }
  ];

  function _build() {
    if (_built) return;
    _overlay = document.createElement('div');
    _overlay.className = 'ccim-overlay';
    _overlay.addEventListener('mousedown', function (e) { if (e.target === _overlay) close(); });

    _panel = document.createElement('div');
    _panel.className = 'ccim';
    _panel.setAttribute('role', 'dialog');
    _panel.setAttribute('aria-modal', 'true');

    var head = document.createElement('div');
    head.className = 'ccim-head';
    _titleEl = document.createElement('div');
    _titleEl.className = 'ccim-title';
    _titleEl.innerHTML = _icon(['image'], 16) + '<span>Add image</span>';

    _searchWrap = document.createElement('div');
    _searchWrap.className = 'ccim-search';
    _searchWrap.innerHTML = _icon(['search'], 15);
    _searchEl = document.createElement('input');
    _searchEl.type = 'text';
    _searchEl.placeholder = 'Search on Unsplash…';
    _searchEl.addEventListener('input', _onSearchInput);
    _searchEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(_searchTimer); _runSearch(); } });
    _searchWrap.appendChild(_searchEl);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'ccim-x';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = _icon(['x'], 18) || '✕';
    closeBtn.addEventListener('click', close);

    head.appendChild(_titleEl);
    head.appendChild(_searchWrap);
    head.appendChild(closeBtn);

    var body = document.createElement('div');
    body.className = 'ccim-body';
    _navEl = document.createElement('div');
    _navEl.className = 'ccim-nav';
    _gridEl = document.createElement('div');
    _gridEl.className = 'ccim-main';
    body.appendChild(_navEl);
    body.appendChild(_gridEl);

    _panel.appendChild(head);
    _panel.appendChild(body);
    _overlay.appendChild(_panel);
    document.body.appendChild(_overlay);
    _built = true;
  }

  function _renderNav() {
    _navEl.innerHTML = '';
    (_sources || ALL_SOURCES).forEach(function (s) {
      if (s.sep) { var sp = document.createElement('div'); sp.className = 'ccim-nav-sep'; _navEl.appendChild(sp); return; }
      var b = document.createElement('button');
      b.className = 'ccim-nav-btn' + (s.id === _src ? ' on' : '');
      b.type = 'button';
      b.setAttribute('data-src', s.id);
      b.innerHTML = _icon(s.icons, 16) + '<span>' + _esc(s.label) + '</span>';
      b.addEventListener('click', function () { _selectSource(s.id); });
      _navEl.appendChild(b);
    });
  }

  function _activeSourceDef(id) {
    var list = _sources || ALL_SOURCES;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function _selectSource(id) {
    _src = id;
    var def = _activeSourceDef(id);
    var isStock = !!(def && def.stock);
    _searchWrap.style.display = isStock ? '' : 'none';
    _renderNav();
    if (isStock) {
      _searchEl.value = '';
      _searchEl.placeholder = (def.label || 'Unsplash') + 'Search…';
      _renderStock(id, null);            // initial prompt / cached
      setTimeout(function () { try { _searchEl.focus(); } catch (e) {} }, 30);
    } else {
      _renderLocal(id);
    }
  }

  // ── local sources ──
  function _libraryImages() {
    if (typeof galGetFolders !== 'function') return [];
    var out = [], folders = galGetFolders() || [];
    folders.forEach(function (f) {
      (f.images || []).forEach(function (im) {
        var url = (typeof im === 'string') ? im : (im && im.url);
        if (url) out.push({ url: url, thumb: url });
      });
    });
    return out;
  }
  function _recentImages() {
    if (typeof galGetRecent !== 'function') return [];
    return (galGetRecent() || []).filter(function (e) { return typeof e === 'string'; }).map(function (u) { return { url: u, thumb: u }; });
  }

  function _renderLocal(id) {
    var items = (id === 'recent') ? _recentImages() : _libraryImages();
    if (!items.length) {
      _gridEl.innerHTML = '<div class="ccim-empty">' + _icon(['image-off', 'image'], 26) +
        '<p>' + (id === 'recent' ? 'No images yet' : 'No images in library') + '</p>' +
        '<span>When you add an Unsplash image, it will appear here.</span></div>';
      return;
    }
    _paintGrid(items, false);
  }

  // ── Unsplash (thin direct fetch using the user's own key — mirrors stock.js, no DOM coupling) ──
  function _unsplashKey() {
    var st = (typeof _aiGetState === 'function') ? _aiGetState() : null;
    return (st && st.providerKeys) ? (st.providerKeys._unsplash || '') : '';
  }
  function _renderStock(provider, items) {
    if (items === null) {
      if (!_unsplashKey() && typeof window.ccStockSearch !== 'function') {
        _gridEl.innerHTML = '<div class="ccim-empty">' + _icon(['key', 'image'], 26) +
          '<p>No Unsplash key added</p><span>You can add your own Unsplash key from the left panel → Image → Stock section.</span></div>';
        return;
      }
      if (_stockCache[provider] && _stockCache[provider].length) { _paintGrid(_stockCache[provider], true); return; }
      _gridEl.innerHTML = '<div class="ccim-empty">' + _icon(['search', 'image'], 26) + '<p>Type to search</p><span>Millions of free images on Unsplash.</span></div>';
      return;
    }
    if (!items.length) { _gridEl.innerHTML = '<div class="ccim-empty">' + _icon(['search'], 26) + '<p>No results</p></div>'; return; }
    _paintGrid(items, true);
  }

  function _onSearchInput() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(_runSearch, 340);
  }
  function _runSearch() {
    var def = _activeSourceDef(_src);
    if (!def || !def.stock) return;
    var q = (_searchEl.value || '').trim();
    if (!q) { _renderStock(_src, null); return; }
    var key = _unsplashKey();
    if (!key && typeof window.ccStockSearch !== 'function') { _renderStock(_src, null); return; }
    _gridEl.innerHTML = '<div class="ccim-loading">' + _icon(['loader', 'search'], 22) + '<span>Searching…</span></div>';
    var url = 'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(q) + '&per_page=24&content_filter=high';
    var mySrc = _src;
    var request = typeof window.ccStockSearch === 'function'
      ? window.ccStockSearch('unsplash', q, 1, 'image', 'all')
      : fetch(url, { headers: { 'Authorization': 'Client-ID ' + key } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    request
      .then(function (d) {
        var items = Array.isArray(d.items)
          ? d.items.map(function (item) { return { url: item.url, thumb: item.thumb, author: item.author || '', alt: item.title || q }; })
          : (d.results || []).map(function (img) { return { url: img.urls.regular, thumb: img.urls.small, author: (img.user && img.user.name) || '', alt: img.alt_description || q }; });
        _stockCache[mySrc] = items;
        if (_open && _src === mySrc) _renderStock(mySrc, items);
      })
      .catch(function () { if (_open && _src === mySrc) _gridEl.innerHTML = '<div class="ccim-empty">' + _icon(['alert-triangle'], 24) + '<p>Search failed</p><span>Check your key/connection.</span></div>'; });
  }

  function _paintGrid(items, isStock) {
    var grid = document.createElement('div');
    grid.className = 'ccim-grid';
    items.forEach(function (it) {
      var cell = document.createElement('button');
      cell.className = 'ccim-cell';
      cell.type = 'button';
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.src = it.thumb || it.url;
      if (isStock) img.crossOrigin = 'anonymous';
      cell.appendChild(img);
      if (isStock && it.author) {
        var au = document.createElement('span');
        au.className = 'ccim-author';
        au.textContent = it.author;
        cell.appendChild(au);
      }
      cell.addEventListener('click', function () { _pick(it.url, it); });
      grid.appendChild(cell);
    });
    _gridEl.innerHTML = '';
    _gridEl.appendChild(grid);
  }

  function _pick(url, meta) {
    var cb = _onPick || _insertDefault;
    try { cb(url, meta); } catch (e) { if (typeof console !== 'undefined') console.error('[CCImageModal] onPick failed', e); }
    close();
  }

  // default action: insert into the canvas (scene-aware → lands in the active frame)
  function _insertDefault(url) {
    if (!global.fabric || !global.fabric.Image) return;
    fabric.Image.fromURL(url, function (img) {
      if (!img) return;
      var SC = global.__ccSceneEditor, inScene = !!(SC && SC._active);
      var fr = (inScene && typeof _scActiveFrame === 'function') ? _scActiveFrame() : null;
      var boxW = fr ? fr.w * 0.8 : ((typeof CW !== 'undefined' ? CW : 700) * 0.8);
      var boxH = fr ? fr.h * 0.8 : ((typeof CH !== 'undefined' ? CH : 400) * 0.8);
      var scale = Math.min(boxW / (img.width || 1), boxH / (img.height || 1), 1);
      img.set({ scaleX: scale, scaleY: scale });
      if (typeof addToCenter === 'function') addToCenter(img);
      else if (global.canvas) { canvas.add(img); canvas.setActiveObject(img); canvas.requestRenderAll(); }
      if (typeof saveToGallery === 'function') { try { saveToGallery(url); } catch (e) {} }
      if (typeof snap === 'function') snap();
    }, { crossOrigin: 'anonymous' });
  }

  function _onKey(e) { if (e.key === 'Escape' && _open) { e.stopPropagation(); close(); } }

  function open(opts) {
    opts = opts || {};
    _build();
    _onPick = (typeof opts.onPick === 'function') ? opts.onPick : null;
    _sources = (opts.sources && opts.sources.length)
      ? ALL_SOURCES.filter(function (s) { return s.sep || opts.sources.indexOf(s.id) > -1; })
      : null;
    if (_titleEl) _titleEl.querySelector('span').textContent = opts.title || 'Add image';
    _open = true;
    _overlay.classList.add('show');
    document.addEventListener('keydown', _onKey, true);
    // default source: Library if it has images, else Recent, else Library
    var lib = _libraryImages(), rec = _recentImages();
    _src = lib.length ? 'library' : (rec.length ? 'recent' : 'library');
    if (_sources && !_activeSourceDef(_src)) { var first = _sources.filter(function (s) { return !s.sep; })[0]; _src = first ? first.id : 'library'; }
    _renderNav();
    _selectSource(_src);
  }
  function close() {
    if (!_open) return;
    _open = false;
    if (_overlay) _overlay.classList.remove('show');
    document.removeEventListener('keydown', _onKey, true);
  }
  function isOpen() { return _open; }

  global.CCImageModal = { open: open, close: close, isOpen: isOpen };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'image-modal', parent: 'shared', title: 'shared: image-modal', mount: function () {}, unmount: function () {} });
  }
})(window);
