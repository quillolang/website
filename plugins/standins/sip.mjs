// A SIP registrar and phone for sip.qwe, on UDP and TCP on one port. Written from RFC 3261 (the
// mandatory headers of 8.1.1, the transaction layer of 17, Content-Length on streams 18.3) and
// RFC 2617 and 8760 for digest. It refuses with 400 a request missing a mandatory header, a Via
// branch without z9hG4bK, or a From without a tag, and checks digest responses with its own MD5.
//
// Users of REGISTER: 1001 / sekret. Request URIs that behave oddly: sip:flaky@ drops the first two
// copies of a transaction; sip:slow@ sends a 100, then the 200 after a moment; sip:compact@ answers
// in compact header names; sip:sha256@ challenges with SHA-256; sip:echo@ answers an INVITE's SDP.
import { createSocket } from "node:dgram";
import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";

function bindUdp(sock, port) {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
            const onError = (e) => { sock.off("listening", onListening); if (e.code === "EADDRINUSE" && ++tries < 40) setTimeout(attempt, 100); else reject(e); };
            const onListening = () => { sock.off("error", onError); resolve(); };
            sock.once("error", onError); sock.once("listening", onListening); sock.bind(port, "127.0.0.1");
        };
        attempt();
    });
}
const COMPACT = { v: "via", f: "from", t: "to", i: "call-id", l: "content-length", m: "contact", c: "content-type" };
function parse(text) {
    const at = text.indexOf("\r\n\r\n");
    const [first, ...lines] = text.slice(0, at).split("\r\n");
    const h = {};
    for (const l of lines) { const i = l.indexOf(":"); const k = l.slice(0, i).trim().toLowerCase(); (h[COMPACT[k] ?? k] ??= []).push(l.slice(i + 1).trim()); }
    const [method, uri] = first.split(" ");
    return { method, uri, first, h, body: text.slice(at + 4) };
}
const md5 = (s) => createHash("md5").update(s).digest("hex");
const sha = (s) => createHash("sha256").update(s).digest("hex");

