import { openFile } from './_cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const page = await openFile(join(ROOT, 'index.html'));
await new Promise(r => setTimeout(r, 3000));
console.log(await page.eval(`JSON.stringify({ videoEncoder: typeof VideoEncoder, videoFrame: typeof VideoFrame, frameSource: !!window.VEFrameSource, muxerGlobals: Object.keys(window).filter(function(k){return /mux/i.test(k);}) })`));
console.log(await page.eval(`VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 320, height: 180, bitrate: 200000, framerate: 2 }).then(function(r){return JSON.stringify({supported:r.supported});}).catch(function(e){return JSON.stringify({error:String(e)});})`));
await page.close();
