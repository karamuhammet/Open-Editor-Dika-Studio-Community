/* The update channel INSIDE the running app.
 *
 * Every other proof in this set checks a piece: the signature (openssl), the decisions (pure
 * functions), the endpoint (HTTP). This one boots the real Electron shell and asks the questions a
 * person's copy would ask, because three green unit proofs and a broken bridge is a channel that
 * silently never offers anything.
 *
 * What it asserts, and each one is a way this could be quietly dead:
 *   - the bridge exists and exposes exactly the methods the renderer is allowed to call
 *   - NONE of them can be handed a URL, a hash or a version: the arguments simply are not there
 *   - the module is in the shipped bundle (a module folder that is not bundled does not exist)
 *   - the state the renderer can see carries no secret and no URL
 *   - with no public key compiled in, the channel reports itself DISABLED rather than pretending
 *
 *   node build/_updater-runtime-proof.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = dirname(HERE);
const EDITOR = join(dirname(DESKTOP), 'community-editor');
const ELECTRON = join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(ELECTRON)) throw new Error('electron not installed: ' + ELECTRON);

let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };

/* ── before booting anything: is the module actually in what ships? ─────────────────────────────── */
const bundle = readFileSync(join(EDITOR, 'dist', 'modules.bundle.js'), 'utf8');
const bundleCss = readFileSync(join(EDITOR, 'dist', 'modules.bundle.css'), 'utf8');
console.log('the shipped bundle');
if (bundle.includes('cc-upd-wrap')) ok('carries the updater module'); else bad('the updater module is NOT bundled');
if (bundleCss.includes('.cc-upd')) ok('carries its stylesheet'); else bad('the updater stylesheet is NOT bundled');

const PORT = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
/* The shipped configuration: the real public key is compiled into updater.js, so this run proves the
   ENABLED path. The disabled path gets its own launch at the end, because with a key in the binary
   there is no longer any environment that produces it by accident. */
const child = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });

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
/* Wait for the MODULE, not for the shell. `CCDesktop` is set by preload before anything else exists,
   so waiting on it raced the bundle and this proof failed intermittently on a machine that was merely
   a little slower - which reads as "the module is broken" and is not. */
