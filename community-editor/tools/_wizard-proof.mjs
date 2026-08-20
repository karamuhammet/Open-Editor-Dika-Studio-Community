/* R2 proof: the setup wizard, on a double-clicked index.html.
 *
 * What it has to establish, in order, because each one is a way the wizard could be worse than not
 * having it:
 *   1. It appears on a FRESH profile, and only after the store is ready (a wizard that races the
 *      store greets a returning user as a new one).
 *   2. Screen 2 exists and says the thing it exists to say.
 *   3. Telemetry is OFF by default and stays off through a Skip.
 *   4. Escape does NOT close it. That screen is the only warning somebody gets about losing work.
 *   5. Choices persist to IndexedDB and a SECOND boot does not show it again.
 *   6. Settings > About reopens it.
 *
 *   node tools/_wizard-proof.mjs
 */
import { openFile } from './_cdp.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', 'index.html');

const page = await openFile(INDEX);   // a fresh --user-data-dir every run, so this IS a fresh profile
await new Promise((r) => setTimeout(r, 8000));   // boot + the wizard's 1200 ms settle

const first = await page.eval(`(() => {
  const ov = document.querySelector('.cc-fr-ov');
  return JSON.stringify({
    shown: !!ov,
    title: ov ? ov.querySelector('.cc-fr-title').textContent : null,
    dots: ov ? ov.querySelectorAll('.cc-fr-dot').length : 0,
    storeReady: !!(window.CCLocalStore && window.CCLocalStore.id()),
    api: typeof window.CCFirstRun
  });
})()`);

/* Escape must NOT close it. */
const escape = await page.eval(`(async () => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  return JSON.stringify({ stillOpen: !!document.querySelector('.cc-fr-ov') });
})()`);

/* Walk it: screen 2 must carry the warning, telemetry must start unticked, Skip must not enable it. */
const walk = await page.eval(`(async () => {
  const ov = () => document.querySelector('.cc-fr-ov');
  const next = () => ov().querySelector('[data-fr="next"]');
  const seen = [];
  let warnText = null, telemetryDefault = null, skipLabel = null;

  for (let i = 0; i < 8 && ov(); i++) {
    const title = ov().querySelector('.cc-fr-title').textContent;
    seen.push(title);
    const warn = ov().querySelector('.cc-fr-warn');
    if (warn) warnText = warn.textContent.slice(0, 90);
    const cb = ov().querySelector('[data-fr="telemetry"]');
    if (cb && telemetryDefault === null) telemetryDefault = cb.checked;
    if (title.indexOf('account') > -1) skipLabel = next().textContent;
    const last = next().textContent === 'Start using it';
    next().click();
    await new Promise(r => setTimeout(r, 220));
    if (last) break;
  }
  return JSON.stringify({ screens: seen, warnText, telemetryDefault, skipLabel, closed: !ov() });
})()`);

const stored = await page.eval(`(async () => {
  const row = await CCIdb.get('settings', 'firstRun');
  return JSON.stringify({
    saved: !!row,
    telemetry: row ? row.telemetry : null,
    completed: row ? !!row.completedAt : null,
    hasInstallId: row ? !!row.installId : null,
    installIdLooksRandom: row ? (row.installId || '').length > 10 : null,
    version: row ? row.version : null
  });
})()`);

/* Second boot: it must NOT come back. */
await page.eval(`location.reload()`);
await new Promise((r) => setTimeout(r, 9000));
const second = await page.eval(`JSON.stringify({ shown: !!document.querySelector('.cc-fr-ov') })`);

/* Settings > About must reopen it. */
const reopen = await page.eval(`(async () => {
  window.openSettingsScreen();
  await new Promise(r => setTimeout(r, 400));
  const nav = document.querySelector('.settings-nav[data-section="about"]');
  if (!nav) return JSON.stringify({ aboutTab: false });
  nav.click();
  await new Promise(r => setTimeout(r, 250));
  const btn = document.getElementById('about-open-wizard');
  if (!btn) return JSON.stringify({ aboutTab: true, button: false });
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  return JSON.stringify({ aboutTab: true, button: true, reopened: !!document.querySelector('.cc-fr-ov') });
})()`);

console.log(JSON.stringify({
  firstBoot: JSON.parse(first),
  escapeDoesNotClose: JSON.parse(escape),
  walkthrough: JSON.parse(walk),
  storedState: JSON.parse(stored),
  secondBoot: JSON.parse(second),
  reopenFromSettings: JSON.parse(reopen),
  pageErrors: page.pageErrors.slice(0, 6),
  consoleErrors: page.consoleErrors.slice(0, 6)
}, null, 1));

await page.close();
