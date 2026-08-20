/* BRING THE CDN LIBRARIES IN-HOUSE, AND PROVE THEY ARE THE ONES WE ALREADY TRUSTED.
 *
 * `core/loader.js` fetched six libraries from jsDelivr and cdnjs the first time a feature needed one.
 * That is two undeclared hosts in a build whose README says it contacts five, and - worse - an
 * OFFLINE person pressing "export PDF" got nothing at all, silently, in the one edition whose entire
 * promise is that it works with no network.
 *
 * The mechanism to fix it already existed: `LIB_INTEGRITY` has always accepted a LOCAL path
 * (`js/vendor/opentype.min.js`, integrity `''`), and `requireLib` still loads on demand, so nothing
 * about boot time changes. Only the source of the bytes moves.
 *
 * THE DOWNLOAD IS VERIFIED AGAINST THE SRI HASH THAT WAS ALREADY PINNED IN THE SOURCE. That is the
 * whole point of running this rather than saving files by hand: the hashes were committed when the
 * CDN URLs were, so a file that matches them is provably the same code the product has been running,
 * and a file that does not is refused rather than vendored.
 *
 *   node tools/vendor-cdn-libs.mjs            # report what would be fetched
 *   node tools/vendor-cdn-libs.mjs --apply    # fetch, verify, write into js/vendor/
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'js', 'vendor');
const apply = process.argv.includes('--apply');

const src = readFileSync(join(ROOT, 'core', 'loader.js'), 'utf8');
const block = src.match(/var LIB_INTEGRITY = \{([\s\S]*?)\n {2}\};/);
if (!block) throw new Error('core/loader.js has no `var LIB_INTEGRITY = { ... };` block');

const rows = [...block[1].matchAll(/'([^']+)':\s*'([^']*)'/g)].map((m) => ({ url: m[1], sri: m[2] }));
const remote = rows.filter((r) => /^https?:/.test(r.url));
console.log(rows.length + ' libraries declared, ' + remote.length + ' still remote');

let failed = 0;
const done = [];
for (const r of remote) {
  const name = basename(new URL(r.url).pathname);
  /* Two packages both ship a file called `bundle.js`, so the vendored name carries the package. */
  const pkg = (r.url.match(/npm\/([^@/]+)/) || [])[1];
  const local = pkg && name === 'bundle.js' ? pkg + '-' + name : name;

  if (!apply) { console.log('  would fetch  ' + local.padEnd(26) + r.url); continue; }

  const res = await fetch(r.url);
  if (!res.ok) { console.log('  FAIL ' + local + '  HTTP ' + res.status); failed++; continue; }
  const buf = Buffer.from(await res.arrayBuffer());

  /* Verify against the SRI that was already in the source, not against a hash computed now: a hash
     of what just arrived proves only that the download completed. */
  const algo = (r.sri.split('-')[0] || 'sha384');
  const want = r.sri.slice(algo.length + 1);
  const got = createHash(algo).update(buf).digest('base64');
  if (want && got !== want) {
    console.log('  REFUSED ' + local + '  the bytes do not match the pinned ' + algo);
    console.log('          pinned ' + want.slice(0, 24) + '...   got ' + got.slice(0, 24) + '...');
    failed++;
    continue;
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, local), buf);
  console.log('  ok   ' + local.padEnd(26) + (buf.length / 1024).toFixed(0).padStart(5) + ' KB   '
    + (want ? algo + ' matches the pinned hash' : 'no hash was pinned'));
  done.push({ url: r.url, local: 'js/vendor/' + local });
}

if (!apply) { console.log('\nnothing written. Re-run with --apply.'); process.exit(0); }
if (failed) { console.log('\n' + failed + ' refused. NOTHING was rewritten in core/loader.js.'); process.exit(1); }

/* Only now, with every file on disk and verified, does the loader stop naming a CDN. Rewriting it
   first would leave a build pointing at files that may not have arrived. */
let out = src;
for (const d of done) out = out.split("'" + d.url + "'").join("'" + d.local + "'");
/* The integrity attribute goes with the URL: SRI is for a third party's server, and a file inside
   our own package is covered by whatever verified the package. Same as opentype.min.js has always
   been. */
for (const d of done) {
  out = out.replace(new RegExp("('" + d.local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*)'[^']*'"), "$1''");
}
writeFileSync(join(ROOT, 'core', 'loader.js'), out);
console.log('\ncore/loader.js now names ' + done.length + ' local file(s) and no CDN.');
