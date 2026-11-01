// An ACME server for the acme plugin's test, in Pebble's spirit, written from RFC 8555 (and RFC 7638,
// 8037-free ES256 from RFC 7518, RFC 7807 problems). Every POST is checked as Pebble checks it:
// application/jose+json, flattened JWS, ES256 signature by the account key (ieee-p1363 r||s), a
// single-use Replay-Nonce (one in seven good nonces is refused with badNonce, as Pebble refuses 5% by
// default), `url` equal to the address posted to, `jwk` only on newAccount and `kid` elsewhere, and
// POST-as-GET's empty payload. GET on a resource is 405. Orders go pending, ready, processing,
// valid; validation runs a moment after the challenge is posted, against what the test server
// (pebble-challtestsrv's /add-http01 and /set-txt) holds, with the right key authorization for the
// account's RFC 7638 thumbprint. A CSR's signature, subject and subjectAltNames are read from its
// DER and matched to the order. Certificates are X.509 built here, signed by a test CA.
//
//   start({ port, ports }) -> { env: { ACME_DIRECTORY, ACME_CHALLTEST_URL }, close(), check() }
import { createServer } from "node:http";
import { createHash, createPublicKey, createVerify, generateKeyPairSync, randomBytes, sign, verify as verifySig, X509Certificate } from "node:crypto";

const P = "urn:ietf:params:acme:error:";
const b64 = (x) => Buffer.from(x).toString("base64url");

function der(tag, ...parts) {
    const body = Buffer.concat(parts), n = body.length;
    const len = n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
    return Buffer.concat([Buffer.from([tag]), len, body]);
}
const oid = (hex) => der(6, Buffer.from(hex, "hex"));
function read(buf, p = 0) {
    const tag = buf[p]; let n = buf[p + 1], at = p + 2;
    if (n & 0x80) { const c = n & 0x7f; n = 0; for (let i = 0; i < c; i++) n = n * 256 + buf[at + i]; at += c; }
    return { tag, body: buf.subarray(at, at + n), raw: buf.subarray(p, at + n), next: at + n };
}
function kids(buf) { const out = []; for (let p = 0; p < buf.length;) { const e = read(buf, p); out.push(e); p = e.next; } return out; }

// PKCS#10: the names asked for, once its signature holds.
function readCsr(bytes) {
    const [info, alg, sig] = kids(read(bytes).body);
    if (alg.body.toString("hex") !== oid("2a8648ce3d040302").toString("hex")) throw new Error("the CSR is not signed with ecdsa-with-SHA256");
    const [version, subject, spki, attrs] = kids(info.body);
    if (version.body[0] !== 0) throw new Error("CSR version must be 0");
    if (attrs.tag !== 0xa0) throw new Error("the CSR has no attributes");
    const key = createPublicKey({ key: Buffer.from(spki.raw), format: "der", type: "spki" });
    if (!verifySig("sha256", info.raw, key, sig.body.subarray(1))) throw new Error("the CSR's signature is wrong");
    let cn = null;
    for (const set of kids(subject.body)) for (const seq of kids(set.body)) { const [o, v] = kids(seq.body); if (o.body.toString("hex") === "550403") cn = v.body.toString(); }
    const names = [];
    for (const attr of kids(attrs.body)) {
        const [o, set] = kids(attr.body);
        if (o.body.toString("hex") !== "2a864886f70d01090e") continue;
        for (const ext of kids(kids(set.body)[0].body)) {
            const [eo, val] = kids(ext.body);
            if (eo.body.toString("hex") !== "551d11") continue;
            for (const n of kids(read(val.body).body)) if (n.tag === 0x82) names.push(n.body.toString());
        }
    }
    return { cn, names, key };
}

