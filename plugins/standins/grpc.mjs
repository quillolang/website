// A gRPC server for the grpc plugin's example, written from gRPC's "PROTOCOL-HTTP2" document (the
// framing, headers, trailers, grpc-timeout, status codes and the trailers-only answer), the
// Protocol Buffers encoding guide (messages encoded and decoded by hand here, with no library), and
// grpc/reflection/v1/reflection.proto with google/protobuf/descriptor.proto (for reflection).
//
// It serves quillo.demo.Inventory from ../grpc_sample.proto over node:http2: plain HTTP/2 on `port`
// and TLS (ALPN h2, a test certificate for localhost) on `port + 1`. GetItem (NOT_FOUND for an
// unknown SKU), ListItems (a server stream), Restock (UNAUTHENTICATED without `authorization: Bearer
// demo-token`, INVALID_ARGUMENT for a count under 1; it puts `x-request-id` back in its headers and
// a trailer of its own), Slow (answers late, honouring grpc-timeout with DEADLINE_EXCEEDED),
// CountSkus (a client stream) and Watch (both ways). Anything else is UNIMPLEMENTED. And
// grpc.reflection.v1 (and v1alpha) ServerReflection: list_services, and file_containing_symbol and
// file_by_filename with a FileDescriptorProto built here from the .proto's definitions.
import http2 from "node:http2";
import { cert, key, caFile } from "./protocols_tls.mjs";

// ---------------------------------------------------------------- protobuf by hand
const empty = Buffer.alloc(0);
function varint(n) {
    let v = BigInt.asUintN(64, BigInt(n));
    const out = [];
    while (v >= 0x80n) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
    out.push(Number(v));
    return Buffer.from(out);
}
const tag = (f, wire) => varint((f << 3) | wire);
const len = (f, b) => Buffer.concat([tag(f, 2), varint(b.length), b]);
const pb = {
    str: (f, s) => (s ? len(f, Buffer.from(s)) : empty),
    msg: (f, b) => len(f, b),
    int: (f, n) => (n ? Buffer.concat([tag(f, 0), varint(n)]) : empty), // int32, int64, enum, bool
    dbl: (f, x) => { if (!x) return empty; const b = Buffer.alloc(8); b.writeDoubleLE(x); return Buffer.concat([tag(f, 1), b]); },
    flt: (f, x) => { if (!x) return empty; const b = Buffer.alloc(4); b.writeFloatLE(x); return Buffer.concat([tag(f, 5), b]); },
};
// A message's fields: number -> list of values (BigInt for varints, Buffer otherwise).
function decode(buf) {
    const fields = {};
    let i = 0;
    const readVarint = () => { let r = 0n, s = 0n; for (;;) { if (i >= buf.length) throw new Error("a varint is cut short"); const b = buf[i++]; r |= BigInt(b & 0x7f) << s; s += 7n; if (!(b & 0x80)) return r; if (s > 63n) throw new Error("a varint is too long"); } };
    while (i < buf.length) {
        const k = readVarint();
        const f = Number(k >> 3n), wire = Number(k & 7n);
        if (f === 0) throw new Error("field number 0");
        let v;
        if (wire === 0) v = readVarint();
        else if (wire === 1) { v = buf.subarray(i, i + 8); i += 8; }
        else if (wire === 5) { v = buf.subarray(i, i + 4); i += 4; }
        else if (wire === 2) { const n = Number(readVarint()); if (i + n > buf.length) throw new Error("a length-delimited field is cut short"); v = buf.subarray(i, i + n); i += n; }
        else throw new Error(`wire type ${wire} is not used by proto3`);
        (fields[f] ??= []).push(v);
    }
    return fields;
}
const one = (fields, f) => fields[f]?.at(-1); // proto3: the last one wins
const asStr = (v) => (v ? v.toString("utf8") : "");
const asInt32 = (v) => (v === undefined ? 0 : Number(BigInt.asIntN(32, v)));

