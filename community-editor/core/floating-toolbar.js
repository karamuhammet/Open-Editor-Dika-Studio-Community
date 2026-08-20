/* ============================================================
   dika studio core — FLOATING TOOLBAR (selection toolbar). Extracted from app.js §14 (Faz 8 core
   slimming). Flat global before app.js: initFloatingToolbar (initApp calls it) + updateFloatTB
   (fired by every selection change, many callers) + ft* panel/align/text-style helpers stay window
   globals. Uses canvas/getActiveCanvas/snap + the floating-toolbar DOM at RUNTIME.
   ============================================================ */

// ── 14. Floating Toolbar ─────────────────────────────────────
function initFloatingToolbar() {
  var floatTB = document.getElementById('float-tb');
  if (!floatTB) return;

  // Prevent rpanel interactions from stealing focus from canvas (avoids false selection:cleared)
  var rpanelEl = document.getElementById('rpanel');
  if (rpanelEl) {
    rpanelEl.addEventListener('mousedown', function (e) {
      var tag = e.target.tagName;
      // Allow native interaction for inputs/selects/buttons but prevent canvas focus loss
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
        e.preventDefault();
      }
    });

    // ── Right panel toggle button ──
    // initRpanelToggle(rpanelEl) → self-inits in modules/right-panel/ on 'cc:canvas-ready' (Faz 6b)
  }

  canvas.on('selection:created', function () { syncRightPanel(); updateFloatTB(); });
  canvas.on('selection:updated', function () { syncRightPanel(); updateFloatTB(); });
  canvas.on('selection:cleared', function () {
    // Guard: if an object is still active (e.g., blur-triggered false clear), don't hide panels
    if (canvas.getActiveObject()) return;
    if (window.VEInspector && VEInspector.hideDocked) VEInspector.hideDocked(); // restore normal panel from a docked media-clip inspector
    var rpEmpty = document.getElementById('rp-empty');
    if (rpEmpty) rpEmpty.style.display = '';
    var rpBg = document.getElementById('rp-bg-panel');
    if (rpBg) { rpBg.style.display = ''; if (typeof rpfSyncBgPanel === 'function') rpfSyncBgPanel(); }
    // THIS list is what actually clears the Properties panel on deselect -
    // syncRightPanel's !obj branch rarely runs (see kb/editor/context.md §8.4).
    // A new type-specific section MUST be added here or it stays on screen
    // forever after its object is deselected.
    ['rp-fig-bar', 'rp-uni-appearance', 'rp-selcolors', 'rp-shadow', 'rp-text-fx', 'rp-text', 'rp-shape', 'rp-image', 'rp-qr', 'rp-board', 'rp-chart', 'rp-effect', 'rp-perspective', 'rp-design-fields'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Show page-level design note when nothing selected
    var rpPageNote = document.getElementById('rp-page-design-note');
    if (rpPageNote) { rpPageNote.style.display = ''; if (typeof _syncPageDesignNote === 'function') _syncPageDesignNote(); }
    floatTB.classList.remove('show');
    if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
    if (typeof refreshStructure === 'function') refreshStructure();
    // Show BG effects panel if background image exists
    if (typeof syncBgEffectsPanel === 'function') syncBgEffectsPanel();
    // Close color picker panel if open
    var cpWrap = document.getElementById('rp-color-wrap');
    if (cpWrap && cpWrap.style.display !== 'none' && typeof closeColorPanel === 'function') closeColorPanel();
    // Refresh layers panel on deselection
    var lyWrap = document.getElementById('rp-layers-wrap');
    if (lyWrap && lyWrap.style.display !== 'none' && typeof refreshInlineLayers === 'function') refreshInlineLayers();
    if (window.wbActive) {
      var rp = document.querySelector('.rpanel');
      if (rp) rp.classList.add('wb-hidden');
      var rpTgl = document.getElementById('rp-toggle-btn');
      if (rpTgl) rpTgl.style.display = 'none';
    }
  });
  canvas.on('object:moving', updateFloatTB);
  canvas.on('object:scaling', updateFloatTB);
  canvas.on('object:rotating', updateFloatTB);
  _ftInitShellScrollLock();
  canvas.on('text:editing:entered', function (opt) {
    // Fabric appends its hidden textarea to <body> and positions it over the caret, so for a
    // text near the canvas edge it lands OUTSIDE the viewport (measured: top 904 with a 560px
    // viewport). That absolutely-positioned element extends the document's own scroll range
    // (measured: 372px), and anything that then scrolls it into view drags the whole fixed
    // shell up and leaves a gap. Proof the mechanism is armed even though a synthetic event
    // will not fire it: scrollIntoView() on that textarea moves <html> 0 -> 244.
    //
    // Two layers, because the trigger could not be reproduced synthetically (a real user
    // gesture is a trusted event and the browser treats focus-scroll differently), so the
    // fix must hold regardless of WHAT scrolls: (1) make every focus scroll-free, (2) pin the
    // shell for as long as editing lasts. A one-shot reset here cannot catch an asynchronous
    // scroll, which is exactly why the video editor grew _veScrollLock (events.js ~:193).
    var tObj = opt && opt.target;
    if (tObj && tObj.hiddenTextarea && !tObj.hiddenTextarea._ccNoScrollFocus) {
      tObj.hiddenTextarea._ccNoScrollFocus = true;
      tObj.hiddenTextarea.focus = function () {
        HTMLElement.prototype.focus.call(this, { preventScroll: true });
      };
    }
    _ftLockShellScroll(true);
    requestAnimationFrame(updateFloatTB);
  });
  canvas.on('text:editing:exited', function () { _ftLockShellScroll(false); updateFloatTB(); });
  canvas.on('text:selection:changed', function () { _syncTextSelectionFormat(); });
  canvas.on('text:changed', function () { updateFloatTB(); });
}

