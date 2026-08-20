/* templates/renderer — RENDER the template grid/category cards + drill-in nav. Split from the 3107-line templates.js (decomposition).
   FLAT sub-module: its functions stay window globals (the panel/boot/each other call them at runtime,
   so load order among siblings is irrelevant). Registers under left-panel.templates for fault isolation. */

function renderTemplateGrid(containerId, filter, searchTerm) {
  filter = filter || 'All';
  searchTerm = searchTerm || '';
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  Object.entries(TEMPLATE_REGISTRY).forEach(function(entry) {
    var key = entry[0], reg = entry[1];
    if (filter !== 'All' && reg.category !== filter) return;
    if (searchTerm && !reg.name.toLowerCase().includes(searchTerm.toLowerCase()) && !reg.category.toLowerCase().includes(searchTerm.toLowerCase())) return;

    var card = document.createElement('div');
    card.className = 'tpl-card' + (key === selectedTpl ? ' active' : '');
    card.dataset.tpl = key;
    card.onclick = (function(capturedKey, capturedReg) {
      return function() {
        var self = this;
        confirmAndApplyTemplate(capturedKey, capturedReg.productType);
        container.querySelectorAll('.tpl-card').forEach(function(c) { c.classList.remove('active'); });
        self.classList.add('active');
      };
    })(key, reg);

    var cvs = document.createElement('canvas');
    cvs.width = 352; cvs.height = 200;
    cvs.style.width = '100%';
    cvs.style.height = 'auto';
    card.appendChild(cvs);

    var label = document.createElement('div');
    label.className = 'tpl-name';
    label.textContent = reg.name.toUpperCase();
    card.appendChild(label);

    container.appendChild(card);
    reg.thumb(cvs);
  });
}


// ────────────────────────────────────────────────────────────────
//  TEMPLATE CATEGORY CARDS (product-type drill-down)
// ────────────────────────────────────────────────────────────────

function renderTemplateCategoryCards(containerId, searchTerm) {
  if (typeof _crRenderPost === 'function') { _crRenderPost(containerId, searchTerm); return; }   // COMMAND RAIL
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container.className = 'tpl-grid';

  var oldHeader = document.getElementById('tpl-cat-header');
  if (oldHeader) oldHeader.remove();

  // Board mode info banner
  if (window.wbActive) {
    var boardBanner = document.createElement('div');
    boardBanner.className = 'tpl-board-banner';
    boardBanner.innerHTML = '&#128204; Board mode \u2014 templates open in a new page';
    container.appendChild(boardBanner);
  }

  // ── My Templates (saved) card — always at top ──
  var savedTpls = (typeof getSavedTemplates === 'function') ? getSavedTemplates() : [];
  if (savedTpls.length > 0) {
    var savedCard = document.createElement('div');
    savedCard.className = 'tpl-cat-card tpl-cat-saved';

    var saveIconHtml = (typeof getIcon === 'function') ? getIcon('save', 18) : '';
    savedCard.innerHTML =
      '<div class="tpl-cat-icon" style="color:var(--gold)">' + saveIconHtml + '</div>' +
      '<div class="tpl-cat-name">My Templates</div>' +
      '<div class="tpl-cat-dims">Saved designs</div>' +
      '<div class="tpl-cat-count">' + savedTpls.length + '</div>';

    savedCard.onclick = function () { drillIntoSavedTemplates(containerId); };
    container.appendChild(savedCard);
  }

  var catMap = {};
  Object.keys(TEMPLATE_REGISTRY).forEach(function (key) {
    var reg = TEMPLATE_REGISTRY[key];
    var pt = reg.productType || 'card';
    if (pt === 'all') {
      Object.keys(PRODUCT_TYPES).forEach(function(k) {
        if (k !== 'custom') {
          if (!catMap[k]) catMap[k] = 0;
          catMap[k]++;
        }
      });
    } else {
      if (!catMap[pt]) catMap[pt] = 0;
      catMap[pt]++;
    }
  });

  var ptOrder = ['card', 'logo', 'cv', 'invoice', 'socialPost', 'story', 'banner', 'emailHeader'];

  ptOrder.forEach(function (key) {
    var count = catMap[key] || 0;
    if (count === 0) return;
    var cfg = (typeof PRODUCT_TYPES !== 'undefined') ? PRODUCT_TYPES[key] : null;
    if (!cfg) return;

    var card = document.createElement('div');
    card.className = 'tpl-cat-card';

    var iconKey = key === 'socialPost' ? 'social' : (key === 'emailHeader' ? 'email' : key);
    var iconHtml = (typeof getIcon === 'function') ? getIcon(iconKey, 18) : '';

    card.innerHTML =
      '<div class="tpl-cat-icon">' + iconHtml + '</div>' +
      '<div class="tpl-cat-name">' + cfg.label + '</div>' +
      '<div class="tpl-cat-dims">' + cfg.w + '\u00d7' + cfg.h + '</div>' +
      '<div class="tpl-cat-count">' + count + '</div>';

    card.onclick = function () {
      drillIntoCategory(containerId, key, cfg.label);
    };

    container.appendChild(card);
  });
}

