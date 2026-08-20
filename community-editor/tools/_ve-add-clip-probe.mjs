/* Adding a video to the timeline: what actually blocks the thread, and for how long.
 *
 * The owner's report is the origin of this whole line of work: "videoyu zaman çizelgesine ekleyince
 * donuyor", one hour of footage, five minutes of nothing, no CPU and no disk worth noticing. Earlier
 * passes measured the pieces separately (waveform peaks, thumbnail seeks, ruler ticks) in headless
 * chromium over file://, which the owner correctly rejected: the web build is fine and the WINDOWS
 * APP is what stutters. This one drives the real Electron app and measures the real import path.
 *
 * A REAL file, made here: WebCodecs H.264 + AAC through the muxer the app itself ships, so the audio
 * track exists and the waveform path runs for real rather than being skipped by a silent clip.
 *
 * The number that answers the complaint is not an average, it is the LONGEST GAP. A 16 ms heartbeat
 * runs across the whole import and every gap is recorded: the biggest one is the freeze a person sees,
 * and the sum is how much of the wall clock the thread was unavailable.
 *
 *   node tools/_ve-add-clip-probe.mjs [seconds] [dev]
 *
 * `dev` loads index.dev.html instead of the shipped page: same code, one file per module instead of
 * one minified bundle, so the profiler prints REAL FUNCTION NAMES. The bundle answers "how long", the
 * dev page answers "which line", and the first run of this probe could only report four anonymous
 * frames of 583, 211, 150 and 110 ms - true, and useless for deciding what to change.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECONDS = Number(process.argv[2] || 600);
/* A UNIQUE NAME PER RUN, so a clip restored from a previous run can never be mistaken for this one. */
const CLIP_NAME = 'probe-clip-' + Date.now().toString(36) + '.mp4';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DESKTOP = join(dirname(ROOT), 'community-desktop');
const ELECTRON = join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(ELECTRON)) throw new Error('electron not installed: ' + ELECTRON);

const PORT = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const child = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'], { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d); });

async function json(path, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no devtools\n' + stderr.slice(-400));
}
const page = (await json('/json/list')).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('page ws')); });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');
await send('Performance.enable');
const evalIn = async (expression, timeoutMs = 600000) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }),
    new Promise((res) => setTimeout(() => res({ timedOut: true }), timeoutMs))
  ]);
  if (r.timedOut) throw new Error('eval did not return within ' + timeoutMs + ' ms');
  const d = r.result?.exceptionDetails;
  if (d) throw new Error('eval threw: ' + (d.exception?.description || d.text));
  return r.result?.result?.value;
};
async function metrics() {
  const r = await send('Performance.getMetrics');
  const m = {};
  for (const { name, value } of r.result?.metrics || []) m[name] = value;
  return m;
}
const msOf = (a, b, k) => Math.round((b[k] - a[k]) * 1000 * 10) / 10;
const diffOf = (a, b) => ({
  scriptMs: msOf(a, b, 'ScriptDuration'), styleMs: msOf(a, b, 'RecalcStyleDuration'),
  layoutMs: msOf(a, b, 'LayoutDuration'), taskMs: msOf(a, b, 'TaskDuration'),
  nodes: b.Nodes - a.Nodes, heapMB: Math.round((b.JSHeapUsedSize - a.JSHeapUsedSize) / 1048576 * 10) / 10
});
const line = (label, d) => console.log('  ' + label.padEnd(26) +
  'script ' + String(d.scriptMs).padStart(8) + ' ms   style ' + String(d.styleMs).padStart(6) +
  '   layout ' + String(d.layoutMs).padStart(7) + '   nodes ' + (d.nodes >= 0 ? '+' : '') + String(d.nodes).padStart(6) +
  '   heap ' + (d.heapMB >= 0 ? '+' : '') + d.heapMB + ' MB');