function updateFloatTB() {
  var floatTB = document.getElementById('float-tb');
  if (!floatTB) return;
  var cvs = getActiveCanvas();
  var obj = cvs.getActiveObject();
  // Power window shapes (owner 2026-07-17): stay selectable/draggable on canvas, but the generic
  // object toolbar must NOT appear for them. Its Delete only removed the transient fabric shape,
  // not the window data, so the window "came back" and looked undeletable. They are managed (and
  // really deleted) in Renk Araçları; hiding this bar removes the lying delete path entirely.
  if (!obj || obj._isPowerWindow) {
    floatTB.classList.remove('show');
    _ftCloseAllPanels();
    return;
  }
  var bound = obj.getBoundingRect();
  var canvasEl = cvs.lowerCanvasEl;
  var rect = canvasEl.getBoundingClientRect();
  var sx = rect.width / canvas.getWidth();
  var sy = rect.height / canvas.getHeight();
  var left = rect.left + bound.left * sx + (bound.width * sx) / 2;
  var bottom = rect.top + bound.top * sy + bound.height * sy + 10;
  floatTB.classList.add('show');
  floatTB.style.left = left + 'px';
  // On the board the bottom is occupied by #page-tabs-bar (36px) + #wb-floating-bar
  // (20-64px band), so reserve more clearance there; normal editor keeps the 46px.
  var _tbReserve = window.wbActive ? 112 : 46;
  floatTB.style.top = Math.min(bottom, window.innerHeight - _tbReserve) + 'px';

  // scene: when a whole FRAME (or a frame-only multi-selection) is selected, trim this generic bar to the
  // few useful actions (duplicate / rotate / lock / delete) — the frame's own context bar + the real
  // Layers panel own the rest. Editing a CHILD inside an entered frame keeps the FULL bar (it's for that).
  var _isFrameSel = !!(obj && (obj._ccFrame ||
    (obj.type === 'activeSelection' && obj.getObjects().length && obj.getObjects().every(function (o) { return o._ccFrame; }))));
  floatTB.classList.toggle('ft-frame-only', _isFrameSel);

  // Show merge/clip button only when exactly 1 image + 1 shape selected
  var ftClipBtn = document.getElementById('ft-clip-btn');
  if (ftClipBtn) {
    var canClip = false;
    if (obj && obj.type === 'activeSelection') {
      var sel = obj.getObjects();
      var imgCount = sel.filter(function(o) { return o.type === 'image' && !o.isQR; }).length;
      var shapeCount = sel.filter(function(o) { return o.type === 'rect' || o.type === 'circle' || o.type === 'ellipse' || o.type === 'triangle' || o.type === 'polygon' || o.type === 'path'; }).length;
      canClip = imgCount === 1 && shapeCount === 1 && sel.length === 2;
    }
    ftClipBtn.style.display = canClip ? '' : 'none';
  }

  // ── Text trigger visibility ──
  var ftTextTrigger = document.getElementById('ft-text-trigger');
  if (ftTextTrigger) {
    var isText = obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text';
    ftTextTrigger.style.display = isText ? '' : 'none';
    if (isText) _updateTextFormatButtons(obj);
  }

  // ── Remove Background button visibility (image only) ──
  var ftRmbgBtn = document.getElementById('ft-rmbg-btn');
  if (ftRmbgBtn) {
    var isImg = obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
    ftRmbgBtn.style.display = isImg ? '' : 'none';
  }

  // ── Upscale button visibility (image only) ──
  var ftUpscaleBtn = document.getElementById('ft-upscale');
  if (ftUpscaleBtn) {
    var isImgUp = obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
    ftUpscaleBtn.style.display = isImgUp ? '' : 'none';
  }

  // ── AI Edit button visibility (image only) ──
  var ftAiEditBtn = document.getElementById('ft-ai-edit');
  if (ftAiEditBtn) {
    var isImgAe = obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
    ftAiEditBtn.style.display = isImgAe ? '' : 'none';
  }

  // ── Crop button visibility (image only) ──
  var ftCropBtn = document.getElementById('ft-crop-btn');
  if (ftCropBtn) {
    var isImgCrop = obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
    ftCropBtn.style.display = isImgCrop ? '' : 'none';
  }

  // ── Selection tools trigger (image only) ──
  var ftSelTrigger = document.getElementById('ft-sel-trigger');
  if (ftSelTrigger) {
    var isImgSel = obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
    ftSelTrigger.style.display = isImgSel ? '' : 'none';
  }

  // ── Save to My Shapes (path/brush shape only) ──
  var ftSaveShapeBtn = document.getElementById('ft-save-shape-btn');
  if (ftSaveShapeBtn) {
    var isShape = (typeof window.isSavableMyShapeObject === 'function')
      ? window.isSavableMyShapeObject(obj)
      : (obj.type === 'path' || obj._isBrushShape || obj._isMyShapeAsset);
    ftSaveShapeBtn.style.display = isShape ? '' : 'none';
  }

  // ── Group/Ungroup visibility ──
  var grpBtn = document.getElementById('ft-group-btn');
  var ungrpBtn = document.getElementById('ft-ungroup-btn');
  var grpSep = document.getElementById('ft-group-sep');
  var showGroup = obj.type === 'activeSelection' && obj.getObjects().length > 1;
  var showUngroup = obj.type === 'group';
  if (grpBtn) grpBtn.style.display = showGroup ? '' : 'none';
  if (ungrpBtn) ungrpBtn.style.display = showUngroup ? '' : 'none';
  if (grpSep) grpSep.style.display = (showGroup || showUngroup) ? '' : 'none';

  // ── Lock Frame button (only when exactly 1 frame + 1 image selected) ──
  var ftLockFrameBtn = document.getElementById('ft-lock-frame-btn');
  if (ftLockFrameBtn) {
    var showLockFrame = false;
    if (obj.type === 'activeSelection') {
      var selObjs = obj.getObjects();
      if (selObjs.length === 2) {
        var hasImg = selObjs.some(function (o) { return o.type === 'image' && !o.isQR && !o._isFrame; });
        var hasFrame = selObjs.some(function (o) { return o._isFrame && !o._isClippedImage && !o._isClipFrame; });
        showLockFrame = hasImg && hasFrame;
      }
    }
    ftLockFrameBtn.style.display = showLockFrame ? '' : 'none';
  }

  // ── Frame BG Remove button (free frame + image, not locked/clipped) ──
  var ftFrameRmbgBtn = document.getElementById('ft-frame-rmbg-btn');
  if (ftFrameRmbgBtn) {
    var showFrameRmbg = false;
    if (obj.type === 'activeSelection') {
      var selR = obj.getObjects();
      if (selR.length === 2) {
        var hasImgR = selR.some(function (o) { return o.type === 'image' && !o.isQR && !o._isFrame && !o._isClippedImage && !o._isClipFrame; });
        var hasFreeFrame = selR.some(function (o) { return o._isFrame && !o._isClippedImage && !o._isClipFrame && !o._boundImageUid; });
        showFrameRmbg = hasImgR && hasFreeFrame;
      }
    }
    ftFrameRmbgBtn.style.display = showFrameRmbg ? '' : 'none';
  }

  // Close any open panel when toolbar repositions
  _ftCloseAllPanels();
}

