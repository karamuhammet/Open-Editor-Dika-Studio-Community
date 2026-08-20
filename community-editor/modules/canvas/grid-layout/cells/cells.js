/* Module: canvas/grid-layout/cells — Cell image placement + the "+" add overlays.
   Part of the grid-layout group (decomposed from the 1338-line IIFE). Functions hang off the
   shared namespace GL (window.__ccGridLayout, created by the parent); cross-module refs resolve
   through GL at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var GL = window.__ccGridLayout;
  if (!GL) return;

  GL._glPlaceImageInCell = function (grid, cell, imgSrc, fitMode, position) {
    if (!grid || !cell) return;
    fitMode  = fitMode  || cell.fit      || 'cover';
    position = position || cell.position || 'center';
    var cvs  = GL._glGetCanvas();
    var rc   = grid.getCellRect(cell.row, cell.col);

    fabric.Image.fromURL(imgSrc, function (img) {
      if (!img || !img.width) return;

      var iw = img.width, ih = img.height;
      var sx, sy;
      if (fitMode === 'contain') {
        var s = Math.min(rc.w / iw, rc.h / ih);
        sx = s; sy = s;
      } else if (fitMode === 'stretch') {
        sx = rc.w / iw; sy = rc.h / ih;
      } else {                          // cover
        var s2 = Math.max(rc.w / iw, rc.h / ih);
        sx = s2; sy = s2;
      }
      img.set({ scaleX: sx, scaleY: sy });

      // ClipPath in image-local coords
      var clipW  = rc.w / sx, clipH = rc.h / sy;
      var clipRx = (grid._gridCellRadius || 0) / sx;
      var clipRy = (grid._gridCellRadius || 0) / sy;

      var clipOffX = 0, clipOffY = 0;
      if (fitMode === 'cover') {
        var exW = iw - clipW, exH = ih - clipH;
        if (position.indexOf('top')    >= 0) clipOffY = -exH / 2;
        else if (position.indexOf('bottom') >= 0) clipOffY = exH / 2;
        if (position.indexOf('left')   >= 0) clipOffX = -exW / 2;
        else if (position.indexOf('right')  >= 0) clipOffX = exW / 2;
      }

      var clip = new fabric.Rect({
        width: clipW, height: clipH,
        rx: clipRx, ry: clipRy,
        originX: 'center', originY: 'center',
        left: clipOffX, top: clipOffY
      });

      // Position in group-local coords
      var imgLeft = rc.x + rc.w / 2;
      var imgTop  = rc.y + rc.h / 2;

      if (fitMode === 'cover') {
        // Compensate image position so visible area stays centered in cell
        imgLeft -= clipOffX * sx;
        imgTop  -= clipOffY * sy;
      } else if (fitMode === 'contain') {
        var gapX = rc.w - iw * sx, gapY = rc.h - ih * sy;
        if (position.indexOf('top')    >= 0) imgTop  -= gapY / 2;
        else if (position.indexOf('bottom') >= 0) imgTop  += gapY / 2;
        if (position.indexOf('left')   >= 0) imgLeft -= gapX / 2;
        else if (position.indexOf('right')  >= 0) imgLeft += gapX / 2;
      }

      img.set({
        clipPath: clip,
        left: imgLeft, top: imgTop,
        originX: 'center', originY: 'center',
        _isGridCellImage: true,
        _gridCellRow: cell.row,
        _gridCellCol: cell.col,
        selectable: false, evented: false,
        objectCaching: false
      });

      // Update cell metadata
      cell.imgSrc  = imgSrc;
      cell.fit     = fitMode;
      cell.position = position;

      // Remove old, add new
      GL._glRemoveCellImage(grid, cell);
      grid.add(img);
      grid.dirty = true;

      GL._glRemovePlusForCell(cvs, cell);
      cvs.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
    }, { crossOrigin: 'anonymous' });
  };

  GL._glRemoveCellImage = function (grid, cell) {
    if (!grid) return;
    var objs = grid.getObjects();
    for (var i = objs.length - 1; i >= 0; i--) {
      var o = objs[i];
      if (o._isGridCellImage && o._gridCellRow === cell.row && o._gridCellCol === cell.col) {
        grid.remove(o);
      }
    }
    grid.dirty = true;
  };

  GL._glCellHasImage = function (grid, cell) {
    if (!grid) return false;
    var objs = grid.getObjects();
    for (var i = 0; i < objs.length; i++) {
      if (objs[i]._isGridCellImage &&
          objs[i]._gridCellRow === cell.row &&
          objs[i]._gridCellCol === cell.col) return true;
    }
    return false;
  };

  GL._glRenderPlusOverlays = function (grid) {
    var cvs = GL._glGetCanvas();
    if (!cvs || !grid) return;
    GL._glRemoveAllPlusOverlays(cvs);

    var mat = grid.calcTransformMatrix();
    grid._cells.forEach(function (cell) {
      if (GL._glCellHasImage(grid, cell)) return;
      var rc = grid.getCellRect(cell.row, cell.col);
      var center = fabric.util.transformPoint({ x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 }, mat);
      var iconSize = Math.min(rc.w, rc.h, 80) * 0.3;
      var plusGrp = GL._glCreatePlusIcon(center.x, center.y, iconSize, cell);
      cvs.add(plusGrp);
    });
    cvs.renderAll();
  };

  GL._glCreatePlusIcon = function (cx, cy, size, cell) {
    var half = size / 2, thick = Math.max(2, size * 0.15);
    var hBar = new fabric.Rect({ left: -half, top: -thick / 2, width: size, height: thick, fill: '#888', rx: thick / 2, ry: thick / 2 });
    var vBar = new fabric.Rect({ left: -thick / 2, top: -half, width: thick, height: size, fill: '#888', rx: thick / 2, ry: thick / 2 });
    var cs = size * 1.4;
    var circle = new fabric.Circle({ left: -cs / 2, top: -cs / 2, radius: cs / 2, fill: 'rgba(35,35,40,0.7)', stroke: '#555', strokeWidth: 1 });
    return new fabric.Group([circle, hBar, vBar], {
      left: cx, top: cy,
      originX: 'center', originY: 'center',
      selectable: false, evented: true, hoverCursor: 'pointer',
      _isGridPlusBtn: true,
      _gridCellRow: cell.row, _gridCellCol: cell.col,
      excludeFromExport: true, objectCaching: false
    });
  };

  GL._glRemoveAllPlusOverlays = function (cvs) {
    cvs = cvs || GL._glGetCanvas();
    var objs = cvs.getObjects();
    for (var i = objs.length - 1; i >= 0; i--) {
      if (objs[i]._isGridPlusBtn) cvs.remove(objs[i]);
    }
  };

  GL._glRemovePlusForCell = function (cvs, cell) {
    var objs = cvs.getObjects();
    for (var i = objs.length - 1; i >= 0; i--) {
      if (objs[i]._isGridPlusBtn &&
          objs[i]._gridCellRow === cell.row &&
          objs[i]._gridCellCol === cell.col) {
        cvs.remove(objs[i]);
      }
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'cells', parent: 'canvas.grid-layout', title: 'grid-layout: cells', mount: function () {}, unmount: function () {} });
  }
})();
