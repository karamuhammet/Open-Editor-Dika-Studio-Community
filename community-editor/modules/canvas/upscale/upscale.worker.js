/* ══════════════════════════════════════════════════════════════
   Upscale worker  -  canvas/upscale/upscale.worker.js

   Swin2SR x2 super-resolution off the editor thread, on onnxruntime-web's WASM EP.
   Fully self-contained: it shares no code, no runtime copy and no assets with any
   other tool, so nothing here can break another feature or be broken by one.

   TILED on purpose. Measured cost is superlinear in tile area (128 -> 1.6 s,
   256 -> 6.0 s, 384 -> 12.4 s, 512 -> 23.1 s), and a whole image in one pass would
   also blow the WASM heap. So the source is cut into overlapping tiles, each is
   upscaled, and they are blended back together. Memory stays flat regardless of the
   image; only the time grows, and it grows linearly with the tile count.

   Preprocessing comes from the model's own preprocessor_config.json, not from prose:
   rescale x/255, pad to a multiple of 8 (window_size), no mean/std normalisation.
   Output `reconstruction` is 0..1 at 2x, so it goes back out as v*255 clamped.

   Protocol
     in : { type:'init', vendorBase, modelUrl, threads }
          { type:'run', id, bitmap, tile, overlap }   bitmap transferred
          { type:'dispose' }
     out: { type:'ready' } | { type:'progress', phase, pct }
          { type:'result', id, rgba, w, h }           rgba transferred
          { type:'error', id?, message }
   ══════════════════════════════════════════════════════════════ */

let ort = null;
let session = null;
const SCALE = 2;
const PAD_TO = 8;
const CACHE = 'cc-transformers-upscale-v1'; // "transformers" prefix keeps these weights
                                           // inside the Settings model-cache sweep.

function post(m, t) { self.postMessage(m, t || []); }

async function loadModelBytes(url) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch {}
  if (cache) {
    const hit = await cache.match(url);
    if (hit) { post({ type: 'progress', phase: 'cache', pct: 100 }); return new Uint8Array(await hit.arrayBuffer()); }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Model could not be downloaded (HTTP ' + res.status + ')');
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  if (!res.body || !total) {
    const b = new Uint8Array(await res.arrayBuffer());
    if (cache) { try { await cache.put(url, new Response(b)); } catch {} }
    return b;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0, last = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    const pct = Math.floor((got / total) * 100);
    if (pct !== last) { last = pct; post({ type: 'progress', phase: 'download', pct }); }
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  if (cache) { try { await cache.put(url, new Response(buf)); } catch {} }
  return buf;
}

async function init(msg) {
  ort = await import(msg.vendorBase + 'ort.wasm.bundle.min.mjs');
  ort.env.wasm.wasmPaths = msg.vendorBase;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(msg.threads || 4, 16)) : 1;
  ort.env.wasm.simd = true;
  ort.env.logLevel = 'error';
  const bytes = await loadModelBytes(msg.modelUrl);
  post({ type: 'progress', phase: 'init', pct: 100 });
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  post({ type: 'ready', scale: SCALE });
}

/** One tile: RGBA slice -> x/255 NCHW (padded to a multiple of 8) -> model -> RGBA at 2x. */
async function upscaleTile(px, w, h) {
  const pw = Math.ceil(w / PAD_TO) * PAD_TO;
  const ph = Math.ceil(h / PAD_TO) * PAD_TO;
  const n = pw * ph;
  const t = new Float32Array(3 * n);
  // edge-replicate into the pad region: zeros there would darken the tile border
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(y, h - 1);
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(x, w - 1);
      const s = (sy * w + sx) * 4, d = y * pw + x;
      t[d] = px[s] / 255;
      t[n + d] = px[s + 1] / 255;
      t[2 * n + d] = px[s + 2] / 255;
    }
  }
  const out = await session.run({ pixel_values: new ort.Tensor('float32', t, [1, 3, ph, pw]) });
  const r = out[session.outputNames[0]];
  const ow = pw * SCALE, oh = ph * SCALE, on = ow * oh;
  const dw = w * SCALE, dh = h * SCALE;

  // crop the padding back off while converting to RGBA
  const rgba = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const s = y * ow + x, d = (y * dw + x) * 4;
      rgba[d] = r.data[s] * 255;
      rgba[d + 1] = r.data[on + s] * 255;
      rgba[d + 2] = r.data[2 * on + s] * 255;
      rgba[d + 3] = 255;
    }
  }
  return { rgba, w: dw, h: dh };
}

/* ── Alpha handling ──
   Swin2SR is a 3-channel RGB model: it has no alpha and cannot carry one. A PNG
   cutout therefore needs alpha routed AROUND the model, or its transparent pixels
   (whose RGB is 0,0,0) come back as opaque black.
   Two things are needed, and both matter:
     1. the alpha is upscaled separately and re-applied to the result,
     2. the RGB inside the transparent region is flood-filled outward from the
        nearest opaque pixel FIRST, because the model reads neighbours - left as
        black, it would smear a dark fringe into the subject's edge. */