/* ══════════════════════════════════════════════════════════════
   Float toolbar dropdown panels (fixed-position, JS-positioned)
   ══════════════════════════════════════════════════════════════ */
var _ftOpenPanel = null;

function _ftCloseAllPanels() {
  document.querySelectorAll('.ft-panel.open').forEach(function(p) { p.classList.remove('open'); });
  document.querySelectorAll('.ft-dd-trigger.active').forEach(function(t) { t.classList.remove('active'); });
  _ftOpenPanel = null;
}

function _ftShowPanel(panelId, triggerEl) {
  var panel = document.getElementById(panelId);
  if (!panel || !triggerEl) return;

  var isOpen = panel.classList.contains('open');
  _ftCloseAllPanels();
  if (isOpen) return; // was open, now closed — toggle off

  // Position panel above the trigger button
  var rect = triggerEl.getBoundingClientRect();
  var panelW = 200; // estimated min-width
  var left = rect.left + rect.width / 2 - panelW / 2;

  // Keep panel within viewport
  if (left < 8) left = 8;
  if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;

  panel.style.left = left + 'px';
  panel.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  panel.style.top = 'auto';
  panel.classList.add('open');
  triggerEl.classList.add('active');
  _ftOpenPanel = panelId;
}

function ftDDAction(action) {
  _ftCloseAllPanels();

  // Layer actions
  if (action === 'forward' || action === 'backward' || action === 'toFront' || action === 'toBack') {
    ftAction(action);
    return;
  }
  // Align actions
  if (action.indexOf('align') === 0) {
    var dir = action.replace('align', '');
    dir = dir.charAt(0).toLowerCase() + dir.slice(1);
    ftAlignObj(dir);
    return;
  }
  // Text style actions
  if (action === 'bold' || action === 'italic' || action === 'underline' || action === 'linethrough') {
    ftToggleTextStyle(action);
    return;
  }
  // Selection tool actions
  if (action === 'selQuick') {
    if (typeof activateSelectionTool === 'function') activateSelectionTool('quick');
    return;
  }
  if (action === 'selLasso') {
    if (typeof activateSelectionTool === 'function') activateSelectionTool('lasso');
    return;
  }
  if (action === 'selPolygon') {
    if (typeof activateSelectionTool === 'function') activateSelectionTool('polygon');
    return;
  }
  // Remove Background actions
  if (action === 'rmbgClassic') {
    if (typeof removeImageBg === 'function') removeImageBg();
    return;
  }
  if (action === 'rmbgBrush') {
    if (typeof activateBrushEraser === 'function') activateBrushEraser();
    return;
  }
  // Style copy/paste
  if (action === 'copyStyle') {
    if (typeof copyStyle === 'function') copyStyle();
    return;
  }
  if (action === 'pasteStyle') {
    if (typeof pasteStyle === 'function') pasteStyle();
    return;
  }
}

