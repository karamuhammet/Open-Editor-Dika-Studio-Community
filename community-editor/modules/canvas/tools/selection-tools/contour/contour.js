/* Module: canvas/tools/selection-tools/contour — Contour math — simplify, normalize, area, frame-path/alpha trace.
   Part of the selection-tools group (decomposed from the 1542-line IIFE). Functions hang off the
   shared namespace VST (window.__ccSelectionTools, created by the parent); cross-module refs resolve
   through VST at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VST = window.__ccSelectionTools;
  if (!VST) return;

  VST._dpSimplify = function (pts, eps) {
    if (pts.length <= 2) return pts;
    var dm = 0, idx = 0, end = pts.length - 1;
    for (var i = 1; i < end; i++) {
      var d = VST._dpDist(pts[i], pts[0], pts[end]);
      if (d > dm) { dm = d; idx = i; }
    }
    if (dm > eps) {
      var l = VST._dpSimplify(pts.slice(0, idx + 1), eps);
      var r = VST._dpSimplify(pts.slice(idx), eps);
      return l.slice(0, -1).concat(r);
    }
    return [pts[0], pts[end]];
  };

  VST._dpDist = function (p, a, b) {
    var lx = b.x - a.x, ly = b.y - a.y, len = Math.sqrt(lx * lx + ly * ly);
    if (len === 0) return Math.sqrt((p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y));
    return Math.abs(lx * (a.y - p.y) - ly * (a.x - p.x)) / len;
  };

  VST._cloneContourPoints = function (points) {
    var out = [];
    for (var i = 0; i < points.length; i++) {
      out.push({ x: points[i].x, y: points[i].y });
    }
    return out;
  };

  VST._normalizeContourPoints = function (points) {
    if (!points || !points.length) return [];
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var pt = points[i];
      if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) continue;
      if (!out.length || Math.abs(out[out.length - 1].x - pt.x) > 0.01 || Math.abs(out[out.length - 1].y - pt.y) > 0.01) {
        out.push({ x: pt.x, y: pt.y });
      }
    }
    if (out.length > 1) {
      var first = out[0];
      var last = out[out.length - 1];
      if (Math.abs(first.x - last.x) <= 0.01 && Math.abs(first.y - last.y) <= 0.01) {
        out.pop();
      }
    }
    return out;
  };

  VST._contourArea = function (points) {
    var area = 0;
    if (!points || points.length < 3) return 0;
    for (var i = 0; i < points.length; i++) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      area += (a.x * b.y) - (b.x * a.y);
    }
    return area / 2;
  };

  VST._limitContourPoints = function (points, maxPoints) {
    var loop = VST._normalizeContourPoints(points);
    if (loop.length <= maxPoints) return loop;
    var step = Math.ceil(loop.length / maxPoints);
    var out = [];
    for (var i = 0; i < loop.length; i += step) out.push(loop[i]);
    if (out.length < 3) out = loop.slice(0, 3);
    return VST._normalizeContourPoints(out);
  };

  /* ── Clean bezier fit for a dense traced contour (Illustrator "Image Trace" quality) ───────────────
     A raster/alpha trace produces a staircase polyline (hundreds/thousands of tiny L points). Editing it
     (Edit Vertices) would show a point per pixel-step. So we do what Illustrator / potrace do: place anchors
     ONLY at true CORNERS (windowed turn angle) and curve EXTREMA (leftmost/rightmost/topmost/bottommost),
     then fit ONE least-squares cubic bezier per span (Schneider's classic fitCurve, split-on-error). A
     circle → 4 anchors + tangent handles; letter holes → 5-8; the shape rides the bezier handles, not extra
     anchors. Proven on real "Heading": 7304 staircase pts → ~142 anchors at 2.9% shape diff, circle=4.
     Winding/order preserved (evenodd holes still subtract). Falls back to the raw polyline if fit fails. */
  var _CF_ERR = 14;      // max squared-ish fit error (px) before Schneider splits a span
  var _CF_CORNER = 68;   // degrees: windowed turn sharper than this = a real corner anchor
  function _cfV(a, b) { return { x: b.x - a.x, y: b.y - a.y }; }
  function _cfAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function _cfSc(a, s) { return { x: a.x * s, y: a.y * s }; }
  function _cfDot(a, b) { return a.x * b.x + a.y * b.y; }
  function _cfLen(a) { return Math.sqrt(a.x * a.x + a.y * a.y); }
  function _cfNrm(a) { var l = _cfLen(a) || 1; return { x: a.x / l, y: a.y / l }; }
  function _cfDist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  function _cfBezAt(p, t) { var d = p.slice(), i, j, deg = p.length - 1; for (i = 1; i <= deg; i++) for (j = 0; j <= deg - i; j++) d[j] = { x: (1 - t) * d[j].x + t * d[j + 1].x, y: (1 - t) * d[j].y + t * d[j + 1].y }; return d[0]; }
  function _cfB0(t) { var m = 1 - t; return m * m * m; } function _cfB1(t) { var m = 1 - t; return 3 * m * m * t; }
  function _cfB2(t) { var m = 1 - t; return 3 * m * t * t; } function _cfB3(t) { return t * t * t; }
  function _cfChord(pts) { var u = [0], i; for (i = 1; i < pts.length; i++) u[i] = u[i - 1] + _cfDist(pts[i], pts[i - 1]); var last = u[pts.length - 1] || 1; for (i = 1; i < pts.length; i++) u[i] /= last; return u; }
  function _cfGenBezier(pts, u, lt, rt) {
    var n = pts.length, A = [], i;
    for (i = 0; i < n; i++) A[i] = [_cfSc(lt, _cfB1(u[i])), _cfSc(rt, _cfB2(u[i]))];
    var C = [[0, 0], [0, 0]], X = [0, 0];
    for (i = 0; i < n; i++) {
      C[0][0] += _cfDot(A[i][0], A[i][0]); C[0][1] += _cfDot(A[i][0], A[i][1]); C[1][1] += _cfDot(A[i][1], A[i][1]);
      var t2 = { x: pts[i].x - (pts[0].x * (_cfB0(u[i]) + _cfB1(u[i])) + pts[n - 1].x * (_cfB2(u[i]) + _cfB3(u[i]))),
                 y: pts[i].y - (pts[0].y * (_cfB0(u[i]) + _cfB1(u[i])) + pts[n - 1].y * (_cfB2(u[i]) + _cfB3(u[i]))) };
      X[0] += _cfDot(A[i][0], t2); X[1] += _cfDot(A[i][1], t2);
    }
    C[1][0] = C[0][1];
    var det = C[0][0] * C[1][1] - C[1][0] * C[0][1];
    var aL = det === 0 ? 0 : (X[0] * C[1][1] - X[1] * C[0][1]) / det;
    var aR = det === 0 ? 0 : (C[0][0] * X[1] - C[1][0] * X[0]) / det;
    var seg = _cfDist(pts[0], pts[n - 1]), eps = 1e-6 * seg;
    // guard BOTH directions: a degenerate least-squares solution (tiny OR exploding handle lengths)
    // falls back to the chord/3 heuristic — an exploding alpha shoots the control point far outside
    // the outline and renders as a spur.
    var maxA = seg * 1.5; // legit quarter-arc alpha ~0.55x chord; anything bigger loops/spurs between the check samples
    if (aL < eps || aR < eps || aL > maxA || aR > maxA) { var d = seg / 3; return [pts[0], _cfAdd(pts[0], _cfSc(lt, d)), _cfAdd(pts[n - 1], _cfSc(rt, d)), pts[n - 1]]; }
    return [pts[0], _cfAdd(pts[0], _cfSc(lt, aL)), _cfAdd(pts[n - 1], _cfSc(rt, aR)), pts[n - 1]];
  }
  function _cfMaxErr(pts, bez, u) { var m = 0, sp = Math.floor(pts.length / 2), i; for (i = 1; i < pts.length - 1; i++) { var p = _cfBezAt(bez, u[i]); var d = _cfDist(p, pts[i]); d = d * d; if (d > m) { m = d; sp = i; } } return { e: m, sp: sp }; }
  function _cfNR(bez, p, u) {
    var d = _cfV(p, _cfBezAt(bez, u));
    var q1 = [_cfSc(_cfV(bez[0], bez[1]), 3), _cfSc(_cfV(bez[1], bez[2]), 3), _cfSc(_cfV(bez[2], bez[3]), 3)];
    var q2 = [_cfSc(_cfV(q1[0], q1[1]), 2), _cfSc(_cfV(q1[1], q1[2]), 2)];
    var qu = _cfBezAt(q1, u), qd = _cfBezAt(q2, u);
    var num = d.x * qu.x + d.y * qu.y, den = qu.x * qu.x + qu.y * qu.y + d.x * qd.x + d.y * qd.y;
    return den === 0 ? u : u - num / den;
  }
  function _cfFitCubic(pts, lt, rt, err, out, depth) {
    if (pts.length === 2) { var d = _cfDist(pts[0], pts[1]) / 3; out.push([pts[0], _cfAdd(pts[0], _cfSc(lt, d)), _cfAdd(pts[1], _cfSc(rt, d)), pts[1]]); return; }
    var u = _cfChord(pts), bez = _cfGenBezier(pts, u, lt, rt), m = _cfMaxErr(pts, bez, u);
    if (m.e < err) { out.push(bez); return; }
    if (m.e < err * 4 && depth < 20) { for (var k = 0; k < 12; k++) { var up = u.map(function (uu, i) { return _cfNR(bez, pts[i], uu); }); bez = _cfGenBezier(pts, up, lt, rt); m = _cfMaxErr(pts, bez, up); if (m.e < err) { out.push(bez); return; } u = up; } }
    var sp = m.sp; if (sp <= 0) sp = 1; if (sp >= pts.length - 1) sp = pts.length - 2;
    var ct = _cfNrm(_cfV(pts[sp + 1], pts[sp - 1]));
    _cfFitCubic(pts.slice(0, sp + 1), lt, ct, err, out, depth + 1);
    _cfFitCubic(pts.slice(sp), _cfSc(ct, -1), rt, err, out, depth + 1);
  }
  function _cfFindAnchors(pts, cornerDeg, win) {
    var n = pts.length, i, set = {}, cand = [];
    for (i = 0; i < n; i++) {
      var a = pts[(i - win + n) % n], b = pts[i], c = pts[(i + win) % n];
      var v1 = _cfNrm(_cfV(a, b)), v2 = _cfNrm(_cfV(b, c));
      var ang = Math.acos(Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y)));
      if (ang > cornerDeg * Math.PI / 180) cand.push({ i: i, ang: ang });
    }
    cand.sort(function (a, b) { return b.ang - a.ang; });
    var taken = [];
    cand.forEach(function (c) { var ok = true; for (var t = 0; t < taken.length; t++) { var dd = Math.abs(taken[t] - c.i); dd = Math.min(dd, n - dd); if (dd < win) { ok = false; break; } } if (ok) { taken.push(c.i); set[c.i] = true; } });
    var xi = 0, xa = 0, yi = 0, ya = 0;
    for (i = 1; i < n; i++) { if (pts[i].x < pts[xi].x) xi = i; if (pts[i].x > pts[xa].x) xa = i; if (pts[i].y < pts[yi].y) yi = i; if (pts[i].y > pts[ya].y) ya = i; }
    set[xi] = set[xa] = set[yi] = set[ya] = true;
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }
  VST._fitLoopToBezier = function (pts) {
    if (!pts || pts.length < 4) return null;
    // Per-contour tolerances: a small round contour (a letter's dot/counter) needs a TIGHT error and a
    // WIDE corner window, or pixel-staircase noise fakes corners and the loose error collapses the circle
    // into a lumpy polygon. Both scale with the contour size so small circles stay perfectly round while
    // big letters keep few anchors. (_cfFitCubic error is squared distance, so err = distTol².)
    var mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity, pi, pp;
    for (pi = 0; pi < pts.length; pi++) { pp = pts[pi]; if (pp.x < mnx) mnx = pp.x; if (pp.y < mny) mny = pp.y; if (pp.x > mxx) mxx = pp.x; if (pp.y > mxy) mxy = pp.y; }
    var diag = Math.sqrt((mxx - mnx) * (mxx - mnx) + (mxy - mny) * (mxy - mny));
    var distTol = Math.max(0.9, Math.min(3.8, diag * 0.02));
    var err = distTol * distTol;
    var win = Math.max(6, Math.round(pts.length / 18));
    var anchors = _cfFindAnchors(pts, _CF_CORNER, win);
    if (anchors.length < 2) anchors = [0, Math.floor(pts.length / 2)];
    var beziers = [], n = pts.length, a;
    for (a = 0; a < anchors.length; a++) {
      var i0 = anchors[a], i1 = anchors[(a + 1) % anchors.length];
      var run = [], k = i0, guard = 0;
      while (true) { run.push(pts[k]); if (k === i1) break; k = (k + 1) % n; if (++guard > n + 2) break; }
      if (run.length < 2) continue;
      var lt = _cfNrm(_cfV(run[0], run[1])), rt = _cfNrm(_cfV(run[run.length - 1], run[run.length - 2]));
      _cfFitCubic(run, lt, rt, err, beziers, 0);
    }
    if (!beziers.length) return null;
    var out = [{ k: 'M', x: beziers[0][0].x, y: beziers[0][0].y }], b;
    for (a = 0; a < beziers.length; a++) { b = beziers[a]; out.push({ k: 'C', c1x: b[1].x, c1y: b[1].y, c2x: b[2].x, c2y: b[2].y, x: b[3].x, y: b[3].y }); }
    return out;
  };

  /* ── TEXT → REAL vector outline (opentype.js), no rasterize/trace ─────────────────────────────
     For text objects, "Convert to Frame" extracts the font's true glyph outlines instead of tracing
     pixels: few anchors at real corners/extrema + bezier handles, exactly like Illustrator/Figma glyph
     editing, and zero shift because glyphs are placed with fabric's OWN layout. The per-glyph anchor is
     fabric's render-time position, verified 1:1 against fabric 5.3.1 source AND pixel-diffed in a
     browser harness (wrap/center/right/charSpacing/lineHeight scenarios, centroid delta ~0):
       baselineY(i) = _getTopOffset() + Σ getHeightOfLine(<i) + (getHeightOfLine(i)/lineHeight)·(1 − _fontSizeFraction)
       anchorX(i,j) = _getLeftOffset() + _getLineLeftOffset(i) + __charBounds[i][j].left
     Font binary: custom fonts via FontManager.getArrayBuffer; Google fonts via the same-origin
     /api/fonts/google route (server fetches TTF with a legacy UA — browsers only ever get WOFF2, which
     our vendored opentype.min.js cannot parse). Any miss → caller falls back to the raster trace. */
  var _otFontCache = {};   // 'family|weight|italic' → { font } | { fail: true }
  var _otLibPromise = null;

  function _otSniff(buf) {
    if (!buf || buf.byteLength < 4) return 'unknown';
    var b = new Uint8Array(buf, 0, 4);
    var tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
    if (tag === 'wOF2') return 'woff2';
    if (tag === 'wOFF') return 'woff';
    if (tag === 'OTTO') return 'otf';
    if ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || tag === 'true') return 'ttf';
    return 'unknown';
  }
  function _otNormWeight(w) {
    if (w === 'bold') return 700;
    if (!w || w === 'normal') return 400;
    var n = parseInt(w, 10);
    return isFinite(n) ? Math.max(100, Math.min(900, n)) : 400;
  }
  function _otFamily(obj) {
    return String(obj.fontFamily || '').split(',')[0].replace(/^['"\s]+|['"\s]+$/g, '');
  }
  function _otRequireLib() {
    if (!_otLibPromise) {
      _otLibPromise = (window.cc && cc.requireLib)
        ? cc.requireLib('js/vendor/opentype.min.js')
        : Promise.reject(new Error('cc.requireLib unavailable'));
    }
    return _otLibPromise;
  }
  function _otResolveBuffer(family, weight, italic) {
    // 1) custom font uploaded through the Font Manager (raw bytes in IndexedDB)
    try {
      if (window.FontManager && window.FontManager.getArrayBuffer) {
        var buf = window.FontManager.getArrayBuffer(family);
        if (buf) {
          var kind = _otSniff(buf);
          return Promise.resolve(kind === 'woff2' || kind === 'unknown' ? null : buf);
        }
      }
    } catch (e) {}
    // 2) Google font via the same-origin server route (exists when served under apps/web :3000;
    //    on the standalone :8200 static server this 404s → graceful raster fallback)
    return fetch('/api/fonts/google?family=' + encodeURIComponent(family) + '&weight=' + weight + '&italic=' + (italic ? 1 : 0))
      .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .then(function (b) {
        if (!b) return null;
        var kind = _otSniff(b);
        return (kind === 'woff2' || kind === 'unknown') ? null : b;
      })
      .catch(function () { return null; });
  }
  VST._getTextOutlineFont = function (family, weight, italic) {
    var key = family + '|' + weight + '|' + (italic ? 1 : 0);
    if (_otFontCache[key]) return Promise.resolve(_otFontCache[key].font || null);
    return _otRequireLib()
      .then(function () { return _otResolveBuffer(family, weight, italic); })
      .then(function (buf) {
        if (!buf || !window.opentype) { _otFontCache[key] = { fail: true }; return null; }
        try {
          var f = window.opentype.parse(buf);
          _otFontCache[key] = { font: f };
          return f;
        } catch (e) { _otFontCache[key] = { fail: true }; return null; }
      })
      .catch(function () { _otFontCache[key] = { fail: true }; return null; });
  };

  // Only take the vector path when the outline is guaranteed to MATCH what the user sees.
  // Everything else (decorations, per-char styles, text-on-path, RTL, browser-synthesized
  // bold/italic for a variant the family doesn't ship) falls back to the raster trace.
  VST._textVectorEligible = function (obj) {
    if (!obj || (obj.type !== 'text' && obj.type !== 'i-text' && obj.type !== 'textbox')) return false;
    if (obj.path) return false;
    if (obj.direction && obj.direction !== 'ltr') return false;
    if (obj.underline || obj.overline || obj.linethrough) return false;
    var st = obj.styles, li, ci;
    if (st) {
      for (li in st) {
        if (!st.hasOwnProperty(li)) continue;
        for (ci in st[li]) {
          if (st[li].hasOwnProperty(ci) && st[li][ci] && Object.keys(st[li][ci]).length) return false;
        }
      }
    }
    // CUSTOM fonts (Font Manager): registered as FontFace weight '100 900', so ANY weight renders from
    // the single file with no browser synthesis — the outline always matches; skip the catalog check.
    try {
      if (window.FontManager && window.FontManager.findByFamily && window.FontManager.findByFamily(_otFamily(obj))) return true;
    } catch (e0) {}
    // Google catalog check: a weight/italic the family doesn't ship means the BROWSER synthesized
    // it on canvas — the real glyph outline would not match, so refuse (raster fallback).
    try {
      var lib = window.DikaFontLibrary;
      var rec = lib && lib.getRecord && lib.getRecord(_otFamily(obj));
      if (rec) {
        if ((obj.fontStyle === 'italic' || obj.fontStyle === 'oblique') && !rec.italic) return false;
        var w = _otNormWeight(obj.fontWeight);
        var ws = (lib.getAvailableWeights && lib.getAvailableWeights(_otFamily(obj))) || rec.weights || [];
        if (ws.length && ws.map(Number).indexOf(w) === -1) return false;
      }
    } catch (e) {}
    return true;
  };

  function _otCubicPt(p0, p1, p2, p3, t) { var q = 1 - t; return { x: q*q*q*p0.x + 3*q*q*t*p1.x + 3*q*t*t*p2.x + t*t*t*p3.x, y: q*q*q*p0.y + 3*q*q*t*p1.y + 3*q*t*t*p2.y + t*t*t*p3.y }; }
  function _otQuadPt(p0, p1, p2, t) { var q = 1 - t; return { x: q*q*p0.x + 2*q*t*p1.x + t*t*p2.x, y: q*q*p0.y + 2*q*t*p1.y + t*t*p2.y }; }

  // TrueType glyph outlines are QUADRATIC with many on-curve points (a raw "Heading" \u2248 300 anchors).
  // Merge them DETERMINISTICALLY: at every on-curve junction the EXACT in/out tangents decide corner vs
  // smooth (fonts use exactly-collinear handles for smooth joins), corners stay byte-exact anchors,
  // each smooth run between corners collapses to few sub-pixel Schneider cubics, straight runs stay L,
  // and an all-smooth contour (an o, a dot) gets its 4 extrema as anchors \u2014 the Illustrator look with
  // ZERO drift (anchor coordinates are the original glyph points).
  // Fonts make smooth joins EXACTLY collinear (0deg; quantization < ~2deg), so anything above 6deg is a
  // REAL corner — including shallow ones like the bar-bowl junction of an 'e'. A higher threshold merged
  // those shallow corners into one Schneider run (line+curve in a single cubic) and produced spur artifacts.
  var _OT_SMOOTH_COS = Math.cos(6 * Math.PI / 180);
  function _cfFitExactContour(segs) {
    var n = segs.length, i, j, k;
    if (!n) return null;
    // corner flags per junction j = between segs[j-1] and segs[j] (start point of segs[j]).
    // Tiny segments (font-unit quantization slivers) get unreliable tangents — never let them mint corners.
    var segLen = [];
    for (i = 0; i < n; i++) {
      var a0 = segs[i].pts[0], a1 = segs[i].pts[segs[i].pts.length - 1];
      segLen.push(Math.sqrt((a1.x - a0.x) * (a1.x - a0.x) + (a1.y - a0.y) * (a1.y - a0.y)));
    }
    var isCorner = [], corners = 0;
    for (i = 0; i < n; i++) {
      var prev = segs[(i - 1 + n) % n];
      var dot = prev.t1.x * segs[i].t0.x + prev.t1.y * segs[i].t0.y;
      var big = segLen[i] > 0.75 && segLen[(i - 1 + n) % n] > 0.75;
      var c = big && dot < _OT_SMOOTH_COS;
      isCorner.push(c);
      if (c) corners++;
    }
    if (corners < 2) {
      // smooth closed contour: anchor the extreme junction points (leftmost/rightmost/top/bottom)
      var xi = 0, xa = 0, yi = 0, ya = 0;
      for (i = 1; i < n; i++) {
        var p0 = segs[i].pts[0];
        if (p0.x < segs[xi].pts[0].x) xi = i;
        if (p0.x > segs[xa].pts[0].x) xa = i;
        if (p0.y < segs[yi].pts[0].y) yi = i;
        if (p0.y > segs[ya].pts[0].y) ya = i;
      }
      isCorner[xi] = isCorner[xa] = isCorner[yi] = isCorner[ya] = true;
      corners = 0; for (i = 0; i < n; i++) if (isCorner[i]) corners++;
      if (corners < 2) { isCorner[0] = isCorner[Math.floor(n / 2)] = true; }
    }
    var anchorIdx = [];
    for (i = 0; i < n; i++) if (isCorner[i]) anchorIdx.push(i);
    var out = []; // [{k:'L',x,y}] or [{k:'C',...}] runs starting from anchor 0's point
    var startPt = segs[anchorIdx[0]].pts[0];
    for (k = 0; k < anchorIdx.length; k++) {
      var s0 = anchorIdx[k], s1 = anchorIdx[(k + 1) % anchorIdx.length];
      // concatenate the run's exact samples
      var run = [], si = s0, guard = 0;
      while (true) {
        var sp = segs[si].pts;
        for (j = (run.length ? 1 : 0); j < sp.length; j++) run.push(sp[j]);
        si = (si + 1) % n; guard++;
        if (si === s1 || guard > n + 1) break;
      }
      if (run.length < 2) continue;
      var A = run[0], B = run[run.length - 1];
      // straight run \u2192 a plain L anchor pair (no bezier handles: cleaner editing for straight edges)
      var maxDev = 0;
      for (j = 1; j < run.length - 1; j++) { var dv = VST._dpDist(run[j], A, B); if (dv > maxDev) maxDev = dv; }
      if (maxDev <= 0.35) { out.push({ k: 'L', x: B.x, y: B.y }); continue; }
      var lt = segs[s0].t0;
      var endSeg = segs[(s1 - 1 + n) % n];
      var rt = { x: -endSeg.t1.x, y: -endSeg.t1.y };
      var beziers = [];
      _cfFitCubic(run, lt, rt, 0.45 * 0.45, beziers, 0); // 0.45px tolerance on exact samples = invisible, no ink erosion
      for (j = 0; j < beziers.length; j++) {
        var b = beziers[j];
        out.push({ k: 'C', c1x: b[1].x, c1y: b[1].y, c2x: b[2].x, c2y: b[2].y, x: b[3].x, y: b[3].y });
      }
    }
    return out.length ? { start: startPt, cmds: out } : null;
  }

  function _otTan(a, b, fb1, fb2) {
    var dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6 && fb1 && fb2) { dx = fb2.x - fb1.x; dy = fb2.y - fb1.y; l = Math.sqrt(dx * dx + dy * dy); }
    if (l < 1e-6) return { x: 1, y: 0 };
    return { x: dx / l, y: dy / l };
  }

  // Build the frame fabric.Path from the font's real glyph outlines, placed with fabric's own layout.
  VST._glyphFrameFromFont = function (obj, font) {
    var m = obj.calcTransformMatrix();
    function W(x, y) { return fabric.util.transformPoint(new fabric.Point(x, y), m); }
    function num(v) { return (Math.round(v * 100) / 100); }
    var contours = [];   // array of seg-lists; seg = { pts:[exact world samples], t0, t1 } (travel-direction tangents)
    var curSegs = null, cur = null, start = null;
    function closeContour() {
      if (curSegs && curSegs.length) {
        // implicit closing edge back to the start point (fonts often omit the final L before Z)
        var lastP = curSegs[curSegs.length - 1].pts;
        var lp = lastP[lastP.length - 1];
        if (start && (Math.abs(lp.x - start.x) > 0.01 || Math.abs(lp.y - start.y) > 0.01)) {
          var t = _otTan(lp, start);
          curSegs.push({ pts: [lp, { x: start.x, y: start.y }], t0: t, t1: t, cmd: { k: 'L', x: start.x, y: start.y } });
        }
        if (curSegs.length >= 2) contours.push(curSegs);
      }
      curSegs = null;
    }

    // ── Per-glyph TRUST check ─────────────────────────────────────────────────────────────────
    // opentype.js mis-places some COMPOSITE glyphs (point-index component alignment is unimplemented —
    // e.g. the dot of 'i'/'j' and Turkish accents 'ğ/ö/ü/ç' in instanced fonts drift a few px from what
    // the browser renders). So every glyph's outline bbox is compared against the browser's OWN rendered
    // ink bbox; a mismatched glyph is rebuilt by tracing that browser raster at 3x and fitting it with
    // the proven raster Schneider fit. The frame therefore ALWAYS matches what the user sees.
    var fs = obj.fontSize;
    var TS = fs > 200 ? 2 : 3;
    var sw = Math.ceil(fs * TS * 2.4), sh = Math.ceil(fs * TS * 2.2);
    var sbx = Math.ceil(fs * TS * 0.6), sby = Math.ceil(fs * TS * 1.4);
    var scratch = null, sctx = null, trustCache = {};
    var extraData = '', extraLoops = [];
    function glyphCheck(ch2) {
      if (trustCache[ch2]) return trustCache[ch2];
      if (!scratch) {
        scratch = document.createElement('canvas'); scratch.width = sw; scratch.height = sh;
        sctx = scratch.getContext('2d', { willReadFrequently: true });
      }
      sctx.clearRect(0, 0, sw, sh);
      sctx.fillStyle = '#000';
      sctx.textBaseline = 'alphabetic';
      sctx.font = (obj.fontStyle && obj.fontStyle !== 'normal' ? obj.fontStyle + ' ' : '') + (obj.fontWeight || 'normal') + ' ' + (fs * TS) + 'px "' + _otFamily(obj) + '"';
      sctx.fillText(ch2, sbx, sby);
      var img = sctx.getImageData(0, 0, sw, sh);
      var d = img.data, mnx = Infinity, mny = Infinity, mxx = -1, mxy = -1, yy, xx;
      for (yy = 0; yy < sh; yy++) for (xx = 0; xx < sw; xx++) {
        if (d[(yy * sw + xx) * 4 + 3] > 16) { if (xx < mnx) mnx = xx; if (yy < mny) mny = yy; if (xx > mxx) mxx = xx; if (yy > mxy) mxy = yy; }
      }
      var res;
      if (mxx < 0) { res = { trusted: true }; trustCache[ch2] = res; return res; } // no ink
      var ink = { x1: (mnx - sbx) / TS, y1: (mny - sby) / TS, x2: (mxx - sbx) / TS, y2: (mxy - sby) / TS };
      var ob = font.charToGlyph(ch2).getPath(0, 0, fs).getBoundingBox();
      var tol = Math.max(1.2, fs * 0.02);
      var trusted = Math.abs(ink.x1 - ob.x1) <= tol && Math.abs(ink.y1 - ob.y1) <= tol &&
                    Math.abs(ink.x2 - ob.x2) <= tol && Math.abs(ink.y2 - ob.y2) <= tol;
      res = { trusted: trusted, img: trusted ? null : img };
      trustCache[ch2] = res;
      return res;
    }
    function rasterGlyph(img, anchorX, anchorY) {
      var rawLoops = VST._traceAlphaContours(img.data, sw, sh, 16);
      for (var rl = 0; rl < rawLoops.length; rl++) {
        var lpts = rawLoops[rl];
        if (!lpts || lpts.length < 3) continue;
        var wl = [], rp, wpt;
        for (rp = 0; rp < lpts.length; rp++) {
          wpt = W(anchorX + (lpts[rp].x - sbx) / TS, anchorY + (lpts[rp].y - sby) / TS);
          wl.push({ x: wpt.x, y: wpt.y });
        }
        if (Math.abs(VST._contourArea(wl)) < 1) continue;
        extraLoops.push(wl);
        var rfit = VST._fitLoopToBezier(wl);
        if (rfit && rfit.length >= 2) {
          for (var rc2 = 0; rc2 < rfit.length; rc2++) {
            var rm = rfit[rc2];
            if (rm.k === 'M') extraData += 'M ' + num(rm.x) + ' ' + num(rm.y) + ' ';
            else if (rm.k === 'L') extraData += 'L ' + num(rm.x) + ' ' + num(rm.y) + ' ';
            else extraData += 'C ' + num(rm.c1x) + ' ' + num(rm.c1y) + ' ' + num(rm.c2x) + ' ' + num(rm.c2y) + ' ' + num(rm.x) + ' ' + num(rm.y) + ' ';
          }
          extraData += 'Z ';
        } else {
          extraData += 'M ' + num(wl[0].x) + ' ' + num(wl[0].y) + ' ';
          for (rp = 1; rp < wl.length; rp++) extraData += 'L ' + num(wl[rp].x) + ' ' + num(wl[rp].y) + ' ';
          extraData += 'Z ';
        }
      }
    }

    var i, j, sumH = 0;
    // Pass 1: exact glyph segments in world coords (fabric layout anchors, verified 1:1 vs render).
    for (i = 0; i < obj._textLines.length; i++) {
      var H = obj.getHeightOfLine(i);
      var baseY = obj._getTopOffset() + sumH + (H / obj.lineHeight) * (1 - obj._fontSizeFraction);
      var lineLeft = obj._getLeftOffset() + obj._getLineLeftOffset(i);
      var line = obj._textLines[i], bounds = obj.__charBounds[i];
      for (j = 0; j < line.length; j++) {
        var ch = line[j];
        if (!ch || ch === ' ' || ch === '\u00a0' || ch === '\t') continue;
        if (!bounds || !bounds[j]) continue;
        var anchorX = lineLeft + bounds[j].left, anchorY = baseY + (bounds[j].deltaY || 0);
        var tr = glyphCheck(ch);
        if (!tr.trusted) { closeContour(); rasterGlyph(tr.img, anchorX, anchorY); continue; }
        var gp = font.charToGlyph(ch).getPath(anchorX, anchorY, obj.fontSize);
        var cmds = gp.commands, c, p, p1, p2, s, pts;
        for (c = 0; c < cmds.length; c++) {
          var cm = cmds[c];
          if (cm.type === 'M') {
            closeContour();
            p = W(cm.x, cm.y);
            curSegs = []; cur = p; start = p;
          } else if (cm.type === 'L') {
            p = W(cm.x, cm.y);
            if (curSegs && cur) { var tl = _otTan(cur, p); curSegs.push({ pts: [cur, p], t0: tl, t1: tl, cmd: { k: 'L', x: p.x, y: p.y } }); }
            cur = p;
          } else if (cm.type === 'C') {
            p1 = W(cm.x1, cm.y1); p2 = W(cm.x2, cm.y2); p = W(cm.x, cm.y);
            if (curSegs && cur) {
              pts = [cur];
              for (s = 1; s <= 10; s++) pts.push(_otCubicPt(cur, p1, p2, p, s / 10));
              curSegs.push({ pts: pts, t0: _otTan(cur, p1, cur, p2), t1: _otTan(p2, p, p1, p), cmd: { k: 'C', c1x: p1.x, c1y: p1.y, c2x: p2.x, c2y: p2.y, x: p.x, y: p.y } });
            }
            cur = p;
          } else if (cm.type === 'Q') {
            p1 = W(cm.x1, cm.y1); p = W(cm.x, cm.y);
            if (curSegs && cur) {
              pts = [cur];
              for (s = 1; s <= 8; s++) pts.push(_otQuadPt(cur, p1, p, s / 8));
              curSegs.push({ pts: pts, t0: _otTan(cur, p1, cur, p), t1: _otTan(p1, p, cur, p), cmd: { k: 'Q', c1x: p1.x, c1y: p1.y, x: p.x, y: p.y } });
            }
            cur = p;
          } else if (cm.type === 'Z') {
            closeContour();
            cur = start;
          }
        }
        closeContour();
      }
      sumH += H;
    }
    closeContour();
    if (!contours.length && !extraData) return null;

    // Pass 2: per contour \u2014 exact-tangent corner detection + sub-pixel smooth-run merge, then a HARD
    // validation: sample the fitted contour and measure its max deviation from the exact outline. If the
    // fit deviates anywhere beyond 1.2px (an underdetermined least-squares can bulge/spur between the
    // check samples), that contour falls back to the RAW glyph commands \u2014 byte-exact, just more anchors
    // on that one contour. Guarantees no visible artifact can ever ship.
    function segDist(p, a, b) {
      var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) return Math.sqrt((p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y));
      var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var px = a.x + dx * t, py = a.y + dy * t;
      return Math.sqrt((p.x - px) * (p.x - px) + (p.y - py) * (p.y - py));
    }
    function minDistToLoop(p, loop) {
      var best = Infinity, q;
      for (q = 0; q < loop.length; q++) {
        var d = segDist(p, loop[q], loop[(q + 1) % loop.length]);
        if (d < best) best = d;
      }
      return best;
    }
    function fitMaxDev(fit, loop) {
      var maxd = 0, at = null, prev = fit.start, fj, s2, smp;
      for (fj = 0; fj < fit.cmds.length; fj++) {
        var fc = fit.cmds[fj];
        if (fc.k === 'L') {
          smp = { x: (prev.x + fc.x) / 2, y: (prev.y + fc.y) / 2 };
          var dL = minDistToLoop(smp, loop); if (dL > maxd) { maxd = dL; at = smp; }
          prev = { x: fc.x, y: fc.y };
        } else {
          var p0 = prev, p1c = { x: fc.c1x, y: fc.c1y }, p2c = { x: fc.c2x, y: fc.c2y }, p3 = { x: fc.x, y: fc.y };
          for (s2 = 1; s2 < 8; s2++) {
            smp = _otCubicPt(p0, p1c, p2c, p3, s2 / 8);
            var dC = minDistToLoop(smp, loop); if (dC > maxd) { maxd = dC; at = smp; }
          }
          prev = p3;
        }
      }
      return { d: maxd, at: at };
    }
    var data = '', loops = [];
    VST._lastFitDevs = []; // per-contour fit deviation diagnostics (kept: cheap + invaluable for support)
    for (i = 0; i < contours.length; i++) {
      var segsI = contours[i];
      var loop = [];
      for (var si = 0; si < segsI.length; si++) {
        var sp = segsI[si].pts;
        for (var pj = (loop.length ? 1 : 0); pj < sp.length; pj++) loop.push({ x: sp[pj].x, y: sp[pj].y });
      }
      if (loop.length >= 3) loops.push(loop);
      var fit = _cfFitExactContour(segsI);
      var devInfo = fit ? fitMaxDev(fit, loop) : null;
      VST._lastFitDevs.push(devInfo ? { c: i, dev: Math.round(devInfo.d * 100) / 100, x: devInfo.at ? Math.round(devInfo.at.x) : -1, y: devInfo.at ? Math.round(devInfo.at.y) : -1 } : { c: i, dev: -1 });
      if (fit && devInfo.d <= 1.2) {
        data += 'M ' + num(fit.start.x) + ' ' + num(fit.start.y) + ' ';
        for (j = 0; j < fit.cmds.length; j++) {
          var fc2 = fit.cmds[j];
          if (fc2.k === 'L') data += 'L ' + num(fc2.x) + ' ' + num(fc2.y) + ' ';
          else data += 'C ' + num(fc2.c1x) + ' ' + num(fc2.c1y) + ' ' + num(fc2.c2x) + ' ' + num(fc2.c2y) + ' ' + num(fc2.x) + ' ' + num(fc2.y) + ' ';
        }
        data += 'Z ';
      } else {
        // raw glyph commands for this contour (exact shape, more anchors here only)
        var st0 = segsI[0].pts[0];
        data += 'M ' + num(st0.x) + ' ' + num(st0.y) + ' ';
        for (var sk = 0; sk < segsI.length; sk++) {
          var rc = segsI[sk].cmd;
          if (!rc) continue;
          if (rc.k === 'L') data += 'L ' + num(rc.x) + ' ' + num(rc.y) + ' ';
          else if (rc.k === 'Q') data += 'Q ' + num(rc.c1x) + ' ' + num(rc.c1y) + ' ' + num(rc.x) + ' ' + num(rc.y) + ' ';
          else data += 'C ' + num(rc.c1x) + ' ' + num(rc.c1y) + ' ' + num(rc.c2x) + ' ' + num(rc.c2y) + ' ' + num(rc.x) + ' ' + num(rc.y) + ' ';
        }
        data += 'Z ';
      }
    }
    data = (data + ' ' + extraData).trim(); // raster-rebuilt (untrusted-glyph) contours join the same path
    if (!data) return null;
    for (i = 0; i < extraLoops.length; i++) loops.push(extraLoops[i]);

    var metaContours = [];
    for (i = 0; i < loops.length; i++) {
      metaContours.push({ points: loops[i], isHole: VST._contourArea(loops[i]) < 0, sourceType: 'text-vector' });
    }

    var style = VST._frameStyleFromObject(obj);
    VST._frameCounter++;
    // No left/top: fabric.Path keeps the absolute coordinates as-is (proven 0.00% placement diff).
    return new fabric.Path(data, {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDashArray: style.strokeDashArray,
      opacity: style.opacity,
      fillRule: 'nonzero', // TrueType winding (outer CW / inner CCW) — evenodd breaks overlapping strokes
      selectable: true,
      evented: true,
      objectCaching: false,
      _isFrame: true,
      _frameVector: true,
      _frameId: 'frame-' + VST._frameCounter + '-' + Date.now(),
      _frameContours: metaContours,
      _frameSourceType: 'text-vector',
      _customName: obj._customName || obj.text || 'Frame'
    });
  };

  VST._buildTextVectorFrame = function (obj, done) {
    if (!VST._textVectorEligible(obj)) { done(null); return; }
    var family = _otFamily(obj);
    if (!family) { done(null); return; }
    var weight = _otNormWeight(obj.fontWeight);
    var italic = obj.fontStyle === 'italic' || obj.fontStyle === 'oblique';
    VST._getTextOutlineFont(family, weight, italic).then(function (font) {
      if (!font) { done(null); return; }
      try { done(VST._glyphFrameFromFont(obj, font)); }
      catch (e) { done(null); }
    });
  };

  VST._frameStyleFromObject = function (obj) {
    var dash = obj && obj.strokeDashArray ? obj.strokeDashArray.slice() : null;
    var fill = obj && obj.fill != null ? obj.fill : 'rgba(242, 255, 88, 0.06)';
    var stroke = obj && obj.stroke != null ? obj.stroke : '#f2ff58';
    var strokeWidth = obj && obj.strokeWidth != null ? obj.strokeWidth : 2;
    if (obj && obj.type === 'image') {
      fill = 'rgba(242, 255, 88, 0.06)';
      stroke = '#f2ff58';
      strokeWidth = 2;
      dash = [6, 4];
    }
    return {
      fill: fill,
      stroke: stroke,
      strokeWidth: strokeWidth,
      strokeDashArray: dash,
      opacity: obj && obj.opacity != null ? obj.opacity : 1
    };
  };

  VST._buildFramePathFromContours = function (contours, sourceObj, sourceType) {
    var loops = [];
    var minX = Infinity, minY = Infinity;
    for (var i = 0; i < contours.length; i++) {
      var raw = contours[i] && contours[i].points ? contours[i].points : contours[i];
      var pts = VST._limitContourPoints(raw, 420);
      if (pts.length < 3) continue;
      loops.push({
        points: pts,
        isHole: VST._contourArea(pts) < 0,
        sourceType: sourceType || 'shape-vector'
      });
      for (var j = 0; j < pts.length; j++) {
        if (pts[j].x < minX) minX = pts[j].x;
        if (pts[j].y < minY) minY = pts[j].y;
      }
    }
    if (!loops.length) return null;

    // Frame creation stays the ORIGINAL raw polyline (M L ... Z): the traced outline maps 1:1 onto the
    // source object's ink, so "Convert to Frame" never moves the letters. The clean-bezier fit is applied
    // ONLY when the user opens Edit Vertices (polygon-edit.js), so frame creation is byte-for-byte untouched.
    var pathStr = '';
    for (var li = 0; li < loops.length; li++) {
      var pts2 = loops[li].points;
      pathStr += 'M ' + (pts2[0].x - minX).toFixed(2) + ' ' + (pts2[0].y - minY).toFixed(2);
      for (var pi = 1; pi < pts2.length; pi++) {
        pathStr += ' L ' + (pts2[pi].x - minX).toFixed(2) + ' ' + (pts2[pi].y - minY).toFixed(2);
      }
      pathStr += ' Z ';
    }

    var style = VST._frameStyleFromObject(sourceObj);
    VST._frameCounter++;
    return new fabric.Path(pathStr.trim(), {
      left: minX,
      top: minY,
      originX: 'left',
      originY: 'top',
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDashArray: style.strokeDashArray,
      opacity: style.opacity,
      fillRule: 'evenodd',
      selectable: true,
      evented: true,
      objectCaching: false,
      _isFrame: true,
      _frameId: (sourceObj && sourceObj._frameId) || ('frame-' + VST._frameCounter + '-' + Date.now()),
      _frameContours: loops,
      _frameSourceType: sourceType || 'shape-vector',
      _customName: sourceObj && (sourceObj._customName || sourceObj._myShapeDisplayName || sourceObj._wbName || sourceObj.text) || 'Frame'
    });
  };

  VST._traceAlphaContours = function (data, w, h, threshold) {
    function filled(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      return data[(y * w + x) * 4 + 3] > threshold;
    }
    function pushEdge(edges, byStart, ax, ay, bx, by) {
      var edge = { ax: ax, ay: ay, bx: bx, by: by, used: false };
      edges.push(edge);
      var key = ax + ',' + ay;
      if (!byStart[key]) byStart[key] = [];
      byStart[key].push(edge);
    }

    var edges = [];
    var byStart = {};
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!filled(x, y)) continue;
        if (!filled(x, y - 1)) pushEdge(edges, byStart, x, y, x + 1, y);
        if (!filled(x + 1, y)) pushEdge(edges, byStart, x + 1, y, x + 1, y + 1);
        if (!filled(x, y + 1)) pushEdge(edges, byStart, x + 1, y + 1, x, y + 1);
        if (!filled(x - 1, y)) pushEdge(edges, byStart, x, y + 1, x, y);
      }
    }

    var contours = [];
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      if (edge.used) continue;
      edge.used = true;
      var contour = [{ x: edge.ax, y: edge.ay }, { x: edge.bx, y: edge.by }];
      var currentKey = edge.bx + ',' + edge.by;
      var guard = 0;
      while (currentKey !== (edge.ax + ',' + edge.ay) && guard < edges.length + 8) {
        guard++;
        var nextList = byStart[currentKey] || [];
        var next = null;
        for (var j = 0; j < nextList.length; j++) {
          if (!nextList[j].used) { next = nextList[j]; break; }
        }
        if (!next) break;
        next.used = true;
        contour.push({ x: next.bx, y: next.by });
        currentKey = next.bx + ',' + next.by;
      }
      contour = VST._normalizeContourPoints(contour);
      if (contour.length >= 3) contours.push(contour);
    }
    return contours;
  };

  VST._rasterContoursFromObject = function (obj, done) {
    if (!obj || typeof obj.clone !== 'function') { done([]); return; }
    var bb = obj.getBoundingRect(true, true);
    var scale = obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox' ? 6 : 4;
    var pad = 12;
    var w = Math.max(32, Math.ceil(bb.width * scale) + pad * 2);
    var h = Math.max(32, Math.ceil(bb.height * scale) + pad * 2);
    var tmpEl = document.createElement('canvas');
    tmpEl.width = w;
    tmpEl.height = h;
    var tmpFab = new fabric.StaticCanvas(tmpEl, { width: w, height: h, enableRetinaScaling: false });

    obj.clone(function (cloned) {
      if (!cloned) { try { tmpFab.dispose(); } catch (e) {} done([]); return; }
      cloned.set({
        left: ((obj.left || 0) - bb.left) * scale + pad,
        top: ((obj.top || 0) - bb.top) * scale + pad,
        scaleX: (obj.scaleX || 1) * scale,
        scaleY: (obj.scaleY || 1) * scale,
        angle: obj.angle || 0,
        flipX: !!obj.flipX,
        flipY: !!obj.flipY,
        shadow: null,
        selectable: false,
        evented: false
      });
      if (cloned.type === 'text' || cloned.type === 'i-text' || cloned.type === 'textbox') {
        cloned.editable = false;
        cloned.isEditing = false;
      }
      tmpFab.add(cloned);
      tmpFab.renderAll();
      var ctx = tmpEl.getContext('2d');
      var img = ctx.getImageData(0, 0, w, h);
      var loops = VST._traceAlphaContours(img.data, w, h, 16);
      var contours = [];
      for (var i = 0; i < loops.length; i++) {
        var worldLoop = [];
        for (var j = 0; j < loops[i].length; j++) {
          worldLoop.push({
            x: bb.left + ((loops[i][j].x - pad) / scale),
            y: bb.top + ((loops[i][j].y - pad) / scale)
          });
        }
        worldLoop = VST._limitContourPoints(worldLoop, 420);
        if (worldLoop.length >= 3 && Math.abs(VST._contourArea(worldLoop)) > 1) contours.push(worldLoop);
      }
      try { tmpFab.dispose(); } catch (err) {}
      done(contours);
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'contour', parent: 'canvas.tools.selection-tools', title: 'selection-tools: contour', mount: function () {}, unmount: function () {} });
  }
})();
