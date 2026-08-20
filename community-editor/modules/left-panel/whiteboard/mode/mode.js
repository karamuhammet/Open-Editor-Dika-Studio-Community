/* Module: left-panel/whiteboard/mode — Board mode lifecycle (enter/exit) + flyout settings + init.
   Part of the whiteboard group (decomposed from the 1237-line IIFE). Functions hang off the
   shared namespace WB (window.__ccWhiteboard, created by the parent); cross-module refs resolve
   through WB at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;

  WB.enterWhiteboardMode = function () {
    if (window.wbActive) return;
    window.wbActive = true;
    document.body.classList.add('whiteboard-mode');
    var rp = document.querySelector('.rpanel');
    if (rp) rp.classList.add('wb-hidden');

    var area  = document.getElementById('canvas-area');
    var stage = document.getElementById('card-stage');

    /* Resize canvas to fill area */
    var sz = WB.areaSize();
    canvas.setWidth(sz.w);
    canvas.setHeight(sz.h);
    if (stage) {
      stage.style.width  = sz.w + 'px';
      stage.style.height = sz.h + 'px';
    }

    canvas.backgroundColor = '';
    canvas.renderAll();

    /* Reset viewport */
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.selection = true;
    canvas.defaultCursor = 'default';

    /* Build toolbar and handlers */
    WB.buildBar();
    WB.setupZoomPan();
    canvas.on('mouse:dblclick', WB._stickyDblClick);   // double-click a sticky to re-edit
    // Board line/arrow: keep bound connectors following their shapes + settle after drags.
    canvas.on('object:moving', WB._boardLineOnMoving);
    canvas.on('object:scaling', WB._boardLineOnScaling);
    canvas.on('object:modified', WB._boardLineOnModified);
    canvas.on('selection:cleared', WB._boardLineOnDeselect);
    WB.setupToolShortcuts();
    WB.setWbTool('select');

    /* Resize on window change */
    WB._resizeHandler = function () {
      if (!window.wbActive) return;
      var s = WB.areaSize();
      canvas.setWidth(s.w);
      canvas.setHeight(s.h);
      if (stage) {
        stage.style.width  = s.w + 'px';
        stage.style.height = s.h + 'px';
      }
      canvas.renderAll();
    };
    window.addEventListener('resize', WB._resizeHandler);

    /* The canvas-area also changes width when the RIGHT PANEL opens/closes (on
       select/deselect) — a window resize does NOT fire for that. Without this,
       the canvas stayed its old (narrower) size, so the background color only
       covered the visible strip and the revealed area showed the bare grid.
       A ResizeObserver re-sizes + repaints the canvas to fill the whole area. */
    if (typeof ResizeObserver === 'function' && area) {
      WB._areaResizeObs = new ResizeObserver(function () { if (window.wbActive) WB._resizeHandler(); });
      WB._areaResizeObs.observe(area);
    }

    /* Init flyout settings */
    WB.initFlyoutSettings();

    if (typeof showToast === 'function') showToast('Board mode — draw freely!');

    // Set keyboard manager context to board
    if (typeof KeyboardManager !== 'undefined') KeyboardManager.setContext('board-editor');
  };

  WB.exitWhiteboardMode = function () {
    if (!window.wbActive) return;
    window.wbActive = false;
    document.body.classList.remove('whiteboard-mode');
    /* Exit zen mode if active */
    if (WB._zenMode) {
      WB._zenMode = false;
      document.body.classList.remove('wb-zen');
    }
    var rp = document.querySelector('.rpanel');
    if (rp) rp.classList.remove('wb-hidden');

    WB.teardownCurrentTool();
    WB.teardownZoomPan();
    canvas.off('mouse:dblclick', WB._stickyDblClick);
    canvas.off('object:moving', WB._boardLineOnMoving);
    canvas.off('object:scaling', WB._boardLineOnScaling);
    canvas.off('object:modified', WB._boardLineOnModified);
    canvas.off('selection:cleared', WB._boardLineOnDeselect);
    WB.teardownToolShortcuts();
    WB.destroyBar();

    // Restore keyboard manager context
    if (typeof KeyboardManager !== 'undefined') KeyboardManager.setContext('design-editor');

    if (WB._resizeHandler) {
      window.removeEventListener('resize', WB._resizeHandler);
      WB._resizeHandler = null;
    }
    if (WB._areaResizeObs) { WB._areaResizeObs.disconnect(); WB._areaResizeObs = null; }

    /* Reset viewport transform */
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.setZoom(1);

    var stage = document.getElementById('card-stage');
    var container = document.getElementById('card-stage-container');
    if (stage) {
      stage.style.width  = '';
      stage.style.height = '';
      stage.style.boxShadow = '';
      stage.style.border = '';
      stage.style.borderRadius = '';
      stage.style.overflow = '';
    }
    if (container) {
      container.style.transform = '';
      container.style.position = '';
      container.style.inset = '';
      container.style.display = '';
      container.style.alignItems = '';
      container.style.justifyContent = '';
    }

    /* Restore canvas to page dimensions */
    var page = (typeof pages !== 'undefined' && pages[currentPageIndex]) ? pages[currentPageIndex] : null;
    if (page && page.w && page.h) {
      canvas.setWidth(page.w);
      canvas.setHeight(page.h);
    } else {
      canvas.setWidth(CW);
      canvas.setHeight(CH);
    }

    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = 'default';

    /* Restore all object selectability */
    canvas.forEachObject(function (o) {
      if (!o._isPattern && !o._isGridLine && !o._isGuide) {
        o.selectable = true;
        o.evented = true;
      }
    });

    canvas.renderAll();
    if (typeof applyView === 'function') applyView();
  };

  WB.initFlyoutSettings = function () {
    var bsEl = document.getElementById('wb-brush-size');
    if (bsEl) {
      bsEl.oninput = function () {
        if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = parseInt(bsEl.value, 10);
      };
    }

    var bcEl = document.getElementById('wb-brush-color');
    if (bcEl) {
      bcEl.oninput = function () {
        if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = bcEl.value;
      };
    }

    document.querySelectorAll('.wb-scolor').forEach(function (el) {
      el.onclick = function () {
        WB.wbStickyColor = el.dataset.color;
        document.querySelectorAll('.wb-scolor').forEach(function (s) {
          s.style.borderColor = 'transparent';
        });
        el.style.borderColor = 'var(--text)';
      };
    });
  };

  WB.initWhiteboard = function () {
    WB.initFlyoutSettings();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'mode', parent: 'left-panel.whiteboard', title: 'whiteboard: mode', mount: function () {}, unmount: function () {} });
  }
})();
