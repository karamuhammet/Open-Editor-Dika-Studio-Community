/* Embed docs/programmatic-design-generation.md into postkit.js as the AI Post skill's method
   reference.
   Run: node apps/editor/tools/build-postkit-method.mjs   (then rebuild the bundle)

   WHY A GENERATOR AND NOT A PASTE. The method document is the source of truth for how a design is
   produced here; the skill has to carry it verbatim or the model is working from a summary somebody
   wrote from memory, which is the exact failure this document exists to prevent. A paste drifts the
   first time the document is edited, silently, and the skill keeps teaching the old rules.

   The postkit module cannot fetch the file at runtime: it is one browser script with no build
   step of its own, and the loader only ever loads `<dir>/<dir>.js`. So the text is written INTO the
   source between two markers, and _ai-post-skill-proof.mjs asserts the embedded copy still equals
   the file. If they diverge the proof fails rather than the skill quietly aging. */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DOC = ROOT + "docs/programmatic-design-generation.md";
const TARGET = ROOT + "apps/editor/modules/left-panel/ai/postkit/postkit.js";
const START = "  /* @METHOD-DOC-START */";
const END = "  /* @METHOD-DOC-END */";

const doc = readFileSync(DOC, "utf8").replace(/\r\n/g, "\n").trim();
const src = readFileSync(TARGET, "utf8");

const a = src.indexOf(START);
const b = src.indexOf(END);
if (a === -1 || b === -1 || b < a) {
  console.error("REFUSED: markers not found in postkit.js. Add:\n" + START + "\n" + END);
  process.exit(1);
}

/* JSON.stringify gives a correctly escaped JS string literal for any content the document can hold,
   including the backticks and ${...} a template literal would choke on. */
const literal = JSON.stringify(doc);
const block =
  START + "\n" +
  "  /* GENERATED from docs/programmatic-design-generation.md by tools/build-postkit-method.mjs.\n" +
  "     Do not edit by hand: edit the document and re-run the generator. */\n" +
  "  var METHOD_DOC = " + literal + ";\n" +
  END;

const out = src.slice(0, a) + block + src.slice(b + END.length);
writeFileSync(TARGET, out, "utf8");
console.log(
  "[postkit-method] embedded " + doc.length + " chars (" + doc.split("\n").length + " lines) into postkit.js",
);
