/* ══════════════════════════════════════════════════════════════
   Cutout worker  -  canvas/cutout/cutout.worker.js

   Runs IS-Net general-use segmentation off the editor thread, on onnxruntime-web's
   WASM execution provider. Loaded as a module worker; every asset it touches is
   same-origin (the editor page is cross-origin isolated, so it must be).

   Why a worker, and why disposable: onnxruntime has no way to abort a running
   session, and a WASM fault is fatal to the runtime instance that hit it.
   Terminating this worker is therefore the only real cancel AND the only real
   recovery. The supervisor in cutout.js owns that lifecycle; this file just does
   the work and reports honestly.

   Protocol
     in : { type:'init', vendorBase, modelUrl, threads }
          { type:'run',  id, bitmap, size }        bitmap transferred
          { type:'dispose' }
     out: { type:'ready' } | { type:'progress', phase, pct }
          { type:'result', id, mask, w, h }        mask transferred
          { type:'error', id?, message }

   Preprocessing is taken from the model's own preprocessor_config.json, not from
   any prose: stretch-resize to the model resolution, do_rescale=false, then
   (x - 128) / 256 on raw 0-255 RGB, laid out NCHW.
   ══════════════════════════════════════════════════════════════ */

let ort = null;
let session = null;
let modelSize = 1024;

const MEAN = 128;
const STD = 256;
const CACHE = 'cc-transformers-cutout-v1'; // "transformers" prefix: Settings' model-cache
                                           // sweep matches /transformers|cutout/i, so these
                                           // weights are counted and cleared with the rest.

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

/** Fetch the model with REAL progress, serving from Cache Storage when present. */
async function loadModelBytes(url) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* private mode: just fetch */ }

  if (cache) {
    const hit = await cache.match(url);
    if (hit) {
      post({ type: 'progress', phase: 'cache', pct: 100 });
      return new Uint8Array(await hit.arrayBuffer());
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error('Model could not be downloaded (HTTP ' + res.status + ')');

  // content-length is served by our own static host, so progress is real, not faked.
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  if (!res.body || !total) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (cache) { try { await cache.put(url, new Response(buf)); } catch {} }
    return buf;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let got = 0, lastPct = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    const pct = Math.floor((got / total) * 100);
    if (pct !== lastPct) { lastPct = pct; post({ type: 'progress', phase: 'download', pct }); }
  }
  const buf = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  if (cache) { try { await cache.put(url, new Response(buf)); } catch {} }
  return buf;
}

async function init(msg) {
  ort = await import(msg.vendorBase + 'ort.wasm.bundle.min.mjs');
  ort.env.wasm.wasmPaths = msg.vendorBase;
  // Multi-threaded WASM needs SharedArrayBuffer, i.e. cross-origin isolation. The editor
  // page has it; a plain static host does not, so fall back to a single thread there
  // rather than failing to start.
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(msg.threads || 4, 16)) : 1;
  ort.env.wasm.simd = true;
  ort.env.logLevel = 'error';

  const bytes = await loadModelBytes(msg.modelUrl);
  post({ type: 'progress', phase: 'init', pct: 100 });
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });

  // Read the resolution off the graph when it is static; the q8 build has dynamic dims,
  // in which case the model's documented 1024 stands.
  try {
    const d = session.inputMetadata?.[session.inputNames[0]]?.shape;
    if (Array.isArray(d) && typeof d[2] === 'number' && d[2] > 0) modelSize = d[2];
  } catch { /* keep the default */ }

  post({ type: 'ready', inputName: session.inputNames[0], outputName: session.outputNames[0], size: modelSize });
}

/** ImageBitmap -> normalized NCHW Float32Array at the model's resolution. */
function toTensorData(bitmap, size) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d', { willReadFrequently: true });
  // Stretch, do not letterbox: the model was trained on a plain resize, so padding bars
  // would be out of distribution.
  g.drawImage(bitmap, 0, 0, size, size);
  const px = g.getImageData(0, 0, size, size).data;

  const n = size * size;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = (px[i * 4] - MEAN) / STD;             // R plane
    out[n + i] = (px[i * 4 + 1] - MEAN) / STD;     // G plane
    out[2 * n + i] = (px[i * 4 + 2] - MEAN) / STD; // B plane
  }
  return out;
}

/** Raw model output -> 0..255 alpha mask. IS-Net's reference post-process is a
 *  min-max normalisation of the logit map; without it the mask is washed out. */
function toMask(data, n) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < n; i++) { const v = data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const range = mx - mn;
  const mask = new Uint8Array(n);
  if (range <= 1e-6) return mask; // flat output: everything is background
  for (let i = 0; i < n; i++) mask[i] = ((data[i] - mn) / range) * 255;
  return mask;
}

async function run(msg) {
  if (!session) throw new Error('Model is not ready');
  const size = msg.size || modelSize;
  post({ type: 'progress', phase: 'run', pct: 0 });

  const feeds = {};
  feeds[session.inputNames[0]] = new ort.Tensor('float32', toTensorData(msg.bitmap, size), [1, 3, size, size]);
  msg.bitmap.close();

  const out = await session.run(feeds);
  const t = out[session.outputNames[0]];
  const mask = toMask(t.data, size * size);
  post({ type: 'result', id: msg.id, mask, w: size, h: size }, [mask.buffer]);
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') return await init(msg);
    if (msg.type === 'run') return await run(msg);
    if (msg.type === 'dispose') {
      try { await session?.release(); } catch {}
      session = null;
      return self.close();
    }
  } catch (err) {
    // WASM can throw a number or a bare object; never let that surface as "unknown".
    let m;
    if (err == null) m = 'unknown error';
    else if (typeof err === 'string') m = err;
    else if (typeof err === 'number') m = 'WASM abort kodu ' + err;
    else m = err.message || String(err);
    post({ type: 'error', id: msg.id, message: m });
  }
};
