/* Every surface that describes what this build sends must agree with ONE enumerated list.
 *
 * The build has told three different stories about its own network behaviour at once. `SECURITY.md`
 * says "the build makes no network request of its own", which stopped being true the day the beacon
 * shipped; `README.md` counts three; `core/edition.js` counts three in a comment. Each was written
 * truthfully and then a feature landed. Nobody was lying and the documents were wrong anyway, which is
 * exactly the failure a checker exists for.
 *
 * THE LIST IS `CCEdition.NETWORK` in `core/edition.js`, and it is the only place a request may be
 * declared. This reads it, then reads every surface, and fails when any of them disagrees about HOW
 * MANY requests there are or WHICH HOSTS they reach.
 *
 * It is deliberately a COUNT-AND-HOST check rather than a prose check: a sentence can be rewritten a
 * hundred ways and still be true, but "three" and "app.dika.studio" are facts, and a feature that adds
 * a fourth cannot land without this going red.
 *
 *   node tools/_network-claim-proof.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));
const INTERNAL_LAUNCH_COPY = join(REPO, 'docs', 'dika-studio-launch-copy.md');
const RELEASE_ROOT_README = join(dirname(ROOT), 'README.md');

const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const read = (p) => readFileSync(p, 'utf8');

/* ── the single source ─────────────────────────────────────────────────────────────────────────── */

const editionSrc = read(join(ROOT, 'core', 'edition.js'));
const block = editionSrc.match(/var NETWORK = \[([\s\S]*?)\n {2}\];/);
if (!block) {
  console.error('FAIL  core/edition.js has no `var NETWORK = [ ... ];` block.\n' +
    '      That list is the single source every other surface is checked against. Until it exists\n' +
    '      there is nothing to check, and every claim in the product is unverified.');
  process.exit(1);
}
const entries = [...block[1].matchAll(/\{[^}]*\bid:\s*'([^']+)'[^}]*\bhost:\s*'([^']+)'[^}]*\}/g)]
  .map((m) => ({ id: m[1], host: m[2] }));
const COUNT = entries.length;
const HOSTS = [...new Set(entries.map((e) => e.host))];

console.log('the enumerated list (core/edition.js):');
for (const e of entries) console.log('  ' + e.id.padEnd(18) + e.host);
console.log('  => ' + COUNT + ' request' + (COUNT === 1 ? '' : 's') + ', ' + HOSTS.length + ' host(s): ' + HOSTS.join(', '));

/* ── the surfaces ──────────────────────────────────────────────────────────────────────────────── */

/* `count` is a regex whose first capture is the number the file claims, as a word or a digit.
   `hosts` names the hosts that file must mention. A surface that states no count is not exempt: it is
   listed with `count: null` and only its hosts are checked, and adding one is a one-line change. */
/* Matched against WHITESPACE-NORMALISED text. These files are hard-wrapped at 100 columns, so a
   sentence reflows across a line break whenever it is edited, and a gate that goes red on reflow
   rather than on a disagreement is a gate people learn to ignore. */
const SURFACES = [
  { file: join(ROOT, 'README.md'), label: 'README.md',
    count: /That is all (\w+) of them/, hosts: HOSTS },
  { file: join(ROOT, 'SECURITY.md'), label: 'SECURITY.md',
    count: /build makes (\w+) network requests? of its own/, hosts: [] },
  { file: join(ROOT, 'core', 'edition.js'), label: 'core/edition.js (the comment above the list)',
    count: /added exactly (\w+):/, hosts: [] },
  { file: join(ROOT, 'modules', 'system', 'first-run', 'first-run.js'), label: 'first-run.js',
    count: null, hosts: [] },
  { file: join(ROOT, 'core', 'account.js'), label: 'core/account.js (Settings > Account)',
    count: null, hosts: [] },
  existsSync(INTERNAL_LAUNCH_COPY)
    ? { file: INTERNAL_LAUNCH_COPY, label: 'docs/dika-studio-launch-copy.md',
      count: /(\w+) requests, and here they are/, hosts: HOSTS }
    : { file: RELEASE_ROOT_README, label: '../README.md (repository root)',
      count: /That is all (\w+) of them/, hosts: HOSTS }
];

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok   ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('\nsurfaces');
for (const s of SURFACES) {
  let text;
  try { text = read(s.file); } catch { bad(s.label + ' is missing'); continue; }
  const flat = text.replace(/\s+/g, ' ');

  if (s.count) {
    const m = flat.match(s.count);
    if (!m) {
      bad(s.label + ' no longer states a count in the shape this checker knows (' + s.count + ')');
    } else {
      const claimed = WORD[String(m[1]).toLowerCase()] ?? Number(m[1]);
      if (claimed === COUNT) ok(s.label + ' says ' + m[1] + ', the list has ' + COUNT);
      else bad(s.label + ' says "' + m[1] + '" and the list has ' + COUNT + ' -> ' + m[0].trim());
    }
  }

  for (const h of s.hosts) {
    if (text.includes(h)) ok(s.label + ' names ' + h);
    else bad(s.label + ' never names ' + h + ', which the list says this build reaches');
  }
}

