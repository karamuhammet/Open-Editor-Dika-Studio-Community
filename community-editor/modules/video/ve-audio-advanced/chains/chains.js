/* Module: video/ve-audio-advanced/chains — Per-clip processing chain management.
   Part of the ve-audio-advanced group (decomposed from the 1696-line IIFE). Functions hang off the
   shared namespace VAA (window.__ccVEAudioAdvanced, created by the parent); cross-module refs resolve
   through VAA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VAA = window.__ccVEAudioAdvanced;
  if (!VAA) return;

  VAA.createClipChain = function (clipId, settings) {
    var ctx = VAA._getCtx();
    var chain = new VAA.AudioChain(ctx);
    settings = settings || {};

    // Parametric EQ
    var eq = new VAA.ParametricEQ(ctx);
    if (settings.eq) eq.fromJSON(settings.eq);
    chain.add('eq', eq, 'eq');

    // VAA.Compressor
    if (settings.compressor) {
      var comp = new VAA.Compressor(ctx, settings.compressor);
      chain.add('compressor', comp, 'compressor');
    }

    // Noise Gate
    if (settings.noiseGate) {
      var gate = new VAA.NoiseGate(ctx, settings.noiseGate);
      chain.add('noiseGate', gate, 'noiseGate');
    }

    // Fade Envelope
    var fade = new VAA.FadeEnvelope(ctx);
    chain.add('fade', fade, 'fade');

    // Pan
    var pan = new VAA.StereoPan(ctx);
    if (settings.pan !== undefined) pan.setPan(settings.pan);
    chain.add('pan', pan, 'pan');

    // De-esser
    if (settings.deEsser) {
      var deEsser = new VAA.DeEsser(ctx);
      deEsser.fromJSON(settings.deEsser);
      chain.add('deEsser', deEsser, 'deEsser');
    }

    // Reverb
    if (settings.reverb) {
      var reverb = new VAA.ReverbEngine(ctx);
      reverb.fromJSON(settings.reverb);
      chain.add('reverb', reverb, 'reverb');
    }

    VAA._clipChains[clipId] = chain;
    return chain;
  };

  VAA.getClipChain = function (clipId) {
    return VAA._clipChains[clipId] || null;
  };

  VAA.disposeClipChain = function (clipId) {
    if (VAA._clipChains[clipId]) {
      VAA._clipChains[clipId].dispose();
      delete VAA._clipChains[clipId];
    }
  };

  VAA.disposeAllClipChains = function () {
    for (var id in VAA._clipChains) {
      VAA._clipChains[id].dispose();
    }
    VAA._clipChains = {};
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'chains', parent: 'video.ve-audio-advanced', title: 've-audio-advanced: chains', mount: function () {}, unmount: function () {} });
  }
})();
