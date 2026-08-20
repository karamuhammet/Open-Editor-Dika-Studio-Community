/* Module: scene/frame-edit — ENTER-TO-EDIT (Faz B). A frame is normally ONE unit (the CCFrame moves/
   selects as a whole). Double-click ENTERS it: the group is exploded into top-level, individually
   editable objects (the artboard becomes a locked backdrop); the other frames dim (Figma focus). Esc or
   a double-click on empty space EXITS: the objects are re-grouped back into the CCFrame + serialized.
   Scene-mode only (every handler bails unless SC._active). See scene-ui-rework memory. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  global.__ccEnteredFrameId = null;
  global._scIsEditingFrame = function () { return !!global.__ccEnteredFrameId; };

  function _curScene() { return SC._curScene ? SC._curScene() : null; }
  function _findFrame(id) { var sc = _curScene(); return (sc && SC._findFrame) ? SC._findFrame(sc, id) : null; }

  // ENTER: explode the CCFrame into editable top-level objects; dim the other frames.
  global._scEnterFrame = function (frameObj) {
    if (!frameObj || !frameObj._ccFrame || frameObj._isSleepThumb) return;
    var id = frameObj._frameId;
    if (global.__ccEnteredFrameId && global.__ccEnteredFrameId !== id) global._scExitFrame();
    if (global.__ccEnteredFrameId === id) return;
    var items = frameObj.getObjects().slice();
    histLocked = true;
    global.__ccEnteredFrameId = id;    // set BEFORE the explode — toActiveSelection() fires selection
                                       // events whose listeners (e.g. the frame-bars frames-only filter)
                                       // must see we're entering a frame and bail, not mangle the children.
    canvas.setActiveObject(frameObj);
    frameObj.toActiveSelection();      // removes the group; children become top-level (absolute coords)
    canvas.discardActiveObject();
    items.forEach(function (o) {
      if (o._isFrameBg) { o.set({ selectable: false, evented: false }); o._enteredFrameBg = id; }
      else { o.set({ selectable: true, evented: true }); o._enteredFrameId = id; }
      o.setCoords();
    });
    canvas.getObjects().forEach(function (o) {       // dim + lock the OTHER frames
      if (o._ccFrame && o._frameId !== id) { o.set({ opacity: 0.32, selectable: false, evented: false }); o._dimmed = true; }
    });
    global.__ccEnteredFrameId = id;
    var area = document.getElementById('canvas-area') || document.querySelector('.canvas-area');
    if (area) area.classList.add('scene-editing-frame');
    histLocked = false;
    canvas.requestRenderAll();
    if (global.cc && cc.emit) cc.emit('scene:frame-enter', id);
  };

  // EXIT: re-group the entered objects back into a CCFrame + persist.
  global._scExitFrame = function () {
    var id = global.__ccEnteredFrameId;
    if (!id) return;
    var fr = _findFrame(id);
    histLocked = true;
    canvas.discardActiveObject();
    var content = [], bg = null;
    canvas.getObjects().slice().forEach(function (o) {
      if (o._enteredFrameId === id) { content.push(o); canvas.remove(o); o._enteredFrameId = undefined; }
      else if (o._enteredFrameBg === id) { bg = o; canvas.remove(o); o._enteredFrameBg = undefined; o.set({ selectable: false, evented: false }); }
    });
    var kids = (bg ? [bg] : []).concat(content);
    var fo = new fabric.CCFrame(kids, { label: fr ? fr.label : 'Frame', frameBg: fr ? fr.bg : '#ffffff' });
    fo._frameId = id;
    global._scStyleFrameObject(fo);
    canvas.add(fo);
    canvas.getObjects().forEach(function (o) {       // un-dim the others
      if (o._dimmed) { o.set({ opacity: 1, selectable: true, evented: true }); o._dimmed = false; }
    });
    global.__ccEnteredFrameId = null;
    var area = document.getElementById('canvas-area') || document.querySelector('.canvas-area');
    if (area) area.classList.remove('scene-editing-frame');
    if (typeof _scSyncFrameFromObject === 'function') _scSyncFrameFromObject(fo);
    if (fr && typeof _scSerializeFrame === 'function') _scSerializeFrame(fr);
    histLocked = false;
    canvas.setActiveObject(fo);
    canvas.requestRenderAll();
    if (global.cc && cc.emit) cc.emit('scene:frame-exit', id);
  };

  // toggle: enter the topmost frame at a point, or exit if already inside
  global._scToggleFrameAt = function (target) {
    if (global.__ccEnteredFrameId) { global._scExitFrame(); return; }
    if (target && target._ccFrame) global._scEnterFrame(target);
  };

  var _ready = false;
  global._scInitFrameEdit = function () {
    if (_ready || !global.canvas) return;
    _ready = true;
    var c = global.canvas;
    c.on('mouse:dblclick', function (opt) {
      if (!SC._active) return;
      var t = opt.target;
      if (global.__ccEnteredFrameId) {
        // double-click on the entered backdrop or empty → exit; on a child → let fabric edit it (e.g. IText)
        if (!t || t._enteredFrameBg || t._ccFrame) global._scExitFrame();
        return;
      }
      if (t && t._ccFrame && !t._isSleepThumb) global._scEnterFrame(t);
    });
    document.addEventListener('keydown', function (e) {
      if (!SC._active || !global.__ccEnteredFrameId) return;
      if (e.key === 'Escape') { global._scExitFrame(); e.preventDefault(); }
    });
  };

  // wire when scene turns on
  if (global.cc && cc.on) {
    cc.on('scene:active', function (on) { if (on) global._scInitFrameEdit(); else if (global.__ccEnteredFrameId) global._scExitFrame(); });
  }

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'frame-edit', parent: 'scene', title: 'scene: frame-edit', mount: function () {}, unmount: function () {} });
  }
})(window);
