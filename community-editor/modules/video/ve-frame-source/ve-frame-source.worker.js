/* Export decode worker  -  video/ve-frame-source/ve-frame-source.worker.js

   Why a worker (docs/video-export-pipeline-plan.md, phase 4)
   ---------------------------------------------------------
   After phase 2 the profiler still read `decode 95% · composite 4% · encode 1%`. Decode is not just
   the biggest cost, it is nearly ALL of it, and it was running on the main thread: that is why the
   editor froze during an export and why a backgrounded tab crawled (setTimeout throttling).

   Moving decode here does two things at once, which is the whole point:
     1. the main thread keeps only composite + encode (about 5% of the work), so the UI stays alive;
     2. decode runs AHEAD of the compositor, so its latency is hidden instead of serialised.

   ONE PASS, NOT ONE REQUEST PER FRAME (the expensive lesson)
   ---------------------------------------------------------
   The first version answered a sliding window: as the export consumed frame i it asked for frame
   i+24. Every ask opens a fresh `samplesAtTimestamps` iterator, and a fresh iterator must restart
   from the previous KEYFRAME. On 2 s-GOP material that turns an N-frame export into O(N x GOP)
   decodes; measured on a 60-frame / 60-frame-GOP fixture: 122 ms/frame, i.e. 80x SLOWER than just
   decoding on the main thread. The whole point of a sequential decoder is that it is sequential.

   So the export hands over its entire timestamp plan in ONE request and the worker walks it in a
   single forward pass. Back-pressure is credit-based instead: the opener grants N frames of credit,
   the worker blocks when credit runs out, and each consumed frame returns one credit. That bounds
   in-flight VideoFrames (GPU memory at 4K) without ever restarting the decoder.

   Protocol (all messages carry `id` = one media source)
     in : { type:'open',   id, blob, mediabunnyUrl }
          { type:'frames', id, reqId, timestamps:[seconds…], credit }
          { type:'ack',    id, reqId, n }          // n frames consumed -> n credits back
          { type:'close',  id }
     out: { type:'opened', id, ok, width?, height?, reason? }
          { type:'frame',  id, reqId, idx, t, frame }   // VideoFrame, TRANSFERRED (zero copy)
          { type:'frame',  id, reqId, idx, missing:true }
          { type:'done',   id, reqId }
          { type:'error',  id, message }

   Notes
   - Module worker: Mediabunny is ESM-only. The importer URL is passed in by the opener so this file
     works both under /editor/ and on the standalone static host, and under COEP (same origin).
   - `self.onmessage` is async and re-entrant: while the 'frames' handler awaits its credit, incoming
     'ack' / 'close' messages are still dispatched. That is what makes the credit loop possible.
   - `t` is the MEDIA's own frame timestamp, which is not the instant that was asked for. The opener
     maps replies back through `idx`; never key a cache on `t`.
*/
'use strict';

let MB = null;
const sources = new Map();   // id -> { input, sink }
const flows = new Map();     // reqId -> { credit, resume, cancelled }

async function ensureMediabunny(url) {
  if (MB) return MB;
  MB = await import(/* @vite-ignore */ url);
  return MB;
}

self.onmessage = async function (e) {
  const m = e.data || {};
  const id = m.id;
  try {
    if (m.type === 'open') {
      await ensureMediabunny(m.mediabunnyUrl);
      const input = new MB.Input({ source: new MB.BlobSource(m.blob), formats: MB.ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track) { self.postMessage({ type: 'opened', id, ok: false, reason: 'no-video-track' }); return; }
      const decodable = await track.canDecode();
      if (!decodable) { self.postMessage({ type: 'opened', id, ok: false, reason: 'cannot-decode' }); return; }
      sources.set(id, { input, sink: new MB.VideoSampleSink(track) });
      self.postMessage({
        type: 'opened', id, ok: true,
        width: track.displayWidth || track.codedWidth || 0,
        height: track.displayHeight || track.codedHeight || 0
      });
      return;
    }

    if (m.type === 'frames') {
      const s = sources.get(id);
      if (!s) { self.postMessage({ type: 'done', id, reqId: m.reqId }); return; }
      const flow = { credit: m.credit || 16, resume: null, cancelled: false };
      flows.set(m.reqId, flow);
      let idx = 0;
      // One iterator, one forward pass over the whole plan. Mediabunny returns null for instants the
      // media does not cover, so the reply stream stays 1:1 with the request.
      for await (const sample of s.sink.samplesAtTimestamps(m.timestamps)) {
        if (flow.cancelled) { if (sample) sample.close(); break; }
        if (!sample) {
          self.postMessage({ type: 'frame', id, reqId: m.reqId, idx: idx++, missing: true });
          continue;
        }
        // A VideoFrame is transferable, so the pixels never get copied across the thread boundary.
        const vf = sample.toVideoFrame();
        self.postMessage({ type: 'frame', id, reqId: m.reqId, idx: idx++, t: sample.timestamp, frame: vf }, [vf]);
        sample.close();
        if (--flow.credit <= 0) {
          await new Promise(function (r) { flow.resume = r; });
          if (flow.cancelled) break;
        }
      }
      flows.delete(m.reqId);
      self.postMessage({ type: 'done', id, reqId: m.reqId });
      return;
    }

    if (m.type === 'ack') {
      const flow = flows.get(m.reqId);
      if (flow) {
        flow.credit += (m.n || 1);
        if (flow.credit > 0 && flow.resume) { const r = flow.resume; flow.resume = null; r(); }
      }
      return;
    }

    if (m.type === 'close') {
      // Release any blocked pass first, otherwise the awaited promise keeps the iterator (and the
      // decoder it owns) alive after the source is gone.
      flows.forEach(function (flow) {
        flow.cancelled = true;
        if (flow.resume) { const r = flow.resume; flow.resume = null; r(); }
      });
      const s = sources.get(id);
      if (s) {
        sources.delete(id);
        try { if (s.input.dispose) s.input.dispose(); } catch (err) { /* best effort */ }
      }
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String((err && err.message) || err) });
  }
};
