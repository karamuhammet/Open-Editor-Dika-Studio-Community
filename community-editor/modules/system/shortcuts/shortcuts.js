/* ===== Keyboard Shortcuts System ===== */

const SHORTCUTS = [
  { category: 'General', shortcuts: [
    { keys: ['Ctrl', 'Z'], action: 'Undo', fn: function () { undo(); } },
    { keys: ['Ctrl', 'Y'], action: 'Redo', fn: function () { redo(); } },
    { keys: ['Ctrl', 'S'], action: 'Export Card (Save)', fn: function () { exportCardFile(); } },
    { keys: ['Ctrl', 'Shift', 'S'], action: 'Share', fn: function () { if (typeof toggleShareMenu === 'function') toggleShareMenu(); } },
    { keys: ['Delete'], action: 'Delete Selected', fn: function () { delSelected(); } },
    { keys: ['Backspace'], action: 'Delete Selected', fn: null },
    { keys: ['Escape'], action: 'Deselect / Close Modal', fn: function () { handleEscape(); } },
  ]},
  { category: 'Infinite Canvas', shortcuts: [
    // Display-only here — the real bindings are scene-scoped via keyboard-manager registerCommand
    // (toolbar.js _registerSceneShortcuts); these fire ONLY in infinite/scene mode.
    { keys: ['V'], action: 'Tool: Select / Move', fn: null },
    { keys: ['H'], action: 'Tool: Hand (pan)', fn: null },
    { keys: ['F'], action: 'Tool: Draw frame', fn: null },
    { keys: ['I'], action: 'Tool: Add image', fn: null },
    { keys: ['T'], action: 'Tool: Text', fn: null },
    { keys: ['P'], action: 'Tool: Pen', fn: null },
    { keys: ['Shift', 'P'], action: 'Pen: Freeform', fn: null },
    { keys: ['L'], action: 'Pen: Line', fn: null },
    { keys: ['R'], action: 'Tool: Shapes', fn: null },
    { keys: ['Space'], action: 'Temporary pan (hold)', fn: null },
  ]},
  { category: 'Edit', shortcuts: [
    { keys: ['Ctrl', 'D'], action: 'Duplicate Selected', fn: function () { duplicateSelected(); } },
    { keys: ['Ctrl', 'C'], action: 'Copy', fn: function () { copySelected(); } },
    { keys: ['Ctrl', 'V'], action: 'Paste', fn: function () { if (clipboardObj) { pasteClipboard(); return true; } return false; } },
    { keys: ['Ctrl', 'X'], action: 'Cut', fn: function () { cutSelected(); } },
    { keys: ['Ctrl', 'A'], action: 'Select All', fn: function () { selectAll(); } },
    { keys: ['Ctrl', 'L'], action: 'Lock/Unlock Selected', fn: function () { toggleLockSelected(); } },
    { keys: ['Ctrl', 'M'], action: 'Clip Image into Shape', fn: function () { if (typeof clipImageIntoShape === 'function') clipImageIntoShape(); } },
    { keys: ['Ctrl', 'Alt', 'C'], action: 'Copy Style', fn: function () { if (typeof copyStyle === 'function') copyStyle(); } },
    { keys: ['Ctrl', 'Alt', 'V'], action: 'Paste Style', fn: function () { if (typeof pasteStyle === 'function') pasteStyle(); } },
  ]},
  { category: 'Layer', shortcuts: [
    { keys: [']'], action: 'Bring Forward', fn: function () { bringForwardSelected(); } },
    { keys: ['['], action: 'Send Backward', fn: function () { sendBackwardSelected(); } },
  ]},
  { category: 'Pages', shortcuts: [
    { keys: ['Alt', 'S'], action: 'Next Page', fn: function () {
      _switchPageGroupAware(1);
    }},
    { keys: ['Alt', 'A'], action: 'Previous Page', fn: function () {
      _switchPageGroupAware(-1);
    }},
    { keys: ['Ctrl', 'PageDown'], action: 'Next Page', fn: function () {
      if (typeof switchPage === 'function' && typeof currentPageIndex !== 'undefined' && typeof pages !== 'undefined') {
        if (currentPageIndex < pages.length - 1) switchPage(currentPageIndex + 1);
      }
    }},
    { keys: ['Ctrl', 'PageUp'], action: 'Previous Page', fn: function () {
      if (typeof switchPage === 'function' && typeof currentPageIndex !== 'undefined') {
        if (currentPageIndex > 0) switchPage(currentPageIndex - 1);
      }
    }},
    { keys: ['Ctrl', 'Shift', 'N'], action: 'Add New Page', fn: function () {
      if (typeof addPage === 'function') addPage();
    }},
    { keys: ['Ctrl', 'Shift', 'B'], action: 'Bulk Builder', fn: function () { if (typeof openBulkBuilder === 'function') openBulkBuilder(); } },
    { keys: ['Ctrl', 'Shift', 'D'], action: 'Duplicate Page', fn: function () {
      if (typeof duplicatePage === 'function' && typeof currentPageIndex !== 'undefined') duplicatePage(currentPageIndex);
    }},
    { keys: ['Ctrl', 'Alt', 'P'], action: 'Open Slide Presenter', fn: function () {
      if (typeof pageHasSlideDeck === 'function' && typeof pages !== 'undefined' && pages[currentPageIndex] && pageHasSlideDeck(pages[currentPageIndex]) && typeof openSlidePresenter === 'function') {
        openSlidePresenter();
        return true;
      }
      return false;
    }},
    { keys: ['ArrowRight'], action: 'Presenter Next Slide', fn: function () {
      if (typeof _isSlidePresenterOpen === 'function' && _isSlidePresenterOpen() && typeof _sdPresenterStep === 'function') {
        _sdPresenterStep('next');
        return true;
      }
      return false;
    }},
    { keys: ['ArrowLeft'], action: 'Presenter Previous Slide', fn: function () {
      if (typeof _isSlidePresenterOpen === 'function' && _isSlidePresenterOpen() && typeof _sdPresenterStep === 'function') {
        _sdPresenterStep('prev');
        return true;
      }
      return false;
    }},
    { keys: ['Alt', 'Shift', '1'], action: 'Go to Page 1', fn: function () { _jumpToPageGroupAware(1); }},
    { keys: ['Alt', 'Shift', '2'], action: 'Go to Page 2', fn: function () { _jumpToPageGroupAware(2); }},
    { keys: ['Alt', 'Shift', '3'], action: 'Go to Page 3', fn: function () { _jumpToPageGroupAware(3); }},
    { keys: ['Alt', 'Shift', '4'], action: 'Go to Page 4', fn: function () { _jumpToPageGroupAware(4); }},
    { keys: ['Alt', 'Shift', '5'], action: 'Go to Page 5', fn: function () { _jumpToPageGroupAware(5); }},
    { keys: ['Alt', 'Shift', '6'], action: 'Go to Page 6', fn: function () { _jumpToPageGroupAware(6); }},
    { keys: ['Alt', 'Shift', '7'], action: 'Go to Page 7', fn: function () { _jumpToPageGroupAware(7); }},
    { keys: ['Alt', 'Shift', '8'], action: 'Go to Page 8', fn: function () { _jumpToPageGroupAware(8); }},
    { keys: ['Alt', 'Shift', '9'], action: 'Go to Page 9', fn: function () { _jumpToPageGroupAware(9); }},
  ]},
  { category: 'View', shortcuts: [
    { keys: ['Alt (triple tap)'], action: 'Toggle Left Sidebar', fn: null },
    { keys: ['Ctrl', 'Shift', 'L'], action: 'Toggle Layers Panel', fn: function () { toggleStructurePanel(); } },
    { keys: ['Ctrl', 'K'], action: 'Quick Search', fn: function () {
      if (typeof openCommandBar === 'function') {
        openCommandBar();
        return true;
      }
      return false;
    }},
    { keys: ['Ctrl', '+'], action: 'Zoom In', fn: function () { zoomBy(0.1); } },
    { keys: ['Ctrl', '-'], action: 'Zoom Out', fn: function () { zoomBy(-0.1); } },
    { keys: ['Ctrl', '0'], action: 'Reset View', fn: function () { resetView(); } },
    { keys: ['Space'], action: 'Presenter Next Slide / Pan (Hold & Drag)', fn: function () {
      if (typeof _isSlidePresenterOpen === 'function' && _isSlidePresenterOpen() && typeof _sdPresenterStep === 'function') {
        _sdPresenterStep('next');
        return true;
      }
      return false;
    }},
    { keys: ['?'], action: 'Show Keyboard Shortcuts', fn: function () { showShortcutsModal(); } },
  ]},
];

