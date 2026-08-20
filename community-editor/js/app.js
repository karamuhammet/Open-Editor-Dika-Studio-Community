/* ============================================================
   dika studio – app.js  (Main Application Core)
   Loaded AFTER icons.js, BEFORE all other JS files.
   Sets up global state, Fabric.js canvas, and core UI.
   ============================================================ */

// ── 1. Global State ──────────────────────────────────────────
var userInfo = { name: '', title: '', company: '', email: '', phone: '', website: '', address: '', linkedin: '', instagram: '', twitter: '', facebook: '' };
// Restore userInfo from localStorage if available
try {
  var _cachedUI = localStorage.getItem('dika_userInfo');
  if (_cachedUI) {
    var _parsed = JSON.parse(_cachedUI);
    if (_parsed && typeof _parsed === 'object') {
      ['name','title','company','email','phone','website','address','linkedin','instagram','twitter','facebook'].forEach(function(k) {
        if (_parsed[k]) userInfo[k] = _parsed[k];
      });
    }
  }
} catch(e) {}
var wizSettings = { corners: 'sharp', orientation: 'horizontal', sides: 'double' };
var selectedTpl = 'noir';

var CW = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[activeProduct]) ? PRODUCT_TYPES[activeProduct].w : 700;
var CH = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[activeProduct]) ? PRODUCT_TYPES[activeProduct].h : 400;
var currentFace = 'front';
var dualSideEnabled = true;
var frontJSON = null, backJSON = null;
var frontBG = '#0d0d0d', backBG = '#1a1a2e';
var _fieldRoleUpdating = false;
var _dfFieldUpdating = false;

// Sync page-level design note textarea with current page
function _syncPageDesignNote() {
  var el = document.getElementById('p-page-note');
  if (!el) return;
  var note = '';
  if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined' && pages[currentPageIndex]) {
    note = pages[currentPageIndex]._pageDesignNote || '';
  }
  el.value = note;
  var st = document.getElementById('p-page-note-status');
  if (st) st.textContent = note ? '\u2713 Saved' : '';
}

var viewZoom = 0.75, panX = 0, panY = 0;
var isPanning = false, spaceDown = false, lastPan = { x: 0, y: 0 };

var undoStack = [], hIdx = -1, histLocked = false;
var splitMode = false; // is the multi-page preview overlay open
// backCanvas removed (Faz 8): the old business-card front+back dual-canvas was never created — dead.

var CUSTOM_PROPS = ['selectable', 'evented', 'id', 'qrUrl', 'qrFg', 'qrBg', 'isQR', '_iconName', '_isPattern', '_patternId', '_patternColor', '_fieldRole', '_dfField', '_dfNote', '_dfAttrKey', '_productId', '_isStickyNote', '_isStickyBg', '_isStickyText', '_stickyBgId', '_stickyId', '_isSticky', '_isStickyCorner', '_isTextGroup', '_isGroupText', '_isBoardLine', 'arrow', 'curved', 'wbS', 'wbC', 'wbE', 'bindStart', 'bindEnd', '_wbName', '_wbLink', '_groupName', '_isWireframe', '_wfType', '_wfCustomCss', '_wfBrandLogo', '_isTextPattern', '_isIconPattern', '_isImagePattern', '_isClippedImage', '_clipPosition', '_clipShapeW', '_clipShapeH', '_isClipFrame', '_clipPreImg', '_isChart', '_chartType', '_chartData', '_chartOptions', '_chartW', '_chartH', '_isEffect', '_fxKind', '_fxPreset', '_fxColors', '_fxAmount', '_fxAngle', '_fxIntensity', '_fxGrain', '_fxRadius', '_fxDistort', '_fxSmooth', '_fxScale', '_fxInvert', '_fxSeed', '_fxW', '_fxH', '_isFrame', '_frameId', '_frameVector', '_uid', '_ccId', '_boundImageUid', '_boundLocalX', '_boundLocalY', '_layerColor', '_customName', '_rpFolder', '_rpFolderOpen', '_rpFolderChildren', 'excludeFromExport', '_isPerspHandle', '_isPerspOutline', '_isPerspWarp', '_isPeHandle', '_isPeOutline', '_isPaintOverlay', '_isPaintCursor', '_isBrushShape', '_isMyShapeAsset', '_myShapeSourceType', '_myShapeDisplayName', '_isPenPath', '_isPaintSelPreview', '_hasBgRemoved', '_alphaContour', '_veClipId', '_isVideoMedia', '_videoSrc', '_videoPoster', '_videoName', '_videoIdbKey', '_videoUrl', '_isAudioMedia', '_audioSrc', '_audioName', '_audioAuthor', '_isGridLayout', '_gridCols', '_gridRows', '_gridGap', '_gridCellColor', '_gridLineColor', '_gridCellRadius', '_gridCellOpacity', '_isGridCellImage', '_gridCellRow', '_gridCellCol', '_cells', '_isEmoji', '_emojiCp', '_isGif', '_gifUrl', '_gifTitle', '_isSticker', '_stickerUrl', '_stickerTitle', '_isAnimatedGif', '_gifOrigUrl', '_gifStillUrl', '_ccType', '_barcodeType', '_barcodeValue', '_barcodeHumanReadable', '_barcodeSource', '_barcodeRowIndex', '_barcodeLineColor', '_barcodeBackgroundColor',
  /* The editable stop list behind a gradient fill (shared/color-picker/engine.js). The FILL itself
     already survived a reload - fabric serialises the Pattern's canvas source as a data URL - but
     this did not, and parseGradientStateFromObject cannot recover stops from a Pattern, so
     re-opening the picker on a saved gradient started from the default two stops. */
  '_ccGradientState',
  /* Image-fill marker {fit}. The PICTURE itself is not duplicated here: it rides in the Pattern's
     own source, which fabric serialises as the img's src. This flag is what tells an image fill
     apart from a gradient fill after a reload, when both are Patterns over a data URL. */
  '_ccImageFill',
  /* Letter case as a REVERSIBLE display state (shared/text-effects): _ccTextRaw is the text the
     user actually typed, _ccTextCase the transform on top of it. Without both, "aa" after "AA"
     could never give the original mixed case back, and a reload would forget the case was on. */
  '_ccTextRaw', '_ccTextCase',
  /* The image inspector's adjustment set (preset + brightness/contrast/saturation/vibrance/hue/
     gamma/sharpen/blur/sepia/grayscale). The fabric filter CHAIN is derived from this in one
     place and is never read back out, so this object is the only thing that has to survive a
     reload for the panel and the picture to still agree. */
  '_ccImgAdjust',
  /* The colour-grading object (same shape a video clip's `colorGrading` has, handed to the same
     VEColorGrading engine). The FILTER serialises its own copy, so the picture would come back
     graded without this - but the panel would not, and an effect you can see and cannot edit is
     the `_ccGradientState` mistake repeated. */
  '_ccGrade'];

