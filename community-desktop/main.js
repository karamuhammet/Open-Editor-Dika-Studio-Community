/* ============================================================
   dika studio Community Editor - desktop shell.

   THE POINT OF THIS APP IS ONE LINE: `protocol.handle('app', ...)`.

   The editor already runs from a double-clicked `index.html` with zero network requests. Exactly one
   thing does not work there, and it was measured rather than guessed: a page opened as `file://` has
   an opaque origin, so `fetch()` of a local file is refused ("URL scheme file is not supported").
   Tags are fine, which is why the bundle, the fonts and the canvas all work. What breaks is anything
   that READS BYTES: the on-device AI models in `vendor/` (cutout, upscale, Whisper).

   Serving the same folder over a custom scheme fixes it, because `app://` is a normal origin. The
   same handler adds the two isolation headers, so `crossOriginIsolated` becomes true and
   SharedArrayBuffer is available, which `file://` also could not do.

   DO NOT reach for `webSecurity: false` instead. It disables the same-origin policy for the whole
   renderer. This is ten lines and it is the correct answer.

   Everything else here is the second reason to have a desktop build: real files. In the browser the
   only copy of somebody's work is one browser profile, and clearing site data deletes it. Here a
   project can be a file they can see, copy and back up.

   Record: docs/community-edition-release-plan.md §10
   ============================================================ */
'use strict';

const { app, BrowserWindow, protocol, dialog, shell, Menu, ipcMain } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/* The editor tree. In development it is the sibling folder; when packaged it is unpacked beside the
   app. One resolver, so nothing has to guess. */
const EDITOR_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'editor')
  : path.resolve(__dirname, '..', 'community-editor');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://editor`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8'
};

/* Registered BEFORE app ready, or the scheme is not treated as standard and secure and half of what
   we are here for (a normal origin, storage, secure context) does not apply. */
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}]);

/* ── the protocol handler ───────────────────────────────────────────────── */

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = path.normalize(path.join(root, decoded));
  /* A request is not allowed to walk out of the editor tree. `app://editor/../../secrets` must not
     resolve, whatever the renderer sends. */
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