function drillIntoCategory(containerId, productType, label) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container.className = 'tpl-grid';

  var oldHeader = document.getElementById('tpl-cat-header');
  if (oldHeader) oldHeader.remove();

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;grid-column:1/-1;margin-bottom:4px;cursor:pointer;padding:6px 0;';
  header.innerHTML = '<span style="font-size:16px;color:var(--text-dim)">\u2190</span><span style="font-size:13px;font-weight:600;color:var(--text)">' + label + '</span>';
  header.onclick = function () {
    renderTemplateCategoryCards(containerId);
  };
  container.appendChild(header);

  var blankCard = document.createElement('div');
  blankCard.className = 'tpl-card';
  blankCard.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:var(--surface2);';
  blankCard.innerHTML = '<span style="font-size:24px;color:var(--text-dim)">+</span><span style="font-size:10px;color:var(--text-dim)">Blank</span>';
  blankCard.onclick = function () {
    var currentPage = (typeof pages !== 'undefined' && pages[currentPageIndex]) ? pages[currentPageIndex] : null;
    if (currentPage && typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(currentPage)) {
      showCustomConfirm(
        'This slide page will be converted back to a normal page. Continue with a blank canvas?',
        function () {
          if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
          if (typeof convertSlidePageToNormalPage === 'function') convertSlidePageToNormalPage(currentPage);
          if (typeof setProductType === 'function') setProductType(productType);
          var cvsInner = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
          cvsInner.clear();
          cvsInner.setBackgroundColor('#0d0d0d', function() { cvsInner.renderAll(); });
          if (typeof renderPageTabs === 'function') renderPageTabs();
          if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
          if (typeof snap === 'function') snap();
        }
      );
      return;
    }
    if (typeof activeProduct !== 'undefined' && activeProduct !== productType) {
      if (typeof setProductType === 'function') setProductType(productType);
    }
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
    cvs.clear();
    cvs.setBackgroundColor('#0d0d0d', function() { cvs.renderAll(); });
    if (typeof snap === 'function') snap();
  };
  container.appendChild(blankCard);

  var keys = Object.keys(TEMPLATE_REGISTRY);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var reg = TEMPLATE_REGISTRY[key];
    if (reg.productType !== productType && reg.productType !== 'all') continue;
    if (key === 'blankGeneric') continue;

    var card = document.createElement('div');
    card.className = 'tpl-card' + (key === selectedTpl ? ' active' : '');
    card.dataset.tpl = key;

    card.onclick = (function (capturedKey, capturedPt) {
      return function () {
        var self = this;
        if (typeof confirmAndApplyTemplate === 'function') {
          confirmAndApplyTemplate(capturedKey, capturedPt);
        } else {
          applyTemplate(capturedKey);
        }
        container.querySelectorAll('.tpl-card').forEach(function (c) { c.classList.remove('active'); });
        self.classList.add('active');
      };
    })(key, productType);

    var thumbCanvas = document.createElement('canvas');
    var aspect = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[productType]) ?
      PRODUCT_TYPES[productType].h / PRODUCT_TYPES[productType].w : 200 / 352;
    thumbCanvas.width = 352;
    thumbCanvas.height = Math.round(352 * aspect);
    thumbCanvas.style.cssText = 'width:100%;height:auto;border-radius:4px;';
    if (reg.thumb) {
      try { reg.thumb(thumbCanvas); } catch (e) {}
    }
    // If a brand set is active, draw a small brand badge on the thumbnail
    if (typeof getActiveBrandSet === 'function') {
      var _ab = getActiveBrandSet();
      if (_ab) {
        var _ctx = thumbCanvas.getContext('2d');
        var _tw = thumbCanvas.width, _th = thumbCanvas.height;
        // Small pill with brand swatches at bottom-right
        var bw = 40, bh = 12, bx = _tw - bw - 6, by = _th - bh - 6;
        _ctx.fillStyle = 'rgba(0,0,0,0.65)';
        _ctx.beginPath();
        if (_ctx.roundRect) { _ctx.roundRect(bx, by, bw, bh, 3); }
        else { _ctx.rect(bx, by, bw, bh); }
        _ctx.fill();
        var sx = bx + 4;
        [_ab.colors.body, _ab.colors.primary, _ab.colors.text].forEach(function(c) {
          _ctx.fillStyle = c;
          _ctx.beginPath();
          _ctx.arc(sx + 4, by + bh/2, 3.5, 0, Math.PI * 2);
          _ctx.fill();
          sx += 12;
        });
      }
    }
    card.appendChild(thumbCanvas);

    var lbl = document.createElement('div');
    lbl.className = 'tpl-card-name';
    lbl.textContent = reg.name || key;
    card.appendChild(lbl);

    container.appendChild(card);
  }
}

