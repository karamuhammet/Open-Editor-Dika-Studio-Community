/* EVERY DATABASE THIS APP OPENS, DERIVED - NOT A LIST SOMEBODY HAS TO REMEMBER.
 *
 * `_storage-migrate-proof.mjs` asserted seven hand-written pairs and read 7/7 green while an EIGHTH
 * store, the cross-project tag library, had been renamed to `dika_tags_db` with no copy behind it:
 * anybody's tag library opened empty and looked deleted. The list was not wrong, it was SHORT, and a
 * list that has to be remembered goes stale the first time somebody adds to it.
 *
 * So this asks the question the other way round. Find every name passed to `indexedDB.open(...)` in
 * the shipped bundle and in `core/`, and for each one that wears the NEW product name, require that
 * a `CCMigrate.db(<something>, ...)` names it as a destination. A store that was always called
 * `dika_*` would be a false alarm, so the exemption list is EXPLICIT and each entry says why.
 *
 *   node tools/_idb-migration-derive.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('  ok   ' + m + (d ? '   ' + d : '')); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); };

/* Stores that never existed under the old name, so there is nothing to migrate FROM. Each one is a
   claim somebody has to defend, which is the point of naming them rather than pattern-matching. */
const BORN_NEW = {
  /* nothing yet: every store in this build predates the rename */
};

const sources = [join(ROOT, 'dist', 'modules.bundle.js')];
for (const f of readdirSync(join(ROOT, 'core'))) if (f.endsWith('.js')) sources.push(join(ROOT, 'core', f));
const text = sources.filter(existsSync).map((p) => readFileSync(p, 'utf8')).join('\n');

/* `indexedDB.open(X, n)` where X is a literal or a variable. A variable is resolved by finding its
   own assignment, because the bundle is minified and most of these are `var DB_NAME = "..."`. */
const opened = new Set();
const unresolved = [];
for (const m of text.matchAll(/indexedDB\.open\(\s*(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))/g)) {
  if (m[1]) { opened.add(m[1]); continue; }
  const varName = m[2];
  const assign = text.match(new RegExp('\\b' + varName.replace(/\$/g, '\\$') + '\\s*=\\s*["\']([^"\']+)["\']'));
  if (assign) opened.add(assign[1]);
  else unresolved.push(varName);
}
/* The destination of every migration that IS wired. */
const migrated = new Set();
for (const m of text.matchAll(/CCMigrate\.db\(\s*["']([^"']+)["']\s*,\s*(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))/g)) {
  if (m[2]) { migrated.add(m[2]); continue; }
  const varName = m[3];
  const assign = text.match(new RegExp('\\b' + varName.replace(/\$/g, '\\$') + '\\s*=\\s*["\']([^"\']+)["\']'));
  if (assign) migrated.add(assign[1]);
}

console.log('every IndexedDB name this build opens');
const named = [...opened].filter((n) => /dika/i.test(n)).sort();
console.log('  ..   ' + opened.size + ' opened, ' + named.length + ' wearing the new product name, '
  + migrated.size + ' migration destination(s) wired');
if (named.length === 0) bad('no database wears the new name - is the bundle built?');

for (const n of named) {
  if (migrated.has(n)) ok('migrates from its old self', n);
  else if (n in BORN_NEW) ok('never existed before the rename', n + '   (' + BORN_NEW[n] + ')');
  else bad('RENAMED WITH NO COPY - whatever was in it is orphaned and looks deleted', n);
}

/* WHAT THIS COULD NOT SEE, said out loud. Several stores are opened through a variable the minifier
   has renamed and reused (`DB_NAME` appears in five modules), so their name cannot be resolved from
   the bundle text. Those are exactly the ones `_storage-migrate-proof.mjs` names by hand: the two
   proofs are complementary, and reporting the gap is what stops "6 passed" reading as "all of them". */
if (unresolved.length) {
  console.log('  ..   ' + unresolved.length + ' open() call(s) name a variable this cannot resolve ('
    + [...new Set(unresolved)].join(', ') + ') - those are covered by _storage-migrate-proof.mjs');
}

/* And the reverse: a migration whose destination nothing opens is a copy into a store nobody reads. */
for (const d of migrated) {
  if (!opened.has(d)) bad('a migration writes into a store nothing opens', d);
}
if ([...migrated].every((d) => opened.has(d))) ok('every migration destination is actually opened');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
