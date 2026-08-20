/* Export size probe worker  -  video/ve-size-probe/ve-size-probe.worker.js

   WHY THIS EXISTS, AND WHAT IT IS NOT ALLOWED TO DO
   -------------------------------------------------
   The previous size probe measured the real file accurately and was removed anyway
   (docs/video-export-pipeline-plan.md Part 7). It rendered its frames by driving the LIVE editor:
   it resized `VE._veUi.previewCanvas` to the export resolution, took over the shared export state,
   froze the timeline, seeked the shared video pool and moved the playhead - and it ran the moment
   an export dialog opened, while the owner was still working. The canvas stuttered and the video
   broke.

   So this one is built to the opposite constraint, and the constraint is the design:

     * it never touches the editor. Not the canvas, not the pool, not the playhead, not any VE flag.
       Its only input is a Blob.
     * it never runs on the main thread. Demux, decode, draw and encode all happen HERE, so the
       editor cannot stutter no matter how long the measurement takes. That is the entire reason
       this is a worker rather than three functions in a module.

   The trade it accepts: it measures the SOURCE clip, not the finished composite, so overlays,
   text, transitions and colour work are not in the number. On a video-dominated timeline - which is
   what a big export is - the source is nearly all of the bits, and a slightly low estimate on a
   heavily decorated project is a far better failure than a stuttering canvas.

   Protocol
     in : { type:'probe', blob, mediabunnyUrl, timestamps:[seconds…], w, h, fps,
            codec, qp, qpKey, gop, accel, bitrate }
          { type:'abort' }
     out: { type:'progress', done, total }
          { type:'result', bytes, frames, w, h }
          { type:'error', message }

   Notes
   - Module worker: Mediabunny is ESM-only, and the importer URL is passed in so this file works
     under /editor/, on the standalone host and under COEP alike.
   - ONE forward pass over the whole timestamp plan. A per-frame iterator restarts at the previous
     keyframe, which measured 80x slower on the export path; the same trap applies here.
   - `keyFrame` follows the export's own `gopSize`, so the I-to-P ratio of the sample matches the
     I-to-P ratio of the file being predicted. Sampling scattered single frames would encode every
     one of them as a keyframe and over-read the rate several times over.
*/
'use strict';

let MB = null;
let aborted = false;

async function ensureMediabunny(url) {
  if (MB) return MB;
  MB = await import(/* @vite-ignore */ url);
  return MB;
}

/* Draw a decoded source frame into the probe canvas the way the export composites a background
   clip: cover the frame, preserve aspect, centre the overflow. The fit affects how much detail
   lands in the encoded pixels, so guessing it differently from the real export would measure a
   different picture. */
function drawCover(ctx, frame, w, h) {
  const sw = frame.displayWidth || frame.codedWidth;
  const sh = frame.displayHeight || frame.codedHeight;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(frame, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

self.onmessage = async function (e) {
  const m = e.data || {};

  if (m.type === 'abort') { aborted = true; return; }
  if (m.type !== 'probe') return;

  aborted = false;
  let input = null, encoder = null;

  try {
    await ensureMediabunny(m.mediabunnyUrl);
    input = new MB.Input({ source: new MB.BlobSource(m.blob), formats: MB.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('no-video-track');
    if (!(await track.canDecode())) throw new Error('cannot-decode');

    const sink = new MB.VideoSampleSink(track);
    const canvas = new OffscreenCanvas(m.w, m.h);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let bytes = 0, encoded = 0, encErr = null;
    encoder = new VideoEncoder({
      output: function (chunk) { bytes += chunk.byteLength; encoded++; },
      /* Record it, do not throw: this callback runs on its own task, so a throw here would escape
         the try/catch below entirely and surface as an unhandled worker error with no message for
         the caller. The loop checks `encErr` and unwinds normally. */
      error: function (err) { encErr = err; aborted = true; }
    });
    const cfg = {
      codec: m.codec,
      width: m.w,
      height: m.h,
      bitrate: m.bitrate || 5000000,
      framerate: m.fps,
      hardwareAcceleration: m.accel || 'prefer-hardware'
    };
    if (m.codec.indexOf('avc') === 0) cfg.avc = { format: 'avc' };
    if (m.qp != null) cfg.bitrateMode = 'quantizer';
    encoder.configure(cfg);

    const total = m.timestamps.length;
    const frameDur = Math.round(1000000 / m.fps);
    let i = 0;

    for await (const sample of sink.samplesAtTimestamps(m.timestamps)) {
      if (aborted) { if (sample) sample.close(); break; }
      if (!sample) { i++; continue; }          // an instant the media does not cover

      const vf = sample.toVideoFrame();
      try {
        drawCover(ctx, vf, m.w, m.h);
      } finally {
        vf.close();
        sample.close();
      }

      const out = new VideoFrame(canvas, { timestamp: i * frameDur, duration: frameDur });
      const opt = { keyFrame: (i % m.gop === 0) };
      if (m.qp != null && m.qpKey) opt[m.qpKey] = { quantizer: m.qp };
      try { encoder.encode(out, opt); } finally { out.close(); }

      i++;
      if (i % 10 === 0) self.postMessage({ type: 'progress', done: i, total: total });

      /* Bound the queue. Without this the decoder races ahead of the encoder and a long plan holds
         hundreds of frames of GPU memory; the export path learned the same lesson. */
      while (encoder.encodeQueueSize > 8 && !aborted) {
        await new Promise(function (r) { setTimeout(r, 1); });
      }
    }

    if (encErr) throw encErr;
    await encoder.flush();
    encoder.close(); encoder = null;
    if (!encoded) throw new Error('no-frames-encoded');
    self.postMessage({ type: 'result', bytes: bytes, frames: encoded, w: m.w, h: m.h });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  } finally {
    try { if (encoder && encoder.state !== 'closed') encoder.close(); } catch (e2) { /* best effort */ }
    try { if (input && input.dispose) input.dispose(); } catch (e3) { /* best effort */ }
  }
};
