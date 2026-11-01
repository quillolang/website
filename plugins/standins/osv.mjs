// OSV.dev's API for the osv plugin's test, written from google.github.io/osv.dev/api: POST /v1/query
// ({ package: { name, ecosystem } or { purl }, version, commit, page_token }; version in both the
// purl and the body is a 400, as is a package with no ecosystem; results paged with next_page_token),
// POST /v1/querybatch (at most 1000; each result holds only { id, modified }, with its own
// next_page_token), GET /v1/vulns/:id (404 { code: 5, message: "Bug not found." }). Its records keep
// the OSV schema: affected[].package, ranges with events, versions, severity, database_specific. A
// query matches by the record's listed version strings or the stand-in's small `hits` table, since
// the real server's own version evaluation is not what the test is about.
//
//   start({ port }) -> { env: { OSV_API_URL }, close(), check() }
import { createServer } from "node:http";

const vulns = {
    "GHSA-35jh-r3h4-6jhm": {
        id: "GHSA-35jh-r3h4-6jhm", summary: "Command Injection in lodash", modified: "2024-02-01T00:00:00Z", published: "2021-05-06T16:05:51Z", aliases: ["CVE-2021-23337"],
        severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H" }],
        affected: [{ package: { ecosystem: "npm", name: "lodash", purl: "pkg:npm/lodash" }, versions: ["2.4.2"], ranges: [{ type: "SEMVER", events: [{ introduced: "3.0.0" }, { fixed: "3.10.2" }, { introduced: "4.0.0" }, { fixed: "4.17.21" }] }, { type: "GIT", repo: "https://github.com/lodash/lodash", events: [{ introduced: "0" }, { fixed: "c4847ebe7d14540bb28a8b932a9ce1b9ecbfee1a" }] }] }],
        database_specific: { severity: "HIGH" },
    },
    "GHSA-p6mc-m468-83gw": {
        id: "GHSA-p6mc-m468-83gw", summary: "Prototype Pollution in lodash", modified: "2024-02-01T00:00:00Z", published: "2020-07-15T19:15:48Z", aliases: ["CVE-2020-8203"],
        severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:H" }],
        affected: [{ package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "3.7.0" }, { fixed: "4.17.19" }] }] }],
    },
    "PYSEC-2021-98": {
        id: "PYSEC-2021-98", summary: "Directory traversal in Django", modified: "2024-02-01T00:00:00Z", published: "2021-06-08T18:15:00Z", aliases: ["CVE-2021-33203"],
        severity: [{ type: "CVSS_V4", score: "CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N" }],
        affected: [{ package: { ecosystem: "PyPI", name: "django" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "3.2a1" }, { last_affected: "3.2.0" }] }] }],
        database_specific: { severity: "MODERATE" },
    },
};
for (let i = 0; i < 5; i++) vulns[`PYSEC-2099-${i}`] = { id: `PYSEC-2099-${i}`, summary: `Flaw ${i}`, modified: "2024-02-01T00:00:00Z", affected: [{ package: { ecosystem: "PyPI", name: "bigpkg" } }] };

const purlOf = (p) => { const m = p.match(/^pkg:(\w+)\/(.+?)(?:@(.+))?$/); return m && { ecosystem: { npm: "npm", pypi: "PyPI" }[m[1]], name: m[2], version: m[3] }; };

function answer(q) {
    if (q.commit && (q.package || q.version)) throw [400, "Cannot specify commit together with a package or version"];
    const p = q.package ?? {};
    let { name, ecosystem } = p, version = q.version;
    if (p.purl) {
        const u = purlOf(p.purl);
        if (!u) throw [400, "Invalid Package URL."];
        if (u.version && q.version) throw [400, "version specified in params and PURL query params."];
        ({ name, ecosystem } = u); version = u.version ?? q.version;
    }
    if (name && !ecosystem) throw [400, "Ecosystem not specified"];
    if (name === "lodash") return version === "4.17.21" ? [] : ["GHSA-35jh-r3h4-6jhm", "GHSA-p6mc-m468-83gw"];
    if (name === "django") return ["PYSEC-2021-98"];
    if (name === "bigpkg") return Object.keys(vulns).filter((k) => k.startsWith("PYSEC-2099"));
    return [];
}

export async function start({ port }) {
    const stats = { queries: 0, batches: 0, pages: 0, gets: 0 };
    const page = (ids, token, size = 2) => {
        const from = Number(token ?? 0);
        const next = from + size < ids.length ? String(from + size) : undefined;
        if (from) stats.pages++;
        return [ids.slice(from, from + size), next];
    };
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const send = (s, v) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const m = req.url.match(/^\/v1\/vulns\/(.+)$/);
            if (m && req.method === "GET") { stats.gets++; const v = vulns[decodeURIComponent(m[1])]; return v ? send(200, v) : send(404, { code: 5, message: "Bug not found." }); }
            try {
                const b = JSON.parse(raw || "{}");
                if (req.url === "/v1/query" && req.method === "POST") {
                    stats.queries++;
                    const [ids, next] = page(answer(b), b.page_token);
                    return send(200, ids.length ? { vulns: ids.map((i) => vulns[i]), ...(next ? { next_page_token: next } : {}) } : {});
                }
                if (req.url === "/v1/querybatch" && req.method === "POST") {
                    stats.batches++;
                    if (b.queries.length > 1000) throw [400, "Too many queries."];
                    return send(200, { results: b.queries.map((q) => { const [ids, next] = page(answer(q), q.page_token); return ids.length ? { vulns: ids.map((i) => ({ id: i, modified: vulns[i].modified })), ...(next ? { next_page_token: next } : {}) } : {}; }) });
                }
                send(404, { code: 5, message: "Not found" });
            } catch (e) {
                if (Array.isArray(e)) send(e[0], { code: 3, message: e[1] }); else send(500, { code: 13, message: String(e) });
            }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { OSV_API_URL: `http://127.0.0.1:${port}` },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.queries ? "no query came" : stats.batches < 2 ? "the batch's pages were not followed" : stats.pages < 2 ? "too few later pages were asked for" : null),
    };
}
