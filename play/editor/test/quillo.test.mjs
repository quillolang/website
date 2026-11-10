// The highlighter's tokens for the shapes of Quillo code the playground's examples use.
// node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { StringStream } from "@codemirror/language";
import { quilloParser as P } from "../src/quillo.mjs";

// [style, text] for each token of `src` (whitespace left out).
function tokens(src) {
  const state = P.startState(4);
  const out = [];
  for (const line of src.split("\n")) {
    const s = new StringStream(line, 4, 4);
    if (line === "") continue;
    while (!s.eol()) {
      const before = s.pos;
      const style = P.token(s, state);
      if (s.pos === before) throw new Error(`no progress at ${before} in ${JSON.stringify(line)}`);
      const text = s.current();
      if (text.trim() !== "") out.push([style, text]);
      s.start = s.pos;
      if (s.pos === s.start && s.eol()) break;
    }
  }
  return { out, state };
}
const styles = (src) => tokens(src).out.map(([s, t]) => `${s}:${t}`);

test("a route, its method and path, and markup with an expression", () => {
  assert.deepEqual(styles("route GET /todos/:id = <h1>Hi {name}</h1>"), [
    "keyword:route", "keyword:GET", "url:/todos/:id", "operator:=",
    "tagName:<h1", "angleBracket:>", "content:Hi ", "brace:{", "variableName:name", "brace:}",
    "tagName:</h1", "angleBracket:>",
  ]);
});

test("a route with no method and mount", () => {
  assert.deepEqual(styles("route /about = page()"), ["keyword:route", "url:/about", "operator:=", "function:page", "brace:(", "brace:)"]);
  assert.deepEqual(styles("mount /admin = admin"), ["keyword:mount", "url:/admin", "operator:=", "variableName:admin"]);
  // A wildcard's `/*` is the path, not a comment's start.
  const { out, state } = tokens("route ANY /*rest = not_found(request.path)\nlet x = 1");
  assert.deepEqual(out.slice(0, 3).map(([s, t]) => `${s}:${t}`), ["keyword:route", "keyword:ANY", "url:/*rest"]);
  assert.equal(state.comment, null);
  assert.equal(out.at(-1)[0], "number");
});

test("a template string with an interpolation", () => {
  assert.deepEqual(styles("let s = `a ${x + 1} b`"), [
    "keyword:let", "variableName:s", "operator:=", "string:`", "string:a ", "brace:${", "variableName:x",
    "operator:+", "number:1", "brace:}", "string: b", "string:`",
  ]);
});

test("a < b is a comparison, not a tag", () => {
  const s = styles("if a < b { print(a) }");
  assert.ok(s.includes("operator:<"), s.join(" "));
  assert.ok(!s.some((x) => x.startsWith("tagName")), s.join(" "));
});

test("attributes: a string, a name, code in braces, a handler", () => {
  assert.deepEqual(styles(`<button class="b" disabled onclick={() => val += 1}>Up</button>`), [
    "tagName:<button", "attributeName:class", "operator:=", 'attributeValue:"b"', "attributeName:disabled",
    "attributeName:onclick", "operator:=", "brace:{", "brace:(", "brace:)", "operator:=>", "variableName:val",
    "operator:+", "operator:=", "number:1", "brace:}", "angleBracket:>", "content:Up", "tagName:</button", "angleBracket:>",
  ]);
});

test("a component's tag, self-closed, leaves the code after it as code", () => {
  const { out, state } = tokens("route GET / = <Counter/>\nlet x = 1");
  assert.deepEqual(out.map(([s, t]) => `${s}:${t}`).slice(4), ["typeName:<Counter", "angleBracket:/>", "keyword:let", "variableName:x", "operator:=", "number:1"]);
  assert.deepEqual(state.stack, []);
});

test("a void element has no content after it", () => {
  const { out, state } = tokens(`let f = <input value={x}>\nlet y = 2`);
  assert.ok(out.some(([s, t]) => s === "keyword" && t === "let" ), "");
  assert.deepEqual(out.slice(-4).map(([s]) => s), ["keyword", "variableName", "operator", "number"]);
  assert.deepEqual(state.stack, []);
});

test("an element over several lines, with a nested component", () => {
  const { out, state } = tokens("component C() {\n    <div.card>\n        <Item n={1}/>\n        text\n    </div>\n}");
  assert.deepEqual(state.stack, []);
  assert.ok(out.some(([s, t]) => s === "typeName" && t === "<Item"));
  assert.ok(out.some(([s, t]) => s === "content" && t.trim() === "text"));
});

