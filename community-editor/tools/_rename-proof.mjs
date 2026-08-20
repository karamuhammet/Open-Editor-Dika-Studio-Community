/* The rename works: we WRITE the new extensions and still READ the old ones.
 *
 * `.cardcraft` -> `.dika`, `.ccproj` -> `.dikapack` (docs/dika-rename-plan.md, P1). The half that is
 * easy to get wrong is not the writing, it is the reading: a person with a file exported last week
 * must still be able to open it, and nothing about that is visible from the source of a menu label.
 *
 * So this exports a REAL project in the running app, renames the bytes to the old extension, and
 * imports them back. A round trip through the old name is the only thing that proves the promise.
 *
 *   node tools/_rename-proof.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DESKTOP = join(dirname(ROOT), 'community-desktop');
const ELECTRON = join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(ELECTRON)) throw new Error('electron not installed: ' + ELECTRON);

const PORT = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const child = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'], { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });

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

for (let i = 0; i < 120; i++) {
  if (await evalIn('!!(window.canvas && window.CCEdition && window.ExportService)').catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); } else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); } };

const table = JSON.parse(await evalIn('JSON.stringify(CCEdition.formats)'));
console.log('\nthe format table (core/edition.js)');
check('writes .dika for structure', table.project === '.dika', table.project);
check('writes .dikapack for the package', table.package === '.dikapack', table.package);
check('reads the two old names too', table.readable.indexOf('.cardcraft') >= 0 && table.readable.indexOf('.ccproj') >= 0, table.readable.join(' '));
check('the accept string carries all five', (table.accept.match(/,/g) || []).length === 4, table.accept);
/* A RegExp does not survive JSON, so it is exercised INSIDE the page and only the answers come back. */
const re = JSON.parse(await evalIn(`JSON.stringify({
  source: String(CCEdition.formats.projectFileRe),
  old1: CCEdition.formats.projectFileRe.test('made-last-week.cardcraft'),
  old2: CCEdition.formats.projectFileRe.test('shared.ccproj'),
  neu1: CCEdition.formats.projectFileRe.test('today.dika'),
  neu2: CCEdition.formats.projectFileRe.test('today.dikapack'),
  notOurs: CCEdition.formats.projectFileRe.test('holiday.png')
})`));
check('the filename pattern accepts both old names', re.old1 && re.old2, re.source);
check('and both new ones', re.neu1 && re.neu2);
check('and nothing else', re.notOurs === false, 'holiday.png rejected');

/* A REAL export, captured on its way to the download. */
const exported = JSON.parse(await evalIn(`(function () { return (async function () {
  window.__ccCap = { name: null, blob: null };
  var realCreate = URL.createObjectURL;
  URL.createObjectURL = function (b) { window.__ccCap.blob = b; return realCreate.call(URL, b); };
  var realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__ccCap.name = this.download; };
  try {
    /* One page with one object, so the export has something to carry. */
    if (canvas.getObjects().length === 0) {
      canvas.add(new fabric.Textbox('rename proof', { left: 40, top: 40, width: 200, fontSize: 20 }));
      canvas.requestRenderAll();
    }
    await ExportService.exportProject('cardcraft');
  } finally {
    URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick;
  }
  var b = window.__ccCap.blob;
  return JSON.stringify({ name: window.__ccCap.name, bytes: b ? b.size : 0 });
})(); })()`));
console.log('\na real project export');
check('the written file carries the new extension', /\.dika$/.test(String(exported.name)), 'wrote "' + exported.name + '"');
check('it actually contains something', exported.bytes > 200, exported.bytes + ' bytes');

/* THE ROUND TRIP: the same bytes, renamed to the OLD extension, imported back. */
const roundTrip = JSON.parse(await evalIn(`(function () { return (async function () {
  var blob = window.__ccCap && window.__ccCap.blob;
  if (!blob) return JSON.stringify({ error: 'no blob captured' });
  var pagesBefore = (window.pages && window.pages.length) || 0;
  var legacy = new File([blob], 'made-before-the-rename.cardcraft', { type: 'application/zip' });
  var res = await ExportService.importProject(legacy, {});
  return JSON.stringify({
    accepted: !!res,
    pagesBefore: pagesBefore,
    pagesAfter: (window.pages && window.pages.length) || 0
  });
})(); })()`));
console.log('\nthe same file, renamed to the OLD extension, imported back');
if (roundTrip.error) {
  check('a legacy .cardcraft file still imports', false, roundTrip.error);
} else {
  check('a legacy .cardcraft file still imports', roundTrip.accepted === true,
    'pages ' + roundTrip.pagesBefore + ' -> ' + roundTrip.pagesAfter);
}

/* Nothing on screen still says the old name. */
const onScreen = JSON.parse(await evalIn(`(function () {
  var text = document.body.innerText || '';
  var html = document.body.innerHTML || '';
  return JSON.stringify({
    visibleOld: (text.match(/\\.cardcraft|\\.ccproj/g) || []).length,
    acceptAttrs: Array.prototype.map.call(document.querySelectorAll('input[accept]'), function (i) { return i.getAttribute('accept'); })
  });
})()`));
check('no visible text still says the old extension', onScreen.visibleOld === 0, onScreen.visibleOld + ' occurrence(s) in the rendered page');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
ws.close();
child.kill();
process.exit(fail ? 1 : 0);
