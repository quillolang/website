// A SOAP server for the soap plugin's example, written from SOAP 1.1 (W3C note, 2000), SOAP 1.2
// (W3C recommendation, part 1: envelope, faults, the HTTP binding), WSDL 1.1 and the WS-Security
// UsernameToken Profile 1.0, serving the service ../soap_sample.wsdl describes.
//
// GET /calculator?wsdl gives the WSDL with this server's address. POST /calculator takes SOAP 1.1
// (text/xml, with a SOAPAction header that must name the operation) and SOAP 1.2
// (application/soap+xml). Add and Divide (a divisor of 0 is a Server/Receiver fault), and
// GetBalance, which needs a UsernameToken for ada / s3cret (PasswordDigest checked as
// Base64(SHA-1(nonce + created + password)), Created within 5 minutes, a nonce used once; or
// PasswordText). A wrong envelope namespace is a VersionMismatch fault, a header block with
// mustUnderstand that is not understood a MustUnderstand fault, unqualified parameters a Client fault.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/";
const SOAP12 = "http://www.w3.org/2003/05/soap-envelope";
const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WSU = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const PROFILE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0";
const TNS = "http://example.com/calculator/";

// An XML reader with namespaces: each element is { ns, name, attrs: [{ ns, name, value }], children }.
function parseXml(src) {
    let i = 0;
    const root = { children: [], scope: { xml: "http://www.w3.org/XML/1998/namespace" } };
    const stack = [root];
    const decode = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) =>
        e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e]);
    while (i < src.length) {
        if (src.startsWith("<?", i)) { i = src.indexOf("?>", i) + 2; if (i < 2) throw new Error("unclosed <?"); continue; }
        if (src.startsWith("<!--", i)) { i = src.indexOf("-->", i) + 3; if (i < 3) throw new Error("unclosed comment"); continue; }
        if (src.startsWith("<![CDATA[", i)) { const e = src.indexOf("]]>", i); stack.at(-1).children.push(src.slice(i + 9, e)); i = e + 3; continue; }
        if (src.startsWith("<!", i)) throw new Error("a DTD is not allowed in SOAP"); // SOAP 1.1 section 3, 1.2 part 1 section 5
        if (src.startsWith("</", i)) {
            const e = src.indexOf(">", i);
            const q = src.slice(i + 2, e).trim();
            const top = stack.pop();
            if (top.qname !== q) throw new Error(`</${q}> closes <${top.qname}>`);
            i = e + 1; continue;
        }
        if (src[i] === "<") {
            const m = /^<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(src.slice(i));
            if (!m) throw new Error(`bad tag at ${i}`);
            const raw = [...m[2].matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => ({ q: a[1], value: decode(a[2] ?? a[3]) }));
            const parent = stack.at(-1);
            const scope = { ...parent.scope };
            for (const a of raw) {
                if (a.q === "xmlns") scope[""] = a.value;
                else if (a.q.startsWith("xmlns:")) scope[a.q.slice(6)] = a.value;
            }
            const split = (q, el) => { const k = q.indexOf(":"); if (k < 0) return { ns: el ? scope[""] ?? "" : "", name: q }; const p = q.slice(0, k); if (!(p in scope)) throw new Error(`prefix ${p} is not declared`); return { ns: scope[p], name: q.slice(k + 1) }; };
            const el = { ...split(m[1], true), qname: m[1], scope, attrs: raw.filter((a) => a.q !== "xmlns" && !a.q.startsWith("xmlns:")).map((a) => ({ ...split(a.q, false), value: a.value })), children: [] };
            parent.children.push(el);
            if (!m[3]) stack.push(el);
            i += m[0].length; continue;
        }
        const e = src.indexOf("<", i);
        stack.at(-1).children.push(decode(src.slice(i, e < 0 ? src.length : e)));
        i = e < 0 ? src.length : e;
    }
    if (stack.length !== 1) throw new Error(`<${stack.at(-1).qname}> is not closed`);
    const els = root.children.filter((c) => typeof c !== "string");
    if (els.length !== 1) throw new Error("one root element");
    return els[0];
}
const kids = (el) => el.children.filter((c) => typeof c !== "string");
const text = (el) => el.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const kid = (el, ns, name) => kids(el).find((k) => k.ns === ns && k.name === name);
const attr = (el, ns, name) => el.attrs.find((a) => a.ns === ns && a.name === name)?.value;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

class Fault extends Error { constructor(code, msg, sub, detail) { super(msg); this.code = code; this.sub = sub; this.detail = detail; } }

