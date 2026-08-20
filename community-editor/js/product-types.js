/* ============================================================
   dika studio – Product Types Configuration
   Loaded AFTER icons.js, BEFORE app.js.
   Defines all product types and their canvas/print dimensions.
   ============================================================ */

var PRODUCT_TYPES = {
  card:        { w: 700,  h: 400,  inchW: 3.5,   inchH: 2,     label: 'Business Card', icon: 'card',    sides: 2, multiPage: true,  category: 'Print'   },
  logo:        { w: 500,  h: 500,  inchW: 5,     inchH: 5,     label: 'Logo',          icon: 'logo',    sides: 1, multiPage: true,  category: 'Brand'   },
  cv:          { w: 595,  h: 842,  inchW: 8.27,  inchH: 11.69, label: 'CV / Resume',   icon: 'cv',      sides: 1, multiPage: true,  category: 'Print'   },
  invoice:     { w: 595,  h: 842,  inchW: 8.27,  inchH: 11.69, label: 'Invoice',       icon: 'invoice', sides: 1, multiPage: true,  category: 'Print'   },
  socialPost:  { w: 1080, h: 1080, inchW: 15,    inchH: 15,    label: 'Social Post',   icon: 'social',  sides: 1, multiPage: true,  category: 'Social'  },
  story:       { w: 1080, h: 1920, inchW: 15,    inchH: 26.67, label: 'Story / Reel',  icon: 'story',   sides: 1, multiPage: true,  category: 'Social'  },
  banner:      { w: 1200, h: 628,  inchW: 16.67, inchH: 8.72,  label: 'Banner',        icon: 'banner',  sides: 1, multiPage: true,  category: 'Social'  },
  emailHeader: { w: 600,  h: 900,  inchW: 6.25,  inchH: 9.38,  label: 'Email',  icon: 'email',   sides: 1, multiPage: true,  category: 'Digital' },
  slide:       { w: 1600, h: 900,  inchW: 13.33, inchH: 7.5,   label: 'Slide Deck',    icon: 'board',   sides: 1, multiPage: true,  category: 'Presentation', _hiddenInWizard: true },
  video:       { w: 1920, h: 1080, inchW: 16,    inchH: 9,     label: 'Video',         icon: 'story',   sides: 1, multiPage: true,  category: 'Motion', _hiddenInWizard: true },
  wireframe:   { w: 1440, h: 900,  inchW: 20,    inchH: 12.5,  label: 'Wireframe',     icon: 'wireframe', sides: 1, multiPage: true, category: 'Web', _hiddenInWizard: true },
  custom:      { w: 1000, h: 1000, inchW: 13.89, inchH: 13.89, label: 'Custom Size',   icon: 'custom',  sides: 1, multiPage: true,  category: 'Other'   }
};

/* `video: true` (group or preset level) = video-format size, shown ONLY in video mode.
   `print: true` = print size, hidden IN video mode. The visible preset menu
   (rpfSizeMenu, right-panel.js) filters on these by activeProduct. */