export async function start({ port }) {
    const seen = { options: 0, udp: 0, tcp: 0, registered: [], invite: null, problems: [] };
    const nonce = randomBytes(8).toString("hex");
    const copies = new Map();

    function answer(req, send, transport) {
        const { method, uri, h, first } = req;
        const respond = (code, reason, extra = "", body = "", compact = false) => {
            const via = h.via.map((v) => `${compact ? "v" : "Via"}: ${v}`).join("\r\n");
            const to = h.to[0].includes("tag=") ? h.to[0] : `${h.to[0]};tag=srv${code}`;
            send(`SIP/2.0 ${code} ${reason}\r\n${via}\r\n${compact ? "f" : "From"}: ${h.from[0]}\r\n${compact ? "t" : "To"}: ${to}\r\n${compact ? "i" : "Call-ID"}: ${h["call-id"][0]}\r\nCSeq: ${h.cseq[0]}\r\n${extra}${compact ? "l" : "Content-Length"}: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
        };
        for (const k of ["via", "from", "to", "call-id", "cseq", "max-forwards"]) if (!h[k]) { seen.problems.push(`${method} without ${k}`); return respond(400, `Missing ${k}`); }
        if (!/branch=z9hG4bK/.test(h.via[0])) { seen.problems.push("a Via branch without the magic cookie"); return respond(400, "Bad Via"); }
        if (!/SIP\/2\.0\/(UDP|TCP) /.test(h.via[0]) || !h.via[0].startsWith(`SIP/2.0/${transport}`)) { seen.problems.push(`Via says ${h.via[0]} on ${transport}`); return respond(400, "Bad Via"); }
        if (!/tag=/.test(h.from[0])) { seen.problems.push("a From without a tag"); return respond(400, "No tag"); }
        if (!h.cseq[0].endsWith(` ${method}`)) { seen.problems.push(`CSeq ${h.cseq[0]} on ${method}`); return respond(400, "Bad CSeq"); }
        if (first !== `${method} ${uri} SIP/2.0`) seen.problems.push(`a bad start line: ${first}`);
        seen[transport.toLowerCase()]++;

        if (uri.startsWith("sip:flaky@")) {
            const key = h["call-id"][0], n = (copies.get(key) ?? 0) + 1; copies.set(key, n);
            if (n < 3) return;
        }
        if (uri.startsWith("sip:slow@")) { respond(100, "Trying"); return setTimeout(() => respond(200, "OK"), 150); }
        if (uri.startsWith("sip:compact@")) return respond(200, "OK", "Allow: INVITE, ACK\r\nAllow: BYE\r\n", "", true);
        if (uri.startsWith("sip:nobody@")) return respond(404, "Not Found", 'Warning: 399 stand-in "no such user"\r\n');
        if (method === "OPTIONS") { seen.options++; return respond(200, "OK", "Allow: INVITE, ACK, BYE, CANCEL, OPTIONS\r\nServer: Stand-in PBX 1.0\r\n"); }
        if (method === "INVITE") {
            seen.invite = req.body;
            respond(180, "Ringing");
            const body = "v=0\r\no=- 1 1 IN IP4 198.51.100.5\r\ns=-\r\nc=IN IP4 198.51.100.5\r\nt=0 0\r\nm=audio 6000 RTP/AVP 96\r\na=rtpmap:96 opus/48000/2\r\na=fmtp:96 useinbandfec=1\r\na=sendrecv\r\n";
            return setTimeout(() => respond(200, "OK", "Content-Type: application/sdp\r\n", body), 20);
        }
        if (method === "REGISTER") {
            const useSha = uri.startsWith("sip:sha256@");
            const challenge = `Digest realm="stand-in.test", nonce="${nonce}", qop="auth", algorithm=${useSha ? "SHA-256" : "MD5"}, opaque="op1"`;
            const auth = h.authorization?.[0];
            if (!auth) return respond(401, "Unauthorized", `WWW-Authenticate: ${challenge}\r\n`);
            const p = Object.fromEntries([...auth.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map((m) => [m[1], m[2] ?? m[3]]));
            const H = useSha ? sha : md5;
            const ha1 = H(`${p.username}:${p.realm}:sekret`), ha2 = H(`REGISTER:${p.uri}`);
            const want = H(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:auth:${ha2}`);
            if (p.username !== "1001" || p.nonce !== nonce || p.response !== want || p.opaque !== "op1" || p.uri !== uri) return respond(403, "Forbidden");
            if (h.cseq[0] === "1 REGISTER") { seen.problems.push("the second REGISTER did not raise CSeq"); }
            seen.registered.push(transport);
            return respond(200, "OK", `Contact: ${h.contact[0]};expires=${h.expires?.[0] ?? 3600}\r\n`);
        }
        respond(501, "Not Implemented");
    }

    const udp = createSocket("udp4");
    udp.on("message", (m, from) => answer(parse(m.toString()), (text) => udp.send(text, from.port, from.address), "UDP"));
    const tcp = createServer((s) => {
        s.on("error", () => {});
        let buf = "";
        s.on("data", (d) => {
            buf += d.toString();
            for (;;) {
                const at = buf.indexOf("\r\n\r\n");
                if (at < 0) return;
                const len = Number(/content-length:\s*(\d+)/i.exec(buf.slice(0, at))?.[1] ?? -1);
                if (len < 0) { seen.problems.push("a TCP message without Content-Length"); s.destroy(); return; }
                if (buf.length < at + 4 + len) return;
                const text = buf.slice(0, at + 4 + len);
                buf = buf.slice(at + 4 + len);
                answer(parse(text), (t) => s.write(t), "TCP");
            }
        });
    });
    await bindUdp(udp, port);
    await new Promise((r) => tcp.listen(port, "127.0.0.1", r));
    return {
        env: { SIP_SERVER: `127.0.0.1:${port}`, SIP_USER: "1001", SIP_PASSWORD: "sekret" },
        close() { setTimeout(() => udp.close(), 50); tcp.close(); },
        check() {
            if (seen.problems.length) return seen.problems[0];
            if (seen.udp === 0 || seen.tcp === 0) return "the server was not reached over both UDP and TCP";
            if (!seen.registered.includes("UDP") || !seen.registered.includes("TCP")) return "no REGISTER passed over both transports";
            if (!seen.invite?.includes("a=rtpmap:96 opus/48000")) return "the INVITE's SDP did not arrive";
            return null;
        },
    };
}
