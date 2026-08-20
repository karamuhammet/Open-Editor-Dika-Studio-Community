/* Remove DEAD rules from css/styles.css. Re-derives the dead-token set (same logic as css-dead-scan:
   class/id tokens in SELECTOR text that appear NOWHERE in the html+js corpus), EXCLUDING dynamic-risk
   tokens (a `'prefix-' +` JS concat). Then walks the CSS brace-tree (comment/string-aware) and for each
   style rule: split the selector list on top-level commas; a part is DEAD if it references a dead token
   OUTSIDE :not(); drop wholly-dead rules, trim partly-dead selector lists, keep live rules. @keyframes/
   @font-face bodies are opaque (never touched). DRY-RUN unless argv includes --apply. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const APPLY = process.argv.includes('--apply');
const css = readFileSync('css/styles.css', 'utf8');
const BACKSLASH = '\\';

// ---- corpus + dead-token derivation ----
const exts = ['.js', '.html', '.mjs'];
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git' || e === 'docs-site') continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (exts.some(x => e.endsWith(x))) files.push(p);
  }
})('.');
let corpus = '';
for (const f of files) corpus += readFileSync(f, 'utf8') + '\n';
const dynPrefixes = [...corpus.matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*-)['"`]?\s*\+/g)].map(m => m[1]);
const isDyn = t => dynPrefixes.some(p => t.startsWith(p));

// ---- string/comment-aware scanners ----
function skipString(s, idx) {           // idx at opening quote -> index just past closing quote
  const q = s[idx]; idx++;
  while (idx < s.length && s[idx] !== q) { if (s[idx] === BACKSLASH) idx++; idx++; }
  return idx + 1;
}
function skipComment(s, idx) {           // idx at "/" of "/*" -> index just past "*/"
  const e = s.indexOf('*/', idx + 2);
  return e < 0 ? s.length : e + 2;
}

// ---- brace-tree walk: collect style rules {selStart,selEnd,close} ----
const rules = [];
const n = css.length;
function skipBody(idx) {                 // idx just after "{" -> index just after matching "}"
  let d = 1;
  while (idx < n && d) {
    const ch = css[idx];
    if (ch === '/' && css[idx + 1] === '*') { idx = skipComment(css, idx); continue; }
    if (ch === '"' || ch === "'") { idx = skipString(css, idx); continue; }
    if (ch === '{') d++;
    else if (ch === '}') d--;
    idx++;
  }
  return idx;
}
function parseBlock(idx, stopAtBrace) {
  let segStart = idx;
  while (idx < n) {
    const c = css[idx];
    if (c === '/' && css[idx + 1] === '*') { idx = skipComment(css, idx); continue; }
    if (c === '"' || c === "'") { idx = skipString(css, idx); continue; }
    if (c === '}' && stopAtBrace) return idx;
    if (c === '{') {
      const prelude = css.slice(segStart, idx);
      const at = /^\s*@([a-z-]+)/i.exec(prelude);
      const braceOpen = idx; idx++;
      if (at) {
        const name = at[1].toLowerCase();
        if (name === 'media' || name === 'supports' || name === 'container') idx = parseBlock(idx, true);
        else idx = skipBody(idx);         // @keyframes/@font-face/etc -> opaque
        if (css[idx] === '}') idx++;
        segStart = idx; continue;
      }
      const close = skipBody(idx);
      rules.push({ selStart: segStart, selEnd: braceOpen, close });
      idx = close; segStart = idx; continue;
    }
    idx++;
  }
  return idx;
}
parseBlock(0, false);

// ---- dead token set (tokens used in selectors, absent from corpus, not dynamic) ----
const selTokens = new Set();
for (const r of rules) {
  const sel = css.slice(r.selStart, r.selEnd);
  for (const m of sel.matchAll(/[.#]([A-Za-z_][A-Za-z0-9_-]*)/g)) selTokens.add(m[1]);
}
const dead = new Set([...selTokens].filter(t => !corpus.includes(t) && !isDyn(t)));
const excludedDyn = [...selTokens].filter(t => !corpus.includes(t) && isDyn(t));

// ---- classify selector parts ----
function splitTop(sel) {                 // split on top-level commas (not inside parens)
  const out = []; let d = 0, b = '';
  for (const ch of sel) {
    if (ch === '(') d++; else if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(b); b = ''; } else b += ch;
  }
  if (b.trim()) out.push(b);
  return out;
}
function partDead(part) {
  // STRIP COMMENTS FIRST: the selector span includes any leading `/* … */` (it starts at the previous
  // rule's end), and a comment like `/* ICON RAIL (replaces .lpanel) */` contains a `.deadclass` token
  // that must NOT make the following live rule look dead. (This bug once nuked the live `.icon-rail`.)
  const stripped = part.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:not\([^)]*\)/gi, '');
  const toks = [...stripped.matchAll(/[.#]([A-Za-z_][A-Za-z0-9_-]*)/g)].map(m => m[1]);
  return toks.some(t => dead.has(t));
}

const edits = []; let dropN = 0, trimN = 0;
const lineOf = idx => css.slice(0, idx).split('\n').length;
for (const r of rules) {
  const parts = splitTop(css.slice(r.selStart, r.selEnd));
  if (!parts.length) continue;
  const live = parts.filter(p => !partDead(p));
  if (live.length === 0) { edits.push({ start: r.selStart, end: r.close, repl: '' }); dropN++; }
  else if (live.length < parts.length) { edits.push({ start: r.selStart, end: r.selEnd, repl: live.join(',') }); trimN++; }
}
let savedLines = 0;
for (const e of edits) if (e.repl === '') savedLines += lineOf(e.end) - lineOf(e.start);

console.log('dead tokens: ' + dead.size + ' (excluded ' + excludedDyn.length + ' dynamic-risk: ' + excludedDyn.slice(0, 12).join(' ') + (excludedDyn.length > 12 ? ' ...' : '') + ')');
console.log('rules to DROP: ' + dropN + '  | selector-lists to TRIM: ' + trimN + '  | ~lines saved: ' + savedLines);
console.log('\nALL TRIM cases (partly-dead multi-selector rules — review):');
for (const r of rules) {
  const parts = splitTop(css.slice(r.selStart, r.selEnd));
  const live = parts.filter(p => !partDead(p));
  if (live.length && live.length < parts.length)
    console.log('  L' + lineOf(r.selStart) + ': drop[' + parts.filter(p => partDead(p)).map(p => p.trim()).join(' | ') + ']  keep[' + live.map(p => p.trim()).join(' | ') + ']');
}

if (APPLY) {
  edits.sort((a, b) => b.start - a.start);
  let out = css;
  for (const e of edits) out = out.slice(0, e.start) + e.repl + out.slice(e.end);
  out = out.replace(/\n{3,}/g, '\n\n');
  const inO = (css.match(/{/g) || []).length, inC = (css.match(/}/g) || []).length;
  const ob = (out.match(/{/g) || []).length, cb = (out.match(/}/g) || []).length;
  if ((ob - cb) !== (inO - inC)) { console.error('✗ brace balance changed (in ' + (inO - inC) + ', out ' + (ob - cb) + ') — NOT writing'); process.exit(1); }
  writeFileSync('css/styles.css', out);
  console.log('\n✓ APPLIED. styles.css ' + css.split('\n').length + ' -> ' + out.split('\n').length + ' lines. braces balanced (' + ob + ').');
} else {
  console.log('\n(DRY-RUN — re-run with --apply to write)');
}
