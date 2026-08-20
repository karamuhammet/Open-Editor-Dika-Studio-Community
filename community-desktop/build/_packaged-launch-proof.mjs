/* THE BUILT .exe OPENS, AND THE CHANNEL IS ALIVE INSIDE IT.
 *
 * Every other proof runs Electron over the SOURCE tree. That is the right thing for logic, and it is
 * blind to the one failure this build actually had: `updater.js` was not in electron-builder's
 * `files` list, so `main.js`'s `require('./updater')` would have thrown on launch and the shipped
 * application would not have opened at all. Source-green, package-dead.
 *
 * So this drives `dist/win-unpacked/dika.studio.exe` - the real binary a person downloads, running
 * out of its own asar - and asks it three things: did you open, is the editor there, is the update
 * bridge wired.
 *
 *   node build/_packaged-launch-proof.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP = dirname(dirname(fileURLToPath(import.meta.url)));
const EXE = join(DESKTOP, 'dist', 'win-unpacked', 'dika.studio.exe');
if (!existsSync(EXE)) throw new Error('not packaged yet: ' + EXE);

let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };

const PORT = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

/* stderr is captured, not discarded: "Cannot find module './updater'" is exactly the failure this
   proof exists to catch, and it arrives there rather than as a non-zero exit. */
let stderr = '';
const child = spawn(EXE, ['--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  { cwd: join(DESKTOP, 'dist', 'win-unpacked'), stdio: ['ignore', 'ignore', 'pipe'] });
child.stderr.on('data', (b) => { stderr += String(b); });
let exited = null;
child.on('exit', (code) => { exited = code; });

try {
  let page = null;
  for (let i = 0; i < 120 && !page && exited === null; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (r.ok) page = (await r.json()).find((t) => t.type === 'page');
    } catch { /* booting */ }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (exited !== null) {
    bad('THE PACKAGED APP DIED ON LAUNCH', 'exit ' + exited + '   ' + stderr.split('\n').slice(0, 3).join(' | ').slice(0, 200));
  } else if (!page) {
    bad('the packaged app opened no window in 60s');
  } else {
    ok('the packaged .exe opens a window');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    let id = 0; const pending = new Map();
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
    await send('Runtime.enable');
    const evalIn = async (e) => {
      const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
      return r.result?.result?.value;
    };
    for (let i = 0; i < 240; i++) {
      if (await evalIn('!!(window.CCDesktop && window.canvas && window.CCUpdater)').catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    const state = JSON.parse(await evalIn(`JSON.stringify({
      canvas: !!window.canvas,
      edition: window.CCEdition && window.CCEdition.id,
      bridge: !!(window.CCDesktop && window.CCDesktop.update),
      module: !!window.CCUpdater,
      errors: (window.__ccProofErrors || []).length
    })`));
    if (state.canvas) ok('the editor booted inside it', 'edition ' + state.edition);
    else bad('no canvas: the editor did not boot');
    if (state.bridge) ok('the update bridge is present - updater.js IS in the asar');
    else bad('no update bridge: updater.js did not ship, or main.js threw');
    if (state.module) ok('the renderer module loaded');
    else bad('the updater module is not in the shipped bundle');

    /* And the one call that proves the main process really loaded the module rather than exposing a
       stub: ask it for state, which only `updater.js` can answer. */
    const st = JSON.parse(await evalIn('window.CCDesktop.update.state().then(function (s) { return JSON.stringify(s); })'));
    if (st && st.enabled === true) ok('the channel reports itself ENABLED with the shipped key', 'v' + st.currentVersion);
    else bad('the channel is not enabled in the packaged build', JSON.stringify(st));
    /* Not "no http": `releasePage` is a derived, host-pinned releases link the notify-only path
       needs. What must never reach the renderer is the artifact URL, its hash, or key material. */
    const stStr = JSON.stringify(st);
    if (!/sha512|BEGIN [A-Z ]*KEY|releases\/download/.test(stStr)) ok('its state carries no download URL, no hash and no key');
    else bad('the state leaks something actionable', stStr.slice(0, 140));
    if (!st.releasePage || /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases$/.test(st.releasePage)) {
      ok('its only link is a releases page on the pinned host', st.releasePage || '(none)');
    } else bad('releasePage is not a pinned releases page', String(st.releasePage).slice(0, 120));

    ws.close();
  }
} finally {
  child.kill();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
