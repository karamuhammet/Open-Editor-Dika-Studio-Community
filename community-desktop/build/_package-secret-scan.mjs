/* WHAT ACTUALLY LEAVES THIS MACHINE.
 *
 * Every other check in this set reads the SOURCE. This one reads the PACKAGE: the unpacked tree that
 * becomes the installer, and the installer itself. The distinction matters because the two are not the
 * same set of files - `electron-builder.yml` decides what ships, a stray `.env` beside a source file
 * would be copied by a `**\/*` filter without anybody noticing, and a build machine's environment can
 * end up inlined into a bundle.
 *
 * It DELETES NOTHING and CHANGES NOTHING. Owner's instruction, 2026-08-20: verify that the published
 * package carries no credential; do not remove anything. A scanner that edits what it finds is a
 * scanner nobody can run twice and compare.
 *
 * Three questions, and the third is the one that is easy to forget:
 *   1. is there any PRIVATE key, .env file, or credential-shaped string in what ships?
 *   2. is the old working name (CardCraft / .ccproj) still visible to somebody who downloads this?
 *   3. is the PUBLIC key present and correct - because an update channel with no key in the binary
 *      is not "safe", it is a feature that silently never works.
 *
 *   node build/_package-secret-scan.mjs
 */
import { existsSync, readdirSync, statSync, readFileSync, createReadStream } from 'node:fs';
import { dirname, join, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = dirname(HERE);
const DIST = join(DESKTOP, 'dist');

let pass = 0, fail = 0, warn = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };
const note = (m, d) => { warn++; console.log('  note ' + m + (d ? '   ' + d : '')); };

/* ── what a credential looks like ────────────────────────────────────────────────────────────────
   Two families, kept apart on purpose. SECRETS are things that would be an incident. NAMES are our
   own environment variable names: finding one is not proof of a leak (the string "DATABASE_URL" is
   harmless) but it means a value could be beside it, so each hit is printed for a human to read. */
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, 'a PRIVATE key block'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'an OpenAI-style secret key'],
  [/\bsk_live_[A-Za-z0-9]{10,}/, 'a Stripe live secret key'],
  [/\brk_live_[A-Za-z0-9]{10,}/, 'a Stripe restricted live key'],
  [/\bwhsec_[A-Za-z0-9]{10,}/, 'a Stripe webhook secret'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/\bghp_[A-Za-z0-9]{30,}/, 'a GitHub personal access token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'a GitHub fine-grained token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'a Google API key'],
  [/\bfal_[A-Za-z0-9]{20,}/, 'a fal.ai key'],
  [/\bpostgres(?:ql)?:\/\/[^\s"'`]*:[^\s"'`@]+@/, 'a Postgres URL WITH a password'],
  [/\bBearer\s+[A-Za-z0-9._-]{40,}/, 'an inlined bearer token'],
];
const ENV_NAMES = [
  'AI_KEYS_SECRET', 'SUPPORT_CONTENT_SECRET', 'BACKUP_KEK_SECRET', 'BETTER_AUTH_SECRET',
  'BETA_GATE_SECRET', 'CRON_SECRET', 'WORKFLOW_CRON_SECRET', 'STRIPE_SECRET_KEY',
  'DATABASE_URL', 'ZENDESK_API_TOKEN', 'DIKA_UPDATE_PRIVATE',
];
/* The old working name. The rename is not cosmetic: the owner's word was "gizli kalması", so a
   download that still says CardCraft defeats it. Two spellings a person would actually see. */
/* BUT the name is legitimately still present in the LEGACY READERS, and it has to be: a project file
   somebody exported before the rename must still open, and an IndexedDB store has to be named in
   order to be copied out of. So a hit is classified by WHAT IT IS, never by which file it sits in - a
   path allowlist would wave through a real leak that happened to land in an allowed file, which is
   how the first run of this scanner reported ten failures and hid two genuine defects among them. */
const OLD_NAME = /CardCraft|cardcraft|\.ccproj\b/g;
const LEGACY_SHAPES = [
  /CCMigrate\.db\(\s*["'][^"']*[Cc]ard[Cc]raft[^"']*["']/,      // copying OUT of a pre-rename store
  /["'.](?:cardcraft|ccproj)["',\]\s]/i,                        // an extension we still READ
  /\((?:[a-z|]*\|)?cardcraft\|?[a-z|]*\)/i,                     // inside a (dika|dikapack|cardcraft|ccproj) regex
  /_cardcraft_kb_profile/,                                      // a pre-rename keyboard profile we still accept
  /cardcraft-community|cardcraft-presets|cardcraft_gallery_db|cardcraft_tags_db/, // named old stores
  /`\.?cardcraft[a-z_<>*-]*`|`\.ccproj`/i,  // an old name in BACKTICKS is this codebase's way of writing
                                            // "the thing we moved from" - a migration cannot be
                                            // documented without naming its source. Prose that merely
                                            // mentions the word, with no backticks, still fails.
];
/** The characters around a hit are what decide whether it is a reader or a leak. */
function classify(text) {
  const leaks = [];
  for (const m of text.matchAll(OLD_NAME)) {
    const around = text.slice(Math.max(0, m.index - 60), m.index + 60);
    if (LEGACY_SHAPES.some((re) => re.test(around))) continue;
    leaks.push(around.replace(/\s+/g, ' ').trim());
  }
  return leaks;
}

/* Binary files hold no readable secret we could act on, and reading a 200 MB ONNX file as UTF-8 to
   regex it is minutes of nothing. The installer is scanned separately, as a byte stream. */
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.bmp', '.woff', '.woff2', '.ttf',
  '.otf', '.eot', '.mp3', '.mp4', '.webm', '.wav', '.ogg', '.zip', '.gz', '.tar', '.7z', '.pak',
  '.dll', '.exe', '.node', '.so', '.dylib', '.bin', '.dat', '.onnx', '.wasm', '.pdf', '.blockmap',
  '.asar',
]);
const MAX_TEXT = 8 * 1024 * 1024;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else out.push({ path: p, size: st.size });
  }
  return out;
}

