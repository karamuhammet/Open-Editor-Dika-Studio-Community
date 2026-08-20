/* Co-locate a feature's CSS from css/styles.css into its module CSS file. SAFETY MODEL: a top-level
   rule MOVES iff every comma-separated selector part's SUBJECT token (the rightmost class/id — what the
   rule actually styles) is owned by the feature (matches cfg.own). Ancestor/context tokens may be
   anything (e.g. `#card-stage-container > .slide-strip-host .slide-card` moves to slide-deck: subject
   = slide-card). Rules whose subject is generic (.btn/input/.modal) or another feature stay put. Rules
   inside @media are SKIPPED (their responsive context would be lost) and reported. Moved blocks keep
   source order (intra-feature cascade preserved) and append to the module CSS; styles.css loses them.
   DRY-RUN unless --apply. Usage: node tools/css-colocate.mjs <configName> [--apply]   (configs below). */
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIGS = {
  comments:     { css: 'modules/system/comments/comments.css',                 own: /^cmt-/,    label: 'comments' },
  whiteboard:   { css: 'modules/left-panel/whiteboard/whiteboard.css',          own: /^wb-/,     label: 'whiteboard' },
  ai:           { css: 'modules/left-panel/ai/ai.css',                          own: /^ai-/,     label: 'ai panel' },
  slidedeck:    { css: 'modules/slide-deck/slide-deck.css',                     own: /^slide-/,  label: 'slide deck' },
  videoeditor:  { css: 'modules/video/video-editor/video-editor.css',          own: /^ve-/,     label: 'video editor' },
  gallery:      { css: 'modules/left-panel/gallery/gallery.css',                own: /^(gal-|gallery-|img-cat|imgp-)/, label: 'gallery' },
  colorpicker:  { css: 'modules/shared/color-picker/color-picker.css',          own: /^cp-/,     label: 'color picker' },
  gridlayout:   { css: 'modules/canvas/grid-layout/grid-layout.css',             own: /^grid-(tb|wiz|ctx|cell|cells|toolbar|layout|host|banner|drop)/, label: 'grid layout' },
  barcode:      { css: 'modules/left-panel/tools/barcode-tools/barcode-tools.css', own: /^barcode-/, label: 'barcode tools' },
  timermusic:   { css: 'modules/slide-deck/timer-music-widget/timer-music-widget.css', own: /^tmw-/, label: 'timer/music widget' },
  commandbar:   { css: 'modules/canvas/command-bar/command-bar.css',             own: /^cmdk-/,   label: 'command bar' },
  myshapes:     { css: 'modules/shared/my-shapes-browser/my-shapes-browser.css', own: /^my-shape/, label: 'my shapes' },
  settings:     { css: 'modules/system/settings/settings.css',                   own: /^(settings-|brand-|bs-)/, label: 'settings' },
  stock:        { css: 'modules/left-panel/gallery/stock/stock.css',             own: /^stock-/,  label: 'gallery stock' },
  selectiontools:{ css: 'modules/canvas/tools/selection-tools/selection-tools.css', own: /^qs-/,  label: 'selection tools' },
  exportui:     { css: 'modules/export/export.css',                               own: /^(export-|mf-|dl-)/, label: 'export dialog' },
  promo:        { css: 'modules/export/export.css',                               own: /^promo-/,  label: 'promo popup' },
  cmyk:         { css: 'modules/left-panel/background/background.css',            own: /^cmyk-/,   label: 'CMYK picker' },
  keyboard:     { css: 'modules/system/keyboard-manager/keyboard-manager.css',   own: /^shortcuts?-/, label: 'keyboard shortcuts' },
  fonts:        { css: 'modules/shared/fonts/google-fonts/google-fonts.css',     own: /^ff-/,     label: 'font-family picker' },
  templates:    { css: 'modules/left-panel/templates/templates.css',             own: /^tpl-/,    label: 'templates panel' },
  pagepreview:  { css: 'modules/canvas/page-preview/page-preview.css',           own: /^sp-/,     label: 'page preview' },
  bgpatterns:   { css: 'modules/left-panel/background/background.css',            own: /^(ip-|pat-|pattern-)/, label: 'background patterns' },
  wireframe:    { css: 'modules/canvas/wireframe/wireframe.css',                  own: /^wf-/,     label: 'wireframe' },
  fillbucket:   { css: 'modules/canvas/tools/fill-bucket/fill-bucket.css',        own: /^bucket-/, label: 'fill bucket' },
  rightpanel:   { css: 'modules/right-panel/right-panel.css',                     own: /^(rp-|rpanel|layer-|structure)/, label: 'right-panel (property editor + layers/structure)' },
  charts:       { css: 'modules/left-panel/charts/charts.css',                    own: /^chart-/,  label: 'charts' },
  // core engines → core/*.css (static <link> in index.html; NOT loader-modules)
  corePageTabs: { css: 'core/page-tabs.css',                                      own: /^(pg-|page-tab|face-tab)/, label: 'core: page-tabs' },
  coreFloatTb:  { css: 'core/floating-toolbar.css',                               own: /^(float-tb|ft-)/, label: 'core: floating-toolbar' },
  coreFlyout:   { css: 'core/rail-flyout.css',                                    own: /^flyout/,  label: 'core: rail-flyout' },
  coreCtx:      { css: 'core/context-menu.css',                                   own: /^(ctx-|cell-dropdown)/, label: 'core: context-menu' },
  coreModals:   { css: 'core/modals.css',                                         own: /^ccmodal/, label: 'core: custom modals' },
  coreBulk:     { css: 'core/bulk-builder.css',                                   own: /^bulk-builder/, label: 'core: bulk-builder bootstrap' },
  canvasview:   { css: 'modules/canvas/view/view.css',                            own: /^(canvas-area|canvas-drop|canvas-label|card-stage|zoom-pill|hover-add|thumb-strip|active-canvas|pan-overlay)/, label: 'canvas view/shell' },
  fontmanager:  { css: 'modules/shared/fonts/font-manager/font-manager.css',      own: /^fm-/,     label: 'font manager' },
  mediacat:     { css: 'modules/left-panel/gallery/gallery.css',                  own: /^media-cat/, label: 'media category tabs' },
};

