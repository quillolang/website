// A Notion API for the notion plugin's test, written from developers.notion.com/reference: Bearer
// auth, a required Notion-Version header, POST /v1/pages (parent, properties checked against the
// database schema, at most 100 children), GET and PATCH /v1/pages/:id, POST /v1/databases/:id/query
// (filter on select, sorts, page_size at most 100, start_cursor, has_more, next_cursor), GET and PATCH
// /v1/blocks/:id/children, POST /v1/search. A rich text's content is at most 2000 characters. Errors
// are { object: "error", status, code, message }, and a 429 has Retry-After. Ids must be dashed.
//
//   start({ port }) -> { env: { NOTION_API_URL, NOTION_TOKEN, NOTION_DATABASE_ID }, close(), check() }
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const TOKEN = "qk_test_notion", DB = "d9824bdc-8445-4327-be8b-5b47500af6ce";
const SCHEMA = { Name: "title", Stage: "select", Tags: "multi_select", Value: "number", Due: "date", Won: "checkbox", Site: "url", Notes: "rich_text" };

export async function start({ port }) {
    const stats = { created: 0, queries: 0, cursors: 0, appended: 0, biggestAppend: 0, limited: 0, tooLong: 0 };
    const pages = new Map(), blocks = new Map();
    const plain = (r) => r.map((x) => ({ ...x, plain_text: x.text?.content ?? "" }));
    const rows = Array.from({ length: 230 }, (_, i) => ({ object: "page", id: randomUUID(), url: "u", properties: { Name: { type: "title", title: plain([{ text: { content: `Deal ${i}` } }]) }, Stage: { type: "select", select: { name: i % 2 ? "Won" : "Open" } }, Value: { type: "number", number: i } } }));
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(JSON.stringify(v)); };
            const fail = (status, code, message, h) => send(status, { object: "error", status, code, message, request_id: "r1" }, h);
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(401, "unauthorized", "API token is invalid.");
            if (!req.headers["notion-version"]) return fail(400, "missing_version", "Notion-Version header failed validation: Notion-Version header should be defined.");
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace("/v1", ""), b = body ? JSON.parse(body) : {};
            const checkBlocks = (list) => {
                for (const bl of list) for (const r of bl[bl.type]?.rich_text ?? []) if ((r.text?.content ?? "").length > 2000) { stats.tooLong++; return true; }
                return false;
            };
            const walk = (all) => {
                const size = Math.min(Number(b.page_size ?? url.searchParams.get("page_size") ?? 100), 100);
                const c = b.start_cursor ?? url.searchParams.get("start_cursor");
                if (c) stats.cursors++;
                const at = c ? Number(c) : 0;
                const more = at + size < all.length;
                return send(200, { object: "list", results: all.slice(at, at + size), next_cursor: more ? String(at + size) : null, has_more: more, type: "page_or_database" });
            };
            let m;
            if (req.method === "POST" && p === "/pages") {
                if (b.parent?.database_id !== DB) return fail(404, "object_not_found", `Could not find database with ID: ${b.parent?.database_id}.`);
                const props = {};
                for (const [k, v] of Object.entries(b.properties ?? {})) {
                    const t = SCHEMA[k];
                    if (!t) return fail(400, "validation_error", `${k} is not a property that exists.`);
                    if (!(t in v)) return fail(400, "validation_error", `${k} is expected to be ${t}.`);
                    props[k] = { type: t, [t]: t === "title" || t === "rich_text" ? plain(v[t]) : v[t] };
                }
                if ((b.children ?? []).length > 100) return fail(400, "validation_error", "body.children.length should be ≤ `100`.");
                if (checkBlocks(b.children ?? [])) return fail(400, "validation_error", "rich_text.text.content.length should be ≤ `2000`");
                const page = { object: "page", id: randomUUID(), url: "https://www.notion.so/x", created_time: "2026-11-01T10:00:00.000Z", last_edited_time: "2026-11-01T10:00:00.000Z", archived: false, properties: props };
                pages.set(page.id, page); blocks.set(page.id, [...(b.children ?? [])]); stats.created++;
                return send(200, page);
            }
            if (m = /^\/pages\/(.+)$/.exec(p)) {
                const page = pages.get(m[1]);
                if (!page) return fail(404, "object_not_found", `Could not find page with ID: ${m[1]}. Make sure the relevant pages and databases are shared with your integration.`);
                if (req.method === "PATCH") {
                    for (const [k, v] of Object.entries(b.properties ?? {})) page.properties[k] = { type: SCHEMA[k], ...v };
                    if ("archived" in b) page.archived = b.archived;
                }
                return send(200, page);
            }
            if (m = /^\/databases\/(.+)\/query$/.exec(p)) {
                if (m[1] !== DB) return fail(404, "object_not_found", "Could not find database.");
                if ((b.page_size ?? 100) > 100) return fail(400, "validation_error", "body.page_size should be ≤ `100`.");
                stats.queries++;
                if (b.filter?.title?.equals === "rate me" && !stats.limited++) return fail(429, "rate_limited", "You have been rate limited.", { "retry-after": "1" });
                let all = rows;
                if (b.filter?.select) all = all.filter((r) => r.properties[b.filter.property].select.name === b.filter.select.equals);
                if (b.sorts?.[0]?.direction === "descending") all = [...all].sort((x, y) => y.properties.Value.number - x.properties.Value.number);
                return walk(all);
            }
            if (m = /^\/blocks\/(.+)\/children$/.exec(p)) {
                const list = blocks.get(m[1]);
                if (!list) return fail(404, "object_not_found", "Could not find block.");
                if (req.method === "PATCH") {
                    if (b.children.length > 100) return fail(400, "validation_error", "body.children.length should be ≤ `100`.");
                    stats.appended++; stats.biggestAppend = Math.max(stats.biggestAppend, b.children.length);
                    list.push(...b.children);
                    return send(200, { object: "list", results: b.children, next_cursor: null, has_more: false });
                }
                return walk(list.map((x) => { const y = structuredClone(x); if (y[y.type]?.rich_text) y[y.type].rich_text = plain(y[y.type].rich_text); return y; }));
            }
            if (req.method === "POST" && p === "/search") return b.filter?.value === "page" ? walk(rows.slice(0, 3)) : fail(400, "validation_error", "filter.value is required");
            fail(400, "invalid_request_url", "Invalid request URL.");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { NOTION_API_URL: `http://127.0.0.1:${port}`, NOTION_TOKEN: TOKEN, NOTION_DATABASE_ID: DB },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.created || !stats.queries || !stats.cursors || !stats.appended) return `the Notion stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            if (stats.biggestAppend !== 100 || stats.appended < 3) return `appends were not in hundreds: ${JSON.stringify(stats)}`;
            if (stats.tooLong) return "a rich text over 2000 characters was sent";
            return null;
        },
    };
}
