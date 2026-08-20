/* Sub-module: left-panel/items/icons — Lucide icon category cards + drill-in grid + search.
   Moved under Items 2026-07-25 (was its own rail flyout `left-panel/icons`): it is now the FIRST
   Items category, registered through window.ItemsCore like shapes/emoji/gif/lottie/stickers.
   The render/search engine is unchanged and still uses js/icons.js globals (CANVAS_ICONS,
   getCanvasIconSvgMarkup, getIcon, addIconToCanvas); only the host DOM moved into
   #items-icons-view. window.renderFlyoutIconCategoryCards/drillIntoIconCategory/initIconSearch
   stay global (rail-flyout redirect + tests/diag-icons-module.mjs call them). */
(function () {
  'use strict';

// ── 18c. Icons (drill-in category cards like wireframe) ──────────────
var flyoutIconCategory = null;

// Use CANVAS_ICON_CATEGORY_META from icons.js (set by _installLucideCanvasIcons)
function _getIconCatMeta(cat) {
  if (typeof CANVAS_ICON_CATEGORY_META !== 'undefined' && CANVAS_ICON_CATEGORY_META[cat]) {
    return CANVAS_ICON_CATEGORY_META[cat];
  }
  return { icon: 'icons', desc: '' };
}

/* ONE back button per level. The host #items-icons-view carries the Items-level back (to the
   Items main view) and the drill view carries its own (back to the category cards); showing both
   at once stacked two identical "Back" rows in the category grid. */
function _setItemsBack(show) {
  var b = document.querySelector('#items-icons-view .items-back-btn');
  if (b) b.style.display = show ? '' : 'none';
}

function renderFlyoutIconCategoryCards() {
  var catView = document.getElementById('flyout-icon-cat-view');
  var drillView = document.getElementById('flyout-icon-drill-view');
  if (!catView) return;
  _setItemsBack(true);
  catView.style.display = '';
  if (drillView) drillView.style.display = 'none';
  catView.innerHTML = '';
  catView.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px 0;';

  var catOrder = (typeof CANVAS_ICON_CATEGORY_ORDER !== 'undefined') ? CANVAS_ICON_CATEGORY_ORDER : Object.keys(CANVAS_ICONS);
  catOrder.forEach(function(cat) {
    if (!CANVAS_ICONS[cat]) return;
    var meta = _getIconCatMeta(cat);
    var count = Object.keys(CANVAS_ICONS[cat] || {}).length;
    var card = document.createElement('div');
    card.className = 'wf-cat-card';
    // Use first icon from category as preview
    var previewHtml = '';
    var iconKeys = Object.keys(CANVAS_ICONS[cat] || {});
    if (iconKeys.length > 0 && typeof getCanvasIconSvgMarkup === 'function') {
      previewHtml = getCanvasIconSvgMarkup(CANVAS_ICONS[cat][iconKeys[0]], 22, 'currentColor');
    }
    if (!previewHtml) {
      previewHtml = (typeof getIcon === 'function') ? getIcon(meta.icon, 22) : '';
    }
    card.innerHTML =
      '<div class="wf-cat-icon">' + previewHtml + '</div>' +
      '<div class="wf-cat-name">' + cat + '</div>' +
      '<div class="wf-cat-desc">' + meta.desc + ' (' + count + ')' + '</div>';
    card.addEventListener('click', function() {
      drillIntoIconCategory(cat);
    });
    catView.appendChild(card);
  });
}

function drillIntoIconCategory(cat) {
  var catView   = document.getElementById('flyout-icon-cat-view');
  var drillView = document.getElementById('flyout-icon-drill-view');
  var drillGrid = document.getElementById('flyout-icon-drill-grid');
  var titleEl   = document.getElementById('flyout-icon-sub-title');
  var backBtn   = document.getElementById('flyout-icon-back-btn');

  if (catView)   catView.style.display = 'none';
  if (drillView) drillView.style.display = '';
  if (titleEl)   titleEl.textContent = cat;
  _setItemsBack(false);
  flyoutIconCategory = cat;

  if (backBtn) {
    backBtn.onclick = function() {
      renderFlyoutIconCategoryCards();
    };
  }

  if (!drillGrid) return;
  drillGrid.innerHTML = '';
  var icons = CANVAS_ICONS[cat] || {};
  Object.entries(icons).forEach(function(entry) {
    var name = entry[0], data = entry[1];
    var cell = document.createElement('div');
    cell.className = 'icon-cell';
    cell.title = name;
    var svgHtml = (typeof getCanvasIconSvgMarkup === 'function') ? getCanvasIconSvgMarkup(data, 20, 'currentColor') : '';
    cell.innerHTML =
      svgHtml +
      '<span style="font-size:9px;color:var(--text-dim);margin-top:2px;text-align:center;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">' + name + '</span>';
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;';
    cell.addEventListener('click', function() {
      if (typeof addIconToCanvas === 'function') addIconToCanvas(name, data);
    });
    drillGrid.appendChild(cell);
  });
}

/* Icon search. The listener binds ONCE: renderDrill runs on every drill-in and the old
   openFlyout('icons') path re-bound it on every panel open, stacking a duplicate handler
   per open (every keystroke then rebuilt the grid N times). */
function initIconSearch() {
  var input = document.getElementById('icon-search-input');
  if (!input || input._ccIconSearchWired) return;
  input._ccIconSearchWired = true;
  input.addEventListener('input', function() {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      renderFlyoutIconCategoryCards();
      return;
    }
    var catView = document.getElementById('flyout-icon-cat-view');
    var drillView = document.getElementById('flyout-icon-drill-view');
    if (catView) catView.style.display = 'none';
    if (drillView) drillView.style.display = '';
    _setItemsBack(false);
    var titleEl = document.getElementById('flyout-icon-sub-title');
    if (titleEl) titleEl.textContent = 'Search: ' + input.value.trim();
    var backBtn = document.getElementById('flyout-icon-back-btn');
    if (backBtn) backBtn.onclick = function() { input.value = ''; renderFlyoutIconCategoryCards(); };

    var drillGrid = document.getElementById('flyout-icon-drill-grid');
    if (!drillGrid) return;
    drillGrid.innerHTML = '';
    var found = 0;
    Object.keys(CANVAS_ICONS).forEach(function(cat) {
      Object.entries(CANVAS_ICONS[cat]).forEach(function(entry) {
        var name = entry[0], data = entry[1];
        if (name.toLowerCase().indexOf(q) === -1 && cat.toLowerCase().indexOf(q) === -1) return;
        found++;
        var cell = document.createElement('div');
        cell.className = 'icon-cell';
        cell.title = name + ' (' + cat + ')';
        var svgHtml = (typeof getCanvasIconSvgMarkup === 'function') ? getCanvasIconSvgMarkup(data, 20, 'currentColor') : '';
        cell.innerHTML =
          svgHtml +
          '<span style="font-size:9px;color:var(--text-dim);margin-top:2px;text-align:center;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">' + name + '</span>';
        cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;';
        cell.addEventListener('click', function() {
          if (typeof addIconToCanvas === 'function') addIconToCanvas(name, data);
        });
        drillGrid.appendChild(cell);
      });
    });
    if (!found) {
      drillGrid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">No icons found</div>';
    }
  });
}

  /* ── Items main-view slider (the preview row, same shape as Shapes/Emoji/…) ──
     CANVAS_ICONS is rebuilt from the WHOLE Lucide library at boot, so a hardcoded name
     list would silently render blank cells if a slug is missing. Resolve every wanted
     slug against the REAL catalog and top the row up with each category's first icon. */
  var SLIDER_COUNT = 16;
  var POPULAR_SLUGS = ['star','heart','check','search','settings','camera','music','mail','phone','calendar','clock','map-pin','shopping-cart','sparkles','zap','flame'];

  function _sliderPicks() {
    if (typeof CANVAS_ICONS === 'undefined' || !CANVAS_ICONS) return [];
    var bySlug = {}, firsts = [];
    Object.keys(CANVAS_ICONS).forEach(function (cat) {
      Object.keys(CANVAS_ICONS[cat] || {}).forEach(function (name, i) {
        var data = CANVAS_ICONS[cat][name];
        if (data && data.lucide && !bySlug[data.lucide]) bySlug[data.lucide] = { name: name, data: data };
        if (i === 0) firsts.push({ name: name, data: data });
      });
    });
    var picks = [], taken = {};
    POPULAR_SLUGS.forEach(function (slug) {
      var hit = bySlug[slug];
      if (hit && !taken[hit.name]) { taken[hit.name] = 1; picks.push(hit); }
    });
    for (var i = 0; i < firsts.length && picks.length < SLIDER_COUNT; i++) {
      if (!taken[firsts[i].name]) { taken[firsts[i].name] = 1; picks.push(firsts[i]); }
    }
    return picks.slice(0, SLIDER_COUNT);
  }

  function fillSlider(slider) {
    var picks = _sliderPicks();
    if (!picks.length) {
      var msg = document.createElement('div');
      msg.className = 'items-no-key';
      msg.textContent = 'Icon library is loading...';
      slider.appendChild(msg);
      return;
    }
    picks.forEach(function (p) {
      var cell = document.createElement('div');
      cell.className = 'items-slider-cell items-icon-cell';
      cell.title = p.name;
      cell.innerHTML = (typeof getCanvasIconSvgMarkup === 'function') ? getCanvasIconSvgMarkup(p.data, 26, 'currentColor') : '';
      cell.addEventListener('click', function () { if (typeof addIconToCanvas === 'function') addIconToCanvas(p.name, p.data); });
      slider.appendChild(cell);
    });
  }

  function renderDrill() {
    var input = document.getElementById('icon-search-input');
    if (input) input.value = '';
    initIconSearch();
    renderFlyoutIconCategoryCards();
  }

  window.renderFlyoutIconCategoryCards = renderFlyoutIconCategoryCards;
  window.drillIntoIconCategory = drillIntoIconCategory;
  window.initIconSearch = initIconSearch;

  if (window.cc && cc.modules) {
    var _reg = false;
    cc.modules.register({
      id: 'icons', parent: 'left-panel.items', title: 'Icons', icon: 'smile',
      mount: function () {
        if (_reg) return; _reg = true;
        if (window.ItemsCore) ItemsCore.registerTab({ key: 'icons', label: 'Icons', order: 0, fillSlider: fillSlider, renderDrill: renderDrill });
      },
      unmount: function () {}
    });
  }
})();
