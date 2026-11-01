// Signature Version 4 checked as AWS checks it, for the stand-ins of the aws_* plugins, written
// from "Create a signed AWS API request" in the IAM guide and checked at load on the get-vanilla
// case of AWS's signature test suite: the Credential's key and scope, X-Amz-Date within 15
// minutes, the canonical request built again from what arrived, the signature compared, and the
// body's SHA-256 inside it.
//
//   sigv4Check(req, body, { access, secret, region, service }) -> null, or { code, message }
import { createHash, createHmac } from "node:crypto";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (k, m) => createHmac("sha256", k).update(m).digest();
const enc = (s) => s.replace(/[^A-Za-z0-9\-_.~/]/g, (c) => [...Buffer.from(c)].map((b) => "%" + b.toString(16).toUpperCase().padStart(2, "0")).join(""));

function signature({ method, path, query, heads, names, body, stamp, scope, secret }) {
    const pairs = query.split("&").filter(Boolean).sort();
    const canon = [method, enc(path), pairs.join("&"), names.map((n) => `${n}:${heads[n]}\n`).join(""), names.join(";"), sha(body)].join("\n");
    const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha(canon)].join("\n");
    const [date, region, service] = scope.split("/");
    const k = hmac(hmac(hmac(hmac("AWS4" + secret, date), region), service), "aws4_request");
    return hmac(k, toSign).toString("hex");
}

const vanilla = signature({ method: "GET", path: "/", query: "", heads: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" }, names: ["host", "x-amz-date"], body: "", stamp: "20150830T123600Z", scope: "20150830/us-east-1/service/aws4_request", secret: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" });
if (vanilla !== "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31") throw new Error("the SigV4 checker does not match AWS's test suite");

export function sigv4Check(req, body, { access, secret, region, service }) {
    const auth = req.headers.authorization ?? "";
    const m = auth.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/);
    if (!m) return { code: "MissingAuthenticationToken", message: "Request is missing Authentication Token" };
    const [, key, date, reg, svc, signed, given] = m;
    if (key !== access) return { code: "UnrecognizedClientException", message: "The security token included in the request is invalid." };
    if (reg !== region || svc !== service) return { code: "InvalidSignatureException", message: `Credential should be scoped to a valid region or service, not ${reg}/${svc}.` };
    const stamp = req.headers["x-amz-date"] ?? "";
    if (!/^\d{8}T\d{6}Z$/.test(stamp) || stamp.slice(0, 8) !== date) return { code: "IncompleteSignatureException", message: "X-Amz-Date is missing or does not match the credential scope" };
    const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
    if (Math.abs(Date.now() - Date.parse(iso)) > 15 * 60 * 1000) return { code: "InvalidSignatureException", message: "Signature expired" };
    const names = signed.split(";");
    if (!names.includes("host")) return { code: "InvalidSignatureException", message: "'Host' must be a signed header" };
    for (const n of names) if (req.headers[n] == null) return { code: "InvalidSignatureException", message: `Header ${n} was signed but not sent` };
    const [path, query = ""] = req.url.split("?");
    const heads = Object.fromEntries(names.map((n) => [n, String(req.headers[n]).trim().replace(/\s+/g, " ")]));
    const want = signature({ method: req.method, path, query, heads, names, body, stamp, scope: `${date}/${reg}/${svc}/aws4_request`, secret });
    if (want !== given) return { code: "InvalidSignatureException", message: "The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method." };
    return null;
}
