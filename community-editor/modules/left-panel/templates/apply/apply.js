/* templates/apply — APPLY a template to the canvas. Split from the 3107-line templates.js (decomposition).
   FLAT sub-module: its functions stay window globals (the panel/boot/each other call them at runtime,
   so load order among siblings is irrelevant). Registers under left-panel.templates for fault isolation. */

function applyTemplate(name) {
  // Board mode: never replace the board — open the template on a new normal page.
  // (Direct callers like the AI skill and wizard bypass confirmAndApplyTemplate's board guard.)
  if (typeof window !== 'undefined' && window.wbActive) {
    var _tplReg = TEMPLATE_REGISTRY[name];
    if (!_tplReg) return;
    if (typeof showToast === 'function') showToast('You are in Board mode — template opens in a new page.', 'info');
    if (typeof addPage === 'function') addPage(undefined, _tplReg.w || 700, _tplReg.h || 400);
    if (window.wbActive) return; // addPage didn't exit board mode — bail rather than wipe the board
    applyTemplate(name);
    return;
  }
  // On video pages: create a new page and apply template there
  var curPage = (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') ? pages[currentPageIndex] : null;
  if (curPage && curPage._productType === 'video') {
    var reg = TEMPLATE_REGISTRY[name];
    if (!reg) return;
    if (typeof showToast === 'function') showToast('You are in Video mode — template opens in a new page.', 'info');
    // Save current video page, create a new non-video page
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    var newW = reg.w || 700;
    var newH = reg.h || 400;
    pages.push({ json: null, bg: '#ffffff', label: reg.name || ('Page ' + (pages.length + 1)), w: newW, h: newH, _productType: 'card' });
    if (typeof switchPage === 'function') switchPage(pages.length - 1);
    // Now apply template on the new page (after switchPage settles)
    setTimeout(function() { applyTemplate(name); }, 100);
    return;
  }
  var reg = TEMPLATE_REGISTRY[name];
  if (!reg) return;
  // Sync CW/CH to the current page BEFORE rendering, so template objects scale to the page —
  // not a stale/video canvas size left over from another mode (caused white bg + off-canvas layout).
  var _apg = (typeof pages !== 'undefined' && pages[currentPageIndex]) ? pages[currentPageIndex] : null;
  if (_apg && _apg.w && _apg.h && (CW !== _apg.w || CH !== _apg.h)) {
    CW = _apg.w; CH = _apg.h;
    if (canvas.setWidth) { canvas.setWidth(CW); canvas.setHeight(CH); }
    if (typeof applyView === 'function') applyView();
  }
  var coedit = window.CCCoEdit;
  var structural = !!(coedit && coedit.beginStructural && coedit.beginStructural());
  histLocked = true;
  canvas.clear();
  reg.fn();

  // Apply active brand set colours/font to the newly rendered template
  if (typeof getActiveBrandSet === 'function') {
    var brand = getActiveBrandSet();
    if (brand) {
      canvas.getObjects().forEach(function(obj) {
        // Text
        if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
          if (obj.fill !== '#FFFFFF' && obj.fill !== 'white' && obj.fill !== '#fff') {
            obj.set('fill', brand.colors.text);
          }
          if (brand.font.family) obj.set('fontFamily', brand.font.family);
        }
        // Groups (wireframe templates)
        if (obj.type === 'group' && obj._objects) {
          obj._objects.forEach(function(child) {
            if (child.type === 'i-text' || child.type === 'text' || child.type === 'textbox') {
              if (child.fill !== '#FFFFFF' && child.fill !== 'white' && child.fill !== '#fff') {
                child.set('fill', brand.colors.text);
              }
              if (brand.font.family) child.set('fontFamily', brand.font.family);
            }
          });
          obj.dirty = true;
        }
      });
    }
  }

  canvas.renderAll();
  histLocked = false;
  if (structural) coedit.endStructural();
  setTimeout(snap, 120);
}


// ────────────────────────────────────────────────────────────────
//  CONFIRM + APPLY TEMPLATE (flyout only, not wizard)
// ────────────────────────────────────────────────────────────────

