/* Bucket css/styles.css rules by their dominant class/id prefix → the co-location landscape.
   For each style rule, take the FIRST class/id token of its first selector, reduce to its feature
   prefix (token up to the 1st or 2nd dash), and sum the rule's line span per prefix. Reports the
   biggest buckets = the modules worth co-locating first. Read-only. */
import { readFileSync } from 'node:fs';
const css = readFileSync('css/styles.css', 'utf8');
const BACKSLASH = '\\';
const n = css.length;
function skipString(s, i) { const q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === BACKSLASH) i++; i++; } return i + 1; }
function skipComment(s, i) { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
const rules = [];
function skipBody(i) { let d = 1; while (i < n && d) { const ch = css[i]; if (ch === '/' && css[i + 1] === '*') { i = skipComment(css, i); continue; } if (ch === '"' || ch === "'") { i = skipString(css, i); continue; } if (ch === '{') d++; else if (ch === '}') d--; i++; } return i; }
function parseBlock(i, stop) {
  let seg = i;
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { i = skipComment(css, i); continue; }
    if (c === '"' || c === "'") { i = skipString(css, i); continue; }
    if (c === '}' && stop) return i;
    if (c === '{') {
      const prelude = css.slice(seg, i), at = /^\s*@([a-z-]+)/i.exec(prelude), open = i; i++;
      if (at) { const nm = at[1].toLowerCase(); i = (nm === 'media' || nm === 'supports' || nm === 'container') ? parseBlock(i, true) : skipBody(i); if (css[i] === '}') i++; seg = i; continue; }
      const close = skipBody(i); rules.push({ sel: css.slice(seg, open), selStart: seg, close }); i = close; seg = i; continue;
    }
    i++;
  }
  return i;
}
parseBlock(0, false);
const lineOf = idx => css.slice(0, idx).split('\n').length;

// map a token to a feature prefix (first 1-2 dash segments)
function prefixOf(sel) {
  // first class or id token in the selector
  const m = sel.match(/[.#]([A-Za-z_][A-Za-z0-9_-]*)/);
  if (!m) {
    // element/base selector (no class/id) → "BASE"
    const t = sel.trim().split(/[\s,{>]/)[0];
    return t && /^[a-z*:\[]/i.test(t) ? 'BASE(element)' : 'OTHER';
  }
  const tok = m[1];
  const parts = tok.split('-');
  if (parts.length === 1) return tok;
  // 2-segment prefix for known multi-word feature namespaces, else 1-segment
  return parts[0] + '-' + parts[1];
}
const bucket = {};
for (const r of rules) {
  const p = prefixOf(r.sel);
  const lines = lineOf(r.close) - lineOf(r.selStart);
  bucket[p] = bucket[p] || { lines: 0, rules: 0 };
  bucket[p].lines += lines; bucket[p].rules++;
}
const sorted = Object.entries(bucket).sort((a, b) => b[1].lines - a[1].lines);
console.log('total rules: ' + rules.length + ' | total file ~' + css.split('\n').length + ' lines');
console.log('\nTOP prefixes by line span (co-location targets):');
console.log('lines  rules  prefix');
let shown = 0, sumShown = 0;
for (const [p, v] of sorted) { if (shown++ < 45) { console.log(String(v.lines).padStart(5) + '  ' + String(v.rules).padStart(5) + '  ' + p); sumShown += v.lines; } }
console.log('\n(top ' + Math.min(45, sorted.length) + ' = ' + sumShown + ' lines of ' + css.split('\n').length + '; ' + sorted.length + ' distinct prefixes total)');