if (process.argv[3] === 'dev') {
  await send('Page.enable');
  await send('Page.navigate', { url: 'app://editor/index.dev.html' });
  await new Promise((r) => setTimeout(r, 3000));
  console.log('loaded index.dev.html (per-module, unminified: the profiler can name what it samples)');
}

for (let i = 0; i < 240; i++) {
  if (await evalIn('!!(window.__ccVideoEditor && window.__ccVideoEditor._veActivate)').catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}
await evalIn('window.__ccVideoEditor._veActivate()');
await new Promise((r) => setTimeout(r, 2500));

/* Quiet, for the same reason the right-panel probe waits: the editor keeps building after "ready",
   and work measured inside that window is charged to whatever function happens to be running. */
let quiet = 0, waited = 0;
while (quiet < 2 && waited < 40) {
  const a = await metrics();
  await new Promise((r) => setTimeout(r, 500));
  const d = diffOf(a, await metrics());
  waited += 0.5;
  if (d.scriptMs < 25) quiet++; else quiet = 0;
}
console.log('video mode active, quiet after ' + waited + 's' + (quiet < 2 ? ' (NEVER went quiet)' : ''));

/* THE TIMELINE IS EMPTIED FIRST, and how full it was is reported.
   The editor restores the last project from IndexedDB, so a previous run of this probe came back
   with its clip on the timeline. That run then measured an import into a project that already held
   an hour of video, found the OLD clip by name, and reported its 600 s duration for a 3600 s file:
   three wrong numbers from one dirty start. */
const cleared = JSON.parse(await evalIn(`(function () {
  var VE = window.__ccVideoEditor;
  var tracks = (VE._veProject && VE._veProject.tracks) || [];
  var had = 0;
  for (var i = 0; i < tracks.length; i++) { had += tracks[i].clips.length; tracks[i].clips = []; }
  VE._veProject.duration = 0;
  VE._veProject._bgClipId = null;
  if (VE._veRecalcDuration) VE._veRecalcDuration();
  if (VE._veRender) VE._veRender();
  return JSON.stringify({ removed: had, tracks: tracks.length });
})()`));
console.log('timeline cleared: ' + cleared.removed + ' clip(s) left over from an earlier run, ' + cleared.tracks + ' tracks');

/* Video mode sitting there with nothing on the timeline. Without this line the import figures below
   have nothing to be read against: the first run of this probe watched for 45 s, most of it idle, and
   the profile was then topped by the playback loop rather than by anything the import did. */
{
  const a = await metrics();
  await new Promise((r) => setTimeout(r, 3000));
  const d = diffOf(a, await metrics());
  const state = JSON.parse(await evalIn(`JSON.stringify({
    playing: !!(window.__ccVideoEditor._vePlayback && window.__ccVideoEditor._vePlayback.playing),
    frameSource: !!(window.VEFrameSource && VEFrameSource.isAvailable && VEFrameSource.isAvailable())
  })`));
  console.log('\nBASELINE - video mode, empty timeline, three seconds of nothing');
  line('idle', d);
  console.log('  playing: ' + state.playing + '   filmstrip served by VEFrameSource: ' + state.frameSource +
    (state.frameSource ? ' (so _thumbCache stays empty BY DESIGN - tiles are decoded on demand)' : ''));
}

/* ── the test file ────────────────────────────────────────────────────────────────────────────
   640x360 at 5 fps keeps the ENCODE affordable; resolution and keyframe spacing set the cost of a
   SEEK, which was measured at 720p in _ve-seek-probe.mjs and is not what this probe is asking. What
   this file has to be is LONG and to carry SOUND, because those are the two things the import path
   walks end to end. */
const made = JSON.parse(await evalIn(`(function () { return (async function () {
  var W = 640, H = 360, FPS = 5, SECONDS = ${SECONDS}, GOP = FPS * 10, RATE = 48000;
  /* An hour at a realistic bitrate is a 400 MB ArrayBuffer held in memory twice (muxer target, then
     the File). The bitrate is dropped for long files because what the import path pays for is the
     LENGTH and the presence of an audio track, not the picture quality of a synthetic gradient. */
  var VBITS = SECONDS > 1200 ? 250000 : 800000;
  /* AAC TAKES A FIXED SET OF BITRATES and rejects anything else at configure time
     ("NotSupportedError: Unsupported bitrate. Supported values: 96000, 128000, 160000, 192000"),
     which closes the codec. An hour-long file was produced SILENT that way and read as though the
     waveform path were free. 96000 is the lowest one that exists. */
  var ABITS = SECONDS > 1200 ? 96000 : 128000;
  /* An encoder is not a queue with no bottom. Feeding 18000 frames without ever draining it made the
     audio encoder close mid-run ("Cannot call 'encode' on a closed codec"), which reads exactly like
     a bug in the app under test rather than in the harness feeding it. */
  function drain(enc, limit) {
    if (enc.encodeQueueSize <= limit) return Promise.resolve();
    return new Promise(function (r) {
      var tick = function () {
        if (enc.state !== 'configured' || enc.encodeQueueSize <= limit) r();
        else setTimeout(tick, 4);
      };
      tick();
    });
  }
  var muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: RATE },
    fastStart: 'in-memory'
  });
  var err = null;
  var venc = new VideoEncoder({ output: function (c, m) { muxer.addVideoChunk(c, m); }, error: function (e) { err = String(e); } });
  venc.configure({ codec: 'avc1.42001f', width: W, height: H, bitrate: VBITS, framerate: FPS });
  var aenc = new AudioEncoder({ output: function (c, m) { muxer.addAudioChunk(c, m); }, error: function (e) { err = err || String(e); } });
  aenc.configure({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: RATE, bitrate: ABITS });

  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var cx = c.getContext('2d');
  var t0 = performance.now();
  var vframes = SECONDS * FPS;
  for (var i = 0; i < vframes; i++) {
    cx.fillStyle = 'hsl(' + ((i * 3) % 360) + ',40%,25%)'; cx.fillRect(0, 0, W, H);
    cx.fillStyle = '#f2ff58'; cx.font = '64px sans-serif'; cx.fillText(String(i), 20, 90);
    var f = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(f, { keyFrame: i % GOP === 0 });
    f.close();
    if (venc.state !== 'configured') { err = err || 'video encoder closed at frame ' + i; break; }
    if (i % 60 === 0) { await drain(venc, 30); await new Promise(function (r) { setTimeout(r, 0); }); }
  }
  /* Five seconds of stereo tone per AudioData. One second per call closed the encoder partway
     through an hour ("Cannot call 'encode' on a closed codec") even with back-pressure, and 3600
     calls is the harness's problem, not the app's: chunking is fewer calls for the same audio. */
  var CHUNK = 5;
  var frames = RATE * CHUNK;
  var buf = new Float32Array(frames * 2);
  for (var k = 0; k < frames; k++) {
    var v = Math.sin(2 * Math.PI * 220 * (k / RATE)) * 0.25;
    buf[k] = v; buf[frames + k] = v;
  }
  for (var s = 0; s < SECONDS; s += CHUNK) {
    if (aenc.state !== 'configured') { err = err || 'audio encoder closed at second ' + s; break; }
    aenc.encode(new AudioData({
      format: 'f32-planar', sampleRate: RATE, numberOfFrames: frames, numberOfChannels: 2,
      timestamp: s * 1e6, data: buf
    }));
    await drain(aenc, 4);
    await new Promise(function (r) { setTimeout(r, 0); });
  }
  /* Flushing a codec that has already died throws over the top of the reason it died. */
  if (venc.state === 'configured') { await venc.flush(); } else { err = err || 'video encoder closed before flush'; }
  if (aenc.state === 'configured') { await aenc.flush(); } else { err = err || 'audio encoder closed before flush'; }
  muxer.finalize();
  var bytes = muxer.target.buffer;
  window.__ccClipFile = new File([bytes], ${JSON.stringify(CLIP_NAME)}, { type: 'video/mp4' });
  return JSON.stringify({ mb: Math.round(bytes.byteLength / 1048576 * 10) / 10, encodeMs: Math.round(performance.now() - t0), frames: vframes, err: err });
})(); })()`));
console.log('\ntest file: ' + SECONDS + ' s, ' + made.mb + ' MB, made in ' + Math.round(made.encodeMs / 1000) + ' s' + (made.err ? '   ENCODER SAID: ' + made.err : ''));

/* ── the import, with a heartbeat running across it ──────────────────────────────────────────── */
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 200 });
const before = await metrics();
await send('Profiler.start');

