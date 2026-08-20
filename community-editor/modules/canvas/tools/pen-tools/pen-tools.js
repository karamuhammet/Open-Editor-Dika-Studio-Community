/* ═══════════════════════════════════════════════════════════════
   PEN TOOLS — Photoshop-inspired vector path tools
   Pen · Freeform Pen · Curvature/Spline · Add Anchor ·
   Delete Anchor · Convert Point · Line
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── helpers ── */
  function _getCvs() { return typeof getActiveCanvas === 'function' ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null); }
  function _snap() { if (typeof snap === 'function') snap(); }

  /* ── state ── */
  var _activeTool = null;        // 'pen' | 'freeform' | 'curvature' | 'addAnchor' | 'deleteAnchor' | 'convertPoint' | 'line'
  var _lockedObjs = [];
  var _floatBar = null;
  var _singlePathMode = true;    // Default ON: deactivate after creating one path

  /* ── pen state ── */
  var _anchors = [];             // [{ x, y, cp1x, cp1y, cp2x, cp2y, type:'corner'|'smooth' }]
  var _dragging = false;
  var _dragAnchor = null;
  var _previewLine = null;       // temp canvas line for next segment preview
  var _pathClosed = false;
  var _tempPath = null;          // live preview path on canvas

  /* ── freeform state ── */
  var _freePoints = [];
  var _freeDrawing = false;

  /* ── curvature state ── */
  var _curvPts = [];

  /* ── line state ── */
  var _lineStart = null;
  var _linePreview = null;

  /* ── overlay draw data (native 2D, no Fabric objects) ── */
  var _previewDrawData = null;

  /* ── anchor handles (edit overlays) ── */
  var _handleOverlays = [];
  var _editingPath = null;
  var _editingAnchorIdx = -1;
  var _dragType = null;          // 'anchor' | 'cp1' | 'cp2'
  var _isDragHandle = false;

  /* ── config ── */
  var _cfg = {
    strokeColor: '#f2ff58',
    strokeWidth: 2,
    fillEnabled: false,
    fillColor: 'rgba(242, 255, 88,0.15)',
    smooth: 50     // Freeform simplification (1-100)
  };

  /* ═══════════════════════════════════════════════════════
     NATIVE 2D OVERLAY — draws pen previews without Fabric objects
     Eliminates GC pressure, keeps dots out of structure panel
     ═══════════════════════════════════════════════════════ */
  function _afterRenderHandler() {
    if (!_previewDrawData) return;
    var cvs = _getCvs();
    if (!cvs) return;
    var ctx = cvs.contextContainer;
    var vpt = cvs.viewportTransform;
    ctx.save();
    ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

    var data = _previewDrawData;

    /* Dashed path preview */
    if (data.pathD) {
      try {
        var p2d = new Path2D(data.pathD);
        ctx.strokeStyle = _cfg.strokeColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(data.dashArray || [5, 3]);
        ctx.stroke(p2d);
        ctx.setLineDash([]);
      } catch (e) { /* Path2D parse error */ }
    }

    /* Dashed line preview */
    if (data.linePreview) {
      var lp = data.linePreview;
      ctx.beginPath();
      ctx.moveTo(lp.x1, lp.y1);
      ctx.lineTo(lp.x2, lp.y2);
      ctx.strokeStyle = lp.stroke || _cfg.strokeColor;
      ctx.lineWidth = lp.strokeWidth || 1;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* Handle lines (smooth point tangent lines) */
    if (data.handleLines) {
      ctx.strokeStyle = 'rgba(242, 255, 88,0.5)';
      ctx.lineWidth = 1;
      data.handleLines.forEach(function (hl) {
        ctx.beginPath();
        ctx.moveTo(hl.x1, hl.y1);
        ctx.lineTo(hl.x2, hl.y2);
        ctx.stroke();
      });
    }

    /* Handle dots (small control point indicators) */
    if (data.handleDots) {
      data.handleDots.forEach(function (hd) {
        ctx.beginPath();
        ctx.arc(hd.x, hd.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = hd.fill || _cfg.strokeColor;
        ctx.fill();
        if (hd.stroke) {
          ctx.strokeStyle = hd.stroke;
          ctx.lineWidth = hd.strokeWidth || 0.5;
          ctx.stroke();
        }
      });
    }

    /* Anchor dots */
    if (data.anchorDots) {
      data.anchorDots.forEach(function (ad) {
        ctx.beginPath();
        ctx.arc(ad.x, ad.y, ad.radius || 4, 0, Math.PI * 2);
        ctx.fillStyle = ad.fill;
        ctx.fill();
        ctx.strokeStyle = ad.stroke;
        ctx.lineWidth = ad.strokeWidth || 1.5;
        ctx.stroke();
      });
    }

    ctx.restore();
  }

  /* ═══════════════════ TOOL IDS MAP ═══════════════════ */
  var TOOL_BTN_MAP = {
    pen:           'tool-pen',
    freeform:      'tool-freeform-pen',
    curvature:     'tool-curvature-pen',
    addAnchor:     'tool-add-anchor',
    deleteAnchor:  'tool-delete-anchor',
    convertPoint:  'tool-convert-point',
    line:          'tool-line'
  };

  /* ═══════════════════════════════════════════════════════
     ACTIVATE / DEACTIVATE
     ═══════════════════════════════════════════════════════ */
  window.activatePenTool = function (mode) {
    if (!mode) mode = 'pen';
    var cvs = _getCvs();
    if (!cvs) return;

    /* Toggle off if same tool */
    if (_activeTool === mode) { deactivatePenTool(); return; }

    /* Deactivate other tools first */
    if (typeof deactivateFillBucketTool === 'function' && typeof window._fillBucketToolActive === 'function' && window._fillBucketToolActive()) deactivateFillBucketTool();
    if (typeof deactivateSelectionTool === 'function') deactivateSelectionTool();
    if (typeof deactivateBrushTool === 'function') deactivateBrushTool();
    if (typeof exitCropMode === 'function') exitCropMode(false);
    if (typeof exitPerspectiveMode === 'function') exitPerspectiveMode(false);
    if (typeof exitPolygonEdit === 'function') exitPolygonEdit(false);

    _activeTool = mode;
    _resetState();

    /* Lock canvas objects */
    _lockedObjs = [];
    cvs.discardActiveObject();
    cvs.getObjects().forEach(function (o) {
      if (o._isPenPreview || o._isPenHandle) return;
      _lockedObjs.push({ obj: o, sel: o.selectable, ev: o.evented });
      o.set({ selectable: false, evented: false });
    });

    cvs.defaultCursor = 'crosshair';
    cvs.hoverCursor = 'crosshair';
    cvs.selection = false;
    cvs.renderAll();

    /* Highlight active button */
    document.querySelectorAll('.tools-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.getElementById(TOOL_BTN_MAP[mode]);
    if (btn) btn.classList.add('active');

    /* Hide float-tb */
    var floatTB = document.getElementById('float-tb');
    if (floatTB) floatTB.classList.remove('show');

    /* Bind events (remove first to prevent duplicates on mode switch) */
    cvs.off('mouse:down', _onDown);
    cvs.off('mouse:move', _onMove);
    cvs.off('mouse:up', _onUp);
    cvs.off('mouse:dblclick', _onDblClick);
    cvs.off('after:render', _afterRenderHandler);
    cvs.on('mouse:down', _onDown);
    cvs.on('mouse:move', _onMove);
    cvs.on('mouse:up', _onUp);
    cvs.on('mouse:dblclick', _onDblClick);
    cvs.on('after:render', _afterRenderHandler);

    _showFloatBar();
    _updateFloatBarActive();

    var msgs = {
      pen: 'Pen Tool: Click to add points, drag for curves, click first point to close',
      freeform: 'Freeform Pen: Click & drag to draw freely',
      curvature: 'Curvature Pen: Click to place smooth points, double-click to finish',
      addAnchor: 'Add Anchor: Click on a path segment to add a point',
      deleteAnchor: 'Delete Anchor: Click on an anchor point to remove it',
      convertPoint: 'Convert Point: Click anchor to toggle corner/smooth',
      line: 'Line Tool: Click & drag to draw a straight line'
    };
    if (typeof showToast === 'function') showToast(msgs[mode] || 'Pen tool active');
  };

  var deactivatePenTool = window.deactivatePenTool = function () {
    if (!_activeTool) return;
    var cvs = _getCvs();

    /* Finalize any open path */
    if (_activeTool === 'pen' && _anchors.length >= 2 && !_pathClosed) _finalizePath(false);
    if (_activeTool === 'curvature' && _curvPts.length >= 2) _finalizeCurvaturePath();
    if (_activeTool === 'freeform' && _freePoints.length >= 2) _finalizeFreeform();

    _activeTool = null;
    _previewDrawData = null;
    _cleanupPreviews(cvs);
    _clearHandleOverlays(cvs);
    _resetState();

    if (cvs) {
      cvs.off('mouse:down', _onDown);
      cvs.off('mouse:move', _onMove);
      cvs.off('mouse:up', _onUp);
      cvs.off('mouse:dblclick', _onDblClick);
      cvs.off('after:render', _afterRenderHandler);
    }

    /* Restore objects */
    _lockedObjs.forEach(function (e) {
      if (e.obj.canvas) e.obj.set({ selectable: e.sel, evented: e.ev });
    });
    _lockedObjs = [];

    document.querySelectorAll('.tools-btn').forEach(function (b) { b.classList.remove('active'); });

    if (cvs) {
      cvs.defaultCursor = 'default';
      cvs.hoverCursor = 'move';
      cvs.selection = true;
      cvs.renderAll();
    }

    _hideFloatBar();
  };

  window._penToolActive = function () { return !!_activeTool; };

  function _resetState() {
    _anchors = [];
    _dragging = false;
    _dragAnchor = null;
    _previewLine = null;
    _pathClosed = false;
    _tempPath = null;
    _previewDrawData = null;
    _freePoints = [];
    _freeDrawing = false;
    _curvPts = [];
    _lineStart = null;
    _linePreview = null;
    _editingPath = null;
    _editingAnchorIdx = -1;
    _dragType = null;
    _isDragHandle = false;
  }

  /* ═══════════════════════════════════════════════════════
     EVENT DISPATCH
     ═══════════════════════════════════════════════════════ */
  function _onDown(opt) {
    if (!_activeTool) return;
    var p = _getCanvasPoint(opt);
    switch (_activeTool) {
      case 'pen':         _penDown(p, opt); break;
      case 'freeform':    _freeformDown(p); break;
      case 'curvature':   _curvatureDown(p); break;
      case 'addAnchor':   _addAnchorDown(p, opt); break;
      case 'deleteAnchor':_deleteAnchorDown(p, opt); break;
      case 'convertPoint':_convertPointDown(p, opt); break;
      case 'line':        _lineDown(p); break;
    }
  }

  function _onMove(opt) {
    if (!_activeTool) return;
    var p = _getCanvasPoint(opt);
    switch (_activeTool) {
      case 'pen':         _penMove(p); break;
      case 'freeform':    _freeformMove(p); break;
      case 'curvature':   _curvatureMove(p); break;
      case 'line':        _lineMove(p); break;
    }
  }

  function _onUp(opt) {
    if (!_activeTool) return;
    var p = _getCanvasPoint(opt);
    switch (_activeTool) {
      case 'pen':         _penUp(p); break;
      case 'freeform':    _freeformUp(p); break;
      case 'line':        _lineUp(p); break;
    }
  }

  function _onDblClick(opt) {
    if (!_activeTool) return;
    var p = _getCanvasPoint(opt);
    if (_activeTool === 'pen') _penDblClick(p);
    if (_activeTool === 'curvature') _curvatureDblClick(p);
  }

  function _getCanvasPoint(opt) {
    var cvs = _getCvs();
    var ptr = cvs.getPointer(opt.e);
    return { x: ptr.x, y: ptr.y };
  }

  /* ═══════════════════════════════════════════════════════
     1. PEN TOOL — click for corners, drag for curves
     ═══════════════════════════════════════════════════════ */
  function _penDown(p, opt) {
    if (_pathClosed) return;
    var cvs = _getCvs();

    /* Close path: click near first anchor */
    if (_anchors.length >= 3) {
      var first = _anchors[0];
      if (_dist(p, first) < 10) {
        _pathClosed = true;
        _finalizePath(true);
        return;
      }
    }

    /* Start drag for handle creation */
    _dragging = true;
    _dragAnchor = {
      x: p.x, y: p.y,
      cp1x: p.x, cp1y: p.y,
      cp2x: p.x, cp2y: p.y,
      type: 'corner'
    };
  }

  function _penMove(p) {
    var cvs = _getCvs();
    if (_dragging && _dragAnchor) {
      /* Dragging = creating direction handles (smooth point) */
      var dx = p.x - _dragAnchor.x;
      var dy = p.y - _dragAnchor.y;
      _dragAnchor.cp2x = _dragAnchor.x + dx;
      _dragAnchor.cp2y = _dragAnchor.y + dy;
      _dragAnchor.cp1x = _dragAnchor.x - dx;
      _dragAnchor.cp1y = _dragAnchor.y - dy;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) _dragAnchor.type = 'smooth';
      _renderPreview(cvs, p);
    } else if (_anchors.length > 0) {
      _renderPreview(cvs, p);
    }
  }

  function _penUp(p) {
    if (!_dragging || !_dragAnchor) return;
    _dragging = false;
    _anchors.push(_dragAnchor);
    _dragAnchor = null;
    _renderPreview(_getCvs(), null);
  }

  function _penDblClick(p) {
    if (_anchors.length >= 2) {
      _finalizePath(false);
    }
  }

  /* ═══════════════════════════════════════════════════════
     2. FREEFORM PEN — drag to draw, auto-generate anchors
     ═══════════════════════════════════════════════════════ */
  function _freeformDown(p) {
    _freeDrawing = true;
    _freePoints = [p];
  }

  function _freeformMove(p) {
    if (!_freeDrawing) return;
    _freePoints.push(p);
    _renderFreeformPreview(_getCvs());
  }

  function _freeformUp(p) {
    if (!_freeDrawing) return;
    _freeDrawing = false;
    if (_freePoints.length < 3) { _freePoints = []; return; }
    _finalizeFreeform();
  }

  function _finalizeFreeform() {
    var cvs = _getCvs();
    _cleanupPreviews(cvs);
    /* Simplify points */
    var epsilon = Math.max(1, 10 - (_cfg.smooth / 10));
    var simplified = _douglasPeucker(_freePoints, epsilon);
    if (simplified.length < 2) { _freePoints = []; return; }

    /* Build SVG path with smooth curves */
    var d = 'M ' + simplified[0].x + ' ' + simplified[0].y;
    if (simplified.length === 2) {
      d += ' L ' + simplified[1].x + ' ' + simplified[1].y;
    } else {
      for (var i = 1; i < simplified.length; i++) {
        var prev = simplified[i - 1];
        var curr = simplified[i];
        var next = simplified[Math.min(i + 1, simplified.length - 1)];
        var cp1x = prev.x + (curr.x - (i > 1 ? simplified[i - 2].x : prev.x)) * 0.25;
        var cp1y = prev.y + (curr.y - (i > 1 ? simplified[i - 2].y : prev.y)) * 0.25;
        var cp2x = curr.x - (next.x - prev.x) * 0.25;
        var cp2y = curr.y - (next.y - prev.y) * 0.25;
        d += ' C ' + cp1x + ' ' + cp1y + ' ' + cp2x + ' ' + cp2y + ' ' + curr.x + ' ' + curr.y;
      }
    }

    var path = new fabric.Path(d, {
      fill: _cfg.fillEnabled ? _cfg.fillColor : 'transparent',
      stroke: _cfg.strokeColor,
      strokeWidth: _cfg.strokeWidth,
      strokeDashArray: [6, 4],
      selectable: true,
      evented: true,
      objectCaching: false,
      _isPenPath: true,
      _isFrame: true,
      _frameId: 'frame-pen-' + Date.now() + '-' + Math.floor(Math.random() * 9999)
    });
    cvs.add(path);
    cvs.setActiveObject(path);
    cvs.renderAll();
    _snap();
    _freePoints = [];
    if (typeof showToast === 'function') showToast('Freeform frame created');
    if (_singlePathMode) { setTimeout(deactivatePenTool, 0); }
  }

  function _renderFreeformPreview(cvs) {
    if (_freePoints.length < 2) { _previewDrawData = null; return; }
    var d = 'M ' + _freePoints[0].x + ' ' + _freePoints[0].y;
    for (var i = 1; i < _freePoints.length; i++) {
      d += ' L ' + _freePoints[i].x + ' ' + _freePoints[i].y;
    }
    _previewDrawData = { pathD: d, dashArray: [4, 3] };
    cvs.requestRenderAll();
  }

  /* ═══════════════════════════════════════════════════════
     3. CURVATURE PEN / SPLINE — auto smooth curves
     ═══════════════════════════════════════════════════════ */
  function _curvatureDown(p) {
    _curvPts.push(p);
    _renderCurvaturePreview(_getCvs(), null);
  }

  function _curvatureMove(p) {
    if (_curvPts.length > 0) {
      _renderCurvaturePreview(_getCvs(), p);
    }
  }

  function _curvatureDblClick(p) {
    if (_curvPts.length >= 2) {
      _finalizeCurvaturePath();
    }
  }

  function _finalizeCurvaturePath() {
    var cvs = _getCvs();
    _cleanupPreviews(cvs);
    if (_curvPts.length < 2) return;
    var d = _buildCatmullRom(_curvPts, false);
    var path = new fabric.Path(d, {
      fill: _cfg.fillEnabled ? _cfg.fillColor : 'transparent',
      stroke: _cfg.strokeColor,
      strokeWidth: _cfg.strokeWidth,
      strokeDashArray: [6, 4],
      selectable: true, evented: true,
      objectCaching: false,
      _isPenPath: true,
      _isFrame: true,
      _frameId: 'frame-pen-' + Date.now() + '-' + Math.floor(Math.random() * 9999)
    });
    cvs.add(path);
    cvs.setActiveObject(path);
    cvs.renderAll();
    _snap();
    _curvPts = [];
    if (typeof showToast === 'function') showToast('Spline frame created');
    if (_singlePathMode) { setTimeout(deactivatePenTool, 0); }
  }

  function _renderCurvaturePreview(cvs, mouseP) {
    var pts = _curvPts.slice();
    if (mouseP) pts.push(mouseP);
    if (pts.length < 2) {
      if (pts.length === 1) {
        _previewDrawData = {
          anchorDots: [{ x: pts[0].x, y: pts[0].y, radius: 3, fill: _cfg.strokeColor, stroke: 'transparent', strokeWidth: 0 }]
        };
      } else {
        _previewDrawData = null;
      }
      cvs.requestRenderAll();
      return;
    }
    var d = _buildCatmullRom(pts, false);
    var dots = [];
    pts.forEach(function (pt) {
      dots.push({ x: pt.x, y: pt.y, radius: 3, fill: '#fff', stroke: _cfg.strokeColor, strokeWidth: 1 });
    });
    _previewDrawData = { pathD: d, dashArray: [4, 3], anchorDots: dots };
    cvs.requestRenderAll();
  }

  /* Catmull-Rom spline → cubic bezier SVG */
  function _buildCatmullRom(pts, closed) {
    if (pts.length < 2) return '';
    if (pts.length === 2) {
      return 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + pts[1].x + ' ' + pts[1].y;
    }
    var d = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(i - 1, 0)];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[Math.min(i + 2, pts.length - 1)];
      var cp1x = p1.x + (p2.x - p0.x) / 6;
      var cp1y = p1.y + (p2.y - p0.y) / 6;
      var cp2x = p2.x - (p3.x - p1.x) / 6;
      var cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C ' + cp1x + ' ' + cp1y + ' ' + cp2x + ' ' + cp2y + ' ' + p2.x + ' ' + p2.y;
    }
    return d;
  }

  /* ═══════════════════════════════════════════════════════
     4. ADD ANCHOR POINT — click on path segment
     ═══════════════════════════════════════════════════════ */
  function _addAnchorDown(p, opt) {
    var cvs = _getCvs();
    var target = _findPathNear(cvs, p);
    if (!target) return;

    var pathData = target.path;
    if (!pathData || pathData.length < 2) return;

    /* Find closest segment and insert a midpoint */
    var bestIdx = -1, bestDist = Infinity;
    for (var i = 1; i < pathData.length; i++) {
      var seg = pathData[i];
      var prevSeg = pathData[i - 1];
      var endX = seg[seg.length - 2];
      var endY = seg[seg.length - 1];
      var startX = prevSeg[prevSeg.length - 2];
      var startY = prevSeg[prevSeg.length - 1];
      var mid = { x: (startX + endX) / 2, y: (startY + endY) / 2 };
      var d = _dist(p, { x: (startX + endX) / 2 + target.left + target.pathOffset.x * -1, y: (startY + endY) / 2 + target.top + target.pathOffset.y * -1 });
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    if (bestIdx < 1 || bestDist > 30) return;

    var seg = pathData[bestIdx];
    var prevSeg = pathData[bestIdx - 1];
    var sx = prevSeg[prevSeg.length - 2];
    var sy = prevSeg[prevSeg.length - 1];
    var ex = seg[seg.length - 2];
    var ey = seg[seg.length - 1];
    var mx = (sx + ex) / 2;
    var my = (sy + ey) / 2;

    /* Insert L command at midpoint */
    pathData.splice(bestIdx, 0, ['L', mx, my]);
    target.set({ path: pathData });
    target.setCoords();
    cvs.renderAll();
    _snap();
    if (typeof showToast === 'function') showToast('Anchor point added');
  }

  /* ═══════════════════════════════════════════════════════
     5. DELETE ANCHOR POINT
     ═══════════════════════════════════════════════════════ */
  function _deleteAnchorDown(p, opt) {
    var cvs = _getCvs();
    var target = _findPathNear(cvs, p);
    if (!target) return;

    var pathData = target.path;
    if (!pathData || pathData.length <= 2) return;

    /* Find closest anchor */
    var bestIdx = -1, bestDist = Infinity;
    for (var i = 0; i < pathData.length; i++) {
      var seg = pathData[i];
      var ax = seg[seg.length - 2] + target.left - (target.pathOffset ? target.pathOffset.x : 0);
      var ay = seg[seg.length - 1] + target.top - (target.pathOffset ? target.pathOffset.y : 0);
      var d = _dist(p, { x: ax, y: ay });
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    if (bestIdx < 0 || bestDist > 15) return;

    /* Don't delete the M command (first point) unless there's only 2 points */
    if (bestIdx === 0 && pathData.length > 2) {
      /* Move next point to M */
      var next = pathData[1];
      pathData[0] = ['M', next[next.length - 2], next[next.length - 1]];
      pathData.splice(1, 1);
    } else {
      pathData.splice(bestIdx, 1);
    }

    target.set({ path: pathData });
    target.setCoords();
    cvs.renderAll();
    _snap();
    if (typeof showToast === 'function') showToast('Anchor point deleted');
  }

  /* ═══════════════════════════════════════════════════════
     6. CONVERT POINT — toggle corner ↔ smooth
     ═══════════════════════════════════════════════════════ */
  function _convertPointDown(p, opt) {
    var cvs = _getCvs();
    var target = _findPathNear(cvs, p);
    if (!target) return;

    var pathData = target.path;
    if (!pathData || pathData.length < 2) return;

    /* Find closest anchor */
    var bestIdx = -1, bestDist = Infinity;
    for (var i = 0; i < pathData.length; i++) {
      var seg = pathData[i];
      var ax = seg[seg.length - 2] + target.left - (target.pathOffset ? target.pathOffset.x : 0);
      var ay = seg[seg.length - 1] + target.top - (target.pathOffset ? target.pathOffset.y : 0);
      var d = _dist(p, { x: ax, y: ay });
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx < 0 || bestDist > 15) return;

    var seg = pathData[bestIdx];
    if (seg[0] === 'C') {
      /* Smooth → Corner: convert C to L */
      pathData[bestIdx] = ['L', seg[seg.length - 2], seg[seg.length - 1]];
      if (typeof showToast === 'function') showToast('Converted to corner point');
    } else if (seg[0] === 'L' && bestIdx > 0 && bestIdx < pathData.length - 1) {
      /* Corner → Smooth: convert L to C with auto handles */
      var prev = pathData[bestIdx - 1];
      var next = pathData[bestIdx + 1];
      var px = prev[prev.length - 2], py = prev[prev.length - 1];
      var cx = seg[1], cy = seg[2];
      var nx = next[next.length - 2], ny = next[next.length - 1];
      var cp1x = px + (cx - px) * 0.5;
      var cp1y = py + (cy - py) * 0.5;
      var cp2x = cx - (nx - cx) * 0.25;
      var cp2y = cy - (ny - cy) * 0.25;
      pathData[bestIdx] = ['C', cp1x, cp1y, cp2x, cp2y, cx, cy];
      if (typeof showToast === 'function') showToast('Converted to smooth point');
    }

    target.set({ path: pathData });
    target.setCoords();
    cvs.renderAll();
    _snap();
  }

  /* ═══════════════════════════════════════════════════════
     7. LINE TOOL — click-drag to draw straight line
     ═══════════════════════════════════════════════════════ */
  function _lineDown(p) {
    _lineStart = p;
  }

  function _lineMove(p) {
    if (!_lineStart) return;
    _previewDrawData = {
      linePreview: {
        x1: _lineStart.x, y1: _lineStart.y,
        x2: p.x, y2: p.y,
        stroke: _cfg.strokeColor,
        strokeWidth: Math.max(1, _cfg.strokeWidth)
      }
    };
    _getCvs().requestRenderAll();
  }

  function _lineUp(p) {
    if (!_lineStart) return;
    var cvs = _getCvs();
    _previewDrawData = null;

    if (_dist(_lineStart, p) < 3) { _lineStart = null; cvs.requestRenderAll(); return; }

    var line = new fabric.Line([_lineStart.x, _lineStart.y, p.x, p.y], {
      stroke: _cfg.strokeColor,
      strokeWidth: _cfg.strokeWidth,
      strokeDashArray: [6, 4],
      selectable: true, evented: true,
      _isPenPath: true,
      _isFrame: true,
      _frameId: 'frame-pen-' + Date.now() + '-' + Math.floor(Math.random() * 9999)
    });
    cvs.add(line);
    cvs.setActiveObject(line);
    cvs.renderAll();
    _snap();
    _lineStart = null;
    if (typeof showToast === 'function') showToast('Line frame created');
    if (_singlePathMode) { setTimeout(deactivatePenTool, 0); }
  }

  /* ═══════════════════════════════════════════════════════
     PEN PREVIEW RENDERING
     ═══════════════════════════════════════════════════════ */
  function _renderPreview(cvs, mouseP) {
    var allAnchors = _anchors.slice();
    if (_dragging && _dragAnchor) allAnchors.push(_dragAnchor);

    if (allAnchors.length === 0) { _previewDrawData = null; cvs.requestRenderAll(); return; }

    var data = { handleLines: [], handleDots: [], anchorDots: [] };

    /* Build path string */
    var d = 'M ' + allAnchors[0].x + ' ' + allAnchors[0].y;
    for (var i = 1; i < allAnchors.length; i++) {
      var prev = allAnchors[i - 1];
      var curr = allAnchors[i];
      if (prev.type === 'smooth' || curr.type === 'smooth') {
        d += ' C ' + prev.cp2x + ' ' + prev.cp2y + ' ' +
             curr.cp1x + ' ' + curr.cp1y + ' ' +
             curr.x + ' ' + curr.y;
      } else {
        d += ' L ' + curr.x + ' ' + curr.y;
      }
    }

    /* Preview line to mouse position */
    if (mouseP && !_pathClosed && allAnchors.length > 0) {
      var last = allAnchors[allAnchors.length - 1];
      if (last.type === 'smooth' && !_dragging) {
        d += ' C ' + last.cp2x + ' ' + last.cp2y + ' ' +
             mouseP.x + ' ' + mouseP.y + ' ' +
             mouseP.x + ' ' + mouseP.y;
      } else if (!_dragging) {
        d += ' L ' + mouseP.x + ' ' + mouseP.y;
      }
    }

    data.pathD = d;

    /* Collect anchor dots + handles */
    allAnchors.forEach(function (a, idx) {
      if (a.type === 'smooth') {
        data.handleLines.push({ x1: a.cp1x, y1: a.cp1y, x2: a.cp2x, y2: a.cp2y });
        data.handleDots.push({ x: a.cp1x, y: a.cp1y, fill: _cfg.strokeColor, stroke: '#fff', strokeWidth: 0.5 });
        data.handleDots.push({ x: a.cp2x, y: a.cp2y, fill: _cfg.strokeColor, stroke: '#fff', strokeWidth: 0.5 });
      }
      var isFirst = idx === 0;
      data.anchorDots.push({
        x: a.x, y: a.y, radius: 4,
        fill: isFirst ? '#fff' : _cfg.strokeColor,
        stroke: isFirst ? _cfg.strokeColor : '#fff',
        strokeWidth: 1.5
      });
    });

    _previewDrawData = data;
    cvs.requestRenderAll();
  }

  /* ═══════════════════════════════════════════════════════
     FINALIZE PATH — create proper fabric.Path
     ═══════════════════════════════════════════════════════ */
  function _finalizePath(closed) {
    var cvs = _getCvs();
    _cleanupPreviews(cvs);
    if (_anchors.length < 2) return;

    var d = 'M ' + _anchors[0].x + ' ' + _anchors[0].y;
    for (var i = 1; i < _anchors.length; i++) {
      var prev = _anchors[i - 1];
      var curr = _anchors[i];
      if (prev.type === 'smooth' || curr.type === 'smooth') {
        d += ' C ' + prev.cp2x + ' ' + prev.cp2y + ' ' +
             curr.cp1x + ' ' + curr.cp1y + ' ' +
             curr.x + ' ' + curr.y;
      } else {
        d += ' L ' + curr.x + ' ' + curr.y;
      }
    }

    if (closed) {
      var last = _anchors[_anchors.length - 1];
      var first = _anchors[0];
      if (last.type === 'smooth' || first.type === 'smooth') {
        d += ' C ' + last.cp2x + ' ' + last.cp2y + ' ' +
             first.cp1x + ' ' + first.cp1y + ' ' +
             first.x + ' ' + first.y;
      }
      d += ' Z';
    }

    var path = new fabric.Path(d, {
      fill: (closed && _cfg.fillEnabled) ? _cfg.fillColor : 'transparent',
      stroke: _cfg.strokeColor,
      strokeWidth: _cfg.strokeWidth,
      strokeDashArray: [6, 4],
      selectable: true,
      evented: true,
      objectCaching: false,
      _isPenPath: true,
      _isFrame: true,
      _frameId: 'frame-pen-' + Date.now() + '-' + Math.floor(Math.random() * 9999)
    });

    cvs.add(path);
    cvs.setActiveObject(path);
    cvs.renderAll();
    _snap();

    _anchors = [];
    _pathClosed = false;
    if (typeof showToast === 'function') showToast(closed ? 'Closed frame created' : 'Open frame created');
    if (_singlePathMode) { setTimeout(deactivatePenTool, 0); }
  }

  /* ═══════════════════════════════════════════════════════
     HELPER: Find path near point
     ═══════════════════════════════════════════════════════ */
  function _findPathNear(cvs, p) {
    var objs = cvs.getObjects();
    var best = null, bestDist = 25;
    for (var i = objs.length - 1; i >= 0; i--) {
      var o = objs[i];
      if (o._isPenPreview || o._isPenHandle) continue;
      if (o.type !== 'path') continue;
      if (!o.path) continue;
      /* Check distance to any anchor */
      for (var j = 0; j < o.path.length; j++) {
        var seg = o.path[j];
        var ax = seg[seg.length - 2] + o.left - (o.pathOffset ? o.pathOffset.x : 0);
        var ay = seg[seg.length - 1] + o.top - (o.pathOffset ? o.pathOffset.y : 0);
        var d = _dist(p, { x: ax, y: ay });
        if (d < bestDist) {
          bestDist = d;
          best = o;
        }
      }
    }
    /* Also check if we're over a path's bounding area */
    if (!best) {
      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i];
        if (o._isPenPreview || o._isPenHandle) continue;
        if (o.type !== 'path') continue;
        if (o.containsPoint(p)) { best = o; break; }
      }
    }
    return best;
  }

  /* ═══════════════════════════════════════════════════════
     PREVIEWS CLEANUP
     ═══════════════════════════════════════════════════════ */
  function _cleanupPreviews(cvs) {
    _previewDrawData = null;
    if (!cvs) return;
    /* Safety net: remove any lingering Fabric preview objects */
    var toRemove = cvs.getObjects().filter(function (o) { return o._isPenPreview; });
    if (toRemove.length) toRemove.forEach(function (o) { cvs.remove(o); });
    _tempPath = null;
    _linePreview = null;
  }

  function _clearHandleOverlays(cvs) {
    if (!cvs) return;
    var toRemove = cvs.getObjects().filter(function (o) { return o._isPenHandle; });
    toRemove.forEach(function (o) { cvs.remove(o); });
    _handleOverlays = [];
  }

  /* ═══════════════════════════════════════════════════════
     FLOATING BAR
     ═══════════════════════════════════════════════════════ */
  function _showFloatBar() {
    if (_floatBar) { _floatBar.style.display = 'flex'; return; }

    var bar = document.createElement('div');
    bar.className = 'pen-float-bar';
    bar.id = 'pen-float-bar';

    /* ── Pen icon ── */
    bar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';

    /* ── Tool switcher buttons ── */
    var tools = [
      { id: 'pen',         label: 'Pen',      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>' },
      { id: 'freeform',    label: 'Free',     icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17c3.6-6 7-2 10-6s4.4-8 8-4"/></svg>' },
      { id: 'curvature',   label: 'Spline',   icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c2-4 6-8 10-4s6 4 10-4"/></svg>' },
      { id: 'line',        label: 'Line',     icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>' }
    ];
    var toolWrap = document.createElement('div');
    toolWrap.className = 'pf-tool-wrap';
    tools.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'pf-tool-btn';
      btn.dataset.tool = t.id;
      btn.innerHTML = t.icon + ' ' + t.label;
      btn.title = t.label;
      btn.onclick = function () { activatePenTool(t.id); };
      toolWrap.appendChild(btn);
    });
    bar.appendChild(toolWrap);
    bar.appendChild(_mkDiv());

    /* ── Anchor tools ── */
    var anchorTools = [
      { id: 'addAnchor',    label: '+Pt', title: 'Add Anchor Point',    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' },
      { id: 'deleteAnchor', label: '−Pt', title: 'Delete Anchor Point', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>' },
      { id: 'convertPoint', label: '⟳Pt', title: 'Convert Point',      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/></svg>' }
    ];
    var anchorWrap = document.createElement('div');
    anchorWrap.className = 'pf-tool-wrap';
    anchorTools.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'pf-tool-btn';
      btn.dataset.tool = t.id;
      btn.innerHTML = t.icon + ' ' + t.label;
      btn.title = t.title;
      btn.onclick = function () { activatePenTool(t.id); };
      anchorWrap.appendChild(btn);
    });
    bar.appendChild(anchorWrap);
    bar.appendChild(_mkDiv());

    /* ── Stroke Color ── */
    var strokeInp = document.createElement('input');
    strokeInp.type = 'color';
    strokeInp.className = 'pf-color';
    strokeInp.value = _cfg.strokeColor;
    strokeInp.title = 'Stroke Color';
    strokeInp.addEventListener('input', function () { _cfg.strokeColor = this.value; });
    bar.appendChild(strokeInp);

    /* ── Stroke Width ── */
    var swLabel = document.createElement('span');
    swLabel.className = 'pf-label';
    swLabel.textContent = 'W';
    bar.appendChild(swLabel);
    var swInp = document.createElement('input');
    swInp.type = 'range';
    swInp.className = 'pf-slider';
    swInp.min = '1'; swInp.max = '20'; swInp.value = _cfg.strokeWidth;
    swInp.title = 'Stroke Width';
    var swVal = document.createElement('span');
    swVal.className = 'pf-val';
    swVal.textContent = _cfg.strokeWidth;
    swInp.addEventListener('input', function () { _cfg.strokeWidth = +this.value; swVal.textContent = this.value; });
    bar.appendChild(swInp);
    bar.appendChild(swVal);
    bar.appendChild(_mkDiv());

    /* ── Fill toggle ── */
    var fillBtn = document.createElement('button');
    fillBtn.className = 'pf-tool-btn' + (_cfg.fillEnabled ? ' active' : '');
    fillBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="' + (_cfg.fillEnabled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Fill';
    fillBtn.title = 'Toggle Fill';
    fillBtn.onclick = function () {
      _cfg.fillEnabled = !_cfg.fillEnabled;
      fillBtn.classList.toggle('active');
      fillBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="' + (_cfg.fillEnabled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Fill';
    };
    bar.appendChild(fillBtn);

    /* ── Smooth slider (for freeform) ── */
    var smLabel = document.createElement('span');
    smLabel.className = 'pf-label pf-smooth-label';
    smLabel.textContent = 'Smooth';
    bar.appendChild(smLabel);
    var smInp = document.createElement('input');
    smInp.type = 'range';
    smInp.className = 'pf-slider pf-smooth-slider';
    smInp.min = '1'; smInp.max = '100'; smInp.value = _cfg.smooth;
    smInp.title = 'Freeform Smoothing';
    smInp.addEventListener('input', function () { _cfg.smooth = +this.value; });
    bar.appendChild(smInp);
    bar.appendChild(_mkDiv());

    /* ── Single Path Mode toggle (lock icon) ── */
    var lockBtn = document.createElement('button');
    lockBtn.className = 'pf-tool-btn' + (_singlePathMode ? ' active' : '');
    lockBtn.id = 'pf-single-path';
    lockBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Single';
    lockBtn.title = 'Single path mode: exit after one path (toggle)';
    lockBtn.onclick = function () {
      _singlePathMode = !_singlePathMode;
      lockBtn.classList.toggle('active', _singlePathMode);
    };
    bar.appendChild(lockBtn);
    bar.appendChild(_mkDiv());

    /* ── Close Path (pen) ── */
    var closeBtn = document.createElement('button');
    closeBtn.className = 'pf-action-btn';
    closeBtn.id = 'pf-close-path';
    closeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 17 2 17"/></svg> Close';
    closeBtn.title = 'Close current path';
    closeBtn.onclick = function () {
      if (_activeTool === 'pen' && _anchors.length >= 3) {
        _pathClosed = true;
        _finalizePath(true);
      } else if (_activeTool === 'curvature' && _curvPts.length >= 3) {
        _finalizeCurvaturePath();
      }
    };
    bar.appendChild(closeBtn);

    /* ── Finish (open path) ── */
    var finishBtn = document.createElement('button');
    finishBtn.className = 'pf-action-btn';
    finishBtn.id = 'pf-finish-path';
    finishBtn.innerHTML = '✓ Done';
    finishBtn.title = 'Finish open path';
    finishBtn.onclick = function () {
      if (_activeTool === 'pen' && _anchors.length >= 2) _finalizePath(false);
      else if (_activeTool === 'curvature' && _curvPts.length >= 2) _finalizeCurvaturePath();
      else if (_activeTool === 'freeform' && _freePoints.length >= 2) _finalizeFreeform();
    };
    bar.appendChild(finishBtn);

    /* ── Exit ── */
    var exitBtn = document.createElement('button');
    exitBtn.className = 'pf-exit';
    exitBtn.textContent = '✕';
    exitBtn.title = 'Exit Pen Tools';
    exitBtn.onclick = function () { deactivatePenTool(); };
    bar.appendChild(exitBtn);

    document.body.appendChild(bar);
    _floatBar = bar;
  }

  function _hideFloatBar() {
    if (_floatBar) _floatBar.style.display = 'none';
  }

  function _updateFloatBarActive() {
    if (!_floatBar) return;
    _floatBar.querySelectorAll('.pf-tool-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === _activeTool);
    });
    /* Show/hide smooth slider only for freeform */
    var smLabel = _floatBar.querySelector('.pf-smooth-label');
    var smSlider = _floatBar.querySelector('.pf-smooth-slider');
    if (smLabel) smLabel.style.display = (_activeTool === 'freeform') ? '' : 'none';
    if (smSlider) smSlider.style.display = (_activeTool === 'freeform') ? '' : 'none';
    /* Show/hide close/finish only for drawing tools */
    var closeBtn = document.getElementById('pf-close-path');
    var finishBtn = document.getElementById('pf-finish-path');
    var isDraw = _activeTool === 'pen' || _activeTool === 'curvature' || _activeTool === 'freeform';
    if (closeBtn) closeBtn.style.display = isDraw ? '' : 'none';
    if (finishBtn) finishBtn.style.display = isDraw ? '' : 'none';
  }

  function _mkDiv() {
    var d = document.createElement('div');
    d.className = 'pf-divider';
    return d;
  }

  /* ═══════════════════════════════════════════════════════
     UTILITIES
     ═══════════════════════════════════════════════════════ */
  function _dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /* Douglas-Peucker line simplification */
  function _douglasPeucker(pts, epsilon) {
    if (pts.length <= 2) return pts.slice();
    var maxDist = 0, maxIdx = 0;
    var A = pts[0], B = pts[pts.length - 1];
    for (var i = 1; i < pts.length - 1; i++) {
      var d = _ptLineDist(pts[i], A, B);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist <= epsilon) return [A, B];
    var left = _douglasPeucker(pts.slice(0, maxIdx + 1), epsilon);
    var right = _douglasPeucker(pts.slice(maxIdx), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  }

  function _ptLineDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return _dist(p, a);
    return Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / len;
  }

  /* ═══════════════════════════════════════════════════════
     KEYBOARD — Escape / Enter
     ═══════════════════════════════════════════════════════ */
  document.addEventListener('keydown', function (e) {
    if (!_activeTool) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      deactivatePenTool();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (_activeTool === 'pen' && _anchors.length >= 2) _finalizePath(false);
      else if (_activeTool === 'curvature' && _curvPts.length >= 2) _finalizeCurvaturePath();
      else if (_activeTool === 'freeform' && _freePoints.length >= 2) _finalizeFreeform();
    }
  });

})();

// Modular skeleton hook (Faz 8) — pen-tools is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'pen-tools', parent: 'canvas.tools', title: 'Pen tool', mount: function () {}, unmount: function () {} });
