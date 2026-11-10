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
// One save a second for an account (play.qwe): a save refused for that is tried once more,
// a second later; the test "one save a second" checks the refusal itself.
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function save(id, title, files) {
  const r = await call("play_save", [id, title, files]);
  if (r && r.error && /a moment ago/.test(r.error)) {
    await sleep(1100);
    return call("play_save", [id, title, files]);
  }
  return r;
}
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
    "four parts (the runner takes three)": { "main.qwe": "1", "a/b/c/d.qwe": "1" },
    "a name over 200 characters": { "main.qwe": "1", ["a".repeat(201)]: "1" },
    "app.sock at the top": { "main.qwe": "1", "app.sock": "1" },
    "two names but for capitals": { "main.qwe": "1", "lib/x.qwe": "1", "LIB/x.qwe": "1" },
    "a file that is also a folder": { "main.qwe": "1", "lib": "1", "lib/x.qwe": "1" },
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
    "three parts": { "main.qwe": "1", "a/b/c.qwe": "1" },
    "a name of 200 characters": { "main.qwe": "1", ["a".repeat(200)]: "1" },
    "app.sock in a folder": { "main.qwe": "1", "lib/app.sock": "1" },
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
  assert.deepEqual({ id: b.id, created: b.created }, { id: a.id, created: false }); // and `updated` (second review, item 1)
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

test("at most 50 saved programs; saving over one still works at 50", { skip: skip || (DB ? false : "PLAY_DB is not set") }, async () => {
  for (const p of await call("play_mine", [])) await call("play_delete", [p.id]);
  // 49 put in directly (saves are one a second), the 50th saved
  const me = sql("select id from users where login = 'dev'");
  const ids = [];
  for (let i = 0; i < 49; i++) {
    const id = `cap${String(i).padStart(9, "0")}`;
    sql(`insert into play_projects (id, user_id, title, files, created, updated) values ('${id}', ${me}, 'p${i}', '{"main.qwe":"${i}"}', 0, 0)`);
    ids.push(id);
  }
  ids.push((await save("", "p49", { "main.qwe": "49" })).id);
  assert.ok(ids.every(Boolean));
  await sleep(1100);
  const over = await save("", "one too many", { "main.qwe": "x" });
  assert.match(over.error, /50/);
  const again = await save(ids[0], "still fine", { "main.qwe": "y" });
  assert.deepEqual({ id: again.id, created: again.created }, { id: ids[0], created: false });
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

test("one save a second for an account: a second save at once is refused, then works", { skip }, async () => {
  const a = await save("", "gap", { "main.qwe": "1" });
  const quick = await call("play_save", [a.id, "gap 2", { "main.qwe": "2" }]);
  assert.match(quick.error, /a moment ago/);
  await sleep(1100);
  const later = await call("play_save", [a.id, "gap 2", { "main.qwe": "2" }]);
  assert.deepEqual({ id: later.id, created: later.created }, { id: a.id, created: false });
  await call("play_delete", [a.id]);
});

test("bytes, not characters: a program of 4-byte characters over 320 KB is refused", { skip }, async () => {
  const r = await save("", "emoji", { "main.qwe": "😀".repeat(90 * 1024) });
  assert.match(r.error, /256 KB/);
});

test("8 MB in all for an account", { skip: skip || (DB ? false : "PLAY_DB is not set") }, async () => {
  for (const p of await call("play_mine", [])) await call("play_delete", [p.id]);
  const me = sql("select id from users where login = 'dev'");
  // 27 programs of 310,018 bytes put in directly (8.37 MB); 200 KB more passes 8 MiB
  sql(`insert into play_projects (id, user_id, title, files, created, updated) select 'big' || value, ${me}, 'big', '{"main.qwe":"' || hex(zeroblob(155000)) || '"}', 0, 0 from generate_series(1, 27)`);
  await sleep(1100);
  try {
    const r = await save("", "one more", { "main.qwe": "x".repeat(200 * 1024) });
    assert.match(r.error ?? JSON.stringify(r), /8 MB/);
  } finally {
    sql(`delete from play_projects where user_id = ${me}`);
  }
});

test("a banned account's programs are not found", { skip: skip || (DB ? false : "PLAY_DB is not set") }, async () => {
  sql("insert or ignore into users (id, github_id, login, name, created, banned) values (998, 998, 'banned1', 'B', 0, 1)");
  sql(`insert or replace into play_projects (id, user_id, title, files, created, updated) values ('bannedprog01', 998, 'B', '{"main.qwe":"1"}', 0, 0)`);
  assert.notEqual((await fetch(`${SITE}/play/bannedprog01/`)).status, 200);
  sql("delete from play_projects where id = 'bannedprog01'");
});

test("a program's page names its author's login, not the account's number", { skip: skip || (DB ? false : "PLAY_DB is not set") }, async () => {
  sql("insert or ignore into users (id, github_id, login, name, created) values (999, 999, 'other', 'Other', 0)");
  sql(`insert or replace into play_projects (id, user_id, title, files, created, updated) values ('authorpage01', 999, 'T', '{"main.qwe":"1"}', 0, 0)`);
  const html = await (await fetch(`${SITE}/play/authorpage01/`)).text();
  assert.ok(html.includes("other"), "the login");
  assert.ok(!/owner_id/.test(html), "no owner id");
  sql("delete from play_projects where id = 'authorpage01'");
});

test("a save answers the time it stored, which the page's draft is checked against", { skip: skip || (DB ? false : "PLAY_DB is not set") }, async () => {
  const a = await save("", "stamp", { "main.qwe": "1" });
  assert.equal(typeof a.updated, "number");
  assert.equal(sql(`select updated from play_projects where id = '${a.id}'`), String(a.updated));
  await sleep(1100);
  const b = await save(a.id, "stamp 2", { "main.qwe": "2" });
  assert.ok(b.updated > a.updated);
  assert.equal(sql(`select updated from play_projects where id = '${a.id}'`), String(b.updated));
  await call("play_delete", [a.id]);
});

test("one save a second for the account, across its programs too", { skip }, async () => {
  const a = await save("", "first", { "main.qwe": "1" });
  await sleep(1100);
  const b = await save("", "second", { "main.qwe": "2" });
  const quick = await call("play_save", [a.id, "first again", { "main.qwe": "3" }]);
  assert.match(quick.error, /a moment ago/);
  await call("play_delete", [a.id]);
  await call("play_delete", [b.id]);
});

test("code over 256 KB in UTF-8 bytes is refused to run and to save, as the runner counts", { skip }, async () => {
  const files = { "main.qwe": "😀".repeat(70 * 1024) }; // 70 K characters, 280 KB
  const run = await call("play_run", [files], false);
  assert.match(run.error, /256 KB/);
  const saved = await save("", "emoji", files);
  assert.match(saved.error, /256 KB/);
  const fits = { "main.qwe": "😀".repeat(60 * 1024) }; // 240 KB
  const ok = await save("", "fits", fits);
  assert.ok(ok.id, JSON.stringify(ok));
  await call("play_delete", [ok.id]);
});
