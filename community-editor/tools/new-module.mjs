/* Scaffold a new module folder, then regenerate the manifest.
   Run:  node tools/new-module.mjs <name>      (lowercase kebab-case)
   Creates modules/<name>/{module.json, <name>.js, <name>.css, <name>.html}.
   Then code ONLY inside that folder (ideally in its own git worktree).    */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const name = (process.argv[2] || '').trim();
if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: node tools/new-module.mjs <name>   (lowercase, kebab-case, e.g. "media")');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'modules', name);
if (existsSync(dir)) { console.error('Module already exists: modules/' + name); process.exit(1); }
mkdirSync(dir, { recursive: true });

const Title = name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');

writeFileSync(join(dir, 'module.json'),
  JSON.stringify({ id: name, title: Title, icon: 'box', version: '0.1.0', storageKeys: [] }, null, 2) + '\n');

writeFileSync(join(dir, name + '.js'),
`/* Module: ${name} — depends ONLY on cc.* (never raw globals or another module). */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[${name}] cc skeleton missing'); return; }

  cc.modules.register({
    id: '${name}',
    title: '${Title}',
    icon: 'box',
    mount: function (root) {
      // TODO: render this module's UI into \`root\`. MUST be safe to call again (idempotent).
    },
    unmount: function () {
      // TODO: clean up listeners / DOM created in mount().
    }
  });
})();
`);

writeFileSync(join(dir, name + '.css'),
`/* Module: ${name} — every selector MUST be prefixed .${name}- .
   No global selectors except theme tokens (var(--…)). */
`);

writeFileSync(join(dir, name + '.html'),
`<!-- Module: ${name} — HTML template, mounted by the loader / panel-system. -->
<div class="${name}-root"></div>
`);

execFileSync('node', [join(root, 'tools', 'build-manifest.mjs')], { stdio: 'inherit' });
console.log('Created modules/' + name + '/  — now make a git worktree/branch "' + name + '" and code in that folder ONLY.');
