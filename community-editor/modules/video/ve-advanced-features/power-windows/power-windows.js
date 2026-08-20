/* Module: video/ve-advanced-features/power-windows — POWER WINDOWS — local grading.

   Draw a shape on the clip; that shape gets its OWN full grade. Resolve's model, and the answer to
   "we only grade the whole video, which is frankly unusable".

   WHAT LIVES WHERE, and why this file is thin:
   - The DATA is the clip's GRADE NODE CHAIN, `clip.gradeNodes` (docs/power-windows-plan.md P12):
     so it rides the existing clone/serialize/undo paths for free.
   - The RENDER is preview-render.js `_veGradeOps` + webgl.js `_FS_LUT3D_WINDOW` / `_FS_LUT3D_MATTE`.
     Measured at 0.131ms per analytic window, 0.277ms per path window, at 1080p.
   - This file is only the EDITOR: fabric shapes on the canvas, dragged by the user, written back
     into `geom`.

   The canvas boxes follow the SmartCam camera-box idiom exactly (`_isScCam`), because that seam is
   already proven and a second one would be a second set of bugs. That means `_isPowerWindow` must
   be registered in ALL THREE places or it leaks:
     1. core/history.js       - or every drag lands in the undo stack as a canvas object
     2. overlay.js skip list  - or `object:added` mints a TIMELINE CLIP for each window (this
                                actually happened to SmartCam: the boxes showed up as "Overlay"
                                clips). Note a window CANNOT use overlay.js's generic
                                `excludeFromExport && !selectable && !evented` branch: a window must
                                stay selectable and evented to be draggable.
     3. excludeFromExport     - or the box is baked into rendered output. */
