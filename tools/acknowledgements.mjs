// Writes acknowledgements.json from a Quillo checkout: each crate Quillo depends on
// directly (Cargo.toml), with its version, authors, licence, repository and the
// comment Cargo.toml gives it, as `cargo metadata` reports them. The
// acknowledgements page (acknowledgements.qwe) reads that file, so it follows the code.
//
//   node tools/acknowledgements.mjs ~/dev/quillo-app1

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const quillo = process.argv[2];
if (!quillo) { console.error("usage: node tools/acknowledgements.mjs <quillo checkout>"); process.exit(2); }
const meta = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1", "--all-features", "--manifest-path", join(quillo, "Cargo.toml")], { encoding: "utf8", maxBuffer: 1 << 28 }));
const root = meta.packages.find((p) => p.id === meta.resolve.root || p.name === "quillo");
// The comment above a dependency in Cargo.toml says what it is for.
const toml = readFileSync(join(quillo, "Cargo.toml"), "utf8").split("\n");
const notes = {};
let pending = [];
let section = "";
for (const line of toml) {
  const s = line.trim();
  if (s.startsWith("[")) { section = s; pending = []; continue; }
  if (s.startsWith("#")) { pending.push(s.replace(/^#\s?/, "")); continue; }
  const m = s.match(/^([a-z0-9_-]+)\s*=/);
  if (m && /dependencies/.test(section)) { if (pending.length) notes[m[1]] = pending.join(" "); pending = []; continue; }
  if (s === "") pending = [];
}
const byName = new Map(meta.packages.map((p) => [p.name, p]));
const out = [];
for (const d of root.dependencies) {
  const p = byName.get(d.name);
  if (!p) continue;
  out.push({
    name: p.name,
    version: p.version,
    kind: d.kind || "normal",
    optional: d.optional,
    description: (p.description || "").trim(),
    authors: p.authors,
    license: p.license || "",
    repository: p.repository || p.homepage || "",
    note: notes[p.name] || "",
  });
}
out.sort((a, b) => a.name.localeCompare(b.name));
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "../acknowledgements.json"), JSON.stringify({ quillo: root.version, crates: out }, null, 1) + "\n");
console.log(`${out.length} crates written to acknowledgements.json`);
