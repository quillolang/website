// A Jira Cloud REST API v3 for the jira plugin's test, written from developer.atlassian.com/cloud/jira/
// platform/rest/v3: Basic auth with email and API token, POST /issue (a description must be a valid ADF
// document: version 1, type doc, no empty text node, no text outside a paragraph), GET and PUT
// /issue/{key}, /assignee (accountId), POST /search/jql (nextPageToken; no total), /search/approximate-
// count, /issue/{key}/comment (startAt, maxResults, total; body must be ADF), /issue/{key}/transitions
// (the moves depend on the status), /user/search. Errors are { errorMessages, errors }, and a 429 has
// Retry-After.
//
//   start({ port }) -> { env: { JIRA_API_URL, JIRA_EMAIL, JIRA_API_TOKEN }, close(), check() }
import { createServer } from "node:http";

const EMAIL = "bot@acme.test", TOKEN = "qktestjira";
const FLOW = { "To Do": [["11", "Start work", "In Progress"]], "In Progress": [["21", "Done", "Done"], ["31", "Back", "To Do"]], Done: [["41", "Reopen", "To Do"]] };

export async function start({ port }) {
    const stats = { created: 0, pages: 0, comments: 0, moved: 0, limited: 0 };
    const issues = new Map(), comments = new Map();
    const make = (key, fields) => { const i = { id: String(10000 + issues.size), key, self: "x", fields: { status: { name: "To Do", statusCategory: { key: "new" } }, labels: [], created: "2026-11-01", ...fields } }; issues.set(key, i); return i; };
    for (let i = 1; i <= 230; i++) make(`OPS-${i}`, { summary: `Old ${i}` });
    const badNode = (n, top = false) => {
        if (top) { if (n.version !== 1 || n.type !== "doc" || !Array.isArray(n.content)) return "ADF: a document needs version 1, type doc and content"; }
        for (const c of n.content ?? []) {
            if (c.type === "text") { if (!c.text) return "ADF: a text node must not be empty"; if (["doc", "listItem", "bulletList", "orderedList"].includes(n.type)) return `ADF: text cannot sit in ${n.type}`; }
            const r = badNode(c);
            if (r) return r;
        }
        return null;
    };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (code, errorMessages, errors = {}, h = {}) => send(code, { errorMessages, errors }, h);
            const auth = Buffer.from((req.headers.authorization ?? "").replace("Basic ", ""), "base64").toString();
            if (auth !== `${EMAIL}:${TOKEN}`) { res.writeHead(401, { "content-type": "text/plain" }); return res.end("Client must be authenticated to access this resource."); }
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace("/rest/api/3", ""), b = body ? JSON.parse(body) : {};
            let m;
            if (req.method === "POST" && p === "/issue") {
                const f = b.fields ?? {}, errors = {};
                if (!f.issuetype?.name) errors.issuetype = "Specify an issue type";
                if (f.project?.key !== "OPS") errors.project = "Specify a valid project ID or key";
                if (f.priority && typeof f.priority !== "object") errors.priority = "Operation value must be an object";
                if (Object.keys(errors).length) return fail(400, [], errors);
                if (f.description) { const bad = typeof f.description === "string" ? "Operation value must be an Atlassian Document (see the Atlassian Document Format)" : badNode(f.description, true); if (bad) return fail(400, [], { description: bad }); }
                const key = `OPS-${issues.size + 1}`;
                make(key, { summary: f.summary, description: f.description ?? null, labels: f.labels ?? [] });
                stats.created++;
                return send(201, { id: "1", key, self: `http://x/issue/${key}` });
            }
            if (req.method === "POST" && p === "/search/jql") {
                if (/=\s*$/.test(b.jql ?? "")) return fail(400, ["Error in the JQL Query: Expecting either 'IN', or a value."]);
                const m2 = /reporter = "(.*)"$/.exec(b.jql);
                if (m2) return send(200, { issues: [...issues.values()].slice(0, m2[1] === 'O\\"Brien' ? 1 : 0), isLast: true });
                const all = [...issues.values()], at = Number(b.nextPageToken ?? 0), size = Math.min(b.maxResults ?? 50, 50);
                if (b.nextPageToken) stats.pages++;
                return send(200, { issues: all.slice(at, at + size), ...(at + size < all.length ? { nextPageToken: String(at + size) } : {}), isLast: at + size >= all.length });
            }
            if (p === "/search/approximate-count") return send(200, { count: issues.size });
            if (p === "/user/search") return send(200, [{ accountId: "5b10a2844c20165700ede21g", displayName: "Ada Lovelace", active: true }]);
            if (m = /^\/issue\/([^/]+)(?:\/(\w+))?$/.exec(p)) {
                const i = issues.get(m[1]);
                if (!i) return fail(404, ["Issue does not exist or you do not have permission to see it."]);
                const sub = m[2];
                if (!sub && req.method === "GET") {
                    if (url.searchParams.get("fields") === "summary" && !stats.limited++) return fail(429, ["Rate limit exceeded."], {}, { "retry-after": "1" });
                    return send(200, i);
                }
                if (!sub && req.method === "PUT") { Object.assign(i.fields, b.fields); return send(204); }
                if (sub === "assignee") { i.fields.assignee = { accountId: b.accountId, displayName: "Ada Lovelace" }; return send(204); }
                if (sub === "comment") {
                    const list = comments.get(i.key) ?? [];
                    if (req.method === "POST") {
                        const bad = typeof b.body === "object" ? badNode(b.body, true) : "Comment body is not valid!";
                        if (bad) return fail(400, [bad]);
                        const c = { id: String(list.length + 1), author: { displayName: "Bot" }, created: "2026-11-01", body: b.body };
                        comments.set(i.key, [...list, c]); stats.comments++;
                        return send(201, c);
                    }
                    const at = Number(url.searchParams.get("startAt") ?? 0), max = Number(url.searchParams.get("maxResults") ?? 50);
                    return send(200, { startAt: at, maxResults: max, total: list.length, comments: list.slice(at, at + max) });
                }
                if (sub === "transitions") {
                    const moves = FLOW[i.fields.status.name];
                    if (req.method === "GET") return send(200, { transitions: moves.map(([id, name, to]) => ({ id, name, to: { name: to, statusCategory: { key: to === "Done" ? "done" : "indeterminate" } } })) });
                    const mv = moves.find(([id]) => id === b.transition?.id);
                    if (!mv) return fail(400, ["Transition id is not valid for this issue."]);
                    if (mv[2] === "Done" && !b.fields?.resolution) return fail(400, [], { resolution: "Resolution is required." });
                    i.fields.status = { name: mv[2], statusCategory: { key: mv[2] === "Done" ? "done" : "indeterminate" } };
                    const add = b.update?.comment?.[0]?.add?.body;
                    if (add) comments.set(i.key, [...(comments.get(i.key) ?? []), { id: "9", author: { displayName: "Bot" }, created: "2026-11-01", body: add }]);
                    stats.moved++;
                    return send(204);
                }
            }
            fail(404, ["Not found"]);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { JIRA_API_URL: `http://127.0.0.1:${port}`, JIRA_EMAIL: EMAIL, JIRA_API_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.created || !stats.pages || !stats.comments || !stats.moved) return `the Jira stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