let clipboardObj = null;
var _shortcutsInitialized = false;

function initShortcuts() {
  // Guard against duplicate initialization — initShortcuts() is called from
  // both initApp() and wizard.js (skip path / launchEditor). Without this
  // guard, duplicate capture-phase listeners cause double dispatch, making
  // toggle commands (Alt+C, Alt+M, etc.) open-then-immediately-close.
  if (_shortcutsInitialized) return;
  _shortcutsInitialized = true;

  // ══════════════════════════════════════════════════════════════
  // ALL keyboard handlers use CAPTURE PHASE (third param = true)
  // so they fire before Fabric.js hidden textarea can swallow events
  // via stopPropagation(). Event flow: capture (document→target) first,
  // then target, then bubble (target→document). Fabric.js textarea
  // handlers run at target/bubble phase, so capture fires first.
  // ══════════════════════════════════════════════════════════════

  // 1. Prevent browser default Alt behavior (menu bar activation on Windows)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key !== 'Alt') {
      e.preventDefault();
    }
  }, true);

  // 2. Prevent Alt keyup from activating browser menu bar on Windows
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Alt') {
      e.preventDefault();
    }
  }, true);

  // 3. Central command registry dispatch — CAPTURE PHASE
  if (typeof KeyboardManager !== 'undefined') {
    KeyboardManager.init();
    document.addEventListener('keydown', function (e) {
      KeyboardManager.dispatch(e);
    }, true);
  }

  _initTripleAltLeftPanelCollapse();

  // 4. Legacy handler as fallback — CAPTURE PHASE
  document.addEventListener('keydown', handleShortcut, true);

  initExternalPaste();
}

