/* THE EMOJI PANEL WAS A CDN GALLERY, so with no network it drew 222 broken images.
 *
 * Each cell is an `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/...">`. Nothing about
 * that is a "library that loads on demand" - it is the panel's entire content, fetched one file per
 * emoji, from a host this build never declared. Offline, the whole panel is empty squares.
 *
 * Twemoji is CC-BY 4.0 (the graphics; the code is MIT), so redistributing the files inside an
 * Redistribution is fine as long as attribution travels with them - which is what LICENSE.txt beside
 * the images is for. Only the emoji this panel actually offers are fetched: the full set is ~3,600
 * files and 222 is what the list names.
 *
 *   node tools/vendor-twemoji.mjs            # report
 *   node tools/vendor-twemoji.mjs --apply    # fetch into js/vendor/twemoji/
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'js', 'vendor', 'twemoji');
const apply = process.argv.includes('--apply');

const src = readFileSync(join(ROOT, 'modules', 'left-panel', 'items', 'emoji', 'emoji.js'), 'utf8');
const base = (src.match(/TWEMOJI_SVG_BASE\s*=\s*'([^']+)'/) || [])[1];
if (!base) throw new Error('emoji.js no longer declares TWEMOJI_SVG_BASE');

/* The codepoints the panel names, in the order it names them. Reading them out of the source rather
   than keeping a second list here is what stops the vendored set drifting from the rendered one. */
const cps = [...new Set([...src.matchAll(/cp:\s*'([0-9a-f-]+)'/g)].map((m) => m[1]))];
console.log(cps.length + ' emoji named by the panel');
console.log('base ' + base);

if (!apply) { console.log('\nnothing written. Re-run with --apply.'); process.exit(0); }

mkdirSync(OUT, { recursive: true });
let got = 0, missed = [];
/* Six at a time: a public CDN answers a burst of 222 with rate limiting, and a half-fetched emoji
   set is worse than none because the gaps look like a rendering bug. */
const queue = cps.slice();
async function worker() {
  while (queue.length) {
    const cp = queue.shift();
    const dest = join(OUT, cp + '.svg');
    if (existsSync(dest) && statSync(dest).size > 0) { got++; continue; }
    try {
      const r = await fetch(base + cp + '.svg');
      if (!r.ok) { missed.push(cp + ' (HTTP ' + r.status + ')'); continue; }
      const b = Buffer.from(await r.arrayBuffer());
      if (!b.length || b.slice(0, 200).toString('utf8').indexOf('<svg') < 0) { missed.push(cp + ' (not an SVG)'); continue; }
      writeFileSync(dest, b);
      got++;
    } catch (e) { missed.push(cp + ' (' + String(e.message).slice(0, 30) + ')'); }
  }
}
await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);

writeFileSync(join(OUT, 'LICENSE.txt'),
  'Twemoji graphics: Copyright Twitter, Inc and other contributors.' + String.fromCharCode(10) +
  'Licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/' + String.fromCharCode(10) +
  String.fromCharCode(10) +
  'Vendored from ' + base + String.fromCharCode(10) +
  'Only the emoji this editor offers are included, not the full set.' + String.fromCharCode(10));

const bytes = readdirSync(OUT).reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
console.log('\nvendored ' + got + '/' + cps.length + '   ' + (bytes / 1024).toFixed(0) + ' KB');
if (missed.length) {
  console.log('MISSING (' + missed.length + '), so the source was NOT rewritten: ' + missed.slice(0, 8).join(', '));
  process.exit(1);
}
console.log('LICENSE.txt written beside them (CC-BY 4.0 requires the attribution to travel).');
