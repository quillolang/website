// A GitHub REST API for the github_api plugin's test, written from docs.github.com/rest: Bearer auth
// and a required User-Agent, X-GitHub-Api-Version, Link headers built from per_page and page,
// x-ratelimit-* headers, /repos/{o}/{r}/issues (which also lists pull requests, as the real one
// does), comments, pulls (with files and merge: 405 not mergeable, 409 head moved), check-runs (a
// GitHub App installation token required; `conclusion` required when completed; at most 50
// annotations a request), /rate_limit, and POST /app/installations/{id}/access_tokens, which
// verifies the App's RS256 JWT against its public key: iss, iat in the past, exp at most 10 minutes
// on. Errors: { message, documentation_url, errors }, 422 with resource, field and code, a secondary
// limit as 403 with retry-after, a primary one as 403 with x-ratelimit-remaining 0.
//
//   start({ port }) -> { env: { GITHUB_API_URL, GITHUB_TOKEN, GITHUB_REPO, GITHUB_WEBHOOK_SECRET, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_INSTALLATION_ID }, close(), check() }
import { createServer } from "node:http";
import { generateKeyPairSync, verify } from "node:crypto";

const TOKEN = "qk-test-github", APP = "424242", INSTALL = "77", REPO = "octo/shop";
const SHA = "9fceb02d0ae598e95dc970b74767f19372d61af8";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const stats = { issues: 0, pages: 0, jwtOk: 0, tokens: 0, comments: 0, secondary: 0, merged: 0, checks: 0, patches: 0, bigPatch: 0 };
    // 7 open items, 2 of them pull requests, so a list goes over more than one page at per_page=3.
    const items = [];
    for (let i = 1; i <= 205; i++) items.push({ number: i, title: `Old ${i}`, state: "open", ...(i % 50 === 0 ? { pull_request: { url: "x" } } : {}) });
    const comments = new Map(), pulls = new Map(), runs = new Map();
    let n = 205, runId = 500;
    const installToken = "ghs_qktestinstallation";
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const rate = { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600), "x-ratelimit-resource": "core" };
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...rate, ...headers }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (code, message, extra = {}, headers = {}) => send(code, { message, documentation_url: "https://docs.github.com/rest", ...extra }, headers);
            const url = new URL(req.url, base);
            const path = url.pathname;
            if (!req.headers["user-agent"]) return fail(403, "Request forbidden by administrative rules. Please make sure your request has a User-Agent header");
            const auth = (req.headers.authorization ?? "").replace("Bearer ", "");
            const b = body ? JSON.parse(body) : null;
            // Lists are paged: per_page and page, with a Link to the next.
            const list = (all, wrap) => {
                const per = Math.min(Number(url.searchParams.get("per_page") ?? 30), 100), page = Number(url.searchParams.get("page") ?? 1);
                const slice = all.slice((page - 1) * per, page * per);
                const links = [];
                const at = (p) => { const u = new URL(url); u.searchParams.set("page", p); return u.href; };
                if (page * per < all.length) links.push(`<${at(page + 1)}>; rel="next"`, `<${at(Math.ceil(all.length / per))}>; rel="last"`);
                if (page > 1) { links.push(`<${at(page - 1)}>; rel="prev"`); stats.pages++; }
                send(200, wrap ? { total_count: all.length, [wrap]: slice } : slice, links.length ? { link: links.join(", ") } : {});
            };
            let m;
            if (m = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(path)) {
                const [h, c, s] = auth.split(".");
                const claims = c ? JSON.parse(Buffer.from(c, "base64url")) : {};
                const header = h ? JSON.parse(Buffer.from(h, "base64url")) : {};
                const now = Date.now() / 1000;
                if (header.alg !== "RS256" || !s || !verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, "base64url"))) return fail(401, "A JSON web token could not be decoded");
                if (claims.iss !== APP) return fail(401, "'Issuer' claim ('iss') must be the App's id");
                if (claims.iat > now || claims.exp <= now || claims.exp - now > 600) return fail(401, "'Expiration time' claim ('exp') is too far in the future");
                if (m[1] !== INSTALL) return fail(404, "Not Found");
                stats.jwtOk++; stats.tokens++;
                return send(201, { token: installToken, expires_at: new Date(Date.now() + 3600e3).toISOString().replace(/\.\d+Z/, "Z"), permissions: { checks: "write" } });
            }
            if (auth !== TOKEN && auth !== installToken) return fail(401, "Bad credentials");
            if (path === "/rate_limit") return send(200, { resources: { core: { limit: 5000, remaining: 4999, reset: 1790000000, used: 1 }, search: { limit: 30, remaining: 30, reset: 1790000000, used: 0 } }, rate: {} });
            if (path === `/repos/${REPO}`) return send(200, { full_name: REPO });
            const r = path.replace(`/repos/${REPO}`, "");
            if (r === path) return fail(404, "Not Found");
            if (r === "/issues" && req.method === "POST") {
                if (!b.title) return fail(422, "Validation Failed", { errors: [{ resource: "Issue", field: "title", code: "missing_field" }] });
                const issue = { number: ++n, title: b.title, body: b.body ?? null, state: "open", labels: (b.labels ?? []).map((name) => ({ name })) };
                items.push(issue);
                stats.issues++;
                return send(201, issue);
            }
            if (r === "/issues") return list(items.filter((i) => (url.searchParams.get("state") ?? "open") === "all" || i.state === (url.searchParams.get("state") ?? "open")));
            if (m = /^\/issues\/(\d+)$/.exec(r)) {
                const i = items.find((x) => x.number === Number(m[1]));
                if (!i) return fail(404, "Not Found");
                if (req.method === "PATCH") Object.assign(i, b);
                return send(200, i);
            }
            if (m = /^\/issues\/(\d+)\/comments$/.exec(r)) {
                const list0 = comments.get(m[1]) ?? [];
                if (req.method === "POST") {
                    if (b.body === "secondary limit" && !stats.secondary++) return fail(403, "You have exceeded a secondary rate limit.", {}, { "retry-after": "1" });
                    if (b.body === "spent") return fail(403, "API rate limit exceeded for user.", {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1800) });
                    const c = { id: list0.length + 1, body: b.body };
                    comments.set(m[1], [...list0, c]);
                    stats.comments++;
                    return send(201, c);
                }
                return list(list0);
            }
            if (r === "/pulls" && req.method === "POST") {
                const pr = { number: ++n, title: b.title, state: "open", merged: false, mergeable: true, head: { ref: b.head, sha: "abc123def" }, base: { ref: b.base } };
                pulls.set(pr.number, pr);
                return send(201, pr);
            }
            if (r === "/pulls") return list([...pulls.values()].filter((p) => p.state === (url.searchParams.get("state") ?? "open")));
            if (m = /^\/pulls\/(\d+)\/files$/.exec(r)) return list([{ filename: "checkout.qwe", status: "modified", additions: 3, deletions: 1 }, { filename: "cart.qwe", status: "added", additions: 9, deletions: 0 }]);
            if (m = /^\/pulls\/(\d+)\/merge$/.exec(r)) {
                const pr = pulls.get(Number(m[1]));
                if (!pr) return fail(404, "Not Found");
                if (b.sha && b.sha !== pr.head.sha) return fail(409, "Head branch was modified. Review and try the merge again.");
                if (pr.merged) return fail(405, "Pull Request is not mergeable");
                pr.merged = true; pr.state = "closed"; stats.merged++;
                return send(200, { sha: "merged000", merged: true, message: "Pull Request successfully merged" });
            }
            if (r.startsWith("/check-runs") || /^\/commits\/.+\/check-runs$/.test(r)) {
                if (auth !== installToken) return fail(403, "You must authenticate via a GitHub App.");
                if (r === "/check-runs") {
                    if (b.status === "completed" && !b.conclusion) return fail(422, "Validation Failed");
                    const run = { id: ++runId, name: b.name, head_sha: b.head_sha, status: b.status ?? "queued", conclusion: b.conclusion ?? null, output: { annotations_count: 0 } };
                    runs.set(run.id, run);
                    stats.checks++;
                    return send(201, run);
                }
                if (m = /^\/check-runs\/(\d+)$/.exec(r)) {
                    const run = runs.get(Number(m[1]));
                    if (!run) return fail(404, "Not Found");
                    const notes = b.output?.annotations ?? [];
                    if (notes.length > 50) { stats.bigPatch++; return fail(422, "Validation Failed", { errors: ["Only 50 annotations are allowed per request"] }); }
                    stats.patches++;
                    Object.assign(run, { status: b.status ?? run.status, conclusion: b.conclusion ?? run.conclusion });
                    run.output.annotations_count += notes.length;
                    return send(200, run);
                }
                return list([...runs.values()].filter((x) => x.head_sha === SHA), "check_runs");
            }
            fail(404, "Not Found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: {
            GITHUB_API_URL: base, GITHUB_TOKEN: TOKEN, GITHUB_REPO: REPO, GITHUB_WEBHOOK_SECRET: "hook-secret",
            GITHUB_APP_ID: APP, GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: "pkcs1", format: "pem" }), GITHUB_INSTALLATION_ID: INSTALL,
        },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.issues || !stats.pages || !stats.comments || !stats.merged || !stats.checks) return `the GitHub stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.tokens !== 1) return `installation tokens made: ${stats.tokens}, one should be kept`;
            if (stats.secondary < 2) return "the plugin did not wait out the secondary limit";
            if (stats.bigPatch || stats.patches !== 3) return `annotations were not sent in fifties: ${JSON.stringify(stats)}`;
            return null;
        },
    };
}
