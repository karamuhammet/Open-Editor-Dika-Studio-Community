/* Sub-module: right-panel/image-inspector — the image panel, built to LOOK AND BEHAVE like the
   video clip inspector (owner 2026-08-07: "videodaki tasarımı al %100 ... iconlar tab ayarlar vs").

   HOW the design is shared, and why nothing is copied twice:
   every class used below (`ve-insp-docktabs`, `ve-insp-section`, `ve-insp-trcard`,
   `ve-insp-fxnav`, `ve-insp-slider`, `ve-flt-advbtn`, `ve-cg-*`) is DEFINED in
   modules/video/video-editor/video-editor.css, which is in the same bundle. Rendering the image
   panel with those class names makes it pixel-identical to the clip panel for free, and any later
   restyle of one restyles both. The labels are the clip panel's English ones for the same reason -
   two panels that sit in the same slot must not disagree about what a tab is called.

   The one thing that is NOT shared is the curve / wheel INTERACTION. Those helpers in
   ve-inspector.js resolve their state through `VE._veGradeObj(clip)` and commit through a
   `_changed()` that re-renders the video timeline, so they cannot be handed a still image without
   refactoring the live video panel. That refactor is worth doing and is flagged in
   docs/editor-image-inspector-plan-2026-08-07.md; it needs its own approval because it edits a
   shipped surface. Until then the markup and CSS are shared and only the pointer maths is local.

   Engines: `_ccImgAdjust` (fabric's own filters) and `_ccGrade` (the VEColorGrading object, same
   shape a clip carries, run through the same `processImageData`). Both in CUSTOM_PROPS. The filter
   chain is derived from them in ONE place and never read back. */

/* ── shared helpers, mirroring ve-inspector's own ── */
function _ccIcon(name, sz) {
  if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
  return '';
}
var _CC_CHEV = '<svg class="ve-acc-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
/* `part` names which slice of a preset this section owns; shared/presets/ui reads it to place the
   save + library buttons. Declared here rather than matched on the title text, because this panel
   is the one we control. */
function _ccAccSec(id, icon, title, body, open, part) {
  return '<div class="ve-insp-section' + (open ? '' : ' collapsed') + '" id="' + id + '"' +
    (part ? ' data-preset-part="' + part + '"' : '') + '>' +
    '<div class="ve-insp-section-title">' + _ccIcon(icon, 12) + ' ' + title + _CC_CHEV + '</div>' +
    '<div class="ve-insp-section-body">' + (body || '') + '</div></div>';
}
// Verbatim shape of ve-inspector's _filterSlider, so a row here and a row there are the same row.
function _ccFs(label, id, val, min, max, unit) {
  return '<div class="ve-insp-row ve-insp-slider-row">' +
    '<span class="ve-insp-label">' + label + '</span>' +
    '<input type="range" class="ve-insp-slider" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '">' +
    '<span class="ve-insp-slider-val" id="' + id + '-val">' + val + (unit || '') + '</span></div>';
}

var CC_IMG_ADJUST_DEFAULTS = {
  preset: 'none', brightness: 0, contrast: 0, saturation: 0, vibrance: 0,
  hue: 0, gamma: 100, sharpen: 0, blur: 0, sepia: 0, grayscale: 0,
  film: '', grain: 0, pixelate: 0,
  /* A LIST, because one image routinely needs several colours knocked out (owner: "birden fazla
     remove color seçebileyim") - a green screen plus its spill, a logo's white plus its shadow.
     Each entry carries its own tolerance; fabric gets one RemoveColor filter per entry.
     rmColor / rmDistance are the OLD single-value fields and are migrated on read, never written. */
  rmColors: null, rmColor: '', rmDistance: 20
};

/* Numbers copied from `_FILTER_PRESETS` in ve-inspector (100-centred there), so a still and a clip
   that pick "Vibrant" get the same look. Converted once, never re-tuned by eye. */
var CC_IMG_PRESETS_100 = {
  'none': {}, 'vivid': { contrast: 115, saturation: 140, brightness: 104 },
  'warm': { saturation: 112, hue: -8, sepia: 16, brightness: 103 },
  'cool': { saturation: 106, hue: 12, contrast: 105 },
  'muted': { saturation: 72, contrast: 96, brightness: 101 },
  'faded': { contrast: 82, saturation: 85, brightness: 108, sepia: 8 },
  'bw': { grayscale: 100, contrast: 116 },
  'dramatic': { contrast: 138, saturation: 122, brightness: 96 }
};
// Same eight cards, same labels and icon names the clip panel uses.
var CC_IMG_PRESET_CARDS = [
  ['none', 'None', 'ban'], ['vivid', 'Vibrant', 'zap'], ['warm', 'Warm', 'sun'],
  ['cool', 'Cool', 'snowflake'], ['muted', 'Pale', 'cloud'], ['faded', 'Faded', 'sunset'],
  ['bw', 'B/W', 'contrast'], ['dramatic', 'Dramatic', 'flame']
];
var CC_IMG_FILMS = [
  ['', 'None', 'ban'], ['Vintage', 'Vintage', 'sunset'], ['Kodachrome', 'Kodachrome', 'sun'],
  ['Polaroid', 'Polaroid', 'image'], ['Technicolor', 'Technicolor', 'zap'],
  ['Brownie', 'Brownie', 'cloud'], ['BlackWhite', 'B/W', 'contrast']
];
var CC_IMG_SLIDERS = [
  ['brightness', 'Brightness', -100, 100, ''], ['contrast', 'Contrast', -100, 100, ''],
  ['saturation', 'Saturation', -100, 100, ''], ['vibrance', 'Vibrance', -100, 100, ''],
  ['hue', 'Hue', -180, 180, '°'], ['blur', 'Blur', 0, 100, '']
];
var CC_IMG_SLIDERS_ADV = [
  ['gamma', 'Gamma', 20, 300, '%'], ['sharpen', 'Sharpen', 0, 100, ''],
  ['sepia', 'Sepia', 0, 100, '%'], ['grayscale', 'Grayscale', 0, 100, '%']
];
var CC_IMG_BLENDS = [
  ['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'],
  ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'],
  ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'],
  ['luminosity', 'Luminosity']
];

function _ccImgObj() {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
  var o = c && c.getActiveObject();
  if (!o || o.type !== 'image' || o.isQR || o._isChart || o._isEffect) return null;
  return o;
}
function _ccImgAdjust(obj) {
  if (!obj) return null;
  if (!obj._ccImgAdjust) obj._ccImgAdjust = {};
  var a = obj._ccImgAdjust;
  for (var k in CC_IMG_ADJUST_DEFAULTS) if (a[k] == null) a[k] = CC_IMG_ADJUST_DEFAULTS[k];
  return a;
}
/* READ-ONLY variants. The creating accessors are right for a write path and wrong for the panel:
   merely selecting an image ran the sync, and the sync's read stamped default objects onto it that
   then serialised into the document. Measured on the owner's own design. */
function _ccImgAdjustRead(obj) {
  var a = {}, src = (obj && obj._ccImgAdjust) || {};
  for (var k in CC_IMG_ADJUST_DEFAULTS) a[k] = (src[k] != null) ? src[k] : CC_IMG_ADJUST_DEFAULTS[k];
  a.rmColors = _ccRmList(a);
  return a;
}

/* THE reader of the remove-colour list, and the one place the old single-value shape is migrated.
   A document written before the list existed carries rmColor/rmDistance; converting it here rather
   than at ten call sites is what stops the two shapes disagreeing. */
