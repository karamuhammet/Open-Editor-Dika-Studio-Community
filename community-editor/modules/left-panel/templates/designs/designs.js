/* templates/designs — template DESIGNS (tpl... / drawThumb... / invoice builders) + TEMPLATE_REGISTRY/CATEGORIES — the data. Split from the 3107-line templates.js (decomposition).
   FLAT sub-module: its functions stay window globals (the panel/boot/each other call them at runtime,
   so load order among siblings is irrelevant). Registers under left-panel.templates for fault isolation. */

// ================================================================
//  templates.js — dika studio Business Card Maker Template Module
//  Depends on globals: canvas, CW, CH, userInfo, selectedTpl,
//                      add(), snap(), generateQRImage()
// ================================================================

// ────────────────────────────────────────────────────────────────
//  BLANK CANVAS
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  ORIGINAL 6 TEMPLATES
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  NEW 8 TEMPLATES
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  6 PROFESSIONAL TEMPLATES
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  THUMBNAIL DRAWING FUNCTIONS
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  BLANK GENERIC TEMPLATE (all product types)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  LOGO TEMPLATES (500×500)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  CV TEMPLATES (595×842)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  SOCIAL POST TEMPLATES (1080×1080)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  STORY TEMPLATES (1080×1920)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  BANNER TEMPLATES (1200×628)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  EMAIL HEADER TEMPLATES (600×200)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  INVOICE TEMPLATES (595×842)
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
//  TEMPLATE REGISTRY
// ────────────────────────────────────────────────────────────────

