/* Config for decomposing modules/video/video-editor/video-editor.js (7694-line IIFE, the main
   multi-track timeline video editor). Namespace VE = window.__ccVideoEditor. 148 functions across
   13 sub-systems → children; shared state + the window.VideoEditor public API + the load-time
   command-registration live in the parent. Init is LAZY (VideoEditor.activate() → _veInit on first
   open), so no canvas-ready poll is needed. */
import { run } from '../decompose-iife.mjs';

const DIR = 'modules/video/video-editor';
const NS = 'VE';

const DESC = {
  timing: 'TIMING helpers — uid, PTS↔seconds, frame snap, timecode formatting, html-escape.',
  project: 'PROJECT — init, default tracks, serialize/restore, per-page save/load, duration.',
  preview: 'PREVIEW CANVAS — build/show/size the preview surface + background bridge.',
  render: 'TIMELINE RENDER — build the timeline HTML, ruler, track headers, clips, time display.',
  playback: 'PLAYBACK — seek, frame cache (LRU), frame-accurate seek, volumes, play/pause loop.',
  'preview-render': 'PREVIEW RENDER — the frame compositor: filters, pixel effects, overlay sync/transition.',
  clips: 'CLIP OPS — split/cut/delete/duplicate/move/drag/trim, snap, copy/paste, overlap finding.',
  import: 'IMPORT — drop/file/image import, thumbnails, waveform, mini-timeline.',
  'undo-markers': 'UNDO + MARKERS — undo/redo stack and the marker system.',
  events: 'EVENTS — zoom/track add, event binding, activate/deactivate, file picker, the keydown shortcuts.',
  'advanced-panels': 'ADVANCED PANELS — LUT browser, plugin manager UIs.',
  'clip-edit': 'CLIP EDIT — link, slip/slide, freeze, speed ramp, filter/transform/transition.',
  export: 'EXPORT — the export modal + WebCodecs export pipeline + command registration.'
};

// window.VideoEditor public method → internal fn name (built into lazy getters in the parent)
const EXPORT_MAP = {
  activate: '_veActivate', deactivate: '_veDeactivate', isActive: '_veIsActive', play: '_vePlay',
  pause: '_vePause', togglePlay: '_veTogglePlay', seek: '_veSeek', split: '_veSplitAtPlayhead',
  throughCut: '_veThroughCut', deleteSelected: '_veDeleteSelected', copySelected: '_veCopySelected',
  pasteClips: '_vePasteClips', undo: '_veUndo', redo: '_veRedo', beginUndoGroup: '_veBeginUndoGroup',
  endUndoGroup: '_veEndUndoGroup', setZoom: '_veSetZoom', addTrack: '_veAddTrack', openFilePicker: '_veOpenFilePicker',
  importMediaFile: '_veImportMediaFile', render: '_veRender', setFilter: '_veSetClipFilter',
  setTransform: '_veSetClipTransform', rotateClip: '_veRotateClip', flipClip: '_veFlipClip',
  setTransition: '_veSetTransition', showExport: '_veShowExportModal', setClipSpeed: '_veSetClipSpeed',
  addMarker: '_veAddMarker', deleteMarker: '_veDeleteMarker', seekToPrevMarker: '_veSeekToPrevMarker',
  seekToNextMarker: '_veSeekToNextMarker', resetProject: '_veResetToFresh', toggleSnap: '_veToggleSnap',
  toggleRazorMode: '_veToggleRazorMode', toggleTimecodeMode: '_veToggleTimecodeMode', toPTS: '_veToPTS',
  fromPTS: '_veFromPTS', formatTimecode: '_veFormatTimecode', snapToFrame: '_veSnapToFrame',
  hasWebCodecs: '_veHasWebCodecs', buildKeyframeIndex: '_veBuildKeyframeIndex', frameAccurateSeek: '_veFrameAccurateSeek',
  linkClips: '_veLinkClips', unlinkClips: '_veUnlinkClips', getLinkedClips: '_veGetLinkedClips',
  slipEdit: '_veSlipEdit', slideEdit: '_veSlideEdit', freezeFrame: '_veFreezeFrame', createSpeedRamp: '_veCreateSpeedRamp',
  addRangeMarker: '_veAddRangeMarker', addChapterMarker: '_veAddChapterMarker', toggleTodoMarker: '_veToggleTodoMarker',
  saveForPage: '_veSaveForPage', loadForPage: '_veLoadForPage', hasProjectForPage: '_veHasProjectForPage',
  findClipById: '_findClipById', renderPreview: '_veRenderPreviewFrame', syncPreviewSize: '_veSyncPreviewSize',
  enforceDimensions: '_veEnforceDimensions'
};

