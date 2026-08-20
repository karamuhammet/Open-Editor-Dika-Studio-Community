/* Module: left-panel/whiteboard/interaction — Zoom/pan + tool keyboard shortcuts.
   Part of the whiteboard group (decomposed from the 1237-line IIFE). Functions hang off the
   shared namespace WB (window.__ccWhiteboard, created by the parent); cross-module refs resolve
   through WB at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;

  WB.setupZoomPan = function () {
    // Fabric does NOT fire mouse:down/up for the middle button unless this is on,
    // so WB._midMouseDown never ran → no preventDefault → the browser's middle-click
    // autoscroll engaged and "locked" the cursor instead of panning.
    canvas.fireMiddleClick = true;
    // Thin curved connectors use perPixelTargetFind; without a tolerance you'd
    // have to click the exact 2px stroke. This makes clicking NEAR the line select it.
    canvas.targetFindTolerance = 10;
    WB._wheelHandler = function (opt) {
      if (!window.wbActive) return;
      var e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      // Don't zoom/pan the viewport while an object or connector handle is mid-drag:
      // shifting the viewport under an in-progress transform makes the dragged point's
      // world coordinate run away against a moving reference frame (the connector
      // middle-handle "detaches from its dots and teleports/stretches" while panning).
      if (canvas._currentTransform) return;
      // Shift/Alt + wheel → horizontal pan (matches other apps); plain wheel zooms.
      if (e.shiftKey || e.altKey) {
        var vptW = canvas.viewportTransform;
        vptW[4] -= (e.deltaY || e.deltaX);
        // setViewportTransform (not just render): it recalcs every object's
        // oCoords, otherwise hit-testing stays at the pre-pan positions and
        // clicks on visible objects miss.
        canvas.setViewportTransform(vptW);
        canvas.requestRenderAll();
        return;
      }
      var delta = e.deltaY;
      var zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(zoom, 0.1), 10);
      var point = new fabric.Point(e.offsetX, e.offsetY);
      canvas.zoomToPoint(point, zoom);
      canvas.requestRenderAll();
      var lbl = document.getElementById('wb-zoom-label');
      if (lbl) lbl.textContent = Math.round(zoom * 100) + '%';
    };
    canvas.on('mouse:wheel', WB._wheelHandler);

    /* Space + drag panning */
    WB._kbHandler = function (e) {
      if (!window.wbActive) return;
      // Don't hijack Space while typing in a text field or editing a canvas text object.
      var _ao = canvas.getActiveObject && canvas.getActiveObject();
      if ((_ao && _ao.isEditing) || (e.target && e.target.matches && e.target.matches('input,textarea,select,[contenteditable]'))) return;
      if (e.type === 'keydown' && e.code === 'Space' && !WB._spaceDown && !e.repeat) {
        WB._spaceDown = true;
        if (WB.wbTool !== 'hand') {
          canvas.defaultCursor = 'grab';
          canvas.selection = false;
        }
        e.preventDefault();
      }
      if (e.type === 'keyup' && e.code === 'Space') {
        WB._spaceDown = false;
        if (WB.wbTool !== 'hand') {
          WB.setWbTool(WB.wbTool);
        }
      }
    };
    document.addEventListener('keydown', WB._kbHandler);
    document.addEventListener('keyup', WB._kbHandler);

    /* Space + mouse panning implementation */
    WB._midMouseDown = function (opt) {
      if (!window.wbActive) return;
      // If this mousedown already started an object/handle transform, don't also begin
      // panning: the two would fight over the same drag frame and corrupt coordinates.
      if (canvas._currentTransform) return;
      var e = opt.e;
      if (WB._spaceDown || e.button === 1) {
        WB.wbPanning = true;
        WB._panStart = { x: e.clientX, y: e.clientY };
        canvas.defaultCursor = 'grabbing';
        e.preventDefault();
      }
    };
    WB._midMouseMove = function (opt) {
      if (!WB.wbPanning || !WB._panStart) return;
      if (canvas._currentTransform) return;   // never pan while an object/handle is being transformed
      var e = opt.e;
      var vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - WB._panStart.x;
      vpt[5] += e.clientY - WB._panStart.y;
      WB._panStart = { x: e.clientX, y: e.clientY };
      canvas.setViewportTransform(vpt);   // recalc oCoords so hit-testing follows the pan
      canvas.requestRenderAll();
    };
    WB._midMouseUp = function () {
      if (!WB.wbPanning) return;
      WB.wbPanning = false;
      WB._panStart = null;
      if (!WB._spaceDown && WB.wbTool !== 'hand') {
        canvas.defaultCursor = 'default';
      }
    };
    canvas.on('mouse:down', WB._midMouseDown);
    canvas.on('mouse:move', WB._midMouseMove);
    canvas.on('mouse:up', WB._midMouseUp);
  };

  WB.teardownZoomPan = function () {
    canvas.fireMiddleClick = false;
    canvas.targetFindTolerance = 0;
    if (WB._wheelHandler) canvas.off('mouse:wheel', WB._wheelHandler);
    if (WB._midMouseDown) canvas.off('mouse:down', WB._midMouseDown);
    if (WB._midMouseMove) canvas.off('mouse:move', WB._midMouseMove);
    if (WB._midMouseUp)   canvas.off('mouse:up', WB._midMouseUp);
    if (WB._kbHandler) {
      document.removeEventListener('keydown', WB._kbHandler);
      document.removeEventListener('keyup', WB._kbHandler);
    }
    WB._wheelHandler = null;
    WB._midMouseDown = null;
    WB._midMouseMove = null;
    WB._midMouseUp = null;
    WB._kbHandler = null;
    WB._spaceDown = false;
    WB.wbPanning = false;
    WB._panStart = null;
  };

  WB.setupToolShortcuts = function () {
    var keyMap = {};
    WB.TOOLS.forEach(function (t) {
      if (!t || !t.key) return;
      var k = t.key;
      keyMap[k] = t.id;
      if (k.length === 1 && /[a-zA-Z]/.test(k)) {
        keyMap[k.toUpperCase()] = t.id;
        keyMap[k.toLowerCase()] = t.id;
      }
    });

    WB._toolKbHandler = function (e) {
      // If KeyboardManager already handled this, skip
      if (e.defaultPrevented) return;
      if (!window.wbActive) return;
      var tag = (e.target || {}).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target && e.target.isContentEditable) return;
      // Don't fire tool shortcuts / delete while editing a canvas text object.
      var _aoEdit = canvas.getActiveObject && canvas.getActiveObject();
      if (_aoEdit && _aoEdit.isEditing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      /* Delete / Backspace → remove selected */
      if (e.key === 'Delete' || e.key === 'Backspace') {
        var active = canvas.getActiveObjects();
        if (active && active.length) {
          active.forEach(function (o) { canvas.remove(o); });
          canvas.discardActiveObject();
          canvas.renderAll();
          if (typeof snap === 'function') snap();
        }
        return;
      }

      /* Escape → back to select */
      if (e.key === 'Escape') {
        if (WB._zenMode) { WB.toggleZenMode(); return; }
        WB.setWbTool('select');
        return;
      }

      /* Z → toggle zen mode */
      if (e.key === 'z' || e.key === 'Z') {
        WB.toggleZenMode();
        return;
      }

      var ek = e.key;
      var lookup = ek && ek.length === 1 ? ek.toUpperCase() : ek;
      if (lookup && keyMap[lookup]) WB.setWbTool(keyMap[lookup]);
    };
    document.addEventListener('keydown', WB._toolKbHandler);
  };

  WB.teardownToolShortcuts = function () {
    if (WB._toolKbHandler) document.removeEventListener('keydown', WB._toolKbHandler);
    WB._toolKbHandler = null;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'interaction', parent: 'left-panel.whiteboard', title: 'whiteboard: interaction', mount: function () {}, unmount: function () {} });
  }
})();