var _ccSoundEnabled = (function () {
  try { return localStorage.getItem('dika_sounds') !== 'off'; } catch (e) { return true; }
})();

// portal-tags-page §8.2: stable per-object id (_ccId) for object-level tagging + reveal.
// Assigned once at creation via the canvas object:added choke point; survives serialize->reload
// because _ccId is in CUSTOM_PROPS. Skips synthetic/ephemeral objects and frames (which use _frameId).
function _ccGenObjId() { return 'obj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function _ccIdEligible(o) {
  if (!o || o.excludeFromExport) return false;
  if (o.isSmartGuide || o._isGridLine || o._isGuide || o._isSelPreview || o._isPaintSelPreview) return false;
  if (o._isCropRect || o._isCropGrid || o._isCropDim || o._isPaintCursor || o._isPaintOverlay || o._isBrushShape) return false;
  if (o._isFrame || o._ccFrame || o._isFrameBg || o._isSleepThumb || o._scPreview) return false;
  if (o._isPerspHandle || o._isPerspOutline || o._isPerspWarp || o._isPeHandle || o._isPeOutline) return false;
  return true;
}
function _ccEnsureObjId(o, cvs) {
  if (!_ccIdEligible(o)) return;
  if (!o._ccId) { o._ccId = _ccGenObjId(); return; }
  // duplicate/copy-paste re-roll: fabric clone() copies _ccId verbatim -> collision. Skip while loading.
  if (typeof histLocked !== 'undefined' && histLocked) return;
  try {
    var list = cvs && cvs.getObjects ? cvs.getObjects() : [];
    for (var i = 0; i < list.length; i++) { if (list[i] !== o && list[i]._ccId === o._ccId) { o._ccId = _ccGenObjId(); return; } }
  } catch (e) {}
}
window._ccEnsureObjId = _ccEnsureObjId;   // reused at tag-time (Phase 9) to backfill a legacy object

function playSound(type) {
  if (!_ccSoundEnabled) return;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    var o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.connect(gain);

    if (type === 'add') {
      o1.frequency.setValueAtTime(523, ctx.currentTime);
      o1.frequency.setValueAtTime(659, ctx.currentTime + 0.06);
    } else if (type === 'delete') {
      o1.frequency.setValueAtTime(440, ctx.currentTime);
      o1.frequency.setValueAtTime(330, ctx.currentTime + 0.06);
    } else if (type === 'save') {
      o1.frequency.setValueAtTime(523, ctx.currentTime);
      o1.frequency.setValueAtTime(784, ctx.currentTime + 0.07);
    } else if (type === 'export') {
      o1.frequency.setValueAtTime(659, ctx.currentTime);
      o1.frequency.setValueAtTime(880, ctx.currentTime + 0.07);
    } else {
      o1.frequency.setValueAtTime(587, ctx.currentTime);
    }
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.15);
    setTimeout(function () { ctx.close(); }, 300);
  } catch (e) {}
}

// ── 2. Fabric.js Canvas Setup ────────────────────────────────
var canvas = new fabric.Canvas('card', {
  width: CW,
  height: CH,
  backgroundColor: '#0d0d0d',
  preserveObjectStacking: true,
  selection: true,
  fireRightClick: true,
  stopContextMenu: true,
  uniformScaling: true,
  uniScaleKey: 'altKey',
});

/* ── Custom object control styling ──
   ZOOM HERE IS A CSS TRANSFORM, not fabric's viewportTransform: applyView() scales
   #card-stage-container (modules/canvas/view/view.js ~:47), so the browser shrinks the control
   bitmap along with the artwork. Measured at the default 75%: a 10px handle draws 7.5px and the
   1.5px border draws 1.13px; at the 25% minimum they are 2.5px / 0.38px - and the GRAB AREA shrinks
   with them, because fabric's getPointer divides the pointer by that same CSS scale. So the numbers
   below are what the user should SEE, and _ccApplyControlScale() multiplies them by 1/viewZoom.
   `padding` is deliberately NOT scaled: it is a user-facing text property here (#p-padding writes
   straight to it), so scaling it would make a padded object disagree with an unpadded one. */
var CC_CTRL_BASE = { corner: 10, border: 1.5, dash: [4, 3], selLine: 1.5 };
var _ccCtrlScale = 1;

