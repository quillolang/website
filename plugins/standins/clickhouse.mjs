// A ClickHouse HTTP interface for the clickhouse plugin's test, written from ClickHouse's "HTTP
// Interface", "Formats" and "Query Parameters" pages. POST / takes the query from `?query=` and
// the body (an INSERT's rows follow it), `param_<name>` read in the escaped format (\t, \n, \\, \N),
// `default_format`, `wait_end_of_query`, X-ClickHouse-User and X-ClickHouse-Key, GET /ping says
// "Ok.\n". A small SQL engine covers CREATE TABLE, INSERT ... FORMAT JSONEachRow (a value of the
// wrong type refused with its code) and SELECT of columns or count() with WHERE col = {p:Type},
// ORDER BY col. Results are JSONCompact with meta, data, rows and statistics; 64-bit integers are
// quoted as output_format_json_quote_64bit_integers says, decimals as ..._quote_decimals. Errors are
// bodies of `Code: N. DB::Exception: ... (NAME) (version ...)` with X-ClickHouse-Exception-Code;
// throwIf fails midway through a 200, as a real long query does.
import { createServer } from "node:http";

const USER = "standin", KEY = "standin-ch-secret";
const VERSION = "(version 24.8.4.13 (official build))";

const unescape = (t) => (t === "\\N" ? null : t.replace(/\\(.)/g, (_, c) => ({ t: "\t", n: "\n", r: "\r", "\\": "\\" }[c] ?? c)));

