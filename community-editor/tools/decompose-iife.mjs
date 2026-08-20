/* Generalized IIFE → namespace decomposer (reusable across the remaining IIFE modules:
   ve-advanced-features, ve-filter-graph, settings, ai, video-editor).

   A single shared-state IIFE is split into a thin namespace PARENT + cohesive child
   sub-modules. Every module-internal function/proto-method/state-var hangs off ONE namespace
   object (e.g. VEA = window.__ccVEAdvanced); cross-module references resolve through it at CALL
   time, so sibling load order is irrelevant, with no global pollution / name collisions.

   Handles: top-level `function NAME(){}`, `window.NAME = function(){}`, `NAME.prototype.M =
   function(){}` (assigned to NAME's group), and `var NAME = …;` state/const blocks (one-line or
   multi-line, terminator at indent-2). A deterministic regex prefixes every bare internal name
   with `NS.`; an AUDIT (comment-stripped) proves no bare internal reference leaked, and a
   coverage assertion proves every function is assigned to exactly one child.

   Usage:  import { run } from './decompose-iife.mjs'; run(config)   (see tools/iife-configs/*.mjs)
*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const TERMS = new Set(['  }', '  };', '  ];', '  ]', '  );']);

// Net {}/[] depth of a line, string- and line-comment-aware (so `'https://…'` and trailing
// `// notes` don't skew it). A statement is a ONE-LINER iff its line opens no block (depth <= 0)
// — robust against trailing comments / URLs where an `.endsWith(';')` check fails.
function lineDepth(s) {
  let d = 0, q = null;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === q && s[k - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '/' && s[k + 1] === '/') break;          // line comment — ignore the rest
    if (c === '{' || c === '[') d++;
    else if (c === '}' || c === ']') d--;
  }
  return d;
}

// Does this line's CODE (string-/comment-aware) end with `;` → a complete statement terminator?
// `var X =` (continuation) → false; `'b';` / `};` / `var x = 5; // n` / `'http://x';` → true.
function endsStmt(s) {
  let q = null, last = -1;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === q && s[k - 1] !== '\\') q = null; last = k; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; last = k; continue; }
    if (c === '/' && s[k + 1] === '/') break;            // line comment
    if (!/\s/.test(c)) last = k;
  }
  return last >= 0 && s[last] === ';';
}

function findEnd(lines, start, isVar) {
  let d = lineDepth(lines[start]);
  // A data VAR (object/array/string-concat, `var X =`-continuation, `[ … ].join('\n')`) ends when
  // brackets balance (string-aware lineDepth) AND the line terminates the statement (ends with `;`).
  // The `;` check is essential: `var X =` is depth-0 but NOT complete (value on the next line).
  if (isVar) {
    if (d <= 0 && endsStmt(lines[start])) return start;
    for (let j = start + 1; j < lines.length; j++) { d += lineDepth(lines[j]); if (d <= 0 && endsStmt(lines[j])) return j; }
    throw new Error('no balanced end for var from line ' + (start + 1) + ': ' + lines[start]);
  }
  if (d <= 0) return start;                              // self-contained one-line code statement
  // CODE blocks (function / prototype method / inheritance stmt) end at the first indent-2 close
  // line — robust against `{`/`}` inside strings or regex literals in the body (not counted).
  for (let j = start + 1; j < lines.length; j++) if (TERMS.has(lines[j])) return j;
  throw new Error('no terminator from line ' + (start + 1) + ': ' + lines[start]);
}

// Split a string on TOP-LEVEL commas only (ignoring commas inside (), [], {}, strings, //comments).
// Used to break multi-variable declarations `var a = x, b = y` into separate declarators.
function splitTopLevel(s) {
  const parts = []; let depth = 0, q = null, start = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === q && s[k - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && s[k + 1] === '/') { while (k < s.length && s[k] !== '\n') k++; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { parts.push(s.slice(start, k)); start = k + 1; }
  }
  parts.push(s.slice(start));
  return parts;
}
// All declared names in a `var a = x, b = y;` block (handles single + multi-variable declarations).
function declNames(block) {
  const body = block.replace(/^\s*var\s+/, '');
  return splitTopLevel(body).map(d => { const m = d.match(/^\s*([A-Za-z0-9_$]+)/); return m ? m[1] : null; }).filter(Boolean);
}

export function run(cfg) {
  const NS = cfg.nsVar;                       // e.g. 'VEA'
  const src = readFileSync(cfg.src, 'utf8');
  const lines = src.split(/\r?\n/);

  const vars = [], funcs = [], winFuncs = [], protos = [], stmts = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    let m;
    if ((m = ln.match(/^  var ([A-Za-z0-9_$]+)\s*=/))) { const end = findEnd(lines, i, true); vars.push({ name: m[1], names: declNames(lines.slice(i, end + 1).join('\n')), start: i, end }); i = end; continue; }
    if ((m = ln.match(/^  function ([A-Za-z0-9_$]+)\s*\(/))) { const end = findEnd(lines, i); funcs.push({ name: m[1], start: i, end, header: i, kind: 'func' }); i = end; continue; }
    if ((m = ln.match(/^  window\.([A-Za-z0-9_$]+)\s*=\s*function\s*\(/))) {
      if (!(cfg.parentWindowFuncs || []).includes(m[1])) { const end = findEnd(lines, i); winFuncs.push({ name: m[1], start: i, end, header: i, kind: 'win' }); i = end; }
      continue;
    }
    if ((m = ln.match(/^  ([A-Za-z0-9_$]+)\.prototype\.([A-Za-z0-9_$]+)\s*=\s*function\s*\(/))) { const end = findEnd(lines, i); protos.push({ base: m[1], method: m[2], start: i, end, header: i, kind: 'proto' }); i = end; continue; }
    // prototype-chain / inheritance setup (X.prototype = Object.create(Y.prototype); X.prototype.constructor = X;)
    // — a top-level statement that runs at LOAD time, so it must stay in X's child IN SOURCE ORDER
    // (after the constructor, before the methods); kept with its class via groupOf[base].
    if ((m = ln.match(/^  ([A-Za-z0-9_$]+)\.prototype\b/))) { const end = findEnd(lines, i); stmts.push({ base: m[1], start: i, end, header: i, kind: 'stmt' }); i = end; continue; }
  }

  const varNames = vars.flatMap(v => v.names);   // every declared name (incl. multi-var `var a, b`)
  const funcNames = funcs.map(f => f.name);
  const winNames = winFuncs.map(f => f.name);
  const NAMESET = [...new Set([...funcNames, ...winNames, ...varNames])];

  // groupFn predicate (avoids transcribing dozens of names): name → child group | null. Applied to
  // every extracted function + window-fn (small state vars stay in the parent unless explicitly
  // grouped). Duplicate-named win-fns (e.g. an override defined twice) are classified once; both
  // blocks still get placed into that one group in source order (the later block wins, as before).
  if (cfg.groupFn) {
    cfg.groups = cfg.groups || {};
    for (const n of [...new Set([...funcNames, ...winNames])]) {
      const g = cfg.groupFn(n); if (g) (cfg.groups[g] = cfg.groups[g] || []).push(n);
    }
  }

  // coverage: every extracted function (minus parent-owned) assigned to exactly one group
  const parentFuncs = new Set(cfg.parentFuncs || []);
  const groupOf = {};
  for (const g of Object.keys(cfg.groups)) for (const n of cfg.groups[g]) {
    if (groupOf[n]) throw new Error('fn in two groups: ' + n);
    groupOf[n] = g;
  }
  // a group entry may be a function, window-fn OR a top-level VAR (big class-vars / shaders go to a
  // child, not the parent). Validate every entry exists (catches typos) — small state/const vars
  // are simply NOT listed in any group and fall through to the parent.
  for (const g of Object.keys(cfg.groups)) for (const n of cfg.groups[g]) {
    if (!funcNames.includes(n) && !winNames.includes(n) && !varNames.includes(n))
      throw new Error('group "' + g + '" entry not found as fn/var: ' + n);
  }
  for (const n of [...funcNames, ...winNames]) {
    if (parentFuncs.has(n)) continue;
    if (!groupOf[n]) throw new Error('fn not assigned to any group (or parentFuncs): ' + n);
  }
  for (const p of protos) {
    if (!groupOf[p.base] && !parentFuncs.has(p.base)) throw new Error('proto base has no group: ' + p.base + '.prototype.' + p.method);
  }
  for (const s of stmts) {
    if (!groupOf[s.base] && !parentFuncs.has(s.base)) throw new Error('inheritance-stmt base has no group: ' + s.base + ' @ line ' + (s.start + 1));
  }
  console.log('coverage OK: ' + funcNames.length + ' fns + ' + winNames.length + ' win-fns + ' + protos.length + ' proto-methods + ' + stmts.length + ' inherit-stmts + ' + varNames.length + ' vars');

  // transform a block's lines → NS-prefixed text. Prefix every bare ref to an internal name with
  // `NS.` — EXCEPT an object-literal KEY (`{ NAME: … }` / `, NAME: …`), which is a string property
  // name, not the variable (only its VALUE side is prefixed). Protect such keys in ONE pre-pass
  // with a NUMBERED placeholder (no identifier inside → the per-name prefix pass can't re-touch it),
  // then restore. (Ternary values `x ? NAME : y` are preceded by `?`, not `{`/`,`, so still prefixed.)
  const nameSetLocal = new Set(NAMESET);
  const prefix = (text) => {
    const keyStash = [];
    // object-literal key = IDENT just after `{`/`,` (allowing line/block COMMENTS between, e.g.
    // `{ // note\n  init: … }`) followed by `:`. Protect such keys when they collide with a name.
    text = text.replace(/([{,](?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*)([A-Za-z0-9_$]+)(\s*:)/g, (full, pre, k, post) =>
      nameSetLocal.has(k) ? pre + '\x00K' + (keyStash.push(k) - 1) + '\x00' + post : full);
    for (const name of NAMESET) {
      text = text.replace(new RegExp('(?<![.\\w$])' + name.replace(/[$]/g, '\\$') + '(?![\\w$])', 'g'), NS + '.' + name);
    }
    text = text.replace(/\x00K(\d+)\x00/g, (full, i) => keyStash[+i]);
    return text;
  };
  function transformFn(f) {
    let body = lines.slice(f.start, f.end + 1);
    const h = f.header - f.start;
    if (f.kind === 'func') body[h] = body[h].replace(/^  function ([A-Za-z0-9_$]+)\s*\(/, '  ' + NS + '.$1 = function (');
    else if (f.kind === 'win') body[h] = body[h].replace(/^  window\.([A-Za-z0-9_$]+)\s*=\s*function\s*\(/, '  ' + NS + '.$1 = function (');
    // proto: header left as-is; prefix() turns BASE → NS.BASE giving NS.BASE.prototype.M = function
    // terminator: a multi-line `function NAME(){…}` decl needs `};` (it became an assignment)
    if (f.kind === 'func' && f.end !== f.start && body[body.length - 1] === '  }') body[body.length - 1] = '  };';
    return prefix(body.join('\n'));
  }
  // a top-level `var …` block → `NS.NAME = …` per declarator (+ ref prefixing). Splits multi-variable
  // declarations (`var a = x, b = y;` → `NS.a = x;\n  NS.b = y;`) so the 2nd+ names aren't dropped
  // (which would leave them as bare/undeclared globals — a 'use strict' ReferenceError).
  function transformVar(v) {
    const block = lines.slice(v.start, v.end + 1).join('\n');
    const body = block.replace(/^\s*var\s+/, '').replace(/;\s*$/, '');
    const out = splitTopLevel(body).map(d => {
      const m = d.match(/^\s*([A-Za-z0-9_$]+)\s*=([\s\S]*)$/);
      return m ? '  ' + NS + '.' + m[1] + ' =' + m[2] + ';' : '  ' + NS + '.' + d.trim() + ' = undefined;';
    }).join('\n');
    return prefix(out);
  }

  // assign blocks to groups as {start, text}; emitted SORTED BY START LINE so a class's
  // constructor → inheritance setup → prototype methods keep their original, load-safe order.
  const childBlocks = {};
  for (const g of Object.keys(cfg.groups)) childBlocks[g] = [];
  const place = (g, start, text) => { childBlocks[g].push({ start, text }); };
  for (const f of [...funcs, ...winFuncs]) { if (parentFuncs.has(f.name)) continue; place(groupOf[f.name], f.start, transformFn(f)); }
  for (const p of protos) { if (parentFuncs.has(p.base)) continue; place(groupOf[p.base], p.start, transformFn(p)); }
  for (const s of stmts) { if (parentFuncs.has(s.base)) continue; place(groupOf[s.base], s.start, transformFn(s)); }
  // grouped VARS (big class-vars / shader sources listed in a group) → that child, in source order
  for (const v of vars) { if (groupOf[v.name]) place(groupOf[v.name], v.start, transformVar(v)); }
  // rawBlocks: explicit 1-indexed line ranges of top-level STATEMENTS (e.g. a load-time
  // `document.addEventListener(…)`) that aren't a var/function/proto — prefixed + placed in a group.
  for (const rb of (cfg.rawBlocks || [])) {
    if (!childBlocks[rb.group]) throw new Error('rawBlock group not found: ' + rb.group);
    place(rb.group, rb.start - 1, prefix(lines.slice(rb.start - 1, rb.end).join('\n')));
  }
  for (const g of Object.keys(childBlocks)) childBlocks[g].sort((a, b) => a.start - b.start);

  // parent state/const block = UNGROUPED vars (small state/consts), MINUS any in parentVarsSkip
  // (vars whose initializer calls a now-in-a-child function — load-order/hoisting hazard; the
  // parent hand-authors those, typically deferred to cc:modules-ready). grouped vars went to children.
  const skipVars = new Set(cfg.parentVarsSkip || []);
  const stateLines = vars.filter(v => !groupOf[v.name] && !skipVars.has(v.name)).map(transformVar).join('\n');

  // write children
  for (const g of Object.keys(cfg.groups)) {
    const dir = cfg.childDir + '/' + g;
    mkdirSync(dir, { recursive: true });
    const out =
      '/* Module: ' + cfg.childComment(g) + '\n' +
      '   Part of the ' + cfg.parentId + ' group (decomposed from the ' + lines.length + '-line IIFE). Functions hang off the\n' +
      '   shared namespace ' + NS + ' (' + cfg.nsGlobal + ', created by the parent); cross-module refs resolve\n' +
      '   through ' + NS + ' at call time, so sibling load order does not matter. */\n' +
      '(function () {\n' +
      "  'use strict';\n" +
      '  var ' + NS + ' = ' + cfg.nsGlobal + ';\n' +
      '  if (!' + NS + ') return;\n\n' +
      childBlocks[g].map(b => b.text).join('\n\n') + '\n\n' +
      '  if (window.cc && cc.modules) {\n' +
      // canonical register: id = bare folder name, parent = parent path → fullId == folder path
      "    cc.modules.register({ id: '" + g + "', parent: '" + cfg.parentDotted + "', title: '" + cfg.parentId + ': ' + g + "', mount: function () {}, unmount: function () {} });\n" +
      '  }\n' +
      '})();\n';
    writeFileSync(dir + '/' + g + '.js', out);
    console.log('wrote ' + g + '/' + g + '.js  (' + childBlocks[g].length + ' blocks, ' + out.split('\n').length + ' lines)');
  }

  // write parent
  writeFileSync(cfg.parentFile, cfg.buildParent(stateLines, NS));
  console.log('wrote parent ' + cfg.parentFile.split(/[\\/]/).pop());

  // AUDIT — no bare internal name may remain in a child's CODE
  let leaks = 0;
  for (const g of Object.keys(cfg.groups)) {
    const raw = readFileSync(cfg.childDir + '/' + g + '/' + g + '.js', 'utf8');
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const name of NAMESET) {
      const re = new RegExp('(?<![.\\w$])' + name.replace(/[$]/g, '\\$') + '(?![\\w$])', 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        // an object-literal KEY (`{ NAME:` / `, NAME:`) is a legit property name, not a leak
        if (/^\s*:/.test(text.slice(m.index + name.length)) && /[{,]\s*$/.test(text.slice(0, m.index))) continue;
        leaks++; console.error('LEAK ' + g + ': bare "' + name + '" …' + text.slice(Math.max(0, m.index - 24), m.index + name.length + 6).replace(/\n/g, '⏎') + '…');
      }
    }
  }
  if (leaks) { console.error('\n✗ AUDIT FAILED: ' + leaks + ' bare ref(s)'); process.exit(1); }
  console.log('✓ AUDIT PASSED — no bare internal refs in any child');
  return { NAMESET, funcNames, winNames, varNames, protos };
}
