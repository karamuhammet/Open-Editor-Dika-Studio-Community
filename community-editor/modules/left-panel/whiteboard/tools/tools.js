/* Module: left-panel/whiteboard/tools — Tool switching + hand/select/shape/draw/text/eraser setup.
   Part of the whiteboard group (decomposed from the 1237-line IIFE). Functions hang off the
   shared namespace WB (window.__ccWhiteboard, created by the parent); cross-module refs resolve
   through WB at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;

  // Custom eraser cursor (red eraser glyph) so it's obvious the delete/eraser tool is
  // live. Set on BOTH defaultCursor (empty canvas) and hoverCursor (over an object),
  // because Fabric uses hoverCursor whenever the pointer is over an interactive object.
  WB._eraserCursor = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24' fill='%23ffffff' stroke='%23e5484d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 20H7L3 16l9-9 8 8-4 4z'/%3E%3Cline x1='6' y1='11' x2='13' y2='18'/%3E%3C/svg%3E\") 5 20, crosshair";

  WB.teardownCurrentTool = function () {
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';   // reset the eraser's custom hover cursor back to Fabric's default

    Object.keys(WB._handlers).forEach(function (evt) {
      canvas.off(evt, WB._handlers[evt]);
    });
    WB._handlers = {};
    WB._drawStart = null;
    if (WB._drawObj) { canvas.remove(WB._drawObj); WB._drawObj = null; }

    var stray = canvas.getObjects().filter(function (o) { return o.isSmartGuide; });
    stray.forEach(function (o) { try { canvas.remove(o); } catch (e) {} });
  };

  WB.setWbTool = function (tool) {
    WB.teardownCurrentTool();
    WB.wbTool = tool;
    WB.highlightBar(tool);

    switch (tool) {
      case 'hand':    WB.setupHand();    break;
      case 'select':  WB.setupSelect();  break;
      case 'rect':    WB.setupShape('rect');    break;
      case 'ellipse': WB.setupShape('ellipse'); break;
      case 'diamond': WB.setupShape('diamond'); break;
      case 'arrow':   WB.setupArrow();   break;
      case 'line':    WB.setupLine();    break;
      case 'draw':    WB.setupDraw();    break;
      case 'text':    WB.setupText();    break;
      case 'sticky':  WB.setupSticky();  break;
      case 'eraser':  WB.setupEraser();  break;
    }
  };

  WB.setupHand = function () {
    canvas.selection = false;
    canvas.defaultCursor = 'grab';
    canvas.forEachObject(function (o) { o.selectable = false; o.evented = false; });

    var dragging = false;
    var lastX, lastY;

    WB._handlers['mouse:down'] = function (opt) {
      dragging = true;
      canvas.defaultCursor = 'grabbing';
      var e = opt.e;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    WB._handlers['mouse:move'] = function (opt) {
      if (!dragging) return;
      var e = opt.e;
      var vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - lastX;
      vpt[5] += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setViewportTransform(vpt);   // recalc oCoords so hit-testing follows the pan
      canvas.requestRenderAll();
    };
    WB._handlers['mouse:up'] = function () {
      dragging = false;
      canvas.defaultCursor = 'grab';
    };

    Object.keys(WB._handlers).forEach(function (evt) { canvas.on(evt, WB._handlers[evt]); });
  };

  WB.setupSelect = function () {
    canvas.selection = true;
    canvas.defaultCursor = 'default';
    canvas.forEachObject(function (o) {
      if (!o._isPattern && !o._isGridLine && !o._isGuide) {
        o.selectable = true;
        o.evented = true;
      }
    });
  };

  WB._diamondPoly = function (x, y) {
    return new fabric.Polygon(
      [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }],
      {
        left: x, top: y, originX: 'left', originY: 'top',
        scaleX: 0.0001, scaleY: 0.0001, strokeUniform: true,
        fill: '#C9CDD6', stroke: WB.brushColor(), strokeWidth: 2,
        selectable: true, evented: true, objectCaching: false
      }
    );
  };

  WB.setupShape = function (type) {
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';

    var origin = null;

    WB._handlers['mouse:down'] = function (opt) {
      if (opt.target) return;
      var p = WB.getPointer(opt);
      origin = { x: p.x, y: p.y };

      if (type === 'rect') {
        WB._drawObj = new fabric.Rect({
          left: p.x, top: p.y, width: 0, height: 0,
          fill: '#C9CDD6', stroke: WB.brushColor(), strokeWidth: 2,
          rx: 0, ry: 0, selectable: true, evented: true
        });
      } else if (type === 'ellipse') {
        WB._drawObj = new fabric.Ellipse({
          left: p.x, top: p.y, rx: 0, ry: 0,
          fill: '#C9CDD6', stroke: WB.brushColor(), strokeWidth: 2,
          selectable: true, evented: true
        });
      } else if (type === 'diamond') {
        WB._drawObj = WB._diamondPoly(p.x, p.y);
      }
      canvas.add(WB._drawObj);
    };

    WB._handlers['mouse:move'] = function (opt) {
      if (!origin || !WB._drawObj) return;
      var p = WB.getPointer(opt);
      var w = Math.abs(p.x - origin.x);
      var h = Math.abs(p.y - origin.y);
      var l = Math.min(p.x, origin.x);
      var t = Math.min(p.y, origin.y);

      if (type === 'ellipse') {
        WB._drawObj.set({ left: l, top: t, rx: w / 2, ry: h / 2 });
      } else if (type === 'diamond') {
        WB._drawObj.set({ left: l, top: t, scaleX: Math.max(w, 0.0001) / 100, scaleY: Math.max(h, 0.0001) / 100 });
      } else {
        WB._drawObj.set({ left: l, top: t, width: w, height: h });
      }
      canvas.renderAll();
    };

    WB._handlers['mouse:up'] = function () {
      if (!WB._drawObj) return;
      var tooSmall = false;
      if (type === 'ellipse') {
        tooSmall = WB._drawObj.rx < 3 && WB._drawObj.ry < 3;
      } else {
        tooSmall = WB._drawObj.getScaledWidth() < 3 && WB._drawObj.getScaledHeight() < 3;
      }
      if (tooSmall) { canvas.remove(WB._drawObj); }
      else {
        WB._drawObj.setCoords();
        canvas.setActiveObject(WB._drawObj);
        if (typeof snap === 'function') snap();
      }
      WB._drawObj = null;
      origin = null;
      setTimeout(function () { WB.setWbTool('select'); }, 0);
    };

    Object.keys(WB._handlers).forEach(function (evt) { canvas.on(evt, WB._handlers[evt]); });
  };

  WB.setupDraw = function () {
    canvas.isDrawingMode = true;
    canvas.selection = false;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.width = WB.brushSize();
    canvas.freeDrawingBrush.color = WB.brushColor();
  };

  WB.setupText = function () {
    canvas.selection = false;
    canvas.defaultCursor = 'text';

    WB._handlers['mouse:down'] = function (opt) {
      var target = opt.target;
      if (target) {
        // Clicked an existing editable text -> just re-enter editing it.
        if (target.type === 'textbox' || target.type === 'i-text' || target.type === 'text') {
          canvas.setActiveObject(target);
          if (target.enterEditing) { target.enterEditing(); if (target.selectAll) target.selectAll(); }
          canvas.renderAll();
          return;
        }
        // Clicked a sticky / labeled-shape group -> edit its text.
        if (target._isSticky || target._isTextGroup) { WB._editSticky(target); return; }
        // A line/arrow can't hold text.
        if (target._isBoardLine) return;
        // Otherwise it's a shape -> group a wrapped label onto it and start typing.
        if (WB.addShapeLabel && WB.addShapeLabel(target)) {
          setTimeout(function () { WB.setWbTool('select'); }, 0);
        }
        return;
      }
      var p = WB.getPointer(opt);
      // Textbox (not IText) with a fixed width + splitByGrapheme so free text wraps to
      // the box instead of running off infinitely; the user can widen the box.
      var text = new fabric.Textbox('Type here', {
        left: p.x, top: p.y, width: 260,
        fontSize: 20, fontFamily: 'Arial',
        fill: WB.brushColor(), textAlign: 'left', splitByGrapheme: true,
        selectable: true, evented: true
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      text.selectAll();
      canvas.renderAll();
      if (typeof snap === 'function') snap();
      setTimeout(function () { WB.setWbTool('select'); }, 0);
    };

    Object.keys(WB._handlers).forEach(function (evt) { canvas.on(evt, WB._handlers[evt]); });
  };

  WB.setupEraser = function () {
    canvas.selection = false;
    canvas.defaultCursor = WB._eraserCursor;
    canvas.hoverCursor = WB._eraserCursor;
    var erasing = false;

    function eraseAt(opt) {
      var p = WB.getPointer(opt);
      var objs = canvas.getObjects();
      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i];
        if (o._isPattern || o._isGridLine || o._isGuide) continue;
        // absolute=true → hit-test against the object's scene (aCoords) box so it
        // matches WB.getPointer()'s scene coords. Without it, containsPoint uses
        // viewport-space coords and erases the wrong object once zoomed/panned.
        if (o.containsPoint(p, null, true)) {
          canvas.remove(o);
          canvas.renderAll();
          if (typeof snap === 'function') snap();
          break;
        }
      }
    }

    WB._handlers['mouse:down'] = function (opt) { erasing = true; eraseAt(opt); };
    WB._handlers['mouse:move'] = function (opt) { if (erasing) eraseAt(opt); };
    WB._handlers['mouse:up']   = function ()    { erasing = false; };

    Object.keys(WB._handlers).forEach(function (evt) { canvas.on(evt, WB._handlers[evt]); });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'tools', parent: 'left-panel.whiteboard', title: 'whiteboard: tools', mount: function () {}, unmount: function () {} });
  }
})();
