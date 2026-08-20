/* ============================================================
   dika studio core — CONTEXT MENU (right-click) + image context actions. Extracted from app.js §13
   (Faz 8 core slimming). Flat global script loaded BEFORE app.js so initContextMenu (called by
   initApp), ctxAction (30+ callers across modules + onclick), and the clip/merge/frame/unclip
   image helpers all stay window globals — callers unchanged. They use canvas/getActiveCanvas/snap/
   CUSTOM_PROPS + guarded module helpers (_bgImagePosition, getIcon, showCustomConfirm, …) at RUNTIME.
   ============================================================ */

// ── 13. Context Menu ─────────────────────────────────────────
// Unified check: can this object be used as a clip target for images/videos?
function _isClippableShape(obj) {
  // _isEffect: clipping an image into it sets _isClippedImage and swaps the src,
  // which the next blur repaint would overwrite. Not a valid clip target.
  // _isClipFrame: a finished frame is a group, and group IS in the accepted list below, so
  // without this you could clip an image into an existing frame and nest frames.
  if (!obj || obj.isQR || obj._isChart || obj._isEffect || obj._isClippedImage || obj._isClipFrame) return false;
  // Converted shape assets (including converted images) are valid clip targets
  if (obj._isMyShapeAsset || obj._isBrushShape) return true;
  if (obj.type === 'image') return false;
  return (
    obj.type === 'rect' || obj.type === 'circle' || obj.type === 'ellipse' ||
    obj.type === 'triangle' || obj.type === 'polygon' || obj.type === 'path' ||
    obj.type === 'polyline' || obj.type === 'line' || obj.type === 'group' ||
    obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox'
  );
}