function _ccRmList(a) {
  if (a && a.rmColors && a.rmColors.length) return a.rmColors;
  if (a && a.rmColor) return [{ c: a.rmColor, d: a.rmDistance || 20 }];
  return [];
}
function _ccGradeDefaults() {
  return {
    enabled: false, opacity: 100, preset: 'none', _bypass: false, curves: null, desaturate: false,
    levels: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 },
    wb: { temp: 0, tint: 0 }, sat: { saturation: 100, vibrance: 0 },
    wheels: { shadows: { r: 0, g: 0, b: 0 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 } }
  };
}
function _ccGrade(obj) {
  if (!obj) return null;
  /* Self-heal: a document saved before `_ccGrade` was persisted still carries the grade inside the
     FILTER, which is what keeps the picture right. Adopt it back so the panel can edit what the
     image is visibly doing, instead of offering an "off" switch over a graded photo. */
  if (!obj._ccGrade && obj.filters && obj.filters.length) {
    for (var fi = 0; fi < obj.filters.length; fi++) {
      var f = obj.filters[fi];
      if (f && f.type === 'CCColorGrade' && f.grading) { obj._ccGrade = f.grading; break; }
    }
  }
  if (!obj._ccGrade) obj._ccGrade = {};
  var g = obj._ccGrade, d = _ccGradeDefaults();
  for (var k in d) if (g[k] == null) g[k] = d[k];
  return g;
}
function _ccGradeRead(obj) {
  var g = (obj && obj._ccGrade) || null;
  if (!g && obj && obj.filters && obj.filters.length) {
    for (var i = 0; i < obj.filters.length; i++) {
      var f = obj.filters[i];
      if (f && f.type === 'CCColorGrade' && f.grading) { g = f.grading; break; }
    }
  }
  g = g || {};
  var d = _ccGradeDefaults(), out = {};
  for (var k in d) out[k] = (g[k] != null) ? g[k] : d[k];
  return out;
}

/* ── The adapter: VEColorGrading as a fabric filter ──────────────────────────────────────────
   `processImageData(imageData, grading)` mutates an ImageData in place, which is exactly the
   contract of a fabric 2D filter. So the professional engine needs no port - only this wrapper.
   One implementation grades both video and stills. */
function _ccRegisterGradeFilter() {
  if (!window.fabric || !fabric.Image || !fabric.Image.filters) return;
  if (fabric.Image.filters.CCColorGrade) return;
  var F = fabric.Image.filters;
  F.CCColorGrade = fabric.util.createClass(F.BaseFilter, {
    type: 'CCColorGrade',
    grading: null,
    // Always the 2D path: arbitrary JavaScript, so there is no shader and BaseFilter.applyTo would
    // look for an applyToWebGL that cannot exist.
    applyTo: function (options) { this.applyTo2d(options); },
    applyTo2d: function (options) {
      if (!options || !options.imageData || !this.grading) return;
      if (!window.VEColorGrading || typeof VEColorGrading.processImageData !== 'function') return;
      VEColorGrading.processImageData(options.imageData, this.grading);
    },
    isNeutralState: function () { return !this.grading || !this.grading.enabled; },
    toObject: function () { return fabric.util.object.extend(this.callSuper('toObject'), { grading: this.grading }); }
  });
  // Without fromObject a saved grade reloads as nothing, silently.
  F.CCColorGrade.fromObject = function (object, callback) {
    var f = new F.CCColorGrade({ grading: (object && object.grading) || null });
    if (callback) callback(f);
    return f;
  };
  _ccPatchApplyFilters();
}

/* ── THE seam that makes a grade survive every caller ────────────────────────────────────────
   Measured on :3000: the default backend is WebGL, and a WebGL pipeline state carries no
   `imageData` at all, so `applyTo2d` runs, finds nothing to grade and returns. The grade was
   therefore correct only when the panel itself applied it; every OTHER caller silently dropped
   it while the filter stayed in the chain and the panel kept reporting it on - a document
   reload, `setSrc` (which is how Bulk Builder swaps an image), undo/redo and a page switch all
   land here. Patching the one prototype method covers all of them instead of asking each caller
   to remember, and it forces 2D ONLY for an image that actually carries our filter, so every
   other image keeps the GPU path. */
var _cc2dBackend = null;
function _ccPatchApplyFilters() {
  if (!fabric.Image || !fabric.Image.prototype || fabric.Image.prototype.__ccGradeBackendPatch) return;
  var orig = fabric.Image.prototype.applyFilters;
  fabric.Image.prototype.applyFilters = function (filters) {
    var list = filters || this.filters || [], needs2d = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].type === 'CCColorGrade' && !list[i].isNeutralState()) { needs2d = true; break; }
    }
    if (!needs2d) return orig.call(this, filters);
    var prev = fabric.filterBackend;
    if (!_cc2dBackend && fabric.Canvas2dFilterBackend) _cc2dBackend = new fabric.Canvas2dFilterBackend();
    if (_cc2dBackend) fabric.filterBackend = _cc2dBackend;
    try { return orig.call(this, filters); }
    finally { fabric.filterBackend = prev; }
  };
  fabric.Image.prototype.__ccGradeBackendPatch = true;
}

/* THE one place a filter chain is built. */
function _ccImgBuildChain(a, grade) {
  var F = fabric.Image.filters, list = [];
  if (a.brightness) list.push(new F.Brightness({ brightness: a.brightness / 100 }));
  if (a.contrast) list.push(new F.Contrast({ contrast: a.contrast / 100 }));
  if (a.saturation) list.push(new F.Saturation({ saturation: a.saturation / 100 }));
  if (a.vibrance) list.push(new F.Vibrance({ vibrance: a.vibrance / 100 }));
  if (a.hue) list.push(new F.HueRotation({ rotation: a.hue / 180 }));   // -1..1 == -180..180deg
  if (a.gamma && a.gamma !== 100) { var g = a.gamma / 100; list.push(new F.Gamma({ gamma: [g, g, g] })); }
  if (a.sepia) list.push(new F.Sepia());
  if (a.grayscale) list.push(new F.Grayscale());
  if (a.film && F[a.film]) list.push(new F[a.film]());
  /* Convolute has no amount of its own, so the amount lives in the KERNEL: centre 1 + 4s against
     four -s neighbours always sums to 1, which keeps overall brightness unchanged at any strength. */
  if (a.sharpen) {
    var s = (a.sharpen / 100) * 1.2;
    list.push(new F.Convolute({ matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0] }));
  }
  if (a.grain) list.push(new F.Noise({ noise: a.grain * 4 }));
  if (a.pixelate > 1) list.push(new F.Pixelate({ blocksize: Math.round(a.pixelate) }));
  // One filter per entry: fabric's RemoveColor takes a single colour, so several colours are
  // several filters, applied in order.
  _ccRmList(a).forEach(function (e) {
    if (e && e.c) list.push(new F.RemoveColor({ color: e.c, distance: (e.d || 20) / 100 }));
  });
  if (a.blur) list.push(new F.Blur({ blur: (a.blur / 100) * 0.6 }));
  // The grade goes LAST: a finishing pass over whatever the adjustments produced, the same order
  // the video compositor uses.
  if (grade && grade.enabled) list.push(new F.CCColorGrade({ grading: grade }));
  return list;
}
function _ccImgIsNeutral(a) {
  if (!a) return true;
  if (_ccRmList(a).length) return false;
  for (var k in CC_IMG_ADJUST_DEFAULTS) {
    if (k === 'preset' || k === 'rmColors' || k === 'rmColor' || k === 'rmDistance') continue;
    if (a[k] !== CC_IMG_ADJUST_DEFAULTS[k]) return false;
  }
  return true;
}
function _ccGradeIsNeutral(g) {
  if (!g) return true;
  if (g.preset && g.preset !== 'none') return false;
  if (g.opacity != null && g.opacity !== 100) return false;
  if (g.curves || g.desaturate) return false;
  var l = g.levels || {};
  if ((l.inBlack || 0) || (l.inWhite != null && l.inWhite !== 255) || (l.gamma || 1) !== 1 ||
      (l.outBlack || 0) || (l.outWhite != null && l.outWhite !== 255)) return false;
  var w = g.wb || {}; if (w.temp || w.tint) return false;
  var s = g.sat || {}; if ((s.saturation != null && s.saturation !== 100) || s.vibrance) return false;
  var wh = g.wheels || {}, keys = ['shadows', 'midtones', 'highlights'];
  for (var i = 0; i < keys.length; i++) { var v = wh[keys[i]] || {}; if (v.r || v.g || v.b) return false; }
  return true;
}

function _ccImgApply(obj, opts) {
  if (!obj) return;
  var a = _ccImgAdjust(obj);
  var grade = (obj._ccGrade && obj._ccGrade.enabled) ? _ccGrade(obj) : null;
  obj.filters = _ccImgBuildChain(a, grade);
  // An untouched image should serialise like an untouched image.
  if (_ccImgIsNeutral(a)) delete obj._ccImgAdjust;
  if (obj._ccGrade && !obj._ccGrade.enabled && _ccGradeIsNeutral(obj._ccGrade)) delete obj._ccGrade;
  if (!obj._originalElement && obj._element) obj._originalElement = obj._element;
  // The backend choice is not made here: `_ccPatchApplyFilters` owns it for every caller.
  try { obj.applyFilters(); } catch (e) {}
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
  if (c) c.requestRenderAll();
  if (opts && opts.snap && typeof snap === 'function') snap();
}

