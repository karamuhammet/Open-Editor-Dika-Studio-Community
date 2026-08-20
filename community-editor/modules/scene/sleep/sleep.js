/* Module: scene/sleep — SLEEP-MODE virtualization (Faz 4, the competitive advantage). A frame outside
   the viewport is collapsed to ONE cached thumbnail fabric.Image (its live artboard + content removed
   from the canvas); panning it back wakes it (live objects restored). Gated behind ccFlag('sceneSleep')
   AND SceneEditor.isActive(). Sleep/wake mutate the canvas under histLocked so they never spawn undo
   states, and thumbs carry _isSleepThumb so the history snapshot filter skips them.
   See docs/frame-canvas-migration-plan.md. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  function _enabled() { return SC._active && typeof ccFlag === 'function' && ccFlag('sceneSleep'); }

  // viewport rectangle in WORLD coords
  function _viewportWorld() {
    var vt = canvas.viewportTransform, z = vt[0] || 1;
    return { x0: -vt[4] / z, y0: -vt[5] / z, x1: (canvas.getWidth() - vt[4]) / z, y1: (canvas.getHeight() - vt[5]) / z };
  }
  function _intersects(fr, vp, pad) {
    pad = pad || 0;
    return !(fr.x > vp.x1 + pad || fr.x + fr.w < vp.x0 - pad || fr.y > vp.y1 + pad || fr.y + fr.h < vp.y0 - pad);
  }

  // Render a frame to a PNG dataURL via a temp StaticCanvas. fr.json is the serialized CCFrame (new) or a
  // flat world-coord content array (legacy).
  function _thumbFor(fr, cb) {
    var tmp = new fabric.StaticCanvas(null, { width: fr.w, height: fr.h, backgroundColor: fr.bg || '#ffffff' });
    function done() { var url = tmp.toDataURL({ format: 'png', multiplier: Math.min(1, 400 / fr.w) }); tmp.dispose(); cb(url); }
    var j = fr.json;
    if (j && j.type === 'ccframe') {
      fabric.CCFrame.fromObject(j, function (fo) {
        fo.set({ shadow: null });
        fo.setPositionByOrigin(new fabric.Point(fr.w / 2, fr.h / 2), 'center', 'center');
        tmp.add(fo); tmp.renderAll(); done();
      });
      return;
    }
    var objs = (j && j.objects) || [];
    if (!objs.length) { done(); return; }
    fabric.util.enlivenObjects(objs, function (eobjs) {
      eobjs.forEach(function (o) { o.set({ left: (o.left || 0) - fr.x, top: (o.top || 0) - fr.y, clipPath: null }); tmp.add(o); });
      tmp.renderAll(); done();
    });
  }

  function _thumbObj(id) { return canvas.getObjects().filter(function (o) { return o._isSleepThumb && o._frameId === id; })[0] || null; }

  global._scSleepFrame = function (id) {
    var sc = SC._curScene(); if (!sc) return;
    var fr = SC._findFrame(sc, id); if (!fr || fr._sleeping) return;
    if (typeof _scSerializeFrame === 'function') _scSerializeFrame(fr);   // capture current content first
    _thumbFor(fr, function (url) {
      fr._thumb = url; fr._thumbRev = fr._previewRev || 0;
      fabric.Image.fromURL(url, function (img) {
        if (!img) return;
        img.set({
          left: fr.x, top: fr.y, scaleX: fr.w / img.width, scaleY: fr.h / img.height,
          selectable: true, evented: true, hasRotatingPoint: false, lockRotation: true, lockScalingX: true, lockScalingY: true,
          shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.45)', blur: 24, offsetX: 0, offsetY: 6 }),
          hoverCursor: 'move', _ccFrame: true, _frameId: fr.id, _sceneRole: 'frame', _isSleepThumb: true
        });
        histLocked = true;
        var fo = SC._frameObjById(id); if (fo) canvas.remove(fo);   // one CCFrame → content goes with it
        canvas.add(img);
        histLocked = false;
        fr._sleeping = true;
        canvas.requestRenderAll();
      });
    });
  };

  global._scWakeFrame = function (id) {
    var sc = SC._curScene(); if (!sc) return;
    var fr = SC._findFrame(sc, id); if (!fr || !fr._sleeping) return;
    histLocked = true;
    var t = _thumbObj(id); if (t) canvas.remove(t);
    fr._sleeping = false;
    if (typeof _scDrawFrame === 'function') _scDrawFrame(fr);   // restore live artboard + content
    histLocked = false;
    canvas.requestRenderAll();
  };

  // Reconcile every frame against the current viewport: visible → wake, off-screen → sleep.
  global._scUpdateSleep = function () {
    if (!_enabled()) return;
    var sc = SC._curScene(); if (!sc) return;
    var vp = _viewportWorld(), pad = 200;   // small halo so frames wake just before they scroll in
    sc.frames.forEach(function (fr) {
      var vis = _intersects(fr, vp, pad);
      if (vis && fr._sleeping) _scWakeFrame(fr.id);
      else if (!vis && !fr._sleeping) _scSleepFrame(fr.id);
    });
  };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'sleep', parent: 'scene', title: 'scene: sleep', mount: function () {}, unmount: function () {} });
  }
})(window);
