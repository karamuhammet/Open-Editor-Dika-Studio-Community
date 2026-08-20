/* Config for decomposing modules/video/ve-advanced-features/ve-advanced-features.js (2014-line
   IIFE, 9 video-editor feature areas). Namespace VEA = window.__ccVEAdvanced. Each feature →
   a child; the lifecycle (init/dispose) + state/consts + the window.VEAdvancedFeatures public
   API stay in the parent. No load-time init (the video editor calls .init() on editor-open). */
import { run } from '../decompose-iife.mjs';

const DIR = 'modules/video/ve-advanced-features';
const NS = 'VEA';

const FEATURE = {
  lut: 'LUT — .cube parsing + preset LUT application',
  scopes: 'Video Scopes — waveform / vectorscope / RGB-parade / histogram',
  'scene-detection': 'Scene Detection — histogram-difference cut finder',
  'motion-tracking': 'Motion Tracking — Lucas-Kanade point/region + FaceMesh face tracking',
  'plugin-sandbox': 'Plugin Sandbox — iframe-isolated 3rd-party plugin host',
  stabilization: 'Stabilization — motion estimate + smoothing transform',
  hdr: 'HDR / Wide Gamut — P3 canvas + tone mapping',
  'smart-crop': 'Smart Crop — subject detection + reframe-to-aspect'
};

const EXPORT_KEYS = ['parseCubeFile', 'applyLUT', 'generatePresetLUT', 'LUT_LIBRARY', 'LUT_CATEGORIES',
  'showScopes', 'hideScopes', 'setScopeMode', 'updateScopes', 'SceneDetector', 'MotionTracker',
  'PluginSandbox', 'VideoStabilizer', 'detectHDRSupport', 'createP3Canvas',
  'toneMapHDR', 'SmartCrop', 'REFRAME_PRESETS'];

run({
  src: DIR + '/ve-advanced-features.js',
  parentFile: DIR + '/ve-advanced-features.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccVEAdvanced',
  parentId: 've-advanced-features',
  idPrefix: 've-adv',
  parentDotted: 'video.ve-advanced-features',
  childComment: g => 'video/ve-advanced-features/' + g + ' — ' + FEATURE[g],
  parentFuncs: ['initAdvanced', 'disposeAdvanced'],
  parentWindowFuncs: [],
  groups: {
    lut: ['parseCubeFile', 'applyLUT', 'generatePresetLUT'],
    scopes: ['initScopes', 'showScopes', 'hideScopes', 'setScopeMode', 'updateScopes', '_drawWaveform', '_drawVectorscope', '_drawRGBParade', '_drawHistogram'],
    'scene-detection': ['SceneDetector', '_computeHistogram', '_histogramDifference'],
    'motion-tracking': ['MotionTracker', '_toGrayscale', '_lucasKanade', '_extractPatch', '_templateMatch', '_loadFaceMesh'],
    'plugin-sandbox': ['PluginSandbox'],
    stabilization: ['VideoStabilizer', '_gaussianSmooth'],
    hdr: ['detectHDRSupport', 'createP3Canvas', 'toneMapHDR'],
    'smart-crop': ['SmartCrop']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   ve-advanced-features — GROUP PARENT (decomposed)\n' +
      '   dika studio Video Editor advanced features (LUT, scopes, motion/face tracking,\n' +
      '   stabilization, scene detection, plugin sandbox, HDR, smart crop).\n\n' +
      '   The 2014-line single IIFE was split per feature. Shared state + constants live on ONE\n' +
      '   namespace object  ' + NS + ' = window.__ccVEAdvanced  (so the children + the lifecycle reach\n' +
      '   them without globals); each child (lut/scopes/scene-detection/…) attaches its functions as\n' +
      '   ' + NS + '.<name> and references siblings through ' + NS + ' at call time → load-order-proof.\n' +
      '   The public API stays  window.VEAdvancedFeatures  (lazy getters → ' + NS + '), so the video\n' +
      '   editor (which calls .init()/.SceneDetector()/… on editor-open) is unchanged.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccVEAdvanced || (window.__ccVEAdvanced = {});\n\n' +
      '  // ── shared state + constants (were the IIFE private vars) ──\n' +
      stateLines + '\n\n' +
      '  // ── lifecycle (orchestrates the feature children) ──\n' +
      '  ' + NS + '.initAdvanced = function () {\n' +
      '    ' + NS + '.detectHDRSupport();\n' +
      '    ' + NS + '.initScopes();\n' +
      "    console.log('[VEAdvanced] Initialized — HDR:', " + NS + '._hdrSupport, ' + "'scope modes: waveform, vectorscope, rgbparade, histogram');\n" +
      '  };\n\n' +
      '  ' + NS + '.disposeAdvanced = function () {\n' +
      '    ' + NS + '.hideScopes();\n' +
      '    for (var pid in ' + NS + '._pluginSandboxes) {\n' +
      '      ' + NS + '._pluginSandboxes[pid].dispose();\n' +
      '    }\n' +
      '    ' + NS + '._pluginSandboxes = {};\n' +
      '    ' + NS + '._scopeCanvas = null;\n' +
      '    ' + NS + '._scopeCtx = null;\n' +
      '  };\n\n' +
      '  // ── public API: window.VEAdvancedFeatures with lazy getters → ' + NS + ' (load-order-proof;\n' +
      '  //    getters keep `new VEAdvancedFeatures.SceneDetector()` working as real constructors) ──\n' +
      '  var api = {};\n' +
      '  ' + JSON.stringify(EXPORT_KEYS) + '.forEach(function (n) {\n' +
      '    Object.defineProperty(api, n, { get: function () { return ' + NS + '[n]; }, enumerable: true });\n' +
      '  });\n' +
      "  Object.defineProperty(api, 'init', { get: function () { return " + NS + '.initAdvanced; }, enumerable: true });\n' +
      "  Object.defineProperty(api, 'dispose', { get: function () { return " + NS + '.disposeAdvanced; }, enumerable: true });\n' +
      '  api.getHDRSupport = function () { return ' + NS + '._hdrSupport; };\n' +
      '  window.VEAdvancedFeatures = api;\n' +
      '})();\n\n' +
      '// Modular skeleton hook (Faz 8) — register the group parent (children self-register under it).\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 've-advanced-features', parent: 'video', title: 've-advanced-features', mount: function () {}, unmount: function () {} });\n";
  }
});
