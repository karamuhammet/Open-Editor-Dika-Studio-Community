/* FLAT decomposer — for modules whose functions are TOP-LEVEL GLOBAL `function NAME(){}` (no IIFE,
   no namespace). Unlike the IIFE transformer, nothing is prefixed: functions stay window globals and
   resolve each other + the parent's global state at CALL time, so sibling load order is irrelevant
   (the established gallery/templates/wireframe FLAT pattern). This just RELOCATES grouped function
   blocks into child scripts; the parent keeps everything else (state/consts/ungrouped fns/init/exports)
   with the grouped functions removed.

   Usage: import { runFlat } from './decompose-flat.mjs'; runFlat(config)  (see tools/flat-configs/*.mjs)
*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export function runFlat(cfg) {
  const src = readFileSync(cfg.src, 'utf8');
  const lines = src.split(/\r?\n/);

  // extract TOP-LEVEL (column-0) function blocks: `function NAME(...)` or `async function NAME(...)`
  // … to the next column-0 `}`. (async matters: export.js's download orchestration is all `async`.)
  const fns = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:async\s+)?function ([A-Za-z0-9_$]+)\s*\(/);
    if (!m) continue;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) { if (lines[j] === '}') { end = j; break; } }
    if (end < 0) throw new Error('no col-0 terminator for ' + m[1] + ' @ line ' + (i + 1));
    // attach a single contiguous preceding // comment / blank? keep it simple: just the block.
    fns.push({ name: m[1], start: i, end });
    i = end;
  }
  const fnNames = fns.map(f => f.name);

  // groups: either explicit lists (cfg.groups) OR a predicate cfg.groupFn(name) → group|null (null
  // = stay in parent). The predicate avoids transcribing dozens of names for prefix-based files.
  if (cfg.groupFn) {
    cfg.groups = {};
    for (const f of fns) { const g = cfg.groupFn(f.name); if (g) (cfg.groups[g] = cfg.groups[g] || []).push(f.name); }
  }
  const comment = cfg.childComment || (g => g);

  // coverage: every grouped name must exist; ungrouped functions simply STAY in the parent.
  const groupOf = {};
  for (const g of Object.keys(cfg.groups)) for (const n of cfg.groups[g]) {
    if (!fnNames.includes(n)) throw new Error('group "' + g + '" has unknown fn: ' + n);
    if (groupOf[n]) throw new Error('fn in two groups: ' + n);
    groupOf[n] = g;
  }
  const grouped = fns.filter(f => groupOf[f.name]);
  console.log('FLAT: ' + fnNames.length + ' top-level fns, ' + grouped.length + ' moved to ' + Object.keys(cfg.groups).length + ' children, ' + (fnNames.length - grouped.length) + ' stay in parent');

  // write children: the grouped function blocks VERBATIM (global) + a register; plain script (no IIFE).
  for (const g of Object.keys(cfg.groups)) {
    const dir = cfg.childDir + '/' + g;
    mkdirSync(dir, { recursive: true });
    const blocks = grouped.filter(f => groupOf[f.name] === g).sort((a, b) => a.start - b.start)
      .map(f => lines.slice(f.start, f.end + 1).join('\n'));
    const out =
      '/* Module: ' + comment(g) + '\n' +
      '   FLAT sub-module of ' + cfg.parentId + ' — functions stay window globals (siblings + the parent\n' +
      '   call them at runtime; load order is irrelevant). Split from the ' + lines.length + '-line FLAT file. */\n\n' +
      blocks.join('\n\n') + '\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: '" + g + "', parent: '" + cfg.parentDotted + "', title: '" + cfg.parentId + ': ' + g + "', mount: function () {}, unmount: function () {} });\n";
    writeFileSync(dir + '/' + g + '.js', out);
    console.log('  wrote ' + g + '/' + g + '.js  (' + blocks.length + ' fns)');
  }

  // parent = original lines MINUS the grouped function blocks (keep everything else verbatim).
  const drop = new Set();
  for (const f of grouped) for (let k = f.start; k <= f.end; k++) drop.add(k);
  // also drop a single blank line immediately after a removed block to avoid blank runs
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) { if (lines[i + 1] === '' && drop.has(i - 1) === false) { /* keep */ } continue; }
    kept.push(lines[i]);
  }
  // collapse 3+ consecutive blank lines to 1
  let parent = kept.join('\n').replace(/\n{3,}/g, '\n\n');

  // deferData: a parent data object (`var NAME = {…}`) that references the now-relocated functions
  // (e.g. a registry `{ blank: { fn: tplBlank } }`) can't be built at parent load (those fns live in
  // children loaded later). Rebuild it on cc 'modules:ready', populating the SAME object so existing
  // references stay valid.
  for (const name of (cfg.deferData || [])) {
    const re = new RegExp('var ' + name + ' = (\\{[\\s\\S]*?\\n\\});');
    if (!re.test(parent)) { console.warn('  deferData: "' + name + '" not found as `var ' + name + ' = {…}` — skipped'); continue; }
    parent = parent.replace(re,
      'var ' + name + ' = {};\n' +
      '// deferred (decomposition): the entries below reference functions that now live in sibling\n' +
      '// children (loaded after this parent); populate the same object once all sub-modules are ready.\n' +
      '(function () {\n' +
      '  function _build() { var _R = $1; for (var _k in _R) ' + name + '[_k] = _R[_k]; }\n' +
      "  if (window.cc && cc.on) cc.on('modules:ready', _build); else _build();\n" +
      '})();');
    console.log('  deferred data: ' + name + ' → cc modules:ready');
  }

  // window.X = <movedFn>;  →  a forwarder (the fn now lives in a child loaded after this parent, so a
  // direct ref would capture `undefined`; a forwarder resolves the global at CALL time).
  const movedFns = new Set(grouped.map(f => f.name));
  parent = parent.replace(/^window\.([A-Za-z0-9_$]+)\s*=\s*([A-Za-z0-9_$]+)\s*;/gm, (full, exp, internal) =>
    movedFns.has(internal) ? 'window.' + exp + ' = function () { return ' + internal + '.apply(this, arguments); };' : full);

  // canvasReadyPoll: a load-time `cc.on('cc:canvas-ready', … initFns …)` that calls now-relocated
  // functions would fire (sticky replay) before the children load → guards skip → never inits.
  // Replace it with a poll that waits for the fns, then calls them.
  if (cfg.canvasReadyPoll && cfg.canvasReadyPoll.length) {
    parent = parent.replace(/^if \(window\.cc && cc\.on\) cc\.on\('cc:canvas-ready'[\s\S]*?\}\);\s*\}\);\n/m, '');
    const fns = cfg.canvasReadyPoll;
    const poll =
      "if (window.cc && cc.on) cc.on('cc:canvas-ready', function () {\n" +
      '  var _t = 0, _iv = setInterval(function () {\n' +
      '    if (' + fns.map(n => "typeof " + n + " === 'function'").join(' && ') + ') {\n' +
      '      clearInterval(_iv);\n' +
      "      cc.safe('" + cfg.parentDotted + ".init', function () { " + fns.map(n => n + '();').join(' ') + ' });\n' +
      '    } else if (++_t > 250) clearInterval(_iv);\n' +
      '  }, 16);\n});\n';
    parent = parent.replace(/(\n?if \(window\.cc && cc\.modules\) cc\.modules\.register)/, '\n' + poll + '$1');
    console.log('  canvas-ready poll-init → ' + fns.join(', '));
  }

  writeFileSync(cfg.parentFile, parent.endsWith('\n') ? parent : parent + '\n');
  console.log('  wrote parent ' + cfg.parentFile.split(/[\\/]/).pop() + '  (' + parent.split('\n').length + ' lines, was ' + lines.length + ')');
}
