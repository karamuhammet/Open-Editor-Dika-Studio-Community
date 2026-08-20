/* ══════════════════════════════════════════════════════════════
   dika studio – Non-destructive Image Crop Tool
   Shows uncropped area as dimmed overlay, floating toolbar with
   aspect ratio, rotation. Stores original data for re-editing.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── State ── */
  var _active = false;
  var _imgObj = null;         // the Fabric image being cropped
  var _cropRect = null;       // Fabric rect overlay (the crop area)
  var _dimRects = [];         // 4 dark overlays around crop rect
  var _originalData = null;   // stored for re-crop
  var _aspectRatio = 0;       // 0 = free
  var _backdropEl = null;
  var _toolbarEl = null;

  /* THE crop region, and the only source of truth for geometry: {x,y,w,h} in the image's own
     SOURCE PIXELS. Everything on screen (the crop rect, the 4 dim strips, the grid) is derived
     from it, and a user drag is read back into it.

     Why: the tool used to do all its maths as `obj.left + w * obj.scaleX`, which silently
     assumes originX/originY are left/top AND angle is 0. Both are false in this app: images
     added by the AI panel and the PDF/export paths are centre-origin (measured: the crop box
     opened 106px right and 56px down), and any image the user rotates gets an axis-aligned box
     against a rotated image (measured at 30 degrees: true box 240x203, box drawn 200x100 at
     angle 0), which also throws the dim strips on top of the image itself.

     Source pixels are the frame fabric's own cropX/cropY/width/height already live in, so
     apply becomes a straight assignment and the constrain maths becomes a plain 0..width
     clamp. Position and rotation are reintroduced only at draw time, through the image's own
     transform matrix, so the overlay lines up for ANY origin, angle, scale or flip. */
  var _crop = { x: 0, y: 0, w: 0, h: 0 };

  /* Local space = the image's unscaled source pixels, measured from the image CENTRE (that is
     the frame fabric's transform matrix expects). Verified against fabric's own aCoords on a
     rotated, non-uniformly scaled, centre-origin image before this was written. */
  function _localToCanvas(lx, ly) {
    return fabric.util.transformPoint(new fabric.Point(lx, ly), _imgObj.calcTransformMatrix());
  }

  function _canvasToLocal(pt) {
    return fabric.util.transformPoint(pt, fabric.util.invertTransform(_imgObj.calcTransformMatrix()));
  }

  // Canvas-space centre of a source-pixel rect. Reads _imgObj.width/height, so call it BEFORE
  // mutating them (that ordering is load-bearing in exitCropMode).
  function _srcRectCentre(x, y, w, h) {
    return _localToCanvas(x + w / 2 - _imgObj.width / 2, y + h / 2 - _imgObj.height / 2);
  }

  // Give an overlay object the image's exact placement for a source-pixel rect.
  function _placeOverSrcRect(o, x, y, w, h, extra) {
    var c = _srcRectCentre(x, y, w, h);
    var props = {
      originX: 'center', originY: 'center',
      left: c.x, top: c.y,
      width: Math.max(0, w), height: Math.max(0, h),
      scaleX: _imgObj.scaleX, scaleY: _imgObj.scaleY,
      angle: _imgObj.angle,
      flipX: _imgObj.flipX, flipY: _imgObj.flipY
    };
    if (extra) for (var k in extra) props[k] = extra[k];
    o.set(props);
    o.setCoords();
  }

  // Keep the crop region inside the source. Trivial in local space; the old canvas-space
  // version of this could not be made correct for a rotated image at all.
  function _constrainCropState() {
    if (!_imgObj) return;
    var W = _imgObj.width, H = _imgObj.height;
    _crop.w = Math.max(1, Math.min(_crop.w, W));
    _crop.h = Math.max(1, Math.min(_crop.h, H));
    _crop.x = Math.max(0, Math.min(_crop.x, W - _crop.w));
    _crop.y = Math.max(0, Math.min(_crop.y, H - _crop.h));
  }

  // Draw the crop rect from _crop.
  function _syncCropRect() {
    if (!_cropRect || !_imgObj) return;
    _placeOverSrcRect(_cropRect, _crop.x, _crop.y, _crop.w, _crop.h, { scaleX: _imgObj.scaleX, scaleY: _imgObj.scaleY });
  }

  // Read a user drag/scale of the crop rect back into _crop. The rect carries the image's
  // angle, so its size divides straight back out by the image's scale.
  function _readCropRect() {
    if (!_cropRect || !_imgObj) return;
    var ctr = _cropRect.getCenterPoint();
    var l = _canvasToLocal(ctr);
    var w = (_cropRect.width * _cropRect.scaleX) / (_imgObj.scaleX || 1);
    var h = (_cropRect.height * _cropRect.scaleY) / (_imgObj.scaleY || 1);
    _crop.w = Math.abs(w);
    _crop.h = Math.abs(h);
    _crop.x = l.x + _imgObj.width / 2 - _crop.w / 2;
    _crop.y = l.y + _imgObj.height / 2 - _crop.h / 2;
  }

  // One redraw pass: clamp the state, then re-derive every overlay from it.
  function _refreshCropOverlay() {
    _constrainCropState();
    _syncCropRect();
    _drawDimOverlay();
  }

  var _lockedObjs = [];  // track objects we locked for crop mode

  /* ── Aspect ratio presets ── */
  var RATIOS = [
    { label: 'Free', value: 0 },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '3:4', value: 3 / 4 },
    { label: '16:9', value: 16 / 9 },
    { label: '9:16', value: 9 / 16 },
    { label: '3:2', value: 3 / 2 },
    { label: '2:3', value: 2 / 3 }
  ];

  /* ══════════════════════════════════════════════════════════════
     ENTER CROP MODE
     ══════════════════════════════════════════════════════════════ */
  window.enterCropMode = function (obj) {
    if (_active) exitCropMode(false);
    var cvs = _getCvs();
    if (!obj) obj = cvs.getActiveObject();
    if (!obj || obj.type !== 'image' || obj.isQR || obj._isChart || obj._isEffect) {
      if (typeof showToast === 'function') showToast('Select an image to crop');
      return;
    }

    _active = true;
    _imgObj = obj;
    _aspectRatio = 0;

    // Save current state for cancel (always fresh on each entry)
    _originalData = {
      cropX: obj.cropX || 0,
      cropY: obj.cropY || 0,
      width: obj.width,
      height: obj.height,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      left: obj.left,
      top: obj.top,
      // Captured so Cancel really does restore "the state from before crop mode": the in-crop
      // Rotate button changes the angle, and without this Cancel silently kept the rotation.
      angle: (obj.angle || 0),
      opacity: (obj.opacity != null ? obj.opacity : 1)   // restore on exit (see below)
    };

    // Full source dimensions
    // For bg-removed images, the current width IS the full source (no uncropped area)
    var el = obj._element || obj._originalElement;
    var fullW, fullH;
    if (obj._hasBgRemoved && !obj.cropX && !obj.cropY) {
      fullW = obj.width;
      fullH = obj.height;
    } else {
      fullW = (el && (el.naturalWidth || el.videoWidth || el.width)) || obj.width;
      fullH = (el && (el.naturalHeight || el.videoHeight || el.height)) || obj.height;
    }

    // Current crop position within source
    var prevCropX = obj.cropX || 0;
    var prevCropY = obj.cropY || 0;
    var prevW = obj.width;
    var prevH = obj.height;
    var sX = obj.scaleX;
    var sY = obj.scaleY;

    // Expand to the full source WITHOUT moving the visible pixels. The old code did
    // left -= cropX*scaleX, which only holds for an unrotated, left/top-origin image. Instead
    // work out where the full source's centre has to land, in the image's own local space,
    // and let fabric place it: that survives any origin, angle, scale or flip.
    // Must be computed BEFORE width/height change, since local space is defined by them.
    var _fullCentre = _localToCanvas(
      (fullW / 2) - (prevCropX + prevW / 2),
      (fullH / 2) - (prevCropY + prevH / 2)
    );

    obj.set({
      cropX: 0, cropY: 0,
      width: fullW, height: fullH,
      scaleX: sX,
      scaleY: sY,
      // Keep the cropped image at FULL brightness - it is the focus. The dim/spotlight is
      // supplied by _dimRects (the 4 dark strips OUTSIDE the crop rect), which already cut
      // out the crop region. The old opacity:0.75 dimmed the whole image (including the kept
      // region), so the focused area looked darkened. (owner: dim the surroundings, not the image.)
      opacity: 1,
      selectable: false,
      evented: false,
      dirty: true
    });
    obj.setPositionByOrigin(_fullCentre, 'center', 'center');
    obj.setCoords();

    // The crop region starts as whatever was cropped before, in source pixels.
    _crop = { x: prevCropX, y: prevCropY, w: prevW, h: prevH };

    // Lock ALL other objects so nothing moves during crop
    _lockedObjs = [];
    cvs.getObjects().forEach(function (o) {
      if (o === obj || o._isCropRect || o._isCropDim || o._isCropGrid) return;
      _lockedObjs.push({ obj: o, selectable: o.selectable, evented: o.evented });
      o.set({ selectable: false, evented: false });
    });
    cvs.selection = false;

    // The crop rect is a VIEW of _crop: it carries the image's angle/scale/flip so it overlays
    // the source region exactly, whatever the image's placement. strokeUniform keeps the
    // outline 2px on screen now that the rect inherits the image's scale.
    _cropRect = new fabric.Rect({
      fill: 'transparent',
      stroke: '#fff',
      strokeWidth: 2,
      strokeUniform: true,
      strokeDashArray: [0],
      cornerColor: '#fff',
      cornerStrokeColor: '#fff',
      // cornerSize deliberately NOT set: an own value shadows the prototype and would stop
      // following _ccApplyControlScale, leaving the crop handles 2.5px wide at 25% zoom (app.js).
      cornerStyle: 'circle',
      transparentCorners: false,
      borderColor: '#fff',
      hasRotatingPoint: false,
      lockRotation: true,
      _isCropRect: true
    });

    cvs.add(_cropRect);
    cvs.setActiveObject(_cropRect);
    cvs.discardActiveObject();
    cvs.setActiveObject(_cropRect);

    _cropRect.set('paintFirst', 'fill');
    _syncCropRect();

    // Every interaction follows the same loop: read the drag back into _crop (source pixels),
    // clamp it there, then re-derive the rect and the strips from it.
    _cropRect.on('moving', function () { _readCropRect(); _refreshCropOverlay(); });
    _cropRect.on('scaling', function () {
      _readCropRect();
      if (_aspectRatio > 0) _enforceAspect();
      _refreshCropOverlay();
    });
    _cropRect.on('modified', function () {
      _readCropRect();
      if (_aspectRatio > 0) _enforceAspect();
      _refreshCropOverlay();
    });

    _drawDimOverlay();

    // Hide the standard float toolbar
    var floatTB = document.getElementById('float-tb');
    if (floatTB) floatTB.classList.remove('show');

    // Show backdrop + toolbar
    _showBackdrop();
    _showCropToolbar();

    _liftCanvasAboveBackdrop();

    cvs.renderAll();
  };

  /* ══════════════════════════════════════════════════════════════
     EXIT CROP MODE (apply or cancel)
     ══════════════════════════════════════════════════════════════ */
  window.exitCropMode = function (apply) {
    if (!_active || !_imgObj) return;
    var cvs = _getCvs();

    if (apply && _cropRect) {
      // _crop is ALREADY in source pixels, which is the frame fabric's cropX/cropY/width/height
      // live in, so there is no screen-to-pixel conversion left to get wrong.
      _readCropRect();
      _constrainCropState();

      var fullW = _imgObj.width;
      var fullH = _imgObj.height;
      var cropX = Math.max(0, Math.min(Math.round(_crop.x), fullW - 1));
      var cropY = Math.max(0, Math.min(Math.round(_crop.y), fullH - 1));
      var cropW = Math.min(Math.round(_crop.w), fullW - cropX);
      var cropH = Math.min(Math.round(_crop.h), fullH - cropY);

      if (cropW > 2 && cropH > 2) {
        // Where the kept region currently sits, measured while width/height still describe the
        // FULL source. Ordering is load-bearing: _srcRectCentre reads _imgObj.width/height.
        var keepCentre = _srcRectCentre(cropX, cropY, cropW, cropH);

        _imgObj.set({
          cropX: cropX,
          cropY: cropY,
          width: cropW,
          height: cropH,
          dirty: true
        });
        // Re-anchor through fabric so the kept pixels do not move, for any origin or angle.
        _imgObj.setPositionByOrigin(keepCentre, 'center', 'center');
        // Contour no longer matches after crop — clear it
        if (_imgObj._alphaContour) {
          delete _imgObj._alphaContour;
          delete _imgObj._renderStroke;
          _imgObj.stroke = null;
          _imgObj.strokeWidth = 0;
        }
      }
    } else if (_originalData) {
      // Cancel: restore the exact state from before crop mode. left/top are replayed verbatim
      // (they were captured verbatim), so origin and angle need no special handling here.
      _imgObj.set({
        cropX: _originalData.cropX,
        cropY: _originalData.cropY,
        width: _originalData.width,
        height: _originalData.height,
        left: _originalData.left,
        top: _originalData.top,
        scaleX: _originalData.scaleX,
        scaleY: _originalData.scaleY,
        angle: _originalData.angle,
        dirty: true
      });
    }

    // Restore image (opacity back to whatever it was BEFORE crop mode, not a hardcoded 1,
    // so an image the user intentionally made semi-transparent isn't clobbered).
    _imgObj.set({
      opacity: (_originalData && _originalData.opacity != null ? _originalData.opacity : 1),
      selectable: true, evented: true
    });
    _imgObj.setCoords();

    // Unlock all objects that were locked for crop
    _lockedObjs.forEach(function (entry) {
      entry.obj.set({ selectable: entry.selectable, evented: entry.evented });
    });
    _lockedObjs = [];
    cvs.selection = true;

    // Remove crop rect and overlays
    if (_cropRect) { cvs.remove(_cropRect); _cropRect = null; }
    _clearDimOverlay();

    _hideBackdrop();
    _hideCropToolbar();

    _restoreCanvasZ();

    cvs.setActiveObject(_imgObj);
    cvs.renderAll();

    if (apply && typeof snap === 'function') snap();
    if (typeof updateFloatTB === 'function') updateFloatTB();

    _imgObj = null;
    _active = false;
    _originalData = null;
  };

  window.isCropActive = function () { return _active; };

  /* ══════════════════════════════════════════════════════════════
     DIM OVERLAY — 4 dark rects showing uncropped area
     ══════════════════════════════════════════════════════════════ */
  function _clearDimOverlay() {
    var cvs = _getCvs();
    _dimRects.forEach(function (r) { cvs.remove(r); });
    _dimRects = [];
    _clearGrid(cvs);
  }

  function _clearGrid(cvs) {
    if (!cvs) cvs = _getCvs();
    _gridLines.forEach(function (l) { cvs.remove(l); });
    _gridLines = [];
  }

  function _drawDimOverlay() {
    if (!_imgObj || !_cropRect) { _clearDimOverlay(); return; }
    var cvs = _getCvs();

    // Reuse existing dim rects or create 4 persistent ones
    if (_dimRects.length === 0) {
      var common = {
        fill: 'rgba(0,0,0,0.55)', selectable: false, evented: false,
        excludeFromExport: true, _isCropDim: true
      };
      for (var di = 0; di < 4; di++) {
        var r = new fabric.Rect(Object.assign({}, common, { left: 0, top: 0, width: 0, height: 0, visible: false }));
        _dimRects.push(r);
        cvs.add(r);
      }
    }

    // The 4 strips are expressed in SOURCE PIXELS around _crop, then placed through the image's
    // own transform, so they rotate/scale/flip with it and can never spill onto the kept region
    // (the old canvas-space strips did exactly that on a rotated image, which is why the image
    // itself looked dimmed).
    var W = _imgObj.width, H = _imgObj.height;
    var cx = _crop.x, cy = _crop.y, cw = _crop.w, ch = _crop.h;
    var strips = [
      { x: 0, y: 0, w: W, h: cy },                       // top
      { x: 0, y: cy + ch, w: W, h: H - (cy + ch) },      // bottom
      { x: 0, y: cy, w: cx, h: ch },                     // left
      { x: cx + cw, y: cy, w: W - (cx + cw), h: ch }     // right
    ];
    for (var i = 0; i < 4; i++) {
      var s = strips[i];
      var vis = s.w > 0.01 && s.h > 0.01;
      if (!vis) { _dimRects[i].set({ visible: false }); continue; }
      _placeOverSrcRect(_dimRects[i], s.x, s.y, s.w, s.h, { visible: true });
    }

    // Draw 3×3 grid lines on crop area
    _drawGridOnCrop(cvs);
  }

  /* ── Rule-of-thirds grid ── */
  var _gridLines = [];
  function _drawGridOnCrop(cvs) {
    if (!_cropRect || !_imgObj) { _clearGrid(cvs); return; }

    // Reuse existing grid lines or create 4 persistent ones
    if (_gridLines.length === 0) {
      var common = {
        stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1,
        selectable: false, evented: false, excludeFromExport: true,
        _isCropGrid: true
      };
      for (var gi = 0; gi < 4; gi++) {
        var l = new fabric.Line([0, 0, 0, 0], Object.assign({}, common));
        _gridLines.push(l);
        cvs.add(l);
      }
    }

    // Endpoints are computed in source pixels and mapped through the image's transform, so the
    // thirds grid tilts with a rotated image instead of staying axis-aligned over it. Each line
    // is placed by its own centre (fabric.Line keeps left/top from the FIRST x1/y1 it was built
    // with, so setting x1..y2 alone would leave it in the wrong place).
    var cx = _crop.x, cy = _crop.y, cw = _crop.w, ch = _crop.h;
    function place(idx, ax, ay, bx, by) {
      var A = _localToCanvas(ax - _imgObj.width / 2, ay - _imgObj.height / 2);
      var B = _localToCanvas(bx - _imgObj.width / 2, by - _imgObj.height / 2);
      var ln = _gridLines[idx];
      ln.set({ x1: A.x, y1: A.y, x2: B.x, y2: B.y });
      ln.setPositionByOrigin(new fabric.Point((A.x + B.x) / 2, (A.y + B.y) / 2), 'center', 'center');
      ln.setCoords();
    }
    for (var i = 1; i < 3; i++) {
      place(i - 1, cx + (cw / 3) * i, cy, cx + (cw / 3) * i, cy + ch);   // vertical
      place(i + 1, cx, cy + (ch / 3) * i, cx + cw, cy + (ch / 3) * i);   // horizontal
    }
  }

  /* ══════════════════════════════════════════════════════════════
     CONSTRAIN crop rect within image bounds
     ══════════════════════════════════════════════════════════════ */
  /* Aspect is what the user SEES, so it is a canvas-space ratio, while _crop is source pixels.
     displayed w/h = (_crop.w * scaleX) / (_crop.h * scaleY), so solving for _crop.h keeps the
     ratio true even when the image is scaled non-uniformly. Reduces to w/ratio when sX == sY. */
  function _enforceAspect() {
    if (_aspectRatio <= 0 || !_imgObj) return;
    var sX = _imgObj.scaleX || 1, sY = _imgObj.scaleY || 1;
    var W = _imgObj.width, H = _imgObj.height;
    var w = _crop.w;
    var h = (w * sX) / (_aspectRatio * sY);
    if (h > H) { h = H; w = (h * _aspectRatio * sY) / sX; }
    if (w > W) { w = W; h = (w * sX) / (_aspectRatio * sY); }
    _crop.w = w;
    _crop.h = h;
  }

  /* ══════════════════════════════════════════════════════════════
     BACKDROP (blur everything behind)
     ══════════════════════════════════════════════════════════════ */
  /* Layering contract: backdrop 490 < canvas 500 < crop toolbar 510. The canvas MUST sit above
     the backdrop, or the backdrop's rgba(0,0,0,0.55) covers the image itself and the 4 dim
     strips lose their focus effect entirely (owner: "it does not focus the image, when it
     darkens the background it darkens the image too").

     The old code set zIndex on #card-stage-container, which silently did nothing twice over:
     that element is position:static (z-index is ignored on a static box) AND it is trapped
     inside an ancestor that creates a stacking context (position:relative + z-index:1), so no
     descendant of it can ever paint above a body-level 490. Lift the stacking root instead.
     Verified by measurement, because elementFromPoint cannot see this: the backdrop is
     pointer-events:none, so hit tests fall through it and report the canvas as "on top" while
     the backdrop is in fact painted over it. */
  var _zSaved = [];

  function _liftCanvasAboveBackdrop() {
    _zSaved = [];
    var stageEl = document.getElementById('card-stage-container');
    if (!stageEl) return;
    var root = null;
    var n = stageEl.parentElement;
    while (n && n !== document.body) {
      var cs = window.getComputedStyle(n);
      if (cs.position !== 'static' && cs.zIndex !== 'auto') { root = n; break; }
      n = n.parentElement;
    }
    // No stacking-context ancestor: the stage competes at body level, so lift the stage itself
    // (and give it a position, or the z-index would be ignored exactly like before).
    var target = root || stageEl;
    _zSaved.push({ el: target, zIndex: target.style.zIndex, position: target.style.position });
    if (window.getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.style.zIndex = '500';
  }

  function _restoreCanvasZ() {
    _zSaved.forEach(function (s) { s.el.style.zIndex = s.zIndex; s.el.style.position = s.position; });
    _zSaved = [];
  }

  function _showBackdrop() {
    if (_backdropEl) { _backdropEl.style.display = 'block'; return; }
    _backdropEl = document.createElement('div');
    _backdropEl.id = 'crop-backdrop';
    _backdropEl.style.cssText =
      'position:fixed;inset:0;z-index:490;background:rgba(0,0,0,0.55);pointer-events:none';
    document.body.appendChild(_backdropEl);
  }

  function _hideBackdrop() {
    if (_backdropEl) { _backdropEl.style.display = 'none'; }
  }

  /* ══════════════════════════════════════════════════════════════
     FLOATING CROP TOOLBAR
     ══════════════════════════════════════════════════════════════ */
  function _showCropToolbar() {
    if (_toolbarEl) { _toolbarEl.style.display = 'flex'; _updateToolbar(); return; }

    _toolbarEl = document.createElement('div');
    _toolbarEl.id = 'crop-toolbar';
    _toolbarEl.style.cssText =
      'position:fixed;z-index:510;display:flex;align-items:center;gap:6px;' +
      'background:var(--surface,#131316);border:1px solid var(--border2,#35353c);' +
      'border-radius:10px;padding:6px 10px;box-shadow:0 6px 24px rgba(0,0,0,0.5);' +
      'left:50%;top:auto;bottom:80px;transform:translateX(-50%)';

    // Aspect ratio selector
    var sel = document.createElement('select');
    sel.id = 'crop-ratio-sel';
    sel.style.cssText =
      'background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);' +
      'color:var(--text,#ededf0);font-size:11px;padding:5px 8px;border-radius:6px;cursor:pointer;font-family:inherit';
    RATIOS.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.value;
      o.textContent = r.label;
      sel.appendChild(o);
    });
    sel.onchange = function () {
      _aspectRatio = parseFloat(sel.value);
      if (_aspectRatio > 0 && _cropRect) {
        _enforceAspect();
        _refreshCropOverlay();
        _getCvs().renderAll();
      }
    };

    // Rotate 90° button
    var rotBtn = document.createElement('button');
    rotBtn.title = 'Rotate Image 90°';
    rotBtn.style.cssText = _btnStyle();
    rotBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8"/></svg>';
    rotBtn.onclick = function () { _rotateCropImage(); };

    // Flip horizontal
    var flipHBtn = document.createElement('button');
    flipHBtn.title = 'Flip Horizontal';
    flipHBtn.style.cssText = _btnStyle();
    flipHBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
    flipHBtn.onclick = function () {
      if (_imgObj) {
        _imgObj.set('flipX', !_imgObj.flipX);
        _imgObj.setCoords();
        // A flip mirrors the SOURCE, so the kept region moves on screen. The overlay is derived
        // from the image's transform, so it has to be re-placed or it would mark the mirrored
        // region instead of the chosen one.
        _refreshCropOverlay();
        _getCvs().renderAll();
      }
    };

    // Flip vertical
    var flipVBtn = document.createElement('button');
    flipVBtn.title = 'Flip Vertical';
    flipVBtn.style.cssText = _btnStyle();
    flipVBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><line x1="2" y1="12" x2="22" y2="12"/></svg>';
    flipVBtn.onclick = function () {
      if (_imgObj) {
        _imgObj.set('flipY', !_imgObj.flipY);
        _imgObj.setCoords();
        _refreshCropOverlay();
        _getCvs().renderAll();
      }
    };

    // Reset crop
    var resetBtn = document.createElement('button');
    resetBtn.title = 'Reset Crop';
    resetBtn.style.cssText = _btnStyle();
    resetBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
    resetBtn.onclick = function () {
      if (_cropRect && _imgObj) {
        // Reset the crop to the whole source and let the overlay re-derive itself.
        _crop = { x: 0, y: 0, w: _imgObj.width, h: _imgObj.height };
        _refreshCropOverlay();
        _getCvs().renderAll();
      }
    };

    // Separator
    var sep1 = _createSep();
    var sep2 = _createSep();

    // Cancel button
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText =
      'background:transparent;border:1px solid var(--border2,#35353c);color:var(--text-dim,#8888a0);' +
      'font-size:11px;padding:6px 14px;border-radius:6px;cursor:pointer;font-family:inherit;transition:all .15s';
    cancelBtn.onmouseenter = function () { cancelBtn.style.borderColor = 'var(--text-dim)'; };
    cancelBtn.onmouseleave = function () { cancelBtn.style.borderColor = 'var(--border2,#35353c)'; };
    cancelBtn.onclick = function () { exitCropMode(false); };

    // Apply button
    var applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText =
      'background:var(--gold,#f2ff58);border:none;color:#0b0b0d;font-weight:600;' +
      'font-size:11px;padding:6px 18px;border-radius:6px;cursor:pointer;font-family:inherit;transition:all .15s';
    applyBtn.onmouseenter = function () { applyBtn.style.filter = 'brightness(1.1)'; };
    applyBtn.onmouseleave = function () { applyBtn.style.filter = ''; };
    applyBtn.onclick = function () { exitCropMode(true); };

    _toolbarEl.appendChild(sel);
    _toolbarEl.appendChild(sep1);
    _toolbarEl.appendChild(rotBtn);
    _toolbarEl.appendChild(flipHBtn);
    _toolbarEl.appendChild(flipVBtn);
    _toolbarEl.appendChild(resetBtn);
    _toolbarEl.appendChild(sep2);
    _toolbarEl.appendChild(cancelBtn);
    _toolbarEl.appendChild(applyBtn);

    document.body.appendChild(_toolbarEl);
  }

  function _hideCropToolbar() {
    if (_toolbarEl) _toolbarEl.style.display = 'none';
  }

  function _updateToolbar() {
    var sel = document.getElementById('crop-ratio-sel');
    if (sel) sel.value = '0';
    _aspectRatio = 0;
  }

  /* ── Rotate image 90° within crop mode ── */
  function _rotateCropImage() {
    if (!_imgObj || !_cropRect) return;
    var cvs = _getCvs();

    _imgObj.rotate((_imgObj.angle || 0) + 90);
    _imgObj.setCoords();

    // Reset the crop to the whole source, then let the overlay re-derive itself. The rect used
    // to be slammed onto the image's axis-aligned getBoundingRect(), which after a 90 degree
    // turn is a DIFFERENT box from the image, so the crop no longer matched the pixels.
    _crop = { x: 0, y: 0, w: _imgObj.width, h: _imgObj.height };
    _refreshCropOverlay();
    cvs.renderAll();
  }

  /* ── Helpers ── */
  function _getCvs() {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  }

  function _btnStyle() {
    return 'background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);' +
      'color:var(--text-dim,#8888a0);width:30px;height:30px;border-radius:6px;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0';
  }

  function _createSep() {
    var s = document.createElement('div');
    s.style.cssText = 'width:1px;height:20px;background:var(--border2,#35353c);flex-shrink:0';
    return s;
  }

  /* ── Keyboard: Enter to apply, Escape to cancel ── */
  document.addEventListener('keydown', function (e) {
    if (!_active) return;
    if (e.key === 'Enter') { e.preventDefault(); exitCropMode(true); }
    if (e.key === 'Escape') { e.preventDefault(); exitCropMode(false); }
  });

  /* ── Double-click image to enter crop mode ── */
  function _initDblClick() {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
    if (!cvs) { setTimeout(_initDblClick, 200); return; }
    cvs.on('mouse:dblclick', function (opt) {
      if (_active) return;
      // Don't enter crop mode if a selection tool is active
      if (typeof _activeTool !== 'undefined' && window._selToolActive && window._selToolActive()) return;
      var t = opt.target;
      if (t && t.type === 'image' && !t.isQR && !t._isChart && !t._isEffect) {
        enterCropMode(t);
      }
    });
  }
  _initDblClick();

})();

// Modular skeleton hook (Faz 8) — crop-tool is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'crop-tool', parent: 'canvas.tools', title: 'Crop tool', mount: function () {}, unmount: function () {} });
