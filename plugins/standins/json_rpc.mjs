// A JSON-RPC 2.0 server for the json_rpc plugin's example, written from the JSON-RPC 2.0
// specification (jsonrpc.org/specification): requests, notifications (never answered), batches
// (answered as an array, or not at all when they hold only notifications), and the error codes
// -32700, -32600, -32601 and -32602.
//
// Over HTTP: POST /rpc on `port` (204 when there is nothing to answer). Over a WebSocket: /ws on
// the same port (RFC 6455, from websocket.mjs), where `subscribe` makes the server send three
// `tick` notifications by itself. Methods: subtract (by position or by name), sum, get_data,
// divide (an application error, -32000, with data), whoami (the Authorization header seen),
// update and notify_hello (notifications, kept), subscribe (WebSocket only).
import { createServer } from "node:http";
import { attach } from "./websocket.mjs";

const err = (id, code, message, data) => ({ jsonrpc: "2.0", error: data === undefined ? { code, message } : { code, message, data }, id });

export async function start({ port }) {
    const seen = { batches: 0, notifications: [], calls: [], ws: 0, subscribed: 0 };

    // One request object: an answer, or undefined for a notification.
    function handle(req, ctx) {
        const isObj = req && typeof req === "object" && !Array.isArray(req);
        if (!isObj || req.jsonrpc !== "2.0" || typeof req.method !== "string" || ("params" in req && (typeof req.params !== "object" || req.params === null))
            || ("id" in req && !(typeof req.id === "string" || typeof req.id === "number" || req.id === null))) {
            return err(isObj && (typeof req.id === "string" || typeof req.id === "number") ? req.id : null, -32600, "Invalid Request");
        }
        const notification = !("id" in req);
        const p = req.params ?? [];
        const named = !Array.isArray(p);
        const arg = (i, name) => (named ? p[name] : p[i]);
        let result, error;
        const num = (x) => typeof x === "number";
        switch (req.method) {
            case "subtract": {
                const a = arg(0, "minuend"), b = arg(1, "subtrahend");
                if (!num(a) || !num(b)) error = [-32602, "Invalid params", "subtract takes two numbers: minuend, subtrahend"];
                else result = a - b;
                break;
            }
            case "sum":
                if (named || !p.every(num)) error = [-32602, "Invalid params", "sum takes numbers by position"];
                else result = p.reduce((a, b) => a + b, 0);
                break;
            case "get_data": result = ["hello", 5]; break;
            case "divide": {
                const a = arg(0, "a"), b = arg(1, "b");
                if (!num(a) || !num(b)) error = [-32602, "Invalid params"];
                else if (b === 0) error = [-32000, "Division by zero", { dividend: a }];
                else result = a / b;
                break;
            }
            case "whoami": result = { authorization: ctx.authorization ?? null, transport: ctx.transport }; break;
            case "update": case "notify_hello": case "notify_sum": seen.notifications.push({ method: req.method, params: p }); result = null; break;
            case "subscribe":
                if (!ctx.conn) { error = [-32601, "Method not found", "subscribe is for WebSocket clients"]; break; }
                result = `sub-${++seen.subscribed}`;
                for (let n = 1; n <= 3; n++) setTimeout(() => ctx.conn.send(JSON.stringify({ jsonrpc: "2.0", method: "tick", params: { subscription: result, topic: arg(0, "topic"), n } })), 30 * n);
                break;
            default: error = [-32601, "Method not found"];
        }
        seen.calls.push({ method: req.method, notification, transport: ctx.transport });
        if (notification) return undefined;
        return error ? err(req.id, ...error) : { jsonrpc: "2.0", result, id: req.id };
    }

    // A whole message: the text to answer, or null for nothing.
    function message(text, ctx) {
        let v;
        try { v = JSON.parse(text); } catch { return JSON.stringify(err(null, -32700, "Parse error")); }
        if (Array.isArray(v)) {
            if (v.length === 0) return JSON.stringify(err(null, -32600, "Invalid Request"));
            seen.batches++;
            const out = v.map((r) => handle(r, ctx)).filter((r) => r !== undefined);
            return out.length ? JSON.stringify(out) : null;
        }
        const r = handle(v, ctx);
        return r === undefined ? null : JSON.stringify(r);
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            if (req.url !== "/rpc") { res.writeHead(404); res.end(); return; }
            if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); res.end(); return; }
            if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) { res.writeHead(415); res.end("JSON-RPC over HTTP is application/json"); return; }
            const out = message(body, { transport: "http", authorization: req.headers.authorization });
            if (out === null) { res.writeHead(204); res.end(); return; }
            res.writeHead(200, { "content-type": "application/json" });
            res.end(out);
        });
    });
    attach(server, {
        onConnect(conn, req) {
            seen.ws++;
            conn.on((e) => {
                if (e.kind !== "text") return;
                const out = message(e.text, { transport: "ws", conn, authorization: req.headers.authorization });
                if (out !== null) conn.send(out);
            });
        },
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { JSONRPC_URL: `http://127.0.0.1:${port}/rpc`, JSONRPC_WS: `ws://127.0.0.1:${port}/ws` },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!seen.calls.some((c) => c.transport === "http" && c.method === "subtract")) return "the JSON-RPC server got no subtract call over HTTP";
            if (!seen.batches) return "the JSON-RPC server got no batch";
            if (!seen.notifications.length) return "the JSON-RPC server got no notification";
            if (!seen.ws || !seen.subscribed) return "the JSON-RPC server got no subscription over a WebSocket";
            return null;
        },
        seen,
    };
}
