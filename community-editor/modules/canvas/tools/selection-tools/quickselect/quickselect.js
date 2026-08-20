/* Module: canvas/tools/selection-tools/quickselect — Quick-select (flood/Sobel) — grow, overlay, contour trace, brush bar.
   Part of the selection-tools group (decomposed from the 1542-line IIFE). Functions hang off the
   shared namespace VST (window.__ccSelectionTools, created by the parent); cross-module refs resolve
   through VST at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VST = window.__ccSelectionTools;
  if (!VST) return;

  VST._qsBegin = function (img) {
    if (!img || img.type !== 'image' || img.isQR || img._isChart || img._isEffect) {
      if (typeof showToast === 'function') showToast('Click on an image');
      return false;
    }
    var el = img._element || img._originalElement;
    if (!el) return false;
    var natW = el.naturalWidth || el.width;
    var natH = el.naturalHeight || el.height;
    if (natW < 4 || natH < 4) return false;

    var maxDim = 512;
    var sc = Math.min(maxDim / natW, maxDim / natH, 1);
    VST._qsW = Math.round(natW * sc);
    VST._qsH = Math.round(natH * sc);

    var tmp = document.createElement('canvas');
    tmp.width = VST._qsW; tmp.height = VST._qsH;
    var tctx = tmp.getContext('2d');
    tctx.drawImage(el, 0, 0, VST._qsW, VST._qsH);
    VST._qsPix = tctx.getImageData(0, 0, VST._qsW, VST._qsH).data;

    VST._qsMask = new Uint8Array(VST._qsW * VST._qsH);
    VST._qsEdge = VST._qsSobel(VST._qsPix, VST._qsW, VST._qsH);
    VST._qsImg = img;
    VST._qsActive = true;

    var cap = VST._qsW * VST._qsH;
    VST._qsBfsQ = new Int32Array(cap);
    VST._qsBfsVis = new Uint8Array(cap);

    VST._qsOffCvs = document.createElement('canvas');
    VST._qsOffCvs.width = VST._qsW; VST._qsOffCvs.height = VST._qsH;
    VST._qsOffCtx = VST._qsOffCvs.getContext('2d');

    VST._ensureUid(img);
    VST._qsShowBar();
    if (typeof showToast === 'function')
      showToast('Brush to select \u2014 Enter to apply, Esc to cancel');
    return true;
  };

  VST._qsSobel = function (data, w, h) {
    var gray = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++)
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    var e = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var p = y * w + x;
        var gx = -gray[p - w - 1] + gray[p - w + 1]
               - 2 * gray[p - 1] + 2 * gray[p + 1]
               - gray[p + w - 1] + gray[p + w + 1];
        var gy = -gray[p - w - 1] - 2 * gray[p - w] - gray[p - w + 1]
               + gray[p + w - 1] + 2 * gray[p + w] + gray[p + w + 1];
        e[p] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return e;
  };

  VST._qsPtr2Px = function (cx, cy) {
    var b = VST._qsImg.getBoundingRect(true);
    return {
      x: Math.round(((cx - b.left) / b.width) * VST._qsW),
      y: Math.round(((cy - b.top) / b.height) * VST._qsH)
    };
  };

  VST._qsWBR = function () {
    var b = VST._qsImg.getBoundingRect(true);
    return Math.max(2, Math.round(VST._qsBrushR / b.width * VST._qsW));
  };

  VST._qsGrowAt = function (cx, cy, r) {
    var w = VST._qsW, h = VST._qsH, mask = VST._qsMask, pix = VST._qsPix, edge = VST._qsEdge;
    var rr = Math.max(r, 2), tolSq = VST._qsColorTol * VST._qsColorTol, ethresh = VST._qsEdgeThr;

    // Seed colour = average under brush
    var sr = 0, sg = 0, sb = 0, cnt = 0;
    for (var dy = -rr; dy <= rr; dy++) {
      for (var dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        var px = cx + dx, py = cy + dy;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        var i4 = (py * w + px) * 4;
        if (pix[i4 + 3] < 10) continue;
        sr += pix[i4]; sg += pix[i4 + 1]; sb += pix[i4 + 2]; cnt++;
      }
    }
    if (cnt === 0) return;
    sr /= cnt; sg /= cnt; sb /= cnt;

    // Mark brush circle + collect seeds
    var seeds = [];
    for (var dy = -rr; dy <= rr; dy++) {
      for (var dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        var px = cx + dx, py = cy + dy;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        var pos = py * w + px;
        if (!mask[pos]) { mask[pos] = 1; seeds.push(pos); }
      }
    }
    if (seeds.length === 0) return;

    // BFS flood fill with pre-allocated buffers
    var cap = w * h, q = VST._qsBfsQ, vis = VST._qsBfsVis;
    vis.fill(0);
    for (var i = 0; i < cap; i++) if (mask[i]) vis[i] = 1;
    var qH = 0, qT = 0;
    for (var s = 0; s < seeds.length; s++) q[qT++] = seeds[s];

    while (qH < qT) {
      var p = q[qH++];
      var x = p % w, y = (p / w) | 0;
      var nb0 = y > 0 ? p - w : -1, nb1 = y < h - 1 ? p + w : -1;
      var nb2 = x > 0 ? p - 1 : -1, nb3 = x < w - 1 ? p + 1 : -1;
      for (var d = 0; d < 4; d++) {
        var np = d === 0 ? nb0 : d === 1 ? nb1 : d === 2 ? nb2 : nb3;
        if (np < 0 || vis[np]) continue;
        vis[np] = 1;
        if (edge[np] > ethresh) continue;
        var i4 = np * 4;
        if (pix[i4 + 3] < 10) continue;
        var dr = pix[i4] - sr, dg = pix[i4 + 1] - sg, db = pix[i4 + 2] - sb;
        if (dr * dr + dg * dg + db * db > tolSq) continue;
        mask[np] = 1;
        q[qT++] = np;
      }
    }
  };

  VST._qsRefreshOverlay = function () {
    var w = VST._qsW, h = VST._qsH, mask = VST._qsMask, cvs = VST._getCvs();
    VST._qsOffCtx.clearRect(0, 0, w, h);
    var id = VST._qsOffCtx.createImageData(w, h), od = id.data;
    for (var i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      var x = i % w, y = (i / w) | 0;
      var border = (x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
                    !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]);
      if (border) {
        od[i * 4] = 255; od[i * 4 + 1] = 199; od[i * 4 + 2] = 234; od[i * 4 + 3] = 210;
      } else {
        od[i * 4] = 255; od[i * 4 + 1] = 120; od[i * 4 + 2] = 220; od[i * 4 + 3] = 55;
      }
    }
    VST._qsOffCtx.putImageData(id, 0, 0);
    var b = VST._qsImg.getBoundingRect(true);
    if (!VST._qsOverlay) {
      VST._qsOverlay = new fabric.Image(VST._qsOffCvs, {
        left: b.left, top: b.top,
        scaleX: b.width / w, scaleY: b.height / h,
        selectable: false, evented: false,
        excludeFromExport: true, _isSelPreview: true, objectCaching: false
      });
      cvs.add(VST._qsOverlay);
    } else {
      VST._qsOverlay.setElement(VST._qsOffCvs);
      VST._qsOverlay.set({ left: b.left, top: b.top, scaleX: b.width / w, scaleY: b.height / h });
      VST._qsOverlay.dirty = true;
    }
    if (VST._qsBrushCvs) cvs.bringToFront(VST._qsBrushCvs);
    cvs.renderAll();
  };

  VST._qsFinalize = function () {
    if (!VST._qsActive || !VST._qsImg) { VST._qsCleanup(); VST.deactivateSelectionTool(); return; }
    var has = false;
    for (var i = 0; i < VST._qsW * VST._qsH; i++) { if (VST._qsMask[i]) { has = true; break; } }
    if (!has) { VST._qsCleanup(); VST.deactivateSelectionTool(); return; }

    // ── Refine Edge Pipeline ──
    var refined = VST._reRefine(VST._qsMask, VST._qsW, VST._qsH, VST._reSmooth, VST._reFeather, VST._reContrast, VST._reShift);

    // Threshold soft mask back to binary for contour trace
    var binMask = new Uint8Array(VST._qsW * VST._qsH);
    for (var i = 0; i < VST._qsW * VST._qsH; i++) binMask[i] = refined[i] > 0.5 ? 1 : 0;

    VST._qsMorphClose(binMask, VST._qsW, VST._qsH, 1);
    var contour = VST._qsTraceContour(binMask, VST._qsW, VST._qsH);
    if (!contour || contour.length < 6) { VST._qsCleanup(); VST.deactivateSelectionTool(); return; }
    contour = VST._dpSimplify(contour, 1.2);
    if (contour.length < 3) { VST._qsCleanup(); VST.deactivateSelectionTool(); return; }

    // Chaikin curve subdivision for smoother path
    contour = VST._reChaikin(contour, 2);

    var b = VST._qsImg.getBoundingRect(true);
    var canvasPts = [];
    for (var i = 0; i < contour.length; i++) {
      canvasPts.push({
        x: b.left + (contour[i].x / VST._qsW) * b.width,
        y: b.top  + (contour[i].y / VST._qsH) * b.height
      });
    }
    var srcImg = VST._qsImg;
    VST._qsCleanup();
    VST._createFrameFromPoints(canvasPts, srcImg);
    VST.deactivateSelectionTool();
  };

  VST._qsMorphClose = function (mask, w, h, iter) {
    var tmp = new Uint8Array(w * h);
    for (var n = 0; n < iter; n++) {
      tmp.set(mask);
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var p = y * w + x;
        if (tmp[p] || tmp[p - 1] || tmp[p + 1] || tmp[p - w] || tmp[p + w]) mask[p] = 1;
      }
    }
    for (var n = 0; n < iter; n++) {
      tmp.set(mask);
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var p = y * w + x;
        if (!(tmp[p] && tmp[p - 1] && tmp[p + 1] && tmp[p - w] && tmp[p + w])) mask[p] = 0;
      }
    }
  };

  VST._qsTraceContour = function (mask, w, h) {
    var s = -1;
    for (var i = 0; i < w * h; i++) { if (mask[i]) { s = i; break; } }
    if (s < 0) return null;
    var sx = s % w, sy = (s / w) | 0;
    var ddx = [0, 1, 1, 1, 0, -1, -1, -1];
    var ddy = [-1, -1, 0, 1, 1, 1, 0, -1];
    var pts = [], cx = sx, cy = sy, bd = 6, maxIt = w * h * 2;
    do {
      pts.push({ x: cx, y: cy });
      var found = false;
      for (var i = 0; i < 8; i++) {
        var d = (bd + 1 + i) % 8;
        var nx = cx + ddx[d], ny = cy + ddy[d];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
          bd = (d + 4) % 8; cx = nx; cy = ny; found = true; break;
        }
      }
      if (!found) break;
    } while ((cx !== sx || cy !== sy) && --maxIt > 0);
    return pts;
  };

  VST._qsMoveCursor = function (cx, cy) {
    var cvs = VST._getCvs();
    if (!VST._qsBrushCvs) {
      VST._qsBrushCvs = new fabric.Circle({
        radius: VST._qsBrushR,
        fill: 'rgba(242, 255, 88,0.10)',
        stroke: 'rgba(242, 255, 88,0.55)',
        strokeWidth: 1.2, strokeDashArray: [4, 3],
        selectable: false, evented: false,
        excludeFromExport: true, _isSelPreview: true,
        originX: 'center', originY: 'center'
      });
      cvs.add(VST._qsBrushCvs);
    }
    VST._qsBrushCvs.set({ left: cx, top: cy, radius: VST._qsBrushR });
    VST._qsBrushCvs.setCoords();
  };

  VST._qsShowBar = function () {
    if (VST._qsBar) { VST._qsBar.style.display = 'flex'; return; }
    VST._qsBar = document.createElement('div');
    VST._qsBar.className = 'selection-remove-bar';
    VST._qsBar.innerHTML =
      '<span style="color:#f2ff58">&#10022; Quick Select</span>' +
      '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#aaa;margin-left:8px">' +
        'Size <input type="range" id="qs-brush-slider" min="5" max="60" value="' + VST._qsBrushR + '" ' +
        'style="width:80px;accent-color:#f2ff58" oninput="VST._qsSetBrush(+this.value)">' +
        '<span id="qs-brush-val" style="min-width:18px">' + VST._qsBrushR + '</span>' +
      '</label>' +
      '<button onclick="VST._qsApply()" style="margin-left:12px">Apply (Enter)</button>' +
      '<button onclick="VST._qsInvert()" title="Shift+Ctrl+I">Invert</button>' +
      '<button onclick="VST._reOpen()" title="Refine Edge">Refine Edge</button>' +
      '<button onclick="VST._qsCancelBtn()">Cancel (Esc)</button>';
    document.body.appendChild(VST._qsBar);
  };

  VST._qsHideBar = function () { if (VST._qsBar) VST._qsBar.style.display = 'none'; }

  VST._qsUpdateSlider = function () {
    var sl = document.getElementById('qs-brush-slider');
    if (sl) sl.value = VST._qsBrushR;
    var v = document.getElementById('qs-brush-val');
    if (v) v.textContent = VST._qsBrushR;
  };

  VST._qsApply = function () { VST._qsFinalize(); };

  VST._qsCancelBtn = function () { VST._qsCleanup(); VST.deactivateSelectionTool(); };

  VST._qsSetBrush = function (v) { VST._qsBrushR = v; VST._qsUpdateSlider(); };

  VST._qsInvert = function () { VST._qsInvertMask(); };

  VST._qsInvertMask = function () {
    if (!VST._qsActive || !VST._qsMask || !VST._qsPix) return;
    var w = VST._qsW, h = VST._qsH, mask = VST._qsMask, pix = VST._qsPix;
    for (var i = 0; i < w * h; i++) {
      // Only include opaque pixels in inversion (skip transparent bg)
      mask[i] = (pix[i * 4 + 3] > 10 && !mask[i]) ? 1 : (mask[i] ? 0 : 0);
    }
    VST._qsRefreshOverlay();
    if (typeof showToast === 'function') showToast('Selection inverted');
  };

  VST._qsCleanup = function () {
    var cvs = VST._getCvs();
    if (VST._qsOverlay)  { cvs.remove(VST._qsOverlay);  VST._qsOverlay = null; }
    if (VST._qsBrushCvs) { cvs.remove(VST._qsBrushCvs); VST._qsBrushCvs = null; }
    VST._qsActive = false; VST._qsDrawing = false;
    VST._qsImg = null; VST._qsMask = null; VST._qsEdge = null; VST._qsPix = null;
    VST._qsOffCvs = null; VST._qsOffCtx = null; VST._qsLastPt = null;
    VST._qsBfsQ = null; VST._qsBfsVis = null;
    VST._qsHideBar();
    VST._reHidePanel();
    cvs.renderAll();
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'I' && (e.ctrlKey || e.metaKey) && e.shiftKey && VST._qsActive) {
      e.preventDefault();
      VST._qsInvertMask();
      return;
    }
    if (e.key === 'Enter' && VST._qsActive) {
      e.preventDefault();
      VST._qsFinalize();
      return;
    }
    if (e.key === 'Escape' && VST._activeTool) {
      e.preventDefault();
      if (VST._qsActive) VST._qsCleanup();
      VST._points = [];
      VST._sourceImage = null;
      VST._drawing = false;
      VST._clearPreview();
      VST.deactivateSelectionTool();
    }
    if (VST._activeTool === 'quick') {
      var ae = document.activeElement;
      var typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
      var ao = cvs && cvs.getActiveObject ? cvs.getActiveObject() : null;
      if (typing || (ao && ao.isEditing)) return;
      if (e.key === '[') { VST._qsBrushR = Math.max(5, VST._qsBrushR - 3); VST._qsUpdateSlider(); }
      if (e.key === ']') { VST._qsBrushR = Math.min(60, VST._qsBrushR + 3); VST._qsUpdateSlider(); }
    }
  });

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'quickselect', parent: 'canvas.tools.selection-tools', title: 'selection-tools: quickselect', mount: function () {}, unmount: function () {} });
  }
})();