const imp = JSON.parse(await evalIn(`(function () { return (async function () {
  var VE = window.__ccVideoEditor;
  var track = null, tracks = (VE._veProject && VE._veProject.tracks) || [];
  for (var i = 0; i < tracks.length; i++) if (tracks[i].type === 'video') { track = tracks[i]; break; }
  if (!track) return JSON.stringify({ error: 'no video track' });

  /* The heartbeat. Every gap over the interval is main-thread time somebody would have felt. */
  var gaps = [], last = performance.now();
  var beat = setInterval(function () {
    var now = performance.now();
    gaps.push(now - last);
    last = now;
  }, 16);

  var t0 = performance.now();
  VE._veImportFile(window.__ccClipFile, track, 0);

  /* Wait for the clip to exist, then for the two async producers the import kicks off, then for the
     timeline to stop changing. Capped, because "it never finished" is itself a result. */
  var clip = null, waveformAt = null, thumbsAt = null, settleFrom = null, landedOn = null;
  var deadline = t0 + 120000;
  while (performance.now() < deadline) {
    await new Promise(function (r) { setTimeout(r, 50); });
    /* SEARCH EVERY TRACK, BY NAME. Object identity on the _file property, against a single captured
       track, failed on the hour-long run: the clip was demonstrably imported (the timeline adopted
       3600 s and the waveform XHR ran) while this said "clip on the timeline: false", which is a
       probe reporting the opposite of what happened. */
    if (!clip) {
      var all = (VE._veProject && VE._veProject.tracks) || [];
      for (var ti = 0; ti < all.length && !clip; ti++) {
        for (var j = 0; j < all[ti].clips.length; j++) {
          if (all[ti].clips[j].fileName === ${JSON.stringify(CLIP_NAME)}) { clip = all[ti].clips[j]; landedOn = all[ti].type + '#' + ti; break; }
        }
      }
    }
    if (clip) {
      if (!waveformAt && clip._waveformUrl) waveformAt = performance.now();
      if (!thumbsAt && clip._thumbCache && clip._thumbCache.length) thumbsAt = performance.now();
      /* THE WINDOW ENDS THREE SECONDS AFTER THE LAST THING ARRIVES, and _thumbCache is deliberately
         not waited for: with VEFrameSource available the import leaves it empty on purpose and the
         filmstrip decodes visible tiles on demand, so waiting for it padded the measurement with 44
         seconds of idle and let the playback loop top the profile. */
      if (waveformAt) {
        if (!settleFrom) settleFrom = performance.now();
        if (performance.now() - settleFrom > 3000) break;
      } else if (performance.now() - t0 > 60000) break;
    }
  }
  clearInterval(beat);
  await new Promise(function (r) { setTimeout(r, 300); });

  gaps.sort(function (a, b) { return b - a; });
  var over = gaps.filter(function (g) { return g > 50; });
  return JSON.stringify({
    clipFound: !!clip,
    clipId: clip ? clip.id : null,
    waveformUrlBytes: clip && clip._waveformUrl ? clip._waveformUrl.length : 0,
    landedOn: landedOn,
    hasAudioTrack: clip ? !!clip._waveformUrl : null,
    playingAfterImport: !!(VE._vePlayback && VE._vePlayback.playing),
    durationOnTimeline: clip ? Math.round(clip.duration) : null,
    waveformMs: waveformAt ? Math.round(waveformAt - t0) : null,
    thumbsMs: thumbsAt ? Math.round(thumbsAt - t0) : null,
    thumbCount: clip && clip._thumbCache ? clip._thumbCache.length : 0,
    totalMs: Math.round(performance.now() - t0),
    worstGapMs: Math.round(gaps[0] || 0),
    top5GapsMs: gaps.slice(0, 5).map(function (g) { return Math.round(g); }),
    gapsOver50: over.length,
    blockedMsOver50: Math.round(over.reduce(function (a, b) { return a + b; }, 0)),
    beats: gaps.length
  });
})(); })()`));

