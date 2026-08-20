/* THE LAST QUESTION BEFORE A PRIVATE REPOSITORY BECOMES A PUBLIC ONE:
 * is there anything in here that belongs to us and not to them?
 *
 * `apps/community-desktop/build/_package-secret-scan.mjs` reads the BUILT PACKAGE. This reads the
 * SOURCE TREES that get pushed, which is a different and larger surface: the package ships no
 * `tools/`, no proof harness, no README and no dot-file, and a public repository ships all of them.
 *
 * Seven questions, in the order a mistake would actually cost something:
 *   1. a credential of any shape, or a file that normally holds one
 *   2. our own environment variable NAMES, which point at where a value would go
 *   3. a private host, an internal path or an admin surface a stranger should not learn about
 *   4. personal data: a real person's address, an operator's account, a machine's home directory
 *   5. code from the COMMERCIAL editor that this fork is supposed to have removed
 *   6. leftovers: swap files, backups, archives
 *   7. what the app tells the network it will do, checked against the hosts in the code
 *
 * TWO RULES THAT CAME OUT OF THE FIRST RUN, both because it reported thirty failures and two defects:
 *   - A MENTION IS NOT A USE. `core/no-server.js` IS the permanently-inactive CCRemote stub and half
 *     the fork carries comments naming the vendor feature that was deleted. Testing for the NAME is
 *     noise; each pattern below describes a live call.
 *   - A FINDING IN A TOOL IS NOT A FINDING IN THE PRODUCT. A scanner has to name what it looks for,
 *     and a build script has to name a path. Those are reported to be READ, not failed.
 *
 *   node tools/_publish-exposure-scan.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITOR = dirname(dirname(fileURLToPath(import.meta.url)));
const DESKTOP = join(dirname(EDITOR), 'community-desktop');
const SEP = String.fromCharCode(92);
const SLASH = String.fromCharCode(47);
const HASH = String.fromCharCode(35);
const NUL = String.fromCharCode(0);
const NL = String.fromCharCode(10);

let pass = 0, fail = 0, note = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };
const say = (m, d) => { note++; console.log('  read ' + m + (d ? '   ' + d : '')); };

/* ── 1. credential shapes ─────────────────────────────────────────────────────────────────────── */
const SECRETS = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, 'a PRIVATE key block'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'an OpenAI-style secret key'],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{10,}/, 'a Stripe live key'],
  [/\bwhsec_[A-Za-z0-9]{10,}/, 'a Stripe webhook secret'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'a GitHub fine-grained token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'a Google API key'],
  [/\b(?:fal|hf|dop_v1)[_-][A-Za-z0-9]{24,}/, 'a vendor API key'],
  [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'`]*:[^\s"'`@]+@/, 'a connection string WITH a password'],
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, 'a JWT'],
  [/\bBearer\s+[A-Za-z0-9._-]{40,}/, 'an inlined bearer token'],
  /* An ASSIGNED literal. Deliberately NOT `api_key=` inside a string: that is a query parameter being
     BUILT from a value the person typed into Settings, which is the opposite of a hardcoded key. */
  [/\b(?:password|passwd|apiSecret|api[_-]?key|access[_-]?token)\s*[:=]\s+["'][A-Za-z0-9_-]{16,}["']/i,
    'an assigned secret-looking value'],
];
const ENV_NAMES = [
  'AI_KEYS_SECRET', 'SUPPORT_CONTENT_SECRET', 'BACKUP_KEK_SECRET', 'BETTER_AUTH_SECRET',
  'BETA_GATE_SECRET', 'CRON_SECRET', 'WORKFLOW_CRON_SECRET', 'STRIPE_SECRET_KEY', 'DATABASE_URL',
  'ZENDESK_API_TOKEN', 'S3_SECRET', 'AWS_SECRET_ACCESS_KEY', 'DIKA_UPDATE_PRIVATE',
  'CLAUDE_AGENT_EMAIL', 'CLAUDE_AGENT_PASSWORD', 'SMTP_PASS',
];
/* Hosts and paths describing OUR infrastructure rather than the product's own public surface. */
const INTERNAL = [
  [/localhost:300[12]|127\.0\.0\.1:300[12]/, 'an internal dev console port (:3001 / :3002)'],
  [/\badmin\.dika\.design\b/, 'the admin console hostname'],
  [/\b(?:3\.77\.56\.101|116\.202\.15\.110)\b/, 'a server IP'],
  [/\/api\/(?:admin|internal|cron)\//, 'an admin/internal/cron endpoint path'],
  [/D:[\\/]Cursor[\\/]/i, 'an absolute path on the build machine'],
  [/C:[\\/]Users[\\/][A-Za-z0-9_.-]+/i, 'a home directory on the build machine'],
  [/\bcardcraft:cardcraft@|cartcraft-backups\b/, 'the internal database or backup naming'],
];
const PERSONAL = [
  [/karamuhammetcan@gmail\.com/i, "the owner's personal email"],
  [/claude-agent@cardcraft\.local/i, 'the dev agent account'],
  [/\bcan@test\.local\b/i, 'a dev login'],
];
/* Each of these describes a LIVE call, never a name. See the header. */
const COMMERCIAL = [
  [/fetch\(\s*["'`][^"'`]*\/api\/proxy/, 'a live fetch to the managed AI proxy'],
  [/CCRemote\.active\s*=\s*(?:true|1)\b/, 'something switching the remote-save client ON'],
  [/decideManagedCall|ai_wallet_period|managedBlocked/, 'the managed-AI money path'],
  [/proxyBase\s*=\s*["'][^"']*\/api\/proxy/, 'the AI proxy configured as a base URL'],
];

const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.bmp', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.webm', '.wav', '.ogg', '.zip', '.gz',
  '.tar', '.7z', '.exe', '.dll', '.node', '.so', '.dylib', '.bin', '.dat', '.onnx', '.wasm', '.pdf',
  '.asar', '.blockmap', '.pak']);
const SKIP_DIR = new Set(['node_modules', '.git', '.impeccable']);
const MAX = 12 * 1024 * 1024;

/* THE QUESTION IS WHAT GIT WOULD PUBLISH, NOT WHAT IS ON DISK, and the two differ by two gigabytes.
   So the walk honours each root's own `.gitignore` rather than a list kept here: a directory added to
   that file silences this scan, and a root with NO .gitignore is NOT quietly forgiven - that absence
   is itself the finding, which is how `apps/community-desktop/dist` (2.0 GB of installers and two
   unpacked Electron trees) was caught on its way into a public repository. */
function ignoreRules(root) {
  const f = join(root, '.gitignore');
  if (!existsSync(f)) return null;
  return readFileSync(f, 'utf8')
    .split(NL)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l[0] !== HASH)
    .map((l) => l.replace(/^\//, '').replace(/\/$/, ''));
}
function walk(dir, out, rules, root) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const rel = relative(root, p).split(SEP).join(SLASH);
    if (rules && rules.some((r) => r === name || r === rel
      || (r[0] === '*' && name.endsWith(r.slice(1))))) continue;
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out, rules, root); else out.push({ path: p, size: st.size });
  }
  return out;
}

