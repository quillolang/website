// A one-broker Kafka for the kafka plugin's example, written from the protocol guide
// (kafka.apache.org/protocol) and the message schemas' version rules.
//
// It speaks the versions it says it speaks in ApiVersions, and only those: ApiVersions 0-3
// (v3 is the flexible one: compact strings and tagged fields in the request; the answer's
// header stays v0, as the guide says), Metadata 0-4, CreateTopics 0-4, Produce 3-7, Fetch 4,
// ListOffsets 0-3. Anything else closes the connection, as a broker does. Record batches are
// magic v2, kept as they came with the base offset rewritten (outside the CRC), their
// CRC-32C checked on the way in (CORRUPT_MESSAGE otherwise), and fetched whole, never split.
// Topics are not created on a Metadata request (auto.create.topics.enable=false).
import { createServer } from "node:net";
import { gunzipSync } from "node:zlib";

const E = { NONE: 0, OFFSET_OUT_OF_RANGE: 1, CORRUPT_MESSAGE: 2, UNKNOWN_TOPIC_OR_PARTITION: 3, INVALID_TOPIC: 17,
    INVALID_REQUIRED_ACKS: 21, UNSUPPORTED_VERSION: 35, TOPIC_ALREADY_EXISTS: 36, INVALID_PARTITIONS: 37,
    INVALID_REPLICATION_FACTOR: 38, INVALID_REQUEST: 42 };
const API = { Produce: 0, Fetch: 1, ListOffsets: 2, Metadata: 3, CreateTopics: 19, ApiVersions: 18 };
const SUPPORTED = [[API.Produce, 3, 7], [API.Fetch, 4, 4], [API.ListOffsets, 0, 3], [API.Metadata, 0, 4], [API.ApiVersions, 0, 3], [API.CreateTopics, 0, 4]];

// CRC-32C (Castagnoli, reflected polynomial 0x82F63B78), as record batches v2 use.
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1; t[i] = c >>> 0; }
    return t;
})();
function crc32c(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

class Reader {
    constructor(buf) { this.b = buf; this.p = 0; }
    need(n) { if (this.p + n > this.b.length) throw new Error("short request"); }
    i8() { this.need(1); return this.b.readInt8(this.p++); }
    i16() { this.need(2); const v = this.b.readInt16BE(this.p); this.p += 2; return v; }
    i32() { this.need(4); const v = this.b.readInt32BE(this.p); this.p += 4; return v; }
    i64() { this.need(8); const v = this.b.readBigInt64BE(this.p); this.p += 8; return v; }
    bool() { return this.i8() !== 0; }
    uvarint() { let v = 0, s = 0, b; do { this.need(1); b = this.b[this.p++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return v; }
    varint() { const u = this.uvarint(); return u % 2 ? -(u + 1) / 2 : u / 2; }
    bytes(n) { this.need(n); const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
    str() { const n = this.i16(); return n < 0 ? null : this.bytes(n).toString("utf8"); }
    cstr() { const n = this.uvarint() - 1; return n < 0 ? null : this.bytes(n).toString("utf8"); }
    nbytes() { const n = this.i32(); return n < 0 ? null : this.bytes(n); }
    array(f) { const n = this.i32(); if (n < 0) return null; const out = []; for (let i = 0; i < n; i++) out.push(f()); return out; }
    tags() { const n = this.uvarint(); for (let i = 0; i < n; i++) { this.uvarint(); this.bytes(this.uvarint()); } }
}

class Writer {
    constructor() { this.parts = []; }
    raw(b) { this.parts.push(b); return this; }
    i8(v) { const b = Buffer.alloc(1); b.writeInt8(v); return this.raw(b); }
    i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v); return this.raw(b); }
    i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v); return this.raw(b); }
    i64(v) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); return this.raw(b); }
    bool(v) { return this.i8(v ? 1 : 0); }
    uvarint(v) { const out = []; do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 0x80; out.push(b); } while (v > 0); return this.raw(Buffer.from(out)); }
    str(s) { if (s == null) return this.i16(-1); const b = Buffer.from(s); this.i16(b.length); return this.raw(b); }
    nbytes(b) { if (b == null) return this.i32(-1); this.i32(b.length); return this.raw(b); }
    array(xs, f) { if (xs == null) return this.i32(-1); this.i32(xs.length); xs.forEach((x) => f(x)); return this; }
    carray(xs, f) { this.uvarint(xs.length + 1); xs.forEach((x) => f(x)); return this; }
    tags() { return this.uvarint(0); }
    buf() { return Buffer.concat(this.parts); }
}

