// A SAML 2.0 identity provider for the saml plugin's test, written from the SAML 2.0 core and bindings
// specifications, W3C XML Signature and Exclusive XML Canonicalization. An RSA key and certificate
// (and a P-256 one) are made at start. /metadata is real IdP metadata; /sso takes a real AuthnRequest
// by the redirect binding (raw DEFLATE, base64, its signature checked when it has one) and answers
// with a real signed Response as JSON. Canonical text is written here by hand, not by the plugin's
// code: the document form differs from it on purpose (namespaces on an ancestor, attributes out of
// order, self-closed elements, a comment, whitespace in tags), so a wrong canonicalizer fails to
// verify. The `kind` parameter asks for a failing or attacking Response: every signature in the
// xsw-* attacks is genuine; only where the signed assertion sits changes. /c14n-check runs the
// `xmllint --exc-c14n` on this Mac over the same document, as a second opinion.
//
//   start({ port }) -> { env: { SAML_IDP_URL, SAML_SP_KEY, SAML_SP_CERT }, close(), check() }
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash, createPublicKey, createSign, createVerify, generateKeyPairSync, randomBytes } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { makeCert, name } from "./ocsp_der.mjs";

const P = "urn:oasis:names:tc:SAML:2.0:protocol", A = "urn:oasis:names:tc:SAML:2.0:assertion", DS = "http://www.w3.org/2000/09/xmldsig#";
const SP = "https://shop.example.com/saml", ACS = "https://shop.example.com/saml/acs";
const ENTITY = "https://idp.example.com/metadata";
const EXC = "http://www.w3.org/2001/10/xml-exc-c14n#", ENV = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const XS = "http://www.w3.org/2001/XMLSchema", XSI = "http://www.w3.org/2001/XMLSchema-instance";
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const b64 = (s) => Buffer.from(s).toString("base64");
const sha = (alg, s) => createHash(alg).update(s).digest("base64");

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const spki = (k) => k.export({ type: "spki", format: "der" });
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const cert = makeCert({ subject: name("Quillo Test IdP"), spki: spki(rsa.publicKey), key: rsa.privateKey });
    const certB64 = cert.der.toString("base64");
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const ecCert = makeCert({ subject: name("Quillo Test IdP EC"), spki: spki(ec.publicKey), key: ec.privateKey, alg: "ecdsa-sha256" });
    const stray = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sp = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const spCert = makeCert({ subject: name("shop.example.com"), spki: spki(sp.publicKey), key: sp.privateKey });
    const stats = { requests: 0, signedRequests: 0, responses: 0, attacks: 0, c14n: 0 };

    const metadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="${DS}" entityID="${ENTITY}">
  <md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="${P}">
    <md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>
${certB64.match(/.{1,64}/g).join("\n")}
    </ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${ecCert.der.toString("base64")}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:KeyDescriptor use="encryption"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${base}/slo"/>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${base}/sso-post"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${base}/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>
