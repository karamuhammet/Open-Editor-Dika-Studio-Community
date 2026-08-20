/* Sub-module: right-panel/typography — the Typography category of the property editor
   (Faz 6b-2, first CATEGORY sub-module). Owns the text font controls (#p-font / #p-size /
   #p-bold / #p-italic — the data-accordion="typography" section that stays in index.html).
   appliesTo: text objects. The parent right-panel delegates sync to window.syncTypography
   (via cc.safe) inside its isText branch; bindings self-init on the sticky cc:canvas-ready
   event INSIDE cc.safe → a typography failure can't take down the parent or sibling sections
   (appearance/effects). Deps getActiveCanvas / snap / ftToggleTextStyle are app globals. */

// obj → inputs (called by the parent for text objects)
function syncTypography(obj) {
  if (!obj) return;
  var pFont = document.getElementById('p-font');
  var pSize = document.getElementById('p-size');
  var pBold = document.getElementById('p-bold');
  var pItalic = document.getElementById('p-italic');
  var pUnderline = document.getElementById('p-underline');
  var pLinethrough = document.getElementById('p-linethrough');
  if (pFont) pFont.value = obj.fontFamily || 'DM Sans';
  if (pSize) pSize.value = obj.fontSize || 16;
  if (pBold) pBold.classList.toggle('on', obj.fontWeight === 'bold' || obj.fontWeight >= 700);
  if (pItalic) pItalic.classList.toggle('on', obj.fontStyle === 'italic');
  if (pUnderline) pUnderline.classList.toggle('on', !!obj.underline);
  if (pLinethrough) pLinethrough.classList.toggle('on', !!obj.linethrough);
}

// inputs → obj (wired once at init)
function initTypographyBindings() {
  var pFont = document.getElementById('p-font');
  if (pFont) {
    pFont.onchange = function (e) {
      var c = getActiveCanvas(), o = c.getActiveObject();
      if (o) { o.set('fontFamily', e.target.value); c.renderAll(); snap(); }
    };
  }

  var pSize = document.getElementById('p-size');
  if (pSize) {
    pSize.oninput = function (e) {
      var v = parseInt(e.target.value) || 16;
      rpApplyToTexts(function (o) {
        o.set('fontSize', v);
        // Fit a Textbox to its content so the box doesn't stay wider than the text.
        if (o.type === 'textbox' && o.calcTextWidth) o.set('width', Math.max(20, Math.ceil(o.calcTextWidth()) + 6));
        if (typeof o.initDimensions === 'function') o.initDimensions();
        o.setCoords();
      });
    };
    pSize.onchange = snap;
  }

  var pBold = document.getElementById('p-bold');
  if (pBold) {
    pBold.onclick = function () {
      ftToggleTextStyle('bold');
    };
  }

  var pItalic = document.getElementById('p-italic');
  if (pItalic) {
    pItalic.onclick = function () {
      ftToggleTextStyle('italic');
    };
  }

  // Underline + Strikethrough: the same ported wiring as Bold/Italic above. These already
  // existed in the floating toolbar (#ft-underline / #ft-linethrough) and were simply missing
  // from this panel, so they call the SAME global apply function rather than repeating its
  // per-character-selection logic. ftToggleTextStyle refreshes both toolbars afterwards.
  var pUnderline = document.getElementById('p-underline');
  if (pUnderline) {
    pUnderline.onclick = function () { _typoToggleStyle('underline'); };
  }

  var pLinethrough = document.getElementById('p-linethrough');
  if (pLinethrough) {
    pLinethrough.onclick = function () { _typoToggleStyle('linethrough'); };
  }
}

/* One text keeps the full floating-toolbar path (it handles a per-character selection inside
   the text, which only exists while editing ONE object). Several texts cannot have a character
   selection, so they take a plain uniform toggle: decide the new value once from the first
   member, then set it on all of them, which also converges a mixed set instead of flipping
   each one independently. */
function _typoToggleStyle(prop) {
  var targets = (typeof rpTextTargets === 'function') ? rpTextTargets() : [];
  if (targets.length <= 1) { ftToggleTextStyle(prop); return; }
  var val = !targets[0][prop];
  rpApplyToTexts(function (o) { o.set(prop, val); });
  snap();
  if (typeof syncTypography === 'function') syncTypography(targets[0]);
}

// Self-init bindings on the sticky lifecycle event, fault-isolated; register under the parent.
if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.typography.init', function () {
      if (typeof initTypographyBindings === 'function') initTypographyBindings();
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'typography', parent: 'right-panel', title: 'Typography', mount: function () {}, unmount: function () {} });
}
