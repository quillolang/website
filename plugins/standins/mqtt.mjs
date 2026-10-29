// A small MQTT broker for the mqtt plugin's test, written from the MQTT 3.1.1 (OASIS, 2014) and
// MQTT 5.0 (OASIS, 2019) specifications: CONNECT/CONNACK with username and password checked,
// clean and kept sessions, session takeover, keep-alive, the last will (sent when a client goes
// without DISCONNECT); PUBLISH at QoS 0, 1 (PUBACK) and 2 (PUBREC/PUBREL/PUBCOMP) both ways;
// SUBSCRIBE/SUBACK with `+` and `#` (and `$` topics kept from them), retained messages (an empty
// one clears), UNSUBSCRIBE/UNSUBACK, PINGREQ/PINGRESP, DISCONNECT; MQTT 5 properties (user
// properties, content type, response topic, correlation data, expiry, topic aliases from clients,
// subscription options and identifiers) and reason codes. Malformed packets close the connection.
//
//   start({ port }) -> { env: { MQTT_URL }, close(), check() }
import { createServer } from "node:net";

const USER = "quillo", PASS = "secret";

// ---- encoding ----
function varint(n) {
    const out = [];
    do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
    return Buffer.from(out);
}
const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const str = (s) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u16(b.length), b]); };
const bin = (b) => Buffer.concat([u16(b.length), b]);
const packet = (type, flags, body) => Buffer.concat([Buffer.from([(type << 4) | flags]), varint(body.length), body]);

// MQTT 5 properties: id -> [name, kind]
const PROPS = {
    0x01: ["payload_format", "byte"], 0x02: ["message_expiry", "u32"], 0x03: ["content_type", "str"],
    0x08: ["response_topic", "str"], 0x09: ["correlation_data", "bin"], 0x0b: ["subscription_id", "varint"],
    0x11: ["session_expiry", "u32"], 0x12: ["assigned_client_id", "str"], 0x13: ["server_keep_alive", "u16"],
    0x15: ["auth_method", "str"], 0x16: ["auth_data", "bin"], 0x17: ["request_problem_info", "byte"],
    0x18: ["will_delay", "u32"], 0x19: ["request_response_info", "byte"], 0x1a: ["response_info", "str"],
    0x1c: ["server_reference", "str"], 0x1f: ["reason_string", "str"], 0x21: ["receive_maximum", "u16"],
    0x22: ["topic_alias_maximum", "u16"], 0x23: ["topic_alias", "u16"], 0x24: ["maximum_qos", "byte"],
    0x25: ["retain_available", "byte"], 0x26: ["user_property", "pair"], 0x27: ["maximum_packet_size", "u32"],
    0x28: ["wildcard_available", "byte"], 0x29: ["subscription_ids_available", "byte"], 0x2a: ["shared_available", "byte"],
};
const PROP_ID = Object.fromEntries(Object.entries(PROPS).map(([id, [name, kind]]) => [name, [Number(id), kind]]));

function encodeProps(props) {
    const parts = [];
    for (const [name, value] of Object.entries(props ?? {})) {
        const [id, kind] = PROP_ID[name];
        const values = (kind === "pair" || name === "subscription_id") && Array.isArray(value) ? value : [value];
        for (const v of values) {
            parts.push(varint(id));
            if (kind === "byte") parts.push(Buffer.from([v]));
            else if (kind === "u16") parts.push(u16(v));
            else if (kind === "u32") parts.push(u32(v));
            else if (kind === "str") parts.push(str(v));
            else if (kind === "bin") parts.push(bin(v));
            else if (kind === "varint") parts.push(varint(v));
            else if (kind === "pair") parts.push(str(v[0]), str(v[1]));
        }
    }
    const body = Buffer.concat(parts);
    return Buffer.concat([varint(body.length), body]);
}

