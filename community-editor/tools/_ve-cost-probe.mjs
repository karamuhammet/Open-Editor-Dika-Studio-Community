/* What do the two remaining suspects cost when a long video is added?
 *
 * After the i18n observer was fixed the owner asked for the other two paths to be measured rather
 * than guessed at:
 *
 *   VE._veGenerateWaveform   modules/video/video-editor/import/import.js
 *     XHR the WHOLE file as an ArrayBuffer, decodeAudioData the whole thing to PCM, then walk every
 *     sample of channel 0 to build 200 peaks. The walk is synchronous, on the main thread, inside the
 *     decode callback.
 *
 *   VE._veGenerateThumbnails same file
 *     up to 40 seeks on the video element, each answered by drawImage + toDataURL.
 *
 * The decode itself needs a real hour-long file, which this cannot conjure, so the two things that
 * CAN be measured honestly are measured: the peak walk over a buffer of the size an hour produces,
 * and the per-thumbnail main-thread work. Everything computed rather than measured is labelled.
 *
 *   node tools/_ve-cost-probe.mjs
 */
import { openFile } from './_cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const page = await openFile(join(ROOT, 'index.html'));

for (let i = 0; i < 60; i++) {
  const n = await page.eval('document.querySelectorAll("*").length');
  if (Number(n) > 800) break;
  await new Promise((r) => setTimeout(r, 500));
}

const out = await page.eval(`(function () {
  var res = {};

  function ms(fn) { var t0 = performance.now(); var v = fn(); return { ms: Math.round((performance.now() - t0) * 10) / 10, v: v }; }

  // ── the waveform peak walk ──────────────────────────────────────────────────────────────────────
  // A ten minute track at 48 kHz, which is a twentieth of the hour the owner used, so the hour is a
  // straight multiplication rather than a guess.
  var TEN_MIN = 48000 * 600;
  var alloc = ms(function () { return new Float32Array(TEN_MIN); });
  res.allocTenMinutesMs = alloc.ms;
  var data = alloc.v;
  for (var k = 0; k < data.length; k += 997) data[k] = 0.5;   // not all zeros, so nothing optimises away

  var walk = ms(function () {
    var step = Math.floor(data.length / 200);
    var peaks = [];
    for (var i = 0; i < 200; i++) {
      var sum = 0;
      for (var j = 0; j < step; j++) sum += Math.abs(data[i * step + j]);
      peaks.push(sum / step);
    }
    return peaks.length;
  });
  res.peakWalkTenMinutesMs = walk.ms;
  res.peakWalkOneHourMsComputed = Math.round(walk.ms * 6);

  // what the same 200 buckets cost when each is SAMPLED instead of summed whole
  var sampled = ms(function () {
    var step = Math.floor(data.length / 200);
    var stride = Math.max(1, Math.floor(step / 64));
    var peaks = [];
    for (var i = 0; i < 200; i++) {
      var sum = 0, n = 0;
      for (var j = 0; j < step; j += stride) { sum += Math.abs(data[i * step + j]); n++; }
      peaks.push(n ? sum / n : 0);
    }
    return peaks.length;
  });
  res.peakWalkSampledTenMinutesMs = sampled.ms;

  res.pcmBytesOneHourStereo48k = 48000 * 3600 * 2 * 4;
  res.pcmBytesOneHourStereo8k = 8000 * 3600 * 2 * 4;

  // does the browser honour a low decode rate, which is what turns 1.38 GB into 230 MB
  try {
    var lc = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 });
    res.lowRateContextHz = lc.sampleRate;
    lc.close();
  } catch (e) { res.lowRateContextHz = 'refused: ' + e.message; }

  // ── the thumbnail main-thread work ──────────────────────────────────────────────────────────────
  // The seeks themselves are the decoder's time and do not block the UI; this is what the page pays.
  var c = document.createElement('canvas');
  c.width = 80; c.height = 45;
  var cx = c.getContext('2d');
  var src = document.createElement('canvas');
  src.width = 1920; src.height = 1080;
  var sx = src.getContext('2d');
  sx.fillStyle = '#345'; sx.fillRect(0, 0, 1920, 1080);
  sx.fillStyle = '#f2ff58'; sx.fillRect(100, 100, 600, 400);

  var forty = ms(function () {
    var n = 0;
    for (var i = 0; i < 40; i++) {
      cx.drawImage(src, 0, 0, 80, 45);
      n += c.toDataURL('image/jpeg', 0.5).length;
    }
    return n;
  });
  res.fortyThumbnailsMs = forty.ms;
  res.thumbnailDataUrlBytes = Math.round(forty.v / 40);

  return JSON.stringify(res);
})()`);

console.log(JSON.stringify(JSON.parse(out), null, 1));
await page.close();
