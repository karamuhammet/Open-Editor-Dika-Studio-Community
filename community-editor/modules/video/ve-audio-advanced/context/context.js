/* Module: video/ve-audio-advanced/context — AudioContext + worklet loading + init/dispose lifecycle.
   Part of the ve-audio-advanced group (decomposed from the 1696-line IIFE). Functions hang off the
   shared namespace VAA (window.__ccVEAudioAdvanced, created by the parent); cross-module refs resolve
   through VAA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VAA = window.__ccVEAudioAdvanced;
  if (!VAA) return;

  VAA._getCtx = function () {
    if (VAA._ctx) return VAA._ctx;
    if (window.VEAudioEngine && VEAudioEngine.ensureContext) {
      VEAudioEngine.ensureContext();
      // Access the AudioContext through the analyser node
      var analyser = VEAudioEngine.getAnalyser && VEAudioEngine.getAnalyser();
      if (analyser) VAA._ctx = analyser.context;
    }
    if (!VAA._ctx) {
      VAA._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return VAA._ctx;
  };

  VAA.loadWorklets = function () {
    if (VAA._workletLoadPromise) return VAA._workletLoadPromise;
    var ctx = VAA._getCtx();
    if (!ctx.audioWorklet || !ctx.audioWorklet.addModule) {
      console.warn('[VEAudioAdvanced] AudioWorklet API not available — using fallback');
      VAA._workletsLoaded = false;
      return Promise.resolve(false);
    }
    VAA._workletLoadPromise = Promise.all([
      ctx.audioWorklet.addModule('js/worklets/lufs-processor.js'),
      ctx.audioWorklet.addModule('js/worklets/noise-gate-processor.js'),
      ctx.audioWorklet.addModule('js/worklets/compressor-processor.js')
    ]).then(function() {
      VAA._workletsLoaded = true;
      console.log('[VEAudioAdvanced] AudioWorklet processors loaded');
      return true;
    }).catch(function(err) {
      console.warn('[VEAudioAdvanced] AudioWorklet load failed, using fallback:', err);
      VAA._workletsLoaded = false;
      return false;
    });
    return VAA._workletLoadPromise;
  };

  VAA.init = function () {
    var ctx = VAA._getCtx();
    // Load AudioWorklet processors (async, non-blocking)
    VAA.loadWorklets().then(function(ok) {
      // Re-VAA.init VAA.MasterBus after worklets are loaded so processors use worklet path
      if (ok && VAA.MasterBus._initialized) {
        VAA.MasterBus.dispose();
        VAA.MasterBus._initialized = false;
        VAA.MasterBus.init(ctx);
        console.log('[VEAudioAdvanced] VAA.MasterBus re-initialized with AudioWorklet processors');
      }
    });
    VAA.MasterBus.init(ctx);
    console.log('[VEAudioAdvanced] Initialized — sampleRate:', ctx.sampleRate);
  };

  VAA.dispose = function () {
    VAA.MasterBus.dispose();
    VAA.disposeAllClipChains();
    VAA._ctx = null;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'context', parent: 'video.ve-audio-advanced', title: 've-audio-advanced: context', mount: function () {}, unmount: function () {} });
  }
})();
