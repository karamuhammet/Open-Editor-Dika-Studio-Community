/* THE proof for this build: everything below is measured on a double-clicked `index.html`.
 * No server, no bundler, no test framework. Driven over CDP by tools/_cdp.mjs.
 *
 *   node tools/_file-proof.mjs
 */
import { openFile, findChromium } from './_cdp.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', 'index.html');

const chrome = findChromium();
if (!chrome) { console.error('No chromium found; set CC_CHROME.'); process.exit(2); }

const page = await openFile(INDEX);
await new Promise((r) => setTimeout(r, 6000));

/* R8 CHANGED THIS ASSERTION ON PURPOSE. It used to be "zero cross-origin requests" and that was
 * right while the build made none. The owner turned on registration, the install beacon and live ads
 * (2026-08-15), so zero is now wrong by design. Deleting the check would give up the only automated
 * guard against this build quietly growing a second phone-home, so it becomes an ALLOWLIST: every
 * outbound origin must be one we named, and an unexpected one fails the proof.
 *
 * On a machine with no route to the host, `unexpected` stays empty because nothing resolves; the
 * assertion that matters is that no origin appears which is NOT in this list. */
const ALLOWED_ORIGINS = ['https://app.dika.studio'];

const boot = await page.eval(`(() => {
  const res = performance.getEntriesByType('resource');
  const allowed = ${JSON.stringify(ALLOWED_ORIGINS)};
  const foreign = res.map(e => { try { return new URL(e.name).origin; } catch (x) { return null; } })
    .filter(o => o && o !== location.origin && o !== 'null');
  return JSON.stringify({
    protocol: location.protocol,
    bundled: !!window.CC_BUNDLED,
    edition: window.CCEdition && window.CCEdition.id,
    apiBase: window.CCEdition && window.CCEdition.apiBase,
    canvas: !!window.canvas,
    fabric: !!window.fabric,
    gsapGone: typeof window.gsap === 'undefined',
    anime: typeof window.anime === 'function',
    banner: !!document.getElementById('cc-fileproto-banner'),
    localStore: !!window.CCLocalStore,
    storeId: window.CCLocalStore ? window.CCLocalStore.id() : null,
    crossOrigin: foreign.length,
    crossOriginOrigins: Array.from(new Set(foreign)),
    unexpectedOrigins: Array.from(new Set(foreign.filter(o => allowed.indexOf(o) === -1))),
    /* The PATHS, not just the hosts. "one request to our own server" is not an audit; which one it
       is decides whether the payload contract was kept. */
    crossOriginPaths: res.map(e => e.name).filter(n => n.indexOf(location.origin) !== 0 && n.indexOf('file:') !== 0)
      .map(n => { try { return new URL(n).pathname; } catch (x) { return n.slice(0, 60); } }),
    fontsUsable: document.fonts.check('16px "DM Sans"'),
    videoEncoder: typeof VideoEncoder !== 'undefined'
  });
})()`);

/* R8: THE GATE. It renders on every launch while signed out, and this is the run where it has never
 * been seen, so it must be here. Then "Later" must close it while writing nothing that stops the
 * next launch asking, which is checked against the stored record and again after the reload below. */
