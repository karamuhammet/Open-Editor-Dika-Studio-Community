/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   Module: video/ve-frame-source — SEQUENTIAL FRAME READER for export.

   Why this exists (docs/video-export-pipeline-plan.md, phase 2)
   ------------------------------------------------------------
   The export used to fetch every frame by setting `videoEl.currentTime` and awaiting `'seeked'`.
   That is the most expensive way to read frames: on long-GOP H.264 each seek re-decodes from the
   previous keyframe, and the phase-1 profiler measured the result on this codebase:

       decode 89%  ·  composite 10%  ·  encode 1%   (1080p, 30 frames)

   So the encoder was never the bottleneck; the frame SOURCE was. This module reads frames the way
   a decoder is meant to be read: open the media once, decode forward, keep the current frame, and
   hand it out. Mediabunny's CanvasSink does the demux + decode and yields ready-to-draw canvases,
   and Mediabunny is already loaded by index.html for the camera recorder.

   Contract
   --------
     VEFrameSource.isAvailable()                  -> boolean (Mediabunny present)
     VEFrameSource.create(clip, mediaEl, opts)    -> Promise<source|null>
       source.frameAt(localTime)                  -> Promise<canvas|null>   (canvas carries
                                                     videoWidth/videoHeight so every existing
                                                     `el.videoWidth || …` read keeps working)
       source.close()

   Design notes
   ------------
   - Monotonic forward reads are the fast path: the iterator is advanced, never restarted.
   - A backwards jump (loop wrap, a range that revisits) restarts the iterator at that timestamp.
     That is one seek's worth of cost, not one per frame.
   - `null` return is a legitimate answer ("no frame decoded yet / past the end"); the caller falls
     back to its old element-seek path, so a codec Mediabunny cannot open never breaks an export.
   - **The returned canvas is valid until the next frameAt() on the same source.** One canvas is
     reused per source (the sink's own pool recycles too), so draw or copy it before asking for the
     next frame. The export does exactly that: every clip's frame is pulled, then the compositor runs.

   Measured on a proper 3 s / 30 fps / 2 s-GOP MP4 (dev machine):
     sequential decode 2.9 ms/frame   vs   element seek 6.5 ms/frame   = 2.3x, 30/30 distinct frames.
   The gap widens with GOP length; short-GOP material is the best case for seeking, not the worst.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function _mb() { return window.Mediabunny || null; }

  function isAvailable() {
    var MB = _mb();
    return !!(MB && MB.Input && MB.BlobSource && MB.CanvasSink && MB.ALL_FORMATS);
  }

  /* The bytes for a clip. The pool element's src is a blob:/data:/http: URL; Mediabunny wants a
     Blob (BlobSource) so it can seek inside the container. clip._file is preferred when present
     because it avoids a re-fetch, but it is dropped by the undo snapshot, so the URL is the
     reliable path. */
  function _blobFor(clip, mediaEl) {
    if (clip && clip._file instanceof Blob) return Promise.resolve(clip._file);
    var src = (mediaEl && (mediaEl.src || mediaEl.currentSrc)) || (clip && clip.src);
    if (!src) return Promise.reject(new Error('no-src'));
    return fetch(src).then(function (r) {
      if (!r.ok) throw new Error('http-' + r.status);
      return r.blob();
    });
  }

  function create(clip, mediaEl, opts) {
    opts = opts || {};
    if (!isAvailable()) return Promise.resolve(null);
    var MB = _mb();

    return _blobFor(clip, mediaEl).then(function (blob) {
      var input = new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
      return input.getPrimaryVideoTrack().then(function (track) {
        if (!track) return null;
        return track.canDecode().then(function (ok) {
          if (!ok) return null;

          var sink = new MB.CanvasSink(track, { poolSize: 3 });
          var iter = null;         // active async iterator
          var iterStart = -1;      // timestamp the iterator was opened at
          var cur = null;          // current frame { canvas, timestamp, duration }
          var pending = null;      // ONE frame of lookahead (see frameAt)
          var done = false;
          var closed = false;

          // We own this canvas. CanvasSink recycles its pool, so a frame handed out earlier can be
          // overwritten while the compositor is still drawing it; copying once per NEW frame makes
          // the handed-out surface stable and costs one blit.
          var own = document.createElement('canvas');
          var ownCtx = own.getContext('2d');
          var ownStamp = -1;

          function openAt(t) {
            if (iter && iter.return) { try { iter.return(); } catch (e) {} }
            iterStart = Math.max(0, t);
            iter = sink.canvases(iterStart)[Symbol.asyncIterator]();
            cur = null; pending = null; done = false; ownStamp = -1;
          }

          /* A pull must NEVER be able to block the caller forever. If a decoder wedges (observed
             once while two export loops were alive at the same time and fought over the same clip),
             an unsettled iter.next() would stall the whole export frame loop with no error. The race
             turns that into "no frame", which the caller answers with its element-seek fallback. */
          function pull() {
            if (done || closed || !iter) return Promise.resolve(null);
            var settled = false;
            return Promise.race([
              iter.next().then(function (res) {
                settled = true;
                if (res.done) { done = true; return null; }
                return res.value;
              })['catch'](function () { settled = true; done = true; return null; }),
              new Promise(function (resolve) {
                setTimeout(function () {
                  if (settled) return;
                  done = true;   // stop trusting this iterator; the caller falls back
                  console.warn('[VEFrameSource] decoder stalled, falling back to element seek');
                  resolve(null);
                }, 5000);
              })
            ]);
          }

          /* Publish `cur` onto our own canvas and tag it so every existing
             `el.videoWidth || el.naturalWidth || clip._mediaWidth` read keeps resolving. */
          function publish() {
            if (!cur || !cur.canvas) return null;
            if (ownStamp !== cur.timestamp) {
              if (own.width !== cur.canvas.width || own.height !== cur.canvas.height) {
                own.width = cur.canvas.width;
                own.height = cur.canvas.height;
              }
              ownCtx.drawImage(cur.canvas, 0, 0);
              ownStamp = cur.timestamp;
              own.videoWidth = own.width;
              own.videoHeight = own.height;
            }
            return own;
          }

          /* Advance while the NEXT frame still starts at or before t. This is the only correct rule:
             an earlier version treated "no duration" as "covers everything from here on", so once a
             frame without a duration was current the iterator never advanced again and the export
             froze on that picture (caught by decoding an exported file and comparing frames). */
          function frameAt(t) {
            if (closed) return Promise.resolve(null);
            if (!isFinite(t) || t < 0) t = 0;
            var EPS = 1e-4;

            // Backwards jump (loop wrap, revisited range): reopen once, then stay sequential.
            if (!iter || t < iterStart - 1e-3 || (cur && t < cur.timestamp - 1e-3)) openAt(t);

            var guard = 0;
            var step = function () {
              if (closed) return Promise.resolve(null);
              if (++guard > 1200) return Promise.resolve(publish());

              if (!cur) {
                return pull().then(function (f) {
                  if (!f) return null;              // nothing decodable at all
                  cur = f;
                  return step();
                });
              }
              if (pending === null && !done) {
                return pull().then(function (f) { pending = f; return step(); });
              }
              if (pending && pending.timestamp <= t + EPS) {
                cur = pending; pending = null;
                return step();
              }
              return Promise.resolve(publish());
            };
            return step();
          }

          return {
            clipId: clip && clip.id,
            frameAt: frameAt,
            close: function () {
              closed = true;
              var it = iter;
              iter = null; cur = null; pending = null;
              // Return the generator FIRST and only then drop the input, on a later task: disposing
              // the input while an iter.next() is still in flight leaves that promise unsettled.
              if (it && it.return) { try { it.return(); } catch (e) {} }
              setTimeout(function () { try { if (input.dispose) input.dispose(); } catch (e) {} }, 0);
            }
          };
        });
      });
    })['catch'](function (err) {
      console.warn('[VEFrameSource] falling back to element seek for clip', clip && clip.id, (err && err.message) || err);
      return null;
    });
  }

  /* ═══ Worker-backed source (phase 4) ═══════════════════════════════════════════════════════════
     Same `frameAt(t)` contract, but the demux + decode happen on a worker thread and arrive as
     TRANSFERRED VideoFrames. Two wins in one change: the main thread is left with composite + encode
     only (measured at ~5% of export work, so the editor stops freezing), and the worker decodes a
     WINDOW ahead of the compositor, so decode latency is overlapped instead of serialised.

     The window is learned, not configured: the export asks for frames at a fixed cadence, so the
     step between two requests is measured once and used to prefetch the next PREFETCH timestamps.
     An out-of-window request (a seek, a loop wrap) just re-primes the window at that instant.

     Everything degrades safely: no module-worker support, no Mediabunny, an undecodable container or
     any worker error falls back to the main-thread source, which itself falls back to element seeks. */
  var PREFETCH = 24;

  function _workerUrl() {
    return new URL('modules/video/ve-frame-source/ve-frame-source.worker.js', _baseUrl()).href +
           '?v=' + (window.CC_MODVER || '1');
  }
  function _mediabunnyUrl() { return new URL('vendor/mediabunny.min.mjs', _baseUrl()).href; }
  function _baseUrl() {
    var s = document.querySelector('script[src*="core/loader.js"], script[src*="modules.bundle.js"]');
    var href = (s && s.src) || location.href;
    return href.replace(/(core\/loader\.js|dist\/modules\.bundle\.js).*$/, '').replace(/[^/]*$/, '');
  }

  function createWorker(clip, mediaEl) {
    if (!isAvailable()) return Promise.resolve(null);
    if (typeof Worker === 'undefined') return Promise.resolve(null);

    return _blobFor(clip, mediaEl).then(function (blob) {
      return new Promise(function (resolve) {
        var w;
        try { w = new Worker(_workerUrl(), { type: 'module' }); }
        catch (e) { resolve(null); return; }

        var id = (clip && clip.id) || ('src-' + Math.random().toString(36).slice(2));
        var settled = false;
        var closed = false;

        var plan = null;          // the EXACT instants this export will ask for, in order
        var planIdx = null;       // instant -> its position in the plan
        var served = -1;          // furthest plan position already handed out
        var reqId = 0;            // the id of the single in-flight pass
        var reqStamps = null;     // what that pass was asked for (reply idx -> requested instant)
        var frames = new Map();   // REQUESTED t -> VideoFrame (decoded, not yet consumed)
        var waiters = [];
        var credit = 16;          // in-flight budget, set from the real frame size on 'opened'

        /* COPY ELIMINATION: hand the decoded VideoFrame over as-is.

           This used to blit every decoded frame into an owned canvas, purely so the result reported
           `videoWidth` (a VideoFrame reports `displayWidth`). At 4K that is 33 MB moved per clip per
           frame to change nothing but a property name. A VideoFrame accepts own properties and stays
           a valid `drawImage` source (verified in-browser), so stamping the two names it is missing
           is enough and the blit disappears.

           Lifetime: exactly the documented contract, "valid until the next frameAt() on this source".
           The previous frame is closed when the next one is published, and on close(). Holding a
           reference past that gets a closed frame, which is what the canvas contract already implied. */
        var live = null;     // the frame currently handed out
        var ownT = null;

        var openTimer = setTimeout(function () {
          if (settled) return; settled = true;
          try { w.terminate(); } catch (e) {}
          resolve(null);
        }, 8000);

        function publish(frame, t) {
          if (live && live !== frame) { try { live.close(); } catch (e) {} }
          frame.videoWidth = frame.displayWidth || frame.codedWidth;
          frame.videoHeight = frame.displayHeight || frame.codedHeight;
          live = frame;
          ownT = t;
          markServed(t);
          return frame;
        }

        function markServed(t) {
          if (!planIdx) return;
          var ix = planIdx.get(t);
          if (ix != null && ix > served) served = ix;
        }

        /* One consumed frame = one credit back, so the worker's forward pass resumes. Cheap enough
           to send per frame (a postMessage is microseconds next to a decode). */
        function giveBack(n) {
          if (closed || !reqId) return;
          try { w.postMessage({ type: 'ack', id: id, reqId: reqId, n: n || 1 }); } catch (e) {}
        }

        function drop(frame) { try { frame.close(); } catch (e) {} giveBack(1); }

        /* The instant asked for is one WE primed, so an exact hit is the normal case; the tolerant
           branch only covers a caller that walks off the plan (a seek, a loop wrap). Anything older
           than the hit is dead weight: close it and hand the credit back. */
        function take(t) {
          var hit = null;
          if (frames.has(t)) { hit = { t: t, frame: frames.get(t) }; frames['delete'](t); }
          else {
            var best = null;
            frames.forEach(function (frame, ft) {
              if (ft <= t + 1e-4 && (!best || ft > best.t)) best = { t: ft, frame: frame };
            });
            if (best) { frames['delete'](best.t); hit = best; }
          }
          if (hit) {
            var stale = [];
            frames.forEach(function (frame, ft) { if (ft < hit.t) stale.push(ft); });
            stale.forEach(function (ft) { var f = frames.get(ft); frames['delete'](ft); drop(f); });
          }
          return hit;
        }

        function serve() {
          for (var i = waiters.length - 1; i >= 0; i--) {
            var wt = waiters[i];
            var hit = take(wt.t);
            if (hit) { waiters.splice(i, 1); wt.resolve(publish(hit.frame, hit.t)); giveBack(1); }
          }
        }

        function request(timestamps) {
          reqStamps = timestamps;
          w.postMessage({ type: 'frames', id: id, reqId: ++reqId, timestamps: timestamps, credit: credit });
        }

        w.onmessage = function (ev) {
          var m = ev.data || {};
          if (m.type === 'opened') {
            if (settled) return; settled = true; clearTimeout(openTimer);
            if (!m.ok) { try { w.terminate(); } catch (e) {} resolve(null); return; }
            /* Bound the in-flight frames by PIXELS, not by count: 24 spare 1080p frames is 75 MB of
               GPU memory, 24 spare 4K frames is 300 MB and would trade away the RAM win of phase 3. */
            var px = (m.width || 1920) * (m.height || 1080);
            credit = Math.max(4, Math.min(24, Math.floor(48e6 / Math.max(1, px))));
            resolve({
              clipId: id,
              backend: 'worker',
              /* The export hands over every instant it will request (VE._vePrimeExportFrameSources)
                 and the worker walks it in ONE forward pass. This is what makes the decoder a
                 pipeline: it runs ahead of the compositor instead of answering it. */
              prime: function (timestamps) {
                plan = timestamps.slice();
                planIdx = new Map();
                for (var i = 0; i < plan.length; i++) if (!planIdx.has(plan[i])) planIdx.set(plan[i], i);
                served = -1;
                frames.forEach(function (f) { try { f.close(); } catch (e) {} });
                frames.clear();
                request(plan.slice());
              },
              frameAt: function (t) {
                if (closed) return Promise.resolve(null);
                if (!isFinite(t) || t < 0) t = 0;
                var hit = take(t);
                if (hit) { var cv = publish(hit.frame, hit.t); giveBack(1); return Promise.resolve(cv); }
                /* Nothing cached for t. Waiting is only right if that instant is still COMING, and
                   the plan is what says so. Three ways it is not coming, each with a different right
                   answer - conflating them is how you ship either a 5 s stall or a stale picture:
                     - the same instant again (a re-render of the current position): `own` IS that
                       frame, hand it back. Waiting instead cost a 5 s timeout per repeat, measured
                       as 91 ms/frame averaged over a 60-frame run.
                     - an EARLIER instant (a backwards jump): the pass has gone past it. `own` would
                       be the wrong picture, so answer null and let the caller seek the element.
                     - an instant that is not in the plan at all (timing changed under us): same. */
                if (planIdx) {
                  var ix = planIdx.get(t);
                  if (ix == null) return Promise.resolve(null);
                  if (ix < served) return Promise.resolve(null);
                  if (ix === served) return Promise.resolve(ownT != null ? live : null);
                } else {
                  request([t]);   // not primed (another caller): one-shot
                }
                return new Promise(function (res) {
                  var entry = { t: t, resolve: res };
                  waiters.push(entry);
                  setTimeout(function () {
                    var idx = waiters.indexOf(entry);
                    if (idx > -1) { waiters.splice(idx, 1); res(ownT != null ? live : null); }
                  }, 5000);
                });
              },
              close: function () {
                closed = true;
                if (live) { try { live.close(); } catch (e) {} live = null; }
                frames.forEach(function (f) { try { f.close(); } catch (e) {} });
                frames.clear(); waiters.length = 0; plan = null; planIdx = null; served = -1; reqStamps = null;
                try { w.postMessage({ type: 'close', id: id }); } catch (e) {}
                setTimeout(function () { try { w.terminate(); } catch (e) {} }, 0);
              }
            });
            return;
          }
          if (m.type === 'frame') {
            if (closed) { if (m.frame) { try { m.frame.close(); } catch (e) {} } return; }
            if (m.reqId !== reqId) { if (m.frame) { try { m.frame.close(); } catch (e) {} } return; }
            var want = (reqStamps && m.idx < reqStamps.length) ? reqStamps[m.idx] : m.t;
            if (m.frame) {
              if (frames.has(want)) drop(m.frame);        // two instants landed on one media frame
              else frames.set(want, m.frame);
            } else if (m.missing) {
              /* The media has nothing at that instant (past the end, a gap). Mark it done so the
                 waiter is answered with the last good picture now instead of after a 5 s timeout. */
              markServed(want);
              for (var wi = waiters.length - 1; wi >= 0; wi--) {
                if (Math.abs(waiters[wi].t - want) < 1e-6) {
                  var wv = waiters.splice(wi, 1)[0];
                  wv.resolve(ownT != null ? live : null);
                }
              }
            }
            serve();
            return;
          }
          if (m.type === 'done') { serve(); return; }
          if (m.type === 'error') {
            console.warn('[VEFrameSource worker]', m.message);
            if (!settled) { settled = true; clearTimeout(openTimer); try { w.terminate(); } catch (e) {} resolve(null); }
            else serve();
          }
        };
        w.onerror = function (err) {
          console.warn('[VEFrameSource worker] failed to start:', err && err.message);
          if (settled) return; settled = true; clearTimeout(openTimer);
          try { w.terminate(); } catch (e) {}
          resolve(null);
        };

        w.postMessage({ type: 'open', id: id, blob: blob, mediabunnyUrl: _mediabunnyUrl() });
      });
    })['catch'](function () { return null; });
  }

  /** Worker first (decode off the main thread + prefetch), main thread as the fallback. */
  function createBest(clip, mediaEl, opts) {
    return createWorker(clip, mediaEl).then(function (src) {
      if (src) return src;
      return create(clip, mediaEl, opts);
    });
  }

  window.VEFrameSource = {
    isAvailable: isAvailable,
    create: createBest,
    createMainThread: create,
    createWorker: createWorker
  };

  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 've-frame-source', parent: 'video', title: 'Frame source (export decode)',
      mount: function () {}, unmount: function () {}
    });
  }
})();