(function() {
  // Close panels on any outside click
  document.addEventListener('click', function(e) {
    if (_ftOpenPanel) {
      var panel = document.getElementById(_ftOpenPanel);
      var trigger = document.querySelector('.ft-dd-trigger.active');
      if (panel && !panel.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
        _ftCloseAllPanels();
      }
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    // Attach click to all .ft-dd-trigger buttons
    document.querySelectorAll('.ft-dd-trigger[data-ft-dd]').forEach(function(trigger) {
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var panelId = trigger.getAttribute('data-ft-dd');
        _ftShowPanel(panelId, trigger);
      });
    });
  });
})();

/* ── Align object to canvas page ── */
function ftAlignObj(dir) {
  var cvs = getActiveCanvas();
  var obj = cvs.getActiveObject();
  if (!obj) return;
  var cw = cvs.getWidth();
  var ch = cvs.getHeight();
  var bound = obj.getBoundingRect(true, true);
  var oLeft = obj.left - bound.left;
  var oTop = obj.top - bound.top;

  switch (dir) {
    case 'left':    obj.set('left', oLeft); break;
    case 'centerH': obj.set('left', oLeft + (cw - bound.width) / 2); break;
    case 'right':   obj.set('left', oLeft + cw - bound.width); break;
    case 'top':     obj.set('top', oTop); break;
    case 'centerV': obj.set('top', oTop + (ch - bound.height) / 2); break;
    case 'bottom':  obj.set('top', oTop + ch - bound.height); break;
  }
  obj.setCoords();
  cvs.renderAll();
  snap();
  updateFloatTB();
}

