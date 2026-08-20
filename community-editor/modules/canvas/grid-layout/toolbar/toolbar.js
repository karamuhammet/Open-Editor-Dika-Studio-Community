/* Module: canvas/grid-layout/toolbar — Grid toolbar + layers highlight.
   Part of the grid-layout group (decomposed from the 1338-line IIFE). Functions hang off the
   shared namespace GL (window.__ccGridLayout, created by the parent); cross-module refs resolve
   through GL at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var GL = window.__ccGridLayout;
  if (!GL) return;

  GL._glShowGridToolbar = function (grid) {
    GL._glHideGridToolbar();
    if (!grid || !grid._isGridLayout) return;
    var tb = document.createElement('div');
    tb.id = 'grid-cell-toolbar';
    tb.className = 'grid-cell-toolbar';
    tb.innerHTML = '<div class="grid-tb-hint">Click a cell to configure</div>';
    tb.onmousedown = function (e) { e.stopPropagation(); };
    var area = document.getElementById('canvas-area');
    (area || document.body).appendChild(tb);
    GL._glToolbar = tb;
    GL._glActiveCell = null;
  };

  GL._glHideGridToolbar = function () {
    if (GL._glToolbar) { GL._glToolbar.remove(); GL._glToolbar = null; }
    GL._glActiveCell = null;
    var cvs = GL._glGetCanvas();
    if (cvs) GL._glRemoveCellHighlight(cvs);
  };

  GL._glHighlightCellInLayers = function (grid, cell) {
    var gridIdx = GL._glGetCanvas().getObjects().indexOf(grid);
    // Structure panel
    document.querySelectorAll('.layer-grid-cell').forEach(function (el) { el.classList.remove('active'); });
    var el1 = document.querySelector(
      '.layer-grid-cell[data-grid-idx="' + gridIdx + '"][data-cell-row="' + cell.row + '"][data-cell-col="' + cell.col + '"]'
    );
    if (el1) el1.classList.add('active');
    // Right-panel layers
    document.querySelectorAll('.rp-layer-grid-cell').forEach(function (el) { el.classList.remove('active'); });
    var el2 = document.querySelector(
      '.rp-layer-grid-cell[data-grid-idx="' + gridIdx + '"][data-cell-row="' + cell.row + '"][data-cell-col="' + cell.col + '"]'
    );
    if (el2) el2.classList.add('active');
  };

  GL._glUpdateToolbar = function (grid, cell) {
    if (!GL._glToolbar || !cell) return;
    GL._glActiveCell = cell;

    // Refresh right panel design-field dropdown for this cell
    if (typeof syncRightPanel === 'function') syncRightPanel();

    var curFit = cell.fit || 'cover';
    var curPos = cell.position || 'center';
    var dfLabel = cell.dfField ? ' — ' + cell.dfField : '';
    var label  = 'Cell (' + (cell.row + 1) + ',' + (cell.col + 1) + ')' + dfLabel;
    var hasImg = GL._glCellHasImage(grid, cell);

    var fits = ['cover', 'contain', 'stretch'];
    var fitHtml = fits.map(function (f) {
      return '<button class="grid-tb-fit' + (f === curFit ? ' active' : '') + '" data-fit="' + f + '">' +
        f.charAt(0).toUpperCase() + f.slice(1) + '</button>';
    }).join('');

    var positions = [
      { id: 'top-left', l: '\u2196' }, { id: 'top', l: '\u2191' }, { id: 'top-right', l: '\u2197' },
      { id: 'left', l: '\u2190' },     { id: 'center', l: '\u2022' }, { id: 'right', l: '\u2192' },
      { id: 'bottom-left', l: '\u2199' }, { id: 'bottom', l: '\u2193' }, { id: 'bottom-right', l: '\u2198' }
    ];
    var posHtml = '<div class="grid-tb-pos-grid">';
    positions.forEach(function (p) {
      posHtml += '<button class="grid-tb-pos-btn' + (p.id === curPos ? ' active' : '') + '" data-pos="' + p.id + '">' + p.l + '</button>';
    });
    posHtml += '</div>';

    GL._glToolbar.innerHTML =
      '<div class="grid-tb-head">' +
        '<span class="grid-tb-cell-label">' + label + '</span>' +
        (hasImg ? '<button class="grid-tb-remove" title="Remove image">&times;</button>' : '') +
      '</div>' +
      '<div class="grid-tb-row"><span class="grid-tb-label">Fit</span><div class="grid-tb-fit-row">' + fitHtml + '</div></div>' +
      '<div class="grid-tb-row"><span class="grid-tb-label">Position</span>' + posHtml + '</div>' +
      (!hasImg ? '<button class="grid-tb-add-img">+ Add Image</button>' : '');

    // fit buttons
    GL._glToolbar.querySelectorAll('.grid-tb-fit').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        cell.fit = btn.dataset.fit;
        if (cell.imgSrc) GL._glPlaceImageInCell(grid, cell, cell.imgSrc, btn.dataset.fit, cell.position);
        GL._glUpdateToolbar(grid, cell);
      };
    });

    // position buttons
    GL._glToolbar.querySelectorAll('.grid-tb-pos-btn').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        cell.position = btn.dataset.pos;
        if (cell.imgSrc) GL._glPlaceImageInCell(grid, cell, cell.imgSrc, cell.fit, btn.dataset.pos);
        GL._glUpdateToolbar(grid, cell);
      };
    });

    // remove
    var remBtn = GL._glToolbar.querySelector('.grid-tb-remove');
    if (remBtn) {
      remBtn.onclick = function (ev) {
        ev.stopPropagation();
        var detachSrc = cell.imgSrc || '';
        // Grab the actual fabric image object before removal
        var detachObj = null;
        if (detachSrc) {
          var objs = grid.getObjects();
          for (var di = objs.length - 1; di >= 0; di--) {
            if (objs[di]._isGridCellImage && objs[di]._gridCellRow === cell.row && objs[di]._gridCellCol === cell.col) {
              detachObj = objs[di];
              break;
            }
          }
        }
        GL._glRemoveCellImage(grid, cell);
        GL._glRemoveCellVideo(cell);
        cell.imgSrc = '';
        cell.videoUrl = '';
        var cvs = GL._glGetCanvas();
        GL._glRenderPlusOverlays(grid);
        cvs.renderAll();
        if (typeof snap === 'function') snap();
        GL._glUpdateToolbar(grid, cell);
        // Place detached image on canvas as standalone object
        if (detachSrc) {
          var _addDetached = function (src) {
            fabric.Image.fromURL(src, function (img) {
              if (!img || !img.width) return;
              var scale = Math.min(200 / img.width, 200 / img.height, 1);
              img.set({
                left: 50, top: 50, scaleX: scale, scaleY: scale,
                clipPath: null, _isGridCellImage: false,
                selectable: true, evented: true
              });
              cvs.add(img);
              cvs.setActiveObject(img);
              cvs.renderAll();
              if (typeof snap === 'function') snap();
              if (typeof refreshStructure === 'function') refreshStructure();
              if (typeof showToast === 'function') showToast('Image extracted to canvas');
            });
          };
          // Try to get src from the detached object's element directly
          if (detachObj && detachObj._element && detachObj._element.src) {
            _addDetached(detachObj._element.src);
          } else {
            _addDetached(detachSrc);
          }
        }
      };
    }

    // add image
    var addBtn = GL._glToolbar.querySelector('.grid-tb-add-img');
    if (addBtn) {
      addBtn.onclick = function (ev) {
        ev.stopPropagation();
        GL._glEnterSelectMode(grid, cell);
      };
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'toolbar', parent: 'canvas.grid-layout', title: 'grid-layout: toolbar', mount: function () {}, unmount: function () {} });
  }
})();
