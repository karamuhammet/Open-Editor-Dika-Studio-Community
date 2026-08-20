/* Module: video/ve-performance/core — Lifecycle (init/destroy) + smart per-frame processing dispatcher.
   Part of the ve-performance group (decomposed from the 1654-line IIFE). Functions hang off the
   shared namespace VEP (window.__ccVEPerformance, created by the parent); cross-module refs resolve
   through VEP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEP = window.__ccVEPerformance;
  if (!VEP) return;

  VEP.init = function () {
    // Initialize WebGL pipeline
    VEP.WebGLPipeline.init();

    // Initialize worker pool
    VEP.WorkerPool.init();

    // Initialize memory monitor
    VEP.MemoryMonitor.init();

    // Try WebGPU (async, non-blocking)
    VEP.WebGPUPipeline.init().catch(function() {});

    console.log('[VEPerformance] Initialized — WebGL' + (VEP.WebGLPipeline.isAvailable() ? VEP.WebGLPipeline.getVersion() : ' unavailable') +
      ', Workers: ' + VEP.WorkerPool._workers.length +
      ', WebGPU: ' + (VEP.WebGPUPipeline.isAvailable() ? 'yes' : 'pending/no'));
  };

  VEP.destroy = function () {
    VEP.WorkerPool.destroy();
    VEP.WebGLPipeline.destroy();
    VEP.WebGPUPipeline.destroy();
    VEP.FrameCacheAdvanced.clear();
  };

  // Can the GPU carry a FULL grade? Needs WebGL2 (sampler3D), the compiled 3D-LUT program, and
  // VEColorGrading to bake the cube from. WebGL1 has no sampler3D, so grading stays on the CPU there.
  VEP.canGradeOnGPU = function () {
    return !!(VEP.WebGLPipeline && VEP.WebGLPipeline.canGradeOnGPU && VEP.WebGLPipeline.canGradeOnGPU());
  };

  VEP.processFrameSmart = function (source, w, h, chromaSettings, gradingSettings, windows) {
    // Try WebGL first (fastest)
    if (VEP.WebGLPipeline.isAvailable()) {
      var result = VEP.WebGLPipeline.processFrame(source, w, h, chromaSettings, gradingSettings, windows);
      if (result) return { canvas: result, backend: 'webgl' };
    }

    // Fallback: CPU single-pass. It has no power-window support: a window is a GPU-only feature
    // (WebGL2 sampler3D), and the caller only sends windows when canGradeOnGPU() is true, so this
    // reports `windows: false` rather than silently rendering an ungraded window and looking fine.
    var cpuResult = VEP.SinglePassProcessor.process(source, 0, 0, w, h, chromaSettings, gradingSettings);
    if (cpuResult) return { canvas: cpuResult, backend: 'cpu', windows: false };

    return null;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'core', parent: 'video.ve-performance', title: 've-performance: core', mount: function () {}, unmount: function () {} });
  }
})();
