// ╔═══════════════════════════════════════════════════════════════╗
// ║  VE-ERROR-HANDLER — Error Handling & Recovery                ║
// ║  Phase 21: Graceful errors, hooks, visual display            ║
// ╚═══════════════════════════════════════════════════════════════╝
(function() {
  'use strict';

  // ── Error types ──
  var ErrorType = {
    MEDIA:   'MediaError',
    EXPORT:  'ExportError',
    CODEC:   'CodecError',
    STORAGE: 'StorageError',
    RENDER:  'RenderError',
    GENERAL: 'GeneralError'
  };

  // ── State ──
  var _hooks = { beforeError: [], onError: [] };
  var _errorLog = [];
  var _maxLog = 200;
  var _suppressedClips = {}; // clipId → true (skip during playback)

  // ── Hook system ──
  function addHook(hookName, fn, priority) {
    if (!_hooks[hookName]) return;
    _hooks[hookName].push({ fn: fn, priority: priority || 0 });
    _hooks[hookName].sort(function(a, b) { return b.priority - a.priority; });
  }

  function removeHook(hookName, fn) {
    if (!_hooks[hookName]) return;
    _hooks[hookName] = _hooks[hookName].filter(function(h) { return h.fn !== fn; });
  }

  function _runHooks(hookName, errObj) {
    var hooks = _hooks[hookName] || [];
    for (var i = 0; i < hooks.length; i++) {
      try {
        var result = hooks[i].fn(errObj);
        if (result === false) return false; // hook suppressed the error
      } catch (e) { /* don't let hooks crash the handler */ }
    }
    return true;
  }

  // ── Core error reporting ──
  function report(type, message, details) {
    var err = {
      type: type || ErrorType.GENERAL,
      message: message || 'Unknown error',
      details: details || null,
      timestamp: Date.now(),
      id: 've-err-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
    };

    // beforeError hook can suppress
    var proceed = _runHooks('beforeError', err);
    if (proceed === false) return null;

    // Log it
    _errorLog.push(err);
    if (_errorLog.length > _maxLog) _errorLog.shift();

    // onError hooks
    _runHooks('onError', err);

    // Show visual toast
    _showErrorToast(err);

    return err;
  }

  // ── Visual error toast ──
  var _toastContainer = null;

  function _ensureToastContainer() {
    if (_toastContainer && document.body.contains(_toastContainer)) return;
    _toastContainer = document.createElement('div');
    _toastContainer.className = 've-error-toast-container';
    document.body.appendChild(_toastContainer);
  }

  function _showErrorToast(err) {
    _ensureToastContainer();

    var toast = document.createElement('div');
    toast.className = 've-error-toast ve-error-toast--' + err.type.toLowerCase().replace('error', '');

    var iconMap = {
      MediaError: 'film',
      ExportError: 'download',
      CodecError: 'alert-triangle',
      StorageError: 'hard-drive',
      RenderError: 'monitor',
      GeneralError: 'alert-circle'
    };
    var iconName = iconMap[err.type] || 'alert-circle';
    var iconHtml = (typeof getIcon === 'function') ? getIcon(iconName, 14) : '';

    toast.innerHTML =
      '<div class="ve-error-toast-icon">' + iconHtml + '</div>' +
      '<div class="ve-error-toast-body">' +
        '<div class="ve-error-toast-type">' + err.type + '</div>' +
        '<div class="ve-error-toast-msg">' + _escHtml(err.message) + '</div>' +
      '</div>' +
      '<button class="ve-error-toast-close">&times;</button>';

    toast.querySelector('.ve-error-toast-close').addEventListener('click', function() {
      toast.remove();
    });

    _toastContainer.appendChild(toast);

    // Auto-dismiss after 6 seconds
    setTimeout(function() {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(function() { toast.remove(); }, 300);
      }
    }, 6000);
  }

  function _escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Error overlay in preview ──
  function showPreviewError(message) {
    var preview = document.getElementById('ve-preview-area') ||
                  document.querySelector('.ve-preview');
    if (!preview) return;

    var old = preview.querySelector('.ve-preview-error');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.className = 've-preview-error';
    overlay.innerHTML =
      '<div class="ve-preview-error-icon">' +
        ((typeof getIcon === 'function') ? getIcon('alert-triangle', 24) : '⚠') +
      '</div>' +
      '<div class="ve-preview-error-msg">' + _escHtml(message) + '</div>' +
      '<button class="ve-preview-error-dismiss">Dismiss</button>';

    overlay.querySelector('.ve-preview-error-dismiss').addEventListener('click', function() {
      overlay.remove();
    });

    preview.appendChild(overlay);
  }

  function clearPreviewError() {
    var el = document.querySelector('.ve-preview-error');
    if (el) el.remove();
  }

  // ── Suppressed clips (skip corrupt clips) ──
  function suppressClip(clipId) {
    _suppressedClips[clipId] = true;
  }

  function unsuppressClip(clipId) {
    delete _suppressedClips[clipId];
  }

  function isClipSuppressed(clipId) {
    return !!_suppressedClips[clipId];
  }

  // ── Auto-retry wrapper ──
  function withRetry(fn, maxAttempts, delayMs) {
    maxAttempts = maxAttempts || 3;
    delayMs = delayMs || 500;
    var attempt = 0;

    return new Promise(function(resolve, reject) {
      function tryOnce() {
        attempt++;
        try {
          var result = fn();
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(function(e) {
              if (attempt < maxAttempts) {
                setTimeout(tryOnce, delayMs * attempt);
              } else {
                reject(e);
              }
            });
          } else {
            resolve(result);
          }
        } catch (e) {
          if (attempt < maxAttempts) {
            setTimeout(tryOnce, delayMs * attempt);
          } else {
            reject(e);
          }
        }
      }
      tryOnce();
    });
  }

  // ── Recovery actions ──
  function recoverReloadClip(clipId) {
    if (!window.VideoEditor) return;
    var pool = window._vePlayback && window._vePlayback.videoPool;
    if (!pool || !pool[clipId]) return;

    var el = pool[clipId];
    el.load();
    unsuppressClip(clipId);
  }

  function recoverClearCache() {
    if (window.VEPersistence) {
      try { VEPersistence.dispose(); } catch(e) {}
    }
    try { localStorage.removeItem('dika_ve_autosave'); } catch(e) {}
  }

  function recoverReinit() {
    if (window.VideoEditor) {
      VideoEditor.deactivate();
      setTimeout(function() { VideoEditor.activate(); }, 100);
    }
  }

  // ── Error log access ──
  function getLog() {
    return _errorLog.slice();
  }

  function clearLog() {
    _errorLog = [];
  }

  // ── Media error handler (attach to video/audio elements) ──
  function attachMediaErrorHandler(element, clipId) {
    if (!element) return;
    element.addEventListener('error', function() {
      var me = element.error;
      var code = me ? me.code : 0;
      var msgs = {
        1: 'Loading aborted',
        2: 'Network error',
        3: 'Decode error (codec unsupported?)',
        4: 'Source not supported'
      };
      var msg = msgs[code] || 'Unknown media error';
      if (clipId) msg += ' (clip: ' + clipId.substr(0, 8) + ')';

      var errType = (code === 3) ? ErrorType.CODEC : ErrorType.MEDIA;
      report(errType, msg, { clipId: clipId, mediaErrorCode: code });

      // Suppress clip to prevent repeated errors during playback
      if (clipId) suppressClip(clipId);
    });
  }

  // ── Dispose ──
  function dispose() {
    _hooks = { beforeError: [], onError: [] };
    _errorLog = [];
    _suppressedClips = {};
    if (_toastContainer && _toastContainer.parentNode) {
      _toastContainer.remove();
    }
    _toastContainer = null;
  }

  // Public API
  window.VEErrorHandler = {
    ErrorType: ErrorType,
    report: report,
    addHook: addHook,
    removeHook: removeHook,
    showPreviewError: showPreviewError,
    clearPreviewError: clearPreviewError,
    suppressClip: suppressClip,
    unsuppressClip: unsuppressClip,
    isClipSuppressed: isClipSuppressed,
    withRetry: withRetry,
    recoverReloadClip: recoverReloadClip,
    recoverClearCache: recoverClearCache,
    recoverReinit: recoverReinit,
    attachMediaErrorHandler: attachMediaErrorHandler,
    getLog: getLog,
    clearLog: clearLog,
    dispose: dispose
  };
})();

// Modular skeleton hook (Faz 8) — ve-error-handler is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-error-handler', parent: 'video', title: 've-error-handler', mount: function () {}, unmount: function () {} });
