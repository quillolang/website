// A small SNMP agent and trap receiver for the snmp plugin's test, on node:dgram, written from
// RFC 1157 (v1), RFC 3416 (v2c PDUs), RFC 3414 (USM: discovery, time windows, HMAC-MD5-96 and
// HMAC-SHA-96), RFC 7860 (HMAC-192-SHA-256) and RFC 3826 (AES-128-CFB).
//
// The agent (on `port`) has a switch's system group, two interfaces (ifTable and ifXTable, a
// Counter64 past 2^32), a printer's supplies (Printer-MIB) and hrPrinterStatus. Communities:
// "public" reads, "private" also writes sysContact, sysName, sysLocation and ifAdminStatus;
// anything else is dropped, as agents do. v3 users: "ops" (SHA + AES), "monitor" (MD5, no
// privacy) and "ops256" (SHA-256 + AES). Get, get-next, get-bulk and set answer with the
// right errors for v1 (noSuchName, badValue, readOnly) and v2c (noSuchObject, noSuchInstance,
// endOfMibView, notWritable, wrongType, wrongValue, noAccess); USM answers reports for
// unknown engines, users, wrong digests and missed time windows.
//
// The trap receiver (on `port + 1`) takes v1 and v2c traps, answers informs, and checks v3
// traps from user "ops" with the sender's engine ID. `port + 2` is given to the example as
// SNMP_TRAP_PORT for its own udp.listen.
import { createSocket } from "node:dgram";
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// --- BER ---------------------------------------------------------------------------------------
const len = (n) => (n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 0xff]));
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...parts) => tlv(0x30, Buffer.concat(parts));
function intBody(v) {
    let n = BigInt(v), out = [];
    for (;;) { out.unshift(Number(n & 0xffn)); const rest = n >> 8n; if ((rest === 0n && !(out[0] & 0x80)) || (rest === -1n && out[0] & 0x80)) break; n = rest; }
    return Buffer.from(out);
}
const int = (v) => tlv(0x02, intBody(v));
function uint(tag, v) { let b = intBody(BigInt(v)); return tlv(tag, b); }
const str = (s) => tlv(0x04, Buffer.isBuffer(s) ? s : Buffer.from(s, "utf8"));
function oidEnc(o) {
    const a = o.split(".").map(Number), out = [];
    const push = (v) => { const t = [v & 0x7f]; v = Math.floor(v / 128); while (v > 0) { t.unshift(0x80 | (v & 0x7f)); v = Math.floor(v / 128); } out.push(...t); };
    push(a[0] * 40 + a[1]); a.slice(2).forEach(push);
    return tlv(0x06, Buffer.from(out));
}
function read(b, at = 0) {
    const tag = b[at]; let l = b[at + 1], p = at + 2;
    if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = l * 256 + b[p + i]; p += n; }
    if (p + l > b.length) throw new Error("cut short");
    return { tag, body: b.subarray(p, p + l), start: at, end: p + l, bodyAt: p };
}
function items(b) { const out = []; let at = 0; while (at < b.length) { const t = read(b, at); out.push(t); at = t.end; } return out; }
const intDec = (b) => { let v = b[0] & 0x80 ? -1n : 0n; for (const x of b) v = (v << 8n) | BigInt(x); return Number(v); };
function oidDec(b) {
    const out = []; let v = 0;
    for (const x of b) { v = v * 128 + (x & 0x7f); if (!(x & 0x80)) { if (!out.length) { const a = v < 80 ? Math.floor(v / 40) : 2; out.push(a, v - a * 40); } else out.push(v); v = 0; } }
    return out.join(".");
}
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };

