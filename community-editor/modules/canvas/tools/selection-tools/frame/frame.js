/* Module: canvas/tools/selection-tools/frame — Frame creation + image↔frame merge/detach/lock + object↔frame convert.
   Part of the selection-tools group (decomposed from the 1542-line IIFE). Functions hang off the
   shared namespace VST (window.__ccSelectionTools, created by the parent); cross-module refs resolve
   through VST at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VST = window.__ccSelectionTools;
  if (!VST) return;

  VST._createFrameFromPoints = function (pts, sourceImg) {
    if (!pts || pts.length < 3) return;
    var cvs = VST._getCvs();
    var baseLoop = VST._normalizeContourPoints(pts);

    VST._frameCounter++;
    var frameId = 'frame-' + VST._frameCounter + '-' + Date.now();

    var pathStr = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (var i = 1; i < pts.length; i++) {
      pathStr += ' L ' + pts[i].x + ' ' + pts[i].y;
    }
    pathStr += ' Z';

    var framePath = new fabric.Path(pathStr, {
      fill: 'rgba(242, 255, 88, 0.06)',
      stroke: '#f2ff58',
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      fillRule: 'evenodd',
      selectable: true,
      evented: true,
      objectCaching: false,
      _isFrame: true,
      _frameId: frameId,
      _frameContours: [{ points: VST._cloneContourPoints(baseLoop), isHole: false, sourceType: sourceImg ? 'image-trace' : 'shape-vector' }],
      _frameSourceType: sourceImg ? 'image-trace' : 'shape-vector'
    });

    // Bind to source image if available
    if (sourceImg) {
      VST._ensureUid(sourceImg);
      framePath._boundImageUid = sourceImg._uid;
    }

    cvs.add(framePath);
    if (sourceImg) VST._storeFrameOffset(framePath, sourceImg);
    cvs.setActiveObject(framePath);
    cvs.renderAll();

    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof showToast === 'function') showToast('Frame created — select frame + image, right-click to merge');

    VST._showFrameBar();
  };

  VST.mergeImageIntoFrame = function (frameObj, imgObj) {
    var cvs = VST._getCvs();
    if (!frameObj || !imgObj) return;

    var frameBound = frameObj.getBoundingRect(true);
    var frameW = frameBound.width;
    var frameH = frameBound.height;
    var frameCentre = frameObj.getCenterPoint();

    // Everything needed to hand the image back on Release Clip.
    var preImg = {
      cropX: imgObj.cropX || 0, cropY: imgObj.cropY || 0,
      width: imgObj.width, height: imgObj.height,
      scaleX: imgObj.scaleX, scaleY: imgObj.scaleY,
      left: imgObj.left, top: imgObj.top,
      originX: imgObj.originX || 'left', originY: imgObj.originY || 'top',
      angle: imgObj.angle || 0
    };

    frameObj.clone(function (clipShape) {
      // Same frame model as "Clip image into shape" (core/context-menu.js): the FRAME stays as
      // child 0 so it can be seen, coloured and released. This path used to end in
      // cvs.remove(frameObj) too, which is the identical defect the owner reported on the other
      // path: the shape vanished and could never come back.
      _ccFitImageInBox(imgObj, 'cover', frameW, frameH, frameObj);
      _ccApplySilhouette(clipShape, frameObj.scaleX || 1, frameObj.scaleY || 1, imgObj);

      imgObj.set({ clipPath: clipShape, originX: 'center', originY: 'center' });
      imgObj.setPositionByOrigin(frameCentre, 'center', 'center');
      imgObj.setCoords();

      // The frame's dashed volt outline is an EDITING MARKER, not design intent, so it is
      // dropped once the image lives in it. The frame becomes a plain background surface whose
      // fill the Clip panel's Background control now owns.
      frameObj.set({ stroke: null, strokeWidth: 0, strokeDashArray: null, fill: '' });

      cvs.remove(frameObj);
      cvs.remove(imgObj);
      var frame = new fabric.Group([frameObj, imgObj], {
        _isClipFrame: true,
        _clipPosition: 'cover',
        _clipShapeW: frameW,
        _clipShapeH: frameH,
        _clipPreImg: preImg,
        _isFrame: true,
        _frameId: frameObj._frameId
      });

      // Transfer binding if frame was bound to a source image
      if (frameObj._boundImageUid) {
        VST._ensureUid(frame);
        frame._boundImageUid = frameObj._boundImageUid;
        frame._boundLocalX = frameObj._boundLocalX;
        frame._boundLocalY = frameObj._boundLocalY;
      }

      cvs.add(frame);
      cvs.setActiveObject(frame);
      cvs.renderAll();

      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
      if (typeof showToast === 'function') showToast('Frame locked to image');
    });
  };

  VST.detachFrameFromImage = function () {
    var cvs = VST._getCvs();
    var obj = cvs.getActiveObject();
    if (!obj || !obj._isFrame || !obj._boundImageUid) return;

    delete obj._boundImageUid;
    delete obj._boundLocalX;
    delete obj._boundLocalY;

    cvs.renderAll();
    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof showToast === 'function') showToast('Frame detached from image');
  };

  VST.lockFrameToImage = function (frameObj, imgObj) {
    if (!frameObj || !imgObj || !frameObj._isFrame) return;
    var cvs = VST._getCvs();
    VST._ensureUid(imgObj);
    frameObj._boundImageUid = imgObj._uid;
    VST._storeFrameOffset(frameObj, imgObj);
    cvs.renderAll();
    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof showToast === 'function') showToast('Frame locked to image');
  };

  VST._showFrameBar = function (isClipped) {
    if (VST._frameBar) {
      VST._frameBar.style.display = 'flex';
      // Update button visibility based on type
      var editBtn = VST._frameBar.querySelector('[data-fb="edit"]');
      var shapeBtn = VST._frameBar.querySelector('[data-fb="shape"]');
      var removeBtn = VST._frameBar.querySelector('[data-fb="remove"]');
      var perspBtn = VST._frameBar.querySelector('[data-fb="persp"]');
      if (editBtn) editBtn.style.display = isClipped ? 'none' : '';
      if (shapeBtn) shapeBtn.style.display = isClipped ? 'none' : '';
      if (removeBtn) removeBtn.style.display = isClipped ? 'none' : '';
      if (perspBtn) perspBtn.style.display = '';
      return;
    }
    VST._frameBar = document.createElement('div');
    VST._frameBar.className = 'selection-remove-bar';
    VST._frameBar.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>' +
      '<span>Frame active</span>' +
      '<button data-fb="edit" onclick="enterPolygonEdit()"' + (isClipped ? ' style="display:none"' : '') + '>Edit Vertices</button>' +
      '<button data-fb="shape" onclick="VST.convertFrameToShape()"' + (isClipped ? ' style="display:none"' : '') + '>Convert to Shape</button>' +
      '<button data-fb="remove" onclick="VST.removeActiveFrame()"' + (isClipped ? ' style="display:none"' : '') + '>Remove Frame</button>' +
      '<button data-fb="persp" onclick="enterPerspectiveMode()">Perspective Fit</button>';
    document.body.appendChild(VST._frameBar);
  };

  VST._hideFrameBar = function () {
    if (VST._frameBar) VST._frameBar.style.display = 'none';
  };

  VST.removeActiveFrame = function () {
    var cvs = VST._getCvs();
    var obj = cvs.getActiveObject();
    if (obj && obj._isFrame && !obj._isClippedImage) {
      cvs.remove(obj);
      cvs.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
    }
    VST._hideFrameBar();
  };

  VST._replaceObjectWithFrame = function (sourceObj, frameObj) {
    var cvs = VST._getCvs();
    if (!cvs || !sourceObj || !frameObj) return;
    cvs.add(frameObj);
    cvs.remove(sourceObj);
    frameObj.setCoords();
    cvs.setActiveObject(frameObj);
    cvs.renderAll();
    VST._showFrameBar(false);
    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
    if (typeof syncRightPanel === 'function') syncRightPanel();
    if (typeof showToast === 'function') showToast('Frame created');
  };

  VST.isFrameConvertibleObject = function (obj) {
    return !!(
      obj &&
      !obj._isFrame &&
      !obj._isClippedImage &&
      obj.type !== 'activeSelection' &&
      (
        obj.type === 'image' ||
        obj.type === 'path' ||
        obj.type === 'polygon' ||
        obj.type === 'rect' ||
        obj.type === 'circle' ||
        obj.type === 'ellipse' ||
        obj.type === 'triangle' ||
        obj.type === 'group' ||
        obj.type === 'text' ||
        obj.type === 'i-text' ||
        obj.type === 'textbox' ||
        obj._isBrushShape ||
        obj._isMyShapeAsset
      )
    );
  };

  VST.convertObjectToFrame = function (targetObj) {
    var cvs = VST._getCvs();
    var obj = targetObj || (cvs && cvs.getActiveObject ? cvs.getActiveObject() : null);
    if (!window.isFrameConvertibleObject(obj)) return;

    var sourceType = (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox' || obj._isMyShapeAsset)
      ? 'text-trace'
      : (obj.type === 'image' ? 'image-trace' : 'shape-vector');

    function rasterFallback() {
      VST._rasterContoursFromObject(obj, function (contours) {
        var framePath = VST._buildFramePathFromContours(contours, obj, sourceType);
        if (!framePath) {
          if (typeof showToast === 'function') showToast('Could not build frame from object');
          return;
        }
        VST._replaceObjectWithFrame(obj, framePath);
      });
    }

    // TEXT: try the REAL font glyph outline first (opentype.js) — few clean anchors + bezier handles,
    // zero shift. Any miss (font buffer unavailable, styled/decorated text, parse error) falls back to
    // the raster trace below, byte-for-byte the previous behavior.
    if (VST._buildTextVectorFrame && (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox')) {
      VST._buildTextVectorFrame(obj, function (vecFrame) {
        if (vecFrame) { VST._replaceObjectWithFrame(obj, vecFrame); return; }
        rasterFallback();
      });
      return;
    }

    rasterFallback();
  };

  VST.convertFrameToShape = function () {
    var cvs = VST._getCvs();
    var obj = cvs.getActiveObject();
    if (!obj || !obj._isFrame || obj._isClippedImage) return;

    /* Remove frame-specific props, make it a solid shape */
    obj.set({
      fill: 'rgba(242, 255, 88,0.25)',
      stroke: '#f2ff58',
      strokeWidth: 1.5,
      strokeDashArray: null,
      _isBrushShape: true
    });
    delete obj._isFrame;
    delete obj._frameId;
    delete obj._frameContours;
    delete obj._frameSourceType;
    delete obj._boundImageUid;
    delete obj._boundLocalX;
    delete obj._boundLocalY;

    obj.setCoords();
    cvs.setActiveObject(obj);
    cvs.renderAll();
    VST._hideFrameBar();

    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof showToast === 'function') showToast('Frame converted to shape');
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'frame', parent: 'canvas.tools.selection-tools', title: 'selection-tools: frame', mount: function () {}, unmount: function () {} });
  }
})();