/* Triple-tap Alt (keyup, chord-safe) → toggle left rail + flyout */
function _initTripleAltLeftPanelCollapse() {
  var tapMs = 550;
  var count = 0;
  var timer = null;
  var altDownPure = false;

  function resetTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { count = 0; timer = null; }, tapMs);
  }

  document.addEventListener('keydown', function (e) {
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
      if (!e.repeat) altDownPure = true;
    } else if (e.altKey && e.key !== 'Alt') {
      altDownPure = false;
    }
  }, true);

  document.addEventListener('keyup', function (e) {
    if (e.code !== 'AltLeft' && e.code !== 'AltRight' && e.key !== 'Alt') return;
    if (!altDownPure) {
      altDownPure = false;
      return;
    }
    altDownPure = false;

    var el = e.target;
    if (el && el.matches && el.matches('input, textarea, select, [contenteditable="true"]')) return;
    var _cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
    var _aObj = _cvs && _cvs.getActiveObject ? _cvs.getActiveObject() : null;
    if (_aObj && _aObj.isEditing) return;

    count++;
    resetTimer();
    if (count >= 3) {
      count = 0;
      if (timer) { clearTimeout(timer); timer = null; }
      e.preventDefault();
      if (typeof toggleLeftPanel === 'function') toggleLeftPanel();
    }
  }, true);
}

function handleShortcut(e) {
  // If KeyboardManager already handled this event, skip
  if (e.defaultPrevented) return;

  const tag = (e.target && e.target.tagName || '').toLowerCase();
  var isEditable = !!(e.target && typeof e.target.matches === 'function' && e.target.matches('input, textarea, select, [contenteditable="true"]'));

  // Alt+key combos are never used for text input — always allow them through
  var isAltCombo = e.altKey && e.key !== 'Alt';

  // Check Fabric.js text editing (IText/Textbox in edit mode)
  var _scAObj = canvas && canvas.getActiveObject ? canvas.getActiveObject() : null;
  var _scFabricEditing = _scAObj && _scAObj.isEditing;

  if (!isAltCombo && (isEditable || _scFabricEditing)) {
    if (e.key === 'Escape') handleEscape();
    return;
  }

  if (!isAltCombo && e.target && e.target.isContentEditable) {
    if (e.key === 'Escape') handleEscape();
    return;
  }

  if (e.altKey) {
    var tabsByCode = { 'Digit1': 'templates', 'Digit2': 'text', 'Digit3': 'background', 'Digit4': 'icons', 'Digit5': 'shape', 'Digit6': 'images', 'Digit7': 'patterns' };
    var tabsByKey = { '1': 'templates', '2': 'text', '3': 'background', '4': 'icons', '5': 'shape', '6': 'images', '7': 'patterns' };
    var flyout = tabsByCode[e.code] || tabsByKey[e.key];
    if (flyout && typeof openFlyout === 'function') {
      e.preventDefault();
      openFlyout(flyout);
      return;
    }
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    if (typeof delSelected === 'function') delSelected();
    return;
  }

  for (let cat of SHORTCUTS) {
    for (let sc of cat.shortcuts) {
      if (!sc.fn) continue;
      if (matchShortcut(e, sc.keys)) {
        var result = sc.fn();
        if (result !== false) e.preventDefault();
        return;
      }
    }
  }
}

function matchShortcut(e, keys) {
  const needCtrl = keys.includes('Ctrl');
  const needShift = keys.includes('Shift');
  const needAlt = keys.includes('Alt');

  if (needCtrl !== (e.ctrlKey || e.metaKey)) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;

  const mainKey = keys.filter(function (k) {
    return k !== 'Ctrl' && k !== 'Shift' && k !== 'Alt';
  })[0];

  if (!mainKey) return false;

  // Alt key on Windows produces special chars (e.g. Alt+M → 'µ')
  // Fall back to e.code for reliable letter/digit detection
  var eventKey = e.key;
  if (e.altKey && e.code && /^Key[A-Z]$/.test(e.code)) {
    eventKey = e.code.charAt(3);
  } else if (e.altKey && e.code && /^Digit[0-9]$/.test(e.code)) {
    eventKey = e.code.charAt(5);
  }

  if (mainKey === '+' && (eventKey === '+' || eventKey === '=')) return true;
  if (mainKey === '-' && (eventKey === '-' || eventKey === '_')) return true;
  if (mainKey === '0' && eventKey === '0') return true;
  if (mainKey === ']' && eventKey === ']') return true;
  if (mainKey === '[' && eventKey === '[') return true;
  if (mainKey === '?' && eventKey === '?') return true;
  if (mainKey === 'Space' && eventKey === ' ') return true;

  if (mainKey.length === 1 && eventKey.toLowerCase() === mainKey.toLowerCase()) return true;
  if (eventKey === mainKey) return true;

  return false;
}

function handleEscape() {
  if (typeof _isSlidePresenterOpen === 'function' && _isSlidePresenterOpen() && typeof closeSlidePresenter === 'function') {
    closeSlidePresenter();
    return;
  }
  const shortcutsModal = document.getElementById('shortcuts-modal');
  if (shortcutsModal && shortcutsModal.classList.contains('show')) {
    hideShortcutsModal();
    return;
  }

  const modals = document.querySelectorAll('.modal.show, .modal-overlay.show, .shortcuts-modal.show');
  if (modals.length > 0) {
    modals.forEach(function (m) { m.classList.remove('show'); });
    return;
  }

  if (canvas.getActiveObject()) {
    canvas.discardActiveObject();
    canvas.renderAll();
  }
}

