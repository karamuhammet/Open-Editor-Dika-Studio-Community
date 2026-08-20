/* One-off: decompose modules/shared/color-picker/color-picker.js (a single shared-state IIFE)
   into a thin namespace parent + cohesive child sub-modules, establishing the IIFE
   "shared-state namespace" pattern for the bigger IIFE files (ai/settings/video-editor…).

   Approach (deterministic + auditable):
   - Every module-internal function becomes  CP.NAME = function(){…}  on a shared namespace
     object  CP = window.__ccColorPicker.
   - Every module-internal reference (functions + state vars + constants) is rewritten to
     CP.NAME, resolved at CALL time → sibling load order is irrelevant.
   - State + constants + the public window.* forwarders + the canvas-ready init live in the
     PARENT (hand-authored separately); this script emits only the CHILD sub-modules.
   - An AUDIT then proves no bare (un-prefixed) internal name leaked into any child — a
     structural guarantee that every reference resolves through the (fully populated) CP. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(root, 'modules/shared/color-picker/color-picker.js');
const src = readFileSync(srcPath, 'utf8');
const lines = src.split(/\r?\n/);

// ── Module-internal STATE + CONSTANTS (declared on CP in the parent; here we only rewrite refs)
const STATE = ['_cpTarget', '_cpColor', '_cpTab', '_hue', '_sat', '_val', '_draggingSV', '_draggingHue',
  '_gradState', '_gradSelectedStopId', '_gradStopSeq', '_gradDraggingStopId', '_gradTypeMenuOpen',
  '_gpHue', '_gpSat', '_gpVal', '_gpDraggingSV', '_gpDraggingHue'];
const CONSTS = ['DEFAULT_COLORS', 'GRADIENT_PRESETS', 'GRADIENT_TYPES'];

// window.* exports that belong in the PARENT (hand-authored), not a child — skip in extraction.
const PARENT_WINDOW = new Set(['initColorPickerPanel', 'cpGetGradientState']);

// ── Extract every top-level function block (plain `  function NAME(` and `  window.NAME = function`)
const fns = [];
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  let m = ln.match(/^  function ([A-Za-z0-9_$]+)\s*\(/);
  let isWin = false;
  if (!m) { const w = ln.match(/^  window\.([A-Za-z0-9_$]+)\s*=\s*function\s*\(/); if (w) { m = w; isWin = true; } }
  if (!m) continue;
  const name = m[1];
  if (isWin && PARENT_WINDOW.has(name)) continue;   // parent owns these
  // walk to this function's own terminator: the first line that is exactly `  }` or `  };`
  let end = -1;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j] === '  }' || lines[j] === '  };') { end = j; break; }
  }
  if (end < 0) throw new Error('no terminator for ' + name + ' @ line ' + (i + 1));
  // attach contiguous preceding single-line `  //` comments
  let start = i;
  while (start - 1 >= 0 && /^\s*\/\//.test(lines[start - 1]) && lines[start - 1].indexOf('  //') === 0) start--;
  fns.push({ name, isWin, start, end, header: i });
  i = end;
}

const fnNames = fns.map(f => f.name);
const NAMESET = new Set([...fnNames, ...STATE, ...CONSTS]);

// ── group map: which child owns each function (organizational only — all resolve via CP) ──
const GROUPS = {
  engine: ['hsvToRgb', 'rgbToHsv', 'hexToRgb', 'rgbToHex', 'hsvToHex', 'clamp', '_cpColorParseCanvas',
    'normalizeHexColor', 'parseColorWithOpacity', 'rgbaStringFromStop', 'escapeHtml', 'copyStop',
    'normalizeStops', 'cloneGradientState', 'getSelectedStop', 'canUseGradientTarget', 'getGradientTypeLabel',
    'colorPointAt', 'buildGradientPreviewDataUrl', 'addCanvasGradientStops', 'buildGradientSourceCanvas',
    'buildPatternFillForObject', 'rebuildObjectGradientFill', 'applyGradientToTarget',
    'parseGradientStateFromObject', 'buildSwatchPreviewBackground'],
  solid: ['drawSpectrum', 'updateSpectrumCursor', 'drawHueBar', 'updateHueCursor', 'pickSV', 'pickHue',
    'setColorFromHex', 'updateHexInput'],
  gradient: ['renderGradientTypeMenu', 'syncGradientTypeMenu', 'renderGradientTrackStops', 'renderGradientStopRows',
    'renderGradientUi', 'findStopById', 'updateGradientStops', 'setGradientStopOffset', 'setGradientStopColor',
    'setGradientStopOpacity', 'interpolateNewStop', 'addGradientStop', 'removeGradientStop', 'openGradStopPicker',
    'wireGradientPanel', 'wireGradientStopPicker', 'gpDrawSpectrum', 'gpUpdateSpectrumCursor', 'gpDrawHueBar',
    'gpUpdateHueCursor', 'gpPickSV', 'gpPickHue', 'gpSetColorFromHex', 'gpUpdateHexInput', 'gpApplyColor',
    'applyGradient', 'renderGradientPresets'],
  swatches: ['renderDefaultColors', 'addObjColor', 'scanDocumentColors', 'renderDocumentColors',
    'extractPhotoColorsGrouped', 'renderPhotoColors'],
  panel: ['buildColorPanelHTML', 'initColorPanel', 'wireColorPanel', 'getActiveColorTargetObject',
    'clearGradientStateForObject', 'applyCurrentColor', 'updateSwatchButton', 'syncPickerTabState',
    'openColorPanel', 'closeColorPanel', 'addFloatTBColorButton', 'replaceColorInput',
    'observeForTextEffectInputs', 'initColorSwatchButtons', 'syncColorSwatches']
};

// coverage assertions: every extracted fn assigned exactly once; no unknown names
const assigned = new Set();
for (const g of Object.keys(GROUPS)) for (const n of GROUPS[g]) {
  if (!fnNames.includes(n)) throw new Error('GROUPS has unknown fn: ' + n);
  if (assigned.has(n)) throw new Error('fn assigned twice: ' + n);
  assigned.add(n);
}
for (const n of fnNames) if (!assigned.has(n)) throw new Error('fn not assigned to any group: ' + n);
console.log('coverage OK: ' + fnNames.length + ' functions across ' + Object.keys(GROUPS).length + ' groups');

// ── transform one function block → CP.NAME = function(){…} with all internal refs CP-prefixed ──
function transform(f) {
  let body = lines.slice(f.start, f.end + 1);
  // header line (at f.header within the slice)
  const hIdx = f.header - f.start;
  if (f.isWin) {
    body[hIdx] = body[hIdx].replace(/^  window\.([A-Za-z0-9_$]+)\s*=\s*function\s*\(/, '  CP.$1 = function (');
  } else {
    body[hIdx] = body[hIdx].replace(/^  function ([A-Za-z0-9_$]+)\s*\(/, '  CP.$1 = function (');
  }
  // terminator → `  };`
  body[body.length - 1] = '  };';
  let text = body.join('\n');
  // bare-name → CP.name  (skip when already preceded by . or a word char; skip property access)
  for (const name of NAMESET) {
    const re = new RegExp('(?<![.\\w$])' + name.replace(/[$]/g, '\\$') + '(?![\\w$])', 'g');
    text = text.replace(re, 'CP.' + name);
  }
  return text;
}

const childText = {};
for (const g of Object.keys(GROUPS)) {
  const blocks = fns.filter(f => GROUPS[g].includes(f.name)).map(transform);
  childText[g] = blocks.join('\n\n');
}

const HEADERS = {
  engine: 'colour MODEL/MATH/RASTER — pure conversions, gradient-state helpers, and the gradient→canvas/CSS raster engine. No DOM; the stateful UI children call these through CP.',
  solid: 'SOLID picker — the saturation/value spectrum + hue bar canvases and their drag/hex sync (CP._hue/_sat/_val/_cpColor).',
  gradient: 'GRADIENT editor — type menu, stop track/rows, the per-stop colour picker (gp*), presets, and apply-to-object (CP._gradState/_gpHue…).',
  swatches: 'COLOUR SOURCES — the Default / Document / Photo swatch rows scanned from the canvas.',
  panel: 'PANEL shell + integration — builds/wires the #rp-color-wrap DOM, applies the chosen colour to the active object/target, open/close, float-toolbar button, and the right-panel swatch buttons (initColorSwatchButtons/syncColorSwatches).'
};

for (const g of Object.keys(GROUPS)) {
  const dir = join(root, 'modules/shared/color-picker', g);
  mkdirSync(dir, { recursive: true });
  const out =
    '/* Module: shared/color-picker/' + g + ' — ' + HEADERS[g] + '\n' +
    '   Part of the color-picker group (decomposed from the 1698-line IIFE). All functions hang\n' +
    '   off the shared namespace CP (window.__ccColorPicker, created by the parent); cross-module\n' +
    '   references resolve through CP at call time, so sibling load order does not matter. */\n' +
    '(function () {\n' +
    "  'use strict';\n" +
    '  var CP = window.__ccColorPicker;\n' +
    '  if (!CP) return;\n\n' +
    childText[g] + '\n\n' +
    '  if (window.cc && cc.modules) {\n' +
    "    cc.modules.register({ id: 'color-picker-" + g + "', parent: 'shared.color-picker', title: 'Color Picker: " + g + "', mount: function () {}, unmount: function () {} });\n" +
    '  }\n' +
    '})();\n';
  writeFileSync(join(dir, g + '.js'), out);
  console.log('wrote ' + g + '/' + g + '.js  (' + GROUPS[g].length + ' fns, ' + out.split('\n').length + ' lines)');
}

// ── AUDIT: no bare internal name may remain in a child's CODE (every ref must be CP.-prefixed).
// Strip comments first so descriptive names in header/doc comments aren't false positives.
let leaks = 0;
for (const g of Object.keys(GROUPS)) {
  const raw = readFileSync(join(root, 'modules/shared/color-picker', g, g + '.js'), 'utf8');
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const name of NAMESET) {
    // a bare occurrence = not preceded by `.`/word-char AND not the `CP.NAME =` definition LHS
    const re = new RegExp('(?<![.\\w$])' + name.replace(/[$]/g, '\\$') + '(?![\\w$])', 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      // allow it only if the 3 chars before are 'CP.' (already prefixed) — but lookbehind already
      // excluded a preceding '.', so any hit here is a genuine bare leak.
      const around = text.slice(Math.max(0, m.index - 30), m.index + name.length + 10).replace(/\n/g, '⏎');
      console.error('LEAK in ' + g + ': bare "' + name + '"  …' + around + '…');
      leaks++;
    }
  }
}
if (leaks) { console.error('\n✗ AUDIT FAILED: ' + leaks + ' bare reference(s) leaked'); process.exit(1); }
console.log('\n✓ AUDIT PASSED: no bare internal references in any child');
