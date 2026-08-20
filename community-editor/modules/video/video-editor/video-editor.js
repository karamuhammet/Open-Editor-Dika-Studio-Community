/* ============================================================
   Video Editor — GROUP PARENT (decomposed)
   The 7694-line multi-track timeline editor IIFE was split into 13 sub-systems (timing /
   project / preview / render / playback / preview-render / clips / import / undo-markers /
   events / advanced-panels / clip-edit / export). Shared state lives on ONE namespace object
   VE = window.__ccVideoEditor; each child attaches its functions as VE.<name> and
   references siblings through VE at call time → load-order-proof, no globals. The public
   API stays  window.VideoEditor  (lazy getters → VE), so pages.js + every caller (which
   call VideoEditor.activate()/saveForPage()/… at runtime) are unchanged. Init is lazy
   (activate() → _veInit on first open), so no load-time init poll is needed.
   ============================================================ */
(function () {
  'use strict';

  var VE = window.__ccVideoEditor || (window.__ccVideoEditor = {});

  // ── shared state + constants (were the IIFE private vars) ──
  VE._veIdCounter = 0;
  VE.PX_PER_SEC_DEFAULT = 60;   // default zoom: 60 pixels per second
  VE.PX_PER_SEC_MIN = 0.2;
  VE.PX_PER_SEC_MAX = 200;
  VE.TRACK_HEIGHT = 48;
  VE.RULER_HEIGHT = 24;
  VE.TOOLBAR_HEIGHT = 36;
  VE.MIN_PANEL_HEIGHT = 140;
  VE.DEFAULT_PANEL_HEIGHT = 260;
  VE.SNAP_THRESHOLD = 5;   // pixels for snap
  VE.MIN_CLIP_DURATION = 0.1; // seconds
  VE.PTS_TIMEBASE = 1000000;    // 1μs = 1 PTS unit
  VE.PTS_FRAME_30 = 33333;     // 30fps frame duration in μs
  VE.PTS_FRAME_24 = 41667;     // 24fps frame duration in μs
  VE.PTS_FRAME_60 = 16667;     // 60fps frame duration in μs
  VE._veSnapEnabled = true;     // toggle with N key
  VE._veSnapGuides = [];        // active visual snap guide lines
  VE._veRazorMode = false;      // razor/split cursor mode (C key)
  VE._veEditMode = 'normal';
  VE._veProject = {
    tracks: [],
    duration: 0,
    playheadTime: 0,
    zoom: VE.PX_PER_SEC_DEFAULT,
    aspectRatio: '16:9',
    bgColor: '#000000',
    _bgClipId: null,         // clip id used as background video/image
    bgFit: 'cover',          // 'cover' | 'contain' | 'stretch'
    markers: []  // [{ id, time, label, color }]
  };
  VE._veUi = {
    host: null,            // #ve-timeline-host
    toolbar: null,         // toolbar row
    ruler: null,           // time ruler
    tracksContainer: null, // scrollable tracks area
    playhead: null,        // playhead line element
    resizeHandle: null,    // top drag handle
    previewCanvas: null,   // canvas for composite preview
    previewCtx: null,
    timeDisplay: null,     // current time label
    durationDisplay: null, // total duration label
    zoomSlider: null,
    panelHeight: VE.DEFAULT_PANEL_HEIGHT
  };
  VE._vePlayback = {
    playing: false,
    rafId: null,
    lastFrameTime: 0,
    speed: 1,
    loop: false,
    videoPool: {}          // clipId → <video> element
  };
  VE._veActive = false;
  VE._veSelectedClips = [];  // array of clip ids
  // Subtitle cue segments are the SECOND kind of timeline selection (subtitles live as `cues` on
  // any track, never a `type:'subtitle'` track). It is a separate array on purpose: a cue is not a
  // clip and every clip operation (split/trim/speed/transition/inspector) is meaningless on one.
  // The two are MUTUALLY EXCLUSIVE at the click sites - selecting a cue clears the clips and vice
  // versa - so the shared delete door can never act on the thing the user was not looking at.
  VE._veSelectedCues = [];   // array of cue ids
  VE._veDragState = null;
  VE._veMasterVol = 1;
  VE._veMasterMuted = false;
  VE._veExporting = false;
  VE._veExportHandle = null;   // { cancel() } from VEWebCodecsExport
  VE._veExportStaticCanvas = null;  // fabric.StaticCanvas snapshot for background export
  VE._veExportBgImg = null;         // fabric.Image wrapping preview canvas for snapshot
  VE._veUndoStack = [];
  VE._veUndoIdx = -1;
  VE._vePageProjects = {};
  VE._veRestoring = false;
  VE._vePageLoadedForActivation = false;
  VE._veCanvasBackup = null;
  VE._veTimecodeMode = false; // toggle between m:ss.ff and HH:MM:SS:FF
  VE._veLRUHead = null;   // most recently used
  VE._veLRUTail = null;   // least recently used
  VE._veLRUMap = {};       // key → node {key, value, prev, next}
  VE._veLRUSize = 0;
  VE._veLRUMaxSize = 120;  // max cached frames
  VE._veFrameCache = {
    _get: function(k) { return VE._veLRUGet(k); },
    _set: function(k, v) { VE._veLRUPut(k, v); }
  };
  VE._veKeyframeIndex = {};    // clipId → [{pts, byteOffset}]
  VE._veScrollSyncBound = false;
  VE._veViewportMode = 'follow';
  VE._veProgrammaticScroll = false;
  VE._veFilmstripSources = {};
  VE._veFilmstripQueues = {};
  VE._veOverlaySyncBound = false;
  VE._veClipboard = [];
  VE._veUndoGroupName = null;   // non-null when grouping
  VE._veUndoGroupCmds = [];     // commands in current group
  VE.MAX_UNDO = 80;
  VE._veMarkerColors = ['#f2ff58', '#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8', '#fff176'];
  VE._vePrevProductType = null;
  VE._vePrevCW = null;
  VE._vePrevCH = null;
  VE._veLinkedClips = {}; // linkGroupId → [clipId, clipId, ...]
  VE.VE_TRANSITIONS = window.VETransitions && VETransitions.ALL_IDS ? VETransitions.ALL_IDS : ['none', 'crossfade', 'fade-black', 'fade-white', 'flash', 'dissolve', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'iris-open', 'iris-close', 'diamond', 'clock', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'push-left', 'push-right', 'cover-left', 'cover-right', 'zoom-in', 'zoom-out', 'zoom-rotate', 'zoom-bounce', 'spin-cw', 'spin-ccw', 'flip-x', 'flip-y', 'blur-in', 'blur-out', 'pixelate', 'glitch', 'morph', 'burn', 'ripple', 'curtain', 'ink-drop', 'elastic', 'swirl', 'squeeze'];
  VE._VE_CLONE_PROPS = [
    '_veClipId', '_isGridLayout', '_veCellVisibility',
    '_veOrigOpacity', '_veOrigScaleX', '_veOrigScaleY',
    '_veOrigAngle', '_veOrigLeft', '_veOrigTop',
    '_veOrigSaved', '_veTransActive', '_veLastFilterKey',
    '_isVideoMedia', '_isAudioMedia', '_isEmoji', '_emojiCp',
    '_isGif', '_gifUrl', '_isAnimatedGif', '_isSticker',
    '_iconName', '_isPattern', '_patternId', '_fieldRole',
    '_isChart', '_chartType', '_customName',
    // Blur objects round-trip through the overlay serializer too; without these
    // their parameters (and so the Properties panel) come back empty in video mode.
    '_isEffect', '_fxKind', '_fxPreset', '_fxColors', '_fxAmount', '_fxAngle',
    '_fxIntensity', '_fxGrain', '_fxRadius', '_fxDistort', '_fxSmooth',
    '_fxScale', '_fxInvert', '_fxSeed', '_fxW', '_fxH'
  ];
  VE._veExportPip = null;

  // ── public API: window.VideoEditor — lazy getters → VE for the method refs (load-order-
  //    proof), inline closures for state reads, and the sibling-module bridges (read at load,
  //    when the ve-* siblings are already loaded — video-editor is the last video child). ──
  var _veApi = {};
  var _veMap = {"activate":"_veActivate","deactivate":"_veDeactivate","isActive":"_veIsActive","play":"_vePlay","pause":"_vePause","togglePlay":"_veTogglePlay","seek":"_veSeek","split":"_veSplitAtPlayhead","throughCut":"_veThroughCut","deleteSelected":"_veDeleteSelected","copySelected":"_veCopySelected","pasteClips":"_vePasteClips","undo":"_veUndo","redo":"_veRedo","beginUndoGroup":"_veBeginUndoGroup","endUndoGroup":"_veEndUndoGroup","setZoom":"_veSetZoom","addTrack":"_veAddTrack","openFilePicker":"_veOpenFilePicker","importMediaFile":"_veImportMediaFile","render":"_veRender","setFilter":"_veSetClipFilter","setTransform":"_veSetClipTransform","rotateClip":"_veRotateClip","flipClip":"_veFlipClip","setTransition":"_veSetTransition","showExport":"_veShowExportModal","setClipSpeed":"_veSetClipSpeed","addMarker":"_veAddMarker","deleteMarker":"_veDeleteMarker","seekToPrevMarker":"_veSeekToPrevMarker","seekToNextMarker":"_veSeekToNextMarker","resetProject":"_veResetToFresh","toggleSnap":"_veToggleSnap","toggleRazorMode":"_veToggleRazorMode","toggleTimecodeMode":"_veToggleTimecodeMode","toPTS":"_veToPTS","fromPTS":"_veFromPTS","formatTimecode":"_veFormatTimecode","snapToFrame":"_veSnapToFrame","hasWebCodecs":"_veHasWebCodecs","buildKeyframeIndex":"_veBuildKeyframeIndex","frameAccurateSeek":"_veFrameAccurateSeek","linkClips":"_veLinkClips","unlinkClips":"_veUnlinkClips","getLinkedClips":"_veGetLinkedClips","slipEdit":"_veSlipEdit","slideEdit":"_veSlideEdit","freezeFrame":"_veFreezeFrame","createSpeedRamp":"_veCreateSpeedRamp","addRangeMarker":"_veAddRangeMarker","addChapterMarker":"_veAddChapterMarker","toggleTodoMarker":"_veToggleTodoMarker","saveForPage":"_veSaveForPage","loadForPage":"_veLoadForPage","hasProjectForPage":"_veHasProjectForPage","findClipById":"_findClipById","renderPreview":"_veRenderPreviewFrame","syncPreviewSize":"_veSyncPreviewSize","enforceDimensions":"_veEnforceDimensions","addAdjustmentLayer":"_veAddAdjustmentLayer","updateAdjustmentLayer":"_veUpdateAdjustmentLayer"};
  Object.keys(_veMap).forEach(function (k) {
    Object.defineProperty(_veApi, k, { get: (function (n) { return function () { return VE[n]; }; })(_veMap[k]), enumerable: true });
  });
  _veApi.getProject = function () { return VE._veProject; };
  _veApi.getMediaElement = function (clipId) { return VE._vePlayback.videoPool[clipId] || null; };
  _veApi.getSelectedClips = function () { return VE._veSelectedClips.slice(); };
  _veApi.mediaPipeline = window.VEMediaPipeline || null;
  _veApi.performance = window.VEPerformance || null;
  _veApi.audioAdvanced = window.VEAudioAdvanced || null;
  _veApi.advancedFeatures = window.VEAdvancedFeatures || null;
  window.VideoEditor = _veApi;

  // ── register video-editor keyboard commands once BOTH the KBM (registerCommand) and the
  //    export child (VE._veRegisterCommands) are loaded (poll; give up after 10s) ──
  function _veTryRegisterCommands() {
    if (typeof registerCommand === 'function' && typeof VE._veRegisterCommands === 'function') { VE._veRegisterCommands(); return true; }
    return false;
  }
  if (!_veTryRegisterCommands()) {
    var _veKbmCheck = setInterval(function () { if (_veTryRegisterCommands()) clearInterval(_veKbmCheck); }, 500);
    setTimeout(function () { clearInterval(_veKbmCheck); }, 10000);
  }
})();

// Modular skeleton hook — register the group parent (children self-register under it).
if (window.cc && cc.modules) cc.modules.register({ id: 'video-editor', parent: 'video', title: 'video-editor', mount: function () {}, unmount: function () {} });
