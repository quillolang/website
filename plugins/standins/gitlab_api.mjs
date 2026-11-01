// A GitLab REST API for the gitlab_api plugin's test, written from docs.gitlab.com/api: PRIVATE-TOKEN,
// /api/v4/projects/:id with the path percent-encoded, offset paging (per_page, page, X-Next-Page,
// X-Total, X-Total-Pages) and keyset paging (a Link header), issues (iid, state_event), notes (with
// `system` notes in the list), merge_requests (409 on a moved sha, 405 when it cannot merge, a map
// of field errors), approve, pipeline create (variables as key and value), retry and cancel, jobs.
// Errors are { message } as a text or a map, or { error }. A 429 has Retry-After.
//
//   start({ port }) -> { env: { GITLAB_API_URL, GITLAB_TOKEN, GITLAB_PROJECT, GITLAB_WEBHOOK_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-gitlab", PROJECT = "group/sub/shop";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const stats = { issues: 0, pages: 0, keyset: 0, merged: 0, pipelines: 0, limited: 0, variables: null };
    const issues = Array.from({ length: 230 }, (_, i) => ({ id: 1000 + i, iid: i + 1, title: `Old ${i}`, state: "opened" }));
    const notes = new Map(), mrs = new Map(), pipelines = new Map();
    let pid = 10;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(v)); };
            const fail = (code, message, headers) => send(code, { message }, headers);
            if (req.headers["private-token"] !== TOKEN) return fail(401, "401 Unauthorized");
            const url = new URL(req.url, base);
            const m0 = /^\/api\/v4\/projects\/([^/]+)(\/.*)?$/.exec(url.pathname);
            if (!m0) return fail(404, "404 Not Found");
            if (m0[1].includes("/") || decodeURIComponent(m0[1]) !== PROJECT) return fail(404, "404 Project Not Found");
            const p = m0[2] ?? "", b = body ? JSON.parse(body) : {};
            const list = (all) => {
                if (url.searchParams.get("pagination") === "keyset") {
                    stats.keyset++;
                    const after = Number(url.searchParams.get("id_after") ?? 0), per = Number(url.searchParams.get("per_page") ?? 20);
                    const rest = all.filter((x) => x.id > after), page = rest.slice(0, per);
                    const h = {};
                    if (rest.length > per) { const u = new URL(url); u.searchParams.set("id_after", page.at(-1).id); h.link = `<${u.href}>; rel="next"`; }
                    return send(200, page, h);
                }
                const per = Number(url.searchParams.get("per_page") ?? 20), page = Number(url.searchParams.get("page") ?? 1);
                if (page > 1) stats.pages++;
                const pages = Math.ceil(all.length / per);
                send(200, all.slice((page - 1) * per, page * per), { "x-total": String(all.length), "x-total-pages": String(pages), "x-page": String(page), "x-per-page": String(per), "x-next-page": page < pages ? String(page + 1) : "" });
            };
            let m;
            if (p === "/issues" && req.method === "POST") {
                if (!b.title) return send(400, { error: "title is missing" });
                const i = { id: 2000 + issues.length, iid: issues.length + 1, title: b.title, state: "opened" };
                issues.push(i); stats.issues++;
                return send(201, i);
            }
            if (p === "/issues") return list(issues.filter((i) => !url.searchParams.get("state") || i.state === url.searchParams.get("state")));
            if (m = /^\/issues\/(\d+)$/.exec(p)) {
                const i = issues.find((x) => x.iid === Number(m[1]));
                if (!i) return fail(404, "404 Issue Not Found");
                if (req.method === "PUT") {
                    if (b.state_event === "close") { i.state = "closed"; notes.set(i.iid, [...(notes.get(i.iid) ?? []), { id: 1, body: "closed", system: true }]); }
                    else if (b.state_event === "reopen") i.state = "opened";
                }
                return send(200, i);
            }
            if (m = /^\/issues\/(\d+)\/notes$/.exec(p)) {
                const iid = Number(m[1]);
                if (req.method === "POST") {
                    if (b.body === "rate me" && !stats.limited++) return fail(429, "Retry later", { "retry-after": "1" });
                    const n = { id: 5, body: b.body, system: false };
                    notes.set(iid, [...(notes.get(iid) ?? []), n]);
                    return send(201, n);
                }
                return list(notes.get(iid) ?? []);
            }
            if (p === "/merge_requests" && req.method === "POST") {
                if (b.source_branch === b.target_branch) return send(400, { message: { base: ["You can't use same project/branch for source and target"], source_branch: ["is invalid"] } });
                const mr = { id: 700, iid: mrs.size + 1, title: b.title, state: "opened", sha: "abc1234", detailed_merge_status: "mergeable" };
                mrs.set(mr.iid, mr);
                return send(201, mr);
            }
            if (p === "/merge_requests") return list([...mrs.values()].filter((x) => x.state === (url.searchParams.get("state") ?? "opened")));
            if (m = /^\/merge_requests\/(\d+)(\/\w+)?$/.exec(p)) {
                const mr = mrs.get(Number(m[1]));
                if (!mr) return fail(404, "404 Merge Request Not Found");
                if (m[2] === "/notes") return send(201, { id: 9, body: b.body, system: false });
                if (m[2] === "/approve") return send(201, { id: mr.id, approved_by: [{ user: { username: "ada" } }] });
                if (m[2] === "/merge") {
                    if (mr.state === "merged") return fail(405, "405 Method Not Allowed");
                    if (b.sha && b.sha !== mr.sha) return fail(409, "SHA does not match HEAD of source branch");
                    mr.state = "merged"; stats.merged++;
                    return send(200, mr);
                }
                return send(200, mr);
            }
            if (p === "/pipeline" && req.method === "POST") {
                if (!b.ref) return send(400, { error: "ref is missing" });
                if (!(b.variables ?? []).every((v) => typeof v.key === "string" && typeof v.value === "string")) return send(400, { error: "variables is invalid" });
                stats.variables = b.variables;
                const pl = { id: ++pid, iid: pid, status: "created", ref: b.ref, sha: "abc1234", web_url: `${base}/p/${pid}` };
                pipelines.set(pl.id, pl); stats.pipelines++;
                return send(201, pl);
            }
            if (p === "/pipelines") return list([...pipelines.values()].filter((x) => !url.searchParams.get("ref") || x.ref === url.searchParams.get("ref")));
            if (m = /^\/pipelines\/(\d+)(\/\w+)?$/.exec(p)) {
                const pl = pipelines.get(Number(m[1]));
                if (!pl) return fail(404, "404 Not found");
                if (m[2] === "/jobs") return list([{ id: 1, name: "test", status: "failed" }, { id: 2, name: "deploy", status: "skipped" }]);
                if (m[2] === "/retry") { pl.status = "running"; return send(201, pl); }
                if (m[2] === "/cancel") { pl.status = "canceled"; return send(200, pl); }
                return send(200, pl);
            }
            fail(404, "404 Not Found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GITLAB_API_URL: base, GITLAB_TOKEN: TOKEN, GITLAB_PROJECT: PROJECT, GITLAB_WEBHOOK_TOKEN: "hook-token" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.issues || !stats.pages || !stats.keyset || !stats.merged || !stats.pipelines) return `the GitLab stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            if (JSON.stringify(stats.variables?.map((v) => v.value)) !== '["yes","3"]') return `pipeline variables came as ${JSON.stringify(stats.variables)}`;
            return null;
        },
    };
}
