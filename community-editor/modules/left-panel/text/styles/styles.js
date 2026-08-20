/* ═══════════════════════════════════════════════════════════
   Sub-module: left-panel/text/styles — the "Text styles" gallery
   (20 designed presets, category chips, search, load-more). Renders
   into #txp-chips / #txp-grid (scaffold in index.html). Depends on cc.*.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[text.styles] cc skeleton missing'); return; }

  // Each preset is a vertical stack of lines. `sz` is canvas font size (px, ×scale
  // on insert). `up` uppercases, `it` italic, `sp` letter-spacing em, `mb` gap below.
  var TEXT_STYLE_PRESETS = [
    { id: 'bir-adim', cat: 'bold', lines: [
      { t: 'Moment of new life', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.12, col: '#9a9aa3', mb: 9 },
      { t: 'Take a step', font: 'Anton', sz: 46, w: 400, up: true, sp: 0.01, col: '#ffffff' }
    ] },
    { id: 'dapper', cat: 'elegant', lines: [
      { t: 'Dapper', font: 'Playfair Display', sz: 46, w: 600, sp: 0.05, col: '#ffffff', mb: 8 },
      { t: 'High-quality products', font: 'DM Sans', sz: 14, w: 400, sp: 0.04, col: '#bdbdc6' }
    ] },
    { id: 'margaret', cat: 'script', lines: [
      { t: 'Happy Years', font: 'Dancing Script', sz: 28, w: 600, col: '#f2ff58', mb: 2 },
      { t: 'Margaret!', font: 'Abril Fatface', sz: 40, w: 400, col: '#ffffff' }
    ] },
    { id: 'fermantasyon', cat: 'minimal', lines: [
      { t: 'Mirafla', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.1, col: '#9a9aa3', mb: 8 },
      { t: 'Fermentation\nart', font: 'Oswald', sz: 26, w: 500, up: true, sp: 0.1, col: '#ffffff' }
    ] },
    { id: 'teklif', cat: 'script', lines: [
      { t: 'Offer', font: 'Pacifico', sz: 48, w: 400, col: '#ffffff', mb: 10 },
      { t: 'Halliwell Studio', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.16, col: '#9a9aa3' }
    ] },
    { id: 'musteriler', cat: 'bold', lines: [
      { t: 'Progress', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.1, col: '#9a9aa3', mb: 7 },
      { t: 'We empower\nour customers', font: 'Bebas Neue', sz: 40, w: 400, sp: 0.04, col: '#ffffff' }
    ] },
    { id: 'less-more', cat: 'minimal', lines: [
      { t: 'less', font: 'Outfit', sz: 30, w: 300, col: '#ffffff', mb: 1 },
      { t: 'is more', font: 'Outfit', sz: 30, w: 600, col: '#ffffff' }
    ] },
    { id: 'maison', cat: 'elegant', lines: [
      { t: 'Maison', font: 'Cormorant Garamond', sz: 48, w: 600, it: true, sp: 0.03, col: '#ffffff', mb: 6 },
      { t: 'Established 2024', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.18, col: '#9a9aa3' }
    ] },
    { id: 'indirim', cat: 'bold', lines: [
      { t: 'Limited time', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.14, col: '#9a9aa3', mb: 8 },
      { t: '%50 discount', font: 'Anton', sz: 42, w: 400, up: true, sp: 0.01, col: '#ffffff' }
    ] },
    { id: 'cafe', cat: 'elegant', lines: [
      { t: 'Café Lumière', font: 'Playfair Display', sz: 40, w: 600, it: true, sp: 0.02, col: '#ffffff', mb: 7 },
      { t: 'Est. 1998', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.18, col: '#9a9aa3' }
    ] },
    { id: 'hayalini-yasa', cat: 'bold', lines: [
      { t: 'Live your\ndream', font: 'Oswald', sz: 38, w: 600, up: true, sp: 0.04, col: '#ffffff' }
    ] },
    { id: 'dogum-gunu', cat: 'script', lines: [
      { t: 'Mutlu', font: 'Pacifico', sz: 26, w: 400, col: '#f2ff58', mb: 1 },
      { t: 'Birthday', font: 'Abril Fatface', sz: 36, w: 400, col: '#ffffff' }
    ] },
    { id: 'studio', cat: 'minimal', lines: [
      { t: 'Minimal', font: 'Outfit', sz: 34, w: 300, sp: 0.06, col: '#ffffff', mb: 5 },
      { t: 'design studio', font: 'Outfit', sz: 11, w: 500, up: true, sp: 0.14, col: '#9a9aa3' }
    ] },
    { id: 'gelecek', cat: 'bold', lines: [
      { t: 'Future\nnow', font: 'Bebas Neue', sz: 44, w: 400, sp: 0.03, col: '#ffffff' }
    ] },
    { id: 'bonjour', cat: 'script', lines: [
      { t: 'Bonjour', font: 'Dancing Script', sz: 44, w: 700, col: '#ffffff', mb: 3 },
      { t: 'welcome', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.2, col: '#9a9aa3' }
    ] },
    { id: 'journal', cat: 'elegant', lines: [
      { t: 'The Journal', font: 'Cormorant Garamond', sz: 38, w: 600, sp: 0.02, col: '#ffffff', mb: 6 },
      { t: 'Issue 01 — 2026', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.14, col: '#9a9aa3' }
    ] },
    { id: 'acilis', cat: 'bold', lines: [
      { t: 'Big', font: 'DM Sans', sz: 12, w: 600, up: true, sp: 0.2, col: '#f2ff58', mb: 6 },
      { t: 'Opening', font: 'Anton', sz: 46, w: 400, up: true, sp: 0.01, col: '#ffffff' }
    ] },
    { id: 'gezgin', cat: 'elegant', lines: [
      { t: 'Gezginlik', font: 'Cormorant Garamond', sz: 42, w: 600, it: true, sp: 0.03, col: '#ffffff', mb: 6 },
      { t: 'discover & travel', font: 'DM Sans', sz: 11, w: 500, up: true, sp: 0.12, col: '#9a9aa3' }
    ] },
    { id: 'kahve', cat: 'script', lines: [
      { t: 'Kahve', font: 'Pacifico', sz: 40, w: 400, col: '#ffffff', mb: 2 },
      { t: 'Break', font: 'Pacifico', sz: 26, w: 400, col: '#f2ff58' }
    ] },
    { id: 'koleksiyon', cat: 'minimal', lines: [
      { t: 'New Collection', font: 'Oswald', sz: 28, w: 500, up: true, sp: 0.06, col: '#ffffff', mb: 6 },
      { t: 'discover now →', font: 'DM Sans', sz: 12, w: 600, sp: 0.04, col: '#f2ff58' }
    ] }
  ];

  var CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'bold', label: 'Bold' },
    { id: 'elegant', label: 'Elegant' },
    { id: 'script', label: 'Script' },
    { id: 'minimal', label: 'Minimal' }
  ];

  var _activeCat = 'all';
  var _query = '';
  var _visibleCount = 8;   // gallery shows 8 at a time; "Load more" reveals +8

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function _loadFont(f) { return (window.cc && cc.loadFont) ? cc.loadFont(f) : Promise.resolve(); }
  function _presetFonts(p) {
    var seen = {}, out = [];
    p.lines.forEach(function (l) { if (l.font && !seen[l.font]) { seen[l.font] = 1; out.push(l.font); } });
    return out;
  }
  function _matches(p) {
    if (_activeCat !== 'all' && p.cat !== _activeCat) return false;
    if (!_query) return true;
    var hay = p.lines.map(function (l) { return l.t; }).join(' ').toLowerCase() + ' ' + p.cat;
    return hay.indexOf(_query) !== -1;
  }

  function _previewHtml(p) {
    return p.lines.map(function (l) {
      var st = 'font-family:\'' + _esc(l.font || 'DM Sans') + '\',sans-serif;'
        + 'font-size:' + Math.round((l.sz || 24) * 0.6) + 'px;'
        + 'font-weight:' + (l.w || 400) + ';'
        + (l.it ? 'font-style:italic;' : '')
        + (l.up ? 'text-transform:uppercase;' : '')
        + 'letter-spacing:' + (l.sp || 0) + 'em;'
        + 'color:' + (l.col || '#fff') + ';'
        + 'line-height:1.12;'
        + (l.mb != null ? 'margin-bottom:' + Math.round(l.mb * 0.6) + 'px;' : '');
      return '<div style="' + st + '">' + _esc(l.t).split('\n').join('<br>') + '</div>';
    }).join('');
  }

  function _fitPreview(card) {
    var inner = card.querySelector('.txp-card-inner');
    if (!inner) return;
    var cw = card.clientWidth - 18, ch = card.clientHeight - 18;
    if (cw <= 0 || ch <= 0) return;
    inner.style.transform = '';
    inner.style.width = cw + 'px';
    var iw = 0;
    inner.querySelectorAll('div').forEach(function (d) { iw = Math.max(iw, d.scrollWidth); });
    var ih = inner.scrollHeight;
    if (ih <= 0) return;
    var scale = Math.min(1, ch / ih, cw / Math.max(iw, 1));
    if (scale < 0.999) inner.style.transform = 'scale(' + (Math.floor(scale * 100) / 100) + ')';
  }

  function renderTextStyleGallery() {
    var grid = document.getElementById('txp-grid');
    if (!grid) return;
    var list = TEXT_STYLE_PRESETS.filter(_matches);
    if (!list.length) {
      grid.innerHTML = '<div class="txp-empty">No styles match.</div>';
      return;
    }
    if (_visibleCount > list.length) _visibleCount = list.length;
    var shown = list.slice(0, _visibleCount);
    var html = shown.map(function (p) {
      return '<button type="button" class="txp-card" data-preset="' + p.id + '"><div class="txp-card-inner">' + _previewHtml(p) + '</div></button>';
    }).join('');
    if (list.length > _visibleCount) {
      html += '<button type="button" class="txp-more" data-more>Load more <span>(' + (list.length - _visibleCount) + ')</span></button>';
    }
    grid.innerHTML = html;
    var fonts = {};
    shown.forEach(function (p) { _presetFonts(p).forEach(function (f) { fonts[f] = 1; }); });
    Object.keys(fonts).forEach(_loadFont);
    function fitAll() { grid.querySelectorAll('.txp-card').forEach(_fitPreview); }
    fitAll();
    setTimeout(fitAll, 120);
    setTimeout(fitAll, 400);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
  }

  function renderChips() {
    var wrap = document.getElementById('txp-chips');
    if (!wrap) return;
    wrap.innerHTML = CATEGORIES.map(function (c) {
      return '<button type="button" class="txp-chip' + (c.id === _activeCat ? ' active' : '') + '" data-cat="' + c.id + '">' + c.label + '</button>';
    }).join('');
  }

  function addTextPreset(presetId) {
    var p = TEXT_STYLE_PRESETS.filter(function (x) { return x.id === presetId; })[0];
    if (!p || typeof fabric === 'undefined') return;
    var s = (window.cc && cc.scale) ? cc.scale() : 1;
    Promise.all(_presetFonts(p).map(_loadFont)).then(function () {
      var objs = [], y = 0;
      p.lines.forEach(function (l) {
        var txt = new fabric.IText(l.up ? String(l.t).toLocaleUpperCase('tr') : l.t, {
          fontFamily: l.font || 'DM Sans',
          fontSize: Math.round((l.sz || 24) * s),
          fontWeight: l.w || 400,
          fontStyle: l.it ? 'italic' : 'normal',
          fill: l.col || '#ffffff',
          charSpacing: Math.round((l.sp || 0) * 1000),
          originX: 'center',
          left: 0,
          top: y,
          textAlign: 'center'
        });
        objs.push(txt);
        y += (txt.height || (l.sz * s)) + ((l.mb != null ? l.mb : 6) * s);
      });
      var group = new fabric.Group(objs, { originX: 'center', originY: 'center' });
      try { group._ccType = 'textPreset'; group._presetId = p.id; } catch (e) {}
      cc.addToCenter(group);
      cc.toast('Text style added — double-click to ungroup & edit');
    });
  }

  var _mounted = false;
  function mount() {
    if (_mounted) { renderChips(); renderTextStyleGallery(); return; }
    var view = document.getElementById('text-main-view');
    if (!view) return;
    _mounted = true;

    var search = document.getElementById('txp-search');
    if (search) search.addEventListener('input', function () { _query = (search.value || '').trim().toLowerCase(); _visibleCount = 8; renderTextStyleGallery(); });

    var chips = document.getElementById('txp-chips');
    if (chips) chips.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]'); if (!b) return;
      _activeCat = b.getAttribute('data-cat');
      _visibleCount = 8;
      renderChips(); renderTextStyleGallery();
    });

    var grid = document.getElementById('txp-grid');
    if (grid) grid.addEventListener('click', function (e) {
      if (e.target.closest('[data-more]')) { _visibleCount += 8; renderTextStyleGallery(); return; }
      var b = e.target.closest('[data-preset]'); if (!b) return;
      addTextPreset(b.getAttribute('data-preset'));
    });

    renderChips();
    renderTextStyleGallery();
  }

  window.renderTextStyleGallery = renderTextStyleGallery;
  window.addTextPreset = addTextPreset;

  cc.modules.register({ id: 'styles', parent: 'left-panel.text', title: 'Text styles', mount: mount, unmount: function () {} });
})();
