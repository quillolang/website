// A directory for ldap.qwer that answers like Active Directory, speaking LDAPv3 in BER (RFC 4511):
// BindRequest (simple; confidentialityRequired before StartTLS, AD's "data 52e" and "data 775"
// texts for a wrong password and a locked account), the StartTLS and WhoAmI extended operations,
// SearchRequest with and, or, not, equality, substrings, present, >=, <= and extensible match
// (LDAP_MATCHING_RULE_IN_CHAIN, 1.2.840.113556.1.4.1941, for nested groups), the scopes, a size
// limit, attribute selection and the paged results control (1.2.840.113556.1.4.319; past 20
// entries an unpaged search stops with sizeLimitExceeded, as AD's MaxPageSize does), AddRequest,
// ModifyRequest, DelRequest and UnbindRequest. Users carry a binary objectSid and objectGUID.
import { createServer } from "node:net";
import { TLSSocket, createSecureContext } from "node:tls";
import { ca, cert, key } from "./proto_tls.mjs";

// ---- BER ----
function readLen(b, i) {
    const f = b[i];
    if (f < 0x80) return [f, i + 1];
    const n = f & 0x7f;
    let len = 0;
    for (let k = 0; k < n; k++) len = len * 256 + b[i + 1 + k];
    return [len, i + 1 + n];
}
function parse(b, i = 0) {
    const tag = b[i];
    const [len, at] = readLen(b, i + 1);
    const end = at + len;
    if (end > b.length) return null;
    const node = { tag, raw: b.subarray(at, end), end };
    if (tag & 0x20) {
        node.kids = [];
        let j = at;
        while (j < end) { const k = parse(b, j); if (!k) return null; node.kids.push(k); j = k.end; }
    }
    return node;
}
const len = (n) => (n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]));
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p)))); return Buffer.concat([Buffer.from([tag]), len(body.length), body]); };
const int = (tag, v) => { const bytes = []; let x = v; do { bytes.unshift(x & 255); x = Math.floor(x / 256); } while (x > 0); if (bytes[0] & 0x80) bytes.unshift(0); return tlv(tag, Buffer.from(bytes)); };
const str = (tag, s) => tlv(tag, Buffer.isBuffer(s) ? s : Buffer.from(String(s), "utf8"));
const num = (node) => node.raw.reduce((a, x) => a * 256 + x, 0);
const text = (node) => node.raw.toString("utf8");

// ---- The directory ----
const sidOf = (rid) => { const b = Buffer.alloc(28); b[0] = 1; b[1] = 5; b[7] = 5; [21, 3623811015, 3361044348, 30300820, rid].forEach((x, i) => b.writeUInt32LE(x, 8 + 4 * i)); return b; };
const guidOf = (n) => Buffer.from(`6f3c2a1b5d4e${String(n).padStart(4, "0")}8a9b0c1d2e3f4a5b`, "hex");

function directory() {
    const base = "dc=quillo,dc=test";
    const e = new Map();
    const add = (dn, attrs) => e.set(dn.toLowerCase(), { dn, attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])) });
    add(base, { objectClass: ["top", "domain"], dc: "quillo" });
    for (const ou of ["People", "Groups", "Service", "Devices"]) add(`ou=${ou},${base}`, { objectClass: ["top", "organizationalUnit"], ou });
    const person = (cn, sam, mail, rid, extra = {}) => add(`cn=${cn},ou=People,${base}`, { objectClass: ["top", "person", "organizationalPerson", "user"], cn, sAMAccountName: sam, userPrincipalName: `${sam}@quillo.test`, mail, displayName: cn, objectSid: sidOf(rid), objectGUID: guidOf(rid), userPassword: "Correct-Horse-1", ...extra });
    person("Ada Lovelace", "ada", "ada@quillo.test", 1104, { title: "Engineer", department: "Analytical Engines" });
    person("Grace Hopper", "grace", "grace@quillo.test", 1105, { title: "Rear Admiral" });
    person("Lou Locked", "lou", "lou@quillo.test", 1106, { lockoutTime: "133420000000000000" });
    add(`cn=svc-web,ou=Service,${base}`, { objectClass: ["top", "user"], cn: "svc-web", sAMAccountName: "svc-web", userPassword: "svc-pass" });
    const group = (cn, members) => add(`cn=${cn},ou=Groups,${base}`, { objectClass: ["top", "group"], cn, member: members.map((m) => (m.includes("=") ? m : `cn=${m},ou=People,${base}`)) });
    group("Engineers", ["Ada Lovelace"]);
    group("Admins", ["Grace Hopper"]);
    group("Staff", [`cn=Engineers,ou=Groups,${base}`, `cn=Admins,ou=Groups,${base}`]);
    group("VPN Users", [`cn=Staff,ou=Groups,${base}`]);
    for (let i = 1; i <= 25; i++) add(`cn=PC-${String(i).padStart(3, "0")},ou=Devices,${base}`, { objectClass: ["top", "computer"], cn: `PC-${String(i).padStart(3, "0")}`, operatingSystem: i % 3 ? "Windows 11" : "Ubuntu 24.04" });
    return e;
}

