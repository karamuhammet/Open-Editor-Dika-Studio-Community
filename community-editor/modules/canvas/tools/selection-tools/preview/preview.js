/* Module: canvas/tools/selection-tools/preview — Selection watch + lasso/polygon live preview.
   Part of the selection-tools group (decomposed from the 1542-line IIFE). Functions hang off the
   shared namespace VST (window.__ccSelectionTools, created by the parent); cross-module refs resolve
   through VST at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VST = window.__ccSelectionTools;
  if (!VST) return;

  VST._watchSelection = function () {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
              (typeof canvas !== 'undefined' ? canvas : null);
    if (!cvs) { setTimeout(VST._watchSelection, 300); return; }

    cvs.on('selection:created', VST._onSelectionChange);
    cvs.on('selection:updated', VST._onSelectionChange);
    cvs.on('selection:cleared', function () { VST._hideFrameBar(); });
  };

  VST._onSelectionChange = function () {
    var cvs = VST._getCvs();
    var obj = cvs.getActiveObject();
    if (obj && obj._isFrame) {
      VST._showFrameBar(!!obj._isClippedImage);
    } else {
      VST._hideFrameBar();
    }
  };

  VST._clearPreview = function () {
    var cvs = VST._getCvs();
    if (VST._previewPath) { cvs.remove(VST._previewPath); VST._previewPath = null; }
    if (VST._previewLine) { cvs.remove(VST._previewLine); VST._previewLine = null; }
    cvs.renderAll();
  };

  VST._drawLassoPreview = function (cvs) {
    if (VST._previewPath) cvs.remove(VST._previewPath);
    if (VST._points.length < 2) return;

    var pathStr = 'M ' + VST._points[0].x + ' ' + VST._points[0].y;
    for (var i = 1; i < VST._points.length; i++) {
      pathStr += ' L ' + VST._points[i].x + ' ' + VST._points[i].y;
    }

    VST._previewPath = new fabric.Path(pathStr, {
      fill: 'rgba(242, 255, 88, 0.08)',
      stroke: '#f2ff58',
      strokeWidth: 1.5,
      strokeDashArray: [4, 3],
      selectable: false,
      evented: false,
      excludeFromExport: true,
      _isSelPreview: true
    });
    cvs.add(VST._previewPath);
    cvs.renderAll();
  };

  VST._drawPolygonPreview = function (cvs, cursorPt) {
    if (VST._previewPath) cvs.remove(VST._previewPath);
    if (VST._previewLine) cvs.remove(VST._previewLine);
    VST._previewPath = null;
    VST._previewLine = null;

    if (VST._points.length < 1) return;

    if (VST._points.length >= 2) {
      var pathStr = 'M ' + VST._points[0].x + ' ' + VST._points[0].y;
      for (var i = 1; i < VST._points.length; i++) {
        pathStr += ' L ' + VST._points[i].x + ' ' + VST._points[i].y;
      }
      VST._previewPath = new fabric.Path(pathStr, {
        fill: 'rgba(242, 255, 88, 0.06)',
        stroke: '#f2ff58',
        strokeWidth: 1.5,
        strokeDashArray: [4, 3],
        selectable: false,
        evented: false,
        excludeFromExport: true,
        _isSelPreview: true
      });
      cvs.add(VST._previewPath);
    }

    if (cursorPt) {
      var last = VST._points[VST._points.length - 1];
      VST._previewLine = new fabric.Line(
        [last.x, last.y, cursorPt.x, cursorPt.y],
        {
          stroke: '#f2ff58',
          strokeWidth: 1,
          strokeDashArray: [3, 3],
          selectable: false,
          evented: false,
          excludeFromExport: true,
          _isSelPreview: true
        }
      );
      cvs.add(VST._previewLine);
    }

    cvs.renderAll();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'preview', parent: 'canvas.tools.selection-tools', title: 'selection-tools: preview', mount: function () {}, unmount: function () {} });
  }
})();