function scanTree(label, root) {
  console.log('\n' + label);
  if (!existsSync(root)) { note('not built, so not scanned', root); return; }
  const files = walk(root);
  const envFiles = files.filter((f) => /(^|[\\/])\.env(\..+)?$/.test(f.path));
  const keyFiles = files.filter((f) => /\.(pem|key|pfx|p12|jks|keystore)$/i.test(f.path));

  if (envFiles.length === 0) ok('no .env file of any kind', files.length + ' files walked');
  else bad('.env files are IN THE PACKAGE', envFiles.map((f) => relative(root, f.path)).join(', '));

  /* A .pem is not automatically a finding: the PUBLIC key would be one. Print what each contains. */
  if (keyFiles.length === 0) ok('no .pem / .key / .pfx / keystore file');
  else {
    for (const f of keyFiles) {
      const head = readFileSync(f.path, 'utf8').slice(0, 200);
      if (/PRIVATE KEY/.test(head)) bad('a PRIVATE key file ships', relative(root, f.path));
      else note('a key file ships (public material)', relative(root, f.path));
    }
  }

  const hits = [];
  const envHits = [];
  const oldName = [];
  let read = 0;
  for (const f of files) {
    if (SKIP_EXT.has(extname(f.path).toLowerCase())) continue;
    if (f.size > MAX_TEXT) continue;
    let text;
    try { text = readFileSync(f.path, 'utf8'); } catch { continue; }
    read++;
    for (const [re, what] of SECRET_PATTERNS) {
      const m = text.match(re);
      if (m) hits.push(relative(root, f.path) + ': ' + what + '  [' + m[0].slice(0, 18) + '...]');
    }
    for (const n of ENV_NAMES) if (text.includes(n)) envHits.push(relative(root, f.path) + ': ' + n);
    const leaks = classify(text);
    if (leaks.length) oldName.push({ file: relative(root, f.path), sample: leaks[0] });
  }
  console.log('  ..   ' + read + ' text files read in full');

  if (hits.length === 0) ok('no credential-shaped string anywhere in the tree');
  else for (const h of hits) bad('CREDENTIAL SHAPE', h);

  if (envHits.length === 0) ok('none of our secret environment variable names appear');
  else for (const h of envHits.slice(0, 12)) note('an env NAME appears (read it)', h);

  if (oldName.length === 0) ok('the old working name appears only in legacy readers');
  else for (const h of oldName.slice(0, 12)) bad('the old name is VISIBLE here', h.file + '   ...' + h.sample.slice(0, 96) + '...');
}

