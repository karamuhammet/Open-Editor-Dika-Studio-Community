/* THE VENDORED LIBRARIES ACTUALLY LOAD, from disk, with the network switched off.
 *
 * Moving six libraries off two CDNs is a one-line edit per call site, and every one of those lines is
 * a path that a source scan cannot check. A typo reads green everywhere and fails on the click that
 * needs it - which is exactly the failure being fixed here, only harder to notice, because the CDN
 * version at least worked when you were online.
 *
 * So this opens the real page, blocks the network at the browser, asks `cc.requireLib` for each
 * allowlisted path, and asserts the library's own global actually appears.
 *
 *   node tools/_vendored-libs-proof.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DESKTOP = join(dirname(ROOT), 'community-desktop');
const ELECTRON = join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(ELECTRON)) throw new Error('electron not installed: ' + ELECTRON);

let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };

/* The allowlist IS the list under test: reading it from the source rather than repeating it here is
   what makes a newly added library covered without anybody remembering to add it. */
const loader = readFileSync(join(ROOT, 'core', 'loader.js'), 'utf8');
const block = loader.match(/var LIB_INTEGRITY = \{([\s\S]*?)\n {2}\};/);
if (!block) throw new Error('core/loader.js has no LIB_INTEGRITY block');
const paths = [...block[1].matchAll(/'([^']+)':/g)].map((m) => m[1]);

console.log('the allowlist');
const remote = paths.filter((p) => /^https?:/.test(p));
if (remote.length === 0) ok('every entry is a local path', paths.length + ' libraries');
else for (const r of remote) bad('still points at a CDN', r);
for (const p of paths) {
  if (existsSync(join(ROOT, p))) continue;
  bad('allowlisted but NOT on disk', p);
}
if (paths.every((p) => existsSync(join(ROOT, p)))) ok('every allowlisted file exists on disk');

const PORT = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const child = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });

try {
  let page = null;
  for (let i = 0; i < 120 && !page; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (r.ok) page = (await r.json()).find((t) => t.type === 'page');
    } catch { /* booting */ }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable');
  await send('Network.enable');
  const evalIn = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'threw');
    return r.result?.result?.value;
  };
  for (let i = 0; i < 240; i++) {
    if (await evalIn('!!(window.cc && window.cc.requireLib && window.canvas)').catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  /* THE NETWORK IS BLOCKED FIRST. Loading from disk while the internet is available proves nothing:
     a leftover CDN path would still work and the whole point is what happens when it cannot. */
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  ok('every http(s) request is now blocked at the browser');

  console.log('\nloading each one with the network off');
  const EXPECT = {
    'js/vendor/chart.umd.min.js': 'Chart',
    'js/vendor/bwip-js-min.js': 'bwipjs',
    'js/vendor/exceljs.min.js': 'ExcelJS',
    'js/vendor/ag-psd-bundle.js': 'agPsd',
    'js/vendor/pptxgen.bundle.js': 'PptxGenJS',
    'js/vendor/pdf.min.js': 'pdfjsLib',
    'js/vendor/jspdf.umd.min.js': 'jspdf',
    'js/vendor/opentype.min.js': 'opentype',
  };
  for (const p of paths) {
    if (/worker/.test(p)) {
      /* The pdf.js worker is never loaded as a page script: it is handed to the library as a path.
         Asserting the FILE is reachable is the honest test for it. */
      const okFetch = await evalIn(`fetch(${JSON.stringify(p)}).then(function (r) { return r.ok; }).catch(function () { return false; })`);
      if (okFetch) ok('reachable from the page (used as a worker path)', p);
      else bad('the worker file is not reachable', p);
      continue;
    }
    const g = EXPECT[p];
    const res = await evalIn(
      `cc.requireLib(${JSON.stringify(p)}).then(function () { return ${JSON.stringify(g || '')} ? (typeof window[${JSON.stringify(g)}] !== 'undefined' ? 'global' : 'loaded-no-global') : 'loaded'; })`
      + `.catch(function (e) { return 'ERROR: ' + String(e && e.message || e).slice(0, 80); })`);
    if (res === 'global') ok('loads from disk and defines its global', p + '  ->  window.' + g);
    else if (res === 'loaded') ok('loads from disk', p);
    else bad('did NOT load with the network off', p + '  ' + res);
  }

  /* And the emoji panel, which was 222 CDN images. */
  const emoji = await evalIn(
    `fetch('js/vendor/twemoji/1f600.svg').then(function (r) { return r.ok ? 'ok' : 'HTTP ' + r.status; }).catch(function (e) { return 'ERROR'; })`);
  if (emoji === 'ok') ok('an emoji renders from disk', 'js/vendor/twemoji/1f600.svg');
  else bad('the emoji set is not reachable', String(emoji));

  ws.close();
} finally {
  child.kill();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
