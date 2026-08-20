/* Module: canvas/tools/brush-tool/convert — Paint → selection / shape conversion (contour trace, simplify, preview).
   Part of the brush-tool group (decomposed from the 1532-line IIFE). Functions hang off the
   shared namespace BT (window.__ccBrushTool, created by the parent); cross-module refs resolve
   through BT at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var BT = window.__ccBrushTool;
  if (!BT) return;

  BT._doClear = function () {
    if (BT._hasPaint()) BT._pushPaintUndo();   // make the clear itself undoable
    if (BT._paintCanvas) BT._paintCtx.clearRect(0, 0, BT._paintCanvas.width, BT._paintCanvas.height);
    BT._ensureOverlay();           // to-selection may have nulled the overlay; restore it
    BT._updateOverlay();
    BT._clearSelectionPreview();
    window._paintSelection = null;
    BT._phase = BT.PHASE_PAINT;
    BT._updateBarState();
    if (typeof showToast === 'function') showToast('Paint cleared');
  };

  BT._doSavePaintAsImage = function () {
    if (!BT._paintCanvas || !BT._hasPaint()) {
      if (typeof showToast === 'function') showToast('No paint data to save');
      return;
    }

    /* Find bounding box of non-transparent pixels */
    var w = BT._paintCanvas.width, h = BT._paintCanvas.height;
    var data = BT._paintCtx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = 0, maxY = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) {
      if (typeof showToast === 'function') showToast('No visible paint');
      return;
    }

    /* Add 1px padding */
    var cropW = maxX - minX + 1;
    var cropH = maxY - minY + 1;

    /* Extract cropped region */
    var cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    var cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(BT._paintCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    var cvs = BT._getCvs();
    if (!cvs) return;

    var imgEl = new Image();
    imgEl.onload = function () {
      var fImg = new fabric.Image(imgEl, {
        left: minX,
        top: minY,
        selectable: true,
        evented: true,
        _isBrushPaint: true,
        _isFrame: true,
        _frameId: 'frame-brush-' + Date.now() + '-' + Math.floor(Math.random() * 9999)
      });

      /* Clean up and exit */
      BT._doClear();
      BT.deactivateBrushTool();

      cvs.add(fImg);
      cvs.setActiveObject(fImg);
      cvs.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof showToast === 'function') showToast('Paint saved as frame');
    };
    imgEl.src = cropCanvas.toDataURL('image/png');
  };

  BT._doConvertToSelection = function () {
    if (!BT._paintCanvas) { if (typeof showToast === 'function') showToast('No paint data'); return; }

    var w = BT._paintCanvas.width, h = BT._paintCanvas.height;
    var imgData = BT._paintCtx.getImageData(0, 0, w, h);
    var data = imgData.data;

    /* 1) Binary mask from alpha channel */
    var mask = new Uint8Array(w * h);
    var minX = w, minY = h, maxX = 0, maxY = 0;
    var threshold = 20;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var a = data[(y * w + x) * 4 + 3];
        if (a > threshold) {
          mask[y * w + x] = 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX) { if (typeof showToast === 'function') showToast('No paint region found'); return; }

    /* 2) Morphological close to fill small interior holes */
    mask = BT._morphClose(mask, w, h, 2);

    /* 3) Trace exterior contour (Moore neighborhood boundary) */
    var contour = BT._traceContour(mask, w, h,
      Math.max(0, minX - 2), Math.max(0, minY - 2),
      Math.min(w - 1, maxX + 2), Math.min(h - 1, maxY + 2));

    if (!contour || contour.length < 6) {
      if (typeof showToast === 'function') showToast('Paint region too small to select');
      return;
    }

    /* 4) Smooth (Chaikin x2 + decimate) */
    contour = BT._smoothContour(contour, 2);

    /* 5) Store & show preview */
    window._paintSelection = contour;
    BT._drawSelectionPreview(contour);
    BT._phase = BT.PHASE_SELECTION;
    BT._updateBarState();

    /* Remove paint overlay so clean selection shows through */
    var cvs = BT._getCvs();
    if (cvs && BT._fabricOverlay) {
      cvs.remove(BT._fabricOverlay);
      BT._fabricOverlay = null;
    }
    BT._removeCursor(cvs);

    if (typeof showToast === 'function')
      showToast('Selection created — refine or convert to shape');
  };

  BT._morphClose = function (mask, w, h, radius) {
    var dilated = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (mask[y * w + x]) { dilated[y * w + x] = 1; continue; }
        var found = false;
        for (var dy = -radius; dy <= radius && !found; dy++) {
          for (var dx = -radius; dx <= radius && !found; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) found = true;
          }
        }
        if (found) dilated[y * w + x] = 1;
      }
    }
    var result = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!dilated[y * w + x]) continue;
        var allSet = true;
        for (var dy = -radius; dy <= radius && allSet; dy++) {
          for (var dx = -radius; dx <= radius && allSet; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || !dilated[ny * w + nx]) allSet = false;
          }
        }
        if (allSet) result[y * w + x] = 1;
      }
    }
    return result;
  };

  BT._traceContour = function (mask, w, h, minX, minY, maxX, maxY) {
    /* Find first boundary pixel */
    var startX = -1, startY = -1;
    for (var y = minY; y <= maxY && startX < 0; y++) {
      for (var x = minX; x <= maxX; x++) {
        if (mask[y * w + x] === 1) {
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
              !mask[y * w + (x - 1)] || !mask[y * w + (x + 1)] ||
              !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x]) {
            startX = x; startY = y; break;
          }
        }
      }
    }
    if (startX < 0) return [];

    var dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    var contour = [{ x: startX, y: startY }];
    var cx = startX, cy = startY;
    var backDir = 4;
    var maxIter = (maxX - minX + 1) * (maxY - minY + 1) * 2;
    var iter = 0;

    do {
      var searchDir = (backDir + 1) % 8;
      var foundNext = false;
      for (var s = 0; s < 8; s++) {
        var d = (searchDir + s) % 8;
        var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 1) {
          cx = nx; cy = ny;
          backDir = (d + 4) % 8;
          foundNext = true;
          break;
        }
      }
      if (!foundNext) break;
      if (cx === startX && cy === startY) break;
      contour.push({ x: cx, y: cy });
      iter++;
    } while (iter < maxIter);

    return contour;
  };

  BT._smoothContour = function (pts, iterations) {
    var result = pts;
    for (var it = 0; it < iterations; it++) {
      var next = [];
      for (var i = 0; i < result.length; i++) {
        var p0 = result[i];
        var p1 = result[(i + 1) % result.length];
        next.push({ x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 });
        next.push({ x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 });
      }
      result = next;
    }
    /* Decimate to reasonable point count */
    if (result.length > 500) {
      var step = Math.ceil(result.length / 500);
      var dec = [];
      for (var i = 0; i < result.length; i += step) dec.push(result[i]);
      result = dec;
    }
    return result;
  };

  BT._drawSelectionPreview = function (pts) {
    var cvs = BT._getCvs();
    if (!cvs) return;
    BT._clearSelectionPreview();

    var pathStr = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (var i = 1; i < pts.length; i++) {
      pathStr += ' L ' + pts[i].x + ' ' + pts[i].y;
    }
    pathStr += ' Z';

    BT._selPreviewObj = new fabric.Path(pathStr, {
      fill: 'rgba(242, 255, 88,0.08)',
      stroke: '#f2ff58',
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
      selectable: true,    /* ← selectable for refinement */
      evented: true,
      excludeFromExport: true,
      _isPaintSelPreview: true
    });
    cvs.add(BT._selPreviewObj);
    cvs.setActiveObject(BT._selPreviewObj);
    cvs.renderAll();
  };

  BT._clearSelectionPreview = function () {
    var cvs = BT._getCvs();
    if (cvs && BT._selPreviewObj) {
      BT._internalPreviewRemoval = true;   // so BT._onObjectRemoved ignores OUR removal
      cvs.remove(BT._selPreviewObj);
      BT._internalPreviewRemoval = false;
      BT._selPreviewObj = null;
    }
  };

  BT._returnToPaintPhase = function () {
    BT._selPreviewObj = null;
    window._paintSelection = null;
    BT._phase = BT.PHASE_PAINT;
    BT._ensureOverlay();
    BT._updateOverlay();
    BT._updateBarState();
  };

  BT._onObjectRemoved = function (opt) {
    if (!BT._active || BT._internalPreviewRemoval) return;
    var o = opt && opt.target;
    if (o && o._isPaintSelPreview && BT._phase === BT.PHASE_SELECTION) BT._returnToPaintPhase();
  };

  BT._doConvertToShape = function () {
    var pts = window._paintSelection;
    if (!pts || pts.length < 4) {
      if (typeof showToast === 'function') showToast('No selection — convert paint to selection first.');
      return;
    }

    /* If the preview path was moved/scaled by the user, recalculate from it */
    if (BT._selPreviewObj && BT._selPreviewObj.canvas) {
      var matrix = BT._selPreviewObj.calcTransformMatrix();
      var path = BT._selPreviewObj.path;
      if (path && path.length > 0) {
        pts = [];
        path.forEach(function (seg) {
          if (seg.length >= 3) {
            var pt = fabric.util.transformPoint({ x: seg[seg.length - 2], y: seg[seg.length - 1] }, matrix);
            pts.push(pt);
          }
        });
        if (pts.length < 4) pts = window._paintSelection;
      }
    }

    /* Simplify using Douglas-Peucker */
    var simplified = BT._douglasPeucker(pts, 1.5);
    if (simplified.length < 3) simplified = pts.slice(0, Math.min(pts.length, 50));

    /* Bounding box for offset */
    var bMinX = Infinity, bMinY = Infinity;
    for (var i = 0; i < simplified.length; i++) {
      if (simplified[i].x < bMinX) bMinX = simplified[i].x;
      if (simplified[i].y < bMinY) bMinY = simplified[i].y;
    }

    /* Build SVG path relative to origin */
    var pathStr = 'M ' + (simplified[0].x - bMinX).toFixed(1) + ' ' + (simplified[0].y - bMinY).toFixed(1);
    for (var i = 1; i < simplified.length; i++) {
      pathStr += ' L ' + (simplified[i].x - bMinX).toFixed(1) + ' ' + (simplified[i].y - bMinY).toFixed(1);
    }
    pathStr += ' Z';

    var cvs = BT._getCvs();
    if (!cvs) return;

    var shape = new fabric.Path(pathStr, {
      left: bMinX,
      top:  bMinY,
      fill: 'rgba(242, 255, 88,0.25)',
      stroke: '#f2ff58',
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
      selectable: true,
      evented: true,
      _isBrushShape: true,
      _isFrame: true,
      _frameId: 'frame-brush-' + Date.now() + '-' + Math.floor(Math.random() * 9999)
    });

    /* Clean up */
    BT._clearSelectionPreview();
    window._paintSelection = null;

    /* Exit paint mode */
    BT.deactivateBrushTool();

    /* Add shape at its painted position & select it */
    cvs.add(shape);
    cvs.setActiveObject(shape);
    cvs.renderAll();
    if (typeof snap === 'function') snap();

    window._lastBrushShape = shape;
    /* Show toast with save prompt */
    setTimeout(function () {
      var t = document.getElementById('toast-notification');
      if (!t) { t = document.createElement('div'); t.id = 'toast-notification'; t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--surface,#1a1a2e);border:1px solid var(--border2,#333);color:var(--text,#fff);padding:12px 24px;border-radius:10px;font-size:13px;font-family:"DM Sans",sans-serif;font-weight:600;z-index:2000;opacity:0;transition:all .3s ease;box-shadow:0 8px 32px rgba(0,0,0,.5);display:flex;align-items:center;gap:8px;pointer-events:none;'; document.body.appendChild(t); }
      t.innerHTML = '<span style="color:var(--gold,#f2ff58);display:flex"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></span>Shape created (' + simplified.length + ' pts) &mdash; <span id="_toast-save-shape" style="color:var(--gold,#f2ff58);text-decoration:underline;cursor:pointer;margin-left:4px">Save to My Shapes?</span>';
      t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; t.style.pointerEvents = 'auto';
      var link = document.getElementById('_toast-save-shape');
      if (link) link.onclick = function () { if (typeof BT.saveToMyShapes === 'function') BT.saveToMyShapes(); t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; t.style.pointerEvents = 'none'; };
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; t.style.pointerEvents = 'none'; }, 6000);
    }, 200);
  };

  BT._douglasPeucker = function (pts, epsilon) {
    if (pts.length <= 2) return pts;
    var maxDist = 0, maxIdx = 0;
    var A = pts[0], B = pts[pts.length - 1];
    for (var i = 1; i < pts.length - 1; i++) {
      var d = BT._pointToLineDist(pts[i], A, B);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > epsilon) {
      var left = BT._douglasPeucker(pts.slice(0, maxIdx + 1), epsilon);
      var right = BT._douglasPeucker(pts.slice(maxIdx), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [A, B];
  };

  BT._pointToLineDist = function (p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt((p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y));
    var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    var px = a.x + t * dx, py = a.y + t * dy;
    return Math.sqrt((p.x - px) * (p.x - px) + (p.y - py) * (p.y - py));
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'convert', parent: 'canvas.tools.brush-tool', title: 'brush-tool: convert', mount: function () {}, unmount: function () {} });
  }
})();
