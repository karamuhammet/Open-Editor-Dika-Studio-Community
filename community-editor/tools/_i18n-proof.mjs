/* Real Chromium proof for locale loading, Settings picker, and no-reload switching on file://. */
import { openFile } from './_cdp.mjs';
import { resolve } from 'node:path';

const codes = ['zh', 'fr', 'de', 'tr', 'pt', 'ja', 'pl', 'ru', 'hi'];
const page = await openFile(resolve('index.html'));
try {
  const runtimeReady = await page.eval(`new Promise(function (resolve) {
    var started = Date.now();
    (function wait() {
      if (window.CCI18n) return resolve(true);
      if (Date.now() - started > 10000) return resolve(false);
      setTimeout(wait, 50);
    })();
  })`);
  if (!runtimeReady) throw new Error('i18n runtime did not load');
  await page.eval('CCI18n.ready');
  const before = await page.eval(`({
    locales: CCI18n.locales.map(function (item) { return item.code; }),
    home: CCI18n.t('Home'),
    lang: document.documentElement.lang
  })`);
  await page.eval(`new Promise(function (resolve) {
    var started = Date.now();
    (function wait() {
      if (typeof window.openSettingsScreen === 'function' && window.__ccSettings &&
          typeof window.__ccSettings.openSettingsScreen === 'function' &&
          typeof window.__ccSettings.buildPreferencesSection === 'function') return resolve(true);
      if (Date.now() - started > 10000) return resolve(false);
      setTimeout(wait, 50);
    })();
  })`);
  await page.eval("window.openSettingsScreen('preferences')");
  await page.eval(`new Promise(function (resolve) {
    var started = Date.now();
    (function wait() {
      if (document.getElementById('settings-screen')) return resolve(true);
      if (Date.now() - started > 10000) return resolve(false);
      setTimeout(wait, 50);
    })();
  })`);
  await page.eval("document.querySelector('.settings-nav[data-section=\\\"preferences\\\"]')?.click()");
  await page.eval(`new Promise(function (resolve) {
    var started = Date.now();
    (function wait() {
      if (document.getElementById('set-locale')) return resolve(true);
      if (Date.now() - started > 10000) return resolve(false);
      setTimeout(wait, 50);
    })();
  })`);
  const picker = await page.eval(`({
    exists: !!document.getElementById('set-locale'),
    options: document.getElementById('set-locale') ? Array.from(document.getElementById('set-locale').options).map(function (o) { return o.value; }) : [],
    guidance: document.querySelector('[data-i18n="Select a language. Changes apply immediately."]')?.textContent || null
  })`);
  const switched = [];
  for (const code of codes) {
    switched.push(await page.eval(`CCI18n.setLocale('${code}').then(function () { return {
      code: CCI18n.locale(), lang: document.documentElement.lang, home: CCI18n.t('Home'), settings: CCI18n.t('Settings'),
      guidance: document.querySelector('[data-i18n="Select a language. Changes apply immediately."]')?.textContent || null
    }; })`));
  }
  if (!before.locales.includes('en') || !picker.exists || picker.options.length !== 11) {
    throw new Error('Settings locale picker incomplete: ' + JSON.stringify({ before, picker }));
  }
  if (switched.some((item) => item.code !== item.lang || !item.home || !item.settings || !item.guidance)) throw new Error('Locale switch incomplete');
  await page.eval("CCI18n.setLocale('tr')");
  const nativeDialogs = await page.eval(`({
    wrapped: !!window.__ccI18nNativeDialogs && window.prompt !== window.__ccI18nNativeDialogs.prompt && window.confirm !== window.__ccI18nNativeDialogs.confirm,
    promptLabel: CCI18n.t('Rename shape:'),
    confirmLabel: CCI18n.t('Delete this profile?')
  })`);
  if (!nativeDialogs.wrapped || nativeDialogs.promptLabel === 'Rename shape:' || nativeDialogs.confirmLabel === 'Delete this profile?') throw new Error('Native dialog translation incomplete: ' + JSON.stringify(nativeDialogs));
  console.log(JSON.stringify({ before, picker, switched, nativeDialogs, pageErrors: page.pageErrors, consoleErrors: page.consoleErrors }, null, 2));
} finally {
  await page.close();
}
