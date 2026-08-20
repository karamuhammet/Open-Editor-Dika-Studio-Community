/* Sub-module: right-panel/shape — Shape props (Faz 6b-2). Owns its #p-* slice;
   parent delegates sync via cc.safe; bindings self-init on cc:canvas-ready, fault-isolated. */

function syncShape(obj) {
  if (!obj) return;
    var pStroke = document.getElementById('p-stroke');
    var pStrokew = document.getElementById('p-strokew');
    var pRadius = document.getElementById('p-radius');
    // fill → unified #rp-uni-fill / appearance sub-module (Faz 6, group-aware)
    if (pStroke) pStroke.value = toHex(obj.stroke) || '#000000';
    if (pStrokew) pStrokew.value = obj.strokeWidth || 0;
    if (pRadius) pRadius.value = obj.rx || 0;
    // opacity → unified #rp-uni-appearance / appearance sub-module (Faz 6b)
    // border style segment (solid/dashed/dotted) ← strokeDashArray
    var bseg = document.getElementById('p-border-style');
    if (bseg) {
      var da = obj.strokeDashArray;
      var bmode = (!obj.strokeWidth) ? 'none' : ((!da || !da.length) ? 'solid' : (da[0] <= 1 ? 'dotted' : 'dashed'));
      var bbts = bseg.querySelectorAll('button');
      for (var bi = 0; bi < bbts.length; bi++) bbts[bi].classList.toggle('on', bbts[bi].getAttribute('data-dash') === bmode);
    }
}