var _ccDupGuardTs = 0;
function duplicateSelected() {
  // Both keyboard systems (shortcuts.js capture + keyboard-manager) can dispatch the same Ctrl+D — dedupe
  // within one tick so a single press never duplicates twice.
  var _now = (window.performance && performance.now) ? performance.now() : Date.now();
  if (_now - _ccDupGuardTs < 120) return;
  _ccDupGuardTs = _now;
  // VIDEO: the selection is a timeline clip (video-editor model), not a canvas object — route Ctrl+D to the
  // clip duplicate. (This capture-phase shortcut runs before the video editor's own keydown, so otherwise it
  // no-ops on the canvas and its preventDefault swallows the key.)
  var _VE = window.__ccVideoEditor;
  if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive() && _VE && typeof _VE._veDuplicateSelected === 'function') {
    _VE._veDuplicateSelected();
    return;
  }
  const obj = canvas.getActiveObject();
  if (!obj) return;
  // SCENE: a CCFrame must be duplicated as a NEW model frame (a bare fabric clone shares _frameId and has
  // no model entry → a phantom frame that wrecks multi-select/group/align). Route to _scDuplicateFrame.
  if (typeof _scDuplicateFrame === 'function') {
    if (obj._ccFrame) {
      var nf = _scDuplicateFrame(obj._frameId);
      var SCe = window.__ccSceneEditor, nfo = (nf && SCe && SCe._frameObjById) ? SCe._frameObjById(nf.id) : null;
      if (nfo) { canvas.setActiveObject(nfo); canvas.requestRenderAll(); }
      if (typeof snap === 'function') snap();
      return;
    }
    if (obj.type === 'activeSelection' && obj.getObjects().some(function (o) { return o._ccFrame; })) {
      var frs = obj.getObjects().filter(function (o) { return o._ccFrame; });
      canvas.discardActiveObject();
      var SCd = window.__ccSceneEditor, newFos = [];
      frs.forEach(function (o) {
        var nf = _scDuplicateFrame(o._frameId);
        var nfo = (nf && SCd && SCd._frameObjById) ? SCd._frameObjById(nf.id) : null;
        if (nfo) newFos.push(nfo);
      });
      // Select the NEW duplicates (not the originals) so the next action targets them — more practical.
      if (newFos.length === 1) canvas.setActiveObject(newFos[0]);
      else if (newFos.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(newFos, { canvas: canvas }));
      canvas.requestRenderAll();
      if (typeof snap === 'function') snap();
      return;
    }
  }
  if (typeof window._ccDuplicateCanvasObject === 'function') {
    window._ccDuplicateCanvasObject(obj, canvas, { offsetX: 20, offsetY: 20 }, function (cl) {
      if (!cl) return;
      canvas.setActiveObject(cl);
      canvas.renderAll();
      if (typeof window._ccUpdateVideoHoverButton === 'function' && cl._isVideoMedia) window._ccUpdateVideoHoverButton(cl);
      snap();
    });
    return;
  }
  obj.clone(function (cl) {
    cl.set({ left: obj.left + 20, top: obj.top + 20 });
    canvas.add(cl);
    canvas.setActiveObject(cl);
    canvas.renderAll();
    snap();
  });
}

function copySelected() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  if (typeof window._ccDuplicateCanvasObject === 'function') {
    window._ccDuplicateCanvasObject(obj, null, { addToCanvas: false, skipFinalize: true }, function (cl) {
      if (cl) clipboardObj = cl;
    });
    return;
  }
  clipboardObj = obj;
  obj.clone(function (cl) {
    clipboardObj = cl;
  });
}

// Cut = copy then remove. Async on the design canvas (delete the original only AFTER the copy is captured,
// so paste can restore it). In video mode the selection is a timeline clip → route to the clip copy+delete.
function cutSelected() {
  var _VE = window.__ccVideoEditor;
  if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive() && _VE) {
    if (_VE._veSelectedClips && _VE._veSelectedClips.length && _VE._veCopySelected && _VE._veDeleteSelected) {
      _VE._veCopySelected(); _VE._veDeleteSelected();
    }
    return;
  }
  var obj = canvas.getActiveObject();
  if (!obj) return;
  if (typeof window._ccDuplicateCanvasObject === 'function') {
    window._ccDuplicateCanvasObject(obj, null, { addToCanvas: false, skipFinalize: true }, function (cl) {
      if (cl) clipboardObj = cl;
      if (typeof delSelected === 'function') delSelected();
    });
    return;
  }
  obj.clone(function (cl) {
    clipboardObj = cl;
    if (typeof delSelected === 'function') delSelected();
  });
}

function pasteClipboard() {
  if (!clipboardObj) return;
  // SCENE: pasting a copied CCFrame must create a NEW model frame (not a bare clone sharing _frameId).
  if (clipboardObj._ccFrame && clipboardObj._frameId && typeof _scDuplicateFrame === 'function' &&
      window.__ccSceneEditor && __ccSceneEditor._active) {
    var nf = _scDuplicateFrame(clipboardObj._frameId);
    var nfo = (nf && __ccSceneEditor._frameObjById) ? __ccSceneEditor._frameObjById(nf.id) : null;
    if (nfo) { canvas.setActiveObject(nfo); canvas.requestRenderAll(); }
    if (typeof snap === 'function') snap();
    return;
  }
  if (typeof window._ccDuplicateCanvasObject === 'function') {
    window._ccDuplicateCanvasObject(clipboardObj, canvas, { offsetX: 20, offsetY: 20 }, function (cl) {
      if (!cl) return;
      canvas.setActiveObject(cl);
      canvas.renderAll();
      if (typeof window._ccUpdateVideoHoverButton === 'function' && cl._isVideoMedia) window._ccUpdateVideoHoverButton(cl);
      snap();
      // Keep clipboardObj pointing at the immutable original clone so repeated
      // pastes produce independent copies (do NOT reassign to the live object).
    });
    return;
  }
  clipboardObj.clone(function (cl) {
    cl.set({ left: cl.left + 20, top: cl.top + 20 });
    canvas.add(cl);
    canvas.setActiveObject(cl);
    canvas.renderAll();
    snap();
    // Keep clipboardObj pointing at the immutable original clone so repeated
    // pastes produce independent copies (do NOT reassign to the live object).
  });
}

