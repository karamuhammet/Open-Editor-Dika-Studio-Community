/* Rasterise build/icon.svg into the two files electron-builder wants, with no image dependency:
 * the chromium already on this machine renders the SVG and CDP takes the picture.
 *
 * Why not a library: adding sharp or an SVG rasteriser to a desktop shell whose whole point is that
 * it ships a folder of static files means a native build step on every machine that touches this
 * repo. The browser is a correct SVG renderer and it is already here.
 *
 *   node build/make-icons.mjs
 *
 * Writes build/icon.png (512, what electron-builder reads) and build/icon.ico (a 256 PNG inside an
 * ICO container, which Windows Vista and later read natively).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG = readFileSync(join(HERE, 'icon.svg'), 'utf8');

function chromium() {
  if (process.env.CC_CHROME && existsSync(process.env.CC_CHROME)) return process.env.CC_CHROME;
  const root = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!existsSync(root)) throw new Error('no chromium; set CC_CHROME');
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) for (const s of ['chrome-win64', 'chrome-win']) {
    const exe = join(root, d, s, 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('no chromium; set CC_CHROME');
}

/* A page that is EXACTLY the icon and nothing else: no margin, no scrollbar, transparent behind it,
   so the screenshot needs no cropping and cannot pick up a stray white edge. */
function pageFor(size) {
  return '<!doctype html><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +
    'svg{display:block;width:' + size + 'px;height:' + size + 'px}</style>' + SVG;
}

const profile = mkdtempSync(join(tmpdir(), 'cc-icon-'));
const PORT = 9631;
const child = spawn(chromium(), [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--hide-scrollbars', '--default-background-color=00000000',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let err = '';
child.stderr.on('data', (d) => { err += String(d); });

async function json(path, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('devtools silent\n' + err.slice(-400));
}
await json('/json/version');

async function shoot(size) {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.enable');
  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(pageFor(size)) });
  await new Promise((r) => setTimeout(r, 900));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: size, height: size, scale: 1 }
  });
  ws.close();
  return Buffer.from(shot.result.data, 'base64');
}

const png512 = await shoot(512);
const png256 = await shoot(256);
writeFileSync(join(HERE, 'icon.png'), png512);

/* An ICO holding a single PNG. Windows Vista and later read this; it is the format electron-builder
   produces too. width/height bytes are 0, which the spec defines as 256. */
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png256.length, 8); entry.writeUInt32LE(22, 12);
writeFileSync(join(HERE, 'icon.ico'), Buffer.concat([dir, entry, png256]));

/* Assert rather than assume: a PNG signature, the IHDR dimensions, and that the image is not blank
   (a rasteriser that silently rendered nothing produces a valid, empty PNG). */
const sig = png512.subarray(0, 8).toString('hex');
const w = png512.readUInt32BE(16), h = png512.readUInt32BE(20);
console.log(JSON.stringify({
  png: 'build/icon.png', bytes: png512.length, width: w, height: h,
  signatureOk: sig === '89504e470d0a1a0a',
  ico: 'build/icon.ico', icoBytes: 22 + png256.length,
  looksDrawn: png512.length > 4000
}, null, 1));

child.kill();
if (!(w === 512 && h === 512 && png512.length > 4000)) process.exit(1);
