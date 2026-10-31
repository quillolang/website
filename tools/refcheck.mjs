// Checks the function reference (reference/<name>.md) against a quillo binary:
// every `quillo` example is run and its printed output written back into the
// ```output block that follows it, so what the page shows is what the function
// does. A block marked ```quillo error must fail (its error is the output); one
// marked ```quillo noexec is shown but not run (it needs a request, a database,
// a browser). The header is checked against reference/builtins.json.
//
//   node tools/refcheck.mjs                 check every page (outputs must match)
//   node tools/refcheck.mjs --write         run and write the outputs in
//   node tools/refcheck.mjs upper split     some of them
//
// QUILLO names the binary (default: ../quillo-app1/target/release/quillo).

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "../reference");
const quillo = process.env.QUILLO || join(here, "../../quillo-app1/target/release/quillo");
if (!existsSync(quillo)) { console.error(`no quillo at ${quillo}: set QUILLO`); process.exit(2); }
const args = process.argv.slice(2);
const write = args.includes("--write");
const only = args.filter((a) => !a.startsWith("--"));
const builtins = JSON.parse(readFileSync(join(dir, "builtins.json"), "utf8"));
const byName = new Map(builtins.map((b) => [b.name, b]));

const files = readdirSync(dir).filter((f) => f.endsWith(".md") && (only.length === 0 || only.includes(f.slice(0, -3)))).sort();
let problems = 0, runs = 0, changed = 0;
const say = (f, msg) => { problems++; console.log(`${f}: ${msg}`); };

function run(code) {
  const tmp = mkdtempSync(join(tmpdir(), "quillo-ref-"));
  const file = join(tmp, "main.qwe");
  writeFileSync(file, code);
  const real = realpathSync(file);   // macOS: /tmp is /private/tmp, and some messages name the canonical path
  const r = spawnSync(quillo, ["run", file, "--no-check"], { encoding: "utf8", timeout: 20000, env: { ...process.env, NO_COLOR: "1" } });
  rmSync(tmp, { recursive: true, force: true });
  runs++;
  // The file's path is noise in a message: `quillo: /tmp/x/main.qwe:3: ...` -> `line 3: ...`
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
  const err = (r.stderr || "").replace(new RegExp("(?:" + esc(real) + "|" + esc(file) + "):(\\d+):", "g"), "line $1:").replace(/^quillo: /gm, "").trim()
    // A call chain names the file too, where this run keeps it.
    .replace(new RegExp("(?:" + esc(real) + "|" + esc(file) + ")", "g"), "main.qwe");
  return { status: r.status, out: (r.stdout || "").replace(/\n$/, ""), err };
}

for (const f of files) {
  const name = f.slice(0, -3);
  const path = join(dir, f);
  const lines = readFileSync(path, "utf8").split("\n");
  // Header: `# name`, then the signature line, then `group: ...`.
  if (lines[0] !== `# ${name}`) say(f, `first line should be \`# ${name}\``);
  const b = byName.get(name);
  if (!b) say(f, `not a builtin the checker knows`);
  const sig = lines[1] || "";
  if (b) {
    const want = `${name}(${b.params})${b.returns ? ` -> ${b.returns}` : ""}`;
    if (sig !== want) say(f, `signature line should be \`${want}\`, is \`${sig}\``);
  }
  if (!/^group: .+/.test(lines[2] || "")) say(f, "third line should be `group: <Group>`");
  for (const h of ["### What it does", "### Examples"]) if (!lines.includes(h)) say(f, `missing section ${h}`);

  // Walk the fences; run quillo ones; rewrite the output block after each.
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const m = l.match(/^```quillo(?: (error|noexec))?\s*$/);
    if (!m) { out.push(l); i++; continue; }
    const mode = m[1] || "run";
    const code = [];
    out.push(l); i++;
    while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); out.push(lines[i]); i++; }
    out.push("```"); i++;
    // An existing output block right after (a blank line allowed) is replaced.
    let j = i;
    while (j < lines.length && lines[j].trim() === "") j++;
    let had = null;
    if (lines[j] === "```output") {
      let k = j + 1; had = [];
      while (k < lines.length && !lines[k].startsWith("```")) { had.push(lines[k]); k++; }
      i = k + 1;
    }
    if (mode === "noexec") { if (had) say(f, "a noexec block has an output block"); continue; }
    const r = run(code.join("\n") + "\n");
    let got;
    if (mode === "error") {
      if (r.status === 0) { say(f, `an error block ran without an error:\n${code.join("\n")}\n-> it printed: ${r.out}`); got = ["(no error: printed " + JSON.stringify(r.out) + ")"]; }
      else got = (r.out ? r.out + "\n" : "") + r.err;
    } else {
      if (r.status !== 0) say(f, `an example failed:\n${code.join("\n")}\n-> ${r.err}`);
      got = r.out;
    }
    const gotLines = Array.isArray(got) ? got : got.split("\n");
    if (!had || had.join("\n") !== gotLines.join("\n")) {
      changed++;
      if (!write) say(f, had ? `output differs for:\n${code.join("\n")}\n-- page says:\n${had.join("\n")}\n-- quillo says:\n${gotLines.join("\n")}` : `no output block yet for:\n${code.join("\n")}`);
    }
    out.push("", "```output", ...gotLines, "```");
  }
  if (write) writeFileSync(path, out.join("\n").replace(/\n{3,}/g, "\n\n"));
}
console.log(`${files.length} pages, ${runs} examples run, ${changed} outputs ${write ? "written" : "differ"}, ${problems} problems`);
process.exit(problems && !write ? 1 : 0);