const profile = (await send('Profiler.stop')).result?.profile;
const after = await metrics();

console.log('\nADDING THE CLIP');
if (imp.error) console.log('  ' + imp.error);
console.log('  clip on the timeline: ' + imp.clipFound + ' (' + imp.landedOn + ')   duration ' + imp.durationOnTimeline + ' s' +
  '   thumbnails ' + imp.thumbCount);
console.log('  waveform ready at ' + imp.waveformMs + ' ms   watched for ' + imp.totalMs + ' ms   playing by itself: ' + imp.playingAfterImport);
console.log('  WORST FREEZE ' + imp.worstGapMs + ' ms   (top five: ' + imp.top5GapsMs.join(', ') + ')');
console.log('  gaps over 50 ms: ' + imp.gapsOver50 + ', totalling ' + imp.blockedMsOver50 + ' ms of ' + imp.totalMs + ' ms watched');
line('the whole import', diffOf(before, after));

{
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const deltas = profile.timeDeltas || [];
  profile.samples.forEach((sid, i) => self.set(sid, (self.get(sid) || 0) + (deltas[i] || 0)));
  const rows = [...self.entries()].map(([sid, us]) => {
    const n = byId.get(sid); const f = n?.callFrame || {};
    const file = (f.url || '').split('/').slice(-1)[0] || '(no file)';
    return { name: f.functionName || '(anonymous)', where: file + ':' + ((f.lineNumber ?? -1) + 1), ms: us / 1000 };
  }).filter((r) => r.ms >= 2 && r.name !== '(idle)' && r.name !== '(program)')
    .sort((a, b) => b.ms - a.ms).slice(0, 14);
  console.log('\n  what ran, by self time (the sampler ignores idle)');
  console.log('  ' + 'function'.padEnd(30) + 'where'.padEnd(36) + 'self ms'.padStart(9));
  for (const r of rows) console.log('  ' + r.name.slice(0, 29).padEnd(30) + r.where.slice(0, 35).padEnd(36) + r.ms.toFixed(1).padStart(9));
}

