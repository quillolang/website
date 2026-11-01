// A test CA and its OCSP responder for the ocsp plugin's test, written from RFC 6960: certificates and
// keys made at start with Node's crypto (ocsp_der.mjs). POST /ocsp takes a real OCSPRequest, whose
// CertID hashes are checked against the issuer, and answers a real BasicOCSPResponse, signed with
// RSA-SHA256 (ECDSA-SHA256 for the second CA), nonce echoed. /certs gives the PEMs. The certificate's
// serial decides how the responder behaves: good, revoked (keyCompromise), unknown, signed by a
// delegated responder, or by one with no OCSP-signing EKU, or by a stranger, a tampered tbs, an
// answer past nextUpdate or from the future, another nonce, another serial, tryLater.
//
//   start({ port }) -> { env: { OCSP_SAMPLES }, close(), check() }
import { createServer } from "node:http";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { der, extension, makeCert, name, ALG } from "./ocsp_der.mjs";

const spkiOf = (k) => k.export({ type: "spki", format: "der" });
const rsa = () => generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = () => generateKeyPairSync("ec", { namedCurve: "P-256" });
const sha1 = (b) => createHash("sha1").update(b).digest();

function reader(b) {
    const out = [];
    let i = 0;
    while (i < b.length) {
        const tag = b[i];
        let n = b[i + 1], h = 2;
        if (n & 0x80) { const c = n & 127; n = 0; for (let k = 0; k < c; k++) n = n * 256 + b[i + 2 + k]; h = 2 + c; }
        out.push({ tag, body: b.subarray(i + h, i + h + n), raw: b.subarray(i, i + h + n) });
        i += h + n;
    }
    return out;
}
const keyBits = (spki) => reader(reader(spki)[0].body)[1].body.subarray(1);

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const ca = rsa(), caName = name("Quillo Test CA", "Quillo"), caCert = makeCert({ subject: caName, spki: spkiOf(ca.publicKey), key: ca.privateKey, serial: 1 });
    const ecCa = ec(), ecName = name("Quillo EC CA", "Quillo"), ecCert = makeCert({ subject: ecName, spki: spkiOf(ecCa.publicKey), key: ecCa.privateKey, alg: "ecdsa-sha256", serial: 2 });
    const aia = extension("1.3.6.1.5.5.7.1.1", der.seq(der.seq(der.oid("1.3.6.1.5.5.7.48.1"), der.ctxp(6, Buffer.from(`${base}/ocsp`))), der.seq(der.oid("1.3.6.1.5.5.7.48.2"), der.ctxp(6, Buffer.from(`${base}/ca.cer`)))));
    const crl = extension("2.5.29.31", der.seq(der.seq(der.ctx(0, der.ctx(0, der.ctxp(6, Buffer.from(`${base}/ca.crl`)))))));
    const leafKey = rsa();
    const serials = { good: 100, revoked: 101, unknown: 102, delegated: 103, no_eku: 104, other_signed: 105, forged: 106, stranger: 107, stale: 108, future: 109, replay: 110, mismatch: 111, busy: 112 };
    const certs = {};
    for (const [k, serial] of Object.entries(serials)) certs[k] = makeCert({ subject: name(`${k}.example.com`), issuer: caName, serial, spki: spkiOf(leafKey.publicKey), key: ca.privateKey, extensions: [aia, crl] }).pem;
    certs.bare = makeCert({ subject: name("bare.example.com"), issuer: caName, serial: 113, spki: spkiOf(leafKey.publicKey), key: ca.privateKey }).pem;
    certs.ec = makeCert({ subject: name("ec.example.com"), issuer: ecName, serial: 114, spki: spkiOf(leafKey.publicKey), key: ecCa.privateKey, alg: "ecdsa-sha256", extensions: [aia] }).pem;
    certs.issuer = caCert.pem; certs.ec_issuer = ecCert.pem;
    const eku = extension("2.5.29.37", der.seq(der.oid("1.3.6.1.5.5.7.3.9")));
    const resp = rsa(), respName = name("Quillo OCSP Responder"), respCert = makeCert({ subject: respName, issuer: caName, serial: 200, spki: spkiOf(resp.publicKey), key: ca.privateKey, extensions: [eku] });
    const noEku = rsa(), noEkuName = name("No Right To Sign"), noEkuCert = makeCert({ subject: noEkuName, issuer: caName, serial: 201, spki: spkiOf(noEku.publicKey), key: ca.privateKey });
    const stray = rsa(), strayCa = rsa(), strayName = name("Not The CA"), strayCert = makeCert({ subject: strayName, issuer: name("Stray CA"), serial: 202, spki: spkiOf(stray.publicKey), key: strayCa.privateKey, extensions: [eku] });
    const stats = { asked: 0, nonces: 0, byKind: {} };

    function answer(certId, serial, nonce, isEc) {
        const kind = Object.entries(serials).find(([, s]) => s === serial)?.[0] ?? (serial === 114 ? "good" : "good");
        stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
        if (kind === "busy") return der.seq(der.enum(3));
        const now = Date.now();
        let thisU = new Date(now - 3600000), nextU = new Date(now + 3600000);
        if (kind === "stale") { thisU = new Date(now - 90000000); nextU = new Date(now - 86400000); }
        if (kind === "future") { thisU = new Date(now + 7200000); nextU = new Date(now + 9000000); }
        const status = kind === "revoked" ? der.ctx(1, der.gen(new Date("2026-06-01T00:00:00Z")), der.ctx(0, der.enum(1))) : kind === "unknown" ? der.ctxp(2, Buffer.alloc(0)) : der.ctxp(0, Buffer.alloc(0));
        let id = certId;
        if (kind === "mismatch") { const p = reader(reader(certId)[0].body); id = der.seq(p[0].raw, p[1].raw, p[2].raw, der.int(999)); }
        const single = der.seq(id, status, der.gen(thisU), der.ctx(0, der.gen(nextU)));
        const useNonce = kind === "replay" ? Buffer.alloc(16, 7) : nonce;
        const exts = useNonce ? [der.ctx(1, der.seq(der.seq(der.oid("1.3.6.1.5.5.7.48.1.2"), der.octet(der.octet(useNonce)))))] : [];
        const by = (n) => der.ctx(1, n);
        const [rid, key, chain, algName] = isEc ? [by(ecName), ecCa.privateKey, [], "ecdsa-sha256"]
            : kind === "delegated" ? [der.ctx(2, der.octet(sha1(keyBits(spkiOf(resp.publicKey))))), resp.privateKey, [respCert.der], "rsa-sha256"]
            : kind === "no_eku" ? [by(noEkuName), noEku.privateKey, [noEkuCert.der], "rsa-sha256"]
            : kind === "other_signed" ? [by(strayName), stray.privateKey, [strayCert.der], "rsa-sha256"]
            : kind === "stranger" ? [by(name("Quillo Test CA", "Quillo")), stray.privateKey, [], "rsa-sha256"]
            : [by(caName), ca.privateKey, [], "rsa-sha256"];
        const tbs = der.seq(rid, der.gen(new Date(now - 60000)), der.seq(single), ...exts);
        const sig = createSign("sha256").update(tbs).sign(key);
        const sent = Buffer.from(tbs);
        if (kind === "forged") sent[sent.length - 40] ^= 1;
        const basic = der.seq(sent, ALG[algName], der.bit(sig), ...(chain.length ? [der.ctx(0, der.seq(...chain))] : []));
        return der.seq(der.enum(0), der.ctx(0, der.seq(der.oid("1.3.6.1.5.5.7.48.1.1"), der.octet(basic))));
    }
    function handle(body) {
        const tbs = reader(reader(reader(body)[0].body)[0].body);
        const list = reader(tbs.find((x) => x.tag === 0x30).body);
        const certId = reader(reader(list[0].body)[0].raw)[0];
        const p = reader(certId.body);
        const algOid = reader(p[0].body)[0].body.toString("hex");
        const hash = algOid === "2b0e03021a" ? "sha1" : "sha256";
        const nameHash = createHash(hash).update(caName).digest(), keyHash = createHash(hash).update(keyBits(spkiOf(ca.publicKey))).digest();
        const ecN = createHash(hash).update(ecName).digest(), ecK = createHash(hash).update(keyBits(spkiOf(ecCa.publicKey))).digest();
        const isEc = p[1].body.equals(ecN) && p[2].body.equals(ecK);
        if (!isEc && (!p[1].body.equals(nameHash) || !p[2].body.equals(keyHash))) return der.seq(der.enum(6));
        const serial = p[3].body.reduce((a, b) => a * 256 + b, 0);
        let nonce = null;
        const ext = tbs.find((x) => x.tag === 0xa2);
        if (ext) { const e = reader(reader(reader(ext.body)[0].body)[0].body); nonce = reader(e[1].body)[0].body; stats.nonces++; }
        stats.asked++;
        return answer(certId.raw, serial, nonce, isEc);
    }
    const goodRequest = () => { const nh = sha1(caName), kh = sha1(keyBits(spkiOf(ca.publicKey))); const id = der.seq(der.seq(der.oid("1.3.14.3.2.26"), der.nul), der.octet(nh), der.octet(kh), der.int(100)); return der.seq(der.seq(der.seq(der.seq(id)))); };
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const send = (s, type, v) => { res.writeHead(s, { "content-type": type }); res.end(v); };
            if (req.url === "/certs") return send(200, "application/json", JSON.stringify(certs));
            if (req.url.startsWith("/raw")) return send(200, "text/plain", handle(goodRequest()).toString("base64"));
            if (req.url === "/ocsp" && req.method === "POST") {
                if (req.headers["content-type"] !== "application/ocsp-request") return send(415, "text/plain", "wrong type");
                let out;
                try { out = handle(Buffer.concat(chunks)); } catch { out = der.seq(der.enum(1)); }
                return send(200, "application/ocsp-response", out);
            }
            send(404, "text/plain", "no");
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { OCSP_SAMPLES: base },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.asked ? "the responder was never asked" : !stats.nonces ? "no nonce came" : null),
    };
}