const gateFirst = await page.eval(`(async () => {
  /* THE GATE IS THE REGISTRATION WIZARD NOW (owner, 2026-08-15): full screen, published from :3001,
     shown before anything else while signed out. This run has no route to the server, so it must
     fall back to the built-in screen rather than to nothing. The setup wizard follows it. */
  const rw = document.querySelector('.cc-rw-ov');
  const rwState = window.CCRegisterWizard ? CCRegisterWizard._state() : null;
  if (rw) {
    const later = rw.querySelector('[data-rw="later"]');
    const src = rwState && rwState.source;
    if (later) { later.click(); await new Promise(r => setTimeout(r, 700)); }
    var registerGate = { rendered: true, source: src, steps: rwState && rwState.stepCount, closedByLater: !document.querySelector('.cc-rw-ov') };
  } else {
    var registerGate = { rendered: false, source: rwState && rwState.source };
  }
  await new Promise(r => setTimeout(r, 600));
  const ov = document.querySelector('.cc-fr-ov');
  const out = {
    registerGate: registerGate,
    rendered: !!ov,
    signedIn: !!(window.CCAccount && CCAccount.signedIn()),
    screenTitle: ov ? (ov.querySelector('.cc-fr-title') || {}).textContent : null,
    panelState: ov ? (ov.querySelector('[data-cc-acc]') || {}).getAttribute ? ov.querySelector('[data-cc-acc]').getAttribute('data-cc-acc') : null : null,
    laterLabel: null, closed: null, recordAfter: null
  };
  if (!ov) return JSON.stringify(out);
  /* On a FIRST run this is the whole wizard and the account screen is one of five, so walk it the
     way a person does: press the primary until the overlay is gone. Record what the account screen
     looked like on the way past, because that is the screen under test.

     The first version of this probe pressed once on the account screen and asserted it had closed.
     It was wrong about the product, not about the code: inside the full wizard "Later, continue"
     continues to the last screen, and only the gate-alone form closes on that press. */
  const titles = [];
  for (let i = 0; i < 10; i++) {
    if (!document.querySelector('.cc-fr-ov')) break;
    const t = (ov.querySelector('.cc-fr-title') || {}).textContent;
    titles.push(t);
    const acc = ov.querySelector('[data-cc-acc]');
    if (acc) {
      out.panelState = acc.getAttribute('data-cc-acc');
      out.laterLabel = (ov.querySelector('[data-fr="next"]') || {}).textContent;
      out.buysListed = ov.querySelectorAll('.cc-acc-list li').length;
    }
    const next = ov.querySelector('[data-fr="next"]');
    if (!next) break;
    next.click();
    await new Promise(r => setTimeout(r, 150));
  }
  out.screens = titles;
  out.closed = !document.querySelector('.cc-fr-ov');
  const rec = await CCIdb.get('settings', 'firstRun').catch(() => null);
  const acct = await CCIdb.get('settings', 'account').catch(() => null);
  out.recordAfter = rec ? { completedAt: rec.completedAt, registered: rec.registered, skipped: rec.skipped } : null;
  out.hasToken = !!(acct && acct.token);
  return JSON.stringify(out);
})()`);

const idb = await page.eval(`new Promise(res => {
  const q = indexedDB.open('__cc_file_proof', 1);
  q.onsuccess = () => { try { q.result.close(); } catch(e){} res('ok'); };
  q.onerror = () => res('ERROR: ' + q.error);
  setTimeout(() => res('timeout'), 3000);
})`);

/* The two ad surfaces that are PANELS. */
const panels = await page.eval(`(() => {
  let ai = false, products = false;
  try { window.mountAiPanelInFlyout(); ai = !!document.querySelector('#ai-flyout-host [data-cc-locked="ai"]'); } catch(e){}
  try { if (window.renderProductsPanel) { renderProductsPanel(); products = !!document.querySelector('[data-cc-locked="products"]'); } } catch(e){}
  return JSON.stringify({ ai, products });
})()`);

/* The third one is a set of BUTTONS: every social tile in the share menu. */
const share = await page.eval(`(async () => {
  const opened = [], toasts = [];
  const realOpen = window.open; window.open = u => { opened.push(String(u).slice(0,40)); return null; };
  const realToast = window.showToast; window.showToast = (m,k) => toasts.push((k||'info')+': '+String(m).slice(0,50));
  const KEYS = ['instagram','facebook','tiktok','linkedin','x','whatsapp','telegram','reddit','pinterest','email'];
  const out = [];
  for (const k of KEYS) {
    const old = document.getElementById('cc-locked-modal'); if (old) old.remove();
    if (typeof window.openShareMenu === 'function') window.openShareMenu();
    await new Promise(r => setTimeout(r, 100));
    const tile = document.querySelector('[data-share="'+k+'"]');
    if (!tile) { out.push({ key:k, tile:false }); continue; }
    const before = opened.length;
    tile.click();
    await new Promise(r => setTimeout(r, 150));
    const m = document.getElementById('cc-locked-modal');
    out.push({ key:k, tile:true, card:!!m,
      surface: m ? m.querySelector('[data-cc-locked]').getAttribute('data-cc-locked') : null,
      ext: opened.length - before });
  }
  let escClosed = null;
  if (document.getElementById('cc-locked-modal')) {
    /* On BODY, not on document: shortcuts.js reads e.target.tagName, and document has none. A real
       keypress always targets an element, so dispatching on document is the probe inventing an error. */
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', bubbles:true }));
    await new Promise(r => setTimeout(r, 120));
    escClosed = !document.getElementById('cc-locked-modal');
  }
  window.open = realOpen; window.showToast = realToast;
  const bad = out.filter(r => !r.tile || !r.card || r.ext > 0);
  return JSON.stringify({ tested: out.length, allShowCard: bad.length === 0, failures: bad,
    externalWindows: opened, toasts, escapeCloses: escClosed, sample: out[0] });
})()`);

