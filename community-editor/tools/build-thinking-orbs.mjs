/* dika studio editor - thinking-orbs vanilla bundle.

   The editor has no bundler: every dependency must arrive as a plain <script> that puts a global
   on window. thinking-orbs (MIT, Jakub Antalik) ships a React component, so vendor/orbs/orbs-entry.ts
   re-implements that lifecycle around the library's published engine surface. The package is resolved
   from apps/web/node_modules (apps/editor is deliberately NOT a workspace package), so ONE pinned
   version serves both the React surfaces and this bundle: bump it there and re-run this script.

   Run: node apps/editor/tools/build-thinking-orbs.mjs
   Output: apps/editor/vendor/orbs/thinking-orbs.min.js  (+ the apps/web/public/editor-ai fork copy,
   which is a hand-maintained fork, NOT a junction: see CLAUDE.md).
   Re-run after touching orbs-entry.ts or after bumping the package in apps/web. */
import { writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");                                  // apps/editor
const OUT_DIR = join(ROOT, "vendor", "orbs");
const OUT = join(OUT_DIR, "thinking-orbs.min.js");
const FORK_DIR = join(ROOT, "..", "web", "public", "editor-ai", "vendor", "orbs");
const FORK = join(FORK_DIR, "thinking-orbs.min.js");

const res = await build({
  entryPoints: [join(OUT_DIR, "orbs-entry.ts")],
  bundle: true,
  format: "iife",
  target: ["es2019"],
  minify: true,
  // apps/editor has no node_modules entry for this package: resolve it where it is installed.
  nodePaths: [join(ROOT, "..", "web", "node_modules")],
  /* The library's dist imports react/jsx-runtime at module top level. Its component is tree-shaken
     (we import only the engine), but react is side-effectful, so without this alias esbuild bundled
     the whole React runtime into a file for an app that has no React. See vendor/orbs/react-stub.js. */
  alias: {
    react: join(OUT_DIR, "react-stub.js"),
    "react/jsx-runtime": join(OUT_DIR, "react-stub.js"),
  },
  legalComments: "none",
  write: false,
  logLevel: "warning",
});

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, res.outputFiles[0].contents);

// The /ai portal + automation builder run the apps/web fork of the editor, which is a real copy.
if (!existsSync(FORK_DIR)) mkdirSync(FORK_DIR, { recursive: true });
copyFileSync(OUT, FORK);

const kb = Math.round(statSync(OUT).size / 1024);
console.log(`[thinking-orbs] wrote vendor/orbs/thinking-orbs.min.js (${kb}KB) - global: CCOrb`);
console.log(`[thinking-orbs] copied to apps/web/public/editor-ai/vendor/orbs/thinking-orbs.min.js`);
