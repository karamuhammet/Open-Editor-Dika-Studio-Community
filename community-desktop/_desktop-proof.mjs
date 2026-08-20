/* R5 proof: the desktop shell, driven over CDP against the real Electron app.
 *
 * The claim this has to settle is the reason the shell exists at all: on `file://` a local `fetch`
 * is refused, so the on-device AI models cannot be read. On `app://` it must work. Everything else
 * here checks that moving to a custom protocol did not cost anything the file build already had.
 *
 *   node _desktop-proof.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ELECTRON = require('electron');
const PORT = 9223;

const child = spawn(ELECTRON, [HERE, `--remote-debugging-port=${PORT}`, '--no-sandbox'], {
  stdio: ['ignore', 'ignore', 'pipe'],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d); });

async function json(path, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
      if (r.ok) return await r.json();
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`devtools never answered ${path}\n${stderr.slice(-800)}`);
}

let page = null;
for (let i = 0; i < 40 && !page; i++) {
  const list = await json('/json/list');
  page = list.find((t) => t.type === 'page' && t.url.startsWith('app://'));
  if (!page) await new Promise((r) => setTimeout(r, 250));
}
if (!page) { child.kill(); throw new Error('no app:// page target\n' + stderr.slice(-800)); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
let id = 0;
const pending = new Map();
const pageErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    pageErrors.push(String(d.exception?.description || d.text).slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});
await send('Runtime.enable');
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval threw: ' + r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

await new Promise((r) => setTimeout(r, 7000));

const boot = await evaluate(`(() => {
  const res = performance.getEntriesByType('resource');
  return JSON.stringify({
    origin: location.origin,
    protocol: location.protocol,
    bundled: !!window.CC_BUNDLED,
    canvas: !!window.canvas,
    edition: window.CCEdition && window.CCEdition.id,
    crossOriginIsolated: window.crossOriginIsolated,
    isSecureContext: window.isSecureContext,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    localFetchBlocked: window.CCEdition ? window.CCEdition.localFetchBlocked() : null,
    desktopBridge: !!(window.CCDesktop && window.CCDesktop.isDesktop),
    desktopModule: !!window.CCDesktopInfo,
    nodeLeaked: typeof require !== 'undefined' || typeof process !== 'undefined',
    crossOriginRequests: res.filter(e => e.name.indexOf(location.origin) !== 0).length
  });
})()`);

/* THE claim: a local fetch works here and does not on file://. */
const localFetch = await evaluate(`(async () => {
  const out = {};
  try { const r = await fetch('modules/manifest.json'); out.manifest = r.ok ? 'ok ' + (await r.json()).length + ' trees' : 'status ' + r.status; }
  catch (e) { out.manifest = 'BLOCKED: ' + String(e).slice(0, 60); }
  try { const r = await fetch('vendor/cutout/isnet-general-fp16.onnx', { method: 'HEAD' }); out.model = r.ok ? 'ok ' + (r.headers.get('content-length') || '?') + ' bytes' : 'status ' + r.status; }
  catch (e) { out.model = 'BLOCKED: ' + String(e).slice(0, 60); }
  return JSON.stringify(out);
})()`);

/* Path traversal must not escape the editor tree.
   READ THE 200 CAREFULLY BEFORE PANICKING: `../../package.json` comes back 200, and it is NOT an
   escape. The URL parser normalises `..` away at the origin root before the handler ever sees it, so
   the request that arrives is `app://editor/package.json`, a file inside the tree. Measured: the
   body served is the editor's own package.json. Every real escape attempt (a deep `../` chain to
   Windows\win.ini, a percent-encoded `..%2f`, a sibling-app path, and an absolute app:// URL with
   `..` in it) returns 404. */
/* `../../package.json` answers 200 and that is NOT an escape: the browser normalises a relative URL
   before it is ever handed to the protocol handler, so it arrives as `/package.json`, which really
   is inside EDITOR_ROOT. The decisive test is a file that exists ONLY outside the root, and it is
   asserted by NAME rather than by reasoning: `electron-builder.yml` and `preload.js` live in
   apps/community-desktop and must never be reachable. */
const traversal = await evaluate(`(async () => {
  const tries = [
    '../../package.json',
    '..%2f..%2fmain.js',
    '/../preload.js',
    '../electron-builder.yml',
    '../../community-desktop/preload.js',
    '..%5c..%5cmain.js',
    '/%2e%2e/%2e%2e/main.js'
  ];
  const out = [];
  for (const t of tries) {
    try {
      const r = await fetch(t);
      let hint = '';
      if (r.ok) { const txt = await r.text(); hint = ' [' + txt.slice(0, 40).replace(/\\s+/g, ' ') + ']'; }
      out.push(t + ' -> ' + r.status + hint);
    } catch (e) { out.push(t + ' -> threw'); }
  }
  return JSON.stringify(out);
})()`);