var TEMPLATE_REGISTRY = {};
// deferred (decomposition): the entries below reference functions that now live in sibling
// children (loaded after this parent); populate the same object once all sub-modules are ready.
(function () {
  function _build() { var _R = {
  // ── Business Card templates ──
  blank:            { fn: tplBlank,           name: 'Blank Canvas', category: 'Simple Professional',  thumb: drawThumbBlank,           productType: 'card' },
  noir:             { fn: tplNoir,            name: 'Noir',         category: 'Modern Corporate',     thumb: drawThumbNoir,            productType: 'card' },
  studio:           { fn: tplStudio,          name: 'Studio',       category: 'Simple Professional',  thumb: drawThumbStudio,          productType: 'card' },
  bold:             { fn: tplBold,            name: 'Bold',         category: 'Modern Corporate',     thumb: drawThumbBold,            productType: 'card' },
  arch:             { fn: tplArch,            name: 'Architect',    category: 'Geometric Shapes',     thumb: drawThumbArch,            productType: 'card' },
  minimal:          { fn: tplMinimal,         name: 'Minimal',      category: 'Simple Professional',  thumb: drawThumbMinimal,         productType: 'card' },
  luxe:             { fn: tplLuxe,            name: 'Luxe',         category: 'Modern Corporate',     thumb: drawThumbLuxe,            productType: 'card' },
  techCircuit:      { fn: tplTechCircuit,     name: 'Tech Circuit', category: 'Technology / Digital', thumb: drawThumbTechCircuit,     productType: 'card' },
  organicBlob:      { fn: tplOrganicBlob,     name: 'Organic',      category: 'Modern Corporate',     thumb: drawThumbOrganicBlob,     productType: 'card' },
  floralElegant:    { fn: tplFloralElegant,   name: 'Floral',       category: 'Simple Professional',  thumb: drawThumbFloralElegant,   productType: 'card' },
  restaurant:       { fn: tplRestaurant,      name: 'Restaurant',   category: 'Restaurant',           thumb: drawThumbRestaurant,      productType: 'card' },
  loyaltyCard:      { fn: tplLoyaltyCard,     name: 'Loyalty',      category: 'Restaurant',           thumb: drawThumbLoyaltyCard,     productType: 'card' },
  corporateModern:  { fn: tplCorporateModern, name: 'Corporate',    category: 'Modern Corporate',     thumb: drawThumbCorporateModern, productType: 'card' },
  qrFocus:          { fn: tplQRFocus,         name: 'QR Focus',     category: 'Technology / Digital', thumb: drawThumbQRFocus,         productType: 'card' },
  socialMedia:      { fn: tplSocialMedia,     name: 'Social',       category: 'Technology / Digital', thumb: drawThumbSocialMedia,     productType: 'card' },
  executive:        { fn: tplExecutive,       name: 'Executive',    category: 'Corporate',            thumb: drawThumbExecutive,       productType: 'card' },
  redwave:          { fn: tplRedwave,         name: 'Red Wave',     category: 'Modern',               thumb: drawThumbRedwave,         productType: 'card' },
  darkgold:         { fn: tplDarkgold,        name: 'Dark Gold',    category: 'Luxury',               thumb: drawThumbDarkgold,        productType: 'card' },
  navywhite:        { fn: tplNavywhite,       name: 'Navy White',   category: 'Corporate',            thumb: drawThumbNavywhite,       productType: 'card' },
  bwmodern:         { fn: tplBwmodern,        name: 'BW Modern',    category: 'Minimal',              thumb: drawThumbBwmodern,        productType: 'card' },
  slategray:        { fn: tplSlategray,       name: 'Slate Gray',   category: 'Corporate',            thumb: drawThumbSlategray,       productType: 'card' },

  // ── Generic blank (all product types) ──
  blankGeneric:     { fn: tplBlankGeneric,    name: 'Blank',        category: 'Simple',               thumb: drawThumbBlankGeneric,    productType: 'all' },

  // ── Logo templates ──
  logoMinimal:      { fn: tplLogoMinimal,     name: 'Minimal',      category: 'Logo',                 thumb: drawThumbLogoMinimal,     productType: 'logo' },
  logoMonogram:     { fn: tplLogoMonogram,    name: 'Monogram',     category: 'Logo',                 thumb: drawThumbLogoMonogram,    productType: 'logo' },
  logoBadge:        { fn: tplLogoBadge,       name: 'Badge',        category: 'Logo',                 thumb: drawThumbLogoBadge,       productType: 'logo' },
  logoModern:       { fn: tplLogoModern,      name: 'Modern',       category: 'Logo',                 thumb: drawThumbLogoModern,      productType: 'logo' },

  // ── CV templates ──
  cvClean:          { fn: tplCvClean,         name: 'Clean',        category: 'CV',                   thumb: drawThumbCvClean,         productType: 'cv' },
  cvModern:         { fn: tplCvModern,        name: 'Modern',       category: 'CV',                   thumb: drawThumbCvModern,        productType: 'cv' },
  cvMinimal:        { fn: tplCvMinimal,       name: 'Minimal',      category: 'CV',                   thumb: drawThumbCvMinimal,       productType: 'cv' },

  // ── Invoice templates ──
  invoiceUsClean:   { fn: tplInvoiceUsClean,  name: 'US Clean',     category: 'Invoice',              thumb: drawThumbInvoiceUsClean,  productType: 'invoice' },
  invoiceUkVat:     { fn: tplInvoiceUkVat,    name: 'UK VAT',       category: 'Invoice',              thumb: drawThumbInvoiceUkVat,    productType: 'invoice' },
  invoiceEuModern:  { fn: tplInvoiceEuModern, name: 'EU Modern',    category: 'Invoice',              thumb: drawThumbInvoiceEuModern, productType: 'invoice' },

  // ── Social Post templates ──
  socialQuote:      { fn: tplSocialQuote,     name: 'Quote',        category: 'Social',               thumb: drawThumbSocialQuote,     productType: 'socialPost' },
  socialPromo:      { fn: tplSocialPromo,     name: 'Promo',        category: 'Social',               thumb: drawThumbSocialPromo,     productType: 'socialPost' },
  socialMinimal:    { fn: tplSocialMinimal,   name: 'Minimal',      category: 'Social',               thumb: drawThumbSocialMinimal,   productType: 'socialPost' },

  // ── Story templates ──
  storyGradient:    { fn: tplStoryGradient,   name: 'Gradient',     category: 'Story',                thumb: drawThumbStoryGradient,   productType: 'story' },
  storyBold:        { fn: tplStoryBold,       name: 'Bold',         category: 'Story',                thumb: drawThumbStoryBold,       productType: 'story' },

  // ── Banner templates ──
  bannerClean:      { fn: tplBannerClean,     name: 'Clean',        category: 'Banner',               thumb: drawThumbBannerClean,     productType: 'banner' },
  bannerBold:       { fn: tplBannerBold,      name: 'Bold',         category: 'Banner',               thumb: drawThumbBannerBold,      productType: 'banner' },

  // ── Email templates (full email bodies, 600×900) ──
  emailNewsletter:  { fn: tplEmailNewsletter, name: 'Newsletter',   category: 'Email',                thumb: drawThumbEmailNewsletter, productType: 'emailHeader' },
  emailPromo:       { fn: tplEmailPromo,      name: 'Promo Sale',   category: 'Email',                thumb: drawThumbEmailPromo,      productType: 'emailHeader' },
  emailWelcome:     { fn: tplEmailWelcome,    name: 'Welcome',      category: 'Email',                thumb: drawThumbEmailWelcome,    productType: 'emailHeader' },
  emailAnnounce:    { fn: tplEmailAnnounce,   name: 'Announcement', category: 'Email',                thumb: drawThumbEmailAnnounce,   productType: 'emailHeader' },
  emailCorporate:   { fn: tplEmailCorporate,  name: 'Corporate',    category: 'Email',                thumb: drawThumbEmailCorporate,  productType: 'emailHeader' }
}; for (var _k in _R) TEMPLATE_REGISTRY[_k] = _R[_k];
    // registry is now populated → re-render the templates panel. First-paint (index.html boot) can run
    // BEFORE modules:ready with an empty registry, leaving the Post cards blank until a tab/mode switch.
    if (typeof renderTemplatesPanel === 'function' && document.getElementById('flyout-tpl-grid')) {
      try { renderTemplatesPanel('flyout-tpl-grid', (document.getElementById('tpl-search-input') || {}).value || ''); } catch (e) {}
    }
  }
  if (window.cc && cc.on) cc.on('modules:ready', _build); else _build();
})();

var TEMPLATE_CATEGORIES = ['All', 'Modern Corporate', 'Technology / Digital', 'Simple Professional', 'Geometric Shapes', 'Restaurant', 'Corporate', 'Modern', 'Luxury', 'Minimal', 'Logo', 'CV', 'Invoice', 'Social', 'Story', 'Banner', 'Email'];

function getTemplatesForProduct(productType) {
  var result = {};
  for (var key in TEMPLATE_REGISTRY) {
    var tpl = TEMPLATE_REGISTRY[key];
    if (tpl.productType === productType || tpl.productType === 'all') {
      result[key] = tpl;
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
//  APPLY TEMPLATE
// ────────────────────────────────────────────────────────────────

if (window.cc && cc.modules) cc.modules.register({ id: 'designs', parent: 'left-panel.templates', title: 'Templates: designs', mount: function () {}, unmount: function () {} });
