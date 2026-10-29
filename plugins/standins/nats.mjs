// A small NATS server for the nats plugin's test, written from the NATS client protocol
// (docs.nats.io, "Client Protocol") and the JetStream wire API: INFO first; CONNECT with user and
// password checked (`-ERR 'Authorization Violation'` and close otherwise), verbose `+OK`, echo,
// headers and no_responders; PUB and HPUB, SUB (with queue groups: one member each) and UNSUB
// (with max_msgs), MSG and HMSG, PING/PONG; `*` and `>` wildcards; `-ERR` for unknown operations,
// invalid subjects and payloads past max_payload; a 503 status to the reply subject when a request
// has no responders. JetStream: streams that keep what is published on their subjects and answer
// with a PubAck (Nats-Msg-Id de-duplication, Nats-Expected-Stream, Nats-Expected-Last-Sequence),
// and $JS.API STREAM.CREATE / UPDATE / INFO / MSG.GET with JetStream's error codes.
//
//   start({ port }) -> { env: { NATS_URL }, close(), check() }
import { createServer } from "node:net";

const USER = "quillo", PASS = "secret", MAX_PAYLOAD = 1048576;

function subjectOk(s, wild) {
    if (!s || /[\s]/.test(s)) return false;
    const t = s.split(".");
    if (t.some((x) => x === "")) return false;
    if (!wild) return true;
    return t.every((x, i) => (x.includes(">") ? x === ">" && i === t.length - 1 : true) && (x.includes("*") ? x === "*" : true));
}
const hasWild = (s) => s.split(".").some((x) => x === "*" || x === ">");
function matches(filter, subject) {
    const f = filter.split("."), s = subject.split(".");
    for (let i = 0; i < f.length; i++) {
        if (f[i] === ">") return s.length > i;
        if (i >= s.length) return false;
        if (f[i] !== "*" && f[i] !== s[i]) return false;
    }
    return f.length === s.length;
}
// Whether two subject filters can both match one subject (JetStream refuses overlapping streams).
function overlap(a, b) {
    const x = a.split("."), y = b.split(".");
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if (x[i] === ">" || y[i] === ">") return true;
        if (x[i] === undefined || y[i] === undefined) return false;
        if (x[i] !== "*" && y[i] !== "*" && x[i] !== y[i]) return false;
    }
    return true;
}
function parseHeaders(buf) {
    const lines = buf.toString("utf8").split("\r\n");
    if (!lines[0].startsWith("NATS/1.0")) return null;
    const h = {};
    for (const l of lines.slice(1)) { const i = l.indexOf(":"); if (i > 0) (h[l.slice(0, i).trim()] ??= []).push(l.slice(i + 1).trim()); }
    return h;
}
const nowIso = () => new Date().toISOString();