fabric.Object.prototype.set({
  borderColor: '#f2ff58',
  borderScaleFactor: CC_CTRL_BASE.border,
  cornerColor: '#f2ff58',
  cornerStrokeColor: '#f2ff58',
  cornerSize: CC_CTRL_BASE.corner,
  cornerStyle: 'circle',
  transparentCorners: false,
  borderDashArray: CC_CTRL_BASE.dash.slice(),
  padding: 6,
  rotatingPointOffset: 0
});
/* Selection box styling */
canvas.selectionColor = 'rgba(242, 255, 88,0.08)';
canvas.selectionBorderColor = '#f2ff58';
canvas.selectionLineWidth = CC_CTRL_BASE.selLine;
canvas.selectionDashArray = CC_CTRL_BASE.dash.slice();

/* Keep the selection chrome a constant SCREEN size whatever the CSS zoom. applyView() calls this
   before its own early returns, so whiteboard and scene - which zoom through viewportTransform and
   are already screen-constant - pass f = 1. Constant at EVERY zoom, not just when zoomed out: at
   250% an uncompensated handle draws 25px and starts covering the artwork it is supposed to frame,
   which is why every design tool keeps its chrome at a fixed screen size in both directions. The
   clamp is only a guard rail around the [0.25, 2.5] zoom range, not the behaviour.
   No-ops when the factor has not moved, because applyView also runs on every pan frame.
   Written on the PROTOTYPE on purpose: fabric only gives an object its own cornerSize when one is
   passed to the constructor, and none of these keys is serialised, so every normal and every
   reloaded object follows this immediately. */
function _ccApplyControlScale(f) {
  f = Math.max(0.35, Math.min(4.5, f || 1));
  if (Math.abs(f - _ccCtrlScale) < 0.0005) return;
  _ccCtrlScale = f;
  window._ccCtrlScale = f;
  fabric.Object.prototype.set({
    borderScaleFactor: CC_CTRL_BASE.border * f,
    cornerSize: CC_CTRL_BASE.corner * f,
    borderDashArray: [CC_CTRL_BASE.dash[0] * f, CC_CTRL_BASE.dash[1] * f]
  });
  var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  if (cvs) {
    cvs.selectionLineWidth = CC_CTRL_BASE.selLine * f;
    cvs.selectionDashArray = [CC_CTRL_BASE.dash[0] * f, CC_CTRL_BASE.dash[1] * f];
  }
  if (typeof window._ccScaleIconControls === 'function') window._ccScaleIconControls(f);
  if (cvs && cvs.requestRenderAll) cvs.requestRenderAll();
}
window._ccApplyControlScale = _ccApplyControlScale;

/* ── Custom icon controls: Rotate + Move above object (side by side) ── */
(function () {
  // Base (authored, on-screen) sizes; the live vars below them are the base x the zoom factor.
  var BASE_ICON = 14, BASE_R = 12, BASE_GAP = 14, BASE_LIFT = 14;
  var ICON_SIZE = BASE_ICON;
  var CIRCLE_R = BASE_R;
  var GAP = BASE_GAP;        // half-distance between the two icons
  var LIFT = BASE_LIFT;      // clearance between the object's top edge and the buttons
  var CTRL_F = 1;            // current zoom compensation, see _ccApplyControlScale

  // Preload rotate icon (--text-dim color)
  var rotSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="%238888a0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8"/></svg>';
  var _rotateImg = new Image();
  _rotateImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rotSvg.replace(/%23/g, '#'));

  // Preload move icon (--text-dim color)
  var movSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="%238888a0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
  var _moveImg = new Image();
  _moveImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(movSvg.replace(/%23/g, '#'));

  function renderIconControl(img, ctx, left, top, styleOverride, fabricObject) {
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle));
    // --surface background + shadow
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6 * CTRL_F;
    ctx.shadowOffsetY = 2 * CTRL_F;
    ctx.beginPath();
    ctx.arc(0, 0, CIRCLE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#131316';
    ctx.fill();
    ctx.closePath();
    ctx.shadowColor = 'transparent';
    // --border2 border
    ctx.beginPath();
    ctx.arc(0, 0, CIRCLE_R, 0, Math.PI * 2);
    ctx.strokeStyle = '#35353c';
    ctx.lineWidth = CTRL_F;
    ctx.stroke();
    ctx.closePath();
    // Draw icon centered
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -ICON_SIZE / 2, -ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
    }
    ctx.restore();
  }

  // ── Rotate control — left, ABOVE object ──
  var mtr = fabric.Object.prototype.controls.mtr;
  mtr.visible = true;
  mtr.x = 0;
  mtr.y = -0.5;
  mtr.offsetX = -GAP;
  mtr.offsetY = -(CIRCLE_R + LIFT);
  mtr.withConnection = false;
  mtr.cursorStyle = 'grab';
  mtr.sizeX = CIRCLE_R * 2;
  mtr.sizeY = CIRCLE_R * 2;
  mtr.touchSizeX = CIRCLE_R * 2 + 8;
  mtr.touchSizeY = CIRCLE_R * 2 + 8;
  mtr.render = function (ctx, left, top, styleOverride, fabricObject) {
    renderIconControl(_rotateImg, ctx, left, top, styleOverride, fabricObject);
  };

  // ── Move control — right, ABOVE object ──
  fabric.Object.prototype.controls.moveIcon = new fabric.Control({
    x: 0,
    y: -0.5,
    offsetX: GAP,
    offsetY: -(CIRCLE_R + LIFT),
    cursorStyle: 'move',
    sizeX: CIRCLE_R * 2,
    sizeY: CIRCLE_R * 2,
    touchSizeX: CIRCLE_R * 2 + 8,
    touchSizeY: CIRCLE_R * 2 + 8,
    render: function (ctx, left, top, styleOverride, fabricObject) {
      renderIconControl(_moveImg, ctx, left, top, styleOverride, fabricObject);
    },
    actionHandler: fabric.controlsUtils.dragHandler,
    actionName: 'drag'
  });

  /* These two buttons are hand-drawn in canvas pixels, so the CSS stage scale shrinks them exactly
     like the corner handles do. Their hit boxes (sizeX/sizeY) have to follow, or a visually correct
     button would still be missed by the pointer. Driven by _ccApplyControlScale above. */
  window._ccScaleIconControls = function (f) {
    CTRL_F = f;
    ICON_SIZE = BASE_ICON * f;
    CIRCLE_R = BASE_R * f;
    GAP = BASE_GAP * f;
    LIFT = BASE_LIFT * f;
    var pair = [mtr, fabric.Object.prototype.controls.moveIcon];
    for (var i = 0; i < pair.length; i++) {
      var ct = pair[i];
      if (!ct) continue;
      ct.offsetX = (i === 0 ? -GAP : GAP);
      ct.offsetY = -(CIRCLE_R + LIFT);
      ct.sizeX = CIRCLE_R * 2;
      ct.sizeY = CIRCLE_R * 2;
      ct.touchSizeX = CIRCLE_R * 2 + 8 * f;
      ct.touchSizeY = CIRCLE_R * 2 + 8 * f;
    }
  };
})();

