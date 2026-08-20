/* Does the 8 kHz waveform decode change EXPORTED AUDIO? Speed, pitch, or quality?
 *
 * The owner asked it directly after the waveform fix, and it is exactly the right question: the fix
 * decodes audio at 8 kHz instead of 48 kHz, and if that buffer ever reached the mixdown the export
 * would come out six times too fast, or an octave and a half too high, or aliased.
 *
 * Reading the code says no - `_veFreezeTracksForExport` strips `_waveformUrl`, the peaks feed only the
 * drawn strip, and `renderOffline` builds its OWN OfflineAudioContext at 48 kHz and decodes the source
 * files again. But "I read the code" is not a measurement, so this imports a clip carrying an EXACT
 * 220 Hz tone, runs the same call the export button runs, and counts the zero crossings of what comes
 * back. A leak would be unmissable: 8 kHz data played at 48 kHz is 1320 Hz and a sixth of the length.
 *
 *   node tools/_audio-export-proof.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TONE_HZ = 220;
const SECONDS = 20;
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
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'], { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });

async function json(path, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no devtools');
}
const page = (await json('/json/list')).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('page ws')); });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');
const evalIn = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  const d = r.result?.exceptionDetails;
  if (d) throw new Error('eval threw: ' + (d.exception?.description || d.text));
  return r.result?.result?.value;
};

for (let i = 0; i < 120; i++) {
  if (await evalIn('!!(window.__ccVideoEditor && window.__ccVideoEditor._veActivate)')) break;
  await new Promise((r) => setTimeout(r, 500));
}
await evalIn('window.__ccVideoEditor._veActivate()');
await new Promise((r) => setTimeout(r, 3000));
await evalIn(`(function () {
  var VE = window.__ccVideoEditor, tracks = (VE._veProject && VE._veProject.tracks) || [];
  for (var i = 0; i < tracks.length; i++) tracks[i].clips = [];
  VE._veProject.duration = 0; VE._veProject._bgClipId = null;
  if (VE._veRecalcDuration) VE._veRecalcDuration();
  if (VE._veRender) VE._veRender();
  return 1;
})()`);

/* A file whose audio is one continuous 220 Hz sine. The phase runs across chunk boundaries on purpose:
   restarting it every chunk puts a click at each seam, and a click is broadband, which would blunt the
   very measurement this proof depends on. */
const made = JSON.parse(await evalIn(`(function () { return (async function () {
  var W = 320, H = 180, FPS = 5, RATE = 48000, SECONDS = ${SECONDS}, TONE = ${TONE_HZ};
  var muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: RATE },
    fastStart: 'in-memory'
  });
  var err = null;
  var venc = new VideoEncoder({ output: function (c, m) { muxer.addVideoChunk(c, m); }, error: function (e) { err = String(e); } });
  venc.configure({ codec: 'avc1.42001f', width: W, height: H, bitrate: 300000, framerate: FPS });
  var aenc = new AudioEncoder({ output: function (c, m) { muxer.addAudioChunk(c, m); }, error: function (e) { err = err || String(e); } });
  aenc.configure({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: RATE, bitrate: 128000 });

  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var cx = c.getContext('2d');
  for (var i = 0; i < SECONDS * FPS; i++) {
    cx.fillStyle = '#204060'; cx.fillRect(0, 0, W, H);
    var f = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(f, { keyFrame: i % (FPS * 5) === 0 });
    f.close();
    if (i % 25 === 0) await new Promise(function (r) { setTimeout(r, 0); });
  }
  var frames = RATE;                       // one second per AudioData
  var buf = new Float32Array(frames * 2);
  for (var s = 0; s < SECONDS; s++) {
    for (var k = 0; k < frames; k++) {
      var n = s * frames + k;              // CONTINUOUS phase
      var v = Math.sin(2 * Math.PI * TONE * (n / RATE)) * 0.5;
      buf[k] = v; buf[frames + k] = v;
    }
    aenc.encode(new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: frames, numberOfChannels: 2, timestamp: s * 1e6, data: buf }));
    await new Promise(function (r) { setTimeout(r, 0); });
  }
  await venc.flush(); await aenc.flush();
  muxer.finalize();
  var bytes = muxer.target.buffer;
  window.__ccToneFile = new File([bytes], 'tone-proof.mp4', { type: 'video/mp4' });
  return JSON.stringify({ mb: Math.round(bytes.byteLength / 1048576 * 100) / 100, err: err });
})(); })()`));
console.log('test file: ' + SECONDS + ' s of a ' + TONE_HZ + ' Hz tone, ' + made.mb + ' MB' + (made.err ? '   ENCODER SAID: ' + made.err : ''));