`;

    /// Both the document form of an element and its canonical form, given what differs.
    function assertionParts({ id, reqId, kind, nameId = "ada@example.com", inclusive = false }) {
        const now = Date.now();
        const audience = kind === "wrong-audience" ? "https://other.example.com/saml" : SP;
        const notBefore = iso(kind === "not-yet" ? now + 3600000 : now - 300000);
        const notAfter = iso(kind === "expired" ? now - 3600000 : now + 300000);
        const recipient = kind === "wrong-recipient" ? "https://other.example.com/acs" : ACS;
        const confirmEnd = iso(kind === "confirmation-ended" ? now - 3600000 : now + 300000);
        const issuer = kind === "wrong-issuer" ? "https://evil.example.com" : ENTITY;
        const audienceXml = kind === "no-audience" ? "" : `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>`;
        const nameCanon = nameId.replace("<!---->", "");
        const conds = (empty) => `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notAfter}">${audienceXml}</saml:Conditions>`;
        const value = (t, canon) => canon ? `<saml:AttributeValue xmlns:xsi="${XSI}" xsi:type="xs:string">${t}</saml:AttributeValue>` : `<saml:AttributeValue xsi:type="xs:string">${t}</saml:AttributeValue>`;
        const attrs = (canon) => `<saml:AttributeStatement><saml:Attribute ${canon ? `FriendlyName="mail" Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"` : `Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic" FriendlyName="mail"`}>${value("ada@example.com", canon)}</saml:Attribute><saml:Attribute Name="groups">${value("staff", canon)}${value("admins &amp; ops", canon)}</saml:Attribute><saml:Attribute Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.7">${value("urn:mace:example:entitlement", canon)}</saml:Attribute></saml:AttributeStatement>`;
        const authn = (canon) => `<saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="session-77"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`;
        const subject = (nm) => `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nm}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${reqId}" NotOnOrAfter="${confirmEnd}" Recipient="${recipient}"></saml:SubjectConfirmationData></saml:SubjectConfirmation></saml:Subject>`;
        const middle = (canon) => `${subject(canon ? nameCanon : nameId)}${conds()}${authn(canon)}${attrs(canon)}`;
        const issue = iso(now);
        // The canonical form has its namespaces on the element, sorted, and attributes sorted.
        const canon = `<saml:Assertion xmlns:saml="${A}"${inclusive ? ` xmlns:xs="${XS}"` : ""} ID="${id}" IssueInstant="${issue}" Version="2.0"><saml:Issuer>${issuer}</saml:Issuer>${middle(true)}</saml:Assertion>`;
        // The document form leaves namespaces to the Response, and shuffles what may be shuffled.
        const open = `<saml:Assertion  Version="2.0"  IssueInstant="${issue}"\n   ID="${id}"  >`;
        const body = (sig) => `${open}<saml:Issuer >${issuer}</saml:Issuer >${sig}<!-- a comment that is not signed -->${middle(false).replace("></saml:SubjectConfirmationData>", "/>")}</saml:Assertion>`;
        return { canon, body };
    }
    function signature(id, canonText, { key = rsa.privateKey, method = "rsa-sha256", digest = "sha256", inclusive = false } = {}) {
        const digestUri = digest === "sha256" ? "http://www.w3.org/2001/04/xmlenc#sha256" : "http://www.w3.org/2000/09/xmldsig#sha1";
        const methodUri = { "rsa-sha256": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", "rsa-sha1": "http://www.w3.org/2000/09/xmldsig#rsa-sha1", "ecdsa-sha256": "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256" }[method];
        const transform2 = (ns) => inclusive ? `<ds:Transform Algorithm="${EXC}"><ec:InclusiveNamespaces ${ns ? 'xmlns:ec="http://www.w3.org/2001/10/xml-exc-c14n#" ' : ""}PrefixList="xs"></ec:InclusiveNamespaces></ds:Transform>` : `<ds:Transform Algorithm="${EXC}"></ds:Transform>`;
        const inner = (ns) => `<ds:CanonicalizationMethod Algorithm="${EXC}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="${methodUri}"></ds:SignatureMethod><ds:Reference URI="#${id}"><ds:Transforms><ds:Transform Algorithm="${ENV}"></ds:Transform>${transform2(ns)}</ds:Transforms><ds:DigestMethod Algorithm="${digestUri}"></ds:DigestMethod><ds:DigestValue>${sha(digest, canonText)}</ds:DigestValue></ds:Reference>`;
        const canonInfo = `<ds:SignedInfo xmlns:ds="${DS}">${inner(true)}</ds:SignedInfo>`;
        const sign = createSign(method === "rsa-sha1" ? "sha1" : "sha256").update(canonInfo);
        const value = method === "ecdsa-sha256" ? sign.sign({ key, dsaEncoding: "ieee-p1363" }) : sign.sign(key);
        const b = value.toString("base64").match(/.{1,60}/g).join("\n");
        const doc = (forReader) => `<ds:Signature xmlns:ds="${DS}">\n<ds:SignedInfo>${inner(true)}</ds:SignedInfo>\n<ds:SignatureValue>\n${b}\n</ds:SignatureValue>${forReader ? `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` : ""}</ds:Signature>`;
        return doc(true);
    }
    const response = (id, reqId, inner, { dest = ACS, sig = "", status = "", extra = "" } = {}) => `<?xml version="1.0" encoding="UTF-8"?>\n<samlp:Response xmlns:samlp="${P}" xmlns:saml="${A}" xmlns:xs="${XS}" xmlns:xsi="${XSI}" ID="${id}" Version="2.0" IssueInstant="${iso(Date.now())}" Destination="${dest}" InResponseTo="${reqId}"><saml:Issuer>${ENTITY}</saml:Issuer>${sig}${extra}${status || `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>`}${inner}</samlp:Response>`;
    function build(kind, reqGiven) {
        stats.responses++;
        const id = "_a" + randomBytes(10).toString("hex"), rid = "_r" + randomBytes(10).toString("hex");
        const reqId = kind === "wrong-request" ? "_someone-elses-request" : reqGiven;
        const opts = { id, reqId, kind };
        if (kind === "comment-in-name") opts.nameId = "ada@example.com<!---->.evil.example";
        if (kind === "inclusive") opts.inclusive = true;
        const a = assertionParts(opts);
        const sOpts = {};
        if (kind === "inclusive") sOpts.inclusive = true;
        if (kind === "sha1") Object.assign(sOpts, { method: "rsa-sha1", digest: "sha1" });
        if (kind === "ecdsa") Object.assign(sOpts, { method: "ecdsa-sha256", key: ec.privateKey });
        if (kind === "other-key") sOpts.key = stray.privateKey;
        const sig = signature(id, a.canon, sOpts);
        const signed = a.body(sig);
        const forged = (fid = "_forged") => `<saml:Assertion ID="${fid}" Version="2.0" IssueInstant="${iso(Date.now())}"><saml:Issuer>${ENTITY}</saml:Issuer><saml:Subject><saml:NameID>admin@example.com</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${reqId}" NotOnOrAfter="${iso(Date.now() + 300000)}" Recipient="${ACS}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions><saml:AudienceRestriction><saml:Audience>${SP}</saml:Audience></saml:AudienceRestriction></saml:Conditions></saml:Assertion>`;
        if (kind.startsWith("xsw")) stats.attacks++;
        switch (kind) {
            case "wrong-destination": return response(rid, reqId, signed, { dest: "https://other.example.com/acs" });
            case "denied": return response(rid, reqId, "", { status: `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder"><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:AuthnFailed"/></samlp:StatusCode><samlp:StatusMessage>Account locked</samlp:StatusMessage></samlp:Status>` });
            case "encrypted": return response(rid, reqId, `<saml:EncryptedAssertion><xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#"/></saml:EncryptedAssertion>`);
            case "unsigned": return response(rid, reqId, a.body(""));
            case "edited": return response(rid, reqId, signed.replace("ada@example.com</saml:NameID>", "admin@example.com</saml:NameID>"));
            case "doctype": return `<!DOCTYPE foo [<!ENTITY x "y">]>` + response(rid, reqId, signed);
            case "xsw-evil-first": return response(rid, reqId, forged() + signed);
            case "xsw-evil-after": return response(rid, reqId, signed + forged());
            case "xsw-extensions": return response(rid, reqId, forged(), { extra: `<samlp:Extensions>${signed}</samlp:Extensions>` });
            case "xsw-object": { const s = signature(id, a.canon).replace("</ds:Signature>", `<ds:Object>${signed.replace(sig, "")}</ds:Object></ds:Signature>`); return response(rid, reqId, forged().replace("<saml:Subject>", s + "<saml:Subject>")); }
            case "xsw-wraps-signed": return response(rid, reqId, forged().replace("</saml:Assertion>", signed + "</saml:Assertion>"));
            case "xsw-same-id": return response(rid, reqId, forged(id) + signed);
            case "xsw-moved-up": return response(rid, reqId, a.body(""), { sig });
            case "xsw-id-twin": return response(rid, reqId, signed, { extra: `<samlp:Extensions><twin ID="${id}"/></samlp:Extensions>` });
            case "xsw-signature-moved": return response(rid, reqId, forged().replace("<saml:Subject>", sig + "<saml:Subject>") + `<samlp:Extensions>${a.body("")}</samlp:Extensions>`);
            case "xsw-response": {
                // A whole signed Response, buried, with a forged one around it.
                const innerId = "_r" + randomBytes(10).toString("hex");
                const issueInner = iso(Date.now());
                const core = `<samlp:Status xmlns:samlp="${P}"></samlp:Status>`;
                const canon = `<samlp:Response xmlns:samlp="${P}" ID="${innerId}" IssueInstant="${issueInner}" Version="2.0">${core}</samlp:Response>`;
                const s = signature(innerId, canon);
                const buried = `<samlp:Response xmlns:samlp="${P}" ID="${innerId}" Version="2.0" IssueInstant="${issueInner}">${s}<samlp:Status></samlp:Status></samlp:Response>`;
                return response(rid, reqId, forged(), { extra: `<samlp:Extensions>${buried}</samlp:Extensions>` });
            }
            case "response-signed": case "both-signed": {
                const inner = kind === "both-signed" ? signed : a.body("");
                const issue = iso(Date.now());
                // The Response uses only samlp itself: saml appears first on its children.
                const status = `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"></samlp:StatusCode></samlp:Status>`;
                const assertionInResponse = kind === "both-signed" ? a.canon.replace("</saml:Issuer>", `</saml:Issuer>${sig}`) : a.canon;
                const canon = `<samlp:Response xmlns:samlp="${P}" Destination="${ACS}" ID="${rid}" InResponseTo="${reqId}" IssueInstant="${issue}" Version="2.0"><saml:Issuer xmlns:saml="${A}">${ENTITY}</saml:Issuer>${status}${assertionInResponse}</samlp:Response>`;
                const rs = signature(rid, canon);
                return `<samlp:Response xmlns:samlp="${P}" xmlns:saml="${A}" xmlns:xs="${XS}" xmlns:xsi="${XSI}" ID="${rid}" Version="2.0" IssueInstant="${issue}" Destination="${ACS}" InResponseTo="${reqId}"><saml:Issuer>${ENTITY}</saml:Issuer>${rs}<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${inner}</samlp:Response>`;
            }
            default: return response(rid, reqId, signed);
        }
    }
    const C14N_DOC = `<?xml version="1.0"?>\n<!-- outside -->\n<a:root xmlns:a="urn:a" xmlns:b="urn:b" xmlns="urn:default" xmlns:xs="${XS}" z="1" a:y="2" b:x='3 "q" &lt; &#xD;'>\r\n  <child  second="2"   first="1"/>\n  <b:kid xmlns:c="urn:unused" a:attr="v"><!-- gone -->text &amp; &lt;more&gt;<![CDATA[<raw> & stuff]]></b:kid>\n  <plain xmlns=""><inner xml:lang="en"/></plain>\n  <a:twice xmlns:a="urn:a"><a:again xmlns:a="urn:a2"/></a:twice>\n</a:root>\n<?end?>\n`;
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const url = new URL(req.url, base);
            const json = (v) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            if (url.pathname === "/metadata") { res.writeHead(200, { "content-type": "application/samlmetadata+xml" }); return res.end(metadata); }
            if (url.pathname === "/check-metadata") {
                const x = JSON.parse(raw).xml;
                const has = (s) => x.includes(s);
                return json({ entity: has(`entityID="${SP}"`), acs: has(`Location="${ACS}"`), binding: has("HTTP-POST"), signing_cert: has(spCert.der.toString("base64")), requests_signed: has('AuthnRequestsSigned="true"') });
            }
            if (url.pathname === "/sso") {
                stats.requests++;
                const q = url.searchParams;
                const xml = inflateRawSync(Buffer.from(q.get("SAMLRequest"), "base64")).toString();
                const attr = (n) => xml.match(new RegExp(` ${n}="([^"]*)"`))?.[1];
                let signatureGood = null;
                if (q.get("Signature")) {
                    // The signed text is the query as sent, without Signature and `kind`.
                    const signedText = req.url.split("?")[1].split("&").filter((p) => !p.startsWith("Signature=") && !p.startsWith("kind=")).join("&");
                    signatureGood = createVerify("sha256").update(signedText).verify(sp.publicKey, Buffer.from(q.get("Signature"), "base64"));
                    if (signatureGood) stats.signedRequests++;
                }
                const kind = q.get("kind") ?? "plain";
                return json({ saml_response: b64(build(kind, attr("ID"))), relay_state: q.get("RelayState"), request: { id: attr("ID"), acs: attr("AssertionConsumerServiceURL"), issuer: xml.match(/Issuer>([^<]*)</)?.[1], force_authn: attr("ForceAuthn") === "true", signature_good: signatureGood } });
            }
            if (url.pathname === "/c14n-sample") { res.writeHead(200, { "content-type": "application/xml" }); return res.end(C14N_DOC); }
            if (url.pathname === "/c14n-check") {
                stats.c14n++;
                const { doc, mine } = JSON.parse(raw);
                // xmllint keeps comments and what stands outside the root, which a signed element never has.
                const theirs = execFileSync("xmllint", ["--exc-c14n", "-"], { input: doc }).toString().replace(/<!--.*?-->\n?/g, "").replace(/\n<\?end\?>$/, "");
                return json(theirs === mine ? true : { theirs, mine });
            }
            res.writeHead(404); res.end();
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { SAML_IDP_URL: base, SAML_SP_KEY: sp.privateKey.export({ type: "pkcs8", format: "pem" }), SAML_SP_CERT: spCert.pem },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.requests ? "no AuthnRequest came" : !stats.signedRequests ? "no signed request verified" : !stats.responses ? "no response was made" : !stats.attacks ? "no wrapping attack was sent" : !stats.c14n ? "canonical form was not compared" : null),
    };
}