function drillIntoSavedTemplates(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container.className = 'tpl-grid';

  var oldHeader = document.getElementById('tpl-cat-header');
  if (oldHeader) oldHeader.remove();

  // Header with back button
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;grid-column:1/-1;margin-bottom:4px;cursor:pointer;padding:6px 0;';
  header.innerHTML = '<span style="font-size:16px;color:var(--text-dim)">\u2190</span><span style="font-size:13px;font-weight:600;color:var(--gold)">My Templates</span>';
  header.onclick = function () { renderTemplateCategoryCards(containerId); };
  container.appendChild(header);

  var savedTpls = (typeof getSavedTemplates === 'function') ? getSavedTemplates() : [];

  if (savedTpls.length === 0) {
    var emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'grid-column:1/-1;text-align:center;padding:32px 16px;color:var(--text-dim);font-size:12px;';
    emptyMsg.innerHTML = 'No saved templates yet.<br>Use the gear menu \u2699 &rarr; <b>Save as Template</b><br>to save your current design.';
    container.appendChild(emptyMsg);
    return;
  }

  savedTpls.forEach(function (tpl) {
    var card = document.createElement('div');
    card.className = 'tpl-card tpl-card-saved';
    card.style.position = 'relative';

    // Thumbnail
    if (tpl.thumb) {
      var img = document.createElement('img');
      img.src = tpl.thumb;
      img.style.cssText = 'width:100%;height:auto;border-radius:4px;display:block;';
      img.alt = tpl.name;
      card.appendChild(img);
    } else {
      var placeholder = document.createElement('div');
      placeholder.style.cssText = 'width:100%;aspect-ratio:1.75;background:var(--surface2);border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:11px;';
      placeholder.textContent = 'No preview';
      card.appendChild(placeholder);
    }

    // Label
    var lbl = document.createElement('div');
    lbl.className = 'tpl-card-name';
    lbl.textContent = tpl.name;
    card.appendChild(lbl);

    // Product type + date badge
    var meta = document.createElement('div');
    meta.style.cssText = 'font-size:9px;color:var(--text-faint);padding:0 4px 4px;';
    var d = new Date(tpl.timestamp);
    meta.textContent = (tpl.productType || 'card') + ' \u2022 ' + d.toLocaleDateString();
    card.appendChild(meta);

    // Action buttons overlay
    var actions = document.createElement('div');
    actions.className = 'saved-tpl-actions';
    actions.innerHTML =
      '<button class="saved-tpl-btn" data-action="apply" title="Apply">\u25B6</button>' +
      '<button class="saved-tpl-btn" data-action="export" title="Export as JSON">\u2193</button>' +
      '<button class="saved-tpl-btn" data-action="rename" title="Rename">\u270E</button>' +
      '<button class="saved-tpl-btn" data-action="share" title="Share with community">⤴</button>' +
      '<button class="saved-tpl-btn saved-tpl-btn-del" data-action="delete" title="Delete">\u2716</button>';

    actions.addEventListener('click', function (e) {
      e.stopPropagation();
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var act = btn.getAttribute('data-action');
      if (act === 'apply')  applySavedTemplate(tpl.id);
      if (act === 'export') exportSavedTemplateFile(tpl.id);
      if (act === 'rename') renameSavedTemplate(tpl.id);
      if (act === 'share' && typeof shareSavedTemplate === 'function') shareSavedTemplate(tpl.id);
      if (act === 'delete') deleteSavedTemplate(tpl.id);
    });

    card.appendChild(actions);

    // "Shared to community" badge (P13)
    if (tpl.sharedTemplateId) {
      var sbadge = document.createElement('div');
      sbadge.style.cssText = 'position:absolute;top:6px;left:6px;background:rgba(15,15,15,0.85);color:var(--gold);border:1px solid var(--gold);font-size:9px;font-weight:600;padding:2px 6px;border-radius:999px;pointer-events:none;';
      sbadge.textContent = '✓ Shared';
      card.appendChild(sbadge);
    }

    // Click card to apply
    card.addEventListener('click', function () { applySavedTemplate(tpl.id); });

    // Right-click \u2192 owner actions menu (incl. "Toplulukla payla\u015F", P13)
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (typeof _ccShowCardMenu === 'function') _ccShowCardMenu(e, tpl);
    });

    container.appendChild(card);
  });
}

function showCategoryGrid(containerId) {
  renderTemplateCategoryCards(containerId);
}

/* ===================================================================
   COMMAND RAIL — Post templates panel (search/command bar + chips +
   vertical category SECTIONS over the real template cards; no folder
   dives). Reuses PRODUCT_TYPES, getTemplatesForProduct, reg.thumb
   (preview) / confirmAndApplyTemplate (apply), getSavedTemplates, and
   the scene helpers (_scEnterInfinite/_scExitToSingle/_scAddTemplateFrame).
   renderTemplateCategoryCards() delegates here, so every caller (openFlyout,
   save-refresh, brand/profiles, the renderTemplatesPanel dispatch) gets it.
   =================================================================== */
var _crCat = 'all';   // active filter: 'all' | productType | 'saved'
var _crExpanded = {};         // accordion open-state per category
var _crExpandedInit = false;  // first render defaults the first category open
var CR_ORDER = ['card', 'logo', 'cv', 'invoice', 'socialPost', 'story', 'banner', 'emailHeader'];

function _crIcon(name, size) { return (typeof getIcon === 'function') ? getIcon(name, size || 16) : ''; }

// human orientation label for a template size
function _crFmt(w, h) { return (w > h) ? 'Horizontal' : ((w < h) ? 'Vertical' : 'Square'); }