/* R8 REPLACES THE OLD `nudge` SECTION. system/nudge is deleted: the launch gate asks every time, so
   a second weekly prompt was nagging twice for one thing. What is checked instead is that signing
   out is reachable and honest, and that the account panel has states rather than a dead button. */
const account = await page.eval(`(async () => {
  const out = { nudgeGone: typeof window.CCNudge === 'undefined', account: !!window.CCAccount };
  if (!window.CCAccount) return JSON.stringify(out);
  out.installId = !!CCAccount.installId();
  out.signedIn = CCAccount.signedIn();
  /* The panel with no server reachable: pressing Sign in must leave one sentence and a signed-out
     state, never a spinner that never ends and never an unhandled rejection. */
  const host = document.createElement('div');
  host.innerHTML = CCAccount.signInPanelHtml();
  document.body.appendChild(host);
  out.stateBefore = host.querySelector('[data-cc-acc]').getAttribute('data-cc-acc');
  out.buysListed = host.querySelectorAll('.cc-acc-list li').length;
  await CCAccount.startSignIn();
  host.innerHTML = CCAccount.signInPanelHtml();
  const el = host.querySelector('[data-cc-acc]');
  out.stateAfterOfflineSignIn = el ? el.getAttribute('data-cc-acc') : null;
  out.messageShown = el ? (el.querySelector('.cc-acc-warn') || {}).textContent || null : null;
  out.stillSignedOut = !CCAccount.signedIn();
  CCAccount.cancelSignIn();
  host.remove();
  /* Signing out with nothing to revoke must still resolve, and must not throw. */
  out.signOutResolves = await CCAccount.signOut().then(() => true, () => false);
  return JSON.stringify(out);
})()`);

/* R8: the ad client. The static card is the floor and an overlay creative is REFUSED, not handled:
   the hosted editor measured an unpainted full-screen overlay capturing the whole viewport and
   looking exactly like a frozen app. This asserts the sanitiser drops it. */
const ads = await page.eval(`(() => {
  if (!window.CCAds) return JSON.stringify({ present: false });
  const overlay = CCAds._sanitize({ creatives: { ai: { format: 'overlay', title: 'X', body: 'Y' } } });
  const card = CCAds._sanitize({ creatives: { ai: { format: 'card', title: 'Real', ctaUrl: 'https://example.com/x' } } });
  const jsUrl = CCAds._sanitize({ creatives: { ai: { format: 'card', title: 'Real', ctaUrl: 'javascript:alert(1)' } } });
  const unknown = CCAds._sanitize({ creatives: { nowhere: { format: 'card', title: 'X' } } });
  return JSON.stringify({
    present: true,
    allowedFormats: CCAds.allowedFormats,
    overlayRefused: overlay === null,
    cardKept: !!(card && card.ai && card.ai.title === 'Real'),
    ctaKept: !!(card && card.ai && card.ai.ctaUrl),
    javascriptUrlDropped: !!(jsUrl && jsUrl.ai && jsUrl.ai.ctaUrl === null),
    unknownPlacementDropped: unknown === null
  });
})()`);

/* The beacon payload is a CONTRACT and is asserted key by key, not by counting. Nothing about a
   document may ever appear here. */