// ---------------------------------------------------------------- the service
const ITEMS = [
    { sku: "A-1042", name: "Trail shoe", price: 89.95, quantity: 14, tags: ["shoes", "outdoor"], updated_ms: 1793350000000, size: { width_cm: 12.5, height_cm: 30 } },
    { sku: "B-7", name: "Rain jacket", price: 129, quantity: 0, tags: ["coats"], updated_ms: 1793350100000 },
    { sku: "C-310", name: "Wool socks", price: 12.5, quantity: 120, tags: ["socks", "wool"], updated_ms: 1793350200000, size: { width_cm: 9, height_cm: 24 } },
];
function item(it) {
    const availability = it.quantity > 0 ? 1 : 2; // IN_STOCK, OUT_OF_STOCK
    return Buffer.concat([
        pb.str(1, it.sku), pb.str(2, it.name), pb.dbl(3, it.price), pb.int(4, it.quantity),
        ...it.tags.map((t) => len(5, Buffer.from(t))), pb.int(6, availability), pb.int(7, it.updated_ms),
        it.size ? pb.msg(8, Buffer.concat([pb.flt(1, it.size.width_cm), pb.flt(2, it.size.height_cm)])) : empty,
    ]);
}

// The .proto's definitions as google.protobuf.FileDescriptorProto, for reflection.
const T = { double: 1, float: 2, int64: 3, int32: 5, bool: 8, string: 9, message: 11, enum: 14 };
const SCHEMA = {
    name: "grpc_sample.proto", package: "quillo.demo",
    messages: [
        ["GetItemRequest", [["sku", 1, "string"]]],
        ["ListItemsRequest", [["min_quantity", 1, "int32", "minQuantity"]]],
        ["RestockRequest", [["sku", 1, "string"], ["add", 2, "int32"]]],
        ["SlowRequest", [["ms", 1, "int32"]]],
        ["Summary", [["found", 1, "int32"], ["missing", 2, "int32"]]],
        ["Dimensions", [["width_cm", 1, "float", "widthCm"], ["height_cm", 2, "float", "heightCm"]]],
        ["Item", [["sku", 1, "string"], ["name", 2, "string"], ["price", 3, "double"], ["quantity", 4, "int32"], ["tags", 5, "string", "tags", true],
            ["availability", 6, ".quillo.demo.Availability"], ["updated_ms", 7, "int64", "updatedMs"], ["size", 8, ".quillo.demo.Dimensions"]]],
    ],
    enums: [["Availability", [["AVAILABILITY_UNKNOWN", 0], ["IN_STOCK", 1], ["OUT_OF_STOCK", 2]]]],
    methods: [["GetItem", "GetItemRequest", "Item"], ["ListItems", "ListItemsRequest", "Item", false, true], ["Restock", "RestockRequest", "Item"],
        ["Slow", "SlowRequest", "Item"], ["CountSkus", "GetItemRequest", "Summary", true, false], ["Watch", "GetItemRequest", "Item", true, true]],
};
function fileDescriptor() {
    const field = ([name, number, type, json, repeated]) => {
        const named = type.startsWith(".");
        const kind = named ? (type.endsWith("Availability") ? T.enum : T.message) : T[type];
        return Buffer.concat([pb.str(1, name), pb.int(3, number), pb.int(4, repeated ? 3 : 1), pb.int(5, kind), named ? pb.str(6, type) : empty, pb.str(10, json ?? name)]);
    };
    const message = ([name, fields]) => Buffer.concat([pb.str(1, name), ...fields.map((f) => pb.msg(2, field(f)))]);
    const enm = ([name, values]) => Buffer.concat([pb.str(1, name), ...values.map(([n, v]) => pb.msg(2, Buffer.concat([pb.str(1, n), pb.int(2, v)])))]);
    const method = ([name, i, o, cs, ss]) => Buffer.concat([pb.str(1, name), pb.str(2, `.quillo.demo.${i}`), pb.str(3, `.quillo.demo.${o}`), pb.int(5, cs ? 1 : 0), pb.int(6, ss ? 1 : 0)]);
    const service = Buffer.concat([pb.str(1, "Inventory"), ...SCHEMA.methods.map((m) => pb.msg(2, method(m)))]);
    return Buffer.concat([pb.str(1, SCHEMA.name), pb.str(2, SCHEMA.package), ...SCHEMA.messages.map((m) => pb.msg(4, message(m))), ...SCHEMA.enums.map((e) => pb.msg(5, enm(e))), pb.msg(6, service), pb.str(12, "proto3")]);
}
const SYMBOLS = new Set(["quillo.demo.Inventory", ...SCHEMA.methods.map((m) => `quillo.demo.Inventory.${m[0]}`), ...SCHEMA.messages.map((m) => `quillo.demo.${m[0]}`), "quillo.demo.Availability"]);