// Hover overlay: name + sub (size·format, or author) rise from a bottom scrim, with an optional
// "Kullan" action. Everything is hidden at rest and revealed on card hover (see .cr-scrim CSS).
function _crScrim(name, sub, withUse) {
  var scrim = document.createElement('div'); scrim.className = 'cr-scrim';
  var txt = document.createElement('div'); txt.className = 'cr-ov-txt';
  var nm = document.createElement('div'); nm.className = 'cr-ov-name'; nm.textContent = name || '';
  txt.appendChild(nm);
  if (sub) { var sb = document.createElement('div'); sb.className = 'cr-ov-sub'; sb.textContent = sub; txt.appendChild(sb); }
  scrim.appendChild(txt);
  if (withUse) { var use = document.createElement('span'); use.className = 'cr-use'; use.textContent = 'Use'; scrim.appendChild(use); }
  return scrim;
}
function _crInfinite() {
  // pill flag (set BEFORE a scene page exists → lazy create on first add)
  if ((window.__ccCanvasMode || 'single') === 'infinite') return true;
  // OR already ON a scene page: the pill flag can lag the real page state (switching to a Canvas page
  // via the tabs doesn't re-sync __ccCanvasMode), and a template added on a scene page MUST become a
  // frame — not overwrite the whole canvas (owner bug 2026-07-13: "şablon ekleyince tüm arka plan değişiyor").
  try {
    var p = (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') ? pages[currentPageIndex] : null;
    if (p && p._productType === 'scene') return true;
  } catch (e) {}
  return false;
}
function _crSection() { var g = document.getElementById('flyout-tpl-grid'); return g ? (g.closest('.flyout-section') || g.parentNode) : null; }
function _crCatIcon(key) { return key === 'socialPost' ? 'social' : (key === 'emailHeader' ? 'email' : key); }

// Single/Infinite pill + helper line — injected once, right after #tpl-mode-switch (Post-only chrome)
function _crEnsureChrome() {
  var sect = _crSection(); if (!sect) return null;
  var bar = document.getElementById('cr-modebar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cr-modebar'; bar.className = 'cr-modebar';
    bar.innerHTML =
      '<div class="cr-pill" role="group" aria-label="Canvas mode">' +
        '<button type="button" class="cr-mode" data-mode="single">' + _crIcon('file', 14) + '<span>Single</span></button>' +
        '<button type="button" class="cr-mode" data-mode="infinite">' + _crIcon('layout-grid', 14) + '<span>Infinite</span></button>' +
      '</div>' +
      '<div class="cr-hint" hidden>' + _crIcon('plus', 13) + '<span>Click a template to <b>add it as a frame</b> on the canvas.</span></div>';
    var anchor = document.getElementById('tpl-mode-switch');
    if (anchor && anchor.parentNode === sect) sect.insertBefore(bar, anchor.nextSibling);
    else sect.insertBefore(bar, sect.firstChild);
    bar.querySelector('[data-mode="single"]').addEventListener('click', function () { if (_crInfinite() && typeof _scExitToSingle === 'function') _scExitToSingle(); });
    bar.querySelector('[data-mode="infinite"]').addEventListener('click', function () { if (!_crInfinite() && typeof _scEnterInfinite === 'function') _scEnterInfinite(); });
  }
  return bar;
}

function _crSyncChrome() {
  var isPost = (window.activeTemplateMode || 'post') === 'post';
  var bar = document.getElementById('cr-modebar');
  if (!bar && isPost) bar = _crEnsureChrome();
  if (!bar) return;
  bar.style.display = isPost ? '' : 'none';
  if (!isPost) return;
  var inf = _crInfinite();
  var s = bar.querySelector('[data-mode="single"]'), i = bar.querySelector('[data-mode="infinite"]');
  if (s) s.classList.toggle('on', !inf);
  if (i) i.classList.toggle('on', inf);
  var hint = bar.querySelector('.cr-hint'); if (hint) hint.hidden = !inf;
}

function _crHideChrome() { var bar = document.getElementById('cr-modebar'); if (bar) bar.style.display = 'none'; }

// category filter as a section-header-style bar: a title that's an inline dropdown of categories
function _crFilterLabel() {
  if (_crCat === 'all') return 'All templates';
  if (_crCat === 'saved') return 'My Templates';
  return (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[_crCat]) ? PRODUCT_TYPES[_crCat].label + ' templates' : 'Templates';
}
function _crFilterBar(c, containerId) {
  var bar = document.createElement('div'); bar.className = 'cr-filterbar';
  // LEFT: section-style title
  var title = document.createElement('div'); title.className = 'cr-fb-title';
  title.innerHTML = _crIcon('layout-grid', 14);
  var ts = document.createElement('span'); ts.textContent = 'Templates'; title.appendChild(ts);
  bar.appendChild(title);
  // RIGHT: category dropdown (shows the active filter; opens the category menu)
  var dd = document.createElement('div'); dd.className = 'cr-fb-dd';
  var trig = document.createElement('button'); trig.type = 'button'; trig.className = 'cr-fb-trigger';
  var tl = document.createElement('span'); tl.textContent = _crFilterLabel(); trig.appendChild(tl);
  trig.insertAdjacentHTML('beforeend', _crIcon('chevron-down', 13));
  dd.appendChild(trig);
  var menu = document.createElement('div'); menu.className = 'cr-dropdown'; menu.hidden = true;
  function item(id, label, star) {
    var it = document.createElement('button'); it.type = 'button'; it.className = 'cr-dd-item' + (_crCat === id ? ' on' : '');
    if (star) it.innerHTML = _crIcon('star', 13);
    it.appendChild(document.createTextNode(label));
    it.onclick = function (e) { e.stopPropagation(); _crCat = id; var s = document.getElementById('tpl-search-input'); if (s) s.value = ''; _crRenderPost(containerId, ''); };
    return it;
  }
  menu.appendChild(item('all', 'All templates'));
  CR_ORDER.forEach(function (k) { if (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[k]) menu.appendChild(item(k, PRODUCT_TYPES[k].label)); });
  menu.appendChild(item('saved', 'My Templates', true));
  dd.appendChild(menu);
  trig.onclick = function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; };
  bar.appendChild(dd);
  if (!_crFilterBar._bound) { _crFilterBar._bound = true; document.addEventListener('click', function () { var m = document.querySelector('.cr-dropdown'); if (m) m.hidden = true; }); }
  c.appendChild(bar);
}

