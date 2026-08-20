/* ============================================================
   ve-audio-advanced — GROUP PARENT (decomposed)
   Advanced audio DSP IIFE split per concern. Shared state (AudioContext, worklets,
   MasterBus, clip chains) lives on VAA = window.__ccVEAudioAdvanced; each child attaches
   its functions as VAA.<name> (call-time cross-refs, load-order-proof). Public API stays
   window.VEAudioAdvanced (lazy getters → VAA; the video editor calls .init() on demand).
   ============================================================ */
(function () {
  'use strict';

  var VAA = window.__ccVEAudioAdvanced || (window.__ccVEAudioAdvanced = {});

  // ── shared state + singletons (were the IIFE private vars) ──
  VAA._ctx = null; // AudioContext — shared with VEAudioEngine
  VAA._workletsLoaded = false;
  VAA._workletLoadPromise = null;
  VAA.MasterBus = {
    _chain: null,
    _eq: null,
    _compressor: null,
    _limiter: null,
    _lufsMeter: null,
    _initialized: false,

    init: function(ctx) {
      if (this._initialized) return;
      ctx = ctx || VAA._getCtx();

      this._chain = new VAA.AudioChain(ctx);
      this._eq = new VAA.ParametricEQ(ctx);
      this._compressor = new VAA.Compressor(ctx, { threshold: -12, ratio: 3, autoMakeup: true });
      this._limiter = new VAA.Compressor(ctx, { threshold: -1, ratio: 20, attack: 0.001, release: 0.05, knee: 0, autoMakeup: false });
      this._lufsMeter = new VAA.LUFSMeter(ctx);

      this._chain.add('masterEQ', this._eq, 'eq');
      this._chain.add('masterComp', this._compressor, 'compressor');
      this._chain.add('masterLimiter', this._limiter, 'limiter');
      this._chain.add('masterLUFS', this._lufsMeter, 'meter');

      this._initialized = true;
    },

    getInput: function() { return this._chain ? this._chain.getInput() : null; },
    getOutput: function() { return this._chain ? this._chain.getOutput() : null; },
    getEQ: function() { return this._eq; },
    getCompressor: function() { return this._compressor; },
    getLimiter: function() { return this._limiter; },
    getLUFSMeter: function() { return this._lufsMeter; },
    getChain: function() { return this._chain; },

    startMetering: function() {
      if (this._lufsMeter) this._lufsMeter.start();
    },

    stopMetering: function() {
      if (this._lufsMeter) this._lufsMeter.stop();
    },

    dispose: function() {
      if (this._chain) this._chain.dispose();
      this._initialized = false;
    }
  };
  VAA._clipChains = {}; // clipId → VAA.AudioChain instance

  // ── public API: window.VEAudioAdvanced — lazy getters → VAA ──
  var api = {};
  ["init","dispose","loadWorklets","ParametricEQ","AudioChain","Compressor","NoiseGate","FadeEnvelope","StereoPan","LUFSMeter","ReverbEngine","AudioDucker","DeEsser","renderOffline","audioBufferToWav","normalizeToLUFS","MasterBus","createClipChain","getClipChain","disposeClipChain","disposeAllClipChains"].forEach(function (n) {
    Object.defineProperty(api, n, { get: function () { return VAA[n]; }, enumerable: true });
  });
  window.VEAudioAdvanced = api;
})();

if (window.cc && cc.modules) cc.modules.register({ id: 've-audio-advanced', parent: 'video', title: 've-audio-advanced', mount: function () {}, unmount: function () {} });