// ---------------------------------------------------------------- HTTP/2 framing
const STATUS = { OK: 0, CANCELLED: 1, INVALID_ARGUMENT: 3, DEADLINE_EXCEEDED: 4, NOT_FOUND: 5, UNIMPLEMENTED: 12, INTERNAL: 13, UNAUTHENTICATED: 16 };
const frameMsg = (b) => { const h = Buffer.alloc(5); h.writeUInt32BE(b.length, 1); return Buffer.concat([h, b]); };
// grpc-message is percent-encoded (PROTOCOL-HTTP2: "Status-Message").
const pct = (s) => Buffer.from(s).reduce((a, c) => a + (c >= 0x20 && c <= 0x7e && c !== 0x25 ? String.fromCharCode(c) : `%${c.toString(16).toUpperCase().padStart(2, "0")}`), "");
// "Timeout → TimeoutValue TimeoutUnit": at most 8 digits, and H M S m u n.
function timeoutMs(h) {
    const m = /^(\d{1,8})([HMSmun])$/.exec(h ?? "");
    if (!m) return null;
    return Number(m[1]) * { H: 3600e3, M: 60e3, S: 1e3, m: 1, u: 1e-3, n: 1e-6 }[m[2]];
}

export async function start({ port }) {
    const seen = { calls: [], statuses: [], tls: 0, reflection: [], cancelled: 0, metadata: [] };

    function handler(stream, headers) {
        const path = headers[":path"];
        const tls = !!stream.session.encrypted;
        if (headers[":method"] !== "POST") { stream.respond({ ":status": 405 }, { endStream: true }); return; }
        if (!/^application\/grpc(\+proto)?($|;)/.test(headers["content-type"] ?? "")) { stream.respond({ ":status": 415 }, { endStream: true }); return; }
        if (tls) seen.tls++;
        seen.calls.push(path);
        if (headers.authorization) seen.metadata.push(headers.authorization);
        let done = false;
        const deadline = timeoutMs(headers["grpc-timeout"]);
        const started = Date.now();
        stream.on("close", () => { if (!done) seen.cancelled++; });
        stream.on("error", () => {});
        let sentHeaders = false;
        const head = (extra = {}) => { if (!sentHeaders) { sentHeaders = true; stream.respond({ ":status": 200, "content-type": "application/grpc", ...extra }, { waitForTrailers: true }); } };
        const send = (b) => { head(); stream.write(frameMsg(b)); };
        const finish = (code, message = "", trailers = {}) => {
            if (done || stream.destroyed) return;
            done = true;
            seen.statuses.push(code);
            const t = { "grpc-status": String(code), ...(message ? { "grpc-message": pct(message) } : {}), ...trailers };
            if (!sentHeaders) { stream.respond({ ":status": 200, "content-type": "application/grpc", ...t }, { endStream: true }); return; } // trailers-only
            stream.once("wantTrailers", () => stream.sendTrailers(t));
            stream.end();
        };

        // Request messages, as they come.
        let buf = Buffer.alloc(0);
        const messages = [];
        const onMessage = [];
        stream.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 5) {
                const n = buf.readUInt32BE(1);
                if (buf.length < 5 + n) break;
                if (buf[0] !== 0) return finish(STATUS.INTERNAL, "compressed requests are not taken here (no grpc-encoding was agreed)");
                const m = buf.subarray(5, 5 + n);
                buf = buf.subarray(5 + n);
                messages.push(m);
                onMessage.forEach((f) => f(m));
            }
        });
        const whole = (f) => stream.on("end", () => { try { f(messages); } catch (e) { finish(STATUS.INVALID_ARGUMENT, `the request did not decode: ${e.message}`); } });
        const find = (sku) => ITEMS.find((i) => i.sku === sku);

        switch (path) {
            case "/quillo.demo.Inventory/GetItem": return whole(([m = empty]) => {
                const sku = asStr(one(decode(m), 1));
                const it = find(sku);
                if (!it) return finish(STATUS.NOT_FOUND, `no item ${sku}`);
                send(item(it)); finish(STATUS.OK);
            });
            case "/quillo.demo.Inventory/ListItems": return whole(([m = empty]) => {
                const min = asInt32(one(decode(m), 1));
                for (const it of ITEMS.filter((i) => i.quantity >= min)) send(item(it));
                finish(STATUS.OK);
            });
            case "/quillo.demo.Inventory/Restock": return whole(([m = empty]) => {
                if (headers.authorization !== "Bearer demo-token") return finish(STATUS.UNAUTHENTICATED, "missing or wrong bearer token");
                const f = decode(m);
                const it = find(asStr(one(f, 1))), add = asInt32(one(f, 2));
                if (!it) return finish(STATUS.NOT_FOUND, `no item ${asStr(one(f, 1))}`);
                if (add < 1) return finish(STATUS.INVALID_ARGUMENT, `add must be at least 1, not ${add}`);
                head(headers["x-request-id"] ? { "x-request-id": headers["x-request-id"] } : {});
                send(item({ ...it, quantity: it.quantity + add }));
                finish(STATUS.OK, "", { "x-restocked-by": "stand-in" });
            });
            case "/quillo.demo.Inventory/Slow": return whole(([m = empty]) => {
                const ms = asInt32(one(decode(m), 1));
                const left = deadline == null ? Infinity : deadline - (Date.now() - started);
                if (ms > left) { setTimeout(() => finish(STATUS.DEADLINE_EXCEEDED, "the deadline passed on the server"), Math.max(0, left)); return; }
                setTimeout(() => { if (!stream.destroyed) { send(item(ITEMS[0])); finish(STATUS.OK); } }, ms);
            });
            case "/quillo.demo.Inventory/CountSkus": return whole((ms) => {
                const skus = ms.map((m) => asStr(one(decode(m), 1)));
                const found = skus.filter(find).length;
                send(Buffer.concat([pb.int(1, found), pb.int(2, skus.length - found)])); finish(STATUS.OK);
            });
            case "/quillo.demo.Inventory/Watch":
                // Each SKU answered as it arrives; the call ends when the client half-closes.
                onMessage.push((m) => { const it = find(asStr(one(decode(m), 1))); if (it) send(item(it)); });
                return stream.on("end", () => finish(STATUS.OK));
            case "/grpc.reflection.v1.ServerReflection/ServerReflectionInfo":
            case "/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo":
                onMessage.push((m) => {
                    const f = decode(m);
                    const answer = (body) => send(Buffer.concat([pb.str(1, asStr(one(f, 1))), pb.msg(2, m), body]));
                    if (f[7]) { seen.reflection.push("list"); return answer(pb.msg(6, Buffer.concat(["quillo.demo.Inventory", "grpc.reflection.v1.ServerReflection"].map((n) => pb.msg(1, pb.str(1, n)))))); }
                    const sym = f[4] && asStr(one(f, 4)), file = f[3] && asStr(one(f, 3));
                    if ((sym && SYMBOLS.has(sym)) || file === SCHEMA.name) { seen.reflection.push("file"); return answer(pb.msg(4, len(1, fileDescriptor()))); }
                    seen.reflection.push("missing");
                    answer(pb.msg(7, Buffer.concat([pb.int(1, STATUS.NOT_FOUND), pb.str(2, `no symbol or file ${sym || file}`)])));
                });
                return stream.on("end", () => finish(STATUS.OK));
            default:
                return whole(() => finish(STATUS.UNIMPLEMENTED, `no method ${path}`));
        }
    }

    const plain = http2.createServer();
    plain.on("stream", handler);
    plain.on("sessionError", () => {});
    await new Promise((r) => plain.listen(port, "127.0.0.1", r));
    const secure = http2.createSecureServer({ key, cert, allowHTTP1: false });
    secure.on("stream", handler);
    secure.on("sessionError", () => {});
    await new Promise((r) => secure.listen(port + 1, "127.0.0.1", r));
    return {
        env: { GRPC_URL: `http://127.0.0.1:${port}`, GRPC_TLS_URL: `https://localhost:${port + 1}`, GRPC_CA: caFile() },
        close() { plain.close(); secure.close(); },
        check() {
            if (!seen.calls.includes("/quillo.demo.Inventory/GetItem")) return "the gRPC server got no GetItem";
            if (!seen.calls.includes("/quillo.demo.Inventory/ListItems")) return "the gRPC server got no ListItems stream";
            if (!seen.statuses.includes(STATUS.NOT_FOUND)) return "no call ended NOT_FOUND";
            if (!seen.metadata.includes("Bearer demo-token")) return "no call carried the bearer token";
            if (!seen.reflection.includes("file")) return "reflection was never asked for a file";
            if (!seen.tls) return "no call came over TLS";
            if (!seen.cancelled && !seen.statuses.includes(STATUS.DEADLINE_EXCEEDED)) return "no call ran out of time";
            return null;
        },
        seen,
    };
}
