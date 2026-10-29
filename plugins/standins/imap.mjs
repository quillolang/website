// An IMAP4rev1 server for imap.qwe, after RFC 3501, with IDLE (RFC 2177), MOVE (RFC 6851), UIDPLUS
// (RFC 4315) and special-use folders (RFC 6154), over TLS from the start (imaps, the test
// certificate of proto_tls.mjs). It takes CAPABILITY, LOGIN (quoted strings and literals), LIST,
// STATUS, SELECT, EXAMINE, SEARCH, FETCH, STORE, COPY, MOVE, EXPUNGE (each also with UID), APPEND
// (a synchronizing literal), IDLE, NOOP, CLOSE and LOGOUT, over folders in memory. A session that
// starts IDLE on INBOX gets a new message a moment later, as a real inbox would.
import { createServer } from "node:tls";
import { messages } from "./proto_mailbox.mjs";
import { ca, cert, key } from "./proto_tls.mjs";

const USER = "support@quillo.test", PASS = 'p@ss "word"';
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const day = (s) => { const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s); return m ? Date.UTC(Number(m[3]), MONTHS.indexOf(m[2].toLowerCase()), Number(m[1])) : NaN; };
const quote = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const header = (text, name) => { const m = new RegExp(`^${name}:([^\\r\\n]*(?:\\r\\n[ \\t][^\\r\\n]*)*)`, "im").exec(text.split("\r\n\r\n")[0]); return m ? m[1].trim() : ""; };

// Tokens of a command after its tag: atoms, quoted strings, literals and lists.
function tokenize(parts) {
    const stack = [[]];
    for (const p of parts) {
        if (typeof p !== "string") { stack.at(-1).push({ str: p.toString("utf8") }); continue; }
        let i = 0;
        while (i < p.length) {
            const c = p[i];
            if (c === " ") i++;
            else if (c === "(") { stack.push([]); i++; }
            else if (c === ")") { const l = stack.pop(); stack.at(-1).push(l); i++; }
            else if (c === '"') { let s = ""; i++; while (i < p.length && p[i] !== '"') { if (p[i] === "\\") i++; s += p[i++]; } i++; stack.at(-1).push({ str: s }); }
            else { let j = i, depth = 0; while (j < p.length && (depth > 0 || !" ()".includes(p[j]))) { if (p[j] === "[") depth++; if (p[j] === "]") depth--; j++; } stack.at(-1).push(p.slice(i, j)); i = j; }
        }
    }
    while (stack.length > 1) { const l = stack.pop(); stack.at(-1).push(l); }
    return stack[0];
}
const txt = (t) => (typeof t === "string" ? t : t?.str ?? "");