var PRESET_GROUPS = [
  { group: 'Video', video: true, presets: [
    { name: 'Full HD 16:9', w: 1920, h: 1080 },
    { name: '4K UHD 16:9', w: 3840, h: 2160 },
    { name: 'Vertical Full HD 9:16', w: 1080, h: 1920 },
    { name: 'Square Video 1:1', w: 1080, h: 1080 },
    { name: 'Portrait Video 4:5', w: 1080, h: 1350 },
    { name: 'Cinematic 21:9', w: 2560, h: 1080 },
    { name: 'Classic 4:3', w: 1440, h: 1080 },
  ]},
  { group: 'Instagram', presets: [
    { name: 'Instagram Post', w: 1080, h: 1080 },
    { name: 'Instagram Portrait Post', w: 1080, h: 1350 },
    { name: 'Instagram Story', w: 1080, h: 1920 },
    { name: 'Instagram Reel', w: 1080, h: 1920, video: true },
  ]},
  { group: 'TikTok', video: true, presets: [
    { name: 'TikTok Video', w: 1080, h: 1920 },
  ]},
  { group: 'YouTube', presets: [
    { name: 'YouTube Video', w: 1920, h: 1080, video: true },
    { name: 'YouTube Shorts', w: 1080, h: 1920, video: true },
    { name: 'YouTube Thumbnail', w: 1280, h: 720 },
    { name: 'YouTube Banner', w: 2560, h: 1440 },
  ]},
  { group: 'Facebook', presets: [
    { name: 'Facebook Post', w: 1200, h: 630 },
    { name: 'Facebook Cover', w: 820, h: 312 },
    { name: 'Facebook Reel', w: 1080, h: 1920, video: true },
  ]},
  { group: 'Twitter / X', presets: [
    { name: 'Twitter Header', w: 1500, h: 500 },
    { name: 'Twitter Post', w: 1200, h: 675 },
  ]},
  { group: 'LinkedIn', presets: [
    { name: 'LinkedIn Banner', w: 1584, h: 396 },
    { name: 'LinkedIn Post', w: 1200, h: 627 },
  ]},
  { group: 'Pinterest', presets: [
    { name: 'Pinterest Pin', w: 1000, h: 1500 },
  ]},
  { group: 'Presentation', presets: [
    { name: 'Presentation 16:9', w: 1920, h: 1080 },
    { name: 'Presentation 4:3', w: 1024, h: 768 },
    { name: 'Presentation 16:10', w: 1920, h: 1200 },
  ]},
  /* APP STORE, from Apple's own specification pages (App Store Connect > screenshot
     specifications, and the Human Interface Guidelines icon table), read 2026-08-07.
     Apple CONSOLIDATED the buckets: the standalone 6.7" category is gone and 1290x2796 is now one
     of three pixel pairs accepted by the 6.9" bucket. A new submission strictly needs only the
     6.9" iPhone set and the 13" iPad set; everything smaller is optional and auto-scaled down, so
     those two lead the list and the rest are there for anyone who wants to art-direct a size
     instead of letting Apple resample it.
     `setCustomCanvasSize` refuses anything over 4096px, so Apple TV / Vision Pro (3840x2160) are
     deliberately absent: they would render as menu rows that silently do nothing. */
  { group: 'App Store', presets: [
    { name: 'iPhone 6.9"', w: 1320, h: 2868 },
    { name: 'iPhone 6.9" Landscape', w: 2868, h: 1320 },
    { name: 'iPhone 6.7"', w: 1290, h: 2796 },
    { name: 'iPhone 6.5"', w: 1242, h: 2688 },
    { name: 'iPhone 6.3"', w: 1179, h: 2556 },
    { name: 'iPhone 6.1"', w: 1170, h: 2532 },
    { name: 'iPad 13"', w: 2064, h: 2752 },
    { name: 'iPad 13" Landscape', w: 2752, h: 2064 },
    { name: 'iPad 11"', w: 1488, h: 2266 },
    { name: 'Mac App Store', w: 2880, h: 1800 },
    { name: 'Apple Watch', w: 416, h: 496 },
    { name: 'App Store Icon', w: 1024, h: 1024 },
    { name: 'App Preview iPhone', w: 886, h: 1920, video: true },
    { name: 'App Preview iPad', w: 1200, h: 1600, video: true },
  ]},
  /* GOOGLE PLAY, from the Play Console preview-assets page, read 2026-08-07. Play states RANGES
     (320-3840 on a phone, 1080-7680 on a tablet) plus an aspect rule rather than one number, so
     these are the shapes inside that range: 9:16 and 16:9 at the resolution Play itself recommends
     for promotional eligibility. The icon and the feature graphic ARE fixed and are the two assets
     Play refuses to publish without. */
  { group: 'Google Play', presets: [
    { name: 'Play Phone Screenshot', w: 1080, h: 1920 },
    { name: 'Play Phone Landscape', w: 1920, h: 1080 },
    { name: 'Play Tablet', w: 1440, h: 2560 },
    { name: 'Play Tablet Landscape', w: 2560, h: 1440 },
    { name: 'Play Feature Graphic', w: 1024, h: 500 },
    { name: 'Play Store Icon', w: 512, h: 512 },
    { name: 'Android TV Banner', w: 1280, h: 720 },
    /* Play states a MINIMUM of 384x384 at 1:1 for Wear OS and no recommended figure, so the
       minimum is what is offered rather than a rounder number nobody published. */
    { name: 'Wear OS Screenshot', w: 384, h: 384 },
  ]},
  { group: 'Card & Print', print: true, presets: [
    /* The sizes people actually ask this editor for and could not find: a business card in both
       standard families, and the two everyday print pieces beside them. Millimetres at 300 DPI,
       with the 3mm bleed left out on purpose - a bleed is a print-shop decision, not a canvas one,
       and baking it in makes every on-screen preview the wrong shape. */
    { name: 'Business Card 85x55mm', w: 1004, h: 650 },
    { name: 'Business Card 90x50mm', w: 1063, h: 591 },
    { name: 'Business Card US 3.5x2in', w: 1050, h: 600 },
    { name: 'Postcard A6', w: 1240, h: 1748 },
    { name: 'Flyer A5', w: 1748, h: 2480 },
    { name: 'Poster A3', w: 3508, h: 4961 },
    { name: 'A4 Portrait', w: 595, h: 842 },
    { name: 'A4 Landscape', w: 842, h: 595 },
    { name: 'Letter Portrait', w: 612, h: 792 },
    { name: 'Letter Landscape', w: 792, h: 612 },
  ]},
];

