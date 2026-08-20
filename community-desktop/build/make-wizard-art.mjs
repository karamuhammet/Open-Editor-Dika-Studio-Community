/* The ONE image the installer needs: the dika mark.
 *
 * ── WHY THIS FILE SHRANK FROM THREE FULL-WINDOW PAGES TO ONE 44x25 MARK ─────────────────────────
 * The first version painted each installer page as a complete 497x361 bitmap, text and buttons
 * included, and put invisible click targets on top. Three things were wrong with that, and all three
 * were visible on screen:
 *
 *   1. BAKED TEXT IS DEAD TEXT. It cannot say which file is being copied, it cannot be translated,
 *      and on a 125% display Windows scales the dialog while the picture stays 497 wide, so the
 *      layout tears. Real STATIC controls scale with the system font and stay sharp.
 *   2. A PICTURE OF A BUTTON HAS NO STATES. No hover, no pressed, no focus ring. It reads as a
 *      screenshot of an installer rather than an installer.
 *   3. THERE WAS NO REAL PROGRESS BAR. NSIS owns one; a painted rectangle can only lie about it.
 *
 * So the pages are now built out of real Win32 controls in build/installer.nsh, and the only thing
 * that genuinely has to be an image is the brand mark, because it is a shape rather than a glyph.
 *
 * Drawn at exactly the size it is displayed at (44x25) and NOT stretched: a static blits a bitmap
 * with COLORONCOLOR, which drops whole pixel rows when it scales, and a smeared logo is worse than a
 * logo that stays 44 wide on a 125% display.
 *
 * BMP, not PNG: NSIS cannot load a PNG. 24-bit, bottom-up, rows padded to 4 bytes; get any one of
 * those wrong and NSIS ignores the file in silence. There is no alpha channel in a 24-bit BMP, so
 * the mark is drawn ON the installer's own background colour and the control that holds it is given
 * the same colour, which is what makes the seam invisible.
 *
 *   node build/make-wizard-art.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* MUST MATCH `CC_BG` in build/installer.nsh. The mark has no transparency, so this colour is what
   surrounds it, and a mismatch draws a visible rectangle around the logo. */
const BG = '#16161b';
const W = 44, H = 25;

function chromium() {
  if (process.env.CC_CHROME && existsSync(process.env.CC_CHROME)) return process.env.CC_CHROME;
  const root = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) for (const s of ['chrome-win64', 'chrome-win']) {
    const exe = join(root, d, s, 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('no chromium; set CC_CHROME');
}

/* Copied verbatim from build/icon.svg, which copied it verbatim from the editor's dika-logo.svg.
   Never redrawn by hand: an approximation of a brand mark is a different mark. */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 161 93" width="${W}" height="${H}">
  <g transform="translate(-0.132812 -37.394531)">
    <path fill="#f2ff58" fill-rule="evenodd" d="M 0.132812 81.796875 L 160.550781 37.394531 L 110.550781 129.976562 L 64.457031 99.117188 L 160.316406 37.550781 L 59.117188 98.074219 L 52.867188 129.195312 L 40.628906 94.816406 L 160.300781 37.542969 L 38.414062 92.476562 Z M 0.132812 81.796875 "/>
    <path fill="#f2ff58" fill-rule="evenodd" d="M 55.980469 129.890625 L 76.605469 111.109375 L 63.347656 101.351562 Z M 55.980469 129.890625 "/>
  </g>
</svg>`;

function page() {
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:${BG}}canvas{display:block}</style>
<canvas id="a" width="${W}" height="${H}"></canvas>
<script>
window.__draw = function(){
  return new Promise(function(resolve){
    var x = document.getElementById('a').getContext('2d');
    x.fillStyle = ${JSON.stringify(BG)};
    x.fillRect(0, 0, ${W}, ${H});
    var i = new Image();
    i.onload = function(){
      x.drawImage(i, 0, 0, ${W}, ${H});
      var d = x.getImageData(0, 0, ${W}, ${H}).data, bin = '';
      for (var n = 0; n < d.length; n++) bin += String.fromCharCode(d[n]);
      resolve(btoa(bin));
    };
    i.onerror = function(){ resolve(''); };
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(MARK)});
  });
};
</script>`;
}

function bmp24(rgba, w, h) {
  const rowRaw = w * 3;
  const row = rowRaw + ((4 - (rowRaw % 4)) % 4);
  const size = 54 + row * h;
  const b = Buffer.alloc(size);
  b.write('BM', 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    let o = 54 + y * row;
    for (let x = 0; x < w; x++) {
      const p = src + x * 4;
      b[o++] = rgba[p + 2]; b[o++] = rgba[p + 1]; b[o++] = rgba[p];
    }
  }
  return b;
}

const profile = mkdtempSync(join(tmpdir(), 'cc-wiz-'));
const PORT = 9661;
const child = spawn(chromium(), [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank',
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
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(page()) });
await new Promise((r) => setTimeout(r, 900));
const r = await send('Runtime.evaluate', { expression: 'window.__draw()', awaitPromise: true, returnByValue: true });
ws.close();
child.kill();

const b64 = r.result?.result?.value;
if (!b64) throw new Error('mark did not render');
const buf = bmp24(Buffer.from(b64, 'base64'), W, H);
writeFileSync(join(HERE, 'wizard-mark.bmp'), buf);

const ok = buf.toString('latin1', 0, 2) === 'BM'
  && buf.readInt32LE(18) === W && buf.readInt32LE(22) === H && buf.readUInt16LE(28) === 24;
console.log(JSON.stringify({ file: 'wizard-mark.bmp', size: `${W}x${H}`, bg: BG, bytes: buf.length, ok }, null, 1));
if (!ok) process.exit(1);
