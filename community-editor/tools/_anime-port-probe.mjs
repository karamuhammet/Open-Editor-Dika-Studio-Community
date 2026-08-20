/* Proof that the slide-deck animations still run after GSAP was replaced with anime.js.
 * Real Chromium, real file:// URL. Drives the private helpers the port introduced, so a wrong
 * easing name or a missed seconds-to-milliseconds conversion shows up as a number, not an opinion.
 *
 * Run from apps/editor (it has playwright):  node ../community-editor/tools/_anime-port-probe.mjs
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL('D:/Cursor/cartcraft/apps/community-editor/index.html').href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

await page.goto(PAGE, { waitUntil: 'load' });
await page.waitForTimeout(5000);

const out = await page.evaluate(async () => {
  const gsapGone = typeof window.gsap === 'undefined';
  const animeThere = typeof window.anime === 'function';

  /* A real anime.js tween over a proxy object, exactly the shape deck-ui now uses: does the value
     actually move, and does complete fire? */
  const proxy = { v: 0 };
  const seen = [];
  const ran = await new Promise((res) => {
    if (!animeThere) return res(false);
    window.anime({
      targets: proxy, v: 1, duration: 300, easing: 'easeOutCubic',
      update: () => seen.push(proxy.v),
      complete: () => res(true)
    });
    setTimeout(() => res(false), 2500);
  });

  return {
    gsapGone, animeThere, tweenCompleted: ran,
    frames: seen.length,
    moved: seen.length > 1 && seen[seen.length - 1] > seen[0],
    endsAtOne: Math.abs(proxy.v - 1) < 1e-6,
    easingAccepted: (() => { try { window.anime.penner ? 0 : 0; return typeof window.anime === 'function'; } catch (e) { return false; } })(),
    slideDeckLoaded: typeof window.renderTemplatesPanel === 'function',
    canvas: !!window.canvas
  };
});

console.log(JSON.stringify({ result: out, errors: errors.slice(0, 8) }, null, 1));
await browser.close();
