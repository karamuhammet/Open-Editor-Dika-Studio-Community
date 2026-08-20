/* ═══════════════════════════════════════════════════════════
   Sub-module: left-panel/text/effects — one-click text effects for the
   selected text. Drill-in #txp-row-effects → #fx-grid. Depends on cc.*.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[text.effects] cc skeleton missing'); return; }

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function _isTextObj(o) { return o && (o.type === 'i-text' || o.type === 'textbox' || o.type === 'text'); }
  function _hexRgba(hex, a) {
    var m = String(hex || '').replace('#', '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    if (!/^[0-9a-f]{6}$/i.test(m)) return 'rgba(255,255,255,' + a + ')';
    var n = parseInt(m, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function _ink(o) {
    if (o._fxInk == null) o._fxInk = (o.fill && o.fill !== 'transparent') ? o.fill : '#ffffff';
    return o._fxInk;
  }
  function _mkShadow(opt) { return new fabric.Shadow(opt); }

  var TEXT_EFFECTS = [
    { id: 'none', name: 'None', css: 'color:#fff', apply: function (o) { o.set({ fill: _ink(o), stroke: null, strokeWidth: 0, shadow: null, textBackgroundColor: '' }); } },
    { id: 'shadow', name: 'Shadow', css: 'color:#fff;text-shadow:3px 3px 5px rgba(0,0,0,.55)', apply: function (o) { var i = _ink(o); o.set({ fill: i, stroke: null, strokeWidth: 0, textBackgroundColor: '', shadow: _mkShadow({ color: 'rgba(0,0,0,0.45)', blur: 6, offsetX: 4, offsetY: 4 }) }); } },
    { id: 'lift', name: 'Lift', css: 'color:#fff;text-shadow:0 7px 13px rgba(0,0,0,.5)', apply: function (o) { var i = _ink(o); o.set({ fill: i, stroke: null, strokeWidth: 0, textBackgroundColor: '', shadow: _mkShadow({ color: 'rgba(0,0,0,0.35)', blur: 18, offsetX: 0, offsetY: 8 }) }); } },
    { id: 'hollow', name: 'Hollow', css: 'color:transparent;-webkit-text-stroke:1.5px #fff', apply: function (o) { var i = _ink(o); o.set({ fill: 'transparent', stroke: i, strokeWidth: 2, paintFirst: 'stroke', shadow: null, textBackgroundColor: '' }); } },
    { id: 'splice', name: 'Splice', css: 'color:transparent;-webkit-text-stroke:1.5px #fff;text-shadow:4px 4px 0 rgba(255,255,255,.7)', apply: function (o) { var i = _ink(o); o.set({ fill: 'transparent', stroke: i, strokeWidth: 2, paintFirst: 'stroke', textBackgroundColor: '', shadow: _mkShadow({ color: i, blur: 0, offsetX: 5, offsetY: 5 }) }); } },
    { id: 'echo', name: 'Echo', css: 'color:#fff;text-shadow:5px 5px 0 rgba(255,255,255,.35)', apply: function (o) { var i = _ink(o); o.set({ fill: i, stroke: null, strokeWidth: 0, textBackgroundColor: '', shadow: _mkShadow({ color: _hexRgba(i, 0.4), blur: 0, offsetX: 6, offsetY: 6 }) }); } },
    { id: 'glow', name: 'Glow', css: 'color:#fff;text-shadow:0 0 11px #fff', apply: function (o) { var i = _ink(o); o.set({ fill: i, stroke: null, strokeWidth: 0, textBackgroundColor: '', shadow: _mkShadow({ color: i, blur: 16, offsetX: 0, offsetY: 0 }) }); } },
    { id: 'neon', name: 'Neon', css: 'color:#fff;text-shadow:0 0 9px #f2ff58,0 0 3px #f2ff58', apply: function (o) { var i = _ink(o); o.set({ fill: i, stroke: i, strokeWidth: 1, paintFirst: 'fill', textBackgroundColor: '', shadow: _mkShadow({ color: i, blur: 18, offsetX: 0, offsetY: 0 }) }); } }
  ];

  function renderTextEffects() {
    var grid = document.getElementById('fx-grid');
    if (!grid) return;
    grid.innerHTML = TEXT_EFFECTS.map(function (fx) {
      return '<button type="button" class="fx-card" data-fx="' + fx.id + '"><span class="fx-prev" style="' + fx.css + '">Ag</span><span class="fx-name">' + _esc(fx.name) + '</span></button>';
    }).join('');
  }

  function applyTextEffect(fxId) {
    var fx = TEXT_EFFECTS.filter(function (x) { return x.id === fxId; })[0];
    var canvas = (window.cc && cc.canvas) ? cc.canvas() : null;
    if (!fx || !canvas) return;
    var o = canvas.getActiveObject();
    if (!o) { cc.toast('Select a text first, then pick an effect'); return; }
    var targets = [];
    if (o.type === 'group' && o._objects) targets = o._objects.filter(_isTextObj);
    else if (_isTextObj(o)) targets = [o];
    if (!targets.length) { cc.toast('Select a text object'); return; }
    targets.forEach(function (t) { fx.apply(t); t.dirty = true; });
    o.dirty = true;
    canvas.requestRenderAll();
    cc.snap();
    cc.toast(fx.name === 'None' ? 'Effect cleared' : fx.name + ' applied');
  }

  var _mounted = false;
  function mount() {
    if (_mounted) return; _mounted = true;
    var fxRow = document.getElementById('txp-row-effects');
    if (fxRow) fxRow.addEventListener('click', function () { if (typeof textDrillIn === 'function') textDrillIn('effects'); renderTextEffects(); });
    var fxGrid = document.getElementById('fx-grid');
    if (fxGrid) fxGrid.addEventListener('click', function (e) { var b = e.target.closest('[data-fx]'); if (b) applyTextEffect(b.getAttribute('data-fx')); });
  }

  window.renderTextEffects = renderTextEffects;
  window.applyTextEffect = applyTextEffect;

  cc.modules.register({ id: 'effects', parent: 'left-panel.text', title: 'Text effects', mount: mount, unmount: function () {} });
})();
