// BigQuery's REST API for the bigquery plugin's test, written from Google's reference: jobs.query
// (POST /bigquery/v2/projects/:p/queries), jobs.getQueryResults (GET .../queries/:job with timeoutMs,
// pageToken), jobs.get, tabledata.insertAll and tables.list, with token auth from the shared OAuth
// stand-in. jobs.query answers { jobComplete: false, jobReference } for a job that takes a while,
// { jobComplete, schema: { fields }, rows: [{ f: [{ v }] }], totalRows, pageToken, totalBytesProcessed }
// otherwise, values always in text as the real one sends them, TIMESTAMP in microseconds only when
// formatOptions.useInt64Timestamp is set and as float seconds when it is not. Query parameters are
// checked (parameterType, parameterValue, array and struct forms, and an undeclared @name is
// refused). insertAll stops the other rows of a request with reason "stopped" unless skipInvalidRows.
// Errors are { error: { code, message, errors: [{ reason, message, location }], status } }.
import { createServer } from "node:http";
import { googleAuth } from "./google_drive_oauth.mjs";

const SCOPE = "https://www.googleapis.com/auth/bigquery";
const SALES = [];
for (let i = 1; i <= 7; i++) SALES.push({ id: i, region: i % 2 ? "eu" : "us", amount: i * 2 });

