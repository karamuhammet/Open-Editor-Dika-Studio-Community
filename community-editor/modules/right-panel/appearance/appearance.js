/* Sub-module: right-panel/appearance — Appearance category (Faz 6b-2).
   OPACITY is now UNIFIED: a single #rp-uni-appearance opacity control shown for ANY object
   (replaces the old per-type p-opacity / p-shape-op / p-img-op) → syncUniAppearance, parent
   calls it for every selected object. COLOR/SPACING/PADDING stay text-specific → syncAppearance,
   parent calls it for text. Bindings (incl. the universal opacity → obj.opacity) self-init on
   cc:canvas-ready, fault-isolated via cc.safe. */

// Universal opacity — applies to any object type (#rp-uni-appearance).
function syncUniAppearance(obj) {
  if (!obj) return;
  /* A multi-selection wrapper has no opacity of its own (fabric leaves it at 1), so the control
     read 100% over two half-transparent objects. Display the first member instead; the apply path
     below fans out to all of them. */
  if (obj.type === 'activeSelection' && typeof rpOpacityTargets === 'function') {
    obj = rpOpacityTargets()[0] || obj;
  }
  var pOpacity = document.getElementById('p-opacity');
  var pOpacityVal = document.getElementById('p-opacity-val');
  var opVal = Math.round((obj.opacity == null ? 1 : obj.opacity) * 100);
  if (pOpacity) pOpacity.value = opVal;
  if (pOpacityVal) pOpacityVal.textContent = opVal + '%';
  var pOpacityNum = document.getElementById('p-opacity-num');
  if (pOpacityNum && document.activeElement !== pOpacityNum) pOpacityNum.value = opVal;
}

// Unified fill (#rp-uni-fill) — text + shapes, group-aware. Parent shows the row + calls this for
// text/shape only (images have no fill; QR keeps its own pattern colour). Replaces text p-color +
// shape p-fill. For a group, reflects the first child's fill.
function syncFill(obj) {
  if (!obj) return;
  var src = (obj.type === 'group' && obj._objects && obj._objects.length > 0) ? obj._objects[0] : obj;
  var pFill = document.getElementById('p-fill');
  if (pFill) pFill.value = toHex(typeof src.fill === 'string' ? src.fill : '#000') || '#000000';
  var ft = document.getElementById('p-fill-type');
  if (ft) {
    /* An image fill is a Pattern too, so "not a string" alone reported it as a gradient and lit the
       wrong segment button. _ccImageFill is the marker that tells the two apart (engine.js). */
    var mode = src._ccImageFill ? 'image'
      : ((typeof src.fill !== 'string') ? 'gradient' : ((src.fill === 'transparent' || src.fill === '') ? 'none' : 'solid'));
    var bts = ft.querySelectorAll('button');
    for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i].getAttribute('data-filltype') === mode);
  }
}

// Text-only appearance: letter spacing, line height, padding.
/* The "—" state of #p-spacing-seg. READ FROM FABRIC, not hardcoded: this editor sets
   fabric.Object.prototype.padding = 6 (app.js), so a literal 0 here would call every untouched
   text "custom" and open the block on every selection. Resolved at call time so the two can
   never drift. */
function _ccSpacingDefaults() {
  return {
    letter: 0,
    line: (fabric.Text && fabric.Text.prototype.lineHeight != null) ? fabric.Text.prototype.lineHeight : 1.16,
    padding: (fabric.Object && fabric.Object.prototype.padding) || 0
  };
}

function _ccSpacingIsDefault(obj) {
  if (!obj) return true;
  var D = _ccSpacingDefaults();
  var lh = (obj.lineHeight != null ? obj.lineHeight : D.line);
  return Math.round((obj.charSpacing || 0) / 10) === D.letter &&
    Math.abs(lh - D.line) < 0.005 &&
    (obj.padding || 0) === D.padding;
}

