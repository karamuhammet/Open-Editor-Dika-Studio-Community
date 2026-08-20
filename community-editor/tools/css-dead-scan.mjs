/* Conservative dead-selector scanner for css/styles.css. Extracts class/id tokens from SELECTOR text
   (not declarations), then checks each against a corpus of ALL html + js (index.html, modules/**, js/**,
   core/**). A token absent from the corpus = dead CANDIDATE. SUBSTRING match (so a token built as part
   of a longer literal still counts as live); ALSO flags tokens whose dash-prefix appears in a JS string-
   concat (`'prefix-' +`) as DYNAMIC-RISK (don't auto-remove). Output only — removal is reviewed by hand. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync('css/styles.css', 'utf8');
// strip comments, then collect selector text = everything before each "{" (split on } and {).
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [];
let depth = 0, buf = '';
for (let i = 0; i < noComments.length; i++) {
  const c = noComments[i];
  if (c === '{') { selectors.push(buf); buf = ''; depth++; }
  else if (c === '}') { buf = ''; if (depth) depth--; }
  else buf += c;
}
// tokens from selector text only; skip at-rule lines (@media/@keyframes/@supports/from/to/percentages)
const classTok = new Set(), idTok = new Set();
for (let sel of selectors) {
  sel = sel.split('\n').filter(l => !/^\s*@/.test(l) && !/^\s*\d/.test(l)).join(' ');
  if (/^\s*(from|to)\s*$/.test(sel)) continue;
  for (const m of sel.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) classTok.add(m[1]);
  for (const m of sel.matchAll(/#([A-Za-z_][A-Za-z0-9_-]*)/g)) idTok.add(m[1]);
}

// corpus = all html + js outside css/
const exts = new Set(['.js', '.html', '.mjs']);
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git' || e === 'docs-site') continue;
    const p = join(d, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if ([...exts].some(x => e.endsWith(x))) files.push(p);
  }
})('.');
let corpus = '';
for (const f of files) corpus += readFileSync(f, 'utf8') + '\n';

const deadClass = [...classTok].filter(t => !corpus.includes(t)).sort();
const deadId = [...idTok].filter(t => !corpus.includes(t)).sort();
// dynamic-risk prefixes: a JS `'xxx-' +` concat
const dynPrefixes = [...corpus.matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*-)['"`]?\s*\+/g)].map(m => m[1]);
const risky = t => dynPrefixes.find(p => t.startsWith(p));

console.log('selectors scanned: ~' + selectors.length + ' | unique classes ' + classTok.size + ', ids ' + idTok.size + ' | corpus ' + files.length + ' files');
console.log('\nDEAD CLASS candidates (' + deadClass.length + '):');
console.log('  -- safe (no dynamic prefix) --');
console.log('  ' + deadClass.filter(t => !risky(t)).join(' '));
console.log('  -- dynamic-risk (prefix built in JS — REVIEW) --');
console.log('  ' + deadClass.filter(t => risky(t)).map(t => t+'('+risky(t)+')').join(' '));
console.log('\nDEAD ID candidates (' + deadId.length + '):\n  ' + deadId.join(' '));