/* WHAT THE WAVEFORM ACTUALLY IS, not just how fast it arrived. A faster import that draws a blank
   strip or stores nothing to zoom into is not a win, so the picture and the stored peaks are both
   read back. */
if (imp.clipId) {
  const wave = JSON.parse(await evalIn(`(function () {
    if (!(window.VEMediaPipeline && VEMediaPipeline.waveformCache)) return JSON.stringify({ cache: 'absent' });
    return VEMediaPipeline.waveformCache.get(${JSON.stringify(imp.clipId)}).then(function (rec) {
      var raw = rec && rec.peaks && rec.peaks.raw && rec.peaks.raw[0];
      return JSON.stringify({
        stored: !!raw,
        typedArray: !!(raw && raw.BYTES_PER_ELEMENT),
        peaks: raw ? Math.round(raw.length / 2) : 0,
        samplesPerPixel: rec && rec.peaks ? rec.peaks.samplesPerPixel : null,
        decodedAtHz: rec && rec.peaks ? rec.peaks.sampleRate : null,
        seconds: rec && rec.peaks ? Math.round(rec.peaks.duration) : null
      });
    }).catch(function (e) { return JSON.stringify({ error: String(e) }); });
  })()`));
  /* A DATA URL OF THE RIGHT SIZE IS NOT A PICTURE. A 400x40 PNG of nothing at all still weighs about
     a kilobyte, so the bar is counted rather than weighed: how many columns actually carry ink, and
     how tall they are. A blank strip and a drawn one are one number apart. */
  const ink = JSON.parse(await evalIn(`(function () {
    var clip = null, tracks = window.__ccVideoEditor._veProject.tracks;
    for (var t = 0; t < tracks.length && !clip; t++) {
      for (var j = 0; j < tracks[t].clips.length; j++) if (tracks[t].clips[j].id === ${JSON.stringify(imp.clipId)}) clip = tracks[t].clips[j];
    }
    if (!clip || !clip._waveformUrl) return Promise.resolve(JSON.stringify({ drawn: false, why: 'no waveform url' }));
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        var d = cx.getImageData(0, 0, c.width, c.height).data;
        var cols = 0, tallest = 0;
        for (var x = 0; x < c.width; x++) {
          var h = 0;
          for (var y = 0; y < c.height; y++) if (d[(y * c.width + x) * 4 + 3] > 0) h++;
          if (h) cols++;
          if (h > tallest) tallest = h;
        }
        resolve(JSON.stringify({ drawn: cols > 0, width: c.width, height: c.height, inkedColumns: cols, tallestBarPx: tallest }));
      };
      img.onerror = function () { resolve(JSON.stringify({ drawn: false, why: 'image failed to load' })); };
      img.src = clip._waveformUrl;
    });
  })()`));
  console.log('  waveform drawn: ' + ink.drawn + (ink.drawn
    ? '   ' + ink.width + 'x' + ink.height + ', ' + ink.inkedColumns + ' of ' + ink.width + ' columns inked, tallest bar ' + ink.tallestBarPx + ' px'
    : '   ' + (ink.why || '')));
  console.log('  waveform image ' + Math.round(imp.waveformUrlBytes / 1024) + ' KB of data URL' +
    (wave.stored ? '   peaks ' + wave.peaks + ' (' + Math.round(wave.peaks / (wave.seconds || 1)) + '/s)' +
      '   decoded at ' + wave.decodedAtHz + ' Hz, ' + wave.samplesPerPixel + ' samples per peak' +
      '   stored as ' + (wave.typedArray ? 'Float32Array' : 'plain Array')
      : '   NOTHING STORED (' + (wave.error || wave.cache || 'no record') + ')'));
}

