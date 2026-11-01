// A Certificate Transparency log for the ct_logs plugin's test, written from RFC 6962: an RFC 6962
// Merkle tree over 13 real MerkleTreeLeaf entries (timestamped x509 and precert entries),
// computed here independently of the plugin, a P-256 log key and a second, RSA, log, a real SCT over
// the precertificate's TBS (with the extension absent) and a final certificate that carries both
// SCTs in the extension. GET /ct/v1/get-sth (signature over the TreeHeadSignature),
// get-entries (at most 4 a request, as real logs cap it), get-proof-by-hash (PATH of RFC 6962 2.1.1),
// get-sth-consistency (SUBPROOF of 2.1.2), errors as { success: false, error_message }. /_sample
// is the test's own: certificates, keys, and the root of the tree at each size.
//
//   start({ port }) -> { env: { CT_LOG_URL, CT_SAMPLES }, close(), check() }
import { createServer } from "node:http";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { der, extension, makeCert, name } from "./ocsp_der.mjs";

const sha = (...b) => { const h = createHash("sha256"); for (const x of b) h.update(x); return h.digest(); };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const u24 = (n) => Buffer.from([n >> 16, (n >> 8) & 255, n & 255]);
const u16 = (n) => Buffer.from([n >> 8, n & 255]);
const spkiOf = (k) => k.export({ type: "spki", format: "der" });
const tree = (d) => { if (d.length === 1) return leafHash(d[0]); const k = split(d.length); return sha(Buffer.from([1]), tree(d.slice(0, k)), tree(d.slice(k))); };
const split = (n) => { let k = 1; while (k * 2 < n) k *= 2; return k; };
const leafHash = (l) => sha(Buffer.from([0]), l);

