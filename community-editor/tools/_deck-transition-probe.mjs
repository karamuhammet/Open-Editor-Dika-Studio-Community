/* Slide-deck transitions on a REAL deck, after GSAP was replaced with anime.js.
 *
 * The earlier probe only proved that anime.js can tween a number. This one builds an actual deck
 * with real slides, opens the presenter, presses ArrowRight, and SAMPLES the stage element's
 * computed style every frame. Each preset writes a different property, so each is checked against
 * the property it actually drives:
 *
 *   fade  -> opacity        slide/cover/push -> transform      zoom -> transform + opacity
 *   wipe  -> clipPath       circle           -> clipPath       slice -> clipPath   flip -> transform
 *
 * What it is really testing is the two things a units bug would break and a "does it run" test
 * would not catch: that the value MOVES over several frames (not a jump), and that it takes roughly
 * the DURATION the deck asked for. GSAP counted seconds, anime.js counts milliseconds, so a missed
 * x1000 would finish in one frame and still look "successful" to a completion callback.
 *
 * Run from apps/editor (it has playwright):
 *   node ../community-editor/tools/_deck-transition-probe.mjs
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL('D:/Cursor/cartcraft/apps/community-editor/index.html').href;
const PRESETS = ['fade', 'slide', 'cover', 'push', 'zoom', 'wipe', 'circle', 'slice', 'flip'];
const DURATION = 0.6;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(PAGE, { waitUntil: 'load' });
await page.waitForTimeout(5000);

// ── build a real deck: one slide per preset, each with visible content ──────────────────────────
const built = await page.evaluate((cfg) => {
  const pg = window.pages[window.currentPageIndex];
  if (typeof window.ensureSlideDeck !== 'function') return { ok: false, why: 'ensureSlideDeck missing' };
  const deck = window.ensureSlideDeck(pg, { w: 1600, h: 900 });
  if (!deck) return { ok: false, why: 'no deck' };

  const slideJson = (label, colour) => ({
    version: '5.3.1',
    objects: [
      { type: 'rect', left: 120, top: 120, width: 1360, height: 660, fill: colour, rx: 24, ry: 24 },
      { type: 'textbox', left: 200, top: 380, width: 1200, text: label, fontSize: 96, fill: '#16161b', fontFamily: 'DM Sans' }
    ]
  });

  const colours = ['#f2ff58', '#57c7ff', '#67d7a3', '#f0ad4e', '#b89cff', '#ff7f7f', '#58d6d6', '#d7c45b', '#ed91c2', '#9ad0ff'];
  deck.slides = [];
  // slide 0 is the entry point: the presenter shows it with preset 'none' by design (first === true)
  deck.slides.push({
    id: 's0', label: 'Slide 1', json: slideJson('START', colours[0]), bg: '#16161b', w: 1600, h: 900,
    transition: 'none', transitionPreset: 'none', transitionDuration: cfg.duration,
    transitionDirection: 'left', transitionEasing: 'power2.out', animations: [], notes: '', hidden: false
  });
  cfg.presets.forEach((p, i) => {
    deck.slides.push({
      id: 's' + (i + 1), label: p, json: slideJson(p.toUpperCase(), colours[(i + 1) % colours.length]),
      bg: '#16161b', w: 1600, h: 900,
      transition: p, transitionPreset: p, transitionDuration: cfg.duration,
      transitionDirection: 'left', transitionEasing: 'power2.out',
      animations: [], notes: '', hidden: false
    });
  });
  // last slide also exercises the ELEMENT animation path (_prPlayElemAnims + the rAF ticker)
  deck.slides.push({
    id: 'sA', label: 'anims', json: slideJson('ANIMS', colours[2]), bg: '#16161b', w: 1600, h: 900,
    transition: 'fade', transitionPreset: 'fade', transitionDuration: cfg.duration,
    transitionDirection: 'left', transitionEasing: 'power2.out',
    animations: [
      { index: 0, preset: 'fadeUp', order: 0, delay: 0, duration: 0.5, easing: 'power2.out', trigger: 'with' },
      { index: 1, preset: 'spin', order: 1, delay: 0, duration: 0.5, easing: 'power2.out', trigger: 'after' }
    ],
    notes: '', hidden: false
  });
  deck.activeSlideIndex = 0;
  return { ok: true, slides: deck.slides.length };
}, { presets: PRESETS, duration: DURATION });

if (!built.ok) { console.log(JSON.stringify({ fatal: built })); await browser.close(); process.exit(2); }

// ── open the presenter ──────────────────────────────────────────────────────────────────────────
const opened = await page.evaluate(() => {
  window.openSlidePresenter(0);
  const st = document.querySelectorAll('[data-stage]');
  return { open: !!document.querySelector('.is-open'), stages: st.length };
});
await page.waitForTimeout(1200);

// ── advance one slide at a time, sampling the incoming stage every frame ─────────────────────────
const PROP = {
  fade: 'opacity', slide: 'transform', cover: 'transform', push: 'transform', zoom: 'transform',
  wipe: 'clipPath', circle: 'clipPath', slice: 'clipPath', flip: 'transform'
};

const rows = [];
for (const preset of PRESETS) {
  const row = await page.evaluate(async (p) => {
    const prop = { fade: 'opacity', slide: 'transform', cover: 'transform', push: 'transform', zoom: 'transform',
                   wipe: 'clipPath', circle: 'clipPath', slice: 'clipPath', flip: 'transform' }[p];
    const stages = [...document.querySelectorAll('[data-stage]')];
    const before = stages.map((s) => getComputedStyle(s)[prop]);

    const samples = [];
    let stop = false;
    const t0 = performance.now();
    (function frame() {
      if (stop) return;
      samples.push(stages.map((s) => getComputedStyle(s)[prop]));
      requestAnimationFrame(frame);
    })();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise((r) => setTimeout(r, 1500));
    stop = true;
    const elapsed = performance.now() - t0;

    /* Distinct values on the stage that actually moved. A working tween produces many; a units bug
       (seconds read as milliseconds) produces one or two because it is over before the second frame. */
    const perStage = [0, 1].map((i) => new Set(samples.map((s) => s[i])).size);
    const moving = perStage.indexOf(Math.max(...perStage));

    /* When did it stop changing? That is the real duration, and it is what a x1000 bug destroys. */
    let lastChange = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i][moving] !== samples[i - 1][moving]) lastChange = i;
    }
    const msPerFrame = elapsed / Math.max(1, samples.length);

    return {
      preset: p, prop, frames: samples.length,
      distinctValues: Math.max(...perStage),
      animatedMs: Math.round(lastChange * msPerFrame),
      first: String(samples[0] && samples[0][moving] || '').slice(0, 60),
      mid: String(samples[Math.floor(lastChange / 2)] && samples[Math.floor(lastChange / 2)][moving] || '').slice(0, 60),
      last: String(samples[samples.length - 1][moving] || '').slice(0, 60),
      before: String(before[moving] || '').slice(0, 40)
    };
  }, preset);
  rows.push(row);
}

// ── the element-animation slide (fabric objects, driven by the rAF ticker) ───────────────────────
const anims = await page.evaluate(async () => {
  const canvasEl = document.querySelector('[data-stage] canvas');
  const shots = [];
  let stop = false;
  (function frame() {
    if (stop) return;
    try {
      const c = canvasEl.getContext('2d');
      const d = c.getImageData(canvasEl.width >> 1, canvasEl.height >> 1, 1, 1).data;
      shots.push(d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3]);
    } catch (e) { shots.push('err'); }
    requestAnimationFrame(frame);
  })();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await new Promise((r) => setTimeout(r, 2200));
  stop = true;
  return { frames: shots.length, distinctPixels: new Set(shots).size };
});

const summary = rows.map((r) => ({
  preset: r.preset, prop: r.prop, distinct: r.distinctValues, ms: r.animatedMs,
  animated: r.distinctValues > 4 && r.animatedMs > 150 && r.animatedMs < 1400
}));

console.log(JSON.stringify({
  built, opened,
  askedDurationMs: DURATION * 1000,
  transitions: summary,
  detail: rows,
  elementAnimations: anims,
  allAnimated: summary.every((s) => s.animated),
  errors: errors.slice(0, 10)
}, null, 1));

await browser.close();
