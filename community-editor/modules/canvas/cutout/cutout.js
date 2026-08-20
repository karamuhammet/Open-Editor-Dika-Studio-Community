/* ══════════════════════════════════════════════════════════════
   Cutout ("Arka Plani Kaldir")  -  canvas/cutout

   Removes an image's background on the user's own device and writes the result
   into the ALPHA channel of the original pixels, so the subject itself is never
   regenerated, resized or recompressed.

   Model: IS-Net general-use (products AND people). Two tiers, both measured on the
   WASM runtime before being offered here:
     isnet-general-fp16  84 MB  ~4.1 s  MIT
   COMMUNITY EDITION: ONE tier. Upstream also offers fp32 (167 MB, ~4.3 s) as a
   "Quality" option, and its own measurement is why it is not here: fp16 scored an
   IoU of 1.000 against it, so the second copy cost 167 MB of download for no visible
   difference. The int8 build was rejected long before that: 42 MB and faster, but it
   leaves a ~6% alpha haze in the background it claims to remove (IoU 0.881).
   With one tier there is no picker: a radio list with a single option is a control
   nobody can use. The consent step stays, because a download still happens.

   Public contract (the UI is untouched and keeps calling these names):
     window.removeImageBg()               act on the selection
     window.removeImageBgWithFrame()
     window._reapplyContourStrokes()
     window.ccCutoutObjects(cvs, objs)    headless: cut N caller-chosen images, one undo
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VENDOR = 'vendor/cutout/';
  var TIERS = {
    fast: { id: 'fast', label: 'Fast', file: 'isnet-general-fp16.onnx', mb: 84, note: 'Runs entirely on your device' }
  };
  var TIER_KEY = 'cc_cutout_tier';
  var SRC_CAP = 4096;      // guards the O(W*H) alpha pass; iOS also refuses >16.7MP canvases
  var RUN_TIMEOUT = 300000;

  var _busy = false;
  var _worker = null;
  var _ready = false;

  /* ── paths: works both under /editor/ and on the standalone static host ── */
  function _base() {
    var s = document.querySelector('script[src*="core/loader.js"], script[src*="modules.bundle.js"]');
    var href = (s && s.src) || location.href;
    return href.replace(/(core\/loader\.js|dist\/modules\.bundle\.js).*$/, '').replace(/[^/]*$/, '');
  }
  function _vendorUrl() { return new URL(VENDOR, _base()).href; }
  function _workerUrl() { return new URL('modules/canvas/cutout/cutout.worker.js', _base()).href; }

  /* One tier, so there is nothing to remember and nothing to guess from the device. A stored
     preference from an older build is still honoured if it names a tier that exists. */
  function _tier() {
    try { var v = localStorage.getItem(TIER_KEY); if (TIERS[v]) return TIERS[v]; } catch (e) {}
    return TIERS.fast;
  }
  function _setTier(id) { try { localStorage.setItem(TIER_KEY, id); } catch (e) {} }

  function _cached(tier) {
    if (typeof caches === 'undefined' || !caches.open) return Promise.resolve(false);
    return caches.open('cc-transformers-cutout-v1')
      .then(function (c) { return c.match(_vendorUrl() + tier.file); })
      .then(function (r) { return !!r; })['catch'](function () { return false; });
  }

  function _err(e) {
    if (e == null) return 'unknown error';
    if (typeof e === 'string') return e;
    if (typeof e === 'number') return 'WASM abort kodu ' + e;
    return e.message || String(e);
  }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

  /* ══════════ worker supervisor ══════════
     One flight at a time. Any fault kills the worker rather than the editor: it is
     terminated, rebuilt and the run is retried once. A hung run hits the timeout and
     is treated the same way, so nothing can spin forever. */
  function _spawn(tier, onProgress) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker(_workerUrl(), { type: 'module' }); }
      catch (e) { reject(new Error('Islemci baslatilamadi: ' + _err(e))); return; }
      var settled = false;
      var t = setTimeout(function () {
        if (settled) return; settled = true;
        try { w.terminate(); } catch (e) {}
        reject(new Error('Model could not be prepared (timed out)'));
      }, RUN_TIMEOUT);

      w.onmessage = function (e) {
        var m = e.data || {};
        if (m.type === 'progress') { onProgress && onProgress(m); return; }
        if (m.type === 'ready') { if (settled) return; settled = true; clearTimeout(t); _ready = true; resolve(w); return; }
        if (m.type === 'error') { if (settled) return; settled = true; clearTimeout(t); try { w.terminate(); } catch (x) {} reject(new Error(m.message)); }
      };
      w.onerror = function (ev) {
        if (settled) return; settled = true; clearTimeout(t);
        try { w.terminate(); } catch (e) {}
        reject(new Error('Islemci hatasi: ' + ((ev && ev.message) || 'bilinmiyor')));
      };
      w.postMessage({
        type: 'init',
        vendorBase: _vendorUrl(),
        modelUrl: _vendorUrl() + tier.file,
        threads: navigator.hardwareConcurrency || 4
      });
    });
  }

  function _kill() {
    if (_worker) { try { _worker.terminate(); } catch (e) {} }
    _worker = null; _ready = false;
  }

  function _runOnce(bitmap, onProgress) {
    return new Promise(function (resolve, reject) {
      var id = String(Date.now()) + Math.random();
      var settled = false;
      var t = setTimeout(function () {
        if (settled) return; settled = true;
        _kill();
        reject(new Error('Islem cok uzun surdu'));
      }, RUN_TIMEOUT);

      _worker.onmessage = function (e) {
        var m = e.data || {};
        if (m.type === 'progress') { onProgress && onProgress(m); return; }
        if (m.type === 'result' && m.id === id) { if (settled) return; settled = true; clearTimeout(t); resolve(m); return; }
        if (m.type === 'error') { if (settled) return; settled = true; clearTimeout(t); _kill(); reject(new Error(m.message)); }
      };
      _worker.onerror = function (ev) {
        if (settled) return; settled = true; clearTimeout(t);
        _kill();
        reject(new Error('Islemci coktu: ' + ((ev && ev.message) || 'bilinmiyor')));
      };
      _worker.postMessage({ type: 'run', id: id, bitmap: bitmap }, [bitmap]);
    });
  }

  /** Segment an image element -> { mask:Uint8Array, w, h } at model resolution. */
  function segment(imgEl, tier, onProgress) {
    var nw = imgEl.naturalWidth || imgEl.width;
    var nh = imgEl.naturalHeight || imgEl.height;

    return _makeBitmap(imgEl, nw, nh).then(function (bmp) {
      var attempt = function (retrying) {
        var p = (_worker && _ready) ? Promise.resolve(_worker) : _spawn(tier, onProgress).then(function (w) { _worker = w; return w; });
        return p.then(function () { return _runOnce(bmp, onProgress); })['catch'](function (e) {
          if (retrying) throw e;
          // The worker is gone by now; a fresh one is the entire recovery story.
          _kill();
          return _makeBitmap(imgEl, nw, nh).then(function (b2) { bmp = b2; return attempt(true); });
        });
      };
      return attempt(false);
    });
  }

  function _makeBitmap(imgEl, nw, nh) {
    return createImageBitmap(imgEl, { resizeQuality: 'high' });
  }

  /* ══════════ consent dialog (tier picker + honest cache note) ══════════ */
  function _consent(tier) {
    return _cached(tier).then(function (isCached) {
      if (isCached) return { ok: true, tier: tier };
      return new Promise(function (resolve) {
        var ov = document.createElement('div');
        ov.className = 'cut-ov';
        /* One tier: an informational row, not a radio. More than one (if a future build adds a
           tier back): the picker returns. The list decides, not a hardcoded shape. */
        var keys = Object.keys(TIERS);
        var multi = keys.length > 1;
        var rows = keys.map(function (k) {
          var t = TIERS[k];
          var on = t.id === tier.id;
          return '<label class="cut-tier' + (on ? ' is-on' : '') + '">' +
            (multi ? '<input type="radio" name="cut-tier" value="' + t.id + '"' + (on ? ' checked' : '') + '>' : '') +
            '<span class="cut-tier-main"><b>' + t.label + '</b><i>' + t.note + '</i></span>' +
            '<span class="cut-tier-mb">' + t.mb + ' MB</span></label>';
        }).join('');
        ov.innerHTML =
          '<div class="cut-modal" role="dialog" aria-modal="true" aria-labelledby="cut-h">' +
            '<div class="cut-head" id="cut-h">AI model will download</div>' +
            '<div class="cut-body">' +
              '<div class="cut-sub">Background removal runs entirely on your device. The image never leaves this machine.</div>' +
              '<div class="cut-tiers">' + rows + '</div>' +
              '<div class="cut-note">Model downloads <b>once</b> and is stored in your browser, won\'t download again. If you clear cache from Settings, it will need to download again.</div>' +
            '</div>' +
            '<div class="cut-foot">' +
              '<button type="button" class="cut-btn" data-act="cancel">Cancel</button>' +
              '<button type="button" class="cut-btn cut-btn-go" data-act="go">Continue</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(ov);

        var chosen = tier;
        function close(v) { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); }
        function onKey(e) { if (e.key === 'Escape') close({ ok: false }); }
        document.addEventListener('keydown', onKey);
        ov.addEventListener('change', function (e) {
          if (e.target.name !== 'cut-tier') return;
          chosen = TIERS[e.target.value] || chosen;
          Array.prototype.forEach.call(ov.querySelectorAll('.cut-tier'), function (l) {
            l.classList.toggle('is-on', l.querySelector('input').value === chosen.id);
          });
        });
        ov.addEventListener('click', function (e) {
          var b = e.target.closest && e.target.closest('[data-act]');
          if (!b) { if (e.target === ov) close({ ok: false }); return; }
          if (b.getAttribute('data-act') === 'go') { _setTier(chosen.id); close({ ok: true, tier: chosen }); }
          else close({ ok: false });
        });
        var go = ov.querySelector('.cut-btn-go'); if (go) go.focus();
      });
    });
  }

  /* ══════════ overlay ══════════ */
  function _ov(show, msg, pct) {
    var el = document.getElementById('cut-progress');
    if (!show) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'cut-progress';
      el.className = 'cut-ov';
      el.innerHTML = '<div class="cut-card"><div class="cut-spin"></div><div class="cut-msg"></div><div class="cut-pct"></div></div>';
      document.body.appendChild(el);
    }
    el.querySelector('.cut-msg').textContent = msg || '';
    el.querySelector('.cut-pct').textContent = (pct == null || pct < 0) ? '' : '%' + pct;
  }
  function _progressText(m) {
    if (m.phase === 'download') return 'Downloading AI model';
    if (m.phase === 'cache') return 'Preparing model';
    if (m.phase === 'init') return 'Opening model';
    if (m.phase === 'apply') return 'Applying';
    return 'Removing background';
  }

  /* ══════════ mask -> alpha on the ORIGINAL pixels ══════════ */
  function _applyMask(imgEl, res) {
    var nw = imgEl.naturalWidth || imgEl.width;
    var nh = imgEl.naturalHeight || imgEl.height;
    var sc = Math.min(1, SRC_CAP / Math.max(nw, nh));
    var w = Math.max(1, Math.round(nw * sc)), h = Math.max(1, Math.round(nh * sc));

    // mask (model res) -> source res, bilinear via the 2D context
    var mc = document.createElement('canvas'); mc.width = res.w; mc.height = res.h;
    var mctx = mc.getContext('2d');
    var mid = mctx.createImageData(res.w, res.h), md = mid.data;
    for (var i = 0; i < res.w * res.h; i++) {
      var v = res.mask[i];
      md[i * 4] = v; md[i * 4 + 1] = v; md[i * 4 + 2] = v; md[i * 4 + 3] = 255;
    }
    mctx.putImageData(mid, 0, 0);

    var sc2 = document.createElement('canvas'); sc2.width = w; sc2.height = h;
    var sctx = sc2.getContext('2d');
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(mc, 0, 0, w, h);
    var scaled = sctx.getImageData(0, 0, w, h).data;

    // original pixels, alpha replaced by the mask: the subject is never re-encoded
    var out = document.createElement('canvas'); out.width = w; out.height = h;
    var octx = out.getContext('2d');
    octx.drawImage(imgEl, 0, 0, w, h);
    var id = octx.getImageData(0, 0, w, h), d = id.data;
    for (var p = 0; p < w * h; p++) d[p * 4 + 3] = scaled[p * 4];
    octx.putImageData(id, 0, 0);
    return out;
  }

  /* ══════════ entry points (public contract) ══════════ */
  function _pick() {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : window.canvas;
    if (!cvs) return null;
    var obj = cvs.getActiveObject();
    if (!obj || obj.type !== 'image' || obj.isQR || obj._isChart || obj._isEffect) {
      toast('First select an image');
      return null;
    }
    var el = obj._originalElement || obj._element;
    if (!el) { toast('Cannot access image data'); return null; }
    return { cvs: cvs, obj: obj, el: el };
  }

  /** Segment + swap ONE already-chosen object (the caller picked it, not _pick).
   *  Resolves {obj:newImage}, or {empty:true} when the model found no subject and the
   *  image was left untouched. */
  function _cutOne(cvs, obj, tier, withFrame, onProgress, opts) {
    var el = obj._originalElement || obj._element;
    if (!el) return Promise.reject(new Error('Cannot access image data'));
    return segment(el, tier, onProgress).then(function (res) {
      onProgress && onProgress({ phase: 'apply', pct: -1 });
      return _applyCutout(cvs, obj, _applyMask(el, res), withFrame, opts);
    });
  }

  function _run(withFrame) {
    if (_busy) return;
    var sel = _pick();
    if (!sel) return;

    // Claim the flight SYNCHRONOUSLY. _consent is async, so a second trigger arriving
    // before it resolves would sail past the guard and start a parallel run - and both
    // would then reassign the single worker's onmessage, so the first never resolves and
    // only its 5-minute timeout would end it. Every claimer must take _busy this early.
    _busy = true;
    _consent(_tier()).then(function (c) {
      if (!c.ok) return;
      _ov(true, 'Preparing AI model', -1);
      return _cutOne(sel.cvs, sel.obj, c.tier, withFrame, function (m) { _ov(true, _progressText(m), m.pct); })
        .then(function (r) {
          toast(r && r.empty ? 'Subject not found, image unchanged' : 'Background removed');
        });
    })['catch'](function (e) {
      console.error('[cutout] failed:', e);
      toast('Background could not be removed: ' + _err(e));
    }).then(function () { _ov(false); _busy = false; });
  }

  window.removeImageBg = function () { _run(false); };
  window.removeImageBgWithFrame = function () { _run(true); };

  /* ══════════ headless batch (paste-style) ══════════
     A cutout is baked pixels, not a property, so a copied "background removed" cannot be
     pasted as a flag - the target has to be segmented itself. This is the entry point for
     callers that already know WHICH objects to cut, rather than reading the selection.
     One flight at a time (the model is single-worker); images that are already cut, or
     are not real photos, are dropped rather than wasting a run. The whole batch costs ONE
     history entry, so a paste is one undo. Resolves with the number actually changed. */
  window.ccCutoutObjects = function (cvs, objs) {
    if (_busy) { toast('Background removal already in progress'); return Promise.resolve(0); }
    var list = (objs || []).filter(function (o) {
      return o && o.type === 'image' && !o.isQR && !o._isChart && !o._isEffect &&
        !o._hasBgRemoved && (o._originalElement || o._element);
    });
    if (!list.length) return Promise.resolve(0);

    _busy = true;   // synchronously, for the reason spelled out in _run
    return _consent(_tier()).then(function (c) {
      if (!c.ok) return 0;
      var done = 0, empty = 0;

      function step(i) {
        if (i >= list.length) return Promise.resolve();
        var tag = list.length > 1 ? ' (' + (i + 1) + '/' + list.length + ')' : '';
        _ov(true, 'Preparing AI model' + tag, -1);
        return _cutOne(cvs, list[i], c.tier, false,
          function (m) { _ov(true, _progressText(m) + tag, m.pct); },
          { select: false, snap: false })
          .then(function (r) { if (r && r.empty) empty++; else if (r) done++; },
            // one bad image must not abandon the rest of the batch
            function (e) { console.error('[cutout] batch item failed:', e); })
          .then(function () { return step(i + 1); });
      }

      return step(0).then(function () {
        if (done) {
          cvs.renderAll();
          if (typeof snap === 'function') snap();
          if (typeof updateFloatTB === 'function') updateFloatTB();
        }
        toast(done ? ('Background removed (' + done + ')')
          : empty ? 'Subject not found, image unchanged'
            : 'Background could not be removed');
        return done;
      });
    })['catch'](function (e) {
      console.error('[cutout] batch failed:', e);
      toast('Background could not be removed: ' + _err(e));
      return 0;
    }).then(function (n) { _ov(false); _busy = false; return n; });
  };

  /* ══════════ apply to the fabric object ══════════
     Trims to the visible bounds, records the alpha contour, and swaps the object in
     with its transform preserved. _hasBgRemoved / _alphaContour are serialized into
     saved projects (CUSTOM_PROPS) and read by app.js + crop-tool, so they must keep
     being produced exactly as before or old documents break.
     Resolves {obj:newImage}, or {empty:true} when no subject was found and the image was
     left alone. opts.select:false leaves the selection where it is and opts.snap:false
     skips the history entry - together they let a batch cost one undo instead of N. */
  function _applyCutout(cvs, obj, fgCanvas, withFrame, opts) {
    var el = obj._originalElement || obj._element;
    var origW = fgCanvas.width, origH = fgCanvas.height;
    var props = {
      scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, opacity: obj.opacity,
      flipX: obj.flipX, flipY: obj.flipY,
      // The swap must not quietly drop the look the USER chose: a border/shadow belongs
      // to the object, not to the background the model removed. Carrying the border is
      // also what gives _stroke() something to draw - it is the whole reason the alpha
      // contour is traced, so the border hugs the subject instead of an empty box.
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      strokeUniform: obj.strokeUniform,
      strokeDashArray: obj.strokeDashArray ? obj.strokeDashArray.slice() : null,
      shadow: obj.shadow,
      _nativeW: el ? (el.naturalWidth || el.width) : obj.width,
      _nativeH: el ? (el.naturalHeight || el.height) : obj.height
    };
    var center = obj.getCenterPoint();

    var ctx = fgCanvas.getContext('2d');
    var data = ctx.getImageData(0, 0, origW, origH).data;
    var minX = origW, minY = origH, maxX = 0, maxY = 0, any = false;
    for (var y = 0; y < origH; y++) {
      for (var x = 0; x < origW; x++) {
        if (data[(y * origW + x) * 4 + 3] > 10) {
          any = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (!any) return Promise.resolve({ empty: true });

    var pad = 2;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(origW - 1, maxX + pad); maxY = Math.min(origH - 1, maxY + pad);
    var cw = maxX - minX + 1, ch = maxY - minY + 1;

    var crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
    var cctx = crop.getContext('2d');
    cctx.drawImage(fgCanvas, minX, minY, cw, ch, 0, 0, cw, ch);

    // Always: once the background is gone, a Border must hug the subject rather than
    // the bounding box, and that is only possible with the outline in hand.
    var contour = _contour(cctx, cw, ch);
    return _finish(cvs, obj, crop.toDataURL('image/png'), props, center, contour, minX, minY, origW, origH, opts);
  }
  window.applyCutout = _applyCutout;

  /** Traced alpha outline as an ORDERED path of {x,y} in the image's own pixel space.
   *  Ordered matters: the renderer walks it with lineTo, so a scatter of edge pixels
   *  would draw noise. Moore-neighbour boundary trace on a downsampled mask - coarse on
   *  purpose, since it is a visual frame and a per-pixel path would bloat every save.
   *  Format is a flat [{x,y}...] array because that is what already lives in saved
   *  documents; changing it would orphan every existing cutout. */
  function _contour(ctx, w, h) {
    var MAXD = 300;
    var sc = Math.min(1, MAXD / Math.max(w, h));
    var mw = Math.max(3, Math.round(w * sc)), mh = Math.max(3, Math.round(h * sc));

    var small = document.createElement('canvas');
    small.width = mw; small.height = mh;
    var sctx = small.getContext('2d');
    sctx.drawImage(ctx.canvas, 0, 0, mw, mh);
    var d = sctx.getImageData(0, 0, mw, mh).data;

    function solid(x, y) {
      if (x < 0 || y < 0 || x >= mw || y >= mh) return false;
      return d[(y * mw + x) * 4 + 3] > 32;
    }

    // start = first solid pixel in scan order
    var sx = -1, sy = -1;
    for (var y = 0; y < mh && sx < 0; y++) {
      for (var x = 0; x < mw; x++) { if (solid(x, y)) { sx = x; sy = y; break; } }
    }
    if (sx < 0) return null;

    // Moore-neighbour trace, clockwise from the west of the entry pixel
    var N = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
    var pts = [];
    var cx = sx, cy = sy, bDir = 0;
    var guard = mw * mh * 4;
    do {
      pts.push({ x: cx / sc, y: cy / sc });
      var found = false;
      for (var i = 0; i < 8; i++) {
        var dir = (bDir + i) % 8;
        var nx = cx + N[dir][0], ny = cy + N[dir][1];
        if (solid(nx, ny)) {
          bDir = (dir + 5) % 8;   // back up to the previous neighbour, keep hugging
          cx = nx; cy = ny;
          found = true;
          break;
        }
      }
      if (!found) break;          // isolated pixel
    } while ((cx !== sx || cy !== sy) && --guard > 0 && pts.length < 4000);

    return pts.length > 4 ? pts : null;
  }

  function _finish(cvs, origObj, dataURL, props, center, contour, offX, offY, origW, origH, opts) {
    var select = !opts || opts.select !== false;
    var doSnap = !opts || opts.snap !== false;
    return new Promise(function (resolve, reject) {
      fabric.Image.fromURL(dataURL, function (newImg) {
        if (!newImg || !newImg._element) { reject(new Error('Result could not be loaded')); return; }
        var nativeW = props._nativeW || origW, nativeH = props._nativeH || origH;
        var sx = (props.scaleX || 1) * (origW !== nativeW ? nativeW / origW : 1);
        var sy = (props.scaleY || 1) * (origH !== nativeH ? nativeH / origH : 1);

        // trimming moves the visual centre; put it back where the user had it
        var dxLocal = (offX + newImg.width / 2) - origW / 2;
        var dyLocal = (offY + newImg.height / 2) - origH / 2;
        var a = (props.angle || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
        var dx = dxLocal * sx * cos - dyLocal * sy * sin;
        var dy = dxLocal * sx * sin + dyLocal * sy * cos;
        if (props.flipX) dx = -dx;
        if (props.flipY) dy = -dy;

        newImg.set({
          left: center.x + dx, top: center.y + dy,
          originX: 'center', originY: 'center',
          scaleX: sx, scaleY: sy,
          angle: props.angle, opacity: props.opacity,
          flipX: props.flipX, flipY: props.flipY,
          stroke: props.stroke,
          strokeWidth: props.strokeWidth,
          strokeUniform: props.strokeUniform,
          strokeDashArray: props.strokeDashArray,
          shadow: props.shadow,
          _hasBgRemoved: true,
          _alphaContour: contour || undefined
        });

        // app.js binds object:removed -> snap, so every swap otherwise lands its own
        // history entry and {snap:false} alone would suppress nothing. A batch locks the
        // swap (the same idiom addToCenter uses) and its caller snapshots ONCE at the
        // end, so a paste costs one undo instead of one per image. Only safe because the
        // batch never runs in video mode, where histLocked makes overlay.js read the add
        // as a restore and skip creating the timeline clip.
        var lock = !doSnap;
        var prevLock = histLocked;
        if (lock) histLocked = true;
        cvs.remove(origObj);
        cvs.add(newImg);
        if (lock) histLocked = prevLock;
        if (select) cvs.setActiveObject(newImg);
        if (contour) _stroke(newImg);
        cvs.renderAll();
        if (doSnap && typeof snap === 'function') snap();
        if (select && typeof updateFloatTB === 'function') updateFloatTB();
        resolve({ obj: newImg });
      }, { crossOrigin: 'anonymous' });
    });
  }

  /* ── contour stroke rendering ──
     Fabric strokes an image around its bounding BOX. Once the background is gone that
     box is mostly empty, so a Border would float away from the subject. Overriding
     _renderStroke on this one object makes the Border follow the alpha outline instead,
     i.e. hug the object. Stroke colour/width still come from the normal Border UI - this
     only changes WHERE the stroke is drawn, so nothing else has to know about it. */
  function _stroke(img) {
    var pts = img._alphaContour;
    if (!pts || pts.length < 3) return;
    img._renderStroke = function (ctx) {
      if (!this._alphaContour || !this.stroke || !this.strokeWidth || this.strokeWidth <= 0) return;
      var p = this._alphaContour;
      if (p.length < 3) return;
      ctx.save();
      ctx.strokeStyle = this.stroke;
      ctx.lineWidth = this.strokeWidth;
      if (this.strokeUniform) {
        var zoom = this.canvas ? this.canvas.getZoom() : 1;
        ctx.lineWidth /= zoom * Math.max(Math.abs(this.scaleX), Math.abs(this.scaleY));
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // contour is in image pixel space; fabric draws from the object's centre
      var hw = this.width / 2, hh = this.height / 2;
      ctx.beginPath();
      ctx.moveTo(p[0].x - hw, p[0].y - hh);
      for (var i = 1; i < p.length; i++) ctx.lineTo(p[i].x - hw, p[i].y - hh);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };
    img.dirty = true;
  }

  /** Re-apply contour strokes after a document load. Called by right-panel/image.
   *  The override lives on the instance, so it does not survive serialization and has to
   *  be re-installed every time a project is opened. */
  window._reapplyContourStrokes = function () {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : window.canvas;
    if (!cvs) return;
    cvs.getObjects().forEach(function (o) {
      if (o._hasBgRemoved && o._alphaContour && o._alphaContour.length > 4) _stroke(o);
    });
    cvs.renderAll();
  };
})();

// Modular skeleton hook - cutout is a canvas subsystem (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'cutout', parent: 'canvas', title: 'Background cutout', mount: function () {}, unmount: function () {} });
