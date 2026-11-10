// The playground's examples, run as its sandbox runs them (quillo run --watch --listen
// unix:app.sock main.qwe, in a folder of their own), and the line the page reads to know a
// program has no pages (play.qwe's play_pageless): that quillo says it in those words, for
// a program of no routes only.
//
//   node --test play/test/examples.test.mjs            (the quillo on PATH)
//   QUILLO=~/.cargo/bin/quillo-0.8.1 node --test ...   (another, such as the live one)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const QUILLO = process.env.QUILLO ?? "quillo";
const ROOT = new URL("../../", import.meta.url);
const EXAMPLES = new URL("../examples/", import.meta.url);

// play.qwe's prefix, taken from play_pageless itself, so this test and the page agree.
const PAGE = readFileSync(new URL("play.qwe", ROOT), "utf8");
const PREFIX = PAGE.match(/fn play_pageless\(lines: list\) -> bool = any\(lines, \(l\) => starts_with\(l, "([^"]+)"\)\)/)?.[1];
const pageless = (lines) => lines.some((l) => l.startsWith(PREFIX));

// Runs `files` in a folder of their own until quillo says it is watching (or 15 s), then
// stops it; gives every line it wrote, stdout and stderr in one list.
async function run(files) {
  const dir = mkdtempSync(join(tmpdir(), "play-ex-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const child = spawn(QUILLO, ["run", "--watch", "--listen", "unix:app.sock", "--trust-proxy", "127.0.0.1", "main.qwe"], {
    cwd: dir,
    env: { ...process.env, QUILLO_JIT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  try {
    await new Promise((ok, no) => {
      const deadline = setTimeout(() => no(new Error(`no "watching for changes" in 15 s:\n${out}`)), 15000);
      const seen = (d) => {
        out += d;
        if (/watching for changes/.test(out)) { clearTimeout(deadline); ok(); }
      };
      child.stdout.on("data", seen);
      child.stderr.on("data", seen);
      child.on("exit", (code) => { clearTimeout(deadline); no(new Error(`quillo stopped (${code}):\n${out}`)); });
      child.on("error", (e) => { clearTimeout(deadline); no(e); });
    });
    // what is printed after "watching" (nothing, today) has a moment to come
    await new Promise((ok) => setTimeout(ok, 200));
  } finally {
    child.removeAllListeners("exit");
    const gone = new Promise((ok) => child.once("exit", ok));
    child.kill("SIGTERM");
    const hard = setTimeout(() => child.kill("SIGKILL"), 3000);
    await gone;
    clearTimeout(hard);
    rmSync(dir, { recursive: true, force: true });
  }
  return out.split("\n").map((l) => l.trimEnd()).filter((l) => l !== "");
}

const example = (slug) => ({ "main.qwe": readFileSync(new URL(`${slug}/main.qwe`, EXAMPLES), "utf8") });

test("play.qwe's play_pageless has the prefix this test reads", () => {
  assert.equal(PREFIX, "quillo: 0 routes listening on ");
});

test("the Empty example prints, and has no pages", async () => {
  const lines = await run(example("empty"));
  assert.ok(lines.includes("Hello, Quillo!"), lines.join("\n"));
  assert.ok(pageless(lines), lines.join("\n"));
  assert.ok(!lines.some((l) => / error: /.test(l)), lines.join("\n"));
});

test("the examples with pages are not taken for programs without", async () => {
  for (const slug of readdirSync(EXAMPLES).filter((s) => s !== "empty")) {
    const lines = await run(example(slug));
    assert.ok(lines.some((l) => /^quillo: \d+ routes? listening on unix:/.test(l)), `${slug}:\n${lines.join("\n")}`);
    assert.ok(!pageless(lines), `${slug}:\n${lines.join("\n")}`);
  }
});

test("one route, and ten (which ends in a 0), are pages", async () => {
  const one = await run({ "main.qwe": 'route GET / = "hi"\n' });
  assert.ok(one.some((l) => l.startsWith("quillo: 1 route listening on ")), one.join("\n"));
  assert.ok(!pageless(one), one.join("\n"));
  const routes = Array.from({ length: 10 }, (_, i) => `route GET /p${i} = "${i}"`).join("\n");
  const ten = await run({ "main.qwe": routes + "\n" });
  assert.ok(ten.some((l) => l.startsWith("quillo: 10 routes listening on ")), ten.join("\n"));
  assert.ok(!pageless(ten), ten.join("\n"));
});

test("a program that fails as it loads is not taken for one with no pages: it waits for a fix", async () => {
  const lines = await run({ "main.qwe": 'print("a")\nlet x = nope\n' });
  assert.ok(lines.some((l) => /main\.qwe:2: .*error/.test(l)), lines.join("\n"));
  assert.ok(!pageless(lines), lines.join("\n"));
});

test("a program of no routes that prints a lot still says it, after what it printed", async () => {
  const lines = await run({ "main.qwe": 'for i in 0..500 { print(`line ${i}`) }\n' });
  const said = lines.findIndex((l) => l.startsWith(PREFIX));
  assert.ok(said > lines.indexOf("line 499") && lines.indexOf("line 499") >= 0, lines.join("\n"));
});

test("every example's folder holds a main.qwe", () => {
  for (const slug of readdirSync(EXAMPLES)) assert.ok(example(slug)["main.qwe"].length > 0, slug);
  assert.ok(PAGE.includes('play_example("empty", "Empty", '), "the Empty example is in PLAY_EXAMPLES");
});