function initContextMenu() {
  var ctxMenu = document.getElementById('ctx-menu');
  if (!ctxMenu) return;

  // Render a Lucide icon for every menu item that declares one (data-icon).
  Array.prototype.forEach.call(ctxMenu.querySelectorAll('[data-icon]'), function (btn) {
    if (btn.querySelector('svg')) return;
    var svg = (typeof getIcon === 'function') ? getIcon(btn.getAttribute('data-icon'), 15) : '';
    if (svg) btn.insertAdjacentHTML('afterbegin', svg);
  });

  function _fallbackIsSavableShape(obj) {
    return !!(obj && (
      obj.type === 'path' ||
      obj.type === 'rect' ||
      obj.type === 'circle' ||
      obj.type === 'ellipse' ||
      obj.type === 'triangle' ||
      obj.type === 'polygon' ||
      obj.type === 'polyline' ||
      obj.type === 'line' ||
      obj.type === 'group' ||
      obj._isBrushShape ||
      obj._isMyShapeAsset
    ));
  }

  function _canSaveShapeObject(obj) {
    if (typeof window.isSavableMyShapeObject === 'function') {
      return window.isSavableMyShapeObject(obj);
    }
    return _fallbackIsSavableShape(obj);
  }

  function _canConvertObjectToShape(obj) {
    if (typeof window.canConvertObjectToShapeAsset === 'function') {
      return window.canConvertObjectToShapeAsset(obj);
    }
    return !!(obj && !_fallbackIsSavableShape(obj) && !obj._isFrame && !obj._isClippedImage && obj.type !== 'activeSelection' && (
      obj.type === 'image' ||
      obj.type === 'text' ||
      obj.type === 'i-text' ||
      obj.type === 'textbox' ||
      obj._isBrushShape ||
      obj._isMyShapeAsset
    ));
  }

  canvas.on('mouse:down', function (opt) {
    ctxMenu.classList.remove('show');
    // Hide grid cell section (grid-layout.js will re-show if needed)
    var _ctxCell = document.getElementById('ctx-cell-section');
    if (_ctxCell) _ctxCell.style.display = 'none';
    if (opt.e.button === 2) {
      // Block canvas context menu when video editor is active
      if (window.VideoEditor && typeof window.VideoEditor.isActive === 'function' && window.VideoEditor.isActive()) return;
      if (opt.target) {
        canvas.setActiveObject(opt.target);
      }
      opt.e.preventDefault();
      // Show/hide "Set as Background Image" based on whether target is an image
      var setBgBtn = document.getElementById('ctx-set-bg');
      var removeBgBtn = document.getElementById('ctx-remove-bg');
      var clipIntoBtn = document.getElementById('ctx-clip-into');
      var unclipBtn = document.getElementById('ctx-unclip');
      var toImageBtn = document.getElementById('ctx-to-image');
      var ctxRmbg = document.getElementById('ctx-rmbg');
      var isTargetImage = opt.target && opt.target.type === 'image' && !opt.target.isQR && !opt.target._isChart && !opt.target._isEffect;
      if (setBgBtn) setBgBtn.style.display = isTargetImage ? '' : 'none';
      if (ctxRmbg) ctxRmbg.style.display = isTargetImage ? '' : 'none';
      var ctxUpscale = document.getElementById('ctx-upscale');
      if (ctxUpscale) ctxUpscale.style.display = isTargetImage ? '' : 'none';
      var ctxAiEdit = document.getElementById('ctx-ai-edit');
      if (ctxAiEdit) ctxAiEdit.style.display = isTargetImage ? '' : 'none';
      var ctxCrop = document.getElementById('ctx-crop');
      if (ctxCrop) ctxCrop.style.display = isTargetImage ? '' : 'none';
      if (removeBgBtn) removeBgBtn.style.display = canvas.backgroundImage ? '' : 'none';
      // Convert to Image: only in design mode (not wireframe/board)
      var isDesignMode = !window.wbActive && (typeof activeProduct === 'undefined' || activeProduct !== 'wireframe');
      if (toImageBtn) toImageBtn.style.display = isDesignMode ? '' : 'none';
      // Show "Clip Image into Shape" only when exactly 1 image + 1 shape selected
      var canClip = false;
      var activeObj = canvas.getActiveObject();
      if (activeObj && activeObj.type === 'activeSelection') {
        var sel = activeObj.getObjects();
        var imgCount = sel.filter(function(o) { return o.type === 'image' && !o.isQR && !o._isMyShapeAsset && !o._isBrushShape; }).length;
        var shapeCount = sel.filter(function(o) { return _isClippableShape(o); }).length;
        canClip = imgCount === 1 && shapeCount === 1 && sel.length === 2;
      }
      if (clipIntoBtn) clipIntoBtn.style.display = canClip ? '' : 'none';
      // Show "Merge Image into Cell" when 1 image + 1 gridLayout selected
      var ctxMergeCell = document.getElementById('ctx-merge-cell');
      var canMergeCell = false;
      if (activeObj && activeObj.type === 'activeSelection') {
        var selC = activeObj.getObjects();
        var imgC = selC.filter(function(o) { return o.type === 'image' && !o.isQR && !o._isGridCellImage; });
        var gridC = selC.filter(function(o) { return !!o._isGridLayout; });
        canMergeCell = imgC.length === 1 && gridC.length === 1 && selC.length === 2;
      }
      if (ctxMergeCell) ctxMergeCell.style.display = canMergeCell ? '' : 'none';
      // Show "Merge Image into Frame" when 1 frame + 1 image selected
      var mergeFrameBtn = document.getElementById('ctx-merge-frame');
      var canMergeFrame = false;
      if (activeObj && activeObj.type === 'activeSelection') {
        var selF = activeObj.getObjects();
        var imgF = selF.filter(function(o) { return o.type === 'image' && !o.isQR && !o._isFrame; });
        var frameF = selF.filter(function(o) { return o._isFrame && !o._isClippedImage && !o._isClipFrame; });
        canMergeFrame = imgF.length === 1 && frameF.length === 1 && selF.length === 2;
      }
      if (mergeFrameBtn) mergeFrameBtn.style.display = canMergeFrame ? '' : 'none';
      // Show "Punch Out with Frame" when 1 free frame + 1 image (not locked/clipped)
      var frameRmbgBtn = document.getElementById('ctx-frame-rmbg');
      var canFrameRmbg = false;
      if (activeObj && activeObj.type === 'activeSelection') {
        var selR = activeObj.getObjects();
        var imgR = selR.filter(function(o) { return o.type === 'image' && !o.isQR && !o._isFrame && !o._isClippedImage && !o._isClipFrame; });
        var frameR = selR.filter(function(o) { return o._isFrame && !o._isClippedImage && !o._isClipFrame && !o._boundImageUid; });
        canFrameRmbg = imgR.length === 1 && frameR.length === 1 && selR.length === 2;
      }
      if (frameRmbgBtn) frameRmbgBtn.style.display = canFrameRmbg ? '' : 'none';
      // Show "Release Clip" if active object is a clipped image
      var canUnclip = !!(opt.target && (opt.target._isClipFrame === true || opt.target._isClippedImage === true));
      if (unclipBtn) unclipBtn.style.display = canUnclip ? '' : 'none';
      // Show "Detach Frame" if active object is a frame bound to an image
      var releaseMaskBtn = document.getElementById('ctx-release-mask');
      var canDetachFrame = opt.target && opt.target._isFrame && !opt.target._isClippedImage && !opt.target._isClipFrame && opt.target._boundImageUid;
      if (releaseMaskBtn) releaseMaskBtn.style.display = canDetachFrame ? '' : 'none';
      // Show "Convert to Shape" if target is a frame (not clipped)
      var ctxConvertShape = document.getElementById('ctx-convert-shape');
      var canConvertShape = (opt.target && opt.target._isFrame && !opt.target._isClippedImage && !opt.target._isClipFrame) || _canConvertObjectToShape(opt.target);
      if (ctxConvertShape) ctxConvertShape.style.display = canConvertShape ? '' : 'none';
      var ctxConvertFrame = document.getElementById('ctx-convert-frame');
      var canConvertFrame = !!(opt.target && !opt.target._isFrame && !opt.target._isClippedImage && !opt.target._isClipFrame && _canSaveShapeObject(opt.target) && typeof convertObjectToFrame === 'function');
      if (ctxConvertFrame) ctxConvertFrame.style.display = canConvertFrame ? '' : 'none';
      // Show "Save to My Shapes" if target is a reusable shape object
      var ctxSaveShape = document.getElementById('ctx-save-shape');
      var canSaveShape = _canSaveShapeObject(opt.target);
      if (ctxSaveShape) ctxSaveShape.style.display = canSaveShape ? '' : 'none';
      /* "Comment on this" only exists when there IS a this. Right-clicking an object and being offered
         only "Add Comment" (which arms a MODE and waits for a second click) is why pointing at an image
         and saying something about it was impossible. */
      var ctxCommentObj = document.getElementById('ctx-comment-object');
      if (ctxCommentObj) ctxCommentObj.style.display = opt.target ? '' : 'none';
      _ctxSyncEditParent();
      ctxMenu.style.left = opt.e.clientX + 'px';
      ctxMenu.style.top = opt.e.clientY + 'px';
      ctxMenu.classList.add('show');
      _ctxClampMenu(opt.e.clientX, opt.e.clientY);
    }
  });

  // Show the "Edit ▸" flyout only when it has at least one visible child.
  function _ctxSyncEditParent() {
    var em = document.getElementById('ctx-edit-menu'), eb = document.getElementById('ctx-edit-btn');
    if (!em || !eb) return;
    var any = Array.prototype.some.call(em.querySelectorAll('.ctx-item'), function (b) { return b.style.display !== 'none'; });
    eb.style.display = any ? '' : 'none';
  }
  // Keep the menu inside the viewport (flip up/left near an edge).
  function _ctxClampMenu(x, y) {
    var mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
    if (x + mw > window.innerWidth - 8) ctxMenu.style.left = Math.max(8, window.innerWidth - mw - 8) + 'px';
    if (y + mh > window.innerHeight - 8) ctxMenu.style.top = Math.max(8, window.innerHeight - mh - 8) + 'px';
  }

  var canvasArea = document.getElementById('canvas-area');
  if (canvasArea) {
    canvasArea.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      // Block canvas context menu when video editor is active
      if (window.VideoEditor && typeof window.VideoEditor.isActive === 'function' && window.VideoEditor.isActive()) return;
      var setBgBtn = document.getElementById('ctx-set-bg');
      var removeBgBtn = document.getElementById('ctx-remove-bg');
      var clipIntoBtn = document.getElementById('ctx-clip-into');
      var unclipBtn = document.getElementById('ctx-unclip');
      var toImageBtn = document.getElementById('ctx-to-image');
      if (setBgBtn) setBgBtn.style.display = 'none';
      if (removeBgBtn) removeBgBtn.style.display = canvas.backgroundImage ? '' : 'none';
      var ctxRmbg2 = document.getElementById('ctx-rmbg');
      if (ctxRmbg2) ctxRmbg2.style.display = 'none';
      var ctxUpscale2 = document.getElementById('ctx-upscale');
      if (ctxUpscale2) ctxUpscale2.style.display = 'none';
      var ctxAiEdit2 = document.getElementById('ctx-ai-edit');
      if (ctxAiEdit2) ctxAiEdit2.style.display = 'none';
      var ctxCrop2 = document.getElementById('ctx-crop');
      if (ctxCrop2) ctxCrop2.style.display = 'none';
      if (clipIntoBtn) clipIntoBtn.style.display = 'none';
      if (unclipBtn) unclipBtn.style.display = 'none';
      var mergeFrameBtn2 = document.getElementById('ctx-merge-frame');
      if (mergeFrameBtn2) mergeFrameBtn2.style.display = 'none';
      var frameRmbgBtn2 = document.getElementById('ctx-frame-rmbg');
      if (frameRmbgBtn2) frameRmbgBtn2.style.display = 'none';
      var releaseMaskBtn2 = document.getElementById('ctx-release-mask');
      if (releaseMaskBtn2) releaseMaskBtn2.style.display = 'none';
      var ctxConvertShape2 = document.getElementById('ctx-convert-shape');
      if (ctxConvertShape2) ctxConvertShape2.style.display = 'none';
      var ctxConvertFrame2 = document.getElementById('ctx-convert-frame');
      if (ctxConvertFrame2) ctxConvertFrame2.style.display = 'none';
      var ctxSaveShape2 = document.getElementById('ctx-save-shape');
      if (ctxSaveShape2) ctxSaveShape2.style.display = 'none';
      var ctxMergeCell2 = document.getElementById('ctx-merge-cell');
      if (ctxMergeCell2) ctxMergeCell2.style.display = 'none';
      var isDesignMode = !window.wbActive && (typeof activeProduct === 'undefined' || activeProduct !== 'wireframe');
      if (toImageBtn) toImageBtn.style.display = isDesignMode ? '' : 'none';
      _ctxSyncEditParent();
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.classList.add('show');
      _ctxClampMenu(e.clientX, e.clientY);
    });
  }

  // The object menu is opened on `mouse:down`, so by the time the browser fires the
  // `contextmenu` event our menu is already under the cursor — that event then targets
  // the menu (not the canvas), so neither Fabric's stopContextMenu nor the canvas-area
  // handler suppress Chrome's native menu. Swallow contextmenu on the menu itself so the
  // two menus can't stack. (Submenus are descendants of #ctx-menu, so this covers them.)
  if (ctxMenu) ctxMenu.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); });

  // Generic flyout submenus (Arrange / Style / Edit / Canvas / More)
  var _ctxSubs = [
    ['ctx-layer-order-btn', 'ctx-layer-order-menu'],
    ['ctx-style-btn', 'ctx-style-menu'],
    ['ctx-edit-btn', 'ctx-edit-menu'],
    ['ctx-canvas-btn', 'ctx-canvas-menu'],
    ['ctx-more-btn', 'ctx-more-menu']
  ];
  function _ctxCloseSubs() {
    _ctxSubs.forEach(function (p) { var m = document.getElementById(p[1]); if (m) m.style.display = 'none'; });
  }
  function _ctxOpenSub(btn, menu) {
    _ctxCloseSubs();
    menu.style.display = 'block';
    var r = btn.getBoundingClientRect();
    menu.style.left = (r.right + 4) + 'px';
    menu.style.top = r.top + 'px';
    requestAnimationFrame(function () {
      var mr = menu.getBoundingClientRect();
      if (mr.right > window.innerWidth - 8) menu.style.left = Math.max(8, r.left - mr.width - 4) + 'px';
      if (mr.bottom > window.innerHeight - 8) menu.style.top = Math.max(8, window.innerHeight - mr.height - 8) + 'px';
    });
  }
  _ctxSubs.forEach(function (pair) {
    var btn = document.getElementById(pair[0]), menu = document.getElementById(pair[1]);
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.style.display === 'block') { menu.style.display = 'none'; return; }
      _ctxOpenSub(btn, menu);
    });
    btn.addEventListener('mouseenter', function () { _ctxOpenSub(btn, menu); });
  });

  document.addEventListener('click', function () {
    ctxMenu.classList.remove('show');
    _ctxCloseSubs();
  });

  // Click on empty canvas-area (outside canvas) should deselect
  if (canvasArea) {
    canvasArea.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      // Only deselect if click target is canvas-area itself or card-stage-container (not the canvas)
      var tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'canvas') return; // Fabric.js handles its own clicks
      var isAreaBg = e.target === canvasArea || e.target.classList.contains('card-stage-container') || e.target.classList.contains('card-stage');
      if (!isAreaBg) return;
      if (canvas.getActiveObject()) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    });
  }

  // ── Drag & Drop files onto canvas ── (self-called by the gallery module on load;
  //    it owns _initCanvasFileDrop now → robust to the gallery module loading async)

  // ── Video hover play/pause button events ── (self-called by the gallery module on load)
}

