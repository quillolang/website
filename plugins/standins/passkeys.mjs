// A browser and a software authenticator together, for the passkeys plugin's test, written from
// W3C WebAuthn Level 2 (the registering and sign-in ceremonies, section 6 on authenticator data,
// 8.2 packed attestation) and RFC 8949 and RFC 9053 for CBOR and COSE. As a browser it refuses
// options it would refuse (an RP id that is not a suffix of the origin, excluded credentials, no
// supported algorithm). As an authenticator it makes real ES256, Ed25519 and RS256 keys with
// node:crypto and real signatures, none of it from the plugin's code.
//
//   POST /create { options, origin, kind, attest, uv, up, break } -> a credential's toJSON()
//   POST /get { options, origin, break } -> the same for a sign-in
//
// `attest` is "self" or "cert" for packed, "tpm" for a format the plugin must refuse; `break` spoils
// one thing after signing. The certificate is a small hand-built X.509 v3 signed by itself.
//
//   start({ port }) -> { env: { PASSKEY_AUTHENTICATOR_URL }, close(), check() }
import { createServer } from "node:http";
import { generateKeyPairSync, sign, createHash, randomBytes, X509Certificate } from "node:crypto";

const b64 = (b) => Buffer.from(b).toString("base64url");
const sha = (b) => createHash("sha256").update(b).digest();

function head(major, n) {
    if (n < 24) return Buffer.from([major << 5 | n]);
    if (n < 256) return Buffer.from([major << 5 | 24, n]);
    if (n < 65536) return Buffer.from([major << 5 | 25, n >> 8, n & 255]);
    throw new Error("too long");
}
function cbor(v) {
    if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
    if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
    if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
    if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
    if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
    throw new Error("cbor: " + typeof v);
}

// DER, enough for one certificate.
function der(tag, ...parts) {
    const body = Buffer.concat(parts), n = body.length;
    const len = n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
    return Buffer.concat([Buffer.from([tag]), len, body]);
}
const oid = (hex) => der(6, Buffer.from(hex, "hex"));
const ECDSA_SHA256 = der(0x30, oid("2a8648ce3d040302"));
function attestationCertificate() {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const spki = publicKey.export({ type: "spki", format: "der" });
    const name = der(0x30, der(0x31, der(0x30, oid("550403"), der(0x0c, Buffer.from("Standin Attestation")))));
    const time = (s) => der(0x17, Buffer.from(s));
    const tbs = der(0x30, der(0xa0, der(2, Buffer.from([2]))), der(2, randomBytes(8).fill(1, 0, 1)), ECDSA_SHA256, name, der(0x30, time("260101000000Z"), time("360101000000Z")), name, spki);
    const sig = sign("sha256", tbs, privateKey);
    const cert = der(0x30, tbs, ECDSA_SHA256, der(3, Buffer.from([0]), sig));
    new X509Certificate(cert); // node reads it, or this throws
    return { cert, privateKey };
}

function makeKey(kind) {
    if (kind === "es256") {
        const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
        const j = publicKey.export({ format: "jwk" });
        return { alg: -7, privateKey, cose: new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(j.x, "base64url")], [-3, Buffer.from(j.y, "base64url")]]), sign: (m) => sign("sha256", m, privateKey) };
    }
    if (kind === "ed25519") {
        const { publicKey, privateKey } = generateKeyPairSync("ed25519");
        const j = publicKey.export({ format: "jwk" });
        return { alg: -8, privateKey, cose: new Map([[1, 1], [3, -8], [-1, 6], [-2, Buffer.from(j.x, "base64url")]]), sign: (m) => sign(null, m, privateKey) };
    }
    if (kind === "rs256") {
        const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const j = publicKey.export({ format: "jwk" });
        return { alg: -257, privateKey, cose: new Map([[1, 3], [3, -257], [-1, Buffer.from(j.n, "base64url")], [-2, Buffer.from(j.e, "base64url")]]), sign: (m) => sign("sha256", m, privateKey) };
    }
    throw new Error("no such kind: " + kind);
}

