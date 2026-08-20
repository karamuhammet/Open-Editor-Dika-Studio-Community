/* Sub-module: left-panel/items/shapes — preset-shape slider preview.
   Each cell proxies the corresponding #tool-* button (wired by app.js). */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[items.shapes] cc skeleton missing'); return; }

  var SHAPE_PREVIEWS = [
    {id:'tool-rect', svg:'<rect x="6" y="12" width="36" height="24" rx="3" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-square', svg:'<rect x="9" y="9" width="30" height="30" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-circle', svg:'<circle cx="24" cy="24" r="16" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-oval', svg:'<ellipse cx="24" cy="24" rx="20" ry="13" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-triangle', svg:'<polygon points="24,6 42,42 6,42" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-line', svg:'<line x1="4" y1="24" x2="44" y2="24" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-arrow', svg:'<path d="M4 24 H32 L24 16 M32 24 L24 32" fill="none" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-star', svg:'<polygon points="24,4 29,17 43,17 32,26 36,40 24,31 12,40 16,26 5,17 19,17" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-diamond', svg:'<rect x="14" y="14" width="20" height="20" rx="1" transform="rotate(45 24 24)" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-pentagon', svg:'<polygon points="24,6 41,18 35,39 13,39 7,18" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-hexagon', svg:'<polygon points="24,4 42,14 42,34 24,44 6,34 6,14" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-heart', svg:'<path d="M24 40 C14 32 4 24 4 16 A10 10 0 0 1 24 12 A10 10 0 0 1 44 16 C44 24 34 32 24 40Z" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-blob', svg:'<path d="M26 6 C36 7 43 14 42 24 C41 34 34 43 24 42 C14 41 6 33 7 23 C8 14 16 5 26 6Z" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-cloud-shape', svg:'<path d="M14 34 A8 8 0 0 1 10 20 A10 10 0 0 1 22 12 A12 12 0 0 1 38 20 A8 8 0 0 1 38 34Z" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-cross', svg:'<path d="M20 8 H28 V20 H40 V28 H28 V40 H20 V28 H8 V20 H20 Z" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-ring', svg:'<circle cx="24" cy="24" r="16" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="7" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'},
    {id:'tool-frame', svg:'<rect x="7" y="10" width="34" height="28" rx="2" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/><path d="M12 32 L20 23 L27 30 L32 26 L37 32" fill="#C9CDD6" stroke="currentColor" stroke-width="2"/>'}
  ];

  function fillSlider(slider) {
    SHAPE_PREVIEWS.forEach(function (sp) {
      var cell = document.createElement('div');
      cell.className = 'items-slider-cell items-shape-cell';
      cell.innerHTML = '<svg viewBox="0 0 48 48" width="48" height="48">' + sp.svg + '</svg>';
      cell.title = sp.id.replace('tool-', '');
      cell.addEventListener('click', function () { var btn = document.getElementById(sp.id); if (btn) btn.click(); });
      slider.appendChild(cell);
    });
  }

  var _reg = false;
  function mount() { if (_reg) return; _reg = true; if (window.ItemsCore) ItemsCore.registerTab({ key: 'shapes', label: 'Shapes', order: 1, fillSlider: fillSlider }); }

  cc.modules.register({ id: 'shapes', parent: 'left-panel.items', title: 'Shapes', mount: mount, unmount: function () {} });
})();