/* One claim that is not a count and is the one people actually rely on. */
const sec = read(join(ROOT, 'SECURITY.md'));
if (/makes no network request of its own/.test(sec)) {
  bad('SECURITY.md still says the build "makes no network request of its own", and the list has ' + COUNT);
} else {
  ok('SECURITY.md does not claim the build is silent');
}

/* ── THE HALF THIS PROOF WAS MISSING: THE CODE ──────────────────────────────────────────────────
 *
 * Everything above compares one CLAIM against another CLAIM. It read green while the shipped bundle
 * could reach eight hosts nobody had enumerated, because no assertion here ever asked the code a
 * question. A proof that checks a document against a document proves only that the author was
 * consistent - the same lesson the subprocessors page learned the expensive way.
 *
 * So: every host the shipped code can reach must be accounted for by exactly one of
 *   - CCEdition.NETWORK   what the build does on its own
 *   - EXPLICIT_ACTION     a request only a deliberate user action causes, which SECURITY.md must
 *                         describe in words
 *   - TEXT_ONLY           a URL that is displayed or linked, never fetched
 * and anything else fails, by name.
 */
const bundlePath = join(ROOT, 'dist', 'modules.bundle.js');
const coreDir = join(ROOT, 'core');
let codeText = '';
try { codeText += readFileSync(bundlePath, 'utf8'); } catch (e) { /* not built */ }
try {
  for (const f of readdirSync(coreDir)) if (f.endsWith('.js')) codeText += readFileSync(join(coreDir, f), 'utf8');
} catch (e) { /* no core */ }

/* Displayed, never fetched: a licence link, a schema namespace, a share target, our own site. Each
   is a claim somebody has to be able to check, so they are named rather than pattern-matched. */
const TEXT_ONLY = new Set([
  'w3.org', 'www.w3.org', 'schemas.openxmlformats.org', 'purl.org', 'gnu.org', 'www.gnu.org',
  'opensource.org', 'creativecommons.org', 'developer.mozilla.org', 'json-schema.org',
  'dika.studio', 'mirexagency.com', 'digitalco.io', 'example.com',
  'twitter.com', 'pinterest.com', 't.me', 'wa.me', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'npmjs.com', 'unpkg.com', 'github.io',
  /* share-menu targets: a link the person clicks, opened in their browser, never fetched here. */
  'www.facebook.com', 'www.instagram.com', 'www.linkedin.com', 'www.reddit.com',
  'www.tiktok.com', 'www.youtube.com',
  'web.dev',      // a documentation link printed in a console warning
  'x.invalid',    // a deliberately unresolvable base for parsing a relative URL
]);
/* Reached ONLY on a deliberate action, and SECURITY.md has to say so. */
const EXPLICIT_ACTION = new Set([
  'api.giphy.com', 'api.jamendo.com', 'api.pexels.com', 'api.unsplash.com', 'freesound.org',
  'pixabay.com', 'huggingface.co', 'cdn-lfs.huggingface.co',
  /* The Lottie panel queries LottieFiles when somebody opens it and searches. Nothing to vendor: it
     is a catalogue on somebody else's server, not a file. Declared rather than removed. */
  'graphql.lottiefiles.com',
]);
/* IN THE CODE AND NOT REACHABLE, each one a claim somebody can check by opening the file named here.
   This category exists because deleting a URL to make a scan quiet is the worst of both worlds: the
   feature loses the note explaining how to finish it, and the scan stops being able to tell an
   unreachable URL from one nobody has noticed yet. */
const UNREACHABLE = new Map([
  ['cdn.jsdelivr.net', 've-advanced-features.js: the MediaPipe face-mesh URL. Face tracking is ALPHA '
    + 'with its UI hidden (2026-07-18) and ~10 MB was deliberately not vendored for a surface nobody '
    + 'can open. The comment above the constant says to vendor it BEFORE making it visible.'],
]);

const codeHosts = [...new Set([...codeText.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)]
  .map((m) => m[1].toLowerCase()))].sort();
const unaccounted = codeHosts.filter((h) => !TEXT_ONLY.has(h) && !EXPLICIT_ACTION.has(h)
  && !UNREACHABLE.has(h) && !HOSTS.some((d) => h === d || h.endsWith('.' + d)));

console.log('\nthe code, not the copy');
console.log('  ..   ' + codeHosts.length + ' host(s) appear in the shipped bundle and core/');
if (unaccounted.length === 0) ok('every host the code can reach is enumerated somewhere');
else for (const h of unaccounted) bad('THE CODE CAN REACH ' + h + ', and no surface says so');
for (const [h, why] of UNREACHABLE) {
  if (codeHosts.includes(h)) ok('present but unreachable: ' + h, why);
  /* A stale exemption is the other half of the same problem: it reads as covered while nothing is
     there, and the next person trusts it. */
  else bad('a stale exemption: nothing names ' + h + ' any more, so remove it from UNREACHABLE');
}

const secText2 = read(join(ROOT, 'SECURITY.md')).replace(/\s+/g, ' ');
if (/explicit action/i.test(secText2)) ok('SECURITY.md describes the explicit-action requests');
else bad('SECURITY.md does not describe the explicit-action requests at all');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nA surface disagrees with core/edition.js. Fix the SURFACE, or - if a request really was\n' +
    'added or removed - fix the list first and then every surface, in the same change.');
}
process.exit(fail ? 1 : 0);
