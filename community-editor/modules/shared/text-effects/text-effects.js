/* ============================================================
   dika studio – Text effects: LETTER CASE
   Depends on: fabric, app.js (canvas, getActiveCanvas, snap, CUSTOM_PROPS),
   right-panel (rpTextTargets / rpApplyToTexts / rpTextRep).

   HISTORY, so nobody re-adds the dead half. This module used to BUILD its own "Text Effects"
   accordion into #rp-text (stroke colour/width, shadow colour/blur/offset, and letter case) and
   inject it before the delete block:

       var delBtn = rpText.querySelector('.del-btn');
       var deleteBlock = delBtn && delBtn.closest('.prop-block');
       if (!deleteBlock) return;

   The Figma redesign rebuilt #rp-text out of .rpf-sec blocks, so `.del-btn` / `.prop-block` stopped
   existing inside it and initTextEffects returned on that line on EVERY boot. Measured 2026-08-07:
   the module loaded, mounted, and did nothing - the letter-case buttons were in the source and
   unreachable from the product, which is exactly the owner's "text objesinin uppercase gibi
   fonksiyonları yok". Its stroke and shadow halves were superseded by the shipped #p-txfx-* and
   #p-shadow-* sections (real controls, real handlers in right-panel/shape), so they are gone rather
   than resurrected as a second way to set the same two properties. What survives is the one thing
   the new panel had no equivalent for: LETTER CASE, now bound to the shipped #p-case-* segment.

   REVERSIBLE (owner 2026-08-07). The old applyCase() overwrote obj.text, so "aa" after "AA" could
   never give the original mixed case back. The typed text is kept in _ccTextRaw and the active mode
   in _ccTextCase (both in CUSTOM_PROPS), so the case is a display state that can be switched or
   turned off. Editing on canvas re-captures the raw text, or the next switch would resurrect what
   the user typed three edits ago.

   Casing is locale-INVARIANT on purpose. dika studio is a global app and nothing here knows what
   language a text is in, so a Turkish dotted-I rule would be a guess applied to every user. Plain
   toUpperCase/toLowerCase is what the shipped code already did and what design tools do.
   ============================================================ */

var CC_TEXT_CASES = ['upper', 'lower', 'title'];