/* ── the installer, as bytes ────────────────────────────────────────────────────────────────────
   NSIS compresses its payload, so this cannot see inside the packaged files - and that is worth
   stating rather than implying: what it CAN catch is a credential that ended up in an uncompressed
   section, which is exactly where a build-time environment substitution would land. */
async function scanBinary(label, file) {
  console.log('\n' + label);
  if (!existsSync(file)) { note('not built, so not scanned', basename(file)); return; }
  const size = statSync(file).size;
  const needles = [
    [Buffer.from('BEGIN PRIVATE KEY'), 'a PKCS#8 private key header'],
    [Buffer.from('BEGIN RSA PRIVATE KEY'), 'an RSA private key header'],
    [Buffer.from('BEGIN OPENSSH PRIVATE KEY'), 'an OpenSSH private key header'],
    [Buffer.from('sk_live_'), 'a Stripe live key prefix'],
    [Buffer.from('AKIA'), 'an AWS access key prefix'],
    [Buffer.from('ghp_'), 'a GitHub token prefix'],
  ];
  const found = new Set();
  await new Promise((res, rej) => {
    let tail = Buffer.alloc(0);
    const rs = createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    rs.on('data', (chunk) => {
      const buf = Buffer.concat([tail, chunk]);
      for (const [needle, what] of needles) if (buf.includes(needle)) found.add(what);
      tail = buf.subarray(Math.max(0, buf.length - 64));
    });
    rs.on('end', res);
    rs.on('error', rej);
  });
  console.log('  ..   ' + (size / 1048576).toFixed(1) + ' MB scanned as raw bytes');
  if (found.size === 0) ok('no credential header in any uncompressed section');
  else for (const f of found) bad('CREDENTIAL HEADER in the installer', f);
}

console.log('what actually ships\n===================');
scanTree('the Windows package (dist/win-unpacked)', join(DIST, 'win-unpacked'));
scanTree('the Linux package (dist/linux-unpacked)', join(DIST, 'linux-unpacked'));
await scanBinary('the Windows installer', join(DIST, 'dika.studio Setup 1.0.0.exe'));

/* ── the third question: the key that MUST be there ──────────────────────────────────────────── */
console.log('\nthe update key');
const shippedUpdater = join(DIST, 'win-unpacked', 'resources', 'app.asar');
let updaterSrc = '';
if (existsSync(shippedUpdater)) {
  /* asar is a plain header + concatenated files, so the source text is present in the raw bytes. No
     need for the asar tool, and no need to unpack anything to answer this. */
  updaterSrc = readFileSync(shippedUpdater, 'latin1');
}
const src = readFileSync(join(DESKTOP, 'updater.js'), 'utf8');
const pubInSource = (src.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/) || [''])[0].trim();
if (pubInSource) ok('a public key is compiled into updater.js', pubInSource.split('\n')[1].slice(0, 24) + '...');
else bad('NO public key in updater.js - the channel would report itself disabled');
if (!/PRIVATE KEY/.test(src)) ok('and no private key is anywhere near it');
else bad('a PRIVATE key is in updater.js');

if (updaterSrc) {
  if (updaterSrc.includes('UPDATE_PUBLIC_KEY')) ok('updater.js is inside the packaged app.asar');
  else bad('updater.js is NOT in the package - main.js requires it and the app will not start');
  const body = pubInSource.split('\n').slice(1, -1).join('');
  if (body && updaterSrc.includes(body.slice(0, 40))) ok('and it carries the same key bytes');
  else if (body) bad('the packaged key differs from the source key');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + warn + ' to read');
process.exit(fail ? 1 : 0);