function confirmAndApplyTemplate(key, productType) {
  var currentProduct = (typeof activeProduct !== 'undefined') ? activeProduct : 'card';
  var reg = TEMPLATE_REGISTRY[key];
  if (!reg) return;
  var currentPage = (typeof pages !== 'undefined' && pages[currentPageIndex]) ? pages[currentPageIndex] : null;

  /* Board mode: never replace the board page — always add a normal-sized page and apply there.
     Show a confirmation popup first so the user is aware. */
  if (window.wbActive) {
    var tplPt = (productType && productType !== 'all') ? productType : currentProduct;
    var cfg = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[tplPt]) ? PRODUCT_TYPES[tplPt] : null;
    var newW = (cfg && cfg.w) ? cfg.w : CW;
    var newH = (cfg && cfg.h) ? cfg.h : CH;
    var cross = productType && productType !== 'all' && productType !== currentProduct;
    var m1 = _tplModalCommon(key, reg, productType);
    m1.note = 'You are in Board mode — template <b>opens in a new page</b>.';
    m1.confirmLabel = 'Open in new page';
    m1.onConfirm = function () {
      if (typeof addPage === 'function') addPage(undefined, newW, newH);
      if (cross && typeof setProductType === 'function') setProductType(productType);
      applyTemplate(key);
      selectedTpl = key;
    };
    showTemplatePreviewModal(m1);
    return;
  }

  // Video mode: never apply onto the video page — open the template in a new normal page
  // sized to the template's product (not the video canvas), letting its own background apply.
  var _vidActive = (currentPage && currentPage._productType === 'video') ||
                   (typeof VideoCanvas !== 'undefined' && VideoCanvas.isActive && VideoCanvas.isActive());
  if (_vidActive) {
    var _vTplPt = (productType && productType !== 'all') ? productType : currentProduct;
    if (_vTplPt === 'video') _vTplPt = 'card';
    var _vCfg = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[_vTplPt]) ? PRODUCT_TYPES[_vTplPt] : null;
    var _vW = (_vCfg && _vCfg.w) ? _vCfg.w : 700;
    var _vH = (_vCfg && _vCfg.h) ? _vCfg.h : 400;
    var m2 = _tplModalCommon(key, reg, _vTplPt);
    m2.note = 'You are in Video mode — template <b>opens in a new page</b>.';
    m2.confirmLabel = 'Open in new page';
    m2.onConfirm = function () {
      if (typeof addPage === 'function') addPage(undefined, _vW, _vH);
      if (typeof setProductType === 'function') setProductType(_vTplPt);
      applyTemplate(key);
      selectedTpl = key;
    };
    showTemplatePreviewModal(m2);
    return;
  }

  if (currentPage && typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(currentPage)) {
    var m3 = _tplModalCommon(key, reg, productType);
    m3.note = 'This slide page will be converted to a normal page, <b>the existing slide design will change</b>.';
    m3.confirmLabel = 'Convert and apply';
    m3.onConfirm = function () {
      if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
      if (typeof convertSlidePageToNormalPage === 'function') convertSlidePageToNormalPage(currentPage);
      if (productType && productType !== 'all' && typeof setProductType === 'function') setProductType(productType);
      applyTemplate(key);
      selectedTpl = key;
      if (typeof renderPageTabs === 'function') renderPageTabs();
      if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
    };
    showTemplatePreviewModal(m3);
    return;
  }

  if (productType && productType !== 'all' && productType !== currentProduct) {
    // Cancel means CANCEL \u2014 nothing may change (owner bug report 2026-07-11): the modal's
    // confirm is the ONLY path that applies; \u0130ptal / backdrop / Esc just close.
    var m4 = _tplModalCommon(key, reg, productType);
    m4.note = 'This template <b>opens in a new page</b>, and does not overwrite the current work.';
    m4.confirmLabel = 'Open in new page';
    m4.onConfirm = function () {
      // Create the new page at the TARGET size FIRST (saving the current page at its OWN size),
      // then switch product type. The old order (setProductType before addPage) resized the CURRENT
      // page to the new template's size — so opening an email template shrank/grew the social-post
      // page still open in the previous tab (owner bug). addPage first keeps each page its own size.
      var _c4 = (typeof PRODUCT_TYPES !== 'undefined') ? PRODUCT_TYPES[productType] : null;
      if (typeof addPage === 'function') addPage(undefined, _c4 ? _c4.w : undefined, _c4 ? _c4.h : undefined);
      if (typeof setProductType === 'function') setProductType(productType);
      applyTemplate(key); selectedTpl = key;
    };
    showTemplatePreviewModal(m4);
  } else {
    var m5 = _tplModalCommon(key, reg, productType);
    m5.note = 'The current work <b>will be overwritten</b>.';
    m5.confirmLabel = 'Replace';
    m5.onConfirm = function () { applyTemplate(key); selectedTpl = key; };
    showTemplatePreviewModal(m5);
  }
}

// Build the shared preview-modal fields (title / size / eyebrow / chips) for a built-in template.
function _tplModalCommon(key, reg, productType) {
  var currentProduct = (typeof activeProduct !== 'undefined') ? activeProduct : 'card';
  var pt = (productType && productType !== 'all') ? productType : currentProduct;
  var cfg = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[pt]) ? PRODUCT_TYPES[pt] : null;
  var w = (cfg && cfg.w) || (typeof CW !== 'undefined' ? CW : 700);
  var h = (cfg && cfg.h) || (typeof CH !== 'undefined' ? CH : 400);
  var label = (cfg && cfg.label) || '';
  var fmt = (typeof _crFmt === 'function') ? _crFmt(w, h) : '';
  return {
    key: key, w: w, h: h, sizeText: w + '×' + h,
    title: (reg && reg.name) || key,
    eyebrow: label ? (label + ' · ' + fmt) : fmt,
    chips: [{ text: w + '×' + h, mono: true }].concat(label ? [{ text: label }] : [])
  };
}