function envelope(v, body) {
    const ns = v === "1.1" ? SOAP11 : SOAP12;
    return `<?xml version="1.0" encoding="utf-8"?>\n<env:Envelope xmlns:env="${ns}"><env:Body>${body}</env:Body></env:Envelope>`;
}
// Fault codes: 1.1 Client/Server/VersionMismatch/MustUnderstand; 1.2 Sender/Receiver/... with subcodes.
function faultXml(v, f) {
    const code12 = { Client: "Sender", Server: "Receiver" }[f.code] ?? f.code;
    if (v === "1.1") {
        const code = f.sub ? f.sub : `env:${f.code}`;
        return `<env:Fault${f.sub ? ` xmlns:wsse="${WSSE}"` : ""}><faultcode>${code}</faultcode><faultstring>${esc(f.message)}</faultstring>${f.detail ? `<detail><Reason xmlns="${TNS}">${esc(f.detail)}</Reason></detail>` : ""}</env:Fault>`;
    }
    return `<env:Fault${f.sub ? ` xmlns:wsse="${WSSE}"` : ""}><env:Code><env:Value>env:${code12}</env:Value>${f.sub ? `<env:Subcode><env:Value>${f.sub}</env:Value></env:Subcode>` : ""}</env:Code><env:Reason><env:Text xml:lang="en">${esc(f.message)}</env:Text></env:Reason>${f.detail ? `<env:Detail><Reason xmlns="${TNS}">${esc(f.detail)}</Reason></env:Detail>` : ""}</env:Fault>`;
}

