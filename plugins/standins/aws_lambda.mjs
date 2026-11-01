// AWS Lambda's Invoke API for the aws_lambda plugin's test, written from the Lambda API Reference:
// POST /2015-03-31/functions/:name/invocations with Signature V4 (service lambda),
// X-Amz-Invocation-Type RequestResponse (200), Event (202, x-amzn-RequestId) or DryRun (204),
// X-Amz-Log-Type Tail (X-Amz-Log-Result, base64), X-Amz-Client-Context (base64 JSON), Qualifier,
// X-Amz-Function-Error: Unhandled with { errorMessage, errorType, stackTrace } as the payload, 404
// ResourceNotFoundException with x-amzn-ErrorType, 429 TooManyRequestsException with Retry-After;
// GET /2015-03-31/functions/ (MaxItems, Marker, NextMarker), GET /2015-03-31/functions/:name.
//
//   start({ port }) -> { env: { LAMBDA_API_URL, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY }, close(), check() }
import { createServer } from "node:http";
import { sigv4Check } from "./aws_dynamodb_sigv4.mjs";

const ACCESS = "AKIDQUILLOTEST", SECRET = "quillo-test-secret-for-the-standin", REGION = "eu-west-1";
const NAMES = ["render-invoice", "always-fails", "nightly-report", "busy-function", "just-deployed", "broken-deploy"];

export async function start({ port }) {
    const stats = { refused: 0, invokes: 0, events: 0, throttled: 0, pages: 0, tails: 0 };
    let busyLeft = 1, polls = 0;
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks);
            const send = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", "x-amzn-requestid": "11111111-2222-3333-4444-555555555555", ...headers }); res.end(body == null ? "" : JSON.stringify(body)); };
            const bad = sigv4Check(req, raw, { access: ACCESS, secret: SECRET, region: REGION, service: "lambda" });
            if (bad) { stats.refused++; return send(403, { Message: bad.message }, { "x-amzn-errortype": bad.code }); }
            const url = new URL(req.url, "http://x");
            if (req.method === "GET" && url.pathname === "/2015-03-31/functions/") {
                stats.pages++;
                const size = Number(url.searchParams.get("MaxItems") ?? 50), from = Number(url.searchParams.get("Marker") ?? 0);
                const list = NAMES.slice(from, from + size).map((n) => ({ FunctionName: n, Runtime: "nodejs22.x", MemorySize: 128 }));
                return send(200, from + size < NAMES.length ? { Functions: list, NextMarker: String(from + size) } : { Functions: list, NextMarker: null });
            }
            const notFound = (n) => send(404, { Message: `Function not found: arn:aws:lambda:${REGION}:123456789012:function:${n}`, Type: "User" }, { "x-amzn-errortype": "ResourceNotFoundException" });
            const m = url.pathname.match(/^\/2015-03-31\/functions\/([^/]+)(\/invocations)?$/);
            if (!m) return send(404, { Message: "Unknown path" });
            const name = decodeURIComponent(m[1]);
            if (!NAMES.includes(name)) return notFound(name);
            if (!m[2]) {
                polls++;
                if (name === "broken-deploy") return send(200, { Configuration: { FunctionName: name, State: "Failed", StateReason: "The role is not allowed to write logs", StateReasonCode: "InvalidConfiguration" } });
                return send(200, { Configuration: { FunctionName: name, State: polls < 2 ? "Pending" : "Active", LastUpdateStatus: "Successful" } });
            }
            const kind = req.headers["x-amz-invocation-type"] ?? "RequestResponse";
            if (kind === "DryRun") return send(204);
            if (kind === "Event") { stats.events++; return send(202); }
            if (name === "busy-function" && busyLeft-- > 0) { stats.throttled++; return send(429, { Reason: "ReservedFunctionConcurrentInvocationLimitExceeded", message: "Rate Exceeded." }, { "x-amzn-errortype": "TooManyRequestsException", "retry-after": "1" }); }
            stats.invokes++;
            let event;
            try { event = JSON.parse(raw.toString()); } catch { return send(400, { Message: "Could not parse request body into json" }, { "x-amzn-errortype": "InvalidRequestContentException" }); }
            const heads = { "x-amz-executed-version": url.searchParams.get("Qualifier") ? "7" : "$LATEST" };
            if (req.headers["x-amz-log-type"] === "Tail") {
                stats.tails++;
                const log = `START RequestId: 11111111-2222-3333-4444-555555555555 Version: $LATEST\nrendering order ${event.order}\nEND RequestId: 11111111-2222-3333-4444-555555555555\nREPORT RequestId: 11111111-2222-3333-4444-555555555555\tDuration: 12.34 ms\tBilled Duration: 13 ms\tMemory Size: 128 MB\tMax Memory Used: 64 MB\tInit Duration: 150.25 ms\t\n`;
                heads["x-amz-log-result"] = Buffer.from(log).toString("base64");
            }
            if (name === "always-fails") return send(200, { errorMessage: "No such customer", errorType: "CustomerError", stackTrace: ["at handler (index.js:4:9)"] }, { ...heads, "x-amz-function-error": "Unhandled" });
            if (name === "busy-function") return send(200, { done: true }, heads);
            const ctx = req.headers["x-amz-client-context"] ? JSON.parse(Buffer.from(req.headers["x-amz-client-context"], "base64").toString()) : null;
            send(200, { url: `https://files.example.com/invoice-${event.order}.pdf`, pages: event.lines + 1, tenant: ctx?.custom?.tenant ?? null }, heads);
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { LAMBDA_API_URL: `http://127.0.0.1:${port}`, AWS_REGION: REGION, AWS_ACCESS_KEY_ID: ACCESS, AWS_SECRET_ACCESS_KEY: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (!stats.invokes ? "Lambda was never invoked" : stats.refused ? `${stats.refused} signatures refused` : !stats.throttled ? "the 429 was never met" : !stats.events ? "no Event invocation came" : stats.pages < 3 ? "the list was not paged" : null),
    };
}