const name = process.argv[2];
const APPLY = process.argv.includes('--apply');
const cfg = CONFIGS[name];
if (!cfg) { console.error('unknown config: ' + name + '  (have: ' + Object.keys(CONFIGS).join(', ') + ')'); process.exit(1); }

const css = readFileSync('css/styles.css', 'utf8');
const BACKSLASH = '\\';
const n = css.length;
function skipString(s, i) { const q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === BACKSLASH) i++; i++; } return i + 1; }
function skipComment(s, i) { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
const rules = [];
function skipBody(i) { let d = 1; while (i < n && d) { const ch = css[i]; if (ch === '/' && css[i + 1] === '*') { i = skipComment(css, i); continue; } if (ch === '"' || ch === "'") { i = skipString(css, i); continue; } if (ch === '{') d++; else if (ch === '}') d--; i++; } return i; }
function parseBlock(i, inMedia) {
  let seg = i;
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { i = skipComment(css, i); continue; }
    if (c === '"' || c === "'") { i = skipString(css, i); continue; }
    if (c === '}' && inMedia) return i;
    if (c === '{') {
      const prelude = css.slice(seg, i), at = /^\s*@([a-z-]+)/i.exec(prelude), open = i; i++;
      if (at) { const nm = at[1].toLowerCase(); i = (nm === 'media' || nm === 'supports' || nm === 'container') ? parseBlock(i, true) : skipBody(i); if (css[i] === '}') i++; seg = i; continue; }
      const close = skipBody(i); rules.push({ sel: css.slice(seg, open), selStart: seg, close, inMedia }); i = close; seg = i; continue;
    }
    i++;
  }
  return i;
}
parseBlock(0, false);
const lineOf = idx => css.slice(0, idx).split('\n').length;

