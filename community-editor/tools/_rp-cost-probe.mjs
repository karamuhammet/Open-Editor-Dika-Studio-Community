/* Where do the 72-79 ms of syncRightPanel actually go?
 *
 * The right panel costs more than the canvas render it accompanies, and the plan's P1 says to cut it.
 * A cut aimed at the wrong line is a rewrite that changes nothing, so this asks the function itself.
 *
 * It drives the ELECTRON app, never headless chromium over file://. The owner said it plainly: the web
 * build is fine and the Windows app is what stutters, so measuring the other one answers nobody.
 *
 * Three things it does that the first version did not, each one because the first version produced a
 * number that could not be reproduced from the other side:
 *   1. It WAITS FOR QUIET. Measuring while the editor is still building its galleries charges that
 *      work to whatever function happens to be running.
 *   2. It measures the app doing NOTHING first. Script time and DOM growth in an idle window is the
 *      baseline every later figure has to be read against.
 *   3. It measures the same call WRAPPED and UNWRAPPED. Instrumentation that costs more than the
 *      thing it measures is the oldest way to profile the wrong function.
 *
 *   node tools/_rp-cost-probe.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));            // apps/community-editor
const DESKTOP = join(dirname(ROOT), 'community-desktop');
const ELECTRON = join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(ELECTRON)) throw new Error('electron not installed: ' + ELECTRON);

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const PORT = await freePort();

/* Dev mode serves apps/community-editor straight off disk (main.js EDITOR_ROOT), so a source edit is
   one bundle rebuild away from being measurable - no repackaging per iteration. */
const child = spawn(ELECTRON, [
  '.',
  '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
], { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d); });

async function json(path, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch { /* still booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no devtools\n' + stderr.slice(-400));
}

const targets = await json('/json/list');
const page = targets.find((t) => t.type === 'page');
if (!page) { child.kill(); throw new Error('no page target'); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('page ws')); });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');
await send('Performance.enable');
const evalIn = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  const d = r.result?.exceptionDetails;
  if (d) throw new Error('eval threw: ' + (d.exception?.description || d.text));
  return r.result?.result?.value;
};

/* Blink's own cumulative counters, read from OUTSIDE the page so nothing in the renderer can flatter
   them. Diffing them around a window says whether time went to script, style, layout, or nothing. */
async function metrics() {
  const r = await send('Performance.getMetrics');
  const m = {};
  for (const { name, value } of r.result?.metrics || []) m[name] = value;
  return m;
}
const ms = (a, b, k) => Math.round((b[k] - a[k]) * 1000 * 10) / 10;
const diffOf = (a, b) => ({
  taskMs: ms(a, b, 'TaskDuration'),
  scriptMs: ms(a, b, 'ScriptDuration'),
  styleMs: ms(a, b, 'RecalcStyleDuration'),
  layoutMs: ms(a, b, 'LayoutDuration'),
  styleCount: b.RecalcStyleCount - a.RecalcStyleCount,
  layoutCount: b.LayoutCount - a.LayoutCount,
  nodes: b.Nodes - a.Nodes,
  heapMB: Math.round((b.JSHeapUsedSize - a.JSHeapUsedSize) / 1048576 * 10) / 10
});
const line = (label, d, wall) => console.log(
  '  ' + label.padEnd(30) +
  'wall ' + String(wall).padStart(7) + ' ms   script ' + String(d.scriptMs).padStart(7) +
  '   style ' + String(d.styleMs).padStart(6) + ' (' + d.styleCount + ')' +
  '   layout ' + String(d.layoutMs).padStart(6) + ' (' + d.layoutCount + ')' +
  '   nodes ' + (d.nodes >= 0 ? '+' : '') + d.nodes
);

let ready = false;
for (let i = 0; i < 120; i++) {
  ready = await evalIn('!!(window.canvas && window.fabric && typeof window.syncRightPanel === "function")');
  if (ready) break;
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready) { ws.close(); child.kill(); throw new Error('editor never became ready'); }

/* WAIT FOR QUIET. "Ready" means the globals exist, not that the editor has stopped working: the
   galleries, the font list and the boot overlay all keep going, and anything measured inside that
   window is charged to the wrong function. Quiet = two consecutive half-seconds in which the page
   ran under 20 ms of script and added no DOM. */
let quiet = 0, waited = 0;
while (quiet < 2 && waited < 60) {
  const a = await metrics();
  await new Promise((r) => setTimeout(r, 500));
  const d = diffOf(a, await metrics());
  waited += 0.5;
  if (d.scriptMs < 20 && d.nodes < 50) quiet++; else quiet = 0;
}
console.log(`quiet after ${waited}s of waiting` + (quiet < 2 ? ' - NEVER WENT QUIET, read everything below with that in mind' : ''));

/* The app doing nothing at all. Every later figure is read against this line. */
{
  const a = await metrics();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1000));
  const d = diffOf(a, await metrics());
  console.log('\nBASELINE - the editor with nobody touching it');
  line('one second of nothing', d, Date.now() - t0);
}

