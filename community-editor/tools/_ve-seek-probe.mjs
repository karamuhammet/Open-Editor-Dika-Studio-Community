/* How long does the editor wait on the decoder when a long clip lands on the timeline?
 *
 * Everything else has been measured and cleared: the i18n observer (fixed), the waveform walk, the
 * thumbnail canvas work, and the timeline draw at an hour (70 ms including layout). What was left was
 * the thing that needs a real file: `_veGenerateThumbnails` drives FORTY seeks on the video element,
 * and each seek on a long file costs the decoder a keyframe search plus forward decoding.
 *
 * So the file is made here, with the WebCodecs encoder and the mp4 muxer the editor already vendors:
 * one hour, 320x180, 2 fps, a keyframe every ten seconds, which is a normal spacing for real footage.
 * Nothing is written to disk; it stays a blob in the page and is measured there.
 *
 *   node tools/_ve-seek-probe.mjs
 */
import { openFile } from './_cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const page = await openFile(join(ROOT, 'index.html'));
await new Promise((r) => setTimeout(r, 3000));

const made = await page.eval(`(function () {
  return (async function () {
    // SEEK COST IS SET BY RESOLUTION AND KEYFRAME SPACING, NOT BY DURATION: a seek decodes from the
    // nearest keyframe forward, so what matters is how many frames of what size that is. The first run
    // used 320x180 at 2 fps and measured 1 ms a seek, which is true and useless. These are the numbers
    // real footage carries; the file is short because the duration is the one thing that does not
    // change the answer.
    var W = 1280, H = 720, FPS = 15, SECONDS = 180, GOP = FPS * 10;
    var muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H },
      fastStart: 'in-memory'
    });
    var enc = new VideoEncoder({
      output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); },
      error: function (e) { window.__ccEncErr = String(e); }
    });
    enc.configure({ codec: 'avc1.42001f', width: W, height: H, bitrate: 3000000, framerate: FPS });

    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var cx = c.getContext('2d');
    var total = SECONDS * FPS;
    var t0 = performance.now();
    for (var i = 0; i < total; i++) {
      cx.fillStyle = 'hsl(' + ((i * 7) % 360) + ',40%,25%)';
      cx.fillRect(0, 0, W, H);
      cx.fillStyle = '#f2ff58';
      cx.font = '96px sans-serif';
      cx.fillText(String(i), 20, 100);
      var frame = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(frame, { keyFrame: i % GOP === 0 });
      frame.close();
      if (i % 600 === 0) await new Promise(function (r) { setTimeout(r, 0); });
    }
    await enc.flush();
    muxer.finalize();
    var buf = muxer.target.buffer;
    window.__ccTestBlob = new Blob([buf], { type: 'video/mp4' });
    window.__ccTestUrl = URL.createObjectURL(window.__ccTestBlob);
    return JSON.stringify({ bytes: buf.byteLength, encodeMs: Math.round(performance.now() - t0), frames: total, err: window.__ccEncErr || null });
  })();
})()`);
console.log('generated:', made);

const seeks = await page.eval(`(function () {
  return (async function () {
    var v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.src = window.__ccTestUrl;
    await new Promise(function (res, rej) {
      v.onloadedmetadata = res;
      v.onerror = function () { rej(new Error('video load failed')); };
    });
    var res = { duration: Math.round(v.duration) };

    function seekTo(t) {
      return new Promise(function (done) {
        var t0 = performance.now();
        v.addEventListener('seeked', function once() {
          v.removeEventListener('seeked', once);
          done(Math.round(performance.now() - t0));
        });
        v.currentTime = t;
      });
    }

    res.firstSeekMs = await seekTo(Math.round(v.duration / 2));

    // exactly what _veGenerateThumbnails does: forty evenly spaced seeks, one after the other
    var t0 = performance.now();
    var each = [];
    for (var i = 0; i < 40; i++) each.push(await seekTo((v.duration / 40) * (i + 0.5)));
    res.fortySeeksTotalMs = Math.round(performance.now() - t0);
    res.fortySeeksSlowestMs = Math.max.apply(null, each);
    res.fortySeeksMedianMs = each.sort(function (a, b) { return a - b; })[20];

    URL.revokeObjectURL(window.__ccTestUrl);
    return JSON.stringify(res);
  })();
})()`);
console.log(JSON.stringify(JSON.parse(seeks), null, 1));
await page.close();
