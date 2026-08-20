/* Measures the PACKAGED WINDOWS APP, not a page in a browser.
 *
 * Every earlier probe opened index.html in headless chromium and cleared the code. The owner then
 * said the plain thing that mattered: the web build is fine, the Windows app freezes. So those
 * measurements were answering a question nobody asked. This one attaches to the app's own renderer
 * over the DevTools protocol and runs the same gesture there, so the number comes from the thing that
 * is actually slow.
 *
 * The app is started with a remote debugging port, which Electron accepts on the command line. It
 * changes nothing else about the build.
 *
 *   node build/_app-perf-probe.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXE = join(HERE, '..', 'dist', 'win-unpacked', 'dika.studio.exe');
if (!existsSync(EXE)) throw new Error('packaged app not found: ' + EXE);

const PORT = 9333;
/* ⚠ A BACKGROUND WINDOW IS A THROTTLED WINDOW. Chromium clamps timers and stops driving frames for a
   renderer it thinks nobody is looking at, and a probe launched from a terminal is exactly that: the
   first run of this script reported 203 ms of "idle blocking" while the profiler said the main thread
   was 99% idle, which is the throttle and not the app. These three flags take that out of the
   measurement so the number describes a window somebody is using. */
const child = spawn(EXE, [
  '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
], { stdio: ['ignore', 'pipe', 'pipe'], detached: false });
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d); });

async function json(path, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
      if (r.ok) return await r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no devtools on ' + PORT + '\n' + stderr.slice(-400));
}

const targets = await json('/json/list');
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no renderer target: ' + JSON.stringify(targets.map((t) => t.type)));
console.log('attached to:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');

async function evalIn(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error('eval threw: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
}

// the editor may still be booting, or sitting behind the registration wizard
for (let i = 0; i < 120; i++) {
  const ready = await evalIn('!!(window.canvas && window.fabric)');
  if (ready) break;
  await new Promise((r) => setTimeout(r, 500));
}

const env = await evalIn(`JSON.stringify({
  url: location.href,
  crossOriginIsolated: !!self.crossOriginIsolated,
  canvasReady: !!window.canvas,
  wizardOpen: !!document.querySelector('.cc-register-wizard, #cc-register-wizard, .first-run'),
  locale: window.CCI18n ? CCI18n.locale() : 'no i18n',
  localeScripts: Array.prototype.filter.call(document.querySelectorAll('script[src]'), function (s) { return /locales\\//.test(s.getAttribute('src') || ''); }).length,
  elements: document.querySelectorAll('*').length,
  gpu: (function () { try { var c = document.createElement('canvas').getContext('webgl'); return c ? c.getParameter(c.RENDERER) : 'no webgl'; } catch (e) { return 'err ' + e.message; } })()
})`);
console.log('environment:', env);

const perf = await evalIn(`(function () {
  return new Promise(function (resolve) {
    var out = {};
    function blockedBy(fn) {
      return new Promise(function (done) {
        var t0 = performance.now();
        fn();
        setTimeout(function () { done(Math.round((performance.now() - t0) * 10) / 10); }, 0);
      });
    }
    var added = [];
    function addOne() {
      var tb = new fabric.Textbox('Double click to edit', { left: 40 + added.length * 6, top: 40 + added.length * 6, width: 240, fontSize: 24 });
      canvas.add(tb); canvas.setActiveObject(tb); canvas.requestRenderAll();
      if (typeof window.syncRightPanel === 'function') syncRightPanel();
      if (typeof window.renderLayers === 'function') renderLayers();
      added.push(tb);
    }
    blockedBy(function () {}).then(function (v) { out.idleMs = v; return blockedBy(addOne); })
      .then(function (v) { out.oneTextMs = v; return blockedBy(function () { for (var i = 0; i < 5; i++) addOne(); }); })
      .then(function (v) {
        out.fiveTextsMs = v;
        for (var i = 0; i < added.length; i++) canvas.remove(added[i]);
        canvas.requestRenderAll();
        resolve(JSON.stringify(out));
      });
  });
})()`);
console.log('add text:', perf);

/* 200 ms of blocking with nothing happening is the whole story, so name it: sample the main thread
   for three idle seconds and print who owns the self time. */
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 200 });
await send('Profiler.start');
await new Promise((r) => setTimeout(r, 4000));
const prof = await send('Profiler.stop');
const nodes = prof.result?.profile?.nodes || [];
const samples = prof.result?.profile?.samples || [];
const self = new Map();
for (const s of samples) self.set(s, (self.get(s) || 0) + 1);
const byId = new Map(nodes.map((n) => [n.id, n]));
const rows = [...self.entries()]
  .map(([id, count]) => {
    const n = byId.get(id);
    const f = n?.callFrame || {};
    return { count, fn: (f.functionName || '(anonymous)'), url: (f.url || '').split('/').slice(-1)[0], line: f.lineNumber };
  })
  .sort((a, b) => b.count - a.count)
  .slice(0, 12);
const total = samples.length || 1;
console.log('idle profile, 4 s, top self time:');
for (const r of rows) console.log(`  ${(r.count * 100 / total).toFixed(1)}%  ${r.fn}  ${r.url}:${r.line}`);

ws.close();
child.kill();
