/* ============================================================
   ve-advanced-features — GROUP PARENT (decomposed)
   dika studio Video Editor advanced features (LUT, scopes, motion/face tracking, multi-cam,
   stabilization, scene detection, plugin sandbox, HDR, smart crop).

   The 2014-line single IIFE was split per feature. Shared state + constants live on ONE
   namespace object  VEA = window.__ccVEAdvanced  (so the children + the lifecycle reach
   them without globals); each child (lut/scopes/scene-detection/…) attaches its functions as
   VEA.<name> and references siblings through VEA at call time → load-order-proof.
   The public API stays  window.VEAdvancedFeatures  (lazy getters → VEA), so the video
   editor (which calls .init()/.SceneDetector()/… on editor-open) is unchanged.
   ============================================================ */
(function () {
  'use strict';

  var VEA = window.__ccVEAdvanced || (window.__ccVEAdvanced = {});

  // ── shared state + constants (were the IIFE private vars) ──
  VEA.LUT_LIBRARY = {
    // Dahili LUT presetleri — identity tabanlı modifikasyonlar
    'cinematic-teal-orange': { name: 'Cinematic Teal & Orange', category: 'cinematic', temperature: 0.15, tealShadows: 0.3, orangeHighlights: 0.25 },
    'cinematic-moody':       { name: 'Moody',                  category: 'cinematic', contrast: 0.2, saturation: -0.15, shadowLift: 0.05 },
    'cinematic-film-noir':   { name: 'Film Noir',              category: 'cinematic', desaturate: 0.85, contrast: 0.35, gamma: 0.9 },
    'cinematic-blockbuster': { name: 'Blockbuster',            category: 'cinematic', contrast: 0.15, saturation: 0.1, temperature: 0.05 },
    'vintage-kodak':         { name: 'Kodak Portra',           category: 'vintage', warmth: 0.12, fadedBlacks: 0.08, saturation: -0.1 },
    'vintage-fuji':          { name: 'Fuji Superia',           category: 'vintage', greenTint: 0.05, contrast: 0.1, fadedBlacks: 0.05 },
    'vintage-polaroid':      { name: 'Polaroid',               category: 'vintage', warmth: 0.15, fadedBlacks: 0.12, saturation: -0.2, vignette: 0.2 },
    'vintage-vhs':           { name: 'VHS',                    category: 'vintage', chromaShift: 0.02, blur: 0.3, saturation: -0.25, noise: 0.1 },
    'social-bright':         { name: 'Bright & Clean',         category: 'social', brightness: 0.1, saturation: 0.15, contrast: 0.05 },
    'social-warm-glow':      { name: 'Warm Glow',              category: 'social', warmth: 0.2, softGlow: 0.1, saturation: 0.05 },
    'social-cool-tone':      { name: 'Cool Tone',              category: 'social', temperature: -0.15, contrast: 0.1, saturation: 0.05 },
    'social-pastel':         { name: 'Pastel Dreams',          category: 'social', saturation: -0.3, brightness: 0.1, fadedBlacks: 0.1 },
    'correction-daylight':   { name: 'Daylight → Tungsten',   category: 'correction', temperature: 0.25 },
    'correction-tungsten':   { name: 'Tungsten → Daylight',   category: 'correction', temperature: -0.25 },
    'correction-flat-rec709':{ name: 'Flat → Rec.709',        category: 'correction', contrast: 0.3, saturation: 0.15 },
    'correction-slog':       { name: 'S-Log → Rec.709',       category: 'correction', contrast: 0.4, saturation: 0.2, gamma: 0.85 },
    'bw-high-contrast':      { name: 'B&W High Contrast',     category: 'bw', desaturate: 1.0, contrast: 0.3 },
    'bw-soft':               { name: 'B&W Soft',               category: 'bw', desaturate: 1.0, contrast: -0.1, fadedBlacks: 0.1 },
    'bw-sepia':              { name: 'Sepia',                  category: 'bw', desaturate: 1.0, sepiaTone: 0.4 },
    'bw-cyanotype':          { name: 'Cyanotype',              category: 'bw', desaturate: 1.0, cyanTone: 0.4 }
  };
  VEA.LUT_CATEGORIES = {
    cinematic: 'Cinematic',
    vintage: 'Vintage',
    social: 'Social Media',
    correction: 'Correction',
    bw: 'Black & White'
  };
  // The scopes child owns its own canvas, panel and rAF loop; only these two are shared state.
  // (_scopeCanvas / _scopeCtx / _scopeRafId used to live here for a panel shell and a rAF loop that
  // was never written: _scopeRafId was declared, only ever cancelled, and never once assigned.)
  VEA._scopeMode = 'waveform';   // 'waveform' | 'parade' | 'vectorscope' | 'histogram' | 'cie'
  VEA._scopeVisible = false;
  VEA._faceMeshLoaded = false;
  VEA._faceMeshLoading = false;
  VEA._faceMeshInstance = null;
  /* COMMUNITY EDITION: the face tracker is a HIDDEN alpha feature (owner decision), so its model is
     deliberately NOT vendored - shipping ~10 MB for a surface nobody can open is weight with no
     reader. The URL stays so that turning the feature on is a one-line change plus a vendored file,
     and `_faceMeshLoaded` already gates every caller on the load succeeding. If it is ever made
     visible, vendor it first: a visible feature that only works online breaks the offline promise. */
  VEA.FACEMESH_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619';
  VEA._pluginSandboxes = {}; // pluginId → iframe
  VEA._hdrSupport = {
    displayP3: false,
    hdr: false,
    tenBit: false
  };
  VEA.REFRAME_PRESETS = {
    'landscape':   { aspect: 16 / 9,  label: 'Landscape (16:9)' },
    'portrait':    { aspect: 9 / 16,  label: 'Portrait (9:16)' },
    'square':      { aspect: 1,       label: 'Square (1:1)' },
    'ultrawide':   { aspect: 21 / 9,  label: 'Ultrawide (21:9)' },
    'cinema':      { aspect: 2.39,    label: 'Cinemascope (2.39:1)' },
    'tiktok':      { aspect: 9 / 16,  label: 'TikTok (9:16)' },
    'instagram':   { aspect: 4 / 5,   label: 'Instagram (4:5)' },
    'twitter':     { aspect: 16 / 9,  label: 'Twitter/X (16:9)' }
  };

  // ── lifecycle (orchestrates the feature children) ──
  VEA.initAdvanced = function () {
    VEA.detectHDRSupport();
    console.log('[VEAdvanced] Initialized. HDR:', VEA._hdrSupport);
  };

  VEA.disposeAdvanced = function () {
    VEA.hideScopes();
    for (var pid in VEA._pluginSandboxes) {
      VEA._pluginSandboxes[pid].dispose();
    }
    VEA._pluginSandboxes = {};
  };

  // ── public API: window.VEAdvancedFeatures with lazy getters → VEA (load-order-proof;
  //    getters keep `new VEAdvancedFeatures.SceneDetector()` working as real constructors) ──
  var api = {};
  ["parseCubeFile","applyLUT","generatePresetLUT","LUT_LIBRARY","LUT_CATEGORIES","showScopes","hideScopes","toggleScopes","setScopeMode","setScopeLayout","setScopeGain","updateScopes","_scopeInternals","SceneDetector","MotionTracker","trackRegion","_cloudStep","_seedPoints","_buildPyr","_bilSample","_lkPyr","_toGrayscale","_boxBlurGray","PluginSandbox","VideoStabilizer","detectHDRSupport","createP3Canvas","toneMapHDR","SmartCrop","REFRAME_PRESETS"].forEach(function (n) {
    Object.defineProperty(api, n, { get: function () { return VEA[n]; }, enumerable: true });
  });
  Object.defineProperty(api, 'init', { get: function () { return VEA.initAdvanced; }, enumerable: true });
  Object.defineProperty(api, 'dispose', { get: function () { return VEA.disposeAdvanced; }, enumerable: true });
  api.getHDRSupport = function () { return VEA._hdrSupport; };
  api.isScopesOpen = function () { return !!VEA._scopeVisible; };
  window.VEAdvancedFeatures = api;
})();

// Modular skeleton hook (Faz 8) — register the group parent (children self-register under it).
if (window.cc && cc.modules) cc.modules.register({ id: 've-advanced-features', parent: 'video', title: 've-advanced-features', mount: function () {}, unmount: function () {} });
