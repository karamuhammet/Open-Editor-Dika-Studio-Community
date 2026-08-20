/* dika studio editor — module bundler (editor-perf-auth-plan B2).
   Concatenates the 293 loader-managed modules into ONE file, in the EXACT order core/loader.js
   loads them (manifest.json order × depth-first module.json children — see _loadNode). The editor's
   global-script architecture is preserved (this is concatenation, NOT an ESM transform), so every
   module self-registers via cc.modules.register exactly as before. Run: node tools/build-bundle.mjs

   Output: dist/modules.bundle.js + dist/modules.bundle.css + dist/bundle.meta.json (version hash).
   The loader, when window.CC_BUNDLED is set, loads these two files instead of ~880 requests. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");           // apps/editor
const MOD = join(ROOT, "modules");
const DIST = join(ROOT, "dist");

const manifest = JSON.parse(readFileSync(join(MOD, "manifest.json"), "utf8"));

const jsPaths = [];
const cssPaths = [];

// Mirror loader.js _loadNode: load <dir>/<base>.js (+ optional .css), then recurse into children.
function walk(dir, base) {
  const js = join(MOD, dir, base + ".js");
  if (existsSync(js)) jsPaths.push(js);
  const css = join(MOD, dir, base + ".css");
  if (existsSync(css)) cssPaths.push(css);
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(MOD, dir, "module.json"), "utf8")); } catch { /* no manifest = flat node */ }
  const kids = (meta && (meta.children || meta.submodules)) || [];
  for (const kid of kids) walk(dir + "/" + kid, kid);
}
for (const name of manifest) walk(name, name);

const rel = (p) => p.slice(MOD.length).replace(/\\/g, "/");
// `;` separator guards against a file ending without a semicolon followed by a `(`/`[` start (ASI).
const jsBundle = jsPaths.map((p) => `\n;/* ── ${rel(p)} ── */\n${readFileSync(p, "utf8")}`).join("\n");
const cssBundle = cssPaths.map((p) => `\n/* ── ${rel(p)} ── */\n${readFileSync(p, "utf8")}`).join("\n");

// Minify — whitespace + syntax ONLY. minifyIdentifiers stays OFF: the editor has thousands of inline
// onclick="globalFn()" handlers + cross-file global references; renaming top-level names would break
// them. (Raw is kept as a fallback if esbuild throws.)
const rawJsBytes = Buffer.byteLength(jsBundle);
let jsOut = jsBundle, cssOut = cssBundle;
try {
  jsOut = transformSync(jsBundle, { loader: "js", minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: "none", charset: "utf8" }).code;
} catch (e) { console.warn("[build-bundle] JS minify skipped (raw used):", e.message); }
try {
  cssOut = transformSync(cssBundle, { loader: "css", minify: true, charset: "utf8" }).code;
} catch (e) { console.warn("[build-bundle] CSS minify skipped (raw used):", e.message); }

const kb = (n) => (n / 1024).toFixed(0) + "KB";
const MAX_JS_BYTES = 4.25 * 1024 * 1024;
const MAX_CSS_BYTES = 700 * 1024;
if (Buffer.byteLength(jsOut) > MAX_JS_BYTES || Buffer.byteLength(cssOut) > MAX_CSS_BYTES) {
  throw new Error(`[build-bundle] bundle budget exceeded: JS ${kb(Buffer.byteLength(jsOut))}, CSS ${kb(Buffer.byteLength(cssOut))}`);
}

/* COMMUNITY EDITION: the two pages are SWAPPED relative to upstream, on purpose.
   `index.dev.html` is the editable source: it loads all 299 modules separately, so a source edit
   shows on reload with no rebuild, and it needs a web server because fetch is blocked on file://.
   `index.html` is GENERATED from it and is the product: one bundle in one <script> tag, which is
   what makes double-clicking the file work. In an offline build the file people open must be the
   one that runs, so the bundle owns the obvious name and the dev page takes the qualified one. */
const indexSrc = readFileSync(join(ROOT, "index.dev.html"), "utf8");
const hash = createHash("sha256")
  .update("cardcraft-editor-bundle-v2\0")
  .update(jsOut)
  .update("\0")
  .update(cssOut)
  .update("\0")
  .update(indexSrc)
  .digest("hex")
  .slice(0, 16);
const flag = `<script>window.CC_BUNDLED=true;window.CC_MODVER=${JSON.stringify(hash)};/* editor-perf-auth-plan B2 */</script>\n  `;
const loaderRe = /(<script[^>]*src="core\/loader\.js[^"]*"[^>]*><\/script>)/;
let prod;
if (loaderRe.test(indexSrc)) {
  prod = indexSrc.replace(loaderRe, flag + "$1");
} else {
  console.warn("[build-bundle] loader.js <script> not found — flag injected before </head>");
  prod = indexSrc.replace("</head>", flag + "</head>");
}

