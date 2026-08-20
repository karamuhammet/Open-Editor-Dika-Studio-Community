/* Module: canvas/grid-layout/menu — Cell context menu + hover highlight.
   Part of the grid-layout group (decomposed from the 1338-line IIFE). Functions hang off the
   shared namespace GL (window.__ccGridLayout, created by the parent); cross-module refs resolve
   through GL at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var GL = window.__ccGridLayout;
  if (!GL) return;

  GL._glShowCellContextMenu = function (e, grid, cell) {
    // Remove any legacy standalone menu
    var old = document.getElementById('grid-cell-ctx');
    if (old) old.remove();

    var section = document.getElementById('ctx-cell-section');
    var toggle  = document.getElementById('ctx-cell-toggle');
    var label   = document.getElementById('ctx-cell-label');
    var body    = document.getElementById('ctx-cell-body');
    if (!section || !body) return;

    var cellLabel  = 'Cell (' + (cell.row + 1) + ',' + (cell.col + 1) + ')';
    var currentFit = cell.fit      || 'cover';
    var currentPos = cell.position || 'center';

    label.textContent = cellLabel;

    var positions = [
      { id: 'top-left', l: '\u2196' }, { id: 'top', l: '\u2191' }, { id: 'top-right', l: '\u2197' },
      { id: 'left', l: '\u2190' },     { id: 'center', l: '\u2022' }, { id: 'right', l: '\u2192' },
      { id: 'bottom-left', l: '\u2199' }, { id: 'bottom', l: '\u2193' }, { id: 'bottom-right', l: '\u2198' }
    ];
    var posGrid = '<div class="grid-ctx-pos-grid">';
    positions.forEach(function (p) {
      posGrid += '<button class="grid-ctx-pos-btn' + (p.id === currentPos ? ' active' : '') + '" data-pos="' + p.id + '" title="' + p.id + '">' + p.l + '</button>';
    });
    posGrid += '</div>';

    body.innerHTML =
      '<div class="grid-ctx-section">Fit Mode</div>' +
      '<div class="grid-ctx-item' + (currentFit === 'cover'   ? ' active' : '') + '" data-action="cover">Cover</div>' +
      '<div class="grid-ctx-item' + (currentFit === 'contain' ? ' active' : '') + '" data-action="contain">Contain</div>' +
      '<div class="grid-ctx-item' + (currentFit === 'stretch' ? ' active' : '') + '" data-action="stretch">Stretch</div>' +
      '<div class="grid-ctx-section">Position</div>' + posGrid +
      '<div class="grid-ctx-sep"></div>' +
      '<div class="grid-ctx-item" data-action="select-gallery">Select from Gallery</div>' +
      '<div class="grid-ctx-item" data-action="upload">Upload File</div>' +
      '<div class="grid-ctx-sep"></div>' +
      '<div class="grid-ctx-item" style="color:#e55" data-action="remove-img">Remove Image</div>';

    section.style.display = '';
    body.style.display = 'none';

    // Toggle expand/collapse
    toggle.onclick = function (ev) {
      ev.stopPropagation();
      body.style.display = body.style.display === 'none' ? '' : 'none';
    };

    // Position buttons
    body.querySelectorAll('.grid-ctx-pos-btn').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        cell.position = btn.dataset.pos;
        body.querySelectorAll('.grid-ctx-pos-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (cell.imgSrc) GL._glPlaceImageInCell(grid, cell, cell.imgSrc, cell.fit, btn.dataset.pos);
      };
    });

    body.addEventListener('click', function handler(ev) {
      var action = ev.target.dataset.action;
      if (!action) return;
      var ctxMenu = document.getElementById('ctx-menu');
      if (ctxMenu) ctxMenu.classList.remove('show');
      section.style.display = 'none';

      if (action === 'cover' || action === 'contain' || action === 'stretch') {
        cell.fit = action;
        if (cell.imgSrc) GL._glPlaceImageInCell(grid, cell, cell.imgSrc, action, cell.position);
      } else if (action === 'remove-img') {
        var cvs = GL._glGetCanvas();
        GL._glRemoveCellImage(grid, cell);
        GL._glRemoveCellVideo(cell);
        cell.imgSrc  = '';
        cell.videoUrl = '';
        GL._glRenderPlusOverlays(grid);
        cvs.renderAll();
        if (typeof snap === 'function') snap();
      } else if (action === 'select-gallery') {
        GL._glEnterSelectMode(grid, cell);
      } else if (action === 'upload') {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*,video/*';
        inp.onchange = function () {
          if (!inp.files || !inp.files[0]) return;
          var file = inp.files[0];
          if (file.type.indexOf('video/') === 0) {
            GL._glPlaceVideoFileInCell(grid, cell, file);
          } else {
            var fr = new FileReader();
            fr.onload = function (ev2) { GL._glPlaceImageInCell(grid, cell, ev2.target.result); };
            fr.readAsDataURL(file);
          }
        };
        inp.click();
      }
      body.removeEventListener('click', handler);
    });
  };

  GL._glCanvasContextHandler = function (opt) {
    var cvs = GL._glGetCanvas();
    var grid = GL.findGridLayout(cvs);
    if (!grid) return;
    var pointer = cvs.getPointer(opt.e, true);
    var vpt = cvs.viewportTransform;
    var canvasX = (pointer.x - vpt[4]) / vpt[0];
    var canvasY = (pointer.y - vpt[5]) / vpt[3];
    var cell = GL._glGetCellAt(grid, canvasX, canvasY);
    if (!cell) return;
    // Populate cell section inside the main ctx-menu (don't create separate menu)
    GL._glShowCellContextMenu(opt.e, grid, cell);
  };

  GL._glShowCellHighlight = function (cvs, grid, cell) {
    GL._glRemoveCellHighlight(cvs);
    var mat = grid.calcTransformMatrix();
    var rc  = grid.getCellRect(cell.row, cell.col);
    var ctr = fabric.util.transformPoint({ x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 }, mat);

    GL._glHighlightRect = new fabric.Rect({
      left: ctr.x, top: ctr.y,
      width: rc.w, height: rc.h,
      rx: grid._gridCellRadius || 0,
      ry: grid._gridCellRadius || 0,
      originX: 'center', originY: 'center',
      fill: 'rgba(242, 255, 88,0.08)',
      stroke: '#f2ff58', strokeWidth: 2.5,
      strokeDashArray: [6, 3],
      selectable: false, evented: false,
      excludeFromExport: true, _isGridHighlight: true
    });
    cvs.add(GL._glHighlightRect);
    cvs.renderAll();
  };

  GL._glRemoveCellHighlight = function (cvs) {
    if (GL._glHighlightRect) { cvs.remove(GL._glHighlightRect); GL._glHighlightRect = null; }
    var objs = cvs.getObjects();
    for (var i = objs.length - 1; i >= 0; i--) {
      if (objs[i]._isGridHighlight) cvs.remove(objs[i]);
    }
  };

  GL._glSyncHighlightPosition = function (grid) {
    if (!GL._glHighlightRect || !GL._glActiveCell || !grid) return;
    var mat = grid.calcTransformMatrix();
    var rc  = grid.getCellRect(GL._glActiveCell.row, GL._glActiveCell.col);
    if (!rc) return;
    var ctr = fabric.util.transformPoint({ x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 }, mat);
    GL._glHighlightRect.set({ left: ctr.x, top: ctr.y, width: rc.w, height: rc.h });
    GL._glHighlightRect.setCoords();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'menu', parent: 'canvas.grid-layout', title: 'grid-layout: menu', mount: function () {}, unmount: function () {} });
  }
})();