function serve(request) {
  const url = new URL(request.url);
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = safeJoin(EDITOR_ROOT, rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  const headers = {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    /* Cross-origin isolation, which file:// cannot have. This is what turns SharedArrayBuffer on. */
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
    /* The renderer is a design editor with an inline-script boot and canvas styling, so
       'unsafe-inline' for style is by construction. `connect-src` deliberately allows https so the
       user's own stock media keys and the one Whisper model download work; nothing else is opened.

       MEASURED 2026-08-15, and it cost an hour: `https:` alone means an `--api-base=http://localhost:3000`
       override is BLOCKED BY OUR OWN CSP. The registration wizard fell back to its built-in screen
       and looked exactly like "the server has nothing published", which is the wrong diagnosis and
       the same class of trap as the portal's `connect-src` with no `data:`.
       The ONE overridden origin is added, never `http:` as a scheme: a shipped build has no override,
       so its policy is unchanged and still https-only. */
    'content-security-policy': [
      "default-src 'self' app:",
      "script-src 'self' app: 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' app: 'unsafe-inline'",
      /* The override reaches img/media too: the registration wizard's slides are served by the same
         host, so allowing the fetch and refusing the picture would draw an empty panel. */
      "img-src 'self' app: data: blob: https:" + (API_BASE && API_BASE.startsWith('http://') ? ' ' + API_BASE : ''),
      "media-src 'self' app: data: blob: https:" + (API_BASE && API_BASE.startsWith('http://') ? ' ' + API_BASE : ''),
      "font-src 'self' app: data:",
      "connect-src 'self' app: data: blob: https:" + (API_BASE && API_BASE.startsWith('http://') ? ' ' + API_BASE : ''),
      "worker-src 'self' app: blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join('; ')
  };
  return new Response(fs.createReadStream(file), { status: 200, headers });
}

/* ── which server this build talks to ───────────────────────────────────── */

/* The editor defaults to the production host (core/edition.js `apiBase`). This lets whoever LAUNCHES
   the app point it somewhere else:
 *
 *     dika.exe --api-base=http://localhost:3000
 *     CC_API_BASE=http://localhost:3000 npm start
 *
 * It exists because the registration wizard is served by apps/web, and "why is the wizard not
 * coming from :3001" has exactly one answer while the route is only on a developer's machine. It is
 * not a hole: the value comes from this process's own argv or environment, i.e. from somebody who
 * already controls the machine, and only http and https are accepted. Nothing in the shipped app
 * sets it. */
function resolveApiBase() {
  const fromArgv = process.argv.find((a) => a.startsWith('--api-base='));
  const raw = (fromArgv ? fromArgv.slice('--api-base='.length) : process.env.CC_API_BASE) || '';
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch (e) { return null; }
}
const API_BASE = resolveApiBase();

/* ── the window ─────────────────────────────────────────────────────────── */

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#16161b',
    show: false,
    title: 'dika.studio',
    icon: path.join(__dirname, 'build', 'icon.png'),

    /* NO NATIVE TITLE BAR AND NO MENU BAR. The window used to stack three rows before the canvas:
       Windows' own title bar, Electron's File/Edit/View/Window/Help menu, and the editor's own
       File/Edit/View/Help bar underneath it. "File" appeared twice and 90px of a 900px window went
       to chrome that duplicated what the page already had.

       `titleBarStyle: 'hidden'` removes the frame; `titleBarOverlay` keeps the OS drawing the
       minimise / maximise / close buttons, which is the part you must not reimplement (they carry
       snap layouts, the right hover behaviour and accessibility). The height matches the editor's
       own `--bar: 50px` and the colour matches `--surface`, so the editor's top bar IS the title
       bar rather than sitting under one.

       The renderer marks that bar draggable and reads `windowControlsOverlay` to keep its own
       controls out from under the buttons. See modules/system/desktop/desktop.js. */
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1d1d23',
      symbolColor: '#c8c8d0',
      height: 50
    },
    webPreferences: {
      /* The renderer is untrusted-content-adjacent (it opens user SVGs, fonts and project files), so
         it gets none of Node. Everything it needs from the OS goes through preload, one named method
         at a time. */
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      /* Carried to the preload through argv, which is how a sandboxed preload receives anything from
         the main process. Absent when nothing overrode it, and the editor then uses its own default. */
      additionalArguments: API_BASE ? [`--cc-api-base=${API_BASE}`] : []
    }
  });

  win.once('ready-to-show', () => win.show());

  /* THE PAGE DOES NOT GET TO NAME THE APP. index.html carries `<title>dika studio - Free Design
     Studio</title>`, which is right for a browser tab and is exactly the string the owner pointed at
     in the title bar. Electron applies a page title to the window by default, so the `title:` above
     was being overwritten a second after launch.

     Prevented here rather than by editing the editor's <title>, because that file also serves the
     browser build, where a tab does need a descriptive name. The window, the taskbar and alt-tab all
     read this one. */
  win.on('page-title-updated', (e) => e.preventDefault());

  win.loadURL(`${ORIGIN}/index.html`);

  /* Nothing navigates away from the app, and nothing opens a window inside it. External links go to
     the real browser, and only if they are http or https. */
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); openExternal(url); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
}

function openExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') { shell.openExternal(url); return true; }
  } catch (e) { /* not a URL we will follow */ }
  return false;
}

/* ── the bridge: one named method per capability ────────────────────────── */

/* NEW NAMES FIRST, because a save dialog defaults to the first filter. `ccproj` and `cardcraft` are
   what these same two formats were called before the rename and are kept so a file made by an earlier
   build still appears in the Open dialog. We READ four extensions and WRITE two. */
const PROJECT_FILTERS = [
  { name: 'dika studio project', extensions: ['dikapack', 'dika', 'ccproj', 'cardcraft'] },
  { name: 'All files', extensions: ['*'] }
];

/* ── the update channel ─────────────────────────────────────────────────────────────────────────
   Everything that decides whether an installer runs is in `updater.js`, in THIS process. The renderer
   gets four questions and none of them takes an argument that steers behaviour: no URL, no hash, no
   version and no manifest ever crosses the bridge. Record: docs/desktop-update-channel-plan.md. */
const updater = require('./updater');