function ctxAction(action) {
  var cvs = getActiveCanvas();
  var ctxMenu = document.getElementById('ctx-menu');
  if (ctxMenu) ctxMenu.classList.remove('show');

  function _promptSaveConvertedShape() {
    setTimeout(function () {
      if (typeof saveToMyShapes === 'function') saveToMyShapes();
    }, 150);
  }

  // portal-tags-page Phase 9 (D1): tag the selected object(s). Ensures a stable _ccId,
  // then opens CCTagModal with an {type:'object', id:_ccId} target (single or bulk).
  if (action === 'tagObject') {
    if (typeof CCTagModal === 'undefined' || !CCTagModal.open) return;
    var _ao = cvs && cvs.getActiveObject ? cvs.getActiveObject() : null;
    if (!_ao) return;
    var _objs = (_ao.type === 'activeSelection' && _ao.getObjects) ? _ao.getObjects() : [_ao];
    var _targets = [];
    for (var _ti = 0; _ti < _objs.length; _ti++) {
      var _o = _objs[_ti];
      if (typeof _ccEnsureObjId === 'function') _ccEnsureObjId(_o, cvs);
      if (_o && _o._ccId) _targets.push({ type: 'object', id: _o._ccId });
    }
    if (!_targets.length) { if (typeof showToast === 'function') showToast('This item cannot be tagged.', 'error'); return; }
    CCTagModal.open({ target: _targets.length === 1 ? _targets[0] : _targets, onChange: function () { if (cvs && cvs.requestRenderAll) cvs.requestRenderAll(); } });
    return;
  }

  if (action === 'save') {
    // Route through the manual-save path: immediate remote flush + TRUTHFUL toast (only after the PATCH
    // resolves) instead of an unconditional "Saved!" over a possibly-skipped autosave.
    if (typeof saveProjectNow === 'function') {
      saveProjectNow();
    } else {
      if (typeof saveCurrentPage === 'function') saveCurrentPage();
      if (typeof performAutoSave === 'function') performAutoSave();
      if (typeof showToast === 'function') showToast('Saved!');
    }
    return;
  }
  if (action === 'saveTemplate') {
    if (typeof saveAsTemplate === 'function') saveAsTemplate();
    return;
  }
  if (action === 'removeBg') {
    var bgImg = cvs.backgroundImage;
    if (bgImg) {
      // Restore background image as a regular canvas object
      var src = bgImg.getSrc ? bgImg.getSrc() : (bgImg._element && bgImg._element.src ? bgImg._element.src : null);
      cvs.setBackgroundImage(null, function() {
        if (src) {
          fabric.Image.fromURL(src, function(img) {
            img.set({
              left: 0, top: 0,
              scaleX: bgImg.scaleX || 1,
              scaleY: bgImg.scaleY || 1
            });
            cvs.add(img);
            cvs.sendToBack(img);
            cvs.setActiveObject(img);
            cvs.renderAll();
            snap();
            if (typeof refreshStructure === 'function') refreshStructure();
            if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
            if (typeof showToast === 'function') showToast('Background image restored as object');
          }, { crossOrigin: 'anonymous' });
        } else {
          cvs.renderAll();
          snap();
          if (typeof refreshStructure === 'function') refreshStructure();
          if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
          if (typeof showToast === 'function') showToast('Background image removed');
        }
      });
    } else {
      cvs.setBackgroundImage(null, function() {
        cvs.renderAll();
        snap();
        if (typeof refreshStructure === 'function') refreshStructure();
        if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
      });
    }
    return;
  }
  if (action === 'removeImgBg') {
    if (typeof removeImageBg === 'function') removeImageBg();
    return;
  }
  if (action === 'upscale') {
    if (typeof activateUpscale === 'function') activateUpscale();
    return;
  }
  if (action === 'aiEdit') {
    if (typeof activateAiEdit === 'function') activateAiEdit();
    return;
  }
  if (action === 'crop') {
    if (typeof enterCropMode === 'function') enterCropMode();
    return;
  }
  if (action === 'toImage') {
    if (typeof convertCanvasToImage === 'function') convertCanvasToImage();
    return;
  }
  if (action === 'reset') {
    showCustomConfirm('Reset canvas? All objects will be removed.', function () {
      var cvs2 = getActiveCanvas();
      var bg = cvs2.backgroundColor || '#0d0d0d';
      var objs = cvs2.getObjects().slice();
      objs.forEach(function (o) { cvs2.remove(o); });
      cvs2.setBackgroundColor(bg, function () { cvs2.renderAll(); });
      snap();
    });
    return;
  }

  var obj = cvs.getActiveObject();
  if (!obj) return;

  if (action === 'duplicate') {
    // SCENE: duplicate a CCFrame as a NEW model frame (a bare clone shares _frameId + has no model entry
    // → phantom frame that breaks multi-select/group/align). Route to _scDuplicateFrame.
    if (typeof _scDuplicateFrame === 'function' && (obj._ccFrame || (obj.type === 'activeSelection' && obj.getObjects().some(function (o) { return o._ccFrame; })))) {
      var _frs = obj._ccFrame ? [obj] : obj.getObjects().filter(function (o) { return o._ccFrame; });
      if (!obj._ccFrame) cvs.discardActiveObject();
      var _SCe = window.__ccSceneEditor, _last = null;
      _frs.forEach(function (o) { var nf = _scDuplicateFrame(o._frameId); if (nf && _SCe && _SCe._frameObjById) _last = _SCe._frameObjById(nf.id); });
      if (_last) cvs.setActiveObject(_last);
      cvs.requestRenderAll();
      if (typeof snap === 'function') snap();
      return;
    }
    obj.clone(function (cl) {
      cl.set({ left: obj.left + 20, top: obj.top + 20 });
      if (obj.isQR) {
        cl.isQR = true;
        cl.qrUrl = obj.qrUrl;
        cl.qrFg = obj.qrFg;
        cl.qrBg = obj.qrBg;
      }
      if (obj._iconName) cl._iconName = obj._iconName;
      cvs.add(cl);
      cvs.setActiveObject(cl);
      cvs.renderAll();
      snap();
    });
  } else if (action === 'delete') {
    delSelected();
  } else if (action === 'rotate') {
    obj.rotate((obj.angle || 0) + 90);
    obj.setCoords();
    cvs.renderAll();
    snap();
    updateFloatTB();
  } else if (action === 'forward') {
    cvs.bringForward(obj);
    cvs.renderAll();
    snap();
  } else if (action === 'backward') {
    cvs.sendBackwards(obj);
    cvs.renderAll();
    snap();
  } else if (action === 'toFront') {
    cvs.bringToFront(obj);
    cvs.renderAll();
    snap();
  } else if (action === 'toBack') {
    cvs.sendToBack(obj);
    cvs.renderAll();
    snap();
  } else if (action === 'copyStyle') {
    if (typeof copyStyle === 'function') copyStyle();
    return;
  } else if (action === 'pasteStyle') {
    if (typeof pasteStyle === 'function') pasteStyle();
    return;
  } else if (action === 'lock') {
    var lk = !obj.lockMovementX;
    obj.set({
      lockMovementX: lk, lockMovementY: lk,
      lockScalingX: lk, lockScalingY: lk,
      lockRotation: lk, hasControls: !lk,
    });
    cvs.renderAll();
  } else if (action === 'setBg') {
    if (obj && obj.type === 'image') {
      // Rasterize the image at its REAL (natural) resolution — independent of how small
      // it was scaled on canvas. toDataURL() renders the object at its on-canvas scaled
      // size, so a small placed image would otherwise become a blurry/pixelated background.
      var filteredSrc;
      try {
        var _bgPrevSX = obj.scaleX, _bgPrevSY = obj.scaleY, _bgPrevAng = obj.angle || 0;
        obj.set({ scaleX: 1, scaleY: 1, angle: 0 });
        obj.setCoords();
        var _bgLongest = Math.max(obj.width || 1, obj.height || 1);
        var _bgMult = _bgLongest > 4096 ? 4096 / _bgLongest : 1; // natural res, capped for very large images
        filteredSrc = obj.toDataURL({ multiplier: _bgMult });
        obj.set({ scaleX: _bgPrevSX, scaleY: _bgPrevSY, angle: _bgPrevAng });
        obj.setCoords();
      } catch (e) {
        filteredSrc = obj.getSrc ? obj.getSrc() : (obj._element && obj._element.src ? obj._element.src : '');
      }
      cvs.remove(obj);
      cvs.discardActiveObject();
      fabric.Image.fromURL(filteredSrc, function(bgImg) {
        cvs.setBackgroundImage(bgImg, function() {
          _applyBgImagePosition(cvs, window._bgImagePosition || 'cover');
          cvs.renderAll();
          snap();
          if (typeof refreshStructure === 'function') refreshStructure();
          if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
          if (typeof showToast === 'function') showToast('Background image set');
        });
      }, { crossOrigin: 'anonymous' });
    }
  } else if (action === 'downloadObj') {
    // Render the object to its own PNG. Must work for ANY origin: center-origin groups
    // (text-style presets, font pairings) were getting clipped because the old code
    // assumed a top-left origin and scaled the clone around its center, overflowing the
    // temp canvas. Instead we shift the clone so its bounding box sits at (0,0) and
    // upscale through toDataURL's multiplier rather than scaling the object itself.
    var mult = 2;
    var bound = obj.getBoundingRect(true, true);   // base-coord AABB (ignores zoom/pan)
    var w = Math.max(1, Math.ceil(bound.width));
    var h = Math.max(1, Math.ceil(bound.height));
    obj.clone(function (cl) {
      cl.set({ left: (cl.left || 0) - bound.left, top: (cl.top || 0) - bound.top });
      cl.setCoords();
      var tmpCanvas = document.createElement('canvas');
      var tmpFabric = new fabric.StaticCanvas(tmpCanvas, { width: w, height: h, enableRetinaScaling: false });
      tmpFabric.add(cl);
      tmpFabric.renderAll();
      var dataUrl = tmpFabric.toDataURL({ format: 'png', multiplier: mult });
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = (obj._customName || obj._wbName || obj.type || 'element') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      tmpFabric.dispose();
      if (typeof showToast === 'function') showToast('Downloaded as PNG');
    });
  } else if (action === 'clipInto') {
    clipImageIntoShape();
  } else if (action === 'mergeIntoCell') {
    _mergeImageIntoCell();
  } else if (action === 'frameRmbg') {
    if (typeof removeImageBgWithFrame === 'function') removeImageBgWithFrame();
  } else if (action === 'mergeFrame') {
    _mergeFrameCtx();
  } else if (action === 'lockFrame') {
    _mergeFrameCtx();
  } else if (action === 'unclip') {
    unclipImage();
  } else if (action === 'detachFrame') {
    if (typeof detachFrameFromImage === 'function') detachFrameFromImage();
  } else if (action === 'convertToFrame') {
    if (typeof convertObjectToFrame === 'function') convertObjectToFrame(obj);
  } else if (action === 'convertToShape') {
    if (obj && obj._isFrame && typeof convertFrameToShape === 'function') {
      convertFrameToShape();
      _promptSaveConvertedShape();
    } else if (typeof convertObjectToShapeAsset === 'function') {
      convertObjectToShapeAsset(obj);
      _promptSaveConvertedShape();
    }
  } else if (action === 'saveToMyShapes') {
    if (typeof saveToMyShapes === 'function') saveToMyShapes();
  }
}

