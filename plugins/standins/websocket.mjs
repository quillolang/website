// A WebSocket server for the websocket_client plugin's example, written from RFC 6455 on
// node:http's upgrade event: the opening handshake (Sec-WebSocket-Key and -Accept, version 13,
// subprotocols), frames with client masking required, fragmentation, text checked as UTF-8,
// ping/pong and the closing handshake.
//
// ws:// on `port`, wss:// on `port + 1` (a test certificate for localhost). Each connection is
// first sent a JSON welcome (`{ hello, protocol, authorization }`, so a client sees its headers
// arrived), then text and binary messages are echoed. Three texts are commands: `ping-me` (the
// server pings, and expects the pong), `burst N` (N numbered messages at once), and `close-me`
// (the server closes with 1001, going away, to try a client's reconnecting).
//
// `attach(server, { protocols, onConnect })` is the same machinery for other stand-ins
// (json_rpc.mjs): `onConnect(conn, req)` gets `{ send(text | Buffer), close(code, reason), on(fn) }`.
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createHash } from "node:crypto";
import { cert, key, caFile } from "./protocols_tls.mjs";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(opcode, payload, fin = true) {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, len])
        : len < 65536 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 126, len >> 8, len & 255])
        : Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
    return Buffer.concat([head, payload]); // a server's frames are never masked (5.1)
}

const closePayload = (code, reason = "") => {
    const r = Buffer.from(reason);
    const b = Buffer.alloc(2 + r.length);
    b.writeUInt16BE(code);
    r.copy(b, 2);
    return b;
};

