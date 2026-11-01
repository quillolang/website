// A Claude Messages API for the anthropic plugin's test, written from Anthropic's API reference and
// its error, streaming, prompt caching and token counting pages. Each request is checked as the API
// checks it: `x-api-key`, `anthropic-version` (2026-10-21 here), JSON body; `model`, `max_tokens`
// and `messages` required, roles alternating and starting with a user; `temperature`, `top_p` and
// `top_k` refused (400 on 2026-10-21); `tool_choice` any or tool refused on claude-opus-5-5; every
// tool_use answered by a tool_result in the next user message; a `fallbacks` value needing its beta
// header. Errors have the documented shape { type: "error", error: { type, message }, request_id },
// streams the documented event order, and usage counts a cache as the API does (written the first
// time a prefix is seen, read after). The text of the last user message picks the behaviour.
//
//   start({ port }) -> { env: { ANTHROPIC_API_KEY, ANTHROPIC_API_URL }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk-test-anthropic";
const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];

export async function start({ port }) {
    const stats = { ok: 0, stream: 0, counted: 0, retried429: 0, retried529: 0, toolResults: 0, cacheRead: 0, fallbacksSeen: 0 };
    const seenPrefix = new Set();
    let n = 0;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const id = `req_${String(++n).padStart(6, "0")}`;
            const fail = (code, type, message, headers = {}) => {
                res.writeHead(code, { "content-type": "application/json", "request-id": id, ...headers });
                res.end(JSON.stringify({ type: "error", error: { type, message }, request_id: id }));
            };
            const url = new URL(req.url, "http://x");
            if (req.headers["x-api-key"] !== KEY) return fail(401, "authentication_error", "invalid x-api-key");
            if (!req.headers["anthropic-version"]) return fail(400, "invalid_request_error", "anthropic-version: header is required");
            if (req.headers["anthropic-version"] !== "2026-10-21") return fail(400, "invalid_request_error", "this test expects anthropic-version 2026-10-21");
            if (req.method === "GET" && url.pathname === "/v1/models") {
                const after = url.searchParams.get("after_id");
                const data = (after ? MODELS.slice(MODELS.indexOf(after) + 1, MODELS.indexOf(after) + 2) : MODELS.slice(0, 2)).map((m) => ({ id: m, display_name: m, type: "model", max_input_tokens: 1000000, max_tokens: 128000 }));
                res.writeHead(200, { "content-type": "application/json" });
                const last = data.at(-1)?.id ?? null;
                return res.end(JSON.stringify({ data, has_more: last !== MODELS.at(-1), first_id: data[0]?.id ?? null, last_id: last }));
            }
            let p;
            try { p = JSON.parse(body); } catch { return fail(400, "invalid_request_error", "the body is not valid JSON"); }
            const counting = url.pathname === "/v1/messages/count_tokens";
            if (req.method !== "POST" || (url.pathname !== "/v1/messages" && !counting)) return fail(404, "not_found_error", `Not found: ${url.pathname}`);
            for (const k of ["temperature", "top_p", "top_k"]) if (k in p) return fail(400, "invalid_request_error", `${k}: Extra inputs are not permitted`);
            if (typeof p.model !== "string") return fail(400, "invalid_request_error", "model: Field required");
            if (!counting && !Number.isInteger(p.max_tokens)) return fail(400, "invalid_request_error", "max_tokens: Field required");
            if (counting && "max_tokens" in p) return fail(400, "invalid_request_error", "max_tokens: Extra inputs are not permitted");
            if (!Array.isArray(p.messages) || !p.messages.length) return fail(400, "invalid_request_error", "messages: at least one message is required");
            if (!MODELS.includes(p.model)) return fail(404, "not_found_error", `model: ${p.model}`);
            if (p.messages[0].role !== "user") return fail(400, "invalid_request_error", "messages: the first message must use the user role");
            for (let i = 1; i < p.messages.length; i++) if (p.messages[i].role === p.messages[i - 1].role) return fail(400, "invalid_request_error", 'messages: roles must alternate between "user" and "assistant"');
            const betas = (req.headers["anthropic-beta"] ?? "").split(",");
            if (p.fallbacks === "default") { if (!betas.includes("server-side-fallback-2026-07-01")) return fail(400, "invalid_request_error", "fallbacks: requires the beta header server-side-fallback-2026-07-01"); stats.fallbacksSeen++; }
            if (Array.isArray(p.fallbacks) && !betas.includes("server-side-fallback-2026-06-01")) return fail(400, "invalid_request_error", "fallbacks: requires the beta header server-side-fallback-2026-06-01");
            if (["any", "tool"].includes(p.tool_choice?.type) && p.model === "claude-opus-5-5") return fail(400, "invalid_request_error", 'tool_choice: type "tool" and "any" are not supported for this model.');
            for (const t of p.tools ?? []) if (!t.type && (!t.name || t.input_schema?.type !== "object")) return fail(400, "invalid_request_error", "tools: each tool needs a name and an input_schema of type object");
            // Every tool_use is answered in the next message.
            for (let i = 0; i < p.messages.length; i++) {
                const m = p.messages[i];
                if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
                const uses = m.content.filter((b) => b.type === "tool_use").map((b) => b.id);
                const next = p.messages[i + 1]?.content;
                const answered = Array.isArray(next) ? next.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : [];
                const missing = uses.filter((u) => !answered.includes(u));
                if (missing.length) return fail(400, "invalid_request_error", `messages.${i}: tool_use ids were found without tool_result blocks immediately after: ${missing.join(", ")}`);
                stats.toolResults += answered.length;
            }
            const last = p.messages.at(-1);
            const text = typeof last.content === "string" ? last.content : (last.content.filter((b) => b.type === "text").map((b) => b.text).join(" "));
            const words = JSON.stringify([p.system, p.messages, p.tools]).length;
            const size = Math.ceil(words / 4);
            if (counting) { stats.counted++; res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ input_tokens: size })); }
            if (text.includes("slow down") && !stats.retried429++) return fail(429, "rate_limit_error", "This request would exceed your rate limit", { "retry-after": "1" });
            if (text.includes("busy right now") && !stats.retried529++) return fail(529, "overloaded_error", "Overloaded");
            if (text.includes("busy always")) return fail(529, "overloaded_error", "Overloaded");

            const tool = p.tools?.find((t) => t.name === "get_weather");
            const hadResult = Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result");
            let content, stop = "end_turn", stop_details = null;
            if (text.includes("refuse-me")) { content = []; stop = "refusal"; stop_details = { type: "refusal", category: "cyber", explanation: "This request looks like it could cause harm." }; }
            else if (tool && !hadResult) { content = [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "toolu_01A09q90qw90", name: "get_weather", input: { city: "Paris" } }]; stop = "tool_use"; }
            else if (hadResult) { const r = last.content.find((b) => b.type === "tool_result"); content = [{ type: "text", text: `It says: ${r.content}` }]; }
            else content = [{ type: "text", text: `Seven (${text.slice(0, 30)})` }];

            // A cache entry is keyed by the prefix up to the breakpoint.
            const marked = JSON.stringify(p).includes('"cache_control"');
            let cache_creation_input_tokens = 0, cache_read_input_tokens = 0, input_tokens = size;
            if (marked) {
                const key = JSON.stringify([p.model, p.tools, p.system]);
                if (seenPrefix.has(key)) { cache_read_input_tokens = size - 10; stats.cacheRead++; } else { cache_creation_input_tokens = size - 10; seenPrefix.add(key); }
                input_tokens = 10;
            }
            const usage = { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens: 12 };
            const msg = { id: `msg_${id}`, type: "message", role: "assistant", model: p.model, content, stop_reason: stop, stop_sequence: null, stop_details, usage };
            stats.ok++;
            if (!p.stream) { res.writeHead(200, { "content-type": "application/json", "request-id": id }); return res.end(JSON.stringify(msg)); }

            stats.stream++;
            res.writeHead(200, { "content-type": "text/event-stream", "request-id": id });
            const sse = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
            sse("message_start", { message: { ...msg, content: [], stop_reason: null, stop_details: null, usage: { ...usage, output_tokens: 1 } } });
            sse("ping", {});
            content.forEach((b, index) => {
                sse("content_block_start", { index, content_block: b.type === "text" ? { type: "text", text: "" } : { ...b, input: {} } });
                if (b.type === "text") for (const piece of b.text.match(/.{1,5}/gs) ?? []) sse("content_block_delta", { index, delta: { type: "text_delta", text: piece } });
                else { const j = JSON.stringify(b.input); sse("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: "" } }); sse("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: j.slice(0, 4) } }); sse("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: j.slice(4) } }); }
                sse("content_block_stop", { index });
            });
            sse("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 12 } });
            sse("message_stop", {});
            res.end();
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { ANTHROPIC_API_KEY: KEY, ANTHROPIC_API_URL: `http://127.0.0.1:${port}` },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.ok) return "the Claude stand-in answered no message";
            if (!stats.stream) return "the Claude stand-in got no streaming request";
            if (!stats.counted) return "the Claude stand-in counted no tokens";
            if (stats.retried429 < 2 || stats.retried529 < 2) return `the plugin did not retry: 429 seen ${stats.retried429}, 529 seen ${stats.retried529}`;
            if (!stats.toolResults) return "the Claude stand-in got no tool result";
            if (!stats.cacheRead) return "no request was served from the cache";
            if (!stats.fallbacksSeen) return "no request asked for the default fallback";
            return null;
        },
    };
}