(function () {
  'use strict';

  function _VE() { return window.__ccVideoEditor; }
  function _cvs() { return window.canvas; }

  /* This file called `_toast(...)` in three places and NEVER DEFINED IT. Every other module's
     `_toast` is a local function inside its own IIFE, so nothing was in scope here: these were
     unguarded bare calls that THREW `ReferenceError: _toast is not defined`, killing the handler
     outright rather than failing quietly. It fired on finishing a path with under 3 points, on
     Escape while drawing, and when the affine could not be resolved.

     The fifth invented symbol this session, and the first that throws instead of no-opping. */
  function _toast(m) { if (typeof showToast === 'function') showToast(m); }

  var _open = false, _clipId = null, _shapes = [], _sel = -1, _syncing = false, _matte = false;
  // Tracking-point overlay: the small dots the tracker locked onto, shown on contextTop so the
  // owner can SEE what "track this" grabbed (answers "neye göre takip ediyor"). _ptsPainted lets
  // the after:render handler clear its own dots exactly once when there is nothing to draw.
  var _showPoints = true, _ptsPainted = false;

  /* THE CLIP IS HELD BY ID, NEVER AS AN OBJECT, and resolved on every access.

     undo-markers.js:238 does `VE._veProject.tracks = JSON.parse(snapshot)`: undo REPLACES every clip
     object in the project. Ids survive that; object identity does not.

     This module used to hold `_clip = clip`. Measured after one Ctrl+Z: the live clip had 2 nodes,
     the panel showed 3, and adding a node through the panel NEVER reached the live clip. Every edit
     went into an object nothing renders and the canvas shapes vanished. After an undo the toolbar
     was a zombie, which is very likely the real shape of "hiçbir şekilde veremiyorum".

     ve-inspector.js has always held `_currentClipId` and re-resolved through `_findClip()`, which is
     exactly why it survives undo. Same idiom here. */
  function _clip() {
    var VE = _VE();
    if (!_clipId || !VE || !VE._findClipById) return null;
    return VE._findClipById(_clipId);
  }
  var _node = 0;   // which grade node's windows we are editing

  /* WINDOWS LIVE ON A NODE NOW (docs/power-windows-plan.md P12). `clip.powerWindows` no longer
     exists after migration: VE._veNodes() moves each one onto its own node and deletes the legacy
     field, because two writable homes for one grade drift apart on the first JSON round-trip.

     Everything in this file reads through _wins()/_nodes(), so there is no path left that can touch
     the old flat array and silently edit a copy nobody renders. */
  function _nodes() {
    var VE = _VE();
    var c = _clip();
    return (VE && VE._veNodes && c) ? VE._veNodes(c) : [];
  }
  function _curNode() {
    var ns = _nodes();
    if (!ns.length) return null;
    if (_node < 0 || _node >= ns.length) _node = ns.length - 1;
    return ns[_node];
  }
  function _wins() {
    var n = _curNode();
    if (!n) return [];
    if (!n.windows) n.windows = [];
    return n.windows;
  }

  // Each window gets a stable colour by index, so the inspector row and the canvas shape read as
  // the same object. Same idiom as SmartCam's camera colours.
  var COLS = ['#f2ff58', '#58d3ff', '#ff58a8', '#7dff58', '#ff9c58', '#b558ff', '#58ffd3', '#ff5858'];
  function _col(i) { return COLS[i % COLS.length]; }

  function _canvasSize() {
    var VE = _VE();
    var cw = (typeof CW !== 'undefined' && CW) || (VE && VE._veUi && VE._veUi.previewCanvas && VE._veUi.previewCanvas.width) || 1920;
    var ch = (typeof CH !== 'undefined' && CH) || (VE && VE._veUi && VE._veUi.previewCanvas && VE._veUi.previewCanvas.height) || 1080;
    return { w: cw, h: ch };
  }

  // The <video> (or image) element behind the selected clip. Needed for the affine: without the
  // real media size a window cannot be resolved from source space.
  function _mediaEl(clip) {
    var VE = _VE();
    if (!VE || !clip) return null;
    var pool = VE._vePlayback && VE._vePlayback.videoPool;
    var el = pool && pool[clip.id];   // the pool is keyed by clip id, nothing else
    if (el) return el;
    // Fall back to the sizes cached on the clip: the affine only needs dimensions.
    if (clip._mediaWidth && clip._mediaHeight) {
      return { videoWidth: clip._mediaWidth, videoHeight: clip._mediaHeight };
    }
    return null;
  }

  function _affine(clip) {
    var VE = _VE(), c = _canvasSize(), el = _mediaEl(clip);
    if (!VE || !VE._vePwAffine || !el) return null;
    return VE._vePwAffine(clip, el, c.w, c.h);
  }

  function _newWindow() {
    // Born as a centred rect covering the middle third: big enough to grab, obviously not the whole
    // frame, so the very first drag shows what a window IS.
    // No `grade` on it: since the node chain landed, a window is a SHAPE and the look lives on its
    // node. A grade here would be silently ignored by the renderer, which is worse than absent.
    var VE = _VE();
    if (VE && VE._veNewWindow) return VE._veNewWindow();
    return {
      id: 'pw' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
      shape: 'rect',
      geom: { x: 0.33, y: 0.33, w: 0.34, h: 0.34 },
      softness: 0.3, invert: false, enabled: true
    };
  }

  // ── canvas <-> data ────────────────────────────────────────────────────────

  function _clearShapes() {
    var cvs = _cvs();
    if (!cvs) { _shapes = []; return; }
    _syncing = true;
    for (var i = 0; i < _shapes.length; i++) { try { cvs.remove(_shapes[i]); } catch (e) {} }
    _shapes = [];
    _syncing = false;
  }

  function _draw() {
    var cvs = _cvs(), VE = _VE();
    if (!cvs || !_clip() || !_open) return;
    _clearShapes();
    var af = _affine(_clip()), c = _canvasSize();
    if (!af) return;
    var pws = _wins();
    _syncing = true;
    for (var i = 0; i < pws.length; i++) {
      var p = pws[i];
      if (!p || !p.geom) continue;
      var col = _col(i);

      // A PATH window (pen / polygon / curve). Rebuilt from the stored source-normalized `d` rather
      // than kept as the pen's original object, so what you grab is guaranteed to be the same shape
      // the matte rasteriser fills.
      if (p.geom.d) {
        /* Built in CANVAS PIXELS, not as a 0..1 path that is then scaled.
           A fabric.Path derives its own left/top/width/height and pathOffset from the path data, so
           setting {left, top, scaleX} on a unit path does NOT place point u at (left + u*scale): it
           places the BOUNDING BOX, and the stroke scales with it. Measured: a 0.4x0.3 unit triangle
           asked to sit at (0,0) with scale 1920 reported a bbox of 2700x1416 at (-6,-6) instead of
           768x324 at (192,108). That is the chaos of scattered giant outlines. */
        var dPx = _transformD(p.geom.d, af.bx * c.w, af.by * c.h, af.ax * c.w, af.ay * c.h);
        var pp = new fabric.Path(dPx, {
          fill: 'rgba(0,0,0,0.001)',
          stroke: col, strokeWidth: 2, strokeUniform: true,
          strokeDashArray: p.enabled === false ? [6, 4] : null,
          cornerColor: col, cornerStrokeColor: '#000', cornerSize: 9,
          cornerStyle: 'circle', transparentCorners: false, borderColor: col,
          objectCaching: false,
          opacity: p.enabled === false ? 0.45 : 1,
          excludeFromExport: true,
          _isPowerWindow: true, _pwIdx: i
        });
        // No left/top/scale override: the path data is already where it belongs, and fabric has
        // computed the object's own box from it.
        pp.setCoords();
        // Base transform, so onPlayhead can offset a TRACKED path back from the same starting point
        // every frame instead of compounding.
        pp._pwBase = { left: pp.left, top: pp.top, w: pp.getScaledWidth(), h: pp.getScaledHeight() };
        // Vertex mode replaces ALL controls of the SELECTED path with per-anchor handles (scale
        // corners would fight point edits); otherwise the normal corners + the softness handle.
        if (_vtxOn && i === _sel) {
          pp.controls = _vtxControlsFor(pp);
        } else {
          var _scp = _softCtrl();
          if (_scp) pp.controls = Object.assign({}, pp.controls, { pwSoft: _scp });
        }
        cvs.add(pp);
        _shapes.push(pp);
        continue;
      }

      // source -> frame, then frame fraction -> canvas px. Exactly the render's mapping, so the box
      // sits on the pixels that will actually be graded.
      var fx = (p.geom.x * af.ax + af.bx) * c.w;
      var fy = (p.geom.y * af.ay + af.by) * c.h;
      var fw = p.geom.w * af.ax * c.w;
      var fh = p.geom.h * af.ay * c.h;
      // CENTRE origin: left/top is the window centre, which is rotation-invariant. That keeps the
      // draw / read-back / tracking maths clean once the window can be rotated (a top-left origin
      // moves under rotation and every formula would have to undo it).
      var opt = {
        left: fx + fw / 2, top: fy + fh / 2, originX: 'center', originY: 'center',
        width: fw, height: fh, angle: p.geom.angle || 0,
        fill: 'rgba(0,0,0,0.001)',   // not 'transparent': a fully transparent fill is not hit-testable
        stroke: col, strokeWidth: 2, strokeUniform: true,
        strokeDashArray: p.enabled === false ? [6, 4] : null,
        cornerColor: col, cornerStrokeColor: '#000', cornerSize: 10,
        cornerStyle: 'circle', transparentCorners: false, borderColor: col,
        lockScalingFlip: true, lockSkewingX: true, lockSkewingY: true,
        objectCaching: false,
        opacity: p.enabled === false ? 0.45 : 1,
        excludeFromExport: true,
        _isPowerWindow: true, _pwIdx: i
      };
      var o = (p.shape === 'ellipse')
        ? new fabric.Ellipse(Object.assign({}, opt, { rx: fw / 2, ry: fh / 2 }))
        : new fabric.Rect(opt);
      // Add the magenta softness handle beside the default scale corners (Object.assign so the
      // prototype's controls stay shared/untouched and only this instance gains pwSoft).
      var _sc = _softCtrl();
      if (_sc) o.controls = Object.assign({}, o.controls, { pwSoft: _sc });
      cvs.add(o);
      _shapes.push(o);
    }
    if (_shapes[_sel]) cvs.setActiveObject(_shapes[_sel]);
    _syncing = false;
    cvs.requestRenderAll();
  }

  /* THE VISIBLE HALF OF TRACKING. The renderer already shifts the GRADE by the track offset, but the
     yellow shape on the canvas is drawn ONCE at its base position and never moved - so when the
     video plays, the outline sits still while the subject walks off, which reads as "tracking is
     broken / sabit kalıyor" even when the grade underneath is following. This repositions the shapes
     to their tracked place for the CURRENT playhead, every frame, from the stored base (so it never
     compounds). Called from the render loop; a no-op when nothing is tracked, so it costs nothing on
     an untracked clip. */
  function _onPlayhead(time) {
    if (!_open || _syncing) return;
    var VE = _VE(), clip = _clip(), cvs = _cvs();
    if (!VE || !clip || !cvs || !VE._vePwTrackOffset) return;
    var pws = _wins();
    var af = _affine(clip), c = _canvasSize();
    if (!af) return;
    var rel = time - (clip.startTime || 0);
    var moved = false;
    for (var i = 0; i < _shapes.length; i++) {
      var shp = _shapes[i], win = pws[shp._pwIdx];
      if (!win) continue;
      var active = win.track && win.track.on !== false && win.track.kf;
      /* UNTRACKED shapes are NEVER repositioned. Repositioning them "to identity" was the owner's
         "obje ile efekt farklı alanlarda / kaydırınca geri ışınlanıyor" bug: a drag updates geom via
         _readShape, but this ran on the very next preview render and rammed the outline back to the
         STALE base stored at draw time, while the matte stayed at the new geometry. */
      if (!active) continue;
      // Mid-drag the user owns the shape: fighting the transform teleports it under the cursor.
      if (cvs._currentTransform && cvs._currentTransform.target === shp) continue;
      var off = VE._vePwTrackOffset(win, rel);
      var shifted = off.dx || off.dy || off.s !== 1;
      if (shp._pwBase) {   // PATH: base is at scale 1, so scale by off.s about the base centre.
        var b = shp._pwBase;
        var pcx = b.left + b.w / 2, pcy = b.top + b.h / 2;
        var nw = b.w * off.s, nh = b.h * off.s;
        shp.scaleX = off.s; shp.scaleY = off.s;
        shp.left = pcx + off.dx * af.ax * c.w - nw / 2;
        shp.top = pcy + off.dy * af.ay * c.h - nh / 2;
        shp.setCoords();
        if (shifted) moved = true;
        continue;
      }
      // RECT / ELLIPSE: recompute from the tracked centre + scale, exactly as the render. Origin is
      // CENTRE, so left/top is the centre directly; angle stays whatever the window was rotated to.
      var g = win.geom;
      var cxn = g.x + g.w / 2 + off.dx, cyn = g.y + g.h / 2 + off.dy;
      var gw = g.w * off.s, gh = g.h * off.s;
      var ncx = (cxn * af.ax + af.bx) * c.w, ncy = (cyn * af.ay + af.by) * c.h;
      var nfw = gw * af.ax * c.w, nfh = gh * af.ay * c.h;
      if (shp.type === 'ellipse') { shp.left = ncx; shp.top = ncy; shp.set({ rx: nfw / 2, ry: nfh / 2 }); }
      else { shp.left = ncx; shp.top = ncy; shp.set({ width: nfw, height: nfh }); }
      shp.setCoords();
      if (shifted) moved = true;
    }
    if (moved) cvs.requestRenderAll();
  }

  // The magenta of Resolve's softness ring: distinct from every window colour so the feather reads as
  // a different thing from the shape edge.
  var PW_MAGENTA = '#ff3df0';

  /* The feather ring: a dashed magenta outline offset OUTWARD from the shape by the softness extent,
     so the falloff is visible on the canvas instead of only in a slider. Softness is a fraction of
     the shape's smaller half-axis (same definition the renderer blurs by), so extent = soft * min/2.
     Drawn in scene coords (the ctx already carries the viewport transform). */
  function _featherRing(ctx, shp, soft, z) {
    var ctr = shp.getCenterPoint();
    var w = shp.getScaledWidth(), h = shp.getScaledHeight();
    var ext = soft * Math.min(w, h) / 2;
    ctx.save();
    // Rotate the ring with the window so the feather hugs a rotated shape (getScaledWidth/Height are
    // the UNrotated dims, so draw axis-aligned in a frame rotated about the centre).
    ctx.translate(ctr.x, ctr.y);
    if (shp.angle) ctx.rotate(shp.angle * Math.PI / 180);
    ctx.strokeStyle = PW_MAGENTA;
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    ctx.beginPath();
    if (shp.type === 'rect') {
      var x = -w / 2 - ext, y = -h / 2 - ext, rw = w + 2 * ext, rh = h + 2 * ext;
      var r = Math.min(ext + 2 / z, Math.min(rw, rh) / 2);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + rw, y, x + rw, y + rh, r);
      ctx.arcTo(x + rw, y + rh, x, y + rh, r);
      ctx.arcTo(x, y + rh, x, y, r);
      ctx.arcTo(x, y, x + rw, y, r);
      ctx.closePath();
    } else {
      // ellipse + path: an outward-offset ellipse of the shape's bbox is the right hint for both.
      ctx.ellipse(0, 0, w / 2 + ext, h / 2 + ext, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* The linear window's on-canvas cue: a solid centre line, two dashed band edges at +/- the
     softness band, and an arrow pointing to the GRADED side. Drawn in the shape's rotated frame so
     it tracks the window's rotation. The graded side is local +Y in screen space (verified against
     the shader): softness 0 = a hard split at the centre line, 1 = a band spanning the whole box. */
  function _linearCue(ctx, shp, soft, z) {
    var ctr = shp.getCenterPoint();
    var w = shp.getScaledWidth(), h = shp.getScaledHeight();
    var band = Math.max(soft, 0) * h / 2;
    ctx.save();
    ctx.translate(ctr.x, ctr.y);
    if (shp.angle) ctx.rotate(shp.angle * Math.PI / 180);
    ctx.strokeStyle = PW_MAGENTA;
    ctx.fillStyle = PW_MAGENTA;
    // centre line (solid) along local X
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    // band edges (dashed)
    if (band > 0.5) {
      ctx.lineWidth = 1 / z;
      ctx.setLineDash([5 / z, 4 / z]);
      ctx.beginPath(); ctx.moveTo(-w / 2, -band); ctx.lineTo(w / 2, -band); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w / 2, band); ctx.lineTo(w / 2, band); ctx.stroke();
    }
    // arrow toward the graded (+local-Y, upward on screen) side
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5 / z;
    var ay = -Math.max(band + 10 / z, h / 4), ah = 7 / z;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-ah, ay + ah); ctx.lineTo(0, ay); ctx.lineTo(ah, ay + ah); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* The canvas overlay for power windows, drawn on contextTop (the transient upper layer the pen
     preview also uses). TWO things live here:
       1. the SELECTED window's feather ring (the softness falloff, always shown when soft > 0), and
       2. the tracked point cloud (the features the tracker locked onto), when "show points" is on.
     Bound to after:render (fabric clears/redraws objects on the lower canvas; contextTop is ours).
     No-op while drawing (the pen preview owns contextTop then) and self-clears when idle. */
  function _drawOverlay() {
    var cvs = _cvs();
    if (!cvs || !cvs.contextTop) return;
    if (_dr) return; // pen preview owns contextTop while a path is being drawn
    var ctx = cvs.contextTop;
    var VE = _VE(), clip = _clip();
    if (!_open || !VE || !clip) {
      if (_ptsPainted) { cvs.clearContext(ctx); _ptsPainted = false; }
      return;
    }
    var pws = _wins(), af = _affine(clip), c = _canvasSize();
    if (!af) { if (_ptsPainted) { cvs.clearContext(ctx); _ptsPainted = false; } return; }
    var time = (VE._veProject && VE._veProject.playheadTime) || 0;
    var rel = time - (clip.startTime || 0);
    var live = function (w) { return !VE._vePwLiveAt || VE._vePwLiveAt(w, rel); };
    var z = cvs.getZoom() || 1, any = false;
    cvs.clearContext(ctx);
    ctx.save();
    if (cvs.viewportTransform) ctx.setTransform.apply(ctx, cvs.viewportTransform);

    // (1) Feather ring (rect/ellipse) or transition cue (linear) for the selected window.
    var selWin = pws[_sel], selShp = _shapes[_sel];
    if (selWin && selShp && selWin.enabled !== false && live(selWin)) {
      var soft = typeof selWin.softness === 'number' ? selWin.softness : 0.3;
      if (selWin.shape === 'linear') { _linearCue(ctx, selShp, soft, z); any = true; }
      else if (soft > 0.001) { _featherRing(ctx, selShp, soft, z); any = true; }
    }

    // (2) Tracked point cloud.
    if (_showPoints && VE._vePwTrackOffset) {
      for (var i = 0; i < pws.length; i++) {
        var win = pws[i];
        if (!win || !win.track || win.track.on === false || !win.track.seed || !win.track.seed.length) continue;
        if (!live(win)) continue; // hidden while outside its time range
        var off = VE._vePwTrackOffset(win, rel);
        var bb = _winBBox(win), Cx = bb.x + bb.w / 2, Cy = bb.y + bb.h / 2;
        var col = _col(i), seed = win.track.seed;
        for (var k = 0; k < seed.length; k++) {
          // Same rigid transform the window uses: translate the cloud by the offset, scale about centre.
          var pxn = Cx + (seed[k][0] - Cx) * off.s + off.dx;
          var pyn = Cy + (seed[k][1] - Cy) * off.s + off.dy;
          var fx = (pxn * af.ax + af.bx) * c.w, fy = (pyn * af.ay + af.by) * c.h;
          ctx.beginPath();
          ctx.arc(fx, fy, 2.5 / z, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.65)';
          ctx.lineWidth = 1 / z;
          ctx.stroke();
          any = true;
        }
      }
    }
    // (3) GHOST OUTLINES for the OTHER nodes' windows. Every enabled node keeps rendering (the chain
    // is serial), but only the open node's windows have interactive shapes - so an older node's
    // effect used to drift around with NO visible outline and read as "my effect landed somewhere
    // else" (owner's report). Faint dashed outlines, track offset applied, drawn purely on
    // contextTop: deliberately not clickable - select the node's row in Renk Araçları to edit them.
    var allNodes = (VE._veNodes && VE._veNodes(clip)) || [];
    for (var gn = 0; gn < allNodes.length; gn++) {
      if (gn === _node) continue;
      var gnd = allNodes[gn];
      if (!gnd || gnd.enabled === false) continue;
      var gws = gnd.windows || [];
      for (var gj = 0; gj < gws.length; gj++) {
        var gw = gws[gj];
        if (!gw || gw.enabled === false || !gw.geom) continue;
        if (!live(gw)) continue;
        var goff = (gw.track && gw.track.on !== false && gw.track.kf && VE._vePwTrackOffset)
          ? VE._vePwTrackOffset(gw, rel) : { dx: 0, dy: 0, s: 1 };
        var gs = goff.s || 1;
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = _col(gj);
        ctx.lineWidth = 1.2 / z;
        ctx.setLineDash([4 / z, 4 / z]);
        if (gw.geom.d) {
          // Same pivot-folded affine the matte rasteriser uses, so the ghost sits exactly on the
          // pixels being graded. Pivot memoized against d (render.js does the same).
          var dPx;
          if (goff.dx || goff.dy || gs !== 1) {
            if (gw._bbcD !== gw.geom.d) { gw._bbc = VE._veDBboxCenter(gw.geom.d); gw._bbcD = gw.geom.d; }
            dPx = _transformD(gw.geom.d,
              (af.bx + (gw._bbc[0] * (1 - gs) + goff.dx) * af.ax) * c.w,
              (af.by + (gw._bbc[1] * (1 - gs) + goff.dy) * af.ay) * c.h,
              af.ax * c.w * gs, af.ay * c.h * gs);
          } else {
            dPx = _transformD(gw.geom.d, af.bx * c.w, af.by * c.h, af.ax * c.w, af.ay * c.h);
          }
          try { ctx.stroke(new Path2D(dPx)); any = true; } catch (e2) {}
        } else {
          var gg = gw.geom;
          var gcx = gg.x + gg.w / 2 + goff.dx, gcy = gg.y + gg.h / 2 + goff.dy;
          var fcx = (gcx * af.ax + af.bx) * c.w, fcy = (gcy * af.ay + af.by) * c.h;
          var gfw = gg.w * gs * af.ax * c.w, gfh = gg.h * gs * af.ay * c.h;
          ctx.translate(fcx, fcy);
          if (gg.angle) ctx.rotate(gg.angle * Math.PI / 180);
          ctx.beginPath();
          if (gw.shape === 'ellipse') ctx.ellipse(0, 0, gfw / 2, gfh / 2, 0, 0, Math.PI * 2);
          else ctx.rect(-gfw / 2, -gfh / 2, gfw, gfh);
          ctx.stroke();
          any = true;
        }
        ctx.restore();
      }
    }
    ctx.restore();
    _ptsPainted = any;
  }

  /* The magenta softness HANDLE: a fabric custom control on each rect/ellipse window. Dragging it
     away from the shape's top edge raises softness (0 at the edge, 1 at a full half-axis out); the
     feather ring and the graded preview follow live. Placed up-and-right of top-centre so it never
     sits under the top-middle scale control. One shared instance (fabric shares controls the same
     way across its prototype). */
  function _softExtentPx(fo) {
    var win = _wins()[fo._pwIdx];
    var soft = win && typeof win.softness === 'number' ? win.softness : 0.3;
    return soft * Math.min(fo.getScaledWidth(), fo.getScaledHeight()) / 2;
  }
  // Lazy so module-eval never touches fabric before the vendor script has loaded.
  var _softCtrlInst = null;
  function _softCtrl() {
    if (_softCtrlInst || typeof fabric === 'undefined' || !fabric.Control) return _softCtrlInst;
    _softCtrlInst = new fabric.Control({
      actionName: 'pwSoftness',
      cursorStyle: 'ns-resize',
      positionHandler: function (dim, finalMatrix, fo) {
        var ctr = fo.getCenterPoint();
        var topY = ctr.y - fo.getScaledHeight() / 2 - _softExtentPx(fo);
        var hx = ctr.x + fo.getScaledWidth() * 0.25; // right of centre -> clear of the mt scale control
        var vpt = (fo.canvas && fo.canvas.viewportTransform) || fabric.iMatrix;
        return fabric.util.transformPoint(new fabric.Point(hx, topY), vpt);
      },
      actionHandler: function (eventData, transform, x, y) {
        var fo = transform.target, win = _wins()[fo._pwIdx];
        if (!win) return false;
        var ctr = fo.getCenterPoint();
        var topY = ctr.y - fo.getScaledHeight() / 2;
        var minHalf = Math.min(fo.getScaledWidth(), fo.getScaledHeight()) / 2;
        var soft = minHalf > 0 ? Math.max(0, Math.min(1, (topY - y) / minHalf)) : 0;
        win.softness = +soft.toFixed(3);
        if (fo.canvas) fo.canvas.requestRenderAll();
        _repaint(); // live feather on the graded frame
        return true;
      },
      render: function (ctx, left, top) {
        var s = 5;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(left, top - s); ctx.lineTo(left + s, top); ctx.lineTo(left, top + s); ctx.lineTo(left - s, top);
        ctx.closePath();
        ctx.fillStyle = PW_MAGENTA; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    });
    return _softCtrlInst;
  }

  /* The live track offset for this window at the CURRENT playhead. null when untracked or when the
     offset is identity. Needed wherever canvas state is read back into data: a tracked shape sits at
     base+offset on screen, and storing that verbatim would bake the offset in, so the render (which
     adds the offset again) would put the effect somewhere other than where the user dropped the
     outline - the second half of the owner's teleporting-effect bug. */
  function _trackOffNow(p) {
    var VE = _VE(), clip = _clip();
    if (!p || !p.track || p.track.on === false || !p.track.kf || !VE || !VE._vePwTrackOffset || !clip) return null;
    var rel = ((VE._veProject && VE._veProject.playheadTime) || 0) - (clip.startTime || 0);
    var off = VE._vePwTrackOffset(p, rel);
    return (off.dx || off.dy || (off.s && off.s !== 1)) ? off : null;
  }

  /* ── PER-VERTEX EDITING (owner reference frame 3) ─────────────────────────
     One draggable fabric.Control per path ANCHOR, the same custom-control idiom as the softness
     handle. Deliberately NOT a bridge into canvas/tools/polygon-edit: that module's enter/exit is
     welded to the FRAME lifecycle (_isFrame guard, contour rebuild, the global editor undo snap,
     structure-panel refreshes), and flagging a power window as a frame to satisfy it would leak the
     shape into every frame seam. The transferable part of polygon-edit is its point maths, which we
     already have (calcTransformMatrix in/out via _pathToSource).
     Dragging an anchor moves it RIGIDLY with its attached bezier handles (incoming cp2 + the next
     command's cp1), so a curve keeps its local shape - the anchor-drag behaviour of Resolve/vector
     tools. Write-back runs through the normal object:modified -> _readShape path on release, so
     tracking compensation and undo apply unchanged. */
  var _vtxOn = false;
  function _mkVtxCtrl(ci, pi) {
    return new fabric.Control({
      actionName: 'pwVertex',
      cursorStyle: 'crosshair',
      positionHandler: function (dim, finalMatrix, fo) {
        var po = fo.pathOffset || { x: 0, y: 0 };
        var cmd = fo.path[ci];
        if (!cmd) return new fabric.Point(-1e4, -1e4);
        var pt = fabric.util.transformPoint(
          new fabric.Point(cmd[pi] - po.x, cmd[pi + 1] - po.y), fo.calcTransformMatrix());
        var vpt = (fo.canvas && fo.canvas.viewportTransform) || fabric.iMatrix;
        return fabric.util.transformPoint(pt, vpt);
      },
      actionHandler: function (eventData, transform, x, y) {
        // x,y arrive in scene coords; object matrix inverse + pathOffset = path space (polygon-edit's
        // _canvasToPt, inlined).
        var fo = transform.target, cmd = fo.path[ci];
        if (!cmd) return false;
        var po = fo.pathOffset || { x: 0, y: 0 };
        var loc = fabric.util.transformPoint(new fabric.Point(x, y),
          fabric.util.invertTransform(fo.calcTransformMatrix()));
        var dx = (loc.x + po.x) - cmd[pi], dy = (loc.y + po.y) - cmd[pi + 1];
        cmd[pi] += dx; cmd[pi + 1] += dy;
        if (cmd[0] === 'C') { cmd[3] += dx; cmd[4] += dy; }            // incoming handle (cp2)
        var nxt = fo.path[ci + 1];
        if (nxt && nxt[0] === 'C') { nxt[1] += dx; nxt[2] += dy; }      // outgoing handle (cp1)
        fo.dirty = true;
        if (fo.canvas) fo.canvas.requestRenderAll();
        return true;
      },
      render: function (ctx, left, top, so, fo) {
        var s = 4;
        ctx.save();
        ctx.beginPath();
        ctx.rect(left - s, top - s, s * 2, s * 2);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = _col(fo._pwIdx || 0);
        ctx.lineWidth = 1.5;
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    });
  }
  function _vtxControlsFor(shp) {
    var ctrls = {}, path = shp.path || [];
    for (var ci = 0; ci < path.length; ci++) {
      var t = path[ci][0];
      if (t === 'Z' || t === 'z') continue;
      ctrls['pwv' + ci] = _mkVtxCtrl(ci, path[ci].length - 2);
    }
    return ctrls;
  }

  // The drag, written back. This is the affine run BACKWARDS: frame -> source.
  function _readShape(i) {
    var o = _shapes[i], p = _wins()[i];
    if (!o || !p) return;
    var af = _affine(_clip()), c = _canvasSize();
    if (!af || !af.ax || !af.ay) return;
    var off = _trackOffNow(p);

    // A path window's geometry IS its `d`, so a drag has to be baked back into the points. Reading
    // left/top/scale into geom.x/y/w/h instead would leave `d` untouched, and the matte would keep
    // rasterising the shape at its ORIGINAL place while the outline you dragged sat somewhere else.
    if (p.geom && p.geom.d) {
      // Ask FABRIC where the points actually are now (calcTransformMatrix covers move + scale +
      // rotate together), then map that back to source. Deriving it from left/scaleX by hand was
      // what put the outline somewhere other than the matte it controls.
      var d = _pathToSource(o, af, c);
      if (off) {
        /* Invert the track transform so the STORED path stays the BASE. The render does
           x' = pivot + (x - pivot) * s + dx with pivot = bbox centre of the base, and the bbox
           centre maps to pivot + dx, so pivot = bboxCentre(read) - [dx, dy]. Solving for x gives an
           affine in x': x = x'/s + pivot*(1 - 1/s) - dx/s. */
        var VE2 = _VE();
        var cRead = (VE2 && VE2._veDBboxCenter) ? VE2._veDBboxCenter(d) : [0.5, 0.5];
        var s = off.s || 1;
        var pvx = cRead[0] - off.dx, pvy = cRead[1] - off.dy;
        d = _transformD(d, pvx * (1 - 1 / s) - off.dx / s, pvy * (1 - 1 / s) - off.dy / s, 1 / s, 1 / s);
      }
      p.geom = { d: d };
      return;
    }

    // scaleX/scaleY, not width/height: fabric resizes by scaling, and reading width alone would
    // ignore the drag entirely. Origin is CENTRE, so o.left/o.top is the centre (rotation-invariant);
    // derive the top-left source coords from centre - half so a rotated window still reads correctly.
    var wS = ((o.width * (o.scaleX || 1)) / c.w) / af.ax;
    var hS = ((o.height * (o.scaleY || 1)) / c.h) / af.ay;
    var cxS = (o.left / c.w - af.bx) / af.ax;
    var cyS = (o.top / c.h - af.by) / af.ay;
    if (off) {
      // Render maps base -> screen as centre+[dx,dy], size*s. Invert both so the stored geom is the base.
      var s2 = off.s || 1;
      cxS -= off.dx; cyS -= off.dy; wS /= s2; hS /= s2;
    }
    p.geom = { x: cxS - wS / 2, y: cyS - hS / 2, w: wS, h: hS };
    if (o.angle) p.geom.angle = o.angle;   // omit when 0 -> unrotated windows keep their minimal geom
  }

  function _onModified(e) {
    if (_syncing || !_open) return;
    var o = e && (e.target || (e.transform && e.transform.target));
    if (!o || !o._isPowerWindow) return;
    _readShape(o._pwIdx);
    _sel = o._pwIdx;
    _commit();
    /* Rebuild the outlines from the stored BASE geometry. After a drag of a TRACKED shape the canvas
       object holds base+offset baked together and its _pwBase is stale; _draw() re-derives both from
       data (single source of truth) and the next render's onPlayhead re-places tracked shapes at
       base+offset. Without this, the outline and the matte drift apart after every drag. */
    _draw();
    _renderUI();
    _repaint();
  }

  /* ── DRAWING A WINDOW: this panel's OWN tool ────────────────────────────────
     Owner 2026-07-17: "ben kalem araçlarını kullan demedim, lut browser için özel araç geliştir
     dedim". An earlier attempt armed the editor's general pen (canvas/tools/pen-tools/) on the
     reuse principle. That was wrong, and it was measured wrong in the owner's screenshot:

       - pen-tools builds a FRAME (its Path carries _isFrame), so frame.js woke up and hung its
         "Edit Vertices / Convert to Shape / Remove Frame / Perspective Fit" bar under the canvas.
       - overlay.js binds object:added at PROJECT LOAD (project.js:16), long before any handler this
         module adds, so it minted a **timeline "Shape" clip** for the pen's Path first. Removing the
         Path afterwards does not remove the clip: two purple Shape clips on Track 2 and Track 3.

     Reuse is right when the thing being reused is the thing you want. A frame tool is not a mask
     tool, and borrowing it drags its whole lifecycle in.

     So: this draws on canvas.contextTop, the transient layer fabric itself uses for brush previews.
     **No fabric object is ever added while drawing**, so there is no object:added at all: the
     timeline leak and the frame bar are not guarded against, they are impossible. The window only
     becomes an object once it is finished, and that object is _isPowerWindow (already skipped
     everywhere). */
  var _dr = null;   // { mode, pts:[{x,y,hx,hy}], down, moved, af, c }

  /* Apply u' = u*s + d to every coordinate pair in SVG path data. Used to bake a drag/scale of a
     path window back into its stored geometry, because the matte rasteriser only ever reads 'd':
     leaving the move on the fabric object would slide the outline away from the mask it controls. */
  /* A fabric.Path's live points -> SOURCE-normalized 'd'. Points in path data are relative to the
     object's pathOffset; calcTransformMatrix() carries the object's whole current transform, so this
     survives a move, a scale and a rotate without any of them being handled as a special case. */
  function _pathToSource(path, af, c) {
    var m = path.calcTransformMatrix();
    var off = path.pathOffset || { x: 0, y: 0 };
    var pd = path.path || [];
    function map(x, y) {
      var p = fabric.util.transformPoint({ x: x - off.x, y: y - off.y }, m);
      return { x: ((p.x / c.w) - af.bx) / af.ax, y: ((p.y / c.h) - af.by) / af.ay };
    }
    var d = '', i, q;
    for (i = 0; i < pd.length; i++) {
      var sg = pd[i], k = sg[0];
      if (k === 'M' || k === 'L') { q = map(sg[1], sg[2]); d += k + ' ' + q.x + ' ' + q.y + ' '; }
      else if (k === 'Q') { var q1 = map(sg[1], sg[2]), q2 = map(sg[3], sg[4]);
        d += 'Q ' + q1.x + ' ' + q1.y + ' ' + q2.x + ' ' + q2.y + ' '; }
      else if (k === 'C') { var c1 = map(sg[1], sg[2]), c2 = map(sg[3], sg[4]), c3 = map(sg[5], sg[6]);
        d += 'C ' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + c3.x + ' ' + c3.y + ' '; }
      else if (k === 'Z' || k === 'z') d += 'Z ';
    }
    if (d.indexOf('Z') === -1) d += 'Z';
    return d.trim();
  }

  function _transformD(d, dx, dy, sx, sy) {
    var out = [], i = 0;
    var toks = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    while (i < toks.length) {
      var t = toks[i++];
      if (/[A-Za-z]/.test(t)) {
        out.push(t.toUpperCase());
        var n = t.toUpperCase() === 'M' || t.toUpperCase() === 'L' ? 2
              : t.toUpperCase() === 'Q' ? 4 : t.toUpperCase() === 'C' ? 6 : 0;
        for (var k = 0; k < n; k += 2) {
          out.push(parseFloat(toks[i++]) * sx + dx);
          out.push(parseFloat(toks[i++]) * sy + dy);
        }
      }
    }
    return out.join(' ');
  }

  function _canvasPt(e) {
    var cvs = _cvs();
    var p = cvs.getPointer(e.e);
    return { x: p.x, y: p.y };
  }

  // canvas px -> SOURCE-normalized (the affine, backwards). Stored geometry is source space so a
  // window sticks to the footage through a re-crop, exactly like the rect/ellipse windows.
  function _toSource(pt, af, c) {
    return { x: ((pt.x / c.w) - af.bx) / af.ax, y: ((pt.y / c.h) - af.by) / af.ay };
  }

  var CLOSE_PX = 10;   // grab radius for "click the first point to close"

  function _dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /* Build SVG path data from the collected anchors, in SOURCE units.
     - pen: each anchor may carry a symmetric bezier handle (click = corner, click-drag = smooth).
     - curve: Catmull-Rom through the anchors, converted to cubics (the standard 1/6 tangent).
     - freeform: dense samples, emitted as lines. */
  function _buildD(mode, pts, af, c) {
    if (pts.length < 2) return null;
    var S = pts.map(function (p) {
      var a = _toSource({ x: p.x, y: p.y }, af, c);
      var h = (p.hx || p.hy) ? _toSource({ x: p.x + p.hx, y: p.y + p.hy }, af, c) : null;
      return { x: a.x, y: a.y, hx: h ? h.x - a.x : 0, hy: h ? h.y - a.y : 0 };
    });
    var n = S.length, d = 'M ' + S[0].x + ' ' + S[0].y + ' ', i;

    if (mode === 'freeform') {
      for (i = 1; i < n; i++) d += 'L ' + S[i].x + ' ' + S[i].y + ' ';
      return d + 'Z';
    }
    if (mode === 'curvature') {
      // Closed Catmull-Rom: every anchor's tangent comes from its neighbours, wrapping around, so
      // the seam at the start point is as smooth as every other joint.
      for (i = 0; i < n; i++) {
        var p0 = S[(i - 1 + n) % n], p1 = S[i], p2 = S[(i + 1) % n], p3 = S[(i + 2) % n];
        var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += 'C ' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + p2.x + ' ' + p2.y + ' ';
      }
      return d + 'Z';
    }
    // pen
    for (i = 0; i < n; i++) {
      var A = S[i], B = S[(i + 1) % n];
      if (i === n - 1 && n === 2) break;
      d += 'C ' + (A.x + A.hx) + ' ' + (A.y + A.hy) + ' ' +
                  (B.x - B.hx) + ' ' + (B.y - B.hy) + ' ' + B.x + ' ' + B.y + ' ';
    }
    return d + 'Z';
  }

  function _preview() {
    var cvs = _cvs();
    if (!_dr || !cvs || !cvs.contextTop) return;
    var ctx = cvs.contextTop;
    cvs.clearContext(ctx);
    var pts = _dr.pts;
    if (!pts.length) return;
    var col = _col(_wins().length);
    ctx.save();
    // The pointer path is in canvas space, but contextTop is in SCREEN space: without the viewport
    // transform the preview drifts from the cursor the moment the user zooms or pans.
    if (cvs.viewportTransform) ctx.setTransform.apply(ctx, cvs.viewportTransform);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var A = pts[i - 1], B = pts[i];
      if (_dr.mode === 'pen' && (A.hx || A.hy || B.hx || B.hy)) {
        ctx.bezierCurveTo(A.x + A.hx, A.y + A.hy, B.x - B.hx, B.y - B.hy, B.x, B.y);
      } else ctx.lineTo(B.x, B.y);
    }
    if (_dr.cursor) ctx.lineTo(_dr.cursor.x, _dr.cursor.y);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5 / (cvs.getZoom() || 1);
    ctx.setLineDash([5 / (cvs.getZoom() || 1), 4 / (cvs.getZoom() || 1)]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Anchors, with the first one fattened: it is the target for closing, so it has to look like one.
    for (i = 0; i < pts.length; i++) {
      var r = (i === 0 ? 5 : 3) / (cvs.getZoom() || 1);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? col : '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1 / (cvs.getZoom() || 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function _finishDraw() {
    var cvs = _cvs();
    if (!_dr || !_clip()) { _cancelDraw(); return; }
    var mode = _dr.mode, pts = _dr.pts.slice(), af = _dr.af, c = _dr.c;
    _cancelDraw();
    if (pts.length < 3) { _toast('At least 3 points required'); return; }
    var d = _buildD(mode, pts, af, c);
    if (!d) return;
    var VE = _VE();
    var win = _newWindow();
    win.shape = mode === 'curvature' ? 'curve' : (mode === 'freeform' ? 'freeform' : 'pen');
    win.geom = { d: d };
    delete win.grade;   // the grade lives on the NODE
    // A drawn shape is a new look on a new region, so it gets its own node, same as add().
    _node = VE._veNodeAdd(_clip(), false);
    _nodes()[_node].windows = [win];
    _nodes()[_node].name = (VE._vePwName ? VE._vePwName(win.shape) : 'Shape') + ' ' + (_node + 1);
    _sel = 0;
    _commit(); _draw(); _renderUI(); _repaint();
    if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
  }

  function _onDrawDown(e) {
    if (!_dr) return;
    var p = _canvasPt(e);
    if (_dr.mode === 'freeform') { _dr.down = true; _dr.pts.push({ x: p.x, y: p.y, hx: 0, hy: 0 }); _preview(); return; }
    // Click the first anchor again to close. Needs >= 3 points or it is a line, not an area.
    if (_dr.pts.length >= 3 && _dist(p, _dr.pts[0]) <= CLOSE_PX / (_cvs().getZoom() || 1)) { _finishDraw(); return; }
    _dr.pts.push({ x: p.x, y: p.y, hx: 0, hy: 0 });
    _dr.down = true;
    _preview();
  }

  function _onDrawMove(e) {
    if (!_dr) return;
    var p = _canvasPt(e);
    if (_dr.mode === 'freeform') {
      if (!_dr.down) return;
      var last = _dr.pts[_dr.pts.length - 1];
      // Thin the samples: a raw mousemove stream at 60Hz makes a path with hundreds of segments,
      // which is slow to rasterise and impossible to edit later.
      if (!last || _dist(p, last) > 4) { _dr.pts.push({ x: p.x, y: p.y, hx: 0, hy: 0 }); _preview(); }
      return;
    }
    if (_dr.down && _dr.pts.length) {
      // Dragging after placing an anchor pulls its bezier handle: click = corner, click-drag =
      // smooth. This is the pen idiom everyone already knows from Illustrator/Figma/Resolve.
      var a = _dr.pts[_dr.pts.length - 1];
      a.hx = p.x - a.x; a.hy = p.y - a.y;
    }
    _dr.cursor = { x: p.x, y: p.y };
    _preview();
  }

  function _onDrawUp() {
    if (!_dr) return;
    if (_dr.mode === 'freeform' && _dr.down) { _dr.down = false; _finishDraw(); return; }
    _dr.down = false;
  }

  function _onDrawKey(e) {
    if (!_dr) return;
    if (e.key === 'Escape') { _cancelDraw(); _toast('Drawing cancelled'); if (window.VEColorTools) VEColorTools.refresh(); }
    else if (e.key === 'Enter') _finishDraw();
  }

  function _cancelDraw() {
    var cvs = _cvs();
    if (!_dr) return;
    if (cvs) {
      cvs.off('mouse:down', _onDrawDown);
      cvs.off('mouse:move', _onDrawMove);
      cvs.off('mouse:up', _onDrawUp);
      cvs.off('after:render', _preview);
      cvs.selection = _dr.selWas;
      cvs.skipTargetFind = _dr.skipWas;
      cvs.defaultCursor = _dr.curWas || 'default';
      if (cvs.contextTop) cvs.clearContext(cvs.contextTop);
      cvs.requestRenderAll();
    }
    document.removeEventListener('keydown', _onDrawKey);
    _dr = null;
  }

  function _startDraw(mode) {
    var cvs = _cvs();
    if (!cvs || !_clip()) return false;
    if (_dr) { _cancelDraw(); return false; }
    var af = _affine(_clip());
    if (!af) { _toast('Could not read clip media size'); return false; }
    _dr = {
      mode: mode, pts: [], down: false, cursor: null, af: af, c: _canvasSize(),
      selWas: cvs.selection, skipWas: cvs.skipTargetFind, curWas: cvs.defaultCursor
    };
    // Suppress selection while drawing, or the first click grabs whatever is under it (including a
    // window drawn a moment ago) instead of placing a point.
    cvs.discardActiveObject();
    cvs.selection = false;
    cvs.skipTargetFind = true;
    cvs.defaultCursor = 'crosshair';
    cvs.on('mouse:down', _onDrawDown);
    cvs.on('mouse:move', _onDrawMove);
    cvs.on('mouse:up', _onDrawUp);
    cvs.on('after:render', _preview);
    document.addEventListener('keydown', _onDrawKey);
    cvs.requestRenderAll();
    return true;
  }

  function _onSelected(e) {
    if (!_open) return;
    var o = e && (e.selected ? e.selected[0] : e.target);
    if (!o || !o._isPowerWindow) return;
    _sel = o._pwIdx;
    _renderUI();
  }

  /* Push the edit into history + force the preview to re-render with the new geometry.
     These are the names the rest of the editor actually uses (advanced-panels.js does exactly this
     pair after a LUT change). An earlier draft of this file invented `_veCommit`/`_veRenderPreview`/
     `_veDrawFrame`: all three have ZERO definitions anywhere, so behind their `if (VE && ...)`
     guards every drag would have silently failed to commit or repaint while looking wired up. */
  function _commit() {
    var VE = _VE();
    if (VE && VE._vePushUndo) VE._vePushUndo('power window');
  }
  function _repaint() {
    var VE = _VE();
    if (VE && VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
  }
  // Re-render the timeline so the window BARS reflect add/remove/retime. Separate from _repaint
  // (the preview) because the two change for different reasons and the timeline rebuild is heavier.
  function _syncTimeline() {
    var VE = _VE();
    if (VE && VE._veRenderTracks) VE._veRenderTracks();
  }

  // The window's bounding box in source-normalized (0..1) coords. Rect/ellipse: geom. Path: bbox of
  // its 'd' points (control points included - close enough for a track seed).
  function _winBBox(w) {
    if (w.geom && w.geom.d) {
      var nums = (w.geom.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
      var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (var i = 0; i + 1 < nums.length; i += 2) {
        var x = nums[i], y = nums[i + 1];
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
      if (minx > maxx) return { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
      return { x: minx, y: miny, w: Math.max(0.02, maxx - minx), h: Math.max(0.02, maxy - miny) };
    }
    var g = w.geom || { x: 0.33, y: 0.33, w: 0.34, h: 0.34 };
    return { x: g.x, y: g.y, w: g.w, h: g.h };
  }

  /* Turn the region tracker's samples ({t: video seconds, cx, cy: media px, s, conf}) into
     normalized [dx, dy, s] keyframes keyed by CLIP-RELATIVE seconds ((t - trimStart) / speed, the
     same mapping the renderer uses for localTime). Cuts off at a sustained loss of lock: junk
     offsets after the tracker wanders are worse than a shorter track. Split out so the plumbing is
     testable without a real video decode (which the headless pane cannot do). */
  function _applyTrackResult(i, pts, c, mw, mh, trim, speed) {
    var w = _wins()[i];
    if (!w || !pts || !pts.length) return 0;
    var kf = {}, used = 0, low = 0;
    for (var k = 0; k < pts.length; k++) {
      var pt = pts[k];
      if (k > 0 && pt.conf != null && pt.conf < 0.3) { if (++low >= 2) break; continue; }
      low = 0;
      var rel = (pt.t - (trim || 0)) / (speed || 1);
      kf[+rel.toFixed(2)] = [pt.cx / mw - c.x, pt.cy / mh - c.y, (pt.s != null ? +(+pt.s).toFixed(4) : 1)];
      used++;
    }
    if (!used) return 0;
    w.track = { on: true, kf: kf };
    // Keep the seed cloud (source-normalized) so the overlay can SHOW what the tracker locked onto.
    if (pts._seed && pts._seed.length) w.track.seed = pts._seed;
    _commit(); _renderUI(); _repaint(); _syncTimeline();
    return used;
  }

  // ── the API ────────────────────────────────────────────────────────────────

  var PW = {
    isOpen: function () { return _open; },
    windows: function () { return _wins(); },
    selected: function () { return _sel; },
    colorOf: _col,

    /* Re-target the panel at a clip WITHOUT opening the canvas editor, then repaint the list.
       (The old doc here described painting into the inspector's #pw-list: a host that stopped
       existing when the list moved to the floating toolbar, taking this whole layer with it.) */
    refreshUI: function (clip) {
      if (clip && !_open) _clipId = clip.id;
      _renderUI();
    },

    open: function (clip) {
      var cvs = _cvs();
      if (!clip || !cvs) return false;
      if (_open && _clipId === clip.id) return true;
      _clipId = clip.id;
      _open = true;
      // Land on the first node that actually HAS a window: opening onto a bare full-frame node would
      // show an empty window list on a clip that visibly has windows.
      var ns = _nodes(); _node = 0;
      for (var qi = 0; qi < ns.length; qi++) { if ((ns[qi].windows || []).length) { _node = qi; break; } }
      _sel = _wins().length ? 0 : -1;
      cvs.on('object:modified', _onModified);
      cvs.on('selection:created', _onSelected);
      cvs.on('selection:updated', _onSelected);
      cvs.on('after:render', _drawOverlay);
      _draw();
      _renderUI();
      return true;
    },

    close: function () {
      var cvs = _cvs();
      if (cvs) {
        cvs.off('object:modified', _onModified);
        cvs.off('selection:created', _onSelected);
        cvs.off('selection:updated', _onSelected);
        cvs.off('after:render', _drawOverlay);
        if (cvs.contextTop) cvs.clearContext(cvs.contextTop);
        _ptsPainted = false;
      }
      // Kill an in-progress drawing too: its handlers are on the shared canvas, and leaving them
      // live would keep placing points for a clip that is no longer being graded.
      if (_dr) _cancelDraw();
      _clearShapes();
      _open = false; _clipId = null; _sel = -1; _node = 0; _vtxOn = false;
      if (_matte) PW.setMatte(false);
      _renderUI();
      if (cvs) cvs.requestRenderAll();
      return true;
    },

    /* Arm the shared pen for a path window. mode: 'pen' (bezier) | 'curvature' | 'freeform'.
       Returns true when armed; the window appears when the user finishes the path. */
    drawPath: function (mode) {
      if (!_clip()) return false;
      return _startDraw(mode || 'pen');
    },
    isDrawing: function () { return !!_dr; },
    cancelDraw: function () { _cancelDraw(); },

    isTracked: function (i) { var w = _wins()[i]; return !!(w && w.track && w.track.on !== false); },

    // Called by the render loop each frame: moves the on-canvas shapes to their tracked position so
    // the outline visibly follows the subject (not just the grade underneath it).
    onPlayhead: function (time) { _onPlayhead(time); },

    // Per-vertex editing of the selected PATH window (anchors as draggable handles).
    isVertexMode: function () { return !!_vtxOn; },
    vertexMode: function (on) {
      _vtxOn = (on == null) ? !_vtxOn : !!on;
      _draw(); _renderUI();
      return _vtxOn;
    },

    // Toggle the tracked-point overlay (the dots the tracker locked onto).
    showPoints: function (on) {
      _showPoints = on !== false;
      var cvs = _cvs();
      if (cvs) { if (!_showPoints && cvs.contextTop) { cvs.clearContext(cvs.contextTop); _ptsPainted = false; } cvs.requestRenderAll(); }
      return _showPoints;
    },
    pointsShown: function () { return _showPoints; },

    /* Track this window: a ONE-TIME offline pass over the clip's own time range that stores
       [dx, dy, scale] keyframes. Playback then only interpolates them (VE._vePwTrackOffset), so
       following the subject costs nothing per frame.

       POINT-CLOUD tracking (VEA.trackRegion), not the old single-template match: it seeds ~40 corner
       features inside the drawn window, follows each with pyramidal Lucas-Kanade, drops the ones that
       fail a forward-backward check, then fits translation + scale from the median of the survivors
       (re-seeding as points die). A single feature drifting no longer moves the whole window (the
       owner's face-to-hair drift), and the median scale follows the subject growing/shrinking. The
       seed cloud is returned (out._seed) so the overlay can SHOW what it locked onto.

       Needs a decodable <video> - not testable in the headless pane, but both the maths
       (_cloudStep) and the keyframe plumbing (_applyTrackResult) are. */
    track: function (i) {
      var clip = _clip(), w = _wins()[i];
      if (!clip || !w) return false;
      if (!window.VEAdvancedFeatures || !VEAdvancedFeatures.trackRegion) { _toast('Tracking engine could not be loaded'); return false; }
      var el = _mediaEl(clip);
      if (!el || !el.videoWidth || !el.duration) { _toast('Video not ready for tracking'); return false; }
      var mw = el.videoWidth, mh = el.videoHeight;
      var bb = _winBBox(w);
      var speed = clip.speed || 1, trim = clip.trimStart || 0;
      var relStart = w.tStart || 0;
      var relEnd = (w.tDur != null) ? relStart + w.tDur
                                    : (clip.duration || ((el.duration - trim) / speed));
      // Window time is CLIP-relative; the video element seeks SOURCE time. Same trim/speed mapping
      // the renderer uses for localTime, or a trimmed clip tracks the wrong footage.
      var v0 = trim + relStart * speed;
      var v1 = Math.min(el.duration, trim + relEnd * speed);
      if (v1 <= v0 + 0.05) { _toast('Tracking interval too short'); return false; }
      _toast('Tracking analysis started...');
      VEAdvancedFeatures.trackRegion(el, {
        v0: v0, v1: v1,   // step: trackRegion default (1/15s), dense enough for pyramidal LK
        rect: { x: bb.x * mw, y: bb.y * mh, w: Math.max(8, bb.w * mw), h: Math.max(8, bb.h * mh) }
      }, function (pts) {
        var n = _applyTrackResult(i, pts, { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 }, mw, mh, trim, speed);
        _toast(n > 0 ? ('Tracking completed (' + n + ' sample)') : 'Tracking lost');
      });
      return true;
    },

    untrack: function (i) {
      var w = _wins()[i];
      if (w && w.track) { delete w.track; _commit(); _renderUI(); _repaint(); }
      return true;
    },

    // Exposed for testing the plumbing without a real decode.
    _applyTrackResult: function (i, pts, c, mw, mh, trim, speed) { return _applyTrackResult(i, pts, c, mw, mh, trim, speed); },

    add: function () {
      var VE = _VE(), clip = _clip();
      if (!clip || !VE || !VE._veNodeAdd) return -1;
      // A new window means a NEW NODE: in Resolve a node is one look and its region, so hanging a
      // second window off the current node would silently make it share that node's grade.
      _node = VE._veNodeAdd(clip, true);
      _sel = 0;
      _commit(); _draw(); _renderUI(); _repaint(); _syncTimeline();
      return _sel;
    },

    remove: function (i) {
      var VE = _VE(), ws = _wins();
      if (!ws[i]) return false;
      ws.splice(i, 1);
      // A node whose last window just went would grade the WHOLE FRAME (no windows = full frame),
      // which is the opposite of deleting it. So the node goes too.
      if (!ws.length && VE && VE._veNodeRemove) { VE._veNodeRemove(_clip(), _node); _node = Math.max(0, _node - 1); }
      // _pwIdx on every later shape is now stale, so redraw rather than patch: a stale index writes
      // a drag into the WRONG window, which is silent and looks like the grade jumping.
      if (_sel >= _wins().length) _sel = _wins().length - 1;
      _commit(); _draw(); _renderUI(); _repaint(); _syncTimeline();
      return true;
    },

    // The node chain, for the toolbar list.
    nodes: function () { return _nodes(); },
    nodeIndex: function () { return _node; },
    selectNode: function (i) {
      var ns = _nodes();
      if (!ns[i]) return false;
      _node = i; _sel = ns[i].windows && ns[i].windows.length ? 0 : -1;
      _commit(); _draw(); _renderUI(); _repaint(); _syncTimeline();
      return true;
    },
    addNode: function (withWindow) {
      var VE = _VE();
      if (!_clip() || !VE || !VE._veNodeAdd) return -1;
      _node = VE._veNodeAdd(_clip(), !!withWindow);
      _sel = withWindow ? 0 : -1;
      _commit(); _draw(); _renderUI(); _repaint(); _syncTimeline();
      return _node;
    },
    removeNode: function (i) {
      var VE = _VE();
      if (!VE || !VE._veNodeRemove || !VE._veNodeRemove(_clip(), i)) return false;
      _node = Math.max(0, Math.min(_node, _nodes().length - 1));
      _sel = _wins().length ? 0 : -1;
      _commit(); _draw(); _renderUI(); _repaint(); _syncTimeline();
      return true;
    },
    moveNode: function (from, to) {
      var VE = _VE();
      if (!VE || !VE._veNodeMove || !VE._veNodeMove(_clip(), from, to)) return false;
      _node = to;
      _commit(); _draw(); _renderUI(); _repaint(); _syncTimeline();
      return true;
    },
    setNode: function (i, patch) {
      var ns = _nodes();
      if (!ns[i] || !patch) return false;
      for (var k in patch) if (patch.hasOwnProperty(k)) ns[i][k] = patch[k];
      _commit(); _draw(); _renderUI(); _repaint(); _syncTimeline();
      return true;
    },

    select: function (i) {
      if (!_wins()[i]) return false;
      _sel = i;
      var cvs = _cvs();
      if (cvs && _shapes[i]) { _syncing = true; cvs.setActiveObject(_shapes[i]); _syncing = false; cvs.requestRenderAll(); }
      _renderUI();
      return true;
    },

    set: function (i, patch, quiet) {
      var p = _wins()[i];
      if (!p || !patch) return false;
      for (var k in patch) if (patch.hasOwnProperty(k)) p[k] = patch[k];
      _commit();
      if (patch.shape !== undefined || patch.enabled !== undefined) _draw();
      // quiet: skip the toolbar list rebuild. A text/number field being typed into (name, start,
      // duration) loses focus and drops the caret the moment its container innerHTML is replaced, so
      // live-typed edits repaint only the PREVIEW and leave the list to update on the next paint.
      if (!quiet) _renderUI();
      _repaint();
      // Keep the timeline bars in sync when a field that a bar SHOWS changes (name, time, on/off,
      // shape). Not on softness/grade: those do not move a bar, and re-rendering the whole timeline
      // per softness-pixel would be janky.
      if (patch.name !== undefined || patch.tStart !== undefined || patch.tDur !== undefined ||
          patch.enabled !== undefined || patch.shape !== undefined) _syncTimeline();
      return true;
    },

    /* The matte view (Resolve's Shift+H). NOT a nicety: a feather cannot be judged by looking at the
       graded picture, only by looking at the mask. Implemented by swapping each window's grade for a
       hard black/white one and letting the SAME render path draw it, so what you inspect is the
       matte the shader actually uses, not a second drawing of it. */
    setMatte: function (on) {
      var VE = _VE();
      _matte = !!on;
      // A VIEW flag, never a data edit. The first draft stashed each window's real grade in
      // `_gradeBak` and overwrote `grade` in place: save the project while matte view was on and the
      // matte grade plus its backup would be serialised into the file, so the clip would reopen
      // permanently looking like a matte. The render resolves this flag instead, so the data on the
      // clip is never touched and there is nothing to leak or restore.
      if (VE) VE._vePwMatte = _matte;
      _renderUI(); _repaint();
      return true;
    },
    isMatte: function () { return _matte; }
  };

  // ── the inspector list ─────────────────────────────────────────────────────

  /* _renderUI is the "the window list changed, repaint it" signal. It is called from ~20 places in
     this file, so it stays - but it no longer owns a UI.

     It used to render a SECOND, fully-styled window list into #pw-list in the inspector. When that
     list moved to the floating toolbar (P8), the inspector host was deleted and this whole layer
     (_host, _renderUI's markup, _onHostClick, the pw-add/pw-matte global click handler, and every
     rule in power-windows.css) was left behind: built, styled, and permanently unreachable, because
     _host() returned null forever. That is exactly the ghost code the working rules forbid, and it
     even carried a FOURTH copy of the shape-name map using different words ("Elips"/"Dikdörtgen"
     instead of "Daire"/"Kare") that nobody could ever see.

     The list is now owned by ve-color-tools, so this just tells it to repaint. */
  function _renderUI() {
    if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
  }

  window.VEPowerWindows = PW;

  // id is the LEAF, parent is the full dotted path: core/registry.js:18 keys on parent+'.'+id, so
  // passing the whole path as the id stored this under 'video.video.ve-advanced-features.power-
  // windows' and cc.modules.children('video.ve-advanced-features') silently omitted it.
  if (window.cc && cc.modules) cc.modules.register({
    id: 'power-windows', parent: 'video.ve-advanced-features',
    title: 'power-windows', mount: function () {}, unmount: function () { PW.close(); }
  });
})();
