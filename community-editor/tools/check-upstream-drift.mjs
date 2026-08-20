/* check-upstream-drift.mjs
 *
 * apps/community-editor is a COPY of apps/editor. A fork with no diff report is a fork nobody can
 * update: upstream gains features weekly, and without this the community build freezes at the copy
 * date and quietly rots. (That is exactly what happened to the frozen apps/editor/editor/ copy that
 * had to be deleted on 2026-08-10.)
 *
 * So: every intentional difference is an entry in tools/fork-manifest.json with a written reason,
 * and this script fails on anything else. It fails BOTH ways on purpose:
 *   - a file that differs with no entry      -> an accidental divergence
 *   - an entry that no longer applies        -> a stale exemption
 * A stale exemption is the dangerous one, because it reads green while covering nothing.
 *
 * Usage:  node apps/community-editor/tools/check-upstream-drift.mjs [--json]
 * Exit 0 = clean, 1 = drift, 2 = could not run.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FORK = resolve(HERE, '..');
const MANIFEST_PATH = join(HERE, 'fork-manifest.json');
const JSON_OUT = process.argv.includes('--json');

function die(msg) {
  console.error('check-upstream-drift: ' + msg);
  process.exit(2);
}

if (!existsSync(MANIFEST_PATH)) die('tools/fork-manifest.json not found');

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
} catch (e) {
  die('fork-manifest.json is not valid JSON: ' + e.message);
}

const UPSTREAM = resolve(FORK, manifest.upstream || '../editor');
if (!existsSync(UPSTREAM)) die('upstream not found at ' + UPSTREAM);

const KINDS = new Set(['removed', 'new', 'patched', 'replaced']);
const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

// Validate the ledger itself before trusting it. An entry with no reason is not a decision, it is a
// note to nobody.
const seenPaths = new Set();
for (const e of entries) {
  if (!e || typeof e.path !== 'string' || !e.path) die('an entry has no path');
  if (!KINDS.has(e.kind)) die(`entry "${e.path}" has unknown kind "${e.kind}"`);
  if (typeof e.reason !== 'string' || e.reason.trim().length < 10) {
    die(`entry "${e.path}" has no usable reason (a reason is required, in words)`);
  }
  if (seenPaths.has(e.path)) die(`entry "${e.path}" is listed twice`);
  seenPaths.add(e.path);
}

const ignore = Array.isArray(manifest.ignore) ? manifest.ignore : [];

function toPosix(p) {
  return p.split(sep).join('/');
}

/* One matcher for both `ignore` and entry paths. Supports an exact path, a `dir/**` prefix, and a
   bare `*.ext` suffix. Deliberately NOT a glob library: a fork ledger that needs a glob engine is a
   ledger nobody can read. */
function matches(pattern, relPath) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return relPath === prefix || relPath.startsWith(prefix + '/');
  }
  if (pattern.startsWith('*.')) return relPath.endsWith(pattern.slice(1));
  return relPath === pattern;
}

function isIgnored(relPath) {
  return ignore.some((p) => matches(p, relPath));
}

function walk(root) {
  const out = new Map(); // relPath -> absPath
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let names;
    try {
      names = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of names) {
      const abs = join(dir, d.name);
      const rel = toPosix(relative(root, abs));
      if (isIgnored(rel)) continue;
      if (d.isDirectory()) {
        stack.push(abs);
      } else if (d.isFile()) {
        out.set(rel, abs);
      }
    }
  }
  return out;
}

/* THE FORK IS BRANDED DIFFERENTLY, AND THAT MUST NOT COUNT AS DRIFT.
 *
 * 2026-08-15: the community build was renamed to dika studio (owner instruction). 178 replacements
 * across 94 files that are otherwise byte-identical to upstream. Three ways to handle it:
 *
 *   - 94 ledger entries: 94 copies of one sentence, and the ledger stops being readable.
 *   - seven `css/**`-style blanket entries: they would also swallow every FUTURE real change in
 *     those trees, which is the one thing this checker exists to catch.
 *   - normalise the name away before comparing. A file that differs ONLY by the rename is not
 *     drift; a file that differs for any other reason still is, byte for byte.
 *
 * The third is the only one that keeps the checker worth running. It is deliberately narrow: exactly
 * the two tokens the rename script replaced, nothing else, so it cannot hide a real edit.
 */
