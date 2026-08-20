/* Sub-module: left-panel/items/lottie — LottieFiles animations (search + infinite
   scroll), a new Items category between GIFs and Stickers. v1 REUSES the shared GIF
   runtime for canvas placement: each animation's gifUrl is decoded + played live on the
   Fabric canvas via ItemsCore.addGiphy (zero new render code). Source = LottieFiles public
   GraphQL API (no key, CORS-open). Grid previews use the static imageUrl (the full gif is
   multi-MB) and set crossOrigin because /editor runs under COEP require-corp and the asset
   CDN sends no CORP (so a CORS request is required to display them). */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[items.lottie] cc skeleton missing'); return; }

  var GQL = 'https://graphql.lottiefiles.com/';
  var _cursor = null, _query = '', _loading = false, _hasMore = true;
  var _cache = {};
  function _core() { return window.ItemsCore || null; }

  // Fetch one page of public animations — searchPublicAnimations when a query is set, else
  // featuredPublicAnimations. Relay cursor pagination (after / endCursor / hasNextPage).
  function _fetch(query, after, first, cb) {
    var q, vars;
    if (query) {
      q = 'query($q:String!,$first:Int!,$after:String){searchPublicAnimations(query:$q,first:$first,after:$after){edges{node{id name gifUrl imageUrl lottieUrl}}pageInfo{endCursor hasNextPage}}}';
      vars = { q: query, first: first, after: after || null };
    } else {
      q = 'query($first:Int!,$after:String){featuredPublicAnimations(first:$first,after:$after){edges{node{id name gifUrl imageUrl lottieUrl}}pageInfo{endCursor hasNextPage}}}';
      vars = { first: first, after: after || null };
    }
    var ck = (query || '__featured') + ':' + (after || '0');
    if (_cache[ck]) { cb(_cache[ck]); return; }
    fetch(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, variables: vars })
    }).then(function (r) { if (!r.ok) throw new Error('LottieFiles HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        var conn = json && json.data && (json.data.searchPublicAnimations || json.data.featuredPublicAnimations);
        var out = { items: [], endCursor: null, hasMore: false };
        if (conn) {
          out.items = (conn.edges || []).map(function (e) { return e.node; })
            .filter(function (n) { return n && (n.gifUrl || n.imageUrl); });
          if (conn.pageInfo) { out.endCursor = conn.pageInfo.endCursor; out.hasMore = !!conn.pageInfo.hasNextPage; }
        }
        _cache[ck] = out; cb(out);
      })
      .catch(function (err) { console.warn('LottieFiles fetch error:', err); cb({ items: [], endCursor: null, hasMore: false }); });
  }

  function _previewImg(node) {
    var img = document.createElement('img');
    img.crossOrigin = 'anonymous';                  // COEP: asset CDN has no CORP → CORS request needed (must precede .src)
    img.src = node.imageUrl || node.gifUrl;         // static still (the gif is multi-MB; it animates once on canvas)
    img.alt = node.name || ''; img.loading = 'lazy';
    return img;
  }

  // Reuse the GIF runtime: shape a GIPHY-like object so addGiphy decodes the gif into frames
  // and runs the animation loop on the Fabric canvas.
  function _addToCanvas(node) {
    var c = _core(); if (!c || typeof c.addGiphy !== 'function') return;
    if (!node.gifUrl && !node.imageUrl) return;
    c.addGiphy({
      images: {
        original: { url: node.gifUrl || node.imageUrl },
        fixed_width_still: { url: node.imageUrl || node.gifUrl }
      },
      title: node.name || 'Lottie'
    }, 'gif');
  }

  function fillSlider(slider) {
    _fetch('', null, 15, function (res) {
      slider.innerHTML = '';
      res.items.forEach(function (node) {
        var cell = document.createElement('div');
        cell.className = 'items-slider-cell items-lottie-cell';
        cell.appendChild(_previewImg(node));
        cell.addEventListener('click', function () { _addToCanvas(node); });
        slider.appendChild(cell);
      });
    });
  }

  function _loadGrid(grid) {
    if (_loading || !_hasMore) return;
    _loading = true;
    var loader = document.createElement('div');
    loader.className = 'items-loading-indicator'; loader.textContent = 'Loading…';
    grid.appendChild(loader);
    _fetch(_query, _cursor, 20, function (res) {
      var ld = grid.querySelector('.items-loading-indicator'); if (ld) ld.remove();
      res.items.forEach(function (node) {
        var cell = document.createElement('div');
        cell.className = 'items-masonry-cell';
        var img = _previewImg(node);
        img.style.width = '100%'; img.style.display = 'block'; img.style.borderRadius = '6px';
        cell.appendChild(img);
        cell.addEventListener('click', function () { _addToCanvas(node); });
        grid.appendChild(cell);
      });
      _cursor = res.endCursor;
      _hasMore = res.hasMore;
      _loading = false;
    });
  }

  function renderDrill() {
    var c = _core(); if (!c) return;
    var view = document.getElementById('items-lottie-view');
    if (!view) return;
    var grid = view.querySelector('.items-lottie-grid');
    var search = view.querySelector('.items-lottie-search');
    if (!grid) return;
    _cursor = null; _query = ''; _hasMore = true; _loading = false;
    grid.innerHTML = '';
    if (search && !search._wired) {
      search._wired = true;
      var _debounce = null;
      search.addEventListener('input', function () {
        clearTimeout(_debounce);
        _debounce = setTimeout(function () {
          _query = (search.value || '').trim();
          _cursor = null; _hasMore = true; _loading = false; grid.innerHTML = '';
          _loadGrid(grid);
        }, 400);
      });
    }
    c.attachInfiniteScroll(view, function () { if (!_loading && _hasMore) _loadGrid(grid); });
    _loadGrid(grid);
  }

  var _reg = false;
  function mount() {
    if (_reg) return; _reg = true;
    if (window.ItemsCore) ItemsCore.registerTab({ key: 'lottie', label: 'Lottie', order: 3.5, fillSlider: fillSlider, renderDrill: renderDrill });
  }

  cc.modules.register({ id: 'lottie', parent: 'left-panel.items', title: 'Lottie', mount: mount, unmount: function () {} });
})();