function syncAppearance(obj) {
  if (!obj) return;
  var pSpacing = document.getElementById('p-spacing');
  if (pSpacing) pSpacing.value = Math.round((obj.charSpacing || 0) / 10);
  var pLineH = document.getElementById('p-lineheight');
  if (pLineH) pLineH.value = Math.round((obj.lineHeight != null ? obj.lineHeight : _ccSpacingDefaults().line) * 100) / 100;
  var pPadding = document.getElementById('p-padding');
  if (pPadding) pPadding.value = obj.padding || 0;
  /* Open the block whenever the text actually carries custom spacing, so a design that already has
     a line height does not hide it behind a collapsed "—". */
  var seg = document.getElementById('p-spacing-seg');
  if (seg) {
    var isDefault = _ccSpacingIsDefault(obj);
    var bts = seg.querySelectorAll('button');
    for (var i = 0; i < bts.length; i++) {
      bts[i].classList.toggle('on', (bts[i].getAttribute('data-spacing') === 'none') === isDefault);
    }
  }
}

function initAppearanceBindings() {
  var pFill = document.getElementById('p-fill');
  if (pFill) {
    pFill.oninput = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      if (!o) return;
      // rpFillTargets unwraps a multi-selection AND a group in one place; this used to handle only
      // the group case, so a colour picked over several objects landed on the throwaway wrapper.
      var v = e.target.value;
      rpApplyToTargets(rpFillTargets(), function (t) {
        delete t._ccGradientState;
        delete t._ccImageFill;
        t.set('fill', v);
        t.dirty = true;
      });
      var fh = document.getElementById('p-fill-hex'); if (fh) fh.textContent = String(v).replace('#', '').toUpperCase();
      var fsw = document.getElementById('p-fill-sw'); if (fsw) fsw.style.background = v;
      if (typeof rpfRenderSelColors === 'function') rpfRenderSelColors(o);
    };
    pFill.onchange = snap;
  }

  // Fill type segment: none / solid / gradient / image (Figma parity)
  var pFillType = document.getElementById('p-fill-type');
  if (pFillType) {
    pFillType.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-filltype]') : null; if (!b) return;
      var c = getActiveCanvas(), o = c.getActiveObject(); if (!o) return;
      var t = b.getAttribute('data-filltype');
      /* A fill has exactly ONE kind. Leaving the gradient/image markers behind when the user picks
         none or solid makes syncFill keep lighting the old button and makes the picker re-open on
         an editor for a fill the object no longer has. */
      var clearFillKind = function (x) {
        if (!x) return;
        delete x._ccGradientState;
        delete x._ccImageFill;
      };
      // One resolver for the whole segment: unwraps a multi-selection and a group alike.
      var targets = rpFillTargets();
      var rep = targets[0] || o;
      if (t === 'none') {
        rpApplyToTargets(targets, function (x) {
          if (typeof x.fill === 'string' && x.fill !== 'transparent') x._rpfLastFill = x.fill;
          clearFillKind(x); x.set('fill', 'transparent'); x.dirty = true;
        });
        snap();
      } else if (t === 'solid') {
        var fallback = (document.getElementById('p-fill') || {}).value || '#cccccc';
        // Each object goes back to ITS OWN last solid, not to the first one's: restoring two
        // differently-coloured shapes to one colour is a change nobody asked for.
        rpApplyToTargets(targets, function (x) {
          clearFillKind(x); x.set('fill', x._rpfLastFill || fallback); x.dirty = true;
        });
        snap();
        if (typeof syncFill === 'function') syncFill(rep);
        if (typeof rpfSyncHex === 'function') rpfSyncHex(rep);
        if (typeof rpfRenderSelColors === 'function') rpfRenderSelColors(rep);
      } else if (t === 'gradient' || t === 'image') {
        /* Land on the editor the BUTTON is about. The tab used to be derived from the object's
           current fill, so "Gradyan" opened Solid; and "Image" had no editor at all until the
           picker grew an Image tab (docs/editor-selection-textcase-colorpanel-fixes-2026-08-07.md
           F5). Text keeps target 'fill' here on purpose: #rp-uni-fill is the ONE fill control for
           both text and shapes, and 'fill' is what its swatch already uses. */
        if (typeof openColorPanel === 'function') {
          openColorPanel('fill', (document.getElementById('p-fill') || {}).value || '#ffffff', { tab: t });
        }
      } else if (typeof openColorPanel === 'function') {
        openColorPanel('fill', (document.getElementById('p-fill') || {}).value || '#ffffff');
      }
      var bts = pFillType.querySelectorAll('button'); for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i] === b);
      if (typeof _rpfToggleNoneBody === 'function') _rpfToggleNoneBody(pFillType);
    });
  }

  /* Opacity fans out through rpOpacityTargets. It used to write to getActiveObject(), which for a
     multi-selection is the wrapper fabric throws away on deselect: measured 2026-08-07, 40% on two
     texts left both at 100%. A real GROUP still keeps its own opacity - that one is a property of
     the group, not of its children. */
  var pOpacity = document.getElementById('p-opacity');
  if (pOpacity) {
    pOpacity.oninput = function (e) {
      var v = parseInt(e.target.value);
      rpApplyToTargets(rpOpacityTargets(), function (t) { t.set('opacity', v / 100); });
      var valEl = document.getElementById('p-opacity-val');
      if (valEl) valEl.textContent = v + '%';
      var nEl = document.getElementById('p-opacity-num');
      if (nEl && document.activeElement !== nEl) nEl.value = v;
    };
    pOpacity.onchange = snap;
  }

  var pOpacityNum = document.getElementById('p-opacity-num');
  if (pOpacityNum) {
    pOpacityNum.oninput = function (e) {
      var v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      rpApplyToTargets(rpOpacityTargets(), function (t) { t.set('opacity', v / 100); });
      var rng = document.getElementById('p-opacity'); if (rng) rng.value = v;
      var valEl = document.getElementById('p-opacity-val'); if (valEl) valEl.textContent = v + '%';
    };
    pOpacityNum.onchange = snap;
  }

  // Spacing/line-height/padding fan out to EVERY selected text (rpApplyToTexts). They used to
  // write to getActiveObject(), which for a multi-selection is the throwaway wrapper: the value
  // landed on nothing and was dropped on deselect.
  var pSpacing = document.getElementById('p-spacing');
  if (pSpacing) {
    pSpacing.oninput = function (e) {
      var v = (parseFloat(e.target.value) || 0) * 10;
      rpApplyToTexts(function (o) { o.set('charSpacing', v); });
    };
    pSpacing.onchange = snap;
  }

  var pLineH = document.getElementById('p-lineheight');
  if (pLineH) {
    pLineH.oninput = function (e) {
      var v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      var lh = Math.max(0.5, Math.min(3, v));
      rpApplyToTexts(function (o) {
        o.set('lineHeight', lh);
        if (o.initDimensions) o.initDimensions();
        o.setCoords();
      });
    };
    pLineH.onchange = snap;
  }

  var pPadding = document.getElementById('p-padding');
  if (pPadding) {
    pPadding.oninput = function (e) {
      var v = parseInt(e.target.value) || 0;
      rpApplyToTexts(function (o) { o.set('padding', v); o.setCoords(); });
    };
    pPadding.onchange = snap;
  }

  /* Spacing segment. "—" means DEFAULT spacing and resets the three values, which is what "—"
     means in every other segment in this panel (no shadow, no outline, no border). A pure
     show/hide toggle here would be the one "—" that changes nothing, and the fields would stay
     custom behind a control that says they are not. */
  var pSpacingSeg = document.getElementById('p-spacing-seg');
  if (pSpacingSeg) {
    pSpacingSeg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-spacing]') : null;
      if (!b) return;
      var bts = pSpacingSeg.querySelectorAll('button');
      for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i] === b);
      if (b.getAttribute('data-spacing') === 'none') {
        var D = _ccSpacingDefaults();
        rpApplyToTexts(function (o) {
          o.set({ charSpacing: D.letter * 10, lineHeight: D.line, padding: D.padding });
          if (typeof o.initDimensions === 'function') o.initDimensions();
          o.setCoords();
        });
        snap();
        if (typeof rpTextRep === 'function') syncAppearance(rpTextRep());
      }
      if (typeof _rpfToggleNoneBody === 'function') _rpfToggleNoneBody(pSpacingSeg);
    });
  }
}

if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.appearance.init', function () {
      if (typeof initAppearanceBindings === 'function') initAppearanceBindings();
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'appearance', parent: 'right-panel', title: 'Appearance', mount: function () {}, unmount: function () {} });
}