// ── Lock Frame to Image (context menu) ───────────────────────
function _mergeFrameCtx() {
  var cvs = getActiveCanvas();
  var activeObj = cvs.getActiveObject();
  if (!activeObj || activeObj.type !== 'activeSelection') return;
  var sel = activeObj.getObjects();
  var imgObj = sel.find(function (o) { return o.type === 'image' && !o.isQR && !o._isFrame; });
  var frameObj = sel.find(function (o) { return o._isFrame && !o._isClippedImage && !o._isClipFrame; });
  if (!imgObj || !frameObj) return;
  cvs.discardActiveObject();
  if (typeof lockFrameToImage === 'function') lockFrameToImage(frameObj, imgObj);
}

// ── Merge Image into Grid Cell (context menu) ───────────────
function _mergeImageIntoCell() {
  var cvs = getActiveCanvas();
  var activeObj = cvs.getActiveObject();
  if (!activeObj || activeObj.type !== 'activeSelection') return;
  var sel = activeObj.getObjects();
  var imgObj = sel.find(function (o) { return o.type === 'image' && !o.isQR && !o._isGridCellImage; });
  var gridObj = sel.find(function (o) { return !!o._isGridLayout; });
  if (!imgObj || !gridObj) return;

  // Find which cell the image center overlaps
  var imgCenter = imgObj.getCenterPoint();
  var cell = typeof _glGetCellAt === 'function' ? _glGetCellAt(gridObj, imgCenter.x, imgCenter.y) : null;
  // Fallback: use first empty cell or (0,0)
  if (!cell && gridObj._cells) {
    for (var ci = 0; ci < gridObj._cells.length; ci++) {
      if (!gridObj._cells[ci].imgSrc) { cell = gridObj._cells[ci]; break; }
    }
    if (!cell) cell = gridObj._cells[0];
  }
  if (!cell) return;

  // Get image source
  var src = imgObj.getSrc ? imgObj.getSrc() : (imgObj._element && imgObj._element.src ? imgObj._element.src : '');
  if (!src) return;

  cvs.discardActiveObject();
  cvs.remove(imgObj);
  if (typeof _glPlaceImageInCell === 'function') _glPlaceImageInCell(gridObj, cell, src);
  if (typeof showToast === 'function') showToast('Image merged into Cell (' + (cell.row + 1) + ',' + (cell.col + 1) + ')');
}