/* Import it and WAIT FOR THE WAVEFORM, so the 8 kHz decode has definitely run before the mixdown. */
const imported = JSON.parse(await evalIn(`(function () { return (async function () {
  var VE = window.__ccVideoEditor, tracks = VE._veProject.tracks, track = null;
  for (var i = 0; i < tracks.length; i++) if (tracks[i].type === 'video') { track = tracks[i]; break; }
  VE._veImportFile(window.__ccToneFile, track, 0);
  var clip = null, deadline = performance.now() + 60000;
  while (performance.now() < deadline) {
    await new Promise(function (r) { setTimeout(r, 100); });
    if (!clip) for (var t = 0; t < tracks.length && !clip; t++) {
      for (var j = 0; j < tracks[t].clips.length; j++) if (tracks[t].clips[j].fileName === 'tone-proof.mp4') clip = tracks[t].clips[j];
    }
    if (clip && clip._waveformUrl) break;
  }
  window.__ccToneClip = clip;
  return JSON.stringify({
    found: !!clip,
    waveformDone: !!(clip && clip._waveformUrl),
    clipSeconds: clip ? Math.round(clip.duration * 100) / 100 : null
  });
})(); })()`));
console.log('imported: ' + JSON.stringify(imported));

/* THE SAME CALL THE EXPORT BUTTON MAKES (export.js: sampleRate 48000, channels 2, the video pool). */
const mix = JSON.parse(await evalIn(`(function () { return (async function () {
  var VE = window.__ccVideoEditor;
  if (!(window.VEAudioAdvanced && VEAudioAdvanced.renderOffline)) return JSON.stringify({ error: 'renderOffline unavailable' });
  if (VEAudioAdvanced.init) { try { await VEAudioAdvanced.init(); } catch (e) {} }
  var duration = VE._veProject.duration || ${SECONDS};
  var buffer = await VEAudioAdvanced.renderOffline(VE._veExportTracksNow(), duration, {
    sampleRate: 48000, channels: 2, videoPool: VE._vePlayback.videoPool, startTime: 0,
    masterVolume: 1, masterMuted: false
  });
  if (!buffer) return JSON.stringify({ error: 'mixdown returned nothing' });
  var d = buffer.getChannelData(0);

  /* A window in the MIDDLE, away from any fade at the edges. */
  var from = Math.floor(buffer.sampleRate * 5), to = Math.floor(buffer.sampleRate * 15);
  var crossings = 0, peak = 0, sumSq = 0, n = 0, prev = d[from];
  for (var i = from + 1; i < to && i < d.length; i++) {
    var v = d[i];
    if ((prev < 0 && v >= 0) || (prev > 0 && v <= 0)) crossings++;
    if (Math.abs(v) > peak) peak = Math.abs(v);
    sumSq += v * v; n++;
    prev = v;
  }
  var seconds = (Math.min(to, d.length) - from) / buffer.sampleRate;
  return JSON.stringify({
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    seconds: Math.round(buffer.duration * 100) / 100,
    dominantHz: Math.round((crossings / 2) / seconds * 10) / 10,
    peak: Math.round(peak * 1000) / 1000,
    rms: Math.round(Math.sqrt(sumSq / Math.max(1, n)) * 1000) / 1000
  });
})(); })()`));

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); } else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); } };

console.log('\nthe export mixdown, after the waveform was decoded at 8 kHz');
if (mix.error) {
  check('the mixdown ran', false, mix.error);
} else {
  check('the mixdown is 48 kHz stereo', mix.sampleRate === 48000 && mix.channels === 2, mix.sampleRate + ' Hz, ' + mix.channels + ' ch');
  check('it is as long as the clip', Math.abs(mix.seconds - SECONDS) < 1.5, mix.seconds + ' s against ' + SECONDS + ' s');
  check('it is not silent', mix.rms > 0.05, 'rms ' + mix.rms + ', peak ' + mix.peak);
  check('it does not clip', mix.peak <= 1.001, 'peak ' + mix.peak);
  check('THE PITCH IS UNCHANGED', Math.abs(mix.dominantHz - TONE_HZ) < 6,
    mix.dominantHz + ' Hz against ' + TONE_HZ + ' Hz (a leaked 8 kHz buffer would read about ' + (TONE_HZ * 6) + ' Hz)');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
ws.close();
child.kill();
process.exit(fail ? 1 : 0);
