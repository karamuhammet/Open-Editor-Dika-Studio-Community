/* Real Chromium proof for registration-only seams that must work without a live API:
 * - the locale field reuses all editor locales, not the two options in stale authored content;
 * - a completed account remains on a success screen until the person continues.
 */
import { openFile } from './_cdp.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const page = await openFile(resolve(HERE, '..', 'index.html'));
await new Promise((r) => setTimeout(r, 8000));

const report = await page.eval(`(async function () {
  if (CCRegisterWizard.isOpen()) CCRegisterWizard.close(false);

  var originalFetch = window.fetch;
  var originalAccount = window.CCAccount;
  var listeners = [];
  var signed = false;
  var flow = null;

  window.fetch = function (url) {
    if (String(url).indexOf('/api/community/device/start') !== -1) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () { return Promise.resolve({
          deviceCode: 'device-url-proof', userCode: 'URL001', verifyUrl: 'https://0.0.0.0:3000/device', interval: 5, expiresIn: 600
        }); }
      });
    }
    if (String(url).indexOf('/api/community/register') !== -1) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () { return Promise.resolve({
          deviceCode: 'device-proof', userCode: 'PROOF1', verifyUrl: 'https://example.test/device', interval: 5, expiresIn: 600
        }); }
      });
    }
    return originalFetch.apply(this, arguments);
  };

  await originalAccount.startSignIn();
  var safeDeviceUrl = originalAccount.verifyUrl();
  originalAccount.cancelSignIn();

  window.CCAccount = {
    installId: function () { return 'proof-install'; },
    flow: function () { return flow; },
    signedIn: function () { return signed; },
    signInPanelHtml: function () { return signed ? '<div data-proof-signed>Signed in</div>' : '<div>Waiting</div>'; },
    adoptDeviceFlow: function () {
      flow = { status: 'pending' };
      setTimeout(function () {
        signed = true;
        flow = { status: 'done' };
        for (var i = 0; i < listeners.length; i++) listeners[i]();
      }, 20);
      return true;
    },
    onChange: function (fn) { listeners.push(fn); }
  };

  CCRegisterWizard.open({ id: 'proof', steps: [{
    id: 'profile', type: 'fields', required: true, title: 'Profile', fields: [
      { key: 'locale', mapKey: 'locale', kind: 'select', label: 'Language', options: [
        { value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }
      ] },
      { key: 'email', kind: 'email', label: 'Email', required: true },
      { key: 'terms', kind: 'checkbox', label: 'Terms', required: true }
    ]
  }] });

  var locale = document.querySelector('[data-rw-field="locale"]');
  var email = document.querySelector('[data-rw-field="email"]');
  var terms = document.querySelector('[data-rw-field="terms"]');
  email.value = 'proof@example.test';
  email.dispatchEvent(new Event('input', { bubbles: true }));
  terms.checked = true;
  terms.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-rw="next"]').click();
  await new Promise(function (r) { setTimeout(r, 120); });

  var localeValues = Array.prototype.map.call(locale.options, function (o) { return o.value; }).filter(Boolean);
  var beforeContinue = {
    localeCount: localeValues.length,
    localeValues: localeValues,
    open: CCRegisterWizard.isOpen(),
    registered: CCRegisterWizard._state().registered,
    title: document.querySelector('.cc-rw-title').textContent,
    button: document.querySelector('[data-rw="next"]').textContent,
    signedPanel: !!document.querySelector('[data-proof-signed]')
  };
  document.querySelector('[data-rw="next"]').click();
  var afterContinue = { open: CCRegisterWizard.isOpen() };

  window.fetch = originalFetch;
  window.CCAccount = originalAccount;
  return JSON.stringify({ safeDeviceUrl: safeDeviceUrl, beforeContinue: beforeContinue, afterContinue: afterContinue });
})()`);

const result = JSON.parse(report);
if (result.safeDeviceUrl !== 'https://app.dika.studio/device' || result.beforeContinue.localeCount !== 11 || !result.beforeContinue.open || !result.beforeContinue.registered ||
    result.beforeContinue.button !== 'Continue to editor' || !result.beforeContinue.signedPanel || result.afterContinue.open) {
  throw new Error('registration wizard proof failed: ' + JSON.stringify(result));
}
console.log(JSON.stringify(result, null, 2));
await page.close();
