/* The installer's own artwork, generated rather than hand-drawn in an image editor.
 *
 * The default NSIS one-click installer is a grey progress bar with a Windows title bar: it is the
 * first thing anybody sees of this product and it says nothing. electron-builder picks these two
 * files up automatically from `build/` when `oneClick: false`:
 *
 *   installerSidebar.bmp   164x314, shown on the WELCOME and FINISH pages (MUI_WELCOMEFINISHPAGE)
 *   installerHeader.bmp    150x57,  the strip at the top of every other page (MUI_HEADERIMAGE)
 *
 * BMP, not PNG: MUI2 will not load a PNG, and a missing or wrong-format file falls back to NSIS's
 * own blue "nsis3-metro" artwork without an error, which is the failure mode to watch for.
 *
 * WHY IT DRAWS ON A CANVAS AND READS RAW PIXELS: a screenshot comes back as PNG and decoding PNG
 * without a library is a project of its own. `getImageData` hands back raw RGBA, and a 24-bit BMP is
 * a 54-byte header plus bottom-up BGR rows padded to 4 bytes. No dependency, and the whole encoder
 * fits on one screen.
 *
 *   node build/make-installer-art.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

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

/* The dika mark, copied verbatim from build/icon.svg (which took it from the editor's own logo).
   Not redrawn: an approximation of a brand mark in an installer is worse than no mark. */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 161 93" width="W" height="H">
  <g transform="translate(-0.132812 -37.394531)">
    <path fill="#f2ff58" fill-rule="evenodd" d="M 0.132812 81.796875 L 160.550781 37.394531 L 110.550781 129.976562 L 64.457031 99.117188 L 160.316406 37.550781 L 59.117188 98.074219 L 52.867188 129.195312 L 40.628906 94.816406 L 160.300781 37.542969 L 38.414062 92.476562 Z M 0.132812 81.796875 "/>
    <path fill="#f2ff58" fill-rule="evenodd" d="M 55.980469 129.890625 L 76.605469 111.109375 L 63.347656 101.351562 Z M 55.980469 129.890625 "/>
  </g>
</svg>`;

/* One page that draws BOTH bitmaps onto canvases and returns their raw pixels. Doing it in one load
   means one browser start and one set of measured font metrics. */
function page() {
  const mark = (w, h) => MARK.replace('width="W"', `width="${w}"`).replace('height="H"', `height="${h}"`);
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#16161b}canvas{display:block}</style>
<canvas id="side" width="164" height="314"></canvas>
<canvas id="head" width="150" height="57"></canvas>
<script>
const BG = '#16161b', VOLT = '#f2ff58', DIM = '#9b9ba3', FAINT = '#6e6e78';
const FONT = '"Segoe UI", system-ui, sans-serif';

function svgImage(svg) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

window.__draw = async function () {
  /* ── the sidebar: welcome AND finish page ──────────────────────────────
     It is the only surface in the whole installer we control, so it carries the three things worth
     saying: whose product this is, that an account is free, and where to get one. Flat fills only:
     a gradient is banned in this product's design system and a BMP would band it anyway. */
  const s = document.getElementById('side').getContext('2d');
  s.fillStyle = BG; s.fillRect(0, 0, 164, 314);
  /* A volt rule down the left edge instead of a panel: volt is a FILL in this system, never a
     border around things. */
  s.fillStyle = VOLT; s.fillRect(0, 0, 3, 314);

  const m = await svgImage(${JSON.stringify(mark(84, 48))});
  if (m) s.drawImage(m, 26, 34, 84, 48);

  s.fillStyle = '#ffffff';
  s.font = '600 21px ' + FONT;
  s.fillText('dika.studio', 26, 112);

  /* ENGLISH, to match the rest of the build. A Turkish installer in front of an English app is the
     only Turkish anybody meets and reads as a mistake. */
  s.fillStyle = DIM;
  s.font = '11px ' + FONT;
  s.fillText('Design and video', 26, 133);
  s.fillText('studio', 26, 148);

  /* The ad, and it is a sentence rather than a slogan: somebody reading an installer wants to know
     what the account is FOR, not to be sold to. */
  s.fillStyle = '#2c2c33'; s.fillRect(26, 176, 112, 1);
  s.fillStyle = VOLT;
  s.font = '600 12px ' + FONT;
  s.fillText('Free account', 26, 199);
  s.fillStyle = DIM;
  s.font = '11px ' + FONT;
  s.fillText('Online template and', 26, 217);
  s.fillText('asset library, plus', 26, 232);
  s.fillText('release news.', 26, 247);
  s.fillStyle = '#ffffff';
  s.font = '600 11px ' + FONT;
  s.fillText('dika.studio', 26, 270);

  s.fillStyle = FAINT;
  s.font = '10px ' + FONT;
  s.fillText('Source available - BUSL 1.1', 26, 297);

  /* ── the header strip on every other page ───────────────────────────── */
  const h = document.getElementById('head').getContext('2d');
  h.fillStyle = BG; h.fillRect(0, 0, 150, 57);
  const m2 = await svgImage(${JSON.stringify(mark(40, 23))});
  if (m2) h.drawImage(m2, 12, 10, 40, 23);
  h.fillStyle = '#ffffff';
  h.font = '600 13px ' + FONT;
  h.fillText('dika.studio', 12, 48);

  const grab = (id, w, h2) => {
    const d = document.getElementById(id).getContext('2d').getImageData(0, 0, w, h2).data;
    let bin = '';
    for (let i = 0; i < d.length; i++) bin += String.fromCharCode(d[i]);
    return btoa(bin);
  };
  return JSON.stringify({ side: grab('side', 164, 314), head: grab('head', 150, 57) });
};
</script>`;
}

