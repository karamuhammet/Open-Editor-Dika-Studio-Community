/* Module: canvas/grid-layout/video — Per-cell video element placement + sync.
   Part of the grid-layout group (decomposed from the 1338-line IIFE). Functions hang off the
   shared namespace GL (window.__ccGridLayout, created by the parent); cross-module refs resolve
   through GL at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var GL = window.__ccGridLayout;
  if (!GL) return;

  GL._glEnsureVideoContainer = function () {
    var c = document.getElementById('grid-video-container');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'grid-video-container';
    c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2;';
    var area = document.getElementById('canvas-area');
    if (area) { area.style.position = 'relative'; area.appendChild(c); }
    return c;
  };

  GL._glRemoveCellVideo = function (cell) {
    for (var i = GL._glVideoElements.length - 1; i >= 0; i--) {
      var entry = GL._glVideoElements[i];
      if (entry.row === cell.row && entry.col === cell.col) {
        if (entry.video && entry.video.parentNode) { entry.video.pause(); entry.video.parentNode.removeChild(entry.video); }
        GL._glVideoElements.splice(i, 1);
      }
    }
  };

  GL._glRemoveAllVideos = function () {
    GL._glVideoElements.forEach(function (e) {
      if (e.video && e.video.parentNode) { e.video.pause(); e.video.parentNode.removeChild(e.video); }
    });
    GL._glVideoElements = [];
  };

  GL._glCssPosition = function (pos) {
    var map = {
      'top-left': 'left top', 'top': 'center top', 'top-right': 'right top',
      'left': 'left center', 'center': 'center center', 'right': 'right center',
      'bottom-left': 'left bottom', 'bottom': 'center bottom', 'bottom-right': 'right bottom'
    };
    return map[pos] || 'center center';
  };

  GL._glSyncVideoPositions = function () {
    var cvs = GL._glGetCanvas();
    if (!cvs) return;
    var grid = GL.findGridLayout(cvs);
    if (!grid) return;
    var canvasEl = cvs.getElement();
    if (!canvasEl) return;
    var canvasRect = canvasEl.getBoundingClientRect();
    var vpt  = cvs.viewportTransform || [1, 0, 0, 1, 0, 0];
    var zoom = vpt[0], panX = vpt[4], panY = vpt[5];
    var mat  = grid.calcTransformMatrix();
    var gsx  = grid.scaleX || 1, gsy = grid.scaleY || 1;
    var cssx = canvasRect.width / canvasEl.width;
    var cssy = canvasRect.height / canvasEl.height;

    GL._glVideoElements.forEach(function (entry) {
      var cell = grid.getCell(entry.row, entry.col);
      if (!cell || !entry.video) return;
      var rc  = grid.getCellRect(entry.row, entry.col);
      var ctr = fabric.util.transformPoint({ x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 }, mat);
      var sx2 = (ctr.x * zoom + panX) * cssx + canvasRect.left;
      var sy2 = (ctr.y * zoom + panY) * cssy + canvasRect.top;
      var sw  = rc.w * gsx * zoom * cssx;
      var sh  = rc.h * gsy * zoom * cssy;
      var container = entry.video.parentNode;
      var cr = container ? container.getBoundingClientRect() : canvasRect;
      entry.video.style.left   = (sx2 - cr.left - sw / 2) + 'px';
      entry.video.style.top    = (sy2 - cr.top  - sh / 2) + 'px';
      entry.video.style.width  = sw + 'px';
      entry.video.style.height = sh + 'px';
      entry.video.style.objectFit      = cell.fit || 'cover';
      entry.video.style.objectPosition = GL._glCssPosition(cell.position || 'center');
      entry.video.style.borderRadius   = ((grid._gridCellRadius || 0) * gsx * zoom * cssx) + 'px';
    });
  };

  GL._glPlaceVideoFileInCell = function (grid, cell, file) {
    var url = URL.createObjectURL(file);
    var container = GL._glEnsureVideoContainer();
    GL._glRemoveCellVideo(cell);
    var cvs = GL._glGetCanvas();
    GL._glRemoveCellImage(grid, cell);
    GL._glRemovePlusForCell(cvs, cell);

    var vid = document.createElement('video');
    vid.src = url; vid.muted = true; vid.loop = true; vid.autoplay = true; vid.playsInline = true;
    vid.style.cssText = 'position:absolute;pointer-events:none;';
    vid.style.objectFit = cell.fit || 'cover';
    vid.style.objectPosition = GL._glCssPosition(cell.position || 'center');
    container.appendChild(vid);

    GL._glVideoElements.push({ row: cell.row, col: cell.col, video: vid, url: url });
    cell.videoUrl = url;
    cell.imgSrc = '';
    vid.play().catch(function () {});
    setTimeout(function () { GL._glSyncVideoPositions(); }, 100);
    cvs.renderAll();
    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
  };

  GL._glPlaceVideoUrlInCell = function (grid, cell, videoUrl) {
    var container = GL._glEnsureVideoContainer();
    GL._glRemoveCellVideo(cell);
    var cvs = GL._glGetCanvas();
    GL._glRemoveCellImage(grid, cell);
    GL._glRemovePlusForCell(cvs, cell);

    var vid = document.createElement('video');
    vid.src = videoUrl; vid.muted = true; vid.loop = true; vid.autoplay = true; vid.playsInline = true;
    vid.crossOrigin = 'anonymous';
    vid.style.cssText = 'position:absolute;pointer-events:none;';
    vid.style.objectFit = cell.fit || 'cover';
    vid.style.objectPosition = GL._glCssPosition(cell.position || 'center');
    container.appendChild(vid);

    GL._glVideoElements.push({ row: cell.row, col: cell.col, video: vid, url: videoUrl });
    cell.videoUrl = videoUrl;
    cell.imgSrc = '';
    vid.play().catch(function () {});
    setTimeout(function () { GL._glSyncVideoPositions(); }, 100);
    cvs.renderAll();
    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'video', parent: 'canvas.grid-layout', title: 'grid-layout: video', mount: function () {}, unmount: function () {} });
  }
})();
