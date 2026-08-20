/* Regenerate the module manifest + every node's child list — for a TREE of any depth.
   - A "module node" is a folder <name>/ containing <name>.js.
   - Top-level nodes (modules/<name>/<name>.js with module.json) are listed in modules/manifest.json.
   - Each node's child module folders are written into its module.json "children".
   Deterministic (sorted) output, so the manifest is never hand-edited and parallel
   git worktrees can each add a (sub-)module without conflicting on a shared file.
   Run:  node tools/build-manifest.mjs                                                */
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = join(root, 'modules');
const names = [];

function isDir(p) { try { return statSync(p).isDirectory(); } catch (e) { return false; } }

// Scan a module folder: find its child module folders, record them in module.json, recurse.
function scan(dir, name, rel) {
  // The loader links <name>.css for every module → ensure one exists so it never 404s.
  const cssPath = join(dir, name + '.css');
  if (!existsSync(cssPath)) writeFileSync(cssPath, '/* ' + name + ' — no styles yet. */\n');

  const children = [];
  for (const sub of readdirSync(dir)) {
    const subDir = join(dir, sub);
    if (isDir(subDir) && existsSync(join(subDir, sub + '.js'))) children.push(sub);
  }
  children.sort();

  // Every module folder gets a module.json — the loader fetches it for each node, so a
  // missing one 404s (harmless but noisy in the console). Self-heal a minimal one, like .css.
  const metaPath = join(dir, 'module.json');
  let meta = {};
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch (e) { meta = {}; }
  }
  // Canonical id = the folder PATH (area.module.submodule) — globally unique, marketplace-ready,
  // and identical to the runtime cc.modules fullId (parent.id). Overwrite so it's self-maintaining.
  meta.id = rel.replace(/[\\/]/g, '.');
  if (children.length) meta.children = children; else delete meta.children;
  delete meta.submodules;   // migrate the old field name
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  if (children.length) console.log('  ' + rel + '  children -> [' + children.join(', ') + ']');

  children.forEach(function (c) { scan(join(dir, c), c, rel + '/' + c); });
}

if (existsSync(modulesDir)) {
  for (const entry of readdirSync(modulesDir)) {
    const dir = join(modulesDir, entry);
    if (!isDir(dir) || !existsSync(join(dir, 'module.json')) || !existsSync(join(dir, entry + '.js'))) continue;
    names.push(entry);
    scan(dir, entry, entry);
  }
}

names.sort();
writeFileSync(join(modulesDir, 'manifest.json'), JSON.stringify(names, null, 2) + '\n');
console.log('manifest.json -> [' + names.join(', ') + ']  (' + names.length + ' top-level module(s))');