/* ===== Style Copy / Paste (Format Painter) ===== */
var _styleClipboard = null;

function _getObjType(obj) {
  if (!obj) return 'unknown';
  var t = obj.type || '';
  if (t === 'i-text' || t === 'textbox' || t === 'text') return 'text';
  if (t === 'image') return 'image';
  return 'shape';
}

function copyStyle() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  var obj = cvs.getActiveObject();
  if (!obj) return;
  var type = _getObjType(obj);
  var style = { _type: type, opacity: obj.opacity };

  // Common visual props
  if (obj.shadow) {
    var s = obj.shadow;
    style.shadow = new fabric.Shadow({ color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY });
  }

  if (type === 'text') {
    style.fontFamily = obj.fontFamily;
    style.fontSize = obj.fontSize;
    style.fill = obj.fill;
    style.fontWeight = obj.fontWeight;
    style.fontStyle = obj.fontStyle;
    style.textAlign = obj.textAlign;
    style.charSpacing = obj.charSpacing;
    style.lineHeight = obj.lineHeight;
    style.underline = obj.underline;
    style.linethrough = obj.linethrough;
    style.overline = obj.overline;
    style.textBackgroundColor = obj.textBackgroundColor;
    if (obj.stroke) style.stroke = obj.stroke;
    if (obj.strokeWidth) style.strokeWidth = obj.strokeWidth;
  } else if (type === 'shape') {
    style.fill = obj.fill;
    style.stroke = obj.stroke;
    style.strokeWidth = obj.strokeWidth;
    style.strokeDashArray = obj.strokeDashArray ? obj.strokeDashArray.slice() : null;
    style.rx = obj.rx;
    style.ry = obj.ry;
  } else if (type === 'image') {
    style.stroke = obj.stroke;
    style.strokeWidth = obj.strokeWidth;
    // A cutout is baked pixels, not a property, so this carries the INTENT: paste
    // re-runs the model on the target rather than copying a flag that would lie.
    style._hasBgRemoved = !!obj._hasBgRemoved;
  }

  _styleClipboard = style;
  if (typeof showToast === 'function') showToast('Style copied');
}

function pasteStyle() {
  if (!_styleClipboard) {
    if (typeof showToast === 'function') showToast('No style copied', 'warn');
    return;
  }
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  var obj = cvs.getActiveObject();
  if (!obj) return;

  var sc = _styleClipboard;
  var targetType = _getObjType(obj);

  // Handle ActiveSelection (multi-select)
  var targets = (obj.type === 'activeSelection') ? obj.getObjects() : [obj];

  targets.forEach(function(t) {
    var tt = _getObjType(t);

    // Opacity — always apply
    if (sc.opacity != null) t.set('opacity', sc.opacity);

    // Shadow — always apply
    if (sc.shadow) {
      t.set('shadow', new fabric.Shadow({ color: sc.shadow.color, blur: sc.shadow.blur, offsetX: sc.shadow.offsetX, offsetY: sc.shadow.offsetY }));
    } else if (sc.hasOwnProperty('shadow')) {
      t.set('shadow', null);
    }

    if (tt === 'text' && sc._type === 'text') {
      // Text → Text: full text style copy
      t.set({
        fontFamily: sc.fontFamily,
        fontSize: sc.fontSize,
        fill: sc.fill,
        fontWeight: sc.fontWeight,
        fontStyle: sc.fontStyle,
        textAlign: sc.textAlign,
        charSpacing: sc.charSpacing,
        lineHeight: sc.lineHeight,
        underline: sc.underline,
        linethrough: sc.linethrough,
        overline: sc.overline,
        textBackgroundColor: sc.textBackgroundColor
      });
      if (sc.stroke) t.set('stroke', sc.stroke);
      if (sc.strokeWidth) t.set('strokeWidth', sc.strokeWidth);
    } else if (tt === 'text' && sc._type !== 'text') {
      // Shape/Image → Text: apply fill as text color, stroke
      if (sc.fill) t.set('fill', sc.fill);
      if (sc.stroke) t.set('stroke', sc.stroke);
      if (sc.strokeWidth) t.set('strokeWidth', sc.strokeWidth);
    } else if (tt === 'shape' && sc._type === 'text') {
      // Text → Shape: apply text color as fill
      if (sc.fill) t.set('fill', sc.fill);
      if (sc.stroke) t.set('stroke', sc.stroke);
      if (sc.strokeWidth) t.set('strokeWidth', sc.strokeWidth);
    } else if (tt === 'shape') {
      // Shape/Image → Shape
      if (sc.fill != null) t.set('fill', sc.fill);
      if (sc.stroke != null) t.set('stroke', sc.stroke);
      if (sc.strokeWidth != null) t.set('strokeWidth', sc.strokeWidth);
      if (sc.strokeDashArray !== undefined) t.set('strokeDashArray', sc.strokeDashArray ? sc.strokeDashArray.slice() : null);
      if (sc.rx != null) t.set('rx', sc.rx);
      if (sc.ry != null) t.set('ry', sc.ry);
    } else if (tt === 'image') {
      // Any → Image: stroke/border only
      if (sc.stroke != null) t.set('stroke', sc.stroke);
      if (sc.strokeWidth != null) t.set('strokeWidth', sc.strokeWidth);
    }
  });

  cvs.renderAll();
  if (typeof snap === 'function') snap();
  if (typeof syncRightPanel === 'function') syncRightPanel();
  if (typeof showToast === 'function') showToast('Style applied');

  _pasteStyleCutout(cvs, targets, sc);
}

