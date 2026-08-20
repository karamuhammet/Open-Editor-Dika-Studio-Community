/* ============================================================
   right-panel/design-fields - Design field ARANABILIR combobox
   #p-df-field native <select> TEK dogruluk kaynagi ve durum tasiyicisi olarak
   KALIR (right-panel.js sync + dfHandler + grid-cell yolu HIC degismez); bu
   modul onu gizleyip ustune aranabilir, klavyeli, gruplu bir acilir bindirir.
   - Secim: select.value yaz + 'change' dispatch -> mevcut dfHandler calisir.
   - Programatik sync (syncRightPanel'in pDfField.value = ... yazmasi) instance
     value setter'i sarmalanarak yakalanir -> etiket hep guncel.
   - Bilinmeyen deger (or. baska org'un product-attr:<key>'i) secime yazilirsa
     secenek OLARAK enjekte edilir; native select bos gorunup degeri dusuremez.
   - Portal aktifse urun nitelik sozlugu (CCProducts.listAttributes) Product
     grubuna product-attr:<key> secenekleri olarak eklenir.
   Plan: docs/editor-product-support-plan.md D7/D8.
   ============================================================ */
(function () {
  var _sel = null, _trigger = null, _labelEl = null, _pop = null;
  var _open = false, _activeIdx = -1, _rows = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* select icerigini {v, t, group} listesine dok. */
  function collectItems() {
    var out = [];
    var kids = _sel.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.tagName === 'OPTION') out.push({ v: k.value, t: k.textContent, group: '' });
      else if (k.tagName === 'OPTGROUP') {
        var os = k.children;
        for (var j = 0; j < os.length; j++) {
          if (os[j].tagName === 'OPTION') out.push({ v: os[j].value, t: os[j].textContent, group: k.label });
        }
      }
    }
    return out;
  }

  function findGroup(label) {
    var gs = _sel.querySelectorAll('optgroup');
    for (var i = 0; i < gs.length; i++) if (gs[i].label === label) return gs[i];
    return null;
  }
  function hasOption(v) {
    var os = _sel.querySelectorAll('option');
    for (var i = 0; i < os.length; i++) if (os[i].value === v) return true;
    return false;
  }
  /* Bilinmeyen degeri secenege cevir: product-attr:* -> Product grubu, digerleri Other. */
  function ensureOption(v) {
    if (!v || hasOption(v)) return;
    var opt = document.createElement('option');
    opt.value = v;
    var isAttr = v.indexOf('product-attr:') === 0;
    opt.textContent = isAttr ? 'Attr: ' + v.slice('product-attr:'.length) : v;
    var g = findGroup(isAttr ? 'Product' : 'Other');
    if (g) g.appendChild(opt); else _sel.appendChild(opt);
  }

  function paintLabel() {
    if (!_labelEl || !_sel) return;
    var v = _sel.value;
    var t = 'None (static)';
    if (v) {
      var os = _sel.querySelectorAll('option');
      for (var i = 0; i < os.length; i++) if (os[i].value === v) { t = os[i].textContent; break; }
    }
    _labelEl.textContent = t;
    _trigger.classList.toggle('has-val', !!v);
  }

  /* ---------- popup ---------- */
  function place() {
    var r = _trigger.getBoundingClientRect();
    _pop.style.width = Math.max(r.width, 220) + 'px';
    _pop.style.left = r.left + 'px';
    var below = window.innerHeight - r.bottom;
    if (below < 280 && r.top > below) { _pop.style.top = 'auto'; _pop.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
    else { _pop.style.bottom = 'auto'; _pop.style.top = (r.bottom + 4) + 'px'; }
  }

  function renderList() {
    var q = (_pop.querySelector('.dfc-search').value || '').trim().toLowerCase();
    var items = collectItems();
    var listEl = _pop.querySelector('.dfc-list');
    var cur = _sel.value;
    var h = '';
    var lastGroup = null;
    _rows = [];
    items.forEach(function (it) {
      if (q && it.t.toLowerCase().indexOf(q) === -1 && it.v.toLowerCase().indexOf(q) === -1) return;
      if (it.group !== lastGroup && it.group) { h += '<div class="dfc-group">' + esc(it.group) + '</div>'; }
      lastGroup = it.group;
      var idx = _rows.length;
      _rows.push(it);
      h += '<button type="button" class="dfc-row' + (it.v === cur ? ' sel' : '') + '" data-idx="' + idx + '">'
        + esc(it.t) + (it.v ? '<span class="dfc-key">' + esc(it.v) + '</span>' : '') + '</button>';
    });
    if (!_rows.length) h = '<div class="dfc-empty">No results</div>';
    listEl.innerHTML = h;
    _activeIdx = -1;
    for (var i = 0; i < _rows.length; i++) if (_rows[i].v === cur) { _activeIdx = i; break; }
    paintActive();
  }

  function paintActive() {
    var rows = _pop.querySelectorAll('.dfc-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('active', Number(rows[i].getAttribute('data-idx')) === _activeIdx);
    if (_activeIdx >= 0 && rows[_activeIdx] && rows[_activeIdx].scrollIntoView) {
      rows[_activeIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function apply(v) {
    close();
    _sel.value = v;                 // sarmalanmis setter etiketi de boyar
    var ev;
    try { ev = new Event('change', { bubbles: true }); } catch (e) { ev = document.createEvent('Event'); ev.initEvent('change', true, false); }
    _sel.dispatchEvent(ev);         // right-panel.js dfHandler devralir
  }

  function openPop() {
    if (_open) return;
    // dfHandler'in _dfLastObj cache'i icin: native select'e mousedown sinyali
    // (secim popup etkilesimi sirasinda kaybolursa da handler objeyi bulur).
    // _open = true'dan ONCE: capture'daki onDocDown bu sentetik mousedown'u
    // gorur; _open o anda true olsaydi popup kendini aninda kapatirdi.
    var md;
    try { md = new Event('mousedown'); } catch (e) { md = document.createEvent('Event'); md.initEvent('mousedown', false, false); }
    _sel.dispatchEvent(md);
    _open = true;
    _pop.style.display = '';
    _trigger.classList.add('open');
    place();
    _pop.querySelector('.dfc-search').value = '';
    renderList();
    setTimeout(function () { try { _pop.querySelector('.dfc-search').focus(); } catch (e) {} }, 20);
  }
  function close() {
    if (!_open) return;
    _open = false;
    _pop.style.display = 'none';
    _trigger.classList.remove('open');
  }

  function onDocDown(e) {
    if (_open && !_pop.contains(e.target) && !_trigger.contains(e.target)) close();
  }

  function onSearchKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); _activeIdx = Math.min(_rows.length - 1, _activeIdx + 1); paintActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _activeIdx = Math.max(0, _activeIdx - 1); paintActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (_activeIdx >= 0 && _rows[_activeIdx]) apply(_rows[_activeIdx].v); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  /* ---------- kurulum ---------- */
  function init() {
    _sel = document.getElementById('p-df-field');
    if (!_sel || _sel._dfComboBound) return;
    _sel._dfComboBound = true;
    var field = _sel.parentNode;   // .rpf-field
    field.classList.add('dfc-host');

    _trigger = document.createElement('button');
    _trigger.type = 'button';
    _trigger.className = 'dfc-trigger';
    _trigger.setAttribute('aria-haspopup', 'listbox');
    _trigger.innerHTML = '<span class="dfc-label"></span>'
      + '<span class="dfc-ch"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>';
    field.appendChild(_trigger);
    _labelEl = _trigger.querySelector('.dfc-label');

    _pop = document.createElement('div');
    _pop.className = 'dfc-pop';
    _pop.style.display = 'none';
    _pop.innerHTML = '<input type="text" class="dfc-search" placeholder="Search field...">'
      + '<div class="dfc-list" role="listbox"></div>';
    document.body.appendChild(_pop);

    /* Programatik value yazimini yakala: syncRightPanel pDfField.value = x der,
       event atmaz; instance-level accessor ile etiket yine de guncellenir ve
       bilinmeyen deger once secenege cevrilir (deger dusmez). */
    try {
      var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (desc && desc.set && desc.get) {
        Object.defineProperty(_sel, 'value', {
          configurable: true,
          get: function () { return desc.get.call(this); },
          set: function (v) { ensureOption(v); desc.set.call(this, v); paintLabel(); }
        });
      }
    } catch (e) {}

    _sel.addEventListener('change', paintLabel);
    _trigger.addEventListener('click', function (e) { e.stopPropagation(); if (_open) close(); else openPop(); });
    _trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(); }
    });
    _pop.querySelector('.dfc-search').addEventListener('input', renderList);
    _pop.querySelector('.dfc-search').addEventListener('keydown', onSearchKey);
    _pop.querySelector('.dfc-list').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.dfc-row') : null;
      if (b) apply(_rows[Number(b.getAttribute('data-idx'))].v);
    });
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('resize', function () { if (_open) place(); });

    paintLabel();
    injectProductAttrOptions();
  }

  /* Urun nitelik sozlugu -> Product grubuna product-attr:<key> secenekleri.
     Sadece portal aktifken (standalone'da sozluk yok; statik anahtarlar kalir). */
  function injectProductAttrOptions() {
    if (!(window.CCProducts && CCProducts.active)) return;
    CCProducts.listAttributes().then(function (attrs) {
      var g = findGroup('Product');
      if (!g) return;
      (attrs || []).forEach(function (a) {
        var v = 'product-attr:' + a.key;
        if (hasOption(v)) return;
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = 'Attr: ' + a.name;
        g.appendChild(opt);
      });
      paintLabel();
    });
  }

  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () { cc.safe('right-panel.design-fields.init', init); });
  }
  if (window.cc && cc.modules && cc.modules.register) {
    cc.modules.register({
      id: 'design-fields',
      parent: 'right-panel',
      title: 'Design field combobox',
      mount: function () {},
      unmount: function () {}
    });
  }
})();
