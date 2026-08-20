/* The key that shipped is the key that signs. One assertion, run once after keygen: if these two ever
   drift, every release verifies on the release machine and is refused by every installed copy. */
import { signManifest } from './update-manifest.mjs';
import { verify, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_DIR = process.env.DIKA_KEY_DIR || 'D:/Cursor/dika-update-key';
const priv = readFileSync(KEY_DIR + '/dika-update-private.pem', 'utf8');
const onDisk = readFileSync(KEY_DIR + '/dika-update-public.pem', 'utf8').trim();
const shipped = readFileSync(new URL('../updater.js', import.meta.url), 'utf8')
  .match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/)[0].trim();

console.log('  identical to the key on disk:', shipped === onDisk);
const payload = Buffer.from(JSON.stringify({ version: '1.0.1', channel: 'stable' }), 'utf8');
const doc = signManifest(payload, priv, '2026-08');
const input = Buffer.concat([Buffer.from('dika.studio/update-manifest/v1\0', 'utf8'), Buffer.from(doc.payload, 'base64url')]);
const ok = verify(null, input, createPublicKey(shipped), Buffer.from(doc.signature, 'base64url'));
console.log('  a real signature verifies against the shipped key:', ok);
process.exit(shipped === onDisk && ok ? 0 : 1);
