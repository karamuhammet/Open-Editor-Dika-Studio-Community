/* ══════════════════════════════════════════════════════════════
   Upscale - canvas/upscale

   Doubles an image's real resolution with Swin2SR x2 (Apache-2.0), on the user's
   own device. The result replaces the image at higher resolution while keeping its
   on-canvas size, so it gets sharper rather than bigger.

   Independent by design: its own worker, its own vendored runtime and model under
   vendor/upscale/. It shares nothing with the cutout tool - neither can break the
   other, and neither has to be loaded for the other to work.

   Measured on the real WASM runtime (4 threads): a 256px tile costs ~6 s, and cost
   is superlinear in tile area, so the worker tiles and the UI quotes an honest
   estimate up front instead of pretending this is instant.

   Public entry (toolbar + context menu):
     window.activateUpscale()
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VENDOR = 'vendor/upscale/';
  var MODEL = 'swin2sr-x2.onnx';
  var MODEL_MB = 7;
  var SCALE = 2;
  var TILE = 256;
  var OVERLAP = 16;
  var SEC_PER_TILE = 6;      // measured; only used to quote an estimate
  var SRC_CAP = 1600;        // beyond this the wait stops being defensible
  var TIMEOUT = 900000;

  var _busy = false;
  var _worker = null;
  var _ready = false;

  function _base() {
    var s = document.querySelector('script[src*="core/loader.js"], script[src*="modules.bundle.js"]');
    var href = (s && s.src) || location.href;
    return href.replace(/(core\/loader\.js|dist\/modules\.bundle\.js).*$/, '').replace(/[^/]*$/, '');
  }
  function _vendorUrl() { return new URL(VENDOR, _base()).href; }
  function _workerUrl() { return new URL('modules/canvas/upscale/upscale.worker.js', _base()).href; }

  function _err(e) {
    if (e == null) return 'unknown error';
    if (typeof e === 'string') return e;
    if (typeof e === 'number') return 'WASM abort kodu ' + e;
    return e.message || String(e);
  }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

  function _cached() {
    if (typeof caches === 'undefined' || !caches.open) return Promise.resolve(false);
    return caches.open('cc-transformers-upscale-v1')
      .then(function (c) { return c.match(_vendorUrl() + MODEL); })
      .then(function (r) { return !!r; })['catch'](function () { return false; });
  }

  /** Honest estimate from the measured per-tile cost and the actual tile count. */
  function _estimate(w, h) {
    var step = TILE - OVERLAP * 2;
    var tiles = Math.max(1, Math.ceil(w / step)) * Math.max(1, Math.ceil(h / step));
    return { tiles: tiles, sec: Math.round(tiles * SEC_PER_TILE) };
  }
  function _fmt(sec) {
    if (sec < 60) return '~' + sec + ' saniye';
    return '~' + Math.round(sec / 60) + ' dakika';
  }

  /* ══════════ worker supervisor (single-flight, disposable) ══════════ */
  function _spawn(onProgress) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker(_workerUrl(), { type: 'module' }); }
      catch (e) { reject(new Error('Islemci baslatilamadi: ' + _err(e))); return; }
      var settled = false;
      var t = setTimeout(function () {
        if (settled) return; settled = true;
        try { w.terminate(); } catch (e) {}
        reject(new Error('Model could not be prepared (timed out)'));
      }, TIMEOUT);
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
      w.postMessage({ type: 'init', vendorBase: _vendorUrl(), modelUrl: _vendorUrl() + MODEL, threads: navigator.hardwareConcurrency || 4 });
    });
  }
  function _kill() { if (_worker) { try { _worker.terminate(); } catch (e) {} } _worker = null; _ready = false; }

  function _runOnce(bitmap, onProgress) {
    return new Promise(function (resolve, reject) {
      var id = String(Date.now()) + Math.random();
      var settled = false;
      var t = setTimeout(function () { if (settled) return; settled = true; _kill(); reject(new Error('Islem cok uzun surdu')); }, TIMEOUT);
      _worker.onmessage = function (e) {
        var m = e.data || {};
        if (m.type === 'progress') { onProgress && onProgress(m); return; }
        if (m.type === 'result' && m.id === id) { if (settled) return; settled = true; clearTimeout(t); resolve(m); return; }
        if (m.type === 'error') { if (settled) return; settled = true; clearTimeout(t); _kill(); reject(new Error(m.message)); }
      };
      _worker.onerror = function (ev) {
        if (settled) return; settled = true; clearTimeout(t); _kill();
        reject(new Error('Islemci coktu: ' + ((ev && ev.message) || 'bilinmiyor')));
      };
      _worker.postMessage({ type: 'run', id: id, bitmap: bitmap, tile: TILE, overlap: OVERLAP }, [bitmap]);
    });
  }

  /* ══════════ dialog ══════════ */
  function _dialog(w, h, needsDownload) {
    var est = _estimate(w, h);
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'ups-ov';
      ov.innerHTML =
        '<div class="ups-modal" role="dialog" aria-modal="true" aria-labelledby="ups-h">' +
          '<div class="ups-head" id="ups-h">Upscale image</div>' +
          '<div class="ups-body">' +
            '<div class="ups-row"><span>Kaynak</span><b>' + w + ' x ' + h + '</b></div>' +
            '<div class="ups-row"><span>Sonuc</span><b>' + (w * SCALE) + ' x ' + (h * SCALE) + '</b></div>' +
            '<div class="ups-row"><span>Tahmini sure</span><b>' + _fmt(est.sec) + '</b></div>' +
            '<div class="ups-note">Runs entirely on your device, the image never leaves. It takes time because it runs on the processor; you can keep using the editor meanwhile.' +
              (needsDownload ? ' AI modeli <b>bir kez</b> inecek (' + MODEL_MB + ' MB) and will be stored in your browser; if you clear the cache it will download again.' : '') +
            '</div>' +
          '</div>' +
          '<div class="ups-foot">' +
            '<button type="button" class="ups-btn" data-act="cancel">Cancel</button>' +
            '<button type="button" class="ups-btn ups-btn-go" data-act="go">Upscale</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      function close(v) { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      document.addEventListener('keydown', onKey);
      ov.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-act]');
        if (!b) { if (e.target === ov) close(false); return; }
        close(b.getAttribute('data-act') === 'go');
      });
      var go = ov.querySelector('.ups-btn-go'); if (go) go.focus();
    });
  }

  /* ══════════ progress overlay (cancellable) ══════════ */
  var _cancelled = false;
  function _ov(show, msg, pct) {
    var el = document.getElementById('ups-progress');
    if (!show) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'ups-progress';
      el.className = 'ups-ov';
      el.innerHTML = '<div class="ups-card"><div class="ups-spin"></div><div class="ups-msg"></div>' +
        '<div class="ups-bar"><i></i></div><div class="ups-pct"></div>' +
        '<button type="button" class="ups-btn ups-cancel">Cancel</button></div>';
      document.body.appendChild(el);
      el.querySelector('.ups-cancel').addEventListener('click', function () {
        _cancelled = true;
        _kill();                       // terminating the worker IS the cancel
        _ov(false); _busy = false;
        toast('Upscale cancelled');
      });
    }
    el.querySelector('.ups-msg').textContent = msg || '';
    el.querySelector('.ups-pct').textContent = (pct == null || pct < 0) ? '' : '%' + pct;
    el.querySelector('.ups-bar i').style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
  }

  /* ══════════ entry ══════════ */
  window.activateUpscale = function () {
    if (_busy) return;
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : window.canvas;
    if (!cvs) return;
    var obj = cvs.getActiveObject();
    if (!obj || obj.type !== 'image' || obj.isQR || obj._isChart || obj._isEffect) { toast('First select an image'); return; }
    var el = obj._originalElement || obj._element;
    if (!el) { toast('Cannot access image data'); return; }

    var nw = el.naturalWidth || el.width, nh = el.naturalHeight || el.height;
    if (Math.max(nw, nh) > SRC_CAP) {
      toast('This image is too large to upscale (' + nw + 'x' + nh + '). Upscaling is for smaller images.');
      return;
    }

    _cached().then(function (isCached) {
      return _dialog(nw, nh, !isCached);
    }).then(function (go) {
      if (!go) return;
      _busy = true; _cancelled = false;
      _ov(true, 'Preparing AI model', -1);

      var onProgress = function (m) {
        if (m.phase === 'download') _ov(true, 'Downloading AI model', m.pct);
        else if (m.phase === 'cache' || m.phase === 'init') _ov(true, 'Opening model', -1);
        else _ov(true, 'Upscaling (' + (m.tile || 0) + '/' + (m.tiles || 0) + ' tiles)', m.pct);
      };

      createImageBitmap(el).then(function (bmp) {
        var p = (_worker && _ready) ? Promise.resolve(_worker) : _spawn(onProgress).then(function (w) { _worker = w; return w; });
        return p.then(function () { return _runOnce(bmp, onProgress); });
      }).then(function (res) {
        if (_cancelled) return;
        _ov(true, 'Applying', -1);
        _apply(cvs, obj, res);
      })['catch'](function (e) {
        if (_cancelled) return;             // user pressed Iptal: not an error
        console.error('[upscale] failed:', e);
        _ov(false); _busy = false;
        toast('Upscale failed: ' + _err(e));
      });
    });
  };

  /* Replace the image at higher resolution, keeping its on-canvas size and transform. */
  function _apply(cvs, obj, res) {
    var c = document.createElement('canvas');
    c.width = res.w; c.height = res.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(res.rgba), res.w, res.h), 0, 0);

    var el = obj._originalElement || obj._element;
    var nativeW = el ? (el.naturalWidth || el.width) : obj.width;
    var factor = res.w / nativeW;
    var center = obj.getCenterPoint();
    var props = { angle: obj.angle, opacity: obj.opacity, flipX: obj.flipX, flipY: obj.flipY };
    var sx = (obj.scaleX || 1) / factor, sy = (obj.scaleY || 1) / factor;

    fabric.Image.fromURL(c.toDataURL('image/png'), function (img) {
      if (!img || !img._element) { _ov(false); _busy = false; toast('Upscale failed: could not load result'); return; }
      img.set({
        left: center.x, top: center.y, originX: 'center', originY: 'center',
        scaleX: sx, scaleY: sy,
        angle: props.angle, opacity: props.opacity, flipX: props.flipX, flipY: props.flipY,
        _upscaled: true
      });
      cvs.remove(obj);
      cvs.add(img);
      cvs.setActiveObject(img);
      cvs.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof updateFloatTB === 'function') updateFloatTB();
      _ov(false); _busy = false;
      toast('Image upscaled: ' + res.w + ' x ' + res.h);
    }, { crossOrigin: 'anonymous' });
  }
})();

// Modular skeleton hook - upscale is a canvas subsystem (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'upscale', parent: 'canvas', title: 'Image upscale', mount: function () {}, unmount: function () {} });