const beacon = await page.eval(`(async () => {
  if (!window.CCTelemetry) return JSON.stringify({ present: false });
  const out = {
    present: true,
    keysSignedOut: CCTelemetry.payloadShape(),
    endpoint: CCTelemetry.endpoint(),
    configured: CCTelemetry.configured()
  };
  /* The SIGNED-IN shape too, because accountId is the one field that appears conditionally and
     "the payload is fine" measured in only one of its two states is not measured. A fake record is
     written straight to the store and removed again; nothing is sent. */
  const before = await CCIdb.get('settings', 'account').catch(() => null);
  const fake = Object.assign({}, before || {}, {
    token: 'PROOF-TOKEN', tokenExpiresAt: Date.now() + 60000,
    user: { id: 'acc_proof', name: 'Proof', email: 'p@example.com', plan: 'free' }
  });
  await CCIdb.put('settings', fake, 'account');
  location.reload();
  return JSON.stringify(out);
})()`);
await new Promise((r) => setTimeout(r, 7000));
const beaconSignedIn = await page.eval(`(async () => {
  const out = {
    signedIn: !!(window.CCAccount && CCAccount.signedIn()),
    keysSignedIn: window.CCTelemetry ? CCTelemetry.payloadShape() : null,
    /* THE CREDENTIAL MUST NOT BE IN THE BODY. It identifies nobody the server could not identify
       from a header, and a token in a POST body is a token in every access log on the way. */
    tokenInPayload: false,
    gateSuppressed: !document.querySelector('.cc-fr-ov')
  };
  if (window.CCTelemetry) {
    const shape = CCTelemetry.payloadShape();
    out.hasAccountId = shape.indexOf('accountId') !== -1;
  }
  /* Put it back the way it was, so the reload assertions later in this file see a signed-out app. */
  await CCAccount.signOut();
  return JSON.stringify(out);
})()`);

/* R7: the three surfaces that used to render live controls which could only fail. Each must show
   the card, and Excel must be untouched: it is the half of the Bulk Builder that works offline. */
const locked = await page.eval(`(async () => {
  const out = {};

  /* Bulk Builder needs a real SOURCE before it opens (openModal -> ensureSourceReady): a saved page
     carrying at least one design field. Give it one rather than calling a private renderer, so the
     probe exercises the same path a person does. */
  try {
    const t = new fabric.Textbox('NAME', { left: 60, top: 60, fontSize: 32 });
    t._dfField = 'name';
    canvas.add(t); canvas.renderAll();
    if (typeof window.saveCurrentPage === 'function') window.saveCurrentPage();
    let why = null;
    const realToast = window.showToast; window.showToast = (m) => { why = String(m).slice(0, 80); };
    if (typeof window.openBulkBuilder === 'function') window.openBulkBuilder();
    window.showToast = realToast;
    out.openRefusedBecause = why;
    await new Promise(r => setTimeout(r, 600));
    const choice = (m) => document.querySelector('[data-bb-mode="' + m + '"]');
    out.cards = ['ai','excel','products'].map(m => {
      const b = choice(m);
      return { mode: m, present: !!b, disabled: b ? !!b.disabled : null };
    });
    for (const m of ['ai','products']) {
      const b = choice(m);
      if (!b) { out[m] = 'no card'; continue; }
      b.click();
      await new Promise(r => setTimeout(r, 400));
      /* Scope to the bulk builder's OWN hosts. A document-wide query finds the Products PANEL card
         painted earlier in this proof and reports it for every mode, which is how the first run of
         this check said "ai -> products" and called Excel wrongly locked. */
      const card = document.querySelector('#bb-ai-locked [data-cc-locked], #bb-products-locked [data-cc-locked]');
      out[m] = card ? card.getAttribute('data-cc-locked') : 'NO CARD';
      const back = document.getElementById('bulk-builder-tochoose');
      if (back) { back.click(); await new Promise(r => setTimeout(r, 300)); }
    }
    // Excel must still enter its real first step, not a card.
    const ex = choice('excel');
    if (ex) {
      ex.click();
      await new Promise(r => setTimeout(r, 400));
      out.excel = document.querySelector('#bb-ai-locked, #bb-products-locked') ? 'WRONGLY LOCKED' : 'live';
    }
  } catch (e) { out.bulkError = String(e).slice(0, 90); }

  /* Works browser: "Bu proje" is local and must stay live; "All projects" is the org read model and
     must show the card, not an empty grid or a bare "Failed to load." */
  try {
    if (window.CCWorksBrowser) {
      CCWorksBrowser.open();
      await new Promise(r => setTimeout(r, 400));
      const grid = document.querySelector('.ccwb-grid, [class*="ccwb"] .ccwb-empty, .ccwb-body');
      const scopeAll = document.querySelector('.ccwb-scopebtn[data-scope="all"]');
      const scopeProj = document.querySelector('.ccwb-scopebtn[data-scope="project"]');
      out.worksLocalLive = !!scopeProj && !document.querySelector('.ccwb-scopebtn[data-scope="project"].on ~ * [data-cc-locked]');
      if (scopeAll) {
        scopeAll.click();
        await new Promise(r => setTimeout(r, 400));
        const c = document.querySelector('[data-cc-locked="works"]');
        out.worksAllProjects = c ? 'works card' : 'NO CARD';
      } else { out.worksAllProjects = 'no scope button'; }
      if (scopeProj) { scopeProj.click(); await new Promise(r => setTimeout(r, 300)); }
      out.worksLocalAfterBack = !document.querySelector('[data-cc-locked="works"]');
      CCWorksBrowser.close();
    }
  } catch (e) { out.worksError = String(e).slice(0, 90); }

  // The two ElevenLabs stock tabs.
  try {
    for (const p of ['elevenlabs','elevenlabs-music']) {
      const host = document.getElementById('stock-' + p + '-results');
      if (!host) { out[p] = 'no host'; continue; }
      if (typeof window._stockSearch === 'function') window._stockSearch(p, 'test', false);
      await new Promise(r => setTimeout(r, 250));
      const c = host.querySelector('[data-cc-locked]');
      out[p] = c ? c.getAttribute('data-cc-locked') : 'NO CARD';
    }
  } catch (e) { out.stockError = String(e).slice(0, 90); }

  return JSON.stringify(out);
})()`);