/* ── Text format toggle from float toolbar ── */
function ftToggleTextStyle(style) {
  var cvs = getActiveCanvas();
  var obj = cvs.getActiveObject();
  if (!obj) return;

  // Per-character styling when text is being edited with a selection
  if (obj.isEditing && obj.selectionStart !== obj.selectionEnd) {
    var selStart = obj.selectionStart;
    var selEnd = obj.selectionEnd;
    var styleMap = {};
    if (style === 'bold') {
      // Check if selection is already bold
      var allBold = true;
      for (var ci = selStart; ci < selEnd; ci++) {
        var cs = obj.getSelectionStyles(ci, ci + 1)[0] || {};
        var fw = cs.fontWeight || obj.fontWeight || 'normal';
        if (fw !== 'bold' && fw < 700) { allBold = false; break; }
      }
      styleMap.fontWeight = allBold ? 'normal' : 'bold';
    } else if (style === 'italic') {
      var allItalic = true;
      for (var ci2 = selStart; ci2 < selEnd; ci2++) {
        var cs2 = obj.getSelectionStyles(ci2, ci2 + 1)[0] || {};
        var fst = cs2.fontStyle || obj.fontStyle || 'normal';
        if (fst !== 'italic') { allItalic = false; break; }
      }
      styleMap.fontStyle = allItalic ? 'normal' : 'italic';
    } else if (style === 'underline') {
      var allUl = true;
      for (var ci3 = selStart; ci3 < selEnd; ci3++) {
        var cs3 = obj.getSelectionStyles(ci3, ci3 + 1)[0] || {};
        if (!(cs3.underline !== undefined ? cs3.underline : obj.underline)) { allUl = false; break; }
      }
      styleMap.underline = !allUl;
    } else if (style === 'linethrough') {
      var allLt = true;
      for (var ci4 = selStart; ci4 < selEnd; ci4++) {
        var cs4 = obj.getSelectionStyles(ci4, ci4 + 1)[0] || {};
        if (!(cs4.linethrough !== undefined ? cs4.linethrough : obj.linethrough)) { allLt = false; break; }
      }
      styleMap.linethrough = !allLt;
    }
    obj.setSelectionStyles(styleMap);
  } else {
    // Whole-object styling when no selection
    if (style === 'bold') {
      var isBold = obj.fontWeight === 'bold' || obj.fontWeight >= 700;
      obj.set('fontWeight', isBold ? 'normal' : 'bold');
    } else if (style === 'italic') {
      var isItalic = obj.fontStyle === 'italic';
      obj.set('fontStyle', isItalic ? 'normal' : 'italic');
    } else if (style === 'underline') {
      obj.set('underline', !obj.underline);
    } else if (style === 'linethrough') {
      obj.set('linethrough', !obj.linethrough);
    }
  }
  cvs.renderAll();
  snap();
  _updateTextFormatButtons(obj);
  // Sync the right panel through ITS OWN sync function rather than hand-toggling a subset of
  // its buttons from here. This block only knew about #p-bold/#p-italic, so the Underline and
  // Strikethrough toggles ported into the panel would have gone stale whenever the style was
  // changed from this toolbar instead of from the panel.
  if (typeof syncTypography === 'function') syncTypography(obj);
}

/* ── Shell scroll lock during text editing ────────────────────────────────────────────────
   The shell is designed never to scroll: html/body are height:100% + overflow:hidden and the
   canvas is panned with fabric's viewportTransform, not with scrollTop. So any scroll of the
   shell while editing is the hidden-textarea artefact, and zeroing it is always correct.

   A scroll LISTENER cannot be used here, which is worth knowing before someone tries again:
   measured in this shell, setting documentElement.scrollTop = 100 and canvas-area.scrollTop =
   50 both took effect and fired NO scroll event on window, document (capture or bubble),
   documentElement, body or the element itself. These boxes are all overflow:hidden. So the
   fix closes the TRIGGER instead of reacting to it.
   (Same reason VE._veScrollLock, video-editor/events/events.js ~:193, cannot be doing
   anything: it is a capture 'scroll' listener over these same non-firing elements.) */