export async function start({ port }) {
    const stats = { connects: 0, refused: 0, pubs: 0, hpubs: 0, subs: 0, queueSubs: 0, delivered: 0, requests: 0, answered: 0, noResponders: 0, jsAcks: 0, jsApi: 0, errors: 0 };
    const clients = new Set();
    const streams = new Map(); // name -> { config, created, msgs: [{seq, subject, data, hdrs, time}], seq, ids: Map }
    let nextCid = 1;

    // Every subscription that takes `subject`: plain ones each, one member per queue group.
    function route(subject, reply, hdr, payload, from) {
        const plain = [], groups = new Map();
        for (const c of clients) {
            if (!c.ready) continue;
            if (c === from && c.echo === false) continue;
            for (const s of c.subs.values()) {
                if (!matches(s.subject, subject)) continue;
                if (s.queue) { const k = s.queue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push([c, s]); }
                else plain.push([c, s]);
            }
        }
        const chosen = [...plain];
        for (const members of groups.values()) chosen.push(members[Math.floor(Math.random() * members.length)]);
        for (const [c, s] of chosen) deliverTo(c, s, subject, reply, hdr, payload);
        return chosen.length;
    }
    function deliverTo(c, s, subject, reply, hdr, payload) {
        const r = reply ? ` ${reply}` : "";
        if (hdr && hdr.length) {
            if (!c.headers) return; // a client without headers gets no HMSG
            c.write(`HMSG ${subject} ${s.sid}${r} ${hdr.length} ${hdr.length + payload.length}\r\n`);
            c.write(Buffer.concat([hdr, payload, Buffer.from("\r\n")]));
        } else {
            c.write(`MSG ${subject} ${s.sid}${r} ${payload.length}\r\n`);
            c.write(Buffer.concat([payload, Buffer.from("\r\n")]));
        }
        stats.delivered++;
        s.count++;
        if (s.max && s.count >= s.max) c.subs.delete(s.sid);
    }
    const answer = (reply, obj, from) => { if (reply) route(reply, null, null, Buffer.from(JSON.stringify(obj)), from); };
    const jsErr = (type, code, err_code, description) => ({ type: `io.nats.jetstream.api.v1.${type}`, error: { code, err_code, description } });

    function streamInfo(st, type) {
        const m = st.msgs;
        return {
            type: `io.nats.jetstream.api.v1.${type}`, config: st.config, created: st.created,
            state: {
                messages: m.length, bytes: m.reduce((a, x) => a + x.data.length + (x.hdrs?.length ?? 0) + x.subject.length, 0),
                first_seq: m.length ? m[0].seq : st.seq + 1, first_ts: m.length ? m[0].time : "0001-01-01T00:00:00Z",
                last_seq: st.seq, last_ts: m.length ? m[m.length - 1].time : "0001-01-01T00:00:00Z", consumer_count: 0,
            },
            ts: nowIso(),
        };
    }
    function withDefaults(cfg) {
        return {
            retention: "limits", max_consumers: -1, max_msgs: -1, max_bytes: -1, max_age: 0, max_msgs_per_subject: -1,
            max_msg_size: -1, discard: "old", storage: "file", num_replicas: 1, duplicate_window: 120e9, sealed: false,
            deny_delete: false, deny_purge: false, allow_rollup_hdrs: false, allow_direct: false, mirror_direct: false,
            ...cfg, subjects: cfg.subjects ?? [cfg.name],
        };
    }
    function validConfig(cfg, name) {
        if (!cfg || typeof cfg !== "object") return [400, 10025, "bad request"];
        if (cfg.name !== name) return [400, 10056, "stream name in subject does not match request"];
        if (!/^[^.*>\s\/\\]+$/.test(name)) return [400, 10052, "invalid stream configuration: invalid stream name"];
        for (const s of cfg.subjects ?? []) if (!subjectOk(s, true)) return [400, 10052, `invalid stream configuration: invalid subject ${s}`];
        if (cfg.storage && !["file", "memory"].includes(cfg.storage)) return [400, 10025, "bad request"];
        for (const [other, st] of streams) {
            if (other === name) continue;
            for (const a of cfg.subjects ?? [name]) for (const b of st.config.subjects) if (overlap(a, b)) return [400, 10065, "subjects overlap with an existing stream"];
        }
        return null;
    }

    function jsApi(api, body, reply, from) {
        stats.jsApi++;
        let req = null;
        if (body.length) { try { req = JSON.parse(body.toString("utf8")); } catch { return answer(reply, jsErr("api_response", 400, 10025, "bad request"), from); } }
        let m;
        if ((m = /^STREAM\.(CREATE|UPDATE|INFO|MSG\.GET)\.([^.]+)$/.exec(api))) {
            const [, op, name] = m;
            const st = streams.get(name);
            if (op === "INFO") return answer(reply, st ? streamInfo(st, "stream_info_response") : jsErr("stream_info_response", 404, 10059, "stream not found"), from);
            if (op === "CREATE") {
                const bad = validConfig(req, name);
                if (bad) return answer(reply, jsErr("stream_create_response", ...bad), from);
                const cfg = withDefaults(req);
                if (st) {
                    if (JSON.stringify(st.config) !== JSON.stringify(cfg)) return answer(reply, jsErr("stream_create_response", 400, 10058, "stream name already in use with a different configuration"), from);
                    return answer(reply, streamInfo(st, "stream_create_response"), from);
                }
                const fresh = { config: cfg, created: nowIso(), msgs: [], seq: 0, ids: new Map() };
                streams.set(name, fresh);
                return answer(reply, { ...streamInfo(fresh, "stream_create_response"), did_create: true }, from);
            }
            if (op === "UPDATE") {
                if (!st) return answer(reply, jsErr("stream_update_response", 404, 10059, "stream not found"), from);
                const bad = validConfig(req, name);
                if (bad) return answer(reply, jsErr("stream_update_response", ...bad), from);
                const cfg = withDefaults(req);
                if (cfg.storage !== st.config.storage) return answer(reply, jsErr("stream_update_response", 500, 10052, "stream configuration update can not change storage type"), from);
                st.config = cfg;
                return answer(reply, streamInfo(st, "stream_update_response"), from);
            }
            if (op === "MSG.GET") {
                if (!st) return answer(reply, jsErr("stream_msg_get_response", 404, 10059, "stream not found"), from);
                const found = req?.seq != null ? st.msgs.find((x) => x.seq === req.seq)
                    : req?.last_by_subj ? [...st.msgs].reverse().find((x) => x.subject === req.last_by_subj) : undefined;
                if (!req || (req.seq == null && !req.last_by_subj)) return answer(reply, jsErr("stream_msg_get_response", 400, 10025, "bad request"), from);
                if (!found) return answer(reply, jsErr("stream_msg_get_response", 404, 10037, "no message found"), from);
                const msg = { subject: found.subject, seq: found.seq, data: found.data.toString("base64"), time: found.time };
                if (found.hdrs?.length) msg.hdrs = found.hdrs.toString("base64");
                return answer(reply, { type: "io.nats.jetstream.api.v1.stream_msg_get_response", message: msg }, from);
            }
        }
        if (api === "INFO") return answer(reply, { type: "io.nats.jetstream.api.v1.account_info_response", memory: 0, storage: 0, streams: streams.size, consumers: 0, limits: { max_memory: -1, max_storage: -1, max_streams: -1, max_consumers: -1 }, api: { total: stats.jsApi, errors: 0 } }, from);
        return false; // not an API JetStream answers here: no responders
    }

    // A message on a stream's subject is kept, and answered with a PubAck when it has a reply subject.
    function capture(subject, reply, hdr, payload, from) {
        for (const [name, st] of streams) {
            if (!st.config.subjects.some((f) => matches(f, subject))) continue;
            const h = hdr ? parseHeaders(hdr) ?? {} : {};
            const ack = (o) => { if (reply) { stats.jsAcks++; answer(reply, o, from); } };
            if (h["Nats-Expected-Stream"] && h["Nats-Expected-Stream"][0] !== name) { ack({ error: { code: 400, err_code: 10060, description: "expected stream does not match" } }); return true; }
            if (h["Nats-Expected-Last-Sequence"] && Number(h["Nats-Expected-Last-Sequence"][0]) !== st.seq) { ack({ error: { code: 400, err_code: 10071, description: `wrong last sequence: ${st.seq}` } }); return true; }
            const id = h["Nats-Msg-Id"]?.[0];
            const now = Date.now();
            for (const [k, t] of st.ids) if (now - t.at > st.config.duplicate_window / 1e6) st.ids.delete(k);
            if (id && st.ids.has(id)) { ack({ stream: name, seq: st.ids.get(id).seq, duplicate: true }); return true; }
            if (st.config.max_msgs > 0 && st.msgs.length >= st.config.max_msgs) {
                if (st.config.discard === "new") { ack({ error: { code: 503, err_code: 10077, description: "maximum messages exceeded" } }); return true; }
                st.msgs.shift();
            }
            st.seq++;
            st.msgs.push({ seq: st.seq, subject, data: payload, hdrs: hdr, time: nowIso() });
            if (id) st.ids.set(id, { seq: st.seq, at: now });
            ack({ stream: name, seq: st.seq });
            return true;
        }
        return false;
    }

    function publish(c, subject, reply, hdr, payload) {
        if (reply) stats.requests++;
        let taken = 0;
        if (subject.startsWith("$JS.API.")) {
            if (jsApi(subject.slice(8), payload, reply, c) !== false) return;
        } else if (capture(subject, reply, hdr, payload, c)) taken++;
        taken += route(subject, reply, hdr, payload, c);
        if (reply && taken === 0 && c.headers && c.noResponders) {
            stats.noResponders++;
            route(reply, null, Buffer.from("NATS/1.0 503\r\n\r\n"), Buffer.alloc(0), c);
        }
    }

    const server = createServer((c) => {
        clients.add(c);
        c.subs = new Map(); c.ready = false; c.cid = nextCid++;
        let buf = Buffer.alloc(0), pending = null;
        const err = (m, close) => { stats.errors++; c.write(`-ERR '${m}'\r\n`); if (close) c.end(); };
        c.write(`INFO ${JSON.stringify({ server_id: "NSTANDIN" + port, server_name: "standin", version: "2.10.22", proto: 1, go: "node", host: "127.0.0.1", port, headers: true, auth_required: true, max_payload: MAX_PAYLOAD, jetstream: true, client_id: c.cid, client_ip: "127.0.0.1" })}\r\n`);
        c.on("close", () => clients.delete(c));
        c.on("error", () => {});
        c.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (pending) {
                    if (buf.length < pending.total + 2) return;
                    const all = buf.subarray(0, pending.total);
                    if (buf[pending.total] !== 13 || buf[pending.total + 1] !== 10) { err("Parser Error", true); return; }
                    buf = buf.subarray(pending.total + 2);
                    const { subject, reply, hlen, drop } = pending; pending = null;
                    if (drop) continue;
                    const hdr = hlen ? Buffer.from(all.subarray(0, hlen)) : null;
                    if (hdr && !parseHeaders(hdr)) { err("Parser Error", true); return; }
                    if (c.verbose) c.write("+OK\r\n");
                    publish(c, subject, reply, hdr, Buffer.from(all.subarray(hlen)));
                    continue;
                }
                const i = buf.indexOf("\r\n");
                if (i < 0) { if (buf.length > 4096) err("Maximum Control Line Exceeded", true); return; }
                const line = buf.subarray(0, i).toString("utf8"); buf = buf.subarray(i + 2);
                const sp = line.search(/[ \t]/);
                const op = (sp < 0 ? line : line.slice(0, sp)).toUpperCase(), args = (sp < 0 ? "" : line.slice(sp + 1)).trim();
                const a = args.split(/[ \t]+/).filter(Boolean);
                if (op === "CONNECT") {
                    let o; try { o = JSON.parse(args); } catch { err("Parser Error", true); return; }
                    if (o.user !== USER || o.pass !== PASS) { stats.refused++; err("Authorization Violation", true); return; }
                    if (o.no_responders && !o.headers) { err("no responders requires headers support", true); return; }
                    Object.assign(c, { verbose: !!o.verbose, pedantic: !!o.pedantic, echo: o.echo !== false, headers: !!o.headers, noResponders: !!o.no_responders, name: o.name, ready: true });
                    stats.connects++;
                    if (c.verbose) c.write("+OK\r\n");
                    continue;
                }
                if (!c.ready) { err("Authorization Violation", true); return; }
                if (op === "PING") { c.write("PONG\r\n"); continue; }
                if (op === "PONG") continue;
                if (op === "PUB" || op === "HPUB") {
                    const h = op === "HPUB";
                    const n = a.length - (h ? 2 : 1);
                    if (n < 1 || n > 2) { err("Unknown Protocol Operation", true); return; }
                    const total = Number(a[a.length - 1]), hlen = h ? Number(a[a.length - 2]) : 0;
                    if (!Number.isInteger(total) || !Number.isInteger(hlen) || hlen > total || total < 0) { err("Parser Error", true); return; }
                    if (total > MAX_PAYLOAD) { err("Maximum Payload Violation", true); return; }
                    const subject = a[0], reply = n === 2 ? a[1] : null;
                    // The payload of a refused PUB is still read, and dropped.
                    const drop = !subjectOk(subject, false) || (c.pedantic && hasWild(subject));
                    if (drop) err("Invalid Publish Subject", false);
                    else h ? stats.hpubs++ : stats.pubs++;
                    pending = { subject, reply, hlen, total, drop };
                    continue;
                }
                if (op === "SUB") {
                    if (a.length < 2 || a.length > 3) { err("Unknown Protocol Operation", true); return; }
                    const [subject, queue, sid] = a.length === 3 ? a : [a[0], null, a[1]];
                    if (!subjectOk(subject, true)) { err("Invalid Subject", false); continue; }
                    c.subs.set(sid, { sid, subject, queue, count: 0, max: 0 });
                    stats.subs++; if (queue) stats.queueSubs++;
                    if (c.verbose) c.write("+OK\r\n");
                    continue;
                }
                if (op === "UNSUB") {
                    if (a.length < 1 || a.length > 2) { err("Unknown Protocol Operation", true); return; }
                    const s = c.subs.get(a[0]);
                    if (s) { if (a[1]) { s.max = Number(a[1]); if (s.count >= s.max) c.subs.delete(a[0]); } else c.subs.delete(a[0]); }
                    if (c.verbose) c.write("+OK\r\n");
                    continue;
                }
                err("Unknown Protocol Operation", true); return;
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { NATS_URL: `nats://${USER}:${PASS}@127.0.0.1:${port}` },
        stats,
        close() { for (const c of clients) c.destroy(); server.close(); },
        check() {
            if (!stats.connects) return "the NATS stand-in got no accepted CONNECT";
            if (!stats.pubs && !stats.hpubs) return "the NATS stand-in got no PUB or HPUB";
            if (!stats.hpubs) return "the NATS stand-in got no message with headers (HPUB)";
            if (!stats.queueSubs) return "the NATS stand-in got no queue subscription";
            if (!stats.delivered) return "the NATS stand-in delivered no MSG";
            if (!stats.jsAcks) return "the NATS stand-in sent no JetStream acknowledgement";
            return null;
        },
    };
}