function hasTransparency(d) {
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/** Grow opaque RGB outward into transparent pixels (alpha untouched). */
function bleedEdges(img, w, h, passes) {
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const next = solid.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!solid[j]) continue;
            r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
          }
        }
        if (!n) continue;
        d[i * 4] = r / n; d[i * 4 + 1] = g / n; d[i * 4 + 2] = b / n;
        next[i] = 1;
      }
    }
    solid.set(next);
  }
}

async function run(msg) {
  if (!session) throw new Error('Model is not ready');
  const tile = msg.tile || 256;
  const ov = msg.overlap || 16;
  const bmp = msg.bitmap;
  const sw = bmp.width, sh = bmp.height;

  const src = new OffscreenCanvas(sw, sh);
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(bmp, 0, 0);
  bmp.close();

  // Keep the original alpha before anything touches the pixels.
  const srcData = sctx.getImageData(0, 0, sw, sh);
  const alpha = hasTransparency(srcData.data) ? new Uint8Array(sw * sh) : null;
  if (alpha) {
    for (let i = 0; i < sw * sh; i++) alpha[i] = srcData.data[i * 4 + 3];
    bleedEdges(srcData, sw, sh, 4);
    // opaque RGB everywhere: the model must never see the transparent black
    for (let i = 0; i < sw * sh; i++) srcData.data[i * 4 + 3] = 255;
    sctx.putImageData(srcData, 0, 0);
  }

  const dw = sw * SCALE, dh = sh * SCALE;
  const dst = new OffscreenCanvas(dw, dh);
  const dctx = dst.getContext('2d');

  const step = tile - ov * 2;
  const cols = Math.max(1, Math.ceil(sw / step));
  const rows = Math.max(1, Math.ceil(sh / step));
  const totalTiles = cols * rows;
  let done = 0;

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      // read with overlap so the model sees context past the seam...
      const x0 = Math.max(0, rx * step - ov);
      const y0 = Math.max(0, ry * step - ov);
      const x1 = Math.min(sw, rx * step + step + ov);
      const y1 = Math.min(sh, ry * step + step + ov);
      const tw = x1 - x0, th = y1 - y0;
      if (tw <= 0 || th <= 0) { done++; continue; }

      const px = sctx.getImageData(x0, y0, tw, th).data;
      const up = await upscaleTile(px, tw, th);

      // ...then paint back only the non-overlapping core, so seams never double-blend
      const keepX = rx * step, keepY = ry * step;
      const keepW = Math.min(step, sw - keepX), keepH = Math.min(step, sh - keepY);
      if (keepW > 0 && keepH > 0) {
        const bmp2 = await createImageBitmap(new ImageData(up.rgba, up.w, up.h));
        dctx.drawImage(
          bmp2,
          (keepX - x0) * SCALE, (keepY - y0) * SCALE, keepW * SCALE, keepH * SCALE,
          keepX * SCALE, keepY * SCALE, keepW * SCALE, keepH * SCALE
        );
        bmp2.close();
      }
      done++;
      post({ type: 'progress', phase: 'run', pct: Math.floor((done / totalTiles) * 100), tile: done, tiles: totalTiles });
    }
  }

  const outData = dctx.getImageData(0, 0, dw, dh);

  // Re-apply the alpha the model could not carry. It is scaled with the canvas'
  // own smoothing (a plain 2x bilinear): the mask is a soft coverage signal, so a
  // smooth resample is the right tool, and it costs nothing next to another SR pass.
  if (alpha) {
    const ac = new OffscreenCanvas(sw, sh);
    const actx = ac.getContext('2d', { willReadFrequently: true });
    const ad = actx.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) {
      const v = alpha[i];
      ad.data[i * 4] = v; ad.data[i * 4 + 1] = v; ad.data[i * 4 + 2] = v; ad.data[i * 4 + 3] = 255;
    }
    actx.putImageData(ad, 0, 0);

    const a2 = new OffscreenCanvas(dw, dh);
    const a2ctx = a2.getContext('2d', { willReadFrequently: true });
    a2ctx.imageSmoothingEnabled = true;
    a2ctx.imageSmoothingQuality = 'high';
    a2ctx.drawImage(ac, 0, 0, dw, dh);
    const up = a2ctx.getImageData(0, 0, dw, dh).data;
    for (let i = 0; i < dw * dh; i++) outData.data[i * 4 + 3] = up[i * 4];
  }

  post({ type: 'result', id: msg.id, rgba: outData.data, w: dw, h: dh }, [outData.data.buffer]);
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') return await init(msg);
    if (msg.type === 'run') return await run(msg);
    if (msg.type === 'dispose') { try { await session?.release(); } catch {} session = null; return self.close(); }
  } catch (err) {
    let m;
    if (err == null) m = 'unknown error';
    else if (typeof err === 'string') m = err;
    else if (typeof err === 'number') m = 'WASM abort kodu ' + err;   // never surface a bare code
    else m = err.message || String(err);
    post({ type: 'error', id: msg.id, message: m });
  }
};
