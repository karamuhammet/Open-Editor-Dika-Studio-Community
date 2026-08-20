/* ═══════════════════════════════════════════════════════════
   Sub-module: left-panel/text/pairings — curated heading+body font
   combinations. Drill-in #txp-row-pairings → #fp-grid. Depends on cc.*.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[text.pairings] cc skeleton missing'); return; }

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function _loadFont(f) { return (window.cc && cc.loadFont) ? cc.loadFont(f) : Promise.resolve(); }

  var FONT_PAIRINGS = [
    { id: 'editorial', name: 'Editorial', head: 'Playfair Display', hw: 700, hi: false, body: 'DM Sans', bw: 400 },
    { id: 'modern', name: 'Modern', head: 'Anton', hw: 400, hup: true, body: 'Outfit', bw: 400 },
    { id: 'elegant', name: 'Elegant', head: 'Cormorant Garamond', hw: 600, hi: true, body: 'DM Sans', bw: 400 },
    { id: 'impact', name: 'Bold impact', head: 'Bebas Neue', hw: 400, body: 'DM Sans', bw: 400 },
    { id: 'playful', name: 'Playful', head: 'Pacifico', hw: 400, body: 'Outfit', bw: 400 },
    { id: 'clean', name: 'Clean', head: 'Outfit', hw: 700, body: 'Outfit', bw: 300 },
    { id: 'classic', name: 'Classic', head: 'Lora', hw: 700, body: 'DM Sans', bw: 400 },
    { id: 'statement', name: 'Statement', head: 'Oswald', hw: 500, hup: true, body: 'DM Sans', bw: 400 }
  ];

  function renderFontPairings() {
    var grid = document.getElementById('fp-grid');
    if (!grid) return;
    grid.innerHTML = FONT_PAIRINGS.map(function (fp) {
      var hs = 'font-family:\'' + _esc(fp.head) + '\',sans-serif;font-weight:' + fp.hw + ';' + (fp.hi ? 'font-style:italic;' : '') + (fp.hup ? 'text-transform:uppercase;letter-spacing:.04em;' : '') + 'font-size:22px;color:#fff;line-height:1.05;';
      var bs = 'font-family:\'' + _esc(fp.body) + '\',sans-serif;font-weight:' + fp.bw + ';font-size:11px;color:#bdbdc6;margin-top:6px;line-height:1.3;';
      return '<button type="button" class="fp-card" data-pairing="' + fp.id + '">' +
        '<div class="fp-name">' + _esc(fp.name) + '</div>' +
        '<div style="' + hs + '">' + _esc(fp.hup ? fp.head.split(' ')[0].toUpperCase() : 'Heading') + '</div>' +
        '<div style="' + bs + '">The quick brown fox jumps over</div>' +
        '</button>';
    }).join('');
    var fonts = {};
    FONT_PAIRINGS.forEach(function (fp) { fonts[fp.head] = 1; fonts[fp.body] = 1; });
    Object.keys(fonts).forEach(_loadFont);
  }

  function addFontPairing(id) {
    var fp = FONT_PAIRINGS.filter(function (x) { return x.id === id; })[0];
    if (!fp || typeof fabric === 'undefined') return;
    var s = (window.cc && cc.scale) ? cc.scale() : 1;
    Promise.all([_loadFont(fp.head), _loadFont(fp.body)]).then(function () {
      var head = new fabric.Textbox(fp.hup ? 'YOUR HEADING' : 'Your heading', {
        fontFamily: fp.head, fontSize: Math.round(34 * s), fontWeight: fp.hw, fontStyle: fp.hi ? 'italic' : 'normal',
        fill: '#ffffff', textAlign: 'center', originX: 'center', left: 0, top: 0, width: Math.round(360 * s)
      });
      var body = new fabric.Textbox('Add your supporting body copy here — keep it short and clear.', {
        fontFamily: fp.body, fontSize: Math.round(14 * s), fontWeight: fp.bw, fill: '#cfcfd6',
        textAlign: 'center', originX: 'center', left: 0, top: (head.height || 40 * s) + 14 * s, width: Math.round(320 * s)
      });
      var group = new fabric.Group([head, body], { originX: 'center', originY: 'center' });
      try { group._ccType = 'fontPairing'; group._pairingId = fp.id; } catch (e) {}
      cc.addToCenter(group);
      cc.toast(fp.name + ' pairing added — double-click to ungroup & edit');
    });
  }

  var _mounted = false;
  function mount() {
    if (_mounted) return; _mounted = true;
    var fpRow = document.getElementById('txp-row-pairings');
    if (fpRow) fpRow.addEventListener('click', function () { if (typeof textDrillIn === 'function') textDrillIn('pairings'); renderFontPairings(); });
    var fpGrid = document.getElementById('fp-grid');
    if (fpGrid) fpGrid.addEventListener('click', function (e) { var b = e.target.closest('[data-pairing]'); if (b) addFontPairing(b.getAttribute('data-pairing')); });
  }

  window.renderFontPairings = renderFontPairings;
  window.addFontPairing = addFontPairing;

  cc.modules.register({ id: 'pairings', parent: 'left-panel.text', title: 'Font pairings', mount: mount, unmount: function () {} });
})();