/* 24-bit BMP: 54-byte header, rows BOTTOM-UP, BGR, each row padded to a multiple of 4 bytes.
   Getting any one of those three wrong produces a file NSIS silently ignores. */
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
      b[o++] = rgba[p + 2];
      b[o++] = rgba[p + 1];
      b[o++] = rgba[p];
    }
  }
  return b;
}

const profile = mkdtempSync(join(tmpdir(), 'cc-nsis-'));
const PORT = 9643;
const child = spawn(chromium(), [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--hide-scrollbars',
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
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(page()) });
await new Promise((r) => setTimeout(r, 1500));
/* Wait for the webfont-free system stack to settle before measuring text. */
await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
const r = await send('Runtime.evaluate', { expression: 'window.__draw()', awaitPromise: true, returnByValue: true });
if (r.result?.exceptionDetails) { child.kill(); throw new Error('draw threw: ' + r.result.exceptionDetails.text); }
const out = JSON.parse(r.result.result.value);

const side = bmp24(Buffer.from(out.side, 'base64'), 164, 314);
const head = bmp24(Buffer.from(out.head, 'base64'), 150, 57);
writeFileSync(join(HERE, 'installerSidebar.bmp'), side);
writeFileSync(join(HERE, 'uninstallerSidebar.bmp'), side);
writeFileSync(join(HERE, 'installerHeader.bmp'), head);

/* Assert the format rather than trusting it: NSIS ignores a bad BMP without a word, so a silent
   fallback to its own blue artwork is exactly what this check exists to catch. */
const check = (buf, w, h) => ({
  magic: buf.toString('latin1', 0, 2),
  width: buf.readInt32LE(18), height: buf.readInt32LE(22), bpp: buf.readUInt16LE(28),
  ok: buf.toString('latin1', 0, 2) === 'BM' && buf.readInt32LE(18) === w && buf.readInt32LE(22) === h && buf.readUInt16LE(28) === 24
});
const s1 = check(side, 164, 314), h1 = check(head, 150, 57);
console.log(JSON.stringify({ sidebar: s1, header: h1, bytes: { side: side.length, head: head.length } }, null, 1));

ws.close();
child.kill();
if (!s1.ok || !h1.ok) process.exit(1);