function _crProductTemplates(k) {
  var tpls = (typeof getTemplatesForProduct === 'function') ? getTemplatesForProduct(k) : {};
  var keys = Object.keys(tpls).filter(function (key) { return tpls[key] && tpls[key].productType !== 'all'; });   // skip generic blank
  return { tpls: tpls, keys: keys };
}

function _crRenderPost(containerId, searchTerm) {
  var c = document.getElementById(containerId); if (!c) return;
  if (typeof TEMPLATE_REGISTRY === 'undefined') return;
  _crEnsureChrome(); _crSyncChrome();
  _crEnsureCommunity(containerId);   // load community templates (grouped by category) — P15
  var oldHeader = document.getElementById('tpl-cat-header'); if (oldHeader) oldHeader.remove();
  c.innerHTML = ''; c.className = 'cr-body';
  var q = String(searchTerm || '').trim().toLowerCase();

  var drill = (_crCat !== 'all' && !q);   // a category OR My Templates → focused drill-in (back + all cards)
  if (!drill) _crFilterBar(c, containerId);   // title + category dropdown (hidden inside a drill-in)

  if (q) { _crRenderSearch(c, q); return; }
  if (drill) {
    if (_crCat === 'saved') _crRenderSavedDrill(c, containerId);   // My Templates drill (back + all saved)
    else _crRenderCategoryView(c, _crCat, containerId);            // category drill (back + all cards)
    return;
  }

  _crRenderSavedAccordion(c, containerId);   // My Templates as an accordion (default open)
  if (!_crExpandedInit) { _crExpandedInit = true; CR_ORDER.forEach(function (k) { _crExpanded[k] = true; }); }   // all categories open by default
  CR_ORDER.forEach(function (k) {
    var cfg = (typeof PRODUCT_TYPES !== 'undefined') ? PRODUCT_TYPES[k] : null; if (!cfg) return;
    var pt = _crProductTemplates(k); if (!pt.keys.length) return;
    _crRenderSection(c, cfg, k, pt.keys, pt.tpls, containerId);   // accordion (chevron toggle; "See all" on header → drill-in)
  });
}

function _crSectionHead(label, iconKey, rightLabel, onMore) {
  var head = document.createElement('div'); head.className = 'cr-sec';
  var l = document.createElement('div'); l.className = 'cr-sec-l';
  l.innerHTML = _crIcon(iconKey || 'folder', 14);
  var sp = document.createElement('span'); sp.textContent = label; l.appendChild(sp);
  head.appendChild(l);
  if (rightLabel) {
    var more = document.createElement('button'); more.type = 'button'; more.className = 'cr-sec-more';
    more.appendChild(document.createTextNode(rightLabel)); more.insertAdjacentHTML('beforeend', _crIcon('chevron-right', 13));
    if (onMore) more.onclick = onMore;
    head.appendChild(more);
  }
  return head;
}

// add prev/next nav arrows to a horizontal slider — fade in on hover; prev only once scrolled right.
function _crSliderNav(wrap, slider) {
  var prev = document.createElement('button'); prev.type = 'button'; prev.className = 'cr-slider-nav prev'; prev.innerHTML = _crIcon('chevron-left', 16);
  var next = document.createElement('button'); next.type = 'button'; next.className = 'cr-slider-nav next'; next.innerHTML = _crIcon('chevron-right', 16);
  function upd() {
    var max = slider.scrollWidth - slider.clientWidth;
    var canScroll = slider.scrollWidth > slider.clientWidth + 4;
    prev.classList.toggle('show', canScroll && slider.scrollLeft > 4);
    next.classList.toggle('show', canScroll && slider.scrollLeft < max - 4);
  }
  prev.onclick = function (e) { e.stopPropagation(); slider.scrollBy({ left: -slider.clientWidth * 0.85, behavior: 'smooth' }); };
  next.onclick = function (e) { e.stopPropagation(); slider.scrollBy({ left: slider.clientWidth * 0.85, behavior: 'smooth' }); };
  slider.addEventListener('scroll', upd);
  wrap.appendChild(prev); wrap.appendChild(next);
  setTimeout(upd, 40);
}

