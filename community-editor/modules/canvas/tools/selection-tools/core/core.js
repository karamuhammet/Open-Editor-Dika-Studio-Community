/* Module: canvas/tools/selection-tools/core — Init/canvas-sync + uid/offset helpers + the activate/deactivate API.
   Part of the selection-tools group (decomposed from the 1542-line IIFE). Functions hang off the
   shared namespace VST (window.__ccSelectionTools, created by the parent); cross-module refs resolve
   through VST at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VST = window.__ccSelectionTools;
  if (!VST) return;

  VST.activateSelectionTool = function (mode) {
    var cvs = VST._getCvs();
    if (VST._activeTool === mode) { VST.deactivateSelectionTool(); return; }
    if (typeof deactivatePenTool === 'function') deactivatePenTool();
    VST._activeTool = mode;
    VST._points = [];
    VST._drawing = false;
    VST._sourceImage = null;

    document.querySelectorAll('.tools-btn').forEach(function (b) { b.classList.remove('active'); });
    var btnId = { quick: 'tool-quick-select', lasso: 'tool-lasso-select', polygon: 'tool-poly-select' };
    var btn = document.getElementById(btnId[mode]);
    if (btn) btn.classList.add('active');

    cvs.defaultCursor = 'crosshair';
    cvs.hoverCursor = 'crosshair';
    cvs.selection = false;

    VST._lockedObjs = [];
    cvs.discardActiveObject();
    cvs.getObjects().forEach(function (o) {
      if (o._isSelPreview) return;
      VST._lockedObjs.push({ obj: o, selectable: o.selectable, evented: o.evented });
      o.set({ selectable: false, evented: false });
    });
    cvs.renderAll();

    var floatTB = document.getElementById('float-tb');
    if (floatTB) floatTB.classList.remove('show');

    if (typeof showToast === 'function') {
      var msgs = {
        quick: 'Quick Selection: Click an image, then brush to select',
        lasso: 'Lasso: Click and drag to draw a freehand frame on image',
        polygon: 'Polygon: Click to place points, double-click to close'
      };
      showToast(msgs[mode] || 'Selection tool active');
    }
  };

  VST.deactivateSelectionTool = function () {
    if (!VST._activeTool) return;
    VST._activeTool = null;
    VST._drawing = false;
    VST._points = [];
    VST._sourceImage = null;
    VST._clearPreview();
    VST._qsCleanup();

    document.querySelectorAll('.tools-btn').forEach(function (b) { b.classList.remove('active'); });
    VST._lockedObjs.forEach(function (entry) {
      if (entry.obj.canvas) entry.obj.set({ selectable: entry.selectable, evented: entry.evented });
    });
    VST._lockedObjs = [];

    var cvs = VST._getCvs();
    cvs.defaultCursor = 'default';
    cvs.hoverCursor = 'move';
    cvs.selection = true;
    cvs.renderAll();
  };

  VST._selToolActive = function () { return !!VST._activeTool; };

  VST.toggleToolsCat = function (catName) {
    var body = document.getElementById('tools-cat-body-' + catName);
    if (body) body.classList.toggle('open');
  };

  VST._initEvents = function () {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
              (typeof canvas !== 'undefined' ? canvas : null);
    if (!cvs) { setTimeout(VST._initEvents, 300); return; }

    cvs.on('mouse:down', function (opt) {
      if (!VST._activeTool) return;
      var p = cvs.getPointer(opt.e);

      if (VST._activeTool === 'quick') {
        var targetImg = VST._findImageAt(cvs, p);
        if (!targetImg) {
          if (typeof showToast === 'function') showToast('Click on an image');
          return;
        }
        if (!VST._qsActive) {
          if (!VST._qsBegin(targetImg)) return;
        } else if (targetImg !== VST._qsImg) {
          VST._qsFinalize();
          if (!VST._qsBegin(targetImg)) return;
        }
        VST._qsDrawing = true;
        var qpx = VST._qsPtr2Px(p.x, p.y);
        VST._qsGrowAt(qpx.x, qpx.y, VST._qsWBR());
        VST._qsRefreshOverlay();
        VST._qsLastPt = qpx;
        return;
      }

      if (VST._activeTool === 'lasso') {
        var img = VST._findImageAt(cvs, p);
        VST._sourceImage = img; // null is fine — works without image too
        VST._drawing = true;
        VST._points = [{ x: p.x, y: p.y }];
        return;
      }

      if (VST._activeTool === 'polygon') {
        if (VST._polyFinishing) return;
        if (VST._points.length === 0) {
          VST._sourceImage = VST._findImageAt(cvs, p); // null is fine
        }
        VST._points.push({ x: p.x, y: p.y });
        VST._drawPolygonPreview(cvs);
        return;
      }
    });

    cvs.on('mouse:move', function (opt) {
      if (!VST._activeTool) return;
      var p = cvs.getPointer(opt.e);

      if (VST._activeTool === 'quick') {
        VST._qsMoveCursor(p.x, p.y);
        if (VST._qsDrawing && VST._qsActive) {
          var qpx = VST._qsPtr2Px(p.x, p.y);
          var wbr = VST._qsWBR();
          if (VST._qsLastPt) {
            var qdx = qpx.x - VST._qsLastPt.x, qdy = qpx.y - VST._qsLastPt.y;
            if (qdx * qdx + qdy * qdy < wbr * wbr * 0.09) { VST._getCvs().renderAll(); return; }
          }
          VST._qsGrowAt(qpx.x, qpx.y, wbr);
          VST._qsRefreshOverlay();
          VST._qsLastPt = qpx;
        } else {
          VST._getCvs().renderAll();
        }
        return;
      }

      if (VST._activeTool === 'lasso' && VST._drawing) {
        VST._points.push({ x: p.x, y: p.y });
        VST._drawLassoPreview(cvs);
        return;
      }

      if (VST._activeTool === 'polygon' && VST._points.length > 0 && !VST._polyFinishing) {
        VST._drawPolygonPreview(cvs, p);
        return;
      }
    });

    cvs.on('mouse:up', function () {
      if (!VST._activeTool) return;

      if (VST._activeTool === 'quick' && VST._qsDrawing) {
        VST._qsDrawing = false;
        return;
      }

      if (VST._activeTool === 'lasso' && VST._drawing) {
        VST._drawing = false;
        if (VST._points.length > 10) {
          VST._createFrameFromPoints(VST._points, VST._sourceImage);
        }
        VST._points = [];
        VST._sourceImage = null;
        VST._clearPreview();
        VST.deactivateSelectionTool();
        return;
      }
    });

    cvs.on('mouse:dblclick', function () {
      if (VST._activeTool === 'polygon' && VST._points.length >= 3) {
        VST._polyFinishing = true;
        if (VST._points.length > 3) {
          VST._points.pop();
          if (VST._points.length > 3) VST._points.pop();
        }
        VST._createFrameFromPoints(VST._points, VST._sourceImage);
        VST._points = [];
        VST._sourceImage = null;
        VST._clearPreview();
        VST.deactivateSelectionTool();
        setTimeout(function () { VST._polyFinishing = false; }, 100);
      }
    });
  };

  VST._initCanvasSync = function () {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
              (typeof canvas !== 'undefined' ? canvas : null);
    if (!cvs) { setTimeout(VST._initCanvasSync, 300); return; }

    // When any image moves/scales/rotates → sync its bound frames
    function _onImageTransform(e) {
      var obj = e.target;
      if (!obj || !obj._uid) return;
      var objs = cvs.getObjects();
      var didSync = false;
      for (var i = 0; i < objs.length; i++) {
        if (objs[i]._isFrame && objs[i]._boundImageUid === obj._uid) {
          VST._syncFramePos(objs[i], obj);
          didSync = true;
        }
      }
      if (didSync) cvs.renderAll();
    }

    cvs.on('object:moving', _onImageTransform);
    cvs.on('object:scaling', _onImageTransform);
    cvs.on('object:rotating', _onImageTransform);

    // When a frame is manually moved/resized → update stored offset
    cvs.on('object:modified', function (e) {
      var obj = e.target;
      if (obj && obj._isFrame && obj._boundImageUid) {
        var img = VST._findByUid(cvs, obj._boundImageUid);
        if (img) VST._storeFrameOffset(obj, img);
      }
    });
  };

  VST._ensureUid = function (obj) {
    if (!obj._uid) {
      obj._uid = 'uid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    }
  };

  VST._storeFrameOffset = function (frame, img) {
    var matrix = img.calcTransformMatrix();
    var inv = fabric.util.invertTransform(matrix);
    var local = fabric.util.transformPoint(
      new fabric.Point(frame.left, frame.top), inv
    );
    frame._boundLocalX = local.x;
    frame._boundLocalY = local.y;
  };

  VST._syncFramePos = function (frame, img) {
    var lx = (frame._boundLocalX != null) ? frame._boundLocalX : 0;
    var ly = (frame._boundLocalY != null) ? frame._boundLocalY : 0;
    var matrix = img.calcTransformMatrix();
    var world = fabric.util.transformPoint(
      new fabric.Point(lx, ly), matrix
    );
    frame.set({ left: world.x, top: world.y });
    frame.setCoords();
  };

  VST._findByUid = function (cvs, uid) {
    var objs = cvs.getObjects();
    for (var i = 0; i < objs.length; i++) {
      if (objs[i]._uid === uid) return objs[i];
    }
    return null;
  };

  VST._getCvs = function () {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  };

  VST._findImageAt = function (cvs, pointer) {
    var objs = cvs.getObjects();
    for (var i = objs.length - 1; i >= 0; i--) {
      var o = objs[i];
      if (o.type !== 'image' || o.isQR || o._isChart || o._isEffect || o._isSelPreview) continue;
      var bound = o.getBoundingRect(true);
      if (pointer.x >= bound.left && pointer.x <= bound.left + bound.width &&
          pointer.y >= bound.top && pointer.y <= bound.top + bound.height) {
        return o;
      }
    }
    return null;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'core', parent: 'canvas.tools.selection-tools', title: 'selection-tools: core', mount: function () {}, unmount: function () {} });
  }
})();
