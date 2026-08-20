/* The font picker still works after being made lazy.
 *
 * refreshFamilyPicker used to refill the hidden <select> and rebuild the whole drawn list on every
 * selection change; both are now conditional (tools/_rp-cost-probe.mjs measured the cost). A faster
 * panel that has stopped listing fonts is not a win, so this drives the real control in the real app:
 * open it, count what is drawn, search, pick a family, and read the canvas object back.
 *
 * Everything is done through the picker's own DOM events, never by calling its internals, because the
 * whole change is about WHEN those internals run.
 *
 *   node tools/_font-picker-proof.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DESKTOP = join(dirname(ROOT), 'community-desktop');
const ELECTRON = join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!existsSync(ELECTRON)) throw new Error('electron not installed: ' + ELECTRON);

const PORT = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const child = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding'], { cwd: DESKTOP, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d); });

async function json(path, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); if (r.ok) return await r.json(); } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no devtools\n' + stderr.slice(-400));
}
const page = (await json('/json/list')).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('page ws')); });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');
const evalIn = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  const d = r.result?.exceptionDetails;
  if (d) throw new Error('eval threw: ' + (d.exception?.description || d.text));
  return r.result?.result?.value;
};

for (let i = 0; i < 120; i++) {
  if (await evalIn('!!(window.canvas && window.fabric && document.querySelector(".ff-trigger"))')) break;
  await new Promise((r) => setTimeout(r, 500));
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); } else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); } };

const r = JSON.parse(await evalIn(`(function () {
  return new Promise(function (resolve) {
    var out = {};
    var wrap = document.getElementById('p-font').parentNode.querySelector('.ff-wrap') ||
               document.getElementById('p-font').nextElementSibling;
    var trigger = wrap.querySelector('.ff-trigger');
    var panel = wrap.querySelector('.ff-panel');
    var sel = document.getElementById('p-font');

    /* A text box with a family that is NOT the default, so a stale trigger is visible as a wrong
       name rather than as the value it would have shown anyway. */
    var tb = new fabric.Textbox('Proof', { left: 80, top: 80, width: 200, fontSize: 24, fontFamily: 'Roboto' });
    canvas.add(tb); canvas.setActiveObject(tb); canvas.requestRenderAll();
    syncRightPanel();

    out.triggerAfterSelect = (trigger.querySelector('.ff-trigger-family') || {}).textContent;
    out.hiddenValueAfterSelect = sel.value;
    out.optionsWhileClosed = panel.querySelectorAll('.ff-option').length;
    out.nativeOptionsAfterSelect = sel.options.length;

    /* Open it the way a person does. */
    trigger.click();
    setTimeout(function () {
      out.openClass = wrap.classList.contains('open');
      out.optionsWhenOpen = panel.querySelectorAll('.ff-option').length;
      out.selectedMarked = panel.querySelectorAll('.ff-option.is-selected').length;
      out.selectedIsRoboto = !!(panel.querySelector('.ff-option.is-selected') || {}).dataset &&
        panel.querySelector('.ff-option.is-selected').dataset.value === 'Roboto';

      /* Search narrows the same list. */
      var search = panel.querySelector('.ff-search');
      search.value = 'lato';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(function () {
        out.optionsAfterSearch = panel.querySelectorAll('.ff-option').length;
        var lato = null, all = panel.querySelectorAll('.ff-option');
        for (var i = 0; i < all.length; i++) if (all[i].dataset.value === 'Lato') lato = all[i];
        out.searchFoundLato = !!lato;
        if (lato) lato.click();
        setTimeout(function () {
          out.familyOnObject = canvas.getActiveObject() ? canvas.getActiveObject().fontFamily : null;
          out.hiddenValueAfterPick = sel.value;
          out.triggerAfterPick = (trigger.querySelector('.ff-trigger-family') || {}).textContent;
          out.closedAfterPick = !wrap.classList.contains('open');

          /* And the panel keeps up with a plain selection change afterwards: a second box on the
             default family, then back to the first. This is the path that used to rebuild the list. */
          var tb2 = new fabric.Textbox('Second', { left: 300, top: 80, width: 200, fontSize: 24, fontFamily: 'Inter' });
          canvas.add(tb2); canvas.setActiveObject(tb2); canvas.requestRenderAll(); syncRightPanel();
          out.triggerOnSecond = (trigger.querySelector('.ff-trigger-family') || {}).textContent;
          canvas.setActiveObject(tb); canvas.requestRenderAll(); syncRightPanel();
          out.triggerBackOnFirst = (trigger.querySelector('.ff-trigger-family') || {}).textContent;

          /* Reopening after all of that must still draw the list, and mark the right row.
             NOTE, and it is not a regression: closing the picker does not clear the search box, so a
             reopen re-renders through the query that is still typed in it. That was true before this
             change too - refreshFamilyPicker called the same renderFamilyOptions, which reads the
             same input - so both states are asserted rather than one of them quietly "fixed". */
          trigger.click();
          setTimeout(function () {
            out.searchStillTyped = search.value;
            out.optionsOnReopenWithQuery = panel.querySelectorAll('.ff-option').length;
            var mark = panel.querySelector('.ff-option.is-selected');
            out.reopenSelected = mark ? mark.dataset.value : null;
            search.value = '';
            search.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(function () {
              out.optionsOnReopenCleared = panel.querySelectorAll('.ff-option').length;
              trigger.click();
              canvas.remove(tb); canvas.remove(tb2); canvas.requestRenderAll();
              resolve(JSON.stringify(out));
            }, 120);
          }, 120);
        }, 160);
      }, 120);
    }, 160);
  });
})()`));

console.log('\nfont picker, driven through its own DOM');
check('the trigger names the selected family', r.triggerAfterSelect === 'Roboto', 'shows "' + r.triggerAfterSelect + '"');
check('the hidden select carries the value', r.hiddenValueAfterSelect === 'Roboto', 'value "' + r.hiddenValueAfterSelect + '"');
check('the native option list is filled once', r.nativeOptionsAfterSelect > 100, r.nativeOptionsAfterSelect + ' options');
check('nothing is drawn while it is closed', r.optionsWhileClosed === 0, r.optionsWhileClosed + ' drawn (this is the saving)');
check('it opens', r.openClass === true);
check('opening draws the whole catalog', r.optionsWhenOpen > 100, r.optionsWhenOpen + ' options drawn');
check('the current family is marked', r.selectedIsRoboto === true, r.selectedMarked + ' marked');
check('search narrows the list', r.optionsAfterSearch > 0 && r.optionsAfterSearch < r.optionsWhenOpen, r.optionsAfterSearch + ' of ' + r.optionsWhenOpen);
check('search finds Lato', r.searchFoundLato === true);
check('picking writes the canvas object', r.familyOnObject === 'Lato', 'fontFamily "' + r.familyOnObject + '"');
check('picking writes the hidden select', r.hiddenValueAfterPick === 'Lato', 'value "' + r.hiddenValueAfterPick + '"');
check('picking updates the trigger', r.triggerAfterPick === 'Lato', 'shows "' + r.triggerAfterPick + '"');
check('picking closes the panel', r.closedAfterPick === true);
check('selecting another object follows it', r.triggerOnSecond === 'Inter', 'shows "' + r.triggerOnSecond + '"');
check('selecting back follows again', r.triggerBackOnFirst === 'Lato', 'shows "' + r.triggerBackOnFirst + '"');
check('reopening honours the query still typed', r.searchStillTyped === 'lato' && r.optionsOnReopenWithQuery > 0,
  '"' + r.searchStillTyped + '" -> ' + r.optionsOnReopenWithQuery + ' options (unchanged behaviour, the box shows the query)');
check('reopening marks the current family', r.reopenSelected === 'Lato', 'marked "' + r.reopenSelected + '"');
check('clearing the search draws the catalog again', r.optionsOnReopenCleared > 100, r.optionsOnReopenCleared + ' options');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
ws.close();
child.kill();
process.exit(fail ? 1 : 0);
