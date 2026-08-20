/* Crawl visible community-editor surfaces on file:// and report untranslated UI text. */
import { openFile } from './_cdp.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requestedCodes = process.argv.slice(2).filter(function (code) { return ['zh', 'fr', 'de', 'tr', 'pt', 'ja', 'pl', 'ru', 'hi', 'es'].includes(code); });
const codes = requestedCodes.length ? requestedCodes : ['zh', 'fr', 'de', 'tr', 'pt', 'ja', 'pl', 'ru', 'hi', 'es'];
const summaryMode = process.argv.includes('--summary');
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const englishSourceManifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'scripts/i18n/extracted/community-editor.en.json'), 'utf8'));
const englishSourceKeys = new Set((englishSourceManifest.items || []).map(function (item) {
  return String(item.text || '').replace(/\s+/g, ' ').trim();
}).filter(Boolean));

const waitFor = (page, expression, timeout = 10000) => page.eval(`new Promise(function (resolve) {
  var started = Date.now();
  (function wait() {
    if (${expression}) return resolve(true);
    if (Date.now() - started > ${timeout}) return resolve(false);
    setTimeout(wait, 50);
  })();
})`);

const visibleCount = (page, selector) => page.eval(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(function (node) {
  var style = window.getComputedStyle(node); var rect = node.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && !!rect.width && !!rect.height;
}).length`);

const clickVisibleAt = (page, selector, index) => page.eval(`(function () {
  var nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
  var visible = nodes.filter(function (node) {
    var style = window.getComputedStyle(node); var rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && !!rect.width && !!rect.height;
  });
  var node = visible[${index}];
  if (!node) return null;
  var label = (node.innerText || node.getAttribute('aria-label') || node.title || node.id || '').trim();
  try { node.click(); } catch (e) { return label + ' [click failed]'; }
  return label;
})()`);

const closeTransientMenus = (page) => page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);

async function clickAndSnapshot(page, selector, index, step, snapshots, surfaceSteps) {
  const clicked = await clickVisibleAt(page, selector, index);
  if (clicked === null) return false;
  await new Promise((resolve) => setTimeout(resolve, 100));
  surfaceSteps.push(step + ':' + (clicked || index));
  snapshots.push(await snapshot(page));
  return true;
}

const snapshot = (page) => page.eval(`(function () {
  function excluded(el) {
    while (el) {
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'canvas' || tag === 'code' || tag === 'pre') return true;
      if (el.hasAttribute && (el.hasAttribute('data-i18n-ignore') || el.getAttribute('translate') === 'no')) return true;
      if (el.isContentEditable || el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
      el = el.parentElement;
    }
    return false;
  }
  function visible(node) {
    var el = node.parentElement;
    if (!el || excluded(el)) return false;
    var style = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && !!rect.width && !!rect.height;
  }
  var out = [];
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  var node;
  while ((node = walker.nextNode())) {
    if (!visible(node)) continue;
    var value = String(node.nodeValue || '');
    var text = value.replace(/\\s+/g, ' ').trim();
    if (text.length < 2) continue;
    out.push({ source: typeof node.__ccI18nSource === 'string' ? node.__ccI18nSource.replace(/\\s+/g, ' ').trim() : text, value: text,
      tag: node.parentElement.tagName, id: node.parentElement.id || '', cls: String(node.parentElement.className || '').slice(0, 120) });
  }
  var attrs = [];
  Array.from(document.querySelectorAll('input,textarea,select,button,[role="button"],[title],[aria-label]')).forEach(function (el) {
    var style = window.getComputedStyle(el); var rect = el.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height || excluded(el)) return;
    ['placeholder', 'title', 'aria-label', 'alt'].forEach(function (attr) {
      var value = el.getAttribute(attr);
      if (value && value.trim().length > 1) attrs.push({ attr: attr, source: el.__ccI18nAttrs && el.__ccI18nAttrs[attr] || value, value: value.trim(), tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 120) });
    });
  });
  return { text: out, attrs: attrs, lang: document.documentElement.lang };
})()`);

function isTechnical(text) {
  return !text || /^([\\[({]|https?:|data:|mailto:|#[0-9a-f]|[a-z0-9_.:-]+\\s*=|[A-Z0-9_./:-]+$)/i.test(text) ||
    /^(Ctrl|Alt|Shift|Cmd)(\\+|$)/i.test(text) || /^[\\d .×x/%+\-:;,]+$/.test(text);
}

const ENGLISH_UI_WORDS = /\b(?:the|and|or|to|of|in|on|with|from|for|your|you|this|that|new|open|close|save|settings|support|help|website|board|canvas|mode|panel|cart|folder|create|shopping|account|upload|image|video|search|template|tools|view|file|edit|background|color|page|preview|drag|move|assistant|toolbar|toggle|hide|solid|pick|preset|size|rename|already|exists|go|existing|community|editor|product|library|online|offline|release|news|contact|visit|email|switch|draw|add|shape|sticky|note|connector|across|entire)\b/i;
// Dynamic right-panel HTML is generated after extraction, so its labels are not guaranteed to
// exist in community-editor.en.json. Keep this narrow: it targets property/layout vocabulary,
// not brand names, file formats, social networks, or user content.
const DYNAMIC_RIGHT_PANEL_WORDS = /\b(?:properties|layout|layers|position|constrain|proportions|distribute|selected|arrange|flip|align|rotation|width|height|font|weight|opacity|border|effect|basic|gradient|solid|fill)\b/i;
// These UI terms are established native/loan words in target locales, so same spelling is not
// evidence of a missed translation. Keep them in audit output as unchanged, but do not report them
// as likely English leaks.
const NATIVE_SPELLINGS = {
  fr: new Set(['Rotation']),
  de: new Set(['Layout', 'Gradient']),
  pt: new Set(['Layout']),
  pl: new Set(['Gradient']),
  es: new Set(['Audio', 'Color', 'Control', 'Editorial', 'General', 'Global', 'Horizontal', 'Legal', 'Marketing', 'Monitor', 'Normal', 'Original', 'Panel', 'Popular', 'Vertical', 'Video'])
};
function likelyUntranslated(row, code) {
  const value = row.values[0] || '';
  if (NATIVE_SPELLINGS[code] && NATIVE_SPELLINGS[code].has(row.source)) return false;
  // French legitimately uses the same word for the generated page label "Page 1".
  if (/^Page \d+$/.test(row.source)) return false;
  return value === row.source && (englishSourceKeys.has(row.source) || DYNAMIC_RIGHT_PANEL_WORDS.test(row.source)) && /[A-Za-z]/.test(value) &&
    !/[ğüşöçıİĞÜŞÖÇ]/.test(value) &&
    (ENGLISH_UI_WORDS.test(value) || DYNAMIC_RIGHT_PANEL_WORDS.test(value));
}

function mergeSnapshots(snapshots) {
  const seen = new Map();
  for (const snap of snapshots) for (const row of [...snap.text, ...snap.attrs]) {
    const key = (row.source || row.value).replace(/\\s+/g, ' ').trim();
    if (!key || (isTechnical(key) && !DYNAMIC_RIGHT_PANEL_WORDS.test(key))) continue;
    const existing = seen.get(key) || { source: key, values: new Set(), locations: new Set() };
    existing.values.add(row.value);
    existing.locations.add([row.tag, row.id, row.cls].filter(Boolean).join('#'));
    seen.set(key, existing);
  }
  return [...seen.values()].map((row) => ({ source: row.source, values: [...row.values], locations: [...row.locations] }));
}

const report = {};
const pageErrors = [];
const consoleErrors = [];
for (const code of codes) {
  const page = await openFile(resolve(APP_ROOT, 'index.html'));
  try {
    if (!await waitFor(page, 'window.CCI18n')) throw new Error('i18n runtime did not load');
    await page.eval('CCI18n.ready');
    await page.eval('typeof window.closeSettings === "function" && window.closeSettings()');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await page.eval(`CCI18n.setLocale(${JSON.stringify(code)})`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const snapshots = [await snapshot(page)];
    const surfaceSteps = ['initial'];

    // Dynamic surfaces missed by a text-only crawl. Actions below only open/close UI; no export,
    // delete, save, external share, or file picker action is invoked.
    await page.eval('document.getElementById("btn-export") && document.getElementById("btn-export").click()');
    if (await waitFor(page, 'document.querySelector(".sharepop.show")')) {
      surfaceSteps.push('share:root');
      snapshots.push(await snapshot(page));
      await page.eval('document.querySelector(".sharepop-tile-more") && document.querySelector(".sharepop-tile-more").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      surfaceSteps.push('share:social-all');
      snapshots.push(await snapshot(page));
      await page.eval('document.querySelector(".sharepop-back") && document.querySelector(".sharepop-back").click()');
      await page.eval('typeof window.closeShareMenu === "function" && window.closeShareMenu()');
    }

    const menuCount = await visibleCount(page, '.mbar-item');
    for (let i = 0; i < menuCount; i++) {
      await page.eval(`(function(){var nodes=document.querySelectorAll('.mbar-item'), node=nodes[${i}]; if(node&&node.parentElement) node.parentElement.classList.add('open');})()`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      surfaceSteps.push('menu:' + i);
      snapshots.push(await snapshot(page));
      await page.eval('document.querySelectorAll(".mbar-group.open").forEach(function(node){node.classList.remove("open")})');
    }

    await page.eval('var gear=document.getElementById("gear-dropdown"); if(gear) gear.classList.add("show")');
    await new Promise((resolve) => setTimeout(resolve, 80));
    surfaceSteps.push('gear:dropdown');
    snapshots.push(await snapshot(page));
    await page.eval('var gear=document.getElementById("gear-dropdown"); if(gear) gear.classList.remove("show")');

    // Right-panel surfaces are mounted dynamically after canvas boot and were previously
    // missed by the rail/settings crawl. These clicks only switch tabs or open transient
    // menus; no property value, selection, file, export, delete, or external window changes.
    const rpTabCount = await visibleCount(page, '#rp-tab-bar .rp-tab');
    for (let i = 0; i < rpTabCount; i++) {
      await clickAndSnapshot(page, '#rp-tab-bar .rp-tab', i, 'right-panel:tab', snapshots, surfaceSteps);
      await closeTransientMenus(page);
    }
    const layoutMenuSelectors = [
      '#lp-dist-btn', '#lp-flip-btn',
      '#rp-size-preset-btn', '#rp-unit-btn',
      '#p-bg-fit-btn', '#p-bg-effects-btn'
    ];
    for (const selector of layoutMenuSelectors) {
      if (await clickAndSnapshot(page, selector, 0, 'right-panel:menu', snapshots, surfaceSteps)) {
        await closeTransientMenus(page);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const imageTabCount = await visibleCount(page, '#rp-img-tabs .ve-insp-docktab');
    for (let i = 0; i < imageTabCount; i++) {
      await clickAndSnapshot(page, '#rp-img-tabs .ve-insp-docktab', i, 'right-panel:image-tab', snapshots, surfaceSteps);
    }

    if (await page.eval('typeof window.showShortcutsModal === "function"')) {
      await page.eval('window.showShortcutsModal()');
      await new Promise((resolve) => setTimeout(resolve, 120));
      surfaceSteps.push('modal:shortcuts');
      snapshots.push(await snapshot(page));
      await page.eval('typeof window.hideShortcutsModal === "function" ? window.hideShortcutsModal() : (typeof window.handleEscape === "function" && window.handleEscape())');
    }

    const railCount = await visibleCount(page, '.rail-item[data-tab]');
    for (let i = 0; i < railCount; i++) {
      surfaceSteps.push('rail:' + (await clickVisibleAt(page, '.rail-item[data-tab]', i)));
      await new Promise((resolve) => setTimeout(resolve, 120));
      snapshots.push(await snapshot(page));
    }
    await page.eval('typeof window.openSettingsScreen === "function" && window.openSettingsScreen("preferences")');
    await waitFor(page, 'document.getElementById("settings-screen")');
    const settingsCount = await visibleCount(page, '.settings-nav');
    for (let i = 0; i < settingsCount; i++) {
      surfaceSteps.push('settings:' + (await clickVisibleAt(page, '.settings-nav', i)));
      await new Promise((resolve) => setTimeout(resolve, 120));
      snapshots.push(await snapshot(page));
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
    snapshots.push(await snapshot(page));
    const localized = mergeSnapshots(snapshots);
    const unchanged = localized.filter((row) => row.values.some((value) => value === row.source));
    const turkish = localized.filter((row) => /[ğüşöçıİĞÜŞÖÇ]/.test(row.values.join(' ')));
    report[code] = {
      visibleKeys: localized.length,
      unchanged: unchanged.length,
      unchangedSamples: unchanged.slice(0, 40),
      likelyUntranslated: unchanged.filter((row) => likelyUntranslated(row, code)).slice(0, 120),
      valuesContainingTurkishChars: turkish.length,
      turkishSamples: turkish.slice(0, 40),
      lang: (await page.eval('document.documentElement.lang')),
      surfaceSteps: surfaceSteps
    };
    pageErrors.push(...page.pageErrors);
    consoleErrors.push(...page.consoleErrors);
  } finally {
    await page.close();
  }
}
if (summaryMode) {
  const summary = Object.fromEntries(Object.entries(report).map(([code, item]) => [code, {
    visibleKeys: item.visibleKeys,
    unchanged: item.unchanged,
    likelyUntranslated: item.likelyUntranslated.map((row) => row.source),
    lang: item.lang,
    surfaceSteps: item.surfaceSteps.length
  }]));
  console.log(JSON.stringify({ summary, pageErrors, consoleErrors }, null, 2));
} else {
  console.log(JSON.stringify({ report, pageErrors, consoleErrors }, null, 2));
}
