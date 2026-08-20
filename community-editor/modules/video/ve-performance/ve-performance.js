/* ============================================================
   ve-performance — GROUP PARENT (decomposed)
   Render-performance engine IIFE split per layer. The processor "classes" are big top-level
   vars, distributed to children. Shared namespace VEP = window.__ccVEPerformance; cross-
   refs resolve at call time. Public API stays window.VEPerformance (lazy getters → VEP;
   the video editor calls .init()/.processFrame() on demand).
   ============================================================ */
(function () {
  'use strict';

  var VEP = window.__ccVEPerformance || (window.__ccVEPerformance = {});

  // ── public API: window.VEPerformance — lazy getters → VEP (some keys aliased) ──
  var api = {}, map = {"init":"init","destroy":"destroy","processFrame":"processFrameSmart","canGradeOnGPU":"canGradeOnGPU","SinglePassProcessor":"SinglePassProcessor","LUTBaker":"LUTBaker","FrameSkipManager":"FrameSkipManager","DirtyRegionTracker":"DirtyRegionTracker","WorkerPool":"WorkerPool","WebGLPipeline":"WebGLPipeline","FrameCache":"FrameCacheAdvanced","TextureAtlas":"TextureAtlas","MemoryMonitor":"MemoryMonitor","WebGPUPipeline":"WebGPUPipeline","Benchmark":"Benchmark"};
  Object.keys(map).forEach(function (k) {
    Object.defineProperty(api, k, { get: (function (n) { return function () { return VEP[n]; }; })(map[k]), enumerable: true });
  });
  window.VEPerformance = api;
})();

if (window.cc && cc.modules) cc.modules.register({ id: 've-performance', parent: 'video', title: 've-performance', mount: function () {}, unmount: function () {} });
