// A SQL Server for the mssql plugin's test, speaking real TDS 7.3 written from Microsoft's [MS-TDS]:
// packets with their 8-byte header, split at the negotiated size and joined from it; PRELOGIN
// answered with no encryption (a real server would do TLS here, which is therefore not tried);
// LOGIN7 with its password de-obfuscated and checked; ENVCHANGE, LOGINACK, DONE; SQL batches and RPC
// sp_executesql with ALL_HEADERS and the transaction descriptor checked; parameters of INTN, FLTN,
// BITN, NVARCHAR (PLP past 4000 characters) and BIGVARBINARY decoded; and answers as COLMETADATA, ROW,
// DONE, DONEINPROC, RETURNSTATUS and DONEPROC, ERROR tokens with real numbers (102 syntax, 208 no
// such object, 2627 duplicate key, 18456 login failed). SQL runs in node:sqlite, `@P1` being a
// parameter there too; `SELECT * FROM every_type` is a row of each TDS type written by hand.
//
//   start({ port }) -> { env: { MSSQL_HOST, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DATABASE, MSSQL_ENCRYPT }, close(), check() }
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

const USER = "app", PASS = "qk-Sql-P4ss", DB = "shop";
const le16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const le32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const le64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const ucs = (s) => Buffer.from(s, "utf16le");
const bvar = (s) => Buffer.concat([Buffer.from([s.length]), ucs(s)]);
const usvar = (s) => Buffer.concat([le16(s.length), ucs(s)]);
const COLLATION = Buffer.from([0x09, 0x04, 0xd0, 0x00, 0x34]);
const done = (token, status, rows) => Buffer.concat([Buffer.from([token]), le16(status), le16(0), le64(rows)]);
function envchange(type, a, b) { const body = Buffer.concat([Buffer.from([type]), a, b]); return Buffer.concat([Buffer.from([0xe3]), le16(body.length), body]); }
function errorToken(num, cls, msg) {
    const body = Buffer.concat([le32(num), Buffer.from([1, cls]), usvar(msg), bvar("quillo-test"), bvar(""), le32(1)]);
    return Buffer.concat([Buffer.from([0xaa]), le16(body.length), body]);
}
// One column kind each: its TYPE_INFO, and how a value is written.
const INT = (n) => ({ info: Buffer.from([0x26, n]), put: (v) => (v == null ? Buffer.from([0]) : Buffer.concat([Buffer.from([n]), n === 8 ? le64(v) : n === 4 ? le32(v) : n === 2 ? le16(v & 0xffff) : Buffer.from([v])])) });
const FIXED_INT = { info: Buffer.from([0x38]), put: (v) => le32(v) };
const FLOAT = { info: Buffer.from([0x6d, 8]), put: (v) => { if (v == null) return Buffer.from([0]); const b = Buffer.alloc(9); b[0] = 8; b.writeDoubleLE(v, 1); return b; } };
const REAL = { info: Buffer.from([0x6d, 4]), put: (v) => { if (v == null) return Buffer.from([0]); const b = Buffer.alloc(5); b[0] = 4; b.writeFloatLE(v, 1); return b; } };
const BIT = { info: Buffer.from([0x68, 1]), put: (v) => (v == null ? Buffer.from([0]) : Buffer.from([1, v ? 1 : 0])) };
const NVARCHAR = { info: Buffer.concat([Buffer.from([0xe7]), le16(8000), COLLATION]), put: (v) => (v == null ? Buffer.from([0xff, 0xff]) : Buffer.concat([le16(Buffer.byteLength(v, "utf16le")), ucs(v)])) };
const PLP = { info: Buffer.concat([Buffer.from([0xe7]), le16(0xffff), COLLATION]), put: (v) => { if (v == null) return Buffer.alloc(8, 0xff); const b = ucs(v); return Buffer.concat([le64(b.length), le32(b.length), b, le32(0)]); } };
const BIN = { info: Buffer.concat([Buffer.from([0xa5]), le16(8000)]), put: (v) => (v == null ? Buffer.from([0xff, 0xff]) : Buffer.concat([le16(v.length), Buffer.from(v)])) };
const GUID = { info: Buffer.from([0x24, 16]), put: (v) => { if (v == null) return Buffer.from([0]); const h = Buffer.from(v.replace(/-/g, ""), "hex"); return Buffer.concat([Buffer.from([16]), Buffer.from([h[3], h[2], h[1], h[0], h[5], h[4], h[7], h[6]]), h.subarray(8)]); } };
const DECIMAL = (p, s) => ({ info: Buffer.from([0x6a, 9, p, s]), put: (v) => { if (v == null) return Buffer.from([0]); const b = Buffer.alloc(10); b[0] = 9; b[1] = v < 0n ? 0 : 1; b.writeBigUInt64LE(v < 0n ? -v : v, 2); return b; } });
const days3 = (d) => { const b = Buffer.alloc(3); b.writeUIntLE(d, 0, 3); return b; };
const DAYS = 739920; // 2026-11-01, from 0001-01-01
const DATE = { info: Buffer.from([0x28]), put: (v) => (v == null ? Buffer.from([0]) : Buffer.concat([Buffer.from([3]), days3(v)])) };
const time = (scale, inc) => { const n = scale <= 2 ? 3 : scale <= 4 ? 4 : 5; const b = Buffer.alloc(n); b.writeUIntLE(inc, 0, Math.min(n, 6)); return b; };
const TIME = (s) => ({ info: Buffer.from([0x29, s]), put: (v) => { if (v == null) return Buffer.from([0]); const t = time(s, v); return Buffer.concat([Buffer.from([t.length]), t]); } });
const DT2 = (s) => ({ info: Buffer.from([0x2a, s]), put: (v) => { if (v == null) return Buffer.from([0]); const t = time(s, v[1]); return Buffer.concat([Buffer.from([t.length + 3]), t, days3(v[0])]); } });
const DTO = (s) => ({ info: Buffer.from([0x2b, s]), put: (v) => { if (v == null) return Buffer.from([0]); const t = time(s, v[1]); const o = Buffer.alloc(2); o.writeInt16LE(v[2]); return Buffer.concat([Buffer.from([t.length + 5]), t, days3(v[0]), o]); } });
const DATETIME = { info: Buffer.from([0x6f, 8]), put: (v) => { if (v == null) return Buffer.from([0]); const b = Buffer.alloc(9); b[0] = 8; b.writeInt32LE(v[0], 1); b.writeUInt32LE(v[1], 5); return b; } };
const metadata = (cols) => Buffer.concat([Buffer.from([0x81]), le16(cols.length), ...cols.flatMap(([n, t]) => [le32(0), le16(1), t.info, bvar(n)])]);
const rowOf = (cols, vals) => Buffer.concat([Buffer.from([0xd1]), ...cols.map(([, t], i) => t.put(vals[i]))]);