var SOCIAL_PRESETS = {};
PRESET_GROUPS.forEach(function (g) {
  g.presets.forEach(function (p) { SOCIAL_PRESETS[p.name] = { w: p.w, h: p.h }; });
});

var activeProduct = 'custom';

function getProductConfig(type) {
  return PRODUCT_TYPES[type || activeProduct] || PRODUCT_TYPES.card;
}

function setProductType(type) {
  if (!PRODUCT_TYPES[type]) return;
  activeProduct = type;
  var cfg = PRODUCT_TYPES[type];

  CW = cfg.w;
  CH = cfg.h;

  if (typeof canvas !== 'undefined' && canvas && canvas.setWidth) {
    canvas.setWidth(CW);
    canvas.setHeight(CH);
    canvas.renderAll();
  }

  if (typeof applyView === 'function') applyView();
  if (typeof updateSizeBadge === 'function') updateSizeBadge();

  var orientRow = document.getElementById('orient-row');
  if (orientRow) orientRow.style.display = (type === 'card') ? '' : 'none';

  var cornersRow = document.getElementById('corners-row');
  if (cornersRow) cornersRow.style.display = (type === 'card') ? '' : 'none';

  if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
  if (typeof updateRpTabBarVisibility === 'function') updateRpTabBarVisibility();
  var exportBtn = document.getElementById('btn-export');
  if (exportBtn && typeof getIcon === 'function') {
    exportBtn.innerHTML = getIcon('share', 14) + ' Share';
  }
}

function setCustomCanvasSize(w, h) {
  if (w < 50 || h < 50 || w > 4096 || h > 4096) return;
  CW = Math.round(w);
  CH = Math.round(h);
  if (activeProduct === 'custom') {
    PRODUCT_TYPES.custom.w = CW;
    PRODUCT_TYPES.custom.h = CH;
  }
  if (typeof canvas !== 'undefined' && canvas && canvas.setWidth) {
    canvas.setWidth(CW);
    canvas.setHeight(CH);
    canvas.renderAll();
  }
  if (typeof applyView === 'function') applyView();
  if (typeof updateSizeBadge === 'function') updateSizeBadge();
  if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
}

function getProductExportLabel() {
  var cfg = getProductConfig();
  var map = {
    card: 'Get My Card',
    logo: 'Get My Logo',
    cv: 'Get My CV',
    invoice: 'Get My Invoice',
    socialPost: 'Get My Post',
    story: 'Get My Story',
    banner: 'Get My Banner',
    emailHeader: 'Get My Header',
    slide: 'Get My Deck',
    video: 'Get My Video',
    custom: 'Download'
  };
  return map[activeProduct] || 'Download';
}