/* ── and the timeline with that clip on it ───────────────────────────────────────────────────── */
const tl = JSON.parse(await evalIn(`(function () {
  var VE = window.__ccVideoEditor;
  function ms(fn) { var t0 = performance.now(); fn(); return Math.round((performance.now() - t0) * 10) / 10; }
  var out = { duration: Math.round(VE._veProject.duration), zoom: VE._veProject.zoom };
  out.renderMs = ms(function () { VE._veRender(); });
  out.renderPlusLayoutMs = ms(function () { VE._veRender(); document.body.getBoundingClientRect(); });
  var z = VE._veProject.zoom;
  out.zoomInMs = ms(function () { VE._veProject.zoom = z * 2; VE._veRender(); document.body.getBoundingClientRect(); });
  VE._veProject.zoom = z; VE._veRender();
  out.seekMs = ms(function () { if (VE._veSeek) VE._veSeek(Math.round(VE._veProject.duration / 2)); });
  return JSON.stringify(out);
})()`));
console.log('\nTHE TIMELINE, with the clip on it (' + tl.duration + ' s at zoom ' + tl.zoom + ')');
console.log('  one render ' + tl.renderMs + ' ms   render + forced layout ' + tl.renderPlusLayoutMs + ' ms   zoom in ' + tl.zoomInMs + ' ms   seek ' + tl.seekMs + ' ms');

ws.close();
child.kill();
