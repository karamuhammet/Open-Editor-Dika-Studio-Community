/* Module: canvas/grid-layout/core — fabric.GridLayout custom class + create/find/remove/apply + cell geometry helpers.
   Part of the grid-layout group (decomposed from the 1338-line IIFE). Functions hang off the
   shared namespace GL (window.__ccGridLayout, created by the parent); cross-module refs resolve
   through GL at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var GL = window.__ccGridLayout;
  if (!GL) return;

  GL._glRoundRect = function (ctx, x, y, w, h, r) {
    if (r <= 0) { ctx.rect(x, y, w, h); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  GL._glCanvasDim = function () {
    var w = typeof CW !== 'undefined' ? CW : 700;
    var h = typeof CH !== 'undefined' ? CH : 400;
    return { w: w, h: h };
  };

  GL._glGetCanvas = function () {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  };

  fabric.GridLayout = fabric.util.createClass(fabric.Group, {
    type: 'gridLayout',

    /* ── defaults ── */
    _isGridLayout: true,
    _gridCols: 3,
    _gridRows: 2,
    _gridGap: 4,
    _gridCellColor: '#1b1b1f',
    _gridLineColor: '#35353c',
    _gridCellRadius: 0,
    _gridCellOpacity: 1,
    _cells: null,           // [{row, col, fit, position, imgSrc, videoUrl}]

    /* ── constructor ── */
    initialize: function (options) {
      options = options || {};
      var dim = GL._glCanvasDim();
      options.width  = options.width  || dim.w;
      options.height = options.height || dim.h;

      // Call Group init with empty children, already-grouped = true
      this.callSuper('initialize', [], options, true);

      this._gridCols        = options._gridCols        || options.cols       || 3;
      this._gridRows        = options._gridRows        || options.rows       || 2;
      this._gridGap         = (options._gridGap != null ? options._gridGap : (options.gap != null ? options.gap : 4));
      this._gridCellColor   = options._gridCellColor   || options.cellColor  || '#1b1b1f';
      this._gridLineColor   = options._gridLineColor   || options.lineColor  || '#35353c';
      this._gridCellRadius  = options._gridCellRadius  != null ? options._gridCellRadius  : (options.cellRadius || 0);
      this._gridCellOpacity = options._gridCellOpacity != null ? options._gridCellOpacity : (options.cellOpacity != null ? options.cellOpacity : 1);
      this._isGridLayout    = true;
      this._customName      = options._customName || ('Grid ' + this._gridCols + '\u00d7' + this._gridRows);
      this.objectCaching    = false;
      this.subTargetCheck   = false;

      // Cell metadata
      if (options._cells && options._cells.length) {
        this._cells = JSON.parse(JSON.stringify(options._cells));
      } else {
        this._initCells();
      }
    },

    /* ── init cell metadata ── */
    _initCells: function () {
      this._cells = [];
      for (var r = 0; r < this._gridRows; r++) {
        for (var c = 0; c < this._gridCols; c++) {
          this._cells.push({
            row: r, col: c,
            fit: 'cover', position: 'center',
            imgSrc: '', videoUrl: '',
            dfField: ''
          });
        }
      }
    },

    /* ── get cell rect in group-local coords ── */
    getCellRect: function (row, col) {
      var tw = this.width, th = this.height;
      var gap = this._gridGap;
      var cw = (tw - (this._gridCols + 1) * gap) / this._gridCols;
      var ch = (th - (this._gridRows + 1) * gap) / this._gridRows;
      return {
        x: gap + col * (cw + gap) - tw / 2,
        y: gap + row * (ch + gap) - th / 2,
        w: cw, h: ch
      };
    },

    /* ── hit-test: group-local coords → cell meta ── */
    getCellAt: function (lx, ly) {
      for (var r = 0; r < this._gridRows; r++) {
        for (var c = 0; c < this._gridCols; c++) {
          var rc = this.getCellRect(r, c);
          if (lx >= rc.x && lx <= rc.x + rc.w && ly >= rc.y && ly <= rc.y + rc.h) {
            return this._cells[r * this._gridCols + c];
          }
        }
      }
      return null;
    },

    /* ── get cell meta by row/col ── */
    getCell: function (row, col) {
      return this._cells[row * this._gridCols + col] || null;
    },

    /* ── render ── */
    /* Fabric.js 5.x Group.render() calls drawObject(), not _render().
       Override drawObject so cell backgrounds & lines actually paint. */
    drawObject: function (ctx) {
      var cv = this._veCellVisibility;
      this._renderCellBgs(ctx, cv);
      for (var i = 0; i < this._objects.length; i++) {
        var child = this._objects[i];
        if (cv && child._isGridCellImage) {
          var ck = child._gridCellRow + '-' + child._gridCellCol;
          if (cv[ck] === false) continue;
        }
        child.render(ctx);
      }
      this._renderCellLines(ctx, cv);
      this._drawClipPath(ctx, this.clipPath);
    },

    /* Keep _render as fallback for cache path (objectCaching: true) */
    _render: function (ctx) {
      var cv = this._veCellVisibility;
      this._renderCellBgs(ctx, cv);
      for (var i = 0; i < this._objects.length; i++) {
        var child = this._objects[i];
        if (cv && child._isGridCellImage) {
          var ck = child._gridCellRow + '-' + child._gridCellCol;
          if (cv[ck] === false) continue;
        }
        child.render(ctx);
      }
      this._renderCellLines(ctx, cv);
    },

    _renderCellBgs: function (ctx, cellVis) {
      var cols = this._gridCols, rows = this._gridRows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (cellVis && cellVis[r + '-' + c] === false) continue;
          var rc = this.getCellRect(r, c);
          ctx.save();
          ctx.globalAlpha = this._gridCellOpacity * (this.opacity || 1);
          ctx.beginPath();
          GL._glRoundRect(ctx, rc.x, rc.y, rc.w, rc.h, this._gridCellRadius);
          ctx.fillStyle = this._gridCellColor;
          ctx.fill();
          ctx.restore();
        }
      }
    },

    _renderCellLines: function (ctx, cellVis) {
      var cols = this._gridCols, rows = this._gridRows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (cellVis && cellVis[r + '-' + c] === false) continue;
          var rc = this.getCellRect(r, c);
          ctx.save();
          ctx.globalAlpha = (this.opacity || 1);
          ctx.beginPath();
          GL._glRoundRect(ctx, rc.x, rc.y, rc.w, rc.h, this._gridCellRadius);
          ctx.setLineDash([5, 3]);
          ctx.strokeStyle = this._gridLineColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }
    },

    /* ── serialization ── */
    toObject: function (propertiesToInclude) {
      var obj = this.callSuper('toObject', propertiesToInclude);
      obj._gridCols        = this._gridCols;
      obj._gridRows        = this._gridRows;
      obj._gridGap         = this._gridGap;
      obj._gridCellColor   = this._gridCellColor;
      obj._gridLineColor   = this._gridLineColor;
      obj._gridCellRadius  = this._gridCellRadius;
      obj._gridCellOpacity = this._gridCellOpacity;
      obj._isGridLayout    = true;
      obj._cells           = JSON.parse(JSON.stringify(this._cells || []));
      return obj;
    }
  });

  GL._glRestoreGridCellImages = function (grid) {
    if (!grid || !grid._cells) return;
    var children = grid._objects || [];
    grid._cells.forEach(function (cell) {
      if (!cell.imgSrc) return;
      // Check if a child image already exists for this cell
      var found = false;
      for (var i = 0; i < children.length; i++) {
        if (children[i]._isGridCellImage && children[i]._gridCellRow === cell.row && children[i]._gridCellCol === cell.col) {
          found = true;
          break;
        }
      }
      if (!found) {
        console.log('[GridLayout] Restoring cell (' + (cell.row+1) + ',' + (cell.col+1) + ') imgSrc:', cell.imgSrc.substring(0, 80));
        GL._glPlaceImageInCell(grid, cell, cell.imgSrc, cell.fit, cell.position);
      }
    });
  };

  GL.createGridLayout = function (cols, rows, gap, cellColor, lineColor, cellRadius, cellOpacity) {
    cols = Math.max(1, Math.min(12, cols || 3));
    rows = Math.max(1, Math.min(12, rows || 2));
    gap  = Math.max(0, Math.min(40, gap != null ? gap : 4));
    cellColor   = cellColor   || '#1b1b1f';
    lineColor   = lineColor   || '#35353c';
    cellRadius  = cellRadius  || 0;
    cellOpacity = (cellOpacity != null ? cellOpacity : 100) / 100;

    var dim = GL._glCanvasDim();
    return new fabric.GridLayout({
      left: 0, top: 0,
      width: dim.w, height: dim.h,
      cols: cols, rows: rows, gap: gap,
      cellColor: cellColor, lineColor: lineColor,
      cellRadius: cellRadius, cellOpacity: cellOpacity
    });
  };

  GL.findGridLayout = function (cvs) {
    cvs = cvs || GL._glGetCanvas();
    var objs = cvs.getObjects();
    for (var i = objs.length - 1; i >= 0; i--) {
      if (objs[i]._isGridLayout) return objs[i];
    }
    return null;
  };

  GL.removeGridLayout = function () {
    var cvs = GL._glGetCanvas();
    GL._glRemoveAllPlusOverlays(cvs);
    GL._glExitSelectMode();
    GL._glRemoveAllVideos();
    GL._glHideGridToolbar();
    var grid = GL.findGridLayout(cvs);
    if (grid) {
      cvs.remove(grid);
      cvs.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
    }
  };

  GL.applyGridToCanvas = function () {
    var cvs = GL._glGetCanvas();
    var existing = GL.findGridLayout(cvs);
    if (existing) cvs.remove(existing);

    var cols  = parseInt(document.getElementById('grid-cols').value) || 3;
    var rows  = parseInt(document.getElementById('grid-rows').value) || 2;
    var gap   = parseInt(document.getElementById('grid-gap').value);
    if (isNaN(gap)) gap = 4;
    var cellColor  = document.getElementById('grid-cell-color').value  || '#1b1b1f';
    var lineColor  = document.getElementById('grid-line-color').value  || '#35353c';
    var cellRadius = parseInt(document.getElementById('grid-radius').value) || 0;
    var opEl       = document.getElementById('grid-cell-opacity');
    var cellOpac   = opEl ? parseInt(opEl.value) : 100;

    var grid = GL.createGridLayout(cols, rows, gap, cellColor, lineColor, cellRadius, cellOpac);
    if (!grid) return;

    cvs.add(grid);
    cvs.sendToBack(grid);
    cvs.setActiveObject(grid);
    cvs.renderAll();

    GL._glRemoveAllPlusOverlays(cvs);
    GL._glExitSelectMode();
    setTimeout(function () { GL._glRenderPlusOverlays(grid); }, 50);

    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
  };

  GL._glGetCellAt = function (grid, canvasX, canvasY) {
    if (!grid || !grid._isGridLayout) return null;
    var inv = fabric.util.invertTransform(grid.calcTransformMatrix());
    var pt  = fabric.util.transformPoint({ x: canvasX, y: canvasY }, inv);
    return grid.getCellAt(pt.x, pt.y);
  };

  GL._glGetSelectingGrid = function () { return GL._glSelectingGrid; };

  GL._glGetSelectingCell = function () { return GL._glSelectingCell; };

  GL._glGetActiveCell = function () { return GL._glActiveCell; };

  GL._glGetActiveGrid = function () { return GL._glToolbar ? GL.findGridLayout(GL._glGetCanvas()) : null; };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'core', parent: 'canvas.grid-layout', title: 'grid-layout: core', mount: function () {}, unmount: function () {} });
  }
})();
