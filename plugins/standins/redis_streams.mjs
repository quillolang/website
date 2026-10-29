// A Redis for the redis_streams plugin's test, written from the Redis protocol (RESP2) and the
// command reference: AUTH (NOAUTH and WRONGPASS), PING, SELECT, CLIENT SETINFO; streams with
// XADD (*, <ms>-*, explicit IDs, NOMKSTREAM, MAXLEN/MINID), XRANGE and XREVRANGE (with exclusive
// and incomplete IDs, COUNT), XLEN, XTRIM, XDEL, XREAD (COUNT, BLOCK, `$`), consumer groups:
// XGROUP CREATE/DESTROY (MKSTREAM, BUSYGROUP), XREADGROUP (`>` and history, NOACK, BLOCK,
// NOGROUP), XACK, XPENDING (summary and extended, IDLE, consumer), XAUTOCLAIM (with deleted IDs);
// pub/sub: PUBLISH, SUBSCRIBE, PSUBSCRIBE (glob patterns), UNSUBSCRIBE, PUNSUBSCRIBE, PING in
// subscribed mode, and Redis's own error texts.
//
//   start({ port }) -> { env: { REDIS_URL }, close(), check() }
import { createServer } from "node:net";

const PASS = "secret";
const enc = {
    ok: () => "+OK\r\n",
    simple: (s) => `+${s}\r\n`,
    err: (s) => `-${s}\r\n`,
    int: (n) => `:${n}\r\n`,
    bulk: (s) => (s == null ? "$-1\r\n" : `$${Buffer.byteLength(String(s))}\r\n${s}\r\n`),
    nilArray: () => "*-1\r\n",
};
// Nested replies: arrays of strings, numbers (integers), null (nil bulk) and arrays.
function resp(v) {
    if (v === null || v === undefined) return enc.bulk(null);
    if (typeof v === "number") return enc.int(v);
    if (Array.isArray(v)) return `*${v.length}\r\n` + v.map(resp).join("");
    if (typeof v === "object" && v.nilArray) return enc.nilArray();
    return enc.bulk(String(v));
}

