/* Module: canvas/tools/brush-tool/paint — Paint layer + stroke engine (down/move/up, composite, bake, undo, cursor).
   Part of the brush-tool group (decomposed from the 1532-line IIFE). Functions hang off the
   shared namespace BT (window.__ccBrushTool, created by the parent); cross-module refs resolve
   through BT at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var BT = window.__ccBrushTool;
  if (!BT) return;

  BT._hasPaint = function () {
    if (!BT._paintCanvas || !BT._paintCtx) return false;
    var d = BT._paintCtx.getImageData(0, 0, BT._paintCanvas.width, BT._paintCanvas.height).data;
    for (var i = 3; i < d.length; i += 16) { if (d[i] > 20) return true; }
    return false;
  };

  BT._ensurePaintLayer = function (cvs) {
    if (BT._paintCanvas && BT._paintCanvas.width === cvs.width && BT._paintCanvas.height === cvs.height) {
      BT._syncOverlay(cvs);
      return;
    }
    BT._paintCanvas = document.createElement('canvas');
    BT._paintCanvas.width = cvs.width;
    BT._paintCanvas.height = cvs.height;
    BT._paintCtx = BT._paintCanvas.getContext('2d');

    BT._strokeCanvas = document.createElement('canvas');
    BT._strokeCanvas.width = cvs.width;
    BT._strokeCanvas.height = cvs.height;
    BT._strokeCtx = BT._strokeCanvas.getContext('2d');

    BT._syncOverlay(cvs);
  };

  BT._syncOverlay = function (cvs) {
    if (BT._fabricOverlay) {
      cvs.remove(BT._fabricOverlay);
    }
    var imgEl = new Image();
    imgEl.src = BT._paintCanvas.toDataURL();
    BT._fabricOverlay = new fabric.Image(imgEl, {
      left: 0, top: 0,
      width: cvs.width, height: cvs.height,
      selectable: false, evented: false,
      excludeFromExport: true,
      _isPaintOverlay: true
    });
    cvs.add(BT._fabricOverlay);
    BT._fabricOverlay.moveTo(cvs.getObjects().length - 1);
  };

  BT._updateOverlay = function () {
    if (!BT._fabricOverlay || !BT._paintCanvas) return;
    var cvs = BT._getCvs();
    if (!cvs) return;
    var imgEl = new Image();
    imgEl.onload = function () {
      if (!BT._fabricOverlay) return;
      BT._fabricOverlay.setElement(imgEl);
      cvs.renderAll();
    };
    imgEl.src = BT._paintCanvas.toDataURL();
  };

  BT._ensureOverlay = function (cvs) {
    cvs = cvs || BT._getCvs();
    if (cvs && !BT._fabricOverlay && BT._paintCanvas) BT._syncOverlay(cvs);
  };

  BT._snapshotPaint = function () {
    if (!BT._paintCanvas) return null;
    try { return BT._paintCanvas.toDataURL(); } catch (e) { return null; }
  };

  BT._pushPaintUndo = function () {
    var snap = BT._snapshotPaint();
    if (snap == null) return;
    BT._paintUndoStack.push(snap);
    if (BT._paintUndoStack.length > BT.PAINT_UNDO_CAP) BT._paintUndoStack.shift();
    BT._paintRedoStack.length = 0;     // a fresh action invalidates the redo branch
  };

  BT._restorePaint = function (dataUrl) {
    if (!BT._paintCanvas || !BT._paintCtx || dataUrl == null) return;
    BT._ensureOverlay();               // a prior to-selection may have nulled the overlay
    var img = new Image();
    img.onload = function () {
      BT._paintCtx.clearRect(0, 0, BT._paintCanvas.width, BT._paintCanvas.height);
      BT._paintCtx.drawImage(img, 0, 0);
      BT._updateOverlay();
      BT._updateBarState();
    };
    img.src = dataUrl;
  };

  BT._brushPaintUndo = function () {
    if (!BT._active || !BT._paintUndoStack.length) return false;
    var cur = BT._snapshotPaint();
    if (cur != null) BT._paintRedoStack.push(cur);
    BT._restorePaint(BT._paintUndoStack.pop());
    return true;
  };

  BT._brushPaintRedo = function () {
    if (!BT._active || !BT._paintRedoStack.length) return false;
    var cur = BT._snapshotPaint();
    if (cur != null) BT._paintUndoStack.push(cur);
    BT._restorePaint(BT._paintRedoStack.pop());
    return true;
  };

  BT._createBrushTip = function (size, hardness, color, alpha) {
    var tip = document.createElement('canvas');
    var r = Math.ceil(size / 2);
    tip.width = tip.height = r * 2;
    var ctx = tip.getContext('2d');
    var c  = BT._parseColor(color);
    var bt = BT._cfg.brushType;

    if (bt === 'oil') {
      /* ── Oil Paint: thick radial with textured noise ── */
      var grad = ctx.createRadialGradient(r, r, 0, r, r, r);
      var inner = Math.max(0.3, hardness / 100);
      grad.addColorStop(0,     'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + Math.min(1, alpha * 1.2) + ')');
      grad.addColorStop(inner * 0.5, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha * 0.95 + ')');
      grad.addColorStop(inner, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha * 0.7 + ')');
      grad.addColorStop(1,     'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, tip.width, tip.height);
      var id = ctx.getImageData(0, 0, tip.width, tip.height);
      var d  = id.data;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0) {
          var noise = (Math.random() - 0.5) * 30;
          d[i]     = Math.max(0, Math.min(255, d[i]     + noise));
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise));
        }
      }
      ctx.putImageData(id, 0, 0);

    } else if (bt === 'watercolor') {
      /* ── Watercolor: very soft, translucent, multi-layer ── */
      var wAlpha = alpha * 0.35;
      for (var layer = 0; layer < 3; layer++) {
        var ox = (Math.random() - 0.5) * 3;
        var oy = (Math.random() - 0.5) * 3;
        var gr = ctx.createRadialGradient(r + ox, r + oy, 0, r + ox, r + oy, r * (0.85 + layer * 0.08));
        gr.addColorStop(0,   'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + wAlpha + ')');
        gr.addColorStop(0.4, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + wAlpha * 0.6 + ')');
        gr.addColorStop(1,   'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(r + ox, r + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }

    } else {
      /* ── Normal Brush ── */
      if (hardness >= 95) {
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(r, r, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        var grad = ctx.createRadialGradient(r, r, 0, r, r, r);
        var inner = Math.max(0, hardness / 100);
        grad.addColorStop(0,     'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')');
        grad.addColorStop(inner, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')');
        grad.addColorStop(1,     'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, tip.width, tip.height);
      }
    }
    return tip;
  };

  BT._parseColor = function (hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  };

  BT._stampAt = function (ctx, tip, x, y) {
    var r = tip.width / 2;
    ctx.drawImage(tip, x - r, y - r);
  };

  BT._strokeBetween = function (ctx, tip, x0, y0, x1, y1, spacing) {
    var dx = x1 - x0, dy = y1 - y0;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) { BT._stampAt(ctx, tip, x1, y1); return; }
    var step = Math.max(1, spacing);
    var steps = Math.ceil(dist / step);
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      BT._stampAt(ctx, tip, x0 + dx * t, y0 + dy * t);
    }
  };

  BT._smooth = function (pt) {
    if (BT._cfg.smoothing < 5) return pt;
    BT._ptHistory.push(pt);
    if (BT._ptHistory.length < 3) return pt;
    if (BT._ptHistory.length > 4) BT._ptHistory.shift();

    var a = BT._cfg.smoothing / 100;
    var n = BT._ptHistory.length;
    var sx = 0, sy = 0;
    for (var i = 0; i < n; i++) { sx += BT._ptHistory[i].x; sy += BT._ptHistory[i].y; }
    return {
      x: pt.x * (1 - a) + (sx / n) * a,
      y: pt.y * (1 - a) + (sy / n) * a
    };
  };

  BT._showCursor = function (cvs, pt) {
    var zoom = cvs.getZoom();
    var r = (BT._cfg.size / 2);
    if (!BT._cursorCircle) {
      BT._cursorCircle = new fabric.Circle({
        radius: r,
        left: pt.x - r,
        top: pt.y - r,
        fill: 'transparent',
        stroke: 'rgba(255,255,255,0.6)',
        strokeWidth: 1 / zoom,
        selectable: false, evented: false,
        excludeFromExport: true,
        _isPaintCursor: true
      });
      cvs.add(BT._cursorCircle);
    } else {
      BT._cursorCircle.set({
        radius: r,
        left: pt.x - r,
        top: pt.y - r,
        strokeWidth: 1 / zoom
      });
    }
    BT._cursorCircle.moveTo(cvs.getObjects().length - 1);
    cvs.renderAll();
  };

  BT._removeCursor = function (cvs) {
    if (BT._cursorCircle) {
      cvs.remove(BT._cursorCircle);
      BT._cursorCircle = null;
    }
  };

  BT._getCanvasPt = function (opt) {
    var cvs = BT._getCvs();
    return cvs.getPointer(opt.e);
  };

  BT._onDown = function (opt) {
    if (!BT._active) return;
    // Recover if a selection was dismissed but the phase got stuck (no preview left).
    if (BT._phase === BT.PHASE_SELECTION && (!BT._selPreviewObj || !BT._selPreviewObj.canvas)) BT._returnToPaintPhase();
    if (BT._phase !== BT.PHASE_PAINT) return;
    if (opt.e.button !== 0) return;
    BT._ensureOverlay();           // restore overlay if a prior to-selection nulled it
    BT._pushPaintUndo();           // snapshot pre-stroke state so Ctrl+Z removes ONE stroke
    BT._painting = true;
    BT._ptHistory = [];

    var pt = BT._getCanvasPt(opt);
    BT._lastPt = pt;

    BT._strokeCtx.clearRect(0, 0, BT._strokeCanvas.width, BT._strokeCanvas.height);

    var flowAlpha = BT._cfg.flow / 100;
    var tip = BT._createBrushTip(BT._cfg.size, BT._cfg.hardness, BT._cfg.color, flowAlpha);
    BT._stampAt(BT._strokeCtx, tip, pt.x, pt.y);
    BT._compositeStroke();
  };

  BT._onMove = function (opt) {
    var pt = BT._getCanvasPt(opt);
    var cvs = BT._getCvs();
    if (BT._phase === BT.PHASE_PAINT) BT._showCursor(cvs, pt);

    if (!BT._painting) return;

    var smoothed = BT._smooth(pt);
    var spacing  = Math.max(1, (BT._cfg.size * BT._cfg.spacing / 100));
    var flowAlpha = BT._cfg.flow / 100;
    var tip = BT._createBrushTip(BT._cfg.size, BT._cfg.hardness, BT._cfg.color, flowAlpha);

    BT._strokeBetween(BT._strokeCtx, tip, BT._lastPt.x, BT._lastPt.y, smoothed.x, smoothed.y, spacing);
    BT._lastPt = smoothed;
    BT._compositeStroke();
  };

  BT._onUp = function () {
    if (!BT._painting) return;
    BT._painting = false;
    BT._lastPt   = null;
    BT._ptHistory = [];
    BT._bakeStroke();
    BT._updateOverlay();
    BT._updateBarState();
  };

  BT._compositeStroke = function () {
    var cvs = BT._getCvs();
    if (!cvs || !BT._fabricOverlay) return;

    var tmp = document.createElement('canvas');
    tmp.width  = BT._paintCanvas.width;
    tmp.height = BT._paintCanvas.height;
    var ctx = tmp.getContext('2d');
    ctx.drawImage(BT._paintCanvas, 0, 0);
    ctx.globalAlpha = BT._cfg.opacity / 100;
    ctx.drawImage(BT._strokeCanvas, 0, 0);

    var imgEl = new Image();
    imgEl.onload = function () {
      if (!BT._fabricOverlay) return;
      BT._fabricOverlay.setElement(imgEl);
      cvs.renderAll();
    };
    imgEl.src = tmp.toDataURL();
  };

  BT._bakeStroke = function () {
    BT._paintCtx.save();
    BT._paintCtx.globalAlpha = BT._cfg.opacity / 100;
    BT._paintCtx.drawImage(BT._strokeCanvas, 0, 0);
    BT._paintCtx.restore();
    BT._strokeCtx.clearRect(0, 0, BT._strokeCanvas.width, BT._strokeCanvas.height);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'paint', parent: 'canvas.tools.brush-tool', title: 'brush-tool: paint', mount: function () {}, unmount: function () {} });
  }
})();
