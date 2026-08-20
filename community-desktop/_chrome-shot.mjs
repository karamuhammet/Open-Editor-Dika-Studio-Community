/* A picture of the top of the window, because "the chrome is fixed" is a claim about how something
 * LOOKS and the numbers beside it only say where things are.
 *
 * It captures the WEB CONTENTS, so the OS-drawn minimise / maximise / close buttons are not in the
 * frame: they are painted by Windows over the top right, in the strip the proof measures as
 * `nothingUnderWindowButtons`. What this shows is the part we are responsible for: one bar at y=0,
 * one File menu, the dika mark, and nothing above it.
 *
 *   node _chrome-shot.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 9229;
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--no-install', 'electron', '.', `--remote-debugging-port=${PORT}`],
  { cwd: HERE, stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' });
let err = '';
child.stderr.on('data', (d) => { err += String(d); });

async function json(path, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('devtools silent\n' + err.slice(-400));
}

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await json('/json/list')).find((t) => t.type === 'page' && t.url.startsWith('app://')); } catch {}
  if (!target) await new Promise((r) => setTimeout(r, 250));
}
if (!target) { child.kill(); throw new Error('no app:// page'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
/* Let the editor boot AND the launch gate appear, then walk past it: the gate is a full-screen
   overlay and would be the only thing in the picture. */
await new Promise((r) => setTimeout(r, 11000));
await send('Runtime.evaluate', { expression: `(() => {
  const ov = document.querySelector('.cc-fr-ov');
  if (!ov) return 'no gate';
  for (let i = 0; i < 8; i++) {
    const n = document.querySelector('.cc-fr-ov [data-fr="next"]');
    if (!n) break;
    n.click();
  }
  return document.querySelector('.cc-fr-ov') ? 'still open' : 'walked past';
})()`, returnByValue: true });
await new Promise((r) => setTimeout(r, 1200));

/* The top strip only: this is about the chrome, not the canvas. */
const top = await send('Page.captureScreenshot', {
  format: 'png', clip: { x: 0, y: 0, width: 1440, height: 120, scale: 1 }
});
writeFileSync(join(HERE, 'dist', 'chrome-top.png'), Buffer.from(top.result.data, 'base64'));

const full = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(HERE, 'dist', 'chrome-full.png'), Buffer.from(full.result.data, 'base64'));

console.log('wrote dist/chrome-top.png and dist/chrome-full.png');
ws.close();
child.kill();