/* ── CTRL + Side-handle drag = Quick crop for images ── */
(function () {
  'use strict';

  var _ctrlDown = false;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Control' && !_ctrlDown) {
      _ctrlDown = true;
      var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
      cvs.requestRenderAll();
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Control') {
      _ctrlDown = false;
      var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
      cvs.requestRenderAll();
    }
  });
  window.addEventListener('blur', function () {
    if (_ctrlDown) {
      _ctrlDown = false;
      var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
      cvs.requestRenderAll();
    }
  });

  function isCroppable(obj) {
    // A blur object is a painted image, but cropping it would be undone by the
    // next parameter change (which repaints from _fxW/_fxH). Its size lives
    // in the Properties panel instead.
    return obj && obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
  }

  /* ── Pill / bar handle renderer ── */
  function drawPill(ctx, left, top, fabricObject, pw, ph) {
    var r = Math.min(pw, ph) / 2;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle));
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    var x0 = -pw / 2, y0 = -ph / 2;
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x0 + pw - r, y0);
    ctx.quadraticCurveTo(x0 + pw, y0, x0 + pw, y0 + r);
    ctx.lineTo(x0 + pw, y0 + ph - r);
    ctx.quadraticCurveTo(x0 + pw, y0 + ph, x0 + pw - r, y0 + ph);
    ctx.lineTo(x0 + r, y0 + ph);
    ctx.quadraticCurveTo(x0, y0 + ph, x0, y0 + ph - r);
    ctx.lineTo(x0, y0 + r);
    ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  /* ── Natural dimensions helper ── */
  function getNat(img) {
    // For bg-removed images without existing crop, current dimensions ARE the full source
    if (img._hasBgRemoved && !img.cropX && !img.cropY) {
      return { w: img.width, h: img.height };
    }
    var el = img._element || img._originalElement;
    return {
      w: el ? (el.naturalWidth || el.width) : img.width,
      h: el ? (el.naturalHeight || el.height) : img.height
    };
  }

  function ensureCropOrig(t) {
    if (!t._cropOriginal) {
      var n = getNat(t);
      t._cropOriginal = {
        cropX: 0, cropY: 0,
        width: n.w, height: n.h,
        scaleX: t.scaleX, scaleY: t.scaleY
      };
    }
  }

  // Clear contour stroke on bg-removed images when cropping
  function _clearContourOnCrop(t) {
    if (t._alphaContour) {
      delete t._alphaContour;
      delete t._renderStroke;
      t.stroke = null;
      t.strokeWidth = 0;
    }
  }

  /* ── Override renders: circle → pill when CTRL + image ── */
  var ctrls = fabric.Object.prototype.controls;

  ['ml', 'mr'].forEach(function (name) {
    var orig = ctrls[name].render;
    ctrls[name].render = function (ctx, l, t, sO, fObj) {
      if (isCroppable(fObj) && _ctrlDown) drawPill(ctx, l, t, fObj, 8, 30);
      else orig.call(this, ctx, l, t, sO, fObj);
    };
  });
  ['mt', 'mb'].forEach(function (name) {
    var orig = ctrls[name].render;
    ctrls[name].render = function (ctx, l, t, sO, fObj) {
      if (isCroppable(fObj) && _ctrlDown) drawPill(ctx, l, t, fObj, 30, 8);
      else orig.call(this, ctx, l, t, sO, fObj);
    };
  });

  /* ── Crop action handlers ── */
  var MIN_PX = 20;

  /* ml – crop from left */
  var _origMl = ctrls.ml.actionHandler;
  ctrls.ml.actionHandler = function (ev, tr, x, y) {
    var t = tr.target;
    if (!isCroppable(t) || (!ev.ctrlKey && !tr._isCropDrag))
      return _origMl.call(this, ev, tr, x, y);
    if (!tr._cropInit) {
      tr._cropInit = true; tr._isCropDrag = true;
      tr._sCX = t.cropX || 0; tr._sW = t.width;
      tr._sL = t.left; tr._sT = t.top;
      tr._sX = tr.ex; tr._sY = tr.ey;
      ensureCropOrig(t);
      _clearContourOnCrop(t);
    }
    var nat = getNat(t);
    var ang = t.angle * Math.PI / 180;
    var localDx = (x - tr._sX) * Math.cos(ang) + (y - tr._sY) * Math.sin(ang);
    var dpx = localDx / t.scaleX;
    var nCX = tr._sCX + dpx, nW = tr._sW - dpx;
    if (nCX < 0) { nCX = 0; nW = tr._sCX + tr._sW; }
    if (nW < MIN_PX) { nW = MIN_PX; nCX = tr._sCX + tr._sW - MIN_PX; }
    if (nCX + nW > nat.w) nW = nat.w - nCX;
    var off = (nCX - tr._sCX) * t.scaleX;
    t.set({
      cropX: Math.round(nCX), width: Math.round(nW),
      left: tr._sL + off * Math.cos(ang),
      top: tr._sT + off * Math.sin(ang),
      dirty: true
    });
    t.setCoords();
    return true;
  };

  /* mr – crop from right */
  var _origMr = ctrls.mr.actionHandler;
  ctrls.mr.actionHandler = function (ev, tr, x, y) {
    var t = tr.target;
    if (!isCroppable(t) || (!ev.ctrlKey && !tr._isCropDrag))
      return _origMr.call(this, ev, tr, x, y);
    if (!tr._cropInit) {
      tr._cropInit = true; tr._isCropDrag = true;
      tr._sW = t.width;
      tr._sX = tr.ex; tr._sY = tr.ey;
      ensureCropOrig(t);
      _clearContourOnCrop(t);
    }
    var nat = getNat(t);
    var ang = t.angle * Math.PI / 180;
    var localDx = (x - tr._sX) * Math.cos(ang) + (y - tr._sY) * Math.sin(ang);
    var nW = tr._sW + localDx / t.scaleX;
    var cX = t.cropX || 0;
    if (nW < MIN_PX) nW = MIN_PX;
    if (cX + nW > nat.w) nW = nat.w - cX;
    t.set({ width: Math.round(nW), dirty: true });
    t.setCoords();
    return true;
  };

  /* mt – crop from top */
  var _origMt = ctrls.mt.actionHandler;
  ctrls.mt.actionHandler = function (ev, tr, x, y) {
    var t = tr.target;
    if (!isCroppable(t) || (!ev.ctrlKey && !tr._isCropDrag))
      return _origMt.call(this, ev, tr, x, y);
    if (!tr._cropInit) {
      tr._cropInit = true; tr._isCropDrag = true;
      tr._sCY = t.cropY || 0; tr._sH = t.height;
      tr._sL = t.left; tr._sT = t.top;
      tr._sX = tr.ex; tr._sY = tr.ey;
      ensureCropOrig(t);
      _clearContourOnCrop(t);
    }
    var nat = getNat(t);
    var ang = t.angle * Math.PI / 180;
    var localDy = -(x - tr._sX) * Math.sin(ang) + (y - tr._sY) * Math.cos(ang);
    var dpy = localDy / t.scaleY;
    var nCY = tr._sCY + dpy, nH = tr._sH - dpy;
    if (nCY < 0) { nCY = 0; nH = tr._sCY + tr._sH; }
    if (nH < MIN_PX) { nH = MIN_PX; nCY = tr._sCY + tr._sH - MIN_PX; }
    if (nCY + nH > nat.h) nH = nat.h - nCY;
    var off = (nCY - tr._sCY) * t.scaleY;
    t.set({
      cropY: Math.round(nCY), height: Math.round(nH),
      left: tr._sL - off * Math.sin(ang),
      top: tr._sT + off * Math.cos(ang),
      dirty: true
    });
    t.setCoords();
    return true;
  };

  /* mb – crop from bottom */
  var _origMb = ctrls.mb.actionHandler;
  ctrls.mb.actionHandler = function (ev, tr, x, y) {
    var t = tr.target;
    if (!isCroppable(t) || (!ev.ctrlKey && !tr._isCropDrag))
      return _origMb.call(this, ev, tr, x, y);
    if (!tr._cropInit) {
      tr._cropInit = true; tr._isCropDrag = true;
      tr._sH = t.height;
      tr._sX = tr.ex; tr._sY = tr.ey;
      ensureCropOrig(t);
      _clearContourOnCrop(t);
    }
    var nat = getNat(t);
    var ang = t.angle * Math.PI / 180;
    var localDy = -(x - tr._sX) * Math.sin(ang) + (y - tr._sY) * Math.cos(ang);
    var nH = tr._sH + localDy / t.scaleY;
    var cY = t.cropY || 0;
    if (nH < MIN_PX) nH = MIN_PX;
    if (cY + nH > nat.h) nH = nat.h - cY;
    t.set({ height: Math.round(nH), dirty: true });
    t.setCoords();
    return true;
  };

  /* ── Save undo state after crop drag ends ── */
  canvas.on('object:modified', function (opt) {
    if (opt.transform && opt.transform._isCropDrag) {
      if (typeof snap === 'function') snap();
    }
  });

  /* ── Proportional side-handle scaling (Alt = free distort) ── */
  canvas.on('object:scaling', function (opt) {
    var t = opt.target;
    var tr = opt.transform;
    if (!tr || !t) return;
    // Skip if Alt is held (allow free distort)
    if (opt.e && opt.e.altKey) return;
    // Only apply to side handles (not corners)
    var corner = tr.corner;
    if (corner !== 'ml' && corner !== 'mr' && corner !== 'mt' && corner !== 'mb') return;
    // Skip crop drags
    if (tr._isCropDrag) return;
    // Effect panels stretch on one axis, like every other design tool: a side
    // handle widens or heightens, it does not rescale the whole panel. Their
    // content is a generated gradient/glass field, so a non-uniform box is not
    // a distortion of anything - it just re-fits.
    if (t._isEffect) return;
    // Enforce proportional scaling
    if (corner === 'ml' || corner === 'mr') {
      t.scaleY = t.scaleX;
    } else {
      t.scaleX = t.scaleY;
    }
  });

  /* Bake a text's scale into its fontSize after resizing, so the right-panel size reflects
     reality and the box stays usable (instead of carrying a hidden scaleX/scaleY). */
  canvas.on('object:modified', function (opt) {
    var o = opt.target;
    if (!o || (o.type !== 'textbox' && o.type !== 'i-text' && o.type !== 'text')) return;
    var sx = o.scaleX || 1, sy = o.scaleY || 1;
    if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return;
    var s = Math.max(sx, sy);
    o.set({ fontSize: Math.max(1, Math.round((o.fontSize || 16) * s)), scaleX: 1, scaleY: 1 });
    // Fit a Textbox to its content so the box doesn't stay wider than the text after resizing.
    if (o.type === 'textbox' && o.calcTextWidth) o.set('width', Math.max(20, Math.ceil(o.calcTextWidth()) + 6));
    if (typeof o.initDimensions === 'function') o.initDimensions();
    o.setCoords();
    canvas.requestRenderAll();
    var pSize = document.getElementById('p-size');
    if (pSize) pSize.value = o.fontSize;
  });
})();

