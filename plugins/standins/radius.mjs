// A RADIUS server for the radius plugin's test, on node:dgram, written from RFC 2865
// (authentication), 2866 (accounting), 3579 (Message-Authenticator) and 5997 (Status-Server).
// It knows one client, 127.0.0.1, with the shared secret in RADIUS_SECRET ("testing123"),
// and drops any packet whose Message-Authenticator or accounting authenticator does not check
// out with it, as servers do. Users: alice (PAP or CHAP, accepted with a session timeout, an
// address, a class and vendor attributes), bob (rejected), carol (a challenge: State, then
// the code 424242). Accounting on port + 1 keeps each session's Start, Interim and Stop.
import { createSocket } from "node:dgram";
import { createHash, createHmac } from "node:crypto";

const SECRET = "testing123";
const md5 = (...parts) => createHash("md5").update(Buffer.concat(parts)).digest();
function attrs(b) { const out = []; let i = 20; while (i + 2 <= b.length) { const t = b[i], l = b[i + 1]; if (l < 2 || i + l > b.length) throw new Error("bad attribute length"); out.push({ t, v: b.subarray(i + 2, i + l), at: i }); i += l; } return out; }
const attr = (t, v) => Buffer.concat([Buffer.from([t, v.length + 2]), v]);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const vsa = (vendor, t, v) => attr(26, Buffer.concat([u32(vendor), Buffer.from([t, v.length + 2]), v]));

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
    const secret = Buffer.from(SECRET);
    const seen = { pap: 0, chap: 0, challenged: 0, answered: 0, rejected: 0, status: 0, sessions: {}, dropped: [], problems: [] };
    function reply(req, code, list) {
        // the Message-Authenticator first, over the packet with the Request Authenticator in place
        const body = Buffer.concat([attr(80, Buffer.alloc(16)), ...list, ...attrs(req).filter((a) => a.t === 33).map((a) => attr(33, a.v))]);
        const p = Buffer.concat([Buffer.from([code, req[1], 0, 0]), req.subarray(4, 20), body]);
        p.writeUInt16BE(p.length, 2);
        createHmac("md5", secret).update(p).digest().copy(p, 22);
        md5(p.subarray(0, 4), req.subarray(4, 20), p.subarray(20), secret).copy(p, 4);
        return p;
    }
    function checkMA(req, list, zeroAuth) {
        const ma = list.find((a) => a.t === 80);
        if (!ma) return false;
        const copy = Buffer.from(req);
        if (zeroAuth) copy.fill(0, 4, 20);
        copy.fill(0, ma.at + 2, ma.at + 18);
        return createHmac("md5", secret).update(copy).digest().equals(ma.v);
    }
    const auth = createSocket("udp4");
    auth.on("message", (m, r) => {
        try {
            if (m.length < 20 || m.readUInt16BE(2) > m.length) return;
            const req = m.subarray(0, m.readUInt16BE(2));
            const list = attrs(req);
            if (!checkMA(req, list, false)) { seen.dropped.push("no or a wrong Message-Authenticator"); return; } // (BlastRADIUS: required)
            const send = (code, l) => auth.send(reply(req, code, l), r.port, r.address);
            if (req[0] === 12) { seen.status++; return send(2, [attr(18, Buffer.from("up"))]); }
            if (req[0] !== 1) return;
            const user = list.find((a) => a.t === 1)?.v.toString();
            const ra = req.subarray(4, 20);
            let password = null, chapOk = (pw) => false;
            const pap = list.find((a) => a.t === 2), chap = list.find((a) => a.t === 3);
            if (pap) {
                // RFC 2865 5.2: p1 = c1 XOR MD5(S + RA), pi = ci XOR MD5(S + c(i-1))
                if (pap.v.length % 16 || !pap.v.length) { seen.problems.push("a User-Password not a multiple of 16 bytes"); return; }
                const out = []; let prev = ra;
                for (let i = 0; i < pap.v.length; i += 16) { const c = pap.v.subarray(i, i + 16), b = md5(secret, prev); out.push(Buffer.from(c.map((x, k) => x ^ b[k]))); prev = c; }
                password = Buffer.concat(out).toString().replace(/\0+$/, "");
                seen.pap++;
            } else if (chap) {
                const challenge = list.find((a) => a.t === 60)?.v ?? ra;
                chapOk = (pw) => md5(chap.v.subarray(0, 1), Buffer.from(pw), challenge).equals(chap.v.subarray(1));
                seen.chap++;
            }
            const ok = (pw) => password === pw || chapOk(pw);
            if (user === "alice" && ok("wonderland")) {
                return send(2, [attr(18, Buffer.from("Welcome, alice")), attr(27, u32(3600)), attr(8, Buffer.from([10, 20, 0, 15])), attr(25, Buffer.from("gold")),
                    attr(6, u32(2)), vsa(14988, 8, Buffer.from("10M/10M")), vsa(9, 1, Buffer.from("shell:priv-lvl=15")), vsa(9, 1, Buffer.from("ip:inacl#1=permit tcp any any eq 443"))]);
            }
            if (user === "carol") {
                const state = list.find((a) => a.t === 24)?.v.toString();
                if (!state && ok("carolpass")) { seen.challenged++; return send(11, [attr(18, Buffer.from("Enter the code from your token")), attr(24, Buffer.from("otp-7f3a")), attr(27, u32(60))]); }
                if (state === "otp-7f3a" && ok("424242")) { seen.answered++; return send(2, [attr(18, Buffer.from("Welcome, carol")), attr(27, u32(600))]); }
            }
            seen.rejected++;
            send(3, [attr(18, Buffer.from(user === "bob" ? "Account disabled" : "Wrong user name or password"))]);
        } catch (e) { seen.problems.push(`an authentication packet the stand-in could not read: ${e.message}`); }
    });
    const acct = createSocket("udp4");
    acct.on("message", (m, r) => {
        try {
            const req = m.subarray(0, m.readUInt16BE(2));
            if (req[0] !== 4) return;
            // RFC 2866 3: Request Authenticator = MD5(Code + ID + Length + 16 zeros + Attributes + Secret)
            const z = Buffer.from(req); z.fill(0, 4, 20);
            if (!md5(z, secret).equals(req.subarray(4, 20))) { seen.dropped.push("an accounting request with a wrong authenticator"); return; }
            const list = attrs(req);
            const status = list.find((a) => a.t === 40)?.v.readUInt32BE(0);
            const sid = list.find((a) => a.t === 44)?.v.toString() ?? "-";
            if (![1, 2, 3, 7, 8].includes(status)) { seen.problems.push(`Acct-Status-Type ${status}`); return; }
            (seen.sessions[sid] ??= []).push({ 1: "start", 2: "stop", 3: "interim", 7: "on", 8: "off" }[status]);
            const p = Buffer.concat([Buffer.from([5, req[1], 0, 20]), req.subarray(4, 20)]);
            md5(p.subarray(0, 4), req.subarray(4, 20), secret).copy(p, 4);
            acct.send(p, r.port, r.address);
        } catch (e) { seen.problems.push(`an accounting packet the stand-in could not read: ${e.message}`); }
    });
    await Promise.all([bindUdp(auth, port), bindUdp(acct, port + 1)]);
    return {
        env: { RADIUS_SERVER: `127.0.0.1:${port}`, RADIUS_ACCT: `127.0.0.1:${port + 1}`, RADIUS_SECRET: SECRET, RADIUS_LISTEN_PORT: String(port + 2) },
        close: () => { auth.close(); acct.close(); },
        check: () => {
            if (seen.problems.length) return `the RADIUS stand-in saw: ${[...new Set(seen.problems)].join("; ")}`;
            if (!seen.pap || !seen.chap) return `the RADIUS server got ${seen.pap} PAP and ${seen.chap} CHAP requests`;
            if (!seen.challenged || !seen.answered) return "carol's challenge was never answered";
            const s = Object.values(seen.sessions).find((x) => x.includes("start") && x.includes("stop"));
            if (!s) return `no accounting session had a start and a stop (${JSON.stringify(seen.sessions)})`;
            return null;
        },
    };
}