// One record batch's header read, its CRC checked, and (when it is not compressed, or gzip) its
// records decoded, for check().
function readBatches(records) {
    const out = [];
    let p = 0;
    while (p + 61 <= records.length) {
        const len = records.readInt32BE(p + 8);
        const end = p + 12 + len;
        if (end > records.length) throw Object.assign(new Error("batch runs past the records"), { code: E.CORRUPT_MESSAGE });
        const magic = records.readInt8(p + 16);
        if (magic !== 2) throw Object.assign(new Error(`magic ${magic}: Produce v3+ takes record batches v2 only`), { code: E.CORRUPT_MESSAGE });
        const crc = records.readUInt32BE(p + 17);
        const actual = crc32c(records.subarray(p + 21, end));
        if (crc !== actual) throw Object.assign(new Error(`CRC mismatch: batch says ${crc.toString(16)}, bytes give ${actual.toString(16)}`), { code: E.CORRUPT_MESSAGE });
        const attributes = records.readInt16BE(p + 21);
        const lastOffsetDelta = records.readInt32BE(p + 23);
        const baseTimestamp = records.readBigInt64BE(p + 27);
        const count = records.readInt32BE(p + 57);
        const batch = Buffer.from(records.subarray(p, end));
        const decoded = [];
        let body = records.subarray(p + 61, end);
        const codec = attributes & 7;
        if (codec === 1) body = gunzipSync(body);
        if (codec === 0 || codec === 1) {
            const r = new Reader(body);
            for (let i = 0; i < count; i++) {
                r.varint(); r.i8();
                const tsDelta = r.varint(), offDelta = r.varint();
                const kl = r.varint(); const key = kl < 0 ? null : r.bytes(kl).toString();
                const vl = r.varint(); const value = vl < 0 ? null : r.bytes(vl).toString();
                const headers = {};
                const hn = r.varint();
                for (let h = 0; h < hn; h++) { const k = r.bytes(r.varint()).toString(); const l = r.varint(); headers[k] = l < 0 ? null : r.bytes(l).toString(); }
                decoded.push({ offsetDelta: offDelta, timestamp: Number(baseTimestamp) + tsDelta, key, value, headers });
            }
        }
        out.push({ batch, lastOffsetDelta, count, decoded, baseTimestamp: Number(baseTimestamp) });
        p = end;
    }
    if (p !== records.length) throw Object.assign(new Error("trailing bytes after the last batch"), { code: E.CORRUPT_MESSAGE });
    return out;
}