function add(obj) {
  obj.set({
    selectable: obj.selectable !== false,
    evented: obj.evented !== false,
  });
  canvas.add(obj);
}

function getCanvasCenter() {
  var w = canvas.getWidth();
  var h = canvas.getHeight();
  return { x: w / 2, y: h / 2 };
}

/* Return a scale factor relative to the base card size (700×400).
   Uses the shorter canvas dimension so objects stay proportional. */
function getCanvasScale() {
  var w = canvas.getWidth() || 700;
  var h = canvas.getHeight() || 400;
  var ref = Math.min(700, 400); // 400
  return Math.min(w, h) / ref;
}

// ── 3. View (Zoom + Pan) — MOVED to core/view.js (Faz 3, core slimming).
//   applyView / zoomBy / resetView / initZoomAndPan are global there (index.html <script>
//   before app.js); initApp() still calls applyView() + initZoomAndPan(). State vars
//   viewZoom/panX/panY stay in section 1 (Global State) below.

// ── 4/5/6. Card Corners + Orientation + Dual Side — MOVED to core/canvas-geometry.js (Faz 8, core slimming).
//   setCardCorners/setOrientation/updateSizeBadge/toggleDualSide are global there (<script> before app.js).
//   Their state (wizSettings/CW/CH/activeProduct/dualSideEnabled/pages/...) stays in §1.