/* ── Card slider (the clip panel's arrow-nav row, not a scrollbar) ── */
function _ccCardRow(navId, rowId, cards, curKey, attr) {
  var inner = '';
  cards.forEach(function (p) {
    inner += '<button type="button" class="ve-insp-trcard' + (p[0] === curKey ? ' active' : '') + '" ' + attr + '="' + p[0] + '" title="' + p[1] + '">' +
      '<span class="ve-insp-trcard-ic">' + _ccIcon(p[2], 15) + '</span>' +
      '<span class="ve-insp-trcard-lb">' + p[1] + '</span></button>';
  });
  return '<div class="ve-insp-fxnav" id="' + navId + '">' +
    '<button type="button" class="ve-insp-fxarrow" data-ccnav="-1" aria-label="Previous">' + _ccIcon('chevron-left', 15) + '</button>' +
    '<div class="ve-insp-fxviewport"><div class="ve-insp-trrow" id="' + rowId + '">' + inner + '</div></div>' +
    '<button type="button" class="ve-insp-fxarrow" data-ccnav="1" aria-label="Next" style="right:12px">' + _ccIcon('chevron-right', 15) + '</button></div>';
}

/* ── Tab bodies ───────────────────────────────────────────────────────────────────────────── */
function _ccImgColorHtml() {
  var advRows = '';
  CC_IMG_SLIDERS_ADV.forEach(function (s) { advRows += _ccFs(s[1], 'cci-' + s[0], 0, s[2], s[3], s[4]); });
  var rows = '';
  CC_IMG_SLIDERS.forEach(function (s) { rows += _ccFs(s[1], 'cci-' + s[0], 0, s[2], s[3], s[4]); });

  var filters = _ccCardRow('cci-presetnav', 'cci-presetrow', CC_IMG_PRESET_CARDS, 'none', 'data-imgpreset') +
    rows +
    '<button type="button" class="ve-flt-advbtn" id="cci-adv-toggle">Advanced' + _ccIcon('chevron-down', 12) + '</button>' +
    '<div class="ve-flt-adv" id="cci-adv" style="display:none">' + advRows + '</div>' +
    '<button type="button" class="ve-insp-btn" id="cci-reset">' + _ccIcon('rotate-ccw', 12) + ' Reset filters</button>';

  var grading = '<div class="ve-cg-head">' +
      '<label class="ve-cg-en"><input type="checkbox" id="cci-grade-on"><span>Open</span></label>' +
      '<div class="ve-cg-hbtns">' +
        '<button type="button" class="ve-cg-hbtn" id="cci-grade-ba" title="Before / After">' + _ccIcon('eye', 13) + '</button>' +
        '<button type="button" class="ve-cg-hbtn" id="cci-grade-reset" title="Reset all">' + _ccIcon('rotate-ccw', 13) + '</button>' +
      '</div></div>' +
    '<canvas id="cci-scope" class="ve-cg-scope" width="248" height="64"></canvas>' +
    '<div class="ve-cg-opac"><span class="ve-insp-label">Intensity</span>' +
      '<input type="range" class="ve-insp-slider" id="cci-grade-opacity" min="0" max="100" value="100">' +
      '<span class="ve-insp-slider-val" id="cci-grade-opacity-val">100%</span></div>' +
    '<div class="ve-cg-tabs" id="cci-grade-tabs">' +
      '<button type="button" class="ve-cg-tab active" data-cgtab="basic">Basic</button>' +
      '<button type="button" class="ve-cg-tab" data-cgtab="curves">Curves</button>' +
      '<button type="button" class="ve-cg-tab" data-cgtab="wheels">Wheels</button>' +
      '<button type="button" class="ve-cg-tab" data-cgtab="lut">LUT</button>' +
    '</div><div id="cci-grade-body"></div>';

  var films = _ccCardRow('cci-filmnav', 'cci-filmrow', CC_IMG_FILMS, '', 'data-imgfilm');

  var duotone = '<div class="ve-insp-row"><span class="ve-insp-label">Shadow</span>' +
      '<button type="button" class="rpf-swatch" id="cci-duo-a-sw" style="background:#1b2a4a" onclick="rpfOpenPalette(this,\'cci-duo-a\',\'\')" aria-label="Duotone shadow"></button>' +
      '<span class="ve-insp-slider-val" id="cci-duo-a-hex">1B2A4A</span>' +
      '<input type="color" id="cci-duo-a" value="#1b2a4a" style="display:none"></div>' +
    '<div class="ve-insp-row"><span class="ve-insp-label">Light</span>' +
      '<button type="button" class="rpf-swatch" id="cci-duo-b-sw" style="background:#f2ff58" onclick="rpfOpenPalette(this,\'cci-duo-b\',\'\')" aria-label="Duotone light"></button>' +
      '<span class="ve-insp-slider-val" id="cci-duo-b-hex">F2FF58</span>' +
      '<input type="color" id="cci-duo-b" value="#f2ff58" style="display:none"></div>' +
    '<button type="button" class="ve-insp-btn" id="cci-duo-apply">' + _ccIcon('droplet', 12) + ' Apply duotone</button>' +
    '<button type="button" class="ve-insp-btn" id="cci-duo-clear">' + _ccIcon('rotate-ccw', 12) + ' Clear</button>';

  // The list itself is rendered by _ccRmHtml on every sync, because its length changes.
  var rmcolor = '<div id="cci-rm-list"></div>' +
    '<button type="button" class="ve-insp-btn" id="cci-rm-add">' + _ccIcon('plus', 12) + ' Add color</button>' +
    '<button type="button" class="ve-insp-btn" id="cci-rm-clear">' + _ccIcon('rotate-ccw', 12) + ' Clear all</button>';

  return _ccAccSec('cci-sec-filters', 'sun', 'Filters', filters, true, 'filters') +
    _ccAccSec('cci-sec-grade', 'palette', 'Color Grading', grading, false, 'grade') +
    _ccAccSec('cci-sec-film', 'image', 'Film', films, false, 'film') +
    _ccAccSec('cci-sec-duo', 'droplet', 'Duotone', duotone, false, 'curves') +
    _ccAccSec('cci-sec-rm', 'eye-off', 'Remove Color', rmcolor, false);
}

function _ccImgEffectHtml() {
  var blends = '';
  CC_IMG_BLENDS.forEach(function (b) { blends += '<option value="' + b[0] + '">' + b[1] + '</option>'; });
  var blend = '<div class="ve-insp-row"><span class="ve-insp-label">Mode</span>' +
    '<select class="ve-insp-select" id="cci-blend">' + blends + '</select></div>';
  var texture = _ccFs('Grain', 'cci-grain', 0, 0, 100, '') + _ccFs('Pixelate', 'cci-pixelate', 0, 0, 40, '');
  return _ccAccSec('cci-sec-blend', 'layers', 'Blend Mode', blend, true, 'effect') +
    _ccAccSec('cci-sec-tex', 'grid', 'Texture', texture, false, 'effect') +
    _ccAccSec('cci-sec-shadownote', 'copy', 'Shadow', '<div class="ve-cg-hint" style="text-align:left">Shadow is set in the Shadow section below the panel.</div>', false);
}

function _ccImgAiHtml() {
  var tools = '<button type="button" class="ve-insp-btn" id="cci-ai-cutout">' + _ccIcon('scissors', 12) + ' Remove background</button>' +
    '<button type="button" class="ve-insp-btn" id="cci-ai-upscale">' + _ccIcon('maximize', 12) + ' Upscale</button>' +
    '<button type="button" class="ve-insp-btn" id="cci-ai-edit">' + _ccIcon('sparkles', 12) + ' Edit with AI</button>';
  return _ccAccSec('cci-sec-ai', 'sparkles', 'AI Tools', tools, true);
}