// ── Clip Image Into Shape ────────────────────────────────────
function clipImageIntoShape() {
  var cvs = getActiveCanvas();
  var activeObj = cvs.getActiveObject();
  if (!activeObj || activeObj.type !== 'activeSelection') return;

  var sel = activeObj.getObjects();
  var imgObj = null;
  var shapeObj = null;

  for (var i = 0; i < sel.length; i++) {
    if (sel[i].type === 'image' && !sel[i].isQR && !sel[i]._isMyShapeAsset && !sel[i]._isBrushShape && !imgObj) {
      imgObj = sel[i];
    } else if (!shapeObj && _isClippableShape(sel[i])) {
      shapeObj = sel[i];
    }
  }

  if (!imgObj || !shapeObj) return;

  cvs.discardActiveObject();

  // Get shape bounds for positioning
  var shapeBound = shapeObj.getBoundingRect(true);
  var shapeW = shapeBound.width;
  var shapeH = shapeBound.height;
  // Captured BEFORE the shape is removed. The clip window can only ever sit on the image's
  // CENTRE (see below), so this is what the image has to be anchored to.
  var shapeCentre = shapeObj.getCenterPoint();

  // Everything needed to hand the image back untouched on Release Clip.
  var preImg = {
    cropX: imgObj.cropX || 0, cropY: imgObj.cropY || 0,
    width: imgObj.width, height: imgObj.height,
    scaleX: imgObj.scaleX, scaleY: imgObj.scaleY,
    left: imgObj.left, top: imgObj.top,
    originX: imgObj.originX || 'left', originY: imgObj.originY || 'top',
    angle: imgObj.angle || 0
  };

  shapeObj.clone(function (clipShape) {
    // Fit inside the SHAPE's box, then trim to its silhouette. Order matters: the silhouette
    // divides by the image's scale, which the fit has just set.
    _ccFitImageInBox(imgObj, 'cover', shapeW, shapeH, shapeObj);
    _ccApplySilhouette(clipShape, shapeObj.scaleX || 1, shapeObj.scaleY || 1, imgObj);

    imgObj.set({ clipPath: clipShape, originX: 'center', originY: 'center' });
    imgObj.setPositionByOrigin(shapeCentre, 'center', 'center');
    imgObj.setCoords();

    // Build the frame: the shape STAYS, as child 0, keeping its own fill (the background) and
    // stroke. Both objects leave the canvas and re-enter as one group, which is what fabric's
    // Group constructor expects (it re-parents them to group-relative coords).
    cvs.remove(shapeObj);
    cvs.remove(imgObj);
    var frame = new fabric.Group([shapeObj, imgObj], {
      _isClipFrame: true,
      _clipPosition: 'cover',
      _clipShapeW: shapeW,
      _clipShapeH: shapeH,
      _clipPreImg: preImg
    });
    cvs.add(frame);
    cvs.setActiveObject(frame);
    cvs.renderAll();
    snap();
    // Re-attach video element — destroy and re-create so it works with new clip
    if (imgObj._isVideoMedia && imgObj._videoSrc) {
      if (imgObj._videoElement) _ccDestroyVideoElement(imgObj);
      _ccAttachVideoElement(imgObj, imgObj._videoSrc);
    }
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof showToast === 'function') showToast('Image clipped into shape');
  });
}