function scan(label, root) {
  console.log(NL + label + '   ' + root);
  if (!existsSync(root)) { say('not present, so not scanned'); return; }

  const rules = ignoreRules(root);
  if (!rules) {
    bad('THERE IS NO .gitignore HERE, so everything on disk would be published',
      'build output and node_modules included');
  }
  const files = walk(root, [], rules, root);

  /* Files that normally hold a credential, by NAME. Finding none is a stronger statement than finding
     no matching string, because a format we do not recognise still lands here. */
  const risky = files.filter((f) => /(^|[\\/])\.env(\..+)?$|\.(pem|key|pfx|p12|jks|keystore|ppk|asc|gpg)$|(^|[\\/])(id_rsa|id_ed25519|\.npmrc|\.netrc|credentials)$/i.test(f.path));
  if (risky.length === 0) ok('no .env, key, keystore or credentials file', files.length + ' files would be published');
  else for (const f of risky) bad('a credential-bearing FILE is here', relative(root, f.path));

  const junk = files.filter((f) => /\.(bak|orig|rej|swp|swo|old)$|~$|(^|[\\/])(Thumbs\.db|\.DS_Store)$|-backup-|\.zip$/i.test(f.path));
  if (junk.length === 0) ok('no backups, swap files or archives');
  else for (const f of junk.slice(0, 8)) bad('a leftover file would be published', relative(root, f.path));

  const found = { secret: [], env: [], internal: [], personal: [], commercial: [] };
  const inTool = { env: [], internal: [] };
  let read = 0;
  for (const f of files) {
    if (SKIP_EXT.has(extname(f.path).toLowerCase()) || f.size > MAX) continue;
    let t; try { t = readFileSync(f.path, 'utf8'); } catch { continue; }
    if (t.indexOf(NUL) >= 0) continue;                    // a binary with no extension
    read++;
    const rel = relative(root, f.path);
    /* A build script has to name a path, and a scanner has to name what it looks for. */
    const isTool = /^(tools|build)[\\/]/.test(rel);
    for (const [re, what] of SECRETS) {
      const m = t.match(re);
      if (m) found.secret.push(rel + ': ' + what + '  [' + m[0].slice(0, 20) + ']');
    }
    for (const n of ENV_NAMES) if (t.includes(n)) (isTool ? inTool.env : found.env).push(rel + ': ' + n);
    for (const [re, what] of INTERNAL) {
      const m = t.match(re);
      if (m) (isTool ? inTool.internal : found.internal).push(rel + ': ' + what + '  [' + m[0].slice(0, 40) + ']');
    }
    for (const [re, what] of PERSONAL) if (re.test(t)) found.personal.push(rel + ': ' + what);
    if (!isTool) for (const [re, what] of COMMERCIAL) if (re.test(t)) found.commercial.push(rel + ': ' + what);
  }
  console.log('  ..   ' + read + ' text files read in full');

  const report = (hits, okMsg, badMsg, level) => {
    const uniq = [...new Set(hits)];
    if (uniq.length === 0) { if (level !== 'read') ok(okMsg); return; }
    for (const h of uniq.slice(0, 10)) (level === 'read' ? say : bad)(badMsg, h);
    if (uniq.length > 10) console.log('       ...and ' + (uniq.length - 10) + ' more of the same');
  };
  report(found.secret, 'no credential-shaped string anywhere', 'CREDENTIAL');
  report(found.env, 'no secret environment variable name in shipped code', 'an env NAME in shipped code');
  report(found.internal, 'nothing describing our own infrastructure', 'INTERNAL DETAIL');
  report(found.personal, 'no real person or dev account named', 'PERSONAL DATA');
  report(found.commercial, 'no live commercial-edition call', 'COMMERCIAL CODE');
  report(inTool.env, '', 'an env name inside a tool (a detector must name what it seeks)', 'read');
  report(inTool.internal, '', 'a local path inside a tool', 'read');
}