function path(m, d) {
    if (d.length === 1) return [];
    const k = split(d.length);
    return m < k ? [...path(m, d.slice(0, k)), tree(d.slice(k))] : [...path(m - k, d.slice(k)), tree(d.slice(0, k))];
}
function subproof(m, d, whole) {
    const n = d.length;
    if (m === n) return whole ? [] : [tree(d)];
    const k = split(n);
    return m <= k ? [...subproof(m, d.slice(0, k), whole), tree(d.slice(k))] : [...subproof(m - k, d.slice(k), false), tree(d.slice(0, k))];
}
const signTls = (body, key, kind) => { const sig = createSign("sha256").update(body).sign(key); return Buffer.concat([Buffer.from([4, kind]), u16(sig.length), sig]); };

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const ca = generateKeyPairSync("rsa", { modulusLength: 2048 }), caName = name("CT Test CA");
    const caCert = makeCert({ subject: caName, spki: spkiOf(ca.publicKey), key: ca.privateKey, serial: 1 });
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const otherCert = makeCert({ subject: caName, spki: spkiOf(other.publicKey), key: other.privateKey, serial: 9 });
    const log = generateKeyPairSync("ec", { namedCurve: "P-256" }), rsaLog = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const leaf = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const from = new Date("2026-01-01T00:00:00Z"), to = new Date("2027-01-01T00:00:00Z");
    const extras = [extension("2.5.29.19", der.seq()), extension("2.5.29.37", der.seq(der.oid("1.3.6.1.5.5.7.3.1")))];
    const params = { subject: name("logged.example.com"), issuer: caName, serial: 4242, from, to, spki: spkiOf(leaf.publicKey), key: ca.privateKey };
    const pre = makeCert({ ...params, extensions: extras });
    const ts = Date.parse("2026-02-03T04:05:06Z");
    const issuerHash = sha(spkiOf(ca.publicKey));
    const sct = (key, kind) => {
        const id = sha(spkiOf(key.publicKey));
        const tbs = pre.tbs;
        const signed = Buffer.concat([Buffer.from([0, 0]), u64(ts), u16(1), issuerHash, u24(tbs.length), tbs, u16(0)]);
        return Buffer.concat([Buffer.from([0]), id, u64(ts), u16(0), signTls(signed, key.privateKey, kind)]);
    };
    const entry = (s) => Buffer.concat([u16(s.length), s]);
    const list = (ss) => { const b = Buffer.concat(ss.map(entry)); return Buffer.concat([u16(b.length), b]); };
    const scts = [sct(log, 3), sct(rsaLog, 1)];
    const finalCert = makeCert({ ...params, extensions: [extras[0], extension("1.3.6.1.4.1.11129.2.4.2", der.octet(list(scts))), extras[1]] });
    const tampered = makeCert({ ...params, serial: 4243, extensions: [extras[0], extension("1.3.6.1.4.1.11129.2.4.2", der.octet(list(scts))), extras[1]] });
    const leaves = [];
    for (let i = 0; i < 13; i++) {
        const when = u64(1700000000000 + i * 1000);
        if (i % 3 === 0 || i === 2) { const c = makeCert({ subject: name(`site-${i}.example.com`), issuer: caName, serial: 300 + i, spki: spkiOf(leaf.publicKey), key: ca.privateKey }); leaves.push(Buffer.concat([Buffer.from([0, 0]), when, u16(0), u24(c.der.length), c.der, u16(0)])); }
        else { const tbs = makeCert({ subject: name(`pre-${i}.example.com`), issuer: caName, serial: 300 + i, spki: spkiOf(leaf.publicKey), key: ca.privateKey }).tbs; leaves.push(Buffer.concat([Buffer.from([0, 0]), when, u16(1), issuerHash, u24(tbs.length), tbs, u16(0)])); }
    }
    const roots = leaves.map((_, i) => tree(leaves.slice(0, i + 1)));
    const root = roots[12], sthTime = 1730000000000;
    const stats = { sth: 0, entries: 0, proofs: 0, consistency: 0 };
    const fail = (res, s, m) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify({ success: false, error_message: m })); };
    const server = createServer((req, res) => {
        const url = new URL(req.url, base), q = url.searchParams;
        const ok = (v) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
        const b64 = (b) => b.toString("base64");
        if (url.pathname === "/_sample") return ok({ cert: finalCert.pem, tampered: tampered.pem, issuer: caCert.pem, other_issuer: otherCert.pem, log_key: b64(spkiOf(log.publicKey)), rsa_log_key: b64(spkiOf(rsaLog.publicKey)), size: 13, root: b64(root), old_root: b64(roots[3]), roots: roots.map(b64) });
        if (url.pathname === "/ct/v1/get-sth") {
            stats.sth++;
            const signed = Buffer.concat([Buffer.from([0, 1]), u64(sthTime), u64(13), root]);
            return ok({ tree_size: 13, timestamp: sthTime, sha256_root_hash: b64(root), tree_head_signature: b64(signTls(signed, log.privateKey, 3)) });
        }
        if (url.pathname === "/ct/v1/get-entries") {
            stats.entries++;
            const s = Number(q.get("start")), e = Math.min(Number(q.get("end")), s + 3);
            if (s >= 13) return fail(res, 400, "Start index out of range");
            return ok({ entries: leaves.slice(s, Math.min(e + 1, 13)).map((l) => ({ leaf_input: b64(l), extra_data: b64(Buffer.alloc(30)) })) });
        }
        if (url.pathname === "/ct/v1/get-proof-by-hash") {
            stats.proofs++;
            const h = q.get("hash"), n = Number(q.get("tree_size"));
            const i = leaves.findIndex((l, k) => k < n && b64(leafHash(l)) === h);
            if (i < 0) return fail(res, 404, "No proof found: the leaf hash is not in the log");
            return ok({ leaf_index: i, audit_path: path(i, leaves.slice(0, n)).map(b64) });
        }
        if (url.pathname === "/ct/v1/get-sth-consistency") {
            stats.consistency++;
            const f = Number(q.get("first")), s = Number(q.get("second"));
            if (f > s || f < 1 || s > 13) return fail(res, 400, "Bad tree sizes");
            return ok({ consistency: f === s ? [] : subproof(f, leaves.slice(0, s), true).map(b64) });
        }
        res.writeHead(404); res.end();
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { CT_LOG_URL: base, CT_SAMPLES: base },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.sth ? "no tree head was asked for" : stats.entries < 3 ? "get-entries was not repeated past its cap" : !stats.proofs ? "no audit proof was asked for" : !stats.consistency ? "no consistency proof was asked for" : null),
    };
}