ipcMain.handle('cc:update-state', async () => updater.publicState());
ipcMain.handle('cc:update-check', async (_e, bucket) => {
  /* `bucket` is the rollout bucket the renderer computed from the install id it owns. It can only
     ever make this client MORE likely to be offered an update it would otherwise skip, which is why
     it is allowed to cross: rollout is a blast-radius control, not a security boundary. */
  const n = Number(bucket);
  await updater.checkNow({ bucket: Number.isFinite(n) ? n : 0, force: false });
  return updater.publicState();
});
ipcMain.handle('cc:update-check-now', async () => {
  /* The button ignores rollout. A "check now" that respects a 10% bucket lies to the other 90%. */
  await updater.checkNow({ force: true });
  return updater.publicState();
});
ipcMain.handle('cc:update-install', async () => {
  const res = await updater.installNow((pct) => {
    if (win && !win.isDestroyed()) win.webContents.send('cc:update-progress', pct);
  });
  /* The installer replaces this app, so we get out of its way rather than fighting a locked file.
     The renderer has already flushed its autosave before calling: see modules/system/updater. */
  if (res.ok) setTimeout(() => app.quit(), 400);
  return res;
});
ipcMain.handle('cc:update-postpone', async () => updater.postpone());
ipcMain.handle('cc:update-opt-out', async (_e, v) => updater.setOptOut(!!v));
ipcMain.handle('cc:update-open-releases', async () => { updater.openReleasePage(); return true; });

ipcMain.handle('cc:open-project', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: PROJECT_FILTERS });
  if (r.canceled || !r.filePaths.length) return null;
  const file = r.filePaths[0];
  const bytes = await fsp.readFile(file);
  return { name: path.basename(file), path: file, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
});

ipcMain.handle('cc:save-project', async (_e, { suggestedName, bytes }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: suggestedName || 'project.dikapack', filters: PROJECT_FILTERS });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, Buffer.from(bytes));
  return { path: r.filePath, name: path.basename(r.filePath) };
});

/* R8: the renderer needs to send somebody to their real browser to sign in. It goes through
   `openExternal`, the SAME function the navigation guards use, so there is one rule about which
   schemes we will follow and it is enforced in one place. A renderer cannot open a file, a UNC path
   or anything else: `openExternal` checks the protocol and drops everything but http and https.
   Returns whether it was followed, so the panel can say so rather than appearing to do nothing. */
ipcMain.handle('cc:open-external', async (_e, url) => openExternal(String(url || '')));

ipcMain.handle('cc:data-dir', async () => app.getPath('userData'));
ipcMain.handle('cc:show-data-dir', async () => { shell.openPath(app.getPath('userData')); return true; });
ipcMain.handle('cc:app-info', async () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  /* The WINDOW title and the app name, which are not the same as `document.title` and are the ones
     a person reads in the taskbar and in alt-tab. Reported so a proof can assert them: the renderer
     cannot see them at all, and reading document.title instead measures the page. */
  name: app.getName(),
  title: win ? win.getTitle() : null,
  menuBar: Menu.getApplicationMenu() ? 'present' : 'none'
}));

/* ── menus ──────────────────────────────────────────────────────────────── */

/* THERE IS NO APPLICATION MENU. The editor has carried its own File / Edit / View / Help bar since
   long before this shell existed, so a native one duplicated it: two "File" menus, one above the
   other, disagreeing about what File contains.

   THE FOUR THINGS THE NATIVE MENU COULD DO ARE NOT DROPPED. `modules/system/desktop/desktop.js`
   appends them to the editor's OWN File and Help menus when it detects the shell, so Open project,
   Save project as, Show data folder and Setup wizard are all still one click away and are now next
   to the editor's own Save and Export, which is where somebody looks for them.

   On macOS this is different and is left for whoever builds that target: a Mac app with no
   application menu has no Quit, no Hide and no Services, and Cmd+Q stops working. Do not simply
   delete the branch below when adding macOS. */
function buildMenu() {
  const isMac = process.platform === 'darwin';
  if (!isMac) { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'File', submenu: [{ role: 'close' }] },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]));
}

/* ── lifecycle ──────────────────────────────────────────────────────────── */

/* One instance. A second launch (or a double-clicked .ccproj) focuses the window that exists rather
   than opening a second editor against the same data directory. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    /* Update state is read from userData before the window exists, so the first check has somewhere
       to record what it found. It touches the network only when the renderer asks. */
    try { updater.loadState(); } catch (e) { /* a broken state file must never stop the app */ }
    protocol.handle(SCHEME, serve);
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
