/* ============================================================
   left-panel/products - "Ürünler" paneli
   Panel urun kutuphanesinin (mkt_product) editordeki READ-ONLY yuzu; yazma
   yuzu her zaman panel (/library). Veri koprusu: window.CCProducts
   (core/storage-remote-assets.js, same-origin cookie, sadece ?designId= aktif).
   Gorunumler:
   - bolum listesi: kok kategorilere gore gruplu kartlar (templates paneli deseni)
   - duz grid: arama / filtre / "Tumu" drilli aktifken, sunucu tarafli sayfalama
   - urun profili drill-in: gorseller + bilgi kartlari; tiklanan deger canvas'a
     cc.addToCenter ile eklenir ve _dfField (mapping) otomatik damgalanir
   Filtre mega-dropdown gallery'nin desenini paylasir (.cc-filter-pop /
   _galSearchSelect). Plan: docs/editor-product-support-plan.md
   ============================================================ */
(function () {
  var PAGE = 40;            // duz grid sayfa boyu (API max 100)
  var SECTION_FETCH = 100;  // bolum onizlemeleri icin tek seferlik pencere

  var st = {
    q: '', category: null, brandIds: [], attrKey: null, attrVal: null,
    sort: 'updated_desc',
    drill: null,            // {ref, name}: bir kategorinin "Tumu" drilli
    offset: 0, loading: false, bound: false
  };
  var _data = null;         // son liste yaniti {items,total,categoryCounts,brands}
  var _items = [];          // duz modda birikimli liste
  var _cats = null, _attrsDict = null;
  var _catById = null, _catByKey = null, _brandById = null;
  var _reqSeq = 0;          // gec donen eski istek yeni gorunumu ezmesin

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* assetKey -> ayni-origin blob URL. Segment bazinda encode; tek tirnak CSS
     url('...') icinde kirilmasin diye elle %27. w=0 => tam cozunurluk. */
  function blobUrl(key, w) {
    if (!key) return '';
    var p = String(key).split('/').map(encodeURIComponent).join('/').replace(/'/g, '%27');
    return '/api/assets/blob/' + p + (w ? '?w=' + w : '');
  }
  function isActive() { return !!(window.CCProducts && CCProducts.active); }
  function attrOn() { return !!(st.attrKey && st.attrVal); }
  function hasFilters() { return !!(st.q || st.category || st.brandIds.length || attrOn()); }
  function flatMode() { return !!(hasFilters() || st.drill); }
  function filterCount() { return (st.category ? 1 : 0) + (st.brandIds.length ? 1 : 0) + (attrOn() ? 1 : 0); }

  /* ---------- giris (rail-flyout openFlyout cagirir) ---------- */
  window.renderProductsPanel = function () {
    var list = el('prod-list');
    if (!list) return;
    bindOnce();
    showMain();
    var bar = el('prod-mediabar');
    if (!isActive()) {
      if (bar) bar.style.display = 'none';
      renderInactive(list);
      return;
    }
    if (bar) bar.style.display = '';
    Promise.all([CCProducts.listCategories(), CCProducts.listAttributes()]).then(function (r) {
      _cats = r[0] || []; _attrsDict = r[1] || [];
      buildCatMaps();
      reload();
    });
  };

  function buildCatMaps() {
    _catById = {}; _catByKey = {};
    _cats.forEach(function (c) { _catById[c.id] = c; _catByKey[c.systemKey] = c; });
  }
  function rootCat(systemKey) {
    var c = _catByKey ? _catByKey[systemKey] : null;
    var guard = 0;
    while (c && c.parentId && _catById[c.parentId] && guard++ < 20) c = _catById[c.parentId];
    return c || null;
  }

  /* ---------- bindings (bir kez) ---------- */
  function bindOnce() {
    if (st.bound) return;
    st.bound = true;
    var inp = el('prod-search-input');
    if (inp) {
      var t = null;
      inp.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () { st.q = inp.value.trim(); reload(); }, 300);
      });
    }
    var back = el('prod-profile-back');
    if (back) back.addEventListener('click', showMain);
    var fbtn = el('prod-filter-btn');
    if (fbtn) fbtn.addEventListener('click', function (e) { e.stopPropagation(); toggleFilterMenu(); });
    var list = el('prod-list');
    if (list) list.addEventListener('click', onListClick);
    var prof = el('prod-profile-content');
    if (prof) prof.addEventListener('click', onProfileClick);
  }

  function onListClick(e) {
    var n = e.target.closest ? e.target.closest('[data-pp-id],[data-pp-seeall],[data-pp-back],[data-pp-more],[data-pp-clear],[data-pp-retry]') : null;
    if (!n) return;
    if (n.hasAttribute('data-pp-id')) { openProfile(n.getAttribute('data-pp-id'), n.getAttribute('data-pp-name')); return; }
    if (n.hasAttribute('data-pp-seeall')) {
      st.drill = { ref: n.getAttribute('data-pp-seeall'), name: n.getAttribute('data-pp-name') || '' };
      reload(); return;
    }
    if (n.hasAttribute('data-pp-back')) { st.drill = null; reload(); return; }
    if (n.hasAttribute('data-pp-more')) { loadMore(); return; }
    if (n.hasAttribute('data-pp-clear')) { clearFilters(); return; }
    if (n.hasAttribute('data-pp-retry')) { reload(); return; }
  }

  /* ---------- veri ---------- */
  function listParams() {
    var p = { sort: st.sort, limit: flatMode() ? PAGE : SECTION_FETCH, offset: st.offset };
    if (st.q) p.q = st.q;
    var cat = st.drill ? st.drill.ref : st.category;
    if (cat) p.category = cat;
    if (st.brandIds.length) p.brandIds = st.brandIds;
    if (attrOn()) { p.attrs = {}; p.attrs[st.attrKey] = st.attrVal; }
    return p;
  }

  function reload() {
    var list = el('prod-list');
    if (!list || !isActive()) return;
    st.offset = 0; _items = []; st.loading = true;
    renderSkeleton(list);
    updateBadge();
    var seq = ++_reqSeq;
    CCProducts.listProducts(listParams()).then(function (d) {
      if (seq !== _reqSeq) return;
      st.loading = false;
      _data = d;
      if (!d) { renderError(list); return; }
      _brandById = {};
      (d.brands || []).forEach(function (b) { _brandById[b.id] = b; });
      _items = d.items || [];
      render();
    });
  }

  function loadMore() {
    if (st.loading || !_data) return;
    st.loading = true;
    st.offset = _items.length;
    var btn = document.querySelector('#prod-list [data-pp-more]');
    if (btn) btn.textContent = 'Loading...';
    var seq = ++_reqSeq;
    CCProducts.listProducts(listParams()).then(function (d) {
      if (seq !== _reqSeq) return;
      st.loading = false;
      if (d && d.items) { _items = _items.concat(d.items); _data.total = d.total; }
      render();
    });
  }

  /* ---------- liste render ---------- */
  function render() {
    var list = el('prod-list');
    if (!list) return;
    updateBadge();
    if (!_items.length) { renderEmpty(list); return; }
    list.innerHTML = flatMode() ? htmlFlat() : htmlSections();
  }

  function htmlSections() {
    var groups = {};
    _items.forEach(function (it) {
      var rc = rootCat(it.categoryKey);
      var k = rc ? rc.systemKey : '__other';
      (groups[k] = groups[k] || []).push(it);
    });
    var counts = (_data.categoryCounts || []).filter(function (c) { return !c.parentId && c.n > 0; });
    var h = '';
    counts.forEach(function (c) {
      var its = groups[c.systemKey] || [];
      h += '<div class="pp-sec">'
        + '<div class="pp-sec-head"><span class="pp-sec-title">' + esc(c.name) + '</span>'
        + '<button type="button" class="pp-see-all" data-pp-seeall="' + esc(c.systemKey) + '" data-pp-name="' + esc(c.name) + '">All (' + c.n + ') &rsaquo;</button></div>'
        + (its.length
          ? '<div class="pp-grid">' + its.slice(0, 2).map(cardHtml).join('') + '</div>'
          : '<div class="pp-sec-hint">Check All for preview</div>')
        + '</div>';
    });
    return h;
  }

  function htmlFlat() {
    var h = '';
    if (st.drill) {
      h += '<button type="button" class="pp-drill-back" data-pp-back="1">'
        + '<span class="pp-drill-arrow">&larr;</span><span>' + esc(st.drill.name || 'Back') + '</span>'
        + '<span class="pp-drill-count">' + (_data.total || 0) + '</span></button>';
    }
    h += '<div class="pp-grid">' + _items.map(cardHtml).join('') + '</div>';
    if (_items.length < (_data.total || 0)) {
      h += '<button type="button" class="pp-load-more" data-pp-more="1">Show more (' + (_data.total - _items.length) + ')</button>';
    }
    return h;
  }

  function cardHtml(it) {
    var cover = (it.imageKeys && it.imageKeys[0]) ? blobUrl(it.imageKeys[0], 360) : '';
    return '<button type="button" class="pp-card" data-pp-id="' + esc(it.id) + '" data-pp-name="' + esc(it.name) + '" title="' + esc(it.name) + '">'
      + (cover
        ? '<div class="pp-thumb" style="background-image:url(\'' + cover + '\')"></div>'
        : '<div class="pp-thumb pp-thumb-empty">' + boxIcon() + '</div>')
      + '<div class="pp-meta"><span class="pp-name">' + esc(it.name) + '</span>'
      + '<span class="pp-cat">' + esc(it.categoryName || '') + '</span></div>'
      + '</button>';
  }

  function boxIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';
  }

  /* ---------- durum ekranlari ---------- */
  function renderSkeleton(list) {
    var one = '<div class="pp-card pp-skel"><div class="pp-thumb"></div><div class="pp-meta"><span class="pp-skel-line"></span><span class="pp-skel-line pp-skel-short"></span></div></div>';
    var h = '';
    for (var i = 0; i < 6; i++) h += one;
    list.innerHTML = '<div class="pp-grid">' + h + '</div>';
  }
  function renderError(list) {
    list.innerHTML = '<div class="pp-state">'
      + '<div class="pp-state-title">Products could not be loaded</div>'
      + '<div class="pp-state-sub">Check your connection and try again.</div>'
      + '<button type="button" class="pp-state-btn" data-pp-retry="1">Try again</button></div>';
  }
  function renderEmpty(list) {
    if (flatMode()) {
      list.innerHTML = '<div class="pp-state">'
        + '<div class="pp-state-title">No results found</div>'
        + '<div class="pp-state-sub">No products match the search or filters.</div>'
        + '<button type="button" class="pp-state-btn" data-pp-clear="1">Clear filters</button></div>';
    } else {
      list.innerHTML = '<div class="pp-state">'
        + '<div class="pp-state-title">No products yet</div>'
        + '<div class="pp-state-sub">Add products from Assets &gt; Products section in the panel; they appear here automatically.</div>'
        + '<a class="pp-state-btn" href="/library" target="_blank" rel="noopener">Open product library</a></div>';
    }
  }
  /* COMMUNITY EDITION: Products is one of exactly two ad surfaces (the other is AI). The panel stays
     in the rail so the person can see the feature exists; the card says what it does and why it needs
     an account. One writer for every such card: CCEdition.lockSurface. */
  function renderInactive(list) {
    if (window.CCEdition && CCEdition.lockSurface(list, 'products')) return;
    list.innerHTML = '<div class="pp-state"><div class="pp-state-title">Product library</div>'
      + '<div class="pp-state-sub">The product library is part of the dika studio service.</div></div>';
  }

  function updateBadge() {
    var b = el('prod-filter-badge');
    if (!b) return;
    var n = filterCount();
    b.textContent = n;
    b.style.display = n ? '' : 'none';
  }

  function clearFilters() {
    st.q = ''; st.category = null; st.brandIds = []; st.attrKey = null; st.attrVal = null;
    st.sort = 'updated_desc'; st.drill = null;
    var inp = el('prod-search-input');
    if (inp) inp.value = '';
    closeFilterMenu();
    reload();
  }

  /* ---------- filtre mega-dropdown (gallery deseni: .cc-filter-pop) ---------- */
  var _catSelect = null, _brandSelect = null, _attrKeySelect = null;

  function closeFilterMenu() {
    var pop = el('pp-filter-pop');
    if (pop) pop.remove();
    _catSelect = null; _brandSelect = null; _attrKeySelect = null;
    document.removeEventListener('click', filterOutside, true);
    document.removeEventListener('keydown', filterEsc, true);
  }
  function filterOutside(e) {
    var pop = el('pp-filter-pop');
    var btn = el('prod-filter-btn');
    if (pop && !pop.contains(e.target) && (!btn || !btn.contains(e.target))) closeFilterMenu();
  }
  function filterEsc(e) { if (e.key === 'Escape') closeFilterMenu(); }
  function toggleFilterMenu() {
    if (!isActive()) return;
    var wrap = document.querySelector('#prod-mediabar .cc-filter-wrap');
    if (!wrap) return;
    if (el('pp-filter-pop')) { closeFilterMenu(); return; }
    wrap.appendChild(buildFilterMenu());
    setTimeout(function () {
      document.addEventListener('click', filterOutside, true);
      document.addEventListener('keydown', filterEsc, true);
    }, 0);
  }

  /* Kategori listesi: kokler + girintili cocuklar, position sirasiyla. */
  function catItems() {
    var out = [];
    var roots = (_cats || []).filter(function (c) { return !c.parentId; });
    function kids(pid) { return (_cats || []).filter(function (c) { return c.parentId === pid; }); }
    function walk(c, depth) {
      var pad = '';
      for (var i = 0; i < depth; i++) pad += '  ';
      out.push({ v: c.systemKey, t: pad + (depth ? '– ' : '') + c.name });
      kids(c.id).forEach(function (k) { walk(k, depth + 1); });
    }
    roots.forEach(function (r) { walk(r, 0); });
    return out;
  }

  function buildFilterMenu() {
    var pop = document.createElement('div');
    pop.id = 'pp-filter-pop';
    pop.className = 'cc-filter-pop';
    var sorts = [{ v: 'updated_desc', t: 'Date' }, { v: 'name_asc', t: 'Name' }, { v: 'images_desc', t: 'Image' }];
    var h = '<div class="cc-filter-sec"><div class="cc-filter-label">Sorting</div><div class="cc-seg" id="pp-f-sort">';
    sorts.forEach(function (o) {
      h += '<button type="button" data-val="' + o.v + '"' + (st.sort === o.v ? ' class="active"' : '') + '>' + o.t + '</button>';
    });
    h += '</div></div>'
      + '<div class="cc-filter-sec"><div class="cc-filter-label">Category</div><div id="pp-f-cat-host" class="gal-ss"></div></div>'
      + '<div class="cc-filter-sec"><div class="cc-filter-label">Brand</div><div id="pp-f-brand-host" class="gal-ss"></div></div>'
      + '<div class="cc-filter-sec"><div class="cc-filter-label">Attribute</div>'
      + '<div id="pp-f-attrkey-host" class="gal-ss"></div>'
      + '<div id="pp-f-attrval-host" class="pp-attrval-host"></div></div>'
      + '<button type="button" class="cc-filter-clear" id="pp-f-clear">Clear filters</button>';
    pop.innerHTML = h;

    pop.querySelector('#pp-f-sort').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-val]');
      if (!b) return;
      st.sort = b.getAttribute('data-val');
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      reload();
    });

    var hasSS = typeof _galSearchSelect === 'function';
    var ch = pop.querySelector('#pp-f-cat-host');
    if (ch && hasSS) _catSelect = _galSearchSelect(ch, {
      name: 'ppcat', single: true, placeholder: 'Search category...', emptyLabel: 'All categories',
      items: catItems(), selected: st.category ? [st.category] : [],
      onChange: function (sel) { st.category = sel[0] || null; st.drill = null; reload(); }
    });
    var bh = pop.querySelector('#pp-f-brand-host');
    if (bh && hasSS) _brandSelect = _galSearchSelect(bh, {
      name: 'ppbrand', placeholder: 'Search brand...', emptyLabel: 'All brands',
      items: ((_data && _data.brands) || []).map(function (b) { return { v: b.id, t: b.name }; }),
      selected: st.brandIds,
      onChange: function (sel) { st.brandIds = sel; reload(); }
    });
    var kh = pop.querySelector('#pp-f-attrkey-host');
    if (kh && hasSS) _attrKeySelect = _galSearchSelect(kh, {
      name: 'ppattr', single: true, placeholder: 'Search attribute...', emptyLabel: 'Select attribute',
      items: (_attrsDict || []).map(function (a) { return { v: a.key, t: a.name }; }),
      selected: st.attrKey ? [st.attrKey] : [],
      onChange: function (sel) {
        st.attrKey = sel[0] || null;
        st.attrVal = null;
        renderAttrValue(pop);
        if (!st.attrKey) reload();
      }
    });
    renderAttrValue(pop);

    pop.querySelector('#pp-f-clear').addEventListener('click', clearFilters);
    return pop;
  }

  function renderAttrValue(pop) {
    var host = pop.querySelector('#pp-f-attrval-host');
    if (!host) return;
    host.innerHTML = '';
    if (!st.attrKey) return;
    var def = (_attrsDict || []).filter(function (a) { return a.key === st.attrKey; })[0];
    if (def && def.type === 'select' && (def.options || []).length && typeof _galSearchSelect === 'function') {
      _galSearchSelect(host, {
        name: 'ppattrval', single: true, placeholder: 'Search value...', emptyLabel: 'Select value',
        items: def.options.map(function (o) { return { v: o, t: o }; }),
        selected: st.attrVal ? [st.attrVal] : [],
        onChange: function (sel) { st.attrVal = sel[0] || null; reload(); }
      });
    } else {
      var inp = document.createElement('input');
      inp.type = (def && def.type === 'number') ? 'number' : 'text';
      inp.className = 'pp-attrval-input';
      inp.placeholder = 'Type value...';
      inp.value = st.attrVal || '';
      var t = null;
      inp.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () { st.attrVal = inp.value.trim() || null; reload(); }, 400);
      });
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
      host.appendChild(inp);
    }
  }

  /* ---------- urun profili (drill-in) ---------- */
  function showMain() {
    var main = el('products-main-view'), prof = el('products-profile-view');
    if (main) main.style.display = '';
    if (prof) prof.style.display = 'none';
  }
  function showProfile() {
    var main = el('products-main-view'), prof = el('products-profile-view');
    if (main) main.style.display = 'none';
    if (prof) prof.style.display = '';
    closeFilterMenu();
  }

  function openProfile(id, name) {
    var c = el('prod-profile-content');
    if (!c) return;
    showProfile();
    var title = el('prod-profile-title');
    if (title) title.textContent = name || 'Product';
    c.innerHTML = '<div class="pp-pgrid">'
      + '<div class="pp-vcard pp-skel"><div class="pp-vthumb"></div></div>'
      + '<div class="pp-vcard pp-skel"><div class="pp-vthumb"></div></div>'
      + '<div class="pp-vcard pp-skel"><div class="pp-vthumb"></div></div>'
      + '</div><div class="pp-divider"></div><div class="pp-pgrid">'
      + '<div class="pp-vcard pp-skel"><span class="pp-skel-line"></span></div>'
      + '<div class="pp-vcard pp-skel"><span class="pp-skel-line"></span></div>'
      + '<div class="pp-vcard pp-skel"><span class="pp-skel-line"></span></div>'
      + '</div>';
    CCProducts.getProduct(id).then(function (d) {
      var cur = el('prod-profile-content');
      if (!cur || el('products-profile-view').style.display === 'none') return;
      if (!d || !d.product) {
        cur.innerHTML = '<div class="pp-state"><div class="pp-state-title">Product could not be loaded</div>'
          + '<button type="button" class="pp-state-btn" data-pp-pretry="' + esc(id) + '" data-pp-pname="' + esc(name || '') + '">Try again</button></div>';
        return;
      }
      renderProfile(cur, d);
    });
  }

  function renderProfile(c, d) {
    var p = d.product;
    var media = (d.media && d.media.length) ? d.media
      : (p.imageKeys || []).map(function (k) { return { assetKey: k, alt: null }; });
    var h = '';
    if (media.length) {
      h += '<div class="pp-psec-label">Images</div><div class="pp-pgrid">';
      media.forEach(function (m) {
        h += '<button type="button" class="pp-vcard pp-imgcard" data-pp-addimg="' + esc(m.assetKey) + '" title="' + esc(m.alt || p.name) + '">'
          + '<div class="pp-vthumb" style="background-image:url(\'' + blobUrl(m.assetKey, 240) + '\')"></div></button>';
      });
      h += '</div>';
    } else {
      h += '<div class="pp-psec-label">Images</div><div class="pp-pnone">This product has no images</div>';
    }
    h += '<div class="pp-divider"></div>';

    var brandNames = (p.brandIds || []).map(function (bid) {
      return _brandById && _brandById[bid] ? _brandById[bid].name : null;
    }).filter(Boolean);
    var infos = [
      { label: 'Name', value: p.name, field: 'product-name' },
      { label: 'Description', value: p.description, field: 'product-description' },
      // Fiyat = urunun kendi alani (mkt_product.price, baska oturumda eklendi 2026-07-17).
      // Ham string, panelle birebir (para birimi simgesi yok). Bos/null ise kart duser.
      { label: 'Price', value: (p.price != null && String(p.price).trim() !== '') ? String(p.price) : '', field: 'product-price' },
      // Indirimsiz (ustu cizili) fiyat: mkt_product.compare_at_price. Fiyatla ayni kural, ayri
      // tasarim alani (product-compare-price), owner 2026-08-06.
      { label: 'Compare-at price', value: (p.compareAtPrice != null && String(p.compareAtPrice).trim() !== '') ? String(p.compareAtPrice) : '', field: 'product-compare-price' },
      { label: 'Category', value: p.categoryName, field: 'product-category' },
      { label: 'Brand', value: brandNames.join(', '), field: 'product-brand' }
    ];
    var attrs = p.attributes || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === '') return;
      var def = (_attrsDict || []).filter(function (a) { return a.key === k; })[0];
      infos.push({ label: def ? def.name : k, value: String(v), field: 'product-attr:' + k, attrKey: k });
    });
    var cards = infos.filter(function (i) { return i.value; });
    h += '<div class="pp-psec-label">Product information</div>';
    if (cards.length) {
      h += '<div class="pp-pgrid">';
      cards.forEach(function (i) {
        h += '<button type="button" class="pp-vcard pp-infocard" data-pp-addtext="1"'
          + ' data-pp-field="' + esc(i.field) + '"'
          + (i.attrKey ? ' data-pp-attrkey="' + esc(i.attrKey) + '"' : '')
          + ' data-pp-value="' + esc(i.value) + '" title="Add to canvas">'
          + '<span class="pp-vlabel">' + esc(i.label) + '</span>'
          + '<span class="pp-vvalue">' + esc(i.value) + '</span></button>';
      });
      h += '</div>';
    } else {
      h += '<div class="pp-pnone">No information fields filled for this product.</div>';
    }
    c.setAttribute('data-pp-pid', p.id);
    c.innerHTML = h;
  }

  function onProfileClick(e) {
    var c = el('prod-profile-content');
    var pid = c ? c.getAttribute('data-pp-pid') : null;
    var n = e.target.closest ? e.target.closest('[data-pp-addimg],[data-pp-addtext],[data-pp-pretry]') : null;
    if (!n) return;
    if (n.hasAttribute('data-pp-pretry')) { openProfile(n.getAttribute('data-pp-pretry'), n.getAttribute('data-pp-pname')); return; }
    if (n.hasAttribute('data-pp-addimg')) { addImageValue(n.getAttribute('data-pp-addimg'), pid); return; }
    if (n.hasAttribute('data-pp-addtext')) {
      addTextValue(n.getAttribute('data-pp-value'), n.getAttribute('data-pp-field'), n.getAttribute('data-pp-attrkey'), pid);
    }
  }

  /* ---------- canvas'a ekleme + mapping damgasi ----------
     _dfField / _dfAttrKey / _productId CUSTOM_PROPS'ta (js/app.js): kayit +
     bulk/merge motorlari bu damgayi okur. Ekleme yolu HER ZAMAN cc.addToCenter
     (histLocked + _ccAddingObject'i o yonetir; video modunda overlay clip olusur). */
  function stamp(obj, field, attrKey, productId) {
    obj._dfField = field || '';
    if (attrKey) obj._dfAttrKey = attrKey;
    if (productId) obj._productId = productId;
  }

  function addTextValue(text, field, attrKey, productId) {
    if (!text || typeof fabric === 'undefined') return;
    var big = field === 'product-name';
    var tb = new fabric.Textbox(String(text), {
      fontFamily: 'DM Sans',
      fontSize: big ? 32 : 18,
      fontWeight: big ? '700' : '400',
      fill: '#ffffff',
      width: big ? 320 : 300,
      textAlign: 'left'
    });
    try { tb.set('width', Math.min(420, Math.max(60, Math.ceil(tb.calcTextWidth()) + 8))); } catch (err) {}
    stamp(tb, field, attrKey, productId);
    if (window.cc && cc.addToCenter) cc.addToCenter(tb);
    else if (typeof addToCenter === 'function') addToCenter(tb);
  }

  function addImageValue(assetKey, productId) {
    if (!assetKey || typeof fabric === 'undefined') return;
    var url = blobUrl(assetKey, 0);
    fabric.Image.fromURL(url, function (img) {
      if (!img || !img.width) {
        if (typeof showToast === 'function') showToast('Image could not be loaded.', 'error');
        return;
      }
      if (img.width > 480) img.scaleToWidth(480);
      stamp(img, 'product-image', null, productId);
      if (window.cc && cc.addToCenter) cc.addToCenter(img);
      else if (typeof addToCenter === 'function') addToCenter(img);
    }, { crossOrigin: 'anonymous' });
  }

  /* ---------- modul kaydi ---------- */
  if (window.cc && cc.modules && cc.modules.register) {
    cc.modules.register({
      id: 'products',
      parent: 'left-panel',
      title: 'Products',
      icon: 'package',
      mount: function () {},
      unmount: function () {}
    });
  }
})();
