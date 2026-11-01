// A Linear GraphQL API for the linear plugin's test, written from developers.linear.app/docs/graphql:
// Authorization holding the key bare (401 with AUTHENTICATION_ERROR otherwise; a Bearer in front of a
// personal key is refused), POST with { query, variables }, issues(first, after, filter) with
// pageInfo, issue(id) by id or identifier, issueCreate, issueUpdate and commentCreate answering
// { success, ... }, teams, team.states. A rate limit is an HTTP 400 with extensions.code RATELIMITED
// and X-RateLimit-Requests-Reset in ms. Queries are matched by what they name, not parsed.
//
//   start({ port }) -> { env: { LINEAR_API_URL, LINEAR_API_KEY, LINEAR_WEBHOOK_SECRET }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk_test_linear";
const TEAM = { id: "team-1", key: "ENG", name: "Engineering" };
const STATES = [{ id: "s3", name: "Done", type: "completed", position: 3 }, { id: "s1", name: "Todo", type: "unstarted", position: 1 }, { id: "s2", name: "In Progress", type: "started", position: 2 }];

export async function start({ port }) {
    const stats = { created: 0, comments: 0, pages: 0, limited: 0, moved: 0 };
    const issues = [];
    const add = (title, extra = {}) => { const n = issues.length + 1; const i = { id: `issue-${n}`, identifier: `ENG-${n}`, title, description: null, priority: 0, url: `https://linear.app/x/ENG-${n}`, state: { id: "s1", name: "Todo", type: "unstarted" }, assignee: null, team: TEAM, labels: { nodes: [{ name: "bug" }] }, ...extra }; issues.push(i); return i; };
    for (let i = 0; i < 230; i++) add(`Old ${i}`);
    const comments = new Map();
    const find = (id) => issues.find((i) => i.id === id || i.identifier === id);
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json", ...h }); res.end(JSON.stringify(v)); };
            const gqlError = (message, code, extra = {}, status = 200, h = {}) => send(status, { errors: [{ message, extensions: { code, ...extra } }], data: null }, h);
            if (req.headers.authorization !== KEY) return gqlError("Authentication required, not authenticated", "AUTHENTICATION_ERROR", { type: "authentication error", userPresentableMessage: "You need to authenticate to access this operation." }, 401);
            const { query: q, variables: v = {} } = JSON.parse(body);
            const ok = (data) => send(200, { data });
            if (q.includes("query Spent")) return gqlError("Rate limit exceeded", "RATELIMITED", {}, 400, { "x-ratelimit-requests-reset": String(Date.now() + 3600e3) });
            if (q.includes("issueCreate")) {
                if (v.input.teamId !== TEAM.id) return gqlError("Argument Validation Error", "INVALID_INPUT", { userPresentableMessage: "teamId must be a UUID." });
                stats.created++;
                return ok({ issueCreate: { success: true, issue: add(v.input.title, { priority: v.input.priority ?? 0, description: v.input.description ?? null }) } });
            }
            if (q.includes("issueUpdate")) {
                const i = find(v.id);
                if (!i) return gqlError("Entity not found: Issue", "INVALID_INPUT");
                if (v.input.stateId) { const s = STATES.find((x) => x.id === v.input.stateId); i.state = { id: s.id, name: s.name, type: s.type }; stats.moved++; }
                if ("priority" in v.input) i.priority = v.input.priority;
                return ok({ issueUpdate: { success: true, issue: i } });
            }
            if (q.includes("commentCreate")) {
                const i = find(v.input.issueId);
                if (!i) return gqlError("Entity not found: Issue", "INVALID_INPUT");
                const c = { id: "c1", body: v.input.body, url: "u", createdAt: "2026-11-01T10:00:00Z", user: { name: "Bot" } };
                comments.set(i.id, [...(comments.get(i.id) ?? []), c]); stats.comments++;
                return ok({ commentCreate: { success: true, comment: c } });
            }
            if (q.includes("comments(")) {
                if (v.id === "ENG-1" && !stats.limited++) return gqlError("Rate limit exceeded", "RATELIMITED", {}, 400, { "x-ratelimit-requests-reset": String(Date.now() + 800) });
                const i = find(v.id);
                return ok({ issue: { comments: { nodes: comments.get(i?.id) ?? [], pageInfo: { hasNextPage: false, endCursor: null } } } });
            }
            if (q.includes("issues(")) {
                const at = Number(v.after ?? 0);
                if (v.after) stats.pages++;
                const size = 100;
                return ok({ issues: { nodes: issues.slice(at, at + size), pageInfo: { hasNextPage: at + size < issues.length, endCursor: String(at + size) } } });
            }
            if (q.includes("issue(id")) { const i = find(v.id); return i ? ok({ issue: i }) : gqlError("Entity not found: Issue", "INVALID_INPUT", { userPresentableMessage: "Could not find referenced Issue." }); }
            if (q.includes("team(id")) return ok({ team: { states: { nodes: STATES } } });
            if (q.includes("teams(")) return ok({ teams: { nodes: [TEAM] } });
            gqlError("Cannot query that", "GRAPHQL_VALIDATION_FAILED", {}, 400);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { LINEAR_API_URL: `http://127.0.0.1:${port}/graphql`, LINEAR_API_KEY: KEY, LINEAR_WEBHOOK_SECRET: "lin-secret" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.created || !stats.comments || !stats.pages || !stats.moved) return `the Linear stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not wait out the rate limit";
            return null;
        },
    };
}