/* Save something, reload the file, and see it come back. */
const marker = 'FILE-' + Date.now().toString(36);
await page.eval(`(async () => {
  await CCLocalStore.ready;
  const t = new fabric.Textbox(${JSON.stringify(marker)}, { left: 80, top: 120, fontSize: 40, fill: '#f2ff58' });
  canvas.add(t); canvas.renderAll();
  CCLocalStore.writeDoc(window.buildAutosavePayload());
  await CCLocalStore.flush();
  return true;
})()`);
await page.eval(`location.reload()`);
await new Promise((r) => setTimeout(r, 7000));
const restored = await page.eval(`(async () => {
  await CCLocalStore.ready;
  await new Promise(r => setTimeout(r, 2000));
  return JSON.stringify({ objects: canvas.getObjects().map(o => o.text || o.type), url: location.search });
})()`);

/* THE ASSERTION THE WHOLE DECISION RESTS ON, and the one a source read cannot make: the SECOND
   launch, after "Later" was pressed on the first, asks again. It must also now be the GATE (the
   account screen alone), not the five-screen wizard: somebody who has read the storage warning does
   not get it again. */
const gateSecond = await page.eval(`(async () => {
  /* The second launch: the REGISTRATION wizard must be back (it is the thing that asks every time),
     and the setup wizard must NOT be, because it was walked on launch one. */
  const rw = document.querySelector('.cc-rw-ov');
  const registerAgain = !!rw;
  if (rw) {
    const later = rw.querySelector('[data-rw="later"]');
    if (later) { later.click(); await new Promise(r => setTimeout(r, 800)); }
  }
  const setupBack = !!document.querySelector('.cc-fr-ov');
  if (registerAgain) return JSON.stringify({ renderedAgain: true, registerWizardAgain: true, setupWizardAgain: setupBack, gateOnly: !setupBack });
  const ov = document.querySelector('.cc-fr-ov');
  if (!ov) return JSON.stringify({ renderedAgain: false, registerWizardAgain: false });
  const dots = ov.querySelectorAll('.cc-fr-dot').length;
  const acc = ov.querySelector('[data-cc-acc]');
  return JSON.stringify({
    renderedAgain: true,
    gateOnly: dots === 0,
    title: (ov.querySelector('.cc-fr-title') || {}).textContent,
    showsAccountPanel: !!acc,
    laterLabel: (ov.querySelector('[data-fr="next"]') || {}).textContent
  });
})()`);

console.log(JSON.stringify({
  chrome, page: page.url,
  boot: JSON.parse(boot),
  indexedDB: idb,
  gateFirstLaunch: JSON.parse(gateFirst),
  gateSecondLaunch: JSON.parse(gateSecond),
  accountModule: JSON.parse(account),
  adClient: JSON.parse(ads),
  beaconPayload: JSON.parse(beacon),
  beaconWhenSignedIn: JSON.parse(beaconSignedIn),
  panelAdSurfaces: JSON.parse(panels),
  shareTiles: JSON.parse(share),
  lockedSurfaces: JSON.parse(locked),
  savedMarker: marker,
  afterReload: JSON.parse(restored),
  pageErrors: page.pageErrors.slice(0, 6),
  consoleErrors: page.consoleErrors.slice(0, 6)
}, null, 1));

await page.close();