// --- the MIB -----------------------------------------------------------------------------------
const started = Date.now();
const S = (v) => ({ t: 0x04, v }), I = (v) => ({ t: 0x02, v }), O = (v) => ({ t: 0x06, v }), C32 = (v) => ({ t: 0x41, v }), G = (v) => ({ t: 0x42, v }), C64 = (v) => ({ t: 0x46, v });
function makeMib() {
    const m = new Map([
        ["1.3.6.1.2.1.1.1.0", S("Example Networks EX-2400 switch, firmware 4.2.1")],
        ["1.3.6.1.2.1.1.2.0", O("1.3.6.1.4.1.99999.1.24")],
        ["1.3.6.1.2.1.1.3.0", { t: 0x43, get: () => Math.floor((Date.now() - started) / 10) + 8640000 }],
        ["1.3.6.1.2.1.1.4.0", S("ops@example.com")],
        ["1.3.6.1.2.1.1.5.0", S("switch-hall-2")],
        ["1.3.6.1.2.1.1.6.0", S("Hall 2, rack B")],
        ["1.3.6.1.2.1.1.7.0", I(72)],
        ["1.3.6.1.2.1.2.1.0", I(2)],
        ["1.3.6.1.2.1.25.3.5.1.1.1", I(3)],
    ]);
    const ifs = [
        { descr: "lo", type: 24, mtu: 65536, speed: 0, mac: Buffer.alloc(0), oper: 1, inO: 1234567, outO: 1234567, name: "lo", hc: 1234567n, high: 0, alias: "" },
        { descr: "eth0", type: 6, mtu: 1500, speed: 1000000000, mac: Buffer.from("001a2b3c4d5e", "hex"), oper: 1, inO: 705032704, outO: 98765432, name: "eth0", hc: 5000000000n, high: 1000, alias: "uplink to core" },
    ];
    ifs.forEach((f, k) => {
        const i = k + 1, e = (c) => `1.3.6.1.2.1.2.2.1.${c}.${i}`, x = (c) => `1.3.6.1.2.1.31.1.1.1.${c}.${i}`;
        m.set(e(1), I(i)); m.set(e(2), S(f.descr)); m.set(e(3), I(f.type)); m.set(e(4), I(f.mtu)); m.set(e(5), G(f.speed));
        m.set(e(6), S(f.mac)); m.set(e(7), I(1)); m.set(e(8), I(f.oper)); m.set(e(10), C32(f.inO)); m.set(e(16), C32(f.outO));
        m.set(x(1), S(f.name)); m.set(x(6), C64(f.hc)); m.set(x(15), G(f.high)); m.set(x(18), S(f.alias));
    });
    const sup = [["Black Toner Cartridge HP 89A", 3, 100, 12], ["Imaging Drum", 9, 100, 80]];
    sup.forEach(([d, type, max, level], k) => {
        const e = (c) => `1.3.6.1.2.1.43.11.1.1.${c}.1.${k + 1}`;
        m.set(e(5), I(type)); m.set(e(6), S(d)); m.set(e(7), I(19)); m.set(e(8), I(max)); m.set(e(9), I(level));
    });
    return m;
}
const writable = { "1.3.6.1.2.1.1.4.0": "s", "1.3.6.1.2.1.1.5.0": "s", "1.3.6.1.2.1.1.6.0": "s", "1.3.6.1.2.1.2.2.1.7.1": "i", "1.3.6.1.2.1.2.2.1.7.2": "i" };

function valueEnc(e) {
    const v = e.get ? e.get() : e.v;
    if (e.t === 0x02) return int(v);
    if (e.t === 0x04) return str(v);
    if (e.t === 0x06) return oidEnc(v);
    return uint(e.t, v);
}
const vb = (oid, val) => seq(oidEnc(oid), val);