function splitTop(sel) { const out = []; let d = 0, b = ''; for (const ch of sel) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(b); b = ''; } else b += ch; } if (b.trim()) out.push(b); return out; }
function subjectOwned(part) {
  // SUBJECT = the rightmost compound (after the final combinator). Strip pseudos (:hover/::before/
  // :not(...)) first, then take the last space/combinator-separated unit. The rule styles the feature
  // iff ANY class/id token in that subject compound is feature-owned (so `.cmt-panel.show` counts via
  // cmt-panel; `.slide-card .btn` does NOT — its subject `.btn` is generic).
  const clean = part.replace(/::?[A-Za-z-]+(\([^)]*\))?/g, ' ').trim();
  const units = clean.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = units.length ? units[units.length - 1] : '';
  const toks = [...last.matchAll(/[.#]([A-Za-z_][A-Za-z0-9_-]*)/g)].map(m => m[1]);
  return toks.some(t => cfg.own.test(t));
}
function owned(rule) {
  if (rule.inMedia) return false;
  const parts = splitTop(rule.sel);
  if (!parts.length) return false;
  return parts.every(subjectOwned);
}

const move = rules.filter(owned);
// rules that REFERENCE the feature somewhere but are NOT owned (mixed / generic-subject / in @media) — report
const refsFeature = r => [...r.sel.matchAll(/[.#]([A-Za-z_][A-Za-z0-9_-]*)/g)].some(m => cfg.own.test(m[1]));
const leftBehind = rules.filter(r => refsFeature(r) && !move.includes(r));

let movedLines = 0; for (const r of move) movedLines += lineOf(r.close) - lineOf(r.selStart);
console.log('[' + cfg.label + '] own=' + cfg.own);
console.log('rules to MOVE: ' + move.length + ' (~' + movedLines + ' lines) -> ' + cfg.css);
console.log('feature-referencing rules LEFT (mixed-subject / @media / generic) : ' + leftBehind.length);
for (const r of leftBehind.slice(0, 14)) console.log('  L' + lineOf(r.selStart) + (r.inMedia ? ' @media' : '') + ': ' + r.sel.trim().replace(/\s+/g, ' ').slice(0, 100));
if (leftBehind.length > 14) console.log('  … +' + (leftBehind.length - 14) + ' more');

if (APPLY) {
  const blocks = move.map(r => css.slice(r.selStart, r.close).replace(/^\s+/, ''));
  const header = '\n/* ===== co-located from css/styles.css (' + cfg.label + ') ===== */\n';
  const existing = (() => { try { return readFileSync(cfg.css, 'utf8'); } catch { return ''; } })();
  writeFileSync(cfg.css, existing.replace(/\s+$/, '') + '\n' + header + blocks.join('\n\n') + '\n');
  // remove moved spans from styles.css (end-to-start)
  const edits = move.map(r => ({ start: r.selStart, end: r.close })).sort((a, b) => b.start - a.start);
  let out = css; for (const e of edits) out = out.slice(0, e.start) + out.slice(e.end);
  out = out.replace(/\n{3,}/g, '\n\n');
  const inB = (css.match(/{/g) || []).length - (css.match(/}/g) || []).length;
  const outB = (out.match(/{/g) || []).length - (out.match(/}/g) || []).length;
  if (inB !== outB) { console.error('✗ brace balance changed (' + inB + ' -> ' + outB + ') — NOT writing'); process.exit(1); }
  writeFileSync('css/styles.css', out);
  console.log('\n✓ APPLIED. styles.css ' + css.split('\n').length + ' -> ' + out.split('\n').length + ' lines; ' + cfg.css + ' += ' + move.length + ' rules. braces ok.');
} else {
  console.log('\n(DRY-RUN — add --apply to write)');
}
