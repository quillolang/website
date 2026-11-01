// A Cassandra node speaking the CQL binary protocol v4 for the cassandra plugin's test, written from
// native_protocol_v4.spec: frames of a 9-byte header, STARTUP answered by AUTHENTICATE with
// org.apache.cassandra.auth.PasswordAuthenticator, SASL PLAIN in AUTH_RESPONSE checked, OPTIONS,
// QUERY, PREPARE, EXECUTE (an id it has forgotten is ERROR 0x2500), BATCH, RESULT Void, Rows,
// Set_keyspace and Prepared, with real [value] encodings of each CQL type written here, paging by
// paging_state, warnings in the frame flags, and ERROR bodies with their codes: 0x2000 syntax,
// 0x2200 invalid, 0x1000 unavailable, 0x1200 read timeout. CQL itself is a table of known statements.
//
//   start({ port }) -> { env: { CASSANDRA_HOST, CASSANDRA_USER, CASSANDRA_PASSWORD }, close(), check() }
import { createServer } from "node:net";
import { createHash } from "node:crypto";

const USER = "app", PASS = "qk-cql-password";
const T = { ascii: 1, bigint: 2, blob: 3, boolean: 4, double: 7, float: 8, int: 9, timestamp: 0xb, uuid: 0xc, varchar: 0xd, varint: 0xe, timeuuid: 0xf, inet: 0x10, date: 0x11, time: 0x12, smallint: 0x13, tinyint: 0x14, decimal: 6 };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(n)); return b; };
const str = (s) => Buffer.concat([u16(Buffer.byteLength(s)), Buffer.from(s)]);
const bytes = (b) => (b == null ? i32(-1) : Buffer.concat([i32(b.length), b]));
const typ = (t) => {
    if (typeof t === "number") return u16(t);
    if (t.list) return Buffer.concat([u16(0x20), typ(t.list)]);
    if (t.set) return Buffer.concat([u16(0x22), typ(t.set)]);
    if (t.map) return Buffer.concat([u16(0x21), typ(t.map[0]), typ(t.map[1])]);
    if (t.tuple) return Buffer.concat([u16(0x31), u16(t.tuple.length), ...t.tuple.map(typ)]);
    if (t.udt) return Buffer.concat([u16(0x30), str("shop"), str("address"), u16(t.udt.length), ...t.udt.flatMap(([n, x]) => [str(n), typ(x)])]);
    throw new Error("type");
};
const dbl = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b; };
const flt = (n) => { const b = Buffer.alloc(4); b.writeFloatBE(n); return b; };
const uuid = (s) => Buffer.from(s.replace(/-/g, ""), "hex");
const coll = (items) => Buffer.concat([i32(items.length), ...items.map(bytes)]);

// id -> statement kept, a statement's bound columns, its result columns.
const SCHEMA = {
    orders: { columns: [["id", T.uuid], ["customer", T.varchar], ["total", T.double], ["placed", T.timestamp], ["tags", { list: T.varchar }]], key: "id" },
    accounts: { columns: [["name", T.varchar], ["balance", T.int]], key: "name" },
    bound: { columns: [["k", T.varchar], ["big", T.bigint], ["small", T.smallint], ["tiny", T.tinyint], ["dec", T.decimal], ["vi", T.varint], ["ip", T.inet], ["day", T.date], ["flag", T.boolean], ["blobby", T.blob], ["scores", { map: [T.varchar, T.int] }], ["pair", { tuple: [T.int, T.varchar] }]], key: "k" },
    events: { columns: [["day", T.date], ["n", T.int]], key: "day" },
};
const typeOf = (table, col) => SCHEMA[table].columns.find((c) => c[0] === col)[1];