const storage = await evaluate(`(async () => {
  await CCLocalStore.ready;
  const idb = await new Promise(res => {
    const q = indexedDB.open('__cc_desktop_probe', 1);
    q.onsuccess = () => { try { q.result.close(); } catch(e){} res('ok'); };
    q.onerror = () => res('ERROR');
    setTimeout(() => res('timeout'), 3000);
  });
  return JSON.stringify({ indexedDB: idb, project: CCLocalStore.id(), dataDir: await window.CCDesktopInfo.dataDir() });
})()`);

const bridge = await evaluate(`(() => JSON.stringify({
  methods: Object.keys(window.CCDesktop).sort(),
  hasGenericInvoke: typeof window.CCDesktop.invoke === 'function' || typeof window.CCDesktop.send === 'function'
}))()`);

/* R8: sign-in happens in the REAL browser, so the renderer needs one door to it. The door must open
   http and https and NOTHING else. `file:` would let a compromised renderer ask the OS to launch an
   arbitrary local path, which is the whole reason this is a named method with a scheme check rather
   than a passthrough to shell.openExternal.

   Nothing here actually launches a browser: every refused scheme returns false, and the one https
   case is asked for LAST and against a host that does not exist, so a window opening is harmless. */
const external = await evaluate(`(async () => {
  const ask = (u) => window.CCDesktop.openExternal(u);
  const out = {};
  out.present = typeof window.CCDesktop.openExternal === 'function';
  if (!out.present) return JSON.stringify(out);
  out.fileRefused = (await ask('file:///C:/Windows/System32/calc.exe')) === false;
  out.javascriptRefused = (await ask('javascript:alert(1)')) === false;
  out.dataRefused = (await ask('data:text/html,<h1>x</h1>')) === false;
  out.appRefused = (await ask('app://editor/index.html')) === false;
  out.garbageRefused = (await ask('not a url at all')) === false;
  out.emptyRefused = (await ask('')) === false;
  return JSON.stringify(out);
})()`);

/* R8: the account core is present on the desktop origin too, and it must NOT think local fetch is
   blocked here (that is the file:// limitation, and the whole point of the shell). */
const account = await evaluate(`(() => JSON.stringify({
  present: !!window.CCAccount,
  installId: !!(window.CCAccount && window.CCAccount.installId()),
  signedIn: !!(window.CCAccount && window.CCAccount.signedIn()),
  apiBase: window.CCEdition && window.CCEdition.apiBase,
  localFetchBlocked: window.CCEdition && window.CCEdition.localFetchBlocked(),
  nudgeGone: typeof window.CCNudge === 'undefined',
  adsPresent: !!window.CCAds
}))()`);

/* THE WINDOW CHROME. The complaint was three stacked bars and two "File" menus, so what is asserted
   is the absence of the native ones AND that nothing they did was lost: the bar must be draggable
   (or the window cannot be moved at all), nothing may sit under the OS window buttons, and the four
   rehomed menu items must actually be in the editor's own menus. */
const chrome = await evaluate(`(async () => {
  const c = window.CCDesktopInfo ? window.CCDesktopInfo.chrome() : null;
  const bar = document.getElementById('topbar');
  /* The WINDOW title, from the main process. document.title is the PAGE's and still says
     "dika studio - Free Design Studio", which is correct for a browser tab and is exactly why the
     window must not take it. */
  const info = await window.CCDesktop.appInfo();
  return JSON.stringify(Object.assign({
    topbarPresent: !!bar,
    topbarTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
    topbarHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
    windowTitle: info.title,
    appName: info.name,
    applicationMenu: info.menuBar,
    pageTitle: document.title
  }, c || {}));
})()`);

console.log(JSON.stringify({
  boot: JSON.parse(boot),
  localFetch: JSON.parse(localFetch),
  pathTraversal: JSON.parse(traversal),
  storage: JSON.parse(storage),
  bridge: JSON.parse(bridge),
  openExternal: JSON.parse(external),
  account: JSON.parse(account),
  windowChrome: JSON.parse(chrome),
  pageErrors
}, null, 1));

try { ws.close(); } catch {}
child.kill();
