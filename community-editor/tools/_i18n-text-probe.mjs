/* Adding text to the canvas still freezes, so measure THAT, with a locale on and with it off.
 *
 * The owner's reading is that the language layer is doing work on every action. This puts a number on
 * it for the exact gesture they named, and it also answers the second half of their question - whether
 * every language file is loaded and running in the background - by reporting what is actually in
 * memory rather than what it feels like.
 *
 *   node tools/_i18n-text-probe.mjs
 */
import { openFile } from './_cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const page = await openFile(join(ROOT, 'index.html'));

for (let i = 0; i < 90; i++) {
  const ready = await page.eval('!!(window.canvas && window.fabric && window.CCI18n)');
  if (ready) break;
  await new Promise((r) => setTimeout(r, 500));
}

const shape = await page.eval(`(function () {
  return JSON.stringify({
    localesOffered: CCI18n.locales.length,
    dictionariesInMemory: Object.keys(window.__ccI18nDicts || {}).length || 'not exposed',
    localeScriptsInDocument: Array.prototype.filter.call(
      document.querySelectorAll('script[src]'),
      function (s) { return /locales\\//.test(s.getAttribute('src') || ''); }
    ).map(function (s) { return s.getAttribute('src'); })
  });
})()`);

async function measure(locale) {
  await page.eval(`CCI18n.setLocale(${JSON.stringify(locale)})`);
  await new Promise((r) => setTimeout(r, 2500));
  return JSON.parse(await page.eval(`(function () {
    return new Promise(function (resolve) {
      var out = { locale: CCI18n.locale() };
      function blockedBy(fn) {
        return new Promise(function (done) {
          var t0 = performance.now();
          fn();
          setTimeout(function () { done(Math.round((performance.now() - t0) * 10) / 10); }, 0);
        });
      }
      var added = [];
      function makeBox() {
        return new fabric.Textbox('Double click to edit', {
          left: 40 + added.length * 6, top: 40 + added.length * 6, width: 240, fontSize: 24
        });
      }
      function addOne() {
        var tb = new fabric.Textbox('Double click to edit', {
          left: 40 + added.length * 6, top: 40 + added.length * 6, width: 240, fontSize: 24
        });
        canvas.add(tb);
        canvas.setActiveObject(tb);
        canvas.requestRenderAll();
        if (typeof window.syncRightPanel === 'function') syncRightPanel();
        if (typeof window.renderLayers === 'function') renderLayers();
        added.push(tb);
      }
      blockedBy(function () {}).then(function (idle) {
        out.idleMs = idle;
        return blockedBy(addOne);
      }).then(function (one) {
        out.oneTextMs = one;
        // the same gesture, split, so the cost has an owner rather than a total
        return blockedBy(function () {
          var tb = makeBox(); canvas.add(tb); canvas.setActiveObject(tb); canvas.requestRenderAll(); added.push(tb);
        });
      }).then(function (canvasOnly) {
        out.canvasAddOnlyMs = canvasOnly;
        return blockedBy(function () { if (typeof window.syncRightPanel === 'function') syncRightPanel(); });
      }).then(function (rp) {
        out.syncRightPanelMs = rp;
        return blockedBy(function () { if (typeof window.renderLayers === 'function') renderLayers(); });
      }).then(function (rl) {
        out.renderLayersMs = rl;
        return blockedBy(function () { for (var i = 0; i < 5; i++) addOne(); });
      }).then(function (five) {
        out.fiveTextsMs = five;
        for (var i = 0; i < added.length; i++) canvas.remove(added[i]);
        canvas.requestRenderAll();
        resolve(JSON.stringify(out));
      });
    });
  })()`));
}

const en = await measure('en');
const tr = await measure('tr');

console.log(JSON.stringify({ ...JSON.parse(shape), english: en, turkish: tr }, null, 1));
await page.close();