const DELEGATES = [
  'syncRightPanel',
  'refreshStructure', 'syncColorSwatches', 'syncLayoutPanel', 'refreshInlineLayers',
  'syncUniAppearance', 'syncFill', 'rpfRenderSelColors', 'rpfSyncHex', 'rpfSyncBgPanel',
  'syncShadow', 'syncTextFx', 'syncTextCase', 'syncTypography', 'syncAppearance',
  'syncShape', 'syncImage', 'syncImageInspector', 'syncQrProps', 'syncChartPanel',
  'syncEffectPanel', 'syncBoardPanel', '_rpfToggleNoneBody', '_rpfTypeName',
  'rpTextTargets', 'rpFillSelRep', 'rpTextRep', 'loadWfCustomCss'
];

/* ── 0. THE GESTURE, before anything is instrumented. ─────────────────────────────────────────
   syncRightPanel measured on its own is an engineering number. What the owner feels is adding an
   object: Fabric's render, the selection handlers, the right panel and the layer list, all in one
   press. Measured as main-thread time a zero-delay timer had to wait for, which is exactly what a
   dropped frame is. */
{
  const a = await metrics();
  const t0 = Date.now();
  const g = JSON.parse(await evalIn(`(function () {
    return new Promise(function (resolve) {
      function blockedBy(fn) {
        return new Promise(function (done) {
          var t0 = performance.now(); fn();
          setTimeout(function () { done(Math.round((performance.now() - t0) * 10) / 10); }, 0);
        });
      }
      var made = [];
      function addOne() {
        var tb = new fabric.Textbox('Double click to edit', { left: 40 + made.length * 8, top: 40 + made.length * 8, width: 240, fontSize: 24 });
        canvas.add(tb); canvas.setActiveObject(tb); canvas.requestRenderAll();
        made.push(tb);
      }
      var out = {};
      blockedBy(function () {}).then(function (idle) {
        out.idleMs = idle;
        return blockedBy(addOne);
      }).then(function (one) {
        out.oneTextMs = one;
        return blockedBy(function () { for (var i = 0; i < 5; i++) addOne(); });
      }).then(function (five) {
        out.fiveTextsMs = five;
        return blockedBy(function () { canvas.discardActiveObject(); canvas.requestRenderAll(); });
      }).then(function (off) {
        out.deselectMs = off;
        for (var i = 0; i < made.length; i++) canvas.remove(made[i]);
        canvas.requestRenderAll();
        resolve(JSON.stringify(out));
      });
    });
  })()`));
  const d = diffOf(a, await metrics());
  console.log('\nTHE GESTURE - adding text, the whole press (selection handlers, panel and layers included)');
  console.log('  idle blocking ' + g.idleMs + ' ms   one text box ' + g.oneTextMs + ' ms   five in a row ' + g.fiveTextsMs + ' ms   deselect ' + g.deselectMs + ' ms');
  line('all of the above', d, Date.now() - t0);
}

