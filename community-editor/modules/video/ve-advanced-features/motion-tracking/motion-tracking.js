/* Module: video/ve-advanced-features/motion-tracking — Motion Tracking — Lucas-Kanade point/region + FaceMesh face tracking
   Part of the ve-advanced-features group (decomposed from the 2015-line IIFE). Functions hang off the
   shared namespace VEA (window.__ccVEAdvanced, created by the parent); cross-module refs resolve
   through VEA at call time, so sibling load order does not matter.

   ⚠ FACE TRACKING (trackFace / faceToAutoZoom / _loadFaceMesh) = ALPHA, UI HIDDEN (2026-07-18).
   Early proof-of-concept kept for reference: it runs a whole-clip main-thread seek loop with no
   cancel/progress (reads as a UI freeze) and its result plumbing was never completed (returns an
   array; consumers expected {frames}), so no feature ever consumed the data. The inspector section
   and effects-library card are gated off. Planned replacement: MediaPipe Tasks Vision Face
   Landmarker with a worker/progress pipeline (the legacy @mediapipe/face_mesh CDN API used here is
   superseded).

   The POINT-CLOUD region tracker below (trackRegion/_cloudStep/_seedPoints/_lkPyr) is separate,
   current, and used by power windows - do not confuse the two. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;

  VEA.MotionTracker = function () {
    this._trackPoints = [];  // [{frame, x, y, confidence}]
    this._regionTracks = []; // [{frame, x, y, w, h, rotation}]
    this._offCanvas = document.createElement('canvas');
    this._offCtx = this._offCanvas.getContext('2d');
    this._prevFrame = null;
    this._status = 'idle'; // 'idle' | 'tracking' | 'done'
  };

  VEA._toGrayscale = function (data, w, h) {
    var gray = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) {
      var idx = i * 4;
      gray[i] = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    }
    return gray;
  };

  VEA._lucasKanade = function (prev, curr, w, h, px, py, halfWin) {
    var ix = Math.round(px);
    var iy = Math.round(py);
    var sumIxx = 0, sumIyy = 0, sumIxy = 0, sumIxt = 0, sumIyt = 0;

    for (var dy = -halfWin; dy <= halfWin; dy++) {
      for (var dx = -halfWin; dx <= halfWin; dx++) {
        var x = ix + dx;
        var y = iy + dy;
        if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) continue;

        // Spatial gradients (Sobel-like)
        var Ix = (prev[y * w + x + 1] - prev[y * w + x - 1]) * 0.5;
        var Iy = (prev[(y + 1) * w + x] - prev[(y - 1) * w + x]) * 0.5;
        var It = curr[y * w + x] - prev[y * w + x];

        sumIxx += Ix * Ix;
        sumIyy += Iy * Iy;
        sumIxy += Ix * Iy;
        sumIxt += Ix * It;
        sumIyt += Iy * It;
      }
    }

    var det = sumIxx * sumIyy - sumIxy * sumIxy;
    if (Math.abs(det) < 1e-6) {
      return { dx: 0, dy: 0, confidence: 0 };
    }

    var vx = -(sumIyy * sumIxt - sumIxy * sumIyt) / det;
    var vy = -(sumIxx * sumIyt - sumIxy * sumIxt) / det;

    // Confidence based on minimum eigenvalue
    var trace = sumIxx + sumIyy;
    var eigMin = 0.5 * (trace - Math.sqrt(Math.max(0, trace * trace - 4 * det)));
    var confidence = Math.min(1, eigMin / 100);

    return { dx: vx, dy: vy, confidence: confidence };
  };

  VEA._extractPatch = function (gray, w, h, rect) {
    var pw = Math.round(rect.w);
    var ph = Math.round(rect.h);
    if (pw < 2 || ph < 2) return null;
    var patch = new Float32Array(pw * ph);
    for (var y = 0; y < ph; y++) {
      for (var x = 0; x < pw; x++) {
        var sx = Math.round(rect.x + x);
        var sy = Math.round(rect.y + y);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          patch[y * pw + x] = gray[sy * w + sx];
        }
      }
    }
    return { data: patch, w: pw, h: ph };
  };

  VEA._templateMatch = function (gray, w, h, template, rect, searchRadius) {
    var bestX = rect.x, bestY = rect.y, bestScore = -1;
    var pw = template.w, ph = template.h;

    for (var dy = -searchRadius; dy <= searchRadius; dy++) {
      for (var dx = -searchRadius; dx <= searchRadius; dx++) {
        var cx = Math.round(rect.x + dx);
        var cy = Math.round(rect.y + dy);
        if (cx < 0 || cy < 0 || cx + pw > w || cy + ph > h) continue;

        // NCC (Normalized Cross-Correlation)
        var sumAB = 0, sumAA = 0, sumBB = 0;
        for (var y = 0; y < ph; y++) {
          for (var x = 0; x < pw; x++) {
            var a = template.data[y * pw + x];
            var b = gray[(cy + y) * w + (cx + x)];
            sumAB += a * b;
            sumAA += a * a;
            sumBB += b * b;
          }
        }

        var denom = Math.sqrt(sumAA * sumBB);
        var score = denom > 0 ? sumAB / denom : 0;

        if (score > bestScore) {
          bestScore = score;
          bestX = cx;
          bestY = cy;
        }
      }
    }

    return { x: bestX, y: bestY, confidence: bestScore };
  };

  /* ── POINT-CLOUD tracking (v2, 2026-07-17) ─────────────────────────────────
     v1 matched ONE template of the whole window by NCC at 10 samples/sec. On real footage (fast
     handheld motion, the subject shrinking as she walks away) the inter-sample motion exceeded the
     search radius, the lock died on the first hard frame, the confidence cutoff stopped keyframe
     production, and the window FROZE at its last offset - the owner's "sabit kaliyor" screenshots.
     A single template is also all-or-nothing: one occlusion kills it.

     v2 is the architecture real window trackers (Resolve's cloud tracker) use:
       1. find ~40 corner points INSIDE the drawn window (Shi-Tomasi min-eigenvalue),
       2. every analysis frame, track each point with PYRAMIDAL iterative Lucas-Kanade
          (a 3-level pyramid catches motion far beyond a single-level search),
       3. kill bad points with a FORWARD-BACKWARD check (track prev->curr, then curr->prev;
          if it does not come home, the point lied),
       4. fit translation = MEDIAN of the survivors' motion, scale = median ratio of each
          survivor's distance to the cloud centroid (medians shrug off outliers),
       5. re-seed points inside the moved window when too many die.
     One point dying means nothing; the cloud survives occlusion, texture loss and scale change.
     Confidence = surviving fraction, so the keyframe cutoff only fires on a REAL loss. */

  /* Separable box blur on a grayscale Float32 plane. Light pre-smoothing suppresses sensor noise
     and pixel-level aliasing before gradients are taken, which steadies both seeding and LK. */
  VEA._boxBlurGray = function (gray, w, h, r) {
    r = r || 2;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    var x, y, k, s, n;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        s = 0; n = 0;
        for (k = -r; k <= r; k++) { var xx = x + k; if (xx >= 0 && xx < w) { s += gray[y * w + xx]; n++; } }
        tmp[y * w + x] = s / n;
      }
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        s = 0; n = 0;
        for (k = -r; k <= r; k++) { var yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
        out[y * w + x] = s / n;
      }
    }
    return out;
  };

  VEA._bilSample = function (g, w, h, x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0) x0 = 0; else if (x0 > w - 2) x0 = w - 2;
    if (y0 < 0) y0 = 0; else if (y0 > h - 2) y0 = h - 2;
    var fx = x - x0, fy = y - y0;
    if (fx < 0) fx = 0; else if (fx > 1) fx = 1;
    if (fy < 0) fy = 0; else if (fy > 1) fy = 1;
    var i = y0 * w + x0;
    return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) +
           g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
  };

  // Half-resolution downsample (2x2 mean). Levels: [{g,w,h} full, half, quarter].
  VEA._buildPyr = function (gray, w, h, levels) {
    var pyr = [{ g: gray, w: w, h: h }];
    for (var l = 1; l < (levels || 3); l++) {
      var pw = pyr[l - 1].w, ph = pyr[l - 1].h, pg = pyr[l - 1].g;
      var nw = pw >> 1, nh = ph >> 1;
      if (nw < 16 || nh < 16) break;
      var ng = new Float32Array(nw * nh);
      for (var y = 0; y < nh; y++) {
        for (var x = 0; x < nw; x++) {
          var i = (y * 2) * pw + (x * 2);
          ng[y * nw + x] = (pg[i] + pg[i + 1] + pg[i + pw] + pg[i + pw + 1]) * 0.25;
        }
      }
      pyr.push({ g: ng, w: nw, h: nh });
    }
    return pyr;
  };

  /* Shi-Tomasi seeding: min-eigenvalue of the gradient covariance on a grid inside the rect, top-N
     with a minimum spacing so the cloud covers the window instead of clumping on one edge. */
  VEA._seedPoints = function (gray, w, h, rect, maxPts) {
    var cand = [];
    var step = 2, half = 3;
    var x0 = Math.max(half + 1, Math.round(rect.x)), x1 = Math.min(w - half - 2, Math.round(rect.x + rect.w));
    var y0 = Math.max(half + 1, Math.round(rect.y)), y1 = Math.min(h - half - 2, Math.round(rect.y + rect.h));
    for (var y = y0; y <= y1; y += step) {
      for (var x = x0; x <= x1; x += step) {
        var sxx = 0, syy = 0, sxy = 0;
        for (var dy = -half; dy <= half; dy++) {
          for (var dx = -half; dx <= half; dx++) {
            var i = (y + dy) * w + (x + dx);
            var Ix = (gray[i + 1] - gray[i - 1]) * 0.5;
            var Iy = (gray[i + w] - gray[i - w]) * 0.5;
            sxx += Ix * Ix; syy += Iy * Iy; sxy += Ix * Iy;
          }
        }
        var tr = sxx + syy;
        var det = sxx * syy - sxy * sxy;
        var eigMin = 0.5 * (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det)));
        if (eigMin > 30) cand.push({ x: x, y: y, q: eigMin });
      }
    }
    cand.sort(function (p, q) { return q.q - p.q; });
    var pts = [], MIN_D2 = 36;   // 6px spacing
    for (var c = 0; c < cand.length && pts.length < (maxPts || 40); c++) {
      var ok = true;
      for (var k = 0; k < pts.length; k++) {
        var ddx = cand[c].x - pts[k].x, ddy = cand[c].y - pts[k].y;
        if (ddx * ddx + ddy * ddy < MIN_D2) { ok = false; break; }
      }
      if (ok) pts.push({ x: cand[c].x, y: cand[c].y });
    }
    return pts;
  };

  // Iterative LK for one point at one pyramid level. Returns {x,y} or null (flat/diverged).
  VEA._lkPoint = function (prev, curr, w, h, px, py, gx, gy, half, iters) {
    var sxx = 0, syy = 0, sxy = 0;
    var n = (2 * half + 1) * (2 * half + 1);
    var Pv = new Float32Array(n), Gx = new Float32Array(n), Gy = new Float32Array(n);
    var k = 0, dx, dy;
    for (dy = -half; dy <= half; dy++) {
      for (dx = -half; dx <= half; dx++) {
        var X = px + dx, Y = py + dy;
        var Ix = (VEA._bilSample(prev, w, h, X + 1, Y) - VEA._bilSample(prev, w, h, X - 1, Y)) * 0.5;
        var Iy = (VEA._bilSample(prev, w, h, X, Y + 1) - VEA._bilSample(prev, w, h, X, Y - 1)) * 0.5;
        Pv[k] = VEA._bilSample(prev, w, h, X, Y);
        Gx[k] = Ix; Gy[k] = Iy; k++;
        sxx += Ix * Ix; syy += Iy * Iy; sxy += Ix * Iy;
      }
    }
    var det = sxx * syy - sxy * sxy;
    if (Math.abs(det) < 1e-4) return null;
    var vx = gx - px, vy = gy - py;
    for (var it = 0; it < (iters || 5); it++) {
      var bx = 0, by = 0; k = 0;
      for (dy = -half; dy <= half; dy++) {
        for (dx = -half; dx <= half; dx++) {
          var It = VEA._bilSample(curr, w, h, px + dx + vx, py + dy + vy) - Pv[k];
          bx += Gx[k] * It; by += Gy[k] * It; k++;
        }
      }
      var ddx2 = -(syy * bx - sxy * by) / det;
      var ddy2 = -(sxx * by - sxy * bx) / det;
      vx += ddx2; vy += ddy2;
      if (ddx2 * ddx2 + ddy2 * ddy2 < 0.001) break;
      if (vx * vx + vy * vy > 40 * 40) return null;   // diverged
    }
    return { x: px + vx, y: py + vy };
  };

  // Pyramidal wrapper: solve at the coarsest level first, scale the answer up as the next guess.
  VEA._lkPyr = function (prevPyr, currPyr, px, py) {
    var L = prevPyr.length - 1;
    var f = Math.pow(2, L);
    var gx = px / f, gy = py / f;
    for (var l = L; l >= 0; l--) {
      var pf = Math.pow(2, l);
      var r = VEA._lkPoint(prevPyr[l].g, currPyr[l].g, prevPyr[l].w, prevPyr[l].h,
                           px / pf, py / pf, gx, gy, 4, 5);
      if (!r) return null;
      if (l > 0) { gx = r.x * 2; gy = r.y * 2; }
      else return r;
    }
    return null;
  };

  function _median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* One cloud step, PURE (pyramids in, state out) so it is testable without video decode.
     st = { cx, cy, w0, h0, s, pts:[{x,y}] } in analysis px. Returns { conf } (surviving fraction). */
  VEA._cloudStep = function (prevPyr, currPyr, st) {
    var W = currPyr[0].w, H = currPyr[0].h;
    var moved = [], from = [];
    for (var i = 0; i < st.pts.length; i++) {
      var p = st.pts[i];
      var f = VEA._lkPyr(prevPyr, currPyr, p.x, p.y);
      if (!f) continue;
      // forward-backward: a point that does not track home lied about where it went
      var b = VEA._lkPyr(currPyr, prevPyr, f.x, f.y);
      if (!b) continue;
      var ex = b.x - p.x, ey = b.y - p.y;
      if (ex * ex + ey * ey > 2.25) continue;   // 1.5px
      moved.push(f); from.push(p);
    }
    var total = st.pts.length || 1;
    if (moved.length < 4) { st.pts = moved; return { conf: moved.length / total }; }

    // translation = median of per-point motion (outliers cannot vote it away)
    var dxs = [], dys = [];
    for (i = 0; i < moved.length; i++) { dxs.push(moved[i].x - from[i].x); dys.push(moved[i].y - from[i].y); }
    var mdx = _median(dxs), mdy = _median(dys);

    // scale = median ratio of each survivor's distance to the cloud centroid, before vs after
    var c0x = 0, c0y = 0, c1x = 0, c1y = 0;
    for (i = 0; i < moved.length; i++) { c0x += from[i].x; c0y += from[i].y; c1x += moved[i].x; c1y += moved[i].y; }
    c0x /= moved.length; c0y /= moved.length; c1x /= moved.length; c1y /= moved.length;
    var ratios = [];
    for (i = 0; i < moved.length; i++) {
      var d0 = Math.hypot(from[i].x - c0x, from[i].y - c0y);
      var d1 = Math.hypot(moved[i].x - c1x, moved[i].y - c1y);
      if (d0 > 3) ratios.push(d1 / d0);
    }
    var sf = ratios.length >= 4 ? _median(ratios) : 1;
    if (sf < 0.9) sf = 0.9; else if (sf > 1.1) sf = 1.1;   // per-frame clamp kills scale jitter

    st.cx += mdx; st.cy += mdy;
    st.s *= sf;
    st.pts = moved;

    // Re-seed when the cloud thins: new corners inside the CURRENT window, merged with survivors,
    // so the tracker heals instead of bleeding out.
    if (st.pts.length < 24) {
      var rw = st.w0 * st.s, rh = st.h0 * st.s;
      var fresh = VEA._seedPoints(currPyr[0].g, W, H,
        { x: st.cx - rw / 2, y: st.cy - rh / 2, w: rw, h: rh }, 40);
      for (i = 0; i < fresh.length && st.pts.length < 40; i++) {
        var okp = true;
        for (var k2 = 0; k2 < st.pts.length; k2++) {
          var qx = fresh[i].x - st.pts[k2].x, qy = fresh[i].y - st.pts[k2].y;
          if (qx * qx + qy * qy < 36) { okp = false; break; }
        }
        if (okp) st.pts.push(fresh[i]);
      }
    }
    return { conf: moved.length / total };
  };

  /* Track a region across a VIDEO TIME range [v0, v1] (seconds in the source video, NOT timeline
     time - the caller maps trim/speed). One offline pass; playback later only reads the stored
     keyframes. Restores the element's currentTime when done, because this seeks the same pool
     element the preview plays. */
  VEA.trackRegion = function (videoEl, opts, callback) {
    var AW = 320;
    var scale = AW / (videoEl.videoWidth || AW);
    var aw = AW, ah = Math.max(32, Math.round((videoEl.videoHeight || 180) * scale));
    var cv = document.createElement('canvas'); cv.width = aw; cv.height = ah;
    var c2d = cv.getContext('2d', { willReadFrequently: true });

    var rx = opts.rect.x * scale, ry = opts.rect.y * scale;
    var rw = Math.max(10, opts.rect.w * scale), rh = Math.max(10, opts.rect.h * scale);
    var st = { cx: rx + rw / 2, cy: ry + rh / 2, w0: rw, h0: rh, s: 1, pts: [] };

    var out = [];
    var t = opts.v0;
    /* PER-FRAME stepping (1/30 default). Resolve/Premiere/CapCut all analyse EVERY frame and write a
       keyframe per frame; that is what makes a mask ride camera SHAKE 1:1. The earlier 1/15s step
       under-sampled high-frequency motion: the interpolation between samples smoothed the shake away
       and the window read as "sabit" on handheld footage (the owner's mirror test). 1/30 matches
       typical footage fps; pass opts.step to override (e.g. 1/60 for slow-mo sources). */
    var step = opts.step || (1 / 30);
    var prevTime = videoEl.currentTime;
    var prevPyr = null;
    var guard = null;
    function finish() {
      if (guard) { clearTimeout(guard); guard = null; }
      videoEl.onseeked = null;
      try { videoEl.currentTime = prevTime; } catch (e) {}
      callback(out);
    }
    function grab() {
      if (guard) { clearTimeout(guard); guard = null; }
      try {
        c2d.drawImage(videoEl, 0, 0, aw, ah);
        var gray = VEA._boxBlurGray(VEA._toGrayscale(c2d.getImageData(0, 0, aw, ah).data, aw, ah), aw, ah, 1);
        var pyr = VEA._buildPyr(gray, aw, ah, 3);
        if (!prevPyr) {
          st.pts = VEA._seedPoints(gray, aw, ah, { x: rx, y: ry, w: rw, h: rh }, 40);
          // Capture the seed cloud in source-normalized coords (0..1 of the media) so the
          // caller can visualise WHAT the tracker locked onto. aw/ah = scaled media dims,
          // so p.x/aw is the media-fraction x directly.
          out._seed = st.pts.map(function (p) { return [p.x / aw, p.y / ah]; });
          out.push({ t: t, cx: st.cx / scale, cy: st.cy / scale, s: 1, conf: st.pts.length >= 6 ? 1 : 0 });
        } else {
          var r = VEA._cloudStep(prevPyr, pyr, st);
          out.push({ t: t, cx: st.cx / scale, cy: st.cy / scale, s: st.s, conf: r.conf });
        }
        prevPyr = pyr;
      } catch (e) { finish(); return; }
      if (opts.onProgress) { try { opts.onProgress((t - opts.v0) / Math.max(0.001, opts.v1 - opts.v0)); } catch (e2) {} }
      t += step;
      if (t > opts.v1 + 1e-6) { finish(); return; }
      seek();
    }
    function seek() {
      videoEl.onseeked = grab;
      // Backstop: a seek to (nearly) the current position may never fire 'seeked'; proceed anyway
      // rather than hanging the whole analysis on one frame.
      guard = setTimeout(grab, 1500);
      try { videoEl.currentTime = Math.min(t, videoEl.duration || t); } catch (e) { finish(); }
    }
    seek();
  };

  VEA._loadFaceMesh = function () {
    return new Promise(function(resolve, reject) {
      if (VEA._faceMeshLoaded && VEA._faceMeshInstance) { resolve(VEA._faceMeshInstance); return; }
      if (VEA._faceMeshLoading) {
        var poll = setInterval(function() {
          if (VEA._faceMeshLoaded) { clearInterval(poll); resolve(VEA._faceMeshInstance); }
        }, 200);
        setTimeout(function() { clearInterval(poll); reject(new Error('FaceMesh load timeout')); }, 30000);
        return;
      }
      VEA._faceMeshLoading = true;
      var script = document.createElement('script');
      script.src = VEA.FACEMESH_CDN + '/face_mesh.js';
      script.onload = function() {
        try {
          VEA._faceMeshInstance = new FaceMesh({
            locateFile: function(file) { return VEA.FACEMESH_CDN + '/' + file; }
          });
          VEA._faceMeshInstance.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });
          VEA._faceMeshInstance.initialize().then(function() {
            VEA._faceMeshLoaded = true;
            VEA._faceMeshLoading = false;
            console.log('[VEA.MotionTracker] FaceMesh initialized');
            resolve(VEA._faceMeshInstance);
          }).catch(reject);
        } catch (err) { VEA._faceMeshLoading = false; reject(err); }
      };
      script.onerror = function() { VEA._faceMeshLoading = false; reject(new Error('Failed to load FaceMesh')); };
      document.head.appendChild(script);
    });
  };

  VEA.MotionTracker.prototype.trackPoint = function(videoEl, startTime, px, py, callback) {
    if (!videoEl || !videoEl.duration) return;

    var self = this;
    self._status = 'tracking';
    self._trackPoints = [];

    var w = 64; // Tracking at low res
    var h = 36;
    var winSize = 7; // Window size for LK
    var halfWin = Math.floor(winSize / 2);

    self._offCanvas.width = w;
    self._offCanvas.height = h;

    // Scale point to tracking resolution
    var scaleX = w / (videoEl.videoWidth || 1);
    var scaleY = h / (videoEl.videoHeight || 1);
    var curX = px * scaleX;
    var curY = py * scaleY;

    var fps = 15;
    var dt = 1 / fps;
    var time = startTime;
    var prevGray = null;

    function processNextFrame() {
      if (time > videoEl.duration || self._status !== 'tracking') {
        self._status = 'done';
        if (callback) callback(self._trackPoints);
        return;
      }

      videoEl.currentTime = time;
      videoEl.onseeked = function() {
        videoEl.onseeked = null;
        self._offCtx.drawImage(videoEl, 0, 0, w, h);
        var imgData = self._offCtx.getImageData(0, 0, w, h);
        var gray = VEA._toGrayscale(imgData.data, w, h);

        if (prevGray) {
          var result = VEA._lucasKanade(prevGray, gray, w, h, curX, curY, halfWin);
          curX += result.dx;
          curY += result.dy;

          // Bounds check
          curX = Math.max(0, Math.min(w - 1, curX));
          curY = Math.max(0, Math.min(h - 1, curY));

          self._trackPoints.push({
            frame: time,
            x: curX / scaleX,
            y: curY / scaleY,
            confidence: result.confidence
          });
        } else {
          self._trackPoints.push({
            frame: time,
            x: px,
            y: py,
            confidence: 1.0
          });
        }

        prevGray = gray;
        time += dt;
        setTimeout(processNextFrame, 0);
      };
    }

    processNextFrame();
  };

  VEA.MotionTracker.prototype.trackRegion = function(videoEl, startTime, rect, callback) {
    if (!videoEl || !videoEl.duration) return;

    var self = this;
    self._status = 'tracking';
    self._regionTracks = [];

    var w = 128;
    var h = 72;
    self._offCanvas.width = w;
    self._offCanvas.height = h;

    var scaleX = w / (videoEl.videoWidth || 1);
    var scaleY = h / (videoEl.videoHeight || 1);

    var curRect = {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      w: rect.w * scaleX,
      h: rect.h * scaleY
    };

    var fps = 15;
    var dt = 1 / fps;
    var time = startTime;
    var prevGray = null;
    var templatePatch = null;

    function processNext() {
      if (time > videoEl.duration || self._status !== 'tracking') {
        self._status = 'done';
        if (callback) callback(self._regionTracks);
        return;
      }

      videoEl.currentTime = time;
      videoEl.onseeked = function() {
        videoEl.onseeked = null;
        self._offCtx.drawImage(videoEl, 0, 0, w, h);
        var imgData = self._offCtx.getImageData(0, 0, w, h);
        var gray = VEA._toGrayscale(imgData.data, w, h);

        if (prevGray && templatePatch) {
          // Simple NCC-based template matching in local search area
          var best = VEA._templateMatch(gray, w, h, templatePatch, curRect, 8);
          curRect.x = best.x;
          curRect.y = best.y;

          self._regionTracks.push({
            frame: time,
            x: curRect.x / scaleX,
            y: curRect.y / scaleY,
            w: curRect.w / scaleX,
            h: curRect.h / scaleY,
            confidence: best.confidence
          });
        } else {
          self._regionTracks.push({
            frame: time,
            x: rect.x, y: rect.y, w: rect.w, h: rect.h,
            confidence: 1.0
          });
        }

        // Extract template
        templatePatch = VEA._extractPatch(gray, w, h, curRect);
        prevGray = gray;
        time += dt;
        setTimeout(processNext, 0);
      };
    }

    processNext();
  };

  VEA.MotionTracker.prototype.toKeyframes = function() {
    var points = this._trackPoints.length > 0 ? this._trackPoints : this._regionTracks;
    var keyframes = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      keyframes.push({
        time: p.frame,
        x: p.x,
        y: p.y,
        confidence: p.confidence
      });
    }
    return keyframes;
  };

  VEA.MotionTracker.prototype.stop = function() {
    this._status = 'idle';
  };

  VEA.MotionTracker.prototype.getStatus = function() {
    return this._status;
  };

  VEA.MotionTracker.prototype.trackFace = function(videoEl, startTime, opts, callback) {
    if (!videoEl || !videoEl.duration) return;
    opts = opts || {};

    var self = this;
    self._status = 'tracking';
    self._faceTracks = [];

    var fps = opts.fps || 10;
    var dt = 1 / fps;
    var time = startTime;
    var endTime = opts.endTime || videoEl.duration;

    var trackCanvas = document.createElement('canvas');
    var trackW = 320; // Low res for speed
    var trackH = 180;
    trackCanvas.width = trackW;
    trackCanvas.height = trackH;
    var trackCtx = trackCanvas.getContext('2d');

    var scaleX = (videoEl.videoWidth || trackW) / trackW;
    var scaleY = (videoEl.videoHeight || trackH) / trackH;

    VEA._loadFaceMesh().then(function(faceMesh) {
      var facePending = false;
      var faceResult = null;

      faceMesh.onResults(function(results) {
        faceResult = results;
        facePending = false;
      });

      function processNext() {
        if (time > endTime || self._status !== 'tracking') {
          self._status = 'done';
          if (callback) callback(self._faceTracks);
          return;
        }

        videoEl.currentTime = time;
        videoEl.onseeked = function() {
          videoEl.onseeked = null;
          trackCtx.drawImage(videoEl, 0, 0, trackW, trackH);

          facePending = true;
          faceResult = null;
          faceMesh.send({ image: trackCanvas });

          // Wait for result (with timeout)
          var waitCount = 0;
          var waitId = setInterval(function() {
            waitCount++;
            if (!facePending || waitCount > 50) { // 2.5s timeout
              clearInterval(waitId);

              if (faceResult && faceResult.multiFaceLandmarks && faceResult.multiFaceLandmarks.length > 0) {
                var landmarks = faceResult.multiFaceLandmarks[0];
                // Compute bounding box from landmarks
                var minX = 1, minY = 1, maxX = 0, maxY = 0;
                for (var li = 0; li < landmarks.length; li++) {
                  var lm = landmarks[li];
                  if (lm.x < minX) minX = lm.x;
                  if (lm.y < minY) minY = lm.y;
                  if (lm.x > maxX) maxX = lm.x;
                  if (lm.y > maxY) maxY = lm.y;
                }

                // Convert normalized coords to pixel coords at original resolution
                var bbox = {
                  x: minX * (videoEl.videoWidth || trackW),
                  y: minY * (videoEl.videoHeight || trackH),
                  w: (maxX - minX) * (videoEl.videoWidth || trackW),
                  h: (maxY - minY) * (videoEl.videoHeight || trackH)
                };

                // Store key landmarks (simplified: nose tip, left eye, right eye, mouth center)
                var keyLandmarks = [
                  landmarks[1],   // nose tip
                  landmarks[33],  // left eye inner
                  landmarks[263], // right eye inner
                  landmarks[61],  // mouth left
                  landmarks[291], // mouth right
                  landmarks[10],  // forehead
                  landmarks[152]  // chin
                ].map(function(lm) {
                  return {
                    x: lm.x * (videoEl.videoWidth || trackW),
                    y: lm.y * (videoEl.videoHeight || trackH),
                    z: lm.z
                  };
                });

                self._faceTracks.push({
                  frame: time,
                  bbox: bbox,
                  landmarks: keyLandmarks,
                  allLandmarks: landmarks.length,
                  confidence: 1.0
                });
              } else {
                // No face detected this frame
                self._faceTracks.push({
                  frame: time,
                  bbox: null,
                  landmarks: null,
                  confidence: 0
                });
              }

              time += dt;
              setTimeout(processNext, 0);
            }
          }, 50);
        };
      }

      processNext();
    }).catch(function(err) {
      console.error('[VEA.MotionTracker] FaceMesh error:', err);
      self._status = 'idle';
      if (callback) callback([]);
    });
  };

  VEA.MotionTracker.prototype.faceToAutoZoom = function(videoW, videoH, outputW, outputH, opts) {
    opts = opts || {};
    var padding = opts.padding != null ? opts.padding : 0.3; // 30% padding around face
    var tracks = this._faceTracks;
    if (!tracks || !tracks.length) return [];

    var keyframes = [];
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];
      if (!t.bbox || t.confidence < 0.5) continue;

      var cx = t.bbox.x + t.bbox.w / 2;
      var cy = t.bbox.y + t.bbox.h / 2;
      var faceSize = Math.max(t.bbox.w, t.bbox.h);

      // Calculate zoom: face should occupy (1 - padding) of the output height
      var targetSize = outputH * (1 - padding);
      var scale = targetSize / faceSize;
      scale = Math.max(1, Math.min(4, scale)); // Clamp zoom 1x–4x

      keyframes.push({
        time: t.frame,
        x: cx - (outputW / scale) / 2,
        y: cy - (outputH / scale) / 2,
        scale: scale
      });
    }

    // Smooth keyframes to prevent jitter
    if (keyframes.length > 2) {
      var smoothed = [];
      for (var j = 0; j < keyframes.length; j++) {
        var kf = keyframes[j];
        var prevKf = keyframes[Math.max(0, j - 1)];
        var nextKf = keyframes[Math.min(keyframes.length - 1, j + 1)];
        smoothed.push({
          time: kf.time,
          x: (prevKf.x + kf.x + nextKf.x) / 3,
          y: (prevKf.y + kf.y + nextKf.y) / 3,
          scale: (prevKf.scale + kf.scale + nextKf.scale) / 3
        });
      }
      return smoothed;
    }

    return keyframes;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'motion-tracking', parent: 'video.ve-advanced-features', title: 've-advanced-features: motion-tracking', mount: function () {}, unmount: function () {} });
  }
})();
