/* Module: left-panel/whiteboard/lines — Board line + arrow (fabric.BoardLine).
   A bendable, shape-binding connector for the board, written ground-up (no legacy code reused).
   It is a fabric.Path (quadratic Bezier "M s Q c e"): straight when the control point c sits at
   the midpoint, curved when the user drags the middle handle. Two endpoints can MAGNETICALLY
   bind to shape anchors and follow the shape when it moves (Excalidraw-style).

   Robustness (the old system's bugs, structurally prevented):
   - Geometry is stored as three ABSOLUTE scene points (wbS/wbC/wbE). The path body moves/rotates
     with Fabric natively; on a plain body drag the model is shifted by the left/top delta.
   - Binding reflow and _reflow() NEVER run on a connector that is currently a member of a live
     ActiveSelection (conn.group set) — that was the double-transform "teleport/stretch" bug. Group
     members are shifted by the group delta only, and re-synced on deselect.
   - Board pan/zoom handlers (interaction.js) already bail on canvas._currentTransform, so panning
     never fights an in-progress endpoint/body drag (the old "middle handle teleports on pan" bug).
   Functions hang off WB = window.__ccWhiteboard; cross-module refs resolve through WB at call time. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;
  if (typeof fabric === 'undefined') return;

  var VOLT = '#f2ff58';
  var BIND_SNAP = 16;   // scene px within which an endpoint snaps to / binds a shape anchor

  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  // The point ON the curve at t=0.5 (where the bend handle sits). For a quadratic it is
  // 0.25*s + 0.5*c + 0.25*e — NOT the raw control point c (which is off the curve). Placing the
  // handle here + solving c back from a dragged midpoint keeps the handle under the cursor.
  function curveMid(o) {
    return { x: 0.25 * o.wbS.x + 0.5 * o.wbC.x + 0.25 * o.wbE.x,
             y: 0.25 * o.wbS.y + 0.5 * o.wbC.y + 0.25 * o.wbE.y };
  }

  function pathStr(s, c, e, arrow) {
    var d = 'M ' + s.x + ' ' + s.y + ' Q ' + c.x + ' ' + c.y + ' ' + e.x + ' ' + e.y;
    if (arrow) {
      var ang = Math.atan2(e.y - c.y, e.x - c.x);   // tangent at the end
      var hl = 14, spread = Math.PI / 7;
      d += ' M ' + e.x + ' ' + e.y + ' L ' + (e.x - hl * Math.cos(ang - spread)) + ' ' + (e.y - hl * Math.sin(ang - spread));
      d += ' M ' + e.x + ' ' + e.y + ' L ' + (e.x - hl * Math.cos(ang + spread)) + ' ' + (e.y - hl * Math.sin(ang + spread));
    }
    return d;
  }

  function anchorsOf(b) {
    return [
      { x: b.left, y: b.top }, { x: b.left + b.width, y: b.top },
      { x: b.left, y: b.top + b.height }, { x: b.left + b.width, y: b.top + b.height },
      { x: b.left + b.width / 2, y: b.top }, { x: b.left + b.width / 2, y: b.top + b.height },
      { x: b.left, y: b.top + b.height / 2 }, { x: b.left + b.width, y: b.top + b.height / 2 },
      { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    ];
  }

  /* Nearest bindable shape anchor to a scene point, or null. Binds by the shape's persistent
     _ccId (stamped by app.js on object:added), storing a normalized (nx,ny) offset in its bbox. */
  WB._boardLineFindBind = function (pt, ignore) {
    if (typeof canvas === 'undefined') return null;
    var best = null, bestD = BIND_SNAP;
    canvas.getObjects().forEach(function (o) {
      if (o === ignore || o._isBoardLine || o._isGridLine || o._isPattern || o._isGuide ||
          o._isWbLabel || o.excludeFromExport || !o._ccId) return;
      var b = o.getBoundingRect(true, true);
      anchorsOf(b).forEach(function (a) {
        var d = Math.hypot(a.x - pt.x, a.y - pt.y);
        if (d < bestD) { bestD = d; best = { id: o._ccId, pt: a, nx: (a.x - b.left) / (b.width || 1), ny: (a.y - b.top) / (b.height || 1) }; }
      });
    });
    return best;
  };

  /* ── The object ── type 'board-line' → Fabric's camelize(capitalize) lookup → fabric.BoardLine. */
  if (!fabric.BoardLine) {
    fabric.BoardLine = fabric.util.createClass(fabric.Path, {
      type: 'board-line',
      _isBoardLine: true,
      arrow: false,
      curved: false,
      fill: '',
      hasBorders: false,
      objectCaching: false,
      perPixelTargetFind: true,   // click the stroke, not the whole diagonal bbox (board tolerance = 10)
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      hoverCursor: 'move',

      initialize: function (opts) {
        opts = opts || {};
        var s = opts.wbS || { x: 0, y: 0 };
        var e = opts.wbE || { x: 0, y: 0 };
        var c = opts.wbC || mid(s, e);
        var arrow = !!opts.arrow;
        this.callSuper('initialize', pathStr(s, c, e, arrow), opts);
        this.wbS = { x: s.x, y: s.y }; this.wbC = { x: c.x, y: c.y }; this.wbE = { x: e.x, y: e.y };
        this.arrow = arrow;
        this.curved = !!opts.curved;
        this.bindStart = opts.bindStart || null;
        this.bindEnd = opts.bindEnd || null;
        this._isBoardLine = true;
        this.controls = { p1: makeCtrl('s'), pc: makeCtrl('c'), p2: makeCtrl('e') };
        this._reflow();
      },

      /* Rebuild the path from the absolute model and let Fabric recompute left/top/width/height.
         Callers guarantee the object is NOT inside a live ActiveSelection when this runs. */
      _reflow: function () {
        this.set({ path: fabric.util.parsePath(pathStr(this.wbS, this.wbC, this.wbE, this.arrow)) });
        // Recompute the box EXPLICITLY from the model. Fabric's _setPositionDimensions keeps a
        // stale pathOffset on a re-reflow (pathOffset = pathOffset || ...), which would offset
        // every render after the first (endpoint edit / bind follow / bake). The path points are
        // absolute scene coords; with originX/originY 'left'/'top' and pathOffset = box centre,
        // each point renders EXACTLY at its model coord. Symmetric pad covers stroke + arrowhead
        // (objectCaching is off, so the arrowhead past the box is never clipped).
        var xs = [this.wbS.x, this.wbC.x, this.wbE.x], ys = [this.wbS.y, this.wbC.y, this.wbE.y];
        var pad = (this.strokeWidth || 2) + (this.arrow ? 16 : 0);
        var minX = Math.min(xs[0], xs[1], xs[2]) - pad, maxX = Math.max(xs[0], xs[1], xs[2]) + pad;
        var minY = Math.min(ys[0], ys[1], ys[2]) - pad, maxY = Math.max(ys[0], ys[1], ys[2]) + pad;
        var w = maxX - minX, h = maxY - minY;
        this.set({ width: w, height: h, left: minX, top: minY });
        this.pathOffset = { x: minX + w / 2, y: minY + h / 2 };
        this.setCoords();
        this._lastLeft = this.left; this._lastTop = this.top;
        this.dirty = true;
        return this;
      },

      /* Re-derive the absolute model from the object's ACTUAL current transform (used after a
         group move/scale/rotate, where the object's left/top/scale/angle were baked by Fabric's
         _restoreObjectsState). This reads the truth rather than trusting a summed delta, so a
         member line can never diverge from where Fabric rendered it -> no teleport on deselect. */
      _bakeModel: function () {
        var m = this.calcTransformMatrix();
        var off = this.pathOffset || { x: 0, y: 0 };
        function f(p) { return fabric.util.transformPoint(new fabric.Point(p.x - off.x, p.y - off.y), m); }
        var s = f(this.wbS), c = f(this.wbC), e = f(this.wbE);
        this.wbS = { x: s.x, y: s.y }; this.wbC = { x: c.x, y: c.y }; this.wbE = { x: e.x, y: e.y };
        this.set({ angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 });
        this._reflow();
        return this;
      },

      toObject: function (propertiesToInclude) {
        return this.callSuper('toObject', (propertiesToInclude || []).concat(
          ['wbS', 'wbC', 'wbE', 'arrow', 'curved', 'bindStart', 'bindEnd', '_isBoardLine']));
      }
    });

    fabric.BoardLine.fromObject = function (object, callback) {
      var obj = new fabric.BoardLine(object);
      if (callback) callback(obj);
      return obj;
    };
  }

  /* ── Endpoint / bend controls ──
     positionHandler: the model points are already absolute scene coords, so screen = viewport ∘ point
     (identity when off-canvas, e.g. during fromObject). actionHandler: pointer arrives in scene coords
     (canvas.getPointer default); update the model + (endpoints) bind to a nearby shape, then reflow. */
  function makeCtrl(key) {   // key: 's' (start) | 'c' (bend) | 'e' (end)
    return new fabric.Control({
      actionName: 'boardLinePoint',
      cursorStyle: 'crosshair',
      positionHandler: function (dim, finalMatrix, fo) {
        var p = key === 's' ? fo.wbS : (key === 'c' ? curveMid(fo) : fo.wbE);
        var vpt = (fo.canvas && fo.canvas.viewportTransform) || fabric.iMatrix;
        return fabric.util.transformPoint(new fabric.Point(p.x, p.y), vpt);
      },
      actionHandler: function (eventData, transform, x, y) {
        var fo = transform.target;
        if (key === 'c') {
          // Drag the ON-CURVE midpoint to (x,y): solve the control point so the curve passes
          // through the cursor at t=0.5  ->  c = 2*M - (s+e)/2. Keeps the handle under the cursor
          // (no 2x over-extension) and on the curve.
          fo.wbC = { x: 2 * x - (fo.wbS.x + fo.wbE.x) / 2, y: 2 * y - (fo.wbS.y + fo.wbE.y) / 2 };
          fo.curved = true;
        } else {
          var bt = WB._boardLineFindBind({ x: x, y: y }, fo);
          var pt = bt ? { x: bt.pt.x, y: bt.pt.y } : { x: x, y: y };
          var bind = bt ? { id: bt.id, nx: bt.nx, ny: bt.ny } : null;
          if (key === 's') { fo.wbS = pt; fo.bindStart = bind; }
          else { fo.wbE = pt; fo.bindEnd = bind; }
          if (!fo.curved) fo.wbC = mid(fo.wbS, fo.wbE);
        }
        fo._reflow();
        if (fo.canvas) fo.canvas.requestRenderAll();
        return true;
      },
      render: function (ctx, left, top, styleOverride, fo) {
        var bound = fo && ((key === 's' && fo.bindStart) || (key === 'e' && fo.bindEnd));
        ctx.save();
        ctx.beginPath();
        ctx.arc(left, top, key === 'c' ? 4.5 : 5.5, 0, 2 * Math.PI);
        ctx.fillStyle = (key === 'c' || bound) ? VOLT : '#ffffff';   // bend handle + bound ends = volt
        ctx.strokeStyle = VOLT;
        ctx.lineWidth = 2;
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    });
  }

  /* ── Binding reflow: a shape moved/scaled → its bound connectors follow ──
     Skips connectors that are inside an ActiveSelection (they move rigidly with the group), which
     is the guard that prevents the group-move double-transform. */
  WB._boardLineReflowForShape = function (shape, excludeSet) {
    if (!shape || !shape._ccId) return;
    var id = shape._ccId;
    var b = shape.getBoundingRect(true, true);
    canvas.getObjects().forEach(function (o) {
      if (!o._isBoardLine || o.group) return;
      if (excludeSet && excludeSet.indexOf(o) !== -1) return;
      var changed = false;
      if (o.bindStart && o.bindStart.id === id) { o.wbS = { x: b.left + o.bindStart.nx * b.width, y: b.top + o.bindStart.ny * b.height }; changed = true; }
      if (o.bindEnd && o.bindEnd.id === id) { o.wbE = { x: b.left + o.bindEnd.nx * b.width, y: b.top + o.bindEnd.ny * b.height }; changed = true; }
      if (changed) { if (!o.curved) o.wbC = mid(o.wbS, o.wbE); o._reflow(); }
    });
  };

  WB._boardLineOnMoving = function (opt) {
    var t = opt.target; if (!t) return;
    if (t._isBoardLine && !t.group) {
      // plain body drag: shift the whole model by the left/top delta (path already moved natively)
      var dl = t.left - (t._lastLeft == null ? t.left : t._lastLeft);
      var dt = t.top - (t._lastTop == null ? t.top : t._lastTop);
      if (dl || dt) {
        t.wbS.x += dl; t.wbS.y += dt; t.wbC.x += dl; t.wbC.y += dt; t.wbE.x += dl; t.wbE.y += dt;
        t._lastLeft = t.left; t._lastTop = t.top;
      }
    } else if (t.type === 'activeSelection' && t.getObjects) {
      // Member board lines move NATIVELY with the group; their absolute model is re-derived from
      // the object's real transform on deselect (_bakeModel), so we do NOT shift it by a flaky
      // ActiveSelection delta here (that summed-delta approach was the old teleport risk). Only
      // external connectors bound to a moved member shape need a live follow during the drag.
      var selLines = t.getObjects().filter(function (m) { return m._isBoardLine; });
      t.getObjects().forEach(function (m) {
        if (!m._isBoardLine && m._ccId) WB._boardLineReflowForShape(m, selLines);
      });
    } else if (t._ccId) {
      WB._boardLineReflowForShape(t, null);
    }
  };

  WB._boardLineOnScaling = function (opt) {
    var t = opt.target;
    if (t && t._ccId && !t._isBoardLine && t.type !== 'activeSelection') WB._boardLineReflowForShape(t, null);
  };

  WB._boardLineOnModified = function (opt) {
    var t = opt.target; if (!t) return;
    if (t.type === 'activeSelection' && t.getObjects) {
      var selLines = t.getObjects().filter(function (m) { return m._isBoardLine; });
      t.getObjects().forEach(function (m) {
        if (!m._isBoardLine && m._ccId) WB._boardLineReflowForShape(m, selLines);
      });
    } else if (t._isBoardLine && !t.group) {
      t._reflow();
    } else if (t._ccId) {
      WB._boardLineReflowForShape(t, null);
    }
    if (typeof snap === 'function') snap();
  };

  /* After any deselect, re-derive each (ungrouped) board line's model from its real transform —
     this bakes a native group move/scale/rotate exactly and resets the body-drag baseline. */
  WB._boardLineOnDeselect = function () {
    canvas.getObjects().forEach(function (o) {
      if (o._isBoardLine && !o.group && typeof o._bakeModel === 'function') o._bakeModel();
    });
  };

  /* ── Draw tool (drag). setupLine/setupArrow keep the names tools.js setWbTool dispatches to. ── */
  WB._setupBoardLineTool = function (isArrow) {
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';

    WB._handlers['mouse:down'] = function (opt) {
      var p = WB.getPointer(opt);
      var bt = WB._boardLineFindBind(p, null);
      var s = bt ? { x: bt.pt.x, y: bt.pt.y } : { x: p.x, y: p.y };
      WB._blStart = s;
      WB._drawObj = new fabric.BoardLine({
        wbS: s, wbE: { x: s.x, y: s.y }, arrow: !!isArrow,
        stroke: WB.brushColor(), strokeWidth: 2,
        bindStart: bt ? { id: bt.id, nx: bt.nx, ny: bt.ny } : null
      });
      canvas.add(WB._drawObj);
    };

    WB._handlers['mouse:move'] = function (opt) {
      if (!WB._drawObj || !WB._blStart) return;
      var p = WB.getPointer(opt);
      WB._drawObj.wbE = { x: p.x, y: p.y };
      WB._drawObj.wbC = mid(WB._drawObj.wbS, WB._drawObj.wbE);
      WB._drawObj._reflow();
      canvas.requestRenderAll();
    };

    WB._handlers['mouse:up'] = function (opt) {
      if (!WB._drawObj || !WB._blStart) return;
      var p = WB.getPointer(opt);
      var drawn = WB._drawObj; WB._drawObj = null;
      var s = WB._blStart; WB._blStart = null;
      if (Math.hypot(p.x - s.x, p.y - s.y) < 6) { canvas.remove(drawn); return; }
      var bt = WB._boardLineFindBind(p, drawn);
      drawn.wbE = bt ? { x: bt.pt.x, y: bt.pt.y } : { x: p.x, y: p.y };
      drawn.bindEnd = bt ? { id: bt.id, nx: bt.nx, ny: bt.ny } : null;
      drawn.wbC = mid(drawn.wbS, drawn.wbE);
      drawn._reflow();
      canvas.setActiveObject(drawn);
      canvas.requestRenderAll();
      if (typeof snap === 'function') snap();
      setTimeout(function () { WB.setWbTool('select'); }, 0);
    };

    Object.keys(WB._handlers).forEach(function (evt) { canvas.on(evt, WB._handlers[evt]); });
  };

  WB.setupLine  = function () { WB._setupBoardLineTool(false); };
  WB.setupArrow = function () { WB._setupBoardLineTool(true); };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'lines', parent: 'left-panel.whiteboard', title: 'whiteboard: lines', mount: function () {}, unmount: function () {} });
  }
})();
