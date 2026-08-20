/* shared/bulk-builder/products: the Bulk Builder's PRODUCT data source, headless half
   (plan: docs/bulk-builder-products-source-plan.md, Faz 2).

   Same split as engine/: this file has NO DOM and no wizard state. It answers two
   questions and nothing else:
     1. "which products match this filter" - paged fetch over CCProducts.listProducts
        (the server caps limit at 100, so a 300 product run is 3 requests),
     2. "what do those products look like as bulk ROWS" - one row per product, the
        COLUMN NAMES being the design-field keys themselves.

   That naming is the whole trick: CCBulk.defaultMapping() matches a design field to a
   column by lowercase name equality, so a template built from the Urunler panel (whose
   objects are stamped _dfField = 'product-name' etc.) comes back ALREADY mapped, with
   no work from the user. A generic field ('title', 'hero-image') stays unmapped and is
   picked by hand, exactly like today's Excel flow.

   Globals are read at CALL time (CCProducts loads from core/, this module from the
   module tree), so load order never matters. Exposed as window.CCBulkProducts. */
(function () {
  var PAGE = 100;         // server clamp (apps/web .../api/marketing/products/route.ts)
  var IMAGE_COLS = 4;     // cover + 3: product-image, -2, -3, -4

  /* "Markasiz" is NOT expressible on the brandIds axis (that one means "any of these
     brands"). It lives in the product RULE language, where `brand is_empty` compiles to
     `not exists (...)` server-side (packages/db/src/product-rule-eval.ts compileBrand).
     One shared constant so no call site hand-writes the tree. */
  var BRAND_NONE = { combinator: 'AND', rules: [{ field: 'brand', op: 'is_empty' }] };

  /* Column catalog. `key` IS the column name AND (for the first seven) a design-field
     value from index.html's <select id="p-df-field">; never rename one, only its label.
     `kind` drives nothing in the engine (it re-detects the object type), it only labels
     the column for the user. */
  var COLUMNS = [
    { key: 'product-id',            label: 'Product ID',          kind: 'text' },
    { key: 'product-name',          label: 'Product name',         kind: 'text' },
    { key: 'product-description',   label: 'Description',         kind: 'text' },
    { key: 'product-price',         label: 'Price',            kind: 'text' },
    { key: 'product-compare-price', label: 'Original price', kind: 'text' },
    { key: 'product-category',      label: 'Category',         kind: 'text' },
    { key: 'product-brand',         label: 'Brand',            kind: 'text' },
    { key: 'product-image',         label: 'Cover image',    kind: 'image' },
    { key: 'product-image-2',       label: 'Image 2',        kind: 'image' },
    { key: 'product-image-3',       label: 'Image 3',        kind: 'image' },
    { key: 'product-image-4',       label: 'Image 4',        kind: 'image' },
    { key: 'product-type',          label: 'Product type',        kind: 'text' },
    { key: 'product-vendor',        label: 'Manufacturer',          kind: 'text' },
    { key: 'product-url',           label: 'Product page',     kind: 'text' },
    { key: 'product-features',      label: 'Attributes',       kind: 'text' },
    { key: 'product-colors',        label: 'Colors',          kind: 'text' }
  ];

  /* The seven columns that mirror the "Product" design-field group in index.html. They are always
     emitted (see toRows), because a design field with no column beside it reads as a broken import. */
  var CORE = {
    'product-id': 1, 'product-name': 1, 'product-description': 1, 'product-price': 1,
    'product-compare-price': 1, 'product-category': 1, 'product-brand': 1, 'product-image': 1
  };

  function isActive() { return !!(window.CCProducts && CCProducts.active); }

  /* assetKey -> same-origin blob URL. Segment-wise encode, single quote escaped by hand
     (the same helper the Urunler panel uses). w=0 => full resolution: a generated page is
     a real design, not a thumbnail. CCBulk.isImageUrl accepts a leading-slash path, so
     this value needs no further conversion and carries no base64. */
  function blobUrl(key, w) {
    if (!key) return '';
    var p = String(key).split('/').map(encodeURIComponent).join('/').replace(/'/g, '%27');
    return '/api/assets/blob/' + p + (w ? '?w=' + w : '');
  }

  function txt(v) {
    if (v == null) return '';
    if (Array.isArray(v)) {
      return v.map(function (x) { return txt(x); }).filter(Boolean).join(', ');
    }
    if (typeof v === 'object') return '';   // nested json is not a design value
    return String(v);
  }

  /* ---------- fetch ----------
     filter: { q, category, brandIds[], brandNone, attrs, sort }
     Returns a HANDLE with .cancel(); the caller (the wizard) uses it when the user hits
     Back mid-fetch. A cancelled run calls done(null, null) and never touches the UI again.
     A failed page fails the WHOLE call: half a selection silently generated is worse than
     an error, because the user cannot see which products are missing. */
  function fetchAll(filter, cap, onProgress, done) {
    var handle = { cancelled: false, cancel: function () { this.cancelled = true; } };
    if (!isActive()) { done(new Error('No panel connection.')); return handle; }
    cap = Math.max(1, cap || 300);
    var out = [], total = 0, brands = null;

    function step(offset) {
      if (handle.cancelled) { done(null, null); return; }
      var want = Math.min(PAGE, cap - out.length);
      CCProducts.listProducts(listParams(filter, want, offset)).then(function (d) {
        if (handle.cancelled) { done(null, null); return; }
        if (!d) { done(new Error('Products couldn\'t be loaded.')); return; }
        total = d.total || 0;
        if (!brands) brands = d.brands || [];
        var items = d.items || [];
        out = out.concat(items);
        if (typeof onProgress === 'function') onProgress(out.length, Math.min(total, cap));
        // Stop on: cap reached, server returned a short page (no more rows), or all read.
        if (out.length >= cap || !items.length || out.length >= total) {
          done(null, { items: out, total: total, brands: brands, capped: total > out.length });
          return;
        }
        step(out.length);
      });
    }
    step(0);
    return handle;
  }

  /* One place builds the query object, so the picker's count call and the fetch call can
     never disagree about what "the current filter" means. */
  function listParams(filter, limit, offset) {
    filter = filter || {};
    var p = { limit: limit || PAGE, offset: offset || 0, sort: filter.sort || 'updated_desc' };
    if (filter.q) p.q = filter.q;
    if (filter.category) p.category = filter.category;
    if (filter.brandNone) p.rules = BRAND_NONE;            // markasiz
    else if (filter.brandIds && filter.brandIds.length) p.brandIds = filter.brandIds;
    if (filter.attrs) p.attrs = filter.attrs;
    return p;
  }

  /* ---------- rows ----------
     items: the API rows (they already carry every column: name, description, price,
     compareAtPrice, attributes, type, vendor, sourceUrl, features, colors, plus derived
     imageKeys / brandIds / categoryName). No per-product getProduct call is needed.
     opts.brands: the payload's org brand list, for id -> name.
     Returns { headers, rows, stats }. A column is only emitted when at least one product
     fills it: an all-empty column is a dropdown entry that can only disappoint. */
  function toRows(items, opts) {
    items = items || [];
    opts = opts || {};
    var brandName = {};
    (opts.brands || []).forEach(function (b) { if (b && b.id) brandName[b.id] = b.name; });

    var rows = [];
    var used = {};                       // column key -> true (at least one non-empty value)
    var attrKeys = [];                   // attribute keys in first-seen order
    var stats = { total: items.length, noImage: 0, noPrice: 0, noCompare: 0, attrCount: 0 };

    items.forEach(function (it) {
      if (!it) return;
      var imgs = it.imageKeys || [];
      var row = {};
      row['product-id'] = txt(it.id);
      row['product-name'] = txt(it.name);
      row['product-description'] = txt(it.description);
      row['product-price'] = txt(it.price);
      row['product-category'] = txt(it.categoryName);
      row['product-brand'] = (it.brandIds || []).map(function (id) { return brandName[id] || ''; })
        .filter(Boolean).join(', ');
      for (var i = 0; i < IMAGE_COLS; i++) {
        row[i === 0 ? 'product-image' : 'product-image-' + (i + 1)] = imgs[i] ? blobUrl(imgs[i]) : '';
      }
      row['product-compare-price'] = txt(it.compareAtPrice);
      row['product-type'] = txt(it.type);
      row['product-vendor'] = txt(it.vendor);
      row['product-url'] = txt(it.sourceUrl);
      row['product-features'] = txt(it.features);
      row['product-colors'] = txt(it.colors);

      var attrs = it.attributes || {};
      Object.keys(attrs).forEach(function (k) {
        var v = txt(attrs[k]);
        if (!v) return;
        var col = 'product-attr:' + k;
        if (attrKeys.indexOf(k) === -1) attrKeys.push(k);
        row[col] = v;
      });

      if (!imgs.length) stats.noImage++;
      if (!row['product-price']) stats.noPrice++;
      if (!row['product-compare-price']) stats.noCompare++;
      Object.keys(row).forEach(function (k) { if (row[k]) used[k] = true; });
      rows.push(row);
    });

    /* CORE columns are ALWAYS offered, even when every selected product leaves them empty. Dropping
       an empty `product-price` was measured as the worst kind of quiet failure (owner 2026-08-06):
       the field is on the design, the column simply vanished from the mapping screen, and the only
       possible reading was "the price is not being pulled". It is now there, mapped, and the review
       step says in words how many products have no price. The extras stay conditional: nobody is
       looking for a "Üretici" column that no product fills. */
    var headers = [];
    COLUMNS.forEach(function (c) { if (used[c.key] || CORE[c.key]) headers.push(c.key); });
    attrKeys.forEach(function (k) { if (used['product-attr:' + k]) headers.push('product-attr:' + k); });
    stats.attrCount = attrKeys.length;

    // Every row carries every header (an absent key and an empty one must not differ here;
    // the engine skips empty values and keeps the template's own content).
    rows.forEach(function (r) {
      headers.forEach(function (h) { if (r[h] == null) r[h] = ''; });
    });
    return { headers: headers, rows: rows, stats: stats };
  }

  /* Human label + kind for a column key. Attribute columns are minted at run time from the org's own
     dictionary, so they are answered here rather than being missing from the catalog. */
  function columnMeta(key) {
    for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i].key === key) return COLUMNS[i];
    if (key.indexOf('product-attr:') === 0) {
      return { key: key, label: 'Attribute: ' + key.slice('product-attr:'.length), kind: 'text' };
    }
    return { key: key, label: key, kind: 'text' };
  }

  window.CCBulkProducts = {
    COLUMNS: COLUMNS,
    BRAND_NONE: BRAND_NONE,
    PAGE: PAGE,
    isActive: isActive,
    blobUrl: blobUrl,
    listParams: listParams,
    fetchAll: fetchAll,
    toRows: toRows,
    columnMeta: columnMeta
  };

  if (window.cc && cc.modules && cc.modules.register) {
    cc.modules.register({ id: 'shared.bulk-builder.products', parent: 'shared.bulk-builder' });
  }
})();
