/* ═══════════════════════════════════════════════════════════
   Sub-module: left-panel/text/dynamic — smart fields (page number,
   date). Drill-in #txp-row-dynamic → #dyn-grid. Depends on cc.*.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[text.dynamic] cc skeleton missing'); return; }

  function addDynamicText(kind) {
    if (typeof fabric === 'undefined') return;
    var s = (window.cc && cc.scale) ? cc.scale() : 1;
    var txt, field, label;
    if (kind === 'date') {
      var d = new Date();
      try { txt = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
      catch (e) { txt = d.toLocaleDateString(); }
      field = 'date'; label = 'Date';
    } else {
      var pn = ((window.cc && cc.pageIndex) ? cc.pageIndex() : 0) + 1;
      txt = String(pn); field = 'pageNumber'; label = 'Page number';
    }
    var o = new fabric.Textbox(txt, { fontFamily: 'DM Sans', fontSize: Math.round(20 * s), fill: '#ffffff', textAlign: 'center', width: Math.round(140 * s) });
    try { o.set('width', Math.max(40, Math.ceil(o.calcTextWidth()) + 8)); } catch (e) {}
    try { o._dynField = field; } catch (e) {}
    cc.addToCenter(o);
    cc.toast(label + ' added');
  }

  var _mounted = false;
  function mount() {
    if (_mounted) return; _mounted = true;
    var dynRow = document.getElementById('txp-row-dynamic');
    if (dynRow) dynRow.addEventListener('click', function () { if (typeof textDrillIn === 'function') textDrillIn('dynamic'); });
    var dynGrid = document.getElementById('dyn-grid');
    if (dynGrid) dynGrid.addEventListener('click', function (e) { var b = e.target.closest('[data-dyn]'); if (b) addDynamicText(b.getAttribute('data-dyn')); });
  }

  window.addDynamicText = addDynamicText;

  cc.modules.register({ id: 'dynamic', parent: 'left-panel.text', title: 'Dynamic text', mount: mount, unmount: function () {} });
})();