export async function start({ port }) {
    const db = new DatabaseSync(":memory:");
    const stats = { logins: 0, refused: 0, batches: 0, rpcs: 0, params: 0, tx: 0, descriptors: 0, split: 0 };
    let txSeq = 0;
    const kindOf = (v) => (v === null || v === undefined ? NVARCHAR : typeof v === "bigint" ? INT(8) : typeof v === "number" ? (Number.isInteger(v) ? INT(8) : FLOAT) : v instanceof Uint8Array ? BIN : v.length > 4000 ? PLP : NVARCHAR);
    const translate = (m) => {
        const t = m.message;
        if (/no such table: (\S+)/.test(t)) return [208, 16, `Invalid object name '${t.match(/no such table: (\S+)/)[1]}'.`];
        if (/UNIQUE constraint/.test(t)) return [2627, 14, "Violation of PRIMARY KEY constraint 'PK_accounts'. Cannot insert duplicate key in object 'dbo.accounts'."];
        if (/syntax error/.test(t)) return [102, 15, `Incorrect syntax near '${t.match(/near "([^"]*)"/)?.[1] ?? "?"}'.`];
        return [50000, 16, t];
    };
    function everyType() {
        const cols = [["a_tiny", INT(1)], ["a_small", INT(2)], ["a_int", INT(4)], ["a_fixed", FIXED_INT], ["a_big", INT(8)], ["a_bit", BIT], ["a_float", FLOAT], ["a_real", REAL], ["a_dec", DECIMAL(18, 4)], ["a_text", NVARCHAR], ["a_bin", BIN], ["a_guid", GUID], ["a_date", DATE], ["a_time", TIME(3)], ["a_dt2", DT2(7)], ["a_dto", DTO(7)], ["a_dt", DATETIME]];
        const vals = [200, -2, -7, 42, "-9007199254740993", true, 2.5, 0.5, -1234500n, "héllo", [0xca, 0xfe], "123e4567-e89b-12d3-a456-426614174000", DAYS, 3723123, [DAYS, 37231234567], [DAYS, 37231234567, 120], [46325, 100]];
        const nulls = cols.map(([, t]) => (t === FIXED_INT ? 0 : null));
        return Buffer.concat([metadata(cols), rowOf(cols, vals), rowOf(cols, nulls)]);
    }
    function runOne(sql, params) {
        const trimmed = sql.trim().replace(/;$/, "");
        if (/^SELECT @@VERSION/i.test(trimmed)) { const cols = [["version", NVARCHAR]]; return { body: Buffer.concat([metadata(cols), rowOf(cols, ["Microsoft SQL Server 2022 (RTM) - 16.0.1000.6 (X64) (stand-in)"])]), rows: 1 }; }
        if (/^SELECT \* FROM every_type$/i.test(trimmed)) return { body: everyType(), rows: 2 };
        if (/^SELECT \* FROM big_rows$/i.test(trimmed)) { const cols = [["n", INT(4)], ["t", NVARCHAR]]; stats.split++; return { body: Buffer.concat([metadata(cols), ...Array.from({ length: 200 }, (_, i) => rowOf(cols, [i, "x".repeat(100)]))]), rows: 200 }; }
        const st = db.prepare(trimmed.replace(/^IF @@TRANCOUNT > 0 /i, ""));
        const bound = Object.fromEntries(Object.entries(params));
        if (/^\s*(SELECT|WITH)/i.test(trimmed)) {
            st.setReadBigInts?.(true);
            const rows = st.all(bound);
            const names = st.columns().map((c) => c.name);
            const cols = names.map((n) => { const v = rows.find((r) => r[n] != null)?.[n]; return [n, kindOf(v ?? null)]; });
            const norm = (v) => (typeof v === "bigint" && cols ? v : v);
            return { body: Buffer.concat([metadata(cols), ...rows.map((r) => rowOf(cols, names.map((n) => norm(r[n]))))]), rows: rows.length };
        }
        return { body: Buffer.alloc(0), rows: Number(st.run(bound).changes) };
    }
    function readParams(b, at) {
        // sp_executesql: @stmt, @params, then the values.
        const out = [];
        while (at < b.length) {
            const nameLen = b[at]; at += 1;
            const name = b.subarray(at, at + nameLen * 2).toString("utf16le"); at += nameLen * 2;
            at += 1; // status
            const t = b[at]; at += 1;
            let v = null;
            if (t === 0x1f) {
                // NULLTYPE: a null parameter has no length and no value.
            } else if (t === 0x26 || t === 0x6d || t === 0x68) {
                at += 1; const n = b[at]; at += 1;
                if (n === 8 && t === 0x26) v = b.readBigInt64LE(at);
                else if (n === 4 && t === 0x26) v = b.readInt32LE(at);
                else if (n === 2 && t === 0x26) v = b.readInt16LE(at);
                else if (n === 1 && t === 0x26) v = b[at];
                else if (n === 8) v = b.readDoubleLE(at);
                else if (n === 1) v = b[at];
                at += n;
            } else if (t === 0xe7 || t === 0xa5) {
                const max = b.readUInt16LE(at); at += 2;
                if (t === 0xe7) at += 5;
                let data = null;
                if (max === 0xffff) {
                    const total = b.readBigUInt64LE(at); at += 8;
                    if (total !== 0xffffffffffffffffn) { const parts = []; for (;;) { const n = b.readUInt32LE(at); at += 4; if (!n) break; parts.push(b.subarray(at, at + n)); at += n; } data = Buffer.concat(parts); }
                } else {
                    const n = b.readUInt16LE(at); at += 2;
                    if (n !== 0xffff) { data = b.subarray(at, at + n); at += n; }
                }
                v = data && (t === 0xe7 ? data.toString("utf16le") : new Uint8Array(data));
            } else throw new Error(`parameter type 0x${t.toString(16)}`);
            out.push([name, v]);
        }
        return out;
    }
    const server = createServer((s) => {
        let buf = Buffer.alloc(0), parts = [], size = 4096, desc = null, seq = 1;
        const send = (type, body) => {
            const room = size - 8;
            let at = 0;
            do {
                const chunk = body.subarray(at, at + room);
                at += chunk.length;
                const h = Buffer.alloc(8);
                h[0] = 4; h[1] = at >= body.length ? 1 : 0; h.writeUInt16BE(chunk.length + 8, 2); h.writeUInt16BE(51, 4); h[6] = seq++ & 255;
                s.write(Buffer.concat([h, chunk]));
            } while (at < body.length);
        };
        const header = (m) => { const total = m.readUInt32LE(0); return { total, desc: total >= 22 ? m.subarray(10, 18) : Buffer.alloc(8) }; };
        function statement(text, params, inProc) {
            const out = [];
            const pieces = text.split(";").map((x) => x.trim()).filter(Boolean);
            pieces.forEach((sql, i) => {
                const more = i < pieces.length - 1;
                const tx = sql.match(/^(IF @@TRANCOUNT > 0 )?(BEGIN|COMMIT|ROLLBACK)( TRAN(SACTION)?)?$/i);
                if (tx) {
                    const verb = tx[2].toUpperCase();
                    if (tx[1] && !desc) { out.push(done(0xfd, 0, 0)); return; }
                    if (verb === "BEGIN") { db.exec("BEGIN"); txSeq++; desc = le64(txSeq * 1000); stats.tx++; out.push(envchange(8, Buffer.concat([Buffer.from([8]), desc]), Buffer.from([0]))); }
                    else { db.exec(verb); out.push(envchange(verb === "COMMIT" ? 9 : 10, Buffer.from([0]), Buffer.concat([Buffer.from([8]), desc]))); desc = null; }
                    out.push(done(0xfd, more ? 1 : 0, 0));
                    return;
                }
                try {
                    const r = runOne(sql, params);
                    out.push(r.body, done(inProc ? 0xff : 0xfd, 0x10 | (more || inProc ? 1 : 0), r.rows));
                } catch (e) {
                    const [num, cls, msg] = translate(e);
                    out.push(errorToken(num, cls, msg), done(inProc ? 0xff : 0xfd, 2 | (inProc ? 1 : 0), 0));
                }
            });
            if (inProc) out.push(Buffer.from([0x79]), le32(0), done(0xfe, 0, 0));
            return Buffer.concat(out);
        }
        function message(type, m) {
            if (type === 0x12) {
                // VERSION, ENCRYPTION (2: not supported), INSTOPT, THREADID, MARS, then their values.
                const opts = Buffer.from([0, 0, 26, 0, 6, 1, 0, 32, 0, 1, 2, 0, 33, 0, 1, 3, 0, 34, 0, 0, 4, 0, 34, 0, 1, 0xff, 16, 0, 0x0f, 0xa0, 0, 0, 2, 0, 0]);
                return send(4, opts);
            }
            if (type === 0x10) {
                const off = (i) => [m.readUInt16LE(36 + i * 4), m.readUInt16LE(38 + i * 4)];
                const text = ([o, n]) => m.subarray(o, o + n * 2).toString("utf16le");
                const [po, pn] = off(2);
                const pw = Buffer.from(m.subarray(po, po + pn * 2).map((b) => { const x = b ^ 0xa5; return ((x << 4) & 0xf0) | (x >> 4); })).toString("utf16le");
                const user = text(off(1)), wanted = text(off(8));
                if (user !== USER || pw !== PASS || wanted === "denied") {
                    stats.refused++;
                    return send(4, Buffer.concat([errorToken(18456, 14, `Login failed for user '${user}'.`), done(0xfd, 2, 0)]));
                }
                stats.logins++;
                const ack = Buffer.concat([Buffer.from([1]), Buffer.from([0x73, 0x0b, 0x00, 0x03]), bvar("Microsoft SQL Server"), Buffer.from([16, 0, 3, 0xe8])]);
                return send(4, Buffer.concat([
                    envchange(1, bvar(wanted || DB), bvar("master")),
                    Buffer.concat([Buffer.from([0xad]), le16(ack.length), ack]),
                    envchange(4, bvar("4096"), bvar("4096")),
                    done(0xfd, 0, 0),
                ]));
            }
            const { total, desc: given } = header(m);
            if (desc && !given.equals(desc)) { return send(4, Buffer.concat([errorToken(3902, 16, "The request's transaction descriptor is not the one open."), done(0xfd, 2, 0)])); }
            if (desc) stats.descriptors++;
            if (type === 1) { stats.batches++; return send(4, statement(m.subarray(total).toString("utf16le"), {}, false)); }
            if (type === 3) {
                stats.rpcs++;
                let at = total;
                if (m.readUInt16LE(at) !== 0xffff || m.readUInt16LE(at + 2) !== 10) throw new Error("only sp_executesql");
                at += 6;
                const ps = readParams(m, at);
                const sql = ps[0][1];
                const params = Object.fromEntries(ps.slice(2).map(([n, v]) => { stats.params++; return [n, v]; }));
                return send(4, statement(sql, params, true));
            }
            s.destroy();
        }
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 8) {
                const len = buf.readUInt16BE(2);
                if (buf.length < len) return;
                const type = buf[0], eom = buf[1] & 1;
                parts.push(buf.subarray(8, len));
                buf = buf.subarray(len);
                if (eom) { const m = Buffer.concat(parts); parts = []; try { message(type, m); } catch (e) { send(4, Buffer.concat([errorToken(50000, 16, String(e.message ?? e)), done(0xfd, 2, 0)])); } }
            }
        });
        s.on("error", () => {});
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { MSSQL_HOST: `127.0.0.1:${port}`, MSSQL_USER: USER, MSSQL_PASSWORD: PASS, MSSQL_DATABASE: DB, MSSQL_ENCRYPT: "none" },
        close() { server.close(); db.close(); },
        check: () => (!stats.logins ? "no login came" : !stats.rpcs ? "no RPC came" : !stats.params ? "no parameter came" : stats.tx < 2 ? "no transaction came" : !stats.descriptors ? "the transaction descriptor was never seen" : !stats.split ? "no answer past one packet" : null),
    };
}