// ---- stream IDs ----
const idStr = (id) => `${id[0]}-${id[1]}`;
const cmp = (a, b) => (a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
const MAXSEQ = Number.MAX_SAFE_INTEGER;
function parseId(s, { missingSeq = 0, allowSpecial = false } = {}) {
    if (allowSpecial && s === "-") return [0, 0];
    if (allowSpecial && s === "+") return [MAXSEQ, MAXSEQ];
    const m = /^(\d+)(?:-(\d+))?$/.exec(s);
    if (!m) return null;
    return [Number(m[1]), m[2] !== undefined ? Number(m[2]) : missingSeq];
}
const INVALID_ID = "ERR Invalid stream ID specified as stream command argument";

function glob(p, s) {
    let re = "^";
    for (let i = 0; i < p.length; i++) {
        const c = p[i];
        if (c === "\\" && i + 1 < p.length) re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        else if (c === "*") re += ".*";
        else if (c === "?") re += ".";
        else if (c === "[") { const j = p.indexOf("]", i + 1); if (j < 0) re += "\\["; else { let cls = p.slice(i + 1, j); if (cls[0] === "^") cls = "^" + cls.slice(1); re += `[${cls.replace(/\\/g, "\\\\")}]`; i = j; } }
        else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(re + "$", "s").test(s);
}

export async function start({ port }) {
    const stats = { connects: 0, authFails: 0, xadd: 0, xread: 0, groupReads: 0, delivered: 0, acks: 0, claims: 0, published: 0, pushed: 0, subscribes: 0 };
    const streams = new Map(); // key -> { entries: [{ id, fields }], last, groups: Map }
    const clients = new Set();
    let blocked = [];

    function stream(key, make) {
        let s = streams.get(key);
        if (!s && make) { s = { entries: [], last: [0, 0], groups: new Map() }; streams.set(key, s); }
        return s;
    }
    const entryReply = (e) => [idStr(e.id), e.fields];
    function range(s, lo, hi, count, rev) {
        let out = s.entries.filter((e) => cmp(e.id, lo) >= 0 && cmp(e.id, hi) <= 0);
        if (rev) out = out.reverse();
        if (count > 0) out = out.slice(0, count);
        return out.map(entryReply);
    }
    // Start and end of a range: "-" and "+", "(" to leave the ID out, <ms> alone for its whole millisecond.
    function bound(arg, isStart) {
        let excl = false, a = arg;
        if (a.startsWith("(")) { excl = true; a = a.slice(1); }
        if (a === "-" || a === "+") { if (excl) return null; return a === "-" ? [0, 0] : [MAXSEQ, MAXSEQ]; }
        const id = parseId(a, { missingSeq: isStart ? 0 : MAXSEQ });
        if (!id) return null;
        if (excl) { if (isStart) { id[1]++; } else { if (id[1] === 0) { if (id[0] === 0) return null; id[0]--; id[1] = MAXSEQ; } else id[1]--; } }
        return id;
    }
    function trim(s, how, approx, th) {
        let n = 0;
        if (how === "MAXLEN") { while (s.entries.length > th) { s.entries.shift(); n++; } }
        else { const min = parseId(th); while (s.entries.length && cmp(s.entries[0].id, min) < 0) { s.entries.shift(); n++; } }
        return n;
    }
    function readGroup(key, s, g, consumer, id, count, noack) {
        const cons = g.consumers.get(consumer) ?? { seen: Date.now() };
        cons.seen = Date.now(); g.consumers.set(consumer, cons);
        if (id === ">") {
            let out = s.entries.filter((e) => cmp(e.id, g.last) > 0);
            if (count > 0) out = out.slice(0, count);
            for (const e of out) {
                g.last = e.id;
                if (!noack) g.pel.set(idStr(e.id), { id: e.id, consumer, at: Date.now(), count: 1 });
            }
            stats.delivered += out.length;
            return out.map(entryReply);
        }
        const from = parseId(id);
        let mine = [...g.pel.values()].filter((p) => p.consumer === consumer && cmp(p.id, from) > 0).sort((a, b) => cmp(a.id, b.id));
        if (count > 0) mine = mine.slice(0, count);
        return mine.map((p) => { const e = s.entries.find((x) => cmp(x.id, p.id) === 0); p.count++; p.at = Date.now(); return e ? entryReply(e) : [idStr(p.id), null]; });
    }

    function tryServe(b) {
        if (b.kind === "xread") {
            const out = [];
            b.keys.forEach((k, i) => {
                const s = streams.get(k);
                if (!s) return;
                const got = s.entries.filter((e) => cmp(e.id, b.ids[i]) > 0);
                if (got.length) out.push([k, (b.count > 0 ? got.slice(0, b.count) : got).map(entryReply)]);
            });
            return out.length ? out : null;
        }
        const out = [];
        b.keys.forEach((k) => {
            const s = streams.get(k); const g = s?.groups.get(b.group);
            if (!g) return;
            const got = readGroup(k, s, g, b.consumer, ">", b.count, b.noack);
            if (got.length) out.push([k, got]);
        });
        return out.length ? out : null;
    }
    function wake() {
        blocked = blocked.filter((b) => {
            if (b.c.destroyed) { clearTimeout(b.timer); return false; }
            const r = tryServe(b);
            if (!r) return true;
            clearTimeout(b.timer); b.c.write(resp(r)); return false;
        });
    }
    function block(c, b, ms) {
        b.c = c;
        if (ms > 0) b.timer = setTimeout(() => { blocked = blocked.filter((x) => x !== b); c.write(enc.nilArray()); }, ms);
        blocked.push(b);
    }

    function deliverPub(channel, msg) {
        let n = 0;
        for (const c of clients) {
            if (c.channels.has(channel)) { c.write(resp(["message", channel, msg])); n++; }
            for (const p of c.patterns) if (glob(p, channel)) { c.write(resp(["pmessage", p, channel, msg])); n++; }
        }
        stats.pushed += n;
        return n;
    }

    const arity = { PING: [1, 2], AUTH: [2, 3], SELECT: [2, 2], XLEN: [2, 2], XACK: [4, Infinity], XADD: [5, Infinity], XRANGE: [4, 6], XREVRANGE: [4, 6], XTRIM: [4, 7], XDEL: [3, Infinity], XREAD: [4, Infinity], XREADGROUP: [7, Infinity], XPENDING: [3, 9], XAUTOCLAIM: [6, 9], XGROUP: [2, Infinity], PUBLISH: [3, 3], SUBSCRIBE: [2, Infinity], PSUBSCRIBE: [2, Infinity], UNSUBSCRIBE: [1, Infinity], PUNSUBSCRIBE: [1, Infinity], CLIENT: [2, Infinity], QUIT: [1, 1], DEL: [2, Infinity], EXISTS: [2, Infinity] };

    function run(c, args) {
        const name = args[0].toUpperCase(), a = args.slice(1);
        const lname = args[0].toLowerCase();
        if (!(name in arity)) return enc.err(`ERR unknown command '${args[0]}', with args beginning with: ${a.slice(0, 3).map((x) => `'${x}'`).join(" ")}`);
        const [lo, hi] = arity[name];
        if (args.length < lo || args.length > hi) return enc.err(`ERR wrong number of arguments for '${lname}' command`);
        if (name === "AUTH") {
            const pass = a[a.length - 1], user = a.length === 2 ? a[0] : "default";
            if (user !== "default" || pass !== PASS) { stats.authFails++; return enc.err("WRONGPASS invalid username-password pair or user is disabled."); }
            c.authed = true; return enc.ok();
        }
        if (name === "QUIT") { c.end(enc.ok()); return ""; }
        if (!c.authed) return enc.err("NOAUTH Authentication required.");
        const subMode = c.channels.size + c.patterns.size > 0;
        if (subMode && !["SUBSCRIBE", "PSUBSCRIBE", "UNSUBSCRIBE", "PUNSUBSCRIBE", "PING"].includes(name)) return enc.err(`ERR Can't execute '${lname}': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context`);
        switch (name) {
            case "PING": return subMode ? resp(["pong", a[0] ?? ""]) : a.length ? enc.bulk(a[0]) : enc.simple("PONG");
            case "SELECT": { const n = Number(a[0]); return Number.isInteger(n) && n >= 0 && n < 16 ? enc.ok() : enc.err("ERR DB index is out of range"); }
            case "CLIENT": return ["SETINFO", "SETNAME"].includes(a[0].toUpperCase()) ? enc.ok() : enc.err(`ERR unknown subcommand '${a[0]}'. Try CLIENT HELP.`);
            case "DEL": { let n = 0; for (const k of a) if (streams.delete(k)) n++; return enc.int(n); }
            case "EXISTS": return enc.int(a.filter((k) => streams.has(k)).length);
            case "XADD": {
                const key = a[0]; let i = 1, nomk = false, trimHow = null, approx = false, th = null;
                for (;;) {
                    const w = a[i]?.toUpperCase();
                    if (w === "NOMKSTREAM") { nomk = true; i++; continue; }
                    if (w === "MAXLEN" || w === "MINID") {
                        trimHow = w; i++;
                        if (a[i] === "~" || a[i] === "=") { approx = a[i] === "~"; i++; }
                        th = a[i++];
                        if (trimHow === "MAXLEN" && !/^\d+$/.test(th ?? "")) return enc.err("ERR value is not an integer or out of range");
                        if (trimHow === "MINID" && !parseId(th ?? "")) return enc.err(INVALID_ID);
                        if (a[i]?.toUpperCase() === "LIMIT") i += 2;
                        continue;
                    }
                    break;
                }
                const idArg = a[i++], fields = a.slice(i);
                if (!idArg || fields.length === 0 || fields.length % 2) return enc.err("ERR wrong number of arguments for 'xadd' command");
                let s = stream(key, false);
                if (!s && nomk) return enc.bulk(null);
                const last = s?.last ?? [0, 0];
                let id;
                if (idArg === "*") { const ms = Math.max(Date.now(), last[0]); id = [ms, ms === last[0] ? last[1] + 1 : 0]; }
                else if (/^\d+-\*$/.test(idArg)) { const ms = Number(idArg.slice(0, -2)); id = [ms, ms === last[0] ? last[1] + 1 : 0]; if (ms < last[0]) return enc.err("ERR The ID specified in XADD is equal or smaller than the target stream top item"); }
                else { id = parseId(idArg); if (!id) return enc.err(INVALID_ID); }
                if (id[0] === 0 && id[1] === 0) return enc.err("ERR The ID specified in XADD must be greater than 0-0");
                if (cmp(id, last) <= 0) return enc.err("ERR The ID specified in XADD is equal or smaller than the target stream top item");
                s = stream(key, true);
                s.entries.push({ id, fields }); s.last = id; stats.xadd++;
                if (trimHow) trim(s, trimHow, approx, trimHow === "MAXLEN" ? Number(th) : th);
                setImmediate(wake);
                return enc.bulk(idStr(id));
            }
            case "XLEN": return enc.int(streams.get(a[0])?.entries.length ?? 0);
            case "XRANGE": case "XREVRANGE": {
                const rev = name === "XREVRANGE";
                const lo = bound(rev ? a[2] : a[1], true), hi = bound(rev ? a[1] : a[2], false);
                if (!lo || !hi) return enc.err(INVALID_ID);
                let count = 0;
                if (a.length === 5) { if (a[3].toUpperCase() !== "COUNT" || !/^\d+$/.test(a[4])) return enc.err("ERR syntax error"); count = Number(a[4]); if (count === 0) return resp([]); }
                else if (a.length !== 3) return enc.err("ERR syntax error");
                const s = streams.get(a[0]);
                return resp(s ? range(s, lo, hi, count, rev) : []);
            }
            case "XTRIM": {
                const s = streams.get(a[0]); const how = a[1].toUpperCase(); let j = 2, approx = false;
                if (how !== "MAXLEN" && how !== "MINID") return enc.err("ERR syntax error");
                if (a[j] === "~" || a[j] === "=") { approx = a[j] === "~"; j++; }
                if (!s) return enc.int(0);
                return enc.int(trim(s, how, approx, how === "MAXLEN" ? Number(a[j]) : a[j]));
            }
            case "XDEL": { const s = streams.get(a[0]); if (!s) return enc.int(0); let n = 0; for (const x of a.slice(1)) { const id = parseId(x); if (!id) return enc.err(INVALID_ID); const k = s.entries.findIndex((e) => cmp(e.id, id) === 0); if (k >= 0) { s.entries.splice(k, 1); n++; } } return enc.int(n); }
            case "XREAD": case "XREADGROUP": {
                const grp = name === "XREADGROUP"; let i = 0, count = 0, blockMs = null, noack = false, group, consumer;
                if (grp) { if (a[0].toUpperCase() !== "GROUP") return enc.err("ERR syntax error"); group = a[1]; consumer = a[2]; i = 3; }
                for (;;) {
                    const w = a[i]?.toUpperCase();
                    if (w === "COUNT") { count = Number(a[i + 1]); if (!Number.isInteger(count) || count < 0) return enc.err("ERR value is not an integer or out of range"); i += 2; continue; }
                    if (w === "BLOCK") { blockMs = Number(a[i + 1]); if (!Number.isInteger(blockMs) || blockMs < 0) return enc.err("ERR timeout is not an integer or out of range"); i += 2; continue; }
                    if (grp && w === "NOACK") { noack = true; i++; continue; }
                    break;
                }
                if (a[i]?.toUpperCase() !== "STREAMS") return enc.err("ERR syntax error");
                const rest = a.slice(i + 1);
                if (rest.length === 0 || rest.length % 2) return enc.err(`ERR Unbalanced '${lname}' list of streams: for each stream key an ID or '${grp ? ">" : "$"}' must be specified.`);
                const keys = rest.slice(0, rest.length / 2), ids = rest.slice(rest.length / 2);
                if (!grp) {
                    stats.xread++;
                    const resolved = [];
                    for (let k = 0; k < keys.length; k++) {
                        if (ids[k] === "$") resolved.push(streams.get(keys[k])?.last ?? [0, 0]);
                        else if (ids[k] === "+") { // the last entry (Redis 7.4): read from just before it
                            const e = streams.get(keys[k])?.entries.at(-1);
                            resolved.push(!e ? [MAXSEQ, MAXSEQ] : e.id[1] > 0 ? [e.id[0], e.id[1] - 1] : [e.id[0] - 1, MAXSEQ]);
                        }
                        else { const id = parseId(ids[k]); if (!id) return enc.err(INVALID_ID); resolved.push(id); }
                    }
                    const b = { kind: "xread", keys, ids: resolved, count };
                    const r = tryServe(b);
                    if (r) return resp(r);
                    if (blockMs === null) return enc.nilArray();
                    block(c, b, blockMs); return "";
                }
                stats.groupReads++;
                for (const k of keys) if (!streams.get(k)?.groups.has(group)) return enc.err(`NOGROUP No such key '${k}' or consumer group '${group}' in XREADGROUP with GROUP option`);
                for (const id of ids) if (id !== ">" && !parseId(id)) return enc.err(INVALID_ID);
                const out = [];
                keys.forEach((k, j) => {
                    const s = streams.get(k);
                    const got = readGroup(k, s, s.groups.get(group), consumer, ids[j], count, noack);
                    if (got.length || ids[j] !== ">") out.push([k, got]);
                });
                if (out.length) return resp(out);
                if (blockMs === null || ids.some((x) => x !== ">")) return enc.nilArray();
                block(c, { kind: "group", keys, group, consumer, count, noack }, blockMs); return "";
            }
            case "XGROUP": {
                const sub = a[0].toUpperCase();
                if (sub === "CREATE") {
                    if (a.length < 4) return enc.err("ERR wrong number of arguments for 'xgroup|create' command");
                    const [key, group, idArg] = a.slice(1);
                    const mk = a.slice(4).some((x) => x.toUpperCase() === "MKSTREAM");
                    let s = streams.get(key);
                    if (!s && !mk) return enc.err("ERR The XGROUP subcommand requires the key to exist. Note that for CREATE you may want to use the MKSTREAM option to create an empty stream automatically.");
                    s = stream(key, true);
                    if (s.groups.has(group)) return enc.err("BUSYGROUP Consumer Group name already exists");
                    const last = idArg === "$" ? s.last : parseId(idArg);
                    if (!last) return enc.err(INVALID_ID);
                    s.groups.set(group, { last, pel: new Map(), consumers: new Map() });
                    return enc.ok();
                }
                if (sub === "DESTROY") { const s = streams.get(a[1]); return enc.int(s?.groups.delete(a[2]) ? 1 : 0); }
                return enc.err(`ERR unknown subcommand '${a[0]}'. Try XGROUP HELP.`);
            }
            case "XACK": {
                const g = streams.get(a[0])?.groups.get(a[1]);
                let n = 0;
                for (const x of a.slice(2)) { const id = parseId(x); if (!id) return enc.err(INVALID_ID); if (g?.pel.delete(idStr(id))) n++; }
                stats.acks += n;
                return enc.int(n);
            }
            case "XPENDING": {
                const s = streams.get(a[0]); const g = s?.groups.get(a[1]);
                if (!g) return enc.err(`NOGROUP No such key '${a[0]}' or consumer group '${a[1]}'`);
                const pel = [...g.pel.values()].sort((x, y) => cmp(x.id, y.id));
                if (a.length === 2) {
                    if (!pel.length) return resp([0, null, null, null]);
                    const per = new Map(); for (const p of pel) per.set(p.consumer, (per.get(p.consumer) ?? 0) + 1);
                    return resp([pel.length, idStr(pel[0].id), idStr(pel[pel.length - 1].id), [...per].map(([k, v]) => [k, String(v)])]);
                }
                let j = 2, idle = 0;
                if (a[j]?.toUpperCase() === "IDLE") { idle = Number(a[j + 1]); j += 2; }
                const lo = bound(a[j], true), hi = bound(a[j + 1], false), count = Number(a[j + 2]), who = a[j + 3];
                if (!lo || !hi) return enc.err(INVALID_ID);
                if (!Number.isInteger(count)) return enc.err("ERR value is not an integer or out of range");
                const now = Date.now();
                return resp(pel.filter((p) => cmp(p.id, lo) >= 0 && cmp(p.id, hi) <= 0 && (!who || p.consumer === who) && now - p.at >= idle).slice(0, count).map((p) => [idStr(p.id), p.consumer, now - p.at, p.count]));
            }
            case "XAUTOCLAIM": {
                const [key, group, consumer, idleArg, startArg] = a;
                const s = streams.get(key); const g = s?.groups.get(group);
                if (!g) return enc.err(`NOGROUP No such key '${key}' or consumer group '${group}'`);
                const minIdle = Number(idleArg); if (!Number.isInteger(minIdle) || minIdle < 0) return enc.err("ERR Invalid min-idle-time argument for XAUTOCLAIM");
                const start = bound(startArg, true); if (!start) return enc.err(INVALID_ID);
                let count = 100, justid = false;
                for (let j = 5; j < a.length; j++) { const w = a[j].toUpperCase(); if (w === "COUNT") { count = Number(a[++j]); if (!Number.isInteger(count) || count < 1) return enc.err("ERR COUNT must be > 0"); } else if (w === "JUSTID") justid = true; else return enc.err("ERR syntax error"); }
                const now = Date.now();
                const pel = [...g.pel.values()].filter((p) => cmp(p.id, start) >= 0).sort((x, y) => cmp(x.id, y.id));
                const claimed = [], deleted = []; let scanned = 0, next = "0-0";
                for (const p of pel) {
                    if (scanned >= count) { next = idStr(p.id); break; }
                    scanned++;
                    if (now - p.at < minIdle) continue;
                    const e = s.entries.find((x) => cmp(x.id, p.id) === 0);
                    if (!e) { g.pel.delete(idStr(p.id)); deleted.push(idStr(p.id)); continue; }
                    p.consumer = consumer; p.at = now; if (!justid) p.count++;
                    claimed.push(justid ? idStr(e.id) : entryReply(e));
                }
                g.consumers.set(consumer, { seen: now });
                stats.claims += claimed.length;
                return resp([next, claimed, deleted]);
            }
            case "PUBLISH": stats.published++; return enc.int(deliverPub(a[0], a[1]));
            case "SUBSCRIBE": case "PSUBSCRIBE": {
                const set = name === "SUBSCRIBE" ? c.channels : c.patterns, kind = name.toLowerCase();
                let out = "";
                for (const ch of a) { set.add(ch); stats.subscribes++; out += resp([kind, ch, c.channels.size + c.patterns.size]); }
                return out;
            }
            case "UNSUBSCRIBE": case "PUNSUBSCRIBE": {
                const set = name === "UNSUBSCRIBE" ? c.channels : c.patterns, kind = name.toLowerCase();
                const which = a.length ? a : [...set];
                if (!which.length) return resp([kind, null, c.channels.size + c.patterns.size]);
                let out = "";
                for (const ch of which) { set.delete(ch); out += resp([kind, ch, c.channels.size + c.patterns.size]); }
                return out;
            }
        }
        return enc.err("ERR syntax error");
    }

    const server = createServer((c) => {
        clients.add(c); stats.connects++;
        c.authed = false; c.channels = new Set(); c.patterns = new Set();
        let buf = Buffer.alloc(0);
        c.on("close", () => clients.delete(c));
        c.on("error", () => {});
        c.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (!buf.length) return;
                let args, used;
                if (buf[0] === 0x2a) { // *<n> then $<len> bulk strings
                    const text = buf.toString("latin1");
                    let at = text.indexOf("\r\n"); if (at < 0) return;
                    const n = Number(text.slice(1, at)); let pos = at + 2; args = [];
                    if (!Number.isInteger(n) || n < 1 || n > 1024 * 1024) { c.end(enc.err("ERR Protocol error: invalid multibulk length")); return; }
                    for (let k = 0; k < n; k++) {
                        if (text[pos] !== "$") { if (pos >= text.length) return; c.end(enc.err(`ERR Protocol error: expected '$', got '${text[pos]}'`)); return; }
                        const e = text.indexOf("\r\n", pos); if (e < 0) return;
                        const len = Number(text.slice(pos + 1, e)); pos = e + 2;
                        if (buf.length < pos + len + 2) return;
                        args.push(buf.subarray(pos, pos + len).toString("utf8")); pos += len + 2;
                    }
                    used = pos;
                } else { // an inline command
                    const e = buf.indexOf("\r\n"); if (e < 0) return;
                    args = buf.subarray(0, e).toString("utf8").trim().split(/\s+/).filter(Boolean); used = e + 2;
                    if (!args.length) { buf = buf.subarray(used); continue; }
                }
                buf = buf.subarray(used);
                const out = run(c, args);
                if (out) c.write(out);
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { REDIS_URL: `redis://:${PASS}@127.0.0.1:${port}/0` },
        stats,
        close() { for (const b of blocked) clearTimeout(b.timer); for (const c of clients) c.destroy(); server.close(); },
        check() {
            if (!stats.xadd) return "the Redis stand-in got no XADD";
            if (!stats.groupReads || !stats.delivered) return "the Redis stand-in delivered nothing through XREADGROUP";
            if (!stats.acks) return "the Redis stand-in got no XACK that acknowledged an entry";
            if (!stats.pushed) return "the Redis stand-in pushed no pub/sub message to a subscriber";
            return null;
        },
    };
}