function _ccGradeBodyHtml(tab, g) {
  if (tab === 'curves') {
    var chs = [['rgb', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B']];
    var sel = '<div class="ve-cg-chsel">';
    chs.forEach(function (c) { sel += '<button type="button" class="ve-cg-ch ve-cg-ch-' + c[0] + (_ccCurveCh === c[0] ? ' active' : '') + '" data-cgch="' + c[0] + '">' + c[1] + '</button>'; });
    return sel + '</div><canvas id="cci-curve" class="ve-cg-curve" width="248" height="200"></canvas>' +
      '<div class="ve-cg-hint">Click: add point · drag · double-click: delete</div>' +
      '<button type="button" class="ve-insp-btn" id="cci-curve-reset">' + _ccIcon('rotate-ccw', 12) + ' Reset curve</button>';
  }
  if (tab === 'wheels') {
    var zones = [['shadows', 'Shadows'], ['midtones', 'Medium'], ['highlights', 'Highlights']];
    var h = '<div class="ve-cg-wheels">';
    zones.forEach(function (z) {
      h += '<div class="ve-cg-wheel"><canvas class="ve-cg-pad" data-cgzone="' + z[0] + '" width="132" height="132"></canvas>' +
        '<span class="ve-cg-wlbl">' + z[1] + '</span></div>';
    });
    return h + '</div><button type="button" class="ve-insp-btn" id="cci-wheels-reset">' + _ccIcon('rotate-ccw', 12) + ' Reset wheels</button>';
  }
  if (tab === 'lut') {
    var names = (window.VEColorGrading && VEColorGrading.PRESET_NAMES) || ['none'];
    var grid = '<div class="ve-cg-lutgrid">';
    names.forEach(function (n) {
      var lbl = n === 'none' ? 'None' : String(n).replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      grid += '<button type="button" class="ve-cg-lutcard' + (n === (g.preset || 'none') ? ' active' : '') + '" data-cclut="' + n + '">' + lbl + '</button>';
    });
    return grid + '</div>';
  }
  var l = g.levels, wb = g.wb, sat = g.sat;
  var advOn = (l.outBlack) || (l.outWhite !== 255) || wb.temp || wb.tint || (sat.saturation !== 100) || sat.vibrance;
  return _ccFs('In Black', 'ccg-levels.inBlack', l.inBlack || 0, 0, 254, '') +
    _ccFs('In White', 'ccg-levels.inWhite', l.inWhite != null ? l.inWhite : 255, 1, 255, '') +
    _ccFs('Gamma', 'ccg-levels.gammaPct', Math.round((l.gamma || 1) * 100), 20, 300, '%') +
    '<button type="button" class="ve-flt-advbtn' + (advOn ? ' open' : '') + '" id="cci-cgadv-toggle">Advanced' + _ccIcon('chevron-down', 12) + '</button>' +
    '<div class="ve-flt-adv" id="cci-cgadv"' + (advOn ? '' : ' style="display:none"') + '>' +
      _ccFs('Out Black', 'ccg-levels.outBlack', l.outBlack || 0, 0, 255, '') +
      _ccFs('Out White', 'ccg-levels.outWhite', l.outWhite != null ? l.outWhite : 255, 0, 255, '') +
      '<div class="ve-cg-grp">White Balance</div>' +
      _ccFs('Temp', 'ccg-wb.temp', wb.temp || 0, -100, 100, '') +
      _ccFs('Tint', 'ccg-wb.tint', wb.tint || 0, -100, 100, '') +
      '<div class="ve-cg-grp">Color</div>' +
      _ccFs('Saturation', 'ccg-sat.saturation', sat.saturation != null ? sat.saturation : 100, 0, 200, '%') +
      _ccFs('Vibrance', 'ccg-sat.vibrance', sat.vibrance || 0, -100, 100, '') +
    '</div>';
}

/* One row per colour to knock out: swatch, tolerance, remove. Rebuilt on every sync because the
   row COUNT is state - a fixed pair of controls cannot describe "two colours". */
function _ccRmHtml(list) {
  if (!list.length) return '<div class="ve-cg-hint" style="text-align:left">No color removed yet.</div>';
  var h = '';
  list.forEach(function (e, i) {
    h += '<div class="ve-insp-row" data-rmrow="' + i + '">' +
      '<button type="button" class="rpf-swatch" id="cci-rm-sw-' + i + '" style="background:' + e.c + '" onclick="rpfOpenPalette(this,\'cci-rm-' + i + '\',\'\')" aria-label="Color to remove"></button>' +
      '<input type="color" id="cci-rm-' + i + '" value="' + e.c + '" style="display:none">' +
      '<input type="range" class="ve-insp-slider" data-rmtol="' + i + '" min="1" max="100" value="' + (e.d || 20) + '">' +
      '<span class="ve-insp-slider-val">' + (e.d || 20) + '</span>' +
      '<button type="button" class="ve-cg-hbtn" data-rmdel="' + i + '" title="Remove" style="width:22px;height:22px;flex:none">' + _ccIcon('x', 12) + '</button>' +
      '</div>';
  });
  return h;
}

/* ── Curve editor ─────────────────────────────────────────────────────────────────────────── */
var _ccCurveCh = 'rgb';
var _CC_IDENTITY = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
function _ccCurveArr(g, create) {
  if (!g.curves) { if (!create) return _CC_IDENTITY.slice(); g.curves = {}; }
  if (!g.curves[_ccCurveCh]) {
    if (!create) return _CC_IDENTITY.slice();
    g.curves[_ccCurveCh] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  }
  return g.curves[_ccCurveCh];
}
function _ccDrawCurve(obj) {
  var cv = document.getElementById('cci-curve'); if (!cv) return;
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var g = _ccGradeRead(obj);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  for (var i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(W * i / 4, 0); ctx.lineTo(W * i / 4, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke();
  }
  ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke(); ctx.setLineDash([]);
  var pts = (g.curves && g.curves[_ccCurveCh]) ? g.curves[_ccCurveCh] : _CC_IDENTITY;
  var col = { rgb: '#f2ff58', r: '#ff5a5a', g: '#5aff8c', b: '#5a9cff' }[_ccCurveCh] || '#f2ff58';
  // Draw through the ENGINE's own LUT, so the line on screen is the curve the pixels will get.
  var lut = (window.VEColorGrading && VEColorGrading.buildLUT) ? VEColorGrading.buildLUT(pts) : null;
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
  for (var x = 0; x <= 255; x++) {
    var y = lut ? lut[x] : x;
    var px = (x / 255) * W, py = H - (y / 255) * H;
    if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = col;
  pts.forEach(function (p) {
    ctx.beginPath(); ctx.arc((p.x / 255) * W, H - (p.y / 255) * H, 4, 0, Math.PI * 2); ctx.fill();
  });
}
function _ccWireCurve(obj) {
  var cv = document.getElementById('cci-curve'); if (!cv || cv._ccWired) return;
  cv._ccWired = true;
  var drag = -1;
  function toData(e) {
    var r = cv.getBoundingClientRect();
    var x = Math.max(0, Math.min(255, Math.round(((e.clientX - r.left) / r.width) * 255)));
    var y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - r.top) / r.height) * 255)));
    return { x: x, y: y };
  }
  function nearest(a, d) {
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i].x - d.x) < 10 && Math.abs(a[i].y - d.y) < 18) return i;
    return -1;
  }
  cv.addEventListener('pointerdown', function (e) {
    var o = _ccImgObj(); if (!o) return;
    var g = _ccGrade(o), a = _ccCurveArr(g, true), d = toData(e), idx = nearest(a, d);
    if (idx < 0) {
      a.push({ x: d.x, y: d.y });
      a.sort(function (p, q) { return p.x - q.x; });
      for (var i = 0; i < a.length; i++) if (a[i].x === d.x && a[i].y === d.y) { idx = i; break; }
    }
    drag = idx;
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    _ccDrawCurve(o); e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (drag < 0) return;
    var o = _ccImgObj(); if (!o) return;
    var g = _ccGrade(o), a = _ccCurveArr(g, true), d = toData(e);
    // The two ENDPOINTS may only move vertically, and an inner point is clamped between its
    // neighbours - a curve whose x values cross is not a function and the LUT builder would
    // silently pick one of the two answers.
    if (drag === 0 || drag === a.length - 1) a[drag].y = d.y;
    else { a[drag].x = Math.max(a[drag - 1].x + 1, Math.min(a[drag + 1].x - 1, d.x)); a[drag].y = d.y; }
    _ccDrawCurve(o);
  });
  cv.addEventListener('pointerup', function () {
    if (drag < 0) return;
    drag = -1;
    var o = _ccImgObj(); if (!o) return;
    var g = _ccGrade(o); g.enabled = true;
    _ccImgApply(o, { snap: true }); _ccDrawScope(o);
  });
  cv.addEventListener('dblclick', function (e) {
    var o = _ccImgObj(); if (!o) return;
    var g = _ccGrade(o), a = _ccCurveArr(g, true), idx = nearest(a, toData(e));
    if (idx > 0 && idx < a.length - 1) {
      a.splice(idx, 1);
      _ccDrawCurve(o); _ccImgApply(o, { snap: true }); _ccDrawScope(o);
    }
  });
}

