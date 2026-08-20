/* Module: video/video-editor/preview-render — PREVIEW RENDER — the frame compositor: filters, pixel effects, overlay sync/transition.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veRenderWaveform = function () {
    if (!VE._veUi.waveformCtx || !VE._veUi.waveformBar) return;
    if (VE._veUi.waveformBar.style.display === 'none') return;
    if (!window.VEAudioEngine) return;

    // Resize canvas to match actual container width (100%)
    var realW = VE._veUi.waveformCanvas.clientWidth || VE._veUi.waveformCanvas.offsetWidth;
    if (realW > 0 && VE._veUi.waveformCanvas.width !== realW) {
      VE._veUi.waveformCanvas.width = realW;
    }

    var ctx = VE._veUi.waveformCtx;
    var w = VE._veUi.waveformCanvas.width;
    var h = VE._veUi.waveformCanvas.height;
    ctx.clearRect(0, 0, w, h);

    if (VE._veUi.waveformMode === 'spectrum') {
      var freqData = VEAudioEngine.getFrequencyData();
      if (!freqData) return;
      var bins = freqData.length;
      // Linear FFT bins pack nearly all audible energy into the lower third,
      // so a 1:1 bin->x mapping only paints the left ~60-70% of the strip.
      // Map output bars onto a LOG frequency scale so the spectrum spreads
      // across the full width (the standard musical-spectrum look).
      var outBars = Math.max(32, Math.floor(w / 4));
      var barW = w / outBars;
      var minBin = 1; // skip DC bin
      var ratio = bins / minBin;
      for (var i = 0; i < outBars; i++) {
        // log-spaced bin range covered by this output bar
        var b0 = Math.floor(minBin * Math.pow(ratio, i / outBars));
        var b1 = Math.floor(minBin * Math.pow(ratio, (i + 1) / outBars));
        if (b1 <= b0) b1 = b0 + 1;
        if (b1 > bins) b1 = bins;
        var peak = 0;
        for (var b = b0; b < b1; b++) { if (freqData[b] > peak) peak = freqData[b]; }
        var val = peak / 255;
        var barH = val * h;
        // Gradient: low = cyan, mid = gold, high = pink
        var hue = 180 - (i / outBars) * 180;
        ctx.fillStyle = 'hsl(' + hue + ', 80%, 60%)';
        ctx.fillRect(i * barW, h - barH, barW - 1, barH);
      }
    } else {
      // Waveform mode
      var timeData = VEAudioEngine.getTimeDomainData();
      if (!timeData) return;
      ctx.strokeStyle = '#f2ff58';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      var sliceW = w / timeData.length;
      for (var j = 0; j < timeData.length; j++) {
        var v = timeData[j] / 128.0;
        var y = (v * h) / 2;
        if (j === 0) ctx.moveTo(0, y);
        else ctx.lineTo(j * sliceW, y);
      }
      ctx.stroke();
    }
  };

  VE._veBuildFilterString = function (filters) {
    if (!filters) return 'none';
    var parts = [];
    if (filters.brightness != null) parts.push('brightness(' + filters.brightness + '%)');
    if (filters.contrast != null)   parts.push('contrast(' + filters.contrast + '%)');
    if (filters.saturation != null) parts.push('saturate(' + filters.saturation + '%)');
    if (filters.hue != null)        parts.push('hue-rotate(' + filters.hue + 'deg)');
    if (filters.blur != null && filters.blur > 0) parts.push('blur(' + filters.blur + 'px)');
    if (filters.sepia != null && filters.sepia > 0) parts.push('sepia(' + filters.sepia + '%)');
    if (filters.invert != null && filters.invert > 0) parts.push('invert(' + filters.invert + '%)');
    if (filters.grayscale != null && filters.grayscale > 0) parts.push('grayscale(' + filters.grayscale + '%)');
    return parts.length ? parts.join(' ') : 'none';
  };

  VE._veFitRect = function (srcW, srcH, destW, destH, mode) {
    if (mode === 'stretch') return { x: 0, y: 0, w: destW, h: destH };
    var srcRatio = srcW / srcH;
    var destRatio = destW / destH;
    var w, h;
    if (mode === 'contain') {
      if (srcRatio > destRatio) { w = destW; h = destW / srcRatio; }
      else { h = destH; w = destH * srcRatio; }
    } else { // cover
      if (srcRatio > destRatio) { h = destH; w = destH * srcRatio; }
      else { w = destW; h = destW / srcRatio; }
    }
    return { x: (destW - w) / 2, y: (destH - h) / 2, w: w, h: h };
  };

  VE._veLoopLocalTime = function (localTime, clip, videoEl) {
    if (!clip || clip.type !== 'video') return localTime;
    var srcDur = clip._srcDuration || (videoEl && isFinite(videoEl.duration) ? videoEl.duration : 0) || 0;
    if (!srcDur || !isFinite(srcDur) || srcDur <= 0) return localTime;
    // Lazily backfill _srcDuration if it was missing
    if (!clip._srcDuration && srcDur > 0) clip._srcDuration = srcDur;
    if (localTime <= srcDur) return localTime;
    // Wrap: loop back to trimStart
    var loopStart = clip.trimStart || 0;
    var loopLen = srcDur - loopStart;
    if (loopLen <= 0) return localTime;
    return loopStart + ((localTime - loopStart) % loopLen);
  };

  VE._veApplyPixelEffects = function (targetCtx, clip, w, h) {
    if (!clip.effects || !clip.effects.length) return;
    for (var ei = 0; ei < clip.effects.length; ei++) {
      var eff = clip.effects[ei];
      if (!eff.enabled) continue;

      if (eff.id === 'sharpen') {
        // Unsharp mask: 3x3 sharpen kernel
        var amt = (eff.params && eff.params.amount != null) ? eff.params.amount / 100 : 0.5;
        try {
          var imgData = targetCtx.getImageData(0, 0, w, h);
          var d = imgData.data;
          var copy = new Uint8ClampedArray(d);
          for (var y = 1; y < h - 1; y++) {
            for (var x = 1; x < w - 1; x++) {
              var idx = (y * w + x) * 4;
              for (var ch = 0; ch < 3; ch++) {
                var center = 5 * copy[idx + ch]
                  - copy[((y - 1) * w + x) * 4 + ch]
                  - copy[((y + 1) * w + x) * 4 + ch]
                  - copy[(y * w + x - 1) * 4 + ch]
                  - copy[(y * w + x + 1) * 4 + ch];
                d[idx + ch] = Math.min(255, Math.max(0, Math.round(copy[idx + ch] + (center - copy[idx + ch]) * amt)));
              }
            }
          }
          targetCtx.putImageData(imgData, 0, 0);
        } catch (e) { /* security error on tainted canvas */ }
      }

      if (eff.id === 'pixelate-fx') {
        var blockSize = (eff.params && eff.params.size) || 8;
        try {
          // Downscale then upscale
          var smallW = Math.max(1, Math.ceil(w / blockSize));
          var smallH = Math.max(1, Math.ceil(h / blockSize));
          targetCtx.imageSmoothingEnabled = false;
          var tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = smallW; tmpCanvas.height = smallH;
          var tmpCtx = tmpCanvas.getContext('2d');
          tmpCtx.drawImage(targetCtx.canvas, 0, 0, smallW, smallH);
          targetCtx.clearRect(0, 0, w, h);
          targetCtx.drawImage(tmpCanvas, 0, 0, w, h);
          targetCtx.imageSmoothingEnabled = true;
        } catch (e) { /* */ }
      }

      if (eff.id === 'glitch-fx') {
        var intensity = (eff.params && eff.params.intensity) || 0.3;
        try {
          var imgD = targetCtx.getImageData(0, 0, w, h);
          var data = imgD.data;
          var sliceCount = Math.floor(5 + intensity * 15);
          for (var si = 0; si < sliceCount; si++) {
            var sliceY = Math.floor(Math.random() * h);
            var sliceH = Math.floor(2 + Math.random() * (h * 0.05));
            var offset = Math.floor((Math.random() - 0.5) * w * intensity * 0.3) * 4;
            for (var gy = sliceY; gy < Math.min(sliceY + sliceH, h); gy++) {
              var rowStart = gy * w * 4;
              for (var gx = 0; gx < w * 4; gx += 4) {
                var srcIdx = rowStart + gx;
                var dstIdx = srcIdx + offset;
                if (dstIdx >= rowStart && dstIdx < rowStart + w * 4 - 3) {
                  // Shift red channel
                  data[dstIdx] = data[srcIdx];
                }
              }
            }
          }
          targetCtx.putImageData(imgD, 0, 0);
        } catch (e) { /* */ }
      }

      if (eff.id === 'motion-blur') {
        var angle = (eff.params && eff.params.angle) || 0;
        var dist = (eff.params && eff.params.distance) || 10;
        try {
          var radians = angle * Math.PI / 180;
          var dx = Math.cos(radians) * dist;
          var dy = Math.sin(radians) * dist;
          var steps = Math.min(dist, 8);
          var saved = targetCtx.getImageData(0, 0, w, h);
          targetCtx.globalAlpha = 1 / (steps + 1);
          for (var ms = 1; ms <= steps; ms++) {
            var frac = ms / steps;
            targetCtx.drawImage(targetCtx.canvas, dx * frac, dy * frac);
          }
          targetCtx.globalAlpha = 1;
        } catch (e) { /* */ }
      }
    }
  };

  // Build a 2D-context gradient from a stored backdrop gradient definition
  // ({type:'linear'|'radial', angle, stops:[{offset:0-100, color}]}).
  function _veBuildBackdropGradient(ctx, def, w, h) {
    try {
      var stops = def.stops.slice().sort(function (a, b) { return a.offset - b.offset; });
      var grad;
      if (def.type === 'radial') {
        grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
      } else {
        var ang = ((def.angle != null ? def.angle : 90) - 90) * Math.PI / 180;
        var cx = w / 2, cy = h / 2, len = Math.max(w, h) / 2;
        grad = ctx.createLinearGradient(cx - Math.cos(ang) * len, cy - Math.sin(ang) * len, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      }
      for (var i = 0; i < stops.length; i++) grad.addColorStop(Math.max(0, Math.min(1, stops[i].offset / 100)), stops[i].color);
      return grad;
    } catch (e) { return null; }
  }

  // Paint the canvas backdrop (behind all clips): image > gradient > solid.
  VE._veDrawBackdrop = function (ctx, w, h) {
    var proj = VE._veProject;
    if (proj.bgImage) {
      var el = VE._veBgImgEl;
      if (!el || el._ccSrc !== proj.bgImage) {
        el = new Image(); el._ccSrc = proj.bgImage;
        el.onload = function () { if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame(); };
        el.src = proj.bgImage; VE._veBgImgEl = el;
      }
      if (el.complete && el.naturalWidth) {
        var s = Math.max(w / el.naturalWidth, h / el.naturalHeight);
        var dw = el.naturalWidth * s, dh = el.naturalHeight * s;
        ctx.fillStyle = proj.bgColor || '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
        return;
      }
      // not decoded yet - fall through to solid so the frame is not empty
    }
    if (proj.bgGradient && proj.bgGradient.stops && proj.bgGradient.stops.length) {
      var g = _veBuildBackdropGradient(ctx, proj.bgGradient, w, h);
      if (g) { ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); return; }
    }
    ctx.fillStyle = proj.bgColor || '#000000';
    ctx.fillRect(0, 0, w, h);
  };

  // Resolve clip.crop (normalized 0-1 in SOURCE space) to source pixels, or null when absent.
  // Defensive: a hand-edited or half-written project can carry garbage, and a NaN here would
  // silently blank the frame rather than throw.
  VE._veCropRect = function (clip, mw, mh, override) {
    var c = override || (clip && clip.crop);
    if (!c) return null;
    var x = +c.x, y = +c.y, w = +c.w, h = +c.h;
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
    if (w <= 0 || h <= 0) return null;
    x = Math.min(Math.max(x, 0), 1); y = Math.min(Math.max(y, 0), 1);
    w = Math.min(w, 1 - x); h = Math.min(h, 1 - y);
    if (w <= 0 || h <= 0) return null;
    var sx = x * mw, sy = y * mh, sw = w * mw, sh = h * mh;
    if (sw < 1 || sh < 1) return null;
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  };

  // One draw for the background path's several branches. `fit` already carries the bg Transform
  // (scale/offset/flip), so the crop only ever selects the SOURCE rect and never touches the
  // destination: the two must stay independent or Transform would fight the crop.
  function _bgDraw(target, src, crop, fit) {
    if (crop) target.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, fit.x, fit.y, fit.w, fit.h);
    else target.drawImage(src, fit.x, fit.y, fit.w, fit.h);
  }

  // SmartCam layout: N crop regions of ONE source COMPOSITED into one frame at the same time.
  // This is the Opus Clip "Split" shape and it is NOT multicam: multicam CUTS between angles
  // (one visible at a time), SmartCam STACKS them (all visible at once). A 16:9 podcast with two
  // people becomes a 9:16 story with speaker A above speaker B, 50/50.
  //
  //   clip.scLayout = { mode:'grid', rows:[ { share, cells:[ {crop, label, share} ] } ] }
  //
  // ROWS AND CELLS, not one axis. A single axis cannot express "2 üst, 2 alt", and the owner wants
  // to choose the split: *"yatay modda ben ekranı 4 bölmek isterim, 2 üst 2 alt. Sen hep yatay
  // konumlandırıyorsun. Bana seçenek ver."* So: a layout is a list of ROWS (each with a height
  // share), and each row is a list of CELLS (each with a width share within that row). Every
  // arrangement falls out of that one shape:
  //   [[1],[1]]      2 rows of 1   -> top / bottom
  //   [[1,1]]        1 row of 2    -> left / right
  //   [[1,1],[1,1]]  2 rows of 2   -> 2x2 grid
  //   [[1],[1,1]]    uneven        -> 1 on top, 2 below
  //
  // Flattened here into output-space fractions so the compositor never learns about rows at all.
  VE._veScBands = function (clip) {
    var L = clip && clip.scLayout;
    if (!L) return null;
    var rows = L.rows;
    // Back-compat: the first cut carried a flat `cells` array plus mode stack-v/stack-h.
    if (!rows && L.cells && L.cells.length) {
      rows = (L.mode === 'stack-h')
        ? [{ share: 1, cells: L.cells }]
        : L.cells.map(function (c) { return { share: c.share, cells: [c] }; });
    }
    if (!rows || !rows.length) return null;

    var out = [], rSum = 0, i, j;
    for (i = 0; i < rows.length; i++) {
      var rs = +rows[i].share;
      if (!isFinite(rs) || rs <= 0) rs = 1 / rows.length;
      rSum += rs;
    }
    if (rSum <= 0) return null;

    var fy = 0;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = row.cells || [];
      var rShare = (+row.share > 0 && isFinite(+row.share)) ? +row.share / rSum : (1 / rows.length);
      var fh = (i === rows.length - 1) ? (1 - fy) : rShare;   // last row absorbs rounding
      var cSum = 0;
      for (j = 0; j < cells.length; j++) {
        var cs = +cells[j].share;
        cSum += (isFinite(cs) && cs > 0) ? cs : (1 / cells.length);
      }
      var fx = 0;
      for (j = 0; j < cells.length; j++) {
        if (!cells[j] || !cells[j].crop) continue;
        var w = (+cells[j].share > 0 && isFinite(+cells[j].share) && cSum > 0)
          ? (+cells[j].share / cSum) : (1 / cells.length);
        var fw = (j === cells.length - 1) ? (1 - fx) : w;
        out.push({ crop: cells[j].crop, fx: fx, fy: fy, fw: fw, fh: fh });
        fx += fw;
      }
      fy += fh;
    }
    return out.length ? out : null;
  };

  // Draw a clip's frame fitted to the canvas by clip.fit (cover/contain/stretch).
  // Default cover; the old draw always stretched (distorted mismatched aspects).
  // clip.crop, when present, selects a sub-rect of the SOURCE. clip.scLayout composites N of them.
  // The fit is computed from the CROP's dimensions, not the media's: an aspect-locked crop hits
  // _veFitRect's equal-ratio case and fills its band exactly (measured worst error 4.5e-13 px
  // across 1200 cases, docs/smartcam-plan.md S0.1).
  /* POWER WINDOWS: resolve each window from SOURCE space into the frame UV space the shader samples.

     Windows are stored normalized against the MEDIA, not the frame, so a window stays stuck to the
     footage: re-crop, change the fit, or pan, and the window follows the face it was drawn around
     instead of sliding off it. That is the whole reason for this transform. The mapping is
     source-normalized -> media px -> crop-relative -> frame px -> frame UV, which composes to a
     plain affine per axis.

     Returns null (not an empty array) when there is nothing to do, so the caller's gate stays a
     simple truthiness check. */
  /* MATTE VIEW (Resolve's Shift+H), built out of the grader rather than a second code path.

     The window shader does mix(original, graded, mask), so outside a window you see the FOOTAGE.
     That is not a matte view: a matte is white-on-black. Rather than add a shader branch, crush the
     whole frame to black and lift every window to white, and the existing mix() becomes
     mix(black, white, mask) = the mask itself, exactly. `outBlack === outWhite` maps every input
     level to one output level, so these two are a true constant black and a true constant white.

     Both are substituted at RESOLVE time and never written to the clip, so nothing reaches a saved
     project file. */
  var MATTE_BASE  = { enabled: true, levels: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0,   outWhite: 0   } };
  var MATTE_GRADE = { enabled: true, levels: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 255, outWhite: 255 } };

  /* The source->frame affine itself, exposed because the editing UI needs to run it BACKWARDS: the
     user drags a box in frame space and we must store where that lands on the footage. Both
     directions must come from one place or a dragged window would drift from the rendered one. */
  VE._vePwAffine = function (clip, el, w, h) {
    if (!clip || !el || !w || !h) return null;
    // SmartCam composites N cropped cells into one frame, so "the" source rect does not exist and a
    // single affine cannot describe it. Windows on a SmartCam clip are a P5 question, not a silent
    // wrong answer.
    if (VE._veScBands && VE._veScBands(clip)) return null;

    var cf = clip.fit || 'cover';
    var mw = el.videoWidth || el.naturalWidth || clip._mediaWidth || w;
    var mh = el.videoHeight || el.naturalHeight || clip._mediaHeight || h;
    if (!mw || !mh) return null;

    var cr = VE._veCropRect(clip, mw, mh) || { sx: 0, sy: 0, sw: mw, sh: mh };
    if (!cr.sw || !cr.sh) return null;
    var dst = (cf === 'stretch') ? { x: 0, y: 0, w: w, h: h } : VE._veFitRect(cr.sw, cr.sh, w, h, cf);

    // frameU = geomX * ax + bx, frameV = geomY * ay + by  (both in 0..1, y counting DOWN)
    return {
      ax: (mw * dst.w / cr.sw) / w,
      bx: (dst.x - cr.sx * dst.w / cr.sw) / w,
      ay: (mh * dst.h / cr.sh) / h,
      by: (dst.y - cr.sy * dst.h / cr.sh) / h
    };
  };

  /* RASTERISE a path window into a matte. Rect and ellipse are computed in the shader (exact, no
     upload); a pen / polygon / curve window has no closed form, so its shape is filled here.

     `geom.d` is SVG path data in SOURCE-normalized units (0..1 of the media), which is why it is
     drawn through the same affine as everything else: the mask lands on the same pixels the shape
     was drawn around, and survives a re-crop.

     The feather is ctx.filter blur, not a shader pass: it runs ONCE per geometry change (the result
     is cached by key in webgl.js), whereas a shader blur would run every frame for a mask that is
     not moving. Blurring a hard fill IS the falloff.

     Cached by the caller's key, so dragging a window re-rasterises and merely watching it does not. */
  // NOT initialising VE._vePwMatte here: it is VEPowerWindows' view flag, and a load-time
  // assignment in this file would clear it if this module happened to load second.
  var _matteCv = null, _matteCtx = null;

  // Bbox centre of SVG path data (source-normalized). Control points included: for a scale pivot,
  // "roughly the middle of the drawn shape" is exactly right.
  VE._veDBboxCenter = function (d) {
    var nums = (String(d).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (var i = 0; i + 1 < nums.length; i += 2) {
      var x = nums[i], y = nums[i + 1];
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    if (minx > maxx) return [0.5, 0.5];
    return [(minx + maxx) / 2, (miny + maxy) / 2];
  };

  VE._vePwRasterise = function (p, af, w, h, off) {
    if (!p || !p.geom || !p.geom.d || !af) return null;
    // Tracking: shift by (dx,dy) and scale by s about the pivot (cx,cy), all in source units.
    var odx = (off && off.dx) || 0, ody = (off && off.dy) || 0;
    var os = (off && off.s) || 1, ocx = (off && off.cx) || 0, ocy = (off && off.cy) || 0;
    if (!_matteCv) {
      _matteCv = document.createElement('canvas');
      _matteCtx = _matteCv.getContext('2d');
    }
    if (_matteCv.width !== w || _matteCv.height !== h) { _matteCv.width = w; _matteCv.height = h; }
    var ctx = _matteCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Softness as a blur radius. Tied to the frame's short side so a feather looks the same at
    // preview resolution and at export resolution, instead of being a fixed pixel count that
    // vanishes on a 4K render.
    var soft = typeof p.softness === 'number' ? p.softness : 0.3;
    var blur = soft * Math.min(w, h) * 0.12;
    if (blur > 0.4) ctx.filter = 'blur(' + blur.toFixed(2) + 'px)';

    ctx.fillStyle = '#fff';
    // source-normalized -> frame px, the same affine the analytic windows use, with the tracking
    // shift AND scale folded in: x' = pivot + (x - pivot) * s + dx, so the path follows the subject
    // and grows/shrinks with it. os=1, odx=ody=0 reduces to the plain affine exactly.
    ctx.setTransform(af.ax * w * os, 0, 0, af.ay * h * os,
      (af.bx + (ocx * (1 - os) + odx) * af.ax) * w,
      (af.by + (ocy * (1 - os) + ody) * af.ay) * h);
    try {
      var path = new Path2D(p.geom.d);
      ctx.fill(path);
    } catch (e) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = 'none';
      return null;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    return _matteCv;
  };

  /* Resolve the clip's GRADE NODE CHAIN into a flat op list for the GPU, in order.
       node with NO windows  -> one full-frame op (op.full = true)
       node WITH windows     -> one masked op per window, all carrying the NODE's grade
     Order is load-bearing: the chain is serial, so a desaturate before a LUT is not the same
     picture as the same desaturate after it. */
  /* Is a window "live" at clip-relative time `rel` (seconds since the clip's start on the timeline)?
     A window with no time bounds is always live (whole clip) - the default and backward-compatible.
     A window the user gave a duration (tStart/tDur) is live only inside its range. This is the
     "5 saniye tutarım, 10 saniye tutarım" the owner asked for, and it is GATED HERE so playback pays
     nothing: a window outside its range produces no op at all. */
  VE._vePwLiveAt = function (p, rel) {
    if (!p || p.tDur == null || rel == null) return true;
    var s = p.tStart || 0;
    return rel >= s && rel < s + p.tDur;
  };

  /* TRACKING: the normalized (dx, dy) the window should be SHIFTED by at clip-relative time `rel`.
     A tracked window carries `track.kf = { '<sec>': [dx, dy] }` (deltas in 0..1 of the media),
     produced ONCE by an offline analysis pass (MotionTracker), so playback only INTERPOLATES stored
     keyframes here - zero per-frame analysis, which is the whole reason tracking is affordable in the
     browser. No track, or tracking off, returns {0,0}. */
  VE._vePwTrackOffset = function (win, rel) {
    var t = win && win.track;
    if (!t || t.on === false || !t.kf || rel == null) return { dx: 0, dy: 0, s: 1 };
    var keys = t._sortedKeys;
    if (!keys || t._sortedFor !== t.kf) {
      keys = Object.keys(t.kf).map(Number).sort(function (a, b) { return a - b; });
      t._sortedKeys = keys; t._sortedFor = t.kf;   // cache the sort; kf is rebuilt on a re-track
    }
    if (!keys.length) return { dx: 0, dy: 0, s: 1 };
    // kf value = [dx, dy, scale]; older 2-element entries mean scale 1.
    function _v(arr) { return { dx: arr[0], dy: arr[1], s: (arr.length > 2 && arr[2] != null) ? arr[2] : 1 }; }
    if (rel <= keys[0]) return _v(t.kf[keys[0]]);
    var last = keys[keys.length - 1];
    if (rel >= last) return _v(t.kf[last]);
    for (var i = 1; i < keys.length; i++) {
      if (rel < keys[i]) {
        var t0 = keys[i - 1], t1 = keys[i], f = (rel - t0) / (t1 - t0);
        var v0 = _v(t.kf[t0]), v1 = _v(t.kf[t1]);
        return { dx: v0.dx + (v1.dx - v0.dx) * f, dy: v0.dy + (v1.dy - v0.dy) * f,
                 s: v0.s + (v1.s - v0.s) * f };
      }
    }
    return { dx: 0, dy: 0, s: 1 };
  };

  /* Does a grade actually DO anything? Migration and "add node" create empty base nodes
     ({enabled:true, preset:'none'}), and baking + running an identity 3D-LUT pass for one is pure
     waste (and it made a phantom full-frame op sit under every window). A full-frame node that
     changes nothing is skipped; a MASKED node is kept regardless, because the shape is the user's
     work-in-progress even before they pick a look. */
  VE._veGradeActive = function (g) {
    if (!g || g.enabled === false) return false;
    if (g.lutId || g._customLUT) return true;
    if (g.preset && g.preset !== 'none') return true;
    if (g.wb && (g.wb.temp || g.wb.tint)) return true;
    if (g.sat && ((g.sat.saturation != null && g.sat.saturation !== 100) || g.sat.vibrance)) return true;
    if (g.levels && (g.levels.inBlack || (g.levels.inWhite != null && g.levels.inWhite !== 255) ||
        (g.levels.gamma != null && g.levels.gamma !== 1) || g.levels.outBlack ||
        (g.levels.outWhite != null && g.levels.outWhite !== 255))) return true;
    if (g.curves) { for (var ck in g.curves) { if (g.curves[ck] && g.curves[ck].length) return true; } }
    if (g.wheels) { for (var z in g.wheels) { var wl = g.wheels[z]; if (wl && (wl.r || wl.g || wl.b)) return true; } }
    return false;
  };

  VE._veGradeOps = function (clip, el, w, h, time) {
    if (!clip) return null;
    var nodes = VE._veNodes ? VE._veNodes(clip) : null;
    if (!nodes || !nodes.length) return null;
    var af = VE._vePwAffine(clip, el, w, h);
    var out = [];
    var matte = !!(VE._vePwMatte && !VE._veExporting);
    // Clip-relative playhead. Windows are scheduled in timeline seconds from the clip's start, so a
    // window rides the clip when the clip moves, exactly like an effect on the clip.
    var rel = (time != null) ? (time - (clip.startTime || 0)) : null;

    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni];
      if (!nd || nd.enabled === false || !nd.grade) continue;
      if (!nd.grade.enabled && !nd.grade.lutId) continue;
      var wins = nd.windows || [];

      if (!wins.length) {
        // Whole-frame node. In matte view it must NOT paint: the matte is about the windows, and a
        // full-frame grade would just tint the mask you are trying to read.
        if (matte) continue;
        // Skip an identity full-frame grade: an empty base node otherwise costs a whole GPU pass and
        // sat as a phantom op under every window.
        if (!VE._veGradeActive(nd.grade)) continue;
        out.push({ full: true, grade: nd.grade });
        continue;
      }
      if (!af) continue;   // SmartCam etc: no single source rect exists, so masks cannot be placed
      // `|| []`: _vePwOpsFor returns null (not []) when every window is gated out (all outside their
      // time range), and concat(null) would splice a literal null INTO the op list. The renderer's
      // `if (!pw)` guard swallowed it, but a null op is still wrong and time-gating hits it often.
      out = out.concat(VE._vePwOpsFor(nd, af, w, h, matte, rel) || []);
    }
    return out.length ? out : null;
  };

  VE._vePwOpsFor = function (nd, af, w, h, matte, rel) {
    var ax = af.ax, bx = af.bx, ay = af.ay, by = af.by;
    var pws = nd.windows || [];
    var grade = matte ? MATTE_GRADE : nd.grade;
    var out = [];
    for (var i = 0; i < pws.length; i++) {
      var p = pws[i];
      // No p.grade check any more: the grade lives on the NODE now, so a window is only a shape.
      if (!p || p.enabled === false || !p.geom) continue;
      if (!VE._vePwLiveAt(p, rel)) continue;   // outside its scheduled time range -> no op this frame
      // Tracking shift (0,0 when the window is not tracked). Applied to the SHAPE so the window
      // follows the subject the analysis pass locked onto.
      var off = VE._vePwTrackOffset(p, rel);
      // A PATH window (pen / polygon / curve). No closed form, so it is masked by a rasterised
      // matte instead of shader maths. The key is what makes it affordable: it changes only when
      // the geometry, the feather or the frame size changes, so watching a window costs one texture
      // bind and dragging one costs a single re-raster.
      if (p.geom.d) {
        // Tracking a path needs a scale PIVOT (the path's own centre); memoized against `d` so the
        // parse runs once per geometry, not per frame. Identity offset passes null and the rasterise
        // transform stays byte-identical to the untracked case.
        var offP = null;
        if (off.dx || off.dy || (off.s && off.s !== 1)) {
          if (p._bbcD !== p.geom.d) { p._bbc = VE._veDBboxCenter(p.geom.d); p._bbcD = p.geom.d; }
          offP = { dx: off.dx, dy: off.dy, s: off.s || 1, cx: p._bbc[0], cy: p._bbc[1] };
        }
        (function (win, o) {
          out.push({
            shape: 'path',
            matteKey: win.id + '|' + win.geom.d.length + '|' + win.geom.d + '|' +
                      (win.softness || 0) + '|' + w + 'x' + h + '|' + ax.toFixed(4) + ',' + ay.toFixed(4) +
                      ',' + bx.toFixed(4) + ',' + by.toFixed(4) + '|' +
                      (o ? o.dx.toFixed(4) + ',' + o.dy.toFixed(4) + ',' + o.s.toFixed(4) : '0'),
            matteFn: function () { return VE._vePwRasterise(win, af, w, h, o); },
            invert: !!win.invert,
            grade: grade
          });
        })(p, offP);
        continue;
      }

      // Tracking shifts the analytic window's CENTRE by the interpolated delta and scales its size
      // by the tracked scale, so the window keeps covering the subject as it moves AND as it grows
      // or shrinks in frame (the owner's "orantılı değil"). s=1, dx=dy=0 reduces to the plain case.
      var _ts = off.s || 1;
      var cxn = p.geom.x + p.geom.w / 2 + off.dx, cyn = p.geom.y + p.geom.h / 2 + off.dy;
      var gw = p.geom.w * _ts, gh = p.geom.h * _ts;
      var ux = (cxn - gw / 2) * ax + bx, uy = (cyn - gh / 2) * ay + by;
      var uw = gw * ax, uh = gh * ay;
      if (!(uw > 0) || !(uh > 0)) continue;
      out.push({
        // The frame is uploaded with UNPACK_FLIP_Y_WEBGL, so v=1 is the TOP while geom.y counts down
        // from the top. Flip into GL's convention once, here, instead of making every future shape
        // in the shader remember to.
        rect: [ux, 1 - (uy + uh), uw, uh],
        shape: (p.shape === 'ellipse' || p.shape === 'linear') ? p.shape : 'rect',
        softness: typeof p.softness === 'number' ? p.softness : 0.25,
        // The rect is uploaded y-flipped for GL, so a fabric screen-space (y-down, clockwise) angle
        // reads as the opposite sign in the shader's y-up space -> negate.
        angle: -((p.geom.angle || 0) * Math.PI / 180),
        invert: !!p.invert,
        /* Matte view (Resolve Shift+H): a feather cannot be judged on the graded picture, only on
           the mask. Substituted at RESOLVE time so it stays a view and never reaches the clip data:
           nothing to serialise, nothing to restore, nothing to leak into a saved file.
           NOT during export: _veExportRenderFrame drives this same path, so leaving matte view on
           and hitting export would have written a black-and-white matte out as the video. */
        grade: grade
      });
    }
    return out.length ? out : null;
  };

  /* THE CLIP POST-PROCESS, in ONE place: chroma key + the grade node chain + AI background removal.

     WHY THIS EXISTS. There were TWO copies of this block in this file: the `activeClips` path and the
     background-clip path (`_bgNeedsChroma`/`_bgNeedsAIBG`/`_bgNeedsGrading`/...), hand-mirrored, the
     bg copy's own comment even saying "same pipeline as activeClips". They drifted, exactly the way
     two copies always do:
       - the bg copy never got the GPU grader (it passed `null` for the grade and ran the 334ms/frame
         CPU path forever, and could never render a power window at all);
       - when the grade moved to `clip.gradeNodes`, only the foreground copy was updated, so the bg
         copy kept reading the DELETED `bgClip.colorGrading`. **Measured: a graded bg clip went from
         170,131,92 to 138,106,74 = raw. The same clip on the foreground path rendered fine**, so the
         grade looked like it worked or not at random depending on which slot the clip sat in.

     One function, both callers, no twin to forget. This is the `one-limit-function` rule from the
     project's own memory: never hand-mirror a read.

     Returns nothing; mutates offCanvas in place. */
  VE._veApplyClipFx = function (clip, el, offCanvas, offCtx, w, h, time) {
    if (!clip || !offCanvas || !offCtx) return;
    var needsChroma = !!(window.VEChromaKey && clip.chromaKey && clip.chromaKey.enabled);
    var needsAIBG = !!(window.VEBGRemoval && clip.bgRemoval && clip.bgRemoval.enabled &&
                       clip.bgRemoval.method === 'mediapipe');
    var needsGrading = VE._veNeedsGrading(clip);
    if (!needsChroma && !needsAIBG && !needsGrading) return;

    var gpuChroma = false, gpuGrading = false;

    if (window.VEPerformance) {
      var canGpu = !!(VEPerformance.canGradeOnGPU && VEPerformance.canGradeOnGPU());
      // ONE op list for the whole node chain: a full-frame node and a masked node are the same kind
      // of thing, applied in order, so there is no separate "the clip grade" any more. `time` gates
      // each window by its own scheduled range (owner's "5s/10s").
      var ops = canGpu ? VE._veGradeOps(clip, el, w, h, time) : null;
      var baseGrade = null;
      // Matte view crushes the base to black so the windows' white reads as the mask. Only when this
      // clip actually HAS masked ops, or toggling matte would black out every other clip.
      if (VE._vePwMatte && !VE._veExporting && ops && ops.some(function (o) { return !o.full; })) {
        baseGrade = MATTE_BASE;
      }
      if (needsChroma || baseGrade || ops) {
        var r = VEPerformance.processFrame(offCanvas, w, h, needsChroma ? clip.chromaKey : null,
          baseGrade, ops);
        if (r && r.canvas) {
          offCtx.clearRect(0, 0, w, h);
          offCtx.drawImage(r.canvas, 0, 0);
          gpuChroma = needsChroma;
          gpuGrading = !!ops || !!baseGrade;
        }
      }
    }

    if (needsChroma && !gpuChroma) {
      var ck = VEChromaKey.applyToFrame(offCanvas, 0, 0, w, h, clip.chromaKey);
      if (ck) { offCtx.clearRect(0, 0, w, h); offCtx.drawImage(ck, 0, 0); }
    }

    // AI background removal: async mask, applied synchronously from the previous frame's cache.
    if (needsAIBG) {
      if (!clip._bgMaskCache) clip._bgMaskCache = null;
      VEBGRemoval.getMask(offCanvas, w, h, clip.bgRemoval).then(function (m) { clip._bgMaskCache = m; });
      if (clip._bgMaskCache) {
        var mask = clip._bgMaskCache;
        var src = offCtx.getImageData(0, 0, w, h);
        var sd = src.data, md = mask.data, len = Math.min(sd.length, md.length);
        for (var i = 3; i < len; i += 4) sd[i] = Math.round(sd[i] * md[i - 3] / 255);
        offCtx.putImageData(src, 0, 0);
      }
    }

    /* CPU grading is the FALLBACK (WebGL1, or no WebGL). Same maths either way: the GPU cube is baked
       BY this function, so they cannot disagree. Full-frame nodes only: a masked node needs a
       sampler3D and a mask pass, which WebGL1 does not have. */
    if (needsGrading && !gpuGrading) {
      var full = (VE._veNodes ? VE._veNodes(clip) : []).filter(function (n) {
        return n && n.enabled !== false && !(n.windows && n.windows.length) &&
               VE._veGradeActive(n.grade);
      });
      for (var f = 0; f < full.length; f++) {
        var g = VEColorGrading.applyToFrame(offCanvas, 0, 0, w, h, full[f].grade, false);
        if (g) { offCtx.clearRect(0, 0, w, h); offCtx.drawImage(g, 0, 0); }
      }
    }
  };

  /* "Does this clip need the post-processing canvas at all?" ONE definition, because this decision
     used to exist in two places and the bg copy was the one left reading the deleted field. */
  VE._veNeedsGrading = function (clip) {
    if (!window.VEColorGrading || !clip) return false;
    if (VE._veNodeActiveCount) return VE._veNodeActiveCount(clip) > 0;
    return !!(clip.colorGrading && clip.colorGrading.enabled);
  };

  VE._veDrawClipFitted = function (ctx, clip, el, w, h) {
    var cf = clip.fit || 'cover';
    var mw = el.videoWidth || el.naturalWidth || clip._mediaWidth || w;
    var mh = el.videoHeight || el.naturalHeight || clip._mediaHeight || h;

    var bands = VE._veScBands(clip);
    if (bands) {
      for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        // Round to whole pixels: two adjacent bands computed from fractions can otherwise leave a
        // sub-pixel gap that shows as a hairline seam on the composite.
        var bx = Math.round(b.fx * w), by = Math.round(b.fy * h);
        var bw = Math.round((b.fx + b.fw) * w) - bx, bh = Math.round((b.fy + b.fh) * h) - by;
        if (bw <= 0 || bh <= 0) continue;
        var r = VE._veCropRect(clip, mw, mh, b.crop);
        if (!r) continue;
        var f = (cf === 'stretch') ? { x: 0, y: 0, w: bw, h: bh } : VE._veFitRect(r.sw, r.sh, bw, bh, cf);
        // Clip to the band: with fit:'cover' an off-ratio crop overflows, and without this it
        // would paint over its neighbour instead of being cropped by its own cell.
        ctx.save();
        ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
        ctx.drawImage(el, r.sx, r.sy, r.sw, r.sh, bx + f.x, by + f.y, f.w, f.h);
        ctx.restore();
      }
      return;
    }

    var cr = VE._veCropRect(clip, mw, mh);
    if (cf === 'stretch') {
      if (cr) ctx.drawImage(el, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h);
      else ctx.drawImage(el, 0, 0, w, h);
      return;
    }
    if (cr) {
      var cfr = VE._veFitRect(cr.sw, cr.sh, w, h, cf);
      ctx.drawImage(el, cr.sx, cr.sy, cr.sw, cr.sh, cfr.x, cfr.y, cfr.w, cfr.h);
      return;
    }
    var fr = VE._veFitRect(mw, mh, w, h, cf);
    ctx.drawImage(el, fr.x, fr.y, fr.w, fr.h);
  };

  VE._veRenderPreviewFrame = function (skipFabricSync) {
    // Enforce correct canvas dimensions
    VE._veEnforceDimensions();

    // Plugin hook: beforeRender
    if (window.VEPluginSystem) VEPluginSystem.runHook('beforeRender', { time: VE._veProject.playheadTime });

    var time = VE._veProject.playheadTime;
    var ctx = VE._veUi.previewCtx;
    var pvs = VE._veUi.previewCanvas;

    // Draw video frames to dedicated preview canvas (behind Fabric.js)
    if (ctx && pvs) {
      ctx.clearRect(0, 0, pvs.width, pvs.height);
      // Canvas backdrop: image > gradient > solid colour. Driven by the real
      // Background panel in video mode (owner) via VE._veProject.bg*.
      VE._veDrawBackdrop(ctx, pvs.width, pvs.height);

      // Collect active video clips at current time
      var activeClips = [];
      var bgClipId = VE._veProject._bgClipId;
      var bgClip = null;
      // Map: clipId → previous / next clip on same track (for cross-clip transitions:
      // prev feeds the IN crossfade, next feeds the OUT crossfade → real blend, not fade-to-black)
      var _prevClipForTransition = {};
      var _nextClipForTransition = {};
      /* Adjustment layers active at this instant, plus the track index each clip sits on. The
         compositor draws into ONE context in track order, so "everything below an adjustment layer"
         is literally "everything drawn before its track" - which is why these are applied inside the
         draw sequence rather than at the end. */
      var _adjustments = [];
      var _trackIdxOfClip = {};
      VE._veProject.tracks.forEach(function(track, _trackIdx) {
        if (track.type === 'audio') return;
        // Mute is an AUDIO concept. Only skip audio tracks here; a muted VIDEO track must still
        // render its picture. Muting a video track (from the mixer's M or the timeline) used to
        // blank the whole preview to black, because this early-return dropped its clips AND the
        // background clip, leaving only the #000 backdrop.
        if (track.muted && track.type === 'audio') return;
        // Sort clips by startTime for adjacent lookup
        var sorted = track.clips.slice().sort(function(a, b) { return a.startTime - b.startTime; });
        track.clips.forEach(function(clip) {
          if (window.VEErrorHandler && VEErrorHandler.isClipSuppressed(clip.id)) return;
          var clipEnd = clip.startTime + clip.duration;
          if (time < clip.startTime || time >= clipEnd) return;
          if (clip.type === 'adjustment') { _adjustments.push({ clip: clip, trackIdx: _trackIdx }); return; }
          // Background clip (video or image overlay) — separate handling
          if (clip.id === bgClipId) { bgClip = clip; return; }
          // Video and image clips go into activeClips for the main render loop
          if (clip.type === 'video' || clip.type === 'image') {
            activeClips.push(clip);
            _trackIdxOfClip[clip.id] = _trackIdx;
            // Find the previous clip on this track for cross-clip IN transitions
            if (clip.transitions && clip.transitions['in'] && clip.transitions['in'].type && clip.transitions['in'].type !== 'none') {
              for (var si = 0; si < sorted.length; si++) {
                if (sorted[si].id === clip.id && si > 0) {
                  var prev = sorted[si - 1];
                  var prevEnd = prev.startTime + prev.duration;
                  // Adjacent: previous clip ends at or very near this clip's start
                  if ((prev.type === 'video' || prev.type === 'image') && Math.abs(prevEnd - clip.startTime) < 0.15) {
                    _prevClipForTransition[clip.id] = prev;
                  }
                  break;
                }
              }
            }
            // Find the NEXT clip on this track for cross-clip OUT transitions (so the OUT blends
            // into the following clip instead of fading to black).
            if (clip.transitions && clip.transitions.out && clip.transitions.out.type && clip.transitions.out.type !== 'none') {
              for (var sj = 0; sj < sorted.length; sj++) {
                if (sorted[sj].id === clip.id && sj < sorted.length - 1) {
                  var nxt = sorted[sj + 1];
                  if ((nxt.type === 'video' || nxt.type === 'image') && Math.abs(clipEnd - nxt.startTime) < 0.15) {
                    _nextClipForTransition[clip.id] = nxt;
                  }
                  break;
                }
              }
            }
          }
        });
      });

      // Draw background clip first (video or image, with fit mode)
      if (bgClip) {
        var bgSrc = null;
        if (bgClip.type === 'video') {
          // Export phase 2: the FIRST imported video becomes the background clip and is composited
          // through this path, not through activeClips below. It needs the same frame override, or
          // an export reads a decoded frame for every other clip while the background keeps whatever
          // its element happens to hold - which showed up as a 1-3 frame lag and repeated pictures.
          bgSrc = bgClip._ccFrameOverride || VE._vePlayback.videoPool[bgClip.id];
          if (bgSrc) {
            var _bgHasSpeedKf = window.VEKeyframes && VEKeyframes.hasKeyframes(bgClip, 'speed');
            var bgLocal = _bgHasSpeedKf
              ? VEKeyframes.computeSpeedMappedTime(bgClip, time)
              : (time - bgClip.startTime) * (bgClip.speed || 1) + (bgClip.trimStart || 0);
            bgLocal = VE._veLoopLocalTime(bgLocal, bgClip, bgSrc);
            if (VE._vePlayback.playing && !_bgHasSpeedKf && bgSrc.paused) {
              // Clip just became active — start playing
              bgSrc.muted = true;
              bgSrc.currentTime = bgLocal;
              bgSrc.playbackRate = (VE._vePlayback.speed || 1) * (bgClip.speed || 1);
              bgSrc.play().catch(function() {});
            } else if (VE._vePlayback.playing && !_bgHasSpeedKf) {
              // Playing — sync playbackRate + correct significant drift
              var _bgTargetRate = (VE._vePlayback.speed || 1) * (bgClip.speed || 1);
              if (Math.abs(bgSrc.playbackRate - _bgTargetRate) > 0.01) bgSrc.playbackRate = _bgTargetRate;
              if (Math.abs(bgSrc.currentTime - bgLocal) > 0.15) bgSrc.currentTime = bgLocal;
            } else {
              // Paused/scrubbing or speed keyframes — precise seek
              if (Math.abs(bgSrc.currentTime - bgLocal) > 0.05) bgSrc.currentTime = bgLocal;
            }
          }
        } else if (bgClip.type === 'image') {
          bgSrc = VE._vePlayback.videoPool[bgClip.id];
        } else if (bgClip.type === 'overlay' && bgClip.fabricObjectId) {
          // Image overlay as background — get fabric image element
          var _bgObjs = canvas.getObjects().filter(function(o) { return o._veClipId === bgClip.fabricObjectId; });
          var bgFabObj = _bgObjs.length ? _bgObjs[0] : null;
          if (bgFabObj && bgFabObj._element) bgSrc = bgFabObj._element;
        }
        if (bgSrc) {
          // Skip drawing if video element not loaded yet (videoWidth=0 means HTML default 300x150)
          if (bgSrc.tagName === 'VIDEO' && !bgSrc.videoWidth) { /* wait for canplay */ }
          else {
            try {
              var srcW = bgSrc.videoWidth || bgSrc.naturalWidth || bgSrc.width || pvs.width;
              var srcH = bgSrc.videoHeight || bgSrc.naturalHeight || bgSrc.height || pvs.height;
              // The background clip returns early above and is drawn by THIS path, which never
              // calls _veDrawClipFitted. Without this, a SmartCam crop on a clip that is also the
              // project background would be silently ignored: the designer would show one framing
              // and the canvas another, with no error. So the crop is resolved here too, and the
              // fit is computed from the CROP's dimensions exactly as _veDrawClipFitted does.
              var _bgCrop = VE._veCropRect(bgClip, srcW, srcH);
              if (_bgCrop) { srcW = _bgCrop.sw; srcH = _bgCrop.sh; }
              var fit = VE._veFitRect(srcW, srcH, pvs.width, pvs.height, VE._veProject.bgFit || 'cover');
              // Apply the bg clip's Transform (scale around centre + X/Y offset) so the panel's Transform
              // controls affect the BACKGROUND video too (owner: X/Y + Scale were ignored on the bg clip
              // because it draws through this backdrop path, not the overlay transform path). Every bg
              // draw branch below uses `fit`, so adjusting it here covers them all.
              var _bgtf = bgClip.transform;
              if (_bgtf) {
                var _bgsc = (_bgtf.scale && _bgtf.scale > 0) ? _bgtf.scale : 1;
                if (_bgsc !== 1) {
                  var _bgcx = fit.x + fit.w / 2, _bgcy = fit.y + fit.h / 2;
                  fit = { x: _bgcx - (fit.w * _bgsc) / 2, y: _bgcy - (fit.h * _bgsc) / 2, w: fit.w * _bgsc, h: fit.h * _bgsc };
                }
                if (_bgtf.x) fit.x += _bgtf.x;
                if (_bgtf.y) fit.y += _bgtf.y;
                // Flip via negative draw dimensions (canvas drawImage mirrors on a negative w/h).
                if (_bgtf.flipH) { fit.x += fit.w; fit.w = -fit.w; }
                if (_bgtf.flipV) { fit.y += fit.h; fit.h = -fit.h; }
              }
              var bfStr = VE._veBuildFilterString(bgClip.filters);
              ctx.filter = bfStr;

              // Check if bg clip has transitions — render through transition pipeline
              var _bgHasTrans = bgClip.transitions && (
                (bgClip.transitions['in'] && bgClip.transitions['in'].type && bgClip.transitions['in'].type !== 'none') ||
                (bgClip.transitions.out && bgClip.transitions.out.type && bgClip.transitions.out.type !== 'none'));

              // Check if bg clip has complex effects (same as activeClips path)
              var _bgNeedsChroma = window.VEChromaKey && bgClip.chromaKey && bgClip.chromaKey.enabled;
              var _bgNeedsAIBG = window.VEBGRemoval && bgClip.bgRemoval && bgClip.bgRemoval.enabled && bgClip.bgRemoval.method === 'mediapipe';
              var _bgNeedsGrading = VE._veNeedsGrading(bgClip);
              var _bgNeedsComplex = _bgNeedsChroma || _bgNeedsAIBG || _bgNeedsGrading;
              var _bgNeedsBlend = bgClip.blendMode && bgClip.blendMode !== 'normal';

              // If complex effects OR blend mode needed, route through offscreen canvas
              var _bgDrawTarget = ctx;
              var _bgOffCanvas = null;
              var _bgOffCtx = null;
              if (_bgNeedsComplex || _bgNeedsBlend) {
                if (!VE._vePlayback._bgEffCanvas) {
                  VE._vePlayback._bgEffCanvas = document.createElement('canvas');
                  VE._vePlayback._bgEffCtx = VE._vePlayback._bgEffCanvas.getContext('2d');
                }
                _bgOffCanvas = VE._vePlayback._bgEffCanvas;
                _bgOffCtx = VE._vePlayback._bgEffCtx;
                if (_bgOffCanvas.width !== pvs.width || _bgOffCanvas.height !== pvs.height) {
                  _bgOffCanvas.width = pvs.width; _bgOffCanvas.height = pvs.height;
                } else {
                  _bgOffCtx.clearRect(0, 0, pvs.width, pvs.height);
                }
                _bgDrawTarget = _bgOffCtx;
                _bgDrawTarget.filter = bfStr;
              }

              if (_bgHasTrans && window.VETransitions) {
                // Draw bg through offscreen canvas at full size, then composite with fit
                if (!VE._vePlayback._bgTransCanvas) {
                  VE._vePlayback._bgTransCanvas = document.createElement('canvas');
                  VE._vePlayback._bgTransCtx = VE._vePlayback._bgTransCanvas.getContext('2d');
                }
                var _btc = VE._vePlayback._bgTransCanvas;
                var _btCtx = VE._vePlayback._bgTransCtx;
                if (_btc.width !== pvs.width || _btc.height !== pvs.height) {
                  _btc.width = pvs.width; _btc.height = pvs.height;
                } else {
                  _btCtx.clearRect(0, 0, pvs.width, pvs.height);
                }
                // Draw fitted source to offscreen
                _bgDraw(_btCtx, bgSrc, _bgCrop, fit);
                // Render transitions using offscreen as source (treat as image element)
                VETransitions.renderClipWithTransitions(_bgDrawTarget, bgClip, _btc, pvs.width, pvs.height, time);
              } else {
                _bgDraw(_bgDrawTarget, bgSrc, _bgCrop, fit);
              }

              if (_bgNeedsComplex || _bgNeedsBlend) {
                _bgDrawTarget.filter = 'none';
              }
              ctx.filter = 'none';

              /* Chroma + the grade NODE CHAIN + AI BG, through the ONE function the foreground
                 path also calls. This block used to be a hand-mirrored copy ("same pipeline as
                 activeClips"), and it drifted exactly the way two copies always do: it never got
                 the GPU grader (it passed `null` for the grade), it could never render a power
                 window, and when the grade moved to gradeNodes only the foreground copy was
                 updated, so it kept reading the DELETED bgClip.colorGrading.
                 Measured: a graded bg clip rendered 170,131,92 before migration and 138,106,74
                 (raw) after, while the SAME clip on the foreground path rendered fine. */
              if ((_bgNeedsComplex || _bgNeedsBlend) && _bgOffCanvas) {
                VE._veApplyClipFx(bgClip, bgSrc, _bgOffCanvas, _bgOffCtx, pvs.width, pvs.height, time);
                // (Style Transfer removed — owner 2026-07-13.)
                // Apply blend mode on offscreen canvas before compositing
                if (_bgNeedsBlend) {
                  // Self-blend with a filtered version so ALL blend modes produce visible effects
                  // (pure self-blend is identity for saturation/hue/color/luminosity modes)
                  _bgOffCtx.globalCompositeOperation = bgClip.blendMode;
                  _bgOffCtx.filter = 'contrast(1.3) saturate(0.5)';
                  _bgOffCtx.drawImage(_bgOffCanvas, 0, 0);
                  _bgOffCtx.filter = 'none';
                  _bgOffCtx.globalCompositeOperation = 'source-over';
                }
                // Composite processed result back to main canvas
                ctx.drawImage(_bgOffCanvas, 0, 0);
              }

              // Apply pixel-level effects for bg clip (sharpen, pixelate, glitch)
              if (bgClip.effects && bgClip.effects.length > 0) {
                if ((_bgNeedsComplex || _bgNeedsBlend) && _bgOffCanvas) {
                  VE._veApplyPixelEffects(_bgOffCtx, bgClip, pvs.width, pvs.height);
                  ctx.drawImage(_bgOffCanvas, 0, 0);
                } else {
                  // Direct pixel fx on main canvas
                  VE._veApplyPixelEffects(ctx, bgClip, pvs.width, pvs.height);
                }
              }
            } catch (e) { /* not ready */ }
          }
        }
      }

      /* Apply every adjustment layer whose track sits at or below `uptoTrackIdx` and has not been
         applied yet. Called before each clip is drawn and once more after the loop, so a layer always
         lands on exactly the clips beneath it. Sorted so several layers stack bottom-up. */
      _adjustments.sort(function (a, b) { return a.trackIdx - b.trackIdx; });
      var _adjDone = 0;
      function _flushAdjustments(uptoTrackIdx) {
        if (!window.VEAdjustmentLayer || !VEAdjustmentLayer.applyToCanvas) return;
        while (_adjDone < _adjustments.length && _adjustments[_adjDone].trackIdx <= uptoTrackIdx) {
          var a = _adjustments[_adjDone++];
          try { VEAdjustmentLayer.applyToCanvas(ctx, a.clip.effects, pvs.width, pvs.height); }
          catch (e) { console.warn('[VE] adjustment layer failed:', e && e.message); }
        }
      }

      // Seek each video/image element and draw to preview canvas
      activeClips.forEach(function(clip) {
        // Anything on a LOWER track than this clip is finished; grade it before this clip lands on top.
        _flushAdjustments((_trackIdxOfClip[clip.id] || 0) - 1);
        // Export phase 2: when the export is reading frames through VEFrameSource (sequential
        // decode instead of one seek per frame), the decoded canvas for THIS timestamp is parked on
        // the clip and is drawn in place of the pool element. It carries videoWidth/videoHeight, so
        // every `el.videoWidth || el.naturalWidth || clip._mediaWidth` read below still resolves.
        var videoEl = clip._ccFrameOverride || VE._vePlayback.videoPool[clip.id];
        if (!videoEl) return;
        // Skip if video not ready for drawing
        if (videoEl.tagName === 'VIDEO' && !videoEl.videoWidth) return;

        // For video clips, sync to correct time; image clips are static
        if (clip.type === 'video') {
          var _hasSpeedKf = window.VEKeyframes && VEKeyframes.hasKeyframes(clip, 'speed');
          var localTime = _hasSpeedKf
            ? VEKeyframes.computeSpeedMappedTime(clip, time)
            : (time - clip.startTime) * (clip.speed || 1) + (clip.trimStart || 0);
          localTime = VE._veLoopLocalTime(localTime, clip, videoEl);
          if (VE._vePlayback.playing && !_hasSpeedKf && videoEl.paused) {
            // Clip just entered active range — start playing
            videoEl.muted = true;
            videoEl.currentTime = localTime;
            videoEl.playbackRate = (VE._vePlayback.speed || 1) * (clip.speed || 1);
            videoEl.play().catch(function() {});
          } else if (VE._vePlayback.playing && !_hasSpeedKf) {
            // Playing — sync playbackRate + correct significant drift
            var _targetRate = (VE._vePlayback.speed || 1) * (clip.speed || 1);
            if (Math.abs(videoEl.playbackRate - _targetRate) > 0.01) videoEl.playbackRate = _targetRate;
            if (Math.abs(videoEl.currentTime - localTime) > 0.15) videoEl.currentTime = localTime;
          } else {
            // Paused/scrubbing or speed keyframes — precise seek
            if (Math.abs(videoEl.currentTime - localTime) > 0.05) videoEl.currentTime = localTime;
          }
        }
        try {
          // Determine if post-processing is needed (chroma key, AI BG removal, or color grading)
          var needsChroma = window.VEChromaKey && clip.chromaKey && clip.chromaKey.enabled;
          var needsAIBG = window.VEBGRemoval && clip.bgRemoval && clip.bgRemoval.enabled && clip.bgRemoval.method === 'mediapipe';
          // "Does this clip need the post-processing canvas at all?" ONE definition, shared with
          // the background path, which is the copy that was left reading the deleted field.
          var needsGrading = VE._veNeedsGrading(clip);

          // If post-processing needed, render clip to offscreen canvas first
          var drawTarget = ctx;
          var offCanvas = null;
          var offCtx = null;
          if (needsChroma || needsGrading || needsAIBG) {
            if (!VE._vePlayback._offCanvas) {
              VE._vePlayback._offCanvas = document.createElement('canvas');
              VE._vePlayback._offCtx = VE._vePlayback._offCanvas.getContext('2d');
            }
            offCanvas = VE._vePlayback._offCanvas;
            offCtx = VE._vePlayback._offCtx;
            // Only resize when dimensions actually change (avoid GPU state reset)
            if (offCanvas.width !== pvs.width || offCanvas.height !== pvs.height) {
              offCanvas.width = pvs.width;
              offCanvas.height = pvs.height;
            } else {
              offCtx.clearRect(0, 0, pvs.width, pvs.height);
            }
            drawTarget = offCtx;
          }

          // Apply clip filters
          var filterStr = VE._veBuildFilterString(clip.filters);
          drawTarget.filter = filterStr;

          // Blend mode: when drawing directly to main canvas (no post-processing)
          if (!offCanvas && clip.blendMode && clip.blendMode !== 'normal') {
            ctx.globalCompositeOperation = clip.blendMode;
          }

          // Apply clip transform (position X/Y, flip, rotate, scale). X/Y were previously ignored
          // entirely (owner: "x y çalışmıyor") — they offset the drawn frame in canvas pixels.
          // Keyframed transform/opacity (clip.keyframes, VEKeyframes) REPLACES the static
          // component per property when present; a clip without keyframes takes the exact
          // pre-keyframe path (guarded no-op, export shares this code).
          var _ctf = clip.transform;
          var _kfv = null;
          if (window.VEKeyframes && VEKeyframes.hasKeyframes(clip)) {
            var _ev = VEKeyframes.evaluateAll(clip, time);
            if (_ev.x != null || _ev.y != null || _ev.scaleX != null || _ev.scaleY != null || _ev.rotation != null || _ev.opacity != null) _kfv = _ev;
          }
          var _tfX = _kfv && _kfv.x != null ? _kfv.x : ((_ctf && _ctf.x) || 0);
          var _tfY = _kfv && _kfv.y != null ? _kfv.y : ((_ctf && _ctf.y) || 0);
          var _tfRot = _kfv && _kfv.rotation != null ? _kfv.rotation : ((_ctf && _ctf.rotation) || 0);
          var _tfScaleX = _kfv && _kfv.scaleX != null ? _kfv.scaleX : ((_ctf && _ctf.scale) || 1);
          var _tfScaleY = _kfv && _kfv.scaleY != null ? _kfv.scaleY : ((_ctf && _ctf.scale) || 1);
          var hasTransform = !!(_ctf && (_ctf.flipH || _ctf.flipV)) || _tfRot !== 0 || _tfX !== 0 || _tfY !== 0 || _tfScaleX !== 1 || _tfScaleY !== 1;
          if (hasTransform) {
            drawTarget.save();
            if (_tfX || _tfY) drawTarget.translate(_tfX, _tfY);
            drawTarget.translate(pvs.width / 2, pvs.height / 2);
            if (_tfRot) drawTarget.rotate(_tfRot * Math.PI / 180);
            var sx = (_ctf && _ctf.flipH ? -1 : 1) * _tfScaleX;
            var sy = (_ctf && _ctf.flipV ? -1 : 1) * _tfScaleY;
            if (sx !== 1 || sy !== 1) drawTarget.scale(sx, sy);
            drawTarget.translate(-pvs.width / 2, -pvs.height / 2);
          }
          if (_kfv && _kfv.opacity != null) drawTarget.globalAlpha = Math.max(0, Math.min(1, _kfv.opacity));

          // Draw with transition if applicable
          if (window.VETransitions) {
            var _transState = VETransitions.getTransitionState(clip, time);
            var _inT = _transState.inTransition, _outT = _transState.outTransition;
            if (_inT || _outT) {
              // ── SMOOTH transition ──
              // (1) Pre-fit the current frame into a buffer so the transition blends a FITTED frame,
              //     matching the normal fitted render — no stretch/aspect jump when the transition
              //     kicks in (the old path drew stretched 0,0,w,h, which is what made it feel like a cut).
              var _fb = VE._veTransFitBuf || (VE._veTransFitBuf = document.createElement('canvas'));
              if (_fb.width !== pvs.width) _fb.width = pvs.width;
              if (_fb.height !== pvs.height) _fb.height = pvs.height;
              var _fbCtx = _fb.getContext('2d');
              _fbCtx.setTransform(1, 0, 0, 1, 0, 0);
              _fbCtx.clearRect(0, 0, pvs.width, pvs.height);
              _fbCtx.filter = 'none';
              VE._veDrawClipFitted(_fbCtx, clip, videoEl, pvs.width, pvs.height);

              // (2) Draw the NEIGHBOUR fitted underneath — prev feeds IN, next feeds OUT — so a
              //     crossfade blends between the two clips instead of fading to black.
              var _nb = _inT ? _prevClipForTransition[clip.id] : _nextClipForTransition[clip.id];
              if (_nb) {
                var _nbEl = VE._vePlayback.videoPool[_nb.id];
                if (_nbEl && !(_nbEl.tagName === 'VIDEO' && _nbEl.readyState < 2)) {
                  try {
                    if (_nb.type === 'video') {
                      var _nbT = _inT ? (_nb.duration * _nb.speed + (_nb.trimStart || 0)) : (_nb.trimStart || 0);
                      if (Math.abs(_nbEl.currentTime - _nbT) > 0.1) _nbEl.currentTime = _nbT;
                    }
                    drawTarget.filter = VE._veBuildFilterString(_nb.filters);
                    VE._veDrawClipFitted(drawTarget, _nb, _nbEl, pvs.width, pvs.height);
                  } catch (e) { /* neighbour frame not ready */ }
                }
              }
              // (3) Blend the fitted current frame over the neighbour with the transition.
              drawTarget.filter = filterStr;
              VETransitions.renderClipWithTransitions(drawTarget, clip, _fb, pvs.width, pvs.height, time);
            } else {
              VE._veDrawClipFitted(drawTarget, clip, videoEl, pvs.width, pvs.height);
            }
          } else {
            VE._veDrawClipFitted(drawTarget, clip, videoEl, pvs.width, pvs.height);
          }

          if (hasTransform) drawTarget.restore();
          if (_kfv && _kfv.opacity != null) drawTarget.globalAlpha = 1;
          drawTarget.filter = 'none';

          /* Chroma + the grade NODE CHAIN + AI BG, through the ONE function the BACKGROUND path
             also calls. This used to be a hand-mirrored twin of the bg block; keeping two copies is
             what let the bg one silently keep reading a deleted field and never get the GPU grader.
             (The grade is one 3D-LUT lookup per node: 334ms/frame CPU vs ~1.19ms GPU at 1080p,
             docs/power-windows-plan.md P0.) */
          if (offCanvas) VE._veApplyClipFx(clip, videoEl, offCanvas, offCtx, pvs.width, pvs.height, time);
          // (Neural Style Transfer removed — owner 2026-07-13: broken under COEP + too heavy.)

          // Apply pixel-level effects (sharpen, pixelate, glitch, motion-blur)
          var _hasPixelFx = clip.effects && clip.effects.length > 0;
          if (_hasPixelFx) {
            if (offCanvas) {
              // Already have offscreen canvas from complex effects — apply pixel fx there
              VE._veApplyPixelEffects(offCtx, clip, pvs.width, pvs.height);
            } else {
              // No offscreen yet — create one, copy main canvas content, apply pixel fx, composite back
              if (!VE._vePlayback._pixelFxCanvas) {
                VE._vePlayback._pixelFxCanvas = document.createElement('canvas');
                // This buffer exists ONLY so _veApplyPixelEffects has something to getImageData from,
                // so it is genuinely a mostly-read canvas and the hint belongs here.
                // Measured 2026-07-17: draw + getImageData + putImageData at 1080p costs 27.8ms
                // without it and 10.94ms with it (2.54x).
                // NOT added to _offCanvas / _bgEffCanvas: those are written for EVERY clip on EVERY
                // frame and only read when clip.effects is non-empty. willReadFrequently can drop a
                // canvas to CPU rendering, and this environment cannot measure that penalty (the
                // write path never syncs, so it times as ~0 either way). Guessing on a hot path is
                // how the plan's own "just drop the null" item turned out to be wrong.
                VE._vePlayback._pixelFxCtx = VE._vePlayback._pixelFxCanvas.getContext('2d', { willReadFrequently: true });
              }
              var _pfxC = VE._vePlayback._pixelFxCanvas;
              var _pfxCtx = VE._vePlayback._pixelFxCtx;
              if (_pfxC.width !== pvs.width || _pfxC.height !== pvs.height) {
                _pfxC.width = pvs.width; _pfxC.height = pvs.height;
              } else {
                _pfxCtx.clearRect(0, 0, pvs.width, pvs.height);
              }
              _pfxCtx.drawImage(pvs, 0, 0);
              VE._veApplyPixelEffects(_pfxCtx, clip, pvs.width, pvs.height);
              ctx.clearRect(0, 0, pvs.width, pvs.height);
              ctx.drawImage(_pfxC, 0, 0);
            }
          }

          // Composite offscreen result to main canvas with blend mode
          if (offCanvas) {
            if (clip.blendMode && clip.blendMode !== 'normal') {
              ctx.globalCompositeOperation = clip.blendMode;
            }
            ctx.drawImage(offCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
          } else {
            // No post-processing: blend mode was applied directly above
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        } catch (e) {
          // Phase 21: Report render errors for non-ready frames
          if (window.VEErrorHandler && e && e.message && e.message.indexOf('not ready') === -1) {
            VEErrorHandler.report('RenderError', 'Frame render failed: ' + e.message, { clipId: clip.id });
          }
        }
      });

      // Every remaining adjustment layer sits above every clip: grade the finished picture. Runs
      // BEFORE subtitles on purpose, so captions stay legible instead of being crushed by a heavy
      // vignette or a black-and-white pass.
      _flushAdjustments(Number.MAX_SAFE_INTEGER);

      // Render subtitle cues on preview canvas via the dedicated subtitle element
      // renderer (single source of truth = the captions track; burns into export
      // because export reuses this draw path).
      var _allTracks = VE._veProject.tracks;
      var subtitleTracks = _allTracks.filter(function(track) {
        // Cues can live on ANY track now, not just dedicated subtitle tracks. Mute is audio-only:
        // a muted video track must still burn its subtitles (same fix as the clip-gather loop above).
        if (track.muted && track.type === 'audio') return false;
        // `captionVisible` is NOT read directly: VESubtitleElement.captionsVisible is THE rule, and it
        // only honours a false flag while a replacement set (dubbing / translation) actually carries
        // cues. Read raw, an empty or deleted destination hid the only subtitles in the project.
        if (window.VESubtitleElement && VESubtitleElement.captionsVisible) {
          return VESubtitleElement.captionsVisible(track, _allTracks);
        }
        return !(track.captionVisible === false || !track.cues || !track.cues.length);
      });
      if (window.VESubtitleElement && VESubtitleElement.renderTracks) {
        VESubtitleElement.renderTracks(ctx, subtitleTracks, time, pvs.width, pvs.height);
      } else {
        subtitleTracks.forEach(function(track) {
          if (window.VESubtitleElement) VESubtitleElement.renderTrack(ctx, track, time, pvs.width, pvs.height);
          else if (window.VESubtitles) VESubtitles.renderCues(ctx, track.cues, time, pvs.width, pvs.height, track.subtitleStyle);
        });
      }

      // Pause video elements that are no longer in the active time range
      if (VE._vePlayback.playing) {
        var _activeVids = {};
        if (bgClip) _activeVids[bgClip.id] = true;
        activeClips.forEach(function(c) { if (c.type === 'video') _activeVids[c.id] = true; });
        Object.keys(VE._vePlayback.videoPool).forEach(function(id) {
          var el = VE._vePlayback.videoPool[id];
          if (el && !el.paused && !_activeVids[id]) el.pause();
        });
      }
    }

    // When called from export with skipFabricSync=true, don't touch the live
    // Fabric canvas — the export uses its own StaticCanvas snapshot instead.
    if (!skipFabricSync) {
      // Show/hide overlay objects based on their clip time range
      VE._veSyncOverlayVisibility(time);

      // Mark the preview Fabric.Image as dirty so Fabric redraws from updated canvas
      if (VE._veUi.previewFabricImg) VE._veUi.previewFabricImg.dirty = true;

      // Move any tracked power-window OUTLINES to their position for this frame, so the shape the
      // user sees follows the subject (the grade already does). No-op when nothing is tracked.
      if (window.VEPowerWindows && VEPowerWindows.onPlayhead) VEPowerWindows.onPlayhead(time);

      // Re-render Fabric canvas to display the updated video frame + overlays
      if (typeof canvas !== 'undefined' && canvas) canvas.renderAll();
    }

    // Plugin hook: afterRender
    if (window.VEPluginSystem) VEPluginSystem.runHook('afterRender', { time: time });
  };

  VE._veCloseProgramMonitor = function () {
    var monitor = VE._veProgramMonitor;
    if (!monitor) return;
    VE._veProgramMonitor = null;
    if (monitor.timer) clearInterval(monitor.timer);
    if (monitor.raf) cancelAnimationFrame(monitor.raf);
    if (monitor.stream) monitor.stream.getTracks().forEach(function (track) { try { track.stop(); } catch (e) {} });
    try { if (monitor.win && !monitor.win.closed) monitor.win.close(); } catch (e) {}
  };

  VE._veOpenProgramMonitor = function () {
    if (VE._veProgramMonitor && VE._veProgramMonitor.win && !VE._veProgramMonitor.win.closed) {
      VE._veProgramMonitor.win.focus();
      return;
    }
    var source = (typeof canvas !== 'undefined' && canvas && canvas.lowerCanvasEl) || VE._veUi.previewCanvas;
    if (!source) return;
    var monitorWindow = window.open('', 'cc-program-monitor', 'popup=yes,width=1100,height=720,resizable=yes');
    if (!monitorWindow) {
      if (typeof showToast === 'function') showToast('Program Monitor popup was blocked. Allow popups for this editor.', 'error');
      return;
    }
    var doc = monitorWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><title>Program Monitor</title><style>' +
      'html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#08080a;color:#ededf0;font:12px system-ui,sans-serif}' +
      '.pm{height:100%;display:grid;grid-template-rows:1fr 44px}.screen{min-height:0;display:grid;place-items:center;background:#000}' +
      'video,canvas{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}' +
      '.bar{display:flex;align-items:center;justify-content:center;gap:10px;border-top:1px solid #2a2a31;background:#151519}' +
      'button{height:30px;padding:0 12px;border:1px solid #34343c;background:#202026;color:#ededf0;cursor:pointer}' +
      'button:hover{border-color:#f2ff58;color:#f2ff58}.time{min-width:150px;text-align:center;font-variant-numeric:tabular-nums;color:#a8a8b2}' +
      '.note{position:absolute;right:12px;bottom:55px;color:#777780;font-size:10px}' +
      '</style></head><body><div class="pm"><div class="screen"><video id="pm-video" muted autoplay playsinline></video><canvas id="pm-canvas" hidden></canvas></div>' +
      '<div class="bar"><button id="pm-play">Play / Pause</button><span class="time" id="pm-time">0:00 / 0:00</span><button id="pm-full">Fullscreen</button><button id="pm-close">Close</button></div></div>' +
      '<div class="note">Audio remains in editor window</div></body></html>');
    doc.close();
    var video = doc.getElementById('pm-video');
    var mirror = doc.getElementById('pm-canvas');
    var stream = null;
    var raf = null;
    if (typeof source.captureStream === 'function') {
      try { stream = source.captureStream(30); video.srcObject = stream; video.play().catch(function () {}); } catch (e) { stream = null; }
    }
    if (!stream) {
      video.hidden = true;
      mirror.hidden = false;
      var mirrorCtx = mirror.getContext('2d');
      var draw = function () {
        if (monitorWindow.closed) return;
        if (mirror.width !== source.width || mirror.height !== source.height) { mirror.width = source.width; mirror.height = source.height; }
        try { mirrorCtx.drawImage(source, 0, 0); } catch (e) {}
        raf = requestAnimationFrame(draw);
        if (VE._veProgramMonitor) VE._veProgramMonitor.raf = raf;
      };
      draw();
    }
    doc.getElementById('pm-play').addEventListener('click', VE._veTogglePlay);
    doc.getElementById('pm-full').addEventListener('click', function () {
      var target = stream ? video : mirror;
      if (target.requestFullscreen) target.requestFullscreen().catch(function () {});
    });
    doc.getElementById('pm-close').addEventListener('click', VE._veCloseProgramMonitor);
    var timer = setInterval(function () {
      if (monitorWindow.closed) { VE._veCloseProgramMonitor(); return; }
      var time = doc.getElementById('pm-time');
      if (time) time.textContent = VE._veFormatTime(VE._veProject.playheadTime || 0) + ' / ' + VE._veFormatTime(VE._veProject.duration || 0);
    }, 250);
    VE._veProgramMonitor = { win: monitorWindow, stream: stream, timer: timer, raf: raf };
    monitorWindow.addEventListener('beforeunload', function () {
      if (VE._veProgramMonitor && VE._veProgramMonitor.win === monitorWindow) VE._veCloseProgramMonitor();
    });
  };

  VE._veToggleTimelineFocus = function () {
    var area = document.getElementById('canvas-area') || (VE._veUi.host && VE._veUi.host.parentElement);
    if (!area) return;
    var enabled = !area.classList.contains('ve-timeline-focus');
    area.classList.toggle('ve-timeline-focus', enabled);
    var button = document.getElementById('ve-btn-timeline-focus');
    if (button) button.classList.toggle('is-active', enabled);
    if (VE._veUi.host) VE._veUi.host.style.height = enabled ? '' : (VE._veUi.panelHeight || VE.DEFAULT_PANEL_HEIGHT) + 'px';
    requestAnimationFrame(function () { VE._veRender(); });
  };

  VE._veAutoScrollPlayhead = function (force) {
    if (!force && VE._veViewportMode === 'free') return;
    var wrap = document.getElementById('ve-scroll-wrap');
    if (!wrap) return;
    var px = VE._veProject.playheadTime * VE._veProject.zoom;
    var scrollLeft = wrap.scrollLeft;
    var viewWidth = wrap.clientWidth;
    if (px < scrollLeft || px > scrollLeft + viewWidth - 40) {
      VE._veProgrammaticScroll = true;
      wrap.scrollLeft = Math.max(0, px - viewWidth * 0.3);
      requestAnimationFrame(function () { VE._veProgrammaticScroll = false; });
    }
  };

  VE._veBindScrollSync = function () {
    if (VE._veScrollSyncBound) return;
    var wrap = document.getElementById('ve-scroll-wrap');
    var headers = document.getElementById('ve-track-headers');
    if (wrap && headers) {
      wrap.addEventListener('scroll', function() {
        if (!VE._veProgrammaticScroll && typeof VE._veSetViewportMode === 'function') VE._veSetViewportMode('free');
        headers.scrollTop = wrap.scrollTop;
        var duration = VE._veProject && VE._veProject.duration || 0;
        if (duration > 600 && VE._veRenderTracks) {
          var zoom = Math.max(VE.PX_PER_SEC_MIN, VE._veProject.zoom || 1);
          var bucket = Math.floor(wrap.scrollLeft / (zoom * 60));
          if (bucket !== VE._veVirtualRenderBucket && !VE._veVirtualRenderPending) {
            VE._veVirtualRenderBucket = bucket;
            VE._veVirtualRenderPending = true;
            requestAnimationFrame(function () {
              VE._veVirtualRenderPending = false;
              VE._veRenderTracks();
            });
          }
        }
      });
      // Vertical wheel ANYWHERE in the timeline scrolls the tracks. The
      // track-headers column is overflow:hidden and would otherwise swallow the
      // wheel (nothing scrolls), and the canvas wheel-block can eat wheels over
      // gaps - so route the whole timeline body's vertical wheel to the tracks
      // (owner: "track scroll disabled when a subtitle appears"). ctrl = zoom
      // (handled elsewhere); horizontal-dominant gestures keep native behaviour.
      var body = wrap.parentElement; // .ve-timeline-body (contains headers + wrap)
      (body || wrap).addEventListener('wheel', function(e) {
        if (e.ctrlKey) return;
        if (wrap.scrollHeight <= wrap.clientHeight) return;        // nothing to scroll
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;       // let horizontal scroll pass
        wrap.scrollTop += e.deltaY;
        headers.scrollTop = wrap.scrollTop;
        e.preventDefault();
      }, { passive: false });
      VE._veScrollSyncBound = true;
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'preview-render', parent: 'video.video-editor', title: 'video-editor: preview-render', mount: function () {}, unmount: function () {} });
  }
})();