// Shadow (new) — fabric.Shadow on the object; section lives in #rp-shape.
function syncShadow(obj) {
  if (!obj) return;
  var seg = document.getElementById('p-shadow-seg');
  var col = document.getElementById('p-shadow-color');
  var blur = document.getElementById('p-shadow-blur');
  var on = !!obj.shadow;
  if (seg) { var bts = seg.querySelectorAll('button'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', (bts[i].getAttribute('data-shadow') === 'drop') === on); }
  var sh = obj.shadow;
  if (col) col.value = (sh && toHex(sh.color)) || '#000000';
  if (blur) blur.value = sh ? Math.round(sh.blur || 0) : 10;
  var che = document.getElementById('p-shadow-color-hex');
  if (che) che.textContent = String((col && col.value) || '#000000').replace('#', '').toUpperCase();
  var ssw = document.getElementById('p-shadow-color-sw');
  if (ssw) ssw.style.background = (col && col.value) || '#000000';
}

// Text Effects (outline/stroke) — fabric stroke on a TEXT object; section #rp-text-fx (owner 2026-07-13),
// styled 1:1 with Shadow. "Outline" = stroke painted behind the fill (paintFirst:'stroke').
function syncTextFx(obj) {
  if (!obj) return;
  var seg = document.getElementById('p-txfx-seg');
  var col = document.getElementById('p-txfx-color');
  var w = document.getElementById('p-txfx-width');
  var on = !!(obj.stroke && (obj.strokeWidth || 0) > 0);
  if (seg) { var bts = seg.querySelectorAll('button'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', (bts[i].getAttribute('data-txfx') === 'outline') === on); }
  if (col) col.value = (on && toHex(obj.stroke)) || '#000000';
  if (w) w.value = on ? Math.round(obj.strokeWidth || 0) : 2;
  var che = document.getElementById('p-txfx-color-hex');
  if (che) che.textContent = String((col && col.value) || '#000000').replace('#', '').toUpperCase();
  var sw = document.getElementById('p-txfx-color-sw');
  if (sw) sw.style.background = (col && col.value) || '#000000';
}

function initShapeBindings() {
  // fill binding → unified appearance sub-module (Faz 6, group-aware)
  var pStroke = document.getElementById('p-stroke');
  if (pStroke) {
    pStroke.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      if (!o) return;
      if (o.type === 'group' && o._objects && o._objects.length > 0) {
        o._objects.forEach(function(child) { child.set('stroke', e.target.value); });
      } else {
        o.set('stroke', e.target.value);
      }
      o.dirty = true;
      c.renderAll();
      var sxh = document.getElementById('p-stroke-hex'); if (sxh) sxh.textContent = String(e.target.value).replace('#', '').toUpperCase();
      var sxsw = document.getElementById('p-stroke-sw'); if (sxsw) sxsw.style.background = e.target.value;
      if (typeof rpfRenderSelColors === 'function') rpfRenderSelColors(o);
    };
    pStroke.onchange = snap;
  }

  var pStrokew = document.getElementById('p-strokew');
  if (pStrokew) {
    pStrokew.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      if (!o) return;
      var v = parseInt(e.target.value) || 0;
      if (o.type === 'group' && o._objects && o._objects.length > 0) {
        o._objects.forEach(function(child) { child.set('strokeWidth', v); });
      } else {
        o.set('strokeWidth', v);
      }
      o.dirty = true;
      c.renderAll();
    };
    pStrokew.onchange = snap;
  }

  var pRadius = document.getElementById('p-radius');
  if (pRadius) {
    pRadius.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      var v = parseInt(e.target.value) || 0;
      if (o) { o.set({ rx: v, ry: v }); c.renderAll(); }
    };
    pRadius.onchange = snap;
  }

  // border style segment (solid / dashed / dotted) → strokeDashArray
  var pBorderStyle = document.getElementById('p-border-style');
  if (pBorderStyle) {
    pBorderStyle.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-dash]') : null; if (!b) return;
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      var d = b.getAttribute('data-dash');
      var widthInp = document.getElementById('p-strokew');
      if (d === 'none') {
        var apply0 = function (t) { t.set('strokeWidth', 0); };
        if (o.type === 'group' && o._objects && o._objects.length) o._objects.forEach(apply0); else apply0(o);
        if (widthInp) widthInp.value = 0;
      } else {
        if (!o.strokeWidth) {
          var sw1 = function (t) { t.set('strokeWidth', 1); if (!t.stroke) t.set('stroke', '#000000'); };
          if (o.type === 'group' && o._objects && o._objects.length) o._objects.forEach(sw1); else sw1(o);
          if (widthInp) widthInp.value = 1;
        }
        var sw = o.strokeWidth || 1;
        var arr = d === 'dashed' ? [sw * 3, sw * 2] : (d === 'dotted' ? [1, sw * 2] : null);
        var apply = function (t) { t.set('strokeDashArray', arr); };
        if (o.type === 'group' && o._objects && o._objects.length) o._objects.forEach(apply); else apply(o);
      }
      var bts = pBorderStyle.querySelectorAll('button'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i] === b);
      if (typeof _rpfToggleNoneBody === 'function') _rpfToggleNoneBody(pBorderStyle);
      o.dirty = true; c.renderAll(); snap();
    });
  }

  // shadow (none / drop) + colour + blur → fabric.Shadow
  function _rpfApplyShadow(o) {
    var col = document.getElementById('p-shadow-color'), blur = document.getElementById('p-shadow-blur');
    o.set('shadow', new fabric.Shadow({ color: (col && col.value) || '#000000', blur: parseInt(blur && blur.value) || 10, offsetX: 4, offsetY: 4 }));
  }
  var pShadowSeg = document.getElementById('p-shadow-seg');
  if (pShadowSeg) {
    pShadowSeg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-shadow]') : null; if (!b) return;
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      if (b.getAttribute('data-shadow') === 'drop') _rpfApplyShadow(o); else o.set('shadow', null);
      var bts = pShadowSeg.querySelectorAll('button'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i] === b);
      if (typeof _rpfToggleNoneBody === 'function') _rpfToggleNoneBody(pShadowSeg);
      o.dirty = true; c.renderAll(); snap();
    });
  }
  var pShadowColor = document.getElementById('p-shadow-color');
  if (pShadowColor) {
    pShadowColor.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      if (!o.shadow) _rpfApplyShadow(o); else o.shadow.color = e.target.value;
      var che = document.getElementById('p-shadow-color-hex'); if (che) che.textContent = String(e.target.value).replace('#', '').toUpperCase();
      var csw = document.getElementById('p-shadow-color-sw'); if (csw) csw.style.background = e.target.value;
      if (pShadowSeg) { var sb = pShadowSeg.querySelectorAll('button'); for (var i = 0; i < sb.length; i++) sb[i].classList.toggle('on', sb[i].getAttribute('data-shadow') === 'drop'); }
      o.dirty = true; c.renderAll();
    };
    pShadowColor.onchange = snap;
  }
  var pShadowBlur = document.getElementById('p-shadow-blur');
  if (pShadowBlur) {
    pShadowBlur.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      if (!o.shadow) _rpfApplyShadow(o); else o.shadow.blur = parseInt(e.target.value) || 0;
      o.dirty = true; c.renderAll();
    };
    pShadowBlur.onchange = snap;
  }

  // Text Effects (outline/stroke) — TEXT only (owner 2026-07-13). Same wiring shape as Shadow.
  function _rpfApplyTextFx(o) {
    var col = document.getElementById('p-txfx-color'), w = document.getElementById('p-txfx-width');
    var width = parseInt(w && w.value, 10); if (isNaN(width) || width <= 0) width = 2;
    o.set({ stroke: (col && col.value) || '#000000', strokeWidth: width, paintFirst: 'stroke', strokeLineJoin: 'round' });
  }
  var pTxfxSeg = document.getElementById('p-txfx-seg');
  if (pTxfxSeg) {
    pTxfxSeg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-txfx]') : null; if (!b) return;
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      if (b.getAttribute('data-txfx') === 'outline') _rpfApplyTextFx(o); else o.set({ stroke: null, strokeWidth: 0 });
      var bts = pTxfxSeg.querySelectorAll('button'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i] === b);
      if (typeof _rpfToggleNoneBody === 'function') _rpfToggleNoneBody(pTxfxSeg);
      o.dirty = true; c.renderAll(); snap();
    });
  }
  var pTxfxColor = document.getElementById('p-txfx-color');
  if (pTxfxColor) {
    pTxfxColor.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      if (!o.stroke || !((o.strokeWidth || 0) > 0)) _rpfApplyTextFx(o); else o.set('stroke', e.target.value);
      var che = document.getElementById('p-txfx-color-hex'); if (che) che.textContent = String(e.target.value).replace('#', '').toUpperCase();
      var csw = document.getElementById('p-txfx-color-sw'); if (csw) csw.style.background = e.target.value;
      if (pTxfxSeg) { var sb = pTxfxSeg.querySelectorAll('button'); for (var i = 0; i < sb.length; i++) sb[i].classList.toggle('on', sb[i].getAttribute('data-txfx') === 'outline'); }
      o.dirty = true; c.renderAll();
    };
    pTxfxColor.onchange = snap;
  }
  var pTxfxWidth = document.getElementById('p-txfx-width');
  if (pTxfxWidth) {
    pTxfxWidth.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      var width = parseInt(e.target.value, 10) || 0;
      if (!o.stroke) o.set('stroke', (document.getElementById('p-txfx-color') || {}).value || '#000000');
      o.set({ strokeWidth: width, paintFirst: 'stroke' });
      if (pTxfxSeg) { var sb = pTxfxSeg.querySelectorAll('button'); for (var i = 0; i < sb.length; i++) sb[i].classList.toggle('on', (sb[i].getAttribute('data-txfx') === 'outline') === (width > 0)); }
      o.dirty = true; c.renderAll();
    };
    pTxfxWidth.onchange = snap;
  }
  // opacity binding → unified appearance sub-module (Faz 6b)
}

if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.shape.init', function () {
      if (typeof initShapeBindings === 'function') initShapeBindings();
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'shape', parent: 'right-panel', title: 'Shape props', mount: function () {}, unmount: function () {} });
}
