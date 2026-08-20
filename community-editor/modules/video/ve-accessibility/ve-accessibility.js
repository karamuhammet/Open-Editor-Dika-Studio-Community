// ╔═══════════════════════════════════════════════════════════════╗
// ║  VE-ACCESSIBILITY — Accessibility & Keyboard Navigation      ║
// ║  Phase 22: ARIA, focus management, screen reader, a11y modes ║
// ╚═══════════════════════════════════════════════════════════════╝
(function() {
  'use strict';

  var _highContrast = false;
  var _reducedMotion = false;
  var _announcer = null;
  var _lsKey = 'dika_ve_a11y';

  // ── Load saved prefs ──
  function _loadPrefs() {
    try {
      var raw = localStorage.getItem(_lsKey);
      if (raw) {
        var data = JSON.parse(raw);
        _highContrast = !!data.highContrast;
        _reducedMotion = !!data.reducedMotion;
      }
    } catch(e) {}
    // Also check OS preference for reduced motion
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      _reducedMotion = true;
    }
  }

  function _savePrefs() {
    try {
      localStorage.setItem(_lsKey, JSON.stringify({
        highContrast: _highContrast,
        reducedMotion: _reducedMotion
      }));
    } catch(e) {}
  }

  // ── Screen reader announcements ──
  function _ensureAnnouncer() {
    if (_announcer && document.body.contains(_announcer)) return;
    _announcer = document.createElement('div');
    _announcer.setAttribute('role', 'status');
    _announcer.setAttribute('aria-live', 'polite');
    _announcer.setAttribute('aria-atomic', 'true');
    _announcer.className = 've-sr-only';
    document.body.appendChild(_announcer);
  }

  function announce(message) {
    _ensureAnnouncer();
    if (!_announcer) return;
    _announcer.textContent = '';
    requestAnimationFrame(function() {
      if (_announcer) _announcer.textContent = message;
    });
  }

  // ── ARIA attribute injection ──
  function applyARIA() {
    // Toolbar
    _attr('#ve-btn-play', { 'role': 'button', 'aria-label': 'Play / Pause' });
    _attr('#ve-btn-split', { 'role': 'button', 'aria-label': 'Split clip at playhead' });
    _attr('#ve-btn-delete', { 'role': 'button', 'aria-label': 'Delete selected clip' });
    _attr('#ve-btn-duplicate', { 'role': 'button', 'aria-label': 'Duplicate selected clip' });
    _attr('#ve-btn-bring-front', { 'role': 'button', 'aria-label': 'Move clip forward' });
    _attr('#ve-btn-send-back', { 'role': 'button', 'aria-label': 'Move clip backward' });
    _attr('#ve-btn-seek-back', { 'role': 'button', 'aria-label': 'Seek backward 5 seconds' });
    _attr('#ve-btn-seek-fwd', { 'role': 'button', 'aria-label': 'Seek forward 5 seconds' });
    _attr('#ve-btn-prev-frame', { 'role': 'button', 'aria-label': 'Previous frame' });
    _attr('#ve-btn-next-frame', { 'role': 'button', 'aria-label': 'Next frame' });
    _attr('#ve-btn-loop', { 'role': 'button', 'aria-label': 'Toggle loop playback' });
    _attr('#ve-btn-fullscreen', { 'role': 'button', 'aria-label': 'Toggle fullscreen preview' });
    _attr('#ve-btn-export', { 'role': 'button', 'aria-label': 'Export video' });
    _attr('#ve-zoom-in', { 'role': 'button', 'aria-label': 'Zoom in timeline' });
    _attr('#ve-zoom-out', { 'role': 'button', 'aria-label': 'Zoom out timeline' });
    _attr('#ve-btn-edit-mode', { 'role': 'button', 'aria-label': 'Cycle edit mode' });

    // Master volume
    _attr('#ve-master-vol', { 'role': 'slider', 'aria-label': 'Master volume', 'aria-valuemin': '0', 'aria-valuemax': '200' });

    // Rate select
    _attr('#ve-rate-select', { 'aria-label': 'Playback speed' });

    // Time display
    _attr('#ve-time-current', { 'aria-label': 'Current time' });
    _attr('#ve-time-total', { 'aria-label': 'Total duration' });

    // Preview canvas
    _attr('#ve-preview-canvas', { 'role': 'img', 'aria-label': 'Video preview' });

    // Timeline
    var timeline = document.querySelector('.ve-timeline');
    if (timeline) {
      timeline.setAttribute('role', 'region');
      timeline.setAttribute('aria-label', 'Timeline');
    }

    // Toolbar regions
    var toolbar = document.querySelector('.ve-toolbar');
    if (toolbar) {
      toolbar.setAttribute('role', 'toolbar');
      toolbar.setAttribute('aria-label', 'Video editor controls');
    }

    // Make all toolbar buttons focusable via tabindex
    var buttons = document.querySelectorAll('.ve-tb-btn');
    for (var i = 0; i < buttons.length; i++) {
      if (!buttons[i].getAttribute('tabindex')) {
        buttons[i].setAttribute('tabindex', '0');
      }
    }
  }

  function _attr(selector, attrs) {
    var el = document.querySelector(selector);
    if (!el) return;
    for (var key in attrs) {
      el.setAttribute(key, attrs[key]);
    }
  }

  // ── Keyboard navigation for clips ──
  var _clipNavBound = false;
  function setupClipNavigation() {
    // scan-3000 H20: init() runs on EVERY video-editor activation; without the
    // guard each visit stacked another (unremovable anonymous) keydown handler
    // and Tab/Enter actions fired N times.
    if (_clipNavBound) return;
    _clipNavBound = true;
    document.addEventListener('keydown', function(e) {
      // Only active in video editor context
      if (!window.VideoEditor || !VideoEditor.isActive()) return;
      var target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;

      // Tab/Shift+Tab to cycle through clips
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
        var clips = document.querySelectorAll('.ve-clip');
        if (clips.length === 0) return;
        var focused = document.querySelector('.ve-clip:focus, .ve-clip.ve-clip--selected');
        var idx = -1;
        for (var i = 0; i < clips.length; i++) {
          if (clips[i] === focused) { idx = i; break; }
        }
        if (e.shiftKey) {
          idx = idx <= 0 ? clips.length - 1 : idx - 1;
        } else {
          idx = idx >= clips.length - 1 ? 0 : idx + 1;
        }
        clips[idx].focus();
        clips[idx].click();
        e.preventDefault();
        announce('Clip ' + (idx + 1) + ' of ' + clips.length + ' selected');
      }

      // Enter to select focused clip
      if (e.key === 'Enter') {
        var focusedClip = document.querySelector('.ve-clip:focus');
        if (focusedClip) {
          focusedClip.click();
          announce('Clip selected');
        }
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        var sel = document.querySelector('.ve-clip--selected');
        if (sel) {
          sel.classList.remove('ve-clip--selected');
          announce('Selection cleared');
        }
      }
    });
  }

  // ── High contrast mode ──
  function setHighContrast(enabled) {
    _highContrast = !!enabled;
    document.body.classList.toggle('ve-high-contrast', _highContrast);
    _savePrefs();
    announce(_highContrast ? 'High contrast mode enabled' : 'High contrast mode disabled');
  }

  function isHighContrast() {
    return _highContrast;
  }

  // ── Reduced motion mode ──
  function setReducedMotion(enabled) {
    _reducedMotion = !!enabled;
    document.body.classList.toggle('ve-reduced-motion', _reducedMotion);
    _savePrefs();
    announce(_reducedMotion ? 'Reduced motion enabled' : 'Reduced motion disabled');
  }

  function isReducedMotion() {
    return _reducedMotion;
  }

  // ── Focus trap for modals ──
  function trapFocus(container) {
    var focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    container.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    });
    first.focus();
  }

  // ── Initialize ──
  function init() {
    _loadPrefs();
    if (_highContrast) document.body.classList.add('ve-high-contrast');
    if (_reducedMotion) document.body.classList.add('ve-reduced-motion');
    setupClipNavigation();
    // Defer ARIA injection to ensure DOM is built
    setTimeout(applyARIA, 100);
  }

  // ── Dispose ──
  function dispose() {
    document.body.classList.remove('ve-high-contrast', 've-reduced-motion');
    if (_announcer && _announcer.parentNode) _announcer.remove();
    _announcer = null;
  }

  // Public API
  window.VEAccessibility = {
    init: init,
    dispose: dispose,
    applyARIA: applyARIA,
    announce: announce,
    setHighContrast: setHighContrast,
    isHighContrast: isHighContrast,
    setReducedMotion: setReducedMotion,
    isReducedMotion: isReducedMotion,
    trapFocus: trapFocus
  };
})();

// Modular skeleton hook (Faz 8) — ve-accessibility is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-accessibility', parent: 'video', title: 've-accessibility', mount: function () {}, unmount: function () {} });
