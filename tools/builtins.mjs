// Writes reference/builtins.json from the checker's table of builtins in a Quillo
// checkout (src/check.rs, `const BUILTINS`): each one's name, parameters and result
// as `quillo check` knows them. The reference pages' headers are checked against it
// by tools/refcheck.mjs, so the docs cannot drift from the checker.
//
//   node tools/builtins.mjs ~/dev/quillo-app1

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const quillo = process.argv[2];
if (!quillo) { console.error("usage: node tools/builtins.mjs <quillo checkout>"); process.exit(2); }
const src = readFileSync(join(quillo, "src/check.rs"), "utf8").split("\n");
const start = src.findIndex((l) => l.startsWith("const BUILTINS: &[(&str, &str, &str)]"));
if (start < 0) { console.error("no BUILTINS table in src/check.rs"); process.exit(2); }
const out = [];
for (let i = start + 1; i < src.length && !src[i].startsWith("];"); i++) {
  const m = src[i].match(/^\s*\("([a-z_0-9.]+)",\s*"([^"]*)",\s*"([^"]*)"\)/);
  if (m) out.push({ name: m[1], params: m[2], returns: m[3] });
}
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "../reference/builtins.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} builtins written to reference/builtins.json`);