export async function start({ port }) {
    const stats = { inserts: 0, queries: 0, params: 0, asyncInserts: 0, dedup: new Set(), trap: false };
    const tables = new Map();
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const q = url.searchParams;
            const fail = (status, code, name, msg) => {
                res.writeHead(status, { "content-type": "text/plain; charset=UTF-8", "x-clickhouse-exception-code": String(code) });
                res.end(`Code: ${code}. DB::Exception: ${msg}. (${name}) ${VERSION}\n`);
            };
            if (url.pathname === "/ping") { res.writeHead(200); return res.end("Ok.\n"); }
            if (req.headers["x-clickhouse-user"] !== USER || req.headers["x-clickhouse-key"] !== KEY)
                return fail(403, 516, "AUTHENTICATION_FAILED", `${req.headers["x-clickhouse-user"] ?? "default"}: Authentication failed: password is incorrect, or there is no user with such name`);
            const summary = (written, read) => JSON.stringify({ read_rows: String(read), read_bytes: "0", written_rows: String(written), written_bytes: "0", total_rows_to_read: "0", result_rows: "0", result_bytes: "0" });
            let body = Buffer.concat(chunks).toString();
            let sql = q.get("query") ? q.get("query") + "\n" + body : body;
            sql = sql.trim();
            const params = {};
            for (const [k, v] of q) if (k.startsWith("param_")) { params[k.slice(6)] = unescape(v); stats.params++; }
            const substitute = (name, type) => {
                if (!(name in params)) throw { code: 456, name: "UNKNOWN_QUERY_PARAMETER", msg: `Substitution \`${name}\` is not set` };
                return { value: params[name], type };
            };
            try {
                let m;
                if ((m = /^CREATE TABLE (?:IF NOT EXISTS )?(\w+) \(([\s\S]+?)\) ENGINE/i.exec(sql))) {
                    if (!tables.has(m[1])) {
                        const cols = []; let depth = 0, cur = "";
                        for (const ch of m[2]) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { cols.push(cur); cur = ""; } else cur += ch; }
                        cols.push(cur);
                        tables.set(m[1], { cols: cols.map((c) => { const [, n, t] = /^\s*(\w+)\s+(.+?)\s*$/.exec(c); return { name: n, type: t }; }), rows: [] });
                    }
                    res.writeHead(200, { "x-clickhouse-summary": summary(0, 0) });
                    return res.end();
                }
                if ((m = /^INSERT INTO `?(\w+)`? FORMAT JSONEachRow\n?([\s\S]*)$/i.exec(sql))) {
                    const t = tables.get(m[1]);
                    if (!t) throw { code: 60, name: "UNKNOWN_TABLE", msg: `Table default.${m[1]} does not exist` };
                    if (q.get("async_insert") === "1") stats.asyncInserts++;
                    if (q.get("insert_deduplication_token") && stats.dedup.has(q.get("insert_deduplication_token"))) { res.writeHead(200, { "x-clickhouse-summary": summary(0, 0) }); return res.end(); }
                    const rows = m[2].split("\n").filter(Boolean).map((l) => JSON.parse(l, (k, v) => v));
                    // The 64-bit numbers keep their digits: read them from the text.
                    const raw = m[2].split("\n").filter(Boolean);
                    rows.forEach((r, i) => { const big = /"user":(\d+)/.exec(raw[i]); if (big) r.user = big[1]; });
                    for (const r of rows) for (const c of t.cols) {
                        if (/^U?Int/.test(c.type) && r[c.name] !== undefined && !/^\d+$/.test(String(r[c.name])))
                            throw { code: 27, name: "CANNOT_PARSE_INPUT_ASSERTION_FAILED", msg: `Cannot parse input: expected a number for column '${c.name}' at row 1: While executing ParallelParsingBlockInputFormat` };
                    }
                    t.rows.push(...rows);
                    if (q.get("insert_deduplication_token")) stats.dedup.add(q.get("insert_deduplication_token"));
                    stats.inserts++;
                    res.writeHead(200, { "x-clickhouse-summary": summary(rows.length, 0) });
                    return res.end();
                }
                if ((m = /^SELECT ([\s\S]+?) FROM (\w+)(?: WHERE (\w+) = \{(\w+):(\w+)\})?(?: ORDER BY (\w+))?\s*$/i.exec(sql))) {
                    stats.queries++;
                    const t = tables.get(m[2]);
                    if (!t) throw { code: 60, name: "UNKNOWN_TABLE", msg: `Unknown table expression identifier '${m[2]}' in scope SELECT` };
                    let rows = t.rows;
                    if (m[3]) {
                        const w = substitute(m[4], m[5]);
                        if (w.value === "/it's\ta\\trap") stats.trap = true;
                        rows = rows.filter((r) => String(r[m[3]]) === w.value);
                    }
                    if (m[6]) rows = [...rows].sort((a, b) => (BigInt(a[m[6]]) < BigInt(b[m[6]]) ? -1 : 1));
                    const fmt = q.get("default_format");
                    const quoted = q.get("output_format_json_quote_64bit_integers") === "1", decimals = q.get("output_format_json_quote_decimals") === "1";
                    const cell = (v, type) => {
                        if (/^(U?Int64)$/.test(type)) return quoted ? String(v) : Number(v);
                        if (/^Decimal/.test(type)) return decimals ? String(v) : Number(v);
                        return v;
                    };
                    const statistics = { elapsed: 0.001, rows_read: rows.length, bytes_read: 0 };
                    if (/^throwIf/.test(m[1])) {
                        res.writeHead(200, { "content-type": "application/json", "x-clickhouse-summary": summary(0, 0) });
                        return res.end(`{\n\t"meta": [{"name":"x","type":"UInt8"}],\n\t"data": [\n[0],\nCode: 395. DB::Exception: Value passed to 'throwIf' function is non-zero: while executing 'FUNCTION throwIf(...)'. (FUNCTION_THROW_IF_VALUE_IS_NON_ZERO) ${VERSION}\n`);
                    }
                    let meta, data;
                    if (/^count\(\)/.test(m[1])) {
                        const name = /AS (\w+)/i.exec(m[1])?.[1] ?? "count()";
                        meta = [{ name, type: "UInt64" }]; data = [[cell(rows.length, "UInt64")]];
                    } else {
                        const names = m[1].split(",").map((s) => s.trim());
                        meta = names.map((n) => { const c = t.cols.find((x) => x.name === n); if (!c) throw { code: 47, name: "UNKNOWN_IDENTIFIER", msg: `Missing columns: '${n}'` }; return { name: n, type: c.type }; });
                        data = rows.map((r) => meta.map((c) => cell(r[c.name], c.type)));
                    }
                    if (fmt !== "JSONCompact") throw { code: 73, name: "UNKNOWN_FORMAT", msg: `The stand-in knows only JSONCompact, not ${fmt}` };
                    res.writeHead(200, { "content-type": "application/json; charset=UTF-8", "x-clickhouse-summary": summary(0, rows.length) });
                    return res.end(JSON.stringify({ meta, data, rows: data.length, statistics }));
                }
                throw { code: 62, name: "SYNTAX_ERROR", msg: `Syntax error: failed at position 1: ${sql.slice(0, 60)}` };
            } catch (e) {
                if (e?.code) return fail(e.code === 60 || e.code === 47 ? 404 : 400, e.code, e.name, e.msg);
                fail(500, 1001, "STD_EXCEPTION", String(e));
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { CLICKHOUSE_API_URL: `http://127.0.0.1:${port}`, CLICKHOUSE_USER: USER, CLICKHOUSE_PASSWORD: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.inserts) return "the ClickHouse stand-in got no insert";
            if (!stats.queries) return "the ClickHouse stand-in got no query";
            if (!stats.params) return "the ClickHouse stand-in got no parameter";
            if (!stats.asyncInserts) return "the async insert did not ask for async_insert";
            if (!stats.trap) return "the text with a tab, a quote and a backslash did not arrive whole";
            return null;
        },
    };
}
