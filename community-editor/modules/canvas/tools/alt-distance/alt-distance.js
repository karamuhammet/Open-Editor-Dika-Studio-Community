/* ============================================================
   Alt-key Distance Measurement (Canva-style)
   Hold Alt with a selected object to see distances to canvas
   edges. Hover over another object while holding Alt to see
   the gap between the two objects.
   ============================================================ */
(function () {
  'use strict';

  var _altDown = false;
  var _measureObjects = [];      // Fabric objects we added for measurement
  var _mouseMoveHandler = null;
  var _wiredCanvases = [];

  function getThemeColor() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
      if (v) return v;
    } catch (e) {}
    return '#f2ff58';
  }

  var LABEL_COLOR = '#0b0b0d';
  var LINE_DASH = [4, 3];

  /* ── Helpers ── */
  function getCvs() {
    return typeof getActiveCanvas === 'function' ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
  }

  function cvsDims(cvs) {
    var w = typeof cvs.getWidth === 'function' ? cvs.getWidth() : (typeof CW !== 'undefined' ? CW : 700);
    var h = typeof cvs.getHeight === 'function' ? cvs.getHeight() : (typeof CH !== 'undefined' ? CH : 400);
    return { w: w, h: h };
  }

  function objBounds(obj) {
    var br = obj.getBoundingRect(true, true);
    return {
      left: br.left,
      top: br.top,
      right: br.left + br.width,
      bottom: br.top + br.height,
      width: br.width,
      height: br.height,
      cx: br.left + br.width / 2,
      cy: br.top + br.height / 2
    };
  }

  function isHelper(o) {
    return o && o._altMeasure;
  }

  /* ── Clear all measurement overlays ── */
  function clearMeasures(cvs) {
    if (!cvs) return;
    for (var i = 0; i < _measureObjects.length; i++) {
      try { cvs.remove(_measureObjects[i]); } catch (e) {}
    }
    _measureObjects = [];
    // Also clean any strays
    var strays = cvs.getObjects().filter(isHelper);
    for (var j = 0; j < strays.length; j++) {
      try { cvs.remove(strays[j]); } catch (e) {}
    }
    cvs.requestRenderAll();
  }

  /* ── Add a measurement line ── */
  function addLine(cvs, x1, y1, x2, y2) {
    var line = new fabric.Line([x1, y1, x2, y2], {
      stroke: getThemeColor(),
      strokeWidth: 1,
      strokeDashArray: LINE_DASH.slice(),
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true
    });
    line._altMeasure = true;
    cvs.add(line);
    _measureObjects.push(line);
  }

  /* ── Add a distance label (pill badge) ── */
  function addLabel(cvs, x, y, text) {
    var lbl = new fabric.Text(text, {
      left: x,
      top: y,
      fontSize: 11,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      fill: LABEL_COLOR,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true
    });
    // Measure text to create background
    var tw = lbl.width + 12;
    var th = lbl.height + 6;

    var bg = new fabric.Rect({
      left: x,
      top: y,
      width: tw,
      height: th,
      rx: th / 2,
      ry: th / 2,
      fill: getThemeColor(),
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true
    });
    bg._altMeasure = true;
    lbl._altMeasure = true;
    cvs.add(bg);
    cvs.add(lbl);
    _measureObjects.push(bg);
    _measureObjects.push(lbl);
  }

  /* ── Show distances from selected object to canvas edges ── */
  function showEdgeDistances(cvs, obj) {
    var sz = cvsDims(cvs);
    var b = objBounds(obj);

    var dLeft = Math.round(b.left);
    var dRight = Math.round(sz.w - b.right);
    var dTop = Math.round(b.top);
    var dBottom = Math.round(sz.h - b.bottom);

    // Left distance
    if (dLeft > 2) {
      addLine(cvs, 0, b.cy, b.left, b.cy);
      addLabel(cvs, b.left / 2, b.cy, String(dLeft));
    }
    // Right distance
    if (dRight > 2) {
      addLine(cvs, b.right, b.cy, sz.w, b.cy);
      addLabel(cvs, b.right + (sz.w - b.right) / 2, b.cy, String(dRight));
    }
    // Top distance
    if (dTop > 2) {
      addLine(cvs, b.cx, 0, b.cx, b.top);
      addLabel(cvs, b.cx, b.top / 2, String(dTop));
    }
    // Bottom distance
    if (dBottom > 2) {
      addLine(cvs, b.cx, b.bottom, b.cx, sz.h);
      addLabel(cvs, b.cx, b.bottom + (sz.h - b.bottom) / 2, String(dBottom));
    }

    cvs.requestRenderAll();
  }

  /* ── Show distances between selected object and a hovered object ── */
  function showObjectDistances(cvs, selObj, hovObj) {
    var a = objBounds(selObj);
    var b = objBounds(hovObj);

    // Horizontal gap
    var hGap = 0, hLineY = 0, hX1 = 0, hX2 = 0;
    if (a.right <= b.left) {
      // selected is left of hovered
      hGap = Math.round(b.left - a.right);
      hX1 = a.right;
      hX2 = b.left;
      hLineY = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      if (a.bottom < b.top || b.bottom < a.top) hLineY = (a.cy + b.cy) / 2;
    } else if (b.right <= a.left) {
      // selected is right of hovered
      hGap = Math.round(a.left - b.right);
      hX1 = b.right;
      hX2 = a.left;
      hLineY = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      if (a.bottom < b.top || b.bottom < a.top) hLineY = (a.cy + b.cy) / 2;
    }

    // Vertical gap
    var vGap = 0, vLineX = 0, vY1 = 0, vY2 = 0;
    if (a.bottom <= b.top) {
      // selected is above hovered
      vGap = Math.round(b.top - a.bottom);
      vY1 = a.bottom;
      vY2 = b.top;
      vLineX = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      if (a.right < b.left || b.right < a.left) vLineX = (a.cx + b.cx) / 2;
    } else if (b.bottom <= a.top) {
      // selected is below hovered
      vGap = Math.round(a.top - b.bottom);
      vY1 = b.bottom;
      vY2 = a.top;
      vLineX = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      if (a.right < b.left || b.right < a.left) vLineX = (a.cx + b.cx) / 2;
    }

    // Draw horizontal gap
    if (hGap > 0) {
      addLine(cvs, hX1, hLineY, hX2, hLineY);
      addLabel(cvs, (hX1 + hX2) / 2, hLineY, String(hGap));
    }

    // Draw vertical gap
    if (vGap > 0) {
      addLine(cvs, vLineX, vY1, vLineX, vY2);
      addLabel(cvs, vLineX, (vY1 + vY2) / 2, String(vGap));
    }

    // If objects overlap (no gap), show overlap or zero
    if (hGap === 0 && vGap === 0) {
      // Show edge-to-edge for overlapping objects
      var overlapH = Math.round(Math.abs(a.cx - b.cx));
      var overlapV = Math.round(Math.abs(a.cy - b.cy));
      if (overlapH > 2) {
        var midY = (a.cy + b.cy) / 2;
        addLine(cvs, Math.min(a.cx, b.cx), midY, Math.max(a.cx, b.cx), midY);
        addLabel(cvs, (a.cx + b.cx) / 2, midY, String(overlapH));
      }
      if (overlapV > 2) {
        var midX = (a.cx + b.cx) / 2;
        addLine(cvs, midX, Math.min(a.cy, b.cy), midX, Math.max(a.cy, b.cy));
        addLabel(cvs, midX, (a.cy + b.cy) / 2, String(overlapV));
      }
    }

    cvs.requestRenderAll();
  }

  /* ── Mouse move handler (only active while Alt is held) ── */
  function onMouseMove(opt) {
    var cvs = getCvs();
    if (!cvs || !_altDown) return;

    var selObj = cvs.getActiveObject();
    if (!selObj) return;

    clearMeasures(cvs);

    // Find object under pointer (excluding selected and helpers)
    var pointer = cvs.getPointer(opt.e, true);
    var hovObj = null;
    var objects = cvs.getObjects();
    for (var i = objects.length - 1; i >= 0; i--) {
      var o = objects[i];
      if (o === selObj || isHelper(o) || (o.isSmartGuide) || o.visible === false) continue;
      // Check if pointer is within the hovered object group area too
      if (selObj.type === 'activeSelection' && selObj._objects && selObj._objects.indexOf(o) !== -1) continue;
      var br = o.getBoundingRect(true, true);
      if (pointer.x >= br.left && pointer.x <= br.left + br.width &&
          pointer.y >= br.top && pointer.y <= br.top + br.height) {
        hovObj = o;
        break;
      }
    }

    if (hovObj) {
      showObjectDistances(cvs, selObj, hovObj);
    } else {
      showEdgeDistances(cvs, selObj);
    }
  }

  /* ── Keyboard handlers ── */
  function onAltDown(e) {
    if (e.key !== 'Alt' || _altDown) return;
    if (e.target && e.target.matches('input,textarea,select,[contenteditable]')) return;

    var cvs = getCvs();
    if (!cvs) return;
    var selObj = cvs.getActiveObject();
    if (!selObj) return;

    _altDown = true;
    e.preventDefault();

    // Show edge distances immediately
    showEdgeDistances(cvs, selObj);

    // Wire mouse:move for hover detection
    if (!_mouseMoveHandler) {
      _mouseMoveHandler = onMouseMove;
      cvs.on('mouse:move', _mouseMoveHandler);
    }
  }

  function onAltUp(e) {
    if (e.key !== 'Alt' || !_altDown) return;
    _altDown = false;

    var cvs = getCvs();
    if (cvs) {
      if (_mouseMoveHandler) {
        cvs.off('mouse:move', _mouseMoveHandler);
        _mouseMoveHandler = null;
      }
      clearMeasures(cvs);
    }
  }

  /* ── Init ── */
  function init() {
    document.addEventListener('keydown', onAltDown);
    document.addEventListener('keyup', onAltUp);

    // Also clear on selection change and deselect
    function wireCleanup(cvs) {
      if (!cvs || cvs._altDistWired) return;
      cvs._altDistWired = true;
      cvs.on('selection:cleared', function () {
        _altDown = false;
        if (_mouseMoveHandler) { cvs.off('mouse:move', _mouseMoveHandler); _mouseMoveHandler = null; }
        clearMeasures(cvs);
      });
    }

    // Wire known canvases
    if (typeof canvas !== 'undefined' && canvas) wireCleanup(canvas);
    if (typeof backCanvas !== 'undefined' && backCanvas) wireCleanup(backCanvas);

    // Also wire on future canvases. scan-3000 M-M3: debounced (the body-wide
    // observer used to run the wiring on EVERY DOM mutation).
    if (typeof MutationObserver !== 'undefined') {
      var _adDebounce = null;
      var obs = new MutationObserver(function () {
        if (_adDebounce) clearTimeout(_adDebounce);
        _adDebounce = setTimeout(function () {
          if (typeof canvas !== 'undefined' && canvas) wireCleanup(canvas);
          if (typeof backCanvas !== 'undefined' && backCanvas) wireCleanup(backCanvas);
        }, 200);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Faz 8: canvas-tool module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { setTimeout(function () { cc.safe('canvas.tools.alt-distance', init); }, 600); });
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
})();

// Modular skeleton hook (Faz 8) — alt-distance is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'alt-distance', parent: 'canvas.tools', title: 'Distance guides', mount: function () {}, unmount: function () {} });
