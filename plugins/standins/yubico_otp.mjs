// YubiCloud's verify endpoint for the yubico_otp plugin's test, written from Yubico's "Validation
// Protocol Version 2.0": GET /wsapi/2.0/verify with id, otp, nonce (16 to 40 letters and digits),
// timestamp, sl, timeout and h, an HMAC-SHA1 over the sorted parameters with the client's key;
// answers of name=value lines with h, t, otp, nonce, sl, timestamp, sessioncounter, sessionuse and
// status. The token is decrypted here with Node's own AES, so a wrong OTP is BAD_OTP, and a counter
// seen before REPLAYED_OTP. Counters 31 to 35 make it misbehave: a forged signature, an answer for
// another OTP, another nonce, no h at all, BACKEND_ERROR.
//
//   start({ port }) -> { env: { YUBICO_API_URL, YUBICO_CLIENT_ID, YUBICO_SECRET_KEY }, close(), check() }
import { createServer } from "node:http";
import { createDecipheriv, createHmac } from "node:crypto";

const CLIENT = "87", KEY = Buffer.from("quillo-yubico-shared-secret");
const AES = "2b7e151628aed2a6abf7158809cf4f3c", MOD = "cbdefghijklnrtuv";
const sign = (params) => createHmac("sha1", KEY).update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&")).digest("base64");
const unmod = (t) => Buffer.from([...t].map((c) => MOD.indexOf(c).toString(16)).join(""), "hex");

function crc(b) { let c = 0xffff; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0x8408 : c >>> 1; } return c; }

export async function start({ port }) {
    const stats = { calls: 0, signed: 0, ok: 0, replays: 0, bad: 0 };
    const seen = new Set();
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://x");
        const reply = (fields, h) => { res.writeHead(200, { "content-type": "text/plain" }); res.end(Object.entries({ h, ...fields }).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join("\r\n") + "\r\n"); };
        if (url.pathname !== "/wsapi/2.0/verify") { res.writeHead(404); return res.end(); }
        stats.calls++;
        const q = Object.fromEntries(url.searchParams);
        const { h, ...rest } = q;
        const t = "2026-11-01T09:00:00Z0123";
        const answer = (status, extra = {}) => { const f = { t, ...extra, status }; reply(f, sign(f)); };
        if (!q.id || !q.otp || !q.nonce) return answer("MISSING_PARAMETER");
        if (q.id !== CLIENT) return answer("NO_SUCH_CLIENT");
        if (h !== sign(rest)) { stats.bad++; return answer("BAD_SIGNATURE"); }
        if (!/^[a-zA-Z0-9]{16,40}$/.test(q.nonce)) return answer("MISSING_PARAMETER");
        stats.signed++;
        const token = unmod(q.otp.slice(-32));
        const d = createDecipheriv("aes-128-ecb", Buffer.from(AES, "hex"), null).setAutoPadding(false);
        const plain = Buffer.concat([d.update(token), d.final()]);
        const echo = { otp: q.otp, nonce: q.nonce };
        if (crc(plain) !== 0xf0b8) return answer("BAD_OTP", echo);
        const counter = plain.readUInt16LE(6), use = plain[11];
        const good = { ...echo, sl: 100, timestamp: plain[10] * 65536 + plain.readUInt16LE(8), sessioncounter: counter, sessionuse: use };
        if (counter === 31) { const f = { t, ...good, status: "OK" }; return reply(f, "Zm9yZ2Vk"); }
        if (counter === 32) return answer("OK", { ...good, otp: "cccccccccccc" + q.otp.slice(12) });
        if (counter === 33) return answer("OK", { ...good, nonce: "aaaaaaaaaaaaaaaaaaaa" });
        if (counter === 34) { const f = { t, ...good, status: "OK" }; return reply(f, undefined); }
        if (counter === 35) return answer("BACKEND_ERROR");
        if (seen.has(q.otp)) { stats.replays++; return answer("REPLAYED_OTP", echo); }
        seen.add(q.otp);
        stats.ok++;
        answer("OK", good);
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { YUBICO_API_URL: `http://127.0.0.1:${port}`, YUBICO_CLIENT_ID: CLIENT, YUBICO_SECRET_KEY: KEY.toString("base64") },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.ok ? "no OTP was verified" : !stats.replays ? "no replay was refused" : stats.bad ? `${stats.bad} requests had a bad signature` : null),
    };
}