export async function start({ port }) {
    const seen = { versions: new Set(), ops: [], wsdl: 0, auth: [], faults: [] };
    const nonces = new Set();
    const url = `http://127.0.0.1:${port}/calculator`;
    const wsdl = readFileSync(join(here, "..", "soap_sample.wsdl"), "utf8").replaceAll("http://localhost:8080/calculator", url);

    function checkSecurity(header, v) {
        const sec = header && kid(header, WSSE, "Security");
        const fail = (why) => { seen.auth.push({ ok: false, why }); return new Fault("Client", "The security token could not be authenticated or authorized", "wsse:FailedAuthentication", why); };
        if (!sec) throw fail("no wsse:Security header");
        const tok = kid(sec, WSSE, "UsernameToken");
        if (!tok) throw fail("no UsernameToken");
        const user = text(kid(tok, WSSE, "Username") ?? { children: [] });
        const pw = kid(tok, WSSE, "Password");
        if (!pw) throw fail("no Password");
        const type = attr(pw, "", "Type") ?? `${PROFILE}#PasswordText`;
        if (user !== "ada") throw fail("unknown user");
        if (type === `${PROFILE}#PasswordDigest`) {
            const nonceEl = kid(tok, WSSE, "Nonce"), createdEl = kid(tok, WSU, "Created");
            if (!nonceEl || !createdEl) throw fail("a digest needs Nonce and Created");
            const nonce = Buffer.from(text(nonceEl).trim(), "base64"), created = text(createdEl).trim();
            const age = Date.now() - Date.parse(created);
            if (!(Math.abs(age) < 5 * 60 * 1000)) throw fail(`Created ${created} is not within 5 minutes`);
            if (nonces.has(nonce.toString("base64"))) throw fail("a nonce used twice");
            nonces.add(nonce.toString("base64"));
            const want = createHash("sha1").update(Buffer.concat([nonce, Buffer.from(created), Buffer.from("s3cret")])).digest("base64");
            if (text(pw).trim() !== want) throw fail("wrong password digest");
            seen.auth.push({ ok: true, digest: true });
        } else if (type === `${PROFILE}#PasswordText`) {
            if (text(pw) !== "s3cret") throw fail("wrong password");
            seen.auth.push({ ok: true, digest: false });
        } else throw fail(`unknown password type ${type}`);
    }

    function handle(v, doc, action) {
        const ns = v === "1.1" ? SOAP11 : SOAP12;
        if (doc.name !== "Envelope") throw new Fault("Client", "the root is not an Envelope");
        if (doc.ns !== ns) throw new Fault("VersionMismatch", `the envelope's namespace ${doc.ns} is not SOAP ${v}'s`);
        const header = kid(doc, ns, "Header");
        for (const h of header ? kids(header) : []) {
            const mu = attr(h, ns, "mustUnderstand");
            if ((mu === "1" || mu === "true") && !(h.ns === WSSE && h.name === "Security")) throw new Fault("MustUnderstand", `the header ${h.name} (${h.ns}) is not understood`);
        }
        const body = kid(doc, ns, "Body");
        if (!body) throw new Fault("Client", "no Body");
        const op = kids(body)[0];
        if (!op || op.ns !== TNS) throw new Fault("Client", `no operation in ${TNS}`);
        if (v === "1.1" && action !== `"${TNS}${op.name}"` && action !== `${TNS}${op.name}`) throw new Fault("Client", `Server did not recognize the value of HTTP Header SOAPAction: ${action}.`);
        if (v === "1.2" && action && action !== `${TNS}${op.name}`) throw new Fault("Client", `the action ${action} does not name ${op.name}`);
        // elementFormDefault="qualified": the parameters are in the namespace too.
        const param = (name, kind) => {
            const el = kid(op, TNS, name);
            if (!el) {
                if (kids(op).some((k) => k.name === name)) throw new Fault("Client", `${name} is not qualified (it must be in ${TNS})`);
                throw new Fault("Client", `${op.name} needs ${name}`);
            }
            const s = text(el).trim();
            if (kind === "int" && !/^[+-]?\d+$/.test(s)) throw new Fault("Client", `${name} is not an int: ${s}`);
            if (kind === "double" && !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) throw new Fault("Client", `${name} is not a double: ${s}`);
            return kind === "string" ? s : Number(s);
        };
        seen.ops.push({ v, op: op.name });
        switch (op.name) {
            case "Add": return `<AddResponse xmlns="${TNS}"><AddResult>${param("intA", "int") + param("intB", "int")}</AddResult></AddResponse>`;
            case "Divide": {
                const a = param("dividend", "double"), b = param("divisor", "double");
                if (b === 0) throw new Fault("Server", "Attempted to divide by zero.", null, `${a} / 0`);
                return `<DivideResponse xmlns="${TNS}"><DivideResult>${a / b}</DivideResult></DivideResponse>`;
            }
            case "GetBalance": {
                checkSecurity(header, v);
                const account = param("account", "string");
                const want = kids(op).filter((k) => k.ns === TNS && k.name === "currency").map(text);
                const all = [["EUR", "1250.40"], ["USD", "310.00"], ["GBP", "0.00"]].filter(([c]) => want.length === 0 || want.includes(c));
                return `<GetBalanceResponse xmlns="${TNS}"><account>${esc(account)}</account>${all.map(([c, a]) => `<balance><amount>${a}</amount><currency>${c}</currency></balance>`).join("")}</GetBalanceResponse>`;
            }
            default: throw new Fault("Client", `no operation ${op.name}`);
        }
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const u = new URL(req.url, url);
            if (u.pathname !== "/calculator") { res.writeHead(404); res.end(); return; }
            if (req.method === "GET" && u.search.toLowerCase() === "?wsdl") { seen.wsdl++; res.writeHead(200, { "content-type": "text/xml; charset=utf-8" }); res.end(wsdl); return; }
            if (req.method !== "POST") { res.writeHead(405, { allow: "GET, POST" }); res.end(); return; }
            const ct = req.headers["content-type"] ?? "";
            const v = /^text\/xml\b/i.test(ct) ? "1.1" : /^application\/soap\+xml\b/i.test(ct) ? "1.2" : null;
            if (!v) { res.writeHead(415); res.end("SOAP 1.1 is text/xml, SOAP 1.2 application/soap+xml"); return; }
            const action = v === "1.1" ? req.headers.soapaction : /action="?([^";]*)"?/.exec(ct)?.[1];
            if (v === "1.1" && action === undefined) { res.writeHead(400); res.end("SOAP 1.1 over HTTP needs a SOAPAction header"); return; }
            seen.versions.add(v);
            const type = v === "1.1" ? "text/xml; charset=utf-8" : "application/soap+xml; charset=utf-8";
            try {
                let doc;
                try { doc = parseXml(body); } catch (e) { throw new Fault("Client", `not XML: ${e.message}`); }
                const out = handle(v, doc, action);
                res.writeHead(200, { "content-type": type });
                res.end(envelope(v, out));
            } catch (e) {
                if (!(e instanceof Fault)) throw e;
                seen.faults.push(e.code);
                // 1.1: faults are 500; 1.2: Sender faults 400, others 500.
                const status = v === "1.2" && (e.code === "Client" || e.code === "Sender") ? 400 : 500;
                res.writeHead(status, { "content-type": type });
                res.end(envelope(v, faultXml(v, e)));
            }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { SOAP_URL: url, SOAP_WSDL: `${url}?wsdl` },
        close() { server.close(); },
        check() {
            if (!seen.wsdl) return "the SOAP server's WSDL was never read";
            if (!seen.versions.has("1.1") || !seen.versions.has("1.2")) return `the SOAP server got only SOAP ${[...seen.versions].join(", ") || "nothing"}`;
            if (!seen.auth.some((a) => a.ok && a.digest)) return "no call passed WS-Security with a password digest";
            if (!seen.ops.some((o) => o.op === "Add")) return "the SOAP server got no Add";
            return null;
        },
        seen,
    };
}
