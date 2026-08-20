/* Decompose modules/video/ve-audio-advanced/ve-audio-advanced.js (1695-line IIFE, advanced audio
   DSP). Namespace VAA = window.__ccVEAudioAdvanced. Single window.VEAudioAdvanced object (lazy:
   the video editor calls .init()). 23 fns, 0 prototypes (DSP "classes" use this.x closures). */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/video/ve-audio-advanced';
const NS = 'VAA';
const DESC = {
  context: 'AudioContext + worklet loading + init/dispose lifecycle.',
  processors: 'DSP nodes — EQ, chain, compressor, gate, fade, pan, reverb, ducker, de-esser.',
  metering: 'LUFS metering + loudness normalization.',
  chains: 'Per-clip processing chain management.',
  offline: 'Offline render + WAV encode.'
};
const EXPORT_KEYS = ['init', 'dispose', 'loadWorklets', 'ParametricEQ', 'AudioChain', 'Compressor',
  'NoiseGate', 'FadeEnvelope', 'StereoPan', 'LUFSMeter', 'ReverbEngine', 'AudioDucker', 'DeEsser',
  'renderOffline', 'audioBufferToWav', 'normalizeToLUFS', 'MasterBus', 'createClipChain',
  'getClipChain', 'disposeClipChain', 'disposeAllClipChains'];
run({
  src: DIR + '/ve-audio-advanced.js',
  parentFile: DIR + '/ve-audio-advanced.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccVEAudioAdvanced',
  parentId: 've-audio-advanced',
  idPrefix: 've-aud',
  parentDotted: 'video.ve-audio-advanced',
  childComment: g => 'video/ve-audio-advanced/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    context: ['_getCtx', 'loadWorklets', 'init', 'dispose'],
    processors: ['ParametricEQ', 'AudioChain', 'Compressor', 'NoiseGate', 'FadeEnvelope', 'StereoPan', 'ReverbEngine', 'AudioDucker', 'DeEsser'],
    metering: ['LUFSMeter', 'normalizeToLUFS'],
    chains: ['createClipChain', 'getClipChain', 'disposeClipChain', 'disposeAllClipChains'],
    offline: ['renderOffline', '_scheduleClipOffline', 'audioBufferToWav', '_writeString']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   ve-audio-advanced — GROUP PARENT (decomposed)\n' +
      '   Advanced audio DSP IIFE split per concern. Shared state (AudioContext, worklets,\n' +
      '   MasterBus, clip chains) lives on ' + NS + ' = window.__ccVEAudioAdvanced; each child attaches\n' +
      '   its functions as ' + NS + '.<name> (call-time cross-refs, load-order-proof). Public API stays\n' +
      '   window.VEAudioAdvanced (lazy getters → ' + NS + '; the video editor calls .init() on demand).\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccVEAudioAdvanced || (window.__ccVEAudioAdvanced = {});\n\n' +
      '  // ── shared state + singletons (were the IIFE private vars) ──\n' +
      stateLines + '\n\n' +
      '  // ── public API: window.VEAudioAdvanced — lazy getters → ' + NS + ' ──\n' +
      '  var api = {};\n' +
      '  ' + JSON.stringify(EXPORT_KEYS) + '.forEach(function (n) {\n' +
      '    Object.defineProperty(api, n, { get: function () { return ' + NS + '[n]; }, enumerable: true });\n' +
      '  });\n' +
      '  window.VEAudioAdvanced = api;\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 've-audio-advanced', parent: 'video', title: 've-audio-advanced', mount: function () {}, unmount: function () {} });\n";
  }
});
