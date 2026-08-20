/* Open the real build and photograph the registration wizard, pointed at the LIVE endpoint.
 *
 * `window.CC_API_BASE` is injected before any page script (CDP's addScriptToEvaluateOnNewDocument),
 * which is the documented override in core/edition.js. Without it a double-clicked file would ask
 * the production host, which is not what is being tested here.
 *
 *   node tools/_register-wizard-shot.mjs [http://localhost:3000]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', 'index.html');
const API = process.argv[2] || 'http://localhost:3000';
const PORT = 9541;

function chromium() {
  if (process.env.CC_CHROME && existsSync(process.env.CC_CHROME)) return process.env.CC_CHROME;
  const root = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) for (const s of ['chrome-win64', 'chrome-win']) {
    const exe = join(root, d, s, 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('no chromium');
}

const profile = mkdtempSync(join(tmpdir(), 'cc-rw-'));
const child = spawn(chromium(), [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=1280,860', '--hide-scrollbars',
  /* The page is a file:// origin, so its requests to localhost are cross-origin. The route sends
     Access-Control-Allow-Origin: *, which is what makes this work in the real product too; this
     flag is NOT used to paper over a CORS mistake, and the proof would fail without the header. */
  '--host-resolver-rules=MAP localhost 127.0.0.1',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let err = '';
child.stderr.on('data', (d) => { err += String(d); });

async function json(path, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('devtools silent\n' + err.slice(-400));
}
await json('/json/version');

const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
  }
};
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval threw: ' + r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.CC_API_BASE=${JSON.stringify(API)};` });
await send('Page.navigate', { url: pathToFileURL(INDEX).href });
await new Promise((r) => setTimeout(r, 12000));

const shots = [];
async function shoot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(HERE, '..', 'dist', name);
  writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  shots.push(name);
}

const first = await evaluate(`JSON.stringify(window.CCRegisterWizard ? CCRegisterWizard._state() : null)`);
await shoot('rw-1.png');

/* Answer the first step and walk to the next, the way a person does, so the picture is of a real
   second screen rather than an empty one. */
/* Type the way a person does: set the value AND fire `input`, because that is what re-evaluates the
   Next button. The first version of this probe only set `.value`, the button stayed disabled and the
   click did nothing, which is how the missing input listener was found. */
await evaluate(`(async () => {
  const set = (k, v) => {
    const el = document.querySelector('[data-rw-field="' + k + '"]');
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  const ok = {
    firstName: set('firstName', 'Muhammet'),
    lastName: set('lastName', 'Kara'),
    email: set('email', 'ornek@eposta.com')
  };
  /* The terms box is REQUIRED, so Next stays disabled until it is ticked. Doing it here is also the
     assertion: if this line is removed and the walk still advances, the required-checkbox gate is
     broken and nobody would be accepting anything. */
  const terms = document.querySelector('[data-rw-field="terms"]');
  ok.termsFound = !!terms;
  ok.blockedBeforeTerms = document.querySelector('[data-rw="next"]').disabled;
  if (terms) { terms.checked = true; terms.dispatchEvent(new Event('change', { bubbles: true })); }
  const btn = document.querySelector('[data-rw="next"]');
  ok.nextEnabled = !btn.disabled;
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  return JSON.stringify(ok);
})()`);
const second = await evaluate(`JSON.stringify(CCRegisterWizard._state())`);
await shoot('rw-2.png');

await evaluate(`(async () => {
  const opt = document.querySelector('[data-rw-opt]');
  if (opt) opt.click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('[data-rw="next"]').click();
  await new Promise(r => setTimeout(r, 400));
  return true;
})()`);
const third = await evaluate(`JSON.stringify(CCRegisterWizard._state())`);
await shoot('rw-3.png');

console.log(JSON.stringify({
  api: API, shots,
  step1: JSON.parse(first), step2: JSON.parse(second), step3: JSON.parse(third),
  pageErrors: errors.slice(0, 5)
}, null, 1));

ws.close();
child.kill();