// ── 7. Split View Mode ──────────────────────────────────────
var activeCanvasRef = null;

function getActiveCanvas() {
  // Faz 8: the dual-canvas (backCanvas) is gone, so the active canvas is always the main one.
  return canvas;
}

function wireCanvasEvents(cvs) {
  cvs.on('selection:created', function () {
    if (splitMode) activeCanvasRef = cvs;
    syncRightPanel();
    updateFloatTB();
  });
  cvs.on('selection:updated', function () {
    if (splitMode) activeCanvasRef = cvs;
    syncRightPanel();
    updateFloatTB();
  });
  cvs.on('selection:cleared', function () {
    // Guard: if an object is still active (e.g., blur-triggered false clear), don't hide panels
    if (cvs.getActiveObject()) return;
    var rpEmpty = document.getElementById('rp-empty');
    if (rpEmpty) rpEmpty.style.display = '';
    var rpBg = document.getElementById('rp-bg-panel');
    if (rpBg) { rpBg.style.display = ''; if (typeof rpfSyncBgPanel === 'function') rpfSyncBgPanel(); }
    ['rp-fig-bar', 'rp-uni-appearance', 'rp-selcolors', 'rp-text', 'rp-shape', 'rp-image', 'rp-qr', 'rp-board', 'rp-chart', 'rp-perspective', 'rp-design-fields'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Show page-level design note when nothing selected
    var rpPageNote = document.getElementById('rp-page-design-note');
    if (rpPageNote) { rpPageNote.style.display = ''; _syncPageDesignNote(); }
    var floatTB = document.getElementById('float-tb');
    if (floatTB) floatTB.classList.remove('show');
    if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
    if (typeof refreshStructure === 'function') refreshStructure();
    // Video mode, nothing selected: surface Canvas size + the video backdrop
    // control (this handler runs instead of syncRightPanel's !obj branch, owner).
    if (window.__ccVideoEditor && window.__ccVideoEditor._veActive) {
      var _vcs = document.getElementById('rp-canvas-size'); if (_vcs) _vcs.style.display = '';
      if (typeof _veSyncBgSection === 'function') _veSyncBgSection();
    } else if (typeof _veHideBgSection === 'function') { _veHideBgSection(); }
    if (window.wbActive) {
      var rp = document.querySelector('.rpanel');
      if (rp) rp.classList.add('wb-hidden');
    }
  });
  cvs.on('object:moving', updateFloatTB);
  cvs.on('object:scaling', updateFloatTB);
  cvs.on('object:rotating', updateFloatTB);
  cvs.on('text:editing:entered', function () { requestAnimationFrame(updateFloatTB); });
  cvs.on('text:editing:exited', function () { updateFloatTB(); });
  cvs.on('text:selection:changed', function () { _syncTextSelectionFormat(); });
  cvs.on('text:changed', function () { updateFloatTB(); });
  cvs.on('object:added', snap);
  cvs.on('object:modified', snap);
  cvs.on('object:removed', snap);

  var ctxMenu = document.getElementById('ctx-menu');
  if (ctxMenu) {
    cvs.on('mouse:down', function (opt) {
      ctxMenu.classList.remove('show');
      if (opt.e.button === 2 && opt.target) {
        opt.e.preventDefault();
        activeCanvasRef = cvs;
        cvs.setActiveObject(opt.target);
        ctxMenu.style.left = opt.e.clientX + 'px';
        ctxMenu.style.top = opt.e.clientY + 'px';
        ctxMenu.classList.add('show');
        // keep the menu on-screen (flip up/left near the right/bottom edge)
        var _mw = ctxMenu.offsetWidth, _mh = ctxMenu.offsetHeight;
        if (opt.e.clientX + _mw > window.innerWidth - 8) ctxMenu.style.left = Math.max(8, window.innerWidth - _mw - 8) + 'px';
        if (opt.e.clientY + _mh > window.innerHeight - 8) ctxMenu.style.top = Math.max(8, window.innerHeight - _mh - 8) + 'px';
      }
    });
  }
}

// ── 7b. Multi-page Preview (enableSplitMode/disableSplitMode) — MOVED to
//   modules/canvas/page-preview/ (Faz 8). The bulk-preview overlay + filters; getActiveCanvas +
//   wireCanvasEvents stay above as core. splitMode flag stays in §1. Triggered by the Preview button.

// ── 8. History (Undo / Redo) — MOVED to core/history.js (Faz 8, core slimming).
//   snap/undo/redo/_snapNow/_flushSnap are global there (index.html <script> before app.js).
//   History STATE undoStack/hIdx/histLocked stays in §1 (line 49) — split-view + others use it.

// ── 9. Background Colors + CMYK — REMOVED. Page background color (solid/gradient/image) now lives in
//   the right panel (modules/right-panel/, no-selection Background section). The left-panel background
//   module (modules/left-panel/background/) now handles Effects only: gradient/patterns/grid.

// ── 10. QR Code Generator (encoders) — MOVED to core/qr-encode.js (Faz 3, core slimming).
//   generateQRImage / generateQRSvg are global there (index.html <script>, after the qrcode lib).

// ── 10b. QR Studio — EXTRACTED to modules/left-panel/tools/qr/qr.js (Faz 2 tools).
//   window.renderQrToolPanel lives there now; the shared encoders generateQRImage /
//   generateQRSvg (section 10 above) stay here — canvas QR-object render + bulk-builder use them.

// ── 11. Element Tools — MOVED to core/element-tools.js (Faz 3, core slimming).
//   initElementTools (wires the element buttons) + window.addToCenter are global there;
//   index.html loads it before app.js, and initApp() still calls initElementTools().

// ── 12. QR Code Updates (right panel) ────────────────────────
function updateQRLink(url) {
  var cvs = getActiveCanvas();
  var obj = cvs.getActiveObject();
  if (!obj || !obj.isQR) return;
  obj.qrUrl = url || 'https://example.com';
  fabric.Image.fromURL(generateQRImage(obj.qrUrl, obj.qrFg, obj.qrBg), function (ni) {
    obj.setElement(ni.getElement());
    cvs.renderAll();
    snap();
  });
}

function updateQRColor() {
  var cvs = getActiveCanvas();
  var obj = cvs.getActiveObject();
  if (!obj || !obj.isQR) return;
  var fgEl = document.getElementById('p-qr-color');
  var bgEl = document.getElementById('p-qr-bg');
  obj.qrFg = fgEl ? fgEl.value : obj.qrFg;
  obj.qrBg = bgEl ? bgEl.value : obj.qrBg;
  fabric.Image.fromURL(generateQRImage(obj.qrUrl || 'https://example.com', obj.qrFg, obj.qrBg), function (ni) {
    obj.setElement(ni.getElement());
    cvs.renderAll();
    snap();
  });
}

// ── Background Image Position Helper — MOVED to core/bg-image-position.js (Faz 3, core slimming).
//   window._applyBgImagePosition / _bgImagePosition are global there (index.html <script>).

// ── 13. Context Menu — MOVED to core/context-menu.js (Faz 8, core slimming).
//   initContextMenu (initApp still calls it) + ctxAction + clip/merge/frame/unclip image helpers
//   are global there (index.html <script> before app.js). No shared state lived in this section.

// ── 14. Floating Toolbar — MOVED to core/floating-toolbar.js (Faz 8, core slimming).
//   initFloatingToolbar (initApp still calls it) + updateFloatTB + ft* helpers global there. No shared state here.

// ── 17. Delete Selected ──────────────────────────────────────
function delSelected() {
  var cvs = getActiveCanvas();
  var active = cvs.getActiveObject();

  // VIDEO MODE: the selection may be a TIMELINE selection (clips, or subtitle cues) with no fabric
  // object behind it. This is the FIRST handler Delete reaches (shortcuts.js binds it in the capture
  // phase), and it used to return here because getActiveObject() is null for a timeline selection -
  // so Del did nothing at all and the only way to remove a subtitle was the canvas toolbar button
  // (owner: "del diyip silemiyorum"). Route to the one video delete path, which owns both kinds.
  // Guarded on "no active fabric object" so it can never steal a real canvas delete.
  if (!active) {
    var _VEdel = window.__ccVideoEditor;
    if (_VEdel && _VEdel._veActive && typeof _VEdel._veDeleteSelected === 'function' &&
        (((_VEdel._veSelectedClips || []).length) || ((_VEdel._veSelectedCues || []).length))) {
      _VEdel._veDeleteSelected();
    }
    return;
  }

  // SCENE (infinite canvas): a frame lives in the scene MODEL (sc.frames), not just on the canvas.
  // Deleting only the fabric object leaves a PHANTOM in the model — and the sleep/wake virtualization
  // (_scUpdateSleep reconciles every sc.frames entry against the viewport) RESURRECTS it on the next
  // zoom/pan (off-screen → sleep-thumb → on-screen → wake → redraw), and it lingers in memory forever.
  // Route every _ccFrame deletion through _scRemoveFrame (model + canvas object + sleep thumb). This is
  // the single delete choke point (Del/Backspace, toolbar, context/radial menu, AI all call it).
  var frameIds = [];
  if (typeof _scRemoveFrame === 'function') {
    if (active._ccFrame && active._frameId) frameIds = [active._frameId];
    else if (active.type === 'activeSelection') {
      frameIds = active.getObjects()
        .filter(function (o) { return o._ccFrame && o._frameId; })
        .map(function (o) { return o._frameId; });
    }
  }

  if (active.type === 'activeSelection') {
    active.forEachObject(function (obj) { if (!obj._ccFrame) cvs.remove(obj); });   // frames handled below
  } else if (!frameIds.length) {
    cvs.remove(active);
  }
  cvs.discardActiveObject();
  frameIds.forEach(function (id) { _scRemoveFrame(id); });   // model-aware removal (after discard)
  playSound('delete');
  cvs.renderAll();
  snap();

  var rpEmpty = document.getElementById('rp-empty');
  if (rpEmpty) rpEmpty.style.display = '';
  ['rp-text', 'rp-shape', 'rp-image', 'rp-qr', 'rp-chart'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var floatTB = document.getElementById('float-tb');
  if (floatTB) floatTB.classList.remove('show');
  if (typeof refreshStructure === 'function') refreshStructure();
}

// ── 18. Icon Rail & Flyout Panel Logic — MOVED to core/rail-flyout.js (Faz 8, core slimming).
//   initIconRail (initApp still calls it) + openFlyout + closeFlyout + board helpers global there.

// ── 19. History Event Bindings ───────────────────────────────
function initHistoryBindings() {
  var btnUndo = document.getElementById('btn-undo');
  var btnRedo = document.getElementById('btn-redo');
  var btnResetCanvas = document.getElementById('btn-reset-canvas');
  if (btnUndo) btnUndo.onclick = undo;
  if (btnRedo) btnRedo.onclick = redo;
  var btnSave = document.getElementById('btn-save');
  if (btnSave) {
    btnSave.onclick = function () {
      // Route through saveProjectNow: in remote mode this flushes the doc NOW + creates a named version
      // (a real portal restore point); standalone keeps the local snapshot. It shows its own toast.
      if (typeof window.saveProjectNow === 'function') { window.saveProjectNow(); }
      else {
        if (typeof saveCurrentPage === 'function') saveCurrentPage();
        if (typeof performAutoSave === 'function') performAutoSave();
        showToast('Saved!');
      }
      playSound('save');
    };
  }
  if (btnResetCanvas) btnResetCanvas.onclick = function () {
    // Video Editor mode: reset tracks + canvas
    if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive()) {
      showCustomConfirm('Reset video editor? All tracks and clips will be cleared.', function () {
        VideoEditor.resetProject();
        if (typeof showToast === 'function') showToast('Video editor reset');
      });
      return;
    }
    showCustomConfirm('Reset canvas? All objects will be removed.', function () {
      var cvs = getActiveCanvas();
      var bg = cvs.backgroundColor || '#0d0d0d';
      var objs = cvs.getObjects().slice();
      objs.forEach(function (o) { cvs.remove(o); });
      cvs.setBackgroundColor(bg, function () { cvs.renderAll(); });
      snap();
    });
  };
  canvas.on('object:added', function(e) {
    var o = e && e.target;
    _ccEnsureObjId(o, canvas);   // stamp a stable _ccId (backfill-safe; re-rolls duplicates when not loading)
    if (histLocked) return;
    if (o && (o.isSmartGuide || o._isGridLine || o._isGuide || o._isPattern || o._isWbLabel || o._isCropDim || o._isCropGrid || o._isCropRect || o._isSelPreview || o.excludeFromExport)) return;
    if (typeof isCropActive === 'function' && isCropActive()) return;
    playSound('add');
  });
  canvas.on('object:modified', snap);
  canvas.on('object:removed', snap);
}

// ── 20. Page Tab Init — MOVED to core/page-tabs.js (Faz 8, core slimming).
//   initFaceTabs/initCanvasSizePanel (initApp still calls them) + drill-in nav (text/bg/pat) global there.

// ── 21. Init Everything ──────────────────────────────────────
function initApp() {
  // applyView() + initZoomAndPan() → modules/canvas/view/ self-inits on cc:canvas-ready (Faz 6)
  // background color → right panel (modules/right-panel/); left-panel background module = Effects only now
  // initElementTools() → modules/canvas/element-tools/ self-inits on cc:canvas-ready (Faz 6)
  initContextMenu();
  initFloatingToolbar();
  // initPropertyBindings() → modules/right-panel/ self-inits on the lifecycle event below (Faz 6b).
  // Emit AFTER canvas + toolbar setup so the right-panel module wires bindings against a ready app.
  // Sticky → the module gets it even if it loads after this point (loader runs async).
  if (window.cc && cc.emitSticky) cc.emitSticky('cc:canvas-ready');
  // initColorPickerPanel() → modules/shared/color-picker/ self-inits on cc:canvas-ready (Faz 6)
  initHistoryBindings();
  initIconRail();
  if (typeof applyRailVisibility === 'function') applyRailVisibility();
  initFaceTabs();
  if (typeof initIconPicker === 'function') initIconPicker();
  if (typeof initGearMenu === 'function') initGearMenu();
  initCanvasSizePanel();
  // initMockups() → modules/left-panel/tools/mockups/ (was dead at init; populated lazily by openToolGenerator)
  // initTextPattern() → modules/left-panel/background/
  // initIconPattern() → modules/left-panel/background/
  // initImagePattern() → modules/left-panel/background/
  if (typeof initRadialMenu === 'function') initRadialMenu();
  if (typeof initComments === 'function') { initComments(); if (typeof _hookSwitchPageForComments === 'function') _hookSwitchPageForComments(); }
  if (typeof initShortcuts === 'function') initShortcuts();
  setTimeout(snap, 300);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(initApp, 100);
  });
} else {
  setTimeout(initApp, 100);
}