// --- USM ---------------------------------------------------------------------------------------
const ENGINE = Buffer.concat([Buffer.from("80001f8804", "hex"), Buffer.from("standin")]);
const BOOTS = 3;
const engineTime = () => Math.floor((Date.now() - started) / 1000) + 100;
const algos = { md5: { h: "md5", mac: 12 }, sha1: { h: "sha1", mac: 12 }, sha256: { h: "sha256", mac: 24 } };
const users = {
    ops: { auth: "sha1", authPw: "opsauth123", priv: "aes", privPw: "opspriv123" },
    monitor: { auth: "md5", authPw: "monitorpass" },
    ops256: { auth: "sha256", authPw: "ops256auth", priv: "aes", privPw: "ops256priv" },
};
const keyCache = new Map();
function localKey(algo, pw, engine) {
    const k = `${algo}|${pw}|${engine.toString("hex")}`;
    if (keyCache.has(k)) return keyCache.get(k);
    const h = createHash(algos[algo].h), p = Buffer.from(pw), chunk = Buffer.alloc(1048576);
    for (let i = 0; i < chunk.length; i++) chunk[i] = p[i % p.length];
    h.update(chunk);
    const ku = h.digest();
    const kul = createHash(algos[algo].h).update(Buffer.concat([ku, engine, ku])).digest();
    keyCache.set(k, kul);
    return kul;
}
const mac = (algo, key, msg) => createHmac(algos[algo].h, key).update(msg).digest().subarray(0, algos[algo].mac);

// Parses a v3 message: header fields, USM parameters and where the MAC sits.
function parseV3(b) {
    const top = read(b);
    const [ver, global, sec, data] = items(top.body);
    const g = items(global.body);
    const usmSeq = read(sec.body);
    const u = items(usmSeq.body);
    const macAt = top.bodyAt + sec.bodyAt + usmSeq.bodyAt + u[4].bodyAt;
    return {
        version: intDec(ver.body), msgId: intDec(g[0].body), flags: g[2].body[0] ?? 0,
        engine: Buffer.from(u[0].body), boots: intDec(u[1].body), time: intDec(u[2].body), user: u[3].body.toString(),
        mac: Buffer.from(u[4].body), macAt, priv: Buffer.from(u[5].body), data: { ...data, start: data.start + top.bodyAt, end: data.end + top.bodyAt },
    };
}
function buildV3({ msgId, flags, engine, boots, time, user, scoped, cred }) {
    let privParams = Buffer.alloc(0), msgData = scoped;
    if (flags & 2) {
        const key = localKey(cred.auth, cred.privPw, engine).subarray(0, 16);
        const salt = randomBytes(8);
        const iv = Buffer.concat([Buffer.from([boots >>> 24, (boots >> 16) & 255, (boots >> 8) & 255, boots & 255]), Buffer.from([time >>> 24, (time >> 16) & 255, (time >> 8) & 255, time & 255]), salt]);
        const c = createCipheriv("aes-128-cfb", key, iv);
        msgData = str(Buffer.concat([c.update(scoped), c.final()]));
        privParams = salt;
    }
    const macLen = flags & 1 ? algos[cred.auth].mac : 0;
    const usm = seq(str(engine), int(boots), int(time), str(user), str(Buffer.alloc(macLen)), str(privParams));
    const msg = seq(int(3), seq(int(msgId), int(65507), str(Buffer.from([flags])), int(3)), str(usm), msgData);
    if (flags & 1) {
        const p = parseV3(msg);
        mac(cred.auth, localKey(cred.auth, cred.authPw, engine), msg).copy(msg, p.macAt);
    }
    return msg;
}
// Checks a v3 message's MAC and decrypts its scoped PDU: { scoped } or { report: oid }.
function openV3(b, m, engine, cred) {
    if (!cred) return { report: "1.3.6.1.6.3.15.1.1.3.0" };
    const level = (m.flags & 3);
    const need = (cred.auth ? 1 : 0) | (cred.priv ? 2 : 0);
    if (level & 1) {
        if (!cred.auth) return { report: "1.3.6.1.6.3.15.1.1.1.0" };
        const copy = Buffer.from(b); copy.fill(0, m.macAt, m.macAt + m.mac.length);
        const want = mac(cred.auth, localKey(cred.auth, cred.authPw, engine), copy);
        if (m.mac.length !== want.length || !want.equals(m.mac)) return { report: "1.3.6.1.6.3.15.1.1.5.0" };
    }
    if ((level & 2) && !cred.priv) return { report: "1.3.6.1.6.3.15.1.1.1.0" };
    if (level !== need && level < need) return { report: "1.3.6.1.6.3.15.1.1.1.0" };
    let scoped = b.subarray(m.data.start, m.data.end);
    if (level & 2) {
        if (m.data.tag !== 0x04 || m.priv.length !== 8) return { report: "1.3.6.1.6.3.15.1.1.6.0" };
        const key = localKey(cred.auth, cred.privPw, engine).subarray(0, 16);
        const iv = Buffer.concat([Buffer.from([m.boots >>> 24, (m.boots >> 16) & 255, (m.boots >> 8) & 255, m.boots & 255]), Buffer.from([m.time >>> 24, (m.time >> 16) & 255, (m.time >> 8) & 255, m.time & 255]), m.priv]);
        const d = createDecipheriv("aes-128-cfb", key, iv);
        scoped = Buffer.concat([d.update(m.data.body), d.final()]);
        try { const t = read(scoped); if (t.tag !== 0x30) throw 0; scoped = scoped.subarray(0, t.end); } catch { return { report: "1.3.6.1.6.3.15.1.1.6.0" }; }
    }
    return { scoped, level };
}

