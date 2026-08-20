/* Audit: for every module folder, does its runtime register fullId (parent.id from the JS) match
   its canonical folder path (area.module.submodule)? Reports divergences to fix for full coherence. */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = join(root, 'modules');
const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
const rows = [];
function walk(dir, relParts) {
  const name = relParts[relParts.length - 1];
  const js = join(dir, name + '.js');
  if (existsSync(js)) {
    const src = readFileSync(js, 'utf8');
    // find the cc.modules.register({...}) for THIS module
    const m = src.match(/cc\.modules\.register\(\{[\s\S]*?id:\s*'([^']+)'[\s\S]*?\}\)/);
    let regId = null, regParent = null, fullId = null;
    if (m) {
      regId = m[1];
      const pm = m[0].match(/parent:\s*'([^']+)'/);
      regParent = pm ? pm[1] : null;
      fullId = regParent ? regParent + '.' + regId : regId;
    }
    const folderPath = relParts.join('.');
    rows.push({ folderPath, regId, fullId, ok: fullId === folderPath, hasReg: !!m });
  }
  for (const sub of readdirSync(dir)) {
    const sd = join(dir, sub);
    if (isDir(sd) && existsSync(join(sd, sub + '.js'))) walk(sd, relParts.concat(sub));
  }
}
for (const entry of readdirSync(modulesDir)) {
  const d = join(modulesDir, entry);
  if (isDir(d) && existsSync(join(d, entry + '.js'))) walk(d, [entry]);
}
const bad = rows.filter(r => r.hasReg && !r.ok);
const noReg = rows.filter(r => !r.hasReg);
console.log('total module folders with <name>.js:', rows.length);
console.log('runtime fullId MATCHES folder path:', rows.filter(r => r.ok).length);
console.log('DIVERGENT (fullId != folder path):', bad.length);
console.log('no register() found:', noReg.length, noReg.length ? '→ ' + noReg.map(r=>r.folderPath).join(', ') : '');
console.log('\n--- divergences (folderPath  <=  current fullId) ---');
bad.forEach(r => console.log('  ' + r.folderPath.padEnd(48) + '  <=  ' + r.fullId));
