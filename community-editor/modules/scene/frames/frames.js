/* Module: scene/frames — FRAME CRUD + content membership, on the CCFrame primitive (frame-object.js).
   A frame is now a REAL container: ONE fabric.CCFrame (a fabric.Group subclass, type 'ccframe') whose
   children are [ artboard bg , ...content ]. It moves/clips/serializes as one unit; content nests inside
   it (Layers panel + enter-to-edit live in sibling modules). frame.json persists the SERIALIZED CCFrame
   (group.toObject) so Fabric owns all the coordinate math on round-trip. Distinct on purpose from the
   generic GROUP feature (type 'group'). See docs/frame-canvas-migration-plan.md + scene-ui-rework memory. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  function _curScene() {
    var p = (typeof pages !== 'undefined') ? pages[currentPageIndex] : null;
    return p && p._scene ? p._scene : null;
  }
  function _findFrame(sc, id) { for (var i = 0; i < sc.frames.length; i++) if (sc.frames[i].id === id) return sc.frames[i]; return null; }

  // the LIVE CCFrame object for a model-frame id (skips sleep thumbnails)
  function _frameObjById(id) {
    var objs = canvas.getObjects();
    for (var i = 0; i < objs.length; i++) if (objs[i]._ccFrame && objs[i]._frameId === id && !objs[i]._isSleepThumb) return objs[i];
    return null;
  }
  // a frame's live CONTENT children (artboard bg excluded)
  function _frameContentById(id) {
    var fo = _frameObjById(id);
    return fo ? global._scFrameContent(fo) : [];
  }

  // Build + add the live CCFrame for a model frame. Content from frame.json:
  //   • new shape  → frame.json IS a serialized ccframe (type 'ccframe') → fromObject (Fabric owns coords)
  //   • legacy     → frame.json = {objects:[world-coord content]} → convert to local + build
  //   • empty      → just the artboard
  // Always re-styles + re-positions to the model geometry (model x/y/w/h stays authoritative).
  global._scDrawFrame = function (frame, onDone) {
    if (typeof onDone !== 'function') onDone = function () {};   // optional: _scRenderWorld uses it to know when the ASYNC enliven has landed
    if (!global.canvas || !global.fabric) { onDone(); return null; }
    function _place(fo) {
      fo._frameId = frame.id; fo.label = frame.label || fo.label;
      global._scStyleFrameObject(fo);
      global._scPlaceFrameObject(fo, frame.x, frame.y, frame.w, frame.h);
      canvas.add(fo);
      canvas.requestRenderAll();
      return fo;
    }
    var j = frame.json;
    if (j && j.type === 'ccframe') {
      fabric.CCFrame.fromObject(j, function (fo) { _place(fo); onDone(); });
      return null;   // async
    }
    if (j && j.objects && j.objects.length) {
      fabric.util.enlivenObjects(j.objects, function (objs) {
        objs.forEach(function (o) { o.set({ left: (o.left || 0) - frame.x, top: (o.top || 0) - frame.y, clipPath: null }); });
        _place(global._scMakeFrameObject(frame.x, frame.y, frame.w, frame.h, { bg: frame.bg, label: frame.label, objects: objs }));
        onDone();
      });
      return null;   // async
    }
    var _fo = _place(global._scMakeFrameObject(frame.x, frame.y, frame.w, frame.h, { bg: frame.bg, label: frame.label }));
    onDone();
    return _fo;
  };

  // ── active frame (where new objects go): selected frame (or a child's frame) → else nearest to viewport ──
  function _scActiveFrame() {
    var sc = _curScene(); if (!sc || !sc.frames.length) return null;
    if (global.__ccEnteredFrameId) { var ef = _findFrame(sc, global.__ccEnteredFrameId); if (ef) return ef; }  // editing → that frame
    var act = canvas.getActiveObject && canvas.getActiveObject();
    if (act && act._ccFrame && act._frameId) { var f = _findFrame(sc, act._frameId); if (f) return f; }
    if (act && act.group && act.group._ccFrame) { var f2 = _findFrame(sc, act.group._frameId); if (f2) return f2; }  // child selected inside an entered frame
    var vt = canvas.viewportTransform, zoom = canvas.getZoom() || 1;
    var vcx = (canvas.getWidth() / 2 - vt[4]) / zoom, vcy = (canvas.getHeight() / 2 - vt[5]) / zoom;
    var best = null, bestD = Infinity;
    for (var i = 0; i < sc.frames.length; i++) {
      var fr = sc.frames[i], dx = (fr.x + fr.w / 2) - vcx, dy = (fr.y + fr.h / 2) - vcy, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = fr; }
    }
    return best;
  }
  global._scActiveFrame = _scActiveFrame;

  // Place a NEW object into the active frame (centered), as a real child of the CCFrame. Returns true if handled.
  global._scAddObjectToFrame = function (obj) {
    var frame = _scActiveFrame(); if (!frame) return false;
    var cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    var w = obj.width || 100, h = obj.height || 100, sx = obj.scaleX || 1, sy = obj.scaleY || 1;
    if (obj.originX === 'center' && obj.originY === 'center') obj.set({ left: cx, top: cy });
    else obj.set({ left: cx - (w * sx) / 2, top: cy - (h * sy) / 2 });
    histLocked = true;
    if (global.__ccEnteredFrameId === frame.id) {   // editing inside the frame → top-level, tagged for re-group on exit
      obj._enteredFrameId = frame.id;
      canvas.add(obj);
      canvas.setActiveObject(obj);
    } else {
      var fo = _frameObjById(frame.id);
      if (!fo) { histLocked = false; return false; }
      fo.addWithUpdate(obj);   // obj is inside the artboard → group bounds stay = artboard
      fo.dirty = true;
      canvas.setActiveObject(fo);
    }
    histLocked = false;
    canvas.requestRenderAll();
    return true;
  };

  // ── Auto-bind added objects into the active frame (choke-point, owner-chosen enterprise fix) ──
  // In scene mode the ONLY correct home for a new item is the active frame. Most add paths go through
  // addToCenter → _scAddObjectToFrame, but several (icons, uploaded/dropped images, QR, barcode, video…)
  // call canvas.add() directly and would drop the item as a FREE element instead of binding it. This ONE
  // listener catches every such add and re-parents it into the active frame — so ANY add path binds without
  // each needing scene awareness (future paths auto-covered). Heavily guarded: only plain, user-added
  // top-level objects — never frames, sleep thumbs, group children, previews, already-bound items, or the
  // programmatic adds done under histLocked (load / restore / frame draw / sleep-wake).
  var _scBindBusy = false;
  // Transient / system objects that are NOT content: smart-align guides, grid, crop overlays, perspective/
  // pen/paint handles, distance-measure labels, sleep thumbs, frame-draw previews. Guides especially get
  // added (many per drag) via canvas.add(), so the choke-point must NEVER bind them — otherwise a single
  // frame drag bakes thousands of guide Lines into the frame. (Excludes _isFrameBg via callers, never here.)
  function _scIsTransient(o) {
    return !!(o.isSmartGuide || o._isGridLine || o._isGuide || o._isPattern || o._isWbLabel ||
      o._isCropDim || o._isCropGrid || o._isCropRect || o._isSelPreview || o._scPreview ||
      o._isPerspHandle || o._isPerspOutline || o._isPerspWarp || o._isPeHandle || o._isPeOutline ||
      o._isPenPreview || o._isPenHandle || o._isPaintOverlay || o._isPaintCursor || o._isPaintSelPreview ||
      o._altMeasure || o._isSleepThumb);
  }
  function _scBindExisting(obj, frame) {
    if (!obj || !frame) return;
    _scBindBusy = true;
    var wasLocked = (typeof histLocked !== 'undefined') && histLocked;
    histLocked = true;
    try {
      var cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
      var w = obj.width || 100, h = obj.height || 100, sx = obj.scaleX || 1, sy = obj.scaleY || 1;
      if (obj.originX === 'center' && obj.originY === 'center') obj.set({ left: cx, top: cy });
      else obj.set({ left: cx - (w * sx) / 2, top: cy - (h * sy) / 2 });
      if (global.__ccEnteredFrameId === frame.id) {
        obj._enteredFrameId = frame.id;   // stays top-level (tagged for re-group on exit), same as _scAddObjectToFrame
        obj._scBound = true;
      } else {
        var fo = _frameObjById(frame.id);
        if (fo) {
          canvas.remove(obj);            // pull off top-level
          fo.addWithUpdate(obj);         // nest inside the frame group → clips + moves with the frame + nests in Layers
          fo.dirty = true;
          obj._scBound = true;
          canvas.setActiveObject(fo);
        }
      }
      if (obj.setCoords) obj.setCoords();
      canvas.requestRenderAll();
      if (typeof snap === 'function') snap();
    } catch (e) { /* on any error leave the object as a free element */ }
    histLocked = wasLocked;
    _scBindBusy = false;
  }
  function _scOnObjectAdded(e) {
    if (!SC._active || _scBindBusy) return;
    var o = e && e.target;
    if (!o || o._ccFrame || o.group || o._enteredFrameId || o._scBound) return;
    if (_scIsTransient(o) || o.excludeFromExport || o.selectable === false) return;   // guides/grid/crop/handles/previews — NEVER bind (real content is always selectable)
    if (typeof histLocked !== 'undefined' && histLocked) return;   // programmatic add (load/restore/draw/sleep) — leave it
    var frame = _scActiveFrame();                                   // captured NOW (before the add path re-selects)
    if (!frame) return;                                            // no frame at all → free element
    setTimeout(function () {                                       // defer: don't re-parent inside the add event
      if (!SC._active || !o || o._scBound || o.group) return;
      if (canvas.getObjects().indexOf(o) === -1) return;           // removed meanwhile
      _scBindExisting(o, frame);
    }, 0);
  }
  function _scHookAutoBind() {
    if (!global.canvas || canvas._scAutoBindHooked) return;
    canvas._scAutoBindHooked = true;
    canvas.on('object:added', _scOnObjectAdded);
  }
  SC._scHookAutoBind = _scHookAutoBind;

  // Heal a project corrupted by the pre-fix build: strip transient objects (smart-guide Lines, measure
  // labels…) that were wrongly bound into a frame group. Idempotent + cheap on clean frames; only removes
  // explicit-flagged junk and NEVER the artboard bg (_isFrameBg) or real content. Runs on scene activation.
  function _scStripTransientFromFrames() {
    if (!global.canvas) return;
    // Don't run mid-load: while _scRenderWorld is still enlivening frames (histLocked), the canvas is
    // half-populated and snap()ing here would persist an incomplete scene. Reschedule until the load settles.
    if (typeof histLocked !== 'undefined' && histLocked) { setTimeout(_scStripTransientFromFrames, 400); return; }
    var changed = false;
    canvas.getObjects().forEach(function (fo) {
      if (!fo._ccFrame || fo._isSleepThumb || typeof fo.getObjects !== 'function') return;
      var bad = fo.getObjects().filter(function (c) { return _scIsTransient(c) && !c._isFrameBg; });
      if (!bad.length) return;
      var wasLocked = (typeof histLocked !== 'undefined') && histLocked;
      histLocked = true;
      bad.forEach(function (b) { try { fo.remove(b); } catch (e) {} });
      fo.dirty = true; changed = true;
      histLocked = wasLocked;
    });
    if (changed) { canvas.requestRenderAll(); if (typeof snap === 'function') snap(); }
  }
  SC._scStripTransientFromFrames = _scStripTransientFromFrames;

  // ── CRUD ──
  // opts.objects = optional ENLIVENED fabric objects in frame-LOCAL coords (0,0 = artboard top-left) to
  // seed the frame with (templates / saved designs); otherwise an empty artboard.
  global._scAddFrame = function (x, y, w, h, opts) {
    var sc = _curScene(); if (!sc) return null;
    if (sc.limits && sc.frames.length >= sc.limits.maxFrames) { if (typeof showToast === 'function') showToast('Frame limiti (' + sc.limits.maxFrames + ')'); return null; }
    opts = opts || {};
    var frame = {
      id: SC._uid('fr'), x: x || 0, y: y || 0, w: w || 1080, h: h || 1080,
      label: opts.label || ('Frame ' + (sc.frames.length + 1)), bg: opts.bg || '#ffffff',
      json: null, _sleeping: false, _thumb: null, _previewRev: 0
    };
    sc.frames.push(frame);
    var fo;
    if (opts.objects && opts.objects.length) {
      fo = global._scMakeFrameObject(frame.x, frame.y, frame.w, frame.h, { bg: frame.bg, label: frame.label, objects: opts.objects });
      fo._frameId = frame.id;
      canvas.add(fo);
      if (typeof _scSerializeFrame === 'function') _scSerializeFrame(frame);   // persist json immediately
    } else {
      fo = _scDrawFrame(frame);   // empty artboard (synchronous)
    }
    if (fo) { canvas.setActiveObject(fo); canvas.requestRenderAll(); }
    return frame;
  };

  global._scRemoveFrame = function (id) {
    var sc = _curScene(); if (!sc) return;
    for (var i = 0; i < sc.frames.length; i++) if (sc.frames[i].id === id) { sc.frames.splice(i, 1); break; }
    var fo = _frameObjById(id); if (fo) canvas.remove(fo);
    var t = canvas.getObjects().filter(function (o) { return o._isSleepThumb && o._frameId === id; })[0]; if (t) canvas.remove(t);
    canvas.requestRenderAll();
  };

  global._scDuplicateFrame = function (id) {
    var sc = _curScene(); if (!sc) return null;
    var src = _findFrame(sc, id); if (!src) return null;
    if (typeof _scSerializeFrame === 'function') _scSerializeFrame(src);
    // place the copy NEXT TO the source (to the right, 60px gap) — NOT a tiny +40,+40 cascade that
    // overlaps ~96% on big artboards (which made align look like it "hid" frames). Drop into the first
    // free column to the right so repeated duplicates tile instead of stacking.
    var gap = 60, nx = src.x + src.w + gap, ny = src.y, guard = 0;
    while (_frameAt(nx + src.w / 2, ny + src.h / 2) && guard++ < 64) nx += src.w + gap;   // skip occupied columns
    var clone = _scAddFrame(nx, ny, src.w, src.h, { label: src.label + ' kopya', bg: src.bg });
    if (clone && src.json) { clone.json = JSON.parse(JSON.stringify(src.json)); _scRefreshFrame(clone.id); }
    return clone;
  };

  // re-render just one frame from its model (after json/geometry change)
  global._scRefreshFrame = function (id) {
    var sc = _curScene(); if (!sc) return;
    var fr = _findFrame(sc, id); if (!fr) return;
    var old = _frameObjById(id); if (old) canvas.remove(old);
    _scDrawFrame(fr);
  };

  global._scFindFrameModel = function (id) { var sc = _curScene(); return sc ? _findFrame(sc, id) : null; };

  // Remove PHANTOM live frames: a generic clone (Ctrl+D / duplicate button) of a CCFrame shares the
  // source's _frameId and has NO model entry — leaving N live CCFrames for 1 model frame, which wrecks
  // multi-select/group/align. Keep one live object per VALID model id; drop duplicates + orphans.
  global._scDedupeFrames = function () {
    if (!global.canvas) return 0;
    var sc = _curScene(), valid = {};
    if (sc) sc.frames.forEach(function (f) { valid[f.id] = true; });
    var seen = {}, removed = 0;
    canvas.getObjects().slice().forEach(function (o) {
      if (!o._ccFrame || o._isSleepThumb) return;
      var id = o._frameId;
      if (!id || (sc && !valid[id]) || seen[id]) { canvas.remove(o); removed++; return; }
      seen[id] = true;
    });
    if (removed) { canvas.discardActiveObject(); canvas.requestRenderAll(); }
    if (removed && global._scLog) _scLog('DEDUPE removed', removed, 'phantom frame(s)');
    return removed;
  };

  // Resize a frame in place to (newW,newH), keeping its world TOP-LEFT fixed and content top-left-anchored
  // (decision D7 — no reflow). Rebuilds the CCFrame at the new artboard size with the same content.
  global._scResizeFrame = function (frameId, newW, newH) {
    var sc = _curScene(); if (!sc) return null;
    var fr = _findFrame(sc, frameId); if (!fr) return null;
    var fo = _frameObjById(frameId); if (!fo) return null;
    newW = Math.max(20, Math.round(newW || fr.w)); newH = Math.max(20, Math.round(newH || fr.h));
    if (newW === Math.round(fr.w) && newH === Math.round(fr.h)) return fr;
    var px = fr.x, py = fr.y;                                  // MODEL top-left stays fixed (source of truth)
    var cp = (global.cc && cc.customProps) ? cc.customProps() : undefined;
    var content = global._scFrameContent(fo);
    var seeds = content.map(function (o) {
      var loc = global._scChildLocal(o, fo); var j = o.toObject(cp); delete j.clipPath; return { json: j, lx: loc.x, ly: loc.y };
    });
    global.histLocked = true;
    fr.w = newW; fr.h = newH;                                  // clean model size (NOT the border-inflated bbox)
    canvas.remove(fo);
    var nfo = global._scMakeFrameObject(px, py, newW, newH, { bg: fr.bg, label: fr.label });
    nfo._frameId = frameId;
    canvas.add(nfo);
    var finish = function () {
      nfo.dirty = true;
      canvas.setActiveObject(nfo);
      // NOTE: deliberately NOT calling _scSyncFrameFromObject — its _scFrameRect bbox is border-inflated
      // by ~1px and would drift the clean model size on every resize. The model already holds the request.
      if (typeof _scSerializeFrame === 'function') _scSerializeFrame(fr);
      global.histLocked = false;
      canvas.requestRenderAll();
      if (global.cc && cc.emit) cc.emit('scene:frame-resize', frameId);
    };
    if (seeds.length) {
      fabric.util.enlivenObjects(seeds.map(function (s) { return s.json; }), function (objs) {
        objs.forEach(function (o, i) { global._scAddLocalChild(nfo, o, seeds[i].lx, seeds[i].ly); });
        finish();
      });
    } else { finish(); }
    return fr;
  };

  // Set a frame's background (the artboard bg child fill). 'transparent' → no fill.
  global._scSetFrameBg = function (frameId, color) {
    var sc = _curScene(); if (!sc) return;
    var fr = _findFrame(sc, frameId); if (!fr) return;
    var fo = _frameObjById(frameId); if (!fo) return;
    fr.bg = color;
    fo.frameBg = color;
    var bg = global._scFrameBgChild(fo);
    if (bg) { bg.set('fill', (color === 'transparent' || !color) ? '' : color); }
    fo.dirty = true;
    canvas.requestRenderAll();
    if (typeof _scSerializeFrame === 'function') _scSerializeFrame(fr);
  };

  // Rename a frame (model + live object + Layers panel).
  global._scRenameFrame = function (frameId, label) {
    var sc = _curScene(); if (!sc) return;
    var fr = _findFrame(sc, frameId); if (!fr) return;
    label = (label == null ? '' : String(label)).trim() || fr.label;
    fr.label = label;
    var fo = _frameObjById(frameId); if (fo) fo.label = label;
    if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
    if (typeof _scSerializeFrame === 'function') _scSerializeFrame(fr);
  };

  // frame moved/resized on canvas → bake geometry back to the model (children travel natively with the group)
  global._scSyncFrameFromObject = function (fo) {
    var sc = _curScene(); if (!sc || !fo || !fo._ccFrame) return;
    var f = _findFrame(sc, fo._frameId); if (!f) return;
    var r = global._scFrameRect(fo);
    f.x = r.x; f.y = r.y; f.w = r.w; f.h = r.h;
    f._previewRev = (f._previewRev || 0) + 1;
  };

  // topmost frame whose world bounds contain a point (later frames render on top)
  function _frameAt(cx, cy) {
    var sc = _curScene(); if (!sc) return null;
    for (var i = sc.frames.length - 1; i >= 0; i--) {
      var f = sc.frames[i];
      if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) return f;
    }
    return null;
  }

  // a FREE (top-level) object dropped over a frame → absorb it into that frame as a child. Idempotent-ish;
  // children already inside a frame (o.group) are handled by enter/exit, not here.
  global._scReparentObject = function (obj) {
    if (!obj || obj._ccFrame || obj._isFrameBg || obj.group || obj.type === 'activeSelection') return;
    var c = obj.getCenterPoint();
    var f = _frameAt(c.x, c.y);
    if (!f) return;
    var fo = _frameObjById(f.id); if (!fo) return;
    histLocked = true;
    canvas.remove(obj);            // pull from top-level → into the frame group (else double-rendered)
    fo.addWithUpdate(obj); fo.dirty = true;
    canvas.setActiveObject(fo);
    histLocked = false;
    canvas.requestRenderAll();
  };

  // ── COMPONENT LINKING (#2): a content child linked across frames; editing one updates all instances. ──
  var SYNC_PROPS = ['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'opacity', 'scaleX', 'scaleY',
    'width', 'height', 'rx', 'ry', 'angle', 'flipX', 'flipY', 'text', 'fontFamily', 'fontSize',
    'fontWeight', 'fontStyle', 'underline', 'textAlign', 'charSpacing', 'lineHeight', 'shadow'];
  var _propagating = false;

  // every content child across all live frames
  function _allContent() {
    var out = [];
    canvas.getObjects().forEach(function (o) {
      if (o._ccFrame && o._objects) global._scFrameContent(o).forEach(function (c) { out.push(c); });
    });
    return out;
  }
  function _instances(compId) { return _allContent().filter(function (o) { return o._componentId === compId; }); }
  function _frameOfChild(child) {   // the model frame that owns a content child
    var g = child.group; if (!g || !g._frameId) return null;
    return _findFrame(_curScene() || { frames: [] }, g._frameId);
  }

  // Make a content child a linked component, then drop a linked instance into every OTHER frame at the
  // same RELATIVE position inside the artboard.
  global._scLinkToAllFrames = function (obj) {
    var sc = _curScene(); if (!sc || !obj || obj._ccFrame || obj._isFrameBg) return 0;
    var srcFo = obj.group; if (!srcFo || !srcFo._ccFrame) return 0;   // must be a child inside a frame
    sc.components = sc.components || [];
    if (!obj._componentId) {
      var id = SC._uid('cmp');
      obj._componentId = id;
      sc.components.push({ id: id, name: (obj.text ? String(obj.text).slice(0, 18) : 'Component') });
    }
    var local = global._scChildLocal(obj, srcFo);   // position inside the source artboard
    var cp = (global.cc && cc.customProps) ? cc.customProps() : undefined;
    var def = obj.toObject(cp);
    var added = 0;
    sc.frames.forEach(function (fr) {
      var fo = _frameObjById(fr.id); if (!fo || fo === srcFo) return;
      if (global._scFrameContent(fo).some(function (i) { return i._componentId === obj._componentId; })) return;  // already linked here
      fabric.util.enlivenObjects([def], function (objs) {
        var o = objs[0];
        o._componentId = obj._componentId;
        global._scAddLocalChild(fo, o, local.x, local.y);
        canvas.requestRenderAll();
      });
      added++;
    });
    return added;
  };

  // Push the edited instance's appearance to all sibling instances (relative position stays per-instance).
  global._scPropagateComponent = function (src) {
    if (_propagating || !src || !src._componentId) return;
    var vals = {};
    SYNC_PROPS.forEach(function (p) { if (src[p] !== undefined) vals[p] = src[p]; });
    _propagating = true;
    _instances(src._componentId).forEach(function (inst) {
      if (inst === src) return;
      inst.set(vals); inst.setCoords();
      if (inst.group) inst.group.dirty = true;
    });
    _propagating = false;
    canvas.requestRenderAll();
  };

  global._scIsComponent = function (obj) { return !!(obj && obj._componentId); };

  // ── BRAND-KIT AUTO-APPLY (#6): push the active brand to every frame ──
  function _activeBrand() {
    var SS = global.__ccSettings;
    if (SS && SS.getActiveBrandSet) { var b = SS.getActiveBrandSet(); if (b) return b; }
    try { var sets = JSON.parse(localStorage.getItem('dika_brandsets') || '[]'); return sets.filter(function (s) { return s.active; })[0] || sets[0] || null; } catch (e) { return null; }
  }
  function _isTextObj(o) { return o && (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox'); }

  global._scApplyBrandToFrame = function (frame, brand) {
    if (!frame || !brand || !brand.colors) return;
    frame.bg = brand.colors.body;
    var fo = _frameObjById(frame.id); if (!fo) return;
    fo.frameBg = frame.bg;
    var bgChild = global._scFrameBgChild(fo); if (bgChild) bgChild.set('fill', frame.bg);
    global._scFrameContent(fo).forEach(function (o) {
      if (_isTextObj(o)) o.set({ fill: brand.colors.text, fontFamily: (brand.font && brand.font.family) || o.fontFamily });
      else if (o.fill != null) o.set('fill', brand.colors.primary);
    });
    fo.dirty = true;
  };

  global._scApplyBrandToAll = function (brand) {
    var sc = _curScene(); if (!sc) return 0;
    brand = brand || _activeBrand();
    if (!brand || !brand.colors) { if (typeof showToast === 'function') showToast('No active brand set — Settings → Brand'); return 0; }
    sc.frames.forEach(function (fr) {
      if (fr._sleeping) {   // asleep: recolor the stored json (group children) + invalidate the cached thumbnail
        fr.bg = brand.colors.body;
        var objs = (fr.json && fr.json.objects) || [];
        objs.forEach(function (j) {
          if (j._isFrameBg) { j.fill = brand.colors.body; return; }
          if (/text/i.test(j.type || '')) { j.fill = brand.colors.text; if (brand.font && brand.font.family) j.fontFamily = brand.font.family; }
          else if (j.fill != null) j.fill = brand.colors.primary;
        });
        if (fr.json) fr.json.frameBg = brand.colors.body;
        fr._thumb = null; fr._previewRev = (fr._previewRev || 0) + 1;
      } else _scApplyBrandToFrame(fr, brand);
    });
    if (global.canvas) canvas.requestRenderAll();
    if (typeof showToast === 'function') showToast(sc.frames.length + ' brand applied to frame');
    return sc.frames.length;
  };

  // ── VARIANT / RESPONSIVE (#3): clone a frame into a different aspect, reflowing content (each child keeps
  //    its RELATIVE position in the artboard and is scaled to fit). variantOf links them. ──
  global._scCreateVariant = function (srcId, w, h, label) {
    var sc = _curScene(); if (!sc) return null;
    var src = _findFrame(sc, srcId); if (!src) return null;
    if (src._sleeping && typeof _scWakeFrame === 'function') _scWakeFrame(srcId);
    var srcFo = _frameObjById(srcId); if (!srcFo) return null;
    var nf = _scAddFrame(src.x, src.y + src.h + 100, w, h, { label: label || (src.label + ' · ' + w + '×' + h), bg: src.bg });
    if (!nf) return null;
    nf.variantOf = srcId; nf.role = src.role || 'variant';
    var nfo = _frameObjById(nf.id); if (!nfo) return nf;
    var scale = Math.min(w / src.w, h / src.h);
    var cp = (global.cc && cc.customProps) ? cc.customProps() : undefined;
    var content = global._scFrameContent(srcFo);
    content.forEach(function (o) {
      var loc = global._scChildLocal(o, srcFo);                 // 0..srcW, 0..srcH
      var fx = loc.x / src.w, fy = loc.y / src.h;               // relative 0..1
      o.clone(function (cl) {
        cl.set({ scaleX: (o.scaleX || 1) * scale, scaleY: (o.scaleY || 1) * scale });
        cl._componentId = undefined;                            // independent copy
        global._scAddLocalChild(nfo, cl, fx * w, fy * h);
        canvas.requestRenderAll();
      }, cp);
    });
    return nf;
  };

  // serialize ONE frame's live CCFrame into fr.json + sync model geometry. (Fabric owns child coords.)
  global._scSerializeFrame = function (fr) {
    if (!fr) return;
    var fo = _frameObjById(fr.id); if (!fo) return;
    var cp = (global.cc && cc.customProps) ? cc.customProps() : undefined;
    fr.json = fo.toObject(cp);
    var r = global._scFrameRect(fo);
    fr.x = r.x; fr.y = r.y; fr.w = r.w; fr.h = r.h;
  };

  // ── T7: multi-frame ALIGN / DISTRIBUTE (geometry on the model rects) + lightweight frame GROUPS ──
  function _modelsByIds(ids) {
    var sc = _curScene(); if (!sc) return [];
    return (ids || []).map(function (id) { return _findFrame(sc, id); }).filter(Boolean);
  }
  // debug dump: each frame's MODEL rect vs its LIVE absolute rect (calcTransformMatrix) + in-selection flag
  global._scDumpFrames = function (ids) {
    try {
      var sc = _curScene(); if (!sc) return '(no scene)';
      var list = ids ? ids.map(function (id) { return _findFrame(sc, id); }).filter(Boolean) : sc.frames;
      return list.map(function (f) {
        var fo = _frameObjById(f.id), live = '?', inSel = '';
        if (fo) { var m = fo.calcTransformMatrix(); live = Math.round(m[4] - f.w / 2) + ',' + Math.round(m[5] - f.h / 2); inSel = fo.group ? '·inSel' : ''; }
        return f.label + ' M(' + f.x + ',' + f.y + ' ' + f.w + 'x' + f.h + ') L(' + live + ')' + inSel;
      }).join('  |  ');
    } catch (e) { return '(dump err)'; }
  };
  // belt-and-suspenders: before align/distribute read the model, re-sync each frame's model rect from its
  // LIVE absolute position (frames moved together under an ActiveSelection can leave the model stale).
  function _syncModelFromLive(ids) {
    var sc = _curScene(); if (!sc || !global.canvas) return;
    if (canvas.getActiveObject()) canvas.discardActiveObject();   // → absolute coords
    (ids || []).forEach(function (id) {
      var fo = _frameObjById(id), f = _findFrame(sc, id);
      if (fo && f) {
        var r = global._scFrameRect(fo);
        if (global._scLog && (f.x !== r.x || f.y !== r.y)) _scLog('  syncLive', f.label, 'model', f.x + ',' + f.y, '→ live', r.x + ',' + r.y);
        f.x = r.x; f.y = r.y; f.w = r.w; f.h = r.h;
      }
    });
  }
  // one-command console snapshot — call scSnapshot() after reproducing a bug + paste the output.
  global.scSnapshot = function () {
    try {
      var ao = global.canvas && canvas.getActiveObject && canvas.getActiveObject();
      var s = '=== SCENE SNAPSHOT ===\nframes: ' + global._scDumpFrames() + '\nactiveObject: ' + (ao ? ao.type : 'none');
      if (ao && ao.type === 'activeSelection') {
        var b = ao.getBoundingRect(true, true);
        s += ' | children=' + ao.getObjects().length + ' (frames=' + ao.getObjects().filter(function (o) { return o._ccFrame; }).length + ')' +
          ' | bounds=' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
      } else if (ao && ao._ccFrame) { s += ' (label=' + ao.label + ')'; }
      s += '\nselectedFrames=' + (global._scSelectedFrames ? _scSelectedFrames().length : '?') +
        ' | frameGroups=' + JSON.stringify((_curScene() || {}).frameGroups || []);
      console.log(s);
      return s;
    } catch (e) { console.log('scSnapshot err', e); return ''; }
  };

  // re-place each frame's CCFrame from its (updated) model rect, then re-select them together
  function _repositionFrames(frs) {
    global.histLocked = true;
    canvas.discardActiveObject();
    frs.forEach(function (f) { var fo = _frameObjById(f.id); if (fo) { global._scPlaceFrameObject(fo, f.x, f.y, f.w, f.h); fo.setCoords(); } });
    var fos = frs.map(function (f) { return _frameObjById(f.id); }).filter(Boolean);
    if (global._scLog) _scLog('  reposition: placed', frs.length, 'frames → reselect', fos.length);
    if (fos.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(fos, { canvas: canvas }));
    else if (fos.length === 1) canvas.setActiveObject(fos[0]);
    global.histLocked = false;
    canvas.requestRenderAll();
  }

  // N2: cluster the scene's frames into spatial blocks grouped by their PRIMARY tag (first tag) — "ayır".
  // Each tag-block is a vertical stack; blocks are separated horizontally. Untagged frames get their own block.
  global._scClusterFramesByTag = function () {
    var sc = _curScene(); if (!sc || !sc.frames.length) return 0;
    var order = [], groups = {};
    sc.frames.forEach(function (fr) {
      var tags = global.CCTags ? CCTags.idsOf({ type: 'frame', id: fr.id }) : [];
      var key = tags.length ? tags[0] : '__none';
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(fr);
    });
    if (order.length < 2) return order.length;   // nothing to separate
    global.histLocked = true;
    var GAP = 80, BLOCK_GAP = 360, x = 0;
    order.forEach(function (key) {
      var frames = groups[key], y = 0, maxW = 0;
      frames.forEach(function (fr) {
        fr.x = x; fr.y = y;
        var fo = _frameObjById(fr.id);
        if (fo) { fo.setPositionByOrigin(new fabric.Point(x + fr.w / 2, y + fr.h / 2), 'center', 'center'); fo.setCoords(); }
        y += fr.h + GAP;
        if (fr.w > maxW) maxW = fr.w;
      });
      x += maxW + BLOCK_GAP;
    });
    global.histLocked = false;
    if (global.canvas) canvas.requestRenderAll();
    if (typeof _scSerializeWorld === 'function' && typeof pages !== 'undefined') _scSerializeWorld(pages[currentPageIndex]);
    return order.length;
  };

  global._scAlignFrames = function (ids, mode) {
    if (global._scLog) _scLog('ALIGN', mode, 'ids=', ids, '\n  IN   :', _scDumpFrames(ids));
    _syncModelFromLive(ids);
    if (global._scLog) _scLog('  synced:', _scDumpFrames(ids));
    var frs = _modelsByIds(ids); if (frs.length < 2) { if (global._scLog) _scLog('  ABORT <2 frames'); return; }
    var GAP = 60;
    var minX = Math.min.apply(null, frs.map(function (f) { return f.x; }));
    var maxR = Math.max.apply(null, frs.map(function (f) { return f.x + f.w; }));
    var minY = Math.min.apply(null, frs.map(function (f) { return f.y; }));
    var maxB = Math.max.apply(null, frs.map(function (f) { return f.y + f.h; }));
    var cx = (minX + maxR) / 2, cy = (minY + maxB) / 2;
    // "tidy align": left/centerH/right align the X edge → a left/center/right-aligned COLUMN; top/middleV/
    // bottom align the Y edge → a row. After aligning the edge, if the frames would OVERLAP on the other
    // axis, re-sequence them with a gap (alt alta / yan yana) so they never hide each other.
    var horizontal = (mode === 'left' || mode === 'right' || mode === 'centerH');
    if (horizontal) {
      frs.forEach(function (f) {
        if (mode === 'left') f.x = Math.round(minX);
        else if (mode === 'right') f.x = Math.round(maxR - f.w);
        else f.x = Math.round(cx - f.w / 2);
      });
      frs.sort(function (a, b) { return a.y - b.y; });
      var over = false; for (var i = 1; i < frs.length; i++) if (frs[i].y < frs[i - 1].y + frs[i - 1].h) { over = true; break; }
      if (over) { var yc = Math.round(minY); frs.forEach(function (f) { f.y = Math.round(yc); yc += f.h + GAP; }); }
    } else {
      frs.forEach(function (f) {
        if (mode === 'top') f.y = Math.round(minY);
        else if (mode === 'bottom') f.y = Math.round(maxB - f.h);
        else f.y = Math.round(cy - f.h / 2);
      });
      frs.sort(function (a, b) { return a.x - b.x; });
      var over2 = false; for (var j = 1; j < frs.length; j++) if (frs[j].x < frs[j - 1].x + frs[j - 1].w) { over2 = true; break; }
      if (over2) { var xc = Math.round(minX); frs.forEach(function (f) { f.x = Math.round(xc); xc += f.w + GAP; }); }
    }
    _repositionFrames(frs);
    if (global._scLog) _scLog('  OUT  :', _scDumpFrames(ids));
  };

  global._scDistributeFrames = function (ids, axis) {
    if (global._scLog) _scLog('DISTRIBUTE', axis, 'ids=', ids, '\n  IN   :', _scDumpFrames(ids));
    _syncModelFromLive(ids);
    var frs = _modelsByIds(ids); if (frs.length < 2) { if (global._scLog) _scLog('  ABORT <2 frames'); return; }
    var MIN = 60;   // never let frames overlap — if cramped, spread them with at least this gap
    if (axis === 'h') {
      frs.sort(function (a, b) { return a.x - b.x; });
      var minL = frs[0].x, maxR = frs[frs.length - 1].x + frs[frs.length - 1].w;
      var totalW = frs.reduce(function (s, f) { return s + f.w; }, 0);
      var gap = (maxR - minL - totalW) / (frs.length - 1);
      if (!isFinite(gap) || gap < MIN) gap = MIN;            // overlapping/cramped → lay out a clean row
      var cur = minL;
      frs.forEach(function (f) { f.x = Math.round(cur); cur += f.w + gap; });
    } else {
      frs.sort(function (a, b) { return a.y - b.y; });
      var minT = frs[0].y, maxB = frs[frs.length - 1].y + frs[frs.length - 1].h;
      var totalH = frs.reduce(function (s, f) { return s + f.h; }, 0);
      var gapV = (maxB - minT - totalH) / (frs.length - 1);
      if (!isFinite(gapV) || gapV < MIN) gapV = MIN;          // overlapping/cramped → lay out a clean column
      var curY = minT;
      frs.forEach(function (f) { f.y = Math.round(curY); curY += f.h + gapV; });
    }
    _repositionFrames(frs);
    if (global._scLog) _scLog('  OUT  :', _scDumpFrames(ids));
  };

  // lightweight frame group (D8): a model record; frames select & move together + (later) nest in Layers.
  global._scGroupFrames = function (ids) {
    var sc = _curScene(); if (!sc || !ids || ids.length < 2) return null;
    if (global._scLog) _scLog('GROUP ids=', ids, '\n  frames:', _scDumpFrames(ids));
    if (!sc.frameGroups) sc.frameGroups = [];
    sc.frameGroups.forEach(function (g) { g.frameIds = g.frameIds.filter(function (id) { return ids.indexOf(id) < 0; }); });
    sc.frameGroups = sc.frameGroups.filter(function (g) { return g.frameIds.length > 1; });
    var grp = { id: SC._uid('fg'), name: 'Group ' + (sc.frameGroups.length + 1), frameIds: ids.slice() };
    sc.frameGroups.push(grp);
    return grp;
  };
  global._scUngroupFrames = function (groupId) {
    var sc = _curScene(); if (!sc || !sc.frameGroups) return;
    sc.frameGroups = sc.frameGroups.filter(function (g) { return g.id !== groupId; });
  };
  global._scFrameGroupOf = function (frameId) {
    var sc = _curScene(); if (!sc || !sc.frameGroups) return null;
    for (var i = 0; i < sc.frameGroups.length; i++) if (sc.frameGroups[i].frameIds.indexOf(frameId) >= 0) return sc.frameGroups[i];
    return null;
  };

  // shared helpers for sibling scene modules (sleep/world/export/features)
  SC._curScene = _curScene;
  SC._findFrame = _findFrame;
  SC._frameMembers = _frameContentById;     // now: live CONTENT children of a frame id
  SC._frameObjById = _frameObjById;

  // Wire the auto-bind choke-point once (add-once; the handler self-gates on SC._active).
  if (global.cc && cc.on) {
    cc.on('scene:active', function (on) { if (on) { _scHookAutoBind(); setTimeout(_scStripTransientFromFrames, 300); } });
    cc.on('cc:canvas-ready', function () { if (SC._active) _scHookAutoBind(); });
  }
  if (SC._active) { _scHookAutoBind(); setTimeout(_scStripTransientFromFrames, 300); }   // scene already active when this module loaded

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'frames', parent: 'scene', title: 'scene: frames', mount: function () {}, unmount: function () {} });
  }
})(window);