/* The copied style says the source had its background removed. That cannot be assigned,
   only reproduced, so the targets are segmented too (cached model, no second download).
   Skipped in video mode: applyCutout swaps the fabric object, which would strip the
   linked timeline clip and re-create it on a fresh track. */
function _pasteStyleCutout(cvs, targets, sc) {
  if (!sc._hasBgRemoved || typeof window.ccCutoutObjects !== 'function') return;
  if (window.__ccVideoEditor && window.__ccVideoEditor._veActive) return;

  var imgs = targets.filter(function (t) {
    return _getObjType(t) === 'image' && !t._hasBgRemoved && !t.isQR && !t._isChart && !t._isEffect;
  });
  if (!imgs.length) return;

  // Each cut removes + re-adds its object; doing that to live ActiveSelection members
  // would corrupt the selection mid-flight, so the selection is dropped first.
  cvs.discardActiveObject();
  cvs.renderAll();
  window.ccCutoutObjects(cvs, imgs);
}

function selectAll() {
  const objs = canvas.getObjects().filter(function (o) {
    return o.selectable !== false;
  });
  if (objs.length === 0) return;
  canvas.discardActiveObject();
  var sel = new fabric.ActiveSelection(objs, { canvas: canvas });
  canvas.setActiveObject(sel);
  canvas.renderAll();
}

function toggleLockSelected() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  const lk = !obj.lockMovementX;
  obj.set({
    lockMovementX: lk,
    lockMovementY: lk,
    lockScalingX: lk,
    lockScalingY: lk,
    lockRotation: lk,
    hasControls: !lk,
    selectable: !lk
  });
  canvas.renderAll();
  if (typeof refreshStructure === 'function') refreshStructure();
}

function bringForwardSelected() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  canvas.bringForward(obj);
  canvas.renderAll();
  snap();
  if (typeof refreshStructure === 'function') refreshStructure();
}

function sendBackwardSelected() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  canvas.sendBackwards(obj);
  canvas.renderAll();
  snap();
  if (typeof refreshStructure === 'function') refreshStructure();
}

/* ===== Shortcuts Info Modal ===== */

function showShortcutsModal() {
  let modal = document.getElementById('shortcuts-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shortcuts-modal';
    modal.className = 'shortcuts-modal';

    function shortcutText(source) {
      return window.CCI18n && typeof window.CCI18n.t === 'function' ? window.CCI18n.t(source) : source;
    }
    let categoriesHTML = '';
    SHORTCUTS.forEach(function (cat) {
      let rowsHTML = '';
      cat.shortcuts.forEach(function (s) {
        const keysHTML = s.keys.map(function (k) {
          return '<span class="shortcut-key" data-i18n-ignore="true">' + k + '</span>';
        }).join('');
        rowsHTML += '<div class="shortcut-row">' +
          '<span class="shortcut-action">' + shortcutText(s.action) + '</span>' +
          '<span class="shortcut-keys">' + keysHTML + '</span>' +
          '</div>';
      });
      categoriesHTML += '<div class="shortcut-category">' +
        '<div class="shortcut-cat-title">' + shortcutText(cat.category) + '</div>' +
        rowsHTML +
        '</div>';
    });

    modal.innerHTML =
      '<div class="shortcuts-veil" onclick="hideShortcutsModal()"></div>' +
      '<div class="shortcuts-box">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
          '<div class="shortcuts-title">' + getIcon('keyboard', 20) + ' ' + shortcutText('Keyboard Shortcuts') + '</div>' +
          '<button onclick="hideShortcutsModal()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px">' + getIcon('close', 18) + '</button>' +
        '</div>' +
        categoriesHTML +
      '</div>';

    document.body.appendChild(modal);
  }
  modal.classList.add('show');
}

function hideShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.classList.remove('show');
}

/* ============================================================
   Group-Aware Page Switching
   Navigates pages in visual tab-strip order, respecting groups.
   ============================================================ */