console.log('what a public repository would carry');
console.log('===================================');
scan('the editor (this IS the repo root)', EDITOR);
scan('the desktop shell', DESKTOP);

/* ── 7. the network claim: ASKED, NOT RE-ANSWERED ───────────────────────────────────────────────
 * This used to keep its own copy of "which hosts are fine" beside the one in
 * _network-claim-proof.mjs. Two lists, one question: the drift that rule 17 exists to stop, and I
 * wrote it into my own tooling within an hour of warning about it. That proof OWNS the network
 * claim - it holds CCEdition.NETWORK, the explicit-action set and the text-only set - so this one
 * runs it and reports its verdict rather than forming a second opinion. */
console.log(NL + 'what it says it will do on the network');
try {
  const out = execFileSync(process.execPath, [join(EDITOR, 'tools', '_network-claim-proof.mjs')],
    { encoding: 'utf8' });
  const tail = out.trim().split(NL).slice(-1)[0];
  ok('_network-claim-proof.mjs owns this question and passes', tail);
} catch (e) {
  const out = String(e.stdout || '');
  for (const l of out.split(NL)) if (l.includes('THE CODE CAN REACH')) bad(l.replace(/.*FAIL */, ''));
  if (!out.includes('THE CODE CAN REACH')) bad('_network-claim-proof.mjs fails', String(e.message).slice(0, 120));
}
console.log(NL + pass + ' passed, ' + fail + ' failed, ' + note + ' to read');
process.exit(fail ? 1 : 0);
