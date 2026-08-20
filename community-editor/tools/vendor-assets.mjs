/* vendor-assets.mjs - pull every cross-origin resource index.html loads into the repo.
 *
 * The Community Edition promises it makes no network request of its own. Measured on a cold boot
 * before this ran: NINE cross-origin resources (8 CDN scripts + the Google Fonts stylesheet), plus
 * the font files that stylesheet then pulls from fonts.gstatic.com.
 *
 * This script is the reproducible way to get them, so nobody has to remember which versions were
 * used. It is not run at build time: the files are committed, because a build step that reaches the
 * internet is the thing we are removing.
 *
 * Usage: node tools/vendor-assets.mjs [--check]
 *   --check verifies the files exist and are non-trivial, without downloading.
 */
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const VENDOR = join(ROOT, 'vendor', 'lib');
const FONTS = join(ROOT, 'vendor', 'fonts');
const CHECK = process.argv.includes('--check');

/* Exactly the versions index.html shipped with. Changing one here is a dependency upgrade and
   should be a deliberate, separate change. */
/* GSAP is deliberately ABSENT: not an OSI licence, and this build is redistributed.
   anime.js covers what the slide deck actually needed. Do not add it back without a licence answer. */
const LIBS = [
  ['fabric.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js'],
  ['qrcode.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'],
  ['jszip.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'],
  ['papaparse.min.js', 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'],
  ['swiper-bundle.min.js', 'https://cdn.jsdelivr.net/npm/swiper@12.2.0/swiper-bundle.min.js'],
  ['swiper-bundle.min.css', 'https://cdn.jsdelivr.net/npm/swiper@12.2.0/swiper-bundle.min.css'],
  ['anime.min.js', 'https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js']
];

/* The 16 UI families index.html asked Google for, in one request. */
const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500' +
  '&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600' +
  '&family=Space+Mono:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600' +
  '&family=Unbounded:wght@400;600;700&family=Lora:ital,wght@0,400;0,700&family=Bebas+Neue' +
  '&family=Josefin+Sans:wght@300;400;600&family=Outfit:wght@300;400;600;700&family=Anton' +
  '&family=Abril+Fatface&family=Dancing+Script:wght@600&family=Oswald:wght@500&family=Pacifico&display=swap';

/* Google serves woff2 only to a UA it believes supports it. Ask as a modern browser or the CSS
   comes back full of truetype URLs three times the size. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function get(url, asText) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return asText ? await res.text() : Buffer.from(await res.arrayBuffer());
}

function report(path, min) {
  if (!existsSync(path)) return { ok: false, why: 'missing' };
  const size = statSync(path).size;
  if (size < (min || 512)) return { ok: false, why: `only ${size} bytes` };
  return { ok: true, size };
}

async function main() {
  mkdirSync(VENDOR, { recursive: true });
  mkdirSync(FONTS, { recursive: true });

  if (CHECK) {
    let bad = 0;
    for (const [name] of LIBS) {
      const r = report(join(VENDOR, name));
      if (!r.ok) { console.log(`MISSING vendor/lib/${name}: ${r.why}`); bad++; }
    }
    const css = report(join(FONTS, 'fonts.css'), 200);
    if (!css.ok) { console.log(`MISSING vendor/fonts/fonts.css: ${css.why}`); bad++; }
    console.log(bad ? `NOT VENDORED: ${bad} item(s)` : 'OK - every vendored asset is present');
    process.exit(bad ? 1 : 0);
  }

  for (const [name, url] of LIBS) {
    const buf = await get(url, false);
    writeFileSync(join(VENDOR, name), buf);
    console.log(`vendor/lib/${name}  ${(buf.length / 1024).toFixed(1)} KB`);
  }

  let css = await get(FONT_CSS_URL, true);
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]))];
  let n = 0;
  for (const u of urls) {
    /* Name the file after its URL path so two families cannot collide, and so a diff shows which
       file changed rather than "font-7.woff2". */
    const file = u.split('/').slice(-3).join('_').replace(/[^\w.\-]/g, '_');
    const buf = await get(u, false);
    writeFileSync(join(FONTS, file), buf);
    css = css.split(u).join('./' + file);
    n++;
  }
  writeFileSync(join(FONTS, 'fonts.css'), css);
  console.log(`vendor/fonts/fonts.css  ${n} font files, ${(css.length / 1024).toFixed(1)} KB of CSS`);
}

main().catch((e) => { console.error('vendor-assets failed:', e.message); process.exit(2); });
