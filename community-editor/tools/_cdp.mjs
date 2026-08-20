/* A dependency-free Chrome DevTools Protocol driver, so this build can be tested WHERE IT RUNS:
 * a double-clicked `index.html`, no server anywhere.
 *
 * Why it exists: the repo's playwright install is shared and disappeared mid-session, and the
 * in-app browser pane renders a file:// page as a static snapshot rather than running it. Both are
 * tooling problems, and neither is a reason to test the build over http and call it proof. This
 * needs nothing but Node and the chromium already on disk.
 *
 * It deliberately does NOT pass --allow-file-access-from-files: that flag would hand the page
 * powers a real user does not have, and the whole point is to measure what actually happens when
 * somebody opens the file.
 *
 *   import { openFile } from './_cdp.mjs';
 *   const page = await openFile('D:/.../index.html');
 *   const value = await page.eval(`document.title`);
 *   await page.close();
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MS_PLAYWRIGHT = join(process.env.LOCALAPPDATA || '', 'ms-playwright');

export function findChromium() {
  if (process.env.CC_CHROME && existsSync(process.env.CC_CHROME)) return process.env.CC_CHROME;
  if (!existsSync(MS_PLAYWRIGHT)) return null;
  const dirs = readdirSync(MS_PLAYWRIGHT)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const exe = join(MS_PLAYWRIGHT, d, sub, 'chrome.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

async function httpJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* the browser is still coming up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('DevTools endpoint never answered: ' + url);
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

export async function openFile(filePath, opts = {}) {
  const exe = findChromium();
  if (!exe) throw new Error('No chromium found. Set CC_CHROME to a chrome.exe.');
  const port = opts.port || await findFreePort();
  const profile = mkdtempSync(join(tmpdir(), 'cc-cdp-'));
  const url = filePath.startsWith('file:') ? filePath : pathToFileURL(filePath).href;

  /* --no-sandbox: this chromium lives under LOCALAPPDATA and the Windows sandbox cannot read its own
     executable there ("Sandbox cannot access executable ... Erisim engellendi"). It is a test
     harness driving a local file, not a browser for untrusted pages. */
  const child = spawn(exe, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--window-size=1440,900',
    url
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += String(d); });
  child.on('exit', (code) => { if (code) stderr += '\n[chrome exited ' + code + ']'; });

  /* Wait on /json/version first: it answers as soon as DevTools is up, while /json/list can be empty
     for a moment. A failure here should say what chrome printed, not just "never answered". */
  try {
    await httpJson('http://127.0.0.1:' + port + '/json/version');
  } catch (e) {
    child.kill();
    throw new Error(e.message + (stderr ? '\nchrome said: ' + stderr.slice(-600) : ''));
  }
  let targets = [];
  let pageTarget = null;
  for (let i = 0; i < 60 && !pageTarget; i++) {
    try { targets = await httpJson('http://127.0.0.1:' + port + '/json/list', 1); } catch {}
    pageTarget = targets.find((t) => t.type === 'page' && t.url.startsWith('file:'))
      || targets.find((t) => t.type === 'page');
    if (!pageTarget) await new Promise((r) => setTimeout(r, 100));
  }
  if (!pageTarget) { child.kill(); throw new Error('no page target'); }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const pageErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(String(d.exception?.description || d.text).slice(0, 240));
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');

  return {
    consoleErrors, pageErrors, url,
    async eval(expression) {
      const r = await send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, userGesture: true
      });
      const d = r.result?.exceptionDetails;
      if (d) throw new Error('eval threw: ' + (d.exception?.description || d.text));
      return r.result?.result?.value;
    },
    async close() { try { ws.close(); } catch {} child.kill(); }
  };
}
