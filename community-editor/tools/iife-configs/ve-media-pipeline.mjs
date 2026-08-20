/* Decompose modules/video/ve-media-pipeline/ve-media-pipeline.js (1384-line IIFE, media import
   pipeline). Namespace VMP. Mix of functions, class-vars, prototype classes (BaseDemuxer +
   NativeDemuxer inheriting it), consts/state. Single window.VEMediaPipeline (lazy). */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/video/ve-media-pipeline';
const NS = 'VMP';
const DESC = {
  format: 'Format detection / probe / validation / mime.',
  thumbnails: 'Thumbnail generation + IndexedDB cache.',
  demux: 'Demuxers (Packet, BaseDemuxer, NativeDemuxer + factory) + lazy decode / stream read.',
  framecache: 'Decoded-frame LRU cache + memory budget.',
  proxy: 'Proxy (low-res) media workflow.',
  waveform: 'Audio waveform extraction / render / peaks + cache.'
};
const EXPORT_MAP = {
  detectFormat: '_mpDetectFormat', canPlay: '_mpCanPlay', probe: 'MediaProbe', validate: '_mpValidateImport',
  generateThumbnails: '_mpGenerateThumbnails', generateThumbnailsWebCodecs: '_mpGenerateThumbnailsWebCodecs',
  thumbnailCache: 'ThumbnailCache', frameCache: 'FrameCache', lazyDecode: '_mpLazyDecode', streamRead: '_mpStreamRead',
  memoryBudget: 'MemoryBudget', proxy: 'ProxyManager', extractWaveform: '_mpExtractWaveform',
  renderWaveform: '_mpRenderWaveform', getPeaksForZoom: '_mpGetPeaksForZoom', waveformCache: 'WaveformCache',
  formatDuration: '_mpFormatDuration', buildMime: '_mpBuildMime',
  MAX_FILE_SIZE: 'MAX_FILE_SIZE', THUMB_WIDTH: 'THUMB_WIDTH', THUMB_HEIGHT: 'THUMB_HEIGHT'
};
run({
  src: DIR + '/ve-media-pipeline.js',
  parentFile: DIR + '/ve-media-pipeline.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccVEMediaPipeline',
  parentId: 've-media-pipeline',
  idPrefix: 've-mp',
  parentDotted: 'video.ve-media-pipeline',
  childComment: g => 'video/ve-media-pipeline/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    format: ['_mpDetectFormat', '_mpCanPlay', '_mpBuildMime', '_mpGuessCodecFromFormat', '_mpValidateImport', '_mpFormatDuration', 'MediaProbe'],
    thumbnails: ['_mpOpenThumbDB', '_mpGenerateThumbnails', '_mpGenerateThumbnailsCore', '_mpGenerateThumbnailsWebCodecs', 'ThumbnailCache'],
    demux: ['Packet', 'BaseDemuxer', 'NativeDemuxer', 'DemuxerFactory', '_mpLazyDecode', '_mpStreamRead'],
    framecache: ['FrameCache', 'MemoryBudget'],
    proxy: ['_mpOpenProxyDB', 'ProxyManager'],
    waveform: ['_mpOpenWaveDB', '_mpExtractWaveform', '_mpRenderWaveform', '_mpGetPeaksForZoom', 'WaveformCache']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   ve-media-pipeline — GROUP PARENT (decomposed)\n' +
      '   Media import pipeline IIFE split per stage. Shared consts/state (mime maps, IndexedDB\n' +
      '   handles, size limits) stay on the parent; class-vars (MediaProbe, ThumbnailCache,\n' +
      '   DemuxerFactory, FrameCache, MemoryBudget, ProxyManager, WaveformCache) + functions go to\n' +
      '   children. NativeDemuxer inherits BaseDemuxer (same child, source-ordered). Public API stays\n' +
      '   window.VEMediaPipeline (lazy getters → ' + NS + '; the video editor calls it on import).\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccVEMediaPipeline || (window.__ccVEMediaPipeline = {});\n\n' +
      (stateLines.trim() ? '  // ── shared consts + state ──\n' + stateLines + '\n\n' : '') +
      '  // ── public API: window.VEMediaPipeline — lazy getters → ' + NS + ' (aliased + 1 method) ──\n' +
      '  var api = {}, map = ' + JSON.stringify(EXPORT_MAP) + ';\n' +
      '  Object.keys(map).forEach(function (k) {\n' +
      '    Object.defineProperty(api, k, { get: (function (n) { return function () { return ' + NS + '[n]; }; })(map[k]), enumerable: true });\n' +
      '  });\n' +
      "  Object.defineProperty(api, 'createDemuxer', { get: function () { return " + NS + '.DemuxerFactory ? ' + NS + '.DemuxerFactory.create : undefined; }, enumerable: true });\n' +
      '  window.VEMediaPipeline = api;\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 've-media-pipeline', parent: 'video', title: 've-media-pipeline', mount: function () {}, unmount: function () {} });\n";
  }
});
