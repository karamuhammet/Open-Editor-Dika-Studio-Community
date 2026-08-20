/* ═══════════════════════════════════════════════════════════
   Sub-module: left-panel/background/effects/gradient — the "Gradyan" effect.
   8 procedural blurred-gradient compositions, registered into the Efektler menu
   through EffectsCore (same contract as an items child using ItemsCore).

   Every layout decision goes through p.rnd (the seeded PRNG the core hands in),
   so changing a colour re-paints the SAME composition. Only Reseed rolls a new
   layout.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.EffectsCore) { console.warn('[effects.gradient] EffectsCore missing'); return; }

  var STYLES = [
    {
      key: 'mesh', label: 'Mesh', desc: 'Soft mesh gradient', colorCount: 3, random: true,
      w: 520, h: 400, colors: ['#ff4d9d', '#7b5cff', '#00d4ff'], amount: 62, angle: 0, intensity: 92, grain: 0,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          // 0.95, not 0.85: the base fill is what makes the object opaque, and at
          // 0.85 nothing was ever fully opaque - the near-black canvas behind
          // (#0d0d0d) bled through everywhere and read as black mixed into the
          // colour. Intensity still thins it; this just stops it starting muddy.
          p.base(ctx, D, p.colors[0], 0.95 * p.alpha);
          ctx.filter = 'blur(' + p.blurPx + 'px)';
          for (var i = 0; i < 5; i++) {
            var hex = p.colors[(i + 1) % p.colors.length];
            var x = D * (0.25 + p.rnd() * 0.5);
            var y = D * (0.25 + p.rnd() * 0.5);
            var r = S * (0.26 + p.rnd() * 0.3);
            p.blob(ctx, x, y, r, hex, 0.9 * p.alpha);
          }
          ctx.filter = 'none';
        });
      }
    },
    {
      key: 'streak', label: 'Stripe', desc: 'Motion blur bands', colorCount: 3, random: true,
      w: 600, h: 400, colors: ['#ff2e88', '#b3126b', '#1a0a12'], amount: 35, angle: 0, intensity: 100, grain: 0,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          var g = ctx.createLinearGradient(0, 0, 0, D);
          g.addColorStop(0, p.rgba(p.colors[2] || p.colors[0], p.alpha));
          g.addColorStop(0.5, p.rgba(p.colors[0], p.alpha));
          g.addColorStop(1, p.rgba(p.colors[1] || p.colors[0], p.alpha));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, D, D);
          // Bands run ALONG the angle. An isotropic blur is what we want here:
          // it softens their top/bottom edges while their ends sit off-canvas,
          // which reads as a directional smear. The radius must scale with the
          // band PITCH, not with the global blur - a radius wider than a band
          // erases it (that was the first version's bug: a 38px blur on 4-27px
          // bands left a flat gradient).
          var n = 22;
          var pitch = D / n;
          ctx.filter = 'blur(' + Math.max(1, pitch * (0.08 + (p.amount / 100) * 0.5)) + 'px)';
          for (var i = 0; i < n; i++) {
            var y = pitch * i + (p.rnd() - 0.5) * pitch * 0.6;
            var bh = pitch * (0.12 + p.rnd() * 0.55);
            ctx.fillStyle = p.rgba(p.rnd() > 0.45 ? '#ffffff' : '#000000', (0.1 + p.rnd() * 0.35) * p.alpha);
            ctx.fillRect(0, y, D, bh);
          }
          ctx.filter = 'none';
        });
      }
    },
    {
      key: 'orb', label: 'Sphere', desc: 'Radial glow', colorCount: 2, random: false,
      w: 420, h: 420, colors: ['#7b5cff', '#00d4ff'], amount: 40, angle: 0, intensity: 95, grain: 0,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          ctx.filter = 'blur(' + p.blurPx + 'px)';
          ctx.globalCompositeOperation = 'lighter';
          var cx = D / 2, cy = D / 2, r = S * 0.3;
          p.blob(ctx, cx, cy, r * 1.5, p.colors[1] || p.colors[0], 0.75 * p.alpha);
          p.blob(ctx, cx, cy, r, p.colors[0], 1 * p.alpha);
          // Off-centre core: this is what the Angle control swings around.
          p.blob(ctx, cx + r * 0.3, cy - r * 0.3, r * 0.45, '#ffffff', 0.45 * p.alpha);
          ctx.globalCompositeOperation = 'source-over';
          ctx.filter = 'none';
        });
      }
    },
    {
      key: 'aurora', label: 'Aurora', desc: 'Light stripes', colorCount: 3, random: true,
      w: 640, h: 420, colors: ['#00ffa3', '#00b3ff', '#0a0a1e'], amount: 45, angle: 0, intensity: 95, grain: 0,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          p.base(ctx, D, p.colors[2] || '#0a0a1e', 0.95 * p.alpha);
          ctx.filter = 'blur(' + p.blurPx + 'px)';
          ctx.globalCompositeOperation = 'lighter';
          for (var i = 0; i < 3; i++) {
            var hex = p.colors[i % 2];
            var yb = D * (0.38 + i * 0.09);
            var amp = D * (0.05 + p.rnd() * 0.09);
            var th = S * (0.14 + p.rnd() * 0.16);
            ctx.beginPath();
            ctx.moveTo(0, yb);
            ctx.bezierCurveTo(D * 0.3, yb - amp, D * 0.7, yb + amp, D, yb - amp * 0.5);
            ctx.lineTo(D, yb - amp * 0.5 + th);
            ctx.bezierCurveTo(D * 0.7, yb + amp + th, D * 0.3, yb - amp + th, 0, yb + th);
            ctx.closePath();
            ctx.fillStyle = p.rgba(hex, 0.8 * p.alpha);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.filter = 'none';
        });
      }
    },
    {
      key: 'fog', label: 'Fog', desc: 'Drifting fog band', colorCount: 2, random: false,
      w: 640, h: 300, colors: ['#ffffff', '#9db4ff'], amount: 55, angle: 0, intensity: 95, grain: 0,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          ctx.filter = 'blur(' + p.blurPx + 'px)';
          var cy = D / 2, band = S * 0.3;
          var g = ctx.createLinearGradient(0, cy - band, 0, cy + band);
          g.addColorStop(0, p.rgba(p.colors[0], 0));
          g.addColorStop(0.5, p.rgba(p.colors[0], 0.85 * p.alpha));
          g.addColorStop(1, p.rgba(p.colors[0], 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, cy - band, D, band * 2);
          var cy2 = cy + S * 0.12, b2 = S * 0.13;
          var g2 = ctx.createLinearGradient(0, cy2 - b2, 0, cy2 + b2);
          g2.addColorStop(0, p.rgba(p.colors[1] || p.colors[0], 0));
          g2.addColorStop(0.5, p.rgba(p.colors[1] || p.colors[0], 0.6 * p.alpha));
          g2.addColorStop(1, p.rgba(p.colors[1] || p.colors[0], 0));
          ctx.fillStyle = g2;
          ctx.fillRect(0, cy2 - b2, D, b2 * 2);
          ctx.filter = 'none';
        });
      }
    },
    {
      key: 'duotone', label: 'Duotone', desc: 'Two-tone cloud', colorCount: 2, random: true,
      w: 520, h: 420, colors: ['#ff6b2c', '#2c6bff'], amount: 58, angle: 0, intensity: 90, grain: 0,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          p.base(ctx, D, p.colors[0], 0.95 * p.alpha);
          ctx.filter = 'blur(' + p.blurPx + 'px)';
          ctx.globalCompositeOperation = 'lighter';
          p.blob(ctx, D * (0.3 + p.rnd() * 0.1), D * (0.36 + p.rnd() * 0.1), S * 0.45, p.colors[1] || p.colors[0], 0.9 * p.alpha);
          p.blob(ctx, D * (0.62 + p.rnd() * 0.1), D * (0.6 + p.rnd() * 0.08), S * 0.36, p.colors[0], 0.7 * p.alpha);
          ctx.globalCompositeOperation = 'source-over';
          ctx.filter = 'none';
        });
      }
    },
    {
      key: 'grain', label: 'Grain', desc: 'Blur under grain', colorCount: 2, random: true,
      w: 480, h: 480, colors: ['#ff4d9d', '#241028'], amount: 50, angle: 45, intensity: 95, grain: 45,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          var g = ctx.createLinearGradient(0, 0, D, D);
          g.addColorStop(0, p.rgba(p.colors[0], p.alpha));
          g.addColorStop(1, p.rgba(p.colors[1] || p.colors[0], p.alpha));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, D, D);
          ctx.filter = 'blur(' + p.blurPx + 'px)';
          p.blob(ctx, D * (0.35 + p.rnd() * 0.1), D * (0.35 + p.rnd() * 0.1), S * 0.42, p.colors[0], 0.6 * p.alpha);
          ctx.filter = 'none';
        });
      }
    },
    {
      key: 'leak', label: 'Light leak', desc: 'Edge glow', colorCount: 2, random: false,
      w: 520, h: 520, colors: ['#ffd84d', '#ff5e3a'], amount: 48, angle: 0, intensity: 90, grain: 0,
      draw: function (ctx, W, H, p) {
        p.rot(ctx, W, H, p.angle, function (D, S) {
          ctx.filter = 'blur(' + p.blurPx + 'px)';
          ctx.globalCompositeOperation = 'lighter';
          // Anchored just off the top edge of the rotated box, so Angle swings
          // the leak around the object's rim.
          p.blob(ctx, D * 0.5, D * 0.14, S * 0.6, p.colors[0], 0.85 * p.alpha);
          p.blob(ctx, D * 0.5, D * 0.06, S * 0.32, p.colors[1] || p.colors[0], 0.8 * p.alpha);
          ctx.globalCompositeOperation = 'source-over';
          ctx.filter = 'none';
        });
      }
    }
  ];

  function mount() {
    EffectsCore.registerEffect({
      key: 'gradient',
      label: 'Gradient',
      desc: 'Blurred gradient compositions',
      order: 1,
      backdrop: false,
      amountLabel: 'Blurriness',
      styles: STYLES,
      controlsFor: function (st) {
        var c = ['colors', 'amount', 'angle', 'intensity', 'grain', 'size'];
        if (st && st.random) c.push('reseed');
        return c;
      },
      paint: function (ctx, W, H, p, st) { if (st && st.draw) st.draw(ctx, W, H, p); }
    });
  }

  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 'gradient', parent: 'left-panel.background.effects', title: 'Gradient',
      mount: mount, unmount: function () {}
    });
  } else { mount(); }
})();
