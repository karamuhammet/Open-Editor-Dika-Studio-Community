/* VESizeProbe  -  measure what an export will actually weigh, without touching the editor.
   modules/video/ve-size-probe/ve-size-probe.js

   READ THIS BEFORE CHANGING ANYTHING HERE
   ---------------------------------------
   The previous probe was accurate (within 8% of finished files) and was deleted anyway, because it
   rendered its frames by driving the LIVE editor: it resized the preview canvas to the export
   resolution, took over the shared export state, seeked the shared video pool and moved the
   playhead, and it did all that automatically when an export dialog opened. See
   docs/video-export-pipeline-plan.md Part 7.

   This module exists under two hard rules, and they are not negotiable:

     1. It touches NOTHING the editor owns. Its only input is a clip's Blob. No `VE._ve*` flag, no
        canvas, no videoPool element, no playhead. If you find yourself needing one of those, the
        design is wrong, not the rule.
     2. All the work happens in a Worker. Demux, decode, draw and encode never run on the main
        thread, so a measurement cannot stutter the canvas however long it takes.

   What it measures is the SOURCE clip re-encoded at the export's own resolution, codec, quantiser
   and GOP - not the finished composite. Overlays, text and colour work are therefore not in the
   number. On the projects where size actually matters (long, video-dominated) the source is nearly
   all of the bits; on a heavily decorated short project the estimate reads a little low. That is
   the deliberate trade for never touching the canvas.

   Result: bits per pixel at the measured QP. `VEWebCodecsExport.estimateQualitySize` turns it into
   a file size, and scales it along the QP axis when the quality cap moves the target (the QP axis
   IS scalable - measured 4.5 to 5.35 QP per halving of the rate; the RESOLUTION axis is not, which
   is why this always measures at the real export frame size).
*/
(function () {
  'use strict';

  function isAvailable() {
    return typeof Worker !== 'undefined' &&
           typeof VideoEncoder !== 'undefined' &&
           typeof OffscreenCanvas !== 'undefined';
  }

  function _baseUrl() {
    var s = document.querySelector('script[src*="core/loader.js"], script[src*="modules.bundle.js"]');
    var href = (s && s.src) || location.href;
    return href.replace(/(core\/loader\.js|dist\/modules\.bundle\.js).*$/, '').replace(/[^/]*$/, '');
  }
  function _workerUrl() {
    return new URL('modules/video/ve-size-probe/ve-size-probe.worker.js', _baseUrl()).href +
           '?v=' + (window.CC_MODVER || '1');
  }
  function _mediabunnyUrl() { return new URL('vendor/mediabunny.min.mjs', _baseUrl()).href; }

  /* The clip's bytes. `_file` is what every import path attaches (including the recorder and the
     library fetch); a clip we can only reach over the network is fetched once. Deliberately NOT
     read off the pool element: that element belongs to the editor. */
  function _blobFor(clip) {
    if (clip && clip._file instanceof Blob) return Promise.resolve(clip._file);
    var src = clip && clip.src;
    if (!src) return Promise.reject(new Error('no-src'));
    return fetch(src).then(function (r) {
      if (!r.ok) throw new Error('http-' + r.status);
      return r.blob();
    });
  }

  /* Where to sample inside the clip's OWN media timeline. Windows of `winFrames` consecutive frames
     spread evenly, because one second of consecutive frames is one GOP at the export's gopSize and
     therefore has the file's real I-to-P ratio. Scattered single frames would each be a keyframe. */
  function _plan(mediaSeconds, fps, windows, winFrames) {
    var span = winFrames / fps;
    var usable = Math.max(0, mediaSeconds - span);
    var out = [];
    for (var wIdx = 0; wIdx < windows; wIdx++) {
      var t0 = (windows === 1) ? 0 : usable * wIdx / (windows - 1);
      for (var f = 0; f < winFrames; f++) out.push(t0 + f / fps);
    }
    return out;
  }

  var _active = null;   // the one in-flight probe; a new request supersedes it

  function cancel() {
    if (!_active) return;
    var a = _active; _active = null;
    try { a.worker.postMessage({ type: 'abort' }); } catch (e) {}
    try { a.worker.terminate(); } catch (e) {}
    if (a.reject) a.reject(new Error('aborted'));
  }

  /* opts:
       clip          the source clip (needs `_file` or `src`, and a duration)
       mediaSeconds  the clip's own media length
       width/height  the EXPORT frame size (never a proxy: the resolution axis is not scalable)
       fps, codec, accel, bitrate, gop
       qp, qpKey     the quantiser this measurement is taken AT
       windows, winFrames
       onProgress(0..1)
     -> Promise<{ bpp, bytes, frames, w, h, qp, fps }>  */
  function measure(opts) {
    if (!isAvailable()) return Promise.reject(new Error('unsupported'));
    cancel();

    return _blobFor(opts.clip).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var w;
        try { w = new Worker(_workerUrl(), { type: 'module' }); }
        catch (e) { reject(new Error('worker-failed')); return; }

        var rec = { worker: w, reject: reject };
        _active = rec;

        var settled = false;
        function finish(fn, arg) {
          if (settled) return; settled = true;
          if (_active === rec) _active = null;
          try { w.terminate(); } catch (e) {}
          fn(arg);
        }
        // A measurement that hangs must not hold a dialog on "measuring" forever.
        var guard = setTimeout(function () { finish(reject, new Error('timeout')); }, 60000);

        w.onmessage = function (ev) {
          var msg = ev.data || {};
          if (msg.type === 'progress') {
            if (opts.onProgress && msg.total) opts.onProgress(msg.done / msg.total);
            return;
          }
          if (msg.type === 'result') {
            clearTimeout(guard);
            var px = msg.w * msg.h * msg.frames;
            finish(resolve, {
              bpp: px ? (msg.bytes * 8 / px) : 0,
              bytes: msg.bytes, frames: msg.frames,
              w: msg.w, h: msg.h, qp: opts.qp, fps: opts.fps
            });
            return;
          }
          if (msg.type === 'error') {
            clearTimeout(guard);
            finish(reject, new Error(msg.message || 'probe-failed'));
          }
        };
        w.onerror = function () { clearTimeout(guard); finish(reject, new Error('worker-error')); };

        w.postMessage({
          type: 'probe',
          blob: blob,
          mediabunnyUrl: _mediabunnyUrl(),
          timestamps: _plan(opts.mediaSeconds || 0, opts.fps, opts.windows || 4, opts.winFrames || opts.fps),
          w: opts.width, h: opts.height, fps: opts.fps,
          codec: opts.codec, accel: opts.accel, bitrate: opts.bitrate,
          gop: opts.gop || opts.fps,
          qp: (opts.qp != null ? opts.qp : null),
          qpKey: opts.qpKey || 'avc'
        });
      });
    });
  }

  window.VESizeProbe = {
    isAvailable: isAvailable,
    measure: measure,
    cancel: cancel,
    plan: _plan          // exported for tests; pure
  };

  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 've-size-probe', parent: 'video', title: 'Export size probe (worker)',
      mount: function () {}, unmount: function () {}
    });
  }
})();
