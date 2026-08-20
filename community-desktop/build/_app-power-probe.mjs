/* Is the app being held back, or is it using what the machine has?
 *
 * The owner's reading is that it stutters while using 500 MB and no real CPU, as though something is
 * capping it. This asks the app itself rather than guessing: what the GPU is actually doing for it,
 * what V8 is allowed to hold, and how long a frame takes while the canvas is doing real work.
 *
 *   node build/_app-power-probe.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXE = join(HERE, '..', 'dist', 'win-unpacked', 'dika.studio.exe');
if (!existsSync(EXE)) throw new Error('packaged app not found: ' + EXE);

const PORT = 9334;
const child = spawn(EXE, [
  '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d); });

async function json(path, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no devtools\n' + stderr.slice(-300));
}

/* The browser-level endpoint answers the GPU question; the page endpoint cannot. */
const version = await json('/json/version');
const bws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { bws.onopen = res; bws.onerror = () => rej(new Error('browser ws')); });
let bid = 0; const bpending = new Map();
bws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && bpending.has(m.id)) { bpending.get(m.id)(m); bpending.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((res) => { const n = ++bid; bpending.set(n, res); bws.send(JSON.stringify({ id: n, method, params })); });

const info = await bsend('SystemInfo.getInfo');
const gpu = info.result?.gpu || {};
const status = gpu.featureStatus || {};
console.log('GPU feature status (what the machine is allowed to do for this app):');
for (const [k, v] of Object.entries(status)) console.log(`  ${k.padEnd(28)} ${v}`);
console.log('  driver bug workarounds:', (gpu.driverBugWorkarounds || []).length);
console.log('  device:', (gpu.devices || []).map((d) => d.deviceString || d.vendorString).join(' | ') || 'unknown');

const targets = await json('/json/list');
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('page ws')); });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');
const evalIn = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

for (let i = 0; i < 120; i++) {
  if (await evalIn('!!(window.canvas && window.fabric)')) break;
  await new Promise((r) => setTimeout(r, 500));
}

const limits = await evalIn(`JSON.stringify({
  jsHeapLimitMB: performance.memory ? Math.round(performance.memory.jsHeapSizeLimit / 1048576) : 'not exposed',
  jsHeapUsedMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 'n/a',
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemoryGB: navigator.deviceMemory || 'not exposed',
  canvasAccelerated: (function () {
    var c = document.createElement('canvas'); c.width = 300; c.height = 150;
    var ctx = c.getContext('2d', { willReadFrequently: false });
    return !!ctx;
  })(),
  webgl2: (function () { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })(),
  crossOriginIsolated: !!self.crossOriginIsolated,
  workersUsed: typeof Worker !== 'undefined'
})`);
console.log('renderer limits:', limits);

/* A frame budget is 16.7 ms. This does the kind of work the canvas does and reports how many frames
   actually landed, which is the number that decides whether it FEELS smooth. */
const frames = await evalIn(`(function () {
  return new Promise(function (resolve) {
    var n = 0, worst = 0, last = performance.now(), t0 = last;
    function tick(now) {
      var dt = now - last; last = now;
      if (n > 0 && dt > worst) worst = dt;
      n++;
      canvas.requestRenderAll();
      if (now - t0 < 2000) requestAnimationFrame(tick);
      else resolve(JSON.stringify({
        frames: n,
        seconds: Math.round((now - t0)) / 1000,
        fps: Math.round(n / ((now - t0) / 1000)),
        worstFrameMs: Math.round(worst * 10) / 10,
        objectsOnCanvas: canvas.getObjects().length
      }));
    }
    requestAnimationFrame(tick);
  });
})()`);
console.log('canvas frames:', frames);

/* A 200 ms frame on an EMPTY canvas has an owner. Autosave runs every 30 s, serialises every page on
   the main thread and writes it, which is exactly the shape of a periodic stutter nobody can explain. */
const save = await evalIn(`(function () {
  return new Promise(function (resolve) {
    function blockedBy(fn) {
      return new Promise(function (done) {
        var t0 = performance.now(); fn();
        setTimeout(function () { done(Math.round((performance.now() - t0) * 10) / 10); }, 0);
      });
    }
    var out = { pages: (typeof pages !== 'undefined' && pages.length) || 0, objects: canvas.getObjects().length };
    blockedBy(function () {
      if (typeof buildAutosavePayload === 'function') out.payload = buildAutosavePayload();
    }).then(function (v) {
      out.buildPayloadMs = v;
      out.payloadKB = out.payload ? Math.round(JSON.stringify(out.payload).length / 1024) : 'builder not global';
      delete out.payload;
      resolve(JSON.stringify(out));
    });
  });
})()`);
console.log('autosave:', save);

ws.close(); bws.close(); child.kill();
