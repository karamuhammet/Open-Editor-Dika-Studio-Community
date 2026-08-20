/* Config for decomposing modules/video/ve-filter-graph/ve-filter-graph.js (2625-line IIFE, a
   DAG filter-graph engine: FilterNode base + 22 node subclasses that inherit it at LOAD time
   via X.prototype = Object.create(FilterNode.prototype). Namespace VFG = window.__ccVEFilterGraph.

   The whole class hierarchy (FilterNode + all subclasses + their inheritance setup + methods)
   stays in ONE "nodes" child, emitted in source order, so the load-time Object.create chain is
   self-contained (no cross-child load-order dependency). graph/gpu/workers are the other children;
   state/consts (shaders, pipelines, counters) + lifecycle + the window.VEFilterGraph API stay in
   the parent. No load-time init (the editor calls .init() on open). */
import { run } from '../decompose-iife.mjs';

const DIR = 'modules/video/ve-filter-graph';
const NS = 'VFG';

const DESC = {
  nodes: 'Filter NODES — FilterNode base class + 22 concrete node types (source/output/effect/audio), inheriting FilterNode via Object.create. Self-contained hierarchy.',
  graph: 'Filter GRAPH — FilterPad, Edge, the FilterGraph DAG container, and the graph-building helpers (createNodeByType / buildGraphForClip / benchmark).',
  gpu: 'GPU backends — WebGL (GLPipeline + shaders) and WebGPU (GPUPipeline) processing pipelines + backend detection.',
  workers: 'Worker pool — off-main-thread filter execution.'
};

const EXPORT_KEYS = ['FilterNode', 'FilterPad', 'FilterGraph', 'Edge', 'SourceNode', 'OutputNode',
  'ChromaKeyNode', 'ColorGradeNode', 'TransitionNode', 'TransformNode', 'BlurNode', 'SharpenNode',
  'BlendNode', 'OverlayNode', 'CropNode', 'MaskNode', 'DenoiseNode', 'LUT3DNode', 'TextOverlayNode',
  'FormatConvertNode', 'SplitNode', 'NullNode', 'ProbeNode', 'CacheNode', 'AudioSourceNode',
  'AudioMixNode', 'GLPipeline', 'GPUPipeline', 'WorkerPool', 'createNodeByType', 'buildGraphForClip', 'benchmark'];

run({
  src: DIR + '/ve-filter-graph.js',
  parentFile: DIR + '/ve-filter-graph.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccVEFilterGraph',
  parentId: 've-filter-graph',
  idPrefix: 've-fg',
  parentDotted: 'video.ve-filter-graph',
  childComment: g => 'video/ve-filter-graph/' + g + ' — ' + DESC[g],
  parentFuncs: ['initFilterGraph', 'disposeFilterGraph'],
  parentWindowFuncs: [],
  groups: {
    nodes: ['FilterNode', 'SourceNode', 'OutputNode', 'SplitNode', 'NullNode', 'ProbeNode', 'CacheNode',
      'ChromaKeyNode', 'ColorGradeNode', 'TransitionNode', 'TransformNode', 'BlurNode', 'SharpenNode',
      'BlendNode', 'OverlayNode', 'CropNode', 'MaskNode', 'DenoiseNode', 'LUT3DNode', 'TextOverlayNode',
      'FormatConvertNode', 'AudioSourceNode', 'AudioMixNode'],
    graph: ['FilterPad', 'Edge', 'FilterGraph', 'createNodeByType', 'buildGraphForClip', 'benchmark'],
    gpu: ['GLPipeline', '_glProcessFilter', '_parseColor', 'GPUPipeline', '_gpuProcessFilter', '_buildUniformBuffer', '_detectBackend', '_initWebGL'],
    workers: ['WorkerPool']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   ve-filter-graph — GROUP PARENT (decomposed)\n' +
      '   dika studio Video Editor — FFmpeg libavfilter-inspired DAG effect engine.\n\n' +
      '   The 2625-line single IIFE was split: the FilterNode class hierarchy (base + 22 node\n' +
      '   subclasses) lives in the "nodes" child as ONE self-contained unit (the subclasses inherit\n' +
      '   FilterNode at load time via Object.create, so they must share a file + source order);\n' +
      '   graph / gpu / workers are the other children. Shared state, GL shader sources, pipeline\n' +
      '   singletons + the lifecycle live on ONE namespace object  ' + NS + ' = window.__ccVEFilterGraph,\n' +
      '   reached by every child without globals. The public API stays  window.VEFilterGraph  (lazy\n' +
      '   getters → ' + NS + '), so the video editor (which `new`s nodes + calls .init()) is unchanged.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccVEFilterGraph || (window.__ccVEFilterGraph = {});\n\n' +
      '  // ── shared state, GL shader sources + pipeline singletons (were the IIFE private vars) ──\n' +
      stateLines + '\n\n' +
      '  // ── lifecycle (orchestrates backend detection + worker pool across the children) ──\n' +
      '  ' + NS + '.initFilterGraph = function () {\n' +
      '    ' + NS + '._detectBackend();\n' +
      '    ' + NS + '._workerPool = new ' + NS + '.WorkerPool(navigator.hardwareConcurrency ? Math.min(4, navigator.hardwareConcurrency) : 2);\n' +
      '    try {\n' +
      '      ' + NS + '._workerPool.init();\n' +
      '    } catch (e) {\n' +
      '      ' + NS + '._workerPool = null;\n' +
      '    }\n' +
      "    console.log('[VEFilterGraph] Initialized — backend:', " + NS + '._GPU_BACKEND);\n' +
      '  };\n\n' +
      '  ' + NS + '.disposeFilterGraph = function () {\n' +
      '    if (' + NS + '._glPipeline) { ' + NS + '._glPipeline.destroy(); ' + NS + '._glPipeline = null; }\n' +
      '    if (' + NS + '._gpuPipeline) { ' + NS + '._gpuPipeline.destroy(); ' + NS + '._gpuPipeline = null; }\n' +
      '    if (' + NS + '._workerPool) { ' + NS + '._workerPool.destroy(); ' + NS + '._workerPool = null; }\n' +
      '    ' + NS + '._GPU_BACKEND = null;\n' +
      '  };\n\n' +
      '  // ── public API: window.VEFilterGraph with lazy getters → ' + NS + ' (constructors stay `new`-able,\n' +
      '  //    resolution is load-order-proof) ──\n' +
      '  var api = {};\n' +
      '  ' + JSON.stringify(EXPORT_KEYS) + '.forEach(function (n) {\n' +
      '    Object.defineProperty(api, n, { get: function () { return ' + NS + '[n]; }, enumerable: true });\n' +
      '  });\n' +
      "  Object.defineProperty(api, 'init', { get: function () { return " + NS + '.initFilterGraph; }, enumerable: true });\n' +
      "  Object.defineProperty(api, 'dispose', { get: function () { return " + NS + '.disposeFilterGraph; }, enumerable: true });\n' +
      '  api.getBackend = function () { return ' + NS + '._GPU_BACKEND; };\n' +
      '  api.getGLPipeline = function () { return ' + NS + '._glPipeline; };\n' +
      '  api.getGPUPipeline = function () { return ' + NS + '._gpuPipeline; };\n' +
      '  api.getWorkerPool = function () { return ' + NS + '._workerPool; };\n' +
      '  window.VEFilterGraph = api;\n' +
      '})();\n\n' +
      '// Modular skeleton hook (Faz 8) — register the group parent (children self-register under it).\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 've-filter-graph', parent: 'video', title: 've-filter-graph', mount: function () {}, unmount: function () {} });\n";
  }
});
