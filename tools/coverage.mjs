// Writes coverage.json from a Quillo checkout's last coverage run
// (scripts/coverage.sh there, which leaves target/coverage/coverage.json):
// the run itself, file by file, and a line for it in the history, which keeps
// every run before it. The coverage page (coverage.qwe) reads the file.
//
//   node tools/coverage.mjs ~/dev/quillo-app1      (or the path of a coverage.json)

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const quillo = process.argv[2];
if (!quillo) {
  console.error("usage: node tools/coverage.mjs <quillo checkout>");
  process.exit(2);
}
const from = quillo.endsWith(".json") ? quillo : join(quillo, "target/coverage/coverage.json");
const run = JSON.parse(readFileSync(from, "utf8"));
const file = join(import.meta.dirname, "../coverage.json");
const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { history: [] };
const total = (p) => ({ lines: p.lines, run: p.run, percent: p.percent });
const line = {
  date: run.date,
  commit: run.commit,
  changed: run.changed,
  version: run.version,
  system: run.system,
  tests: run.tests,
  rust: total(run.rust),
  runtime: total(run.runtime),
};
// A run of the same commit on the same day takes the place of the one before.
const history = old.history.filter((h) => !(h.commit === line.commit && h.date === line.date && h.changed === line.changed));
history.push(line);
history.sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(file, JSON.stringify({ latest: run, history }, null, 1) + "\n");
console.log(`coverage.json: Rust ${line.rust.percent}%, runtime.js ${line.runtime.percent}% at ${line.commit}; ${history.length} runs in the history`);
