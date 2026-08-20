// ╔═══════════════════════════════════════════════════════════════╗
// ║  VE-TRANSITIONS — Transition Library & Rendering Engine     ║
// ║  30+ transitions in 7 categories                            ║
// ╚═══════════════════════════════════════════════════════════════╝
(function() {
  'use strict';

  /* ════════════════════════════════════════════════
     TRANSITION CATALOG — categories + metadata
     ════════════════════════════════════════════════ */

  var CATEGORIES = [
    { id: 'fade',    label: 'Fade',    icon: 'sun' },
    { id: 'wipe',    label: 'Wipe',    icon: 'arrow-right' },
    { id: 'slide',   label: 'Slide',   icon: 'move' },
    { id: 'zoom',    label: 'Zoom',    icon: 'zoom-in' },
    { id: 'rotate',  label: 'Rotate',  icon: 'rotate-cw' },
    { id: 'blur',    label: 'Blur',    icon: 'droplets' },
    { id: 'special', label: 'Special', icon: 'sparkles' }
  ];

  var TRANSITIONS = [
    // ── Fade ──
    { id: 'crossfade',     label: 'Crossfade',       cat: 'fade' },
    { id: 'fade-black',    label: 'Fade to Black',    cat: 'fade' },
    { id: 'fade-white',    label: 'Fade to White',    cat: 'fade' },
    { id: 'flash',         label: 'Flash',            cat: 'fade' },
    { id: 'dissolve',      label: 'Dissolve',         cat: 'fade' },

    // ── Wipe ──
    { id: 'wipe-left',     label: 'Wipe Left',        cat: 'wipe' },
    { id: 'wipe-right',    label: 'Wipe Right',       cat: 'wipe' },
    { id: 'wipe-up',       label: 'Wipe Up',          cat: 'wipe' },
    { id: 'wipe-down',     label: 'Wipe Down',        cat: 'wipe' },
    { id: 'iris-open',     label: 'Iris Open',        cat: 'wipe' },
    { id: 'iris-close',    label: 'Iris Close',       cat: 'wipe' },
    { id: 'diamond',       label: 'Diamond',          cat: 'wipe' },
    { id: 'clock',         label: 'Clock Wipe',       cat: 'wipe' },

    // ── Slide ──
    { id: 'slide-left',    label: 'Slide Left',       cat: 'slide' },
    { id: 'slide-right',   label: 'Slide Right',      cat: 'slide' },
    { id: 'slide-up',      label: 'Slide Up',         cat: 'slide' },
    { id: 'slide-down',    label: 'Slide Down',       cat: 'slide' },
    { id: 'push-left',     label: 'Push Left',        cat: 'slide' },
    { id: 'push-right',    label: 'Push Right',       cat: 'slide' },
    { id: 'cover-left',    label: 'Cover Left',       cat: 'slide' },
    { id: 'cover-right',   label: 'Cover Right',      cat: 'slide' },

    // ── Zoom ──
    { id: 'zoom-in',       label: 'Zoom In',          cat: 'zoom' },
    { id: 'zoom-out',      label: 'Zoom Out',         cat: 'zoom' },
    { id: 'zoom-rotate',   label: 'Zoom + Rotate',    cat: 'zoom' },
    { id: 'zoom-bounce',   label: 'Zoom Bounce',      cat: 'zoom' },

    // ── Rotate ──
    { id: 'spin-cw',       label: 'Spin CW',          cat: 'rotate' },
    { id: 'spin-ccw',      label: 'Spin CCW',         cat: 'rotate' },
    { id: 'flip-x',        label: 'Flip Horizontal',  cat: 'rotate' },
    { id: 'flip-y',        label: 'Flip Vertical',    cat: 'rotate' },

    // ── Blur ──
    { id: 'blur-in',       label: 'Blur In',          cat: 'blur' },
    { id: 'blur-out',      label: 'Blur Out',         cat: 'blur' },
    { id: 'pixelate',      label: 'Pixelate',         cat: 'blur' },

    // ── Special ──
    { id: 'glitch',        label: 'Glitch',           cat: 'special' },
    { id: 'morph',         label: 'Morph',            cat: 'special' },
    { id: 'burn',          label: 'Burn',             cat: 'special' },
    { id: 'ripple',        label: 'Ripple',           cat: 'special' },
    { id: 'curtain',       label: 'Curtain',          cat: 'special' }
  ];

  // Flat list of IDs for compatibility
  var ALL_IDS = ['none'];
  TRANSITIONS.forEach(function(t) { ALL_IDS.push(t.id); });

  // Distinct Lucide glyph per transition — single source of truth used by BOTH the right-panel
  // inspector AND the transitions browser modal (directional arrows for wipe/slide, etc.).
  var TRANS_ICON = {
    'none': 'ban',
    'crossfade': 'blend', 'fade-black': 'moon', 'fade-white': 'sun', 'flash': 'zap', 'dissolve': 'sparkles',
    'wipe-left': 'arrow-left', 'wipe-right': 'arrow-right', 'wipe-up': 'arrow-up', 'wipe-down': 'arrow-down',
    'iris-open': 'aperture', 'iris-close': 'scan', 'diamond': 'diamond', 'clock': 'clock',
    'slide-left': 'chevrons-left', 'slide-right': 'chevrons-right', 'slide-up': 'chevrons-up', 'slide-down': 'chevrons-down',
    'push-left': 'arrow-left-to-line', 'push-right': 'arrow-right-to-line', 'cover-left': 'panel-left', 'cover-right': 'panel-right',
    'zoom-in': 'zoom-in', 'zoom-out': 'zoom-out', 'zoom-rotate': 'rotate-cw', 'zoom-bounce': 'move-vertical',
    'spin-cw': 'rotate-cw', 'spin-ccw': 'rotate-ccw', 'flip-x': 'flip-horizontal', 'flip-y': 'flip-vertical',
    'blur-in': 'droplet', 'blur-out': 'droplets', 'pixelate': 'grid-2x2',
    'glitch': 'radio', 'morph': 'git-merge', 'burn': 'flame', 'ripple': 'waves', 'curtain': 'columns'
  };
  function iconFor(id) { return TRANS_ICON[id] || 'shuffle'; }

  /* ════════════════════════════════════════════════
     EASING
     ════════════════════════════════════════════════ */

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function easeOut(t)   { return t * (2 - t); }
  function easeIn(t)    { return t * t; }
  function bounce(t) {
    var s = 7.5625, p = 2.75;
    if (t < 1 / p) return s * t * t;
    if (t < 2 / p) return s * (t -= 1.5 / p) * t + 0.75;
    if (t < 2.5 / p) return s * (t -= 2.25 / p) * t + 0.9375;
    return s * (t -= 2.625 / p) * t + 0.984375;
  }

  /* ════════════════════════════════════════════════
     TRANSITION-IN RENDERER
     ════════════════════════════════════════════════ */

  function applyTransitionIn(ctx, type, progress, w, h, videoEl) {
    if (!type || type === 'none' || progress >= 1) {
      ctx.globalAlpha = 1;
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }
    var p = Math.max(0, Math.min(1, progress));
    var ep = easeInOut(p);

    switch (type) {

      // ── Fade ──
      case 'crossfade':
        ctx.globalAlpha = ep;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.globalAlpha = 1;
        break;

      case 'fade-black':
        ctx.globalAlpha = 1;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.globalAlpha = 1 - ep;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        break;

      case 'fade-white':
        ctx.globalAlpha = 1;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.globalAlpha = 1 - ep;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        break;

      case 'flash':
        ctx.globalAlpha = 1;
        ctx.drawImage(videoEl, 0, 0, w, h);
        if (p < 0.3) {
          ctx.globalAlpha = 1 - (p / 0.3);
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
        }
        break;

      case 'dissolve':
        // Block dissolve using clipped random rectangles
        ctx.save();
        ctx.beginPath();
        var bs = Math.max(8, Math.round(w / 20));
        var cols = Math.ceil(w / bs), rows = Math.ceil(h / bs);
        var threshold = ep;
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            // Deterministic pseudo-random per block
            var hash = ((r * 31 + c * 17) % 100) / 100;
            if (hash < threshold) {
              ctx.rect(c * bs, r * bs, bs, bs);
            }
          }
        }
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      // ── Wipe ──
      case 'wipe-left':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * ep, h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'wipe-right':
        ctx.save();
        ctx.beginPath();
        ctx.rect(w * (1 - ep), 0, w * ep, h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'wipe-up':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, h * (1 - ep), w, h * ep);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'wipe-down':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h * ep);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'iris-open':
        ctx.save();
        ctx.beginPath();
        var maxR = Math.sqrt(w * w + h * h) / 2;
        ctx.arc(w / 2, h / 2, maxR * ep, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'iris-close':
        // Reverse iris: starts from edges, circle shrinks to center revealing content
        ctx.save();
        ctx.beginPath();
        var maxR2 = Math.sqrt(w * w + h * h) / 2;
        ctx.arc(w / 2, h / 2, maxR2 * (1 - ep * 0.8), 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'diamond':
        ctx.save();
        ctx.beginPath();
        var dw = w * ep, dh2 = h * ep;
        var cx = w / 2, cy = h / 2;
        ctx.moveTo(cx, cy - dh2 / 2);
        ctx.lineTo(cx + dw / 2, cy);
        ctx.lineTo(cx, cy + dh2 / 2);
        ctx.lineTo(cx - dw / 2, cy);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'clock':
        ctx.save();
        ctx.beginPath();
        var cx2 = w / 2, cy2 = h / 2;
        var maxR3 = Math.sqrt(w * w + h * h);
        ctx.moveTo(cx2, cy2);
        var startAngle = -Math.PI / 2;
        var endAngle = startAngle + Math.PI * 2 * ep;
        ctx.arc(cx2, cy2, maxR3, startAngle, endAngle);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      // ── Slide ──
      case 'slide-left':
        ctx.drawImage(videoEl, w * (1 - ep), 0, w, h);
        break;

      case 'slide-right':
        ctx.drawImage(videoEl, -w * (1 - ep), 0, w, h);
        break;

      case 'slide-up':
        ctx.drawImage(videoEl, 0, h * (1 - ep), w, h);
        break;

      case 'slide-down':
        ctx.drawImage(videoEl, 0, -h * (1 - ep), w, h);
        break;

      case 'push-left':
        // Previous frame pushed left (not available here), new slides from right
        ctx.drawImage(videoEl, w * (1 - ep), 0, w, h);
        break;

      case 'push-right':
        ctx.drawImage(videoEl, -w * (1 - ep), 0, w, h);
        break;

      case 'cover-left':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * ep, h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'cover-right':
        ctx.save();
        ctx.beginPath();
        ctx.rect(w * (1 - ep), 0, w, h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      // ── Zoom ──
      case 'zoom-in':
        var zs = 0.3 + 0.7 * ep;
        var zx = (w - w * zs) / 2;
        var zy = (h - h * zs) / 2;
        ctx.globalAlpha = ep;
        ctx.drawImage(videoEl, zx, zy, w * zs, h * zs);
        ctx.globalAlpha = 1;
        break;

      case 'zoom-out':
        var zs2 = 1.5 - 0.5 * ep;
        var zx2 = (w - w * zs2) / 2;
        var zy2 = (h - h * zs2) / 2;
        ctx.globalAlpha = ep;
        ctx.drawImage(videoEl, zx2, zy2, w * zs2, h * zs2);
        ctx.globalAlpha = 1;
        break;

      case 'zoom-rotate':
        ctx.save();
        ctx.globalAlpha = ep;
        ctx.translate(w / 2, h / 2);
        var zr = 0.3 + 0.7 * ep;
        ctx.scale(zr, zr);
        ctx.rotate((1 - ep) * Math.PI * 0.5);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'zoom-bounce':
        var bt = bounce(p);
        var zb = 0.5 + 0.5 * bt;
        var zbx = (w - w * zb) / 2;
        var zby = (h - h * zb) / 2;
        ctx.globalAlpha = Math.min(1, p * 2);
        ctx.drawImage(videoEl, zbx, zby, w * zb, h * zb);
        ctx.globalAlpha = 1;
        break;

      // ── Rotate ──
      case 'spin-cw':
        ctx.save();
        ctx.globalAlpha = ep;
        ctx.translate(w / 2, h / 2);
        ctx.rotate((1 - ep) * Math.PI * 2);
        var ss = 0.5 + 0.5 * ep;
        ctx.scale(ss, ss);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'spin-ccw':
        ctx.save();
        ctx.globalAlpha = ep;
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-(1 - ep) * Math.PI * 2);
        var ss2 = 0.5 + 0.5 * ep;
        ctx.scale(ss2, ss2);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'flip-x':
        ctx.save();
        ctx.globalAlpha = ep;
        ctx.translate(w / 2, h / 2);
        ctx.scale(ep < 0.5 ? (1 - ep * 2) : (ep * 2 - 1), 1);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'flip-y':
        ctx.save();
        ctx.globalAlpha = ep;
        ctx.translate(w / 2, h / 2);
        ctx.scale(1, ep < 0.5 ? (1 - ep * 2) : (ep * 2 - 1));
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      // ── Blur ──
      case 'blur-in':
        ctx.save();
        ctx.filter = 'blur(' + Math.round((1 - ep) * 20) + 'px)';
        ctx.globalAlpha = ep;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'blur-out':
        // blur-out as an "in" transition = start blurred from edges
        ctx.save();
        ctx.filter = 'blur(' + Math.round((1 - ep) * 15) + 'px)';
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'pixelate':
        _drawPixelated(ctx, videoEl, w, h, 1 - ep);
        break;

      // ── Special ──
      case 'glitch':
        _drawGlitch(ctx, videoEl, w, h, p, true);
        break;

      case 'morph':
        ctx.save();
        ctx.globalAlpha = ep;
        var mScale = 0.8 + 0.2 * ep;
        var skewAmount = (1 - ep) * 0.3;
        ctx.translate(w / 2, h / 2);
        ctx.transform(mScale, skewAmount, -skewAmount, mScale, 0, 0);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'burn':
        _drawBurn(ctx, videoEl, w, h, ep, true);
        break;

      case 'ripple':
        _drawRipple(ctx, videoEl, w, h, ep, true);
        break;

      case 'curtain':
        ctx.save();
        // Two halves opening from center
        var half = w * (1 - ep) / 2;
        ctx.beginPath();
        ctx.rect(half, 0, w - half * 2, h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      default:
        ctx.drawImage(videoEl, 0, 0, w, h);
    }
  }

  /* ════════════════════════════════════════════════
     TRANSITION-OUT RENDERER
     ════════════════════════════════════════════════ */

  function applyTransitionOut(ctx, type, progress, w, h, videoEl) {
    if (!type || type === 'none' || progress <= 0) {
      ctx.globalAlpha = 1;
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }
    var p = Math.max(0, Math.min(1, progress));
    var ep = easeInOut(p);

    switch (type) {

      // ── Fade ──
      case 'crossfade':
        ctx.globalAlpha = 1 - ep;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.globalAlpha = 1;
        break;

      case 'fade-black':
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.globalAlpha = ep;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        break;

      case 'fade-white':
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.globalAlpha = ep;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        break;

      case 'flash':
        ctx.drawImage(videoEl, 0, 0, w, h);
        if (p > 0.7) {
          ctx.globalAlpha = (p - 0.7) / 0.3;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
        }
        break;

      case 'dissolve':
        ctx.save();
        ctx.beginPath();
        var bs = Math.max(8, Math.round(w / 20));
        var cols = Math.ceil(w / bs), rows = Math.ceil(h / bs);
        var threshold = 1 - ep;
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var hash = ((r * 31 + c * 17) % 100) / 100;
            if (hash < threshold) {
              ctx.rect(c * bs, r * bs, bs, bs);
            }
          }
        }
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      // ── Wipe ──
      case 'wipe-left':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * (1 - ep), h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'wipe-right':
        ctx.save();
        ctx.beginPath();
        ctx.rect(w * ep, 0, w * (1 - ep), h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'wipe-up':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h * (1 - ep));
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'wipe-down':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, h * ep, w, h * (1 - ep));
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'iris-open':
        ctx.save();
        ctx.beginPath();
        var mR = Math.sqrt(w * w + h * h) / 2;
        ctx.arc(w / 2, h / 2, mR * (1 - ep), 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'iris-close':
        ctx.save();
        ctx.beginPath();
        var mR2 = Math.sqrt(w * w + h * h) / 2;
        ctx.arc(w / 2, h / 2, mR2 * ep, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'diamond':
        ctx.save();
        ctx.beginPath();
        var dw3 = w * (1 - ep), dh3 = h * (1 - ep);
        var cx3 = w / 2, cy3 = h / 2;
        ctx.moveTo(cx3, cy3 - dh3 / 2);
        ctx.lineTo(cx3 + dw3 / 2, cy3);
        ctx.lineTo(cx3, cy3 + dh3 / 2);
        ctx.lineTo(cx3 - dw3 / 2, cy3);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'clock':
        ctx.save();
        ctx.beginPath();
        var cx4 = w / 2, cy4 = h / 2;
        var mR4 = Math.sqrt(w * w + h * h);
        ctx.moveTo(cx4, cy4);
        var sA = -Math.PI / 2;
        var eA = sA + Math.PI * 2 * (1 - ep);
        ctx.arc(cx4, cy4, mR4, sA, eA);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      // ── Slide ──
      case 'slide-left':
        ctx.drawImage(videoEl, -w * ep, 0, w, h);
        break;

      case 'slide-right':
        ctx.drawImage(videoEl, w * ep, 0, w, h);
        break;

      case 'slide-up':
        ctx.drawImage(videoEl, 0, -h * ep, w, h);
        break;

      case 'slide-down':
        ctx.drawImage(videoEl, 0, h * ep, w, h);
        break;

      case 'push-left':
        ctx.drawImage(videoEl, -w * ep, 0, w, h);
        break;

      case 'push-right':
        ctx.drawImage(videoEl, w * ep, 0, w, h);
        break;

      case 'cover-left':
        ctx.drawImage(videoEl, -w * ep, 0, w, h);
        break;

      case 'cover-right':
        ctx.drawImage(videoEl, w * ep, 0, w, h);
        break;

      // ── Zoom ──
      case 'zoom-in':
        var z2s = 1 + 0.5 * ep;
        var z2x = (w - w * z2s) / 2;
        var z2y = (h - h * z2s) / 2;
        ctx.globalAlpha = 1 - ep;
        ctx.drawImage(videoEl, z2x, z2y, w * z2s, h * z2s);
        ctx.globalAlpha = 1;
        break;

      case 'zoom-out':
        var z3s = 1 - 0.7 * ep;
        var z3x = (w - w * z3s) / 2;
        var z3y = (h - h * z3s) / 2;
        ctx.globalAlpha = 1 - ep;
        ctx.drawImage(videoEl, z3x, z3y, w * z3s, h * z3s);
        ctx.globalAlpha = 1;
        break;

      case 'zoom-rotate':
        ctx.save();
        ctx.globalAlpha = 1 - ep;
        ctx.translate(w / 2, h / 2);
        var zrs = 1 - 0.7 * ep;
        ctx.scale(zrs, zrs);
        ctx.rotate(ep * Math.PI * 0.5);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'zoom-bounce':
        var bt2 = bounce(1 - p);
        var zb2 = 0.5 + 0.5 * bt2;
        var zbx2 = (w - w * zb2) / 2;
        var zby2 = (h - h * zb2) / 2;
        ctx.globalAlpha = 1 - ep;
        ctx.drawImage(videoEl, zbx2, zby2, w * zb2, h * zb2);
        ctx.globalAlpha = 1;
        break;

      // ── Rotate ──
      case 'spin-cw':
        ctx.save();
        ctx.globalAlpha = 1 - ep;
        ctx.translate(w / 2, h / 2);
        ctx.rotate(ep * Math.PI * 2);
        var so = 1 - 0.5 * ep;
        ctx.scale(so, so);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'spin-ccw':
        ctx.save();
        ctx.globalAlpha = 1 - ep;
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-ep * Math.PI * 2);
        var so2 = 1 - 0.5 * ep;
        ctx.scale(so2, so2);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'flip-x':
        ctx.save();
        ctx.globalAlpha = 1 - ep;
        ctx.translate(w / 2, h / 2);
        ctx.scale(ep < 0.5 ? (1 - ep * 2) : (ep * 2 - 1), 1);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'flip-y':
        ctx.save();
        ctx.globalAlpha = 1 - ep;
        ctx.translate(w / 2, h / 2);
        ctx.scale(1, ep < 0.5 ? (1 - ep * 2) : (ep * 2 - 1));
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      // ── Blur ──
      case 'blur-in':
        ctx.save();
        ctx.filter = 'blur(' + Math.round(ep * 20) + 'px)';
        ctx.globalAlpha = 1 - ep;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'blur-out':
        ctx.save();
        ctx.filter = 'blur(' + Math.round(ep * 15) + 'px)';
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      case 'pixelate':
        _drawPixelated(ctx, videoEl, w, h, ep);
        break;

      // ── Special ──
      case 'glitch':
        _drawGlitch(ctx, videoEl, w, h, p, false);
        break;

      case 'morph':
        ctx.save();
        ctx.globalAlpha = 1 - ep;
        var mS2 = 1 - 0.2 * ep;
        var sk2 = ep * 0.3;
        ctx.translate(w / 2, h / 2);
        ctx.transform(mS2, sk2, -sk2, mS2, 0, 0);
        ctx.drawImage(videoEl, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'burn':
        _drawBurn(ctx, videoEl, w, h, ep, false);
        break;

      case 'ripple':
        _drawRipple(ctx, videoEl, w, h, ep, false);
        break;

      case 'curtain':
        ctx.save();
        var half2 = w * ep / 2;
        ctx.beginPath();
        ctx.rect(half2, 0, w - half2 * 2, h);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
        break;

      default:
        ctx.drawImage(videoEl, 0, 0, w, h);
    }
  }

  /* ════════════════════════════════════════════════
     SPECIAL EFFECT HELPERS
     ════════════════════════════════════════════════ */

  function _drawPixelated(ctx, videoEl, w, h, amount) {
    if (amount <= 0.01) { ctx.drawImage(videoEl, 0, 0, w, h); return; }
    var pxSize = Math.max(2, Math.round(amount * 40));
    var sw = Math.max(1, Math.round(w / pxSize));
    var sh = Math.max(1, Math.round(h / pxSize));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Draw small then scale up
    ctx.drawImage(videoEl, 0, 0, sw, sh);
    ctx.drawImage(ctx.canvas, 0, 0, sw, sh, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  }

  function _drawGlitch(ctx, videoEl, w, h, progress, isIn) {
    // Draw base
    var alpha = isIn ? Math.min(1, progress * 2) : Math.max(0, 1 - progress * 2);
    ctx.globalAlpha = alpha;
    ctx.drawImage(videoEl, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // Random horizontal slice offsets
    var intensity = isIn ? (1 - progress) : progress;
    var slices = 5 + Math.round(intensity * 10);
    var maxOff = intensity * w * 0.15;
    for (var i = 0; i < slices; i++) {
      var sy = Math.random() * h;
      var sh2 = 2 + Math.random() * (h / slices);
      var offX = (Math.random() - 0.5) * maxOff * 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, sy, w, sh2);
      ctx.clip();
      ctx.globalAlpha = alpha * 0.8;
      ctx.drawImage(videoEl, offX, 0, w, h);
      ctx.restore();
    }

    // Color channel split
    if (intensity > 0.2) {
      var chOff = Math.round(intensity * 8);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = intensity * 0.3;
      ctx.drawImage(videoEl, chOff, 0, w, h);
      ctx.drawImage(videoEl, -chOff, 0, w, h);
      ctx.restore();
    }
  }

  function _drawBurn(ctx, videoEl, w, h, progress, isIn) {
    var p = isIn ? progress : (1 - progress);
    // Draw base image
    ctx.globalAlpha = isIn ? p : (1 - progress);
    ctx.drawImage(videoEl, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // Orange/fire gradient overlay
    var fireAlpha = isIn ? (1 - p) * 0.6 : progress * 0.6;
    if (fireAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = fireAlpha;
      var grad = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, Math.max(w, h));
      grad.addColorStop(0, '#ff4500');
      grad.addColorStop(0.5, '#ff8c00');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function _drawRipple(ctx, videoEl, w, h, progress, isIn) {
    var p = isIn ? progress : (1 - progress);
    var alpha = isIn ? p : (1 - progress);
    ctx.globalAlpha = alpha;

    // Draw base
    ctx.drawImage(videoEl, 0, 0, w, h);

    // Simulate ripple with displacement overlay
    var rippleInt = isIn ? (1 - p) : progress;
    if (rippleInt > 0.05) {
      ctx.save();
      ctx.globalAlpha = rippleInt * 0.3;
      ctx.globalCompositeOperation = 'overlay';
      var wave = Math.sin(p * Math.PI * 6) * rippleInt * 15;
      ctx.drawImage(videoEl, wave, wave, w - wave * 2, h - wave * 2, 0, 0, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ════════════════════════════════════════════════
     TRANSITION STATE CALCULATOR
     ════════════════════════════════════════════════ */

  function getTransitionState(clip, currentTime) {
    var result = {
      inTransition: false,
      outTransition: false,
      inProgress: 1,
      outProgress: 0,
      inType: 'none',
      outType: 'none'
    };

    if (!clip.transitions) return result;

    var clipEnd = clip.startTime + clip.duration;

    var transIn = clip.transitions['in'];
    if (transIn && transIn.type && transIn.type !== 'none') {
      var inDur = transIn.duration || 0.5;
      var inEnd = clip.startTime + inDur;
      if (currentTime < inEnd) {
        result.inTransition = true;
        result.inProgress = Math.max(0, (currentTime - clip.startTime) / inDur);
        result.inType = transIn.type;
      }
    }

    var transOut = clip.transitions.out;
    if (transOut && transOut.type && transOut.type !== 'none') {
      var outDur = transOut.duration || 0.5;
      var outStart = clipEnd - outDur;
      if (currentTime >= outStart) {
        result.outTransition = true;
        result.outProgress = Math.max(0, (currentTime - outStart) / outDur);
        result.outType = transOut.type;
      }
    }

    return result;
  }

  /* ════════════════════════════════════════════════
     ORCHESTRATOR — render clip with transitions
     ════════════════════════════════════════════════ */

  function renderClipWithTransitions(ctx, clip, videoEl, w, h, currentTime) {
    var state = getTransitionState(clip, currentTime);

    if (!state.inTransition && !state.outTransition) {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    if (state.inTransition && state.outTransition) {
      if (state.inProgress < 0.5) {
        applyTransitionIn(ctx, state.inType, state.inProgress, w, h, videoEl);
      } else {
        applyTransitionOut(ctx, state.outType, state.outProgress, w, h, videoEl);
      }
      return;
    }

    if (state.inTransition) {
      applyTransitionIn(ctx, state.inType, state.inProgress, w, h, videoEl);
      return;
    }

    if (state.outTransition) {
      applyTransitionOut(ctx, state.outType, state.outProgress, w, h, videoEl);
    }
  }

  /* ════════════════════════════════════════════════
     TRANSITION PICKER UI — modal library
     ════════════════════════════════════════════════ */

  function showTransitionPicker(clipId, direction, onSelect) {
    var old = document.getElementById('ve-trans-picker');
    if (old) old.remove();

    // Find current active transition
    var currentType = 'none';
    if (window.VideoEditor) {
      var proj = VideoEditor.getProject ? VideoEditor.getProject() : null;
      if (proj && proj.tracks) {
        proj.tracks.forEach(function(t) { t.clips.forEach(function(c) {
          if (c.id === clipId && c.transitions && c.transitions[direction]) {
            currentType = c.transitions[direction].type || 'none';
          }
        }); });
      }
    }

    var overlay = document.createElement('div');
    overlay.id = 've-trans-picker';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;';

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface,#131316);border:1px solid var(--border,#27272d);border-radius:12px;width:620px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;color:var(--text,#ededf0);';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'padding:16px 20px;border-bottom:1px solid var(--border,#27272d);display:flex;align-items:center;justify-content:space-between;';
    var dirLabel = direction === 'in' ? 'Transition In' : 'Transition Out';
    header.innerHTML = '<span style="font-weight:600;font-size:15px;">🎬 ' + dirLabel + ' Library</span>' +
      '<button id="ve-trans-close" style="background:none;border:none;color:var(--text-dim,#888);font-size:20px;cursor:pointer;">&times;</button>';
    modal.appendChild(header);

    // Category tabs
    var tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:4px;padding:8px 16px;border-bottom:1px solid var(--border,#27272d);overflow-x:auto;flex-shrink:0;';
    tabBar.innerHTML = '<button class="ve-tp-tab ve-tp-tab--active" data-cat="all" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border2,#35353c);background:var(--surface3,#232328);color:var(--text,#ededf0);cursor:pointer;font-size:12px;white-space:nowrap;">All</button>';
    CATEGORIES.forEach(function(cat) {
      tabBar.innerHTML += '<button class="ve-tp-tab" data-cat="' + cat.id + '" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border,#27272d);background:transparent;color:var(--text-dim,#888);cursor:pointer;font-size:12px;white-space:nowrap;">' + cat.label + '</button>';
    });
    modal.appendChild(tabBar);

    // Grid of transitions
    var gridWrap = document.createElement('div');
    gridWrap.style.cssText = 'overflow-y:auto;padding:16px;flex:1;';
    var grid = document.createElement('div');
    grid.id = 've-trans-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;';

    // "None" card
    grid.innerHTML = _buildTransCard('none', 'None', currentType === 'none');

    TRANSITIONS.forEach(function(t) {
      grid.innerHTML += _buildTransCard(t.id, t.label, t.id === currentType, t.cat);
    });
    gridWrap.appendChild(grid);
    modal.appendChild(gridWrap);

    // Duration row
    var durRow = document.createElement('div');
    durRow.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border,#27272d);display:flex;align-items:center;gap:12px;';
    durRow.innerHTML = '<span style="font-size:12px;color:var(--text-dim,#888);">Duration:</span>' +
      '<input type="range" id="ve-trans-dur" min="0.1" max="3" step="0.1" value="0.5" style="flex:1;accent-color:var(--gold,#f2ff58);">' +
      '<span id="ve-trans-dur-val" style="font-size:12px;min-width:32px;">0.5s</span>';
    modal.appendChild(durRow);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Duration slider
    var durSlider = document.getElementById('ve-trans-dur');
    var durVal = document.getElementById('ve-trans-dur-val');
    durSlider.addEventListener('input', function() {
      durVal.textContent = parseFloat(durSlider.value).toFixed(1) + 's';
    });

    // Tab filtering
    tabBar.addEventListener('click', function(ev) {
      var tab = ev.target.closest('.ve-tp-tab');
      if (!tab) return;
      tabBar.querySelectorAll('.ve-tp-tab').forEach(function(t) {
        t.style.background = 'transparent';
        t.style.color = 'var(--text-dim,#888)';
        t.classList.remove('ve-tp-tab--active');
      });
      tab.style.background = 'var(--surface3,#232328)';
      tab.style.color = 'var(--text,#ededf0)';
      tab.classList.add('ve-tp-tab--active');

      var cat = tab.getAttribute('data-cat');
      grid.querySelectorAll('.ve-tp-card').forEach(function(card) {
        var cCat = card.getAttribute('data-cat');
        card.style.display = (cat === 'all' || cCat === cat || cCat === 'none') ? '' : 'none';
      });
    });

    // Card click → select
    grid.addEventListener('click', function(ev) {
      var card = ev.target.closest('.ve-tp-card');
      if (!card) return;
      grid.querySelectorAll('.ve-tp-card').forEach(function(c) {
        c.style.borderColor = 'var(--border,#27272d)';
        c.style.background = 'var(--surface2,#1b1b1f)';
      });
      card.style.borderColor = 'var(--gold,#f2ff58)';
      card.style.background = 'var(--surface3,#232328)';

      var tType = card.getAttribute('data-type');
      var dur = parseFloat(durSlider.value) || 0.5;
      if (onSelect) onSelect(tType, dur);
      overlay.remove();
    });

    // Close
    overlay.addEventListener('click', function(ev) {
      if (ev.target === overlay) overlay.remove();
    });
    document.getElementById('ve-trans-close').addEventListener('click', function() { overlay.remove(); });
  }

  function _buildTransCard(id, label, isActive, cat) {
    var borderColor = isActive ? 'var(--gold,#f2ff58)' : 'var(--border,#27272d)';
    var bgColor = isActive ? 'var(--surface3,#232328)' : 'var(--surface2,#1b1b1f)';
    return '<div class="ve-tp-card" data-type="' + id + '" data-cat="' + (cat || 'none') + '" ' +
      'style="border:2px solid ' + borderColor + ';background:' + bgColor + ';border-radius:8px;padding:10px 8px;cursor:pointer;text-align:center;transition:all .15s;">' +
      '<div style="width:100%;height:48px;background:var(--bg,#0b0b0d);border-radius:4px;margin-bottom:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
      _getTransPreview(id) +
      '</div>' +
      '<div style="font-size:11px;color:var(--text,#ededf0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</div>' +
      '</div>';
  }

  function _getTransPreview(id) {
    var colors = {
      'fade': '#6366f1', 'wipe': '#22d3ee', 'slide': '#f59e0b',
      'zoom': '#ec4899', 'rotate': '#10b981', 'blur': '#8b5cf6', 'special': '#ef4444'
    };
    var t = null;
    for (var i = 0; i < TRANSITIONS.length; i++) {
      if (TRANSITIONS[i].id === id) { t = TRANSITIONS[i]; break; }
    }
    var color = t ? (colors[t.cat] || '#888') : '#555';
    if (id === 'none') return '<div style="color:#555;font-size:18px;">⊘</div>';
    // Simple animated preview representation
    var svgW = 80, svgH = 36;
    var svg = '<svg width="' + svgW + '" height="' + svgH + '" viewBox="0 0 80 36">';
    svg += '<rect x="2" y="2" width="36" height="32" rx="3" fill="#444" opacity="0.5"/>';
    svg += '<rect x="42" y="2" width="36" height="32" rx="3" fill="' + color + '" opacity="0.8"/>';
    svg += '<path d="M38 10 L42 18 L38 26" fill="none" stroke="' + color + '" stroke-width="1.5" opacity="0.7"/>';
    svg += '</svg>';
    return svg;
  }

  /* ════════════════════════════════════════════════
     PUBLIC API
     ════════════════════════════════════════════════ */

  window.VETransitions = {
    applyTransitionIn: applyTransitionIn,
    applyTransitionOut: applyTransitionOut,
    getTransitionState: getTransitionState,
    renderClipWithTransitions: renderClipWithTransitions,
    showTransitionPicker: showTransitionPicker,
    iconFor: iconFor,
    TRANSITIONS: TRANSITIONS,
    CATEGORIES: CATEGORIES,
    ALL_IDS: ALL_IDS
  };
})();

// Modular skeleton hook (Faz 8) — ve-transitions is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-transitions', parent: 'video', title: 've-transitions', mount: function () {}, unmount: function () {} });
