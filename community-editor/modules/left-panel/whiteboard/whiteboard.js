/* ============================================================
   whiteboard — GROUP PARENT (decomposed)
   The board-mode IIFE split per concern. Shared state + the TOOLS table stay on
   WB = window.__ccWhiteboard; functions go to children. window.wbActive is a plain window
   flag (other files read/write it directly), kept as-is. Self-inits on cc:canvas-ready (poll
   until children load). Public enter/exit/setWbTool + _wbSetBrushColor stay via forwarders.
   ============================================================ */
(function () {
  'use strict';

  var WB = window.__ccWhiteboard || (window.__ccWhiteboard = {});

  // ── shared state + TOOLS table ──
  WB.wbTool = 'select';
  WB.wbStickyColor = '#fff3bf';
  WB.wbPanning = false;
  WB._panStart = null;
  WB._drawStart = null;
  WB._drawObj = null;
  WB._handlers = {};
  WB._kbHandler = null;
  WB._resizeHandler = null;
  WB._areaResizeObs = null;   // observes #canvas-area so a panel toggle re-fills the bg;
  WB._wheelHandler = null;
  WB._midMouseDown = null;
  WB._midMouseMove = null;
  WB._midMouseUp = null;
  WB._spaceDown = false;
  WB._barEl = null;
  WB._barPos = null;   // {x,y} once the user drags the floating bar;
  WB._barCollapsed = false;  // floating bar collapsed (tools hidden);
  WB._brushSize = 3;      // brush (pencil) settings — source of truth;
  WB._brushColor = '#ffffff';
  WB._brushPopover = null;   // hover settings popover over the brush button;
  WB._brushPopTimer = null;
  WB._wbBrushPickerOpen = false;  // shared color picker open for the brush;
  WB._wbRpWasCollapsed = false;
  WB._zenMode = false;
  WB.TOOLS = [
    { id: 'hand',      key: '1', group: 0, label: 'Hand (1)',      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v6M10 10.5V5a2 2 0 0 0-4 0v9"/><path d="M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.7-2.4L3.1 15a2 2 0 0 1 3-2.5l.9 1"/></svg>' },
    { id: 'select',    key: '2', group: 0, label: 'Select (2)',    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/></svg>' },
    null,
    { id: 'rect',      key: '3', group: 1, label: 'Rectangle (3)', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>' },
    { id: 'ellipse',   key: '4', group: 1, label: 'Ellipse (4)',   icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="10" ry="8"/></svg>' },
    { id: 'diamond',   key: '5', group: 1, label: 'Diamond (5)',   icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.93" y="4.93" width="14.14" height="14.14" rx="1" transform="rotate(45 12 12)"/></svg>' },
    null,
    { id: 'arrow',     key: 'Q', group: 2, label: 'Arrow (Q)',     icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' },
    { id: 'line',      key: 'W', group: 2, label: 'Line (W)',      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"/></svg>' },
    null,
    { id: 'draw',      key: 'E', group: 3, label: 'Pencil (E)',    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>' },
    { id: 'text',      key: 'T', group: 3, label: 'Text (T)',      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9.5" y1="20" x2="14.5" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>' },
    { id: 'sticky',    key: 'N', group: 3, label: 'Sticky Note (N)', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><polyline points="14 3 14 9 21 9"/></svg>' },
    null,
    { id: 'eraser',    key: 'X', group: 4, label: 'Eraser (X)',    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16l9-9 8 8-4 4z"/><line x1="6" y1="11" x2="13" y2="18"/></svg>' }
  ];
  WB._toolKbHandler = null;

  // ── public API ──
  window.wbActive = false;
  function fwd(name) { return function () { return WB[name] ? WB[name].apply(null, arguments) : undefined; }; }
  window._wbSetBrushColor = fwd('_setBrushColor');
  window.enterWhiteboardMode = fwd('enterWhiteboardMode');
  window.exitWhiteboardMode = fwd('exitWhiteboardMode');
  window.setWbTool = fwd('setWbTool');

  // ── self-init on cc:canvas-ready, deferred until every child has loaded ──
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      var tries = 0;
      var iv = setInterval(function () {
        if (typeof WB.initWhiteboard === 'function' && typeof WB.buildBar === 'function' &&
            typeof WB._setBrushColor === 'function' && typeof WB.setWbTool === 'function' &&
            typeof WB.setupLine === 'function' && typeof WB.setupSticky === 'function' &&
            typeof WB.setupZoomPan === 'function' && typeof WB.areaSize === 'function') {
          clearInterval(iv);
          cc.safe('left-panel.whiteboard', WB.initWhiteboard);
        } else if (++tries > 250) { clearInterval(iv); }
      }, 16);
    });
  }
})();

if (window.cc && cc.modules) cc.modules.register({ id: 'whiteboard', parent: 'left-panel', title: 'Board', icon: 'pen-tool', mount: function () {}, unmount: function () {} });
