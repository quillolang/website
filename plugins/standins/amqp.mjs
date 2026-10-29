// A small AMQP 0-9-1 broker for the amqp plugin's example, written from the AMQP 0-9-1
// specification (amqp0-9-1.pdf and its XML) and RabbitMQ's errata for field-table types.
//
//   start({ port }) -> { env: { AMQP_URL }, close(), check() }
//
// Frames: type, channel, size, payload, 0xCE. Methods: connection start/start-ok, tune/tune-ok,
// open/open-ok, close/close-ok; channel open/close; exchange declare/delete (direct, fanout,
// topic with * and #, headers; passive; 406 on a different redeclare); queue declare (server
// names amq.gen-..., passive, exclusive, auto-delete, x-message-ttl, x-max-length,
// x-dead-letter-exchange), bind, unbind, purge, delete; basic qos, consume, cancel, publish
// with its content header and body frames (bodies split over frame-max), return for a
// mandatory message with no queue, deliver honouring prefetch, get/get-ok/get-empty,
// ack/nack/reject (requeue sets redelivered), recover; confirm select and one basic.ack per
// publish; heartbeats. Errors close the channel or the connection with the spec's reply codes.
import { createServer } from "node:net";

const FRAME_METHOD = 1, FRAME_HEADER = 2, FRAME_BODY = 3, FRAME_HEARTBEAT = 8, FRAME_END = 0xce;
const FRAME_MAX = 131072, CHANNEL_MAX = 2047, HEARTBEAT = 60;
const HEADER = Buffer.from("AMQP\x00\x00\x09\x01", "latin1");

// ------------------------------------------------------------------ encoding

class Reader {
    constructor(buf) { this.b = buf; this.p = 0; this.bits = 0; this.bitPos = 8; }
    octet() { this.bitPos = 8; return this.b.readUInt8(this.p++); }
    short() { this.bitPos = 8; const v = this.b.readUInt16BE(this.p); this.p += 2; return v; }
    long() { this.bitPos = 8; const v = this.b.readUInt32BE(this.p); this.p += 4; return v; }
    longlong() { this.bitPos = 8; const v = this.b.readBigUInt64BE(this.p); this.p += 8; return v; }
    shortstr() { const n = this.octet(); const s = this.b.toString("utf8", this.p, this.p + n); this.p += n; return s; }
    longstrBuf() { const n = this.long(); const s = this.b.subarray(this.p, this.p + n); this.p += n; return s; }
    longstr() { return this.longstrBuf().toString("utf8"); }
    // Consecutive bits share an octet, least significant bit first.
    bit() {
        if (this.bitPos >= 8) { this.bits = this.b.readUInt8(this.p++); this.bitPos = 0; }
        return ((this.bits >> this.bitPos++) & 1) === 1;
    }
    table() {
        const n = this.long(), end = this.p + n, t = {};
        while (this.p < end) { const k = this.shortstr(); t[k] = this.value(); }
        if (this.p !== end) throw new Error("field table length mismatch");
        return t;
    }
    value() {
        const type = String.fromCharCode(this.octet());
        switch (type) {
            case "t": return { type, v: this.octet() !== 0 };
            case "b": { const v = this.b.readInt8(this.p); this.p += 1; return { type, v }; }
            case "B": return { type, v: this.octet() };
            case "s": case "U": { const v = this.b.readInt16BE(this.p); this.p += 2; return { type, v }; }
            case "u": return { type, v: this.short() };
            case "I": { const v = this.b.readInt32BE(this.p); this.p += 4; return { type, v }; }
            case "i": return { type, v: this.long() };
            case "l": case "L": { const v = this.b.readBigInt64BE(this.p); this.p += 8; return { type: "l", v: Number(v) }; }
            case "f": { const v = this.b.readFloatBE(this.p); this.p += 4; return { type, v }; }
            case "d": { const v = this.b.readDoubleBE(this.p); this.p += 8; return { type, v }; }
            case "D": { const scale = this.octet(); const v = this.b.readInt32BE(this.p); this.p += 4; return { type, v: v / 10 ** scale, scale, raw: v }; }
            case "S": return { type, v: this.longstr() };
            case "x": return { type, v: this.longstrBuf() };
            case "A": {
                const n = this.long(), end = this.p + n, a = [];
                while (this.p < end) a.push(this.value());
                return { type, v: a };
            }
            case "T": return { type, v: Number(this.longlong()) };
            case "F": return { type, v: this.table() };
            case "V": return { type, v: null };
            default: throw new Error(`unknown field type '${type}'`);
        }
    }
    done() { return this.p >= this.b.length; }
}

