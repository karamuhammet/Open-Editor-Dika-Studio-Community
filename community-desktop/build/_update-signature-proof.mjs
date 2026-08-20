/* The manifest signature is verified by SOMEBODY ELSE'S implementation.
 *
 * `build/update-manifest.mjs` signs with `node:crypto` and verifies with `node:crypto`. Two halves of
 * one library agreeing proves only that the author was consistent, including consistently wrong - the
 * same lesson the data-export work learned by checking its AES-256 archives with pyzipper rather than
 * with its own reader.
 *
 * So this signs with ours and verifies with **OpenSSL**, over the exact bytes that would be served, and
 * then proves the negatives: a flipped byte in the payload, a flipped byte in the signature, a wrong
 * key, a missing domain separator, and a tampered schema must all be REFUSED.
 *
 *   node build/_update-signature-proof.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { signManifest, verifyManifest, signingInput, DOMAIN } from './update-manifest.mjs';

let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };
const refuses = (m, fn) => { try { fn(); bad(m + ' was ACCEPTED'); } catch { ok(m + ' is refused'); } };

const dir = mkdtempSync(join(tmpdir(), 'dika-sig-'));
try {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const pubPath = join(dir, 'pub.pem');
  writeFileSync(pubPath, pubPem);

  /* A payload shaped like a real one, including the fields the client will read. */
  const payloadBytes = Buffer.from(JSON.stringify({
    version: '1.0.1', channel: 'stable', issuedAt: '2026-08-16T00:00:00.000Z',
    minKeyId: '2026-08', rollout: 100, important: false,
    notes: 'Fixes a crash when importing a .dikapack with no media.',
    artifacts: [{
      platform: 'win32', arch: 'x64',
      url: 'https://github.com/karamuhammet/Open-Editor-Dika-Studio-Community/releases/download/v1.0.1/dika.studio.Setup.1.0.1.exe',
      sha512: 'a'.repeat(128), sizeBytes: 181000000
    }]
  }), 'utf8');

  const doc = signManifest(payloadBytes, privPem, '2026-08');
  const served = JSON.stringify(doc, null, 2) + '\n';
  writeFileSync(join(dir, 'stable.json'), served);

  console.log('signed manifest, verified by a third party');

  /* ── OpenSSL, over the exact bytes a client would reconstruct from what we serve ─────────────── */
  const reparsed = JSON.parse(served);
  const bytesToVerify = signingInput(Buffer.from(reparsed.payload, 'base64url'));
  writeFileSync(join(dir, 'signed-input.bin'), bytesToVerify);
  writeFileSync(join(dir, 'sig.bin'), Buffer.from(reparsed.signature, 'base64url'));

  let opensslSaid = '';
  try {
    opensslSaid = execFileSync('openssl', [
      'pkeyutl', '-verify', '-pubin', '-inkey', pubPath, '-rawin',
      '-in', join(dir, 'signed-input.bin'), '-sigfile', join(dir, 'sig.bin')
    ], { encoding: 'utf8' }).trim();
  } catch (e) {
    opensslSaid = 'FAILED: ' + String(e.stderr || e.message).trim();
  }
  ok('openssl verifies our signature', opensslSaid);
  if (!/Signature Verified Successfully/i.test(opensslSaid)) {
    fail++; pass--;
    console.log('  FAIL openssl did not report success:', opensslSaid);
  }

  /* And openssl must REFUSE a flipped byte, or the check above proves nothing. */
  const tamperedInput = Buffer.from(bytesToVerify);
  tamperedInput[tamperedInput.length - 5] ^= 0x01;
  writeFileSync(join(dir, 'tampered.bin'), tamperedInput);
  try {
    execFileSync('openssl', ['pkeyutl', '-verify', '-pubin', '-inkey', pubPath, '-rawin',
      '-in', join(dir, 'tampered.bin'), '-sigfile', join(dir, 'sig.bin')], { stdio: 'pipe' });
    bad('openssl ACCEPTED a tampered payload');
  } catch { ok('openssl refuses a tampered payload'); }

  /* ── our own verifier, and every negative it has to catch ───────────────────────────────────── */
  const round = verifyManifest(reparsed, pubPem);
  ok('our verifier accepts and parses', 'version ' + round.version);
  if (round.artifacts[0].sizeBytes !== 181000000) bad('the payload did not survive the round trip');

  refuses('a flipped byte in the payload', () => {
    const b = Buffer.from(reparsed.payload, 'base64url');
    b[10] ^= 0x01;
    verifyManifest({ ...reparsed, payload: b.toString('base64url') }, pubPem);
  });
  refuses('a flipped byte in the signature', () => {
    const b = Buffer.from(reparsed.signature, 'base64url');
    b[0] ^= 0x01;
    verifyManifest({ ...reparsed, signature: b.toString('base64url') }, pubPem);
  });
  refuses('a different key', () => {
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
    verifyManifest(reparsed, other);
  });
  refuses('an unknown schema', () => verifyManifest({ ...reparsed, schema: 99 }, pubPem));
  refuses('a missing signature', () => verifyManifest({ ...reparsed, signature: undefined }, pubPem));

  /* Domain separation: the same bytes signed WITHOUT the prefix must not verify as a manifest. This is
     the property that stops one signature being replayed as another protocol's. */
  const { sign } = await import('node:crypto');
  const naked = sign(null, payloadBytes, privateKey);
  refuses('a signature made without the domain separator',
    () => verifyManifest({ ...reparsed, signature: naked.toString('base64url') }, pubPem));
  ok('the domain separator is part of the signed input', JSON.stringify(DOMAIN));

  /* The one property nobody notices until it breaks: what we serve is what was signed, byte for byte. */
  const servedPayload = Buffer.from(JSON.parse(readFileSync(join(dir, 'stable.json'), 'utf8')).payload, 'base64url');
  ok('the served bytes are the signed bytes', servedPayload.equals(payloadBytes) ? 'identical' : 'DIFFERENT');
  if (!servedPayload.equals(payloadBytes)) { fail++; pass--; }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