export function attach(server, { protocols = [], onConnect, log = [] }) {
    server.on("upgrade", (req, socket, head) => {
        const h = req.headers;
        const fail = (status, text, extra = "") => { socket.end(`HTTP/1.1 ${status} ${text}\r\n${extra}Content-Length: 0\r\nConnection: close\r\n\r\n`); log.push({ refused: status }); };
        // 4.2.1: the client's opening handshake.
        if (req.method !== "GET") return fail(405, "Method Not Allowed");
        if ((h.upgrade ?? "").toLowerCase() !== "websocket" || !/\bupgrade\b/i.test(h.connection ?? "")) return fail(400, "Bad Request");
        if (h["sec-websocket-version"] !== "13") return fail(426, "Upgrade Required", "Sec-WebSocket-Version: 13\r\n");
        const k = h["sec-websocket-key"] ?? "";
        if (Buffer.from(k, "base64").length !== 16) return fail(400, "Bad Request");
        const accept = createHash("sha1").update(k + GUID).digest("base64");
        const offered = (h["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const protocol = offered.find((p) => protocols.includes(p)) ?? null;
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : ""}\r\n`);
        socket.setNoDelay(true);

        const handlers = [];
        let closed = false, sentClose = false;
        const conn = {
            protocol, req,
            send(data) { if (closed || sentClose) return; socket.write(typeof data === "string" ? frame(1, Buffer.from(data)) : frame(2, data)); },
            ping(data = Buffer.alloc(0)) { if (!sentClose) socket.write(frame(9, Buffer.from(data))); },
            close(code = 1000, reason = "") { if (sentClose) return; sentClose = true; socket.write(frame(8, closePayload(code, reason))); setTimeout(() => socket.destroy(), 1000); },
            on(f) { handlers.push(f); },
        };
        const emit = (e) => handlers.forEach((f) => f(e));
        const protocolError = (code, why) => { log.push({ error: why }); conn.close(code, why); };

        let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
        let parts = [], partOp = 0;
        const onData = () => {
            for (;;) {
                if (buf.length < 2) return;
                const b0 = buf[0], b1 = buf[1];
                const fin = (b0 & 0x80) !== 0, rsv = b0 & 0x70, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
                let len = b1 & 0x7f, at = 2;
                if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
                else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
                if (buf.length < at + (masked ? 4 : 0) + len) return;
                // 5.1 and 5.2: a client masks every frame; no extension was agreed, so RSV is 0.
                if (!masked) return protocolError(1002, "client frames must be masked");
                if (rsv) return protocolError(1002, "RSV bits set without an extension");
                const mask = buf.subarray(at, at + 4);
                const payload = Buffer.from(buf.subarray(at + 4, at + 4 + len));
                for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
                buf = buf.subarray(at + 4 + len);
                log.push({ op, masked, len });
                if (op >= 8) {
                    // 5.5: control frames are short and never fragmented.
                    if (!fin || len > 125) return protocolError(1002, "bad control frame");
                    if (op === 8) {
                        const code = len >= 2 ? payload.readUInt16BE(0) : 1005;
                        const reason = len > 2 ? payload.subarray(2).toString() : "";
                        emit({ kind: "close", code, reason });
                        log.push({ close: code, reason });
                        if (!sentClose) { sentClose = true; socket.write(frame(8, len >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0))); }
                        closed = true;
                        socket.end();
                        return;
                    }
                    if (op === 9) { socket.write(frame(10, payload)); emit({ kind: "ping", data: payload }); continue; }
                    if (op === 10) { emit({ kind: "pong", data: payload }); continue; }
                    return protocolError(1002, `unknown control opcode ${op}`);
                }
                if (op === 0) { if (!partOp) return protocolError(1002, "a continuation with nothing to continue"); parts.push(payload); }
                else if (op === 1 || op === 2) { if (partOp) return protocolError(1002, "a new message inside a fragmented one"); partOp = op; parts = [payload]; }
                else return protocolError(1002, `unknown opcode ${op}`);
                if (!fin) continue;
                const whole = Buffer.concat(parts), kind = partOp;
                partOp = 0; parts = [];
                if (kind === 1) {
                    let text;
                    try { text = new TextDecoder("utf-8", { fatal: true }).decode(whole); } catch { return protocolError(1007, "text that is not UTF-8"); }
                    emit({ kind: "text", text });
                } else emit({ kind: "binary", data: whole });
            }
        };
        socket.on("data", (d) => { buf = Buffer.concat([buf, d]); onData(); });
        socket.on("error", () => {});
        socket.on("close", () => { closed = true; emit({ kind: "gone" }); });
        onConnect(conn, req);
        if (buf.length) onData();
    });
}

export async function start({ port }) {
    const log = [];
    const conns = [];
    const onConnect = (conn, req) => {
        const me = { path: req.url, tls: !!req.socket.encrypted, protocol: conn.protocol, events: [] };
        conns.push(me);
        conn.send(JSON.stringify({ hello: req.url, protocol: conn.protocol, authorization: req.headers.authorization ?? null }));
        conn.on((e) => {
            me.events.push(e.kind === "text" ? { kind: "text", text: e.text } : { kind: e.kind, size: e.data?.length, code: e.code });
            if (e.kind === "text") {
                if (e.text === "ping-me") return conn.ping("are you there");
                if (e.text === "close-me") return conn.close(1001, "going away");
                const burst = /^burst (\d+)$/.exec(e.text);
                if (burst) { for (let i = 1; i <= Math.min(10000, Number(burst[1])); i++) conn.send(`#${i}`); return; }
                conn.send(e.text);
            } else if (e.kind === "binary") conn.send(e.data);
        });
    };
    const http = createServer((req, res) => { res.writeHead(426, { "sec-websocket-version": "13" }); res.end("a WebSocket server: upgrade"); });
    attach(http, { protocols: ["feed.v2", "echo"], onConnect, log });
    await new Promise((r) => http.listen(port, "127.0.0.1", r));
    const https = createHttpsServer({ key, cert }, (req, res) => { res.writeHead(426); res.end(); });
    attach(https, { protocols: ["feed.v2", "echo"], onConnect, log });
    await new Promise((r) => https.listen(port + 1, "127.0.0.1", r));
    return {
        env: { WS_URL: `ws://127.0.0.1:${port}/feed`, WSS_URL: `wss://localhost:${port + 1}/feed`, WS_CA: caFile() },
        close() { http.close(); https.close(); http.closeAllConnections?.(); },
        check() {
            const err = log.find((l) => l.error);
            if (err) return `the WebSocket server saw a protocol error: ${err.error}`;
            const all = conns.flatMap((c) => c.events);
            if (!all.some((e) => e.kind === "text")) return "the WebSocket server got no text message";
            if (!all.some((e) => e.kind === "binary")) return "the WebSocket server got no binary message";
            if (!all.some((e) => e.kind === "ping")) return "the WebSocket server got no ping";
            if (!all.some((e) => e.kind === "pong")) return "the client never answered the server's ping";
            if (!all.some((e) => e.kind === "close" && e.code === 1000)) return "the client never closed a connection with 1000";
            if (!conns.some((c) => c.tls)) return "no connection came over wss://";
            if (conns.filter((c) => c.path === "/feed?reconnect" && !c.tls).length < 2) return "the client did not come back after the server closed (no reconnect)";
            if (!conns.some((c) => c.protocol === "feed.v2")) return "no connection agreed the feed.v2 subprotocol";
            return null;
        },
        conns, log,
    };
}