export async function start({ port }) {
    const auth = googleAuth({ scope: SCOPE, tokenUri: `http://127.0.0.1:${port}/token` });
    const stats = { queries: 0, polls: 0, pages: 0, inserted: new Set(), wholeMicros: 0 };
    const jobs = new Map();
    let nextJob = 1;
    const SCHEMA = [{ name: "id", type: "INTEGER", mode: "NULLABLE" }, { name: "region", type: "STRING", mode: "NULLABLE" }, { name: "amount", type: "INTEGER", mode: "NULLABLE" }];
    const row = (...vals) => ({ f: vals.map((v) => ({ v })) });
    function fail(code, status, reason, message, location) { const e = new Error(message); e.http = { error: { code, message, errors: [{ message, domain: "global", reason, ...(location ? { location, locationType: "other" } : {}) }], status } }; e.code = code; return e; }
    function run(b) {
        const sql = b.query;
        const params = new Map((b.queryParameters ?? []).map((p) => [p.name, p]));
        for (const m of sql.matchAll(/@(\w+)/g)) if (!params.has(m[1])) throw fail(400, "INVALID_ARGUMENT", "invalidQuery", `Undeclared query parameter: ${m[1]}`, "q");
        if (/^SELEC?\s*$|^SELEC /.test(sql)) throw fail(400, "INVALID_ARGUMENT", "invalidQuery", "Syntax error: Unexpected identifier \"SELEC\" at [1:1]", "q");
        if (/FROM nowhere/.test(sql)) throw fail(404, "NOT_FOUND", "notFound", "Not found: Table quillo-test:shop.nowhere was not found in location EU");
        if (/FROM sales/.test(sql) && b.dryRun) return { schema: SCHEMA, rows: [], bytes: "123456" };
        if (/FROM sales/.test(sql)) {
            const region = params.get("region"), least = params.get("least");
            if (region?.parameterType.type !== "STRING" || least?.parameterType.type !== "INT64" || b.parameterMode !== "NAMED") throw fail(400, "INVALID_ARGUMENT", "invalidQuery", "No matching signature for operator =");
            const rows = SALES.filter((s) => s.region === region.parameterValue.value && s.amount > Number(least.parameterValue.value)).map((s) => row(String(s.id), s.region, String(s.amount)));
            return { schema: SCHEMA, rows, bytes: "4096" };
        }
        if (/FROM all_types/.test(sql)) {
            const micros = "1793527200123456";
            const ts = b.formatOptions?.useInt64Timestamp ? micros : "1.793527200123456E9";
            if (b.formatOptions?.useInt64Timestamp) stats.wholeMicros++;
            return { bytes: "10", schema: [
                { name: "big", type: "INTEGER" }, { name: "price", type: "NUMERIC" }, { name: "ratio", type: "FLOAT" }, { name: "odd", type: "FLOAT" }, { name: "ok", type: "BOOLEAN" },
                { name: "at", type: "TIMESTAMP" }, { name: "day", type: "DATE" }, { name: "none", type: "STRING" },
                { name: "tags", type: "STRING", mode: "REPEATED" }, { name: "scores", type: "INTEGER", mode: "REPEATED" },
                { name: "who", type: "RECORD", fields: [{ name: "name", type: "STRING" }, { name: "age", type: "INTEGER" }, { name: "seen", type: "TIMESTAMP" }] },
                { name: "items", type: "RECORD", mode: "REPEATED", fields: [{ name: "sku", type: "STRING" }, { name: "qty", type: "INTEGER" }] },
            ], rows: [{ f: [
                { v: "9007199254740993" }, { v: "12.345678901" }, { v: "0.25" }, { v: "NaN" }, { v: "true" }, { v: ts }, { v: "2026-11-01" }, { v: null },
                { v: [{ v: "a" }, { v: "b" }] }, { v: [{ v: "1" }, { v: "2" }] },
                { v: { f: [{ v: "Ada" }, { v: "36" }, { v: "0" }] } },
                { v: [{ v: { f: [{ v: "m-1" }, { v: "2" }] } }, { v: { f: [{ v: "m-2" }, { v: "1" }] } }] },
            ] }] };
        }
        if (/FROM slow_job/.test(sql)) {
            const t = params.get("tags"), d = params.get("day"), who = params.get("who");
            if (d?.parameterType.type !== "DATE" || t?.parameterType.arrayType?.type !== "STRING" || t?.parameterValue.arrayValues?.length !== 2 || who?.parameterType.type !== "STRUCT" || who?.parameterValue.structValues?.age?.value !== "36") throw fail(400, "INVALID_ARGUMENT", "invalidQuery", "Query parameter has the wrong form");
            return { schema: [{ name: "n", type: "INTEGER" }], rows: [row("42")], bytes: "1", polls: 2 };
        }
        if (/FROM failing_job/.test(sql)) return { failed: { reason: "resourcesExceeded", message: "Resources exceeded during query execution", location: "query" }, polls: 1 };
        return { schema: SCHEMA, rows: [], bytes: "0" };
    }
    function pageOf(job, url, b) {
        const size = b.maxResults ?? job.pageSize ?? 3;
        const at = Number(url?.searchParams.get("pageToken") ?? 0);
        if (at) stats.pages++;
        const rows = job.result.rows.slice(at, at + size);
        const next = at + size < job.result.rows.length ? String(at + size) : undefined;
        return { kind: "bigquery#queryResponse", jobReference: { projectId: "quillo-test", jobId: job.id, location: "EU" }, schema: { fields: job.result.schema }, totalRows: String(job.result.rows.length), rows, totalBytesProcessed: job.result.bytes, jobComplete: true, cacheHit: false, ...(next ? { pageToken: next } : {}) };
    }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            if (url.pathname === "/token") return auth.token(body, res);
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8" }); res.end(JSON.stringify(v)); };
            if (!auth.valid(req.headers.authorization)) return send(401, { error: { code: 401, message: "Request is missing required authentication credential.", errors: [{ reason: "required", message: "Login Required.", domain: "global" }], status: "UNAUTHENTICATED" } });
            const p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            if (p[0] !== "bigquery" || p[1] !== "v2" || p[2] !== "projects" || p[3] !== "quillo-test") return send(404, { error: { code: 404, message: "Not found", errors: [{ reason: "notFound" }], status: "NOT_FOUND" } });
            const json = body ? JSON.parse(body) : {};
            try {
                if (p[4] === "queries" && !p[5] && req.method === "POST") {
                    stats.queries++;
                    if (json.useLegacySql !== false) throw fail(400, "INVALID_ARGUMENT", "invalid", "useLegacySql must be false for query parameters");
                    const result = run(json);
                    if (json.dryRun) return send(200, { kind: "bigquery#queryResponse", jobComplete: false, jobReference: { projectId: "quillo-test" }, schema: { fields: result.schema }, totalBytesProcessed: result.bytes });
                    const job = { id: `job_${nextJob++}`, result, left: result.polls ?? 0 };
                    jobs.set(job.id, job);
                    if (job.left) return send(200, { kind: "bigquery#queryResponse", jobReference: { projectId: "quillo-test", jobId: job.id, location: "EU" }, jobComplete: false });
                    return send(200, pageOf(job, null, json));
                }
                if (p[4] === "queries" && p[5] && req.method === "GET") {
                    const job = jobs.get(p[6] ?? p[5]);
                    if (!job) throw fail(404, "NOT_FOUND", "notFound", `Not found: Job quillo-test:EU.${p[5]}`);
                    if (url.searchParams.get("location") !== "EU") throw fail(404, "NOT_FOUND", "notFound", `Not found: Job quillo-test:${p[5]}: location not given`);
                    stats.polls++;
                    if (job.left > 0) { job.left--; if (job.left) return send(200, { kind: "bigquery#getQueryResultsResponse", jobReference: { projectId: "quillo-test", jobId: job.id, location: "EU" }, jobComplete: false }); }
                    if (job.result.failed) return send(400, { error: { code: 400, message: job.result.failed.message, errors: [{ ...job.result.failed, domain: "global" }], status: "INVALID_ARGUMENT" } });
                    if (url.searchParams.get("formatOptions.useInt64Timestamp") === "true") stats.wholeMicros++;
                    return send(200, pageOf(job, url, json));
                }
                if (p[4] === "jobs") {
                    const job = jobs.get(p[5]);
                    if (!job) throw fail(404, "NOT_FOUND", "notFound", "Not found: Job");
                    return send(200, { status: { state: "DONE" }, statistics: { totalBytesProcessed: job.result.bytes } });
                }
                if (p[4] === "datasets" && p[6] === "tables" && !p[7]) return send(200, { tables: [{ tableReference: { tableId: "sales" }, type: "TABLE" }] });
                if (p[6] === "tables" && p[8] === "insertAll") {
                    const bad = [], errs = [];
                    json.rows.forEach((r, i) => {
                        if (!r.insertId) throw fail(400, "INVALID_ARGUMENT", "invalid", "insertId expected in this test");
                        if (typeof r.json.amount !== "number") { bad.push(i); errs.push({ index: i, errors: [{ reason: "invalid", location: "amount", debugInfo: "", message: `Cannot convert value to integer (bad value): ${r.json.amount}` }] }); }
                    });
                    if (errs.length && !json.skipInvalidRows) json.rows.forEach((r, i) => { if (!bad.includes(i)) errs.push({ index: i, errors: [{ reason: "stopped", location: "", debugInfo: "", message: "" }] }); });
                    json.rows.forEach((r, i) => { if (!errs.some((e) => e.index === i)) stats.inserted.add(r.insertId); });
                    errs.sort((a, b) => a.index - b.index);
                    return send(200, { kind: "bigquery#tableDataInsertAllResponse", ...(errs.length ? { insertErrors: errs } : {}) });
                }
                throw fail(404, "NOT_FOUND", "notFound", "Not found");
            } catch (e) {
                if (e.http) return send(e.code, e.http);
                send(500, { error: { code: 500, message: String(e), errors: [{ reason: "backendError" }], status: "INTERNAL" } });
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { BIGQUERY_API_URL: `http://127.0.0.1:${port}`, GOOGLE_SERVICE_ACCOUNT_JSON: auth.account },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!auth.stats.granted) return `no token was granted: ${auth.stats.refused[0] ?? "no request"}`;
            if (!stats.polls) return "the job was never polled";
            if (!stats.pages) return "no second page was read";
            if (!stats.wholeMicros) return "timestamps were not asked for in whole microseconds";
            if (!stats.inserted.has("b3")) return "skip_invalid did not keep the good rows";
            if (stats.inserted.has("a1")) return "a stopped row counted as inserted";
            return null;
        },
    };
}
