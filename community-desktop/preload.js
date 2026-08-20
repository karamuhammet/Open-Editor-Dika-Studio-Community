/* The bridge, and it is deliberately boring.
 *
 * `sandbox: true` plus `contextIsolation: true` means the renderer has no Node at all. Everything it
 * can ask the OS for is ONE NAMED METHOD here, so the whole attack surface of the desktop build is
 * this file, readable in a minute.
 *
 * There is no generic `invoke(channel, ...)`. A generic bridge is the same as no bridge: it lets a
 * compromised renderer reach any handler the main process ever adds, including ones added later by
 * somebody who never read this comment.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* The server override, passed down from main through `additionalArguments`. `core/edition.js` reads
   `window.CC_API_BASE` and falls back to its own default when this is absent, so the shipped app is
   unchanged and a developer can point the SAME binary at a local server:
     dika.exe --api-base=http://localhost:3000
   Exposed as a plain string, never a setter: the page can read where it is pointed, not move it. */
const apiArg = process.argv.find((a) => a.startsWith('--cc-api-base='));
if (apiArg) contextBridge.exposeInMainWorld('CC_API_BASE', apiArg.slice('--cc-api-base='.length));

contextBridge.exposeInMainWorld('CCDesktop', {
  /* Marks the desktop build for the editor. `CCEdition.localFetchBlocked()` is false here because we
     are on app://, not file://, so the on-device AI panels stop refusing. */
  isDesktop: true,

  openProject: () => ipcRenderer.invoke('cc:open-project'),
  saveProject: (suggestedName, bytes) => ipcRenderer.invoke('cc:save-project', { suggestedName, bytes }),

  /* R8: sign-in happens in the person's REAL browser, never in a window this app controls, so no
     password is ever typed into a frame we render. The main process drops every scheme but http and
     https, through the same function the navigation guards use. */
  openExternal: (url) => ipcRenderer.invoke('cc:open-external', String(url || '')),

  dataDir: () => ipcRenderer.invoke('cc:data-dir'),
  showDataDir: () => ipcRenderer.invoke('cc:show-data-dir'),
  appInfo: () => ipcRenderer.invoke('cc:app-info'),

  /* THE UPDATE CHANNEL. Four questions and two settings, and NOT ONE of them takes an argument that
     decides what gets downloaded or run. `check` passes a rollout bucket, which can only widen who is
     offered an update; everything else - the URL, the signature, the hash, the version comparison -
     is decided in the main process, where a compromised page cannot reach it. */
  update: {
    state: () => ipcRenderer.invoke('cc:update-state'),
    check: (bucket) => ipcRenderer.invoke('cc:update-check', Number(bucket) || 0),
    checkNow: () => ipcRenderer.invoke('cc:update-check-now'),
    install: () => ipcRenderer.invoke('cc:update-install'),
    postpone: () => ipcRenderer.invoke('cc:update-postpone'),
    optOut: (v) => ipcRenderer.invoke('cc:update-opt-out', !!v),
    openReleases: () => ipcRenderer.invoke('cc:update-open-releases'),
    onProgress: (fn) => {
      if (typeof fn !== 'function') return;
      ipcRenderer.on('cc:update-progress', (_e, pct) => fn(Number(pct) || 0));
    }
  },

  /* One inbound channel, and the payload is a short string the renderer switches on. The listener is
     wrapped so a page cannot get at the raw IpcRendererEvent. */
  onMenu: (fn) => {
    if (typeof fn !== 'function') return;
    ipcRenderer.on('cc:menu', (_e, action) => fn(String(action)));
  }
});