/* Rich template-preview confirm modal — replaces the plain showCustomConfirm for "apply template".
   opts: { key|coverUrl, w, h, sizeText, title, eyebrow, chips:[{text,mono}], note(HTML ok),
           confirmLabel, onConfirm, onCancel, author:{name,handle,uses} }
   Built-in templates render via reg.thumb(canvas); community templates pass a coverUrl + author. */
function showTemplatePreviewModal(opts) {
  opts = opts || {};
  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  var I_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>';
  var I_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var I_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var chipsHtml = (opts.chips || []).map(function (c) { return '<span class="ctpm-chip' + (c.mono ? ' mono' : '') + '">' + esc(c.text) + '</span>'; }).join('');
  var authorHtml = '';
  if (opts.author && opts.author.name) {
    var initial = esc((String(opts.author.name).charAt(0) || '?').toUpperCase());
    var usesTxt = (opts.author.uses != null) ? (opts.author.uses + ' usage') : 'Not used yet';
    authorHtml =
      '<div class="ctpm-author">' +
        '<div class="ctpm-av">' + initial + '</div>' +
        '<div class="ctpm-au-txt"><div class="ctpm-au-name">' + esc(opts.author.name) + '</div>' +
          (opts.author.handle ? '<div class="ctpm-au-link" data-profile="1">View profile</div>' : '') + '</div>' +
        '<span class="ctpm-au-use">' + I_DL + esc(usesTxt) + '</span>' +
      '</div>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'ctpm-overlay';
  overlay.innerHTML =
    '<div class="ctpm-modal" role="dialog" aria-modal="true">' +
      '<div class="ctpm-pv"><div class="ctpm-pv-box"></div>' +
        (opts.sizeText ? '<span class="ctpm-pv-chip">' + esc(opts.sizeText) + '</span>' : '') + '</div>' +
      '<div class="ctpm-info">' +
        '<div class="ctpm-top"><div class="ctpm-top-txt">' +
          (opts.eyebrow ? '<div class="ctpm-eyebrow">' + esc(opts.eyebrow) + '</div>' : '') +
          '<h2 class="ctpm-title">' + esc(opts.title || 'Template') + '</h2></div>' +
          '<button class="ctpm-close" aria-label="Close">' + I_X + '</button></div>' +
        (chipsHtml ? '<div class="ctpm-chips">' + chipsHtml + '</div>' : '') +
        '<div class="ctpm-spacer"></div>' +
        (opts.note ? '<div class="ctpm-note">' + I_INFO + '<p>' + opts.note + '</p></div>' : '') +
        '<div class="ctpm-actions">' +
          '<button class="ctpm-btn ctpm-ghost">Cancel</button>' +
          '<button class="ctpm-btn ctpm-primary">' + esc(opts.confirmLabel || 'Use') + '</button></div>' +
        authorHtml +
      '</div></div>';
  document.body.appendChild(overlay);

  var box = overlay.querySelector('.ctpm-pv-box');
  if (opts.coverUrl) {
    var img = document.createElement('img'); img.className = 'ctpm-pv-img'; img.src = opts.coverUrl; img.alt = opts.title || ''; box.appendChild(img);
  } else if (opts.key && typeof TEMPLATE_REGISTRY !== 'undefined' && TEMPLATE_REGISTRY[opts.key] && typeof TEMPLATE_REGISTRY[opts.key].thumb === 'function') {
    var a = (opts.w && opts.h) ? (opts.h / opts.w) : 1;
    var cvs = document.createElement('canvas'); cvs.className = 'ctpm-pv-img';
    cvs.width = 520; cvs.height = Math.max(80, Math.round(520 * a));
    try { TEMPLATE_REGISTRY[opts.key].thumb(cvs); } catch (e) {}
    box.appendChild(cvs);
  }

  function close(cb) { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); document.removeEventListener('keydown', onKey); if (typeof cb === 'function') cb(); }
  function onKey(e) { if (e.key === 'Escape') close(opts.onCancel); }
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.ctpm-close').onclick = function () { close(opts.onCancel); };
  overlay.querySelector('.ctpm-ghost').onclick = function () { close(opts.onCancel); };
  overlay.querySelector('.ctpm-primary').onclick = function () { close(opts.onConfirm); };
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(opts.onCancel); });
  var prof = overlay.querySelector('[data-profile]');
  if (prof && opts.author && opts.author.handle) {
    prof.onclick = function (e) { e.stopPropagation(); try { window.open('/u/' + encodeURIComponent(opts.author.handle), '_blank'); } catch (er) {} };
  }
}

// ────────────────────────────────────────────────────────────────
//  RENDER TEMPLATE GRID
// ────────────────────────────────────────────────────────────────


if (window.cc && cc.modules) cc.modules.register({ id: 'apply', parent: 'left-panel.templates', title: 'Templates: apply', mount: function () {}, unmount: function () {} });
