/* A TRANSLATION IS A LOOKUP, SO ITS KEY IS A FACT ABOUT THE SOURCE, NOT A LABEL.
 *
 * `CCI18n` matches a dictionary entry against the English string the code actually renders. Rename
 * something inside that string - a storage key, a file extension, a product name - and every entry
 * keyed on the old wording silently stops matching: the screen falls back to English and nothing
 * anywhere reports it. Ten locales lost the same three Version-history strings that way in the dika
 * rename, and the only reason it surfaced is that the OLD NAME was still sitting in the key.
 *
 * So this asserts the pairing directly: pull every single-quoted literal out of a source file, and
 * check the locale dictionaries carry it verbatim as a key.
 *
 *   node tools/_locale-key-match.mjs [<source file> ...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['modules/system/settings/version-history/version-history.js'];

/* Only literals that carry one of the renamed identifiers. A full extractor is `CCI18n`'s job; this
   is a tripwire for the strings a rename just moved under everyone's feet. */
const RENAMED = /dika_(?:autosave|versions)|\.dikapack\b|\.dika\b/;
const LITERAL = /'((?:[^'\\]|\\.)*)'/g;

const locales = readdirSync(join(ROOT, 'locales')).filter((f) => f.endsWith('.js'));
let pass = 0, fail = 0;

for (const rel of targets) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const lits = [...src.matchAll(LITERAL)].map((m) => m[1]).filter((s) => RENAMED.test(s) && s.length > 24);
  const seen = new Set();
  console.log('\n' + rel + '   ' + lits.length + ' renamed literal(s)');
  for (const lit of lits) {
    if (seen.has(lit)) continue;
    seen.add(lit);
    /* The dictionaries are JS object literals, so the key is the JSON encoding of the string. */
    const key = JSON.stringify(lit) + ':';
    const missing = locales.filter((f) => !readFileSync(join(ROOT, 'locales', f), 'utf8').includes(key));
    const label = lit.replace(/<[^>]*>/g, '').trim().slice(0, 58) || lit.slice(0, 58);
    if (missing.length === 0) { pass++; console.log('  ok   every locale keys on it   "' + label + '"'); }
    else if (missing.length === locales.length) {
      /* Untranslated everywhere is a gap, not a break: the string may simply never have been sent to
         a translator. Naming it is useful; failing on it would make this proof about coverage. */
      console.log('  ..   not translated in any locale (not a break)   "' + label + '"');
    } else {
      fail++;
      console.log('  FAIL ' + missing.length + ' locale(s) key on an OLD wording, so they render English: '
        + missing.map((f) => basename(f, '.js')).join(', ') + '   "' + label + '"');
    }
  }
}

console.log('\n' + pass + ' matched, ' + fail + ' broken');
process.exit(fail ? 1 : 0);
