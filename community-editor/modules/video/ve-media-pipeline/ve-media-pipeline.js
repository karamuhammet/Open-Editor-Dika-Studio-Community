/* ============================================================
   ve-media-pipeline — GROUP PARENT (decomposed)
   Media import pipeline IIFE split per stage. Shared consts/state (mime maps, IndexedDB
   handles, size limits) stay on the parent; class-vars (MediaProbe, ThumbnailCache,
   DemuxerFactory, FrameCache, MemoryBudget, ProxyManager, WaveformCache) + functions go to
   children. NativeDemuxer inherits BaseDemuxer (same child, source-ordered). Public API stays
   window.VEMediaPipeline (lazy getters → VMP; the video editor calls it on import).
   ============================================================ */
(function () {
  'use strict';

  var VMP = window.__ccVEMediaPipeline || (window.__ccVEMediaPipeline = {});

  // ── shared consts + state ──
  VMP.MAGIC_BYTES = [
    { format: 'mp4',  offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
    { format: 'webm', offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] }, // EBML
    { format: 'mkv',  offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] }, // EBML (same as WebM)
    { format: 'avi',  offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (needs WAVE check)
    { format: 'flv',  offset: 0, bytes: [0x46, 0x4C, 0x56, 0x01] }, // FLV\1
    { format: 'wav',  offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF + WAVE
    { format: 'mp3',  offset: 0, bytes: [0xFF, 0xFB] },
    { format: 'mp3b', offset: 0, bytes: [0xFF, 0xF3] },
    { format: 'mp3c', offset: 0, bytes: [0xFF, 0xF2] },
    { format: 'id3',  offset: 0, bytes: [0x49, 0x44, 0x33] },       // ID3 (MP3)
    { format: 'flac', offset: 0, bytes: [0x66, 0x4C, 0x61, 0x43] }, // fLaC
    { format: 'ogg',  offset: 0, bytes: [0x4F, 0x67, 0x67, 0x53] }, // OggS
    { format: 'png',  offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] },
    { format: 'jpeg', offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
    { format: 'gif',  offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
    { format: 'webp', offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }  // RIFF + WEBP
  ];
  VMP.MIME_MAP = {
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi', 'video/x-flv': 'flv',
    'video/ogg': 'ogg', 'video/3gpp': '3gp', 'video/3gpp2': '3g2',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav',
    'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg',
    'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
    'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif',
    'image/webp': 'webp'
  };
  VMP.MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024;
  VMP.WARN_FILE_SIZE = 500 * 1024 * 1024;
  VMP.THUMB_WIDTH = 80;
  VMP.THUMB_HEIGHT = 45;
  VMP.THUMB_QUALITY = 0.5;
  VMP.THUMB_MAX_COUNT = 40;
  VMP.THUMB_MIN_COUNT = 3;
  VMP._mpThumbDB = null;
  VMP._mpThumbDBName = 'dika_ve_thumbnails';
  VMP._mpThumbDBVersion = 1;
  VMP.FRAME_CACHE_MAX = 100;
  VMP._mpFrameCache = {};  // clipId_frameIndex → ImageBitmap
  VMP._mpFrameCacheOrder = [];
  VMP._mpFrameCacheSize = 0;
  VMP._mpProxyDBName = 'dika_ve_proxies';
  VMP._mpProxyDB = null;
  VMP._mpWaveDB = null;
  VMP._mpWaveDBName = 'dika_ve_waveforms';

  // ── public API: window.VEMediaPipeline — lazy getters → VMP (aliased + 1 method) ──
  var api = {}, map = {"detectFormat":"_mpDetectFormat","canPlay":"_mpCanPlay","probe":"MediaProbe","validate":"_mpValidateImport","generateThumbnails":"_mpGenerateThumbnails","generateThumbnailsWebCodecs":"_mpGenerateThumbnailsWebCodecs","thumbnailCache":"ThumbnailCache","frameCache":"FrameCache","lazyDecode":"_mpLazyDecode","streamRead":"_mpStreamRead","memoryBudget":"MemoryBudget","proxy":"ProxyManager","extractWaveform":"_mpExtractWaveform","renderWaveform":"_mpRenderWaveform","getPeaksForZoom":"_mpGetPeaksForZoom","waveformCache":"WaveformCache","formatDuration":"_mpFormatDuration","buildMime":"_mpBuildMime","MAX_FILE_SIZE":"MAX_FILE_SIZE","THUMB_WIDTH":"THUMB_WIDTH","THUMB_HEIGHT":"THUMB_HEIGHT"};
  Object.keys(map).forEach(function (k) {
    Object.defineProperty(api, k, { get: (function (n) { return function () { return VMP[n]; }; })(map[k]), enumerable: true });
  });
  Object.defineProperty(api, 'createDemuxer', { get: function () { return VMP.DemuxerFactory ? VMP.DemuxerFactory.create : undefined; }, enumerable: true });
  window.VEMediaPipeline = api;
})();

if (window.cc && cc.modules) cc.modules.register({ id: 've-media-pipeline', parent: 'video', title: 've-media-pipeline', mount: function () {}, unmount: function () {} });
