/* Module: scene/world — infinite-canvas WORLD (Faz 1: static render; Faz 2 adds pan/zoom + culling).
   Owns the scene render entry _scEnterScene (switchPage's scene dispatch), sizing the single
   fabric.Canvas to fill the canvas-area (in scene mode the canvas IS the viewport) and laying out frames
   in world space via the viewport transform. Globals (not SC.*) so pages.js can call them at runtime.
   See docs/frame-canvas-migration-plan.md. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  // switchPage's scene dispatch entry (called from core/pages.js inside a ccFlag('scene') guard).
  global._scEnterScene = function (index) {
    var page = pages[index];
    if (!page) return;
    SC.normalize(page);
    SC.activate();
    _scInitWorldInput();   // idempotent — wires fabric wheel/pan/modified handlers once (all SC._active-gated)
    _scRenderWorld(page);
    if (typeof _scDedupeFrames === 'function') _scDedupeFrames();   // clear any phantom frame clones
  };

  // ── world input: wheel-zoom-to-pointer + drag-empty-to-pan + frame move/resize sync. Registered ONCE
  //    on the shared fabric canvas; every handler early-returns unless SC._active, so classic/video/slide
  //    are untouched (the canvas fires these for them too, but they bail). ──
  var _inputReady = false;
  function _scInitWorldInput() {
    if (_inputReady || !global.canvas) return;
    _inputReady = true;
    var c = global.canvas;

    c.on('mouse:wheel', function (opt) {
      if (!SC._active) return;
      var e = opt.e, z = c.getZoom();
      z = Math.max(0.05, Math.min(8, z * Math.pow(0.999, e.deltaY)));
      c.zoomToPoint({ x: e.offsetX, y: e.offsetY }, z);
      e.preventDefault(); e.stopPropagation();
      _scStoreWorld(); _scScheduleSleep();
    });

    // pan: fabric mouse:down decides empty-vs-frame (opt.target); the drag itself is tracked on the
    // DOCUMENT (fabric's mouse:move is unreliable for an empty-canvas drag — same reason the classic
    // pan-overlay uses document listeners).
    var panning = false, lx = 0, ly = 0;
    c.on('mouse:down', function (opt) {
      if (!SC._active) return;
      // pan only in Hand tool / held-Space (the toolbar gate). Without the toolbar module, fall back to
      // the old behaviour (empty-drag pans). Move keeps canvas.selection → Fabric marquees instead.
      var panMode = (typeof _scIsPanMode === 'function') ? _scIsPanMode() : !opt.target;
      if (!panMode) return;
      panning = true; lx = opt.e.clientX; ly = opt.e.clientY;
      c.defaultCursor = 'grabbing'; c.setCursor('grabbing');
      if (opt.e && opt.e.preventDefault) opt.e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!SC._active || !panning) return;
      var vt = c.viewportTransform;
      vt[4] += e.clientX - lx; vt[5] += e.clientY - ly;
      c.setViewportTransform(vt);
      lx = e.clientX; ly = e.clientY;
    });
    document.addEventListener('mouseup', function () {
      if (!panning) return;
      panning = false;
      if (typeof _scApplyActiveTool === 'function') _scApplyActiveTool();   // back to the tool's resting cursor (grab for Hand, default for Move)
      else { c.defaultCursor = 'default'; c.setCursor('default'); }
      _scStoreWorld(); _scScheduleSleep();
    });

    // MIDDLE-mouse (wheel button) drag → pan from ANYWHERE, regardless of the active tool (CapCut/Figma).
    // Fabric ignores non-left buttons for its own logic, so we wire it natively on the upper canvas.
    if (c.upperCanvasEl) {
      c.upperCanvasEl.addEventListener('mousedown', function (e) {
        if (!SC._active || e.button !== 1) return;
        panning = true; lx = e.clientX; ly = e.clientY;
        c.defaultCursor = 'grabbing'; c.setCursor('grabbing');
        e.preventDefault();
      });
      c.upperCanvasEl.addEventListener('auxclick', function (e) { if (e.button === 1 && SC._active) e.preventDefault(); });
    }

    // drop: a frame bakes its geometry; a child edited inside an entered frame marks the group dirty +
    // syncs linked components; a free top-level object dropped over a frame is absorbed into it.
    c.on('object:modified', function (opt) {
      var t = opt.target;
      if (!SC._active || !t) return;
      if (t._ccFrame) {
        if (typeof _scSyncFrameFromObject === 'function') _scSyncFrameFromObject(t);
      } else if (t.type === 'activeSelection') {            // a MULTI-frame move: sync each frame's model
        // from its ABSOLUTE centre (calcTransformMatrix e/f = canvas-space centre) using the CLEAN model
        // size, so the model never goes stale under the selection — otherwise Align/Distribute later read
        // old coords + scatter the frames. (Move only; scaling a frame-selection is an edge case.)
        t.getObjects().forEach(function (o) {
          if (!o._ccFrame) return;
          var f = (typeof _scFindFrameModel === 'function') ? _scFindFrameModel(o._frameId) : null;
          if (!f) return;
          var m = o.calcTransformMatrix();
          var nx = Math.round(m[4] - f.w / 2), ny = Math.round(m[5] - f.h / 2);
          if (global._scLog) _scLog('MOVE-AS sync', f.label, f.x + ',' + f.y, '→', nx + ',' + ny);
          f.x = nx; f.y = ny;
        });
      } else if (t.group && t.group._ccFrame) {            // child edited inside an entered frame
        t.group.dirty = true;
        if (t._componentId && typeof _scPropagateComponent === 'function') _scPropagateComponent(t);
      } else if (t._scSticky) {                            // sticky note = a FREE board element; never absorb it into a frame
        /* keep it free */
      } else {                                             // free top-level object → absorb into the frame it's over
        if (typeof _scReparentObject === 'function') _scReparentObject(t);
        if (t._componentId && typeof _scPropagateComponent === 'function') _scPropagateComponent(t);
      }
      c.requestRenderAll();
    });
  }

  function _scStoreWorld() {
    var p = (typeof pages !== 'undefined') ? pages[currentPageIndex] : null;
    if (p && p._scene && p._scene.world && global.canvas && canvas.viewportTransform) {
      var vt = canvas.viewportTransform;
      p._scene.world.zoom = vt[0]; p._scene.world.panX = vt[4]; p._scene.world.panY = vt[5];
    }
  }

  // debounced sleep-mode reconciliation after a pan/zoom settles (no-op unless ccFlag('sceneSleep'))
  var _sleepT = null;
  global._scScheduleSleep = function () {
    if (_sleepT) clearTimeout(_sleepT);
    _sleepT = setTimeout(function () { _sleepT = null; if (typeof _scUpdateSleep === 'function') _scUpdateSleep(); }, 280);
  };

  // scene = the canvas fills the canvas-area; size both the stage and the fabric canvas to it.
  function _scStageSize() {
    var area = document.getElementById('canvas-area') || document.querySelector('.canvas-area');
    var w = area && area.clientWidth ? area.clientWidth : 1200;
    var h = area && area.clientHeight ? area.clientHeight : 800;
    return { w: Math.max(320, w), h: Math.max(240, h) };
  }

  // Render the whole scene world into the single fabric.Canvas. Faz 1: empty artboards; the world
  // viewport fits+centers frame 1 on first entry, then uses the stored world transform.
  global._scRenderWorld = function (page) {
    var sc = page._scene;
    if (!sc || !global.canvas) return;
    var st = _scStageSize();

    histLocked = true;
    canvas.clear();
    canvas.setWidth(st.w);
    canvas.setHeight(st.h);
    // size the stage box + CLEAR the leftover classic CSS view transform. applyView is bypassed in scene
    // mode, so the previous page's `#card-stage-container { transform: translate()+scale() }` would
    // otherwise persist — offsetting/scaling the canvas so pointer math breaks. Scene drives the viewport
    // purely via fabric's setViewportTransform, so the CSS transform must be reset to identity.
    var stage = document.getElementById('card-stage');
    var container = document.getElementById('card-stage-container');
    if (stage) { stage.style.width = st.w + 'px'; stage.style.height = st.h + 'px'; stage.style.transform = 'none'; stage.style.left = ''; stage.style.top = ''; stage.style.position = ''; }
    if (container) { container.style.transform = 'none'; container.style.width = ''; container.style.height = ''; container.style.position = ''; container.style.overflow = ''; }
    canvas.backgroundColor = '';           // transparent → the canvas-area dotted backdrop shows through (no painted backdrop, CapCut-style)
    canvas.selection = false;              // scene: drag-on-empty pans the world (not a selection box); click still selects a frame

    // histLocked MUST stay true until the ASYNC frame draws (CCFrame.fromObject / enlivenObjects inside
    // _scDrawFrame) actually land — otherwise it flips false while the canvas still holds ZERO frames, and
    // any save firing in that window (flushSaveNow on tab-hide, quickAutoSave, the transient-strip snap…)
    // persists an EMPTY scene OVER the good doc → the reported frame loss. Count pending draws; clear the
    // lock only when the last lands. The leading +1 is released after the sync loop so an all-empty (fully
    // synchronous) scene doesn't finish mid-loop.
    var _pending = 1, _rendered = false;
    function _finishRender() {
      if (_rendered) return; _rendered = true;
      histLocked = false;
      // the render reset canvas.selection/cursor — re-assert the active tool's state (Move = selection on).
      if (typeof _scApplyActiveTool === 'function') _scApplyActiveTool();
      if (typeof _scUpdateSleep === 'function') _scUpdateSleep();   // sleep frames already off-screen on entry
    }
    function _dec() { _pending--; if (_pending <= 0) _finishRender(); }

    for (var i = 0; i < sc.frames.length; i++) {
      if (typeof _scDrawFrame === 'function') { _pending++; _scDrawFrame(sc.frames[i], _dec); }
    }
    // free elements (dragged outside all frames) — no clip, no membership
    if (sc.freeElements && sc.freeElements.length) {
      _pending++;
      fabric.util.enlivenObjects(sc.freeElements, function (objs) { objs.forEach(function (o) { o._frameId = undefined; canvas.add(o); }); canvas.requestRenderAll(); _dec(); });
    }

    // world transform: default (fresh) → fit+center frame 1; otherwise restore the stored transform.
    // (Uses the MODEL geometry sc.frames[0], not the live object, so it is safe to run synchronously.)
    var w = sc.world;
    if (w.zoom === 1 && w.panX === 0 && w.panY === 0 && sc.frames.length) {
      var f0 = sc.frames[0];
      var z = Math.min(st.w / f0.w, st.h / f0.h) * 0.85;
      w = { zoom: z, panX: st.w / 2 - (f0.x + f0.w / 2) * z, panY: st.h / 2 - (f0.y + f0.h / 2) * z };
      sc.world = w;
    }
    canvas.setViewportTransform([w.zoom, 0, 0, w.zoom, w.panX, w.panY]);
    canvas.renderAll();

    _dec();   // release the leading hold → finishes now if every draw was synchronous, else on the last async callback
  };

  // Persist live canvas back into the model: world transform + each live frame → its serialized CCFrame
  // (frame.json); top-level non-frame objects → free elements.
  global._scSerializeWorld = function (page) {
    var sc = page._scene;
    if (!sc || !global.canvas) return;
    var vt = canvas.viewportTransform;
    if (vt && sc.world) { sc.world.zoom = vt[0]; sc.world.panX = vt[4]; sc.world.panY = vt[5]; }
    sc.frames.forEach(function (fr) {
      if (fr._sleeping) return;                   // sleeping frames already hold a fresh json
      if (typeof _scSerializeFrame === 'function') _scSerializeFrame(fr);
    });
    var cp = (global.cc && cc.customProps) ? cc.customProps() : undefined;
    var free = [];
    canvas.getObjects().forEach(function (o) {
      if (o._ccFrame || o._isSleepThumb || o.group || o._scPreview) return;   // frames + sleep thumbs + group children + transient draw preview
      var j = o.toObject(cp); delete j.clipPath; free.push(j);
    });
    sc.freeElements = free;
  };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'world', parent: 'scene', title: 'scene: world', mount: function () {}, unmount: function () {} });
  }
})(window);