export async function start({ port }) {
    const folders = new Map([["INBOX", { msgs: messages(), next: 104, special: null }], ["Sent", { msgs: [], next: 1, special: "\\Sent" }], ["Archive", { msgs: [], next: 1, special: "\\Archive" }], ["Trash", { msgs: [], next: 1, special: "\\Trash" }], ["Envoy&AOk-s", { msgs: [], next: 1, special: null }]]);
    const idlers = new Set();
    const log = { logins: 0, fetches: 0, stores: 0, moves: 0, appends: 0, idles: 0, delivered: false, badLogins: 0 };

    const announce = (name) => { for (const s of idlers) if (s.folder === name) s.write(`* ${folders.get(name).msgs.length} EXISTS\r\n`); };
    const add = (name, text, flags, date) => { const f = folders.get(name); const uid = f.next++; f.msgs.push({ uid, flags: [...flags], text, date: date ?? "30-Oct-2026 10:00:00 +0000" }); announce(name); return uid; };

    const server = createServer({ key, cert }, (sock) => {
        let buf = Buffer.alloc(0), parts = [], authed = false, folder = null, readOnly = false, idleTag = null, waitingLit = false;
        sock.folder = null;
        const w = (s) => sock.write(s + "\r\n");
        sock.on("error", () => {});
        sock.on("close", () => idlers.delete(sock));
        w("* OK [CAPABILITY IMAP4rev1 IDLE MOVE UIDPLUS SPECIAL-USE] IMAP stand-in ready");

        const msgs = () => folders.get(folder)?.msgs ?? [];
        const setOf = (spec, byUid) => {
            const list = msgs(); const max = byUid ? Math.max(0, ...list.map((m) => m.uid)) : list.length;
            const want = new Set();
            for (const r of spec.split(",")) {
                let [a, b] = r.split(":"); a = a === "*" ? max : Number(a); b = b == null ? a : b === "*" ? max : Number(b);
                const [lo, hi] = a <= b ? [a, b] : [b, a];
                list.forEach((m, i) => { const k = byUid ? m.uid : i + 1; if (k >= lo && k <= hi) want.add(m); });
                // RFC 3501: n:* matches the last message even when n is above it.
                if (byUid && r.endsWith(":*") && list.length && Number(r.split(":")[0]) > max) want.add(list.at(-1));
            }
            return list.filter((m) => want.has(m));
        };
        const fetchLine = (m, items, byUid) => {
            const seq = msgs().indexOf(m) + 1;
            const out = [];
            let names = items.map((x) => txt(x).toUpperCase());
            if (names.length === 1 && names[0] === "FAST") names = ["FLAGS", "INTERNALDATE", "RFC822.SIZE"];
            if (byUid && !names.includes("UID")) names.unshift("UID");
            const [head, ...rest] = m.text.split("\r\n\r\n");
            for (const n of names) {
                if (n === "UID") out.push(`UID ${m.uid}`);
                else if (n === "FLAGS") out.push(`FLAGS (${m.flags.join(" ")})`);
                else if (n === "RFC822.SIZE") out.push(`RFC822.SIZE ${Buffer.byteLength(m.text)}`);
                else if (n === "INTERNALDATE") out.push(`INTERNALDATE ${quote(m.date)}`);
                else if (/^(BODY(\.PEEK)?\[(HEADER|TEXT)?\]|RFC822(\.HEADER)?)$/.test(n)) {
                    const which = /HEADER/.test(n) ? head + "\r\n\r\n" : /TEXT/.test(n) ? rest.join("\r\n\r\n") : m.text;
                    if (!n.includes("PEEK") && !n.includes("HEADER") && !readOnly && !m.flags.includes("\\Seen")) { m.flags.push("\\Seen"); out.push(`FLAGS (${m.flags.join(" ")})`); }
                    out.push({ name: n.replace(".PEEK", ""), data: Buffer.from(which, "utf8") });
                } else return null;
            }
            const bufs = [Buffer.from(`* ${seq} FETCH (`)];
            out.forEach((o, i) => {
                if (i) bufs.push(Buffer.from(" "));
                if (typeof o === "string") bufs.push(Buffer.from(o));
                else bufs.push(Buffer.from(`${o.name} {${o.data.length}}\r\n`), o.data);
            });
            bufs.push(Buffer.from(")\r\n"));
            return Buffer.concat(bufs);
        };
        // One search key at tokens[i]: [predicate, next index].
        const key1 = (t, i, byUid) => {
            const k = txt(t[i]).toUpperCase();
            const flag = (f, has) => [(m) => m.flags.includes(f) === has, i + 1];
            const hdr = (h) => [(m) => header(m.text, h).toLowerCase().includes(txt(t[i + 1]).toLowerCase()), i + 2];
            if (Array.isArray(t[i])) { const p = all(t[i], 0, byUid); return [p, i + 1]; }
            switch (k) {
                case "ALL": return [() => true, i + 1];
                case "SEEN": return flag("\\Seen", true); case "UNSEEN": return flag("\\Seen", false);
                case "FLAGGED": return flag("\\Flagged", true); case "UNFLAGGED": return flag("\\Flagged", false);
                case "ANSWERED": return flag("\\Answered", true); case "UNANSWERED": return flag("\\Answered", false);
                case "DELETED": return flag("\\Deleted", true); case "UNDELETED": return flag("\\Deleted", false);
                case "DRAFT": return flag("\\Draft", true); case "NEW": case "RECENT": return [() => false, i + 1];
                case "SINCE": { const d = day(txt(t[i + 1])); return [(m) => day(m.date) >= d, i + 2]; }
                case "BEFORE": { const d = day(txt(t[i + 1])); return [(m) => day(m.date) < d, i + 2]; }
                case "ON": { const d = day(txt(t[i + 1])); return [(m) => day(m.date) === d, i + 2]; }
                case "FROM": return hdr("From"); case "TO": return hdr("To"); case "CC": return hdr("Cc"); case "SUBJECT": return hdr("Subject");
                case "HEADER": { const h = txt(t[i + 1]); const v = txt(t[i + 2]).toLowerCase(); return [(m) => header(m.text, h).toLowerCase().includes(v), i + 3]; }
                case "BODY": case "TEXT": { const v = txt(t[i + 1]).toLowerCase(); return [(m) => (k === "TEXT" ? m.text : m.text.split("\r\n\r\n").slice(1).join("\r\n\r\n")).toLowerCase().includes(v), i + 2]; }
                case "LARGER": { const n = Number(txt(t[i + 1])); return [(m) => Buffer.byteLength(m.text) > n, i + 2]; }
                case "SMALLER": { const n = Number(txt(t[i + 1])); return [(m) => Buffer.byteLength(m.text) < n, i + 2]; }
                case "UID": { const s = new Set(setOf(txt(t[i + 1]), true)); return [(m) => s.has(m), i + 2]; }
                case "KEYWORD": { const f = txt(t[i + 1]); return [(m) => m.flags.includes(f), i + 2]; }
                case "NOT": { const [p, j] = key1(t, i + 1, byUid); return [(m) => !p(m), j]; }
                case "OR": { const [a, j] = key1(t, i + 1, byUid); const [b, j2] = key1(t, j, byUid); return [(m) => a(m) || b(m), j2]; }
                default:
                    if (/^[\d:*,]+$/.test(k)) { const s = new Set(setOf(k, false)); return [(m) => s.has(m), i + 1]; }
                    throw new Error(`unknown search key ${k}`);
            }
        };
        const all = (t, i, byUid) => { const ps = []; while (i < t.length) { const [p, j] = key1(t, i, byUid); ps.push(p); i = j; } return (m) => ps.every((p) => p(m)); };

        const run = (tag, t) => {
            let cmd = txt(t[0]).toUpperCase(), args = t.slice(1), byUid = false;
            if (cmd === "UID") { byUid = true; cmd = txt(t[1]).toUpperCase(); args = t.slice(2); }
            if (cmd === "CAPABILITY") { w("* CAPABILITY IMAP4rev1 IDLE MOVE UIDPLUS SPECIAL-USE"); return w(`${tag} OK CAPABILITY completed`); }
            if (cmd === "NOOP") return w(`${tag} OK NOOP completed`);
            if (cmd === "LOGOUT") { w("* BYE logging out"); w(`${tag} OK LOGOUT completed`); return sock.end(); }
            if (cmd === "LOGIN") {
                if (txt(args[0]) !== USER || txt(args[1]) !== PASS) { log.badLogins++; return w(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials`); }
                authed = true; log.logins++; return w(`${tag} OK [CAPABILITY IMAP4rev1 IDLE MOVE UIDPLUS SPECIAL-USE] LOGIN completed`);
            }
            if (!authed) return w(`${tag} BAD sign in first`);
            if (cmd === "LIST") {
                for (const [name, f] of folders) w(`* LIST (\\HasNoChildren${f.special ? " " + f.special : ""}) "/" ${quote(name)}`);
                return w(`${tag} OK LIST completed`);
            }
            if (cmd === "STATUS") {
                const f = folders.get(txt(args[0])); if (!f) return w(`${tag} NO [NONEXISTENT] no such folder`);
                const items = (args[1] ?? []).map((x) => txt(x).toUpperCase());
                const v = { MESSAGES: f.msgs.length, UNSEEN: f.msgs.filter((m) => !m.flags.includes("\\Seen")).length, UIDNEXT: f.next, UIDVALIDITY: 1, RECENT: 0 };
                w(`* STATUS ${quote(txt(args[0]))} (${items.map((k) => `${k} ${v[k] ?? 0}`).join(" ")})`);
                return w(`${tag} OK STATUS completed`);
            }
            if (cmd === "SELECT" || cmd === "EXAMINE") {
                const name = txt(args[0]); const f = folders.get(name);
                if (!f) { folder = null; return w(`${tag} NO [NONEXISTENT] no such folder`); }
                folder = name; sock.folder = name; readOnly = cmd === "EXAMINE";
                w("* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)"); w(`* ${f.msgs.length} EXISTS`); w("* 0 RECENT");
                w("* OK [UIDVALIDITY 1] UIDs valid"); w(`* OK [UIDNEXT ${f.next}] predicted next UID`);
                return w(`${tag} OK [${readOnly ? "READ-ONLY" : "READ-WRITE"}] ${cmd} completed`);
            }
            if (cmd === "APPEND") {
                const name = txt(args[0]); if (!folders.has(name)) return w(`${tag} NO [TRYCREATE] no such folder`);
                const flags = Array.isArray(args[1]) ? args[1].map(txt) : [];
                const lit = args.at(-1);
                if (!lit?.str) return w(`${tag} BAD APPEND needs the message as a literal`);
                const date = args.length === 4 ? txt(args[2]) : undefined;
                const uid = add(name, lit.str, flags, date); log.appends++;
                return w(`${tag} OK [APPENDUID 1 ${uid}] APPEND completed`);
            }
            if (cmd === "IDLE") {
                if (!folder) return w(`${tag} BAD select a folder first`);
                idleTag = tag; idlers.add(sock); log.idles++; w("+ idling");
                if (folder === "INBOX" && !log.delivered) {
                    log.delivered = true;
                    setTimeout(() => add("INBOX", ["From: Ada Lovelace <ada@example.com>", "To: Support <support@quillo.test>", "Subject: One more thing", "Date: Fri, 30 Oct 2026 10:00:00 +0000", "Message-ID: <more@example.com>", "", "Friday at 10 suits me best.", ""].join("\r\n"), []), 300);
                }
                return;
            }
            if (!folder) return w(`${tag} BAD select a folder first`);
            if (cmd === "CLOSE") { const f = folders.get(folder); if (!readOnly) f.msgs = f.msgs.filter((m) => !m.flags.includes("\\Deleted")); folder = null; sock.folder = null; return w(`${tag} OK CLOSE completed`); }
            if (cmd === "SEARCH") {
                let i = 0; if (txt(args[0]).toUpperCase() === "CHARSET") i = 2;
                let pred; try { pred = all(args, i, byUid); } catch (e) { return w(`${tag} BAD ${e.message}`); }
                const found = msgs().map((m, k) => (pred(m) ? (byUid ? m.uid : k + 1) : null)).filter((x) => x != null);
                w(`* SEARCH${found.map((x) => " " + x).join("")}`); return w(`${tag} OK SEARCH completed`);
            }
            if (cmd === "FETCH") {
                const set = setOf(txt(args[0]), byUid); const items = Array.isArray(args[1]) ? args[1] : [args[1]];
                for (const m of set) { const line = fetchLine(m, items, byUid); if (!line) return w(`${tag} BAD unknown FETCH item`); sock.write(line); }
                log.fetches++; return w(`${tag} OK FETCH completed`);
            }
            if (cmd === "STORE") {
                if (readOnly) return w(`${tag} NO the folder is read-only`);
                const set = setOf(txt(args[0]), byUid); const how = txt(args[1]).toUpperCase(); const flags = (Array.isArray(args[2]) ? args[2] : args.slice(2)).map(txt);
                for (const m of set) {
                    if (how.startsWith("+")) for (const f of flags) { if (!m.flags.includes(f)) m.flags.push(f); }
                    else if (how.startsWith("-")) m.flags = m.flags.filter((f) => !flags.includes(f));
                    else m.flags = [...flags];
                    if (!how.endsWith(".SILENT")) w(`* ${msgs().indexOf(m) + 1} FETCH (${byUid ? `UID ${m.uid} ` : ""}FLAGS (${m.flags.join(" ")}))`);
                }
                log.stores++; return w(`${tag} OK STORE completed`);
            }
            if (cmd === "COPY" || cmd === "MOVE") {
                const to = txt(args[1]); if (!folders.has(to)) return w(`${tag} NO [TRYCREATE] no such folder`);
                const set = setOf(txt(args[0]), byUid); if (!set.length) return w(`${tag} OK nothing to ${cmd.toLowerCase()}`);
                const news = set.map((m) => add(to, m.text, m.flags.filter((f) => f !== "\\Deleted"), m.date));
                const code = `[COPYUID 1 ${set.map((m) => m.uid).join(",")} ${news.join(",")}]`;
                if (cmd === "COPY") return w(`${tag} OK ${code} COPY completed`);
                w(`* OK ${code} moved`);
                const f = folders.get(folder);
                for (const m of set) { w(`* ${f.msgs.indexOf(m) + 1} EXPUNGE`); f.msgs.splice(f.msgs.indexOf(m), 1); }
                log.moves++; return w(`${tag} OK MOVE completed`);
            }
            if (cmd === "EXPUNGE") {
                if (readOnly) return w(`${tag} NO the folder is read-only`);
                const f = folders.get(folder); const only = byUid ? new Set(setOf(txt(args[0]), true)) : null;
                for (let k = f.msgs.length - 1; k >= 0; k--) { const m = f.msgs[k]; if (m.flags.includes("\\Deleted") && (!only || only.has(m))) { f.msgs.splice(k, 1); w(`* ${k + 1} EXPUNGE`); } }
                return w(`${tag} OK EXPUNGE completed`);
            }
            return w(`${tag} BAD unknown command ${cmd}`);
        };

        sock.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (idleTag) {
                    const i = buf.indexOf("\r\n"); if (i < 0) return;
                    const line = buf.subarray(0, i).toString(); buf = buf.subarray(i + 2);
                    if (line.toUpperCase() === "DONE") { idlers.delete(sock); w(`${idleTag} OK IDLE terminated`); idleTag = null; } else w("* BAD expected DONE");
                    continue;
                }
                const i = buf.indexOf("\r\n"); if (i < 0) return;
                const line = buf.subarray(0, i).toString("utf8");
                const lit = /\{(\d+)(\+?)\}$/.exec(line);
                if (lit) {
                    const n = Number(lit[1]);
                    if (buf.length < i + 2 + n) { if (!lit[2] && !waitingLit) { waitingLit = true; w("+ go ahead"); } return; }
                    waitingLit = false;
                    parts.push(line.slice(0, lit.index), buf.subarray(i + 2, i + 2 + n));
                    buf = buf.subarray(i + 2 + n);
                    continue;
                }
                buf = buf.subarray(i + 2);
                parts.push(line);
                const got = parts; parts = [];
                const toks = tokenize(got);
                const tag = txt(toks[0]);
                if (!tag || toks.length < 2) { w("* BAD no command"); continue; }
                try { run(tag, toks.slice(1)); } catch (e) { w(`${tag} BAD ${e.message}`); }
            }
        });
    }).listen(port, "127.0.0.1");

    return {
        env: { IMAP_URL: `imaps://support%40quillo.test:p%40ss%20%22word%22@127.0.0.1:${port}`, IMAP_CA: ca },
        close: () => server.close(),
        check: () => {
            if (!log.logins) return "nobody signed in to the IMAP server";
            if (!log.fetches) return "no FETCH reached the IMAP server";
            if (!log.stores) return "no STORE reached the IMAP server";
            if (!log.moves) return "no MOVE reached the IMAP server";
            if (!log.appends) return "no APPEND reached the IMAP server";
            if (!log.idles) return "no IDLE reached the IMAP server";
            return null;
        },
    };
}
