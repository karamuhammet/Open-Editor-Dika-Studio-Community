/* dika studio editor - realtime collaboration vendor bundle (docs/collaboration-sharing-plan.md Phase 4).
   The editor has no bundler: every dependency must arrive as a plain <script> that puts globals on
   window. Yjs and the Hocuspocus provider are ESM-only, so this script bundles them ONCE into an IIFE
   that exposes window.Y / window.HocuspocusProvider / window.YProtocolsAwareness.

   Run: node apps/editor/tools/build-collab-vendor.mjs
   Output: apps/editor/vendor/collab/collab.min.js (committed like the other vendor bundles).
   Re-run after upgrading yjs / @hocuspocus/provider. */
import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");                    // apps/editor
const OUT_DIR = join(ROOT, "vendor", "collab");
const OUT = join(OUT_DIR, "collab.min.js");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const ENTRY = `
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as awarenessProtocol from "y-protocols/awareness";
window.Y = Y;
window.HocuspocusProvider = HocuspocusProvider;
window.YProtocolsAwareness = awarenessProtocol;
`;

const res = await build({
  stdin: { contents: ENTRY, resolveDir: ROOT, sourcefile: "collab-entry.js", loader: "js" },
  bundle: true,
  format: "iife",
  target: ["es2019"],
  minify: true,
  legalComments: "none",
  write: false,
  logLevel: "warning",
});

writeFileSync(OUT, res.outputFiles[0].contents);
const kb = Math.round(statSync(OUT).size / 1024);
console.log(`[collab-vendor] wrote vendor/collab/collab.min.js (${kb}KB) - globals: Y, HocuspocusProvider, YProtocolsAwareness`);