/* A text box on the canvas, selected. Everything after this measures the panel for THAT selection. */
const setup = JSON.parse(await evalIn(`(function () {
  window.__rpTb = new fabric.Textbox('Double click to edit', { left: 60, top: 60, width: 240, fontSize: 24 });
  canvas.add(__rpTb); canvas.setActiveObject(__rpTb); canvas.requestRenderAll();
  return JSON.stringify({ objects: canvas.getObjects().length, type: canvas.getActiveObject().type });
})()`));
console.log('\nselection:', setup.type, '  objects on canvas:', setup.objects);

/* ── 1. UNWRAPPED. Ten calls, no instrumentation anywhere near them. ─────────────────────────── */
async function runN(n) {
  const a = await metrics();
  const t0 = Date.now();
  const r = JSON.parse(await evalIn(`(function () {
    var runs = [];
    for (var i = 0; i < ${n}; i++) { var t0 = performance.now(); syncRightPanel(); runs.push(performance.now() - t0); }
    runs.sort(function (x, y) { return x - y; });
    return JSON.stringify({
      medianMs: Math.round(runs[Math.floor(runs.length / 2)] * 10) / 10,
      minMs: Math.round(runs[0] * 10) / 10,
      maxMs: Math.round(runs[runs.length - 1] * 10) / 10,
      sumMs: Math.round(runs.reduce(function (x, y) { return x + y; }, 0) * 10) / 10
    });
  })()`));
  return { r, d: diffOf(a, await metrics()), wall: Date.now() - t0 };
}

console.log('\nUNWRAPPED - ' + 10 + ' syncRightPanel calls, no instrumentation');
const plain = await runN(10);
line('ten calls', plain.d, plain.wall);
console.log('  caller clock: median ' + plain.r.medianMs + ' ms, min ' + plain.r.minMs + ', max ' + plain.r.maxMs + ', sum ' + plain.r.sumMs);

/* ── 2. WRAPPED. The same ten calls with every delegate timed. ───────────────────────────────── */
const install = await evalIn(`(function () {
  var names = ${JSON.stringify(DELEGATES)};
  var P = window.__rpProf = { total: {}, self: {}, calls: {}, stack: [], absent: [], wrapped: [] };
  function record(n, dur, self) {
    P.total[n] = (P.total[n] || 0) + dur;
    P.self[n] = (P.self[n] || 0) + self;
    P.calls[n] = (P.calls[n] || 0) + 1;
  }
  function wrap(get, set, n) {
    var f = get();
    if (typeof f !== 'function') { P.absent.push(n); return; }
    if (f.__rpWrapped) { P.wrapped.push(n); return; }
    var w = function () {
      var frame = { t: performance.now(), child: 0 };
      P.stack.push(frame);
      try { return f.apply(this, arguments); }
      finally {
        P.stack.pop();
        var dur = performance.now() - frame.t;
        if (P.stack.length) P.stack[P.stack.length - 1].child += dur;
        record(n, dur, dur - frame.child);
      }
    };
    w.__rpWrapped = true; w.__rpOriginal = f;
    set(w); P.wrapped.push(n);
  }
  names.forEach(function (n) { wrap(function () { return window[n]; }, function (v) { window[n] = v; }, n); });
  /* VEItemProps.sync is a method, not a global, and it runs LAST inside syncRightPanel on purpose -
     it borrows whatever the sections above just decided to show. It has to be in the table. */
  if (window.VEItemProps && typeof VEItemProps.sync === 'function') {
    wrap(function () { return VEItemProps.sync; }, function (v) { VEItemProps.sync = v; }, 'VEItemProps.sync');
  } else { P.absent.push('VEItemProps.sync'); }
  P.stack.length = 0; P.total = {}; P.self = {}; P.calls = {};
  return JSON.stringify({ wrapped: P.wrapped.length, absent: P.absent });
})()`);
console.log('\nWRAPPED - instrumented:', install);
const wrapped = await runN(10);
line('ten calls', wrapped.d, wrapped.wall);
console.log('  caller clock: median ' + wrapped.r.medianMs + ' ms, min ' + wrapped.r.minMs + ', max ' + wrapped.r.maxMs + ', sum ' + wrapped.r.sumMs);

