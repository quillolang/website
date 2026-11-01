// A Gemini API for the gemini plugin's test, written from Google's generativelanguage v1beta
// reference: x-goog-api-key, POST /v1beta/models/{model}:generateContent (contents required, roles
// user and model, systemInstruction, tools.functionDeclarations, functionResponse parts answering
// a model's functionCall), :streamGenerateContent?alt=sse (each event a partial
// GenerateContentResponse), :embedContent (model in the body must match the path),
// :batchEmbedContents (at most 100), :countTokens (either `contents` or a generateContentRequest,
// never both), GET /v1beta/models with pageToken. Errors are the documented
// { error: { code, message, status, details } }; a 429 has a RetryInfo with retryDelay.
//
//   start({ port }) -> { env: { GEMINI_API_KEY, GEMINI_API_URL, GEMINI_MODEL }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk-test-gemini", MODEL = "gemini-test", EMBED = "gemini-embedding-001";

export async function start({ port }) {
    const stats = { generated: 0, stream: 0, embedded: 0, batches: 0, counted: 0, limited: 0, fnAnswers: 0, keyInUrl: 0 };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const fail = (code, status, message, details) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { code, message, status, ...(details ? { details } : {}) } })); };
            const ok = (v) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const url = new URL(req.url, "http://x");
            if (url.searchParams.has("key")) stats.keyInUrl++;
            if (req.headers["x-goog-api-key"] !== KEY) return fail(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }]);
            if (req.method === "GET" && url.pathname === "/v1beta/models") {
                const page = url.searchParams.get("pageToken");
                const models = page === "p2" ? [{ name: `models/${EMBED}`, supportedGenerationMethods: ["embedContent"] }] : [{ name: `models/${MODEL}`, inputTokenLimit: 1000000, supportedGenerationMethods: ["generateContent"] }];
                return ok(page ? { models } : { models, nextPageToken: "p2" });
            }
            const m = /^\/v1beta\/models\/([^:]+):(\w+)$/.exec(url.pathname);
            if (req.method !== "POST" || !m) return fail(404, "NOT_FOUND", `Unknown path ${url.pathname}`);
            let p;
            try { p = JSON.parse(body); } catch { return fail(400, "INVALID_ARGUMENT", "Invalid JSON payload received."); }
            const [, model, verb] = m;
            if (verb === "embedContent" || verb === "batchEmbedContents") {
                if (model !== EMBED) return fail(404, "NOT_FOUND", `models/${model} is not found`);
                const one = (r) => {
                    if (r.model !== `models/${EMBED}`) return null;
                    const t = r.content.parts[0].text;
                    return { values: Array.from({ length: r.outputDimensionality ?? 3072 }, (_, i) => t.length + i / 10) };
                };
                if (verb === "embedContent") { const e = one(p); if (!e) return fail(400, "INVALID_ARGUMENT", "model mismatch"); stats.embedded++; return ok({ embedding: e }); }
                if (!Array.isArray(p.requests) || p.requests.length > 100) return fail(400, "INVALID_ARGUMENT", "at most 100 requests can be in one batch");
                stats.batches++;
                return ok({ embeddings: p.requests.map(one) });
            }
            if (model !== MODEL) return fail(404, "NOT_FOUND", `models/${model} is not found for API version v1beta, or is not supported for generateContent.`);
            if (verb === "countTokens") {
                if (p.contents && p.generateContentRequest) return fail(400, "INVALID_ARGUMENT", "contents and generateContentRequest are mutually exclusive");
                const g = p.generateContentRequest;
                if (g && g.model !== `models/${MODEL}`) return fail(400, "INVALID_ARGUMENT", "generateContentRequest.model is required");
                stats.counted++;
                return ok({ totalTokens: Math.ceil(JSON.stringify(g ?? p).length / 4) });
            }
            if (!Array.isArray(p.contents) || !p.contents.length) return fail(400, "INVALID_ARGUMENT", "* GenerateContentRequest.contents: contents is not specified");
            for (const c of p.contents) if (!["user", "model"].includes(c.role)) return fail(400, "INVALID_ARGUMENT", `Please use a valid role: user, model.`);
            if (p.system) return fail(400, "INVALID_ARGUMENT", 'Invalid JSON payload received. Unknown name "system": Cannot find field.');
            const last = p.contents.at(-1), text = last.parts.map((x) => x.text ?? "").join("");
            const answered = last.parts.find((x) => x.functionResponse);
            if (answered) {
                const prior = p.contents.at(-2)?.parts?.find((x) => x.functionCall);
                if (prior?.functionCall.name !== answered.functionResponse.name) return fail(400, "INVALID_ARGUMENT", "function response parts must match the function call parts of the previous turn");
                if (prior.thoughtSignature !== "sig-abc") return fail(400, "INVALID_ARGUMENT", "Function call is missing a thought_signature");
                stats.fnAnswers++;
            }
            if (text === "slow down" && !stats.limited++) return fail(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota.", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1s" }]);
            const usageMetadata = { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 };
            if (text === "blocked prompt") return ok({ promptFeedback: { blockReason: "SAFETY", safetyRatings: [] }, usageMetadata });
            let parts = [{ text: "Seven" }], finishReason = "STOP";
            if (text === "unsafe answer") { parts = []; finishReason = "SAFETY"; }
            if (text === "too long") { parts = [{ text: "Once" }]; finishReason = "MAX_TOKENS"; }
            if (answered) parts = [{ text: `Noted ${JSON.stringify(answered.functionResponse.response)}` }];
            else if (p.tools?.[0]?.functionDeclarations?.length) parts = [{ thoughtSignature: "sig-abc", functionCall: { name: "get_weather", args: { city: "Paris" } } }];
            const candidate = (ps, fin) => ({ content: { role: "model", parts: ps }, ...(fin ? { finishReason: fin } : {}), index: 0, safetyRatings: [] });
            if (verb === "generateContent") { stats.generated++; return ok({ candidates: [candidate(parts, finishReason)], usageMetadata, modelVersion: MODEL }); }
            if (verb === "streamGenerateContent") {
                if (url.searchParams.get("alt") !== "sse") return fail(400, "INVALID_ARGUMENT", "this test wants alt=sse");
                stats.stream++;
                res.writeHead(200, { "content-type": "text/event-stream" });
                const ev = (v) => res.write(`data: ${JSON.stringify(v)}\r\n\r\n`);
                ev({ candidates: [candidate([{ text: "An old" }])], modelVersion: MODEL });
                ev({ candidates: [candidate([{ text: " pond" }])], modelVersion: MODEL });
                ev({ candidates: [candidate([{ text: "." }], "STOP")], usageMetadata, modelVersion: MODEL });
                return res.end();
            }
            return fail(404, "NOT_FOUND", `Unknown method ${verb}`);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GEMINI_API_KEY: KEY, GEMINI_API_URL: `http://127.0.0.1:${port}/v1beta`, GEMINI_MODEL: MODEL },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.generated || !stats.stream || !stats.embedded || !stats.batches || !stats.counted) return `the Gemini stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not retry a 429";
            if (!stats.fnAnswers) return "no function response reached the stand-in";
            if (stats.keyInUrl) return "the API key went in the URL";
            return null;
        },
    };
}
