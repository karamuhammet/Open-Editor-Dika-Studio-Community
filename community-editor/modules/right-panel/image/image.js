/* Sub-module: right-panel/image — Image props (Faz 6b-2). Owns its #p-* slice;
   parent delegates sync via cc.safe; bindings self-init on cc:canvas-ready, fault-isolated. */

function syncImage(obj) {
  if (!obj) return;
    // opacity → unified #rp-uni-appearance / appearance sub-module (Faz 6b)
    var pImgStroke = document.getElementById('p-img-stroke');
    var pImgStrokew = document.getElementById('p-img-strokew');
    var pImgStrokewVal = document.getElementById('p-img-strokew-val');
    var pImgRadius = document.getElementById('p-img-radius');
    var pImgRadiusVal = document.getElementById('p-img-radius-val');
    if (pImgStroke) pImgStroke.value = toHex(obj.stroke) || '#000000';
    var pImgStrokeHex = document.getElementById('p-img-stroke-hex'); if (pImgStrokeHex) pImgStrokeHex.textContent = String(toHex(obj.stroke) || '#000000').replace('#', '').toUpperCase();
    var pImgStrokeSw = document.getElementById('p-img-stroke-sw'); if (pImgStrokeSw) pImgStrokeSw.style.background = toHex(obj.stroke) || '#000000';
    if (pImgStrokew) pImgStrokew.value = obj.strokeWidth || 0;
    if (pImgStrokewVal) pImgStrokewVal.textContent = String(obj.strokeWidth || 0);
    var rx = 0;
    if (obj.clipPath && obj.clipPath.rx != null) rx = obj.clipPath.rx;
    if (pImgRadius) pImgRadius.value = rx;
    if (pImgRadiusVal) pImgRadiusVal.textContent = String(rx);

    // Clip controls: the NEW frame model (a group) and the LEGACY clipped image both land here.
    var isClip = !!(obj._isClipFrame || obj._isClippedImage);
    var rpClipBlock = document.getElementById('rp-clip-block');
    var pClipPos = document.getElementById('p-clip-position');
    if (rpClipBlock) rpClipBlock.style.display = isClip ? '' : 'none';
    if (pClipPos && isClip) pClipPos.value = obj._clipPosition || 'cover';

    // Background swatch. On a frame this is the SHAPE's own fill, so it covers the whole shape
    // under the image at any fit. On a legacy clipped image there is no shape, so it falls back
    // to the image's own backgroundColor, which is all that model can do.
    if (isClip) {
      var bg = '';
      if (obj._isClipFrame && typeof _ccFrameShape === 'function') {
        var _sh = _ccFrameShape(obj);
        bg = (_sh && typeof _sh.fill === 'string') ? _sh.fill : '';
      } else {
        bg = (typeof obj.backgroundColor === 'string' && obj.backgroundColor) ? obj.backgroundColor : '';
      }
      var pClipBgSw = document.getElementById('p-clip-bg-sw');
      var pClipBgHex = document.getElementById('p-clip-bg-hex');
      var pClipBg = document.getElementById('p-clip-bg');
      if (pClipBgSw) pClipBgSw.style.background = bg || 'transparent';
      if (pClipBgHex) pClipBgHex.textContent = bg ? String(toHex(bg) || bg).replace('#', '').toUpperCase() : 'None';
      if (pClipBg && bg) pClipBg.value = toHex(bg) || '#ffffff';
    }

    // Hide the border block (stroke/radius) for anything clipped: on a legacy clipped image the
    // radius fights the clipPath, and on a frame those props belong to the shape child, not to
    // the group the user has selected. Showing them would be a control that does nothing.
    var rpImgBorderBlock = document.getElementById('rp-img-border-block');
    if (rpImgBorderBlock) rpImgBorderBlock.style.display = isClip ? 'none' : '';
}

function initImageBindings() {
  // opacity binding → unified appearance sub-module (Faz 6b)

  /* Image border controls */
  var pImgStroke = document.getElementById('p-img-stroke');
  if (pImgStroke) {
    pImgStroke.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      if (o && o.type === 'image') { o.set('stroke', e.target.value); o.dirty = true; c.renderAll(); }
      var h = document.getElementById('p-img-stroke-hex'); if (h) h.textContent = String(e.target.value).replace('#', '').toUpperCase();
      var s = document.getElementById('p-img-stroke-sw'); if (s) s.style.background = e.target.value;
    };
    pImgStroke.onchange = snap;
  }

  var pImgStrokew = document.getElementById('p-img-strokew');
  if (pImgStrokew) {
    pImgStrokew.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      var v = parseInt(e.target.value) || 0;
      if (o && o.type === 'image') {
        o.set({ strokeWidth: v, stroke: o.stroke || '#000000', strokeUniform: true });
        // Re-apply contour stroke for bg-removed images
        if (o._hasBgRemoved && o._alphaContour && o._alphaContour.length > 4 && typeof o._renderStroke !== 'function') {
          if (typeof _reapplyContourStrokes === 'function') _reapplyContourStrokes();
        }
        o.dirty = true;
        c.renderAll();
      }
      var valEl = document.getElementById('p-img-strokew-val');
      if (valEl) valEl.textContent = String(v);
    };
    pImgStrokew.onchange = snap;
  }

  var pImgRadius = document.getElementById('p-img-radius');
  if (pImgRadius) {
    pImgRadius.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      var v = parseInt(e.target.value) || 0;
      if (o && o.type === 'image') {
        // Don't replace shape clipPath with a simple rect – it destroys the clip
        if (o._isClippedImage) return;
        var w = o.width, h = o.height;
        if (v > 0) {
          o.clipPath = new fabric.Rect({ rx: v, ry: v, width: w, height: h, originX: 'center', originY: 'center' });
        } else {
          o.clipPath = null;
        }
        o.dirty = true;
        c.renderAll();
      }
      var valEl = document.getElementById('p-img-radius-val');
      if (valEl) valEl.textContent = String(v);
    };
    pImgRadius.onchange = snap;
  }

  /* Clip background: the swatch itself opens the shared palette via rpfOpenPalette in the
     markup (target 'clipBg'), so only the hidden input's live feedback and the clear path are
     wired here. Clearing is required: a background you cannot remove would be a one-way door. */
  var pClipBg = document.getElementById('p-clip-bg');
  if (pClipBg) {
    pClipBg.oninput = function (e) { _rpApplyClipBg(e.target.value); };
    pClipBg.onchange = snap;
  }

  var pClipBgClear = document.getElementById('p-clip-bg-clear');
  if (pClipBgClear) {
    pClipBgClear.onclick = function () { if (_rpApplyClipBg('')) snap(); };
  }
}

/* One way to set the clip background, for both models. On a FRAME it writes the shape child's
   fill (covers the whole shape, any fit). On a legacy clipped image there is no shape, so it
   writes the image's own backgroundColor, which only ever covers the image's box. */
function _rpApplyClipBg(color) {
  var c = getActiveCanvas(), o = c && c.getActiveObject();
  if (!o) return false;
  if (o._isClipFrame && typeof _ccSetFrameBg === 'function') {
    if (!_ccSetFrameBg(o, color)) return false;
  } else if (o._isClippedImage) {
    o.set('backgroundColor', color);
    o.dirty = true;
  } else return false;
  c.renderAll();
  if (typeof syncImage === 'function') syncImage(o);
  return true;
}

if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.image.init', function () {
      if (typeof initImageBindings === 'function') initImageBindings();
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'image', parent: 'right-panel', title: 'Image props', mount: function () {}, unmount: function () {} });
}
