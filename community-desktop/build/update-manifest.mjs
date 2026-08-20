/* Sign an update manifest, and verify one. THE ONLY PLACE EITHER HAPPENS.
 *
 * Nothing in this product is code-signed, so this signature is the only thing standing between a
 * compromised web server, admin panel or GitHub account and an installer running on somebody's
 * machine. Two independent reviews of docs/desktop-update-channel-plan.md agreed on that, and on the
 * two ways the first design would have failed:
 *
 *   1. THE SIGNED THING IS OPAQUE BYTES, never "the canonical JSON of the object". A verifier that has
 *      to strip `signature` and re-serialise is a verifier that disagrees with the signer the first
 *      time a key is reordered, a number is formatted differently, or a middlebox reflows the file.
 *      We serve the exact bytes we signed, base64url-encoded, and parse them only AFTER verifying.
 *   2. THE SIGNATURE IS DOMAIN-SEPARATED. Without a prefix, the same key signing anything else later -
 *      a beta channel, a plugin descriptor, a licence - lets one signature be replayed as another.
 *
 * THE PRIVATE KEY NEVER LIVES IN THIS REPOSITORY. It is passed by path, it belongs to the person
 * cutting the release, and signing is a step they perform. A key in CI is a key in everyone's hands.
 *
 *   node build/update-manifest.mjs keygen  --out <dir outside the repo>
 *   node build/update-manifest.mjs payload --version 1.0.0 --base <github release url> --win <exe> --linux <tar.gz> --out payload.json
 *   node build/update-manifest.mjs sign    --key <private.pem> --key-id 2026-08 --in payload.json --out stable.json
 *   node build/update-manifest.mjs verify  --pub <public.pem> --in stable.json
 */
