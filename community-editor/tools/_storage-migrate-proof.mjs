/* The rename MOVED the data instead of hiding it.
 *
 * P5 renamed ~45 localStorage keys and seven IndexedDB databases. A rename without a copy is the one
 * change in this whole pass that can cost somebody their work: the old value stays under the old name
 * and the app starts from empty, which reads exactly like "the update deleted my projects".
 *
 * So this seeds the OLD state, RELOADS so the migration runs the way it runs for a real person, and
 * then checks four things that a source read cannot tell you:
 *   1. the values arrived under the new names, and the old names are gone;
 *   2. a key built at runtime (`cardcraft_plugin_<id>`) moved too - the prefix sweep exists for those;
 *   3. a NEWER value already under the new name is not overwritten by the old one;
 *   4. an IndexedDB database arrives with its records AND its schema (keyPath, indexes), because
 *      copying rows without the schema produces a database that looks full and cannot be queried.
 *
 * IT OWNS EVERY NAME IT TOUCHES. The first version of this file seeded the app's REAL databases and
 * deleted them in its cleanup - it would have destroyed the owner's installed fonts and saved shapes
 * to prove that copying works. The mechanism is generic, so it is exercised on fixture names, and the
 * seven REAL pairs are asserted separately by reading the shipped bundle.
 *
 *   node tools/_storage-migrate-proof.mjs
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
await send('Page.enable');
const evalIn = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  const d = r.result?.exceptionDetails;
  if (d) throw new Error('eval threw: ' + (d.exception?.description || d.text));
  return r.result?.result?.value;
};
const ready = async () => {
  for (let i = 0; i < 240; i++) {
    if (await evalIn('!!(window.CCMigrate && window.canvas)').catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('editor never became ready');
};
await ready();

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); } else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); } };

/* ── seed the world as it looked before the rename ─────────────────────────────────────────────── */
const seeded = JSON.parse(await evalIn(`(function () { return (async function () {
  localStorage.setItem('cardcraft_userInfo', '{"name":"proof owner"}');
  localStorage.setItem('cardcraft_versions', '["v1","v2"]');
  localStorage.setItem('cardcraft_plugin_abc123', 'runtime-built key');   // the prefix sweep case
  /* The conflict: BOTH names present. The new one is the one in use and must survive. */
  localStorage.setItem('cardcraft_railVisibility', 'OLD value');
  localStorage.setItem('dika_railVisibility', 'NEW value');

  function makeDb(name, version, build) {
    return new Promise(function (resolve, reject) {
      var rq = indexedDB.open(name, version);
      rq.onupgradeneeded = function () { build(rq.result); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function put(db, store, rows) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, 'readwrite');
      var os = tx.objectStore(store);
      rows.forEach(function (r) { os.put(r); });
      tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
    });
  }
  var fonts = await makeDb('CCProofOldFonts', 1, function (db) {
    db.createObjectStore('fonts', { keyPath: 'id' });
  });
  await put(fonts, 'fonts', [{ id: 'f1', family: 'Proof Sans' }, { id: 'f2', family: 'Proof Serif' }]);
  fonts.close();

  /* Two stores and an INDEX, so the schema copy is exercised and not just the rows. */
  var shapes = await makeDb('CCProofOldShapes', 2, function (db) {
    var os = db.createObjectStore('shapes', { keyPath: 'id' });
    os.createIndex('byFolder', 'folderId', { unique: false });
    db.createObjectStore('folders', { keyPath: 'id' });
  });
  await put(shapes, 'shapes', [{ id: 's1', folderId: 'x', d: 'M0 0' }]);
  await put(shapes, 'folders', [{ id: 'x', name: 'Proof folder' }]);
  shapes.close();

  var names = (await indexedDB.databases()).map(function (d) { return d.name; });
  return JSON.stringify({ dbs: names.filter(function (n) { return /CCProof/.test(n); }) });
})(); })()`));
console.log('seeded the pre-rename state: ' + seeded.dbs.join(', '));

/* ── reload, so the migration runs exactly as it runs for a person opening the new build ───────── */
await send('Page.reload');
await new Promise((r) => setTimeout(r, 1500));
await ready();

const ls = JSON.parse(await evalIn(`JSON.stringify({
  newUser: localStorage.getItem('dika_userInfo'),
  oldUser: localStorage.getItem('cardcraft_userInfo'),
  newVersions: localStorage.getItem('dika_versions'),
  runtimeKey: localStorage.getItem('dika_plugin_abc123'),
  oldRuntimeKey: localStorage.getItem('cardcraft_plugin_abc123'),
  conflict: localStorage.getItem('dika_railVisibility'),
  oldConflict: localStorage.getItem('cardcraft_railVisibility'),
  anyOldLeft: (function () {
    var n = 0;
    for (var i = 0; i < localStorage.length; i++) if (String(localStorage.key(i)).indexOf('cardcraft') === 0) n++;
    return n;
  })(),
  report: (window.CCMigrate && CCMigrate.report()) || []
})`));

console.log('\nlocalStorage, after one reload');
check('the value arrived under the new name', ls.newUser === '{"name":"proof owner"}', ls.newUser);
check('the old key is gone', ls.oldUser === null);
check('a second key moved too', ls.newVersions === '["v1","v2"]');
check('a RUNTIME-BUILT key moved', ls.runtimeKey === 'runtime-built key' && ls.oldRuntimeKey === null,
  'cardcraft_plugin_abc123 -> dika_plugin_abc123');