function _getVisiblePageOrder() {
  // Build the page order as rendered in the tab strip
  var order = [];
  var rendered = {};

  if (typeof pageGroups !== 'undefined' && pageGroups.length > 0) {
    var sortedGroups = pageGroups.slice().sort(function (a, b) { return a.order - b.order; });
    sortedGroups.forEach(function (group) {
      var groupPages = [];
      pages.forEach(function (p, idx) {
        if (p.groupId === group.id) groupPages.push(idx);
      });
      if (groupPages.length === 0) return;
      if (group.collapsed) {
        // For collapsed groups, include only the first page (or last opened)
        var target = groupPages[0];
        if (group.lastOpenedPageId) {
          for (var i = 0; i < pages.length; i++) {
            if (pages[i]._pageId === group.lastOpenedPageId && pages[i].groupId === group.id) {
              target = i; break;
            }
          }
        }
        order.push(target);
        groupPages.forEach(function (idx) { rendered[idx] = true; });
      } else {
        groupPages.forEach(function (idx) {
          order.push(idx);
          rendered[idx] = true;
        });
      }
    });
  }

  // Add ungrouped pages
  pages.forEach(function (p, idx) {
    if (!rendered[idx]) order.push(idx);
  });

  return order;
}

function _switchPageGroupAware(direction) {
  if (typeof switchPage !== 'function' || typeof pages === 'undefined' || pages.length <= 1) return;

  var order = _getVisiblePageOrder();
  if (order.length <= 1) return;

  var currentPos = order.indexOf(currentPageIndex);
  if (currentPos < 0) currentPos = 0;

  var nextPos = currentPos + direction;
  // Wrap around
  if (nextPos >= order.length) nextPos = 0;
  if (nextPos < 0) nextPos = order.length - 1;

  var targetIdx = order[nextPos];

  // Track group switching
  var fromGroup = pages[currentPageIndex] ? pages[currentPageIndex].groupId : null;
  var toGroup = pages[targetIdx] ? pages[targetIdx].groupId : null;
  if (fromGroup !== toGroup && typeof _pgOnGroupSwitch === 'function') {
    _pgOnGroupSwitch(fromGroup, toGroup);
  }

  switchPage(targetIdx);

  // Quick-switch visual highlight
  _flashPageTab(targetIdx);
}

/* ============================================================
   Direct Page Jump (Alt+Shift+1-9)
   Group-aware: if inside an expanded group, jumps within group;
   otherwise jumps among visible top-level page order.
   ============================================================ */

function _jumpToPageGroupAware(num) {
  if (typeof switchPage !== 'function' || typeof pages === 'undefined' || pages.length === 0) return;

  var currentPage = pages[currentPageIndex];
  var targetIdx = -1;

  // If current page is in an expanded group, navigate within that group
  if (currentPage && currentPage.groupId && typeof pageGroups !== 'undefined') {
    var group = null;
    for (var g = 0; g < pageGroups.length; g++) {
      if (pageGroups[g].id === currentPage.groupId) { group = pageGroups[g]; break; }
    }
    if (group && !group.collapsed) {
      var groupPages = [];
      for (var i = 0; i < pages.length; i++) {
        if (pages[i].groupId === group.id) groupPages.push(i);
      }
      if (num <= groupPages.length) {
        targetIdx = groupPages[num - 1];
      }
    }
  }

  // Fallback: use visible page order (top-level)
  if (targetIdx < 0) {
    var order = _getVisiblePageOrder();
    if (num <= order.length) {
      targetIdx = order[num - 1];
    }
  }

  if (targetIdx >= 0 && targetIdx < pages.length) {
    var fromGroup = pages[currentPageIndex] ? pages[currentPageIndex].groupId : null;
    var toGroup = pages[targetIdx] ? pages[targetIdx].groupId : null;
    if (fromGroup !== toGroup && typeof _pgOnGroupSwitch === 'function') {
      _pgOnGroupSwitch(fromGroup, toGroup);
    }
    switchPage(targetIdx);
    _flashPageTab(targetIdx);
  }
}

var _flashTimer = null;
function _flashPageTab(idx) {
  if (_flashTimer) clearTimeout(_flashTimer);
  var tab = document.querySelector('.page-tab[data-page-idx="' + idx + '"]');
  if (!tab) return;
  tab.classList.add('pg-flash');
  _flashTimer = setTimeout(function () {
    tab.classList.remove('pg-flash');
    _flashTimer = null;
  }, 400);
}

/* ============================================================
   Unified External Paste Handler
   Supports: images, text, and URLs from outside the app.
   Works across Template, Board, Wireframe contexts.
   ============================================================ */

function initExternalPaste() {
  document.addEventListener('paste', handleExternalPaste);
}

function handleExternalPaste(e) {
  // Skip if user is typing in an input/textarea
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.target.isContentEditable) return;

  // If a fabric text object is being edited, let fabric handle it
  var active = canvas.getActiveObject();
  if (active && active.isEditing) return;

  var items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData));
  if (!items) return;

  // Priority 1: Check for image/video clipboard files
  var mediaFile = null;
  if (items.files) {
    for (var i = 0; i < items.files.length; i++) {
      if (items.files[i].type.indexOf('image/') === 0 || items.files[i].type.indexOf('video/') === 0) {
        mediaFile = items.files[i];
        break;
      }
    }
  }
  if (!mediaFile && items.items) {
    for (var j = 0; j < items.items.length; j++) {
      if (items.items[j].type.indexOf('image/') === 0 || items.items[j].type.indexOf('video/') === 0) {
        mediaFile = items.items[j].getAsFile();
        break;
      }
    }
  }

  if (mediaFile) {
    e.preventDefault();
    if (typeof _handleImportedImageFile === 'function') _handleImportedImageFile(mediaFile, 'paste');
    else _pasteImageFile(mediaFile);
    return;
  }

  // Priority 2: Check for text/plain
  var textData = items.getData('text/plain');
  if (textData) {
    e.preventDefault();
    if (_isURL(textData.trim())) {
      _pasteLink(textData.trim());
    } else {
      _pasteText(textData);
    }
    return;
  }
}

