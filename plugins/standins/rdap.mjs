// RDAP servers and IANA's bootstrap files for rdap.qwe, on node:http. Written from RFC 9082 and
// 9083 (the paths, objectClassName, events, entities with vcardArray, errorCode, title and
// description) and RFC 9224 (the bootstrap files' `services`).
//
// One port serves everything: /dns.json and friends, /registry/ (the TLD's server), /registrar/
// (the registrar's), and /rir/ for addresses and AS numbers. Requests must ask for RDAP JSON.
import { createServer } from "node:http";

const vcard = (fn, extra = []) => ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", fn], ...extra]];
function domain(name, base) {
    const n = name.toUpperCase();
    return {
        objectClassName: "domain", handle: "2336799_DOMAIN_COM-VRSN", ldhName: n, rdapConformance: ["rdap_level_0"],
        status: ["client delete prohibited", "client transfer prohibited"],
        links: [{ value: `${base}/registry/domain/${name}`, rel: "self", href: `${base}/registry/domain/${name}`, type: "application/rdap+json" },
                { value: `${base}/registrar/domain/${name}`, rel: "related", href: `${base}/registrar/domain/${name}`, type: "application/rdap+json" }],
        events: [{ eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" }, { eventAction: "expiration", eventDate: "2026-08-13T04:00:00Z" }, { eventAction: "last changed", eventDate: "2025-08-14T07:01:31Z" }],
        secureDNS: { delegationSigned: true },
        nameservers: [{ objectClassName: "nameserver", ldhName: "A.IANA-SERVERS.NET" }, { objectClassName: "nameserver", ldhName: "B.IANA-SERVERS.NET" }],
        entities: [{
            objectClassName: "entity", handle: "376", roles: ["registrar"], publicIds: [{ type: "IANA Registrar ID", identifier: "376" }],
            vcardArray: vcard("RESERVED-Internet Assigned Numbers Authority"),
            entities: [{ objectClassName: "entity", roles: ["abuse"], vcardArray: vcard("Abuse", [["email", {}, "text", "abuse@iana.org"], ["tel", { type: "voice" }, "uri", "tel:+1.3108239358"]]) }],
        }],
        notices: [{ title: "Terms of Use", description: ["Service subject to Terms of Use."] }],
    };
}

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const seen = { paths: [], busy: 0, problems: [] };
    const send = (res, status, body, type = "application/rdap+json", headers = {}) => { res.writeHead(status, { "content-type": type, ...headers }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    const server = createServer((req, res) => {
        const u = req.url; seen.paths.push(u);
        if (u.endsWith(".json")) {
            const bootstrap = {
                "/dns.json": [[["com", "net"], [`${base}/registry/`]], [["uk"], [`${base}/uk/`]], [["co.uk"], [`${base}/couk`]]],
                "/ipv4.json": [[["8.0.0.0/8", "41.0.0.0/8"], [`${base}/rir/`]], [["41.1.0.0/16"], [`${base}/afrinic/`]]],
                "/ipv6.json": [[["2001:4800::/23", "2001:4860::/32"], [`${base}/rir/`]]],
                "/asn.json": [[["1-1876", "15000-16000"], [`${base}/rir/`]], [["3333"], [`${base}/ripe/`]]],
            }[u];
            if (!bootstrap) return send(res, 404, "not here", "text/plain");
            return send(res, 200, { version: "1.0", publication: "2026-10-01T00:00:00Z", services: bootstrap }, "application/json");
        }
        if (!(req.headers.accept ?? "").includes("application/rdap+json")) { seen.problems.push(`${u} without the RDAP Accept header`); return send(res, 406, { errorCode: 406, title: "Not Acceptable" }); }
        const fail = (code, title, description) => send(res, code, { errorCode: code, title, description });
        let m;
        if ((m = u.match(/^\/registry\/domain\/(.+)$/))) {
            const name = m[1];
            if (name === "nobody-has-this.com") return fail(404, "Not Found", ["The domain you requested is not registered."]);
            if (name === "refused.com") return fail(403, "Forbidden", ["Queries from your address are not allowed.", "Contact the registry."]);
            if (name === "broken.com") return send(res, 500, "<html>Internal Server Error</html>", "text/html");
            if (name === "limited.com") return send(res, 429, "", "text/plain", { "retry-after": "30" });
            if (name === "busy.com" && seen.busy++ === 0) return send(res, 429, "", "text/plain", { "retry-after": "1" });
            const d = domain(name, base);
            if (name === "busy.com") d.links.pop();
            return send(res, 200, d);
        }
        if ((m = u.match(/^\/registrar\/domain\/(.+)$/))) {
            if (m[1] === "half.com") return send(res, 503, { errorCode: 503, title: "Service Unavailable" });
            return send(res, 200, { objectClassName: "domain", ldhName: m[1], entities: [{ objectClassName: "entity", roles: ["registrant"], vcardArray: vcard("REDACTED", [["org", {}, "text", "Internet Corporation for Assigned Names and Numbers"]]) }] });
        }
        if ((m = u.match(/^\/rir\/ip\/(.+)$/))) {
            return send(res, 200, {
                objectClassName: "ip network", handle: "NET-8-8-8-0-2", name: "GOGL", ipVersion: "v4", startAddress: "8.8.8.0", endAddress: "8.8.8.255", type: "DIRECT ALLOCATION", country: "US", parentHandle: "NET-8-0-0-0-0",
                cidr0_cidrs: [{ v4prefix: "8.8.8.0", length: 24 }],
                events: [{ eventAction: "registration", eventDate: "2023-12-28T17:24:33-05:00" }],
                entities: [{ objectClassName: "entity", handle: "GOGL", roles: ["registrant"], vcardArray: vcard("Google LLC", [["adr", { label: "1600 Amphitheatre Parkway\nMountain View\nCA\n94043" }, "text", ["", "", "", "", "", "", ""]]]),
                    entities: [{ objectClassName: "entity", handle: "ABUSE5250-ARIN", roles: ["abuse"], vcardArray: vcard("Abuse", [["email", {}, "text", "network-abuse@google.com"]]) }] }],
            });
        }
        if ((m = u.match(/^\/rir\/autnum\/(\d+)$/))) {
            return send(res, 200, { objectClassName: "autnum", handle: `AS${m[1]}`, startAutnum: Number(m[1]), endAutnum: Number(m[1]), name: "GOOGLE", type: "DIRECT ALLOCATION", country: "US", entities: [{ objectClassName: "entity", roles: ["registrant"], vcardArray: vcard("Google LLC", [["org", {}, "text", "Google LLC"]]) }] });
        }
        fail(404, "Not Found", [u]);
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { RDAP_BOOTSTRAP_URL: base, RDAP_DIRECT: `${base}/registry` },
        close() { server.closeAllConnections?.(); server.close(); },
        check() {
            if (seen.problems.length) return seen.problems[0];
            if (!seen.paths.includes("/dns.json")) return "the bootstrap file was never read";
            if (seen.paths.filter((p) => p === "/dns.json").length > 1) return "the bootstrap file was read again and not kept";
            return null;
        },
    };
}
