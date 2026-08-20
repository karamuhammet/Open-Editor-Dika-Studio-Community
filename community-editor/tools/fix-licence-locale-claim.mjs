/* THE LICENCE NAME CHANGED IN TEN LANGUAGES AND THE CLAIM DID NOT.
 *
 * The bulk relicensing pass swapped the former licence name for "Business Source License 1.1" everywhere,
 * including inside every translation. What it could not do is notice that the SENTENCE AROUND the
 * name had become false: German still read "Kostenlos und Open Source unter der Business Source
 * License 1.1", Spanish "de codigo abierto", French "open source". BSL is not an open-source
 * licence, so those ten lines were a legal claim this product cannot make - in exactly the markets
 * where somebody would check.
 *
 * A licence NAME is a proper noun and stays verbatim in every language. The sentence around it is
 * authored per language for what it actually means: free of charge, source published, not OSI.
 *
 *   node tools/fix-licence-locale-claim.mjs            # report
 *   node tools/fix-licence-locale-claim.mjs --apply
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCALES = join(ROOT, 'locales');
const apply = process.argv.includes('--apply');

const KEY = 'Free to use. Source available under the Business Source License 1.1.';

/* Authored, not translated word for word. Each one says the two things that are true and drops the
   one that no longer is. */
const VALUES = {
  de: 'Kostenlos nutzbar. Quelltext verfugbar unter der Business Source License 1.1.',
  es: 'Uso gratuito. Codigo fuente disponible bajo la Business Source License 1.1.',
  fr: 'Utilisation gratuite. Code source disponible sous la Business Source License 1.1.',
  hi: 'निःशुल्क उपयोग। स्रोत कोड Business Source License 1.1 के अंतर्गत उपलब्ध।',
  ja: '無料で利用できます。ソースコードは Business Source License 1.1 のもとで公開されています。',
  pl: 'Bezplatne w uzyciu. Kod zrodlowy dostepny na Business Source License 1.1.',
  pt: 'Uso gratuito. Codigo-fonte disponivel sob a Business Source License 1.1.',
  ru: 'Бесплатное использование. Исходный код доступен по Business Source License 1.1.',
  tr: 'Kullanimi ucretsiz. Kaynak kodu Business Source License 1.1 altinda yayinlanir.',
  zh: '免费使用。源代码依据 Business Source License 1.1 公开。',
};
/* Latin-script values are written without diacritics above and restored here, because a source file
   that has to travel through a shell on this machine loses them silently. */
const RESTORE = {
  de: [['verfugbar', 'verfügbar']],
  es: [['Codigo', 'Código']],
  pl: [['Bezplatne', 'Bezpłatne'], ['uzyciu', 'użyciu'], ['zrodlowy', 'źródłowy'], ['dostepny', 'dostępny']],
  pt: [['Codigo', 'Código'], ['disponivel', 'disponível']],
  tr: [['Kullanimi', 'Kullanımı'], ['ucretsiz', 'ücretsiz'], ['altinda', 'altında'], ['yayinlanir', 'yayınlanır']],
};
for (const [lang, pairs] of Object.entries(RESTORE)) {
  for (const [from, to] of pairs) VALUES[lang] = VALUES[lang].split(from).join(to);
}

/* THERE IS NO DETECTOR HERE ANY MORE, AND THAT IS THE FIX.
 *
 * The first version searched each translation for a phrase meaning "open source" and only rewrote
 * the ones it matched. It reported seven corrected and three "already accurate" - and all three were
 * still wrong: Japanese writes it with a space (オープン ソース), Hindi uses खुला स्रोत rather than the
 * transliteration, Polish says otwarte oprogramowanie. A pattern list over ten writing systems is a
 * guess, and a guess that reads green is worse than no check.
 *
 * Every language below is authored, so every language is written. The table is the truth; nothing
 * decides whether to trust what is already there. */

let fixed = 0, clean = 0;
for (const f of readdirSync(LOCALES).filter((n) => n.endsWith('.js'))) {
  const lang = f.replace('.js', '');
  const p = join(LOCALES, f);
  const s = readFileSync(p, 'utf8');
  const q = JSON.stringify(KEY);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*"([^"]*)"');
  const m = s.match(re);
  if (!m) { console.log('  ' + lang + ': key not present, skipped'); continue; }
  const current = m[1];
  const next = VALUES[lang];
  if (!next) { console.log('  FAIL ' + lang + ': no wording authored for this language'); continue; }
  if (current === next) { clean++; console.log('  ok   ' + lang + '   already correct'); continue; }
  console.log('  fix  ' + lang);
  console.log('       was: ' + current);
  console.log('       now: ' + next);
  if (apply) writeFileSync(p, s.replace(re, q + ': ' + JSON.stringify(next)));
  fixed++;
}
console.log('\n' + fixed + ' corrected, ' + clean + ' already accurate');
if (!apply) console.log('nothing written. Re-run with --apply.');
