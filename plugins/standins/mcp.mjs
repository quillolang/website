// An MCP server over streamable HTTP for the mcp plugin's test, written from the Model Context
// Protocol specification (basic/transports, lifecycle; server/tools, resources, prompts; utilities
// pagination). POST only, Accept must offer both application/json and text/event-stream; initialize
// gives an Mcp-Session-Id, every later request must carry it and MCP-Protocol-Version (400 when the
// version is wrong, 404 for an ended session); a request before notifications/initialized is an
// error; notifications get 202 with no body; lists are paged by nextCursor; `slow_add` answers as an
// event stream with a progress note first; DELETE ends a session. Unknown tools are JSON-RPC errors
// (-32602), a failing tool is a result with isError, and a missing resource is -32002. Bearer token
// required.
//
//   start({ port }) -> { env: { MCP_URL, MCP_TOKEN }, close(), check() }
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const TOKEN = "qk-test-mcp", VERSION = "2025-11-25";

export async function start({ port }) {
    const sessions = new Map();
    const stats = { init: 0, ready: 0, calls: 0, streams: 0, pages: 0, deleted: 0, noSessionHeader: 0 };
    const TOOLS = ["add", "slow_add", "divide"].map((name) => ({ name, description: name, inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] } }));
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const http = (code, text = "") => { res.writeHead(code); res.end(text); };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401, { "www-authenticate": 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"' }); return res.end(); }
            const sid = req.headers["mcp-session-id"];
            if (req.method === "DELETE") { if (!sessions.has(sid)) return http(404); sessions.delete(sid); stats.deleted++; return http(204); }
            if (req.method !== "POST") return http(405);
            const accept = req.headers.accept ?? "";
            if (!accept.includes("application/json") || !accept.includes("text/event-stream")) return http(406, "Accept must offer application/json and text/event-stream");
            let m;
            try { m = JSON.parse(body); } catch { return http(400, "not JSON"); }
            const reply = (msg, headers = {}) => { res.writeHead(200, { "content-type": "application/json", ...headers }); res.end(JSON.stringify({ jsonrpc: "2.0", id: m.id, ...msg })); };
            const err = (code, message) => reply({ error: { code, message } });
            if (m.method === "initialize") {
                const p = m.params ?? {};
                if (!p.protocolVersion || !p.clientInfo?.name || !p.capabilities) return err(-32602, "initialize needs protocolVersion, capabilities and clientInfo");
                const id = randomUUID();
                sessions.set(id, { ready: false });
                stats.init++;
                return reply({ result: { protocolVersion: VERSION, capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} }, serverInfo: { name: "standin", version: "2.1.0" }, instructions: "Add things." } }, { "mcp-session-id": id });
            }
            if (!sid) { stats.noSessionHeader++; return http(400, "Mcp-Session-Id is required"); }
            const s = sessions.get(sid);
            if (!s) return http(404, "unknown session");
            if (req.headers["mcp-protocol-version"] !== VERSION) return http(400, `Unsupported MCP-Protocol-Version: ${req.headers["mcp-protocol-version"]}`);
            if (m.id === undefined) { if (m.method === "notifications/initialized") { s.ready = true; stats.ready++; } return http(202); }
            if (!s.ready) return err(-32600, "the client has not sent notifications/initialized");
            const p = m.params ?? {};
            const paged = (key, items) => { const at = Number(p.cursor ?? 0); if (p.cursor) stats.pages++; const page = items.slice(at, at + 2); const next = at + 2 < items.length ? String(at + 2) : undefined; reply({ result: { [key]: page, ...(next ? { nextCursor: next } : {}) } }); };
            switch (m.method) {
                case "ping": return reply({ result: {} });
                case "tools/list": return paged("tools", TOOLS);
                case "resources/list": return paged("resources", [{ uri: "file:///readme.md", name: "Read me", mimeType: "text/markdown" }]);
                case "resources/templates/list": return paged("resourceTemplates", [{ uriTemplate: "file:///{path}", name: "Files" }]);
                case "resources/read":
                    if (p.uri !== "file:///readme.md") return err(-32002, `Resource not found: ${p.uri}`);
                    return reply({ result: { contents: [{ uri: p.uri, mimeType: "text/markdown", text: "# Read me" }] } });
                case "prompts/list": return paged("prompts", [{ name: "greet", arguments: [{ name: "name", required: true }] }]);
                case "prompts/get": return reply({ result: { messages: [{ role: "user", content: { type: "text", text: `Say hello to ${p.arguments?.name}` } }] } });
                case "tools/call": {
                    stats.calls++;
                    const { name, arguments: a } = p;
                    if (!TOOLS.some((t) => t.name === name)) return err(-32602, `Unknown tool: ${name}`);
                    if (name === "divide") return reply({ result: { content: [{ type: "text", text: "cannot divide by zero" }], isError: true } });
                    const sum = a.a + a.b;
                    const result = { content: [{ type: "text", text: String(sum) }], structuredContent: { sum } };
                    if (name === "add") return reply({ result });
                    stats.streams++;
                    res.writeHead(200, { "content-type": "text/event-stream" });
                    res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: 1, progress: 1 } })}\n\n`);
                    res.write(`: a comment\n\nevent: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, result })}\n\n`);
                    return res.end();
                }
                default: return err(-32601, `Method not found: ${m.method}`);
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MCP_URL: `http://127.0.0.1:${port}/mcp`, MCP_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.init || stats.init !== stats.ready) return `initialized was not sent after each initialize: ${JSON.stringify(stats)}`;
            if (!stats.calls || !stats.streams || !stats.pages || !stats.deleted) return `the MCP stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.noSessionHeader) return "a request lacked Mcp-Session-Id";
            return null;
        },
    };
}