import { createSign, createVerify, generateKeyPairSync, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

/* The domain separator. Changing this string invalidates every signature ever made, which is the
   point: it is a version marker for the SIGNING SCHEME, not for the manifest. */
export const DOMAIN = 'dika.studio/update-manifest/v1\0';
export const SCHEMA = 1;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');

/** The exact bytes an Ed25519 signature covers. Both halves call this; neither re-derives it. */
export function signingInput(payloadBytes) {
  return Buffer.concat([Buffer.from(DOMAIN, 'utf8'), Buffer.from(payloadBytes)]);
}

/** Sign already-serialised payload bytes. The caller owns the JSON; we never re-serialise it. */
export function signManifest(payloadBytes, privateKeyPem, keyId) {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('the signing key must be ed25519, got ' + key.asymmetricKeyType);
  const signature = edSign(null, signingInput(payloadBytes), key);
  return { schema: SCHEMA, payload: b64u(payloadBytes), signature: b64u(signature), keyId: String(keyId) };
}

/**
 * Verify, then parse. Returns the parsed payload or throws.
 * This is the function the desktop shell embeds; keep it dependency-free and small enough to read.
 */
export function verifyManifest(doc, publicKeyPem) {
  if (!doc || typeof doc !== 'object') throw new Error('not an object');
  if (doc.schema !== SCHEMA) throw new Error('unknown schema ' + doc.schema);
  if (typeof doc.payload !== 'string' || typeof doc.signature !== 'string') throw new Error('missing payload or signature');
  const payloadBytes = unb64u(doc.payload);
  const ok = edVerify(null, signingInput(payloadBytes), createPublicKey(publicKeyPem), unb64u(doc.signature));
  if (!ok) throw new Error('signature does not verify');
  /* Only now. Parsing first would let an attacker choose what the parser sees. */
  return JSON.parse(payloadBytes.toString('utf8'));
}

/* ── the command line ──────────────────────────────────────────────────────────────────────────── */

function arg(name, required) {
  const i = process.argv.indexOf('--' + name);
  const v = i > -1 ? process.argv[i + 1] : null;
  if (required && !v) throw new Error('missing --' + name);
  return v;
}

const cmd = process.argv[2];

if (cmd === 'keygen') {
  const out = resolve(arg('out', true));
  if (out.replace(/\\/g, '/').includes('/cartcraft/')) {
    throw new Error('refusing to write a private key inside the repository: ' + out +
      '\nThe key belongs to the person cutting releases, on media the repository never sees.');
  }
  mkdirSync(out, { recursive: true });
  const priv = join(out, 'dika-update-private.pem');
  const pub = join(out, 'dika-update-public.pem');
  if (existsSync(priv)) throw new Error('refusing to overwrite an existing key: ' + priv);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('private key  ' + priv + '   <- BACK THIS UP OFFLINE. Losing it ends the update channel:');
  console.log('                 no installed copy could ever be updated again, by anybody, including us.');
  console.log('public key   ' + pub + '   <- paste into main.js UPDATE_PUBLIC_KEY');
  console.log('\n' + readFileSync(pub, 'utf8'));
} else if (cmd === 'payload') {
  /* THE HASH IS READ OFF THE FILE, NEVER TYPED. A manifest whose sha512 belongs to a different build
     is not a broken link: every client downloads the whole installer, refuses it at the last step and
     reports a failure nobody can reproduce, because the URL serves a perfectly good file. Computing it
     here is the difference between "the release is wrong" and "the release cannot be wrong".

     The URL is BUILT from --base plus the file's own name, for the same reason: a hand-written URL and
     a hand-computed hash can disagree about which file they describe. */
  const base = arg('base', true).replace(/\/+$/, '');
  const digest = async (file) => await new Promise((res, rej) => {
    const h = createHash('sha512');
    createReadStream(file).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
  const artifacts = [];
  for (const [flag, platform, arch] of [['win', 'win32', 'x64'], ['linux', 'linux', 'x64'], ['mac', 'darwin', 'x64']]) {
    const file = arg(flag, false);
    if (!file) continue;
    const abs = resolve(file);
    if (!existsSync(abs)) throw new Error('no such artifact: ' + abs);
    const name = abs.split(/[\\/]/).pop();
    artifacts.push({
      platform, arch,
      /* encodeURIComponent, not the raw name: electron-builder writes "dika.studio Setup 1.0.0.exe"
         and a space in a URL is not a URL. GitHub serves the encoded form. */
      url: base + '/' + encodeURIComponent(name),
      sha512: await digest(abs),
      sizeBytes: statSync(abs).size,
    });
    console.log('  ' + platform + '  ' + name + '  ' + (statSync(abs).size / 1048576).toFixed(1) + ' MB');
  }
  if (!artifacts.length) throw new Error('name at least one of --win / --linux / --mac');
  const payload = {
    version: arg('version', true),
    channel: arg('channel', false) || 'stable',
    issuedAt: new Date().toISOString(),
    minKeyId: arg('key-id', false) || '2026-08',
    rollout: Number(arg('rollout', false) || 100),
    important: process.argv.includes('--important'),
    notes: arg('notes', false) || '',
    artifacts,
  };
  const out = resolve(arg('out', true));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2) + String.fromCharCode(10));
  console.log('payload -> ' + out + '   (version ' + payload.version + ', ' + artifacts.length + ' artifact(s))');
} else if (cmd === 'sign') {
  const payloadBytes = readFileSync(resolve(arg('in', true)));
  JSON.parse(payloadBytes.toString('utf8'));           // fail early on a payload that is not JSON
  const doc = signManifest(payloadBytes, readFileSync(resolve(arg('key', true)), 'utf8'), arg('key-id', true));
  const out = resolve(arg('out', true));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log('signed -> ' + out + '   (' + payloadBytes.length + ' payload bytes, keyId ' + doc.keyId + ')');
} else if (cmd === 'verify') {
  const doc = JSON.parse(readFileSync(resolve(arg('in', true)), 'utf8'));
  const payload = verifyManifest(doc, readFileSync(resolve(arg('pub', true)), 'utf8'));
  console.log('signature OK. version ' + payload.version + ', channel ' + payload.channel);
} else if (cmd) {
  throw new Error('unknown command: ' + cmd);
}