/* ── Colour wheels ────────────────────────────────────────────────────────────────────────── */
function _ccHsv2rgb(h, s, v) {
  var i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b;
  switch (i % 6) { case 0: r=v;g=t;b=p;break; case 1: r=q;g=v;b=p;break; case 2: r=p;g=v;b=t;break; case 3: r=p;g=q;b=v;break; case 4: r=t;g=p;b=v;break; default: r=v;g=p;b=q; }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
function _ccDrawWheel(obj, pad) {
  var ctx = pad.getContext('2d'), W = pad.width, H = pad.height, cx = W / 2, cy = H / 2, R = Math.min(cx, cy) - 4;
  ctx.clearRect(0, 0, W, H);
  // The wheel is painted once per pad and cached: an HSV disc is 17k pixel writes and it never
  // changes, so redrawing it on every pointermove is the difference between smooth and not.
  if (!pad._ccDisc) {
    var img = ctx.createImageData(W, H), d = img.data;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy), o = (y * W + x) * 4;
      if (dist > R) { d[o + 3] = 0; continue; }
      var ang = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      var rgb = _ccHsv2rgb(ang, Math.min(1, dist / R), 1);
      d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2];
      d[o + 3] = dist > R - 1.5 ? Math.round(255 * (R - dist) / 1.5) : 255;
    }
    var off = document.createElement('canvas'); off.width = W; off.height = H;
    off.getContext('2d').putImageData(img, 0, 0);
    pad._ccDisc = off;
  }
  ctx.drawImage(pad._ccDisc, 0, 0);
  var g = _ccGradeRead(obj), zone = pad.getAttribute('data-cgzone');
  var w = (g.wheels && g.wheels[zone]) || { r: 0, g: 0, b: 0 };
  /* The dot's position is DERIVED from the r/g/b offsets, not stored separately: two sources for
     one value is how a handle ends up somewhere the colour is not. */
  var hx = (w.r - (w.g + w.b) / 2) / 60, hy = (w.g - w.b) / 60;
  var px = cx + hx * R, py = cy - hy * R;
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
}
function _ccWireWheels(obj) {
  var pads = document.querySelectorAll('#cci-grade-body .ve-cg-pad');
  for (var i = 0; i < pads.length; i++) {
    (function (pad) {
      if (pad._ccWired) return;
      pad._ccWired = true;
      var dragging = false;
      function set(e, commit) {
        var o = _ccImgObj(); if (!o) return;
        var g = _ccGrade(o), zone = pad.getAttribute('data-cgzone');
        var r = pad.getBoundingClientRect(), R = Math.min(r.width, r.height) / 2 - 4;
        var dx = (e.clientX - r.left) - r.width / 2, dy = (e.clientY - r.top) - r.height / 2;
        var dist = Math.min(R, Math.sqrt(dx * dx + dy * dy));
        var ang = Math.atan2(dy, dx);
        var hx = Math.cos(ang) * dist / R, hy = -Math.sin(ang) * dist / R;
        // Inverse of the derivation in _ccDrawWheel, scaled to the engine's +/-60 offset range.
        if (!g.wheels[zone]) g.wheels[zone] = { r: 0, g: 0, b: 0 };
        g.wheels[zone].r = Math.round(hx * 60);
        g.wheels[zone].g = Math.round((hy * 60) + (-hx * 30));
        g.wheels[zone].b = Math.round((-hy * 60) + (-hx * 30));
        g.enabled = true;
        _ccDrawWheel(o, pad);
        if (commit) { _ccImgApply(o, { snap: true }); _ccDrawScope(o); }
      }
      pad.addEventListener('pointerdown', function (e) { dragging = true; try { pad.setPointerCapture(e.pointerId); } catch (er) {} set(e, false); e.preventDefault(); });
      pad.addEventListener('pointermove', function (e) { if (dragging) set(e, false); });
      pad.addEventListener('pointerup', function (e) { if (!dragging) return; dragging = false; set(e, true); });
    })(pads[i]);
  }
}

/* The dock's range track is painted with
   `linear-gradient(to right, gold var(--p, 50%), track var(--p, 50%))`, so the volt portion comes
   from a CSS VARIABLE, not from the input's value. Only the video inspector's own JS was setting
   it, so every slider here fell back to the 50% default: the fill sat mid-track while the handle
   sat at the real value, which is the "dot is on the left but the setting looks middle" the owner
   photographed. Anything with a range input inside this panel goes through here. */
function _ccSyncSliderFill(root) {
  var list = (root || document.getElementById('rp-image') || document).querySelectorAll('input[type="range"]');
  for (var i = 0; i < list.length; i++) _ccSliderFillOne(list[i]);
}
function _ccSliderFillOne(el) {
  if (!el) return;
  var min = parseFloat(el.min); if (isNaN(min)) min = 0;
  var max = parseFloat(el.max); if (isNaN(max)) max = 100;
  var v = parseFloat(el.value); if (isNaN(v)) v = min;
  var span = (max - min) || 1;
  el.style.setProperty('--p', Math.max(0, Math.min(100, ((v - min) / span) * 100)) + '%');
}

/* ── Scope ────────────────────────────────────────────────────────────────────────────────── */
function _ccDrawScope(obj) {
  var cv = document.getElementById('cci-scope'); if (!cv || !obj) return;
  var ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  var el = obj._originalElement || obj._element; if (!el) return;
  try {
    /* Sampled at 120px wide, not at the image's own size: a histogram of a 21-megapixel photo is
       the same shape as a histogram of a thumbnail, and reading 21M pixels to draw 64 bars is how
       a panel freezes the tab. */
    var w = 120, h = Math.max(1, Math.round(120 * ((el.naturalHeight || el.height || 1) / (el.naturalWidth || el.width || 1))));
    var tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    var tc = tmp.getContext('2d', { willReadFrequently: true });
    tc.drawImage(el, 0, 0, w, h);
    var d = tc.getImageData(0, 0, w, h).data, bins = new Uint32Array(64), max = 1;
    for (var i = 0; i < d.length; i += 4) bins[((d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8) >> 2]++;
    for (var b = 0; b < 64; b++) if (bins[b] > max) max = bins[b];
    var bw = cv.width / 64;
    ctx.fillStyle = 'rgba(242,255,88,0.55)';
    for (var j = 0; j < 64; j++) {
      var bh = Math.round((bins[j] / max) * (cv.height - 2));
      ctx.fillRect(j * bw, cv.height - bh, Math.max(1, bw - 1), bh);
    }
  } catch (e) {
    // A cross-origin image taints the canvas and getImageData throws. The grade still works; only
    // the histogram cannot be drawn, which is not worth an error.
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, cv.height - 2, cv.width, 2);
  }
}

/* ── Shared sections adopted into Basic ───────────────────────────────────────────────────────
   #rp-fig-bar (name + align) and #rp-uni-appearance (opacity) are siblings of #rp-image and were
   stacked ABOVE the tab bar, which read as chrome that belonged to nothing (owner: "bu yukardaki ek
   alanlar temelin içinde olsun"). They are MOVED into the Basic tab while an image is selected and
   put back for every other type - moving preserves listeners, since every binding in this panel
   resolves by getElementById. */
function _ccAdoptShared(on) {
  var host = document.getElementById('cci-basic-shared');
  ['rp-fig-bar', 'rp-uni-appearance'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (on) {
      /* Home is a PLACEHOLDER NODE, never a remembered `nextSibling`. The two adopted blocks are
         each other's siblings, so fig-bar's remembered next IS #rp-uni-appearance; once that had
         also been adopted, `insertBefore(el, <not a child>)` threw NotFoundError, the throw aborted
         this very forEach before the second block was given back, and the caller's cc.safe
         swallowed it. Measured cost: the Fill / Background control stayed locked inside the image
         panel, so selecting an image ONCE removed it from every text, shape and group for the rest
         of the session. A placeholder cannot be moved by anybody else, so restore is order-free. */
      if (!el._ccHome && el.parentNode) {
        el._ccHome = document.createComment('cc-home:' + id);
        el.parentNode.insertBefore(el._ccHome, el);
      }
      if (host && el.parentNode !== host) host.appendChild(el);
    } else if (el._ccHome && el._ccHome.parentNode && el.parentNode !== el._ccHome.parentNode) {
      el._ccHome.parentNode.insertBefore(el, el._ccHome);
    }
  });
}