function _ccToTitleCase(str) {
  return String(str).replace(/\S+/g, function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

function _ccTransformCase(str, mode) {
  if (mode === 'upper') return String(str).toUpperCase();
  if (mode === 'lower') return String(str).toLowerCase();
  if (mode === 'title') return _ccToTitleCase(str);
  return String(str);
}

/* Write a case onto ONE text. mode '' turns it off and restores the typed text. */
function _ccApplyCaseTo(o, mode) {
  if (!o || o.text == null) return;
  // First transform on this object: whatever is on screen IS the typed text.
  if (!o._ccTextCase) o._ccTextRaw = o.text;
  if (o._ccTextRaw == null) o._ccTextRaw = o.text;
  o._ccTextCase = mode || '';
  var next = _ccTransformCase(o._ccTextRaw, o._ccTextCase);
  if (next !== o.text) {
    o.set('text', next);
    if (typeof o.initDimensions === 'function') o.initDimensions();
    o.setCoords();
  }
  if (!o._ccTextCase) delete o._ccTextRaw;   // nothing to hold once the case is off
}

/* Public apply: fans out to every selected text through the right panel's own resolver, so a case
   picked over several texts lands on all of them instead of on the throwaway selection wrapper. */
function applyTextCase(mode) {
  var n = (typeof rpApplyToTexts === 'function')
    ? rpApplyToTexts(function (o) { _ccApplyCaseTo(o, mode); })
    : 0;
  if (!n) {
    var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
    var o = c && c.getActiveObject();
    if (!o || o.text == null) return;
    _ccApplyCaseTo(o, mode);
    c.renderAll();
    n = 1;
  }
  if (typeof snap === 'function') snap();
  if (typeof syncTextCase === 'function') {
    syncTextCase((typeof rpTextRep === 'function' && rpTextRep()) || null);
  }
}

/* obj -> the two segments. Called by syncRightPanel for any text selection. */
function syncTextCase(obj) {
  var seg = document.getElementById('p-case-seg');
  var opts = document.getElementById('p-case-opts');
  if (!seg || !opts) return;
  if (!obj && typeof rpTextRep === 'function') obj = rpTextRep();
  var mode = (obj && obj._ccTextCase) || '';
  var segBtns = seg.querySelectorAll('button');
  for (var i = 0; i < segBtns.length; i++) {
    segBtns[i].classList.toggle('on', (segBtns[i].getAttribute('data-case') === 'none') === !mode);
  }
  var optBtns = opts.querySelectorAll('button');
  for (var j = 0; j < optBtns.length; j++) {
    optBtns[j].classList.toggle('on', optBtns[j].getAttribute('data-casemode') === mode);
  }
}

function initTextEffects() {
  var seg = document.getElementById('p-case-seg');
  var opts = document.getElementById('p-case-opts');
  if (!seg || !opts) return;

  seg.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-case]') : null;
    if (!b) return;
    if (b.getAttribute('data-case') === 'none') {
      applyTextCase('');
    } else {
      // Opening the section with nothing chosen yet defaults to UPPERCASE, which is what the
      // control is reached for; a segment that opens and changes nothing reads as broken.
      var cur = (typeof rpTextRep === 'function' && rpTextRep()) || null;
      applyTextCase((cur && cur._ccTextCase) || 'upper');
    }
    if (typeof _rpfToggleNoneBody === 'function') _rpfToggleNoneBody(seg);
  });

  opts.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-casemode]') : null;
    if (!b) return;
    var mode = b.getAttribute('data-casemode');
    var cur = (typeof rpTextRep === 'function' && rpTextRep()) || null;
    // Clicking the active mode turns it off, the same way the Effects presets do.
    applyTextCase((cur && cur._ccTextCase === mode) ? '' : mode);
    if (typeof _rpfToggleNoneBody === 'function') _rpfToggleNoneBody(seg);
  });

  /* EDITING HAPPENS ON THE RAW TEXT. While a case is active the canvas shows the transform, so if
     the user edited THAT, every keystroke would be captured into _ccTextRaw already transformed and
     turning the case off would hand them back SHOUTING TEXT they never typed - the reversibility
     the owner asked for would only survive until the first edit.

     So: entering the editor swaps the object back to what was typed, typing updates the raw copy
     directly, and leaving re-applies the case. The visible cost is that a text reads in its typed
     case for as long as the caret is in it; the alternative was a live diff of the transformed
     string back onto the raw one, which is a lot of machinery to get the same answer less
     reliably. */
  var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
  if (cvs && cvs.on) {
    cvs.on('text:editing:entered', function (e) {
      var o = e && e.target;
      if (!o || !o._ccTextCase || o._ccTextRaw == null) return;
      if (o.text === o._ccTextRaw) return;
      o.set('text', o._ccTextRaw);
      if (typeof o.initDimensions === 'function') o.initDimensions();
      o.dirty = true;
      cvs.requestRenderAll();
    });

    // Typing while the editor is open: what is on screen IS the raw text, so record it as such.
    cvs.on('text:changed', function (e) {
      var o = e && e.target;
      if (!o || !o._ccTextCase || o.text == null) return;
      o._ccTextRaw = o.text;
    });

    cvs.on('text:editing:exited', function (e) {
      var o = e && e.target;
      if (!o || !o._ccTextCase) return;
      o._ccTextRaw = o.text;              // last word in, before the transform goes back on
      _ccApplyCaseTo(o, o._ccTextCase);
      o.dirty = true;
      cvs.requestRenderAll();
      if (typeof snap === 'function') snap();
    });
  }
}

// Faz 8: shared module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('shared.text-effects', initTextEffects); });
else document.addEventListener('DOMContentLoaded', function () { initTextEffects(); });

// Modular skeleton hook (Faz 8) — text-effects is now a shared loader module (modules/shared/).
if (window.cc && cc.modules) cc.modules.register({ id: 'text-effects', parent: 'shared', title: 'Text effects', mount: function () {}, unmount: function () {} });
