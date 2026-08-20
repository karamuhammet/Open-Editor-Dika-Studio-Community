/* Dedup a FLAT file's DUPLICATE top-level `function NAME(){}` declarations. In JS, multiple function
   declarations of the same name in the same scope: the LAST in source order wins (hoisting overwrites
   earlier ones), so every earlier copy is DEAD — safe to remove (behavior-preserving by construction).
   Keeps the last definition of each name, drops the earlier duplicates (+ a single preceding comment
   line if present). Usage: node tools/dedup-flat.mjs <file> [--apply] */
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('usage: dedup-flat.mjs <file> [--apply]'); process.exit(1); }
const lines = readFileSync(file, 'utf8').split(/\r?\n/);

// extract col-0 function blocks: `function NAME(` / `async function NAME(` … to the next col-0 `}`
const blocks = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(?:async\s+)?function ([A-Za-z0-9_$]+)\s*\(/);
  if (!m) continue;
  let end = -1;
  for (let j = i + 1; j < lines.length; j++) { if (lines[j] === '}') { end = j; break; } }
  if (end < 0) throw new Error('no col-0 terminator for ' + m[1] + ' @ line ' + (i + 1));
  blocks.push({ name: m[1], start: i, end });
  i = end;
}

// group by name; for names defined >1×, all but the LAST are dead
const byName = {};
for (const b of blocks) (byName[b.name] = byName[b.name] || []).push(b);
const dead = [];
for (const name of Object.keys(byName)) {
  const defs = byName[name];
  if (defs.length > 1) for (let k = 0; k < defs.length - 1; k++) dead.push(defs[k]);  // keep last
}
dead.sort((a, b) => a.start - b.start);

console.log(file.split(/[\\/]/).pop() + ': ' + blocks.length + ' fn defs, ' + Object.keys(byName).length + ' unique, ' + dead.length + ' dead duplicates');
for (const name of Object.keys(byName)) if (byName[name].length > 1)
  console.log('  ' + name + ' ×' + byName[name].length + '  → keep last @L' + (byName[name][byName[name].length - 1].start + 1) + ', drop @L' + byName[name].slice(0, -1).map(d => d.start + 1).join(','));

if (APPLY && dead.length) {
  const drop = new Set();
  for (const d of dead) {
    let s = d.start;
    // also drop a single immediately-preceding comment line (the dead copy's own header comment)
    if (s > 0 && /^\s*\/\//.test(lines[s - 1])) s--;
    for (let k = s; k <= d.end; k++) drop.add(k);
  }
  const kept = lines.filter((_, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n');
  writeFileSync(file, kept.endsWith('\n') ? kept : kept + '\n');
  console.log('\n✓ APPLIED. ' + lines.length + ' → ' + kept.split('\n').length + ' lines.');
} else if (!APPLY) {
  console.log('\n(DRY-RUN — add --apply to write)');
}
