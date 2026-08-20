/* VE Multi-Cam Sync — Synchronize by Audio (main-thread side).
   Decodes each angle's audio, hands the PCM to the worker (which owns the algorithm), and
   returns offsets + an honest per-angle confidence.

   Split of duties: decode must happen here (AudioContext does not exist in a worker), the
   correlation must happen there (multi-minute footage would freeze the editor). PCM crosses
   as a transferable, so there is no copy.

   Replaces VEA.MultiCamSession.autoSyncAudio + VEA._crossCorrelate, which were audited and
   rejected (see the worker's header for the defect list and docs/multicam-rebuild-plan-v2.md §6).

   Public API
     VEMulticamSync.sync(angles, onProgress) -> Promise<{refSrcId, angles:[{srcId, offset,
                                                confidence, status}]}>
       angles: [{srcId, src}]   src = a URL/blob URL the angle's media lives at
     VEMulticamSync.isSupported()
*/
(function () {
  'use strict';

  var RUN_TIMEOUT = 180000;   // a long shoot is legitimately slow; a hang is not
  var _worker = null;
  var _seq = 0;

  function _base() {
    var b = document.querySelector('base');
    return (b && b.href) || (location.origin + location.pathname.replace(/[^/]*$/, ''));
  }
  function _workerUrl() {
    return new URL('modules/video/ve-multicam-sync/ve-multicam-sync.worker.js', _base()).href;
  }

  function isSupported() {
    return typeof Worker !== 'undefined' &&
           !!(window.AudioContext || window.webkitAudioContext);
  }

  function _ctx() {
    if (window.VEAudioEngine && VEAudioEngine.ensureContext) {
      var c = VEAudioEngine.ensureContext();
      if (c) return c;
    }
    var C = window.AudioContext || window.webkitAudioContext;
    return C ? new C() : null;
  }

  /* Decode one angle to mono Float32. Multi-channel is averaged down: sync cares about
     energy structure, and a stereo pair would only double the work. */
  function _decodeMono(src) {
    var ctx = _ctx();
    if (!ctx) return Promise.reject(new Error('No AudioContext'));
    return fetch(src)
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to download audio: ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (buf) {
        return new Promise(function (res, rej) {
          // callback form: Safari still lacks the promise overload
          ctx.decodeAudioData(buf, res, function (e) {
            rej(new Error('Failed to decode audio: ' + ((e && e.message) || 'bilinmeyen format')));
          });
        });
      })
      .then(function (ab) {
        var ch = ab.numberOfChannels;
        if (ch === 1) return { pcm: ab.getChannelData(0), rate: ab.sampleRate };
        var n = ab.length;
        var out = new Float32Array(n);
        for (var c = 0; c < ch; c++) {
          var d = ab.getChannelData(c);
          for (var i = 0; i < n; i++) out[i] += d[i] / ch;
        }
        return { pcm: out, rate: ab.sampleRate };
      });
  }

  function _spawn() {
    if (_worker) return _worker;
    _worker = new Worker(_workerUrl());
    return _worker;
  }

  function _kill() {
    if (_worker) { try { _worker.terminate(); } catch (e) {} _worker = null; }
  }

  /* One flight at a time. Any fault or hang kills the worker rather than the editor —
     same supervisor shape as canvas/cutout. */
  function _run(payload, transfers, onProgress) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = _spawn(); }
      catch (e) { reject(new Error('Failed to start sync processor: ' + (e.message || e))); return; }

      var settled = false;
      var t = setTimeout(function () {
        if (settled) return; settled = true;
        _kill();
        reject(new Error('Sync timed out'));
      }, RUN_TIMEOUT);

      w.onmessage = function (e) {
        var m = e.data || {};
        if (m.id !== payload.id) return;
        if (m.type === 'progress') { onProgress && onProgress(m); return; }
        if (m.type === 'result') {
          if (settled) return; settled = true; clearTimeout(t);
          resolve({ refSrcId: m.refSrcId, angles: m.angles });
          return;
        }
        if (m.type === 'error') {
          if (settled) return; settled = true; clearTimeout(t);
          _kill();
          reject(new Error(m.message));
        }
      };
      w.onerror = function (ev) {
        if (settled) return; settled = true; clearTimeout(t);
        _kill();
        reject(new Error('Sync processor error: ' + ((ev && ev.message) || 'bilinmiyor')));
      };

      w.postMessage(payload, transfers);
    });
  }

  function sync(angles, onProgress) {
    if (!isSupported()) return Promise.reject(new Error('This browser does not support audio sync'));
    if (!angles || angles.length < 2) return Promise.reject(new Error('At least 2 angles required for sync'));

    onProgress && onProgress({ phase: 'decode', pct: 0 });
    var done = 0;
    return Promise.all(angles.map(function (a) {
      return _decodeMono(a.src).then(function (d) {
        done++;
        onProgress && onProgress({ phase: 'decode', pct: Math.round((done / angles.length) * 100) });
        return { srcId: a.srcId, pcm: d.pcm, sampleRate: d.rate };
      });
    })).then(function (decoded) {
      var id = ++_seq;
      var transfers = decoded.map(function (d) { return d.pcm.buffer; });
      return _run({ type: 'sync', id: id, angles: decoded }, transfers, onProgress);
    });
  }

  window.VEMulticamSync = {
    sync: sync,
    isSupported: isSupported,
    dispose: _kill
  };
})();

// Modular skeleton hook — ve-multicam-sync is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-multicam-sync', parent: 'video', title: 've-multicam-sync', mount: function () {}, unmount: function () {} });