function _crRenderSection(c, cfg, productType, keys, tpls, containerId) {
  var open = !!_crExpanded[productType];
  var community = _crCommunityForCat(cfg.label);   // shared templates tagged with this category
  var head = document.createElement('div'); head.className = 'cr-acc-head' + (open ? ' open' : '');
  head.innerHTML = _crIcon('chevron-down', 14);   // chevron toggles the accordion preview
  var t = document.createElement('span'); t.className = 'cr-acc-title'; t.textContent = cfg.label; head.appendChild(t);
  // "See all (N)" on EVERY category header (right) → enters that category (drill-in), like My Templates.
  var sa = document.createElement('button'); sa.type = 'button'; sa.className = 'cr-sec-more';
  sa.appendChild(document.createTextNode('See all (' + (keys.length + community.length) + ')'));
  sa.insertAdjacentHTML('beforeend', _crIcon('chevron-right', 13));
  sa.onclick = function (e) { e.stopPropagation(); _crCat = productType; _crRenderPost(containerId, ''); };
  head.appendChild(sa);
  head.onclick = function () { _crExpanded[productType] = !_crExpanded[productType]; _crRenderPost(containerId, ''); };
  c.appendChild(head);
  if (!open) return;
  var wrap = document.createElement('div'); wrap.className = 'cr-slider-wrap';
  var grid = document.createElement('div'); grid.className = 'cr-slider';   // horizontal preview strip (2 visible)
  var aspect = cfg.h / cfg.w;
  keys.slice(0, 6).forEach(function (key) { grid.appendChild(_crTemplateCard(key, tpls[key], productType, cfg, aspect)); });   // built-in preview
  community.slice(0, 6).forEach(function (it) { grid.appendChild(_crCommunityCard(it)); });   // shared templates in this category
  wrap.appendChild(grid); _crSliderNav(wrap, grid);
  c.appendChild(wrap);
}

// focused category drill-in (the OLD "enter category" way): a back header + ALL of the category's cards
function _crRenderCategoryView(c, productType, containerId) {
  var cfg = (typeof PRODUCT_TYPES !== 'undefined') ? PRODUCT_TYPES[productType] : null;
  if (!cfg) { _crCat = 'all'; return; }
  var back = document.createElement('button'); back.type = 'button'; back.className = 'cr-back';
  back.innerHTML = _crIcon('chevron-left', 16);
  var bs = document.createElement('span'); bs.textContent = cfg.label; back.appendChild(bs);
  back.onclick = function () { _crCat = 'all'; _crRenderPost(containerId, ''); };
  c.appendChild(back);
  var pt = _crProductTemplates(productType);
  var grid = document.createElement('div'); grid.className = 'cr-grid';
  var aspect = cfg.h / cfg.w;
  pt.keys.forEach(function (key) { grid.appendChild(_crTemplateCard(key, pt.tpls[key], productType, cfg, aspect)); });
  _crCommunityForCat(cfg.label).forEach(function (it) { grid.appendChild(_crCommunityCard(it)); });   // shared templates in this category (P15)
  c.appendChild(grid);
}

function _crTemplateCard(key, reg, productType, cfg, aspect) {
  var card = document.createElement('div'); card.className = 'cr-card';
  var cvs = document.createElement('canvas'); cvs.className = 'cr-cvs';
  cvs.width = 240; cvs.height = Math.max(40, Math.round(240 * aspect));
  if (reg && typeof reg.thumb === 'function') { try { reg.thumb(cvs); } catch (e) {} }
  card.appendChild(cvs);                                   // design shown fully (contain) on the dot-grid mat
  card.appendChild(_crScrim((reg && reg.name) || key, cfg.w + '×' + cfg.h + ' · ' + _crFmt(cfg.w, cfg.h), true));
  card.addEventListener('click', function () { _crCardAction(key, productType, reg); });
  return card;
}

function _crCardAction(key, productType, reg) {
  if (_crInfinite()) {
    if (typeof _scAddTemplateFrame === 'function') _scAddTemplateFrame(key, productType);
  } else if (typeof confirmAndApplyTemplate === 'function') {
    confirmAndApplyTemplate(key, (reg && reg.productType) || productType);
  } else if (typeof applyTemplate === 'function') {
    applyTemplate(key);
  }
}

function _crNewTemplateCard() {
  var nw = document.createElement('div'); nw.className = 'cr-new';
  nw.innerHTML = _crIcon('plus', 18); var ns = document.createElement('span'); ns.textContent = 'New template'; nw.appendChild(ns);
  nw.onclick = function () { if (typeof saveAsTemplate === 'function') saveAsTemplate(); };
  return nw;
}

// Community templates (profiles-community-plan P15) — PUBLISHED shared templates are auto-placed into
// their assigned category sections (Business Card, Logo, …) alongside the built-in templates; there is
// NO separate "Topluluk" category. Loaded once and grouped by category; each card shows the author's
// name under the title. (Owner: shared designs fall into the category they were tagged with.)
var _crCommunityByCat = null;   // { "<category label>": [item, …] } once loaded
var _crCommunityLoading = false;   // kept: _crEnsureCommunity still clears it, and other code reads it

function _crEnsureCommunity(containerId) {
  /* COMMUNITY EDITION: no request, and deliberately no ad card either. Community templates are
     MERGED into the built-in category sections rather than living in a panel of their own, so with
     no server the Templates panel is not broken - it simply has the built-in templates and no
     shared ones. Locking a working panel behind a "sign up" card here would take away something
     that works offline. What is removed is the outbound call, because a build that promises zero
     network must not make one that is guaranteed to 404. */
  _crCommunityByCat = {};
  _crCommunityLoading = false;
  return;
}