class Reader {
    constructor(b) { this.b = b; this.i = 0; }
    left() { return this.b.length - this.i; }
    need(n) { if (this.i + n > this.b.length) throw new Error("malformed packet: too short"); }
    byte() { this.need(1); return this.b[this.i++]; }
    u16() { this.need(2); const v = this.b.readUInt16BE(this.i); this.i += 2; return v; }
    u32() { this.need(4); const v = this.b.readUInt32BE(this.i); this.i += 4; return v; }
    bin() { const n = this.u16(); this.need(n); const v = this.b.subarray(this.i, this.i + n); this.i += n; return Buffer.from(v); }
    str() {
        const b = this.bin(); const s = b.toString("utf8");
        if (Buffer.from(s, "utf8").compare(b) !== 0 || s.includes("\u0000")) throw new Error("malformed packet: a string is not well-formed UTF-8");
        return s;
    }
    varint() {
        let mult = 1, v = 0;
        for (let k = 0; k < 4; k++) { const b = this.byte(); v += (b & 127) * mult; if (!(b & 128)) return v; mult *= 128; }
        throw new Error("malformed packet: variable byte integer too long");
    }
    rest() { const v = Buffer.from(this.b.subarray(this.i)); this.i = this.b.length; return v; }
    props() {
        const len = this.varint(); this.need(len);
        const end = this.i + len; const out = {};
        while (this.i < end) {
            const id = this.varint(); const p = PROPS[id];
            if (!p) throw new Error(`malformed packet: unknown property 0x${id.toString(16)}`);
            const [name, kind] = p;
            const v = kind === "byte" ? this.byte() : kind === "u16" ? this.u16() : kind === "u32" ? this.u32()
                : kind === "str" ? this.str() : kind === "bin" ? this.bin() : kind === "varint" ? this.varint() : [this.str(), this.str()];
            if (kind === "pair" || name === "subscription_id") (out[name] ??= []).push(v);
            else if (name in out) throw new Error(`protocol error: property ${name} given twice`);
            else out[name] = v;
        }
        if (this.i !== end) throw new Error("malformed packet: properties overrun");
        return out;
    }
}

// ---- topics ----
function validFilter(f) {
    if (!f.length) return false;
    const lv = f.split("/");
    return lv.every((l, i) => (l.includes("#") ? l === "#" && i === lv.length - 1 : true) && (l.includes("+") ? l === "+" : true));
}
const validTopic = (t) => t.length > 0 && !t.includes("+") && !t.includes("#");
function matches(filter, topic) {
    const f = filter.split("/"), t = topic.split("/");
    if (topic.startsWith("$") && (f[0] === "+" || f[0] === "#")) return false;
    for (let i = 0; i < f.length; i++) {
        if (f[i] === "#") return true;
        if (i >= t.length) return false;
        if (f[i] !== "+" && f[i] !== t[i]) return false;
    }
    return f.length === t.length;
}

