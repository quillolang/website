// A syslog server for the syslog plugin's example, written from RFC 5424 (the message), RFC 5426
// (UDP: one message per datagram), RFC 6587 (TCP: octet counting, `MSG-LEN SP SYSLOG-MSG`, or
// non-transparent framing, each message ending in LF) and RFC 5425 (TLS: octet counting only).
//
// UDP on `port`, TCP on `port + 1`, TLS on `port + 2` (a test certificate for localhost). Every
// message is kept and checked against RFC 5424's header and structured data (an RFC 3164 one is
// kept as such). A TCP frame that is neither framing, or a TLS one that is not octet-counted,
// closes the connection, as rsyslog does.
import { createSocket } from "node:dgram";
import { createServer } from "node:net";
import { createServer as createTlsServer } from "node:tls";
import { cert, key, caFile } from "./protocols_tls.mjs";

const PRINT = /^[\x21-\x7e]+$/;

// RFC 5424 section 6: HEADER SP STRUCTURED-DATA [SP MSG].
function check5424(text) {
    const m = /^<(\d{1,3})>([1-9]\d{0,2}) (\S+) (\S+) (\S+) (\S+) (\S+) (.*)$/s.exec(text);
    if (!m) return { problem: "not an RFC 5424 header" };
    const [, pri, version, time, host, app, procid, msgid] = m;
    if (Number(pri) > 191 || (pri.length > 1 && pri[0] === "0")) return { problem: `bad PRI <${pri}>` };
    if (version !== "1") return { problem: `version ${version}` };
    if (time !== "-" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(time)) return { problem: `bad TIMESTAMP ${time}` };
    for (const [v, max, name] of [[host, 255, "HOSTNAME"], [app, 48, "APP-NAME"], [procid, 128, "PROCID"], [msgid, 32, "MSGID"]]) {
        if (!PRINT.test(v) || v.length > max) return { problem: `bad ${name} ${v}` };
    }
    // STRUCTURED-DATA = NILVALUE / 1*SD-ELEMENT
    let rest = text.slice(m[0].length - m[8].length);
    const sd = {};
    if (rest.startsWith("-")) rest = rest.slice(1);
    else {
        if (!rest.startsWith("[")) return { problem: "STRUCTURED-DATA is neither - nor [" };
        while (rest.startsWith("[")) {
            const id = /^\[([^\s=\]"]{1,32})/.exec(rest);
            if (!id) return { problem: "bad SD-ID" };
            rest = rest.slice(id[0].length);
            const params = {};
            for (;;) {
                if (rest.startsWith("]")) { rest = rest.slice(1); break; }
                const p = /^ ([^\s=\]"]{1,32})="/.exec(rest);
                if (!p) return { problem: `bad SD-PARAM in [${id[1]}` };
                rest = rest.slice(p[0].length);
                let value = "", i = 0;
                for (; i < rest.length; i++) {
                    const c = rest[i];
                    if (c === "\\" && '"\\]'.includes(rest[i + 1])) { value += rest[++i]; continue; }
                    if (c === '"') break;
                    if (c === "]") return { problem: `an unescaped ] in [${id[1]} ${p[1]}` };
                    value += c;
                }
                if (i >= rest.length) return { problem: "a PARAM-VALUE is not closed" };
                rest = rest.slice(i + 1);
                params[p[1]] = value;
            }
            sd[id[1]] = params;
        }
    }
    if (rest !== "" && !rest.startsWith(" ")) return { problem: "no space before MSG" };
    let msg = rest.slice(1);
    if (msg.startsWith("﻿")) msg = msg.slice(1);
    return { pri: Number(pri), host, app, procid, msgid, sd, msg };
}

function keep(list, transport, framing, text) {
    const r = text.startsWith("<") && /^<\d{1,3}>\d/.test(text) ? check5424(text) : /^<\d{1,3}>/.test(text) ? { rfc3164: true } : { problem: "no <PRI>" };
    list.push({ transport, framing, text, ...r });
}

export async function start({ port }) {
    const got = [];
    const udp = createSocket("udp4");
    udp.on("message", (b) => keep(got, "udp", "datagram", b.toString("utf8")));
    await new Promise((r) => udp.bind(port, "127.0.0.1", r));

    // RFC 6587 3.4: octet counting when a frame starts with a digit, LF framing when with "<".
    const stream = (transport, octetOnly) => (s) => {
        let buf = Buffer.alloc(0);
        s.on("error", () => {});
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (buf.length === 0) return;
                const c = buf[0];
                if (c >= 0x31 && c <= 0x39) {
                    const sp = buf.indexOf(0x20);
                    if (sp < 0) { if (buf.length > 10) s.destroy(); return; }
                    const len = Number(buf.subarray(0, sp).toString("latin1"));
                    if (!Number.isInteger(len) || len <= 0) { got.push({ transport, problem: "bad MSG-LEN" }); s.destroy(); return; }
                    if (buf.length < sp + 1 + len) return;
                    keep(got, transport, "octet", buf.subarray(sp + 1, sp + 1 + len).toString("utf8"));
                    buf = buf.subarray(sp + 1 + len);
                } else if (c === 0x3c && !octetOnly) {
                    const lf = buf.indexOf(0x0a);
                    if (lf < 0) return;
                    keep(got, transport, "newline", buf.subarray(0, lf).toString("utf8"));
                    buf = buf.subarray(lf + 1);
                } else {
                    got.push({ transport, problem: `a frame starting with byte ${c} (${octetOnly ? "TLS takes octet counting only" : "neither framing"})` });
                    s.destroy();
                    return;
                }
            }
        });
    };
    const tcp = createServer(stream("tcp", false));
    await new Promise((r) => tcp.listen(port + 1, "127.0.0.1", r));
    const tls = createTlsServer({ key, cert }, stream("tls", true));
    await new Promise((r) => tls.listen(port + 2, "127.0.0.1", r));

    return {
        env: {
            SYSLOG_UDP: `udp://127.0.0.1:${port}`,
            SYSLOG_TCP: `tcp://127.0.0.1:${port + 1}`,
            SYSLOG_TLS: `tls://localhost:${port + 2}`,
            SYSLOG_CA: caFile(),
        },
        close() { udp.close(); tcp.close(); tls.close(); },
        check() {
            const bad = got.find((m) => m.problem);
            if (bad) return `the syslog server got a malformed message (${bad.transport}): ${bad.problem}: ${JSON.stringify(bad.text ?? "")}`;
            const want = [["udp", "datagram"], ["tcp", "octet"], ["tcp", "newline"], ["tls", "octet"]];
            for (const [t, f] of want) if (!got.some((m) => m.transport === t && m.framing === f)) return `the syslog server got nothing over ${t} (${f})`;
            if (!got.some((m) => m.sd && Object.keys(m.sd).length > 0)) return "no message had structured data";
            return null;
        },
        got,
    };
}
