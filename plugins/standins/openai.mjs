// An OpenAI API for the openai plugin's test, written from OpenAI's API reference: Bearer auth,
// POST /v1/chat/completions (model and messages required, unknown model 404 model_not_found, tool
// messages must answer a preceding tool_calls), streams as `data:` chunks ending in [DONE] with a
// usage chunk under stream_options.include_usage, tool calls in pieces by index, POST /v1/embeddings
// (order shuffled on purpose: `index` says which is which; `dimensions`), POST /v1/responses (output
// items, previous_response_id, the response.* stream events), GET /v1/models. A 429 carries
// retry-after-ms; insufficient_quota is a 429 that retrying cannot help. Errors are the documented
// { error: { message, type, param, code } }.
//
//   start({ port }) -> { env: { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk-test-openai", MODEL = "test-model-1";

export async function start({ port }) {
    const stats = { chat: 0, streams: 0, embeddings: 0, responses: 0, limited: 0, quota: 0, toolAnswers: 0, followUp: 0 };
    const stored = new Map();
    let n = 0;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const fail = (code, message, type, ecode, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify({ error: { message, type, param: null, code: ecode } })); };
            const ok = (v) => { res.writeHead(200, { "content-type": "application/json", "x-ratelimit-remaining-requests": "99" }); res.end(JSON.stringify(v)); };
            if (req.headers.authorization !== `Bearer ${KEY}`) return fail(401, "Incorrect API key provided.", "invalid_request_error", "invalid_api_key");
            const url = new URL(req.url, "http://x");
            if (req.method === "GET" && url.pathname === "/v1/models") return ok({ object: "list", data: [{ id: MODEL, object: "model" }, { id: "test-embed", object: "model" }] });
            let p;
            try { p = JSON.parse(body); } catch { return fail(400, "We could not parse the JSON body", "invalid_request_error", null); }
            const model = p.model;
            if (url.pathname === "/v1/embeddings") {
                if (!p.input) return fail(400, "'input' is a required property", "invalid_request_error", null);
                stats.embeddings++;
                const input = Array.isArray(p.input) ? p.input : [p.input];
                const data = input.map((t, index) => ({ object: "embedding", index, embedding: Array.from({ length: p.dimensions ?? 3 }, (_, i) => t.length + i / 10) })).reverse();
                return ok({ object: "list", data, model, usage: { prompt_tokens: 4, total_tokens: 4 } });
            }
            if (!model) return fail(400, "you must provide a model parameter", "invalid_request_error", null);
            if (model !== MODEL) return fail(404, `The model \`${model}\` does not exist`, "invalid_request_error", "model_not_found");
            if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
                if (!Array.isArray(p.messages) || !p.messages.length) return fail(400, "'messages' must be a non-empty array", "invalid_request_error", null);
                for (const [i, m] of p.messages.entries()) {
                    if (m.role !== "tool") continue;
                    const prior = p.messages[i - 1];
                    if (!(prior?.tool_calls?.some((t) => t.id === m.tool_call_id) || prior?.role === "tool")) return fail(400, "messages with role 'tool' must be a response to a preceeding message with 'tool_calls'.", "invalid_request_error", null);
                    stats.toolAnswers++;
                }
                const last = p.messages.at(-1);
                if (last.content === "slow down" && !stats.limited++) return fail(429, "Rate limit reached", "tokens", "rate_limit_exceeded", { "retry-after-ms": "200" });
                if (last.content === "out of quota") { stats.quota++; return fail(429, "You exceeded your current quota", "insufficient_quota", "insufficient_quota"); }
                let message, finish = "stop";
                const tool = p.tools?.[0]?.function;
                if (last.role === "tool") message = { role: "assistant", content: `Noted: ${last.content}`, refusal: null };
                else if (tool) { message = { role: "assistant", content: null, refusal: null, tool_calls: [{ id: "call_abc123", type: "function", function: { name: tool.name, arguments: '{"city":"Paris"}' } }] }; finish = "tool_calls"; }
                else if (last.content === "too long") { message = { role: "assistant", content: "Once upon", refusal: null }; finish = "length"; }
                else message = { role: "assistant", content: "Seven", refusal: null };
                const usage = { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 };
                const id = `chatcmpl-${++n}`, created = 1790000000;
                stats.chat++;
                if (!p.stream) return ok({ id, object: "chat.completion", created, model, choices: [{ index: 0, message, logprobs: null, finish_reason: finish }], usage });
                stats.streams++;
                res.writeHead(200, { "content-type": "text/event-stream" });
                const chunk = (delta, finish_reason = null, extra = {}) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason }], usage: null, ...extra })}\n\n`);
                chunk({ role: "assistant", content: "" });
                if (message.tool_calls) {
                    const t = message.tool_calls[0];
                    chunk({ tool_calls: [{ index: 0, id: t.id, type: "function", function: { name: t.function.name, arguments: "" } }] });
                    chunk({ tool_calls: [{ index: 0, function: { arguments: t.function.arguments.slice(0, 6) } }] });
                    chunk({ tool_calls: [{ index: 0, function: { arguments: t.function.arguments.slice(6) } }] });
                } else for (const w of ["An old", " silent", " pond"]) chunk({ content: w });
                chunk({}, finish);
                if (p.stream_options?.include_usage) res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [], usage })}\n\n`);
                res.write("data: [DONE]\n\n");
                return res.end();
            }
            if (req.method === "POST" && url.pathname === "/v1/responses") {
                stats.responses++;
                const id = `resp_${++n}`;
                const usage = { input_tokens: 5, output_tokens: 2, total_tokens: 7 };
                const base = { id, object: "response", created_at: 1790000000, model, error: null, incomplete_details: null, usage };
                if (p.previous_response_id && !stored.has(p.previous_response_id)) return fail(404, `Previous response with id '${p.previous_response_id}' not found.`, "invalid_request_error", "previous_response_not_found");
                if (p.input === "fail please") return ok({ ...base, status: "failed", error: { code: "server_error", message: "The model failed." }, output: [] });
                let output;
                if (p.tools?.some((t) => t.type === "function") && !p.previous_response_id) output = [{ id: "fc_1", type: "function_call", status: "completed", call_id: "call_xyz", name: "get_weather", arguments: '{"city":"Paris"}' }];
                else {
                    const given = Array.isArray(p.input) ? p.input.find((i) => i.type === "function_call_output") : null;
                    if (given) { if (given.call_id !== "call_xyz") return fail(400, "No tool call found for function call output", "invalid_request_error", null); stats.followUp++; }
                    output = [{ id: "msg_1", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: given ? `It is ${given.output}` : "Hello", annotations: [] }] }];
                }
                const r = { ...base, status: "completed", output };
                stored.set(id, r);
                if (!p.stream) return ok(r);
                stats.streams++;
                res.writeHead(200, { "content-type": "text/event-stream" });
                const ev = (type, v) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...v })}\n\n`);
                ev("response.created", { response: { ...r, status: "in_progress", output: [] } });
                ev("response.output_text.delta", { item_id: "msg_1", output_index: 0, content_index: 0, delta: "Hello" });
                ev("response.completed", { response: r });
                return res.end();
            }
            return fail(404, `Invalid URL (${req.method} ${url.pathname})`, "invalid_request_error", null);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { OPENAI_API_KEY: KEY, OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`, OPENAI_MODEL: MODEL },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.chat || !stats.streams || !stats.embeddings || !stats.responses) return `the OpenAI stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not retry a 429";
            if (stats.quota !== 1) return `insufficient_quota was tried ${stats.quota} times; retrying cannot help`;
            if (!stats.toolAnswers || !stats.followUp) return "no tool result reached the stand-in";
            return null;
        },
    };
}