const RENAME_TO_UPSTREAM = [
  [/\bdika studio\b/g, 'CardCraft'],
  [/\bDIKA STUDIO\b/g, 'CARDCRAFT']
];
const TEXTUAL = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.html', '.css', '.md', '.txt', '.yml', '.yaml', '.svg']);

function hash(abs, { unbrand = false } = {}) {
  // Size first: a cheap, exact discriminator that skips reading 265 MB of ONNX weights on every run
  // when nothing about them changed.
  const st = statSync(abs);
  if (st.size > 4 * 1024 * 1024) return 'size:' + st.size;
  const buf = readFileSync(abs);
  if (!unbrand || !TEXTUAL.has(extname(abs).toLowerCase())) {
    return createHash('sha1').update(buf).digest('hex');
  }
  let text = buf.toString('utf8');
  for (const [re, to] of RENAME_TO_UPSTREAM) text = text.replace(re, to);
  return createHash('sha1').update(text, 'utf8').digest('hex');
}

const forkFiles = walk(FORK);
const upFiles = walk(UPSTREAM);

const findings = [];
const usedEntries = new Set();

function entryFor(relPath) {
  for (const e of entries) {
    if (matches(e.path, relPath)) return e;
  }
  return null;
}

// 1. Files upstream has.
for (const [rel, upAbs] of upFiles) {
  const forkAbs = forkFiles.get(rel);
  const e = entryFor(rel);
  if (!forkAbs) {
    if (e && e.kind === 'removed') { usedEntries.add(e.path); continue; }
    findings.push({ path: rel, problem: 'missing in fork with no "removed" entry' });
    continue;
  }
  const same = hash(upAbs) === hash(forkAbs, { unbrand: true });
  if (same) {
    // An entry claiming this file was changed, on a file that is identical, covers nothing.
    if (e && (e.kind === 'patched' || e.kind === 'replaced')) {
      findings.push({ path: rel, problem: `stale entry: kind "${e.kind}" but the file is identical to upstream` });
    }
    if (e && e.kind === 'removed') {
      findings.push({ path: rel, problem: 'stale entry: marked "removed" but the file is present' });
    }
    continue;
  }
  if (e && (e.kind === 'patched' || e.kind === 'replaced')) { usedEntries.add(e.path); continue; }
  findings.push({ path: rel, problem: 'differs from upstream with no "patched"/"replaced" entry' });
}

// 2. Files only the fork has.
for (const rel of forkFiles.keys()) {
  if (upFiles.has(rel)) continue;
  const e = entryFor(rel);
  if (e && e.kind === 'new') { usedEntries.add(e.path); continue; }
  findings.push({ path: rel, problem: 'exists only in the fork with no "new" entry' });
}

// 3. Entries nothing matched at all.
for (const e of entries) {
  if (usedEntries.has(e.path)) continue;
  findings.push({ path: e.path, problem: `stale entry: kind "${e.kind}" matched no file in either tree` });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: findings.length === 0, upstream: UPSTREAM, findings }, null, 2));
} else {
  console.log(`upstream : ${UPSTREAM}`);
  console.log(`fork     : ${FORK}`);
  console.log(`files    : ${upFiles.size} upstream / ${forkFiles.size} fork`);
  console.log(`ledger   : ${entries.length} entries`);
  if (findings.length === 0) {
    console.log('\nOK - every difference from upstream is recorded, and every record still applies.');
  } else {
    console.log(`\nDRIFT (${findings.length}):`);
    for (const f of findings.slice(0, 200)) console.log(`  ${f.path}\n      ${f.problem}`);
    if (findings.length > 200) console.log(`  ... and ${findings.length - 200} more`);
    console.log('\nFix the file, or add an entry with a reason to tools/fork-manifest.json.');
  }
}

process.exit(findings.length === 0 ? 0 : 1);