const breakdown = JSON.parse(await evalIn('JSON.stringify({ total: __rpProf.total, self: __rpProf.self, calls: __rpProf.calls })'));
const rows = Object.keys(breakdown.self)
  .map((n) => ({ n, self: breakdown.self[n], total: breakdown.total[n], calls: breakdown.calls[n] }))
  .filter((r) => r.n !== 'syncRightPanel' && r.total >= 0.05)
  .sort((a, b) => b.self - a.self);
console.log('\n  ' + 'delegate'.padEnd(24) + 'self ms'.padStart(9) + 'total ms'.padStart(10) + 'calls'.padStart(7));
for (const r of rows) console.log('  ' + r.n.padEnd(24) + r.self.toFixed(1).padStart(9) + r.total.toFixed(1).padStart(10) + String(r.calls).padStart(7));
console.log('  ' + '(syncRightPanel itself)'.padEnd(24) + (breakdown.self.syncRightPanel || 0).toFixed(1).padStart(9));
console.log('  ' + '(syncRightPanel total)'.padEnd(24) + (breakdown.total.syncRightPanel || 0).toFixed(1).padStart(9) +
  '   over ' + (breakdown.calls.syncRightPanel || 0) + ' calls');

/* ── 2b. The sampling profiler, because a hand-written wrapper only sees the functions somebody
   thought to name. The delegates above sum to a few ms while the body of syncRightPanel keeps
   hundreds, so the expensive call is one nobody listed. This names it. ─────────────────────────── */
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 100 });   // microseconds
await send('Profiler.start');
await evalIn('(function () { for (var i = 0; i < 10; i++) syncRightPanel(); return 1; })()');
const prof = (await send('Profiler.stop')).result?.profile;

{
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const deltas = prof.timeDeltas || [];
  prof.samples.forEach((sid, i) => self.set(sid, (self.get(sid) || 0) + (deltas[i] || 0)));
  const rows = [...self.entries()].map(([sid, us]) => {
    const n = byId.get(sid); const f = n?.callFrame || {};
    const file = (f.url || '').split('/').slice(-1)[0] || '(no file)';
    return { name: f.functionName || '(anonymous)', where: file + ':' + ((f.lineNumber ?? -1) + 1), ms: us / 1000 };
  }).filter((r) => r.ms >= 1).sort((a, b) => b.ms - a.ms).slice(0, 14);
  const total = [...self.values()].reduce((a, b) => a + b, 0) / 1000;
  console.log('\nSAMPLING PROFILER - ten syncRightPanel calls, ' + Math.round(total) + ' ms of samples');
  console.log('  ' + 'function'.padEnd(30) + 'where'.padEnd(34) + 'self ms'.padStart(9));
  for (const r of rows) console.log('  ' + r.name.slice(0, 29).padEnd(30) + r.where.slice(0, 33).padEnd(34) + r.ms.toFixed(1).padStart(9));
}

/* ── 3. What one sync costs all the way to a painted frame, which is what a person feels. ────── */
const frame = JSON.parse(await evalIn(`(function () {
  return new Promise(function (resolve) {
    var t0 = performance.now();
    syncRightPanel();
    var afterCall = performance.now() - t0;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        resolve(JSON.stringify({
          callMs: Math.round(afterCall * 10) / 10,
          toPaintedFrameMs: Math.round((performance.now() - t0) * 10) / 10
        }));
      });
    });
  });
})()`));
console.log('\none sync: call ' + frame.callMs + ' ms, to the next painted frame ' + frame.toPaintedFrameMs + ' ms');

await evalIn('(function(){ if (window.__rpTb) { canvas.remove(__rpTb); window.__rpTb = null; canvas.requestRenderAll(); } return 1; })()');
ws.close();
child.kill();
