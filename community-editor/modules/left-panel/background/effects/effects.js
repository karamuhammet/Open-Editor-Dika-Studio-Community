/* ═══════════════════════════════════════════════════════════
   Module: left-panel/background/effects — the Efektler menu + engine.
   Replaces the retired gradient/ and blur/ sub-modules in the Background flyout
   (bgDrillIn('effects') → #bg-drill-effects → this module renders it).

   Two-level UI, mirroring modules/left-panel/items: a horizontally scrollable
   strip of EFFECT cards (.items-slider / .items-slider-cell), each drilling into
   its own STYLE grid. Children register themselves through EffectsCore, exactly
   like items children use ItemsCore.registerTab.

   An effect object is a fabric.Image carrying its own parameters (_fxKind,
   _fxPreset, _fxColors…). Editing any parameter in #rp-effect re-runs the same
   paint through _rerenderEffect. Two flavours:
     - procedural  (paint): draws its own pixels. See gradient/.
     - backdrop    (paintBackdrop): samples the live canvas behind it. See glass/.

   The seed matters: every layout decision goes through the seeded rng, so a
   colour change re-paints the SAME composition instead of reshuffling it.

   window entry points: addEffectToCanvas, syncEffectPanel, _rerenderEffect,
   effectsRenderPanel, fxBackToEffects. #p-fx-* inputs live in index.html.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── cc-aware helpers (same fallbacks as the charts module) ──
  function _cvs() {
    if (window.cc && cc.canvas) return cc.canvas();
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
  }
  function _toast(m) { if (window.cc && cc.toast) return cc.toast(m); if (typeof showToast === 'function') showToast(m); }
  function _snap() { if (window.cc && cc.snap) return cc.snap(); if (typeof snap === 'function') snap(); }
  function _add(o) {
    // addToCenter is the shared add seam: it sets _ccAddingObject, which is what
    // lets an effect become a real clip in video mode. Never hand-roll it.
    if (window.cc && cc.addToCenter) return cc.addToCenter(o);
    if (typeof addToCenter === 'function') return addToCenter(o);
    var c = _cvs(); if (c) { c.add(o); c.setActiveObject(o); c.renderAll(); _snap(); }
  }

  var RENDER_MULT = 2;          // blurred output is smooth; 2x is enough, 4x just costs memory
  var _off = document.createElement('canvas');

  // ── deterministic PRNG (mulberry32) ──
  function _rng(seed) {
    var t = (seed || 1) >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _newSeed() { return Math.floor(Math.random() * 0xffffff) + 1; }

  // ── colour helpers ──
  function _rgba(hex, a) {
    var h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function _clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // ── paint primitives shared with the children ──
  function _blob(ctx, x, y, r, hex, a) {
    if (r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, _rgba(hex, a));
    g.addColorStop(0.55, _rgba(hex, a * 0.45));
    g.addColorStop(1, _rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function _base(ctx, D, hex, a) { ctx.fillStyle = _rgba(hex, a); ctx.fillRect(0, 0, D, D); }

  function _roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draw inside a D x D box centred on the canvas and rotated by `deg`, where
  // D is the canvas diagonal. Two things fall out of this for free: any angle
  // still covers the visible W x H rect (no bald corners), and a full-bleed
  // preset's blurred edge lands OUTSIDE the rect, so its border stays crisp.
  function _rot(ctx, W, H, deg, fn) {
    var D = Math.sqrt(W * W + H * H);
    var S = Math.min(W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((deg || 0) * Math.PI / 180);
    ctx.translate(-D / 2, -D / 2);
    fn(D, S);
    ctx.restore();
  }

  // Grain rides ON TOP, unfiltered. Generated in BLOCKS, not per pixel: the
  // object is painted at RENDER_MULT and drawn back down at 1/RENDER_MULT, so
  // single-pixel noise would average away to nothing on screen.
  function _grain(ctx, W, H, amount, rnd) {
    var img, d;
    try { img = ctx.getImageData(0, 0, W, H); } catch (e) { return; }
    d = img.data;
    var k = (amount / 100) * 90;
    var cell = RENDER_MULT * 2;
    for (var by = 0; by < H; by += cell) {
      for (var bx = 0; bx < W; bx += cell) {
        var n = (rnd() - 0.5) * k;
        var xEnd = Math.min(bx + cell, W), yEnd = Math.min(by + cell, H);
        for (var y = by; y < yEnd; y++) {
          var row = y * W * 4;
          for (var x = bx; x < xEnd; x++) {
            var i = row + x * 4;
            if (d[i + 3] === 0) continue;
            d[i] = _clamp255(d[i] + n);
            d[i + 1] = _clamp255(d[i + 1] + n);
            d[i + 2] = _clamp255(d[i + 2] + n);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // WebP keeps a grainy effect from serialising into a multi-MB PNG (noise does
  // not compress losslessly). Falls back to PNG where the encoder is missing.
  function _toURL(cv) {
    var u = cv.toDataURL('image/webp', 0.92);
    if (u && u.indexOf('data:image/webp') === 0) return u;
    return cv.toDataURL('image/png');
  }

  // ── effect registry (mirrors ItemsCore.registerTab) ──
  var _fx = {};
  function registerEffect(def) { if (def && def.key) _fx[def.key] = def; }
  function _get(key) { return _fx[key] || _fxList()[0]; }
  function _fxList() {
    return Object.keys(_fx).map(function (k) { return _fx[k]; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function _style(def, key) {
    if (!def || !def.styles) return null;
    for (var i = 0; i < def.styles.length; i++) if (def.styles[i].key === key) return def.styles[i];
    return def.styles[0];
  }

  // ── the single procedural paint path: thumbnails AND objects go through it ──
  function _paint(ctx, W, H, def, params) {
    ctx.clearRect(0, 0, W, H);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    var rnd = _rng(params.seed);
    var p = _payload(params, W, H, rnd);
    var st = _style(def, params.preset);
    var fn = def.backdrop ? (def.thumbPaint || def.paint) : def.paint;
    if (fn) fn(ctx, W, H, p, st);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    if (params.grain > 0) _grain(ctx, W, H, params.grain, rnd);
  }

  // Everything an effect's paint fn gets. blurPx is 0.18 of the short edge at
  // amount=100: higher coefficients (0.35 was the first try) melt every preset
  // into a flat gradient, because the blur radius grows past the features it is
  // meant to soften.
  function _payload(params, W, H, rnd) {
    return {
      colors: params.colors,
      blurPx: (params.amount / 100) * Math.min(W, H) * 0.18,
      amount: params.amount,
      alpha: params.intensity / 100,
      angle: params.angle,
      grain: params.grain,
      radius: params.radius,
      distort: params.distort,
      smooth: params.smooth,
      scale: params.scale,
      invert: params.invert,
      seed: params.seed,
      rnd: rnd,
      rgba: _rgba, blob: _blob, base: _base, rot: _rot, roundRect: _roundRectPath, rng: _rng
    };
  }

  function _renderToURL(params) {
    var m = RENDER_MULT;
    _off.width = Math.max(1, Math.round(params.w * m));
    _off.height = Math.max(1, Math.round(params.h * m));
    _paint(_off.getContext('2d'), _off.width, _off.height, _get(params.kind), params);
    return _toURL(_off);
  }

  // ── read the params back off a live object ──
  function _params(obj) {
    var def = _get(obj._fxKind);
    var st = _style(def, obj._fxPreset) || {};
    var colors;
    try { colors = JSON.parse(obj._fxColors); } catch (e) { colors = null; }
    if (!colors || !colors.length) colors = (st.colors || ['#ffffff']).slice();
    return {
      kind: obj._fxKind, preset: obj._fxPreset, colors: colors,
      amount: obj._fxAmount, angle: obj._fxAngle, intensity: obj._fxIntensity,
      grain: obj._fxGrain, radius: obj._fxRadius,
      distort: obj._fxDistort, smooth: obj._fxSmooth, scale: obj._fxScale, invert: obj._fxInvert,
      seed: obj._fxSeed, w: obj._fxW, h: obj._fxH
    };
  }

  function _defaults(kind, styleKey) {
    var def = _get(kind);
    var st = _style(def, styleKey) || {};
    return {
      kind: def.key, preset: st.key,
      colors: (st.colors || ['#ffffff']).slice(),
      amount: st.amount == null ? 40 : st.amount,
      angle: st.angle == null ? 0 : st.angle,
      intensity: st.intensity == null ? 90 : st.intensity,
      grain: st.grain == null ? 0 : st.grain,
      radius: st.radius == null ? 0 : st.radius,
      distort: st.distort == null ? 0 : st.distort,
      smooth: st.smooth == null ? 0 : st.smooth,
      scale: st.scale == null ? 50 : st.scale,
      invert: st.invert ? 1 : 0,
      seed: _newSeed(), w: st.w || 520, h: st.h || 400
    };
  }

  // ── backdrop effects: sample the live canvas behind the panel ──
  // Runs against a real canvas, so it cannot go through _paint like the others.
  var _bdBusy = false;
  function _refreshBackdrop(obj) {
    var def = _get(obj._fxKind);
    var cvs = _cvs();
    if (!cvs || !def.backdrop || !def.paintBackdrop || _bdBusy) return;
    _bdBusy = true;
    try {
      var p = _params(obj);
      var m = RENDER_MULT;
      var iw = Math.max(1, Math.round(p.w * m));
      var ih = Math.max(1, Math.round(p.h * m));
      var dw = obj.getScaledWidth() || p.w;
      var dh = obj.getScaledHeight() || p.h;
      var c = obj.getCenterPoint();

      // Hide the panel AND everything above it: a backdrop must not sample
      // itself (that feeds back on every refresh) and must not contain objects
      // that are drawn over it anyway.
      var objs = cvs.getObjects();
      var from = objs.indexOf(obj);
      var hidden = [];
      if (from > -1) {
        for (var i = from; i < objs.length; i++) {
          if (objs[i].visible !== false) { hidden.push(objs[i]); objs[i].visible = false; }
        }
      }
      // toCanvasElement bakes the viewport in, so a panned/zoomed view would
      // sample the wrong pixels. Force identity, then restore.
      var vt = cvs.viewportTransform;
      var full;
      try {
        cvs.viewportTransform = [1, 0, 0, 1, 0, 0];
        full = cvs.toCanvasElement(m);
      } finally {
        cvs.viewportTransform = vt;
        for (var h = 0; h < hidden.length; h++) hidden[h].visible = true;
      }
      if (!full) return;

      var g = document.createElement('canvas');
      g.width = iw; g.height = ih;
      var gc = g.getContext('2d');

      // Map canvas coords into the panel's own (unrotated) space: translate to
      // its centre, undo its rotation, scale its footprint onto the bitmap.
      gc.save();
      gc.translate(iw / 2, ih / 2);
      gc.scale(iw / dw, ih / dh);
      gc.rotate(-(obj.angle || 0) * Math.PI / 180);
      gc.translate(-c.x, -c.y);
      // Drawing the WHOLE canvas (not a crop) means the blur near the panel's
      // edges pulls in the real neighbouring pixels instead of transparency,
      // so there is no dark halo around the rim.
      gc.filter = 'blur(' + Math.max(0.01, (p.amount / 100) * Math.min(iw, ih) * 0.18) + 'px)';
      gc.drawImage(full, 0, 0, full.width, full.height, 0, 0, cvs.getWidth(), cvs.getHeight());
      gc.restore();
      gc.filter = 'none';

      def.paintBackdrop(gc, iw, ih, _payload(p, iw, ih, _rng(p.seed)), _style(def, p.preset));
      if (p.grain > 0) _grain(gc, iw, ih, p.grain, _rng(p.seed));

      obj.setSrc(_toURL(g), function () {
        obj.set({ scaleX: dw / obj.width, scaleY: dh / obj.height });
        obj.dirty = true;
        cvs.renderAll();
      }, { crossOrigin: 'anonymous' });
    } finally {
      _bdBusy = false;
    }
  }

  // Any scene change invalidates every backdrop panel. Coalesced, and skipped
  // while histLocked (a page load replays hundreds of adds - refreshing per
  // object would repaint the panel hundreds of times for one final result).
  var _bdTimer = 0;
  function _backdropSoon() {
    if (_bdTimer) return;
    _bdTimer = setTimeout(function () {
      _bdTimer = 0;
      if (typeof histLocked !== 'undefined' && histLocked) return;
      var cvs = _cvs();
      if (!cvs) return;
      cvs.getObjects().forEach(function (o) {
        if (o._isEffect && _get(o._fxKind).backdrop) _refreshBackdrop(o);
      });
    }, 60);
  }

  // ── add ──
  window.addEffectToCanvas = function (kind, styleKey) {
    var def = _get(kind);
    var params = _defaults(kind, styleKey);
    var st = _style(def, params.preset);
    fabric.Image.fromURL(_renderToURL(params), function (img) {
      img.set({
        scaleX: params.w / img.width,
        scaleY: params.h / img.height,
        _isEffect: true,
        _fxKind: params.kind,
        _fxPreset: params.preset,
        _fxColors: JSON.stringify(params.colors),
        _fxAmount: params.amount,
        _fxAngle: params.angle,
        _fxIntensity: params.intensity,
        _fxGrain: params.grain,
        _fxRadius: params.radius,
        _fxDistort: params.distort,
        _fxSmooth: params.smooth,
        _fxScale: params.scale,
        _fxInvert: params.invert,
        _fxSeed: params.seed,
        _fxW: params.w,
        _fxH: params.h
      });
      _add(img);
      // A backdrop effect ships with its thumbnail mock as the bitmap; swap it
      // for the real sample as soon as it is on the canvas (it can only sample
      // once it has a position).
      if (def.backdrop) _refreshBackdrop(img);
      _toast(def.label + ' - ' + (st ? st.label : '') + ' added');
    }, { crossOrigin: 'anonymous' });
  };

  // ── re-render an existing object after a parameter change ──
  // resetSize: only the Size inputs want the displayed box to change. Every
  // other edit keeps whatever size the user dragged the object to.
  window._rerenderEffect = function (obj, resetSize) {
    if (!obj || !obj._isEffect) return;
    if (_get(obj._fxKind).backdrop) { _refreshBackdrop(obj); _snap(); return; }
    var params = _params(obj);
    var dw = resetSize ? params.w : (obj.getScaledWidth() || params.w);
    var dh = resetSize ? params.h : (obj.getScaledHeight() || params.h);
    var ctr = obj.getCenterPoint();
    obj.setSrc(_renderToURL(params), function () {
      obj.set({ scaleX: dw / obj.width, scaleY: dh / obj.height });
      // setSrc can change the natural size, which moves a left/top-origin object.
      // Pin it back to the centre it had, or every edit nudges it across the canvas.
      obj.setPositionByOrigin(ctr, 'center', 'center');
      obj.setCoords();
      obj.dirty = true;
      var cvs = _cvs();
      if (cvs) cvs.renderAll();
      _snap();
    }, { crossOrigin: 'anonymous' });
  };

  // A slider drag fires input on every pixel; a full repaint + getImageData per
  // event would stutter. Coalesce to one repaint per frame. rAF never fires
  // while the tab is hidden, which would leave the object showing the OLD image
  // while its params already hold the new value - fall back to a timer.
  var _pending = null;
  function _rerenderSoon(obj) {
    _pending = obj;
    if (_rerenderSoon._h) return;
    var run = function () {
      _rerenderSoon._h = 0;
      var o = _pending; _pending = null;
      if (o) window._rerenderEffect(o);
    };
    _rerenderSoon._h = document.hidden ? setTimeout(run, 0) : requestAnimationFrame(run);
  }

  // ── left flyout: the effect cards, then a style grid per effect ──
  // ONE thumbnail costs ~40-60ms (the glass presets run a displacement pass), so painting every
  // style up front locked the main thread for ~0.7-1s the moment Background > Efektler was opened
  // (owner 2026-07-25: "kasma"). The canvas is now created at its final size immediately - so the
  // layout never shifts - and the pixels are painted only when the cell is about to be seen, one
  // per animation frame. Cost becomes O(visible cells) instead of O(every style ever registered).
  function _paintThumbCanvas(cv) {
    if (!cv || cv._fxPainted) return;
    var def = cv._fxDef, st = cv._fxSt;
    if (!def || !st) return;
    cv._fxPainted = true;
    _paint(cv.getContext('2d'), cv.width, cv.height, def, {
      kind: def.key, preset: st.key, colors: st.colors || ['#ffffff'],
      amount: st.amount == null ? 40 : st.amount, angle: st.angle == null ? 0 : st.angle,
      intensity: st.intensity == null ? 90 : st.intensity, grain: st.grain == null ? 0 : st.grain,
      radius: st.radius == null ? 0 : st.radius, distort: st.distort == null ? 0 : st.distort,
      smooth: st.smooth == null ? 0 : st.smooth, scale: st.scale == null ? 50 : st.scale,
      invert: st.invert ? 1 : 0, seed: 12345
    });
  }

  // One paint per tick: the browser gets a chance to paint/scroll/handle input between two
  // thumbnails, so a slow batch degrades into "fills in progressively" instead of "frozen editor".
  // Timer, NOT requestAnimationFrame: rAF stops in a background tab (and in an off-screen embedded
  // view), which would leave every preview blank - the same trap _rerenderSoon already guards.
  var _thumbQueue = [];
  var _thumbPumping = false;
  function _pumpThumbs() {
    if (_thumbPumping) return;
    _thumbPumping = true;
    var step = function () {
      var cv = _thumbQueue.shift();
      while (cv && (cv._fxPainted || !cv.isConnected)) cv = _thumbQueue.shift();
      if (cv) _paintThumbCanvas(cv);
      if (_thumbQueue.length) setTimeout(step, 16);
      else _thumbPumping = false;
    };
    setTimeout(step, 0);
  }

  // Paint when the cell (nearly) scrolls into view. The strips scroll horizontally, so most cells
  // start off-screen; rootMargin prewarms the next ones so scrolling still feels instant.
  var _thumbIO = (typeof IntersectionObserver !== 'undefined') ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      _thumbIO.unobserve(e.target);
      _thumbQueue.push(e.target);
    });
    if (_thumbQueue.length) _pumpThumbs();
  }, { rootMargin: '200px' }) : null;

  function _thumb(def, st, w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv._fxDef = def; cv._fxSt = st;
    if (_thumbIO) _thumbIO.observe(cv);
    else { _thumbQueue.push(cv); _pumpThumbs(); }   // no IntersectionObserver: still never block
    return cv;
  }

  // The observer only fires for cells the browser considers visible - a clipped/hidden ancestor
  // (or a browser without IO) would leave the previews blank forever. Safety pass: once the panel
  // is built and idle, queue whatever is still unpainted. Same one-per-frame pump, so it can never
  // freeze the UI; the visible cells were queued first, so they still paint first.
  function _queueRemaining(root) {
    if (!root) return;
    var run = function () {
      var list = root.querySelectorAll('canvas');
      for (var i = 0; i < list.length; i++) {
        var cv = list[i];
        if (cv._fxPainted || _thumbQueue.indexOf(cv) > -1) continue;
        if (_thumbIO) _thumbIO.unobserve(cv);
        _thumbQueue.push(cv);
      }
      if (_thumbQueue.length) _pumpThumbs();
    };
    setTimeout(run, 300);   // after the panel has had a chance to appear and settle
  }

  // One row per effect, exactly like the items panel: a header that drills into
  // the full grid, and a horizontally scrollable strip of that effect's styles
  // you can add straight from here.
  window.effectsRenderPanel = function () {
    var host = document.getElementById('effects-drill-content');
    if (!host || host.getAttribute('data-rendered') === '1') return;

    _fxList().forEach(function (def) {
      var row = document.createElement('div');
      row.className = 'items-cat-row';

      var hdr = document.createElement('div');
      hdr.className = 'items-cat-header';
      hdr.innerHTML = '<span class="items-cat-title">' + def.label + '</span><span class="items-cat-arrow">&rsaquo;</span>';
      hdr.title = def.desc || def.label;
      hdr.addEventListener('click', function () { _drillIntoEffect(def.key); });
      row.appendChild(hdr);

      var slider = document.createElement('div');
      slider.className = 'items-slider fx-slider';
      def.styles.forEach(function (st) {
        var cell = document.createElement('div');
        cell.className = 'items-slider-cell fx-cell';
        cell.title = st.desc || st.label;
        cell.appendChild(_thumb(def, st, 176, 132));   // 2x of the CSS box = crisp
        var name = document.createElement('span');
        name.className = 'fx-cell-name';
        name.textContent = st.label;
        cell.appendChild(name);
        cell.addEventListener('click', function () { window.addEffectToCanvas(def.key, st.key); });
        slider.appendChild(cell);
      });
      row.appendChild(slider);
      host.appendChild(row);
    });
    host.setAttribute('data-rendered', '1');
    _queueRemaining(host);
  };

  function _drillIntoEffect(key) {
    var def = _get(key);
    var list = document.getElementById('effects-drill-content');
    var view = document.getElementById('effects-style-view');
    var grid = document.getElementById('effects-style-grid');
    var ttl = document.getElementById('effects-style-title');
    if (!view || !grid) return;
    if (list) list.style.display = 'none';
    view.style.display = '';
    if (ttl) ttl.textContent = def.label;
    grid.innerHTML = '';
    def.styles.forEach(function (st) {
      var cell = document.createElement('div');
      cell.className = 'fx-style-cell';
      cell.title = st.desc || st.label;
      cell.appendChild(_thumb(def, st, 168, 126));
      var name = document.createElement('span');
      name.className = 'fx-style-name';
      name.textContent = st.label;
      cell.appendChild(name);
      cell.addEventListener('click', function () { window.addEffectToCanvas(def.key, st.key); });
      grid.appendChild(cell);
    });
    _queueRemaining(grid);
  }

  window.fxBackToEffects = function () {
    var list = document.getElementById('effects-drill-content');
    var view = document.getElementById('effects-style-view');
    if (view) view.style.display = 'none';
    if (list) list.style.display = '';
  };

  // ── right panel (#rp-effect) ──
  function _rpEl(id) { return document.getElementById(id); }

  // Each effect declares the controls it actually reads, so no dead rows show.
  function _controlsFor(def, st) {
    return (def.controlsFor ? def.controlsFor(st) : (def.controls || [])) || [];
  }

  var ALL_ROWS = ['colors', 'amount', 'angle', 'intensity', 'grain', 'radius',
                  'distort', 'smooth', 'scale', 'invert', 'size', 'reseed'];

  function _syncControlVisibility(def, st) {
    var on = _controlsFor(def, st);
    ALL_ROWS.forEach(function (r) {
      var el = _rpEl('p-fx-' + r + '-row');
      if (el) el.style.display = on.indexOf(r) > -1 ? '' : 'none';
    });
    var n = st && st.colorCount != null ? st.colorCount : 0;
    for (var i = 1; i <= 3; i++) {
      var row = _rpEl('p-fx-c' + i + '-row');
      if (row) row.style.display = (on.indexOf('colors') > -1 && i <= n) ? '' : 'none';
    }
    var lab = _rpEl('p-fx-amount-label');
    if (lab) lab.textContent = def.amountLabel || 'Blurriness';
    var c1 = _rpEl('p-fx-c1-label');
    if (c1) c1.textContent = def.tintLabel || 'Color 1';
  }

  window.syncEffectPanel = function (obj) {
    if (!obj || !obj._isEffect) return;
    var p = _params(obj);
    var def = _get(p.kind);
    var st = _style(def, p.preset);

    var kindSel = _rpEl('p-fx-kind');
    if (kindSel) {
      kindSel.innerHTML = '';
      _fxList().forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.key; o.textContent = d.label;
        kindSel.appendChild(o);
      });
      kindSel.value = p.kind;
    }
    var sel = _rpEl('p-fx-preset');
    if (sel) {
      sel.innerHTML = '';
      def.styles.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.key; o.textContent = s.label;
        sel.appendChild(o);
      });
      sel.value = p.preset;
    }
    _syncControlVisibility(def, st);

    for (var i = 0; i < 3; i++) {
      var c = _rpEl('p-fx-c' + (i + 1));
      var hex = p.colors[i] || (st.colors && st.colors[i]) || '#ffffff';
      if (c) c.value = hex;
      var sw = _rpEl('p-fx-c' + (i + 1) + '-sw');
      if (sw) sw.style.background = hex;
    }
    [['p-fx-amount', p.amount, '%'], ['p-fx-angle', p.angle, '°'],
     ['p-fx-intensity', p.intensity, '%'], ['p-fx-grain', p.grain, '%'],
     ['p-fx-radius', p.radius, '%'], ['p-fx-distort', p.distort, '%'],
     ['p-fx-smooth', p.smooth, '%'], ['p-fx-scale', p.scale, '%']].forEach(function (pr) {
      var el = _rpEl(pr[0]);
      var v = pr[1] == null ? 0 : pr[1];
      if (el) el.value = v;
      var lbl = _rpEl(pr[0] + '-val');
      if (lbl) lbl.textContent = v + pr[2];
    });
    var inv = _rpEl('p-fx-invert');
    if (inv) inv.checked = !!p.invert;
    var w = _rpEl('p-fx-w'); if (w) w.value = p.w;
    var h = _rpEl('p-fx-h'); if (h) h.value = p.h;
  };

  function _activeEffect() {
    var cvs = _cvs();
    var obj = cvs && cvs.getActiveObject();
    return (obj && obj._isEffect) ? obj : null;
  }

  function _applyDefaults(obj, kind, styleKey) {
    var d = _defaults(kind, styleKey);
    obj._fxKind = d.kind;
    obj._fxPreset = d.preset;
    obj._fxColors = JSON.stringify(d.colors);
    obj._fxAmount = d.amount;
    obj._fxAngle = d.angle;
    obj._fxIntensity = d.intensity;
    obj._fxGrain = d.grain;
    obj._fxRadius = d.radius;
    obj._fxDistort = d.distort;
    obj._fxSmooth = d.smooth;
    obj._fxScale = d.scale;
    obj._fxInvert = d.invert;
    var st = _style(_get(kind), styleKey);
    if (st && st.random) obj._fxSeed = _newSeed();
    window.syncEffectPanel(obj);
    window._rerenderEffect(obj);
  }

  function initEffectPropertyBindings() {
    var kindSel = _rpEl('p-fx-kind');
    if (kindSel) {
      kindSel.addEventListener('change', function () {
        var obj = _activeEffect();
        if (!obj) return;
        _applyDefaults(obj, kindSel.value, _get(kindSel.value).styles[0].key);
      });
    }
    var sel = _rpEl('p-fx-preset');
    if (sel) {
      sel.addEventListener('change', function () {
        var obj = _activeEffect();
        if (!obj) return;
        // Switching style adopts that style's full defaults (its look depends on
        // all of them together); size and canvas position are kept.
        _applyDefaults(obj, obj._fxKind, sel.value);
      });
    }

    for (var i = 1; i <= 3; i++) {
      (function (idx) {
        var c = _rpEl('p-fx-c' + idx);
        if (!c) return;
        c.addEventListener('input', function () {
          var obj = _activeEffect();
          if (!obj) return;
          var colors;
          try { colors = JSON.parse(obj._fxColors); } catch (e) { colors = ['#ffffff']; }
          colors[idx - 1] = c.value;
          obj._fxColors = JSON.stringify(colors);
          var sw = _rpEl('p-fx-c' + idx + '-sw');
          if (sw) sw.style.background = c.value;
          _rerenderSoon(obj);
        });
      })(i);
    }

    [['p-fx-amount', '_fxAmount', '%'], ['p-fx-angle', '_fxAngle', '°'],
     ['p-fx-intensity', '_fxIntensity', '%'], ['p-fx-grain', '_fxGrain', '%'],
     ['p-fx-radius', '_fxRadius', '%'], ['p-fx-distort', '_fxDistort', '%'],
     ['p-fx-smooth', '_fxSmooth', '%'], ['p-fx-scale', '_fxScale', '%']].forEach(function (pr) {
      var el = _rpEl(pr[0]);
      if (!el) return;
      el.addEventListener('input', function () {
        var obj = _activeEffect();
        var v = parseInt(el.value, 10) || 0;
        var lbl = _rpEl(pr[0] + '-val');
        if (lbl) lbl.textContent = v + pr[2];
        if (!obj) return;
        obj[pr[1]] = v;
        _rerenderSoon(obj);
      });
    });

    var inv = _rpEl('p-fx-invert');
    if (inv) {
      inv.addEventListener('change', function () {
        var obj = _activeEffect();
        if (!obj) return;
        obj._fxInvert = inv.checked ? 1 : 0;
        window._rerenderEffect(obj);
      });
    }

    ['p-fx-w', 'p-fx-h'].forEach(function (id) {
      var el = _rpEl(id);
      if (!el) return;
      el.addEventListener('change', function () {
        var obj = _activeEffect();
        if (!obj) return;
        var v = Math.max(40, Math.min(2400, parseInt(el.value, 10) || 400));
        el.value = v;
        if (id === 'p-fx-w') obj._fxW = v; else obj._fxH = v;
        window._rerenderEffect(obj, true);
      });
    });

    var reseed = _rpEl('p-fx-reseed');
    if (reseed) {
      reseed.addEventListener('click', function () {
        var obj = _activeEffect();
        if (!obj) return;
        obj._fxSeed = _newSeed();
        window._rerenderEffect(obj);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEffectPropertyBindings);
  else initEffectPropertyBindings();

  // A backdrop panel shows the scene behind it, so any scene change makes it
  // stale. cc:canvas-ready is sticky, so this still binds if the module loads late.
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      cc.safe('left-panel.background.effects.backdrop-bind', function () {
        var cvs = _cvs();
        if (!cvs || cvs._ccFxBackdropBound) return;
        cvs._ccFxBackdropBound = true;
        ['object:modified', 'object:added', 'object:removed'].forEach(function (ev) {
          cvs.on(ev, function (e) {
            // Ignore a backdrop panel's own repaint, or it chases its own tail.
            if (e && e.target && e.target._isEffect && _get(e.target._fxKind).backdrop) return;
            _backdropSoon();
          });
        });
      });
    });
  }

  window.EffectsCore = {
    registerEffect: registerEffect,
    list: _fxList,
    get: _get,
    rgba: _rgba, blob: _blob, base: _base, rot: _rot, roundRect: _roundRectPath,
    rng: _rng, clamp255: _clamp255, RENDER_MULT: RENDER_MULT
  };

  // Each parent mounts its own children (items.js:354 / left-panel.js:13 do the
  // same). Without this the effect children never call registerEffect and the
  // menu renders empty. 'modules:ready' covers the case where this module
  // mounted before its children were registered.
  function mountChildren() {
    if (!window.cc || !cc.modules) return;
    cc.modules.children('left-panel.background.effects').forEach(function (c) { cc.modules.mount(c.fullId); });
  }

  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 'effects', parent: 'left-panel.background', title: 'Effects', icon: 'sparkles',
      mount: function () { mountChildren(); }, unmount: function () {}
    });
    if (cc.on) cc.on('modules:ready', mountChildren);
  }
})();