/* The image child of a clip frame. Everything that edits the frame goes through these two so
   no caller has to know the child order. */
function _ccFrameImage(frame) {
  if (!frame || !frame._isClipFrame || !frame._objects) return null;
  for (var i = 0; i < frame._objects.length; i++) {
    if (frame._objects[i].type === 'image') return frame._objects[i];
  }
  return null;
}

function _ccFrameShape(frame) {
  if (!frame || !frame._isClipFrame || !frame._objects) return null;
  for (var i = 0; i < frame._objects.length; i++) {
    if (frame._objects[i].type !== 'image') return frame._objects[i];
  }
  return null;
}

/* ══════════ CLIP FRAME MODEL ══════════
   A clip result is a GROUP that IS the frame: [shape, image]. The SHAPE stays a real object,
   so it is visible, its own fill IS the background colour, and Release Clip can hand it back.
   The old model deleted the shape (cvs.remove(shapeObj)) and made the clip a property of the
   image, which is why the shape vanished, could not be released, could not be coloured, and
   why "contain" had no box to be contained by.

   Fit the image INSIDE a boxW x boxH box (canvas units) so it NEVER exceeds it. cover crops the
   SOURCE with fabric's native cropX/cropY/width/height (the same mechanism the crop tool uses)
   instead of scaling the image up and clipping the overflow. That is load-bearing: a fabric
   group inflates to its biggest child (measured: a 300px image in a 150px shape gave
   group.width 300, and forcing the width back reads 162 and breaks the render). Keeping the
   image inside the box is what keeps the GROUP's box equal to the SHAPE's box. */