for (let i = 0; i < 240; i++) {
  if (await evalIn('!!(window.CCDesktop && window.canvas && window.CCUpdater)').catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}

console.log('\nthe bridge');
const bridge = JSON.parse(await evalIn(`JSON.stringify({
  present: !!(window.CCDesktop && window.CCDesktop.update),
  methods: window.CCDesktop && window.CCDesktop.update ? Object.keys(window.CCDesktop.update).sort() : [],
  /* The arity of each method IS the security property: a method that takes no argument cannot be
     handed a URL by a compromised page. */
  arity: window.CCDesktop && window.CCDesktop.update
    ? Object.keys(window.CCDesktop.update).sort().map(function (k) { return k + ':' + window.CCDesktop.update[k].length; })
    : [],
  moduleLoaded: !!window.CCUpdater
})`));
if (bridge.present) ok('CCDesktop.update exists'); else bad('the bridge is missing');
ok('methods', bridge.methods.join(', '));
const expected = ['check', 'checkNow', 'install', 'onProgress', 'openReleases', 'optOut', 'postpone', 'state'];
if (JSON.stringify(bridge.methods) === JSON.stringify(expected)) ok('exactly the eight allowed methods, no generic invoke');
else bad('the bridge surface changed', bridge.methods.join(',') + ' vs ' + expected.join(','));
if (bridge.moduleLoaded) ok('the renderer module loaded (window.CCUpdater)'); else bad('the module did not load');

/* install/postpone/checkNow take NOTHING. This is the assertion that would catch somebody "helpfully"
   letting the renderer pass a URL or a version later. */
const zeroArg = bridge.arity.filter((a) => /^(install|postpone|checkNow|state|openReleases):0$/.test(a));
if (zeroArg.length === 5) ok('install, postpone, checkNow, state and openReleases take no arguments at all', zeroArg.join(' '));
else bad('a method that must take nothing now takes something', bridge.arity.join(' '));

console.log('\nthe state the renderer can see');
const st = JSON.parse(await evalIn('window.CCDesktop.update.state().then(function (s) { return JSON.stringify(s); })'));
ok('keys', Object.keys(st).join(', '));
if (st.enabled === true) ok('with the real key compiled in the channel is ENABLED');
else bad('the channel is disabled even though a key is compiled in', JSON.stringify(st));
/* THE PROPERTY IS NOT "no http", IT IS "nothing the MANIFEST CHOSE, and nothing that could be acted
   on". This assertion used to read `!includes('http')` and went red the day `releasePage` was added -
   correctly reporting a change and wrongly calling it a leak. `releasePage` is DERIVED (from the
   verified artifact URL, or the compiled-in fallback) and always lands on github.com/<owner>/<repo>
   /releases, and the renderer's `openReleases()` takes no argument, so it can be shown and never
   substituted. What must never appear here is the artifact URL, a hash, or key material. */
const stStr = JSON.stringify(st);
if (!('url' in st) && !/sha512|BEGIN [A-Z ]*KEY|releases\/download/.test(stStr)) {
  ok('it carries no download URL, no hash and no key');
} else bad('the state leaks something actionable', stStr.slice(0, 140));
if (!st.releasePage || /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases$/.test(st.releasePage)) {
  ok('its only link is a releases page on the pinned host', st.releasePage || '(none)');
} else bad('releasePage is not a pinned releases page', String(st.releasePage).slice(0, 120));
if (st.currentVersion) ok('it reports the version from the shell', st.currentVersion);
else bad('no version');

/* And a check with no key must produce nothing rather than an error the app has to handle. */
/* Nothing is published on this channel, so the endpoint answers 204 and the client must treat that as
   silence rather than as an error or an offer. */
const after = JSON.parse(await evalIn('window.CCDesktop.update.check(0).then(function (s) { return JSON.stringify(s); })'));
if (after.available === null) ok('with nothing published, a check offers nothing and says nothing');
else bad('something was offered that nobody published', String(after.available));

const inst = JSON.parse(await evalIn('window.CCDesktop.update.install().then(function (r) { return JSON.stringify(r); })'));
if (inst && inst.ok === false) ok('install refuses when there is nothing verified to install', inst.reason);
else bad('install did not refuse', JSON.stringify(inst));

ws.close();
child.kill();

/* ── the OFF switch, which needs its own process ────────────────────────────────────────────────
   With a real key compiled into the binary there is no longer an environment that produces the
   disabled state by accident, so it has to be asked for deliberately. An updater with no off switch
   in a source-available build is one patch away from being deleted by whoever dislikes it. */
console.log('\nthe off switch');
const PORT2 = await new Promise((res, rej) => {
  const s2 = createServer();
  s2.once('error', rej);
  s2.listen(0, '127.0.0.1', () => { const p = s2.address().port; s2.close(() => res(p)); });
});
const child2 = spawn(ELECTRON, ['.', '--no-update', '--remote-debugging-port=' + PORT2,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });
try {
  let page2 = null;
  for (let i = 0; i < 120 && !page2; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT2}/json/list`);
      if (r.ok) page2 = (await r.json()).find((t) => t.type === 'page');
    } catch { /* booting */ }
    if (!page2) await new Promise((r) => setTimeout(r, 500));
  }
  const ws2 = new WebSocket(page2.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws2.onopen = res; ws2.onerror = () => rej(new Error('ws2')); });
  let id2 = 0; const p2 = new Map();
  ws2.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && p2.has(m.id)) { p2.get(m.id)(m); p2.delete(m.id); } };
  const send2 = (method, params = {}) => new Promise((res) => { const n = ++id2; p2.set(n, res); ws2.send(JSON.stringify({ id: n, method, params })); });
  await send2('Runtime.enable');
  const ev2 = async (e) => {
    const r = await send2('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value;
  };
  for (let i = 0; i < 240; i++) {
    if (await ev2('!!(window.CCDesktop && window.CCUpdater)').catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const off = JSON.parse(await ev2('window.CCDesktop.update.state().then(function (s) { return JSON.stringify(s); })'));
  if (off.enabled === false) ok('--no-update reports the channel DISABLED');
  else bad('--no-update did not disable the channel', JSON.stringify(off));
  const offCheck = JSON.parse(await ev2('window.CCDesktop.update.check(0).then(function (s) { return JSON.stringify(s); })'));
  if (offCheck.available === null) ok('and a check through it offers nothing');
  else bad('a disabled channel still offered something');
  ws2.close();
} finally {
  child2.kill();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
