// The playground's server side (play.qwe), through HTTP as the page calls it, against a site
// started on this machine with a throwaway database and the dev sign-in:
//
//   SITE_DB=/tmp/x/site.db SITE_DEV_LOGIN=1 quillo run main.qwe --port 4390 [--allow-path ...]
//   PLAY_SITE=http://localhost:4390 PLAY_DB=/tmp/x/site.db node --test play/test/site.test.mjs
//
// PLAY_DB is the same database file, for the cases another account's programs need (put in
// with sqlite3, as the dev sign-in is one account). Without PLAY_SITE the tests are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const SITE = process.env.PLAY_SITE;
const DB = process.env.PLAY_DB;
const skip = SITE ? false : "PLAY_SITE is not set";

let cookie = "";
async function signIn() {
  if (cookie) return;
  const r = await fetch(`${SITE}/auth/github?next=/play/`, { redirect: "manual" });
  const set = r.headers.getSetCookie().map((c) => c.split(";")[0]);
  assert.ok(set.length > 0, "the dev sign-in gave no cookie: start the site with SITE_DEV_LOGIN=1");
  cookie = set.join("; ");
}
async function call(name, args, signedIn = true) {
  if (signedIn) await signIn();
  const r = await fetch(`${SITE}/_quillo/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signedIn ? { cookie } : {}) },
    body: JSON.stringify(args),
  });
  const body = await r.json();
  assert.equal(r.status, 200, `${name}: ${JSON.stringify(body)}`);
  return body.ok;
}
const save = (id, title, files) => call("play_save", [id, title, files]);
const sql = (q) => execFileSync("sqlite3", [DB, q], { encoding: "utf8" }).trim();

test("saving needs a sign-in", { skip }, async () => {
  const r = await call("play_save", ["", "t", { "main.qwe": "print(1)" }], false);
  assert.equal(r.signin, true);
  assert.match(r.error, /sign in/);
  assert.deepEqual(await call("play_mine", [], false), []);
});

test("files the runner would refuse are refused when saving", { skip }, async () => {
  const bad = {
    "no main.qwe": { "lib/x.qwe": "1" },
    "a parent folder": { "main.qwe": "1", "../x.qwe": "1" },
    "a hidden folder": { "main.qwe": "1", ".quillo/x.qwe": "1" },
    "a dot part": { "main.qwe": "1", "lib/.x": "1" },
    "an absolute path": { "main.qwe": "1", "/etc/x.qwe": "1" },
    "an empty part": { "main.qwe": "1", "lib//x.qwe": "1" },
    "five parts": { "main.qwe": "1", "a/b/c/d/e.qwe": "1" },
    "a space": { "main.qwe": "1", "my file.qwe": "1" },
    "a backslash": { "main.qwe": "1", "lib\\x.qwe": "1" },
    "a NUL in text": { "main.qwe": "a\u0000b" },
    "not text": { "main.qwe": 5 },
    "31 files": Object.fromEntries([["main.qwe", "1"], ...Array.from({ length: 30 }, (_, i) => [`f${i}.qwe`, "1"])]),
    "over 256 KB": { "main.qwe": "x".repeat(256 * 1024 + 1) },
  };
  for (const [why, files] of Object.entries(bad)) {
    const r = await save("", why, files);
    assert.ok(r.error, `${why}: saved as ${JSON.stringify(r)}`);
    assert.equal(r.id, undefined, why);
  }
});

test("what is allowed at the edges is saved", { skip }, async () => {
  const ok = {
    "four parts": { "main.qwe": "1", "a/b/c/d.qwe": "1" },
    "30 files": Object.fromEntries([["main.qwe", "1"], ...Array.from({ length: 29 }, (_, i) => [`f${i}.qwe`, "1"])]),
    "names with _ - and dots inside": { "main.qwe": "1", "lib/my_file-2.v1.qwe": "1" },
  };
  for (const [why, files] of Object.entries(ok)) {
    const r = await save("", why, files);
    assert.ok(r.id, `${why}: ${JSON.stringify(r)}`);
    assert.equal(r.created, true);
    await call("play_delete", [r.id]);
  }
});

test("save, save again over it, list, open its page, delete", { skip }, async () => {
  const a = await save("", "  First  ", { "main.qwe": 'route GET / = "one"', "lib/gone_marker.qwe": "let gone_marker_7 = 1" });
  assert.match(a.id, /^[A-Za-z0-9_-]{12}$/);
  const b = await save(a.id, "First, again", { "main.qwe": 'route GET / = "kept_marker_9"' });
  assert.deepEqual(b, { id: a.id, created: false });
  const mine = await call("play_mine", []);
  assert.equal(mine[0].id, a.id);
  assert.equal(mine[0].title, "First, again");
  const page = await fetch(`${SITE}/play/${a.id}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("First, again · Playground"));
  assert.ok(html.includes("kept_marker_9"), "the saved code is on the page");
  assert.ok(!html.includes("gone_marker"), "a file removed by the second save is gone");
  assert.equal(await call("play_delete", [a.id]), true);
  assert.equal(await call("play_delete", [a.id]), false);
  assert.notEqual((await fetch(`${SITE}/play/${a.id}/`)).status, 200);
});