function _crCommunityForCat(label) {
  return (_crCommunityByCat && _crCommunityByCat[label]) || [];
}

function _crCommunityCard(item) {
  var card = document.createElement('div'); card.className = 'cr-card cr-card-community';
  if (item.coverUrl) {
    var img = document.createElement('img'); img.className = 'cr-cvs'; img.src = item.coverUrl; img.alt = item.title || ''; img.loading = 'lazy';
    card.appendChild(img);                                 // shown fully (contain) on the dot-grid mat
  } else {
    var ph = document.createElement('div'); ph.className = 'cr-thumb-ph'; ph.textContent = 'No preview'; card.appendChild(ph);
  }
  var who = item.authorName || (item.authorHandle ? '@' + item.authorHandle : '');
  card.appendChild(_crScrim(item.title || 'Template', who, true));
  card.title = (item.title || '') + (who ? ' · ' + who : '');
  card.addEventListener('click', function () {
    var apply = function () { if (typeof _ccUseCommunityTemplate === 'function') _ccUseCommunityTemplate(item.id, _crInfinite()); };
    if (typeof showTemplatePreviewModal !== 'function') { apply(); return; }
    // preview modal WITH the community author profile card (owner: "topluluk ise kim yaptı göster")
    var uses = (item.uses != null) ? item.uses : (item.useCount != null ? item.useCount : (item.usageCount != null ? item.usageCount : (item.downloads != null ? item.downloads : null)));
    var chips = [];
    if (item.width && item.height) chips.push({ text: item.width + '×' + item.height, mono: true });
    if (item.category) chips.push({ text: item.category });
    var author = (item.authorName || item.authorHandle) ? { name: item.authorName || ('@' + item.authorHandle), handle: item.authorHandle, uses: uses } : null;
    showTemplatePreviewModal({
      coverUrl: item.coverUrl,
      title: item.title || 'Template',
      eyebrow: 'Community template' + ((item.width && item.height) ? (' · ' + _crFmt(item.width, item.height)) : ''),
      sizeText: (item.width && item.height) ? (item.width + '×' + item.height) : '',
      chips: chips,
      note: 'Opens in a new page, does not overwrite current work.',
      confirmLabel: 'Open in new page',
      author: author,
      onConfirm: apply
    });
  });
  return card;
}

// My Templates as an ACCORDION (chevron toggle, default open) — header "See all (N)" → drills into saved
function _crRenderSavedAccordion(c, containerId) {
  var saved = (typeof getSavedTemplates === 'function') ? getSavedTemplates() : [];
  var open = (_crExpanded['saved'] !== false);   // default open
  var head = document.createElement('div'); head.className = 'cr-acc-head' + (open ? ' open' : '');
  head.innerHTML = _crIcon('chevron-down', 14);
  var t = document.createElement('span'); t.className = 'cr-acc-title'; t.textContent = 'My Templates'; head.appendChild(t);
  if (saved.length) {
    var sa = document.createElement('button'); sa.type = 'button'; sa.className = 'cr-sec-more';
    sa.appendChild(document.createTextNode('See all (' + saved.length + ')'));
    sa.insertAdjacentHTML('beforeend', _crIcon('chevron-right', 13));
    sa.onclick = function (e) { e.stopPropagation(); _crCat = 'saved'; _crRenderPost(containerId, ''); };
    head.appendChild(sa);
  }
  head.onclick = function () { _crExpanded['saved'] = (_crExpanded['saved'] === false); _crRenderPost(containerId, ''); };
  c.appendChild(head);
  if (!open) return;
  var wrap = document.createElement('div'); wrap.className = 'cr-slider-wrap';
  var grid = document.createElement('div'); grid.className = 'cr-slider';   // horizontal preview strip (2 visible)
  grid.appendChild(_crNewTemplateCard());
  saved.slice(0, 5).forEach(function (tpl) { grid.appendChild(_crSavedCard(tpl)); });   // New + up to 5 preview
  wrap.appendChild(grid); _crSliderNav(wrap, grid);
  c.appendChild(wrap);
}

// My Templates DRILL-IN (back header + all saved cards), same as the category drill-in
function _crRenderSavedDrill(c, containerId) {
  var saved = (typeof getSavedTemplates === 'function') ? getSavedTemplates() : [];
  var back = document.createElement('button'); back.type = 'button'; back.className = 'cr-back';
  back.innerHTML = _crIcon('chevron-left', 16);
  var bs = document.createElement('span'); bs.textContent = 'My Templates'; back.appendChild(bs);
  back.onclick = function () { _crCat = 'all'; _crRenderPost(containerId, ''); };
  c.appendChild(back);
  var grid = document.createElement('div'); grid.className = 'cr-grid';
  grid.appendChild(_crNewTemplateCard());
  saved.forEach(function (tpl) { grid.appendChild(_crSavedCard(tpl)); });
  c.appendChild(grid);
}