class Writer {
    constructor() { this.parts = []; this.bitByte = null; }
    flushBits() { if (this.bitByte) { this.parts.push(Buffer.from([this.bitByte.v])); this.bitByte = null; } }
    raw(b) { this.flushBits(); this.parts.push(b); return this; }
    octet(v) { return this.raw(Buffer.from([v & 0xff])); }
    short(v) { const b = Buffer.alloc(2); b.writeUInt16BE(v); return this.raw(b); }
    long(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return this.raw(b); }
    longlong(v) { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(v)); return this.raw(b); }
    shortstr(s) { const b = Buffer.from(s, "utf8"); if (b.length > 255) throw new Error("shortstr too long"); return this.octet(b.length).raw(b); }
    longstr(s) { const b = Buffer.isBuffer(s) ? s : Buffer.from(s, "utf8"); return this.long(b.length).raw(b); }
    bit(v) {
        if (!this.bitByte || this.bitByte.n >= 8) { this.flushBits(); this.bitByte = { v: 0, n: 0 }; }
        if (v) this.bitByte.v |= 1 << this.bitByte.n;
        this.bitByte.n++;
        return this;
    }
    table(t) { const w = new Writer(); for (const [k, v] of Object.entries(t)) { w.shortstr(k); w.value(v); } const b = w.buf(); return this.long(b.length).raw(b); }
    value(x) {
        // Plain JS values are typed as RabbitMQ would type them.
        if (x === null || x === undefined) return this.octet(0x56);
        if (typeof x === "boolean") return this.octet(0x74).octet(x ? 1 : 0);
        if (typeof x === "number") {
            if (Number.isInteger(x)) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(x)); return this.octet(0x6c).raw(b); }
            const b = Buffer.alloc(8); b.writeDoubleBE(x); return this.octet(0x64).raw(b);
        }
        if (typeof x === "string") return this.octet(0x53).longstr(x);
        if (Buffer.isBuffer(x)) return this.octet(0x78).longstr(x);
        if (Array.isArray(x)) { const w = new Writer(); for (const y of x) w.value(y); const b = w.buf(); return this.octet(0x41).long(b.length).raw(b); }
        if (x.type) return this.typed(x);
        return this.octet(0x46).table(x);
    }
    // A value read from a client written back as it came.
    typed({ type, v, scale, raw }) {
        const c = type.charCodeAt(0);
        switch (type) {
            case "t": return this.octet(c).octet(v ? 1 : 0);
            case "b": { const b = Buffer.alloc(1); b.writeInt8(v); return this.octet(c).raw(b); }
            case "B": return this.octet(c).octet(v);
            case "s": case "U": { const b = Buffer.alloc(2); b.writeInt16BE(v); return this.octet(c).raw(b); }
            case "u": return this.octet(c).short(v);
            case "I": { const b = Buffer.alloc(4); b.writeInt32BE(v); return this.octet(c).raw(b); }
            case "i": return this.octet(c).long(v);
            case "l": { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); return this.octet(c).raw(b); }
            case "f": { const b = Buffer.alloc(4); b.writeFloatBE(v); return this.octet(c).raw(b); }
            case "d": { const b = Buffer.alloc(8); b.writeDoubleBE(v); return this.octet(c).raw(b); }
            case "D": { const b = Buffer.alloc(4); b.writeInt32BE(raw); return this.octet(c).octet(scale).raw(b); }
            case "S": return this.octet(c).longstr(v);
            case "x": return this.octet(c).longstr(v);
            case "A": { const w = new Writer(); for (const y of v) w.typed(y); const b = w.buf(); return this.octet(c).long(b.length).raw(b); }
            case "T": return this.octet(c).longlong(v);
            case "F": { const w = new Writer(); for (const [k, y] of Object.entries(v)) { w.shortstr(k); w.typed(y); } const b = w.buf(); return this.octet(c).long(b.length).raw(b); }
            case "V": return this.octet(c);
        }
        throw new Error(`cannot write field type ${type}`);
    }
    buf() { this.flushBits(); return Buffer.concat(this.parts); }
}

function frame(type, channel, payload) {
    const b = Buffer.alloc(7 + payload.length + 1);
    b.writeUInt8(type, 0); b.writeUInt16BE(channel, 1); b.writeUInt32BE(payload.length, 3);
    payload.copy(b, 7); b.writeUInt8(FRAME_END, 7 + payload.length);
    return b;
}
function method(classId, methodId, fill) {
    const w = new Writer().short(classId).short(methodId);
    if (fill) fill(w);
    return w.buf();
}

// Basic content properties, in the order of the property flags (bit 15 first).
const PROPS = [
    ["content_type", "shortstr"], ["content_encoding", "shortstr"], ["headers", "table"], ["delivery_mode", "octet"],
    ["priority", "octet"], ["correlation_id", "shortstr"], ["reply_to", "shortstr"], ["expiration", "shortstr"],
    ["message_id", "shortstr"], ["timestamp", "longlong"], ["type", "shortstr"], ["user_id", "shortstr"],
    ["app_id", "shortstr"], ["cluster_id", "shortstr"],
];
function readProps(r) {
    const flags = [];
    for (;;) { const f = r.short(); flags.push(f); if ((f & 1) === 0) break; }
    const props = {};
    PROPS.forEach(([name, type], i) => {
        const word = Math.floor(i / 15), bit = 15 - (i % 15);
        if (word < flags.length && (flags[word] >> bit) & 1) props[name] = type === "longlong" ? Number(r.longlong()) : r[type]();
    });
    return props;
}
function writeProps(w, props) {
    let flags = 0;
    const body = new Writer();
    PROPS.forEach(([name, type], i) => {
        if (props[name] === undefined) return;
        flags |= 1 << (15 - i);
        if (type === "table") body.raw(new Writer().typedTable(props[name]));
        else body[type](props[name]);
    });
    w.short(flags).raw(body.buf());
}
// A table read from a client is written back with its own field types.
Writer.prototype.typedTable = function (t) {
    const w = new Writer();
    for (const [k, v] of Object.entries(t)) { w.shortstr(k); w.typed(v); }
    const b = w.buf();
    return new Writer().long(b.length).raw(b).buf();
};
const plain = (t) => Object.fromEntries(Object.entries(t ?? {}).map(([k, x]) => [k, x.type === "F" ? plain(x.v) : x.type === "A" ? x.v.map((y) => y.v) : x.v]));

// ------------------------------------------------------------------ errors