const ca = generateKeyPairSync("ec", { namedCurve: "P-256" });
const ECDSA_SHA256 = der(0x30, oid("2a8648ce3d040302"));
const name = (t) => der(0x30, der(0x31, der(0x30, oid("550403"), der(0x0c, Buffer.from(t)))));
function utc(d) { return der(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z")); }
function certificate(subject, issuer, spki, names, signer, days) {
    const now = new Date(Date.now() - 3600e3), end = new Date(Date.now() + days * 864e5);
    const ext = names.length ? [der(0xa3, der(0x30, der(0x30, oid("551d11"), der(4, der(0x30, ...names.map((n) => der(0x82, Buffer.from(n))))))))] : [];
    const tbs = der(0x30, der(0xa0, der(2, Buffer.from([2]))), der(2, Buffer.concat([Buffer.from([0x11]), randomBytes(9)])), ECDSA_SHA256, name(issuer), der(0x30, utc(now), utc(end)), name(subject), spki, ...ext);
    return der(0x30, tbs, ECDSA_SHA256, der(3, Buffer.from([0]), sign("sha256", tbs, signer)));
}
const pem = (d) => `-----BEGIN CERTIFICATE-----\n${d.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
const caCert = certificate("Standin CA", "Standin CA", ca.publicKey.export({ type: "spki", format: "der" }), [], ca.privateKey, 3650);

export async function start({ port, ports }) {
    const base = `http://127.0.0.1:${port}`, test = ports[1];
    const stats = { verified: 0, badNonce: 0, accounts: 0, issued: 0, http01: 0, dns01: 0, revoked: 0, refused: [] };
    const nonces = new Set(), accounts = new Map(), byThumb = new Map(), orders = new Map(), authzs = new Map(), chals = new Map(), certs = new Map();
    const web = new Map(), dns = new Map();
    let count = 0;
    const id = () => randomBytes(9).toString("base64url");
    const newNonce = () => { const n = id(); nonces.add(n); return n; };
    const problem = (status, kind, detail) => ({ status, problem: { type: P + kind, detail, status } });
    const orderView = (o) => ({ status: o.status, expires: new Date(Date.now() + 864e5).toISOString(), identifiers: o.identifiers, authorizations: o.authzs.map((a) => `${base}/authz/${a}`), finalize: `${base}/finalize/${o.id}`, ...(o.cert ? { certificate: `${base}/cert/${o.cert}` } : {}), ...(o.error ? { error: o.error } : {}) });
    const authzView = (a) => ({ status: a.status, identifier: a.identifier, expires: new Date(Date.now() + 864e5).toISOString(), ...(a.wildcard ? { wildcard: true } : {}), challenges: a.chals.map((c) => chalView(chals.get(c))) });
    const chalView = (c) => ({ type: c.type, url: `${base}/chal/${c.id}`, token: c.token, status: c.status, ...(c.error ? { error: c.error } : {}) });
    const thumbprint = (j) => b64(createHash("sha256").update(JSON.stringify({ crv: j.crv, kty: j.kty, x: j.x, y: j.y })).digest());

    function verifyJws(req, raw, url) {
        if ((req.headers["content-type"] ?? "") !== "application/jose+json") return { ...problem(415, "malformed", "Expected Content-Type application/jose+json") };
        let j; try { j = JSON.parse(raw); } catch { return problem(400, "malformed", "Parse error reading JWS"); }
        if (typeof j.protected !== "string" || typeof j.payload !== "string" || typeof j.signature !== "string") return problem(400, "malformed", "JWS must be flattened JSON");
        const h = JSON.parse(Buffer.from(j.protected, "base64url"));
        if (h.alg !== "ES256") return problem(400, "badSignatureAlgorithm", `JWS signature uses unsupported algorithm ${h.alg}`);
        if (!nonces.has(h.nonce)) return problem(400, "badNonce", `JWS has an invalid anti-replay nonce: ${h.nonce}`);
        nonces.delete(h.nonce);
        if (++count % 7 === 0) { stats.badNonce++; return problem(400, "badNonce", "JWS has an invalid anti-replay nonce (the test's random refusal)"); }
        if (h.url !== url) return problem(400, "unauthorized", `JWS header parameter 'url' incorrect. Expected "${url}" got "${h.url}"`);
        if (!!h.jwk === !!h.kid) return problem(400, "malformed", "JWS must have exactly one of jwk and kid");
        const wantsJwk = url === `${base}/new-acct`;
        if (wantsJwk !== !!h.jwk) return problem(400, "malformed", wantsJwk ? "newAccount needs a jwk" : "this needs a kid");
        let jwk = h.jwk, account = null;
        if (h.kid) {
            account = accounts.get(h.kid);
            if (!account) return problem(400, "accountDoesNotExist", `Account ${h.kid} not found.`);
            jwk = account.jwk;
        }
        if (jwk.kty !== "EC" || jwk.crv !== "P-256") return problem(400, "badPublicKey", "only P-256 here");
        const ok = createVerify("sha256").update(`${j.protected}.${j.payload}`).verify({ key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(j.signature, "base64url"));
        if (!ok) return problem(403, "unauthorized", "JWS verification error");
        stats.verified++;
        return { account, jwk, payload: j.payload === "" ? null : JSON.parse(Buffer.from(j.payload, "base64url")), empty: j.payload === "" };
    }
    function validate(c, a, account) {
        const auth = `${c.token}.${thumbprint(account.jwk)}`;
        const domain = a.identifier.value;
        let ok = false, detail = "";
        if (c.type === "http-01") {
            const got = web.get(c.token);
            ok = got === auth;
            detail = got == null ? `The key authorization file from the server did not exist: 404 at http://${domain}/.well-known/acme-challenge/${c.token}` : `The key authorization file from the server did not match this challenge. Expected "${auth}" (got "${got}")`;
            if (ok) stats.http01++;
        } else {
            const want = b64(createHash("sha256").update(auth).digest());
            const got = dns.get(`_acme-challenge.${domain}.`) ?? [];
            ok = got.includes(want);
            detail = `Correct value not found for DNS challenge: _acme-challenge.${domain}`;
            if (ok) stats.dns01++;
        }
        c.status = ok ? "valid" : "invalid";
        a.status = ok ? "valid" : "invalid";
        if (!ok) c.error = { type: P + "unauthorized", detail, status: 403 };
        for (const o of orders.values()) if (o.authzs.includes(a.id)) {
            if (!ok) { o.status = "invalid"; o.error = c.error; }
            else if (o.status === "pending" && o.authzs.every((x) => authzs.get(x).status === "valid")) o.status = "ready";
        }
    }

    function route(path, s) {
        let m;
        if (path === "/new-acct") {
            const t = thumbprint(s.jwk), existing = byThumb.get(t), p = s.payload ?? {};
            if (existing) return { status: 200, location: existing, body: accounts.get(existing).view };
            if (p.onlyReturnExisting) return problem(400, "accountDoesNotExist", "unable to find existing account for only-return-existing request");
            if (!p.termsOfServiceAgreed) return problem(403, "userActionRequired", "must agree to terms of service");
            for (const c of p.contact ?? []) if (!c.startsWith("mailto:")) return problem(400, "unsupportedContact", `contact method "${c}" is not supported`);
            const url = `${base}/acct/${id()}`, view = { status: "valid", contact: p.contact ?? [], orders: `${url}/orders` };
            accounts.set(url, { jwk: s.jwk, view }); byThumb.set(t, url); stats.accounts++;
            return { status: 201, location: url, body: view };
        }
        if (path === "/new-order") {
            const ids = s.payload?.identifiers;
            if (!Array.isArray(ids) || !ids.length) return problem(400, "malformed", "NewOrder payload has no identifiers");
            const o = { id: id(), status: "pending", identifiers: ids, authzs: [], account: s.account };
            for (const i of ids) {
                if (i.type !== "dns") return problem(400, "unsupportedIdentifier", `Order included unsupported type identifier: type "${i.type}"`);
                const wildcard = i.value.startsWith("*.");
                const a = { id: id(), status: "pending", identifier: { type: "dns", value: i.value.replace(/^\*\./, "") }, wildcard, chals: [] };
                for (const type of wildcard ? ["dns-01"] : ["http-01", "dns-01"]) { const c = { id: id(), type, token: randomBytes(32).toString("base64url"), status: "pending", authz: a.id }; chals.set(c.id, c); a.chals.push(c.id); }
                authzs.set(a.id, a); o.authzs.push(a.id);
            }
            orders.set(o.id, o);
            return { status: 201, location: `${base}/order/${o.id}`, body: orderView(o) };
        }
        if ((m = /^\/order\/(.+)$/.exec(path))) {
            const o = orders.get(m[1]);
            if (!o) return problem(404, "malformed", "order not found");
            if (o.account !== s.account) return problem(403, "unauthorized", "not your order");
            return { status: 200, retry: o.status === "processing" ? 1 : undefined, body: orderView(o) };
        }
        if ((m = /^\/authz\/(.+)$/.exec(path))) {
            const a = authzs.get(m[1]);
            return a ? { status: 200, body: authzView(a) } : problem(404, "malformed", "authz not found");
        }
        if ((m = /^\/chal\/(.+)$/.exec(path))) {
            const c = chals.get(m[1]);
            if (!c) return problem(404, "malformed", "challenge not found");
            if (s.empty) return { status: 200, body: chalView(c) };
            const a = authzs.get(c.authz);
            if (c.status === "pending") { c.status = "processing"; setTimeout(() => validate(c, a, s.account), 40); }
            return { status: 200, link: `<${base}/authz/${a.id}>;rel="up"`, body: chalView(c) };
        }
        if ((m = /^\/finalize\/(.+)$/.exec(path))) {
            const o = orders.get(m[1]);
            if (!o) return problem(404, "malformed", "order not found");
            if (o.status !== "ready") return problem(403, "orderNotReady", `Order's status ("${o.status}") is not acceptable for finalization`);
            if (typeof s.payload?.csr !== "string" || /[+/=]/.test(s.payload.csr)) return problem(400, "badCSR", "csr must be base64url with no padding");
            let csr; try { csr = readCsr(Buffer.from(s.payload.csr, "base64url")); } catch (e) { return problem(400, "badCSR", `Error parsing certificate request: ${e.message}`); }
            const want = o.identifiers.map((i) => i.value).sort().join(), got = [...csr.names].sort().join();
            if (want !== got) return problem(403, "badCSR", `Order includes different number of DNSnames identifiers than CSR specifies: order ${want}, CSR ${got}`);
            if (csr.cn && !csr.names.includes(csr.cn)) return problem(403, "badCSR", "CN was not among the SANs");
            o.status = "processing";
            setTimeout(() => {
                const spki = csr.key.export({ type: "spki", format: "der" });
                const leaf = certificate(csr.cn ?? "", "Standin CA", spki, csr.names, ca.privateKey, 90);
                new X509Certificate(leaf).verify(ca.publicKey); // node reads what was built, or this throws
                const c = id();
                certs.set(c, leaf); o.cert = c; o.status = "valid"; stats.issued++;
            }, 40);
            return { status: 200, location: `${base}/order/${o.id}`, body: orderView(o) };
        }
        if ((m = /^\/cert\/(.+)$/.exec(path))) {
            const c = certs.get(m[1]);
            if (!c) return problem(404, "malformed", "certificate not found");
            return { status: 200, type: "application/pem-certificate-chain", link: `<${base}/alt/${m[1]}/1>;rel="alternate"`, text: pem(c) + pem(caCert) };
        }
        if (path === "/revoke-cert") {
            const b = Buffer.from(s.payload?.certificate ?? "", "base64url");
            const found = [...certs.entries()].find(([, c]) => c.equals(b));
            if (!found) return problem(404, "malformed", "Unable to find specified certificate.");
            certs.delete(found[0]); stats.revoked++;
            return { status: 200, text: "" };
        }
        return problem(404, "malformed", `Not found: ${path}`);
    }

    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const path = new URL(req.url, base).pathname;
            const send = (r) => {
                const headers = { "replay-nonce": newNonce(), link: r.link ? [`<${base}/dir>;rel="index"`, r.link] : `<${base}/dir>;rel="index"` };
                if (r.location) headers.location = r.location;
                if (r.retry) headers["retry-after"] = String(r.retry);
                if (r.problem) { stats.refused.push(r.problem.type.replace(P, "")); res.writeHead(r.status, { ...headers, "content-type": "application/problem+json" }); return res.end(JSON.stringify(r.problem)); }
                res.writeHead(r.status, { ...headers, "content-type": r.type ?? "application/json" });
                res.end(r.text ?? JSON.stringify(r.body));
            };
            if (path === "/dir" && req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ newNonce: `${base}/nonce`, newAccount: `${base}/new-acct`, newOrder: `${base}/new-order`, revokeCert: `${base}/revoke-cert`, keyChange: `${base}/key-change`, meta: { termsOfService: `${base}/terms.pdf`, externalAccountRequired: false } })); }
            if (path === "/nonce") { res.writeHead(req.method === "HEAD" ? 200 : 204, { "replay-nonce": newNonce(), "cache-control": "no-store" }); return res.end(); }
            if (req.method !== "POST") return send(problem(405, "malformed", "Method not allowed: use POST-as-GET"));
            const s = verifyJws(req, raw, base + path);
            if (s.problem) return send(s);
            send(route(path, s));
        });
    });
    // Pebble's challenge test server: what the web and the DNS would answer.
    const manager = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const q = JSON.parse(raw || "{}");
            if (req.url === "/add-http01") web.set(q.token, q.content);
            else if (req.url === "/set-txt") dns.set(q.host, [...(dns.get(q.host) ?? []), q.value]);
            res.writeHead(200); res.end();
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    await new Promise((ok) => manager.listen(test, "127.0.0.1", ok));
    return {
        env: { ACME_DIRECTORY: `${base}/dir`, ACME_CHALLTEST_URL: `http://127.0.0.1:${test}` },
        stats,
        close() { server.close(); manager.close(); server.closeAllConnections?.(); manager.closeAllConnections?.(); },
        check() {
            if (!stats.issued) return "the ACME stand-in issued nothing";
            if (!stats.http01 || !stats.dns01) return "the ACME stand-in validated no HTTP-01 or no DNS-01 challenge";
            if (!stats.badNonce) return "no badNonce came up, so its retry went untested";
            if (!stats.revoked) return "the ACME stand-in revoked nothing";
            return null;
        },
    };
}