const parentOf = (dn) => dn.slice(dn.indexOf(",") + 1).toLowerCase();
const get = (entry, name) => { const k = Object.keys(entry.attrs).find((a) => a.toLowerCase() === name.toLowerCase()); return k ? entry.attrs[k] : null; };
const vstr = (v) => (Buffer.isBuffer(v) ? v.toString("latin1") : String(v));

export async function start({ port }) {
    const dir = directory();
    const ctx = createSecureContext({ key, cert });
    const log = { binds: 0, starttls: 0, searches: 0, paged: 0, inChain: 0, adds: 0, mods: 0, dels: 0 };

    // Whether group `g` has `dn` as a member, directly or through groups in it.
    const inChain = (g, dn, seen = new Set()) => {
        if (seen.has(g.dn.toLowerCase())) return false;
        seen.add(g.dn.toLowerCase());
        for (const m of get(g, "member") ?? []) {
            if (m.toLowerCase() === dn.toLowerCase()) return true;
            const sub = dir.get(m.toLowerCase());
            if (sub && inChain(sub, dn, seen)) return true;
        }
        return false;
    };
    const match = (f, entry) => {
        const t = f.tag;
        if (t === 0xa0) return f.kids.every((k) => match(k, entry));
        if (t === 0xa1) return f.kids.some((k) => match(k, entry));
        if (t === 0xa2) return !match(f.kids[0], entry);
        if (t === 0x87) return get(entry, text(f)) != null || text(f).toLowerCase() === "objectclass";
        if (t === 0xa3 || t === 0xa5 || t === 0xa6 || t === 0xa8) {
            const vals = get(entry, text(f.kids[0])); const want = text(f.kids[1]).toLowerCase();
            if (!vals) return false;
            return vals.some((v) => { const s = vstr(v).toLowerCase(); return t === 0xa5 ? s >= want : t === 0xa6 ? s <= want : s === want; });
        }
        if (t === 0xa4) {
            const vals = get(entry, text(f.kids[0])); if (!vals) return false;
            const parts = f.kids[1].kids;
            return vals.some((v) => {
                let s = vstr(v).toLowerCase(), at = 0;
                for (const p of parts) {
                    const x = text(p).toLowerCase();
                    if (p.tag === 0x80) { if (!s.startsWith(x)) return false; at = x.length; }
                    else if (p.tag === 0x81) { const i = s.indexOf(x, at); if (i < 0) return false; at = i + x.length; }
                    else if (p.tag === 0x82) { if (!s.endsWith(x) || s.length - x.length < at) return false; }
                }
                return true;
            });
        }
        if (t === 0xa9) {
            const rule = f.kids.find((k) => k.tag === 0x81), type = f.kids.find((k) => k.tag === 0x82), value = f.kids.find((k) => k.tag === 0x83);
            if (rule && text(rule) === "1.2.840.113556.1.4.1941" && type && text(type).toLowerCase() === "member") { log.inChain++; return inChain(entry, text(value)); }
            return false;
        }
        throw new Error(`filter choice 0x${t.toString(16)} not served`);
    };

    const server = createServer((raw) => {
        let sock = raw, buf = Buffer.alloc(0), bound = null, tls = false;
        const pages = new Map();
        raw.on("error", () => {});
        const send = (id, op, controls) => sock.write(tlv(0x30, int(0x02, id), op, ...(controls ? [tlv(0xa0, ...controls)] : [])));
        const result = (tag, code, msg = "", matched = "", extra = []) => tlv(tag, int(0x0a, code), str(0x04, matched), str(0x04, msg), ...extra);
        const onData = (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (buf.length < 2) return;
                const m = parse(buf);
                if (!m) return;
                buf = buf.subarray(m.end);
                const [idNode, op, ctrls] = m.kids;
                const id = num(idNode);
                const controls = (ctrls?.tag === 0xa0 ? ctrls.kids : []).map((c) => ({ oid: text(c.kids[0]), value: c.kids.find((k) => k.tag === 0x04 && k !== c.kids[0]) }));
                if (op.tag === 0x60) {
                    const name = text(op.kids[1]), auth = op.kids[2];
                    if (auth.tag !== 0x80) { send(id, result(0x61, 7, "only simple binds here")); continue; }
                    const pw = auth.raw.toString("utf8");
                    if (!name && !pw) { bound = null; send(id, result(0x61, 0)); continue; }
                    if (!pw) { send(id, result(0x61, 53, "unauthenticated bind (a name with no password) is not allowed")); continue; }
                    if (!tls) { send(id, result(0x61, 13, "00002028: LdapErr: DSID-0C090259, comment: The server requires binds to turn on integrity checking if SSL\\TLS are not already active on the connection, data 0, v4563")); continue; }
                    const entry = dir.get(name.toLowerCase());
                    if (!entry || vstr(get(entry, "userPassword")?.[0]) !== pw) { send(id, result(0x61, 49, "80090308: LdapErr: DSID-0C09042A, comment: AcceptSecurityContext error, data 52e, v4563")); continue; }
                    if (get(entry, "lockoutTime")) { send(id, result(0x61, 49, "80090308: LdapErr: DSID-0C09042A, comment: AcceptSecurityContext error, data 775, v4563")); continue; }
                    bound = entry.dn; log.binds++; send(id, result(0x61, 0));
                } else if (op.tag === 0x42) { sock.end(); return; }
                else if (op.tag === 0x77) {
                    const oid = text(op.kids[0]);
                    if (oid === "1.3.6.1.4.1.1466.20037") {
                        if (tls) { send(id, result(0x78, 1, "TLS is already on")); continue; }
                        send(id, result(0x78, 0, "", "", [str(0x8a, oid)]));
                        sock.removeListener("data", onData);
                        const t = new TLSSocket(sock, { isServer: true, secureContext: ctx });
                        t.on("error", () => {}); t.on("data", onData);
                        sock = t; tls = true; log.starttls++; buf = Buffer.alloc(0);
                        return;
                    }
                    if (oid === "1.3.6.1.4.1.4203.1.11.3") { send(id, result(0x78, 0, "", "", [str(0x8b, bound ? `dn:${bound}` : "")])); continue; }
                    send(id, result(0x78, 2, `extended operation ${oid} not served`));
                } else if (op.tag === 0x63) {
                    if (!bound) { send(id, result(0x65, 1, "000004DC: LdapErr: DSID-0C090A5C, comment: In order to perform this operation a successful bind must be completed on the connection., data 0, v4563")); continue; }
                    log.searches++;
                    const baseDn = text(op.kids[0]).toLowerCase(), scope = num(op.kids[1]), sizeLimit = num(op.kids[3]), filter = op.kids[6];
                    const attrs = (op.kids[7]?.kids ?? []).map((a) => text(a).toLowerCase());
                    if (!dir.has(baseDn)) { send(id, result(0x65, 32, "0000208D: NameErr: DSID-0310028D, problem 2001 (NO_OBJECT)", "dc=quillo,dc=test")); continue; }
                    let found;
                    try {
                        found = [...dir.values()].filter((en) => {
                            const d = en.dn.toLowerCase();
                            const inScope = scope === 0 ? d === baseDn : scope === 1 ? parentOf(d) === baseDn && d !== baseDn : d === baseDn || d.endsWith("," + baseDn);
                            return inScope && match(filter, en);
                        });
                    } catch (e) { send(id, result(0x65, 2, e.message)); continue; }
                    const paged = controls.find((c) => c.oid === "1.2.840.113556.1.4.319");
                    let from = 0, size = found.length, cookieOut = null;
                    if (paged) {
                        log.paged++;
                        const pv = parse(paged.value.raw);
                        size = num(pv.kids[0]);
                        const cookie = pv.kids[1].raw.toString();
                        from = cookie ? pages.get(cookie) ?? 0 : 0;
                        if (from + size < found.length) { cookieOut = `c${id}`; pages.set(cookieOut, from + size); }
                    } else if (found.length > 20) size = 20;
                    const slice = found.slice(from, from + size);
                    const limit = sizeLimit && sizeLimit < slice.length ? sizeLimit : slice.length;
                    for (const en of slice.slice(0, limit)) {
                        const pick = Object.entries(en.attrs).filter(([k]) => k !== "userPassword" && (attrs.length === 0 || attrs.includes("*") || attrs.includes(k.toLowerCase())));
                        send(id, tlv(0x64, str(0x04, en.dn), tlv(0x30, ...pick.map(([k, vs]) => tlv(0x30, str(0x04, k), tlv(0x31, ...vs.map((v) => str(0x04, v))))))));
                    }
                    const over = limit < slice.length || (!paged && found.length > 20);
                    const ctl = paged ? [tlv(0x30, str(0x04, "1.2.840.113556.1.4.319"), str(0x04, tlv(0x30, int(0x02, 0), str(0x04, cookieOut ?? ""))))] : null;
                    send(id, result(0x65, over ? 4 : 0, over ? "MaxPageSize (20) reached" : ""), ctl);
                } else if (op.tag === 0x68 || op.tag === 0x66 || op.tag === 0x4a) {
                    const respTag = { 0x68: 0x69, 0x66: 0x67, 0x4a: 0x6b }[op.tag];
                    if (!bound) { send(id, result(respTag, 1, "bind first")); continue; }
                    if (!bound.toLowerCase().includes("svc-web")) { send(id, result(respTag, 50, "insufficient access rights")); continue; }
                    if (op.tag === 0x4a) {
                        const dn = op.raw.toString("utf8").toLowerCase();
                        if (!dir.has(dn)) { send(id, result(respTag, 32, "no such object")); continue; }
                        if ([...dir.keys()].some((k) => k !== dn && k.endsWith("," + dn))) { send(id, result(respTag, 66, "the entry has children")); continue; }
                        dir.delete(dn); log.dels++; send(id, result(respTag, 0)); continue;
                    }
                    const dn = text(op.kids[0]);
                    if (op.tag === 0x68) {
                        if (dir.has(dn.toLowerCase())) { send(id, result(respTag, 68, "entry already exists")); continue; }
                        if (!dir.has(parentOf(dn))) { send(id, result(respTag, 32, "the parent entry is missing")); continue; }
                        const attrs = Object.fromEntries(op.kids[1].kids.map((a) => [text(a.kids[0]), a.kids[1].kids.map(text)]));
                        if (!attrs.objectClass) { send(id, result(respTag, 65, "objectClass is missing")); continue; }
                        dir.set(dn.toLowerCase(), { dn, attrs }); log.adds++; send(id, result(respTag, 0)); continue;
                    }
                    const en = dir.get(dn.toLowerCase());
                    if (!en) { send(id, result(respTag, 32, "no such object")); continue; }
                    let bad = null;
                    for (const ch of op.kids[1].kids) {
                        const how = num(ch.kids[0]), name = text(ch.kids[1].kids[0]), vals = ch.kids[1].kids[1].kids.map(text);
                        const k = Object.keys(en.attrs).find((a) => a.toLowerCase() === name.toLowerCase()) ?? name;
                        if (how === 0) { const cur = en.attrs[k] ?? []; if (vals.some((v) => cur.map(vstr).includes(v))) { bad = [20, `${name} already has that value`]; break; } en.attrs[k] = [...cur, ...vals]; }
                        else if (how === 1) { if (!en.attrs[k]) { bad = [16, `no attribute ${name}`]; break; } en.attrs[k] = vals.length ? en.attrs[k].filter((v) => !vals.includes(vstr(v))) : []; if (!en.attrs[k].length) delete en.attrs[k]; }
                        else if (how === 2) { if (vals.length) en.attrs[k] = vals; else delete en.attrs[k]; }
                    }
                    if (bad) { send(id, result(respTag, bad[0], bad[1])); continue; }
                    log.mods++; send(id, result(respTag, 0));
                } else if (op.tag === 0x50) { /* abandon: nothing to stop here */ }
                else send(id, tlv(0x78, int(0x0a, 2), str(0x04, ""), str(0x04, "operation not served")));
            }
        };
        raw.on("data", onData);
    }).listen(port, "127.0.0.1");

    return {
        env: { LDAP_URL: `ldap://127.0.0.1:${port}`, LDAP_CA: ca, LDAP_BIND_DN: "cn=svc-web,ou=Service,dc=quillo,dc=test", LDAP_PASSWORD: "svc-pass", LDAP_BASE: "dc=quillo,dc=test" },
        close: () => server.close(),
        check: () => {
            if (!log.starttls) return "the directory saw no StartTLS";
            if (!log.binds) return "nobody bound to the directory";
            if (!log.paged) return "no search used the paged results control";
            if (!log.inChain) return "no search used LDAP_MATCHING_RULE_IN_CHAIN";
            if (!log.adds || !log.mods || !log.dels) return "add, modify and delete did not all reach the directory";
            return null;
        },
    };
}