/* ── Image Paste Pipeline ── */
function _pasteImageFile(file) {
  var reader = new FileReader();
  reader.onload = function (ev) {
    var dataUrl = ev.target.result;
    var tempImg = new Image();
    tempImg.onload = function () {
      var w = tempImg.naturalWidth;
      var h = tempImg.naturalHeight;
      var maxDim = 2048;
      var finalUrl = dataUrl;

      if (w > maxDim || h > maxDim || file.size > 1.5 * 1024 * 1024) {
        var scale = Math.min(maxDim / w, maxDim / h, 1);
        var oc = document.createElement('canvas');
        oc.width = Math.round(w * scale);
        oc.height = Math.round(h * scale);
        var octx = oc.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(tempImg, 0, 0, oc.width, oc.height);
        finalUrl = oc.toDataURL('image/png', 0.92);
      }

      // Save to gallery
      if (typeof saveToGallery === 'function') saveToGallery(finalUrl);

      // Add to canvas
      fabric.Image.fromURL(finalUrl, function (img) {
        var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
        var iw = Math.round(180 * s);
        img.scaleToWidth(iw);
        _addPastedObjectToCenter(img);
        if (typeof showToast === 'function') showToast('Image pasted & saved to Gallery');
      });
    };
    tempImg.onerror = function () {
      if (typeof showToast === 'function') showToast('Failed to process pasted image', 'error');
    };
    tempImg.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

/* ── Text Paste Pipeline ── */
function _pasteText(text) {
  var active = canvas.getActiveObject();
  if (active && (active.type === 'i-text' || active.type === 'textbox')) {
    var cursorPos = active.selectionStart || active.text.length;
    var before = active.text.substring(0, cursorPos);
    var after = active.text.substring(active.selectionEnd || cursorPos);
    active.set('text', before + text + after);
    active.selectionStart = cursorPos + text.length;
    active.selectionEnd = cursorPos + text.length;
    canvas.renderAll();
    snap();
    return;
  }

  // No active text — create a new text object
  var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
  var fontSize = Math.round(16 * s);
  var maxWidth = Math.round(canvas.getWidth() * 0.6);
  var newText = new fabric.Textbox(text, {
    fontFamily: 'DM Sans',
    fontSize: fontSize,
    fill: '#ffffff',
    width: maxWidth,
    lineHeight: 1.4,
  });
  _addPastedObjectToCenter(newText);
  if (typeof showToast === 'function') showToast('Text pasted');
}

/* ── Link Paste Pipeline ── */
function _pasteLink(url) {
  var active = canvas.getActiveObject();
  if (active && (active.type === 'i-text' || active.type === 'textbox')) {
    var cursorPos = active.selectionStart || active.text.length;
    var before = active.text.substring(0, cursorPos);
    var after = active.text.substring(active.selectionEnd || cursorPos);
    active.set('text', before + url + after);
    active.selectionStart = cursorPos + url.length;
    active.selectionEnd = cursorPos + url.length;
    canvas.renderAll();
    snap();
    if (typeof showToast === 'function') showToast('Link pasted into text');
    return;
  }

  // No active text — create a styled link text object
  var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
  var fontSize = Math.round(14 * s);
  var linkText = new fabric.IText(url, {
    fontFamily: 'DM Sans',
    fontSize: fontSize,
    fill: '#f2ff58',
    underline: true,
    _linkUrl: url,
  });
  _addPastedObjectToCenter(linkText);
  if (typeof showToast === 'function') showToast('Link pasted');
}

/* ── URL Detection ── */
function _isURL(str) {
  if (str.length > 2048) return false;
  return /^https?:\/\/[^\s]+$/i.test(str) || /^www\.[^\s]+\.[^\s]+$/i.test(str);
}

/* ── Center helper (mirrors addToCenter in app.js) ── */
function _addPastedObjectToCenter(obj) {
  var vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  var zoom = canvas.getZoom() || 1;
  var cx = (canvas.getWidth() / 2 - vpt[4]) / zoom;
  var cy = (canvas.getHeight() / 2 - vpt[5]) / zoom;
  var w = obj.width || 100;
  var h = obj.height || 100;
  var sx = obj.scaleX || 1;
  var sy = obj.scaleY || 1;
  if (obj.originX === 'center' && obj.originY === 'center') {
    obj.set({ left: cx, top: cy });
  } else {
    obj.set({ left: cx - (w * sx) / 2, top: cy - (h * sy) / 2 });
  }
  canvas.add(obj);
  canvas.setActiveObject(obj);
  canvas.renderAll();
  snap();
}

// Modular skeleton hook (Faz 8) — shortcuts is now a system loader module (modules/system/).
if (window.cc && cc.modules) cc.modules.register({ id: 'shortcuts', parent: 'system', title: 'Shortcuts', mount: function () {}, unmount: function () {} });
// Faz 8: app.js's typeof-guarded initShortcuts() runs before this module loads → self-init on canvas-ready.
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('system.shortcuts', function () { if (typeof window.initShortcuts === 'function') window.initShortcuts(); }); });