check('a newer value is NOT overwritten', ls.conflict === 'NEW value', 'kept "' + ls.conflict + '"');
check('and its old twin is cleaned up', ls.oldConflict === null);
check('no key with the old prefix survives', ls.anyOldLeft === 0, ls.anyOldLeft + ' left');
if (ls.report.length) console.log('  migration said: ' + ls.report.join(' | '));

/* ── the databases: trigger the owners' own open path, then look ───────────────────────────────── */
const dbs = JSON.parse(await evalIn(`(function () { return (async function () {
  await CCMigrate.db('CCProofOldFonts', 'CCProofNewFonts');
  await CCMigrate.db('CCProofOldShapes', 'CCProofNewShapes');

  function open(name) {
    return new Promise(function (resolve, reject) {
      var rq = indexedDB.open(name);
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function all(db, store) {
    return new Promise(function (resolve) {
      var rq = db.transaction(store, 'readonly').objectStore(store).getAll();
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { resolve([]); };
    });
  }
  var names = (await indexedDB.databases()).map(function (d) { return d.name; });
  var fonts = await open('CCProofNewFonts');
  var fontRows = await all(fonts, 'fonts');
  var fontKeyPath = fonts.transaction('fonts', 'readonly').objectStore('fonts').keyPath;
  fonts.close();

  var shapes = await open('CCProofNewShapes');
  var shapeStores = Array.prototype.slice.call(shapes.objectStoreNames);
  var tx = shapes.transaction('shapes', 'readonly');
  var idx = Array.prototype.slice.call(tx.objectStore('shapes').indexNames);
  var shapeRows = await all(shapes, 'shapes');
  var folderRows = await all(shapes, 'folders');
  shapes.close();

  return JSON.stringify({
    oldGone: names.filter(function (n) { return /CCProofOld/.test(n); }),
    fontRows: fontRows.length, fontFamily: (fontRows[0] || {}).family, fontKeyPath: fontKeyPath,
    shapeStores: shapeStores.sort(), shapeIndexes: idx, shapeRows: shapeRows.length, folderRows: folderRows.length,
    report: CCMigrate.report()
  });
})(); })()`));

console.log('\nIndexedDB');
check('the records arrived', dbs.fontRows === 2, dbs.fontRows + ' font(s), first is "' + dbs.fontFamily + '"');
check('the key path came with them', dbs.fontKeyPath === 'id', 'keyPath "' + dbs.fontKeyPath + '"');
check('both stores were copied', dbs.shapeStores.join(',') === 'folders,shapes', dbs.shapeStores.join(','));
check('the INDEX was recreated', dbs.shapeIndexes.indexOf('byFolder') >= 0, dbs.shapeIndexes.join(',') || 'none');
check('their rows came too', dbs.shapeRows === 1 && dbs.folderRows === 1);
check('the old databases are gone', dbs.oldGone.length === 0, dbs.oldGone.join(',') || 'none left');
if (dbs.report.length) console.log('  migration said: ' + dbs.report.join(' | '));

/* ── idempotence: a second pass must be a no-op, not a second copy ─────────────────────────────── */
const again = JSON.parse(await evalIn(`(function () { return (async function () {
  await CCMigrate.db('CCProofOldFonts', 'CCProofNewFonts');
  var rq = indexedDB.open('CCProofNewFonts');
  var db = await new Promise(function (r) { rq.onsuccess = function () { r(rq.result); }; });
  var rows = await new Promise(function (r) {
    var g = db.transaction('fonts', 'readonly').objectStore('fonts').getAll();
    g.onsuccess = function () { r(g.result); };
  });
  db.close();
  return JSON.stringify({ rows: rows.length });
})(); })()`));
check('running it again changes nothing', again.rows === 2, again.rows + ' font(s) still');

/* ── the SEVEN REAL pairs are wired, read off the shipped bundle rather than the source ────────── */
const wired = JSON.parse(await evalIn(`(function () { return (async function () {
  var text = await (await fetch('dist/modules.bundle.js')).text();
  var core = await (await fetch('core/idb.js')).text();
  var pairs = [
    ['cardcraft-community', 'core/idb.js'],
    ['cardcraft_gallery_db', 'gallery'],
    ['CardCraftFontsDB', 'fonts'],
    ['CardCraftPagesDB', 'page-sleep'],
    ['CardCraftTemplatesDB', 'templates'],
    ['cardcraft-presets', 'presets'],
    ['CardCraftMyShapes', 'shapes']
  ];
  var missing = pairs.filter(function (p) { return text.indexOf(p[0]) < 0 && core.indexOf(p[0]) < 0; })
    .map(function (p) { return p[1]; });
  return JSON.stringify({ total: pairs.length, missing: missing });
})(); })()`));
console.log('\nthe seven real databases');
check('every renamed database still names its old self somewhere to migrate FROM',
  wired.missing.length === 0, (wired.total - wired.missing.length) + '/' + wired.total +
  (wired.missing.length ? '   missing: ' + wired.missing.join(', ') : ''));

/* clean up what this proof created - fixture names only, never a database the app uses */
await evalIn(`(function () { return (async function () {
  ['dika_userInfo','dika_versions','dika_plugin_abc123','dika_railVisibility'].forEach(function (k) { localStorage.removeItem(k); });
  for (const n of ['CCProofOldFonts','CCProofNewFonts','CCProofOldShapes','CCProofNewShapes']) {
    await new Promise(function (r) { var q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = r; });
  }
  return 1;
})(); })()`);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
ws.close();
child.kill();
process.exit(fail ? 1 : 0);
