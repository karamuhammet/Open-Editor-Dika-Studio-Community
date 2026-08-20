/* ═══════════════════════════════════════════════════════════════
   VE Panel Helpers — Shared utilities for all new VE panels
   Draggable headers + themed thin scrollbar
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  // ── Make a panel draggable by its header ──
  // panel: the fixed-position panel element
  // headerSelector: CSS selector for the drag handle (first child header row)
  function _makeDraggable(panel, headerSelector) {
    var header = panel.querySelector(headerSelector || ':scope > div:first-child');
    if (!header) return;
    header.style.cursor = 'move';
    header.style.userSelect = 'none';
    var _dx = 0, _dy = 0, _mx = 0, _my = 0, _dragging = false;

    header.addEventListener('mousedown', function(e) {
      // Don't drag if clicking a button inside header
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      e.preventDefault();
      _dragging = true;
      _mx = e.clientX; _my = e.clientY;
      var rect = panel.getBoundingClientRect();
      _dx = _mx - rect.left; _dy = _my - rect.top;
      // Remove transform centering if present
      panel.style.transform = 'none';

      function onMove(ev) {
        if (!_dragging) return;
        var nx = ev.clientX - _dx;
        var ny = ev.clientY - _dy;
        // Clamp to viewport
        nx = Math.max(0, Math.min(window.innerWidth - 80, nx));
        ny = Math.max(0, Math.min(window.innerHeight - 40, ny));
        panel.style.left = nx + 'px';
        panel.style.top = ny + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }

      function onUp() {
        _dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Apply thin hover scrollbar to scrollable containers inside a panel ──
  function _applyThinScrollbar(panel) {
    var scrollContainers = panel.querySelectorAll('[style*="overflow-y:auto"], [style*="overflow-y: auto"]');
    scrollContainers.forEach(function(el) {
      el.classList.add('ve-panel-scroll');
    });
  }

  // ── Inject global CSS for thin scrollbars (once) ──
  var _cssInjected = false;
  function _injectCSS() {
    if (_cssInjected) return;
    _cssInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '.ve-panel-scroll::-webkit-scrollbar { width: 4px; }' +
      '.ve-panel-scroll::-webkit-scrollbar-track { background: transparent; }' +
      '.ve-panel-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; transition: background 0.3s; }' +
      '.ve-panel-scroll:hover::-webkit-scrollbar-thumb { background: rgba(242, 255, 88,0.28); }' +
      '.ve-panel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(242, 255, 88,0.5); }' +
      // Firefox
      '.ve-panel-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }' +
      '.ve-panel-scroll:hover { scrollbar-color: rgba(242, 255, 88,0.28) transparent; }' +
      // Tab row thin scroll
      '.ve-panel-tabs-scroll::-webkit-scrollbar { height: 2px; }' +
      '.ve-panel-tabs-scroll::-webkit-scrollbar-track { background: transparent; }' +
      '.ve-panel-tabs-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }' +
      '.ve-panel-tabs-scroll:hover::-webkit-scrollbar-thumb { background: rgba(242, 255, 88,0.2); }';
    document.head.appendChild(style);
  }

  // ── Public API ──
  window.VEPanelHelpers = {
    makeDraggable: _makeDraggable,
    applyThinScrollbar: _applyThinScrollbar,
    injectCSS: _injectCSS,
    // Combined: decorate a panel with drag + scrollbar
    decorate: function(panel, headerSelector) {
      _injectCSS();
      _makeDraggable(panel, headerSelector);
      _applyThinScrollbar(panel);
    }
  };

  // Auto-inject CSS on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectCSS);
  } else {
    _injectCSS();
  }
})();

// Modular skeleton hook (Faz 8) — ve-panel-helpers is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-panel-helpers', parent: 'video', title: 've-panel-helpers', mount: function () {}, unmount: function () {} });
