/* What does drawing the timeline cost as the project gets longer?
 *
 * The owner's report is precise: it freezes when the video is put ON THE TIMELINE. Importing and
 * decoding were measured in _ve-cost-probe.mjs and cleared; this measures the draw itself, which
 * needs no video file at all - only a project that claims to be an hour long.
 *
 *   VE._veRenderRuler   one absolutely positioned <div> per tick, appended one at a time, over a
 *                       ruler element as wide as duration x zoom
 *   VE._veRender        the whole timeline: ruler, track headers, lanes, clips
 *
 *   node tools/_ve-timeline-probe.mjs
 */
import { openFile } from './_cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const page = await openFile(join(ROOT, 'index.html'));

// The video editor is lazy: `VE` is `window.__ccVideoEditor` and nothing exists until the surface is
// activated, so activate it the way the tab does rather than poking at internals.
for (let i = 0; i < 90; i++) {
  const ready = await page.eval('!!(window.__ccVideoEditor && window.__ccVideoEditor._veActivate)');
  if (ready) break;
  await new Promise((r) => setTimeout(r, 500));
}
await page.eval('window.__ccVideoEditor._veActivate()');
await new Promise((r) => setTimeout(r, 2500));

const out = await page.eval(`(function () {
  var res = { rows: [] };
  var VE = window.__ccVideoEditor;
  if (!VE || !VE._veProject || !VE._veRender) { res.error = 'VE not booted'; return JSON.stringify(res); }

  function ms(fn) { var t0 = performance.now(); fn(); return Math.round((performance.now() - t0) * 10) / 10; }

  res.zoom = VE._veProject.zoom;
  var was = VE._veProject.duration;

  [10, 60, 600, 1800, 3600].forEach(function (dur) {
    VE._veProject.duration = dur;
    var row = { seconds: dur };
    row.widthPx = VE._veTimelineWidthPx();
    row.step = VE._veRulerStep();
    row.ticks = Math.floor((Math.max(dur + 10, 30)) / row.step) + 1;
    row.rulerMs = ms(function () { VE._veRenderRuler(); });
    row.fullRenderMs = ms(function () { VE._veRender(); });
    // The JS above is only half of it: style, layout and paint happen after the call returns, and a
    // 200 000 pixel wide element with two thousand positioned children is exactly where that lands.
    row.renderPlusLayoutMs = ms(function () {
      VE._veRender();
      document.body.getBoundingClientRect();
    });
    res.rows.push(row);
  });

  VE._veProject.duration = was;
  try { VE._veRender(); } catch (e) {}
  return JSON.stringify(res);
})()`);

console.log(JSON.stringify(JSON.parse(out), null, 1));
await page.close();
