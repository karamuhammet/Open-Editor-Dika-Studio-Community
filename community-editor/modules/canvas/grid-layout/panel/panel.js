/* Module: canvas/grid-layout/panel — Preset cards + panel sync + live update + init.
   Part of the grid-layout group (decomposed from the 1338-line IIFE). Functions hang off the
   shared namespace GL (window.__ccGridLayout, created by the parent); cross-module refs resolve
   through GL at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var GL = window.__ccGridLayout;
  if (!GL) return;

  GL._glBuildPresetSVG = function (cols, rows) {
    var w = 140, h = 72, gap = 3, pad = 6, rx = 4;
    var cw = (w - pad * 2 - gap * (cols - 1)) / cols;
    var ch = (h - pad * 2 - gap * (rows - 1)) / rows;
    var rects = '';
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = pad + c * (cw + gap), y = pad + r * (ch + gap);
        rects += '<rect x="' + x + '" y="' + y + '" width="' + cw + '" height="' + ch +
          '" rx="' + rx + '" fill="#1b1b1f" stroke="#4a4a55" stroke-width="1" stroke-dasharray="3,2"/>';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
      '" width="' + w + '" height="' + h + '">' +
      '<rect width="' + w + '" height="' + h + '" rx="8" fill="#0b0b0d"/>' + rects + '</svg>';
  };

  GL._glRenderPresetCards = function () {
    var container = document.getElementById('grid-presets');
    if (!container) return;
    container.innerHTML = '';

    var presets = [
      { cols: 2, rows: 1, label: '2 \u00d7 1' },
      { cols: 2, rows: 2, label: '2 \u00d7 2' },
      { cols: 3, rows: 2, label: '3 \u00d7 2' },
      { cols: 3, rows: 3, label: '3 \u00d7 3' },
      { cols: 4, rows: 3, label: '4 \u00d7 3' },
      { cols: 4, rows: 4, label: '4 \u00d7 4' }
    ];

    presets.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'grid-preset-card';
      card.title = p.label;
      var thumb = document.createElement('div');
      thumb.className = 'grid-preset-thumb';
      thumb.innerHTML = GL._glBuildPresetSVG(p.cols, p.rows);
      card.appendChild(thumb);
      var lbl = document.createElement('span');
      lbl.className = 'grid-preset-label';
      lbl.textContent = p.label;
      card.appendChild(lbl);
      card.addEventListener('click', function () {
        var colsEl = document.getElementById('grid-cols');
        var rowsEl = document.getElementById('grid-rows');
        if (colsEl) colsEl.value = p.cols;
        if (rowsEl) rowsEl.value = p.rows;
        GL.applyGridToCanvas();
      });
      container.appendChild(card);
    });
  };

  GL._glSyncPanelFromGrid = function (grid) {
    if (!grid || !grid._isGridLayout) return;
    var el;
    el = document.getElementById('grid-cols');       if (el) el.value = grid._gridCols;
    el = document.getElementById('grid-rows');       if (el) el.value = grid._gridRows;
    el = document.getElementById('grid-gap');        if (el) el.value = grid._gridGap;
    el = document.getElementById('grid-radius');     if (el) el.value = grid._gridCellRadius;
    el = document.getElementById('grid-cell-color'); if (el) el.value = grid._gridCellColor || '#1b1b1f';
    el = document.getElementById('grid-line-color'); if (el) el.value = grid._gridLineColor || '#35353c';
    var opSlider = document.getElementById('grid-cell-opacity');
    var opVal    = document.getElementById('grid-cell-opacity-val');
    if (opSlider) {
      var pct = Math.round((grid._gridCellOpacity != null ? grid._gridCellOpacity : 1) * 100);
      opSlider.value = pct;
      if (opVal) opVal.textContent = pct + '%';
    }
  };

  GL._glLiveUpdateGrid = function () {
    var cvs = GL._glGetCanvas();
    var grid = GL.findGridLayout(cvs);
    if (!grid) return;
    var el;
    el = document.getElementById('grid-cell-color'); if (el) grid._gridCellColor = el.value;
    el = document.getElementById('grid-line-color'); if (el) grid._gridLineColor = el.value;
    el = document.getElementById('grid-gap');        if (el) grid._gridGap = parseInt(el.value) || 0;
    el = document.getElementById('grid-radius');     if (el) grid._gridCellRadius = parseInt(el.value) || 0;
    var opSlider = document.getElementById('grid-cell-opacity');
    if (opSlider) grid._gridCellOpacity = (parseInt(opSlider.value) || 0) / 100;
    grid.dirty = true;
    cvs.requestRenderAll();
  };

  GL.initGridLayout = function () {
    var applyBtn = document.getElementById('grid-apply');
    if (applyBtn) applyBtn.onclick = function () {
      GL.applyGridToCanvas();
      var cvs = GL._glGetCanvas();
      var grid = GL.findGridLayout(cvs);
      if (grid) setTimeout(function () { GL._glRenderPlusOverlays(grid); }, 100);
    };

    var removeBtn = document.getElementById('grid-remove');
    if (removeBtn) removeBtn.onclick = function () {
      var cvs = GL._glGetCanvas();
      GL._glRemoveAllPlusOverlays(cvs);
      GL._glExitSelectMode();
      GL.removeGridLayout();
    };

    var opSlider = document.getElementById('grid-cell-opacity');
    var opVal    = document.getElementById('grid-cell-opacity-val');
    if (opSlider && opVal) {
      opSlider.oninput = function () {
        opVal.textContent = opSlider.value + '%';
        GL._glLiveUpdateGrid();
      };
    }

    // Live-update bindings for grid property inputs
    var cellColorEl = document.getElementById('grid-cell-color');
    if (cellColorEl) cellColorEl.oninput = function () { GL._glLiveUpdateGrid(); };
    var lineColorEl = document.getElementById('grid-line-color');
    if (lineColorEl) lineColorEl.oninput = function () { GL._glLiveUpdateGrid(); };
    var gapEl = document.getElementById('grid-gap');
    if (gapEl) gapEl.oninput = function () { GL._glLiveUpdateGrid(); };
    var radiusEl = document.getElementById('grid-radius');
    if (radiusEl) radiusEl.oninput = function () { GL._glLiveUpdateGrid(); };

    GL._glRenderPresetCards();

    if (typeof canvas !== 'undefined' && canvas) {
      canvas.on('mouse:up', function (opt) { GL._glCanvasClickHandler(opt); });
      canvas.on('after:render', function () { GL._glSyncVideoPositions(); });

      // BUG3 fix: re-render plus overlays when grid is moved or scaled
      var _glMoveRafId = 0;
      canvas.on('object:moving', function (opt) {
        if (opt.target && opt.target._isGridLayout) {
          cancelAnimationFrame(_glMoveRafId);
          _glMoveRafId = requestAnimationFrame(function () {
            GL._glRenderPlusOverlays(opt.target);
            GL._glSyncHighlightPosition(opt.target);
          });
        }
      });
      canvas.on('object:scaling', function (opt) {
        if (opt.target && opt.target._isGridLayout) {
          cancelAnimationFrame(_glMoveRafId);
          _glMoveRafId = requestAnimationFrame(function () {
            GL._glRenderPlusOverlays(opt.target);
            GL._glSyncHighlightPosition(opt.target);
          });
        }
      });
      canvas.on('object:modified', function (opt) {
        if (opt.target && opt.target._isGridLayout) {
          GL._glRenderPlusOverlays(opt.target);
          GL._glSyncHighlightPosition(opt.target);
        }
      });

      // Toolbar lifecycle
      canvas.on('selection:created', function (opt) {
        var t = opt.selected && opt.selected[0];
        if (t && t._isGridLayout) { GL._glShowGridToolbar(t); GL._glSyncPanelFromGrid(t); }
      });
      canvas.on('selection:updated', function (opt) {
        var t = opt.selected && opt.selected[0];
        if (t && t._isGridLayout) { GL._glShowGridToolbar(t); GL._glSyncPanelFromGrid(t); }
        else GL._glHideGridToolbar();
      });
      canvas.on('selection:cleared', function () { GL._glHideGridToolbar(); });

      // When the grid itself is deleted from the canvas (Del/Backspace -> delSelected,
      // toolbar, radial/context menu), the "+" cell overlays (_isGridPlusBtn siblings)
      // and the cell toolbar would otherwise orphan. The "Remove Grid" panel button
      // already cleans them; this mirrors that cleanup for canvas-side deletes.
      canvas.on('object:removed', function (opt) {
        if (opt.target && opt.target._isGridLayout) {
          GL._glRemoveAllPlusOverlays(canvas);
          GL._glExitSelectMode();
          GL._glHideGridToolbar();
        }
      });

      // Cell click within grid → toolbar + highlight
      canvas.on('mouse:down', function (opt) {
        if (opt.e && opt.e.button === 2) return;
        if (!GL._glToolbar) return;
        var cvs = GL._glGetCanvas();
        var obj = cvs.getActiveObject();
        if (!obj || !obj._isGridLayout) return;
        var ptr  = cvs.getPointer(opt.e);
        var cell = GL._glGetCellAt(obj, ptr.x, ptr.y);
        if (cell) {
          GL._glUpdateToolbar(obj, cell);
          GL._glShowCellHighlight(cvs, obj, cell);
          GL._glHighlightCellInLayers(obj, cell);
        }
      });

      // Right-click context
      canvas.on('mouse:down', function (opt) {
        if (opt.e && opt.e.button === 2) GL._glCanvasContextHandler(opt);
      });
    }

    var flyout = document.getElementById('flyout-panel');
    if (flyout) flyout.addEventListener('click', GL._glGalleryClickInterceptor, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && GL._glIsSelectMode()) GL._glExitSelectMode();
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'panel', parent: 'canvas.grid-layout', title: 'grid-layout: panel', mount: function () {}, unmount: function () {} });
  }
})();
