/* R6 proof: the PACKAGED app, not the development tree.
 *
 * A build that produces a file is not a build that produces a working app. This drives
 * `dist/win-unpacked/dika studio Community Editor.exe` over CDP and asserts the same things
 * `_desktop-proof.mjs` asserts in development: the custom protocol is serving, a local fetch works
 * (the whole reason the shell exists), storage is real, and nothing leaked into the renderer.
 *
 *   node _packaged-proof.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* DERIVED from productName, never typed in. It was hard-coded as "dika studio Community Editor.exe"
   and the rename to `dika` turned this proof into "Not packaged yet" against a package that had
   just built successfully: a proof that reports the wrong reason is worse than one that fails. */
const PRODUCT = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).productName;
const EXE = join(HERE, 'dist', 'win-unpacked', PRODUCT + '.exe');
const PORT = 9227;

if (!existsSync(EXE)) {
  console.error('Not packaged yet. Run: npx --no-install electron-builder --win nsis');
  process.exit(2);
}

const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--no-sandbox'], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d); });

async function json(path, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); }
    catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`devtools never answered ${path}\n${stderr.slice(-600)}`);
}

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  target = (await json('/json/list')).find((t) => t.type === 'page' && t.url.startsWith('app://'));
  if (!target) await new Promise((r) => setTimeout(r, 250));
}
if (!target) { child.kill(); throw new Error('no app:// page\n' + stderr.slice(-600)); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
let id = 0;
const pending = new Map();
const pageErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});
await send('Runtime.enable');
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval threw: ' + r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

await new Promise((r) => setTimeout(r, 9000));

const out = await evaluate(`(async () => {
  const res = performance.getEntriesByType('resource');
  const probe = async (u, init) => { try { const r = await fetch(u, init); return r.ok ? 'ok' : ('status ' + r.status); } catch (e) { return 'BLOCKED'; } };
  return JSON.stringify({
    origin: location.origin,
    bundled: !!window.CC_BUNDLED,
    canvas: !!window.canvas,
    edition: window.CCEdition && window.CCEdition.id,
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    localFetchBlocked: window.CCEdition ? window.CCEdition.localFetchBlocked() : null,
    nodeLeaked: typeof require !== 'undefined' || typeof process !== 'undefined',
    bridgeMethods: window.CCDesktop ? Object.keys(window.CCDesktop).length : 0,
    genericInvoke: !!(window.CCDesktop && (window.CCDesktop.invoke || window.CCDesktop.send)),
    crossOriginRequests: res.filter(e => e.name.indexOf(location.origin) !== 0).length,
    /* WHICH ones, in the shipped artifact. A count is not an audit: after R8 this build is allowed
       to talk to app.dika.studio and to nothing else, and only the list can show that. */
    crossOriginPaths: res.map(e => e.name).filter(n => n.indexOf(location.origin) !== 0),
    manifest: await probe('modules/manifest.json'),
    model: await probe('vendor/cutout/isnet-general-fp16.onnx', { method: 'HEAD' }),
    devPageGone: await probe('index.dev.html'),
    toolsGone: await probe('tools/build-bundle.mjs'),
    dataDir: await window.CCDesktopInfo.dataDir(),
    /* The chrome, in the SHIPPED app rather than in a dev run: no native menu, the editor's own bar
       at y=0, the window named for the brand, and a clear strip where Windows draws its buttons. */
    appInfo: await window.CCDesktop.appInfo(),
    chrome: window.CCDesktopInfo.chrome(),
    topbarTop: Math.round(document.getElementById('topbar').getBoundingClientRect().top)
  });
})()`);

console.log(JSON.stringify({ exe: EXE, result: JSON.parse(out), pageErrors }, null, 1));
try { ws.close(); } catch {}
child.kill();
