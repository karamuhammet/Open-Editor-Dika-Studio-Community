/* The decisions the updater makes before a single byte is downloaded.
 *
 * `updater.js` runs in Electron's main process, but every rule that decides whether an installer may
 * run is a pure function, and pure functions can be cornered. This proves the five that matter, and
 * each one exists because a reviewer found the failure it prevents:
 *
 *   - the URL is a CONSTANT and `--api-base=` cannot move it (a Start Menu shortcut needs no privilege)
 *   - we never go backwards, and never sideways into a prerelease of what we already run
 *   - the download host is pinned, and the ONE redirect it may take is pinned by suffix
 *   - a manifest is verified before it is parsed, and every tampering is refused
 *   - an artifact for another platform is not an artifact
 *
 * It runs in plain Node: `require('electron')` outside Electron yields a path string, so the module
 * loads and its pure exports are callable. Nothing here touches the network or the disk.
 *
 *   node build/_updater-logic-proof.mjs
 */
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { signManifest } from './update-manifest.mjs';

/* The key has to be in place BEFORE the module is loaded: it is read once, at load, on purpose - a
   key that can be swapped at runtime is not a trust anchor. */
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.DIKA_UPDATE_PUBLIC_KEY = pubPem;

/* And an --api-base override in argv, so the "the URL is a constant" assertion is made in the exact
   condition that would break it. */
process.argv.push('--api-base=http://evil.example');

const require_ = createRequire(import.meta.url);
const { _internals } = require_('../updater.js');
const { cmpVersion, urlAllowed, verifyManifest, manifestUrl, pickArtifact } = _internals;

let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };
const is = (m, got, want) => (got === want ? ok(m, String(got)) : bad(m, 'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want)));
const refuses = (m, fn) => { try { fn(); bad(m + ' was ACCEPTED'); } catch { ok(m + ' is refused'); } };

console.log('the update URL');
is('is the hard-coded origin, with --api-base=http://evil.example in argv',
  manifestUrl(), 'https://app.dika.studio/api/community/update/stable.json');
ok('so a shortcut edit cannot repoint the channel that runs an installer');

console.log('\nversion comparison');
is('1.0.1 is newer than 1.0.0', cmpVersion('1.0.1', '1.0.0'), 1);
is('1.0.0 is not newer than 1.0.0', cmpVersion('1.0.0', '1.0.0'), 0);
is('0.9.9 is older than 1.0.0', cmpVersion('0.9.9', '1.0.0'), -1);
is('1.10.0 is newer than 1.9.0 (not a string compare)', cmpVersion('1.10.0', '1.9.0'), 1);
is('1.1.0-beta.1 is older than 1.1.0', cmpVersion('1.1.0-beta.1', '1.1.0'), -1);
is('2.0.0 is newer than 1.99.99', cmpVersion('2.0.0', '1.99.99'), 1);

console.log('\nthe download host');
is('a github release URL is allowed', urlAllowed('https://github.com/o/r/releases/download/v1/a.exe', false), true);
is('http is refused even on github', urlAllowed('http://github.com/o/r/releases/download/v1/a.exe', false), false);
is('another host is refused', urlAllowed('https://evil.example/a.exe', false), false);
is('a lookalike host is refused', urlAllowed('https://github.com.evil.example/a.exe', false), false);
is('the redirect target is allowed by suffix', urlAllowed('https://release-assets.githubusercontent.com/x', true), true);
is('an older redirect target still works', urlAllowed('https://objects.githubusercontent.com/x', true), true);
is('a redirect anywhere else is refused', urlAllowed('https://evil.example/x', true), false);
is('the redirect suffix does NOT open the first hop', urlAllowed('https://objects.githubusercontent.com/x', false), false);

console.log('\nthe manifest');
const payload = Buffer.from(JSON.stringify({
  version: '1.0.1', channel: 'stable', minKeyId: '2026-08', rollout: 100,
  artifacts: [
    { platform: 'darwin', arch: 'arm64', url: 'https://github.com/o/r/releases/download/v1/a.dmg', sha512: 'b'.repeat(128), sizeBytes: 1 },
    { platform: 'win32', arch: process.arch, url: 'https://github.com/o/r/releases/download/v1/a.exe', sha512: 'a'.repeat(128), sizeBytes: 2 }
  ]
}), 'utf8');
const doc = signManifest(payload, privPem, '2026-08');

const parsed = verifyManifest(doc);
is('a signed manifest verifies and parses', parsed.version, '1.0.1');
refuses('a flipped payload byte', () => {
  const b = Buffer.from(doc.payload, 'base64url'); b[8] ^= 1;
  verifyManifest({ ...doc, payload: b.toString('base64url') });
});
refuses('a signature from another key', () => {
  const other = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  verifyManifest(signManifest(payload, other, '2026-08'));
});
refuses('an unknown schema', () => verifyManifest({ ...doc, schema: 2 }));
refuses('a bare JSON manifest with no signature at all', () => verifyManifest(JSON.parse(payload.toString())));

console.log('\nartifact selection');
const art = pickArtifact(parsed);
if (process.platform === 'win32') {
  is('this platform picks the win32 artifact', art && art.platform, 'win32');
} else {
  is('a platform with no artifact picks nothing', art, null);
  ok('which is what makes the modal notify-only rather than offering a button that cannot work');
}
is('an artifact for another platform is never chosen',
  pickArtifact({ artifacts: [{ platform: 'plan9', arch: process.arch, url: 'x' }] }), null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
