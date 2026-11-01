// An Ollama server for the ollama plugin's test, written from Ollama's docs/api.md: POST /api/generate
// and /api/chat as NDJSON streams (a final `done: true` line with done_reason, total_duration,
// load_duration, prompt_eval_count, eval_count, eval_duration in nanoseconds), `format`, `options`,
// `tools` and tool_calls; POST /api/embed; GET /api/tags, /api/ps, /api/version; POST /api/show,
// POST /api/pull (status lines ending in "success", or a line with `error`). A model that is not
// installed is a 404 with { error: "model 'x' not found" }. Sampling settings outside `options` are
// ignored by the real server, so here they are an error.
//
//   start({ port }) -> { env: { OLLAMA_HOST, OLLAMA_MODEL }, close(), check() }
import { createServer } from "node:http";

const MODELS = {
    "llama3.2:latest": { family: "llama", size: 2019393189, quant: "Q4_K_M", params: "3.2B" },
    "nomic-embed-text:latest": { family: "nomic-bert", size: 274302450, quant: "F16", params: "137M" },
};

export async function start({ port }) {
    const stats = { generate: 0, chat: 0, embed: 0, tags: 0, pulls: 0, toolTurns: 0 };
    const known = (m) => MODELS[m.includes(":") ? m : `${m}:latest`];
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const fail = (code, error) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify({ error })); };
            const ok = (v) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            if (req.method === "GET" && req.url === "/api/version") return ok({ version: "0.6.8" });
            if (req.method === "GET" && req.url === "/api/tags") {
                stats.tags++;
                return ok({ models: Object.entries(MODELS).map(([name, m]) => ({ name, model: name, modified_at: "2026-10-01T10:00:00Z", size: m.size, digest: "a80c4f17acd5", details: { format: "gguf", family: m.family, families: [m.family], parameter_size: m.params, quantization_level: m.quant } })) });
            }
            if (req.method === "GET" && req.url === "/api/ps") return ok({ models: [{ name: "llama3.2:latest", size: 3000000000, size_vram: 3000000000, expires_at: "2026-11-01T10:05:00Z" }] });
            let p;
            try { p = body ? JSON.parse(body) : {}; } catch { return fail(400, "invalid JSON"); }
            if (req.method === "POST" && req.url === "/api/pull") {
                stats.pulls++;
                if (p.model === "no-such-model") { res.writeHead(200, { "content-type": "application/x-ndjson" }); res.write('{"status":"pulling manifest"}\n{"error":"pull model manifest: file does not exist"}\n'); return res.end(); }
                res.writeHead(200, { "content-type": "application/x-ndjson" });
                for (const s of ["pulling manifest", "pulling 2af3b81862c6", "pulling 2af3b81862c6", "verifying sha256 digest", "writing manifest", "success"]) res.write(JSON.stringify({ status: s }) + "\n");
                return res.end();
            }
            if (!p.model) return fail(400, "model is required");
            if (!known(p.model)) return fail(404, `model '${p.model}' not found`);
            if (req.url === "/api/show") {
                const m = known(p.model);
                return ok({ license: "long text", template: "{{ .Prompt }}", parameters: "stop \"<|eot_id|>\"", details: { family: m.family, parameter_size: m.params }, capabilities: ["completion", "tools"], model_info: { [`${m.family}.context_length`]: 131072 } });
            }
            if (req.url === "/api/embed") {
                stats.embed++;
                const input = Array.isArray(p.input) ? p.input : [p.input];
                return ok({ model: p.model, embeddings: input.map((t) => [t.length / 10, 0.5, -0.25]), total_duration: 14143917, prompt_eval_count: 4 });
            }
            for (const k of ["temperature", "seed", "num_predict", "top_k", "top_p"]) if (k in p) return fail(400, `${k} must go under options`);
            const final = { done: true, done_reason: "stop", total_duration: 2_000_000_000, load_duration: 500_000_000, prompt_eval_count: 11, prompt_eval_duration: 100_000_000, eval_count: 40, eval_duration: 800_000_000 };
            const stream = (lines) => {
                res.writeHead(200, { "content-type": "application/x-ndjson" });
                for (const l of lines) res.write(JSON.stringify(l) + "\n");
                res.end();
            };
            const created_at = "2026-11-01T10:00:00Z";
            if (req.url === "/api/generate") {
                stats.generate++;
                if (typeof p.prompt !== "string") return fail(400, "prompt is required");
                const words = p.format?.type === "object" ? ['{"city"', ':"Oslo"}'] : p.options?.seed === 7 ? ["The sky", " scatters", " light"] : ["Hello"];
                return stream([...words.map((response) => ({ model: p.model, created_at, response, done: false })), { model: p.model, created_at, response: "", ...final }]);
            }
            if (req.url === "/api/chat") {
                stats.chat++;
                if (!Array.isArray(p.messages)) return fail(400, "messages is required");
                const last = p.messages.at(-1);
                if (last.content === "fail part way") { res.writeHead(200, { "content-type": "application/x-ndjson" }); res.write(JSON.stringify({ model: p.model, created_at, message: { role: "assistant", content: "Sev" }, done: false }) + "\n"); res.write('{"error":"llama runner process has terminated: signal: killed"}\n'); return res.end(); }
                const chunk = (message, extra = { done: false }) => ({ model: p.model, created_at, message: { role: "assistant", ...message }, ...extra });
                if (last.role === "tool") { stats.toolTurns++; return stream([chunk({ content: `It is ${last.content}` }), chunk({ content: "" }, final)]); }
                if (p.tools?.length) return stream([chunk({ content: "", tool_calls: [{ function: { name: p.tools[0].function.name, arguments: { city: "Paris" } } }] }), chunk({ content: "" }, final)]);
                const asked = p.messages.filter((m) => m.role === "assistant").length;
                return stream([chunk({ content: "Sev" }), chunk({ content: asked ? "en again" : "en" }), chunk({ content: "" }, final)]);
            }
            return fail(404, "404 page not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { OLLAMA_HOST: `127.0.0.1:${port}`, OLLAMA_MODEL: "llama3.2" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            for (const k of ["generate", "chat", "embed", "tags", "pulls", "toolTurns"]) if (!stats[k]) return `the Ollama stand-in saw no ${k}`;
            return null;
        },
    };
}