run({
  src: DIR + '/video-editor.js',
  parentFile: DIR + '/video-editor.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccVideoEditor',
  parentId: 'video-editor',
  idPrefix: 'veditor',
  parentDotted: 'video.video-editor',
  childComment: g => 'video/video-editor/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  rawBlocks: [{ start: 6309, end: 6494, group: 'events' }],   // the load-time keydown shortcut handler
  groups: {
    timing: ['_veUid', '_veToPTS', '_veFromPTS', '_veSnapToFrame', '_veFormatTimecode', '_veFormatTime', '_esc'],
    project: ['_veInit', '_veBuildDefaultTracks', '_veSerializeProject', '_veRestoreProject', '_veResetToFresh',
      '_veSaveForPage', '_veLoadForPage', '_veHasProjectForPage', '_veRecalcDuration', '_veProjectHasAudio'],
    preview: ['_veBuildPreviewCanvas', '_veShowPreviewCanvas', '_veEnforceDimensions', '_veSyncPreviewSize',
      '_veAttachPreviewBg', '_veDetachPreviewBg', '_veSyncLayoutPadding'],
    render: ['_veBuildTimelineHTML', '_veIcon', '_veRender', '_veRenderRuler', '_veRulerStep', '_veRenderTrackHeaders',
      '_veShowTrackProperties', '_veRenderTracks', '_veRenderClip', '_veUpdateTimeDisplay', '_veToggleTimecodeMode', '_veUpdatePlayhead'],
    playback: ['_veSeek', '_veLRUGet', '_veLRUPut', '_veLRUClear', '_veHasWebCodecs', '_veBuildKeyframeIndex',
      '_veFrameAccurateSeek', '_veEvictFrameCache', '_veFindPrevClipBoundary', '_veFindNextClipBoundary',
      '_veApplyVolumes', '_veConnectAllClipsToAudio', '_vePlay', '_vePause', '_veTogglePlay', '_vePlaybackLoop', '_veUpdatePlayButton'],
    'preview-render': ['_veRenderWaveform', '_veBuildFilterString', '_veBuildOverlayFilterCSS', '_veFitRect',
      '_veLoopLocalTime', '_veApplyPixelEffects', '_veRenderPreviewFrame', '_veAutoScrollPlayhead', '_veBindScrollSync',
      '_veBindOverlaySync', '_veApplyOverlayTransition', '_veSyncOverlayVisibility', '_veSelectOverlayObject'],
    clips: ['_veHasOverlap', '_veFindNonOverlapTrack', '_veFindEmptyTrack', '_veEnsureAudioTrack', '_veSplitAtPlayhead',
      '_veThroughCut', '_veToggleRazorMode', '_veRazorClick', '_veDeleteSelected', '_veDuplicateSelected', '_veMoveClipTrack',
      '_veCloneClip', '_veStartClipDrag', '_veFindTrackByClip', '_findClipById', '_veSnapTime', '_veShowSnapGuide',
      '_veClearSnapGuides', '_veToggleSnap', '_veCopySelected', '_vePasteClips', '_veStartTrim'],
    import: ['_veHandleDrop', '_veImportFile', '_veImportFileCore', '_veImportImageAsClip', '_veImportImageFromDataUrl',
      '_veGenerateThumbnails', '_veRenderMiniTimeline', '_veGenerateWaveform'],
    'undo-markers': ['_vePushUndo', '_veBeginUndoGroup', '_veEndUndoGroup', '_veAddMarker', '_veAddRangeMarker',
      '_veAddChapterMarker', '_veToggleTodoMarker', '_veDeleteMarker', '_veSeekToPrevMarker', '_veSeekToNextMarker',
      '_veShowMarkerMenu', '_veUndo', '_veRedo'],
    events: ['_veSetZoom', '_veAddTrack', '_veBindEvents', '_veRulerSeek', '_veShowAddTrackMenu', '_veActivate',
      '_veDeactivate', '_veIsActive', '_veOpenFilePicker', '_veImportMediaFile'],
    'advanced-panels': ['_veShowLutBrowser', '_veShowPluginManager'],
    'clip-edit': ['_veLinkClips', '_veUnlinkClips', '_veGetLinkedClips', '_veSlipEdit', '_veSlideEdit', '_veFreezeFrame',
      '_veCreateSpeedRamp', '_veDetachAudio', '_veSetClipSpeed', '_veSetClipFilter', '_veGetClipFilterCSS',
      '_veSetClipTransform', '_veRotateClip', '_veFlipClip', '_veSetTransition'],
    export: ['_veShowExportModal', '_veCreateExportSnapshot', '_veDisposeExportSnapshot', '_veExportRenderFrame',
      '_veStartWebCodecsExport', '_veExportResetUI', '_veExportMinimize', '_veExportExpand', '_veExportPipClose',
      '_veExportPipSync', '_veRegisterCommands']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   Video Editor — GROUP PARENT (decomposed)\n' +
      '   The 7694-line multi-track timeline editor IIFE was split into 13 sub-systems (timing /\n' +
      '   project / preview / render / playback / preview-render / clips / import / undo-markers /\n' +
      '   events / advanced-panels / clip-edit / export). Shared state lives on ONE namespace object\n' +
      '   ' + NS + ' = window.__ccVideoEditor; each child attaches its functions as ' + NS + '.<name> and\n' +
      '   references siblings through ' + NS + ' at call time → load-order-proof, no globals. The public\n' +
      '   API stays  window.VideoEditor  (lazy getters → ' + NS + '), so pages.js + every caller (which\n' +
      '   call VideoEditor.activate()/saveForPage()/… at runtime) are unchanged. Init is lazy\n' +
      '   (activate() → _veInit on first open), so no load-time init poll is needed.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccVideoEditor || (window.__ccVideoEditor = {});\n\n' +
      '  // ── shared state + constants (were the IIFE private vars) ──\n' +
      stateLines + '\n\n' +
      '  // ── public API: window.VideoEditor — lazy getters → ' + NS + ' for the method refs (load-order-\n' +
      '  //    proof), inline closures for state reads, and the sibling-module bridges (read at load,\n' +
      '  //    when the ve-* siblings are already loaded — video-editor is the last video child). ──\n' +
      '  var _veApi = {};\n' +
      '  var _veMap = ' + JSON.stringify(EXPORT_MAP, null, 0) + ';\n' +
      '  Object.keys(_veMap).forEach(function (k) {\n' +
      '    Object.defineProperty(_veApi, k, { get: (function (n) { return function () { return ' + NS + '[n]; }; })(_veMap[k]), enumerable: true });\n' +
      '  });\n' +
      '  _veApi.getProject = function () { return ' + NS + '._veProject; };\n' +
      '  _veApi.getMediaElement = function (clipId) { return ' + NS + '._vePlayback.videoPool[clipId] || null; };\n' +
      '  _veApi.getSelectedClips = function () { return ' + NS + '._veSelectedClips.slice(); };\n' +
      '  _veApi.mediaPipeline = window.VEMediaPipeline || null;\n' +
      '  _veApi.performance = window.VEPerformance || null;\n' +
      '  _veApi.audioAdvanced = window.VEAudioAdvanced || null;\n' +
      '  _veApi.filterGraph = window.VEFilterGraph || null;\n' +
      '  _veApi.advancedFeatures = window.VEAdvancedFeatures || null;\n' +
      '  window.VideoEditor = _veApi;\n\n' +
      '  // ── register video-editor keyboard commands once BOTH the KBM (registerCommand) and the\n' +
      '  //    export child (' + NS + '._veRegisterCommands) are loaded (poll; give up after 10s) ──\n' +
      '  function _veTryRegisterCommands() {\n' +
      "    if (typeof registerCommand === 'function' && typeof " + NS + "._veRegisterCommands === 'function') { " + NS + '._veRegisterCommands(); return true; }\n' +
      '    return false;\n' +
      '  }\n' +
      '  if (!_veTryRegisterCommands()) {\n' +
      '    var _veKbmCheck = setInterval(function () { if (_veTryRegisterCommands()) clearInterval(_veKbmCheck); }, 500);\n' +
      '    setTimeout(function () { clearInterval(_veKbmCheck); }, 10000);\n' +
      '  }\n' +
      '})();\n\n' +
      '// Modular skeleton hook — register the group parent (children self-register under it).\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'video-editor', parent: 'video', title: 'video-editor', mount: function () {}, unmount: function () {} });\n";
  }
});
