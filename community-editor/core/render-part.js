/* core/render-part.js — Unified Render Core (export-import-manager-plan Phase 1).
   ONE offscreen fabric.StaticCanvas rendering primitive for every part type. Replaces 5 near-duplicate
   renderers (export-manager/service renderPage+renderPageSVG, export/image renderPageToDataURL,
   scene/export _scRenderFrameToDataURL, scene/covers _renderCanvasJson + _ccRenderObjectCover,
   canvas/page-preview inline thumbnail). Loaded as a CORE script BEFORE core/loader.js, so every module
   that renders finds it ready at runtime. Never touches the live canvas.

   window.renderPart(target, opts) -> Promise (never rejects; resolves null on failure)
     target = {
       kind : 'page' | 'slide' | 'board' | 'frame' | 'object',
       json : fabric canvas JSON (page/slide/board) or CCFrame / flat world-coord objects (frame),
       w, h : intrinsic pixel size,
       bg   : background color, or null/undefined,
       x, y : world offset (frame flat-objects only),
       obj  : live fabric object (kind:'object' only)
     }
     opts = {
       out        : 'dataURL' (default) | 'svg' | 'draw',
       format     : 'png' (default) | 'jpeg' | 'webp',
       quality    : number (default: jpeg 0.92, else 0.95),
       dpi        : number  -> multiplier = dpi / 72,
       scale      : number  -> multiplier = scale,
       fit        : number  -> multiplier = min(1, fit / w)  (thumbnail long-edge),
       multiplier : number  (explicit; wins over dpi/scale/fit),
       transparent: bool    -> background = null,
       retina     : bool    (default true; false => enableRetinaScaling:false),
       shadowNull : bool    (strip shadow; default true for object, opt-in for frame),
       drawTo     : <canvas> (out:'draw' target)
     }
   Resolves: dataURL string (out:'dataURL'), svg string (out:'svg'), or the drawTo canvas (out:'draw').

   window.renderPartCb(target, opts, cb)  — callback adapter for legacy callback-style callers.

   window.resolvePartSource(page, opts) -> normalized target for a page entry (part-aware):
     slide-deck    -> active (or opts.slideIndex) inner slide,
     scene         -> opts.frameIndex frame (or first) as kind:'frame'  [full composite = Phase 4],
     classic/board -> kind:'page' | 'board' from page.json.                                            */
