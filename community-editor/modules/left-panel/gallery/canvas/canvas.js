/* gallery/canvas — CANVAS media integration: drop files onto the canvas, video/audio/image
   objects on the fabric canvas (the _cc* video engine, hover controls, IDB-backed media, rehydrate).
   Split from gallery.js (decomposition). FLAT sub-module: functions stay window globals
   (ve-media-gallery.js + app.js call _handleImportedImageFile/_rehydrateCanvasVideoMedia/... at runtime).
   Registers under left-panel.gallery. */

// ── Canvas file drop ──

/** Patch a gallery cell that holds a video entry so dragstart sends type:video metadata.
 *  For _createImageCell cells: sets data-drag-payload attribute read by the existing handler.
 *  For no-poster placeholder cells: also adds a direct dragstart listener + sets draggable. */

// ── Unified media file handler (image, video, or audio) ──
// Legacy-name alias only. Do NOT add same-name forwarding shims here
// (window.X = function(){ return X.apply(...) }): in the prod bundle all
// modules share ONE script scope, the child's hoisted declaration binds
// first and the shim assignment clobbers it, so the shim calls ITSELF
// (infinite recursion on every page switch). Child top-level function
// declarations already become window globals in both dev and bundle.
window._handleImportedImageFile = function () {
  if (typeof _handleImportedMediaFile === 'function') return _handleImportedMediaFile.apply(this, arguments);
};

/* ══════════════════════════════════════════════════════════════
   VIDEO SUPPORT — Fix serialized JSON src for video objects
   ════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   VIDEO SUPPORT — Duplicate / Clone Helper (impl: video.js, window global)
   ════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   VIDEO SUPPORT — IndexedDB Storage
   ════════════════════════════════════════════════════════════ */
var _ccVideoIdbName = 'dika_videos';
var _ccVideoIdbVersion = 1;
var _ccVideoIdbCache = null;
/* Per-file video ceiling. This used to be a flat 100 MB constant with no relationship to anything,
   which produced the worst possible pairing: the editor let a 60 MB file through and the server's
   presign then refused it at a DIFFERENT flat number (50 MB) with a message the user could neither
   understand nor act on.

   It is a PLAN setting now (plan.rateLimits["media.upload"].maxMb, editable at :3001), and the real
   value is fetched below. 1 GB is the free tier's value and the fallback for anything that cannot
   reach the API (standalone :8200, offline, a logged-out session): never smaller than what the
   cheapest plan allows, so a local-only user is not punished for the API being unreachable. */
var _CC_VIDEO_MAX_SIZE = 1024 * 1024 * 1024; // 1 GB (free tier)

/* Adopt the signed-in user's real ceiling, once, best-effort. Same source the presign route enforces
   from, so the two can no longer disagree. */
(function _ccFetchUploadCeiling() {
  /* COMMUNITY EDITION: the upload ceiling is a PLAN limit read from the account. There is no
     account and no server, so the request is a guaranteed 404 on every boot; the module's built-in
     default ceiling stands. */
  if (window.CCEdition && CCEdition.serverless) return;
  if (typeof fetch !== 'function') return;
  try {
    fetch('/api/account/rate-limits', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.operations) return;
        for (var i = 0; i < d.operations.length; i++) {
          var op = d.operations[i];
          if (op.action === 'media.upload' && op.maxMb > 0) {
            _CC_VIDEO_MAX_SIZE = op.maxMb * 1024 * 1024;
            return;
          }
        }
      })['catch'](function () { /* keep the free-tier fallback */ });
  } catch (e) { /* keep the free-tier fallback */ }
})();

/** Human label for the current ceiling, so the toast never contradicts the gate. */
function _ccVideoMaxLabel() {
  var mb = Math.round(_CC_VIDEO_MAX_SIZE / (1024 * 1024));
  return mb >= 1024 ? (Math.round(mb / 102.4) / 10) + ' GB' : mb + ' MB';
}

/* ══════════════════════════════════════════════════════════════
   VIDEO SUPPORT — Live Playback Engine
   ════════════════════════════════════════════════════════════ */
var _ccVideoRafId = 0;
var _ccVideoPlaying = false;

/* ══════════════════════════════════════════════════════════════
   VIDEO SUPPORT — Hover Play/Pause Button
   ════════════════════════════════════════════════════════════ */
var _ccVideoHoverTarget = null;
var _ccVideoPlaySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6,3 20,12 6,21"/></svg>';
var _ccVideoPauseSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

/* ══════════════════════════════════════════════════════════════
   VIDEO SUPPORT — Add Video to Canvas
   ════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   VIDEO SUPPORT — Helpers & Rehydration (impl: video.js, window globals)
   ════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   GALLERY AUDIO PLAYER — Singleton playback, mini player widget
   ════════════════════════════════════════════════════════════ */
var _galAudioState = {
  audio: null,            // current HTMLAudioElement
  name: '',
  author: '',
  url: '',
  speed: 1,
  popupActive: false,     // popup mode — keeps playing when leaving panel
  popupEl: null,          // popup DOM element
  playerEl: null          // inline player DOM element
};

/** Stop any currently playing gallery audio */

/** Play audio file — stops any existing playback first (single audio rule) */

/** Toggle play/pause */

/** Seek by delta seconds */

/** Set playback speed */

/** Set volume */

/** Build or show the inline mini player at the bottom of the flyout */

/** Hide inline player */

/** Sync player UI with current audio state */

/** Pop out audio player into a floating window */

/** Called when media panel is closed/hidden — stop audio unless popup is active */

/** Create an audio cell with drag-drop, context menu, preview button (like image/video cells) */

/** Show audio info popup — rich metadata */

/** Format file size */

/** Custom delete confirmation modal */

/** Custom edit/rename modal */

/** Context menu for audio items */

/** Move-to-folder submenu for audio */

/* ══════════════════════════════════════════════════════════════
   AUDIO SUPPORT — Add Audio to Canvas / Video Editor
   ════════════════════════════════════════════════════════════ */

// Audio playback state map: fabricObj → Audio element
var _ccAudioPlayers = {};

// (impl: audio.js top-level declarations _addAudioFileToCanvas / _isCanvasAudioObject)

/* ══════════════════════════════════════════════════════════════
   GALLERY TRASH SYSTEM
   ════════════════════════════════════════════════════════════ */
var GAL_TRASH_KEY = 'dika_gallery_trash';

// Auto-clean handled by _galBootIDB callback

// the gallery footer used to self-call these at load; now they self-init on cc:canvas-ready

if (window.cc && cc.on) cc.on('cc:canvas-ready', function () {
  var _t = 0, _iv = setInterval(function () {
    if (typeof _initCanvasFileDrop === 'function' && typeof _ccInitVideoCanvasEvents === 'function') {
      clearInterval(_iv);
      cc.safe('left-panel.gallery.canvas.init', function () { _initCanvasFileDrop(); _ccInitVideoCanvasEvents(); });
    } else if (++_t > 250) clearInterval(_iv);
  }, 16);
});

if (window.cc && cc.modules) cc.modules.register({ id: 'canvas', parent: 'left-panel.gallery', title: 'Gallery: canvas', mount: function () {}, unmount: function () {} });