/* contain has to leave the image FULLY VISIBLE, and in a non-rectangular shape that means
   inside the SILHOUETTE, not inside its bounding box. Measured: a 2:1 image contained in a
   151px circle's box is drawn 151x76, whose corners sit 84px from the centre against a 76px
   radius, so the clip ate all four (they read rgba(0,0,0,0)). That is the owner's "contain
   dememe rağmen hala shape kesiyor".

   Rasterise the silhouette once and binary-search the largest centred rect of the image's
   aspect that stays inside it. General on purpose: a circle formula would not help a star, a
   triangle, a path or text. Exact for convex shapes; a safe under-estimate for concave ones.
   For a rectangle the mask is full, so the search returns 1 and nothing changes. */
function _ccInscribeFactor(shapeObj, rectW, rectH) {
  if (!shapeObj || !rectW || !rectH) return 1;
  var el = null;
  var oldFill = shapeObj.fill, oldStroke = shapeObj.stroke, oldSW = shapeObj.strokeWidth;
  var oldShadow = shapeObj.shadow, oldOpacity = shapeObj.opacity;
  try {
    // Render the silhouette solid: the shape's real fill may be transparent (no background set).
    shapeObj.set({ fill: '#000', stroke: null, strokeWidth: 0, shadow: null, opacity: 1 });
    shapeObj.dirty = true;
    var bound = shapeObj.getBoundingRect(true);
    var mult = 160 / Math.max(bound.width || 1, bound.height || 1);
    el = shapeObj.toCanvasElement({ multiplier: mult });
  } catch (e) {
    el = null;
  }
  shapeObj.set({ fill: oldFill, stroke: oldStroke, strokeWidth: oldSW, shadow: oldShadow, opacity: oldOpacity });
  shapeObj.dirty = true;
  if (!el || !el.width || !el.height) return 1;

  var mw = el.width, mh = el.height, data;
  try { data = el.getContext('2d').getImageData(0, 0, mw, mh).data; } catch (e) { return 1; }

  function solid(u, v) {                    // u,v in 0..1 across the silhouette's box
    var px = Math.round(u * (mw - 1)), py = Math.round(v * (mh - 1));
    if (px < 0 || py < 0 || px >= mw || py >= mh) return false;
    return data[(py * mw + px) * 4 + 3] > 128;
  }

  // Does a centred rect of rectW*s x rectH*s stay inside? Sampling the PERIMETER (not just the
  // corners) so a concave notch cutting an edge is caught too.
  var boxW = (mw / mult) || 1, boxH = (mh / mult) || 1;
  function fits(s) {
    var hw = (rectW * s) / 2 / boxW, hh = (rectH * s) / 2 / boxH;   // half-extents in 0..1 units
    var N = 24;
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var xs = -hw + 2 * hw * t, ys = -hh + 2 * hh * t;
      if (!solid(0.5 + xs, 0.5 - hh)) return false;   // top edge
      if (!solid(0.5 + xs, 0.5 + hh)) return false;   // bottom edge
      if (!solid(0.5 - hw, 0.5 + ys)) return false;   // left edge
      if (!solid(0.5 + hw, 0.5 + ys)) return false;   // right edge
    }
    return true;
  }

  if (fits(1)) return 1;                    // rectangle-ish shape: nothing to shrink
  var lo = 0, hi = 1;
  for (var it = 0; it < 20; it++) {
    var mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo > 0.01 ? lo : 1;
}

function _ccFitImageInBox(imgObj, position, boxW, boxH, shapeObj) {
  var el = imgObj._originalElement || imgObj._element;
  if (!el) return;
  var iw = el.naturalWidth || el.videoWidth || el.width;
  var ih = el.naturalHeight || el.videoHeight || el.height;
  if (!iw || !ih || !boxW || !boxH) return;

  if (position === 'cover') {
    // Crop the source to the box's aspect, then scale that region onto the box exactly.
    var boxAspect = boxW / boxH, srcAspect = iw / ih;
    var cw, ch;
    if (srcAspect > boxAspect) { ch = ih; cw = ih * boxAspect; }
    else { cw = iw; ch = iw / boxAspect; }
    imgObj.set({
      cropX: (iw - cw) / 2, cropY: (ih - ch) / 2,
      width: cw, height: ch,
      scaleX: boxW / cw, scaleY: boxH / ch
    });
  } else {
    // contain and stretch show the WHOLE source, so any crop is cleared first.
    imgObj.set({ cropX: 0, cropY: 0, width: iw, height: ih });
    if (position === 'stretch') {
      imgObj.set({ scaleX: boxW / iw, scaleY: boxH / ih });
    } else {
      var s = Math.min(boxW / iw, boxH / ih);   // contain: fits inside the BOX...
      // ...then inside the SHAPE. For a rectangle this is a no-op; for a circle/star/path it is
      // the difference between "fully visible" and "the clip eats the corners".
      s *= _ccInscribeFactor(shapeObj, iw * s, ih * s);
      imgObj.set({ scaleX: s, scaleY: s });
    }
  }
  imgObj.setCoords();
}

