/* ═══════════════════════════════════════════════════════════
   Sub-module: left-panel/background/effects/glass — the "Cam" effect.

   A real glass panel, not a decoration: it SAMPLES the live canvas behind it
   (the core's backdrop path hands us the already-gaussian-blurred backdrop),
   then refracts it through a procedural texture. That is Photoshop's
   Filter > Distort > Glass recipe: blur first, then displace through a texture
   map. The Instagram "fractal glass" look is the `fractal` style.

   DISPLACEMENT MATH: the texture is a grayscale HEIGHT FIELD. Photoshop's
   Displace shifts by the map's VALUE (128 = no shift). That smears flat areas
   and reads as a wobble. Real glass refracts at the SLOPES, so we displace by
   the height field's GRADIENT (central difference) instead: flat texture areas
   pass through untouched and every texture EDGE bends the image, which is what
   makes blocks/crosshatch read as faceted glass.

   Controls map 1:1 onto the Photoshop filter: Bulanıklık = the pre-blur,
   Bozulma = Distortion, Pürüzsüzlük = Smoothness, Ölçek = Scaling,
   Ters çevir = Invert.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.EffectsCore) { console.warn('[effects.glass] EffectsCore missing'); return; }

  var EC = window.EffectsCore;

  // ── texture generators: each paints a GRAYSCALE height field ──
  // `cell` is the feature size in px, derived from the Ölçek control.

  function _texBlocks(ctx, W, H, cell, rnd) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    for (var y = 0; y < H; y += cell) {
      for (var x = 0; x < W; x += cell) {
        var v = Math.round(40 + rnd() * 175);
        ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        ctx.fillRect(x, y, cell - Math.max(1, cell * 0.06), cell - Math.max(1, cell * 0.06));
      }
    }
  }

  function _texCrosshatch(ctx, W, H, cell, rnd) {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, W, H);
    var D = W + H;
    ctx.lineWidth = Math.max(1, cell * 0.42);
    ctx.strokeStyle = '#e8e8e8';
    var i;
    // two mirrored diagonal families = the lattice of the reference shot
    for (i = -H; i < D; i += cell) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
    }
    for (i = -H; i < D; i += cell) {
      ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke();
    }
  }

  function _texFrosted(ctx, W, H, cell, rnd) {
    // Fine grain: the classic frosted pane. Drawn in blocks so it survives the
    // 2x render -> 1x display downscale.
    // Built as ONE ImageData instead of thousands of fillRect calls: at this style's scale that is
    // ~6k rects per repaint, and the caller has a blur filter set on the context (Pürüzsüzlük), so
    // every single rect went through the filter pipeline. That alone cost ~0.5s per paint and was
    // the visible hitch when the Efektler menu opened (owner 2026-07-25). The rnd() call order per
    // block is unchanged, so a given seed still produces the exact same grain.
    var step = Math.max(1, Math.round(cell * 0.22));
    var buf = document.createElement('canvas');
    buf.width = W; buf.height = H;
    var bctx = buf.getContext('2d');
    var img = bctx.createImageData(W, H);
    var d = img.data;
    for (var y = 0; y < H; y += step) {
      var yEnd = Math.min(y + step, H);
      for (var x = 0; x < W; x += step) {
        var v = Math.round(60 + rnd() * 140);
        var xEnd = Math.min(x + step, W);
        for (var yy = y; yy < yEnd; yy++) {
          var row = yy * W * 4;
          for (var xx = x; xx < xEnd; xx++) {
            var i = row + xx * 4;
            d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
          }
        }
      }
    }
    bctx.putImageData(img, 0, 0);
    // drawImage (unlike putImageData) still honours the caller's blur filter = Pürüzsüzlük.
    ctx.drawImage(buf, 0, 0);
  }

  function _texRadial(ctx, W, H, cell, rnd) {
    var cx = W / 2, cy = H / 2;
    var max = Math.sqrt(cx * cx + cy * cy);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, max);
    var rings = Math.max(2, Math.round(max / cell));
    for (var i = 0; i <= rings; i++) {
      var t = i / rings;
      var v = i % 2 === 0 ? 225 : 45;
      g.addColorStop(t, 'rgb(' + v + ',' + v + ',' + v + ')');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function _texCanvas(ctx, W, H, cell, rnd) {
    // Woven cloth: two perpendicular stripe families, half-offset per row.
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    var s = Math.max(2, Math.round(cell * 0.5));
    for (var y = 0; y < H; y += s) {
      for (var x = 0; x < W; x += s) {
        var on = ((x / s | 0) + (y / s | 0)) % 2 === 0;
        var v = on ? 210 : 60;
        ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        ctx.fillRect(x, y, s, s);
      }
    }
  }

  function _texEmboss(ctx, W, H, cell, rnd) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    // A grid of raised domes: each dome's own radial falloff makes its rim the
    // only sloped part, so only the rims refract.
    for (var y = cell / 2; y < H + cell; y += cell) {
      for (var x = cell / 2; x < W + cell; x += cell) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, cell * 0.55);
        g.addColorStop(0, '#f0f0f0');
        g.addColorStop(0.7, '#808080');
        g.addColorStop(1, '#202020');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function _texWavy(ctx, W, H, cell, rnd) {
    var img = ctx.createImageData(W, H);
    var d = img.data;
    var k = (Math.PI * 2) / Math.max(4, cell);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var v = 128 + 100 * Math.sin(x * k + Math.sin(y * k * 0.5) * 2);
        var i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Fractal (fBm) value noise - the texture the reference tutorial loads from a
  // PSD. Several octaves of smoothed value noise summed at halving amplitude.
  function _texFractal(ctx, W, H, cell, rnd) {
    var octaves = 5;
    var img = ctx.createImageData(W, H);
    var d = img.data;
    // Pre-roll one lattice per octave so the noise is reproducible from the seed.
    var lat = [];
    var o, gw, gh, i;
    for (o = 0; o < octaves; o++) {
      gw = Math.max(2, Math.ceil(W / (cell / Math.pow(2, o))) + 2);
      gh = Math.max(2, Math.ceil(H / (cell / Math.pow(2, o))) + 2);
      var g = new Float32Array(gw * gh);
      for (i = 0; i < g.length; i++) g[i] = rnd();
      lat.push({ g: g, gw: gw, gh: gh, step: cell / Math.pow(2, o) });
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    function sample(L, x, y) {
      var fx = x / L.step, fy = y / L.step;
      var x0 = fx | 0, y0 = fy | 0;
      var tx = smooth(fx - x0), ty = smooth(fy - y0);
      var x1 = Math.min(x0 + 1, L.gw - 1), y1 = Math.min(y0 + 1, L.gh - 1);
      var a = L.g[y0 * L.gw + x0], b = L.g[y0 * L.gw + x1];
      var c = L.g[y1 * L.gw + x0], e = L.g[y1 * L.gw + x1];
      return (a + (b - a) * tx) + ((c + (e - c) * tx) - (a + (b - a) * tx)) * ty;
    }
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var v = 0, amp = 1, norm = 0;
        for (o = 0; o < octaves; o++) {
          v += sample(lat[o], x, y) * amp;
          norm += amp;
          amp *= 0.5;
        }
        v = (v / norm) * 255;
        i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  var TEX = {
    blocks: _texBlocks, crosshatch: _texCrosshatch, frosted: _texFrosted,
    radial: _texRadial, canvas: _texCanvas, emboss: _texEmboss,
    wavy: _texWavy, fractal: _texFractal
  };

  // ── the glass pass: refract whatever is already in ctx, then finish the panel ──
  function _applyGlass(ctx, W, H, p, st) {
    var src;
    try { src = ctx.getImageData(0, 0, W, H); } catch (e) { return; }

    var distort = (p.distort == null ? 40 : p.distort) / 100;
    if (distort > 0 && TEX[st.key]) {
      // Ölçek: feature size. Scaled off the short edge so a big panel and a
      // thumbnail show the same texture, not the same pixel count.
      var S = Math.min(W, H);
      var cell = Math.max(3, S * (0.02 + ((p.scale == null ? 50 : p.scale) / 100) * 0.16));

      var tc = document.createElement('canvas');
      tc.width = W; tc.height = H;
      var tx = tc.getContext('2d');
      // Pürüzsüzlük blurs the height field, which rounds off its slopes and so
      // softens the refraction (Photoshop's Smoothness does exactly this).
      var sm = (p.smooth == null ? 0 : p.smooth) / 100;
      if (sm > 0) tx.filter = 'blur(' + (sm * cell * 0.5) + 'px)';
      TEX[st.key](tx, W, H, cell, p.rng(p.seed));
      tx.filter = 'none';

      var tex;
      try { tex = tx.getImageData(0, 0, W, H); } catch (e2) { return; }

      var out = ctx.createImageData(W, H);
      var sd = src.data, td = tex.data, od = out.data;
      var sign = p.invert ? -1 : 1;
      // Measure the slope at the texture's OWN feature scale, not across one
      // pixel. A 1px central difference on a soft texture is ~0, so the whole
      // pass did nothing and every style came out looking like a plain blur.
      var step = Math.max(1, Math.round(cell * 0.25));
      var maxShift = distort * S * 0.06;

      for (var y = 0; y < H; y++) {
        var xmS = 0, xpS = 0;
        for (var x = 0; x < W; x++) {
          xmS = x - step; if (xmS < 0) xmS = 0;
          xpS = x + step; if (xpS > W - 1) xpS = W - 1;
          var ymS = y - step; if (ymS < 0) ymS = 0;
          var ypS = y + step; if (ypS > H - 1) ypS = H - 1;

          // central difference on the height field = the surface slope, -1..1
          var gx = (td[(y * W + xpS) * 4] - td[(y * W + xmS) * 4]) / 255;
          var gy = (td[(ypS * W + x) * 4] - td[(ymS * W + x) * 4]) / 255;

          var sx = Math.round(x + gx * maxShift * sign);
          var sy = Math.round(y + gy * maxShift * sign);
          if (sx < 0) sx = 0; else if (sx >= W) sx = W - 1;
          if (sy < 0) sy = 0; else if (sy >= H) sy = H - 1;

          var si = (sy * W + sx) * 4;
          var oi = (y * W + x) * 4;
          od[oi] = sd[si]; od[oi + 1] = sd[si + 1]; od[oi + 2] = sd[si + 2]; od[oi + 3] = sd[si + 3];
        }
      }
      ctx.putImageData(out, 0, 0);

      // Displacement ALONE is invisible here: the backdrop arrives already
      // gaussian-blurred, and shifting smooth pixels a few px just reproduces
      // the same smooth pixels. Photoshop's Glass also composites the texture's
      // own shading - that relief is what you actually SEE as the lattice /
      // blocks / ripples. 'overlay' leaves mid-grey (128) untouched, so the
      // texture's lights and darks become the facets and the flat areas stay
      // clear glass.
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.min(0.85, 0.2 + distort * 0.55);
      ctx.drawImage(tc, 0, 0);
      ctx.restore();

      // A specular rim along the slopes sells the thickness: bright where the
      // surface tilts one way, dark the other.
      var sp = document.createElement('canvas');
      sp.width = W; sp.height = H;
      var spc = sp.getContext('2d');
      var si2 = spc.createImageData(W, H);
      var sdd = si2.data;
      for (var y2 = 0; y2 < H; y2++) {
        for (var x2 = 0; x2 < W; x2++) {
          var xm2 = Math.max(0, x2 - step), xp2 = Math.min(W - 1, x2 + step);
          var ym2 = Math.max(0, y2 - step), yp2 = Math.min(H - 1, y2 + step);
          var lx = (td[(y2 * W + xp2) * 4] - td[(y2 * W + xm2) * 4]) / 255;
          var ly = (td[(yp2 * W + x2) * 4] - td[(ym2 * W + x2) * 4]) / 255;
          // light from the top-left
          var lum = (-lx * 0.7 - ly * 0.7);
          var i2 = (y2 * W + x2) * 4;
          if (lum > 0) { sdd[i2] = sdd[i2 + 1] = sdd[i2 + 2] = 255; sdd[i2 + 3] = Math.min(255, lum * 300); }
          else { sdd[i2] = sdd[i2 + 1] = sdd[i2 + 2] = 0; sdd[i2 + 3] = Math.min(255, -lum * 220); }
        }
      }
      spc.putImageData(si2, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(sp, 0, 0);
      ctx.restore();
    }

    // Tint (kept subtle: this is glass, not a colour wash)
    var tint = (p.alpha == null ? 0 : p.alpha);
    if (tint > 0) {
      ctx.fillStyle = p.rgba(p.colors[0] || '#ffffff', tint);
      ctx.fillRect(0, 0, W, H);
    }

    // Rounded corners + rim highlight
    var r = Math.min(W, H) * (p.radius == null ? 0 : p.radius) / 100;
    ctx.globalCompositeOperation = 'destination-in';
    p.roundRect(ctx, 0, 0, W, H, r);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    var bw = Math.max(1, Math.min(W, H) * 0.005);
    p.roundRect(ctx, bw / 2, bw / 2, W - bw, H - bw, Math.max(0, r - bw / 2));
    ctx.strokeStyle = p.rgba('#ffffff', 0.28);
    ctx.lineWidth = bw;
    ctx.stroke();
  }

  var STYLES = [
    { key: 'blocks',     label: 'Boxes',       desc: 'Broken glass blocks' },
    { key: 'crosshatch', label: 'Crosshatch', desc: 'Cross lattice' },
    { key: 'frosted',    label: 'Frosted',         desc: 'Frosted glass' },
    { key: 'radial',     label: 'Radial',        desc: 'Rings from center' },
    { key: 'canvas',     label: 'Textured',        desc: 'Woven fabric' },
    { key: 'emboss',     label: 'Embossed',    desc: 'Raised domes' },
    { key: 'wavy',       label: 'Wavy',       desc: 'Wave refraction' },
    { key: 'fractal',    label: 'Fractal',       desc: 'Fractal glass' }
  ];
  // Shared defaults: every style is the same panel, only its texture differs.
  STYLES.forEach(function (s) {
    s.w = 480; s.h = 320;
    s.colorCount = 1;
    s.colors = ['#ffffff'];
    s.random = false;
    s.amount = 26;        // the gaussian pre-blur
    s.intensity = 12;     // tint strength - glass, so barely any
    s.grain = 0;
    s.radius = 6;
    s.smooth = 20;
    s.scale = 50;
    s.invert = false;
    s.angle = 0;
  });
  // Per-style distortion: a fine texture needs more push to read, a coarse one less.
  var DIST = { blocks: 55, crosshatch: 60, frosted: 22, radial: 45, canvas: 40, emboss: 50, wavy: 65, fractal: 70 };
  STYLES.forEach(function (s) { s.distort = DIST[s.key]; });
  STYLES.forEach(function (s) { if (s.key === 'frosted') { s.amount = 42; s.scale = 22; } });

  function mount() {
    EffectsCore.registerEffect({
      key: 'glass',
      label: 'Glass',
      desc: 'Turns the canvas behind it into glass',
      order: 2,
      backdrop: true,
      amountLabel: 'Blurriness',
      tintLabel: 'Color tone',
      styles: STYLES,
      controlsFor: function () {
        // No colours beyond the tint, no angle (the object's own handle rotates
        // it), no seeded layout: only what the glass actually reads.
        return ['colors', 'amount', 'distort', 'smooth', 'scale', 'invert', 'intensity', 'grain', 'radius', 'size'];
      },
      // Real object: the core has already drawn the blurred backdrop into ctx.
      paintBackdrop: function (ctx, W, H, p, st) { _applyGlass(ctx, W, H, p, st); },
      // Flyout thumbnail: the real panel needs a canvas to sample, so stand in a
      // mock backdrop and run the SAME glass pass over it.
      // The mock is deliberately MUTED. A saturated blob field (the first try)
      // made every thumbnail read as a colourful card instead of as glass - the
      // texture is the thing being previewed, so the backdrop has to stay quiet.
      thumbPaint: function (ctx, W, H, p, st) {
        var S = Math.min(W, H);
        var g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#8b93a7');
        g.addColorStop(0.55, '#5b6172');
        g.addColorStop(1, '#2b2f3a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.filter = 'blur(' + Math.max(1, p.blurPx) + 'px)';
        p.blob(ctx, W * 0.28, H * 0.3, S * 0.5, '#e8ecf5', 0.75);   // soft light source
        p.blob(ctx, W * 0.78, H * 0.72, S * 0.42, '#1b1e26', 0.7);  // dark mass
        p.blob(ctx, W * 0.62, H * 0.3, S * 0.3, '#9fb2cc', 0.5);    // one cool accent
        ctx.filter = 'none';
        _applyGlass(ctx, W, H, p, st);
      }
    });
  }

  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 'glass', parent: 'left-panel.background.effects', title: 'Glass',
      mount: mount, unmount: function () {}
    });
  } else { mount(); }
})();
