/* Re-split an ALREADY-NAMESPACED child (a decompose-iife output whose functions are `NS.NAME =
   function(){…};`). No prefixing / forwarders needed — the namespace (e.g. VE = window.__ccVideoEditor)
   is already the call mechanism, so relocating `NS.NAME = function` blocks into sub-children that attach
   to the SAME namespace is behavior-preserving regardless of load order. groupFn(name) → group | null
   (null = stay in the parent). Used to bring over-1200 video-editor children under the threshold. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
export function runNsChild(cfg) {
  const lines = readFileSync(cfg.src, 'utf8').split(/\r?\n/);
  const NS = cfg.nsVar;
  const hdrPrefix = '  ' + NS + '.';                 // e.g. "  VE."  (col-2 namespace assignment)
  const isIdent = /^[A-Za-z0-9_$]+$/;                // regex literal — no string-escaping pitfalls
  const fns = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.startsWith(hdrPrefix)) continue;
    const eq = ln.indexOf(' = function');
    if (eq < 0) continue;
    const name = ln.slice(hdrPrefix.length, eq);
    if (!isIdent.test(name)) continue;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) { if (lines[j] === '  };') { end = j; break; } }
    if (end < 0) throw new Error('no "  };" terminator for ' + NS + '.' + name + ' @ line ' + (i + 1));
    fns.push({ name: name, start: i, end }); i = end;
  }
  if (cfg.groupFn) { cfg.groups = {}; for (const f of fns) { const g = cfg.groupFn(f.name); if (g) (cfg.groups[g] = cfg.groups[g] || []).push(f.name); } }
  const groupOf = {};
  for (const g of Object.keys(cfg.groups)) for (const n of cfg.groups[g]) {
    if (!fns.find(f => f.name === n)) throw new Error('group "' + g + '" unknown fn: ' + NS + '.' + n);
    groupOf[n] = g;
  }
  const grouped = fns.filter(f => groupOf[f.name]);
  console.log('NS-CHILD: ' + fns.length + ' ' + NS + '.* fns, ' + grouped.length + ' moved to ' + Object.keys(cfg.groups).length + ' sub-child(ren), ' + (fns.length - grouped.length) + ' stay in parent');
  for (const g of Object.keys(cfg.groups)) {
    const dir = cfg.childDir + '/' + g; mkdirSync(dir, { recursive: true });
    const blocks = grouped.filter(f => groupOf[f.name] === g).sort((a, b) => a.start - b.start).map(f => lines.slice(f.start, f.end + 1).join('\n'));
    const out =
      '/* Module: ' + cfg.childComment(g) + '\n' +
      '   Sub-module of ' + cfg.parentId + ' — functions hang off ' + NS + ' (' + cfg.nsGlobal + ', created by the\n' +
      '   video-editor parent); refs resolve through ' + NS + ' at call time, so load order is irrelevant.\n' +
      '   Split from the ' + lines.length + '-line ' + cfg.parentId + ' child. */\n\n' +
      '(function () {\n' +
      "  'use strict';\n" +
      '  var ' + NS + ' = ' + cfg.nsGlobal + ';\n' +
      '  if (!' + NS + ') return;\n\n' +
      blocks.join('\n\n') + '\n\n' +
      "  if (window.cc && cc.modules) cc.modules.register({ id: '" + g + "', parent: '" + cfg.parentDotted + "', title: '" + cfg.parentId + ': ' + g + "', mount: function () {}, unmount: function () {} });\n" +
      '})();\n';
    writeFileSync(dir + '/' + g + '.js', out);
    console.log('  wrote ' + g + '/' + g + '.js  (' + blocks.length + ' fns, ' + out.split('\n').length + ' lines)');
  }
  const drop = new Set();
  for (const f of grouped) for (let k = f.start; k <= f.end; k++) drop.add(k);
  const kept = lines.filter((_, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n');
  writeFileSync(cfg.parentFile, kept.endsWith('\n') ? kept : kept + '\n');
  console.log('  wrote parent ' + cfg.parentFile.split(/[\/]/).pop() + '  (' + kept.split('\n').length + ' lines, was ' + lines.length + ')');
}