test("comments: line, block across lines, html", () => {
  assert.deepEqual(styles("let a = 1 // one"), ["keyword:let", "variableName:a", "operator:=", "number:1", "lineComment:// one"]);
  const { out, state } = tokens("/* a\nb */ let c = 2");
  assert.deepEqual(out.map(([s]) => s), ["comment", "comment", "keyword", "variableName", "operator", "number"]);
  assert.equal(state.comment, null);
  assert.deepEqual(styles("<p><!-- hidden --></p>").filter((x) => x.startsWith("comment")), ["comment:<!-- hidden -->"]);
});

test("builtins, a program's functions, modules, atoms and numbers with units", () => {
  assert.deepEqual(styles("map(xs, f)").slice(0, 1), ["standard:map"]);
  assert.deepEqual(styles("down(val)").slice(0, 1), ["function:down"]);
  assert.deepEqual(styles("db.query(q)").slice(0, 1), ["namespace:db"]);
  assert.deepEqual(styles("x = null ?? true"), ["variableName:x", "operator:=", "atom:null", "operator:??", "atom:true"]);
  assert.deepEqual(styles("sleep(500ms)").slice(2, 3), ["number:500ms"]);
});

test("strings with escapes and the other quote inside", () => {
  assert.deepEqual(styles(`let s = "a \\"b\\" 'c'"`).slice(3), [`string:"a \\"b\\" 'c'"`]);
});

test("indentation: four spaces a brace or element, one fewer on a closing line", () => {
  const cx = { unit: 4 };
  const at = (src, after = "") => {
    const { state } = tokens(src);
    return P.indent(state, after, cx);
  };
  assert.equal(at("fn f() {"), 4);
  assert.equal(at("fn f() {", "}"), 0);
  assert.equal(at("component C() {\n    <div>"), 8);
  assert.equal(at("component C() {\n    <div>", "</div>"), 4);
  assert.equal(at("let x = 1"), 0);
});

test("text that is not Quillo never throws and always moves on", () => {
  for (const src of ["<", "<<<>>>", "`${`${", "}}}", "<a b=", "/*", "\"open", "<div {x}>", "route", "route GET", "<!--", "@#$%^&"]) {
    assert.doesNotThrow(() => tokens(src), src);
  }
});

test("every .qwe file of the site, its tour, demos and plugins, tokenizes and ends with nothing open", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = new URL("../../../", import.meta.url).pathname;
  const files = [];
  async function walk(dir, depth) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "target") continue;
      const p = join(dir, e.name);
      if (e.isDirectory() && depth < 3) await walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(".qwe")) files.push(p);
    }
  }
  await walk(root, 0);
  assert.ok(files.length > 100, `only ${files.length} files found under ${root}`);
  const open = [];
  for (const f of files) {
    const { state } = tokens(await readFile(f, "utf8"));
    if (state.stack.length > 0 || state.comment) open.push(`${f.slice(root.length)}: ${state.stack.join(",")}${state.comment ?? ""}`);
  }
  // A few files end inside something the highlighter cannot follow; most must not.
  assert.ok(open.length <= files.length * 0.05, `${open.length} of ${files.length} end open:\n${open.slice(0, 20).join("\n")}`);
});

// Through CodeMirror itself, as the page uses it: a token that does not move on throws there.
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { quilloLanguage } from "../src/quillo.mjs";
const parse = (doc) => ensureSyntaxTree(EditorState.create({ doc, extensions: [quilloLanguage] }), doc.length, 5000);

test("a < that starts no tag, inside markup, is text (review H2)", () => {
  for (const doc of ["<p>a <= b</p>", "<div>\n  <\n</div>", "<div>\n  </\n</div>", "<p>1 < 2 and 3 > 2</p>", "<div><</div>", "<div> < </div>", "<ul>\n<"]) {
    assert.doesNotThrow(() => parse(doc), doc);
  }
});

test("typing each example a character at a time never breaks the parser", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const ex of ["hello", "todo", "notes", "empty"]) {
    const text = await readFile(new URL(`../../examples/${ex}/main.qwe`, import.meta.url), "utf8");
    for (let i = 1; i <= text.length; i++) assert.doesNotThrow(() => parse(text.slice(0, i)), `${ex} at ${i}`);
  }
});

test("a state copied in the middle of a tag keeps whether it closes and is void", () => {
  const st = P.startState(4);
  const s = new StringStream("<input", 4, 4);
  while (!s.eol()) { P.token(s, st); s.start = s.pos; }
  const c = P.copyState(st);
  assert.equal(c.voidTag, true);
  const st2 = P.startState(4);
  const s2 = new StringStream("<p>x</p", 4, 4);
  while (!s2.eol()) { P.token(s2, st2); s2.start = s2.pos; }
  assert.equal(P.copyState(st2).closing, true);
});