/* Existing Basic-tab blocks keep their DOM (their bindings are already attached to those nodes) and
   are moved INTO accordion bodies. Their own inline display is mirrored onto the section, or
   hiding the Border block for a clipped image would leave a titled, empty accordion. */
function _ccWrapBasic() {
  var map = [
    ['rp-img-border-block', 'cci-sec-border'],
    ['rp-clip-block', 'cci-sec-clip'],
    ['rp-img-actions', 'cci-sec-actions']
  ];
  map.forEach(function (m) {
    var el = document.getElementById(m[0]), body = document.querySelector('#' + m[1] + ' .ve-insp-section-body');
    if (el && body && el.parentNode !== body) body.appendChild(el);
  });
}
function _ccSyncBasicVisibility() {
  [['rp-img-border-block', 'cci-sec-border'], ['rp-clip-block', 'cci-sec-clip']].forEach(function (m) {
    var el = document.getElementById(m[0]), sec = document.getElementById(m[1]);
    if (el && sec) sec.style.display = (el.style.display === 'none') ? 'none' : '';
  });
}

/* ── Sync ─────────────────────────────────────────────────────────────────────────────────── */
var _ccGradeTab = 'basic';
function syncImageInspector(obj) {
  if (!obj) { _ccAdoptShared(false); return; }
  _ccAdoptShared(true);
  _ccSyncBasicVisibility();

  /* A CLIP FRAME is a GROUP that also lives in this panel. It gets the shell (tabs, adopted
     blocks, its Clip section) but not the pixel controls: a group has no image element to read a
     histogram from and no filter chain of its own, so Color / Effect are hidden rather than shown
     over a target they cannot reach. */
  var isRealImage = obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
  ['color', 'effect', 'ai'].forEach(function (t) {
    var b = document.querySelector('#rp-img-tabs button[data-imgtab="' + t + '"]');
    if (b) b.style.display = isRealImage ? '' : 'none';
  });
  if (!isRealImage) {
    var hostEl = document.getElementById('rp-image');
    if (hostEl && hostEl.getAttribute('data-tab') !== 'basic') {
      hostEl.setAttribute('data-tab', 'basic');
      document.querySelectorAll('#rp-img-tabs button').forEach(function (x) {
        x.classList.toggle('active', x.getAttribute('data-imgtab') === 'basic');
      });
    }
    var sp0 = document.getElementById('cci-specs'); if (sp0) sp0.innerHTML = '';
    return;
  }

  var specs = document.getElementById('cci-specs');
  if (specs) {
    var el = obj._originalElement || obj._element || (obj.getElement && obj.getElement());
    var nw = el && (el.naturalWidth || el.width), nh = el && (el.naturalHeight || el.height);
    var src = String((el && el.src) || '');
    /* FORMAT, not filename: a stored asset's URL ends in a hash, and the first build printed
       `o-1634983703546-0b3d4a2a829b` at the user. When even the format is unknowable, say nothing. */
    var kind = /^data:image\/([a-z0-9+]+)/i.exec(src);
    var ext = kind ? kind[1] : (/\.([a-z0-9]{3,4})(?:$|\?)/i.exec(src.split('/').pop() || '') || [, ''])[1];
    var fmt = ext ? String(ext).toUpperCase().replace('JPEG', 'JPG').replace('SVG+XML', 'SVG') : '';
    var h = '';
    if (nw && nh) h += '<div class="ve-insp-spec"><span class="ve-insp-spec-k">Size</span><span class="ve-insp-spec-v">' + nw + '×' + nh + '</span></div>';
    if (fmt) h += '<div class="ve-insp-spec"><span class="ve-insp-spec-k">Format</span><span class="ve-insp-spec-v">' + fmt + '</span></div>';
    if (obj._hasBgRemoved) h += '<div class="ve-insp-spec"><span class="ve-insp-spec-k">BG</span><span class="ve-insp-spec-v">removed</span></div>';
    specs.innerHTML = h;
  }

  var a = _ccImgAdjustRead(obj);   // read-only: selecting an image must not write to it
  CC_IMG_SLIDERS.concat(CC_IMG_SLIDERS_ADV, [['grain', '', 0, 100, ''], ['pixelate', '', 0, 40, ''], ['rmDistance', '', 1, 100, '']]).forEach(function (s) {
    var inp = document.getElementById('cci-' + s[0]); if (!inp) return;
    inp.value = a[s[0]];
    var out = document.getElementById('cci-' + s[0] + '-val');
    if (out) out.textContent = a[s[0]] + (s[4] || '');
  });
  document.querySelectorAll('#cci-presetrow [data-imgpreset]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-imgpreset') === (a.preset || 'none'));
  });
  document.querySelectorAll('#cci-filmrow [data-imgfilm]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-imgfilm') === (a.film || ''));
  });
  var rmList = document.getElementById('cci-rm-list');
  if (rmList) rmList.innerHTML = _ccRmHtml(a.rmColors);
  var blend = document.getElementById('cci-blend');
  if (blend) blend.value = obj.globalCompositeOperation || 'source-over';

  // Read-only, and it also reads a grade back off the FILTER for documents saved before the marker
  // was persisted - so an older image shows its real grade without this sync writing anything.
  var g = _ccGradeRead(obj);
  var on = document.getElementById('cci-grade-on'); if (on) on.checked = !!g.enabled;
  var opa = document.getElementById('cci-grade-opacity');
  if (opa) { opa.value = g.opacity; var ov = document.getElementById('cci-grade-opacity-val'); if (ov) ov.textContent = g.opacity + '%'; }
  var ba = document.getElementById('cci-grade-ba'); if (ba) ba.classList.toggle('active', !!g._bypass);
  var body = document.getElementById('cci-grade-body');
  if (body) {
    body.innerHTML = _ccGradeBodyHtml(_ccGradeTab, g);
    if (_ccGradeTab === 'curves') { _ccWireCurve(obj); _ccDrawCurve(obj); }
    if (_ccGradeTab === 'wheels') { _ccWireWheels(obj); document.querySelectorAll('#cci-grade-body .ve-cg-pad').forEach(function (p) { _ccDrawWheel(obj, p); }); }
  }
  // After every re-render: the grade body and the remove-colour rows are rebuilt from scratch, so
  // their sliders arrive without --p and would paint the 50% default.
  _ccSyncSliderFill();
  _ccDrawScope(obj);
}