(function (global) {
  'use strict';

  function _num(v) { return typeof v === 'number' && isFinite(v); }

  function _resolveMultiplier(opts, w) {
    if (_num(opts.multiplier)) return opts.multiplier;
    if (_num(opts.dpi)) return opts.dpi / 72;
    if (_num(opts.scale)) return opts.scale;
    if (_num(opts.fit)) return w ? Math.min(1, opts.fit / w) : 0.5;
    return 1;
  }

  function _quality(opts, format) {
    if (_num(opts.quality)) return opts.quality;
    return format === 'jpeg' ? 0.92 : 0.95;
  }

  function _resolveBg(target, opts) {
    if (opts.transparent) return null;
    if (target.bg != null) return target.bg;
    if (target.json && target.json.background != null) return target.json.background;
    return '#ffffff';
  }

  function _canvasOpts(w, h, opts) {
    var o = { width: w || 1, height: h || 1, renderOnAddRemove: false };
    if (opts.retina === false) o.enableRetinaScaling = false;
    return o;
  }

  var _raf = global.requestAnimationFrame
    ? function (f) { return global.requestAnimationFrame(f); }
    : function (f) { return setTimeout(f, 16); };

  function _mimeFor(format) {
    return format === 'jpeg' ? 'image/jpeg' : (format === 'webp' ? 'image/webp' : 'image/png');
  }

  function _dataURLtoBlob(dataURL) {
    try {
      var parts = dataURL.split(','), mime = parts[0].match(/:(.*?);/)[1], bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }

  /* out:'blob' — high-DPI-safe encode. Rasterize ONCE to an offscreen canvas (toCanvasElement) then
     encode with the ASYNC canvas.toBlob, so the heavy PNG/JPEG encode runs off the main thread — no
     synchronous toDataURL freeze and no giant base64 string doubling memory. Deferred a frame so the
     progress overlay repaints between the two costly steps. onProgress(0..1) fires at each milestone. */
  function _outputBlob(tmp, opts, format, resolve) {
    var mult = _resolveMultiplier(opts, tmp.width);
    var mime = _mimeFor(format);
    var q = _quality(opts, format);
    var onP = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    if (onP) { try { onP(0.55); } catch (e) {} }
    _raf(function () {
      var el = null;
      try { el = tmp.toCanvasElement(mult); } catch (e) { el = null; }
      try { tmp.dispose(); } catch (e) {}
      if (!el) { resolve(null); return; }
      if (onP) { try { onP(0.85); } catch (e) {} }
      var _done = function (blob) {
        try { el.width = el.height = 0; } catch (e) {}   // release the big backing store early
        if (onP) { try { onP(1); } catch (e) {} }
        resolve(blob || null);
      };
      if (el.toBlob) {
        _raf(function () { el.toBlob(_done, mime, q); });
      } else {
        var durl = null;
        try { durl = el.toDataURL(mime, q); } catch (e) { durl = null; }
        _done(durl ? _dataURLtoBlob(durl) : null);
      }
    });
  }

  /* Produce the requested output from a rendered temp canvas, then dispose it. */
  function _output(tmp, opts, resolve) {
    var out = opts.out || 'dataURL';
    var format = opts.format || 'png';
    try {
      tmp.renderAll();
      if (out === 'svg') {
        var svg = tmp.toSVG();
        tmp.dispose();
        // fabric 5.x interpolates object strings (fontFamily, fill, …) straight into SVG attribute
        // markup without escaping them (CVE-2026-27013), so a crafted document — e.g. one opened
        // from the community — can inject elements into an SVG WE hand back to the user. Sanitise
        // before the string leaves here, and FAIL CLOSED: an export that cannot be proven clean is
        // cancelled rather than written out raw. `_sanitizeSVG` also returns '' on a malformed doc,
        // which is exactly the shape a successful injection produces.
        var clean = (typeof global._sanitizeSVG === 'function') ? global._sanitizeSVG(svg) : '';
        if (!clean) {
          console.error('[renderPart] SVG sanitize unavailable or failed — export cancelled');
          resolve(null);
          return;
        }
        resolve(clean);
        return;
      }
      if (out === 'draw' && opts.drawTo) {
        var ctx = opts.drawTo.getContext ? opts.drawTo.getContext('2d') : null;
        if (ctx) { try { ctx.drawImage(tmp.lowerCanvasEl, 0, 0); } catch (e) {} }
        tmp.dispose();
        resolve(opts.drawTo);
        return;
      }
      if (out === 'blob') { _outputBlob(tmp, opts, format, resolve); return; }
      var url;
      try {
        url = tmp.toDataURL({ format: format, multiplier: _resolveMultiplier(opts, tmp.width), quality: _quality(opts, format) });
      } catch (e) { url = null; }
      tmp.dispose();
      resolve(url);
    } catch (e) {
      try { tmp.dispose(); } catch (e2) {}
      resolve(null);
    }
  }

  /* kind:'frame' — CCFrame (centered) or flat world-coord objects offset into the frame's local space. */
  function _enlivenFrame(tmp, target, done) {
    var j = target.json;
    var fw = target.w || 1, fh = target.h || 1, fx = target.x || 0, fy = target.y || 0;
    if (j && j.type === 'ccframe' && fabric.CCFrame && typeof fabric.CCFrame.fromObject === 'function') {
      fabric.CCFrame.fromObject(j, function (fo) {
        fo.set({ shadow: null });
        fo.setPositionByOrigin(new fabric.Point(fw / 2, fh / 2), 'center', 'center');
        tmp.add(fo);
        done();
      });
      return;
    }
    var objs = (j && j.objects) || [];
    if (!objs.length) { done(); return; }
    fabric.util.enlivenObjects(objs, function (eobjs) {
      eobjs.forEach(function (o) {
        o.set({ left: (o.left || 0) - fx, top: (o.top || 0) - fy, clipPath: null });
        tmp.add(o);
      });
      done();
    });
  }

  /* kind:'object' — clone the live fabric object, crop to its bounding rect, transparent bg. */
  function _renderObject(target, opts, resolve) {
    var obj = target.obj;
    if (!obj || typeof obj.clone !== 'function') { resolve(null); return; }
    var cp = (global.cc && cc.customProps) ? cc.customProps() : undefined;
    obj.clone(function (clone) {
      try {
        if (opts.shadowNull !== false) clone.set({ shadow: null });
        var br = clone.getBoundingRect(true, true);
        var w = Math.max(1, Math.round(br.width)), h = Math.max(1, Math.round(br.height));
        clone.set({ left: (clone.left || 0) - br.left, top: (clone.top || 0) - br.top });
        clone.setCoords();
        var tmp = new fabric.StaticCanvas(null, { width: w, height: h, backgroundColor: 'rgba(0,0,0,0)', renderOnAddRemove: false });
        tmp.add(clone);
        _output(tmp, opts, resolve);
      } catch (e) { resolve(null); }
    }, cp);
  }

  function renderPart(target, opts) {
    opts = opts || {};
    target = target || {};
    return new Promise(function (resolve) {
      if (typeof fabric === 'undefined' || !fabric || !fabric.StaticCanvas) { resolve(null); return; }

      if (target.kind === 'object') { _renderObject(target, opts, resolve); return; }

      var CWf = (typeof CW !== 'undefined' ? CW : 0) || 1;
      var CHf = (typeof CH !== 'undefined' ? CH : 0) || 1;
      var w = target.w || CWf;
      var h = target.h || CHf;
      var tmp = new fabric.StaticCanvas(null, _canvasOpts(w, h, opts));
      var bg = _resolveBg(target, opts);

      if (target.kind === 'frame') {
        _enlivenFrame(tmp, target, function () {
          tmp.setBackgroundColor(bg, function () { _output(tmp, opts, resolve); });
        });
        return;
      }

      // kind:'page' | 'slide' | 'board' — a full fabric canvas JSON.
      if (!target.json) {
        tmp.setBackgroundColor(bg, function () { _output(tmp, opts, resolve); });
        return;
      }
      tmp.loadFromJSON(target.json, function () {
        if (typeof opts.onProgress === 'function') { try { opts.onProgress(0.35); } catch (e) {} }
        tmp.setBackgroundColor(bg, function () { _output(tmp, opts, resolve); });
      });
    });
  }

  function renderPartCb(target, opts, cb) {
    renderPart(target, opts).then(function (r) { if (typeof cb === 'function') cb(r); });
  }

  /* Part-aware source resolver: normalize a page entry to a renderPart target reading the REAL sub-model
     (fixes scene/slide pages that carry a blank page.json). */
  function resolvePartSource(page, opts) {
    opts = opts || {};
    if (!page) return null;

    if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(page) && page._slideDeck && page._slideDeck.slides) {
      var slides = page._slideDeck.slides;
      var si = _num(opts.slideIndex) ? opts.slideIndex : (page._slideDeck.activeSlideIndex || 0);
      var slide = slides[si] || slides[0];
      if (slide) return { kind: 'slide', json: slide.json, w: slide.w, h: slide.h, bg: slide.bg };
    }

    if (page._productType === 'scene' && page._scene && page._scene.frames && page._scene.frames.length) {
      var frames = page._scene.frames;
      var fi = _num(opts.frameIndex) ? opts.frameIndex : 0;
      var fr = frames[fi] || frames[0];
      if (fr) return { kind: 'frame', json: fr.json, w: fr.w, h: fr.h, bg: fr.bg, x: fr.x, y: fr.y };
    }

    // Page-sleep: a slept PLAIN page has json parked out of the array; _psJsonForSave
    // returns it synchronously (no-op when sleep is off -> === page.json).
    var _pj = (typeof _psJsonForSave === 'function') ? _psJsonForSave(page) : page.json;
    return { kind: page._isBoard ? 'board' : 'page', json: _pj, w: page.w, h: page.h, bg: page.bg };
  }

  global.renderPart = renderPart;
  global.renderPartCb = renderPartCb;
  global.resolvePartSource = resolvePartSource;
})(window);
