// DER by hand and X.509 certificates made with Node's own keys, for the stand-ins of ocsp, ct_logs,
// saml, aws_sns and pkcs12: nothing here is a stored key, each test makes its own.
//
//   der.seq(...), der.set(...), der.int(n), der.oid("1.2.3"), der.utf8(s), der.bit(buf), der.octet(buf),
//   der.ctx(n, ...), der.ctxp(n, buf), der.time(date), der.gen(date), der.nul, der.bool(b)
//   makeCert({ subject, issuer, serial, from, to, spki, key, alg, extensions }) -> { der, tbs, pem }
//   pem(label, der), extension(oid, value, critical)
import { createSign } from "node:crypto";

const len = (n) => {
    if (n < 0x80) return Buffer.from([n]);
    const out = [];
    for (let x = n; x > 0; x = Math.floor(x / 256)) out.unshift(x % 256);
    return Buffer.from([0x80 | out.length, ...out]);
};
export const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const cat = (a) => Buffer.concat(a);
function intBytes(n) {
    if (Buffer.isBuffer(n)) return n[0] & 0x80 ? Buffer.concat([Buffer.from([0]), n]) : n;
    let x = BigInt(n);
    const out = [];
    do { out.unshift(Number(x & 255n)); x >>= 8n; } while (x > 0n);
    if (out[0] & 0x80) out.unshift(0);
    return Buffer.from(out);
}
function oidBytes(s) {
    const p = s.split(".").map(Number), out = [p[0] * 40 + p[1]];
    for (const x of p.slice(2)) {
        const b = [x & 127];
        for (let v = Math.floor(x / 128); v > 0; v = Math.floor(v / 128)) b.unshift((v & 127) | 128);
        out.push(...b);
    }
    return Buffer.from(out);
}
const stamp = (d, long) => { const t = d.toISOString().replace(/[-:T]|\.\d+/g, ""); return long ? t : t.slice(2); };
export const der = {
    seq: (...x) => tlv(0x30, cat(x)),
    set: (...x) => tlv(0x31, cat(x)),
    int: (n) => tlv(0x02, intBytes(n)),
    enum: (n) => tlv(0x0a, intBytes(n)),
    oid: (s) => tlv(0x06, oidBytes(s)),
    utf8: (s) => tlv(0x0c, Buffer.from(s)),
    ia5: (s) => tlv(0x16, Buffer.from(s)),
    bit: (b) => tlv(0x03, cat([Buffer.from([0]), b])),
    octet: (b) => tlv(0x04, b),
    ctx: (n, ...x) => tlv(0xa0 | n, cat(x)),
    ctxp: (n, b) => tlv(0x80 | n, b),
    time: (d) => tlv(0x17, Buffer.from(stamp(d) + "")),
    gen: (d) => tlv(0x18, Buffer.from(stamp(d, true) + "")),
    nul: Buffer.from([5, 0]),
    bool: (b) => tlv(1, Buffer.from([b ? 255 : 0])),
};
export const name = (cn, org) => der.seq(...(org ? [der.set(der.seq(der.oid("2.5.4.10"), der.utf8(org)))] : []), der.set(der.seq(der.oid("2.5.4.3"), der.utf8(cn))));
export const pem = (label, d) => `-----BEGIN ${label}-----\n${d.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;
export const extension = (oid, value, critical) => der.seq(der.oid(oid), ...(critical ? [der.bool(true)] : []), der.octet(value));
export const ALG = { "rsa-sha256": der.seq(der.oid("1.2.840.113549.1.1.11"), der.nul), "ecdsa-sha256": der.seq(der.oid("1.2.840.10045.4.3.2")) };

/// `spki` is the subject's public key as DER; `key` the issuer's private KeyObject; `alg` the signature.
export function makeCert({ subject, issuer, serial = 1, from = new Date(Date.now() - 86400000), to = new Date(Date.now() + 86400000 * 365), spki, key, alg = "rsa-sha256", extensions = [] }) {
    const tbs = der.seq(
        der.ctx(0, der.int(2)), der.int(serial), ALG[alg], issuer ?? subject,
        der.seq(der.time(from), der.time(to)), subject, spki,
        ...(extensions.length ? [der.ctx(3, der.seq(...extensions))] : []),
    );
    const s = createSign("sha256").update(tbs).sign(key);
    const d = der.seq(tbs, ALG[alg], der.bit(s));
    return { der: d, tbs, pem: pem("CERTIFICATE", d) };
}