/* The clipPath renders in the image's UNSCALED local space, so the silhouette is divided back
   out by the image's scale to land at its true on-screen size. trueScale is the SHAPE's own
   scale, passed in rather than read off the clipShape, because this runs again on every fit
   change and reading its own (already divided) scale would compound. */
function _ccApplySilhouette(clipShape, trueScaleX, trueScaleY, imgObj) {
  clipShape.set({
    left: 0, top: 0,
    originX: 'center', originY: 'center',
    absolutePositioned: false,
    stroke: null, strokeWidth: 0
  });
  clipShape.scaleX = trueScaleX / (imgObj.scaleX || 1);
  clipShape.scaleY = trueScaleY / (imgObj.scaleY || 1);
  return clipShape;
}

/* Change a frame's fit. The image is refitted inside the SHAPE's box and stays centred in the
   group, so the group's own width/height never move: the frame keeps the shape's size whatever
   the fit is, which is the whole point of the model. */
function _ccSetFrameFit(frame, position) {
  var im = _ccFrameImage(frame), sh = _ccFrameShape(frame);
  if (!im || !sh) return false;
  _ccFitImageInBox(im, position, frame._clipShapeW, frame._clipShapeH, sh);
  if (im.clipPath) _ccApplySilhouette(im.clipPath, sh.scaleX || 1, sh.scaleY || 1, im);
  im.set({ left: 0, top: 0, originX: 'center', originY: 'center' });
  im.setCoords();
  frame._clipPosition = position;
  frame.dirty = true;
  im.dirty = true;
  return true;
}

/* The frame's background is the SHAPE's own fill, so it covers the whole shape under the image
   at any fit. The old model had no shape and could only paint the IMAGE's box, which at contain
   left the shape's bands empty (measured: rgba(0,0,0,0) above the image). */
function _ccSetFrameBg(frame, color) {
  var sh = _ccFrameShape(frame);
  if (!sh) return false;
  sh.set('fill', color || '');
  sh.dirty = true;
  frame.dirty = true;
  return true;
}

function _applyClipImagePosition(imgObj, position, clipW, clipH) {
  if (!imgObj || !imgObj._element) return;
  // Video elements don't have naturalWidth — use videoWidth or width attribute
  var el = imgObj._element;
  var iw = el.naturalWidth || el.videoWidth || el.width || imgObj.width;
  var ih = el.naturalHeight || el.videoHeight || el.height || imgObj.height;

  var oldSX = imgObj.scaleX || 1;
  var oldSY = imgObj.scaleY || 1;

  if (position === 'cover') {
    var s = Math.max(clipW / iw, clipH / ih);
    imgObj.set({ scaleX: s, scaleY: s });
  } else if (position === 'contain') {
    var s2 = Math.min(clipW / iw, clipH / ih);
    imgObj.set({ scaleX: s2, scaleY: s2 });
  } else if (position === 'stretch') {
    imgObj.set({ scaleX: clipW / iw, scaleY: clipH / ih });
  } else if (position === 'fill') {
    imgObj.set({ scaleX: clipW / iw, scaleY: clipH / ih });
  }

  // When a clipped image changes fit mode, adjust clipPath scale proportionally
  if (imgObj.clipPath && imgObj._isClippedImage) {
    imgObj.clipPath.scaleX = (imgObj.clipPath.scaleX || 1) * oldSX / (imgObj.scaleX || 1);
    imgObj.clipPath.scaleY = (imgObj.clipPath.scaleY || 1) * oldSY / (imgObj.scaleY || 1);
  }

  imgObj._clipPosition = position;
}

function unclipImage() {
  var cvs = getActiveCanvas();
  var obj = cvs.getActiveObject();

  // NEW model: hand the shape and the image back as two real objects. The shape is child 0 and
  // has been alive the whole time, so there is nothing to reconstruct; the image is restored to
  // the crop/scale/origin it had before the clip, captured in _clipPreImg at clip time.
  if (obj && obj._isClipFrame) {
    var sh = _ccFrameShape(obj), im = _ccFrameImage(obj);
    if (!sh || !im) return;
    var pre = obj._clipPreImg;
    cvs.remove(obj);
    obj._restoreObjectsState();          // children back to absolute canvas coords
    im.set({ clipPath: null });
    if (pre) {
      im.set({
        cropX: pre.cropX, cropY: pre.cropY, width: pre.width, height: pre.height,
        scaleX: pre.scaleX, scaleY: pre.scaleY, angle: pre.angle,
        originX: pre.originX, originY: pre.originY, left: pre.left, top: pre.top
      });
    }
    im.dirty = true;
    sh.set({ selectable: true, evented: true });
    im.set({ selectable: true, evented: true });
    im.setCoords(); sh.setCoords();
    cvs.add(sh); cvs.add(im);
    cvs.setActiveObject(im);
    cvs.renderAll();
    snap();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof showToast === 'function') showToast('Clip released');
    return;
  }

  // LEGACY model: images clipped before the frame rebuild. There is no shape to give back
  // (the old code deleted it), so this keeps doing exactly what it always did. Saved projects
  // depend on it.
  if (!obj || !obj._isClippedImage) return;

  obj.set({
    clipPath: null,
    _isClippedImage: false,
    _isFrame: false,
    _frameId: null,
    _clipPosition: null,
    _clipShapeW: null,
    _clipShapeH: null,
    _boundImageUid: null,
    _boundLocalX: null,
    _boundLocalY: null,
  });
  cvs.renderAll();
  snap();
  // Re-attach video element — destroy and re-create without clip constraints
  if (obj._isVideoMedia && obj._videoSrc) {
    if (obj._videoElement) _ccDestroyVideoElement(obj);
    _ccAttachVideoElement(obj, obj._videoSrc);
  }
  if (typeof refreshStructure === 'function') refreshStructure();
  if (typeof showToast === 'function') showToast('Frame lock removed');
}

function ftAction(action) { ctxAction(action); }