export async function start({ port }) {
    const topics = new Map(); // name -> [{ batches: [{ base, last, batch, timestamps }], next }]
    const seen = { produced: 0, fetched: 0, corrupt: 0, created: [], requests: {}, records: [] };
    const host = "127.0.0.1";
    const waiting = new Set();

    const legalName = (n) => typeof n === "string" && n.length > 0 && n.length <= 249 && n !== "." && n !== ".." && /^[a-zA-Z0-9._-]+$/.test(n);

    function metadata(r, v) {
        const names = r.array(() => r.str());
        if (v >= 4) r.bool();
        const w = new Writer();
        if (v >= 3) w.i32(0);
        w.array([1], () => { w.i32(1).str(host).i32(port); if (v >= 1) w.str(null); });
        if (v >= 2) w.str("quillo-standin-cluster");
        if (v >= 1) w.i32(1);
        const list = names == null || (v === 0 && names.length === 0) ? [...topics.keys()] : names;
        w.array(list, (name) => {
            const t = topics.get(name);
            w.i16(t ? E.NONE : legalName(name) ? E.UNKNOWN_TOPIC_OR_PARTITION : E.INVALID_TOPIC).str(name);
            if (v >= 1) w.bool(false);
            w.array((t ?? []).map((_, i) => i), (i) => w.i16(E.NONE).i32(i).i32(1).array([1], (n) => w.i32(n)).array([1], (n) => w.i32(n)));
        });
        return w.buf();
    }

    function createTopics(r, v) {
        const reqs = r.array(() => {
            const name = r.str(), partitions = r.i32(), replication = r.i16();
            r.array(() => { r.i32(); r.array(() => r.i32()); });
            r.array(() => { r.str(); r.str(); });
            return { name, partitions, replication };
        });
        r.i32();
        const validateOnly = v >= 1 ? r.bool() : false;
        const w = new Writer();
        if (v >= 2) w.i32(0);
        w.array(reqs, ({ name, partitions, replication }) => {
            let code = E.NONE, msg = null;
            const n = partitions === -1 ? 1 : partitions;
            const rf = replication === -1 ? 1 : replication;
            if (!legalName(name)) { code = E.INVALID_TOPIC; msg = `Topic name "${name}" is illegal, it contains a character other than ASCII alphanumerics, '.', '_' and '-'`; }
            else if (topics.has(name)) { code = E.TOPIC_ALREADY_EXISTS; msg = `Topic '${name}' already exists.`; }
            else if (n <= 0) { code = E.INVALID_PARTITIONS; msg = "Number of partitions must be larger than 0."; }
            else if (rf <= 0) { code = E.INVALID_REPLICATION_FACTOR; msg = "Replication factor must be larger than 0."; }
            else if (rf > 1) { code = E.INVALID_REPLICATION_FACTOR; msg = `Unable to replicate the partition ${rf} time(s): The target replication factor of ${rf} cannot be reached because only 1 broker(s) are registered.`; }
            else if (!validateOnly) { topics.set(name, Array.from({ length: n }, () => ({ batches: [], next: 0 }))); seen.created.push(name); }
            w.str(name).i16(code);
            if (v >= 1) w.str(msg);
        });
        return w.buf();
    }

    function produce(r, v) {
        r.str();
        const acks = r.i16();
        r.i32();
        const data = r.array(() => ({ name: r.str(), parts: r.array(() => ({ index: r.i32(), records: r.nbytes() })) }));
        const now = Date.now();
        const w = new Writer();
        w.array(data, ({ name, parts }) => {
            w.str(name);
            w.array(parts, ({ index, records }) => {
                const t = topics.get(name)?.[index];
                let code = E.NONE, base = -1n;
                if (![-1, 0, 1].includes(acks)) code = E.INVALID_REQUIRED_ACKS;
                else if (!t) code = E.UNKNOWN_TOPIC_OR_PARTITION;
                else {
                    try {
                        const batches = readBatches(records ?? Buffer.alloc(0));
                        base = BigInt(t.next);
                        for (const b of batches) {
                            const at = t.next;
                            b.batch.writeBigInt64BE(BigInt(at), 0);   // the broker gives the offsets
                            b.batch.writeInt32BE(0, 12);              // partition leader epoch
                            t.batches.push({ base: at, last: at + b.lastOffsetDelta, batch: b.batch, timestamps: b.decoded.map((d) => d.timestamp), baseTimestamp: b.baseTimestamp });
                            for (const d of b.decoded) seen.records.push({ topic: name, partition: index, offset: at + d.offsetDelta, ...d });
                            t.next = at + b.lastOffsetDelta + 1;
                            seen.produced += b.count;
                        }
                    } catch (e) { code = e.code ?? E.CORRUPT_MESSAGE; seen.corrupt++; seen.lastError = e.message; }
                }
                w.i32(index).i16(code).i64(base);
                if (v >= 2) w.i64(-1);
                if (v >= 5) w.i64(t ? 0 : -1);
            });
        });
        w.i32(0);
        return acks === 0 ? null : w.buf();
    }

    function fetchAnswer(req) {
        const w = new Writer();
        let bytes = 0;
        w.i32(0);
        w.array(req.topics, ({ topic, parts }) => {
            w.str(topic);
            w.array(parts, ({ partition, offset, max }) => {
                const t = topics.get(topic)?.[partition];
                if (!t) { w.i32(partition).i16(E.UNKNOWN_TOPIC_OR_PARTITION).i64(-1).i64(-1).array(null).nbytes(null); return; }
                if (offset < 0 || offset > t.next) { w.i32(partition).i16(E.OFFSET_OUT_OF_RANGE).i64(t.next).i64(t.next).array(null).nbytes(null); return; }
                const out = [];
                let size = 0;
                for (const b of t.batches) {
                    if (b.last < offset) continue;
                    if (out.length > 0 && size + b.batch.length > max) break;  // at least one batch, as KIP-74 says
                    out.push(b.batch); size += b.batch.length;
                    seen.fetched += b.batch.readInt32BE(57);
                }
                bytes += size;
                w.i32(partition).i16(E.NONE).i64(t.next).i64(t.next).array([], () => {}).nbytes(Buffer.concat(out));
            });
        });
        return { buf: w.buf(), bytes };
    }

    function fetchRequest(r) {
        r.i32();
        const maxWait = r.i32(), minBytes = r.i32();
        r.i32(); r.i8();
        const ts = r.array(() => ({ topic: r.str(), parts: r.array(() => ({ partition: r.i32(), offset: Number(r.i64()), max: r.i32() })) }));
        return { maxWait, minBytes, topics: ts };
    }

    function listOffsets(r, v) {
        r.i32();
        if (v >= 2) r.i8();
        const ts = r.array(() => ({ name: r.str(), parts: r.array(() => { const p = { index: r.i32(), ts: r.i64() }; if (v === 0) r.i32(); return p; }) }));
        const w = new Writer();
        if (v >= 2) w.i32(0);
        w.array(ts, ({ name, parts }) => {
            w.str(name);
            w.array(parts, ({ index, ts }) => {
                const t = topics.get(name)?.[index];
                let code = E.NONE, offset = -1, stamp = -1;
                if (!t) code = E.UNKNOWN_TOPIC_OR_PARTITION;
                else if (ts === -1n) offset = t.next;
                else if (ts === -2n) offset = 0;
                else {
                    for (const b of t.batches) {
                        const i = b.timestamps.findIndex((x) => x >= Number(ts));
                        if (i >= 0) { offset = b.base + i; stamp = b.timestamps[i]; break; }
                    }
                }
                w.i32(index).i16(code);
                if (v === 0) w.array(code ? [] : [offset], (o) => w.i64(o));
                else w.i64(stamp).i64(offset);
            });
        });
        return w.buf();
    }

    function apiVersions(v) {
        const w = new Writer().i16(E.NONE);
        if (v >= 3) { w.carray(SUPPORTED, ([k, a, b]) => w.i16(k).i16(a).i16(b).tags()); w.i32(0).tags(); }
        else { w.array(SUPPORTED, ([k, a, b]) => w.i16(k).i16(a).i16(b)); if (v >= 1) w.i32(0); }
        return w.buf();
    }

    const server = createServer((s) => {
        let buf = Buffer.alloc(0);
        const send = (correlation, body) => {
            const head = Buffer.alloc(8);
            head.writeInt32BE(body.length + 4, 0);
            head.writeInt32BE(correlation, 4);
            s.write(Buffer.concat([head, body]));
        };
        s.on("error", () => {});
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 4 && buf.length >= 4 + buf.readInt32BE(0)) {
                const msg = buf.subarray(4, 4 + buf.readInt32BE(0));
                buf = buf.subarray(4 + msg.length);
                const r = new Reader(msg);
                const key = r.i16(), v = r.i16(), correlation = r.i32();
                r.str();                                   // client id (header v1 and v2)
                const range = SUPPORTED.find(([k]) => k === key);
                const flexible = key === API.ApiVersions && v >= 3;
                seen.requests[key] = (seen.requests[key] ?? 0) + 1;
                if (key === API.ApiVersions && (!range || v > range[2])) {
                    // An ApiVersions the broker does not know: answered in v0, with what it knows.
                    const w = new Writer().i16(E.UNSUPPORTED_VERSION);
                    w.array(SUPPORTED, ([k, a, b]) => w.i16(k).i16(a).i16(b));
                    send(correlation, w.buf());
                    continue;
                }
                if (!range || v < range[1] || v > range[2]) { s.destroy(); return; }
                try {
                    if (flexible) { r.tags(); r.cstr(); r.cstr(); r.tags(); }
                    if (key === API.ApiVersions) send(correlation, apiVersions(v));
                    else if (key === API.Metadata) send(correlation, metadata(r, v));
                    else if (key === API.CreateTopics) send(correlation, createTopics(r, v));
                    else if (key === API.Produce) { const out = produce(r, v); if (out) send(correlation, out); }
                    else if (key === API.ListOffsets) send(correlation, listOffsets(r, v));
                    else if (key === API.Fetch) {
                        const req = fetchRequest(r);
                        const first = fetchAnswer({ ...req, topics: req.topics });
                        if (first.bytes >= req.minBytes || req.maxWait <= 0) { send(correlation, first.buf); continue; }
                        // Not enough yet: wait up to max_wait_ms, as a broker does, then answer with what there is.
                        const timer = setTimeout(() => { waiting.delete(timer); if (!s.destroyed) send(correlation, fetchAnswer(req).buf); }, Math.min(req.maxWait, 30000));
                        waiting.add(timer);
                    }
                } catch (e) {
                    seen.lastError = e.message;
                    s.destroy();
                    return;
                }
            }
        });
    }).listen(port, "127.0.0.1");
    await new Promise((ok) => server.once("listening", ok));

    return {
        env: { KAFKA_BROKERS: `127.0.0.1:${port}` },
        seen,
        close() { waiting.forEach(clearTimeout); server.close(); },
        check() {
            if (seen.corrupt) return `the Kafka stand-in refused ${seen.corrupt} batch(es): ${seen.lastError}`;
            if (!seen.requests[API.ApiVersions]) return "the Kafka stand-in got no ApiVersions request";
            if (!seen.created.length) return "the Kafka stand-in got no topic created";
            if (!seen.produced) return "the Kafka stand-in got no records produced";
            if (!seen.fetched) return "the Kafka stand-in sent no records back in a Fetch";
            if (!seen.records.some((x) => x.key != null && Object.keys(x.headers).length > 0)) return "no produced record had both a key and headers";
            return null;
        },
    };
}