test("an empty title is Untitled; a long one is cut at 80", { skip }, async () => {
  const a = await save("", "   ", { "main.qwe": "1" });
  const b = await save("", "t".repeat(200), { "main.qwe": "1" });
  const mine = await call("play_mine", []);
  assert.equal(mine.find((p) => p.id === a.id).title, "Untitled");
  assert.equal(mine.find((p) => p.id === b.id).title.length, 80);
  await call("play_delete", [a.id]);
  await call("play_delete", [b.id]);
});

test("a title is shown as text on its page, not as markup", { skip }, async () => {
  const a = await save("", `<script>alert(1)</script>"><img src=x onerror=alert(2)>`, { "main.qwe": "</script><script>alert(3)</script>" });
  const html = await (await fetch(`${SITE}/play/${a.id}/`)).text();
  assert.ok(!html.includes("<script>alert(1)"), "title");
  assert.ok(!html.includes("<img src=x onerror"), "title in an attribute");
  assert.ok(!html.includes("</script><script>alert(3)"), "code");
  await call("play_delete", [a.id]);
});

test("another account's program is copied, not changed, and cannot be deleted", { skip: skip || (DB ? false : "PLAY_DB is not set") }, async () => {
  sql("insert or ignore into users (id, github_id, login, name, created) values (999, 999, 'other', 'Other', 0)");
  sql("delete from play_projects where id = 'theirs123456'");
  sql(`insert into play_projects (id, user_id, title, files, created, updated) values ('theirs123456', 999, 'Theirs', '{"main.qwe":"1"}', 0, 0)`);
  const r = await save("theirs123456", "Mine now", { "main.qwe": "2" });
  assert.equal(r.created, true);
  assert.notEqual(r.id, "theirs123456");
  assert.equal(sql("select title || ':' || files from play_projects where id = 'theirs123456'"), 'Theirs:{"main.qwe":"1"}');
  assert.equal(sql(`select forked_from from play_projects where id = '${r.id}'`), "theirs123456");
  assert.equal(await call("play_delete", ["theirs123456"]), false);
  assert.equal(sql("select count(*) from play_projects where id = 'theirs123456'"), "1");
  assert.ok(!(await call("play_mine", [])).some((p) => p.id === "theirs123456"), "it is not in my list");
  await call("play_delete", [r.id]);
  sql("delete from play_projects where id = 'theirs123456'");
});

test("a copy of a program that is not there notes nothing it came from", { skip: skip || (DB ? false : "PLAY_DB is not set") }, async () => {
  const r = await save("nonexistent1", "x", { "main.qwe": "1" });
  assert.equal(r.created, true);
  assert.equal(sql(`select ifnull(forked_from, 'null') from play_projects where id = '${r.id}'`), "null");
  await call("play_delete", [r.id]);
});

test("at most 50 saved programs; saving over one still works at 50", { skip }, async () => {
  for (const p of await call("play_mine", [])) await call("play_delete", [p.id]);
  const ids = [];
  for (let i = 0; i < 50; i++) ids.push((await save("", `p${i}`, { "main.qwe": `${i}` })).id);
  assert.ok(ids.every(Boolean));
  const over = await save("", "one too many", { "main.qwe": "x" });
  assert.match(over.error, /50/);
  const again = await save(ids[0], "still fine", { "main.qwe": "y" });
  assert.deepEqual(again, { id: ids[0], created: false });
  for (const id of ids) await call("play_delete", [id]);
  assert.deepEqual(await call("play_mine", []), []);
});

test("an address that is no program's is not found, and odd ids are not looked up", { skip }, async () => {
  for (const id of ["nope12345678", "a'b", "x".repeat(40), "%00"]) {
    assert.notEqual((await fetch(`${SITE}/play/${id}/`)).status, 200, id);
  }
});

test("with no runner, running says so; a made-up session is gone", { skip }, async () => {
  const r = await call("play_run", [{ "main.qwe": 'route GET / = "hi"' }], false);
  if (r.error) assert.match(r.error, /off|not answering/);
  const bad = await call("play_run", [{ "lib/x.qwe": "1" }], false);
  assert.match(bad.error, /main\.qwe/);
  const log = await call("play_log", ["not-a-session", 0], false);
  assert.equal(log.gone, true);
  assert.equal(await call("play_stop", ["../../etc"], false), null);
});

test("the editor bundle is served as JavaScript", { skip }, async () => {
  const r = await fetch(`${SITE}/play/editor.mjs`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /javascript/);
  assert.ok((await r.text()).includes("createEditor"));
});
