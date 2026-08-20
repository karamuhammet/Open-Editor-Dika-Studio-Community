/* Part two of the deck proof: the ELEMENT animations, and the console error the transition probe
 * turned up.
 *
 * The transition probe sampled a single canvas pixel for the element-animation slide and got two
 * distinct values, which proves nothing: the pixel may simply have gone from background to content.
 * Element animations write fabric OBJECT properties (opacity, top, angle, scale), so that is what
 * this reads, frame by frame, straight off the presenter's fabric canvas.
 *
 * It also captures the full stack of any page error, because "Cannot read properties of undefined"
 * repeated ten times during a presentation is either a bug or a bad fixture, and the difference
 * matters.
 *
 * Run from apps/editor (it has playwright):
 *   node ../community-editor/tools/_deck-anim-probe.mjs
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL('D:/Cursor/cartcraft/apps/community-editor/index.html').href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push({ msg: String(e.message || e).slice(0, 160), stack: String(e.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400) }));

await page.goto(PAGE, { waitUntil: 'load' });
await page.waitForTimeout(5000);

const out = await page.evaluate(async () => {
  const pg = window.pages[window.currentPageIndex];
  const deck = window.ensureSlideDeck(pg, { w: 1600, h: 900 });

  const json = {
    version: '5.3.1',
    objects: [
      { type: 'rect', left: 100, top: 120, width: 260, height: 200, fill: '#f2ff58' },
      { type: 'rect', left: 400, top: 120, width: 260, height: 200, fill: '#57c7ff' },
      { type: 'rect', left: 700, top: 120, width: 260, height: 200, fill: '#67d7a3' },
      { type: 'rect', left: 1000, top: 120, width: 260, height: 200, fill: '#f0ad4e' },
      { type: 'rect', left: 100, top: 420, width: 260, height: 200, fill: '#b89cff' },
      { type: 'rect', left: 400, top: 420, width: 260, height: 200, fill: '#ff7f7f' },
      { type: 'rect', left: 700, top: 420, width: 260, height: 200, fill: '#58d6d6' },
      { type: 'rect', left: 1000, top: 420, width: 260, height: 200, fill: '#ed91c2' }
    ]
  };
  const base = (label, anims) => ({
    id: label, label: label, json: JSON.parse(JSON.stringify(json)), bg: '#16161b', w: 1600, h: 900,
    transition: 'none', transitionPreset: 'none', transitionDuration: 0.6,
    transitionDirection: 'left', transitionEasing: 'power2.out', animations: anims || [],
    notes: '', hidden: false
  });

  deck.slides = [
    base('start', []),
    /* The REAL preset keys, read off SUITE.ELEM. An earlier run used "fadeUp", which is not one, and
       _elemAnimStates correctly returned null and skipped it: the fixture was wrong, not the code. */
    base('anims', ['fade', 'rise', 'sink', 'panL', 'panR', 'pop', 'zoom', 'spin'].map(function (k, i) {
      return { index: i, preset: k, order: i, delay: 0, duration: 0.5, easing: 'power2.out', trigger: 'with' };
    }))
  ];
  deck.activeSlideIndex = 0;

  /* The presenter builds its own fabric.StaticCanvas per stage and keeps it privately, so wrap the
     constructor BEFORE opening it. Reading pixels instead was the earlier mistake: two distinct
     colours at one point proves the slide changed, not that anything animated. */
  const made = [];
  const Orig = window.fabric.StaticCanvas;
  window.fabric.StaticCanvas = function () {
    const inst = new Orig(...arguments);
    made.push(inst);
    return inst;
  };
  window.fabric.StaticCanvas.prototype = Orig.prototype;
  Object.keys(Orig).forEach((k) => { try { window.fabric.StaticCanvas[k] = Orig[k]; } catch (e) {} });

  window.openSlidePresenter(0);
  await new Promise((r) => setTimeout(r, 1200));

  /* Sample the fabric objects on the INCOMING stage every frame. */
  const track = [];
  let stop = false;
  (function frame() {
    if (stop) return;
    try {
      const sc = made.length ? made[made.length - 1] : null;
      if (sc && sc.getObjects && sc.getObjects().length) {
        const o = sc.getObjects();
        track.push(o.map((x) => [
          Number(x.opacity).toFixed(3), Math.round(x.top), Math.round(x.angle || 0), Number(x.scaleX || 1).toFixed(3)
        ].join('/')));
      } else { track.push('nocanvas'); }
    } catch (e) { track.push('err:' + e.message); }
    requestAnimationFrame(frame);
  })();

  /* Dispatch on BODY with a `code`, not on `document`. The shortcut handler reads
     `e.target.tagName.toLowerCase()`, and `document` has no tagName - that was the repeated
     "Cannot read properties of undefined" in the transition run, and it was the probe's fault, not
     the app's. (Worth noting anyway: shortcuts.js guards this defensively at one call site and not
     at the other. Upstream's asymmetry, left alone here.) */
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
  await new Promise((r) => setTimeout(r, 2200));
  stop = true;

  const usable = track.filter((t) => Array.isArray(t));
  const PRESETS = ['fade', 'rise', 'sink', 'panL', 'panR', 'pop', 'zoom', 'spin'];
  const perObj = PRESETS.map((k, i) => ({ preset: k, distinct: new Set(usable.map((t) => t[i])).size }));

  return {
    frames: track.length,
    usableFrames: usable.length,
    sampleKinds: [...new Set(track.map((t) => (Array.isArray(t) ? 'objects' : String(t).slice(0, 24))))],
    distinctPerObject: perObj,
    canvasesBuilt: made.length,
    firstFrame: usable[0] || null,
    lastFrame: usable[usable.length - 1] || null
  };
});

console.log(JSON.stringify({ out, errors: errors.slice(0, 4) }, null, 1));
await browser.close();