/* Stamp every LOCAL <script src>/<link href> in the PROD page with a per-file content hash
   (measured 2026-08-11). The bundle covers `modules/` only; index.html still pulls ~48 files from
   core/, js/ and css/ with plain unversioned URLs, so in dev they carry `max-age=0` and the browser
   REVALIDATES all of them on every single boot. That is ~0.6s of serialized round trips before the
   module bundle is even requested, and they are `<script>` tags, so nothing can start without them.
   With `?v=<hash of that file>` they become content-addressed and next.config can cache them
   immutably (the rule is gated on the `v` query, so index.html's unversioned URLs are untouched and
   the no-build dev workflow still picks up an edit on reload).
   THE HASH IS PER FILE, NOT THE BUNDLE HASH: the bundle hash is computed from `modules/`, so editing
   core/autosave.js would not move it and the browser would keep a stale copy for a year. */
const assetVersions = new Map();
function stampVersion(_match, attr, url) {
  if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith("data:")) return _match;
  // A HAND-WRITTEN `?v=` IS REPLACED, NOT RESPECTED: index.html carries one (`theme.css?v=20260627ef`)
  // and it satisfies the immutable rule below, so leaving it alone would pin that file for a year
  // behind a version string a human has to remember to bump. Any OTHER query is left untouched.
  const bare = /^([^?#]+)(?:\?v=[^&#]*)?$/.exec(url.split("#")[0]);
  if (!bare) return _match;
  const path = bare[1];
  const file = join(ROOT, path);
  if (!existsSync(file)) return _match;   // never invent a version for a file we cannot read
  let v = assetVersions.get(file);
  if (!v) {
    v = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
    assetVersions.set(file, v);
  }
  return `${attr}="${path}?v=${v}"`;
}
prod = prod
  .replace(/\bsrc="([^"]+\.js(?:\?v=[^"&#]*)?)"/g, (m, u) => stampVersion(m, "src", u))
  .replace(/\bhref="([^"]+\.css(?:\?v=[^"&#]*)?)"/g, (m, u) => stampVersion(m, "href", u));

const largestModules = jsPaths
  .map((path) => ({ path: rel(path), rawBytes: Buffer.byteLength(readFileSync(path, "utf8")) }))
  .sort((a, b) => b.rawBytes - a.rawBytes)
  .slice(0, 25);
const meta = {
  hash, modules: manifest, jsCount: jsPaths.length, cssCount: cssPaths.length,
  jsBytes: Buffer.byteLength(jsOut), cssBytes: Buffer.byteLength(cssOut), largestModules,
};
const checkOnly = process.argv.includes("--check");
if (checkOnly) {
  const failures = [];
  const same = (path, expected) => existsSync(path) && readFileSync(path, "utf8") === expected;
  if (!same(join(DIST, "modules.bundle.js"), jsOut)) failures.push("dist/modules.bundle.js");
  if (!same(join(DIST, "modules.bundle.css"), cssOut)) failures.push("dist/modules.bundle.css");
  if (!same(join(ROOT, "index.html"), prod)) failures.push("index.html");
  try {
    const actualMeta = JSON.parse(readFileSync(join(DIST, "bundle.meta.json"), "utf8"));
    if (actualMeta.hash !== meta.hash || actualMeta.jsCount !== meta.jsCount || actualMeta.cssCount !== meta.cssCount || actualMeta.jsBytes !== meta.jsBytes || actualMeta.cssBytes !== meta.cssBytes || JSON.stringify(actualMeta.modules) !== JSON.stringify(meta.modules) || JSON.stringify(actualMeta.largestModules) !== JSON.stringify(meta.largestModules)) {
      failures.push("dist/bundle.meta.json");
    }
  } catch { failures.push("dist/bundle.meta.json"); }
  if (failures.length) {
    console.error(`[build-bundle] drift: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log(`[build-bundle] drift check OK (${hash})`);
} else {
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, "modules.bundle.js"), jsOut);
  writeFileSync(join(DIST, "modules.bundle.css"), cssOut);
  writeFileSync(join(DIST, "bundle.meta.json"), JSON.stringify({ ...meta, builtAt: new Date().toISOString() }, null, 2));
  writeFileSync(join(ROOT, "index.html"), prod);
  console.log(`[build-bundle] ${jsPaths.length} js + ${cssPaths.length} css → dist/modules.bundle.{js,css}  (hash ${hash})`);
  console.log(`[build-bundle] JS ${kb(rawJsBytes)} → ${kb(Buffer.byteLength(jsOut))} minified`);
  console.log("[build-bundle] wrote index.html (CC_BUNDLED on; index.dev.html is the untouched source)");
}
