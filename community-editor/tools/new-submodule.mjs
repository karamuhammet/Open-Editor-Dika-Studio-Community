/* Scaffold a sub-module under a panel module, then regenerate the manifest.
   Run:  node tools/new-submodule.mjs <parent> <sub>     (lowercase kebab-case)
   Creates modules/<parent>/<sub>/{<sub>.js, <sub>.css}. Code in that folder ONLY. */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const parent = (process.argv[2] || '').trim();
const sub = (process.argv[3] || '').trim();
if (!/^[a-z][a-z0-9-]*$/.test(parent) || !/^[a-z][a-z0-9-]*$/.test(sub)) {
  console.error('Usage: node tools/new-submodule.mjs <parent> <sub>   (lowercase kebab-case)');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parentDir = join(root, 'modules', parent);
if (!existsSync(parentDir)) { console.error('Parent module not found: modules/' + parent); process.exit(1); }
const dir = join(parentDir, sub);
if (existsSync(dir)) { console.error('Sub-module already exists: modules/' + parent + '/' + sub); process.exit(1); }
mkdirSync(dir, { recursive: true });

const Title = sub.charAt(0).toUpperCase() + sub.slice(1).replace(/-/g, ' ');
writeFileSync(join(dir, sub + '.js'),
`/* Sub-module: ${parent}/${sub} — isolated tab/feature of the "${parent}" panel.
   Depends ONLY on cc.*; rendered into a slot the parent panel provides. */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[${parent}.${sub}] cc skeleton missing'); return; }
  cc.modules.register({
    id: '${sub}',
    parent: '${parent}',
    title: '${Title}',
    mount: function (slot) {
      // TODO: render this sub-feature into \`slot\`. MUST be idempotent (safe to re-run).
    },
    unmount: function () {}
  });
})();
`);
writeFileSync(join(dir, sub + '.css'),
`/* Sub-module: ${parent}/${sub} — selectors prefixed .${parent}-${sub}- ; theme tokens only otherwise. */
`);

execFileSync('node', [join(root, 'tools', 'build-manifest.mjs')], { stdio: 'inherit' });
console.log('Created modules/' + parent + '/' + sub + '/  — code in that folder ONLY.');
