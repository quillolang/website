// An InfluxDB 2 (on `port`) and an InfluxDB 3 (on port + 1) for the influx plugin's test, written
// from InfluxData's documents (docs.influxdata.com: line protocol, /api/v2/write, /api/v2/query,
// /api/v3/write_lp, /api/v3/query_sql) and the answers real servers give: line protocol read with
// its escaping, field types and precision, gzip bodies, tokens (Token for 2, Bearer for 3), an
// org and bucket that must exist, field type conflicts refused, errors as JSON; a small part of
// Flux (from |> range |> filter with ==, and |> last/first/count/sum/limit) answered as annotated
// CSV, and of SQL (SELECT ... FROM ... WHERE a = 'x' AND ... ORDER BY time LIMIT n, $params).
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

const TOKEN2 = "standin-token-2", TOKEN3 = "apiv3_standin-token-3", ORG = "shop", BUCKET = "metrics";

// ---- Line protocol ----
function splitEsc(s, sep, quotes) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "\\" && i + 1 < s.length) { cur += c + s[++i]; continue; }
        if (quotes && c === '"') q = !q;
        if (c === sep && !q) { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur);
    return out;
}
// Lines as InfluxDB reads them: a line break inside a quoted string field belongs to the field.
function splitLines(text) {
    const out = []; let cur = "", section = 0, q = false, no = 1, start = 1;
    const end = () => { const l = cur.replace(/\r$/, "").replace(/^\s+/, ""); if (l.trim() && !l.startsWith("#")) out.push([start, l]); cur = ""; };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "\\" && i + 1 < text.length) { cur += c + text[++i]; continue; }
        if (c === "\n") { no++; if (!q) { end(); section = 0; start = no; continue; } }
        if (section === 0 && c === " " && cur.trim() && !cur.trimStart().startsWith("#")) section = 1;
        else if (section === 1 && c === '"') q = !q;
        else if (section === 1 && c === " " && !q) section = 2;
        cur += c;
    }
    end();
    return out;
}
const unesc = (s) => s.replace(/\\([,= \\"])/g, "$1");
function fieldValue(v) {
    if (v.startsWith('"')) { if (!v.endsWith('"') || v.length < 2) throw new Error("unterminated string"); return { type: "string", v: v.slice(1, -1).replace(/\\(["\\])/g, "$1") }; }
    if (/^(t|T|true|True|TRUE)$/.test(v)) return { type: "boolean", v: true };
    if (/^(f|F|false|False|FALSE)$/.test(v)) return { type: "boolean", v: false };
    if (/^-?\d+i$/.test(v)) return { type: "long", v: BigInt(v.slice(0, -1)) };
    if (/^\d+u$/.test(v)) return { type: "unsignedLong", v: BigInt(v.slice(0, -1)) };
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return { type: "double", v: Number(v) };
    throw new Error("invalid boolean");  // what InfluxDB 2 says of a bare word
}
const MULT = { ns: 1n, us: 1000n, ms: 1000000n, s: 1000000000n, nanosecond: 1n, microsecond: 1000n, millisecond: 1000000n, second: 1000000000n };
function parseLine(line, precision) {
    const parts = splitEsc(line, " ", true).filter((p) => p !== "");
    if (parts.length < 2 || parts.length > 3) throw new Error(parts.length < 2 ? "missing fields" : "bad timestamp");
    const head = splitEsc(parts[0], ",", false);
    const measurement = unesc(head[0]);
    if (!measurement) throw new Error("missing measurement");
    const tags = {};
    for (const t of head.slice(1)) {
        const kv = splitEsc(t, "=", false);
        if (kv.length !== 2 || !kv[0] || !kv[1]) throw new Error("missing tag value");
        tags[unesc(kv[0])] = unesc(kv[1]);
    }
    const fields = {};
    for (const f of splitEsc(parts[1], ",", true)) {
        const kv = splitEsc(f, "=", true);
        if (kv.length < 2 || !kv[0]) throw new Error("missing field value");
        fields[unesc(kv[0])] = fieldValue(kv.slice(1).join("="));
    }
    if (!Object.keys(fields).length) throw new Error("No fields were provided");
    let time;
    if (parts[2] != null) { if (!/^-?\d+$/.test(parts[2])) throw new Error("bad timestamp"); time = BigInt(parts[2]) * MULT[precision]; }
    else time = BigInt(Date.now()) * 1000000n;
    return { measurement, tags, fields, time };
}

function rfc3339(ns, z = true) {
    const ms = Number(ns / 1000000n);
    const frac = (ns % 1000000000n + 1000000000n) % 1000000000n;
    const base = new Date(ms).toISOString().slice(0, 19);
    const f = frac === 0n ? "" : "." + String(frac).padStart(9, "0").replace(/0+$/, "");
    return base + f + (z ? "Z" : "");
}
function relTime(s) {
    s = s.trim();
    if (s === "0") return 0n;
    const m = /^-(\d+)(ns|us|ms|s|m|h|d|w)$/.exec(s);
    if (m) { const u = { ns: 1n, us: 1000n, ms: 1000000n, s: 1000000000n, m: 60000000000n, h: 3600000000000n, d: 86400000000000n, w: 604800000000000n }[m[2]]; return BigInt(Date.now()) * 1000000n - BigInt(m[1]) * u; }
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return BigInt(t) * 1000000n;
    throw new Error(`cannot read time ${s}`);
}

export async function start({ port }) {
    const v2points = [], v3dbs = new Map(), types = new Map();
    const seen = { v2write: 0, v2gzip: 0, v2query: 0, v3write: 0, v3query: 0, refused: 0 };
    const send = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": typeof body === "string" ? "text/plain" : "application/json", ...headers }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    const read = (req) => new Promise((r) => { const ch = []; req.on("data", (d) => ch.push(d)); req.on("end", () => r(Buffer.concat(ch))); });

    function store(points, list, scope) {
        for (const p of points) for (const [k, f] of Object.entries(p.fields)) {
            const key = `${scope}/${p.measurement}/${k}`;
            const had = types.get(key);
            if (had && had !== f.type) throw Object.assign(new Error(`field type conflict: input field "${k}" on measurement "${p.measurement}" is type ${f.type}, already exists as type ${had} dropped=1`), { conflict: true });
        }
        for (const p of points) { for (const [k, f] of Object.entries(p.fields)) types.set(`${scope}/${p.measurement}/${k}`, f.type); list.push(p); }
    }

    // ---- Flux, a small part of it ----
    function flux(q) {
        const steps = q.split("|>").map((s) => s.trim());
        const from = /^from\(\s*bucket\s*:\s*"([^"]+)"\s*\)$/.exec(steps[0]);
        if (!from) throw new Error(`error @1:1: expected from(bucket: "...")`);
        if (from[1] !== BUCKET) throw Object.assign(new Error(`failed to initialize execute state: could not find bucket "${from[1]}"`), { code: 404 });
        let start = null, stop = BigInt(Date.now()) * 1000000n, rows = v2points.slice();
        let agg = null, limit = null;
        for (const st of steps.slice(1)) {
            let m;
            if ((m = /^range\(\s*start\s*:\s*([^,)]+)(?:,\s*stop\s*:\s*([^)]+))?\)$/.exec(st))) { start = relTime(m[1]); if (m[2]) stop = relTime(m[2]); }
            else if ((m = /^filter\(\s*fn\s*:\s*\(r\)\s*=>\s*(.+)\)$/.exec(st))) {
                const conds = m[1].split(/\s+and\s+/).map((c) => {
                    const x = /^r(?:\.(\w+)|\["([^"]+)"\])\s*==\s*"([^"]*)"$/.exec(c.trim());
                    if (!x) throw new Error(`error: this stand-in reads only r.key == "value" (joined by and), not ${c}`);
                    return [x[1] ?? x[2], x[3]];
                });
                rows = rows.filter((p) => conds.every(([k, v]) => (k === "_measurement" ? p.measurement === v : k === "_field" ? p.field === v : p.tags[k] === v)));
            }
            else if ((m = /^(last|first|count|sum)\(\)$/.exec(st))) agg = m[1];
            else if ((m = /^limit\(\s*n\s*:\s*(\d+)\s*\)$/.exec(st))) limit = Number(m[1]);
            else { const fn = /^(\w+)/.exec(st)?.[1] ?? st; throw new Error(`error @1:1: undefined identifier ${fn}`); }
        }
        if (start == null) throw new Error("error calling function \"filter\": cannot submit unbounded read to \"metrics\"; try bounding 'from' with a call to 'range'");
        rows = rows.filter((p) => p.time >= start && p.time < stop);
        // One table per series: measurement, tags and field.
        const tables = new Map();
        for (const p of rows.sort((a, b) => (a.time < b.time ? -1 : 1))) {
            const key = JSON.stringify([p.measurement, Object.entries(p.tags).sort(), p.field]);
            if (!tables.has(key)) tables.set(key, []);
            tables.get(key).push(p);
        }
        let out = "", n = 0;
        for (const ps of [...tables.values()].sort((a, b) => (a[0].field < b[0].field ? -1 : a[0].field > b[0].field ? 1 : 0))) {
            let list = ps;
            if (agg === "last") list = [ps[ps.length - 1]];
            if (agg === "first") list = [ps[0]];
            if (agg === "count") list = [{ ...ps[0], f: { type: "long", v: BigInt(ps.length) }, time: null }];
            if (agg === "sum") list = [{ ...ps[0], f: { type: ps[0].f.type, v: ps[0].f.type === "double" ? ps.reduce((a, p) => a + p.f.v, 0) : ps.reduce((a, p) => a + p.f.v, 0n) }, time: null }];
            if (limit != null) list = list.slice(0, limit);
            const tagKeys = Object.keys(ps[0].tags).sort();
            const withTime = list[0].time != null;
            const cols = ["result", "table", "_start", "_stop", ...(withTime ? ["_time"] : []), "_value", "_field", "_measurement", ...tagKeys];
            const dt = ["string", "long", "dateTime:RFC3339", "dateTime:RFC3339", ...(withTime ? ["dateTime:RFC3339"] : []), list[0].f.type, "string", "string", ...tagKeys.map(() => "string")];
            const group = ["false", "false", "true", "true", ...(withTime ? ["false"] : []), "false", "true", "true", ...tagKeys.map(() => "true")];
            const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
            out += `#datatype,${dt.join(",")}\n#group,${group.join(",")}\n#default,_result,${cols.slice(1).map(() => "").join(",")}\n,${cols.join(",")}\n`;
            for (const p of list) out += "," + ["", n, rfc3339(start), rfc3339(stop), ...(withTime ? [rfc3339(p.time)] : []), csv(p.f.v), p.field, p.measurement, ...tagKeys.map((k) => csv(p.tags[k]))].join(",") + "\n";
            out += "\n";
            n++;
        }
        return out;
    }

    // ---- SQL, a small part of it ----
    function sql(dbName, q, params = {}) {
        const db = v3dbs.get(dbName);
        if (!db) throw Object.assign(new Error(`query error: database not found: ${dbName}`), { code: 404 });
        q = q.replace(/\$(\w+)/g, (m, k) => { if (!(k in params)) throw new Error(`query error: no value for parameter $${k}`); const v = params[k]; return typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v); });
        const m = /^\s*SELECT\s+(.+?)\s+FROM\s+"?([\w.-]+)"?(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+time(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?\s*;?\s*$/i.exec(q);
        if (!m) throw new Error(`query error: this stand-in reads SELECT cols FROM table [WHERE a = 'x' AND ...] [ORDER BY time] [LIMIT n]: ${q}`);
        const [, colsText, table, where, dir, lim] = m;
        let rows = db.filter((p) => p.measurement === table);
        if (!rows.length && !db.some((p) => p.measurement === table)) throw new Error(`query error: table '${table}' not found`);
        if (where) {
            const conds = where.split(/\s+AND\s+/i).map((c) => { const x = /^"?(\w+)"?\s*=\s*(?:'((?:[^']|'')*)'|(-?[\d.]+))$/.exec(c.trim()); if (!x) throw new Error(`query error: cannot read ${c}`); return [x[1], x[2] != null ? x[2].replace(/''/g, "'") : Number(x[3])]; });
            rows = rows.filter((p) => conds.every(([k, v]) => (p.tags[k] ?? p.fields[k]?.v) == v));
        }
        rows.sort((a, b) => (a.time < b.time ? -1 : 1));
        if (dir?.toUpperCase() === "DESC") rows.reverse();
        if (lim) rows = rows.slice(0, Number(lim));
        const cols = colsText.trim() === "*" ? null : colsText.split(",").map((c) => c.trim().replace(/"/g, ""));
        return rows.map((p) => {
            const all = { ...p.tags, time: rfc3339(p.time, false) };
            for (const [k, f] of Object.entries(p.fields)) all[k] = typeof f.v === "bigint" ? Number(f.v) : f.v;
            const picked = cols ? Object.fromEntries(cols.map((c) => [c, all[c] ?? null])) : all;
            return Object.fromEntries(Object.keys(picked).sort().map((k) => [k, picked[k]]));
        });
    }

    const v2 = createServer(async (req, res) => {
        const u = new URL(req.url, "http://x");
        const q = Object.fromEntries(u.searchParams);
        let body = await read(req);
        if (u.pathname === "/ping" || u.pathname === "/health") return send(res, 204, "", { "X-Influxdb-Version": "v2.7.11-standin", "X-Influxdb-Build": "OSS" });
        if (req.headers.authorization !== `Token ${TOKEN2}`) { seen.refused++; return send(res, 401, { code: "unauthorized", message: "unauthorized access" }); }
        if (u.pathname === "/api/v2/write" && req.method === "POST") {
            if (q.org !== ORG) return send(res, 404, { code: "not found", message: `organization name "${q.org}" not found` });
            if (q.bucket !== BUCKET) return send(res, 404, { code: "not found", message: `bucket "${q.bucket}" not found` });
            const precision = q.precision ?? "ns";
            if (!["ns", "us", "ms", "s"].includes(precision)) return send(res, 400, { code: "invalid", message: `invalid precision; valid precision units are ns, us, ms, and s` });
            if (req.headers["content-encoding"] === "gzip") { body = gunzipSync(body); seen.v2gzip++; }
            const points = [];
            for (const [, line] of splitLines(body.toString())) {
                try { const p = parseLine(line, precision); for (const [field, f] of Object.entries(p.fields)) points.push({ ...p, field, f }); }
                catch (e) { return send(res, 400, { code: "invalid", message: `unable to parse '${line}': ${e.message}` }); }
            }
            try { store(points.map((p) => ({ ...p, fields: { [p.field]: p.f } })), v2points, "v2"); }
            catch (e) { return send(res, 422, { code: "unprocessable entity", message: `failure writing points to database: partial write: ${e.message}` }); }
            seen.v2write++;
            res.writeHead(204); return res.end();
        }
        if (u.pathname === "/api/v2/query" && req.method === "POST") {
            if (q.org !== ORG) return send(res, 404, { code: "not found", message: `organization name "${q.org}" not found` });
            let spec;
            try { spec = JSON.parse(body.toString()); } catch { return send(res, 400, { code: "invalid", message: "failed to decode request body" }); }
            try { const csv = flux(spec.query); seen.v2query++; res.writeHead(200, { "content-type": "text/csv; charset=utf-8" }); return res.end(csv); }
            catch (e) { return send(res, e.code ?? 400, { code: e.code === 404 ? "not found" : "invalid", message: e.message }); }
        }
        send(res, 404, { code: "not found", message: "path not found" });
    });

    const v3 = createServer(async (req, res) => {
        const u = new URL(req.url, "http://x");
        const q = Object.fromEntries(u.searchParams);
        let body = await read(req);
        if (req.headers.authorization !== `Bearer ${TOKEN3}`) { seen.refused++; res.writeHead(401, { "content-length": 0 }); return res.end(); }
        if (u.pathname === "/ping") return send(res, 200, { version: "3.6.0-standin", revision: "standin" });
        if (u.pathname === "/api/v3/write_lp" && req.method === "POST") {
            if (!q.db) return send(res, 400, { error: "missing db" });
            const precision = q.precision ?? "auto";
            if (!["auto", "nanosecond", "microsecond", "millisecond", "second"].includes(precision)) return send(res, 400, { error: `invalid precision ${precision}` });
            if (req.headers["content-encoding"] === "gzip") body = gunzipSync(body);
            const points = [];
            for (const [no, line] of splitLines(body.toString())) {
                try { points.push(parseLine(line, precision === "auto" ? "ns" : precision)); }
                catch (e) { return send(res, 400, { error: "parsing failed for write_lp endpoint", data: [{ error_message: e.message, line_number: no, original_line: line }] }); }
            }
            if (!v3dbs.has(q.db)) v3dbs.set(q.db, []);
            try { store(points, v3dbs.get(q.db), `v3/${q.db}`); }
            catch (e) { return send(res, 400, { error: "partial write of line protocol occurred", data: [{ error_message: e.message, line_number: 1, original_line: "" }] }); }
            seen.v3write++;
            res.writeHead(204); return res.end();
        }
        if (u.pathname === "/api/v3/query_sql" && req.method === "POST") {
            let spec;
            try { spec = JSON.parse(body.toString()); } catch { return send(res, 400, { error: "invalid JSON" }); }
            try { const rows = sql(spec.db, spec.q, spec.params ?? {}); seen.v3query++; return send(res, 200, rows); }
            catch (e) { return send(res, e.code ?? 400, { error: e.message }); }
        }
        send(res, 404, { error: "not found" });
    });

    await Promise.all([new Promise((r) => v2.listen(port, "127.0.0.1", r)), new Promise((r) => v3.listen(port + 1, "127.0.0.1", r))]);
    return {
        env: {
            INFLUX_URL: `http://127.0.0.1:${port}`, INFLUX_TOKEN: TOKEN2, INFLUX_ORG: ORG, INFLUX_BUCKET: BUCKET,
            INFLUX3_URL: `http://127.0.0.1:${port + 1}`, INFLUX3_TOKEN: TOKEN3, INFLUX3_DATABASE: "shop",
        },
        close() { v2.close(); v3.close(); },
        check() {
            const missing = ["v2write", "v2gzip", "v2query", "v3write", "v3query"].filter((k) => !seen[k]);
            if (missing.length) return `the InfluxDB stand-in never got: ${missing.join(", ")}`;
            return seen.refused ? `the InfluxDB stand-in refused ${seen.refused} request(s) for their token` : null;
        },
    };
}
