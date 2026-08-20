/* Module: left-panel/whiteboard/util — Geometry/pointer/snap helpers + brush size/colour getters.
   Part of the whiteboard group (decomposed from the 1237-line IIFE). Functions hang off the
   shared namespace WB (window.__ccWhiteboard, created by the parent); cross-module refs resolve
   through WB at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;

  WB.areaSize = function () {
    var area = document.getElementById('canvas-area');
    return {
      w: area ? area.clientWidth  : (window.innerWidth  - 70),
      h: area ? area.clientHeight : (window.innerHeight - 50)
    };
  };

  WB.getPointer = function (e) {
    return canvas.getPointer(e.e ? e.e : e);
  };

  WB.brushSize = function () { return WB._brushSize; }

  WB.brushColor = function () { return WB._brushColor; }

  WB.findSnapPoint = function (pointer, threshold) {
    threshold = threshold || 20;
    var best = null;
    var bestDist = threshold;
    canvas.getObjects().forEach(function (obj) {
      if (obj.type === 'line' || obj._isBoardLine || obj.type === 'path') return;
      if (obj._isPattern || obj._isGridLine || obj._isGuide) return;
      var b = obj.getBoundingRect();
      var cx = b.left + b.width / 2;
      var cy = b.top  + b.height / 2;
      var pts = [
        { x: cx,               y: b.top },
        { x: cx,               y: b.top + b.height },
        { x: b.left,           y: cy },
        { x: b.left + b.width, y: cy },
        { x: cx,               y: cy }
      ];
      pts.forEach(function (pt) {
        var d = Math.hypot(pt.x - pointer.x, pt.y - pointer.y);
        if (d < bestDist) { bestDist = d; best = pt; }
      });
    });
    return best;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'util', parent: 'left-panel.whiteboard', title: 'whiteboard: util', mount: function () {}, unmount: function () {} });
  }
})();
