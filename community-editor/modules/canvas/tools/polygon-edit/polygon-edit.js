/* Vertex / path editor — REWRITTEN to fabric 7's direct path-point architecture (ported to fabric 5.3.1).
   The old version tessellated the path, picked SPARSE anchors and WARPED the dense outline on drag — which
   clustered handles at sharp features and drew a straight-line guide that never followed curves. This one
   edits the object's REAL path data directly: one handle per path node (M/L anchors, C/Q anchors + their
   bezier control points), positioned with the object matrix, dragged back into path-space with its inverse.
   No approximation → the shape always wraps exactly. Math verified 1:1 against fabric 7 in a browser test. */
(function () {
  'use strict';

  var _pe = null;

  function _getCvs() {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
           (typeof canvas !== 'undefined' ? canvas : null);
  }

  /* ── Coordinate transforms (fabric 7's calcPathPointPosition / sendPointToPlane, ported) ── */
  function _mat(o) { return o.calcTransformMatrix(); }

  function _ptToCanvas(o, px, py) {
    var po = o.pathOffset || { x: 0, y: 0 };
    return fabric.util.transformPoint(new fabric.Point(px - po.x, py - po.y), _mat(o));
  }

  function _canvasToPt(o, cx, cy) {
    var po = o.pathOffset || { x: 0, y: 0 };
    var loc = fabric.util.transformPoint(new fabric.Point(cx, cy), fabric.util.invertTransform(_mat(o)));
    return { x: loc.x + po.x, y: loc.y + po.y };
  }

  /* ── Node model: one entry per editable path point ── */
  function _anchorPtIdx(cmd) { return cmd.length - 2; } // M/L→1, Q→3, C→5

  function _buildNodes(o) {
    var nodes = [];
    if (!o.path || !o.path.length) return nodes;
    var prevType = 'M';
    var ci, cmd, t, sub = -1;
    for (ci = 0; ci < o.path.length; ci++) {
      cmd = o.path[ci];
      t = cmd[0];
      if (t === 'M') sub++;
      if (t === 'Z' || t === 'z') { prevType = t; continue; }
      nodes.push({ cmd: ci, ptIdx: _anchorPtIdx(cmd), kind: 'anchor', sub: sub });
      if (t === 'C') {
        nodes.push({ cmd: ci, ptIdx: 1, kind: 'ctrl', sub: sub, connCmd: ci - 1, connPt: (prevType === 'C' ? 5 : (prevType === 'Q' ? 3 : 1)) });
        nodes.push({ cmd: ci, ptIdx: 3, kind: 'ctrl', sub: sub, connCmd: ci, connPt: 5 });
      } else if (t === 'Q') {
        nodes.push({ cmd: ci, ptIdx: 1, kind: 'ctrl', sub: sub, connCmd: ci, connPt: 3 });
      }
      prevType = t;
    }
    return nodes;
  }
  function _subCount(o) {
    var n = 0, i;
    if (!o.path) return 0;
    for (i = 0; i < o.path.length; i++) if (o.path[i][0] === 'M') n++;
    return n;
  }

  function _nodeXY(o, node) {
    return { x: o.path[node.cmd][node.ptIdx], y: o.path[node.cmd][node.ptIdx + 1] };
  }
  function _nodeCanvas(o, node) {
    var p = _nodeXY(o, node);
    return _ptToCanvas(o, p.x, p.y);
  }
  function _setNode(o, node, cx, cy) {
    var pt = _canvasToPt(o, cx, cy);
    o.path[node.cmd][node.ptIdx] = pt.x;
    o.path[node.cmd][node.ptIdx + 1] = pt.y;
  }

  function _pathToStr(pathArr) { return pathArr.map(function (c) { return c.join(' '); }).join(' '); }

  /* ── Toolbar ── */
  function _buildBar() {
    if (_pe && _pe.bar) return;
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:10px 12px;border-radius:14px;background:#131316;border:1px solid #27272d;box-shadow:0 14px 40px rgba(0,0,0,.35);z-index:9999;';
    var sec = 'height:34px;padding:0 14px;border-radius:10px;border:1px solid #35353c;background:#1b1b1f;color:#ededf0;font:600 13px Inter,sans-serif;cursor:pointer;';
    var sep = '<span style="width:1px;height:22px;background:#2a2a30;margin:0 2px;"></span>';
    bar.innerHTML =
      '<button id="pe-apply-btn" style="height:34px;padding:0 14px;border-radius:10px;border:1px solid #f2ff58;background:#f2ff58;color:#0b0b0d;font:600 13px Inter,sans-serif;cursor:pointer;">Apply</button>' +
      '<button id="pe-cancel-btn" style="' + sec + '">Cancel</button>' +
      sep +
      '<button id="pe-smooth-btn" style="' + sec + '" title="Round the selected point (logo-friendly)">Smooth</button>' +
      '<button id="pe-corner-btn" style="' + sec + '" title="Make the selected point a corner">Corner</button>' +
      '<button id="pe-delete-btn" style="' + sec + '">Delete point</button>';
    document.body.appendChild(bar);
    document.getElementById('pe-apply-btn').onclick = function () { window.exitPolygonEdit(true); };
    document.getElementById('pe-cancel-btn').onclick = function () { window.exitPolygonEdit(false); };
    document.getElementById('pe-smooth-btn').onclick = function () { window._peSetAnchorType(true); };
    document.getElementById('pe-corner-btn').onclick = function () { window._peSetAnchorType(false); };
    document.getElementById('pe-delete-btn').onclick = function () { window._peDeleteVertex(); };
    _pe.bar = bar;
  }
  function _removeBar() {
    if (_pe && _pe.bar && _pe.bar.parentNode) _pe.bar.parentNode.removeChild(_pe.bar);
    if (_pe) _pe.bar = null;
  }

  /* ── Draw handles + bezier connector lines ── */
  function _clearHelpers() {
    var cvs = _getCvs();
    var i;
    if (!cvs || !_pe) return;
    if (_pe.outline && _pe.outline.canvas) cvs.remove(_pe.outline);
    _pe.outline = null;
    for (i = 0; i < _pe.connectors.length; i++) if (_pe.connectors[i].canvas) cvs.remove(_pe.connectors[i]);
    for (i = 0; i < _pe.ctrlHandles.length; i++) if (_pe.ctrlHandles[i].canvas) cvs.remove(_pe.ctrlHandles[i]);
    for (i = 0; i < _pe.handles.length; i++) if (_pe.handles[i].canvas) cvs.remove(_pe.handles[i]);
    _pe.connectors = [];
    _pe.ctrlHandles = [];
    _pe.handles = [];
    _pe.selAnchor = null;
  }

  function _drawHelpers() {
    var cvs = _getCvs();
    var o = _pe.frame, i, node, pos, handle;
    if (!cvs || !_pe) return;
    _clearHelpers();

    // dashed editing outline that mirrors the live path (shares the path array → live-updates on drag)
    var outline = new fabric.Path(_pathToStr(o.path), {
      fill: '', stroke: 'rgba(242,255,88,0.95)', strokeWidth: 1.4, strokeDashArray: [5, 4],
      selectable: false, evented: false, objectCaching: false, excludeFromExport: true, _isPeOutline: true
    });
    outline.pathOffset = new fabric.Point(o.pathOffset.x, o.pathOffset.y);
    outline.set({ width: o.width, height: o.height, left: o.left, top: o.top, originX: o.originX, originY: o.originY, angle: o.angle, scaleX: o.scaleX, scaleY: o.scaleY });
    outline.path = o.path; // share reference so drags reflect immediately
    outline.setCoords();
    _pe.outline = outline;
    cvs.add(outline);

    // Only ANCHOR handles are shown by default (Illustrator behaviour). A node's bezier control handles
    // appear on demand when that anchor is selected — otherwise dense/text paths become an unusable mess.
    // Multi-subpath frames (text = one subpath per letter/counter) additionally show anchors ONLY for the
    // ACTIVE subpath: click a letter to edit it, so a whole word never floods the screen with dots.
    for (i = 0; i < _pe.nodes.length; i++) {
      node = _pe.nodes[i];
      if (node.kind !== 'anchor') continue;
      if (_pe.multiSub && node.sub !== _pe.activeSub) continue;
      pos = _nodeCanvas(o, node);
      handle = new fabric.Circle({
        left: pos.x, top: pos.y, originX: 'center', originY: 'center', radius: 5.5,
        fill: '#f2ff58', stroke: 'rgba(255,255,255,0.7)', strokeWidth: 1,
        hasControls: false, hasBorders: false, selectable: true, evented: true,
        objectCaching: false, lockScalingX: true, lockScalingY: true, excludeFromExport: true,
        _isPeHandle: true, _peNode: i
      });
      _pe.handles.push(handle);
      cvs.add(handle);
    }

    if (o && o.canvas) cvs.sendToBack(o);
    if (_pe.outline) cvs.bringToFront(_pe.outline);
    for (i = 0; i < _pe.handles.length; i++) cvs.bringToFront(_pe.handles[i]);
    cvs.renderAll();
  }

  /* ── Bezier control handles for the SELECTED anchor only (shown on select, hidden otherwise) ── */
  function _hideAnchorCtrls() {
    var cvs = _getCvs(), i;
    if (!cvs || !_pe) return;
    for (i = 0; i < _pe.ctrlHandles.length; i++) if (_pe.ctrlHandles[i].canvas) cvs.remove(_pe.ctrlHandles[i]);
    for (i = 0; i < _pe.connectors.length; i++) if (_pe.connectors[i].canvas) cvs.remove(_pe.connectors[i]);
    _pe.ctrlHandles = [];
    _pe.connectors = [];
  }
  function _showAnchorCtrls(anchorNodeIdx) {
    var cvs = _getCvs(), o = _pe.frame, an = _pe.nodes[anchorNodeIdx], i, node, cp, ap;
    _hideAnchorCtrls();
    if (!an || an.kind !== 'anchor') return;
    for (i = 0; i < _pe.nodes.length; i++) {
      node = _pe.nodes[i];
      if (node.kind !== 'ctrl' || node.connCmd !== an.cmd || node.connPt !== an.ptIdx) continue;
      cp = _nodeCanvas(o, node);
      ap = _ptToCanvas(o, o.path[node.connCmd][node.connPt], o.path[node.connCmd][node.connPt + 1]);
      var line = new fabric.Line([cp.x, cp.y, ap.x, ap.y], {
        stroke: 'rgba(242,255,88,0.75)', strokeWidth: 1, strokeDashArray: [3, 3],
        selectable: false, evented: false, objectCaching: false, excludeFromExport: true, _isPeOutline: true, _peNode: i
      });
      _pe.connectors.push(line); cvs.add(line);
      var h = new fabric.Circle({
        left: cp.x, top: cp.y, originX: 'center', originY: 'center', radius: 4.5,
        fill: '#131316', stroke: '#f2ff58', strokeWidth: 1.5,
        hasControls: false, hasBorders: false, selectable: true, evented: true,
        objectCaching: false, lockScalingX: true, lockScalingY: true, excludeFromExport: true,
        _isPeHandle: true, _isPeCtrl: true, _peNode: i
      });
      _pe.ctrlHandles.push(h); cvs.add(h);
    }
    cvs.renderAll();
  }
  function _repositionCtrls() {
    var o = _pe.frame, i, node, line, cp, ap, h;
    for (i = 0; i < _pe.connectors.length; i++) {
      line = _pe.connectors[i]; node = _pe.nodes[line._peNode]; if (!node) continue;
      cp = _nodeCanvas(o, node); ap = _ptToCanvas(o, o.path[node.connCmd][node.connPt], o.path[node.connCmd][node.connPt + 1]);
      line.set({ x1: cp.x, y1: cp.y, x2: ap.x, y2: ap.y }); line.setCoords();
    }
    for (i = 0; i < _pe.ctrlHandles.length; i++) {
      h = _pe.ctrlHandles[i]; node = _pe.nodes[h._peNode]; if (!node) continue;
      cp = _nodeCanvas(o, node); h.set({ left: cp.x, top: cp.y }); h.setCoords();
    }
  }

  function _lockOthers(frameObj) {
    var cvs = _getCvs();
    var objs = cvs.getObjects();
    var i, obj;
    _pe.locked = [];
    for (i = 0; i < objs.length; i++) {
      obj = objs[i];
      if (obj === frameObj || obj._isPeHandle || obj._isPeOutline) continue;
      _pe.locked.push({ obj: obj, selectable: obj.selectable, evented: obj.evented });
      obj.set({ selectable: false, evented: false });
    }
    _pe.frameSelectable = frameObj.selectable;
    _pe.frameEvented = frameObj.evented;
    _pe.frameCaching = frameObj.objectCaching;
    frameObj.set({ selectable: false, evented: false, objectCaching: false }); // live path edits must repaint
    cvs.discardActiveObject();
  }
  function _unlockOthers() {
    var i, entry;
    if (!_pe) return;
    for (i = 0; i < _pe.locked.length; i++) {
      entry = _pe.locked[i];
      if (entry.obj && entry.obj.canvas) entry.obj.set({ selectable: entry.selectable, evented: entry.evented });
    }
    _pe.locked = [];
    if (_pe.frame && _pe.frame.canvas) _pe.frame.set({ selectable: _pe.frameSelectable, evented: _pe.frameEvented, objectCaching: _pe.frameCaching });
  }

  /* ── Drag: write the handle straight into the path, repaint live ── */
  function _onObjectMoving(opt) {
    var target = opt && opt.target;
    var node, o = _pe && _pe.frame, i, cn;
    if (!_pe || !target || !target._isPeHandle) return;
    node = _pe.nodes[target._peNode];
    if (!node) return;
    if (node.kind === 'anchor') {
      // Move the anchor AND its two bezier control handles by the same delta, so a smooth curve stays
      // smooth (no sharp kink). This is Illustrator's "drag anchor" behaviour — key for logo work.
      var oldX = o.path[node.cmd][node.ptIdx], oldY = o.path[node.cmd][node.ptIdx + 1];
      var np = _canvasToPt(o, target.left, target.top);
      var dx = np.x - oldX, dy = np.y - oldY;
      o.path[node.cmd][node.ptIdx] = np.x; o.path[node.cmd][node.ptIdx + 1] = np.y;
      for (i = 0; i < _pe.nodes.length; i++) {
        cn = _pe.nodes[i];
        if (cn.kind === 'ctrl' && cn.connCmd === node.cmd && cn.connPt === node.ptIdx) {
          o.path[cn.cmd][cn.ptIdx] += dx; o.path[cn.cmd][cn.ptIdx + 1] += dy;
        }
      }
    } else {
      _setNode(o, node, target.left, target.top);
    }
    o.dirty = true;
    if (_pe.outline) _pe.outline.dirty = true;
    _pe.geometryChanged = true;
    _repositionCtrls();
    _pe.selected = target._peNode; // keep selection through the drag (no rebuild mid-drag)
  }

  // Select a handle. Anchors reveal their own bezier control handles; control handles keep the current
  // anchor's set shown; clicking empty space hides all control handles (Illustrator behaviour).
  function _selectHandle(target) {
    var i, cvs = _getCvs();
    if (!_pe) return;
    _pe.selected = null;
    for (i = 0; i < _pe.handles.length; i++) _pe.handles[i].set({ radius: 5.5 });
    for (i = 0; i < _pe.ctrlHandles.length; i++) _pe.ctrlHandles[i].set({ radius: 4.5 });
    if (!target || !target._isPeHandle) {
      if (_pe.selAnchor != null) { _pe.selAnchor = null; _hideAnchorCtrls(); if (cvs) cvs.requestRenderAll(); }
      return;
    }
    _pe.selected = target._peNode;
    if (target._isPeCtrl) { target.set({ radius: 5.5 }); return; }
    target.set({ radius: 6.5 });
    if (_pe.selAnchor !== target._peNode) { _pe.selAnchor = target._peNode; _showAnchorCtrls(target._peNode); }
  }

  function _onMouseDown(opt) {
    var target = opt && opt.target;
    if (!_pe) return;
    if (target && target._isPeHandle) { _selectHandle(target); return; }
    _selectHandle(null);
    var cvs = _getCvs();
    var p = cvs.getPointer(opt.e);
    // Multi-subpath: clicking near a letter switches the shown anchors to THAT letter's subpath.
    if (_pe.multiSub) {
      var best = null, i, node, np, dd;
      for (i = 0; i < _pe.nodes.length; i++) {
        node = _pe.nodes[i];
        if (node.kind !== 'anchor') continue;
        np = _nodeCanvas(_pe.frame, node);
        dd = (np.x - p.x) * (np.x - p.x) + (np.y - p.y) * (np.y - p.y);
        if (!best || dd < best.d) best = { d: dd, sub: node.sub };
      }
      if (best && best.d <= 40 * 40 && best.sub !== _pe.activeSub) {
        _pe.activeSub = best.sub;
        _drawHelpers();
        return;
      }
    }
    if (_insertAnchorAtCanvas(p.x, p.y)) { cvs.discardActiveObject(); cvs.renderAll(); }
  }
  function _onSelectionChange(opt) {
    var target = opt && opt.target;
    if (!_pe) return;
    _selectHandle(target && target._isPeHandle ? target : null);
  }

  function _onKeyDown(e) {
    if (!_pe) return;
    if (e.key === 'Escape') { e.preventDefault(); window.exitPolygonEdit(false); }
    else if (e.key === 'Enter') { e.preventDefault(); window.exitPolygonEdit(true); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !/input|textarea/i.test((document.activeElement && document.activeElement.tagName) || '')) {
      e.preventDefault(); window._peDeleteVertex();
    }
  }

  function _bindEvents() {
    var cvs = _getCvs();
    _pe.handlers = { moving: _onObjectMoving, mouseDown: _onMouseDown, selCreate: _onSelectionChange, selUpdate: _onSelectionChange, keydown: _onKeyDown };
    cvs.on('object:moving', _pe.handlers.moving);
    cvs.on('mouse:down', _pe.handlers.mouseDown);
    cvs.on('selection:created', _pe.handlers.selCreate);
    cvs.on('selection:updated', _pe.handlers.selUpdate);
    document.addEventListener('keydown', _pe.handlers.keydown, true);
  }
  function _unbindEvents() {
    var cvs = _getCvs();
    if (!_pe || !_pe.handlers) return;
    cvs.off('object:moving', _pe.handlers.moving);
    cvs.off('mouse:down', _pe.handlers.mouseDown);
    cvs.off('selection:created', _pe.handlers.selCreate);
    cvs.off('selection:updated', _pe.handlers.selUpdate);
    document.removeEventListener('keydown', _pe.handlers.keydown, true);
  }

  /* ── Regenerate the frame's _frameContours metadata (world-coord loops) from the edited path so any
     re-trace / re-edit later starts from the current shape. Matches the old world-coord format. ── */
  function _cubic(p0, p1, p2, p3, t) { var m = 1 - t; return { x: m*m*m*p0.x + 3*m*m*t*p1.x + 3*m*t*t*p2.x + t*t*t*p3.x, y: m*m*m*p0.y + 3*m*m*t*p1.y + 3*m*t*t*p2.y + t*t*t*p3.y }; }
  function _quad(p0, p1, p2, t) { var m = 1 - t; return { x: m*m*p0.x + 2*m*t*p1.x + t*t*p2.x, y: m*m*p0.y + 2*m*t*p1.y + t*t*p2.y }; }
  function _signedArea(pts) { var a = 0, i, u, v; for (i = 0; i < pts.length; i++) { u = pts[i]; v = pts[(i + 1) % pts.length]; a += u.x * v.y - v.x * u.y; } return a / 2; }

  function _rebuildFrameContours(o) {
    var loops = [], cur = [], sx = 0, sy = 0, cx = 0, cy = 0;
    var po = o.pathOffset || { x: 0, y: 0 }, m = o.calcTransformMatrix();
    function W(x, y) { return fabric.util.transformPoint(new fabric.Point(x - po.x, y - po.y), m); }
    function flush() { if (cur.length >= 3) loops.push({ points: cur.slice(), isHole: _signedArea(cur) < 0, sourceType: o._frameSourceType || 'shape-vector' }); cur = []; }
    var i, c, t, q, b;
    for (i = 0; i < o.path.length; i++) {
      c = o.path[i]; t = c[0];
      if (t === 'M') { if (cur.length) flush(); cx = c[1]; cy = c[2]; sx = cx; sy = cy; cur.push(W(cx, cy)); }
      else if (t === 'L') { cx = c[1]; cy = c[2]; cur.push(W(cx, cy)); }
      else if (t === 'H') { cx = c[1]; cur.push(W(cx, cy)); }
      else if (t === 'V') { cy = c[1]; cur.push(W(cx, cy)); }
      else if (t === 'C') { for (q = 1; q <= 16; q++) { b = _cubic({ x: cx, y: cy }, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }, q / 16); cur.push(W(b.x, b.y)); } cx = c[5]; cy = c[6]; }
      else if (t === 'Q') { for (q = 1; q <= 12; q++) { b = _quad({ x: cx, y: cy }, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, q / 12); cur.push(W(b.x, b.y)); } cx = c[3]; cy = c[4]; }
      else if (t === 'Z' || t === 'z') { cx = sx; cy = sy; flush(); }
    }
    if (cur.length) flush();
    if (loops.length) o._frameContours = loops;
  }

  /* ── On ENTER only: fit a dense traced path (staircase L points) to a clean Illustrator-quality bezier
     path so editing shows a handful of anchors at corners/extrema (not one per pixel-step). Uses the shared
     Schneider fit from selection-tools/contour (VST._fitLoopToBezier). Frame CREATION is untouched by this
     — the fit lives here, so "Convert to Frame" never moves the letters. On Cancel the original path is
     restored; on Apply the clean path is kept + dimensions recomputed in place. ── */
  function _extractLoopsLocal(o) {
    var loops = [], cur = [], sx = 0, sy = 0, cx = 0, cy = 0, i, c, t, q, b;
    for (i = 0; i < o.path.length; i++) {
      c = o.path[i]; t = c[0];
      if (t === 'M') { if (cur.length >= 3) loops.push(cur); cur = []; cx = c[1]; cy = c[2]; sx = cx; sy = cy; cur.push({ x: cx, y: cy }); }
      else if (t === 'L') { cx = c[1]; cy = c[2]; cur.push({ x: cx, y: cy }); }
      else if (t === 'H') { cx = c[1]; cur.push({ x: cx, y: cy }); }
      else if (t === 'V') { cy = c[1]; cur.push({ x: cx, y: cy }); }
      else if (t === 'C') { for (q = 1; q <= 16; q++) { b = _cubic({ x: cx, y: cy }, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }, q / 16); cur.push({ x: b.x, y: b.y }); } cx = c[5]; cy = c[6]; }
      else if (t === 'Q') { for (q = 1; q <= 12; q++) { b = _quad({ x: cx, y: cy }, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, q / 12); cur.push({ x: b.x, y: b.y }); } cx = c[3]; cy = c[4]; }
      else if (t === 'Z' || t === 'z') { cx = sx; cy = sy; if (cur.length >= 3) loops.push(cur); cur = []; }
    }
    if (cur.length >= 3) loops.push(cur);
    return loops;
  }
  function _fitFramePath(o) {
    var VST = window.__ccSelectionTools;
    if (!VST || typeof VST._fitLoopToBezier !== 'function') return null;
    var loops = _extractLoopsLocal(o);
    if (!loops.length) return null;
    var out = [], any = false, i, li, fit, cm, pts;
    for (li = 0; li < loops.length; li++) {
      fit = VST._fitLoopToBezier(loops[li]);
      if (fit && fit.length >= 2) {
        any = true;
        for (i = 0; i < fit.length; i++) {
          cm = fit[i];
          if (cm.k === 'M') out.push(['M', cm.x, cm.y]);
          else if (cm.k === 'L') out.push(['L', cm.x, cm.y]);
          else out.push(['C', cm.c1x, cm.c1y, cm.c2x, cm.c2y, cm.x, cm.y]);
        }
        out.push(['Z']);
      } else {
        pts = loops[li];
        out.push(['M', pts[0].x, pts[0].y]);
        for (i = 1; i < pts.length; i++) out.push(['L', pts[i].x, pts[i].y]);
        out.push(['Z']);
      }
    }
    return any ? out : null;
  }

  /* ── Apply: recompute the path's dimensions/pathOffset and keep it visually in place
     (newCenter = oldCenter + L·(newPO − oldPO); math verified 1:1 in a browser test). ── */
  function _recomputePathDimensions(o) {
    var oldPO = new fabric.Point(o.pathOffset.x, o.pathOffset.y);
    var oldCenter = o.getCenterPoint();
    var m = _mat(o);
    var lin = [m[0], m[1], m[2], m[3], 0, 0];
    if (typeof o._setPath === 'function') { o._setPath(o.path, false); }
    else if (typeof o._parseDimensions === 'function') {
      var d = o._parseDimensions();
      o.set({ width: d.width, height: d.height, pathOffset: new fabric.Point(d.left + d.width / 2, d.top + d.height / 2) });
    }
    var newPO = new fabric.Point(o.pathOffset.x, o.pathOffset.y);
    var shift = fabric.util.transformPoint(new fabric.Point(newPO.x - oldPO.x, newPO.y - oldPO.y), lin);
    o.setPositionByOrigin(new fabric.Point(oldCenter.x + shift.x, oldCenter.y + shift.y), 'center', 'center');
    o.setCoords();
  }

  /* ── Insert an anchor where the path is clicked (splits the L/C/Q command at that point) ── */
  function _lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
  function _insertAnchorAtCanvas(cx, cy) {
    var o = _pe.frame, click = _canvasToPt(o, cx, cy);
    var best = null, i, cmd, type, A, B, cp1, cp2, s, tt, pt, dd, X = 0, Y = 0, sX = 0, sY = 0, sub = -1;
    for (i = 0; i < o.path.length; i++) {
      cmd = o.path[i]; type = cmd[0];
      if (type === 'M') { sub++; X = cmd[1]; Y = cmd[2]; sX = X; sY = Y; continue; }
      if (_pe.multiSub && sub !== _pe.activeSub) { // only the active letter takes new anchors
        if (type === 'L' || type === 'H' || type === 'V') { X = (type === 'V' ? X : cmd[1]); Y = (type === 'H' ? Y : (type === 'V' ? cmd[1] : cmd[2])); }
        else if (type === 'C') { X = cmd[5]; Y = cmd[6]; }
        else if (type === 'Q') { X = cmd[3]; Y = cmd[4]; }
        else if (type === 'Z' || type === 'z') { X = sX; Y = sY; }
        continue;
      }
      A = { x: X, y: Y };
      if (type === 'L' || type === 'H' || type === 'V') {
        B = { x: (type === 'V' ? X : cmd[1]), y: (type === 'H' ? Y : (type === 'V' ? cmd[1] : cmd[2])) };
        for (s = 1; s < 16; s++) { tt = s / 16; pt = _lerp(A, B, tt); dd = (click.x - pt.x) * (click.x - pt.x) + (click.y - pt.y) * (click.y - pt.y); if (!best || dd < best.d) best = { i: i, type: 'L', t: tt, A: A, B: B, d: dd }; }
        X = B.x; Y = B.y;
      } else if (type === 'C') {
        cp1 = { x: cmd[1], y: cmd[2] }; cp2 = { x: cmd[3], y: cmd[4] }; B = { x: cmd[5], y: cmd[6] };
        for (s = 1; s < 16; s++) { tt = s / 16; pt = _cubic(A, cp1, cp2, B, tt); dd = (click.x - pt.x) * (click.x - pt.x) + (click.y - pt.y) * (click.y - pt.y); if (!best || dd < best.d) best = { i: i, type: 'C', t: tt, A: A, cp1: cp1, cp2: cp2, B: B, d: dd }; }
        X = B.x; Y = B.y;
      } else if (type === 'Q') {
        cp1 = { x: cmd[1], y: cmd[2] }; B = { x: cmd[3], y: cmd[4] };
        for (s = 1; s < 16; s++) { tt = s / 16; pt = _quad(A, cp1, B, tt); dd = (click.x - pt.x) * (click.x - pt.x) + (click.y - pt.y) * (click.y - pt.y); if (!best || dd < best.d) best = { i: i, type: 'Q', t: tt, A: A, cp1: cp1, B: B, d: dd }; }
        X = B.x; Y = B.y;
      } else if (type === 'Z' || type === 'z') { X = sX; Y = sY; }
    }
    if (!best) return false;
    var avg = (Math.abs(o.scaleX || 1) + Math.abs(o.scaleY || 1)) / 2 || 1;
    if (Math.sqrt(best.d) > 14 / avg) return false; // click must be near the path (~14 canvas px)
    var t = best.t, A2 = best.A, B2 = best.B;
    if (best.type === 'C') {
      var p01 = _lerp(A2, best.cp1, t), p12 = _lerp(best.cp1, best.cp2, t), p23 = _lerp(best.cp2, B2, t);
      var p012 = _lerp(p01, p12, t), p123 = _lerp(p12, p23, t), mid = _lerp(p012, p123, t);
      o.path.splice(best.i, 1, ['C', p01.x, p01.y, p012.x, p012.y, mid.x, mid.y], ['C', p123.x, p123.y, p23.x, p23.y, B2.x, B2.y]);
    } else if (best.type === 'Q') {
      var q01 = _lerp(A2, best.cp1, t), q12 = _lerp(best.cp1, B2, t), qm = _lerp(q01, q12, t);
      o.path.splice(best.i, 1, ['Q', q01.x, q01.y, qm.x, qm.y], ['Q', q12.x, q12.y, B2.x, B2.y]);
    } else {
      var lm = _lerp(A2, B2, t);
      o.path.splice(best.i, 1, ['L', lm.x, lm.y], ['L', B2.x, B2.y]);
    }
    _pe.nodes = _buildNodes(o);
    _pe.geometryChanged = true;
    o.dirty = true;
    if (_pe.outline) _pe.outline.dirty = true;
    _drawHelpers();
    return true;
  }

  /* ── Public API (unchanged signatures) ── */
  window.isPolygonEditActive = function () { return !!_pe; };

  window.enterPolygonEdit = function (frameObj) {
    var cvs = _getCvs();
    var frame = frameObj || (cvs && cvs.getActiveObject ? cvs.getActiveObject() : null);
    if (_pe) window.exitPolygonEdit(false);
    if (!cvs || !frame || !frame._isFrame || frame._isClippedImage) return false;
    if (!frame.path || !frame.path.length) return false; // only path-based frames

    // Snapshot for Cancel. A dense traced path (staircase L points) is fitted to a clean Illustrator-quality
    // bezier outline HERE (on enter only) so editing shows a handful of anchors, not one per pixel-step.
    // Frame creation is untouched, so "Convert to Frame" never moves the letters. Cancel restores this snapshot.
    var orig = { path: JSON.parse(JSON.stringify(frame.path)), left: frame.left, top: frame.top, width: frame.width, height: frame.height, pathOffset: { x: frame.pathOffset.x, y: frame.pathOffset.y } };
    var didFit = false;
    // _frameVector = real glyph/vector outline (opentype) — already clean, NEVER re-fit it.
    if (!frame._frameVector && frame.path.length > 16) {
      var fitted = _fitFramePath(frame);
      if (fitted && fitted.length >= 2) {
        frame.path = fitted;
        try { _recomputePathDimensions(frame); } catch (e) {}
        frame.dirty = true;
        didFit = true;
      }
    }

    var subCount = _subCount(frame);
    _pe = {
      frame: frame,
      orig: orig,
      nodes: _buildNodes(frame),
      handles: [],
      ctrlHandles: [],
      connectors: [],
      locked: [],
      selected: null,
      selAnchor: null,
      multiSub: subCount > 1, // text/multi-part frames: show one letter's anchors at a time
      activeSub: subCount > 1 ? 0 : 0,
      bar: null,
      geometryChanged: didFit, // keep the fitted path on Apply even without a manual drag
      handlers: null
    };
    if (!_pe.nodes.length) { frame.path = orig.path; _pe = null; return false; }

    _lockOthers(frame);
    _buildBar();
    _bindEvents();
    _drawHelpers();
    cvs.renderAll();
    if (typeof showToast === 'function') showToast(_pe.multiSub ? 'Node editing active — click a segment to show its points' : 'Node editing active');
    return true;
  };

  window._peDeleteVertex = function () {
    var o, node, cmd, t, anchorNodes, i;
    if (!_pe || _pe.selected == null) return;
    o = _pe.frame;
    node = _pe.nodes[_pe.selected];
    if (!node || node.kind !== 'anchor') return; // only anchors delete (not bezier handles)
    cmd = o.path[node.cmd];
    t = cmd[0];
    if (t === 'M') return; // don't remove a subpath start
    // keep at least a triangle's worth of anchors
    anchorNodes = 0;
    for (i = 0; i < _pe.nodes.length; i++) if (_pe.nodes[i].kind === 'anchor') anchorNodes++;
    if (anchorNodes <= 3) return;
    o.path.splice(node.cmd, 1);
    _pe.nodes = _buildNodes(o);
    _pe.selected = null;
    _pe.geometryChanged = true;
    o.dirty = true;
    _drawHelpers();
  };

  /* ── Smooth / Corner the selected anchor (logo-friendly rounding control) ──
     Smooth: give the anchor tangent bezier handles from its subpath neighbours so the curve rounds
     through it (converts an adjacent straight L into a curve if needed). Corner: retract the handles
     onto the anchor so it becomes a sharp point. Works per subpath (letters/holes are separate loops). */
  function _subpathAnchors(an) {
    var path = _pe.frame.path, start = an.cmd, i, t, anchors = [];
    while (start > 0 && path[start][0] !== 'M') start--;
    for (i = start; i < path.length; i++) {
      t = path[i][0];
      if (t === 'Z' || t === 'z') break;
      if (i > start && t === 'M') break;
      anchors.push({ cmd: i, ptIdx: path[i].length - 2 });
    }
    var ci = -1, m = anchors.length;
    for (i = 0; i < m; i++) if (anchors[i].cmd === an.cmd) { ci = i; break; }
    if (ci < 0 || m < 3) return null;
    return { prev: anchors[(ci - 1 + m) % m], next: anchors[(ci + 1) % m] };
  }

  window._peSetAnchorType = function (smooth) {
    var o, an, path, sp, A, P, N, inCmd, outCmd, tx, ty, tl, inLen, outLen;
    if (!_pe || _pe.selAnchor == null) { if (typeof showToast === 'function') showToast('Select a point first'); return; }
    an = _pe.nodes[_pe.selAnchor];
    if (!an || an.kind !== 'anchor') return;
    o = _pe.frame; path = o.path;
    sp = _subpathAnchors(an); if (!sp) return;
    A = { x: path[an.cmd][an.ptIdx], y: path[an.cmd][an.ptIdx + 1] };
    P = { x: path[sp.prev.cmd][sp.prev.ptIdx], y: path[sp.prev.cmd][sp.prev.ptIdx + 1] };
    N = { x: path[sp.next.cmd][sp.next.ptIdx], y: path[sp.next.cmd][sp.next.ptIdx + 1] };
    inCmd = path[an.cmd];        // segment ending AT A → its handle near A is cp2
    outCmd = path[sp.next.cmd];  // segment starting FROM A → its handle near A is cp1

    if (smooth) {
      tx = N.x - P.x; ty = N.y - P.y; tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
      inLen = Math.sqrt((A.x - P.x) * (A.x - P.x) + (A.y - P.y) * (A.y - P.y)) * 0.34;
      outLen = Math.sqrt((N.x - A.x) * (N.x - A.x) + (N.y - A.y) * (N.y - A.y)) * 0.34;
      if (inCmd[0] === 'C') { inCmd[3] = A.x - tx * inLen; inCmd[4] = A.y - ty * inLen; }
      else if (inCmd[0] === 'L') { path[an.cmd] = ['C', P.x + (A.x - P.x) * 0.34, P.y + (A.y - P.y) * 0.34, A.x - tx * inLen, A.y - ty * inLen, A.x, A.y]; }
      if (outCmd[0] === 'C') { outCmd[1] = A.x + tx * outLen; outCmd[2] = A.y + ty * outLen; }
      else if (outCmd[0] === 'L') { path[sp.next.cmd] = ['C', A.x + tx * outLen, A.y + ty * outLen, N.x + (A.x - N.x) * 0.34, N.y + (A.y - N.y) * 0.34, N.x, N.y]; }
    } else {
      if (inCmd[0] === 'C') { inCmd[3] = A.x; inCmd[4] = A.y; }
      if (outCmd[0] === 'C') { outCmd[1] = A.x; outCmd[2] = A.y; }
    }
    o.dirty = true;
    _pe.geometryChanged = true;
    _pe.nodes = _buildNodes(o);
    _pe.selected = null; _pe.selAnchor = null;
    _drawHelpers();
    if (typeof showToast === 'function') showToast(smooth ? 'Point smoothed' : 'Point made a corner');
  };

  window.exitPolygonEdit = function (apply) {
    var cvs = _getCvs();
    var frame;
    if (!_pe || !cvs) return;
    frame = _pe.frame;
    _unbindEvents();
    _clearHelpers();
    _removeBar();
    _unlockOthers();

    if (!apply && _pe.orig) {
      // Cancel: restore the original (dense) path + its box exactly.
      frame.path = _pe.orig.path;
      frame.set({ left: _pe.orig.left, top: _pe.orig.top, width: _pe.orig.width, height: _pe.orig.height, pathOffset: new fabric.Point(_pe.orig.pathOffset.x, _pe.orig.pathOffset.y) });
      frame.dirty = true; frame.setCoords();
    } else if (apply && _pe.geometryChanged) {
      try { _recomputePathDimensions(frame); } catch (e) {}
      try { _rebuildFrameContours(frame); } catch (e) {} // keep contour metadata in sync with the edit
      frame.dirty = true;
      if (typeof snap === 'function') snap();
    }

    if (frame && frame.canvas) {
      frame.set({ selectable: true, evented: true });
      cvs.setActiveObject(frame);
    }
    cvs.renderAll();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
    if (typeof syncRightPanel === 'function') syncRightPanel();
    if (apply && _pe && _pe.geometryChanged && typeof showToast === 'function') showToast('Shape updated');
    _pe = null;
  };
})();

// Modular skeleton hook (Faz 8) — polygon-edit is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'polygon-edit', parent: 'canvas.tools', title: 'Polygon editor', mount: function () {}, unmount: function () {} });