function _crSavedCard(tpl) {
  var card = document.createElement('div'); card.className = 'cr-card cr-card-saved';
  if (tpl.thumb) { var img = document.createElement('img'); img.className = 'cr-cvs'; img.src = tpl.thumb; img.alt = tpl.name; card.appendChild(img); }
  else { var ph = document.createElement('div'); ph.className = 'cr-thumb-ph'; ph.textContent = 'No preview'; card.appendChild(ph); }
  // Share to community (P13) — sits left of the delete button; right-click opens the full menu too.
  var share = document.createElement('button'); share.type = 'button'; share.className = 'cr-share'; share.setAttribute('aria-label', 'Share with community'); share.title = 'Share with community'; share.innerHTML = _crIcon('share-2', 14);
  share.addEventListener('click', function (e) { e.stopPropagation(); if (typeof shareSavedTemplate === 'function') shareSavedTemplate(tpl.id); });
  card.appendChild(share);
  var del = document.createElement('button'); del.type = 'button'; del.className = 'cr-del'; del.setAttribute('aria-label', 'Delete'); del.innerHTML = _crIcon('trash', 13);
  card.appendChild(del);
  if (tpl.sharedTemplateId) {
    var sbg = document.createElement('div');
    var pend = (tpl.sharedStatus !== 'published');
    sbg.className = 'cr-shared-badge' + (pend ? ' pending' : '');
    sbg.textContent = pend ? 'Onay bekliyor' : 'Published';
    card.appendChild(sbg);
  }
  var sub = (tpl.canvasWidth && tpl.canvasHeight) ? (tpl.canvasWidth + '×' + tpl.canvasHeight + ' · ' + _crFmt(tpl.canvasWidth, tpl.canvasHeight)) : '';
  card.appendChild(_crScrim(tpl.name, sub, false));
  del.addEventListener('click', function (e) { e.stopPropagation(); if (typeof deleteSavedTemplate === 'function') deleteSavedTemplate(tpl.id); });
  card.addEventListener('click', function () {
    var apply = function () {
      if (_crInfinite() && typeof _scAddSavedFrame === 'function') _scAddSavedFrame(tpl);
      else if (typeof applySavedTemplate === 'function') applySavedTemplate(tpl.id);
    };
    if (typeof showTemplatePreviewModal !== 'function') { apply(); return; }
    // A saved template NEVER overwrites the current page: on an infinite canvas it lands as a new
    // frame, everywhere else applySavedTemplate opens a new page at the template's own size
    // (owner 2026-07-24 — the modal used to offer "Replace").
    var asFrame = _crInfinite();
    var w = tpl.canvasWidth, h = tpl.canvasHeight;
    var chips = [];
    if (w && h) chips.push({ text: w + '×' + h, mono: true });
    if (tpl.sharedTemplateId) chips.push({ text: (tpl.sharedStatus === 'published') ? 'Published' : 'Onay bekliyor' });
    showTemplatePreviewModal({
      coverUrl: tpl.thumb,
      title: tpl.name || 'My Template',
      eyebrow: 'My Template' + ((w && h) ? (' · ' + _crFmt(w, h)) : ''),
      sizeText: (w && h) ? (w + '×' + h) : '',
      chips: chips,
      note: asFrame ? 'Added as a new frame on the infinite canvas, does not overwrite current work.'
                    : 'Opens in a new page at its own size, does not overwrite current work.',
      confirmLabel: asFrame ? 'Add as frame' : 'Open in new page',
      onConfirm: apply
    });
  });
  // Right-click → owner actions menu (Uygula / Yeniden adlandır / Dışa aktar / Toplulukla paylaş / Sil)
  card.addEventListener('contextmenu', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (typeof _ccShowCardMenu === 'function') _ccShowCardMenu(e, tpl);
  });
  return card;
}

function _crRenderSearch(c, q) {
  var grid = document.createElement('div'); grid.className = 'cr-grid'; var any = false;
  CR_ORDER.forEach(function (k) {
    var cfg = (typeof PRODUCT_TYPES !== 'undefined') ? PRODUCT_TYPES[k] : null; if (!cfg) return;
    var pt = _crProductTemplates(k);
    pt.keys.forEach(function (key) {
      var reg = pt.tpls[key];
      var hay = (((reg && reg.name) || '') + ' ' + ((reg && reg.category) || '') + ' ' + cfg.label).toLowerCase();
      if (hay.indexOf(q) === -1) return;
      any = true; grid.appendChild(_crTemplateCard(key, reg, k, cfg, cfg.h / cfg.w));
    });
  });
  if (!any) { var e = document.createElement('div'); e.className = 'cr-empty'; e.textContent = 'No templates match your search.'; c.appendChild(e); return; }
  c.appendChild(grid);
}

// ────────────────────────────────────────────────────────────────
//  SAVED (USER) TEMPLATES  –  IndexedDB storage (large data safe)
// ────────────────────────────────────────────────────────────────

var SAVED_TEMPLATES_KEY = 'dika_saved_templates';
var _TPLDB_NAME = 'DikaTemplatesDB';
var _TPLDB_STORE = 'templates';
var _TPLDB_VERSION = 1;
var _tplDbCache = null;        // in-memory cache (array)
var _tplDbReady = false;


if (window.cc && cc.modules) cc.modules.register({ id: 'renderer', parent: 'left-panel.templates', title: 'Templates: renderer', mount: function () {}, unmount: function () {} });
