/* What does one DOM mutation cost while a translation is active?
 *
 * The owner reported the editor freezing for minutes after adding a long video, with no CPU, no RAM
 * and no disk moving - the signature of one thread spinning on a machine with many of them. Their own
 * guess was the new translation layer, so this measures it instead of arguing about it: how big the
 * editor's DOM is, what a full `translateDom` pass costs, and what the observer does with the kind of
 * mutation the video timeline produces thirty times a second.
 *
 *   node tools/_i18n-cost-probe.mjs
 */
import { openFile } from './_cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const page = await openFile(join(ROOT, 'index.html'));

// the boot is async; wait for the module bundle to have built the UI
for (let i = 0; i < 60; i++) {
  const n = await page.eval('document.querySelectorAll("*").length');
  if (Number(n) > 800) break;
  await new Promise((r) => setTimeout(r, 500));
}

const report = await page.eval(`(function () {
  var out = {};
  out.elements = document.querySelectorAll('*').length;

  var texts = 0, w = document.createTreeWalker(document.body, 4, null, false);
  while (w.nextNode()) texts++;
  out.textNodes = texts;

  if (!window.CCI18n) { out.error = 'CCI18n missing'; return JSON.stringify(out); }

  // a dictionary has to be active or every path early-returns and measures nothing
  out.localesOffered = CCI18n.locales.length;

  return JSON.stringify(out);
})()`);

const base = JSON.parse(report);

// switch to a real locale, then time the passes
await page.eval(`window.__ccProbe = CCI18n.setLocale('tr').then(function () { return true; })`);
await new Promise((r) => setTimeout(r, 4000));

const timed = await page.eval(`(async function () {
  var out = { locale: CCI18n.locale() };
  var host = document.querySelector('#ve-timeline, .ve-timeline, #timeline, #left-panel') || document.body;
  out.hostElements = host.querySelectorAll('*').length;

  // A MutationObserver callback is a MICROTASK, so timing the append measures nothing. What it costs
  // is main-thread time the app cannot use, and that is measured by asking how late a zero timer runs.
  function blockedBy(fn) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      fn();
      setTimeout(function () { resolve(Math.round((performance.now() - t0) * 10) / 10); }, 0);
    });
  }

  out.idle = await blockedBy(function () {});
  out.oneMutation = await blockedBy(function () {
    var d = document.createElement('div'); d.textContent = 'Add'; host.appendChild(d); d.remove();
  });
  out.tenMutations = await blockedBy(function () {
    for (var i = 0; i < 10; i++) { var d = document.createElement('div'); d.textContent = 'Add'; host.appendChild(d); d.remove(); }
  });
  out.thirtyMutations = await blockedBy(function () {
    for (var i = 0; i < 30; i++) { var d = document.createElement('div'); d.textContent = 'Add'; host.appendChild(d); d.remove(); }
  });
  return JSON.stringify(out);
})()`);

// speed is worth nothing if the batched pass stopped translating anything
const correct = await page.eval(`(function () {
  return new Promise(function (resolve) {
    var out = {};
    var key = null, val = null;
    // pick a real entry out of the active dictionary rather than inventing one
    var probeHost = document.body;
    var d = null;
    try { d = CCI18n.__dict ? CCI18n.__dict() : null; } catch (e) {}
    if (!d) {
      // no accessor: use a string the runtime itself can translate
      key = 'Settings';
      val = CCI18n.t(key);
    } else {
      for (var k in d) { if (d[k] && k.length > 3) { key = k; val = d[k]; break; } }
    }
    out.key = key; out.expected = val;

    var el = document.createElement('div');
    el.textContent = key;
    el.setAttribute('title', key);
    probeHost.appendChild(el);

    setTimeout(function () {
      out.textAfter = el.textContent;
      out.titleAfter = el.getAttribute('title');
      out.textTranslated = (out.textAfter === val);
      out.titleTranslated = (out.titleAfter === val);
      el.remove();
      resolve(JSON.stringify(out));
    }, 300);
  });
})()`);

console.log(JSON.stringify({ ...base, ...JSON.parse(timed), correctness: JSON.parse(correct) }, null, 1));
await page.close();