// --- the agent ---------------------------------------------------------------------------------
// Binds a UDP socket, trying again for a few seconds while the port is still held (the
// previous example may not have let go of it yet).
function bindUdp(sock, port, host = "127.0.0.1") {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
            const onError = (e) => {
                sock.off("listening", onListening);
                if (e.code === "EADDRINUSE" && ++tries < 40) setTimeout(attempt, 100);
                else reject(e);
            };
            const onListening = () => { sock.off("error", onError); resolve(); };
            sock.once("error", onError);
            sock.once("listening", onListening);
            sock.bind(port, host);
        };
        attempt();
    });
}

export async function start({ port }) {
    const mib = makeMib();
    const seen = { v1: 0, v2get: 0, bulk: 0, next: 0, sets: 0, v3: 0, reports: [], traps: [], informs: 0, problems: [] };
    const counters = { unknownEngine: 0, unknownUser: 0, wrongDigest: 0, window: 0, decrypt: 0, level: 0 };

    // Answers one PDU: { tag: 0xA2, id, err, idx, vbs: [Buffer] }.
    function answer(version, pduTag, id, a, b, binds, canWrite) {
        const v1 = version === 0;
        const objectOf = (oid) => [...mib.keys()].some((k) => k.startsWith(oid.split(".").slice(0, -1).join(".") + "."));
        if (pduTag === 0xa0 || pduTag === 0xa1) {
            const out = [];
            for (let i = 0; i < binds.length; i++) {
                const oid = binds[i].oid;
                let key = oid;
                if (pduTag === 0xa1) key = [...mib.keys()].sort(cmp).find((k) => cmp(k, oid) > 0);
                const e = key && mib.get(key);
                if (!e) {
                    if (v1) return { err: 2, idx: i + 1, vbs: binds.map((x) => vb(x.oid, tlv(0x05, Buffer.alloc(0)))) };
                    out.push(vb(oid, tlv(pduTag === 0xa1 ? 0x82 : objectOf(oid) ? 0x81 : 0x80, Buffer.alloc(0))));
                    continue;
                }
                if (v1 && e.t === 0x46) return { err: 2, idx: i + 1, vbs: binds.map((x) => vb(x.oid, tlv(0x05, Buffer.alloc(0)))) };
                out.push(vb(key, valueEnc(e)));
            }
            return { err: 0, idx: 0, vbs: out };
        }
        if (pduTag === 0xa5) {
            if (v1) return null;
            seen.bulk++;
            const nonRep = Math.max(0, Math.min(a, binds.length)), reps = Math.max(0, Math.min(b, 40));
            const sorted = [...mib.keys()].sort(cmp);
            const after = (o) => sorted.find((k) => cmp(k, o) > 0);
            const out = [];
            for (let i = 0; i < nonRep; i++) { const k = after(binds[i].oid); out.push(k ? vb(k, valueEnc(mib.get(k))) : vb(binds[i].oid, tlv(0x82, Buffer.alloc(0)))); }
            const cur = binds.slice(nonRep).map((x) => x.oid);
            for (let r = 0; r < reps && cur.length; r++) {
                for (let j = 0; j < cur.length; j++) {
                    const k = cur[j] && after(cur[j]);
                    if (k) { out.push(vb(k, valueEnc(mib.get(k)))); cur[j] = k; } else { out.push(vb(cur[j] ?? binds[nonRep + j].oid, tlv(0x82, Buffer.alloc(0)))); cur[j] = null; }
                }
                if (cur.every((x) => x == null)) break;
            }
            return { err: 0, idx: 0, vbs: out };
        }
        if (pduTag === 0xa3) {
            const echo = binds.map((x) => vb(x.oid, tlv(x.tag, x.body)));
            if (!canWrite) return { err: v1 ? 2 : 6, idx: 1, vbs: echo };
            // check every value first, then write them all (a set is all or nothing)
            for (let i = 0; i < binds.length; i++) {
                const x = binds[i], kind = writable[x.oid];
                if (!kind) return { err: v1 ? 2 : mib.has(x.oid) ? 17 : 6, idx: i + 1, vbs: echo };
                if ((kind === "s" && x.tag !== 0x04) || (kind === "i" && x.tag !== 0x02)) return { err: v1 ? 3 : 7, idx: i + 1, vbs: echo };
                if (kind === "s" && x.body.length > 255) return { err: v1 ? 3 : 8, idx: i + 1, vbs: echo };
                if (kind === "i" && ![1, 2, 3].includes(intDec(x.body))) return { err: v1 ? 3 : 10, idx: i + 1, vbs: echo };
            }
            for (const x of binds) mib.set(x.oid, writable[x.oid] === "s" ? S(x.body.toString("utf8")) : I(intDec(x.body)));
            seen.sets++;
            return { err: 0, idx: 0, vbs: echo };
        }
        return null;
    }
    const pduOut = (tag, id, err, idx, vbs) => tlv(tag, Buffer.concat([int(id), int(err), int(idx), seq(...vbs)]));
    function readPdu(t) {
        const [id, a, b, list] = items(t.body);
        const binds = items(list.body).map((v) => { const [o, val] = items(v.body); return { oid: oidDec(o.body), tag: val.tag, body: Buffer.from(val.body) }; });
        return { tag: t.tag, id: intDec(id.body), a: intDec(a.body), b: intDec(b.body), binds };
    }

    const agent = createSocket("udp4");
    agent.on("message", (msg, rinfo) => {
        try {
            const top = read(msg);
            const parts = items(top.body);
            const version = intDec(parts[0].body);
            if (version === 0 || version === 1) {
                const community = parts[1].body.toString();
                if (community !== "public" && community !== "private") return;
                const p = readPdu(parts[2]);
                if (version === 0) seen.v1++;
                else if (p.tag === 0xa0) seen.v2get++;
                if (p.tag === 0xa1) seen.next++;
                const r = answer(version, p.tag, p.id, p.a, p.b, p.binds, community === "private");
                if (!r) return;
                agent.send(seq(int(version), str(community), pduOut(0xa2, p.id, r.err, r.idx, r.vbs)), rinfo.port, rinfo.address);
                return;
            }
            if (version !== 3) return;
            const m = parseV3(msg);
            const report = (oid, count, flags = 0, cred = null) => {
                seen.reports.push(oid);
                const scoped = seq(str(ENGINE), str(""), pduOut(0xa8, 0, 0, 0, [vb(oid, uint(0x41, count))]));
                agent.send(buildV3({ msgId: m.msgId, flags, engine: ENGINE, boots: BOOTS, time: engineTime(), user: m.user, scoped, cred }), rinfo.port, rinfo.address);
            };
            if (!m.engine.equals(ENGINE)) return report("1.3.6.1.6.3.15.1.1.4.0", ++counters.unknownEngine);
            const cred = users[m.user];
            const opened = openV3(msg, m, ENGINE, cred);
            if (opened.report) {
                const c = opened.report.endsWith("1.3.0") ? ++counters.unknownUser : opened.report.endsWith("1.5.0") ? ++counters.wrongDigest : opened.report.endsWith("1.6.0") ? ++counters.decrypt : ++counters.level;
                return report(opened.report, c);
            }
            if ((m.flags & 1) && (m.boots !== BOOTS || Math.abs(m.time - engineTime()) > 150)) return report("1.3.6.1.6.3.15.1.1.2.0", ++counters.window, 1, cred);
            const s = items(read(opened.scoped).body);
            const p = readPdu(s[2]);
            seen.v3++;
            const r = answer(1, p.tag, p.id, p.a, p.b, p.binds, m.user === "ops" || m.user === "ops256");
            if (!r) return;
            const scoped = seq(str(ENGINE), str(s[1].body), pduOut(0xa2, p.id, r.err, r.idx, r.vbs));
            agent.send(buildV3({ msgId: m.msgId, flags: m.flags & 3, engine: ENGINE, boots: BOOTS, time: engineTime(), user: m.user, scoped, cred }), rinfo.port, rinfo.address);
        } catch (e) {
            seen.problems.push(`a packet the agent could not read: ${e.message}`);
        }
    });

    const traps = createSocket("udp4");
    traps.on("message", (msg, rinfo) => {
        try {
            const parts = items(read(msg).body);
            const version = intDec(parts[0].body);
            if (version === 3) {
                const m = parseV3(msg);
                const opened = openV3(msg, m, m.engine, users[m.user]);
                if (opened.report) { seen.problems.push(`a v3 trap that did not check out (${opened.report})`); return; }
                const p = readPdu(items(read(opened.scoped).body)[2]);
                seen.traps.push({ version: "3", type: p.tag, trap: p.binds[1] && oidDec(p.binds[1].body) });
                return;
            }
            const community = parts[1].body.toString();
            if (parts[2].tag === 0xa4) { seen.traps.push({ version: "1", community }); return; }
            const p = readPdu(parts[2]);
            if (p.binds[0]?.oid !== "1.3.6.1.2.1.1.3.0" || p.binds[1]?.oid !== "1.3.6.1.6.3.1.1.4.1.0") seen.problems.push("a v2 trap whose first varbinds are not sysUpTime.0 and snmpTrapOID.0");
            seen.traps.push({ version: "2c", community, type: p.tag, trap: p.binds[1] && oidDec(p.binds[1].body) });
            if (p.tag === 0xa6) {
                seen.informs++;
                traps.send(seq(int(version), str(community), pduOut(0xa2, p.id, 0, 0, p.binds.map((x) => vb(x.oid, tlv(x.tag, x.body))))), rinfo.port, rinfo.address);
            }
        } catch (e) {
            seen.problems.push(`a trap the receiver could not read: ${e.message}`);
        }
    });
    await Promise.all([bindUdp(agent, port), bindUdp(traps, port + 1)]);
    return {
        env: { SNMP_HOST: `127.0.0.1:${port}`, SNMP_MANAGER: `127.0.0.1:${port + 1}`, SNMP_TRAP_PORT: String(port + 2) },
        close: () => { agent.close(); traps.close(); },
        check: () => {
            if (seen.problems.length) return `the SNMP stand-in saw: ${[...new Set(seen.problems)].join("; ")}`;
            if (!seen.v2get || !seen.bulk) return `the SNMP agent got ${seen.v2get} v2c gets and ${seen.bulk} get-bulks`;
            if (!seen.sets) return "the SNMP agent never had a value set";
            if (!seen.v3) return "the SNMP agent never answered an SNMPv3 request";
            if (!seen.informs || !seen.traps.some((t) => t.version === "3")) return `the trap receiver got ${seen.informs} informs and ${seen.traps.length} traps (none v3)`;
            return null;
        },
    };
}