/* ── Init ────────────────────────────────────────────────────────────────────────────────── */
function initImageInspector() {
  var host = document.getElementById('rp-image');
  if (!host) return;
  _ccRegisterGradeFilter();

  var basic = document.getElementById('rp-img-basic');
  if (basic && !basic.innerHTML) {
    basic.innerHTML =
      _ccAccSec('cci-sec-source', 'info', 'Source', '<div class="ve-insp-specs" id="cci-specs"></div>', true) +
      _ccAccSec('cci-sec-shared', 'sliders', 'Appearance', '<div id="cci-basic-shared"></div>', true) +
      _ccAccSec('cci-sec-border', 'square', 'Border', '', false) +
      _ccAccSec('cci-sec-clip', 'crop', 'Clip', '', false) +
      _ccAccSec('cci-sec-actions', 'wand', 'Actions', '', false);
    _ccWrapBasic();
  }
  var color = document.getElementById('rp-img-color');
  if (color && !color.innerHTML) color.innerHTML = _ccImgColorHtml();
  var effect = document.getElementById('rp-img-effect');
  if (effect && !effect.innerHTML) effect.innerHTML = _ccImgEffectHtml();
  var ai = document.getElementById('rp-img-ai');
  if (ai && !ai.innerHTML) ai.innerHTML = _ccImgAiHtml();

  /* Every range input in this panel repaints its own fill as it moves, including the Border and
     Clip rows that right-panel/image owns - they live inside #rp-image too, and the dock styling
     applies to them whether or not this module drew them. */
  host.addEventListener('input', function (e) {
    if (e.target && e.target.type === 'range') _ccSliderFillOne(e.target);
  });
  _ccSyncSliderFill(host);

  // Accordion: one delegated handler for every section in the panel.
  host.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('.ve-insp-section-title') : null;
    if (!t || !host.contains(t)) return;
    var sec = t.closest('.ve-insp-section');
    if (sec) sec.classList.toggle('collapsed');
  });

  var tabs = document.getElementById('rp-img-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-imgtab]') : null;
      if (!b) return;
      host.setAttribute('data-tab', b.getAttribute('data-imgtab'));
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      var o = _ccImgObj(); if (o) syncImageInspector(o);
    });
  }

  // Card-row arrows (the clip panel's affordance: no scrollbar, small round arrows).
  host.addEventListener('click', function (e) {
    var arrow = e.target.closest ? e.target.closest('.ve-insp-fxarrow') : null;
    if (!arrow) return;
    var vp = arrow.parentNode.querySelector('.ve-insp-fxviewport');
    if (vp) vp.scrollLeft += parseInt(arrow.getAttribute('data-ccnav'), 10) * 120;
  });

  function applyPreset(id) {
    var o = _ccImgObj(); if (!o) return;
    var a = _ccImgAdjust(o);
    /* A preset REPLACES the adjustment set rather than layering on it: two presets in a row must
       not compound. Film, texture and remove-colour are separate choices, not part of a look. */
    var keep = { film: a.film, grain: a.grain, pixelate: a.pixelate, rmColor: a.rmColor, rmDistance: a.rmDistance };
    for (var k in CC_IMG_ADJUST_DEFAULTS) a[k] = CC_IMG_ADJUST_DEFAULTS[k];
    for (var kk in keep) a[kk] = keep[kk];
    a.preset = id;
    var p = CC_IMG_PRESETS_100[id] || {};
    if (p.brightness != null) a.brightness = p.brightness - 100;
    if (p.contrast != null) a.contrast = p.contrast - 100;
    if (p.saturation != null) a.saturation = p.saturation - 100;
    if (p.hue != null) a.hue = p.hue;
    if (p.sepia != null) a.sepia = p.sepia;
    if (p.grayscale != null) a.grayscale = p.grayscale;
    _ccImgApply(o, { snap: true });
    syncImageInspector(o);
  }

  host.addEventListener('click', function (e) {
    var card = e.target.closest ? e.target.closest('[data-imgpreset]') : null;
    if (card) { applyPreset(card.getAttribute('data-imgpreset')); return; }
    var film = e.target.closest ? e.target.closest('[data-imgfilm]') : null;
    if (film) {
      var o = _ccImgObj(); if (!o) return;
      var a = _ccImgAdjust(o), v = film.getAttribute('data-imgfilm');
      a.film = (a.film === v) ? '' : v;    // click the active one to turn it off
      _ccImgApply(o, { snap: true }); syncImageInspector(o);
    }
  });

  // Adjustment + texture sliders — fabric's own filters, cheap enough to follow the drag.
  host.addEventListener('input', function (e) {
    var inp = e.target;
    if (!inp.id || inp.id.indexOf('cci-') !== 0) return;
    var key = inp.id.slice(4);
    if (!(key in CC_IMG_ADJUST_DEFAULTS)) return;
    var o = _ccImgObj(); if (!o) return;
    var a = _ccImgAdjust(o);
    a[key] = parseInt(inp.value, 10) || 0;
    if (key !== 'grain' && key !== 'pixelate' && key !== 'rmDistance') {
      a.preset = 'custom';
      document.querySelectorAll('#cci-presetrow [data-imgpreset]').forEach(function (b) { b.classList.remove('active'); });
    }
    var out = document.getElementById(inp.id + '-val');
    if (out) {
      var unit = '';
      CC_IMG_SLIDERS.concat(CC_IMG_SLIDERS_ADV).forEach(function (s) { if (s[0] === key) unit = s[4]; });
      out.textContent = a[key] + unit;
    }
    _ccImgApply(o);
  });
  host.addEventListener('change', function (e) {
    if (e.target.id && e.target.id.indexOf('cci-') === 0 && (e.target.id.slice(4) in CC_IMG_ADJUST_DEFAULTS) && typeof snap === 'function') snap();
  });

  function advToggle(btnId, boxId) {
    var b = document.getElementById(btnId), box = document.getElementById(boxId);
    if (!b || !box) return;
    b.addEventListener('click', function () {
      var open = box.style.display === 'none';
      box.style.display = open ? '' : 'none';
      b.classList.toggle('open', open);
    });
  }
  advToggle('cci-adv-toggle', 'cci-adv');

  var reset = document.getElementById('cci-reset');
  if (reset) reset.addEventListener('click', function () {
    var o = _ccImgObj(); if (!o) return;
    var a = _ccImgAdjust(o);
    for (var k in CC_IMG_ADJUST_DEFAULTS) a[k] = CC_IMG_ADJUST_DEFAULTS[k];
    _ccImgApply(o, { snap: true }); syncImageInspector(o);
  });

  /* Remove-colour list. Delegated, because the rows are rebuilt on every sync - a listener bound
     to a row would be pointing at a detached node one repaint later. */
  function rmWrite(o) {
    var a = _ccImgAdjust(o);
    a.rmColors = (a.rmColors || []).filter(function (e) { return e && e.c; });
    a.rmColor = ''; a.rmDistance = 20;   // the migrated single-value fields are never written back
    return a;
  }
  host.addEventListener('input', function (e) {
    var t = e.target;
    var o = _ccImgObj(); if (!o) return;
    if (t.id && /^cci-rm-\d+$/.test(t.id)) {
      var i = parseInt(t.id.split('-').pop(), 10);
      var a = _ccImgAdjust(o); a.rmColors = _ccRmList(a).slice();
      if (a.rmColors[i]) { a.rmColors[i].c = t.value; rmWrite(o); _ccImgApply(o); syncImageInspector(o); }
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-rmtol')) {
      var j = parseInt(t.getAttribute('data-rmtol'), 10);
      var a2 = _ccImgAdjust(o); a2.rmColors = _ccRmList(a2).slice();
      if (a2.rmColors[j]) {
        a2.rmColors[j].d = parseInt(t.value, 10) || 20;
        var lbl = t.nextElementSibling; if (lbl) lbl.textContent = a2.rmColors[j].d;
        rmWrite(o); _ccImgApply(o);
      }
    }
  });
  host.addEventListener('click', function (e) {
    var o = _ccImgObj(); if (!o) return;
    var del = e.target.closest ? e.target.closest('[data-rmdel]') : null;
    if (del) {
      var a = _ccImgAdjust(o); a.rmColors = _ccRmList(a).slice();
      a.rmColors.splice(parseInt(del.getAttribute('data-rmdel'), 10), 1);
      rmWrite(o); _ccImgApply(o, { snap: true }); syncImageInspector(o);
    }
  });
  var rmAdd = document.getElementById('cci-rm-add');
  if (rmAdd) rmAdd.addEventListener('click', function () {
    var o = _ccImgObj(); if (!o) return;
    var a = _ccImgAdjust(o); a.rmColors = _ccRmList(a).slice();
    a.rmColors.push({ c: '#00ff00', d: 20 });
    rmWrite(o); _ccImgApply(o, { snap: true }); syncImageInspector(o);
  });
  var rmClear = document.getElementById('cci-rm-clear');
  if (rmClear) rmClear.addEventListener('click', function () {
    var o = _ccImgObj(); if (!o) return;
    var a = _ccImgAdjust(o); a.rmColors = []; rmWrite(o);
    _ccImgApply(o, { snap: true }); syncImageInspector(o);
  });

  /* Duotone: desaturate, then map 0..255 along a straight line from the shadow colour to the
     highlight colour, one line per channel - built out of the grading engine's own curves rather
     than a new pixel routine. */
  function duoRgb(id) {
    var e = document.getElementById(id), h = String((e && e.value) || '#000000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.substr(0, 2), 16) || 0, parseInt(h.substr(2, 2), 16) || 0, parseInt(h.substr(4, 2), 16) || 0];
  }
  function duoApply() {
    var o = _ccImgObj(); if (!o) return;
    var A = duoRgb('cci-duo-a'), B = duoRgb('cci-duo-b'), g = _ccGrade(o);
    g.desaturate = true;
    g.preset = 'none';    // a LUT preset and a duotone are two answers to the same question
    g.curves = {
      rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      r: [{ x: 0, y: A[0] }, { x: 255, y: B[0] }],
      g: [{ x: 0, y: A[1] }, { x: 255, y: B[1] }],
      b: [{ x: 0, y: A[2] }, { x: 255, y: B[2] }]
    };
    g.enabled = true;
    _ccImgApply(o, { snap: true }); syncImageInspector(o);
  }
  ['cci-duo-a', 'cci-duo-b'].forEach(function (id) {
    var inp = document.getElementById(id); if (!inp) return;
    inp.addEventListener('input', function () {
      var sw = document.getElementById(id + '-sw'); if (sw) sw.style.background = inp.value;
      var hx = document.getElementById(id + '-hex'); if (hx) hx.textContent = String(inp.value).replace('#', '').toUpperCase();
      // Only re-grade when a duotone is already on screen; otherwise picking a colour would switch
      // an effect on that nobody asked for.
      var o = _ccImgObj();
      if (o && o._ccGrade && o._ccGrade.curves && o._ccGrade.desaturate) duoApply();
    });
  });
  var duoA = document.getElementById('cci-duo-apply'); if (duoA) duoA.addEventListener('click', duoApply);
  var duoC = document.getElementById('cci-duo-clear');
  if (duoC) duoC.addEventListener('click', function () {
    var o = _ccImgObj(); if (!o) return;
    var g = _ccGrade(o);
    delete g.curves; g.desaturate = false;
    if (_ccGradeIsNeutral(g)) g.enabled = false;
    _ccImgApply(o, { snap: true }); syncImageInspector(o);
  });

  /* ── Grade wiring ── */
  var gOn = document.getElementById('cci-grade-on');
  if (gOn) gOn.addEventListener('change', function () {
    var o = _ccImgObj(); if (!o) return;
    _ccGrade(o).enabled = gOn.checked;
    _ccImgApply(o, { snap: true }); syncImageInspector(o);
  });
  var gTabs = document.getElementById('cci-grade-tabs');
  if (gTabs) gTabs.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-cgtab]') : null;
    if (!b) return;
    _ccGradeTab = b.getAttribute('data-cgtab');
    gTabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
    var o = _ccImgObj(); if (o) syncImageInspector(o);
  });
  var gReset = document.getElementById('cci-grade-reset');
  if (gReset) gReset.addEventListener('click', function () {
    var o = _ccImgObj(); if (!o) return;
    delete o._ccGrade;
    _ccGrade(o).enabled = false;
    _ccImgApply(o, { snap: true }); syncImageInspector(o);
  });
  var gBa = document.getElementById('cci-grade-ba');
  if (gBa) gBa.addEventListener('click', function () {
    var o = _ccImgObj(); if (!o) return;
    var g = _ccGrade(o);
    g._bypass = !g._bypass;   // the engine honours _bypass by returning the pixels untouched
    _ccImgApply(o); syncImageInspector(o);
  });

  /* Grade sliders apply on RELEASE, not on every drag tick. The grade is arbitrary JavaScript over
     every pixel of the source, so a 20-megapixel photo cannot be re-graded sixty times a second -
     the adjustment sliders above can, because those are fabric's own filters. */
  function gradeWrite(g, path, v) {
    var p = path.split('.');
    if (p[1] === 'gammaPct') { g.levels.gamma = v / 100; return; }
    if (!g[p[0]]) g[p[0]] = {};
    g[p[0]][p[1]] = v;
  }
  host.addEventListener('input', function (e) {
    var inp = e.target;
    if (!inp.id) return;
    var o = _ccImgObj(); if (!o) return;
    if (inp.id === 'cci-grade-opacity') {
      _ccGrade(o).opacity = parseInt(inp.value, 10) || 0;
      var ov = document.getElementById('cci-grade-opacity-val'); if (ov) ov.textContent = inp.value + '%';
      return;
    }
    if (inp.id.indexOf('ccg-') !== 0) return;
    var v = parseInt(inp.value, 10) || 0;
    gradeWrite(_ccGrade(o), inp.id.slice(4), v);
    var out = document.getElementById(inp.id + '-val');
    if (out) out.textContent = v + (/gammaPct|saturation/.test(inp.id) ? '%' : '');
  });
  host.addEventListener('change', function (e) {
    var inp = e.target;
    if (!inp.id || (inp.id.indexOf('ccg-') !== 0 && inp.id !== 'cci-grade-opacity')) return;
    var o = _ccImgObj(); if (!o) return;
    var g = _ccGrade(o);
    if (!g.enabled) { g.enabled = true; var on2 = document.getElementById('cci-grade-on'); if (on2) on2.checked = true; }
    _ccImgApply(o, { snap: true }); _ccDrawScope(o);
  });

  // Grade body: LUT cards, channel picker, curve/wheel resets, advanced disclosure.
  host.addEventListener('click', function (e) {
    var o = _ccImgObj();
    var lut = e.target.closest ? e.target.closest('[data-cclut]') : null;
    if (lut && o) {
      var g = _ccGrade(o);
      g.preset = lut.getAttribute('data-cclut');
      if (g.preset !== 'none') g.enabled = true;
      _ccImgApply(o, { snap: true }); syncImageInspector(o); return;
    }
    var ch = e.target.closest ? e.target.closest('[data-cgch]') : null;
    if (ch && o) { _ccCurveCh = ch.getAttribute('data-cgch'); syncImageInspector(o); return; }
    if (e.target.closest && e.target.closest('#cci-curve-reset') && o) {
      var g2 = _ccGrade(o);
      if (g2.curves) delete g2.curves[_ccCurveCh];
      _ccImgApply(o, { snap: true }); syncImageInspector(o); return;
    }
    if (e.target.closest && e.target.closest('#cci-wheels-reset') && o) {
      _ccGrade(o).wheels = { shadows: { r: 0, g: 0, b: 0 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 } };
      _ccImgApply(o, { snap: true }); syncImageInspector(o); return;
    }
    if (e.target.closest && e.target.closest('#cci-cgadv-toggle')) {
      var box = document.getElementById('cci-cgadv'), btn = document.getElementById('cci-cgadv-toggle');
      if (box && btn) { var open = box.style.display === 'none'; box.style.display = open ? '' : 'none'; btn.classList.toggle('open', open); }
    }
  });

  /* ── Effect + AI ── */
  var blend = document.getElementById('cci-blend');
  if (blend) blend.addEventListener('change', function () {
    var o = _ccImgObj(); if (!o) return;
    o.set('globalCompositeOperation', blend.value); o.dirty = true;
    var c = getActiveCanvas(); if (c) c.requestRenderAll();
    if (typeof snap === 'function') snap();
  });

  // Entry points to modules that already exist, never a second implementation.
  function wireAi(id, fnName) {
    var b = document.getElementById(id); if (!b) return;
    b.addEventListener('click', function () {
      if (typeof window[fnName] === 'function') window[fnName]();
      else if (typeof showToast === 'function') showToast('This tool isn\'t loaded on this page');
    });
  }
  wireAi('cci-ai-cutout', 'removeImageBg');
  wireAi('cci-ai-upscale', 'activateUpscale');
  wireAi('cci-ai-edit', 'activateAiEdit');

  /* #p-rmbg-btn shipped in the actions block with NO handler anywhere - a dead button in the panel
     this module owns, so it gets wired here rather than left as one. */
  var rmbg = document.getElementById('p-rmbg-btn');
  if (rmbg && !rmbg._ccWired) {
    rmbg._ccWired = true;
    rmbg.addEventListener('click', function () {
      if (typeof window.removeImageBg === 'function') window.removeImageBg();
      else if (typeof showToast === 'function') showToast('Background tool isn\'t loaded');
    });
  }
}

if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.image-inspector.init', function () { initImageInspector(); });
  });
}
/* The filter class and its backend patch must exist BEFORE the first document is deserialised:
   `fabric.Image.fromObject` reads the filter registry, and a design loaded ahead of the panel's
   own init would come back with the grade missing. Registration is idempotent, so init may
   still call it. */
if (window.fabric) _ccRegisterGradeFilter();
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'image-inspector', parent: 'right-panel', title: 'Image inspector', mount: function () {}, unmount: function () {} });
}