// Reply codes, from the spec's constants.
const CODES = {
    200: "REPLY_SUCCESS", 312: "NO_ROUTE", 313: "NO_CONSUMERS", 320: "CONNECTION_FORCED", 402: "INVALID_PATH",
    403: "ACCESS_REFUSED", 404: "NOT_FOUND", 405: "RESOURCE_LOCKED", 406: "PRECONDITION_FAILED", 501: "FRAME_ERROR",
    502: "SYNTAX_ERROR", 503: "COMMAND_INVALID", 504: "CHANNEL_ERROR", 505: "UNEXPECTED_FRAME", 506: "RESOURCE_ERROR",
    530: "NOT_ALLOWED", 540: "NOT_IMPLEMENTED", 541: "INTERNAL_ERROR",
};
class ChannelError extends Error { constructor(code, text) { super(text); this.code = code; } }
class ConnectionError extends Error { constructor(code, text) { super(text); this.code = code; } }
const replyText = (code, text) => `${CODES[code]} - ${text}`;

// ------------------------------------------------------------------ broker

export async function start({ port }) {
    const USER = "guest", PASS = "guest", VHOST = "/";
    const stats = { connections: 0, published: 0, delivered: 0, got: 0, acked: 0, nacked: 0, rejected: 0, confirms: 0, returned: 0, errors: [] };
    const exchanges = new Map();
    const queues = new Map();
    const sockets = new Set();
    for (const [name, type] of [["", "direct"], ["amq.direct", "direct"], ["amq.fanout", "fanout"], ["amq.topic", "topic"], ["amq.headers", "headers"], ["amq.match", "headers"]])
        exchanges.set(name, { name, type, durable: true, autoDelete: false, internal: false, bindings: [] });
    let genCount = 0;
    const gen = (prefix) => `${prefix}${Date.now().toString(36)}${(++genCount).toString(36)}${Math.random().toString(36).slice(2, 10)}`;

    const topicMatch = (pattern, key) => {
        const p = pattern.split("."), k = key === "" ? [] : key.split(".");
        const m = (i, j) => {
            if (i === p.length) return j === k.length;
            if (p[i] === "#") { for (let x = j; x <= k.length; x++) if (m(i + 1, x)) return true; return false; }
            if (j === k.length) return false;
            return (p[i] === "*" || p[i] === k[j]) && m(i + 1, j + 1);
        };
        return m(0, 0);
    };
    const headersMatch = (args, headers) => {
        const a = plain(args), h = plain(headers);
        const any = a["x-match"] === "any" || a["x-match"] === "any-with-x";
        const keys = Object.keys(a).filter((k) => !k.startsWith("x-"));
        if (keys.length === 0) return true;
        const ok = (k) => (a[k] === null || a[k] === undefined ? k in h : String(h[k]) === String(a[k]));
        return any ? keys.some(ok) : keys.every(ok);
    };
    function route(ex, key, props) {
        if (ex.name === "") return queues.has(key) ? [queues.get(key)] : [];
        const out = new Set();
        for (const b of ex.bindings) {
            const hit = ex.type === "fanout" ? true
                : ex.type === "direct" ? b.key === key
                : ex.type === "topic" ? topicMatch(b.key, key)
                : ex.type === "headers" ? headersMatch(b.args, props.headers) : false;
            if (hit && queues.has(b.queue)) out.add(queues.get(b.queue));
        }
        return [...out];
    }
    function deadLetter(q, msg, reason) {
        const dlx = q.args["x-dead-letter-exchange"]?.v;
        if (dlx === undefined || !exchanges.has(dlx)) return;
        const key = q.args["x-dead-letter-routing-key"]?.v ?? msg.routingKey;
        const props = { ...msg.props, headers: { ...(msg.props.headers ?? {}), "x-first-death-reason": { type: "S", v: reason }, "x-first-death-queue": { type: "S", v: q.name } } };
        delete props.expiration;
        for (const target of route(exchanges.get(dlx), key, props)) enqueue(target, { ...msg, props, routingKey: key, redelivered: false });
    }
    function expired(q, msg) {
        const ttl = msg.props.expiration !== undefined ? Number(msg.props.expiration) : q.args["x-message-ttl"]?.v;
        return ttl !== undefined && !Number.isNaN(ttl) && Date.now() - msg.at >= ttl;
    }
    function dropExpired(q) {
        while (q.messages.length && expired(q, q.messages[0])) deadLetter(q, q.messages.shift(), "expired");
    }
    function enqueue(q, msg) {
        q.messages.push({ ...msg, at: msg.at ?? Date.now() });
        const max = q.args["x-max-length"]?.v;
        while (max !== undefined && q.messages.length > max) deadLetter(q, q.messages.shift(), "maxlen");
        setImmediate(() => pump(q));
    }
    // Gives ready messages to the queue's consumers, round robin, while each has room under its prefetch.
    function pump(q) {
        dropExpired(q);
        let turned = 0;
        while (q.messages.length && q.consumers.length && turned < q.consumers.length) {
            const c = q.consumers[q.next % q.consumers.length];
            q.next++;
            if (!c.noAck && c.prefetch > 0 && c.unacked >= c.prefetch) { turned++; continue; }
            if (c.ch.closing || !c.ch.flow) { turned++; continue; }
            turned = 0;
            const msg = q.messages.shift();
            if (expired(q, msg)) { deadLetter(q, msg, "expired"); continue; }
            const tag = ++c.ch.deliveryTag;
            if (!c.noAck) { c.unacked++; c.ch.unacked.set(tag, { msg, queue: q, consumer: c }); }
            stats.delivered++;
            c.ch.conn.send(c.ch.id, method(60, 60, (w) => w.shortstr(c.tag).longlong(tag).bit(msg.redelivered).shortstr(msg.exchange).shortstr(msg.routingKey)));
            c.ch.conn.content(c.ch.id, msg);
        }
    }
    function deleteQueue(q, reason) {
        queues.delete(q.name);
        for (const ex of exchanges.values()) ex.bindings = ex.bindings.filter((b) => b.queue !== q.name);
        for (const c of q.consumers) {
            c.ch.consumers.delete(c.tag);
            // consumer_cancel_notify: the broker tells the client its consumer is gone.
            if (c.ch.conn.cancelNotify && !c.ch.closing) c.ch.conn.send(c.ch.id, method(60, 30, (w) => w.shortstr(c.tag).bit(true)));
        }
        q.consumers = [];
        return reason;
    }
    function settle(ch, tag, multiple, requeue, how) {
        const tags = multiple ? [...ch.unacked.keys()].filter((t) => t <= tag) : [tag];
        if (!multiple && !ch.unacked.has(tag)) throw new ChannelError(406, `unknown delivery tag ${tag}`);
        for (const t of tags) {
            const u = ch.unacked.get(t);
            ch.unacked.delete(t);
            if (u.consumer) u.consumer.unacked--;
            if (how === "ack") stats.acked++;
            else {
                how === "nack" ? stats.nacked++ : stats.rejected++;
                if (requeue && queues.get(u.queue.name) === u.queue) u.queue.messages.unshift({ ...u.msg, redelivered: true });
                else deadLetter(u.queue, u.msg, "rejected");
            }
            setImmediate(() => pump(u.queue));
        }
    }

    class Conn {
        constructor(sock) {
            this.sock = sock; this.buf = Buffer.alloc(0); this.state = "header"; this.channels = new Map();
            this.frameMax = FRAME_MAX; this.heartbeat = 0; this.lastSeen = Date.now(); this.closing = false; this.cancelNotify = false;
            this.id = ++stats.connections;
            sock.on("data", (d) => this.data(d));
            sock.on("error", () => {});
            sock.on("close", () => this.gone());
        }
        send(channel, payload) { if (!this.sock.destroyed) this.sock.write(frame(FRAME_METHOD, channel, payload)); }
        content(channel, msg) {
            const w = new Writer().short(60).short(0).longlong(msg.body.length);
            writeProps(w, msg.props);
            this.sock.write(frame(FRAME_HEADER, channel, w.buf()));
            const chunk = this.frameMax - 8;
            for (let i = 0; i < msg.body.length; i += chunk) this.sock.write(frame(FRAME_BODY, channel, msg.body.subarray(i, i + chunk)));
        }
        closeConnection(code, text, classId = 0, methodId = 0) {
            if (this.closing) return;
            this.closing = true;
            stats.errors.push(`connection ${code} ${text}`);
            this.send(0, method(10, 50, (w) => w.short(code).shortstr(replyText(code, text)).short(classId).short(methodId)));
            setTimeout(() => this.sock.destroy(), 1000);
        }
        data(d) {
            this.lastSeen = Date.now();
            this.buf = Buffer.concat([this.buf, d]);
            if (this.state === "header") {
                if (this.buf.length < 8) return;
                if (!this.buf.subarray(0, 8).equals(HEADER)) {
                    // The spec: answer with the protocol header we speak, then close.
                    this.sock.end(HEADER);
                    return;
                }
                this.buf = this.buf.subarray(8);
                this.state = "start";
                const caps = { publisher_confirms: true, exchange_exchange_bindings: false, "basic.nack": true, consumer_cancel_notify: true, "connection.blocked": false, consumer_priorities: false, authentication_failure_close: true, per_consumer_qos: true, direct_reply_to: false };
                this.send(0, method(10, 10, (w) => w.octet(0).octet(9).table({ product: "quillo amqp stand-in", version: "1.0.0", platform: `Node.js ${process.version}`, capabilities: caps }).longstr("PLAIN AMQPLAIN").longstr("en_US")));
            }
            while (this.buf.length >= 8) {
                const size = this.buf.readUInt32BE(3);
                if (size > this.frameMax) return this.closeConnection(501, `frame size ${size} is over frame-max ${this.frameMax}`);
                if (this.buf.length < size + 8) return;
                const type = this.buf.readUInt8(0), channel = this.buf.readUInt16BE(1);
                const payload = this.buf.subarray(7, 7 + size);
                if (this.buf.readUInt8(7 + size) !== FRAME_END) return this.closeConnection(501, "frame does not end with 0xCE");
                this.buf = this.buf.subarray(8 + size);
                try { this.frame(type, channel, payload); } catch (e) {
                    if (e instanceof ChannelError) this.channelError(channel, e.code, e.message, e.classId, e.methodId);
                    else if (e instanceof ConnectionError) this.closeConnection(e.code, e.message, e.classId, e.methodId);
                    else this.closeConnection(502, `could not read the frame: ${e.message}`);
                }
            }
        }
        channelError(id, code, text, classId = 0, methodId = 0) {
            const ch = this.channels.get(id);
            if (!ch) return this.closeConnection(504, `channel ${id} is not open`);
            stats.errors.push(`channel ${code} ${text}`);
            this.closeChannel(ch);
            ch.closing = true;
            this.send(id, method(20, 40, (w) => w.short(code).shortstr(replyText(code, text)).short(classId).short(methodId)));
        }
        // Releases a channel's consumers and gives its unacked messages back.
        closeChannel(ch) {
            for (const c of ch.consumers.values()) {
                c.queue.consumers = c.queue.consumers.filter((x) => x !== c);
                if (c.queue.autoDelete && c.queue.consumers.length === 0 && c.queue.hadConsumer) deleteQueue(c.queue);
            }
            ch.consumers.clear();
            const back = [...ch.unacked.entries()].sort((a, b) => b[0] - a[0]);
            for (const [, u] of back) if (queues.get(u.queue.name) === u.queue) { u.queue.messages.unshift({ ...u.msg, redelivered: true }); setImmediate(() => pump(u.queue)); }
            ch.unacked.clear();
        }
        gone() {
            clearInterval(this.beat);
            sockets.delete(this.sock);
            for (const ch of this.channels.values()) this.closeChannel(ch);
            for (const q of [...queues.values()]) if (q.owner === this) deleteQueue(q);
        }
        frame(type, channel, payload) {
            if (type === FRAME_HEARTBEAT) {
                if (channel !== 0) throw new ConnectionError(501, "a heartbeat frame must be on channel 0");
                return;
            }
            if (this.closing) {
                // After connection.close, only close-ok matters.
                if (type === FRAME_METHOD && payload.readUInt16BE(0) === 10 && payload.readUInt16BE(2) === 51) this.sock.destroy();
                return;
            }
            if (type === FRAME_HEADER || type === FRAME_BODY) return this.contentFrame(type, channel, payload);
            if (type !== FRAME_METHOD) throw new ConnectionError(505, `unknown frame type ${type}`);
            const r = new Reader(payload);
            const classId = r.short(), methodId = r.short();
            try {
                if (channel === 0) return this.connectionMethod(classId, methodId, r);
                if (this.state !== "open") throw new ConnectionError(504, "channel methods before connection.open");
                const ch = this.channels.get(channel);
                if (classId === 20 && methodId === 10) return this.channelOpen(channel);
                if (!ch) throw new ConnectionError(504, `expected 'channel.open' first on channel ${channel}`);
                if (ch.closing) {
                    // A channel that is closing drops everything but close and close-ok.
                    if (classId === 20 && methodId === 41) this.channels.delete(channel);
                    if (classId === 20 && methodId === 40) { this.send(channel, method(20, 41)); this.channels.delete(channel); }
                    return;
                }
                if (ch.pending) throw new ConnectionError(505, "expected a content header or body frame, got a method");
                this.channelMethod(ch, classId, methodId, r);
            } catch (e) {
                if (e instanceof ChannelError || e instanceof ConnectionError) { e.classId ??= classId; e.methodId ??= methodId; }
                throw e;
            }
        }
        connectionMethod(classId, methodId, r) {
            if (classId !== 10) throw new ConnectionError(503, `class ${classId} is not allowed on channel 0`);
            const m = methodId;
            if (this.state === "start" && m === 11) {
                const clientProps = r.table(), mechanism = r.shortstr(), response = r.longstrBuf(), locale = r.shortstr();
                this.cancelNotify = !!clientProps.capabilities?.v?.consumer_cancel_notify?.v;
                let user, pass;
                if (mechanism === "PLAIN") [, user, pass] = response.toString("utf8").split("\0");
                else if (mechanism === "AMQPLAIN") {
                    // AMQPLAIN's response is a field table's entries, without the table's length.
                    const tb = Buffer.alloc(4 + response.length); tb.writeUInt32BE(response.length); response.copy(tb, 4);
                    const t = plain(new Reader(tb).table()); user = t.LOGIN; pass = t.PASSWORD;
                }
                else throw new ConnectionError(403, `unknown authentication mechanism '${mechanism}'`);
                if (locale !== "en_US") throw new ConnectionError(403, `locale '${locale}' is not supported`);
                if (user !== USER || pass !== PASS) throw new ConnectionError(403, `Login was refused using authentication mechanism ${mechanism}. For details see the broker logfile.`);
                this.state = "tune";
                this.send(0, method(10, 30, (w) => w.short(CHANNEL_MAX).long(FRAME_MAX).short(HEARTBEAT)));
                return;
            }
            if (this.state === "tune" && m === 31) {
                const channelMax = r.short(), frameMax = r.long(), heartbeat = r.short();
                if (frameMax !== 0 && frameMax < 4096) throw new ConnectionError(530, `frame-max ${frameMax} is under the minimum 4096`);
                if (frameMax > FRAME_MAX) throw new ConnectionError(530, `frame-max ${frameMax} is over the broker's ${FRAME_MAX}`);
                this.channelMax = channelMax || CHANNEL_MAX;
                this.frameMax = frameMax || FRAME_MAX;
                this.heartbeat = heartbeat;
                if (heartbeat > 0) {
                    this.beat = setInterval(() => {
                        if (Date.now() - this.lastSeen > heartbeat * 2000) { this.sock.destroy(); return; }
                        if (!this.sock.destroyed) this.sock.write(frame(FRAME_HEARTBEAT, 0, Buffer.alloc(0)));
                    }, heartbeat * 1000);
                    this.beat.unref?.();
                }
                this.state = "open-wait";
                return;
            }
            if (this.state === "open-wait" && m === 40) {
                const vhost = r.shortstr();
                if (vhost !== VHOST) throw new ConnectionError(530, `vhost '${vhost}' not found`);
                this.state = "open";
                this.send(0, method(10, 41, (w) => w.shortstr("")));
                return;
            }
            if (m === 50) { this.send(0, method(10, 51)); this.sock.end(); return; }
            if (m === 51) { this.sock.destroy(); return; }
            if (this.state === "open" && m === 70) { r.longstr(); r.shortstr(); this.send(0, method(10, 71)); return; } // update-secret
            throw new ConnectionError(503, `connection method ${m} is not expected now (state ${this.state})`);
        }
        channelOpen(id) {
            if (this.channels.has(id)) throw new ConnectionError(504, `second 'channel.open' seen on channel ${id}`);
            if (id > this.channelMax) throw new ConnectionError(530, `channel ${id} is over channel-max ${this.channelMax}`);
            this.channels.set(id, { id, conn: this, closing: false, flow: true, confirm: false, publishSeq: 0, deliveryTag: 0, unacked: new Map(), prefetch: 0, consumers: new Map(), pending: null });
            this.send(id, method(20, 11, (w) => w.longstr("")));
        }
        channelMethod(ch, classId, m, r) {
            const key = `${classId}.${m}`;
            switch (key) {
                case "20.40": { // channel.close
                    r.short(); r.shortstr(); r.short(); r.short();
                    this.closeChannel(ch);
                    this.channels.delete(ch.id);
                    return this.send(ch.id, method(20, 41));
                }
                case "20.41": return;
                case "20.20": { // channel.flow
                    ch.flow = r.bit();
                    this.send(ch.id, method(20, 21, (w) => w.bit(ch.flow)));
                    for (const c of ch.consumers.values()) pump(c.queue);
                    return;
                }
                case "40.10": { // exchange.declare
                    r.short();
                    const name = r.shortstr(), type = r.shortstr();
                    const passive = r.bit(), durable = r.bit(), autoDelete = r.bit(), internal = r.bit(), noWait = r.bit();
                    const args = r.table();
                    const ex = exchanges.get(name);
                    if (passive) {
                        if (!ex) throw new ChannelError(404, `no exchange '${name}' in vhost '${VHOST}'`);
                    } else {
                        if (name === "" || name.startsWith("amq.")) {
                            if (!ex || ex.type !== type) throw new ChannelError(403, `exchange name '${name}' contains reserved prefix 'amq.*'`);
                        } else if (ex) {
                            if (ex.type !== type) throw new ChannelError(406, `inequivalent arg 'type' for exchange '${name}' in vhost '${VHOST}': received '${type}' but current is '${ex.type}'`);
                            if (ex.durable !== durable) throw new ChannelError(406, `inequivalent arg 'durable' for exchange '${name}' in vhost '${VHOST}': received '${durable}' but current is '${ex.durable}'`);
                            if (ex.autoDelete !== autoDelete) throw new ChannelError(406, `inequivalent arg 'auto_delete' for exchange '${name}' in vhost '${VHOST}': received '${autoDelete}' but current is '${ex.autoDelete}'`);
                        } else {
                            if (!["direct", "fanout", "topic", "headers"].includes(type)) throw new ConnectionError(503, `invalid exchange type '${type}'`);
                            exchanges.set(name, { name, type, durable, autoDelete, internal, args, bindings: [] });
                        }
                    }
                    if (!noWait) this.send(ch.id, method(40, 11));
                    return;
                }
                case "40.20": { // exchange.delete
                    r.short();
                    const name = r.shortstr(), ifUnused = r.bit(), noWait = r.bit();
                    const ex = exchanges.get(name);
                    if (!ex) throw new ChannelError(404, `no exchange '${name}' in vhost '${VHOST}'`);
                    if (name === "" || name.startsWith("amq.")) throw new ChannelError(403, `operation not permitted on the exchange '${name}'`);
                    if (ifUnused && ex.bindings.length) throw new ChannelError(406, `exchange '${name}' in vhost '${VHOST}' in use`);
                    exchanges.delete(name);
                    if (!noWait) this.send(ch.id, method(40, 21));
                    return;
                }
                case "50.10": { // queue.declare
                    r.short();
                    let name = r.shortstr();
                    const passive = r.bit(), durable = r.bit(), exclusive = r.bit(), autoDelete = r.bit(), noWait = r.bit();
                    const args = r.table();
                    let q = queues.get(name);
                    if (q && q.exclusive && q.owner !== this) throw new ChannelError(405, `cannot obtain exclusive access to locked queue '${name}' in vhost '${VHOST}'. It could be originally declared on another connection or the exclusive property value does not match that of the original declaration.`);
                    if (passive) {
                        if (!q) throw new ChannelError(404, `no queue '${name}' in vhost '${VHOST}'`);
                    } else if (q) {
                        if (q.durable !== durable) throw new ChannelError(406, `inequivalent arg 'durable' for queue '${name}' in vhost '${VHOST}': received '${durable}' but current is '${q.durable}'`);
                        if (q.autoDelete !== autoDelete) throw new ChannelError(406, `inequivalent arg 'auto_delete' for queue '${name}' in vhost '${VHOST}': received '${autoDelete}' but current is '${q.autoDelete}'`);
                        for (const k of ["x-message-ttl", "x-max-length", "x-dead-letter-exchange", "x-queue-type"]) {
                            if ((args[k]?.v ?? null) !== (q.args[k]?.v ?? null)) throw new ChannelError(406, `inequivalent arg '${k}' for queue '${name}' in vhost '${VHOST}': received ${JSON.stringify(args[k]?.v ?? "none")} but current is ${JSON.stringify(q.args[k]?.v ?? "none")}`);
                        }
                    } else {
                        if (name === "") name = gen("amq.gen-");
                        else if (name.startsWith("amq.")) throw new ChannelError(403, `queue name '${name}' contains reserved prefix 'amq.*'`);
                        for (const k of ["x-message-ttl", "x-max-length"]) {
                            if (args[k] && !(Number.isInteger(args[k].v) && args[k].v >= 0)) throw new ChannelError(406, `invalid arg '${k}' for queue '${name}' in vhost '${VHOST}': must be a non-negative integer`);
                        }
                        q = { name, durable, exclusive, autoDelete, args, owner: exclusive ? this : null, messages: [], consumers: [], next: 0, hadConsumer: false };
                        queues.set(name, q);
                    }
                    dropExpired(q);
                    if (!noWait) this.send(ch.id, method(50, 11, (w) => w.shortstr(q.name).long(q.messages.length).long(q.consumers.length)));
                    return;
                }
                case "50.20": case "50.50": { // queue.bind, queue.unbind
                    r.short();
                    const queue = r.shortstr(), exchange = r.shortstr(), routingKey = r.shortstr();
                    const noWait = m === 20 ? r.bit() : false;
                    const args = r.table();
                    const q = queues.get(queue), ex = exchanges.get(exchange);
                    if (!q) throw new ChannelError(404, `no queue '${queue}' in vhost '${VHOST}'`);
                    if (!ex) throw new ChannelError(404, `no exchange '${exchange}' in vhost '${VHOST}'`);
                    if (exchange === "") throw new ChannelError(403, `operation not permitted on the default exchange`);
                    const same = (b) => b.queue === queue && b.key === routingKey && JSON.stringify(plain(b.args)) === JSON.stringify(plain(args));
                    if (m === 20) { if (!ex.bindings.some(same)) ex.bindings.push({ queue, key: routingKey, args }); if (!noWait) this.send(ch.id, method(50, 21)); }
                    else { ex.bindings = ex.bindings.filter((b) => !same(b)); this.send(ch.id, method(50, 51)); }
                    return;
                }
                case "50.30": { // queue.purge
                    r.short();
                    const queue = r.shortstr(), noWait = r.bit();
                    const q = queues.get(queue);
                    if (!q) throw new ChannelError(404, `no queue '${queue}' in vhost '${VHOST}'`);
                    const n = q.messages.length; q.messages = [];
                    if (!noWait) this.send(ch.id, method(50, 31, (w) => w.long(n)));
                    return;
                }
                case "50.40": { // queue.delete
                    r.short();
                    const queue = r.shortstr(), ifUnused = r.bit(), ifEmpty = r.bit(), noWait = r.bit();
                    const q = queues.get(queue);
                    if (!q) { if (!noWait) this.send(ch.id, method(50, 41, (w) => w.long(0))); return; }
                    if (q.exclusive && q.owner !== this) throw new ChannelError(405, `cannot obtain exclusive access to locked queue '${queue}' in vhost '${VHOST}'`);
                    if (ifUnused && q.consumers.length) throw new ChannelError(406, `queue '${queue}' in vhost '${VHOST}' in use`);
                    if (ifEmpty && q.messages.length) throw new ChannelError(406, `queue '${queue}' in vhost '${VHOST}' is not empty`);
                    const n = q.messages.length;
                    deleteQueue(q);
                    if (!noWait) this.send(ch.id, method(50, 41, (w) => w.long(n)));
                    return;
                }
                case "60.10": { // basic.qos
                    const size = r.long(), count = r.short(), global = r.bit();
                    if (size !== 0) throw new ConnectionError(540, "prefetch_size!=0 (" + size + ")");
                    if (!global) ch.prefetch = count;
                    this.send(ch.id, method(60, 11));
                    return;
                }
                case "60.20": { // basic.consume
                    r.short();
                    const queue = r.shortstr(); let tag = r.shortstr();
                    const noLocal = r.bit(), noAck = r.bit(), exclusive = r.bit(), noWait = r.bit();
                    r.table();
                    const q = queues.get(queue);
                    if (!q) throw new ChannelError(404, `no queue '${queue}' in vhost '${VHOST}'`);
                    if (q.exclusive && q.owner !== this) throw new ChannelError(405, `cannot obtain exclusive access to locked queue '${queue}' in vhost '${VHOST}'`);
                    if (q.consumers.some((c) => c.exclusive) || (exclusive && q.consumers.length)) throw new ChannelError(403, `queue '${queue}' in vhost '${VHOST}' in exclusive use`);
                    if (tag === "") tag = gen("amq.ctag-");
                    if (ch.consumers.has(tag)) throw new ConnectionError(530, `attempt to reuse consumer tag '${tag}'`);
                    const c = { tag, queue: q, ch, noAck, noLocal, exclusive, prefetch: ch.prefetch, unacked: 0 };
                    ch.consumers.set(tag, c);
                    q.consumers.push(c);
                    q.hadConsumer = true;
                    if (!noWait) this.send(ch.id, method(60, 21, (w) => w.shortstr(tag)));
                    setImmediate(() => pump(q));
                    return;
                }
                case "60.30": { // basic.cancel
                    const tag = r.shortstr(), noWait = r.bit();
                    const c = ch.consumers.get(tag);
                    if (c) {
                        ch.consumers.delete(tag);
                        c.queue.consumers = c.queue.consumers.filter((x) => x !== c);
                        if (c.queue.autoDelete && c.queue.consumers.length === 0) deleteQueue(c.queue);
                    }
                    if (!noWait) this.send(ch.id, method(60, 31, (w) => w.shortstr(tag)));
                    return;
                }
                case "60.40": { // basic.publish: the content header and body frames follow
                    r.short();
                    const exchange = r.shortstr(), routingKey = r.shortstr(), mandatory = r.bit(), immediate = r.bit();
                    if (immediate) throw new ConnectionError(540, "immediate=true");
                    ch.pending = { exchange, routingKey, mandatory, props: null, size: null, parts: [], got: 0 };
                    return;
                }
                case "60.70": { // basic.get
                    r.short();
                    const queue = r.shortstr(), noAck = r.bit();
                    const q = queues.get(queue);
                    if (!q) throw new ChannelError(404, `no queue '${queue}' in vhost '${VHOST}'`);
                    if (q.exclusive && q.owner !== this) throw new ChannelError(405, `cannot obtain exclusive access to locked queue '${queue}' in vhost '${VHOST}'`);
                    dropExpired(q);
                    const msg = q.messages.shift();
                    if (!msg) { this.send(ch.id, method(60, 72, (w) => w.shortstr(""))); return; }
                    const tag = ++ch.deliveryTag;
                    if (!noAck) ch.unacked.set(tag, { msg, queue: q, consumer: null });
                    stats.got++;
                    this.send(ch.id, method(60, 71, (w) => w.longlong(tag).bit(msg.redelivered).shortstr(msg.exchange).shortstr(msg.routingKey).long(q.messages.length)));
                    this.content(ch.id, msg);
                    return;
                }
                case "60.80": { const tag = Number(r.longlong()), multiple = r.bit(); return settle(ch, tag, multiple, false, "ack"); }
                case "60.90": { const tag = Number(r.longlong()), requeue = r.bit(); return settle(ch, tag, false, requeue, "reject"); }
                case "60.120": { const tag = Number(r.longlong()), multiple = r.bit(), requeue = r.bit(); return settle(ch, tag, multiple, requeue, "nack"); }
                case "60.100": case "60.110": { // basic.recover-async, basic.recover
                    const requeue = r.bit();
                    if (!requeue) throw new ConnectionError(540, "requeue=false");
                    const back = [...ch.unacked.entries()].sort((a, b) => b[0] - a[0]);
                    ch.unacked.clear();
                    for (const [, u] of back) { if (u.consumer) u.consumer.unacked--; u.queue.messages.unshift({ ...u.msg, redelivered: true }); setImmediate(() => pump(u.queue)); }
                    if (m === 110) this.send(ch.id, method(60, 111));
                    return;
                }
                case "85.10": { // confirm.select
                    const noWait = r.bit();
                    ch.confirm = true;
                    if (!noWait) this.send(ch.id, method(85, 11));
                    return;
                }
                case "90.10": case "90.20": case "90.30":
                    throw new ConnectionError(540, "transactions are not implemented by this stand-in");
            }
            throw new ConnectionError(540, `method ${classId}.${m} is not implemented by this stand-in`);
        }
        contentFrame(type, channel, payload) {
            const ch = this.channels.get(channel);
            if (!ch) throw new ConnectionError(504, `content on channel ${channel}, which is not open`);
            if (ch.closing) return;
            const p = ch.pending;
            if (!p) throw new ConnectionError(505, `unexpected ${type === FRAME_HEADER ? "content header" : "content body"} frame on channel ${channel}`);
            if (type === FRAME_HEADER) {
                if (p.props) throw new ConnectionError(505, "a second content header frame");
                const r = new Reader(payload);
                const classId = r.short(); r.short();
                if (classId !== 60) throw new ConnectionError(505, `content header for class ${classId}, expected 60`);
                p.size = Number(r.longlong());
                p.props = readProps(r);
            } else {
                if (!p.props) throw new ConnectionError(505, "a content body frame before its header");
                p.parts.push(Buffer.from(payload)); p.got += payload.length;
                if (p.got > p.size) throw new ConnectionError(501, `content body is longer than its header said (${p.size})`);
            }
            if (p.props && p.got === p.size) {
                ch.pending = null;
                // An error in a publish is reported against basic.publish (60, 40).
                try { this.publish(ch, p); } catch (e) { e.classId = 60; e.methodId = 40; throw e; }
            }
        }
        publish(ch, p) {
            if (ch.confirm) ch.publishSeq++;
            const ex = exchanges.get(p.exchange);
            if (!ex) throw new ChannelError(404, `no exchange '${p.exchange}' in vhost '${VHOST}'`);
            if (ex.internal) throw new ChannelError(403, `cannot publish to internal exchange '${p.exchange}' in vhost '${VHOST}'`);
            if (p.props.user_id !== undefined && p.props.user_id !== USER) throw new ChannelError(406, `user_id property set to '${p.props.user_id}' but authenticated user was '${USER}'`);
            if (p.props.delivery_mode !== undefined && p.props.delivery_mode !== 1 && p.props.delivery_mode !== 2) throw new ChannelError(406, `invalid delivery mode ${p.props.delivery_mode}`);
            const msg = { exchange: p.exchange, routingKey: p.routingKey, props: p.props, body: Buffer.concat(p.parts), redelivered: false };
            stats.published++;
            const targets = route(ex, p.routingKey, p.props);
            if (targets.length === 0 && p.mandatory) {
                stats.returned++;
                this.send(ch.id, method(60, 50, (w) => w.short(312).shortstr("NO_ROUTE").shortstr(p.exchange).shortstr(p.routingKey)));
                this.content(ch.id, msg);
            }
            for (const q of targets) enqueue(q, msg);
            if (ch.confirm) { stats.confirms++; this.send(ch.id, method(60, 80, (w) => w.longlong(ch.publishSeq).bit(false))); }
        }
    }

    const server = createServer((sock) => { sockets.add(sock); new Conn(sock); });
    await new Promise((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
    return {
        env: { AMQP_URL: `amqp://${USER}:${PASS}@127.0.0.1:${port}/%2f` },
        close() { for (const s of sockets) s.destroy(); server.close(); },
        check() {
            if (stats.connections === 0) return "the AMQP stand-in got no connection";
            if (stats.published === 0) return "the AMQP stand-in got no basic.publish";
            if (stats.confirms === 0) return "the AMQP stand-in confirmed no publish (confirm.select never sent)";
            if (stats.delivered + stats.got === 0) return "the AMQP stand-in delivered no message (no basic.get or basic.consume)";
            if (stats.acked === 0) return "the AMQP stand-in got no basic.ack";
            return null;
        },
        stats,
    };
}
