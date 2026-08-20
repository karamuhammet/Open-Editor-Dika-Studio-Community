/* Camera recorder writer worker  -  video/ve-recorder/ve-recorder.worker.js

   Exists for exactly one reason: crash-safety.

   The obvious path (`createWritable()` + FileSystemWritableFileStreamTarget) stages every byte
   in a TEMP file and only swaps it onto the real handle at close(). Measured in this project:
   size is 0 before close(), full after. So killing the tab mid-take loses the whole recording,
   and the file cannot even be inspected while it grows.

   `createSyncAccessHandle()` writes IN PLACE, with no temp file and no rename-on-close. It is
   Worker-only and synchronous, which is why this file exists at all. flush() then becomes a
   real checkpoint: bytes are on disk, and a crash costs at most the last chunk.

   Protocol
     in : { type:'open',  name }
          { type:'write', data:Uint8Array, position }   data transferred
          { type:'flush' }
          { type:'close' }
     out: { type:'ready' } | { type:'flushed' } | { type:'closed', size }
          { type:'error', message }

   Plan: docs/camera-recorder-plan.md (R9)
*/
'use strict';

var handle = null;
var fileName = '';
var written = 0;

function fail(msg) {
  self.postMessage({ type: 'error', message: String(msg) });
}

self.onmessage = function (e) {
  var m = e.data || {};

  if (m.type === 'open') {
    fileName = m.name;
    navigator.storage.getDirectory()
      .then(function (root) { return root.getFileHandle(fileName, { create: true }); })
      .then(function (fh) { return fh.createSyncAccessHandle(); })
      .then(function (h) {
        handle = h;
        try { handle.truncate(0); } catch (err) {}
        written = 0;
        self.postMessage({ type: 'ready' });
      })['catch'](function (err) { fail((err && err.message) || err); });
    return;
  }

  if (m.type === 'write') {
    if (!handle) return;
    try {
      // The muxer writes out of order (it seeks back to patch box sizes), hence `at:`.
      handle.write(m.data, { at: m.position });
      var end = m.position + m.data.byteLength;
      if (end > written) written = end;
    } catch (err) { fail((err && err.message) || err); }
    return;
  }

  if (m.type === 'flush') {
    // The checkpoint the temp-file approach could never offer: after this, the bytes so far
    // are genuinely on disk.
    if (!handle) return;
    try { handle.flush(); self.postMessage({ type: 'flushed', size: written }); }
    catch (err) { fail((err && err.message) || err); }
    return;
  }

  if (m.type === 'close') {
    if (!handle) { self.postMessage({ type: 'closed', size: 0 }); return; }
    try {
      handle.flush();
      var size = handle.getSize();
      handle.close();
      handle = null;
      self.postMessage({ type: 'closed', size: size });
    } catch (err) { fail((err && err.message) || err); }
  }
};