export async function start({ port }) {
    const stats = { connects: 0, refused: 0, published: 0, publishedQos: [0, 0, 0], subscribes: 0, delivered: 0, acks: 0, retained: 0, wills: 0, v5: 0, pings: 0 };
    const retained = new Map();       // topic -> { payload, qos, props }
    const sessions = new Map();       // client id -> { subs: Map(filter -> { qos, nl, rap, rh, id }), conn, queue, nextId, inflight, qos2in }
    const sockets = new Set();

    function deliver(msg, from) {
        for (const s of sessions.values()) {
            // Overlapping subscriptions: one copy, at the highest QoS, with every identifier (MQTT 5 §3.3.4).
            let best = null; const ids = [];
            for (const [f, o] of s.subs) {
                if (!matches(f, msg.topic)) continue;
                if (o.nl && s.conn === from) continue;
                if (!best || o.qos > best.qos) best = o;
                if (o.id) ids.push(o.id);
            }
            if (best) send(s, msg, { ...best, rap: best.rap, ids }, false);
        }
    }

    function send(s, msg, sub, isRetained) {
        const qos = Math.min(msg.qos, sub.qos);
        const retain = isRetained ? true : sub.rap ? msg.retain : false;
        if (!s.conn) { if (qos > 0) s.queue.push({ msg, sub, retain }); return; }
        const c = s.conn;
        let id = 0;
        if (qos > 0) {
            do { s.nextId = (s.nextId % 65535) + 1; } while (s.inflight.has(s.nextId));
            id = s.nextId;
            s.inflight.set(id, { qos, state: "sent" });
        }
        const parts = [str(msg.topic)];
        if (qos > 0) parts.push(u16(id));
        if (c.v5) {
            const props = { ...msg.props };
            delete props.topic_alias; delete props.subscription_id;
            if (sub.ids?.length) props.subscription_id = sub.ids;
            parts.push(encodeProps(props));
        }
        parts.push(msg.payload);
        c.write(packet(3, (qos << 1) | (retain ? 1 : 0), Buffer.concat(parts)));
        stats.delivered++;
    }

    function publishWill(c) {
        if (!c.will) return;
        const w = c.will; c.will = null; stats.wills++;
        route({ topic: w.topic, payload: w.payload, qos: w.qos, retain: w.retain, props: w.props }, c);
    }

    function route(msg, from) {
        if (msg.retain) {
            if (msg.payload.length === 0) retained.delete(msg.topic);
            else { retained.set(msg.topic, { ...msg }); stats.retained++; }
        }
        deliver(msg, from);
    }

    const server = createServer((c) => {
        sockets.add(c);
        let buf = Buffer.alloc(0);
        c.connected = false; c.v5 = false; c.aliases = new Map(); c.session = null;
        let lastSeen = Date.now(), keepAlive = 0;
        const timer = setInterval(() => { if (keepAlive && Date.now() - lastSeen > keepAlive * 1500) c.destroy(); }, 500);
        const fail = (why, code) => {
            // MQTT 5: a DISCONNECT with the reason before closing; 3.1.1 just closes.
            if (c.v5 && c.connected && code) c.write(packet(14, 0, Buffer.concat([Buffer.from([code]), encodeProps({ reason_string: why })])));
            c.problem = why; c.end(); c.destroy();
        };
        c.on("close", () => {
            clearInterval(timer); sockets.delete(c);
            if (c.session && c.session.conn === c) { c.session.conn = null; if (c.clean) sessions.delete(c.clientId); }
            publishWill(c);
        });
        c.on("error", () => {});
        c.on("data", (d) => {
            buf = Buffer.concat([buf, d]); lastSeen = Date.now();
            for (;;) {
                if (buf.length < 2) return;
                let len = 0, mult = 1, i = 1;
                for (;;) {
                    if (i >= buf.length) return;
                    const b = buf[i++]; len += (b & 127) * mult; mult *= 128;
                    if (!(b & 128)) break;
                    if (i > 4) return fail("malformed remaining length", 0x81);
                }
                if (buf.length < i + len) return;
                const type = buf[0] >> 4, flags = buf[0] & 15, body = buf.subarray(i, i + len);
                buf = buf.subarray(i + len);
                try { handle(type, flags, new Reader(body)); } catch (e) { return fail(e.message, 0x81); }
                if (c.destroyed) return;
            }
        });

        function handle(type, flags, r) {
            if (!c.connected && type !== 1) throw new Error("protocol error: the first packet must be CONNECT");
            if ([6, 8, 10].includes(type) ? flags !== 2 : type !== 3 && flags !== 0) throw new Error("malformed packet: reserved flags");
            if (type === 1) return connect(r);
            if (type === 3) return publish(flags, r);
            if (type === 4 || type === 7) {           // PUBACK / PUBCOMP for what we sent
                const id = r.u16(); c.session.inflight.delete(id); stats.acks++; return;
            }
            if (type === 5) {                         // PUBREC: answer PUBREL
                const id = r.u16(); const rc = r.left() ? r.byte() : 0;
                if (rc >= 0x80) { c.session.inflight.delete(id); return; }
                c.session.inflight.set(id, { qos: 2, state: "rel" });
                c.write(packet(6, 2, c.v5 ? Buffer.concat([u16(id), Buffer.from([0]), encodeProps({})]) : u16(id)));
                return;
            }
            if (type === 6) {                         // PUBREL: the client's QoS 2 is complete
                const id = r.u16(); const had = c.session.qos2in.delete(id);
                c.write(packet(7, 0, c.v5 ? Buffer.concat([u16(id), Buffer.from([had ? 0 : 0x92]), encodeProps({})]) : u16(id)));
                return;
            }
            if (type === 8) return subscribe(r);
            if (type === 10) return unsubscribe(r);
            if (type === 12) { stats.pings++; c.write(packet(13, 0, Buffer.alloc(0))); return; }
            if (type === 14) {
                const rc = c.v5 && r.left() ? r.byte() : 0;
                if (rc !== 0x04) c.will = null;     // 0x04: disconnect with will message
                if (c.v5 && r.left()) { const p = r.props(); if (p.session_expiry !== undefined && c.session) c.session.expiry = p.session_expiry; }
                c.end(); return;
            }
            throw new Error(`protocol error: unexpected packet type ${type}`);
        }

        function connect(r) {
            if (c.connected) throw new Error("protocol error: a second CONNECT");
            const proto = r.str(), level = r.byte();
            if (proto !== "MQTT" || (level !== 4 && level !== 5)) {
                // 3.1.1 §3.1.2.2: answer 0x01 and close; MQTT 5 clients get 0x84.
                c.write(packet(2, 0, level === 5 ? Buffer.concat([Buffer.from([0, 0x84]), encodeProps({})]) : Buffer.from([0, 1])));
                stats.refused++; c.end(); return;
            }
            c.v5 = level === 5;
            const fl = r.byte();
            if (fl & 1) throw new Error("malformed packet: the reserved connect flag is set");
            keepAlive = r.u16();
            const props = c.v5 ? r.props() : {};
            let clientId = r.str();
            let will = null;
            if (fl & 4) {
                const wprops = c.v5 ? r.props() : {};
                const topic = r.str(), payload = r.bin(), qos = (fl >> 3) & 3;
                if (qos > 2) throw new Error("malformed packet: will QoS 3");
                if (!validTopic(topic)) throw new Error("protocol error: the will topic is not a topic name");
                will = { topic, payload, qos, retain: !!(fl & 0x20), props: wprops };
            } else if (fl & 0x38) throw new Error("malformed packet: will flags without a will");
            const username = fl & 0x80 ? r.str() : null;
            const password = fl & 0x40 ? r.bin().toString("utf8") : null;
            if (!c.v5 && password !== null && username === null) throw new Error("protocol error: a password without a username");
            const refuse = (v4code, v5code) => {
                stats.refused++;
                c.write(packet(2, 0, c.v5 ? Buffer.concat([Buffer.from([0, v5code]), encodeProps({})]) : Buffer.from([0, v4code])));
                c.end();
            };
            if (username !== USER || password !== PASS) return refuse(4, 0x86);
            const clean = !!(fl & 2);
            let assigned = null;
            if (!clientId) {
                if (!c.v5 && !clean) return refuse(2, 0x85);
                clientId = assigned = "auto-" + Math.random().toString(36).slice(2, 12);
            }
            let s = sessions.get(clientId);
            // Session takeover: the older connection is closed (and its will, if any, goes out).
            if (s?.conn) { const old = s.conn; s.conn = null; old.destroy(); }
            let present = false;
            if (clean || !s) {
                // MQTT 5: Clean Start discards the session; without a session expiry it ends at disconnect.
                s = { subs: new Map(), conn: null, queue: [], nextId: 0, inflight: new Map(), qos2in: new Set() };
                sessions.set(clientId, s);
            } else present = true;
            c.clean = c.v5 ? !props.session_expiry : clean;
            c.clientId = clientId; c.session = s; c.will = will; c.connected = true;
            s.conn = c;
            stats.connects++; if (c.v5) stats.v5++;
            const ackProps = c.v5 ? encodeProps({ ...(assigned ? { assigned_client_id: assigned } : {}), topic_alias_maximum: 10, retain_available: 1, wildcard_available: 1, subscription_ids_available: 1, shared_available: 0 }) : Buffer.alloc(0);
            c.write(packet(2, 0, Buffer.concat([Buffer.from([present ? 1 : 0, 0]), ackProps])));
            // What waited for a kept session goes out now.
            const q = s.queue; s.queue = [];
            for (const m of q) send(s, m.msg, m.sub, false);
        }

        function publish(flags, r) {
            const qos = (flags >> 1) & 3, retain = !!(flags & 1);
            if (qos === 3) throw new Error("malformed packet: QoS 3");
            let topic = r.str();
            const id = qos > 0 ? r.u16() : 0;
            if (qos > 0 && id === 0) throw new Error("protocol error: packet id 0");
            const props = c.v5 ? r.props() : {};
            if (props.topic_alias !== undefined) {
                if (props.topic_alias === 0 || props.topic_alias > 10) throw new Error("protocol error: topic alias out of range");
                if (topic) c.aliases.set(props.topic_alias, topic);
                else topic = c.aliases.get(props.topic_alias) ?? "";
            }
            if (!validTopic(topic)) throw new Error(`protocol error: ${JSON.stringify(topic)} is not a topic name`);
            const payload = r.rest();
            stats.published++; stats.publishedQos[qos]++;
            const msg = { topic, payload, qos, retain, props };
            if (qos === 0) route(msg, c);
            else if (qos === 1) { route(msg, c); c.write(packet(4, 0, c.v5 ? Buffer.concat([u16(id), Buffer.from([0]), encodeProps({})]) : u16(id))); }
            else {
                // Method B of the spec: keep the id until PUBREL, deliver once.
                if (!c.session.qos2in.has(id)) { c.session.qos2in.add(id); route(msg, c); }
                c.write(packet(5, 0, c.v5 ? Buffer.concat([u16(id), Buffer.from([0]), encodeProps({})]) : u16(id)));
            }
        }

        function subscribe(r) {
            const id = r.u16();
            const props = c.v5 ? r.props() : {};
            const subId = props.subscription_id?.[0];
            const codes = [], sends = [];
            if (!r.left()) throw new Error("protocol error: SUBSCRIBE with no filter");
            while (r.left()) {
                const filter = r.str(), o = r.byte();
                const qos = o & 3;
                if (qos === 3 || (!c.v5 && o & 0xfc) || (c.v5 && o & 0xc0)) throw new Error("malformed packet: subscription options");
                if (!validFilter(filter)) { codes.push(c.v5 ? 0x8f : 0x80); continue; }
                if (filter.startsWith("$share/")) { codes.push(c.v5 ? 0x9e : 0x80); continue; }
                const isNew = !c.session.subs.has(filter);
                const sub = { qos, nl: !!(o & 4), rap: !!(o & 8), rh: (o >> 4) & 3, id: subId };
                c.session.subs.set(filter, sub);
                stats.subscribes++;
                codes.push(qos);
                if (sub.rh === 0 || (sub.rh === 1 && isNew)) for (const [t, m] of retained) if (matches(filter, t)) sends.push([m, { ...sub, ids: subId ? [subId] : [] }]);
            }
            c.write(packet(9, 0, Buffer.concat([u16(id), c.v5 ? encodeProps({}) : Buffer.alloc(0), Buffer.from(codes)])));
            for (const [m, sub] of sends) send(c.session, m, sub, true);
        }

        function unsubscribe(r) {
            const id = r.u16();
            if (c.v5) r.props();
            const codes = [];
            if (!r.left()) throw new Error("protocol error: UNSUBSCRIBE with no filter");
            while (r.left()) { const f = r.str(); codes.push(c.session.subs.delete(f) ? 0 : 0x11); }
            c.write(packet(11, 0, c.v5 ? Buffer.concat([u16(id), encodeProps({}), Buffer.from(codes)]) : u16(id)));
        }
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MQTT_URL: `mqtt://${USER}:${PASS}@127.0.0.1:${port}` },
        stats,
        close() { for (const s of sockets) s.destroy(); server.close(); },
        check() {
            if (!stats.connects) return "the MQTT stand-in got no accepted CONNECT";
            if (!stats.published) return "the MQTT stand-in got no PUBLISH";
            if (!stats.subscribes) return "the MQTT stand-in got no SUBSCRIBE";
            if (!stats.delivered) return "the MQTT stand-in delivered no message to a subscriber";
            if (!stats.publishedQos[1] && !stats.publishedQos[2]) return "the MQTT stand-in got no QoS 1 or 2 PUBLISH";
            return null;
        },
    };
}