function _ftShellScrollTargets() {
  var els = [document.documentElement, document.body];
  ['canvas-area', 'card-stage-container', 'card-stage'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) els.push(e);
  });
  var cc = document.querySelector('.canvas-container');
  if (cc) els.push(cc);
  return els;
}

function _ftResetShellScroll() {
  _ftShellScrollTargets().forEach(function (e) {
    if (e.scrollTop) e.scrollTop = 0;
    if (e.scrollLeft) e.scrollLeft = 0;
  });
}

/* THE fix: make every focus of a hidden textarea scroll-free, including fabric's FIRST one.
   fabric.IText.enterEditing calls initHiddenTextarea() and then hiddenTextarea.focus()
   BEFORE it fires text:editing:entered, so a guard installed from that event can only ever
   undo the first scroll after the fact, never prevent it. Patching at creation covers the
   first focus and every later refocus, which is the only armed mechanism here: the textarea
   is appended to <body> at the caret's page position, so for a text near the canvas edge it
   lands off-screen (measured: top 904 in a 560px viewport) and extends the document's own
   scroll range (measured: 372px), and scrolling it into view drags the fixed shell up and
   leaves the gap (measured: scrollIntoView moved <html> 0 -> 244). */
function _ftInitShellScrollLock() {
  if (_ftInitShellScrollLock._done) return;
  if (!window.fabric || !fabric.IText || !fabric.IText.prototype.initHiddenTextarea) return;
  _ftInitShellScrollLock._done = true;
  var _origInit = fabric.IText.prototype.initHiddenTextarea;
  fabric.IText.prototype.initHiddenTextarea = function () {
    _origInit.apply(this, arguments);
    var ta = this.hiddenTextarea;
    if (ta && !ta._ccNoScrollFocus) {
      ta._ccNoScrollFocus = true;
      ta.focus = function () { HTMLElement.prototype.focus.call(this, { preventScroll: true }); };
    }
  };
}

function _ftLockShellScroll(on) {
  // Backstop only: the prototype patch above is what prevents the scroll. This straightens the
  // shell if anything got past it (an older textarea created before the patch, say).
  if (on) _ftResetShellScroll();
}

function _updateTextFormatButtons(obj) {
  var b = document.getElementById('ft-bold');
  var i = document.getElementById('ft-italic');
  var u = document.getElementById('ft-underline');
  var s = document.getElementById('ft-linethrough');
  // If editing with selection, reflect selection styles
  if (obj.isEditing && obj.selectionStart !== obj.selectionEnd) {
    var ss = obj.getSelectionStyles(obj.selectionStart, obj.selectionStart + 1)[0] || {};
    var fw = ss.fontWeight || obj.fontWeight || 'normal';
    var fs = ss.fontStyle || obj.fontStyle || 'normal';
    var ul = ss.underline !== undefined ? ss.underline : obj.underline;
    var lt = ss.linethrough !== undefined ? ss.linethrough : obj.linethrough;
    if (b) b.classList.toggle('active', fw === 'bold' || fw >= 700);
    if (i) i.classList.toggle('active', fs === 'italic');
    if (u) u.classList.toggle('active', !!ul);
    if (s) s.classList.toggle('active', !!lt);
  } else {
    if (b) b.classList.toggle('active', obj.fontWeight === 'bold' || obj.fontWeight >= 700);
    if (i) i.classList.toggle('active', obj.fontStyle === 'italic');
    if (u) u.classList.toggle('active', !!obj.underline);
    if (s) s.classList.toggle('active', !!obj.linethrough);
  }
}

/* Update text format button state when selection changes inside text */
function _syncTextSelectionFormat() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  var obj = cvs.getActiveObject();
  if (!obj || !(obj.type === 'i-text' || obj.type === 'textbox')) return;
  _updateTextFormatButtons(obj);
}

// ── 15-16. Right Panel (Property Editor + Bindings) — MOVED to core/right-panel.js (Faz 3).
//   syncRightPanel / initPropertyBindings / setAlign / panel toggle / board variants are global
//   there (index.html <script> before app.js); app.js selection handlers + initApp still call them.

