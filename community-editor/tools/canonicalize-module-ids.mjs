/* One-time codemod: make every module's runtime register fullId == its canonical folder path
   (area.module.submodule). Rewrites the cc.modules.register({id,parent}) line: id = bare folder
   name, parent = parent folder path (inserted/removed/updated as needed). Single-line register
   calls (the universal format here). Idempotent: already-correct modules are left unchanged. */
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = join(root, 'modules');
const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
let changed = 0;
function fix(dir, relParts) {
  const name = relParts[relParts.length - 1];
  const parentPath = relParts.slice(0, -1).join('.');
  const js = join(dir, name + '.js');
  if (existsSync(js)) {
    let src = readFileSync(js, 'utf8');
    const before = src;
    // id (always the first key after register({ )
    src = src.replace(/(cc\.modules\.register\(\{\s*id:\s*')[^']*(')/, '$1' + name + '$2');
    if (parentPath) {
      if (/cc\.modules\.register\(\{[^\n]*?\bparent:\s*'/.test(src)) {
        src = src.replace(/(cc\.modules\.register\(\{[^\n]*?\bparent:\s*')[^']*(')/, '$1' + parentPath + '$2');
      } else {
        src = src.replace(/(cc\.modules\.register\(\{\s*id:\s*'[^']*')/, "$1, parent: '" + parentPath + "'");
      }
    } else {
      src = src.replace(/(cc\.modules\.register\(\{[^\n]*?)\s*,\s*parent:\s*'[^']*'/, '$1');
    }
    if (src !== before) { writeFileSync(js, src); changed++; }
  }
  for (const sub of readdirSync(dir)) {
    const sd = join(dir, sub);
    if (isDir(sd) && existsSync(join(sd, sub + '.js'))) fix(sd, relParts.concat(sub));
  }
}
for (const entry of readdirSync(modulesDir)) {
  const d = join(modulesDir, entry);
  if (isDir(d) && existsSync(join(d, entry + '.js'))) fix(d, [entry]);
}
console.log('register lines rewritten:', changed);
