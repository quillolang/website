// Google Sheets' v4 API for the google_sheets plugin's test, written from Google's reference for
// spreadsheets.values (get, update, append, clear, batchGet, batchUpdate) and spreadsheets (get,
// batchUpdate), with token auth from the shared OAuth stand-in. A grid per tab; ranges are parsed as
// A1 notation with quoted sheet names, and a name with a space and no quotes is refused, as is an
// unknown tab ("Unable to parse range: ..."). valueInputOption is required on writes: USER_ENTERED
// turns "=2*20" into a formula (a stand-in evaluation of a*b) and "12.50" into a number, RAW keeps
// text. values.get trims empty rows and cells, valueRenderOption gives FORMATTED_VALUE (text),
// UNFORMATTED_VALUE (numbers) or FORMULA. values.append finds the table the range touches and
// writes after it, tableRange and updates.updatedRange given. Errors are { error: { code, message,
// status } }, and a 429 is given once to see it waited out.
import { createServer } from "node:http";
import { googleAuth } from "./google_drive_oauth.mjs";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const letters = (n) => { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const number = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

export async function start({ port }) {
    const auth = googleAuth({ scope: SCOPE, tokenUri: `http://127.0.0.1:${port}/token` });
    const stats = { reads: 0, writes: 0, appends: 0, batches: 0, limited: false };
    const tabs = new Map([["Orders", { id: 0, cells: new Map() }], ["Q1 sales", { id: 11, cells: new Map() }]]);
    let nextTab = 100, calls = 0;
    const key = (r, c) => `${r},${c}`;
    function parse(range) {
        const fail = () => { throw { code: 400, status: "INVALID_ARGUMENT", message: `Unable to parse range: ${range}` }; };
        let sheet = "Orders", cells = range;
        const q = /^'((?:[^']|'')*)'!(.*)$/.exec(range);
        if (q) { sheet = q[1].replace(/''/g, "'"); cells = q[2]; }
        else if (range.includes("!")) { [sheet, cells] = range.split("!"); if (/\s/.test(sheet)) fail(); }
        const tab = tabs.get(sheet);
        if (!tab) fail();
        const m = /^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(cells);
        if (!m) fail();
        const c1 = number(m[1]), r1 = m[2] ? Number(m[2]) : 1;
        return { sheet, tab, c1, r1, c2: m[3] ? number(m[3]) : c1, r2: m[4] ? Number(m[4]) : (m[3] ? (m[2] ? r1 : 1000) : r1) };
    }
    const label = (p, r1, c1, r2, c2) => `${/\s/.test(p.sheet) ? `'${p.sheet}'` : p.sheet}!${letters(c1)}${r1}${r2 !== r1 || c2 !== c1 ? `:${letters(c2)}${r2}` : ""}`;
    const enter = (v, mode) => {
        if (mode === "RAW") return { value: v };
        if (typeof v === "string" && v.startsWith("=")) { const m = /^=(\d+)\*(\d+)$/.exec(v); return { formula: v, value: m ? Number(m[1]) * Number(m[2]) : 0 }; }
        if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return { value: Number(v), shown: v };
        return { value: v };
    };
    function write(p, values, mode) {
        let cols = 0;
        values.forEach((row, i) => { row.forEach((v, j) => { p.tab.cells.set(key(p.r1 + i, p.c1 + j), enter(v, mode)); cols = Math.max(cols, j + 1); }); });
        const cells = values.reduce((n, r) => n + r.length, 0);
        return { updatedRange: label(p, p.r1, p.c1, p.r1 + values.length - 1, p.c1 + cols - 1), updatedRows: values.length, updatedColumns: cols, updatedCells: cells };
    }
    function read(p, render) {
        const rows = [];
        for (let r = p.r1; r <= p.r2; r++) {
            const row = [];
            for (let c = p.c1; c <= p.c2; c++) {
                const e = p.tab.cells.get(key(r, c));
                row.push(!e ? "" : render === "FORMULA" ? (e.formula ?? e.value) : render === "UNFORMATTED_VALUE" ? e.value : String(e.shown ?? e.value));
            }
            while (row.length && row.at(-1) === "") row.pop();
            rows.push(row);
        }
        while (rows.length && !rows.at(-1).length) rows.pop();
        return rows;
    }
    function lastRow(p) { let last = 0; for (const k of p.tab.cells.keys()) { const [r, c] = k.split(",").map(Number); if (c >= p.c1 && c <= Math.max(p.c2, p.c1 + 25)) last = Math.max(last, r); } return last; }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            if (url.pathname === "/token") return auth.token(body, res);
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8", ...h }); res.end(JSON.stringify(v)); };
            const fail = (e) => send(e.code, { error: { code: e.code, message: e.message, status: e.status } });
            if (!auth.valid(req.headers.authorization)) return fail({ code: 401, status: "UNAUTHENTICATED", message: "Request had invalid authentication credentials." });
            calls++;
            if (calls === 3 && !stats.limited) { stats.limited = true; return send(429, { error: { code: 429, message: "Quota exceeded for quota metric 'Write requests'", status: "RESOURCE_EXHAUSTED" } }, { "retry-after": "1" }); }
            const path = decodeURIComponent(url.pathname).replace(/^\/v4\/spreadsheets\//, "");
            const q = url.searchParams;
            const json = body ? JSON.parse(body) : {};
            try {
                const m = /^([^/:]+)(?::(batchUpdate))?(?:\/values(?:\/(.+?))?(?::(append|clear|batchGet|batchUpdate))?)?$/.exec(path);
                if (!m) throw { code: 404, status: "NOT_FOUND", message: "Not found" };
                const [, id, sheetVerb, range, verb] = m;
                if (id === "forbidden-spreadsheet") throw { code: 403, status: "PERMISSION_DENIED", message: "The caller does not have permission" };
                if (id !== ID) throw { code: 404, status: "NOT_FOUND", message: "Requested entity was not found." };
                const needMode = () => { const v = q.get("valueInputOption") ?? json.valueInputOption; if (!["RAW", "USER_ENTERED"].includes(v)) throw { code: 400, status: "INVALID_ARGUMENT", message: "'valueInputOption' is required but not specified" }; return v; };
                if (sheetVerb === "batchUpdate") {
                    stats.batches++;
                    const replies = [];
                    for (const r of json.requests) {
                        if (r.addSheet) {
                            const t = r.addSheet.properties.title;
                            if (tabs.has(t)) throw { code: 400, status: "INVALID_ARGUMENT", message: `Invalid requests[0].addSheet: A sheet with the name "${t}" already exists. Please enter another name.` };
                            const sid = nextTab++; tabs.set(t, { id: sid, cells: new Map() });
                            replies.push({ addSheet: { properties: { sheetId: sid, title: t, index: tabs.size - 1, sheetType: "GRID", gridProperties: { rowCount: 1000, columnCount: 26 } } } });
                        } else if (r.repeatCell) {
                            if (![...tabs.values()].some((t) => t.id === r.repeatCell.range.sheetId) || r.repeatCell.range.endRowIndex !== 2 || r.repeatCell.range.startRowIndex !== 0) throw { code: 400, status: "INVALID_ARGUMENT", message: "Invalid range" };
                            replies.push({});
                        } else throw { code: 400, status: "INVALID_ARGUMENT", message: "Unknown request" };
                    }
                    return send(200, { spreadsheetId: ID, replies });
                }
                if (!path.includes("/values")) {
                    return send(200, { properties: { title: "Shop" }, sheets: [...tabs.entries()].map(([title, t], index) => ({ properties: { sheetId: t.id, title, index, sheetType: "GRID", gridProperties: { rowCount: 1000, columnCount: 26 } } })) });
                }
                if (verb === "batchGet") {
                    stats.reads++;
                    return send(200, { spreadsheetId: ID, valueRanges: q.getAll("ranges").map((r) => { const p = parse(r), v = read(p, q.get("valueRenderOption")); return { range: label(p, p.r1, p.c1, p.r2, p.c2), majorDimension: "ROWS", ...(v.length ? { values: v } : {}) }; }) });
                }
                if (verb === "batchUpdate") {
                    const mode = needMode();
                    const responses = json.data.map((d) => ({ spreadsheetId: ID, ...write(parse(d.range), d.values, mode) }));
                    stats.writes++;
                    return send(200, { spreadsheetId: ID, totalUpdatedRows: 0, totalUpdatedColumns: 0, totalUpdatedCells: responses.reduce((n, r) => n + r.updatedCells, 0), totalUpdatedSheets: 1, responses });
                }
                const p = parse(range);
                if (verb === "clear") { for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) p.tab.cells.delete(key(r, c)); return send(200, { spreadsheetId: ID, clearedRange: label(p, p.r1, p.c1, p.r2, p.c2) }); }
                if (verb === "append") {
                    stats.appends++;
                    const mode = needMode();
                    if (!["INSERT_ROWS", "OVERWRITE"].includes(q.get("insertDataOption"))) throw { code: 400, status: "INVALID_ARGUMENT", message: "bad insertDataOption" };
                    const last = lastRow(p);
                    const u = write({ ...p, r1: last + 1 }, json.values, mode);
                    return send(200, { spreadsheetId: ID, tableRange: label(p, 1, p.c1, last, p.c1 + 2), updates: { spreadsheetId: ID, ...u } });
                }
                if (req.method === "PUT") { stats.writes++; return send(200, { spreadsheetId: ID, ...write(p, json.values, needMode()) }); }
                stats.reads++;
                const v = read(p, q.get("valueRenderOption"));
                return send(200, { range: label(p, p.r1, p.c1, p.r2, p.c2), majorDimension: "ROWS", ...(v.length ? { values: v } : {}) });
            } catch (e) {
                if (e?.code) return fail(e);
                fail({ code: 500, status: "INTERNAL", message: String(e) });
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GOOGLE_SHEETS_API_URL: `http://127.0.0.1:${port}`, GOOGLE_SERVICE_ACCOUNT_JSON: auth.account, SPREADSHEET_ID: ID },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!auth.stats.granted) return `no token was granted: ${auth.stats.refused[0] ?? "no request"}`;
            if (!stats.writes || !stats.reads || !stats.appends || !stats.batches) return "the stand-in missed reads, writes, appends or batch updates";
            if (!stats.limited) return "the 429 was not met";
            return null;
        },
    };
}