export async function start({ port }) {
    const stats = { logins: 0, refused: 0, prepared: 0, executes: 0, pages: 0, reprepared: 0, batches: 0 };
    const tables = { orders: new Map(), accounts: new Map(), bound: new Map() };
    const statements = new Map();
    let evict = false;
    class CqlError { constructor(code, msg, extra) { Object.assign(this, { code, msg, extra }); } }
    const parseWrite = (cql) => { const m = cql.match(/^INSERT INTO (\w+) \(([^)]*)\) VALUES \(([^)]*)\)/i); return m && { table: m[1], cols: m[2].split(",").map((s) => s.trim()) }; };
    const parseRead = (cql) => { const m = cql.match(/^SELECT (.+?) FROM (\w+)(?: WHERE (\w+) = \?)?$/i); return m && { fields: m[1], table: m[2], where: m[3] }; };
    function prepare(cql) {
        const w = parseWrite(cql), r = parseRead(cql);
        if (w) { if (!SCHEMA[w.table]) throw new CqlError(0x2200, `unconfigured table ${w.table}`); return { cql, bind: w.cols.map((c) => [c, typeOf(w.table, c)]), write: w }; }
        if (r) { if (!SCHEMA[r.table]) throw new CqlError(0x2200, `unconfigured table ${r.table}`); return { cql, bind: r.where ? [[r.where, typeOf(r.table, r.where)]] : [], read: r }; }
        throw new CqlError(0x2000, `line 1:0 no viable alternative at input '${cql.split(" ")[0]}'`);
    }
    function colspecs(cols, table) { return Buffer.concat([i32(1), i32(cols.length), str("shop"), str(table), ...cols.flatMap(([n, t]) => [str(n), typ(t)])]); }
    function rowsResult(table, cols, rows, paging) {
        const flags = 1 | (paging != null ? 2 : 0);
        const meta = Buffer.concat([i32(flags), i32(cols.length), ...(paging != null ? [bytes(paging)] : []), str("shop"), str(table), ...cols.flatMap(([n, t]) => [str(n), typ(t)])]);
        return Buffer.concat([i32(2), meta, i32(rows.length), ...rows.flatMap((r) => r.map(bytes))]);
    }
    function everyType() {
        const cols = [["a_text", T.varchar], ["a_ascii", T.ascii], ["a_big", T.bigint], ["a_blob", T.blob], ["a_bool", T.boolean], ["a_dec", T.decimal], ["a_double", T.double], ["a_float", T.float], ["a_int", T.int], ["a_ts", T.timestamp], ["a_uuid", T.uuid], ["a_timeuuid", T.timeuuid], ["a_varint", T.varint], ["a_v4", T.inet], ["a_v6", T.inet], ["a_date", T.date], ["a_time", T.time], ["a_small", T.smallint], ["a_tiny", T.tinyint], ["a_list", { list: T.int }], ["a_set", { set: T.varchar }], ["a_map", { map: [T.varchar, T.double] }], ["a_tuple", { tuple: [T.int, T.varchar] }], ["a_udt", { udt: [["street", T.varchar], ["zip", T.int]] }]];
        const dateDays = 0x80000000 + Math.floor(Date.UTC(2026, 10, 1) / 86400000);
        const row = [Buffer.from("héllo"), Buffer.from("plain"), i64("-9007199254740993"), Buffer.from([0xca, 0xfe]), Buffer.from([1]), Buffer.concat([i32(2), Buffer.from([0xcf, 0xc7])]), dbl(2.5), flt(0.5), i32(-7), i64(1730000000250), uuid("123e4567-e89b-12d3-a456-426614174000"), uuid("c232ab00-9414-11ec-b3c8-9f6bdeced846"), Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), Buffer.from([192, 0, 2, 1]), Buffer.from("20010db8000000000000000000000001", "hex"), i32(dateDays | 0), i64(3723000000123n), Buffer.from([0xff, 0xfe]), Buffer.from([0xfb]), coll([i32(1), i32(2)]), coll([Buffer.from("x"), Buffer.from("y")]), Buffer.concat([i32(1), bytes(Buffer.from("pi")), bytes(dbl(3.25))]), Buffer.concat([bytes(i32(7)), bytes(Buffer.from("seven"))]), Buffer.concat([bytes(Buffer.from("Main St")), bytes(i32(12345))])];
        return rowsResult("every_type", cols, [row, cols.map(() => null)]);
    }
    function read(s, vals, opts) {
        const { table, where } = s.read;
        const cols = s.read.fields === "*" ? SCHEMA[table].columns : s.read.fields.split(",").map((f) => [f.trim(), typeOf(table, f.trim())]);
        if (table === "events") {
            const from = opts.paging ? opts.paging.readInt32BE(0) : 0, size = opts.pageSize ?? 5000;
            if (opts.paging) stats.pages++;
            const take = Array.from({ length: 10 }, (_, i) => i).slice(from, from + size);
            return rowsResult(table, cols, take.map((n) => [i32(n)]), from + size < 10 ? i32(from + size) : null);
        }
        const row = tables[table].get(vals[0]?.toString("hex"));
        if (!row) return rowsResult(table, cols, []);
        return rowsResult(table, cols, [cols.map(([c]) => row[c] ?? null)]);
    }
    function run(s, vals, opts) {
        if (s.write) { const row = Object.fromEntries(s.write.cols.map((c, i) => [c, vals[i]])); tables[s.write.table].set(vals[0].toString("hex"), row); return i32(1); }
        return read(s, vals, opts);
    }
    function readQuery(r, withValues) {
        const cl = r.u16();
        const f = r.u8();
        const vals = [];
        if (f & 1) { const n = r.u16(); for (let i = 0; i < n; i++) vals.push(r.bytes()); }
        const opts = {};
        if (f & 4) opts.pageSize = r.i32();
        if (f & 8) opts.paging = r.bytes();
        if (cl > 10) throw new CqlError(0x000a, "bad consistency");
        return [vals, opts];
    }
    const reader = (b) => { let a = 0; return { u8: () => b[a++], u16: () => { a += 2; return b.readUInt16BE(a - 2); }, i32: () => { a += 4; return b.readInt32BE(a - 4); }, long: () => { const n = b.readInt32BE(a); a += 4 + n; return b.subarray(a - n, a).toString(); }, short: () => { const n = b.readUInt16BE(a); a += 2 + n; return b.subarray(a - n, a); }, bytes: () => { const n = b.readInt32BE(a); a += 4; if (n < 0) return null; a += n; return b.subarray(a - n, a); } }; };
    const server = createServer((s) => {
        let buf = Buffer.alloc(0), authed = false, keyspace = null;
        const send = (stream, op, body, flags = 0) => { const h = Buffer.alloc(9); h[0] = 0x84; h[1] = flags; h.writeInt16BE(stream, 2); h[4] = op; h.writeUInt32BE(body.length, 5); s.write(Buffer.concat([h, body])); };
        const fail = (stream, code, msg, extra = Buffer.alloc(0)) => send(stream, 0, Buffer.concat([i32(code), str(msg), extra]));
        function handle(stream, op, b) {
            const r = reader(b);
            if (op === 5) return send(stream, 6, Buffer.concat([u16(2), str("CQL_VERSION"), u16(1), str("3.4.5"), str("COMPRESSION"), u16(0)]));
            if (op === 1) return send(stream, 3, str("org.apache.cassandra.auth.PasswordAuthenticator"));
            if (op === 15) {
                const t = r.bytes(), [, u, p] = t.toString().split("\0");
                if (u !== USER || p !== PASS) { stats.refused++; return fail(stream, 0x0100, "Provided username and/or password are incorrect"); }
                authed = true; stats.logins++;
                return send(stream, 16, bytes(null));
            }
            if (!authed) return fail(stream, 0x000a, "Authentication required");
            try {
                if (op === 7) {
                    const cql = r.long();
                    if (/^USE /i.test(cql)) { const ks = cql.slice(4).trim(); if (!/^\w+$/.test(ks)) throw new CqlError(0x2000, `line 1:4 no viable alternative at input '${ks}'`); keyspace = ks; return send(stream, 8, Buffer.concat([i32(3), str(ks)])); }
                    if (cql === "SELECT unavailable") return fail(stream, 0x1000, "Cannot achieve consistency level QUORUM", Buffer.concat([u16(4), i32(2), i32(1)]));
                    if (cql === "SELECT timeout") return fail(stream, 0x1200, "Operation timed out - received only 0 responses.", Buffer.concat([u16(4), i32(0), i32(2), Buffer.from([0])]));
                    if (cql === "SELECT * FROM every_type") return send(stream, 8, everyType());
                    if (cql === "SELECT 1") { readQuery(r); return send(stream, 8, i32(1)); }
                    if (cql.startsWith("SELECT keyspace_name")) return send(stream, 8, rowsResult("local", [["keyspace_name", T.varchar]], []));
                    const st = prepare(cql);
                    const [vals, opts] = readQuery(r);
                    return send(stream, 8, run(st, vals, opts));
                }
                if (op === 9) {
                    const cql = r.long(), st = prepare(cql);
                    if (!keyspace) throw new CqlError(0x2200, "No keyspace has been specified");
                    const id = createHash("md5").update(cql).digest();
                    statements.set(id.toString("hex"), st);
                    stats.prepared++;
                    const bindMeta = Buffer.concat([i32(1), i32(st.bind.length), i32(0), str("shop"), str("t"), ...st.bind.flatMap(([n, t]) => [str(n), typ(t)])]);
                    return send(stream, 8, Buffer.concat([i32(4), u16(id.length), id, bindMeta, i32(4), i32(0)]));
                }
                if (op === 10) {
                    const id = r.short();
                    const st = statements.get(id.toString("hex"));
                    if (!st) { stats.reprepared++; return fail(stream, 0x2500, "Prepared query with ID not found", Buffer.concat([u16(id.length), id])); }
                    const [vals, opts] = readQuery(r);
                    if (vals.length !== st.bind.length) throw new CqlError(0x2200, `There were ${vals.length} markers(?) in CQL but ${st.bind.length} values`);
                    stats.executes++;
                    return send(stream, 8, run(st, vals, opts));
                }
                if (op === 13) {
                    stats.batches++;
                    r.u8();
                    const n = r.u16();
                    for (let i = 0; i < n; i++) {
                        if (r.u8() !== 1) throw new CqlError(0x2200, "only prepared in this test");
                        const st = statements.get(r.short().toString("hex"));
                        const c = r.u16(), vals = [];
                        for (let k = 0; k < c; k++) vals.push(r.bytes());
                        run(st, vals, {});
                    }
                    const w = Buffer.concat([u16(1), str("Batch for [shop.accounts] is of size 6.2 KiB, exceeding specified threshold")]);
                    send(stream, 8, Buffer.concat([w, i32(1)]), 8);
                    evict = true; statements.clear();
                    return;
                }
                fail(stream, 0x000a, `opcode ${op}`);
            } catch (e) {
                if (e instanceof CqlError) fail(stream, e.code, e.msg); else fail(stream, 0, String(e));
            }
        }
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 9) {
                if (buf[0] !== 4) { const h = Buffer.alloc(9); s.destroy(); return; }
                const len = buf.readUInt32BE(5);
                if (buf.length < 9 + len) return;
                handle(buf.readInt16BE(2), buf[4], buf.subarray(9, 9 + len));
                buf = buf.subarray(9 + len);
            }
        });
        s.on("error", () => {});
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { CASSANDRA_HOST: `127.0.0.1:${port}`, CASSANDRA_USER: USER, CASSANDRA_PASSWORD: PASS },
        close() { server.close(); },
        check: () => (!stats.logins ? "no login came" : !stats.executes ? "no prepared statement ran" : stats.pages < 2 ? "paging_state was not used" : !stats.reprepared ? "no Unprepared answer was met" : !stats.batches ? "no batch came" : null),
    };
}
