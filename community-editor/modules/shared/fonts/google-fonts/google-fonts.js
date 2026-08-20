(function () {
  'use strict';

  var DEFAULT_FAMILY = 'DM Sans';
  var DEFAULT_WEIGHT = '400';
  var FONT_IDS = [
    { family: 'p-font', weight: 'p-weight', searchable: true, applyToCanvas: true, syncWithActive: true },
    // flyout-font-preview/weight removed from the text panel (2026-06-23)
    { family: 'tp-font', weight: 'tp-weight', searchable: true, applyToCanvas: false, syncWithActive: false }
  ];
  var CATEGORY_ORDER = ['Custom Fonts', 'Project Fonts', 'Sans-serif', 'Serif', 'Display', 'Handwriting', 'Monospace'];
  var WEIGHT_LABELS = {
    '100': '100 Thin',
    '200': '200 ExtraLight',
    '300': '300 Light',
    '400': '400 Regular',
    '500': '500 Medium',
    '600': '600 SemiBold',
    '700': '700 Bold',
    '800': '800 ExtraBold',
    '900': '900 Black'
  };
  var GOOGLE_DEFAULTS = ['DM Sans', 'Unbounded', 'Outfit', 'Playfair Display', 'Cormorant Garamond', 'Lora', 'Space Mono', 'Bebas Neue', 'Josefin Sans', 'Georgia'];

  var loadedFamilies = new Set();
  var loadingPromises = {};
  var familyPickers = {};
  var weightPickers = {};
  var openFamilyPicker = null;
  var openWeightPicker = null;
  var projectFontMap = {};
  var googleBinaryCache = {};
  var googleCssCache = {};

  function isTextObject(obj) {
    return !!obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox');
  }

  function getActiveTextObject() {
    var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
      (typeof canvas !== 'undefined' ? canvas : null);
    if (!c) return null;
    var obj = c.getActiveObject();
    return isTextObject(obj) ? obj : null;
  }

  /* Every text the font controls should apply to. This module patches #p-font / #p-weight /
     #p-bold / #p-italic onto the right panel (patchStyleButtons), so once that panel shows its
     text section for an all-text MULTI-selection, these four have to follow it or they would be
     visible-but-dead: getActiveTextObject() returns null for an activeSelection, since the
     wrapper is not itself a text. rpTextTargets is the right panel's resolver; the fallback
     keeps this module working standalone. */
  function textTargets() {
    if (typeof rpTextTargets === 'function') {
      var t = rpTextTargets();
      if (t && t.length) return t;
    }
    var o = getActiveTextObject();
    return o ? [o] : [];
  }

  function getCanvasRef() {
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
      (typeof canvas !== 'undefined' ? canvas : null);
  }

  function normalizeFamilyName(value) {
    var family = String(value == null ? '' : value).trim();
    if (!family) return DEFAULT_FAMILY;
    if (family.indexOf(',') >= 0) family = family.split(',')[0];
    family = family.replace(/^['"]+|['"]+$/g, '').trim();
    return family || DEFAULT_FAMILY;
  }

  function normalizeWeight(value) {
    if (value == null || value === '') return DEFAULT_WEIGHT;
    var str = String(value).trim().toLowerCase();
    if (str === 'normal') return '400';
    if (str === 'bold') return '700';
    var n = parseInt(str, 10);
    if (!isNaN(n)) {
      if (n < 100) n = 100;
      if (n > 900) n = 900;
      n = Math.round(n / 100) * 100;
      return String(n);
    }
    return DEFAULT_WEIGHT;
  }

  function uniqueSortedWeights(list) {
    var seen = {};
    var out = [];
    if (list == null) list = [];
    else if (Array.isArray(list)) list = list.slice();
    else if (typeof list === 'number' || typeof list === 'string') list = [list];
    else if (typeof list === 'object') list = Object.keys(list);
    else list = [];
    list.forEach(function (value) {
      var w = normalizeWeight(value);
      if (!seen[w]) {
        seen[w] = true;
        out.push(parseInt(w, 10));
      }
    });
    out.sort(function (a, b) { return a - b; });
    return out.length ? out : [400];
  }

  function nearestWeight(weights, target, preferHeavier) {
    var list = uniqueSortedWeights(weights);
    var desired = parseInt(normalizeWeight(target), 10);
    if (!list.length) return 400;
    if (list.indexOf(desired) >= 0) return desired;
    if (preferHeavier === true) {
      for (var h = 0; h < list.length; h++) {
        if (list[h] >= desired) return list[h];
      }
      return list[list.length - 1];
    }
    if (preferHeavier === false) {
      for (var l = list.length - 1; l >= 0; l--) {
        if (list[l] <= desired) return list[l];
      }
      return list[0];
    }
    var best = list[0];
    var bestDistance = Math.abs(best - desired);
    for (var i = 1; i < list.length; i++) {
      var candidate = list[i];
      var distance = Math.abs(candidate - desired);
      if (distance < bestDistance || (distance === bestDistance && candidate < best)) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  function normalizeCategory(value) {
    var str = String(value == null ? '' : value).trim();
    if (!str) return 'Sans-serif';
    if (str.toLowerCase() === 'custom') return 'Custom Fonts';
    if (str.toLowerCase() === 'project') return 'Project Fonts';
    return str;
  }

  function getGoogleCatalog() {
    var raw = Array.isArray(window._GOOGLE_FONT_CATALOG) ? window._GOOGLE_FONT_CATALOG : [];
    return raw.filter(function (item) {
      var family = normalizeFamilyName(item.family || item.name);
      return family !== 'Material Icons' &&
        family !== 'Material Icons Outlined' &&
        family !== 'Material Icons Round' &&
        family !== 'Material Icons Sharp' &&
        family !== 'Material Icons Two Tone' &&
        family !== 'Noto Color Emoji';
    }).map(function (item) {
      return {
        family: normalizeFamilyName(item.family || item.name),
        category: normalizeCategory(item.category),
        weights: uniqueSortedWeights(item.weights),
        italic: !!item.italic,
        preview: item.preview || item.family || item.name,
        source: 'google'
      };
    });
  }

  function getCustomCatalog() {
    if (!window.FontManager || typeof window.FontManager.getAll !== 'function') return [];
    return window.FontManager.getAll().map(function (font) {
      return {
        family: normalizeFamilyName(font.name),
        category: 'Custom Fonts',
        weights: [400],
        italic: false,
        preview: font.name,
        source: 'custom'
      };
    });
  }

  function ensureProjectFont(family) {
    var name = normalizeFamilyName(family);
    if (!name || name === DEFAULT_FAMILY) return;
    if (findCatalogRecord(name)) return;
    if (!projectFontMap[name]) {
      projectFontMap[name] = {
        family: name,
        category: 'Project Fonts',
        weights: [400, 700],
        italic: true,
        preview: name,
        source: 'project'
      };
    }
  }

  function getProjectCatalog() {
    return Object.keys(projectFontMap).map(function (key) { return projectFontMap[key]; });
  }

  /* ── THE CATALOG IS BUILT ONCE, NOT PER LOOKUP ─────────────────────────────────────────────────
     MEASURED 2026-08-15 with tools/_rp-cost-probe.mjs: this rebuilt and re-SORTED ~1000 records
     (localeCompare, the slow comparator) on EVERY call, and it is called several times inside one
     syncRightPanel - findCatalogRecord and getAvailableWeights each call it again. The catalog can
     only move when a custom font is installed, when a project font is first seen, or when the
     shipped Google list loads, so it is cached against exactly those three counts. A count is
     cheap; a sort of a thousand strings is not. */
  var _catalogCache = null;
  var _catalogKey = '';

  function catalogKey() {
    var custom = (window.FontManager && typeof window.FontManager.getAll === 'function')
      ? (window.FontManager.getAll() || []).length : 0;
    var google = Array.isArray(window._GOOGLE_FONT_CATALOG) ? window._GOOGLE_FONT_CATALOG.length : 0;
    var project = 0;
    for (var k in projectFontMap) { if (Object.prototype.hasOwnProperty.call(projectFontMap, k)) project++; }
    return custom + ':' + project + ':' + google;
  }

  function getMergedCatalog() {
    var key = catalogKey();
    if (_catalogCache && key === _catalogKey) return _catalogCache;

    var merged = [];
    var seen = {};

    function pushAll(list) {
      list.forEach(function (record) {
        var key = normalizeFamilyName(record.family).toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        merged.push(record);
      });
    }

    pushAll(getCustomCatalog());
    pushAll(getProjectCatalog());
    pushAll(getGoogleCatalog());

    merged.sort(function (a, b) {
      var ac = CATEGORY_ORDER.indexOf(a.category);
      var bc = CATEGORY_ORDER.indexOf(b.category);
      if (ac !== bc) return (ac < 0 ? 999 : ac) - (bc < 0 ? 999 : bc);
      return a.family.localeCompare(b.family);
    });

    _catalogCache = merged;
    _catalogKey = key;
    return merged;
  }

  function findCatalogRecord(family) {
    var target = normalizeFamilyName(family).toLowerCase();
    var merged = getMergedCatalog();
    for (var i = 0; i < merged.length; i++) {
      if (normalizeFamilyName(merged[i].family).toLowerCase() === target) return merged[i];
    }
    return null;
  }

  function getAvailableWeights(family) {
    var record = findCatalogRecord(family);
    return uniqueSortedWeights(record && record.weights ? record.weights : [400]);
  }

  function buildGoogleFontUrl(record) {
    var family = encodeURIComponent(record.family).replace(/%20/g, '+');
    var weights = uniqueSortedWeights(record.weights);
    if (!record.italic) {
      return 'https://fonts.googleapis.com/css2?family=' + family + ':wght@' + weights.join(';') + '&display=swap';
    }
    var upright = weights.map(function (w) { return '0,' + w; });
    var italic = weights.map(function (w) { return '1,' + w; });
    return 'https://fonts.googleapis.com/css2?family=' + family + ':ital,wght@' + upright.concat(italic).join(';') + '&display=swap';
  }

  function fetchGoogleStylesheet(record) {
    if (!record || !record.family) return Promise.resolve('');
    var key = normalizeFamilyName(record.family);
    if (googleCssCache[key]) return Promise.resolve(googleCssCache[key]);
    return fetch(buildGoogleFontUrl(record), { mode: 'cors' }).then(function (res) {
      if (!res.ok) throw new Error('Google font CSS failed');
      return res.text();
    }).then(function (cssText) {
      googleCssCache[key] = cssText || '';
      return googleCssCache[key];
    });
  }

  function extractGoogleFontBinaryUrl(cssText) {
    var text = String(cssText || '');
    if (!text) return '';
    var matches = [];
    var re = /url\(([^)]+)\)\s*format\('([^']+)'\)/ig;
    var match;
    while ((match = re.exec(text))) {
      matches.push({
        url: String(match[1] || '').replace(/^['"]|['"]$/g, ''),
        format: String(match[2] || '').toLowerCase()
      });
    }
    if (!matches.length) {
      var basic = text.match(/url\(([^)]+)\)/i);
      return basic ? String(basic[1] || '').replace(/^['"]|['"]$/g, '') : '';
    }
    var preferred = ['woff', 'woff2', 'truetype', 'opentype'];
    for (var i = 0; i < preferred.length; i++) {
      var fmt = preferred[i];
      for (var j = 0; j < matches.length; j++) {
        if (matches[j].format === fmt) return matches[j].url;
      }
    }
    return matches[0].url;
  }

  function fetchGoogleFontBinary(family) {
    var name = normalizeFamilyName(family);
    if (!name) return Promise.resolve(null);
    if (googleBinaryCache[name]) return googleBinaryCache[name];
    var record = findCatalogRecord(name);
    if (!record || record.source === 'custom') return Promise.resolve(null);
    googleBinaryCache[name] = fetchGoogleStylesheet(record).then(function (cssText) {
      var fontUrl = extractGoogleFontBinaryUrl(cssText);
      if (!fontUrl) return null;
      return fetch(fontUrl, { mode: 'cors' }).then(function (res) {
        if (!res.ok) throw new Error('Google font binary failed');
        return res.arrayBuffer();
      });
    }).catch(function (err) {
      console.warn('Failed to resolve Google font binary:', name, err);
      delete googleBinaryCache[name];
      return null;
    });
    return googleBinaryCache[name];
  }

  function fontSpec(name) {
    return '16px "' + normalizeFamilyName(name).replace(/"/g, '') + '"';
  }

  // NOTE: document.fonts.check() is NOT a reliable "is it loaded?" test — it
  // returns true for a family that has NO @font-face at all (it assumes a system
  // fallback is available). Using it as a guard made loadGoogleFont skip loading
  // every non-preloaded font (they "looked loaded") → silent fallback rendering.
  // This walks the real FontFaceSet and only trusts an actually-'loaded' face.
  function isFamilyActuallyLoaded(name) {
    var target = normalizeFamilyName(name);
    if (loadedFamilies.has(target)) return true;
    if (!document.fonts || typeof document.fonts.forEach !== 'function') return false;
    var found = false;
    document.fonts.forEach(function (face) {
      if (!found && face.status === 'loaded' && normalizeFamilyName(face.family) === target) found = true;
    });
    return found;
  }

  function markPreloadedDefaults() {
    if (!document.fonts) return;
    GOOGLE_DEFAULTS.forEach(function (family) {
      if (isFamilyActuallyLoaded(family)) loadedFamilies.add(normalizeFamilyName(family));
    });
  }

  /* COMMUNITY EDITION: the 16 UI families are vendored (vendor/fonts/fonts.css), so a design using
     them needs no network. Every OTHER Google family is still a request to fonts.googleapis.com,
     which would quietly break the "zero cross-origin" promise the moment a document names one.
     So it is OPT-IN and off by default. `isFamilyActuallyLoaded` below already answers "is this
     face usable right now", which is exactly the vendored case, so no separate list is needed. */
  var VENDORED_NOTICE_SHOWN = false;
  function _googleFontsAllowed() {
    try { return localStorage.getItem('cc_allow_google_fonts') === '1'; } catch (e) { return false; }
  }

  function loadGoogleFont(family) {
    var name = normalizeFamilyName(family);
    ensureProjectFont(name);
    var record = findCatalogRecord(name);
    if (!record || record.source === 'custom' || record.source === 'project') {
      return document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    }
    if (isFamilyActuallyLoaded(name)) {
      loadedFamilies.add(name);
      return Promise.resolve();
    }
    if (loadingPromises[name]) return loadingPromises[name];

    if (!_googleFontsAllowed()) {
      /* Resolve, never reject: a missing webfont must fall back to a system face, not take down
         whatever was waiting on it (the subtitle renderer awaits this per frame). Say it once. */
      if (!VENDORED_NOTICE_SHOWN) {
        VENDORED_NOTICE_SHOWN = true;
        if (window.console) console.info('[fonts] "' + name + '" is not one of the bundled families. ' +
          'This build does not download fonts from Google by default. Enable it with ' +
          'localStorage.setItem("cc_allow_google_fonts","1") if you accept the request to fonts.googleapis.com.');
      }
      return Promise.resolve();
    }

    loadingPromises[name] = new Promise(function (resolve, reject) {
      var existing = document.querySelector('link[data-font-family="' + name.replace(/"/g, '&quot;') + '"]');
      if (existing) {
        (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
          loadedFamilies.add(name);
          delete loadingPromises[name];
          resolve();
        });
        return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = buildGoogleFontUrl(record);
      link.setAttribute('data-font-family', name);
      link.onload = function () {
        (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
          loadedFamilies.add(name);
          delete loadingPromises[name];
          resolve();
        });
      };
      link.onerror = function () {
        delete loadingPromises[name];
        reject(new Error('Font stylesheet failed'));
      };
      document.head.appendChild(link);
    });

    return loadingPromises[name];
  }

  function lucide(name, size) {
    size = size || 16;
    if (typeof _getLucideIconNode === 'function' && typeof _renderLucideChild === 'function') {
      var node = _getLucideIconNode(name);
      if (node) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          node.map(function (child) { return _renderLucideChild(child); }).join('') +
          '</svg>';
      }
    }
    return (typeof getIcon === 'function') ? getIcon(name, size) : '';
  }

  // The right panel clips absolutely-positioned children (.rpanel overflow
  // hidden + the #rp-properties-wrap scroller), so an in-place dropdown gets
  // cut off and wheel input scroll-chains into the panel scroller, dragging
  // the anchored list away under the cursor. Every other rp popover is
  // body-appended for this exact reason; portal the pickers while open.
  function portalOpen(instance, panelEl) {
    if (!panelEl || panelEl._ccPortaled) return;
    var r = instance.trigger.getBoundingClientRect();
    panelEl._ccPortaled = true;
    panelEl._ccHome = panelEl.parentNode;
    document.body.appendChild(panelEl);
    panelEl.classList.add('ff-portaled');
    panelEl.style.position = 'fixed';
    var w = Math.max(r.width, 220);
    panelEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    panelEl.style.width = w + 'px';
    var spaceBelow = window.innerHeight - r.bottom - 16;
    var spaceAbove = r.top - 16;
    var listEl = panelEl.querySelector('.ff-options') || panelEl;
    var chrome = panelEl.classList.contains('ff-panel') ? 74 : 8; // search row + padding
    if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
      panelEl.style.top = (r.bottom + 8) + 'px';
      panelEl.style.bottom = 'auto';
      listEl.style.maxHeight = Math.min(320, Math.max(120, spaceBelow - chrome)) + 'px';
    } else {
      panelEl.style.top = 'auto';
      panelEl.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      listEl.style.maxHeight = Math.min(320, Math.max(120, spaceAbove - chrome)) + 'px';
    }
  }

  function portalClose(panelEl) {
    if (!panelEl || !panelEl._ccPortaled) return;
    panelEl._ccPortaled = false;
    panelEl.classList.remove('ff-portaled');
    panelEl.style.position = '';
    panelEl.style.left = '';
    panelEl.style.width = '';
    panelEl.style.top = '';
    panelEl.style.bottom = '';
    var listEl = panelEl.querySelector('.ff-options');
    if (listEl) listEl.style.maxHeight = '';
    if (panelEl._ccHome) { panelEl._ccHome.appendChild(panelEl); panelEl._ccHome = null; }
  }

  function closeFamilyPicker(instance) {
    if (!instance) return;
    instance.wrap.classList.remove('open');
    instance.trigger.setAttribute('aria-expanded', 'false');
    portalClose(instance.panel);
    if (openFamilyPicker === instance) openFamilyPicker = null;
  }

  function closeWeightPicker(instance) {
    if (!instance) return;
    instance.wrap.classList.remove('open');
    instance.trigger.setAttribute('aria-expanded', 'false');
    portalClose(instance.menu);
    if (openWeightPicker === instance) openWeightPicker = null;
  }

  function closeAllPickers() {
    if (openFamilyPicker) closeFamilyPicker(openFamilyPicker);
    if (openWeightPicker) closeWeightPicker(openWeightPicker);
  }

  function setNativeOptions(selectEl, values, formatter) {
    if (!selectEl) return;
    var selected = selectEl.value;
    selectEl.innerHTML = '';
    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = String(value);
      option.textContent = formatter ? formatter(value) : String(value);
      selectEl.appendChild(option);
    });
    if (selected && values.map(String).indexOf(String(selected)) >= 0) selectEl.value = String(selected);
  }

  function setHiddenSelectValue(selectEl, value) {
    if (!selectEl) return;
    var target = String(value == null ? '' : value);
    var hasOption = false;
    for (var i = 0; i < selectEl.options.length; i++) {
      if (String(selectEl.options[i].value) === target) {
        hasOption = true;
        break;
      }
    }
    if (!hasOption && target) {
      var opt = document.createElement('option');
      opt.value = target;
      opt.textContent = target;
      selectEl.appendChild(opt);
    }
    selectEl.value = target;
  }

  function styleTriggerPreview(trigger, family) {
    if (!trigger) return;
    var previewEl = trigger.querySelector('.ff-trigger-family');
    if (previewEl) previewEl.style.fontFamily = '"' + normalizeFamilyName(family).replace(/"/g, '') + '", ui-sans-serif, sans-serif';
  }

  function renderFamilyOptions(instance) {
    var query = String(instance.searchInput ? instance.searchInput.value : '').trim().toLowerCase();
    var catalog = getMergedCatalog().filter(function (record) {
      if (!query) return true;
      var hay = (record.family + ' ' + record.category + ' ' + (record.preview || '')).toLowerCase();
      return hay.indexOf(query) >= 0;
    });

    var byCategory = {};
    CATEGORY_ORDER.forEach(function (cat) { byCategory[cat] = []; });
    catalog.forEach(function (record) {
      var cat = CATEGORY_ORDER.indexOf(record.category) >= 0 ? record.category : 'Sans-serif';
      byCategory[cat].push(record);
    });

    instance.optionButtons = [];
    instance.list.innerHTML = '';
    var selected = normalizeFamilyName(instance.selectEl.value || DEFAULT_FAMILY);

    CATEGORY_ORDER.forEach(function (category) {
      var list = byCategory[category] || [];
      if (!list.length) return;
      var section = document.createElement('div');
      section.className = 'ff-section';
      section.innerHTML = '<div class="ff-section-title">' + category + '</div>';
      list.forEach(function (record) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ff-option' + (normalizeFamilyName(record.family) === selected ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', normalizeFamilyName(record.family) === selected ? 'true' : 'false');
        btn.dataset.value = record.family;
        btn.innerHTML =
          '<span class="ff-option-main">' +
            '<span class="ff-option-preview" style="font-family:\'' + record.family.replace(/'/g, "\\'") + '\', ui-sans-serif, sans-serif">' + esc(record.preview || record.family) + '</span>' +
            '<span class="ff-option-meta">' + esc(record.category) + ' · ' + record.weights.length + ' weights</span>' +
          '</span>' +
          '<span class="ff-option-check">' + lucide('check', 14) + '</span>';
        btn.addEventListener('mouseenter', function () {
          loadGoogleFont(record.family).then(function () {
            var preview = btn.querySelector('.ff-option-preview');
            if (preview) preview.style.fontFamily = '"' + record.family.replace(/"/g, '') + '", ui-sans-serif, sans-serif';
          });
        });
        btn.addEventListener('focus', function () {
          loadGoogleFont(record.family).then(function () {
            var preview = btn.querySelector('.ff-option-preview');
            if (preview) preview.style.fontFamily = '"' + record.family.replace(/"/g, '') + '", ui-sans-serif, sans-serif';
          });
        });
        btn.addEventListener('click', function () {
          selectFamily(instance, record.family);
        });
        section.appendChild(btn);
        instance.optionButtons.push(btn);
      });
      instance.list.appendChild(section);
    });

    instance.activeIndex = instance.optionButtons.length ? Math.max(0, instance.optionButtons.findIndex(function (btn) {
      return btn.dataset.value === selected;
    })) : -1;
  }

  function updateWeightOptions(instance, family, selectedWeight) {
    if (!instance) return;
    var weights = getAvailableWeights(family);
    setNativeOptions(instance.selectEl, weights, function (value) { return WEIGHT_LABELS[String(value)] || String(value); });
    var resolved = String(nearestWeight(weights, selectedWeight || instance.selectEl.value || DEFAULT_WEIGHT, null));
    setHiddenSelectValue(instance.selectEl, resolved);
    instance.currentValue = resolved;
    renderWeightOptions(instance);
    syncWeightTrigger(instance, resolved);
  }

  function renderWeightOptions(instance) {
    var selected = normalizeWeight(instance.selectEl.value || DEFAULT_WEIGHT);
    instance.menu.innerHTML = '';
    instance.optionButtons = [];
    var weights = [];
    for (var i = 0; i < instance.selectEl.options.length; i++) weights.push(String(instance.selectEl.options[i].value));
    weights.forEach(function (weight) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ff-weight-option' + (weight === selected ? ' is-selected' : '');
      btn.dataset.value = weight;
      btn.innerHTML = '<span>' + (WEIGHT_LABELS[weight] || weight) + '</span><span class="ff-option-check">' + lucide('check', 14) + '</span>';
      btn.addEventListener('click', function () { selectWeight(instance, weight); });
      instance.menu.appendChild(btn);
      instance.optionButtons.push(btn);
    });
  }

  function syncFamilyTrigger(instance, family) {
    var name = normalizeFamilyName(family || DEFAULT_FAMILY);
    setHiddenSelectValue(instance.selectEl, name);
    instance.currentValue = name;
    var label = instance.trigger.querySelector('.ff-trigger-family');
    var meta = instance.trigger.querySelector('.ff-trigger-meta');
    if (label) label.textContent = name;
    if (meta) {
      var record = findCatalogRecord(name);
      meta.textContent = record ? record.category : 'Font Family';
    }
    styleTriggerPreview(instance.trigger, name);
    if (instance.optionButtons && instance.optionButtons.length) {
      instance.optionButtons.forEach(function (btn) {
        var on = btn.dataset.value === name;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
  }

  function syncWeightTrigger(instance, weight) {
    var value = normalizeWeight(weight || DEFAULT_WEIGHT);
    setHiddenSelectValue(instance.selectEl, value);
    instance.currentValue = value;
    var label = instance.trigger.querySelector('.ff-weight-label');
    // Closed trigger shows just the numeric weight (matches the Size input beside it); the open menu
    // keeps the descriptive names. Full label kept as a tooltip.
    if (label) { label.textContent = value; if (instance.trigger) instance.trigger.title = WEIGHT_LABELS[value] || value; }
    if (instance.optionButtons && instance.optionButtons.length) {
      instance.optionButtons.forEach(function (btn) {
        var on = btn.dataset.value === value;
        btn.classList.toggle('is-selected', on);
      });
    }
  }

  function selectFamily(instance, family) {
    var name = normalizeFamilyName(family);
    ensureProjectFont(name);
    syncFamilyTrigger(instance, name);
    if (instance.linkedWeight) {
      var activeObj = getActiveTextObject();
      var currentWeight = activeObj ? normalizeWeight(activeObj.fontWeight || DEFAULT_WEIGHT) : DEFAULT_WEIGHT;
      updateWeightOptions(instance.linkedWeight, name, currentWeight);
    }
    closeFamilyPicker(instance);
    if (instance.applyToCanvas) {
      applySelection({
        family: name,
        weight: instance.linkedWeight ? instance.linkedWeight.currentValue : null,
        italic: null
      }, null, { sourcePicker: instance.id });
    } else {
      loadGoogleFont(name).then(function () {
        styleTriggerPreview(instance.trigger, name);
      });
    }
  }

  function selectWeight(instance, weight) {
    var value = normalizeWeight(weight);
    syncWeightTrigger(instance, value);
    closeWeightPicker(instance);
    if (instance.applyToCanvas) {
      applySelection({
        family: instance.linkedFamily ? instance.linkedFamily.currentValue : DEFAULT_FAMILY,
        weight: value,
        italic: null
      }, null, { sourcePicker: instance.id });
    }
  }

  function openFamily(instance) {
    if (!instance) return;
    if (openFamilyPicker && openFamilyPicker !== instance) closeFamilyPicker(openFamilyPicker);
    if (openWeightPicker) closeWeightPicker(openWeightPicker);
    renderFamilyOptions(instance);
    instance.wrap.classList.add('open');
    instance.trigger.setAttribute('aria-expanded', 'true');
    portalOpen(instance, instance.panel);
    openFamilyPicker = instance;
    if (instance.searchInput) {
      setTimeout(function () {
        instance.searchInput.focus();
        instance.searchInput.select();
      }, 0);
    }
  }

  function openWeight(instance) {
    if (!instance) return;
    if (openWeightPicker && openWeightPicker !== instance) closeWeightPicker(openWeightPicker);
    if (openFamilyPicker) closeFamilyPicker(openFamilyPicker);
    renderWeightOptions(instance);
    instance.wrap.classList.add('open');
    instance.trigger.setAttribute('aria-expanded', 'true');
    portalOpen(instance, instance.menu);
    openWeightPicker = instance;
  }

  function focusFamilyOption(instance, nextIndex) {
    if (!instance.optionButtons || !instance.optionButtons.length) return;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= instance.optionButtons.length) nextIndex = instance.optionButtons.length - 1;
    instance.activeIndex = nextIndex;
    var btn = instance.optionButtons[nextIndex];
    if (btn) btn.focus();
  }

  function buildFamilyPicker(config) {
    var selectEl = document.getElementById(config.family);
    if (!selectEl || familyPickers[config.family]) return;
    selectEl.onchange = null;
    selectEl.classList.add('ff-native-hidden');

    var wrap = document.createElement('div');
    wrap.className = 'ff-picker ff-picker-family';
    wrap.setAttribute('data-picker-id', config.family);

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ff-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML =
      '<span class="ff-trigger-copy">' +
        '<span class="ff-trigger-family">' + esc(selectEl.value || DEFAULT_FAMILY) + '</span>' +
        '<span class="ff-trigger-meta">Font Family</span>' +
      '</span>' +
      '<span class="ff-trigger-arrow">' + lucide('chevrons-up-down', 14) + '</span>';

    var panel = document.createElement('div');
    panel.className = 'ff-panel';
    panel.setAttribute('role', 'listbox');
    panel.innerHTML =
      '<div class="ff-search-wrap">' +
        '<span class="ff-search-icon">' + lucide('search', 14) + '</span>' +
        '<input type="text" class="ff-search" placeholder="Search fonts..." aria-label="Search fonts">' +
      '</div>' +
      '<div class="ff-options"></div>';

    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);

    var instance = {
      id: config.family,
      selectEl: selectEl,
      wrap: wrap,
      trigger: trigger,
      panel: panel,
      list: panel.querySelector('.ff-options'),
      searchInput: panel.querySelector('.ff-search'),
      currentValue: normalizeFamilyName(selectEl.value || DEFAULT_FAMILY),
      applyToCanvas: !!config.applyToCanvas,
      optionButtons: [],
      linkedWeightId: config.weight,
      activeIndex: -1
    };

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (openFamilyPicker === instance && instance.wrap.classList.contains('open')) closeFamilyPicker(instance);
      else openFamily(instance);
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openFamily(instance);
      }
    });

    instance.searchInput.addEventListener('click', function (e) { e.stopPropagation(); });
    instance.searchInput.addEventListener('input', function () { renderFamilyOptions(instance); });
    instance.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFamilyPicker(instance);
        trigger.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusFamilyOption(instance, instance.activeIndex < 0 ? 0 : instance.activeIndex + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusFamilyOption(instance, instance.activeIndex <= 0 ? 0 : instance.activeIndex - 1);
      }
    });

    familyPickers[config.family] = instance;
    syncFamilyTrigger(instance, instance.currentValue);
  }

  function buildWeightPicker(config) {
    var selectEl = document.getElementById(config.weight);
    if (!selectEl || weightPickers[config.weight]) return;
    selectEl.onchange = null;
    selectEl.classList.add('ff-native-hidden');

    var wrap = document.createElement('div');
    wrap.className = 'ff-picker ff-picker-weight';
    wrap.setAttribute('data-picker-id', config.weight);

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ff-weight-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML =
      '<span class="ff-weight-label">' + normalizeWeight(selectEl.value || DEFAULT_WEIGHT) + '</span>' +
      '<span class="ff-trigger-arrow">' + lucide('chevrons-up-down', 14) + '</span>';

    var menu = document.createElement('div');
    menu.className = 'ff-weight-menu';

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);

    var instance = {
      id: config.weight,
      selectEl: selectEl,
      wrap: wrap,
      trigger: trigger,
      menu: menu,
      currentValue: normalizeWeight(selectEl.value || DEFAULT_WEIGHT),
      applyToCanvas: !!config.applyToCanvas,
      linkedFamily: null,
      optionButtons: []
    };

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (openWeightPicker === instance && instance.wrap.classList.contains('open')) closeWeightPicker(instance);
      else openWeight(instance);
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openWeight(instance);
      } else if (e.key === 'Escape') {
        closeWeightPicker(instance);
      }
    });

    weightPickers[config.weight] = instance;
    syncWeightTrigger(instance, instance.currentValue);
  }

  function linkPickers() {
    FONT_IDS.forEach(function (cfg) {
      var familyPicker = familyPickers[cfg.family];
      var weightPicker = weightPickers[cfg.weight];
      if (familyPicker && weightPicker) {
        familyPicker.linkedWeight = weightPicker;
        weightPicker.linkedFamily = familyPicker;
        updateWeightOptions(weightPicker, familyPicker.currentValue || DEFAULT_FAMILY, weightPicker.currentValue || DEFAULT_WEIGHT);
      }
    });
  }

  /* ── A PICKER NOBODY IS LOOKING AT IS NOT REDRAWN ──────────────────────────────────────────────
     This runs on every selection change, because syncRightPanel is patched to call
     syncRightPanelPickerState -> refreshAllPickers. It used to refill the hidden <select> with ~1000
     fresh <option> elements AND rebuild the drawn list, which is ~1000 buttons of six nodes each.
     MEASURED (tools/_rp-cost-probe.mjs, packaged Electron, one text box selected): ~6800 DOM nodes
     created per syncRightPanel call and ~45 ms of main thread, against 7 ms for every other section
     of the right panel put together. Those thousands of insertions then went through the i18n
     MutationObserver, which is where the rest of the time went.
     Both halves are now conditional:
       - the <select> is the VALUE source, and setHiddenSelectValue appends a missing family itself,
         so it is refilled only when the catalog actually changed;
       - the drawn list is built by openFamily on every open, so building it here painted a list into
         a closed panel. It is still redrawn immediately if this picker is the OPEN one, which is the
         case that matters when a custom font is installed mid-gesture. */
  function refreshFamilyPicker(instance) {
    if (!instance) return;
    var current = normalizeFamilyName(instance.currentValue || instance.selectEl.value || DEFAULT_FAMILY);
    ensureProjectFont(current);
    var key = catalogKey();
    if (instance.optionsKey !== key) {
      var records = getMergedCatalog();
      setNativeOptions(instance.selectEl, records.map(function (record) { return record.family; }), function (value) { return value; });
      instance.optionsKey = key;
    }
    setHiddenSelectValue(instance.selectEl, current);
    syncFamilyTrigger(instance, current);
    if (openFamilyPicker === instance) renderFamilyOptions(instance);
  }

  function refreshAllPickers() {
    Object.keys(familyPickers).forEach(function (id) { refreshFamilyPicker(familyPickers[id]); });
    Object.keys(weightPickers).forEach(function (id) {
      var picker = weightPickers[id];
      if (picker && picker.linkedFamily) updateWeightOptions(picker, picker.linkedFamily.currentValue || DEFAULT_FAMILY, picker.currentValue || DEFAULT_WEIGHT);
    });
  }

  function syncRightPanelPickerState(obj) {
    if (!isTextObject(obj)) return;
    var family = normalizeFamilyName(obj.fontFamily || DEFAULT_FAMILY);
    var weight = normalizeWeight(obj.fontWeight || DEFAULT_WEIGHT);
    ensureProjectFont(family);
    refreshAllPickers();
    if (familyPickers['p-font']) syncFamilyTrigger(familyPickers['p-font'], family);
    if (weightPickers['p-weight']) updateWeightOptions(weightPickers['p-weight'], family, weight);
    var pBold = document.getElementById('p-bold');
    var pItalic = document.getElementById('p-italic');
    if (pBold) pBold.classList.toggle('on', parseInt(weight, 10) >= 700);
    if (pItalic) pItalic.classList.toggle('on', String(obj.fontStyle || 'normal').toLowerCase() === 'italic');
  }

  // A fabric.Textbox keeps a FIXED width, so after a font/size change its box can
  // stay wider (or narrower) than the text. Re-fit to content width — same rule
  // app.js uses on resize (app.js:471) and font-size change (app.js:3877), so the
  // box tracks the text on a font-family change too. Reflows/recoords as well.
  function fitTextboxToContent(obj) {
    if (!obj || obj.type !== 'textbox' || typeof obj.calcTextWidth !== 'function') return;
    try {
      obj.set('width', Math.max(20, Math.ceil(obj.calcTextWidth()) + 6));
      if (typeof obj.initDimensions === 'function') obj.initDimensions();
      if (typeof obj.setCoords === 'function') obj.setCoords();
    } catch (e) { /* leave the box as-is on any measure error */ }
  }

  // Fabric caches per-family char widths (fabric.charWidthsCache); entries
  // measured while the webfont was still loading come from the FALLBACK font
  // and persist through initDimensions. Wide display fonts (e.g. Unbounded)
  // then draw far outside the measured box and caret/hit positions break.
  // Clear the family's cache before any re-measure.
  function clearFontMeasureCache(family) {
    try {
      if (typeof fabric === 'undefined') return;
      if (fabric.util && typeof fabric.util.clearFabricFontCache === 'function') {
        fabric.util.clearFabricFontCache(family);
      } else if (fabric.charWidthsCache) {
        delete fabric.charWidthsCache[String(family || '').toLowerCase()];
      }
    } catch (e) { /* measuring proceeds with the old cache */ }
  }

  function renderCanvasText(obj, family, weight, italic) {
    var w = normalizeWeight(weight);
    obj.set('fontFamily', family);
    obj.set('fontWeight', w);
    obj.set('fontStyle', italic ? 'italic' : 'normal');
    obj.dirty = true;
    clearFontMeasureCache(family);
    if (typeof obj.initDimensions === 'function') obj.initDimensions();
    fitTextboxToContent(obj);
    var c = getCanvasRef();
    if (c) {
      c.requestRenderAll();
      setTimeout(function () { c.renderAll(); }, 10);
      // Canvas (unlike the DOM) does NOT auto-reflow when a webfont finishes
      // downloading. The @font-face for this exact weight is registered but its
      // binary is fetched lazily — so the first paint above can be a fallback.
      // Force the binary to load, then re-fit + repaint so the box and glyphs
      // match the REAL font metrics (the fallback's width differs).
      if (document.fonts && typeof document.fonts.load === 'function') {
        var spec = w + ' 16px "' + normalizeFamilyName(family).replace(/"/g, '') + '"';
        try {
          document.fonts.load(spec, obj.text || 'Ag').then(function () {
            obj.dirty = true;
            // The widths cached during the fallback paint are now stale.
            clearFontMeasureCache(family);
            if (typeof obj.initDimensions === 'function') obj.initDimensions();
            fitTextboxToContent(obj);
            c.renderAll();
          }, function () {});
        } catch (e) { /* bad spec — ignore, fallback paint stands */ }
      }
    }
    if (typeof snap === 'function') snap();
  }

  /* Fan out to every selected text when the caller did not name one (the family/weight pickers
     pass null and used to land on getActiveTextObject() alone). Only the FIRST call carries the
     meta, so the picker's own trigger UI is synced once instead of once per text. */
  function applySelection(opts, targetObj, meta) {
    if (!targetObj) {
      var multi = textTargets();
      if (multi.length > 1) {
        for (var mi = 0; mi < multi.length; mi++) applySelectionTo(opts, multi[mi], mi === 0 ? meta : null);
        return;
      }
    }
    return applySelectionTo(opts, targetObj, meta);
  }

  function applySelectionTo(opts, targetObj, meta) {
    opts = opts || {};
    var obj = targetObj || getActiveTextObject();
    var family = normalizeFamilyName(opts.family || (obj && obj.fontFamily) || DEFAULT_FAMILY);
    var currentItalic = opts.italic;
    if (currentItalic == null && obj) currentItalic = String(obj.fontStyle || 'normal').toLowerCase() === 'italic';
    currentItalic = !!currentItalic;
    ensureProjectFont(family);
    var weights = getAvailableWeights(family);
    var weight = String(nearestWeight(weights, opts.weight || (obj && obj.fontWeight) || DEFAULT_WEIGHT, null));

    function finalize() {
      if (obj && isTextObject(obj)) renderCanvasText(obj, family, weight, currentItalic);
      if (meta && meta.sourcePicker && familyPickers[meta.sourcePicker]) syncFamilyTrigger(familyPickers[meta.sourcePicker], family);
      if (meta && meta.sourcePicker && weightPickers[meta.sourcePicker]) syncWeightTrigger(weightPickers[meta.sourcePicker], weight);
      if (meta && meta.sourcePicker && familyPickers[meta.sourcePicker] && familyPickers[meta.sourcePicker].linkedWeight) {
        updateWeightOptions(familyPickers[meta.sourcePicker].linkedWeight, family, weight);
      }
      if (obj && isTextObject(obj)) syncRightPanelPickerState(obj);
    }
    // Apply on success AND on failure: if the webfont genuinely can't load
    // (offline / blocked), still record the user's choice + keep the panel in
    // sync (swap shows a fallback) instead of silently doing nothing or leaking
    // an unhandled rejection.
    return loadGoogleFont(family).then(finalize, function (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[fonts] could not load "' + family + '", applying anyway:', err && err.message);
      finalize();
    });
  }

  /* Bold/Italic decide ONCE from the first selected text and apply that to all of them, so a
     mixed set converges instead of each text flipping to its own opposite. Each text keeps its
     OWN family: bolding a multi-selection must not drag them all onto one font. */
  function toggleBoldWeight() {
    var targets = textTargets();
    if (!targets.length) return;
    var refFamily = normalizeFamilyName(targets[0].fontFamily || DEFAULT_FAMILY);
    ensureProjectFont(refFamily);
    var current = parseInt(normalizeWeight(targets[0].fontWeight || DEFAULT_WEIGHT), 10);
    var goBold = !(current >= 700);
    targets.forEach(function (obj, i) {
      var family = normalizeFamilyName(obj.fontFamily || DEFAULT_FAMILY);
      ensureProjectFont(family);
      var weights = getAvailableWeights(family);
      var target = goBold ? nearestWeight(weights, 700, true) : nearestWeight(weights, 400, false);
      applySelection({ family: family, weight: target, italic: String(obj.fontStyle || 'normal').toLowerCase() === 'italic' },
        obj, i === 0 ? { sourcePicker: 'p-font' } : null);
    });
  }

  function toggleItalicStyle() {
    var targets = textTargets();
    if (!targets.length) return;
    var nextItalic = String(targets[0].fontStyle || 'normal').toLowerCase() !== 'italic';
    targets.forEach(function (obj, i) {
      var family = normalizeFamilyName(obj.fontFamily || DEFAULT_FAMILY);
      applySelection({ family: family, weight: obj.fontWeight || DEFAULT_WEIGHT, italic: nextItalic },
        obj, i === 0 ? { sourcePicker: 'p-font' } : null);
    });
  }

  function patchSyncRightPanel() {
    if (typeof syncRightPanel !== 'function' || syncRightPanel._ccFontPatched) return;
    var orig = syncRightPanel;
    syncRightPanel = function () {
      orig();
      var obj = getActiveTextObject();
      if (obj) syncRightPanelPickerState(obj);
    };
    syncRightPanel._ccFontPatched = true;
  }

  function patchStyleButtons() {
    var pBold = document.getElementById('p-bold');
    var pItalic = document.getElementById('p-italic');
    if (pBold) pBold.onclick = function () { toggleBoldWeight(); };
    if (pItalic) pItalic.onclick = function () { toggleItalicStyle(); };
  }

  function initPickers() {
    markPreloadedDefaults();
    FONT_IDS.forEach(function (cfg) {
      buildFamilyPicker(cfg);
      buildWeightPicker(cfg);
    });
    linkPickers();
    closeAllPickers();
    patchStyleButtons();
    patchSyncRightPanel();
    var activeObj = getActiveTextObject();
    if (activeObj) syncRightPanelPickerState(activeObj);
    else refreshAllPickers();
  }

  function init() {
    document.addEventListener('click', function (e) {
      // The open panel/menu is portaled to body, so check it separately from wrap.
      if (openFamilyPicker && !openFamilyPicker.wrap.contains(e.target) && !openFamilyPicker.panel.contains(e.target)) closeFamilyPicker(openFamilyPicker);
      if (openWeightPicker && !openWeightPicker.wrap.contains(e.target) && !openWeightPicker.menu.contains(e.target)) closeWeightPicker(openWeightPicker);
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllPickers();
    });

    window.addEventListener('customfonts:updated', function () {
      refreshAllPickers();
    });

    // Faz 8: google-fonts now loads as a shared module AFTER app.js, so the old initApp-wrap +
    // DOMContentLoaded both miss. Self-init the font pickers on the sticky cc:canvas-ready event.
    if (window.cc && cc.on) {
      cc.on('cc:canvas-ready', function () { setTimeout(function () { cc.safe('shared.fonts.google-fonts', initPickers); }, 650); });
    } else {
      if (typeof initApp === 'function' && !initApp._ccFontInitWrapped) {
        var orig = initApp;
        initApp = function () { orig(); initPickers(); };
        initApp._ccFontInitWrapped = true;
      }
      document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { initPickers(); }, 650); });
    }
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  // ── Global re-measure when a webfont finishes loading ──────────────────────────────────────────
  // A design/template loaded via loadFromJSON measures its text against whatever font was ready at that
  // instant. When a webfont (e.g. Unbounded) finishes downloading AFTER the text was placed, fabric's
  // char-width cache still holds the FALLBACK metrics, so a fixed-width Textbox keeps the wrong (too
  // loose) word-wrap and the wider real glyphs spill outside the box — until an unrelated edit (changing
  // the weight) forces a re-measure. Listen for font-load completion and re-measure top-level text once
  // with the now-correct metrics, so wrapping / box height track the real font automatically.
  function reflowCanvasTextForFonts() {
    var c = (typeof getCanvasRef === 'function') ? getCanvasRef() : null;
    if (!c || typeof c.getObjects !== 'function') return;
    var objs = c.getObjects(), touched = false;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o || o.isEditing) continue;                 // never disturb an active text edit
      if (o.type !== 'textbox' && o.type !== 'i-text' && o.type !== 'text') continue;
      if (o.fontFamily) clearFontMeasureCache(o.fontFamily);
      o.dirty = true;
      try { if (typeof o.initDimensions === 'function') o.initDimensions(); } catch (e) {}
      if (typeof o.setCoords === 'function') o.setCoords();
      touched = true;
    }
    if (touched) c.requestRenderAll();
  }
  var _ccFontReflowTimer = null;
  function scheduleFontReflow() {
    if (_ccFontReflowTimer) clearTimeout(_ccFontReflowTimer);
    _ccFontReflowTimer = setTimeout(reflowCanvasTextForFonts, 80); // collapse font-load bursts into one reflow
  }
  if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.addEventListener === 'function') {
    document.fonts.addEventListener('loadingdone', scheduleFontReflow);
  }
  window.ccReflowCanvasTextForFonts = reflowCanvasTextForFonts; // manual hook for explicit load paths

  window.DikaFontLibrary = {
    getCatalog: getMergedCatalog,
    getRecord: findCatalogRecord,
    getAvailableWeights: getAvailableWeights,
    loadFont: loadGoogleFont,
    getFontBinary: fetchGoogleFontBinary,
    refreshPickers: refreshAllPickers,
    applySelection: applySelection,
    syncRightPanel: syncRightPanelPickerState,
    toggleBold: toggleBoldWeight,
    toggleItalic: toggleItalicStyle
  };

  window.loadGoogleFont = loadGoogleFont;

  init();
})();

// Modular skeleton hook (Faz 8) — google-fonts is now a shared loader module (modules/shared/fonts/).
if (window.cc && cc.modules) cc.modules.register({ id: 'google-fonts', parent: 'shared.fonts', title: 'Google Fonts', mount: function () {}, unmount: function () {} });