export async function start({ port }) {
    const stats = { created: 0, signed: 0, attested: 0, kinds: new Set() };
    const credentials = new Map();
    const fail = (name, message) => { throw Object.assign(new Error(`${name}: ${message}`), { browser: true }); };

    function origin(rpId, o) {
        const host = new URL(o).hostname;
        if (host !== rpId && !host.endsWith("." + rpId)) fail("SecurityError", `the RP ID ${rpId} is not a suffix of ${host}`);
    }
    function authData(rpId, flags, counter, attested) {
        const c = Buffer.alloc(4); c.writeUInt32BE(counter);
        return Buffer.concat([sha(rpId), Buffer.from([flags]), c, attested ?? Buffer.alloc(0)]);
    }
    function clientData(type, challenge, o) {
        return Buffer.from(JSON.stringify({ type, challenge, origin: o, crossOrigin: false }));
    }

    function create(q) {
        const o = q.options;
        if (!/^[A-Za-z0-9_-]{22,}$/.test(o?.challenge ?? "")) fail("TypeError", "the challenge must be 16 bytes or more of base64url");
        origin(o.rp.id, q.origin);
        if (Buffer.from(o.user.id, "base64url").length > 64 || !o.user.id) fail("TypeError", "user.id must be 1 to 64 bytes");
        const key = makeKey(q.kind);
        if (!o.pubKeyCredParams?.some((p) => p.alg === key.alg)) fail("NotSupportedError", "no algorithm in common");
        for (const c of o.excludeCredentials ?? []) if (credentials.has(c.id)) fail("InvalidStateError", "the authenticator already holds an excluded credential");
        const id = randomBytes(32);
        const aaguid = Buffer.from("0a1b2c3d4e5f60718293a4b5c6d7e8f9", "hex");
        const len = Buffer.from([0, id.length]);
        const attested = Buffer.concat([aaguid, len, id, cbor(key.cose)]);
        const flags = (q.up === false ? 0 : 0x01) | (q.uv === false ? 0 : 0x04) | 0x08 | 0x40;
        const data = authData(o.rp.id, flags, 0, attested);
        const client = clientData("webauthn.create", o.challenge, q.origin);
        const signed = Buffer.concat([data, sha(client)]);
        let fmt = "none", stmt = new Map();
        if (q.attest === "self") {
            fmt = "packed";
            let s = key.sign(signed);
            if (q.break === "attestation") s = key.sign(Buffer.concat([signed, Buffer.from([1])]));
            stmt = new Map([["alg", key.alg], ["sig", s]]);
            stats.attested++;
        } else if (q.attest === "cert") {
            fmt = "packed";
            const { cert, privateKey } = attestationCertificate();
            let s = sign("sha256", signed, privateKey);
            if (q.break === "attestation") s = sign("sha256", client, privateKey);
            stmt = new Map([["alg", -7], ["sig", s], ["x5c", [cert]]]);
            stats.attested++;
        } else if (q.attest === "tpm") {
            fmt = "tpm";
            stmt = new Map([["ver", "2.0"]]);
        }
        const object = cbor(new Map([["fmt", fmt], ["attStmt", stmt], ["authData", data]]));
        credentials.set(b64(id), { key, rpId: o.rp.id, counter: 0, user: o.user.id });
        stats.created++;
        stats.kinds.add(q.kind);
        return {
            id: b64(id), rawId: b64(id), type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
            response: { clientDataJSON: b64(client), attestationObject: b64(object), authenticatorData: b64(data), transports: ["internal", "hybrid"], publicKeyAlgorithm: key.alg },
        };
    }
    function get(q) {
        const o = q.options;
        origin(o.rpId, q.origin);
        const found = (o.allowCredentials ?? []).map((c) => [c.id, credentials.get(c.id)]).find(([, c]) => c && c.rpId === o.rpId);
        if (!found) fail("NotAllowedError", "no credential here for this site");
        const [id, c] = found;
        c.counter += 1 + Math.floor(Math.random() * 3);
        const data = authData(o.rpId, 0x01 | 0x04 | 0x08, c.counter);
        const client = clientData("webauthn.get", o.challenge, q.origin);
        let signature = c.key.sign(Buffer.concat([data, sha(client)]));
        if (q.break === "signature") signature = c.key.sign(Buffer.concat([data, sha(Buffer.from("something else"))]));
        const sent = q.break === "client_data" ? Buffer.from(client.toString().replace('"crossOrigin":false', '"crossOrigin":false,"x":1')) : client;
        stats.signed++;
        return {
            id, rawId: id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
            response: { clientDataJSON: b64(sent), authenticatorData: b64(data), signature: b64(signature), userHandle: c.user },
        };
    }

    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            try {
                const q = JSON.parse(raw);
                const out = req.url === "/create" ? create(q) : req.url === "/get" ? get(q) : null;
                if (!out) { res.writeHead(404); return res.end("no"); }
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify(out));
            } catch (e) {
                res.writeHead(e.browser ? 400 : 500, { "content-type": "text/plain" });
                res.end(e.message);
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { PASSKEY_AUTHENTICATOR_URL: `http://127.0.0.1:${port}` },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            for (const k of ["es256", "ed25519", "rs256"]) if (!stats.kinds.has(k)) return `the authenticator never made an ${k} key`;
            if (!stats.signed) return "the authenticator signed nothing";
            if (!stats.attested) return "the authenticator gave no packed attestation";
            return null;
        },
    };
}
