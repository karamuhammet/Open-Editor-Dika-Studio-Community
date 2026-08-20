/* Module: canvas/grid-layout/select — Cell-pick / select mode + gallery click interception.
   Part of the grid-layout group (decomposed from the 1338-line IIFE). Functions hang off the
   shared namespace GL (window.__ccGridLayout, created by the parent); cross-module refs resolve
   through GL at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var GL = window.__ccGridLayout;
  if (!GL) return;

  GL._glEnterSelectMode = function (grid, cell) {
    GL._glSelectingGrid = grid;
    GL._glSelectingCell = cell;
    var cvs = GL._glGetCanvas();
    GL._glShowCellHighlight(cvs, grid, cell);
    GL._glShowSelectionBanner(cell);
    if (typeof openFlyout === 'function') openFlyout('images');
  };

  GL._glExitSelectMode = function () {
    GL._glSelectingGrid = null;
    GL._glSelectingCell = null;
    var cvs = GL._glGetCanvas();
    if (cvs) GL._glRemoveCellHighlight(cvs);
    GL._glHideSelectionBanner();
  };

  GL._glIsSelectMode = function () { return !!GL._glSelectingCell; }

  GL._glShowSelectionBanner = function (cell) {
    GL._glHideSelectionBanner();
    var label = 'Cell (' + (cell.row + 1) + ',' + (cell.col + 1) + ')';
    var banner = document.createElement('div');
    banner.id = 'grid-select-banner';
    banner.className = 'grid-select-banner';
    banner.innerHTML =
      '<span class="grid-select-banner-text">Select an image for <b>' + label + '</b></span>' +
      '<button class="grid-select-banner-cancel">Cancel</button>';
    var area = document.getElementById('canvas-area');
    (area || document.body).appendChild(banner);
    banner.querySelector('.grid-select-banner-cancel').onclick = function () { GL._glExitSelectMode(); };
    GL._glBannerEl = banner;
  };

  GL._glHideSelectionBanner = function () {
    if (GL._glBannerEl) { GL._glBannerEl.remove(); GL._glBannerEl = null; }
    var el = document.getElementById('grid-select-banner');
    if (el) el.remove();
  };

  GL._glGalleryClickInterceptor = function (e) {
    if (!GL._glIsSelectMode()) return;
    var galleryCell = e.target.closest ? e.target.closest('.gallery-cell') : null;
    if (!galleryCell) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    var grid = GL._glSelectingGrid, cell = GL._glSelectingCell;
    if (!grid || !cell) { GL._glExitSelectMode(); return; }

    var dataUrl = galleryCell.dataset.dataUrl || '';
    var folderId = galleryCell.dataset.srcFolder;
    var imgIdx = galleryCell.dataset.imgIdx;

    // Check video entry
    if (typeof _galInit === 'function') {
      var store = _galInit();
      var idx = parseInt(imgIdx, 10);
      if (folderId === '__recent' && store.recent && store.recent[idx]) {
        var entry = store.recent[idx];
        if (typeof entry === 'object' && entry.type === 'video') {
          if (entry.dataUrl && entry.dataUrl.indexOf('blob:') === 0) {
            GL._glPlaceVideoUrlInCell(grid, cell, entry.dataUrl);
            GL._glExitSelectMode();
            if (typeof showToast === 'function') showToast('Video placed in grid cell');
          } else {
            var poster = entry.poster || dataUrl;
            if (poster) {
              GL._glPlaceImageInCell(grid, cell, poster);
              GL._glExitSelectMode();
              if (typeof showToast === 'function') showToast('Video poster placed in grid cell');
            }
          }
          return;
        }
      }
    }

    if (dataUrl) {
      GL._glPlaceImageInCell(grid, cell, dataUrl);
      GL._glExitSelectMode();
      if (typeof showToast === 'function') showToast('Image placed in grid cell');
    }
  };

  GL._glCanvasClickHandler = function (opt) {
    var target = opt.target;
    if (!target || !target._isGridPlusBtn) return;
    var cvs = GL._glGetCanvas();
    var grid = GL.findGridLayout(cvs);
    if (!grid) return;
    var cell = grid.getCell(target._gridCellRow, target._gridCellCol);
    if (!cell) return;
    cvs.discardActiveObject();
    GL._glEnterSelectMode(grid, cell);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'select', parent: 'canvas.grid-layout', title: 'grid-layout: select', mount: function () {}, unmount: function () {} });
  }
})();
