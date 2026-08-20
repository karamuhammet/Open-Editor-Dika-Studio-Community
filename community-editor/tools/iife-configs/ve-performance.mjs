/* Decompose modules/video/ve-performance/ve-performance.js (1653-line IIFE, render-perf engine).
   Namespace VEP = window.__ccVEPerformance. The "classes" are big top-level VARS (not functions)
   → grouped vars go to children. Single window.VEPerformance object (lazy; video editor calls
   .init()). 5 perf layers + core. No prototypes. */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/video/ve-performance';
const NS = 'VEP';
const DESC = {
  core: 'Lifecycle (init/destroy) + smart per-frame processing dispatcher.',
  algorithmic: 'Katman 1 — single-pass processor, LUT baker, frame-skip, dirty-region tracker.',
  workers: 'Katman 2 — worker pool + the filter worker code.',
  webgl: 'Katman 3 — WebGL pipeline + GLSL shader sources.',
  advanced: 'Katman 4 — advanced frame cache, texture atlas, memory monitor.',
  webgpu: 'Katman 5 — WebGPU pipeline + benchmark.'
};
const EXPORT_MAP = {
  init: 'init', destroy: 'destroy', processFrame: 'processFrameSmart',
  SinglePassProcessor: 'SinglePassProcessor', LUTBaker: 'LUTBaker', FrameSkipManager: 'FrameSkipManager',
  DirtyRegionTracker: 'DirtyRegionTracker', WorkerPool: 'WorkerPool', WebGLPipeline: 'WebGLPipeline',
  FrameCache: 'FrameCacheAdvanced', TextureAtlas: 'TextureAtlas', MemoryMonitor: 'MemoryMonitor',
  WebGPUPipeline: 'WebGPUPipeline', Benchmark: 'Benchmark'
};
run({
  src: DIR + '/ve-performance.js',
  parentFile: DIR + '/ve-performance.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccVEPerformance',
  parentId: 've-performance',
  idPrefix: 've-perf',
  parentDotted: 'video.ve-performance',
  childComment: g => 'video/ve-performance/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    core: ['init', 'destroy', 'processFrameSmart'],
    algorithmic: ['SinglePassProcessor', 'LUTBaker', 'FrameSkipManager', 'DirtyRegionTracker', '_cubicSplineEval'],
    workers: ['WorkerPool', '_filterWorkerCode'],
    webgl: ['WebGLPipeline', '_VS_FULLSCREEN', '_FS_PASSTHROUGH', '_FS_CHROMA_KEY', '_FS_COLOR_GRADE', '_FS_BLUR', '_FS_SHARPEN'],
    advanced: ['FrameCacheAdvanced', 'TextureAtlas', 'MemoryMonitor'],
    webgpu: ['WebGPUPipeline', 'Benchmark']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   ve-performance — GROUP PARENT (decomposed)\n' +
      '   Render-performance engine IIFE split per layer. The processor "classes" are big top-level\n' +
      '   vars, distributed to children. Shared namespace ' + NS + ' = window.__ccVEPerformance; cross-\n' +
      '   refs resolve at call time. Public API stays window.VEPerformance (lazy getters → ' + NS + ';\n' +
      '   the video editor calls .init()/.processFrame() on demand).\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccVEPerformance || (window.__ccVEPerformance = {});\n\n' +
      (stateLines.trim() ? '  // ── shared state ──\n' + stateLines + '\n\n' : '') +
      '  // ── public API: window.VEPerformance — lazy getters → ' + NS + ' (some keys aliased) ──\n' +
      '  var api = {}, map = ' + JSON.stringify(EXPORT_MAP) + ';\n' +
      '  Object.keys(map).forEach(function (k) {\n' +
      '    Object.defineProperty(api, k, { get: (function (n) { return function () { return ' + NS + '[n]; }; })(map[k]), enumerable: true });\n' +
      '  });\n' +
      '  window.VEPerformance = api;\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 've-performance', parent: 'video', title: 've-performance', mount: function () {}, unmount: function () {} });\n";
  }
});
