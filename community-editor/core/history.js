/* ============================================================
   dika studio core — HISTORY (Undo / Redo) engine. Extracted from app.js §8 (Faz 8 core slimming).

   Flat global script loaded BEFORE app.js: snap()/undo()/redo()/_snapNow/_flushSnap stay window
   globals (snap() alone has 160+ callers across app.js + modules, so they MUST remain global —
   moving the definitions here changes nothing for callers). The history STATE
   (undoStack/hIdx/histLocked) stays in app.js §1 (line 49) because split-view and other app.js
   code also touch histLocked; these functions reference that state + canvas/CUSTOM_PROPS at
   RUNTIME (all defined by the time anything calls them, since app.js loads right after this).
   Guarded externals (_ccFixVideoSrcInJson, isCropActive, _rehydrateCanvasVideoMedia,
   refreshStructure, window._brushPaint*) degrade gracefully when their module is absent.
   ============================================================ */
var _snapTimer = null;
function _snapNow() {
  _snapTimer = null;
  var objs = canvas.getObjects();
  var filtered = objs.filter(function (o) {
    return !o.isSmartGuide && !o._isGridLine && !o._isGuide;
  });
  var json = canvas.toJSON(CUSTOM_PROPS);
  json.objects = json.objects.filter(function (o) {
    return !o.isSmartGuide && !o._isGridLine && !o._isGuide && !o._isCropDim && !o._isCropGrid && !o._isCropRect && !o._isSelPreview && !o._isPerspHandle && !o._isPerspOutline && !o._isPerspWarp && !o._isPeHandle && !o._isPeOutline && !o._isPaintOverlay && !o._isPaintCursor && !o._isPaintSelPreview && !o._altMeasure && !o._isSleepThumb && !o._isScCam && !o._isPowerWindow;
  });
  // Video src fix lives in the gallery module (videos come from there). Guard so the
  // history system still snapshots when the gallery module is disabled (no videos then).
  if (typeof _ccFixVideoSrcInJson === 'function') _ccFixVideoSrcInJson(json);
  var s = JSON.stringify(json);
  if (hIdx >= 0 && undoStack[hIdx] === s) return;
  if (hIdx < undoStack.length - 1) undoStack = undoStack.slice(0, hIdx + 1);
  undoStack.push(s);
  if (undoStack.length > 60) undoStack.shift();
  // M-M2: 60 ENTRIES is no bound on MEMORY — snapshots are full-canvas JSON
  // (base64 video posters / image data URLs included), so a heavy doc could
  // hold hundreds of MB of history. Cap the TOTAL character budget (~24M chars
  // ≈ 48MB of string memory), dropping the OLDEST steps first, but always keep
  // a floor of recent steps so undo never disappears entirely on a giant doc.
  var _hTotal = 0, _hi;
  for (_hi = 0; _hi < undoStack.length; _hi++) _hTotal += undoStack[_hi].length;
  while (_hTotal > 24000000 && undoStack.length > 5) {
    _hTotal -= undoStack[0].length;
    undoStack.shift();
  }
  hIdx = undoStack.length - 1;
}
function snap() {
  if (histLocked) return;
  if (typeof isCropActive === 'function' && isCropActive()) return;
  if (_snapTimer) clearTimeout(_snapTimer);
  _snapTimer = setTimeout(_snapNow, 150);
}
// Flush a pending debounced snapshot NOW (e.g. before undo/redo) so a change made
// within the 150ms window isn't lost.
function _flushSnap() {
  if (_snapTimer) { clearTimeout(_snapTimer); _snapNow(); }
}

function undo() {
  // The video editor owns undo while active: it has its own timeline stack,
  // and the global canvas restore below can load a snapshot belonging to a
  // PREVIOUS page (this stack is not page-scoped), which overlay-sync would
  // then turn into hundreds of foreign clips/tracks. Route every entry point
  // (menu button, shortcuts, keyboard-manager, AI tool) to the VE undo.
  if (window.VideoEditor && typeof VideoEditor.isActive === 'function' && VideoEditor.isActive()) {
    var _veU = window.__ccVideoEditor;
    if (_veU && _veU._veUndo) _veU._veUndo();
    return;
  }
  // Paint tool keeps its own per-stroke undo (its layer is off-screen, excluded
  // from this history). Let it consume the Ctrl+Z first while it has strokes left.
  if (typeof window._brushPaintUndo === 'function' && window._brushPaintUndo()) return;
  // Co-editing owns a per-client Yjs operation stack. Restoring this browser's canvas snapshot would
  // overwrite peers' later work; the CRDT inverse changes only this user's operations at current state.
  if (window.CCCoEdit && typeof window.CCCoEdit.undo === 'function' && window.CCCoEdit.undo()) return;
  _flushSnap(); // capture any pending edit before stepping back (C7)
  if (hIdx <= 0) return;
  histLocked = true;
  // Tear down an in-progress text edit so undo doesn't leave a stale editor (C8).
  var _undoAo = canvas.getActiveObject && canvas.getActiveObject();
  if (_undoAo && _undoAo.isEditing && _undoAo.exitEditing) _undoAo.exitEditing();
  canvas.discardActiveObject();
  hIdx--;
  canvas.loadFromJSON(undoStack[hIdx], function () {
    if (typeof _rehydrateCanvasVideoMedia === 'function') {
      _rehydrateCanvasVideoMedia(canvas, function () {
        canvas.renderAll();
        histLocked = false;
        if (typeof refreshStructure === 'function') refreshStructure();
      });
    } else {
      canvas.renderAll();
      histLocked = false;
      if (typeof refreshStructure === 'function') refreshStructure();
    }
  });
}

function redo() {
  // Video mode: same routing as undo() above.
  if (window.VideoEditor && typeof VideoEditor.isActive === 'function' && VideoEditor.isActive()) {
    var _veR = window.__ccVideoEditor;
    if (_veR && _veR._veRedo) _veR._veRedo();
    return;
  }
  if (typeof window._brushPaintRedo === 'function' && window._brushPaintRedo()) return;
  if (window.CCCoEdit && typeof window.CCCoEdit.redo === 'function' && window.CCCoEdit.redo()) return;
  _flushSnap(); // capture any pending edit before stepping forward (C7)
  if (hIdx >= undoStack.length - 1) return;
  histLocked = true;
  var _redoAo = canvas.getActiveObject && canvas.getActiveObject();
  if (_redoAo && _redoAo.isEditing && _redoAo.exitEditing) _redoAo.exitEditing();
  canvas.discardActiveObject();
  hIdx++;
  canvas.loadFromJSON(undoStack[hIdx], function () {
    if (typeof _rehydrateCanvasVideoMedia === 'function') {
      _rehydrateCanvasVideoMedia(canvas, function () {
        canvas.renderAll();
        histLocked = false;
        if (typeof refreshStructure === 'function') refreshStructure();
      });
    } else {
      canvas.renderAll();
      histLocked = false;
      if (typeof refreshStructure === 'function') refreshStructure();
    }
  });
}
