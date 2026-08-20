/* Module: video/ve-advanced-features/scopes — Video Scopes — waveform / parade / vectorscope /
   histogram / CIE chromaticity. Part of the ve-advanced-features group; functions hang off the
   shared namespace VEA (window.__ccVEAdvanced).

   Plan: docs/video-scopes-plan.md

   WHAT THIS REPLACES, and why it was rewritten rather than wired up:
     The previous version's maths was competent but it had ZERO call sites for updateScopes, so the
     panel was an empty box forever. Wiring it as-is was a one-line change and would have been
     WRONG: it plotted a saturated trace on mismatched colour maths and called it a measurement.
     A wrong instrument is worse than no instrument, because the user cannot tell and will trust it.

   THE THREE THINGS THAT MAKE THIS A REAL SCOPE:

   1. DENSITY, NOT SCATTER. Brightness encodes how many pixels landed in a bin. The old code had the
      right idea (alpha overdraw) but alpha 0.08 saturates at 12 hits, and a column holds hundreds,
      so every trace clipped to a white blob and the density information (the entire point) was
      destroyed. Here: accumulate into a Uint32Array, then map hit-count to brightness through a
      LOG curve with a user gain, then ONE putImageData. That also removes ~65,000 fillRect calls
      per frame; the correctness fix and the performance fix are the same change.

   2. THE GRATICULE IS DERIVED FROM THE PLOT MATHS, never hardcoded. This is the fix for a real bug:
      the old code plotted Cb/Cr with Rec.601 luma but drew the classic textbook target angles
      (R 103.5, B 347.1, ...), which come from ANALOG U/V weights (U=0.493(B-Y), V=0.877(R-Y)) on
      601. Those are different maths, so its own green landed 8.9 degrees off its own green box.
      Measured, all six primaries:
         analog U/V + 601 : R 103.5  Yl 167.1  G 240.7  Cy 283.5  B 347.1  Mg 60.7   <- the textbook
         Cb/Cr + 601      : R 108.6  Yl 170.8  G 231.6  Cy 288.6  B 350.8  Mg 51.6
         Cb/Cr + 709      : R 102.9  Yl 174.8  G 229.7  Cy 282.9  B 354.8  Mg 49.7   <- OURS
      A vectorscope graticule is colour-space specific. Ours calls _chroma() on the primaries to
      place the targets, so plot and graticule cannot drift apart, and a future colour-space switch
      moves the graticule for free.

   3. REC.709 EVERYWHERE, from ONE constant. Our footage is HD. The old code was 709 in the waveform
      and 601 in the vectorscope: two scopes in one panel disagreeing about what colour is.

   Analysis size 480x270 (docs/video-scopes-plan.md P0.2): the full pipeline measured 3.29ms median
   there vs 32.36ms at 1920x1080. Cost is linear in pixels; this is the dial. The downscale is NOT
   an optimisation to remove - reading the full canvas and accumulating it costs 22.9ms in JS. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;

  // ── constants ──────────────────────────────────────────────────────────────
  // Rec.709. ONE definition; everything derives from it, including the graticule.
  var CS = { name: '709', kr: 0.2126, kg: 0.7152, kb: 0.0722 };

  // 8-bit broadcast-legal range. Below BLACK is super-black, above WHITE is super-white: both are
  // legal to capture and illegal to deliver, which is exactly why the scope must MARK them.
  var LEGAL = { black: 16, white: 235 };

  // The NTSC +I axis. Real skin spans ~116-126 degrees and tools disagree by 10+, so the band is
  // drawn as well as the line: a single hairline would claim a precision that does not exist.
  var SKIN_ANGLE = 123, SKIN_LO = 116, SKIN_HI = 126;

  var PRIMARIES = [
    { label: 'R',  rgb: [1, 0, 0] }, { label: 'Yl', rgb: [1, 1, 0] },
    { label: 'G',  rgb: [0, 1, 0] }, { label: 'Cy', rgb: [0, 1, 1] },
    { label: 'B',  rgb: [0, 0, 1] }, { label: 'Mg', rgb: [1, 0, 1] }
  ];

  var MODES = [
    { id: 'waveform',    name: 'Waveform' },
    { id: 'parade',      name: 'RGB Parade' },
    { id: 'vectorscope', name: 'Vectorscope' },
    { id: 'histogram',   name: 'Histogram' },
    { id: 'cie',         name: 'CIE' }
  ];

  var AW = 480, AH = 270;          // analysis buffer (P0.2)
  var BG = '#0b0b0d';

  // ── colour maths. Everything colour-related goes through these two. ────────
  function _luma(r, g, b) { return CS.kr * r + CS.kg * g + CS.kb * b; }   // 0-255 in, 0-255 out

  // r,g,b in 0..1 -> Cb/Cr in -0.5..0.5. The generic form: dividing by 2*(1-k) is what makes the
  // 709 divisors 1.8556 / 1.5748 and the 601 ones 1.772 / 1.402. Never hardcode those.
  function _chroma(r, g, b) {
    var y = CS.kr * r + CS.kg * g + CS.kb * b;
    return { cb: (b - y) / (2 * (1 - CS.kb)), cr: (r - y) / (2 * (1 - CS.kr)) };
  }

  // The graticule targets, DERIVED. Recomputed if CS ever changes.
  var _targets = null;
  function _vectorTargets() {
    if (_targets && _targets.cs === CS.name) return _targets;
    var t = { cs: CS.name, list: [], maxR: 0 };
    PRIMARIES.forEach(function (p) {
      var c100 = _chroma(p.rgb[0], p.rgb[1], p.rgb[2]);
      var c75 = _chroma(p.rgb[0] * 0.75, p.rgb[1] * 0.75, p.rgb[2] * 0.75);
      var mag = Math.sqrt(c100.cb * c100.cb + c100.cr * c100.cr);
      if (mag > t.maxR) t.maxR = mag;
      t.list.push({ label: p.label, c100: c100, c75: c75 });
    });
    _targets = t;
    return t;
  }

  // ── state ──────────────────────────────────────────────────────────────────
  VEA._scopeMode = VEA._scopeMode || 'waveform';
  var _layout = 1;                 // 1 | 2 | 4 up
  var _gain = 1;                   // user density gain
  var _p = null;                   // panel root
  var _cvs = null, _ctx = null;    // the visible scope canvas
  var _open = false;
  var _win = null;                 // popped-out window
  var _raf = null;
  var _last = 0;
  var _interval = 1000 / 30;       // P0: 3.29ms/frame of work, so 30fps is affordable
  var _analysis = null;            // {canvas, ctx}
  var _cell = null, _cellCtx = null, _cellImg = null;   // reusable per-scope raster
  var _acc = null;                 // reusable Uint32Array
  var GEOM_KEY = 'cc_scope_geom';

  // A corner tag. save/restore because ctx.textAlign is STICKY: setting it and not resetting leaks
  // into every later fillText on this context. Five call sites set it; one reset it.
  function _tag(text, x, y, w) {
    if (w < 150) return;
    _ctx.save();
    _ctx.fillStyle = 'rgba(255,255,255,0.35)';
    _ctx.font = '9px monospace';
    _ctx.textAlign = 'right';
    _ctx.fillText(text, x + w - 5, y + 10);
    _ctx.restore();
  }

  function _VE() { return window.__ccVideoEditor; }
  function _icon(n, s) { var VE = _VE(); return (VE && VE._veIcon) ? VE._veIcon(n, s || 14) : ''; }

  // ── sampling ───────────────────────────────────────────────────────────────
  // ONE readback per update. willReadFrequently is not optional: without it Chrome demotes the
  // canvas to CPU rendering after the second getImageData, and this reads every frame. Every other
  // pixel-reading module here already passes it (ve-inspector, ve-color-grading, ve-chroma-key);
  // the old scopes.js was the one that forgot.
  function _sample(src) {
    if (!src || !src.width || !src.height) return null;
    if (!_analysis) {
      var c = document.createElement('canvas');
      c.width = AW; c.height = AH;
      _analysis = { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) };
    }
    _analysis.ctx.drawImage(src, 0, 0, AW, AH);
    return _analysis.ctx.getImageData(0, 0, AW, AH);
  }

  // ALWAYS returns a CLEARED raster. The callers only write the bins that have hits, so a reused
  // raster keeps whatever the previous caller left behind. That is not theoretical: the parade
  // draws three waveforms into this buffer back to back, and without the clear every panel showed
  // all three channels superimposed (owner's screenshot: red, green AND blue traces in the red
  // panel). A "reuse the buffer" optimisation has to reset it or it is not a buffer, it is a leak.
  function _cellRaster(w, h) {
    if (!_cell) { _cell = document.createElement('canvas'); _cellCtx = _cell.getContext('2d'); }
    if (_cell.width !== w || _cell.height !== h) {
      _cell.width = w; _cell.height = h;
      _cellImg = _cellCtx.createImageData(w, h);
    } else {
      _cellImg.data.fill(0);
    }
    return _cellImg;
  }

  function _accBuf(n) {
    if (!_acc || _acc.length < n) _acc = new Uint32Array(n);
    else _acc.fill(0, 0, n);
    return _acc;
  }

  // Hit-count -> brightness. LOG, because a bin can hold hundreds of hits and the display has 256
  // steps: linear mapping makes everything either invisible or solid white, which is exactly the
  // failure the old alpha-0.08 version had. `gain` is the user control every real scope exposes.
  function _density(n, peak) {
    if (!n) return 0;
    var v = (Math.log(1 + n * _gain) / Math.log(1 + peak)) * 255;
    return v > 255 ? 255 : (v | 0);
  }

  // ── the scopes ─────────────────────────────────────────────────────────────
  // Each paints its raster into _cell, blits it, then draws its graticule ON TOP with normal 2D
  // calls (a graticule is a handful of lines; it does not belong in the pixel loop).

  function _waveform(img, x, y, w, h, channel) {
    var d = img.data, LV = 256;
    var cols = w < 1 ? 1 : w | 0;
    var acc = _accBuf(cols * LV);
    var peak = 1, i, px, py;
    for (py = 0; py < AH; py++) {
      var row = py * AW * 4;
      for (px = 0; px < AW; px++) {
        i = row + px * 4;
        var v = (channel < 0) ? _luma(d[i], d[i + 1], d[i + 2]) : d[i + channel];
        var col = (px * cols / AW) | 0;
        var lv = v | 0; if (lv > 255) lv = 255; else if (lv < 0) lv = 0;
        var k = col * LV + lv;
        if (++acc[k] > peak) peak = acc[k];
      }
    }
    var raster = _cellRaster(w, h);
    var out = raster.data;
    var tint = channel < 0 ? [0.7, 1, 0.7] : (channel === 0 ? [1, 0.25, 0.25]
             : channel === 1 ? [0.25, 1, 0.25] : [0.35, 0.45, 1]);
    for (var c = 0; c < cols; c++) {
      for (var lv2 = 0; lv2 < LV; lv2++) {
        var n = acc[c * LV + lv2];
        var b = _density(n, peak);
        // level 0 at the BOTTOM: a waveform reads like the picture's brightness, not upside down
        var ry = ((LV - 1 - lv2) * h / LV) | 0;
        var o = (ry * w + c) * 4;
        if (b) {
          out[o] = (b * tint[0]) | 0; out[o + 1] = (b * tint[1]) | 0;
          out[o + 2] = (b * tint[2]) | 0; out[o + 3] = 255;
        }
      }
    }
    _cellCtx.putImageData(raster, 0, 0);
    _ctx.drawImage(_cell, x, y);
  }

  function _gratWaveform(x, y, w, h, label) {
    // Super-black and super-white SHADED, not just labelled. This is the difference between a chart
    // and an instrument: the illegal regions are visible without reading a number.
    var yOf = function (v) { return y + h - (v / 255) * h; };
    _ctx.fillStyle = 'rgba(255,60,60,0.07)';
    _ctx.fillRect(x, yOf(255), w, yOf(LEGAL.white) - yOf(255));
    _ctx.fillRect(x, yOf(LEGAL.black), w, yOf(0) - yOf(LEGAL.black));

    _ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    _ctx.lineWidth = 1;
    var steps = [0, 64, 128, 192, 255];
    for (var i = 0; i < steps.length; i++) {
      var gy = Math.round(yOf(steps[i])) + 0.5;
      _ctx.beginPath(); _ctx.moveTo(x, gy); _ctx.lineTo(x + w, gy); _ctx.stroke();
    }
    // the two lines that actually matter
    _ctx.strokeStyle = 'rgba(255,120,120,0.5)';
    [LEGAL.black, LEGAL.white].forEach(function (v) {
      var gy = Math.round(yOf(v)) + 0.5;
      _ctx.beginPath(); _ctx.moveTo(x, gy); _ctx.lineTo(x + w, gy); _ctx.stroke();
    });

    // Label the REAL scale. The old code drew "100"/"0" implying IRE over full-range 0-255 maths.
    // 235 and 16 earn their space; 255 and 0 are the frame and get dropped first. Below ~120px the
    // gap between 255 and 235 is smaller than the type, so they collide (owner's screenshot) and
    // two overlapping numbers are worse than one clear one.
    _ctx.font = '9px monospace';
    _ctx.textBaseline = 'alphabetic';
    _ctx.fillStyle = 'rgba(255,150,150,0.75)';
    _ctx.fillText('235', x + 3, yOf(LEGAL.white) - 3);
    _ctx.fillText('16', x + 3, yOf(LEGAL.black) + 9);
    if (h >= 120) {
      _ctx.fillStyle = 'rgba(255,255,255,0.30)';
      _ctx.fillText('255', x + 3, yOf(255) + 9);
      _ctx.fillText('0', x + 3, yOf(0) - 3);
    }
    if (label) _tag(label, x, y, w);
  }

  function _parade(img, x, y, w, h) {
    // Lay the three panels out on exact boundaries and let the LAST one absorb the remainder.
    // `(w/3)|0` truncates: at w=338 that is 112 each = 336, leaving a 2px strip unpainted on the
    // right and putting the drawn edges half a pixel off where anything else computes them.
    var edge = [0, Math.round(w / 3), Math.round(2 * w / 3), w];
    for (var c = 0; c < 3; c++) _waveform(img, x + edge[c], y, edge[c + 1] - edge[c], h, c);
    _ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    _ctx.lineWidth = 1;
    for (var s = 1; s < 3; s++) {
      var sx = Math.round(x + edge[s]) + 0.5;
      _ctx.beginPath(); _ctx.moveTo(sx, y); _ctx.lineTo(sx, y + h); _ctx.stroke();
    }
    for (var g = 0; g < 3; g++) _gratWaveform(x + edge[g], y, edge[g + 1] - edge[g], h, null);
    _tag('RGB PARADE', x, y, w);
  }

  function _vectorscope(img, x, y, w, h) {
    var d = img.data;
    var cx = w / 2, cy = h / 2;
    var R = Math.min(cx, cy) - 12;
    var T = _vectorTargets();
    // Scale so the FURTHEST 100% primary sits at 90% of the ring. Derived, so it stays right if the
    // colour space changes. (709 green reaches 0.596 while red only reaches 0.513: the targets are
    // NOT on a common radius, which the old uniform dist:0.75 got wrong.)
    var k = (R * 0.9) / T.maxR;

    var size = (Math.min(w, h)) | 0;
    var acc = _accBuf(size * size);
    var peak = 1, i;
    for (i = 0; i < d.length; i += 4) {
      var ch = _chroma(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      var bx = (cx + ch.cb * k) | 0;
      var by = (cy - ch.cr * k) | 0;
      if (bx < 0 || by < 0 || bx >= size || by >= size) continue;
      var kk = by * size + bx;
      if (++acc[kk] > peak) peak = acc[kk];
    }
    var raster = _cellRaster(w, h);   // comes back cleared
    var out = raster.data;
    for (var yy = 0; yy < size; yy++) {
      for (var xx = 0; xx < size; xx++) {
        var n = acc[yy * size + xx];
        if (!n) continue;
        var b = _density(n, peak);
        var o = (yy * w + xx) * 4;
        out[o] = (b * 0.7) | 0; out[o + 1] = b; out[o + 2] = (b * 0.7) | 0; out[o + 3] = 255;
      }
    }
    _cellCtx.putImageData(raster, 0, 0);
    _ctx.drawImage(_cell, x, y);

    // graticule
    var gx = x + cx, gy = y + cy;
    _ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    _ctx.lineWidth = 1;
    [1, 0.5].forEach(function (f) {
      _ctx.beginPath(); _ctx.arc(gx, gy, R * f, 0, Math.PI * 2); _ctx.stroke();
    });
    _ctx.beginPath();
    _ctx.moveTo(gx - R, gy); _ctx.lineTo(gx + R, gy);
    _ctx.moveTo(gx, gy - R); _ctx.lineTo(gx, gy + R);
    _ctx.stroke();

    // The skin-tone line, the one thing colourists actually look at here. Band + line, because the
    // "123 degrees" figure is a convention and real skin spans 116-126.
    var a1 = SKIN_LO * Math.PI / 180, a2 = SKIN_HI * Math.PI / 180;
    _ctx.fillStyle = 'rgba(255,170,120,0.10)';
    _ctx.beginPath(); _ctx.moveTo(gx, gy);
    _ctx.arc(gx, gy, R, -a2, -a1); _ctx.closePath(); _ctx.fill();
    var sa = SKIN_ANGLE * Math.PI / 180;
    _ctx.strokeStyle = 'rgba(255,170,120,0.75)';
    _ctx.setLineDash([4, 3]);
    _ctx.beginPath(); _ctx.moveTo(gx, gy);
    _ctx.lineTo(gx + Math.cos(sa) * R, gy - Math.sin(sa) * R); _ctx.stroke();
    _ctx.setLineDash([]);

    // 75% and 100% target boxes. Real boxes with tolerance, not the old 4x4 dots: you aim INSIDE a
    // box. 75% is the one colour bars land on, so it is the emphasised pair.
    T.list.forEach(function (t) {
      [[t.c75, 5, 0.85], [t.c100, 3.5, 0.35]].forEach(function (pair) {
        var c = pair[0], s = pair[1];
        var tx = gx + c.cb * k, ty = gy - c.cr * k;
        _ctx.strokeStyle = 'rgba(255,255,255,' + pair[2] + ')';
        _ctx.lineWidth = 1;
        _ctx.strokeRect(tx - s, ty - s, s * 2, s * 2);
      });
      var lx = gx + t.c75.cb * k, ly = gy - t.c75.cr * k;
      _ctx.fillStyle = 'rgba(255,255,255,0.55)';
      _ctx.font = '8px monospace';
      _ctx.fillText(t.label, lx + 7, ly + 3);
    });

    _tag('VECTORSCOPE ' + CS.name, x, y, w);
  }

  function _histogram(img, x, y, w, h) {
    var d = img.data;
    var hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    var i;
    for (i = 0; i < d.length; i += 4) {
      hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++;
      var l = _luma(d[i], d[i + 1], d[i + 2]) | 0;
      hist[3][l > 255 ? 255 : l]++;
    }
    // THE BUG THIS FIXES: the old normalisation scanned R/G/B only and EXCLUDED the luma bins, so
    // whenever the luma peak beat every RGB peak the overlay line was drawn off the top of the
    // canvas. Include every series you intend to draw.
    var max = 1;
    for (var s = 0; s < 4; s++) for (i = 0; i < 256; i++) if (hist[s][i] > max) max = hist[s][i];

    _ctx.fillStyle = BG; _ctx.fillRect(x, y, w, h);
    var bw = w / 256;
    ['rgba(255,60,60,0.45)', 'rgba(60,255,60,0.45)', 'rgba(90,110,255,0.45)'].forEach(function (col, c) {
      _ctx.fillStyle = col;
      for (var b = 0; b < 256; b++) {
        var bh = (hist[c][b] / max) * h;
        if (bh > 0) _ctx.fillRect(x + b * bw, y + h - bh, bw > 1 ? bw : 1, bh);
      }
    });
    _ctx.strokeStyle = 'rgba(255,255,255,0.6)'; _ctx.lineWidth = 1;
    _ctx.beginPath();
    for (var b2 = 0; b2 < 256; b2++) {
      var ly = y + h - (hist[3][b2] / max) * h;
      if (b2 === 0) _ctx.moveTo(x, ly); else _ctx.lineTo(x + b2 * bw, ly);
    }
    _ctx.stroke();

    _ctx.strokeStyle = 'rgba(255,120,120,0.45)';
    [LEGAL.black, LEGAL.white].forEach(function (v) {
      var vx = Math.round(x + (v / 255) * w) + 0.5;
      _ctx.beginPath(); _ctx.moveTo(vx, y); _ctx.lineTo(vx, y + h); _ctx.stroke();
    });
    _tag('HISTOGRAM', x, y, w);
  }

  // CIE 1931 xy. Resolve's fifth scope, and the one that shows GAMUT rather than levels: it answers
  // "is this colour reachable in the delivery space", which no other scope can.
  var CIE_PRIM = { r: [0.640, 0.330], g: [0.300, 0.600], b: [0.150, 0.060] };   // Rec.709 primaries
  function _cie(img, x, y, w, h) {
    var d = img.data;
    var m = Math.min(w, h) - 16;
    var ox = x + (w - m) / 2, oy = y + (h - m) / 2;
    var X2 = function (cx) { return ox + cx * m / 0.8; };
    var Y2 = function (cy) { return oy + m - cy * m / 0.9; };

    _ctx.fillStyle = BG; _ctx.fillRect(x, y, w, h);
    // gamut triangle first, so the plot sits on top of it
    _ctx.strokeStyle = 'rgba(255,255,255,0.35)'; _ctx.lineWidth = 1;
    _ctx.beginPath();
    _ctx.moveTo(X2(CIE_PRIM.r[0]), Y2(CIE_PRIM.r[1]));
    _ctx.lineTo(X2(CIE_PRIM.g[0]), Y2(CIE_PRIM.g[1]));
    _ctx.lineTo(X2(CIE_PRIM.b[0]), Y2(CIE_PRIM.b[1]));
    _ctx.closePath(); _ctx.stroke();

    for (var i = 0; i < d.length; i += 4) {
      // sRGB -> linear -> CIE XYZ (Rec.709 matrix) -> xy
      var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      r = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
      g = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
      b = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
      var X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
      var Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      var Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
      var sum = X + Y + Z;
      if (sum <= 0) continue;
      _ctx.fillStyle = 'rgba(160,255,180,0.05)';
      _ctx.fillRect(X2(X / sum), Y2(Y / sum), 1, 1);
    }
    _tag('CIE 1931 · ' + CS.name, x, y, w);
  }

  // ── the draw entry ─────────────────────────────────────────────────────────
  function _one(mode, img, x, y, w, h) {
    _ctx.fillStyle = BG; _ctx.fillRect(x, y, w, h);
    if (mode === 'waveform') { _waveform(img, x, y, w, h, -1); _gratWaveform(x, y, w, h, 'WAVEFORM'); }
    else if (mode === 'parade') _parade(img, x, y, w, h);
    else if (mode === 'vectorscope') _vectorscope(img, x, y, w, h);
    else if (mode === 'histogram') _histogram(img, x, y, w, h);
    else if (mode === 'cie') _cie(img, x, y, w, h);
  }

  VEA.updateScopes = function (sourceCanvas) {
    if (!VEA._scopeVisible || !_ctx || !sourceCanvas) return false;
    var img = _sample(sourceCanvas);
    if (!img) return false;
    var W = _cvs.width, H = _cvs.height;
    _ctx.fillStyle = BG; _ctx.fillRect(0, 0, W, H);

    if (_layout === 1) { _one(VEA._scopeMode, img, 0, 0, W, H); }
    else {
      // 2-up and 4-up show the FIRST n modes in MODES order, which is the order a colourist works
      // in: exposure (waveform) -> channels (parade) -> hue (vectorscope) -> distribution.
      var n = _layout, cols = n === 2 ? 2 : 2, rows = n === 2 ? 1 : 2;
      var cw = (W / cols) | 0, chh = (H / rows) | 0;
      for (var i = 0; i < n; i++) {
        var m = MODES[i] ? MODES[i].id : 'waveform';
        _one(m, img, (i % cols) * cw, ((i / cols) | 0) * chh, cw, chh);
      }
      _ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      _ctx.lineWidth = 1;
      _ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
      for (var c = 1; c < cols; c++) { _ctx.beginPath(); _ctx.moveTo(c * cw + 0.5, 0); _ctx.lineTo(c * cw + 0.5, H); _ctx.stroke(); }
      for (var r2 = 1; r2 < rows; r2++) { _ctx.beginPath(); _ctx.moveTo(0, r2 * chh + 0.5); _ctx.lineTo(W, r2 * chh + 0.5); _ctx.stroke(); }
    }
    return true;
  };

  VEA.setScopeMode = function (mode) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === mode) { VEA._scopeMode = mode; _sync(); _tickOnce(); return true; }
    return false;
  };
  VEA.setScopeLayout = function (n) { _layout = (n === 2 || n === 4) ? n : 1; _sync(); _tickOnce(); };
  VEA.setScopeGain = function (g) { _gain = Math.min(Math.max(+g || 1, 0.25), 8); _sync(); _tickOnce(); };

  // ── panel ──────────────────────────────────────────────────────────────────
  function _sync() {
    if (!_p) return;
    Array.prototype.forEach.call(_p.querySelectorAll('[data-mode]'), function (b) {
      b.classList.toggle('is-on', b.dataset.mode === VEA._scopeMode);
      b.disabled = _layout > 1;    // in 2/4-up the modes are fixed by the grid; a dead control would lie
    });
    Array.prototype.forEach.call(_p.querySelectorAll('[data-lay]'), function (b) {
      b.classList.toggle('is-on', Number(b.dataset.lay) === _layout);
    });
    var g = _p.querySelector('#ve-scope-gain');
    if (g && Number(g.value) !== _gain) g.value = _gain;
    var gv = _p.querySelector('#ve-scope-gainv');
    if (gv) gv.textContent = _gain.toFixed(2) + 'x';
  }

  function _resizeCanvas() {
    if (!_cvs || !_p) return;
    var host = _p.querySelector('.ve-scope-body');
    if (!host) return;
    var w = Math.max(160, host.clientWidth), h = Math.max(120, host.clientHeight);
    if (_cvs.width !== w || _cvs.height !== h) { _cvs.width = w; _cvs.height = h; }
    _cvs.style.width = w + 'px'; _cvs.style.height = h + 'px';
  }

  function _savePos() {
    if (!_p || _p.classList.contains('is-popped')) return;
    try {
      localStorage.setItem(GEOM_KEY, JSON.stringify({
        l: parseInt(_p.style.left, 10) || 0, t: parseInt(_p.style.top, 10) || 0,
        w: _p.offsetWidth, h: _p.offsetHeight
      }));
    } catch (e) {}
  }
  function _restorePos() {
    var g = null;
    try { g = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null'); } catch (e) {}
    if (!g || !(g.w > 180) || !(g.h > 140)) return false;
    _p.style.width = Math.min(g.w, window.innerWidth - 16) + 'px';
    _p.style.height = Math.min(g.h, window.innerHeight - 16) + 'px';
    _p.style.left = Math.max(0, Math.min(window.innerWidth - 120, g.l)) + 'px';
    _p.style.top = Math.max(0, Math.min(window.innerHeight - 60, g.t)) + 'px';
    return true;
  }
  function _center() {
    var w = _p.offsetWidth || 340, h = _p.offsetHeight || 320;
    _p.style.left = Math.max(8, window.innerWidth - w - 24) + 'px';
    _p.style.top = Math.max(8, window.innerHeight - h - 120) + 'px';
  }

  function _initDrag() {
    var head = _p.querySelector('.ve-scope-head');
    head.addEventListener('mousedown', function (e) {
      if (_p.classList.contains('is-popped')) return;
      if (e.target.closest('button, input, select')) return;
      var sx = e.clientX, sy = e.clientY;
      var sl = parseInt(_p.style.left, 10) || 0, st = parseInt(_p.style.top, 10) || 0;
      function mv(ev) {
        _p.style.left = Math.max(0, Math.min(window.innerWidth - 80, sl + ev.clientX - sx)) + 'px';
        _p.style.top = Math.max(0, Math.min(window.innerHeight - 40, st + ev.clientY - sy)) + 'px';
      }
      function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); _savePos(); }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    });
    // ResizeObserver measured 0 callbacks on the multicam monitor's CSS resize grip; mouseup is
    // what actually fires. Same grip, same fix.
    _p.addEventListener('mouseup', function () { _resizeCanvas(); _savePos(); _tickOnce(); });
  }

  function _rafWin() { return (_win && !_win.closed) ? _win : window; }

  function _syncPopBtn() {
    var b = _p && _p.querySelector('#ve-scope-pop');
    if (!b) return;
    var out = !!(_win && !_win.closed);
    b.innerHTML = _icon(out ? 'minimize-2' : 'external-link', 13);
    b.title = out ? 'Dock to this window' : 'Open in separate window (dual monitor)';
  }

  function _popOut() {
    if (_win && !_win.closed) { _win.focus(); return; }
    var w = window.open('', 'ccScopes', 'width=520,height=560,menubar=no,toolbar=no,location=no');
    if (!w) return;
    var d = w.document;
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>Video Scopes</title></head><body></body></html>');
    d.close();
    Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"], style'),
      function (n) { try { d.head.appendChild(n.cloneNode(true)); } catch (e) {} });
    d.body.style.cssText = 'margin:0;padding:0;background:#1b1b1f;overflow:hidden;';
    _savePos();
    _p.classList.add('is-popped');
    // Inline geometry beats the class rule, so it MUST be stripped or .is-popped's fill-the-window
    // never applies and the panel sits in the corner at its old size.
    _p.style.width = ''; _p.style.height = ''; _p.style.left = ''; _p.style.top = '';
    d.body.appendChild(d.adoptNode(_p));
    w.addEventListener('beforeunload', function () { _popIn(); });
    w.addEventListener('resize', function () { _resizeCanvas(); _tickOnce(); });
    _win = w;
    _syncPopBtn();
    setTimeout(function () { _resizeCanvas(); _restartLoop(); }, 60);
  }

  function _popIn() {
    if (!_p) return;
    _win = null;
    _p.classList.remove('is-popped');
    document.body.appendChild(document.adoptNode(_p));
    if (!_restorePos()) _center();
    _syncPopBtn();
    _resizeCanvas();
    _restartLoop();
  }

  function _build() {
    if (_p) return;
    _p = document.createElement('div');
    _p.className = 've-scope';
    _p.id = 've-scope-panel';
    var modeBtns = MODES.map(function (m) {
      return '<button class="ve-scope-tab" data-mode="' + m.id + '">' + m.name + '</button>';
    }).join('');
    _p.innerHTML =
      '<div class="ve-scope-head">' +
        '<span class="ve-scope-title">' + _icon('activity', 13) + 'Video Scopes</span>' +
        '<div class="ve-scope-head-r">' +
          '<button class="ve-scope-icon" id="ve-scope-pop"></button>' +
          '<button class="ve-scope-icon" id="ve-scope-close">' + _icon('x', 14) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ve-scope-bar">' + modeBtns + '</div>' +
      '<div class="ve-scope-body"><canvas id="ve-scope-cvs"></canvas></div>' +
      '<div class="ve-scope-foot">' +
        '<div class="ve-scope-lays">' +
          '<button class="ve-scope-lay" data-lay="1" title="Single">1</button>' +
          '<button class="ve-scope-lay" data-lay="2" title="Dual">2</button>' +
          '<button class="ve-scope-lay" data-lay="4" title="Quad">4</button>' +
        '</div>' +
        '<label class="ve-scope-gain" title="Intensity gain">' +
          _icon('sun', 11) +
          '<input type="range" id="ve-scope-gain" min="0.25" max="8" step="0.25" value="1">' +
          '<b id="ve-scope-gainv">1.00x</b>' +
        '</label>' +
      '</div>' +
      '<i class="ve-scope-grip"></i>';
    document.body.appendChild(_p);
    _cvs = _p.querySelector('#ve-scope-cvs');
    _ctx = _cvs.getContext('2d');

    _p.querySelector('#ve-scope-close').addEventListener('click', function () { VEA.hideScopes(); });
    _p.querySelector('#ve-scope-pop').addEventListener('click', function () {
      (_win && !_win.closed) ? _popIn() : _popOut();
    });
    _p.querySelector('.ve-scope-bar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (b && !b.disabled) VEA.setScopeMode(b.dataset.mode);
    });
    _p.querySelector('.ve-scope-lays').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lay]');
      if (b) VEA.setScopeLayout(Number(b.dataset.lay));
    });
    _p.querySelector('#ve-scope-gain').addEventListener('input', function (e) {
      VEA.setScopeGain(Number(e.target.value));
    });
    _initDrag();
    _syncPopBtn();
  }

  // ── the loop ───────────────────────────────────────────────────────────────
  // P0 measured the work at 3.29ms/frame at 480x270, so 30fps is affordable. Scopes do not need
  // 60: the eye cannot use it and it would double the cost for nothing.
  function _src() {
    var VE = _VE();
    return (VE && VE._veUi && VE._veUi.previewCanvas) || null;
  }
  function _tickOnce() { if (VEA._scopeVisible) VEA.updateScopes(_src()); }

  function _loop(ts) {
    if (!VEA._scopeVisible) { _raf = null; return; }
    if (!_last || ts - _last >= _interval) { _last = ts; VEA.updateScopes(_src()); }
    _raf = _rafWin().requestAnimationFrame(_loop);
  }
  function _restartLoop() {
    if (_raf) { try { _rafWin().cancelAnimationFrame(_raf); } catch (e) {} _raf = null; }
    if (!VEA._scopeVisible) return;
    _last = 0;
    _raf = _rafWin().requestAnimationFrame(_loop);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────
  // No initScopes: the panel builds on first show. The old one allocated a canvas at boot for a
  // panel that could never paint, and a boot-time stub that does nothing is the same class of
  // ghost as a function nobody calls.
  VEA.showScopes = function () {
    _build();
    _p.style.display = 'flex';
    if (!_p.classList.contains('is-popped') && !_restorePos()) _center();
    VEA._scopeVisible = true;
    _resizeCanvas();
    _sync();
    _restartLoop();
    _tickOnce();
  };

  VEA.hideScopes = function () {
    VEA._scopeVisible = false;
    if (_raf) { try { _rafWin().cancelAnimationFrame(_raf); } catch (e) {} _raf = null; }
    if (_win && !_win.closed) { _popIn(); try { _win.close(); } catch (e) {} _win = null; }
    if (_p) _p.style.display = 'none';
  };

  VEA.toggleScopes = function () { VEA._scopeVisible ? VEA.hideScopes() : VEA.showScopes(); };

  // exposed for tests + P1's colour-bar verification
  VEA._scopeInternals = function () {
    return { CS: CS, LEGAL: LEGAL, SKIN: { angle: SKIN_ANGLE, lo: SKIN_LO, hi: SKIN_HI },
             MODES: MODES, AW: AW, AH: AH,
             chroma: _chroma, luma: _luma, targets: _vectorTargets,
             canvas: function () { return _cvs; }, panel: function () { return _p; },
             layout: function () { return _layout; }, gain: function () { return _gain; },
             interval: function () { return _interval; },
             sample: _sample, isOpen: function () { return !!VEA._scopeVisible; },
             rafId: function () { return _raf; } };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'scopes', parent: 'video.ve-advanced-features', title: 've-advanced-features: scopes', mount: function () {}, unmount: function () {} });
  }
})();
