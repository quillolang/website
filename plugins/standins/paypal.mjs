// PayPal's REST API for the paypal plugin's test, written from developer.paypal.com: Orders v2
// (create, get, capture), Payments v2 (captures, refunds), the OAuth token call and Webhooks
// (verify-webhook-signature, simulate-event). Error bodies have PayPal's shapes: `name`, `message`,
// `debug_id`, `details[{ issue, description, field }]`, and `error`, `error_description` from OAuth.
// A token must be Bearer and live; PayPal-Request-Id replays the first answer of a POST (200 for
// an order made before). Webhooks are signed as PayPal signs them, over
// `transmissionId|time|webhookId|crc32(body)`, with RSA-SHA256, and verified over the exact bytes
// of `webhook_event`, so a client that rewrites the event fails. An order's buyer approves by a GET
// of its approve link. To test the client's care: the first capture answers 429 with Retry-After,
// and the token is revoked after its fifth call, so a 401 must lead to one new token.
//
//   start({ port }) -> { env: { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_API_URL }, close(), check() }
import { createServer } from "node:http";
import { generateKeyPairSync, createSign, createVerify, randomBytes } from "node:crypto";

const ID = "qk_test_client", SECRET = "qk_test_secret", WEBHOOK = "WH-STANDIN-1";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const crc32 = (s) => { let c = ~0; for (const b of Buffer.from(s)) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; };

export async function start({ port }) {
    const stats = { tokens: 0, reused: 0, revoked: 0, renewed: 0, replays: 0, retried: 0, captures: 0, refunds: 0, verified: 0, refused: 0 };
    const base = `http://127.0.0.1:${port}`;
    const orders = new Map(), captures = new Map(), refunds = new Map(), seen = new Map();
    const live = new Map(); // token -> calls left
    let throttled = false, revokedOnce = false;
    const pid = (p) => p + randomBytes(8).toString("hex").toUpperCase();
    const err = (status, name, message, issue, description, field) => ({ status, body: { name, message, debug_id: randomBytes(6).toString("hex"), details: issue ? [{ issue, description, ...(field ? { field } : {}) }] : undefined, links: [] } });
    const notFound = () => err(404, "RESOURCE_NOT_FOUND", "The specified resource does not exist.", "INVALID_RESOURCE_ID", "Specified resource ID does not exist. Please check the resource ID and try again.");
    const orderView = (o) => ({ id: o.id, status: o.status, intent: o.intent, purchase_units: o.units, links: [{ href: `${base}/v2/checkout/orders/${o.id}`, rel: "self", method: "GET" }, { href: `${base}/checkoutnow?token=${o.id}`, rel: "approve", method: "GET" }, { href: `${base}/v2/checkout/orders/${o.id}/capture`, rel: "capture", method: "POST" }] });

    function route(req, path, json, raw) {
        let m;
        if (req.method === "POST" && path === "/v2/checkout/orders") {
            if (!["CAPTURE", "AUTHORIZE"].includes(json?.intent)) return err(400, "INVALID_REQUEST", "Request is not well-formed, syntactically incorrect, or violates schema.", "INVALID_PARAMETER_VALUE", "The value of a field is invalid.", "/intent");
            const units = json.purchase_units;
            if (!Array.isArray(units) || !units.length) return err(400, "INVALID_REQUEST", "Request is not well-formed, syntactically incorrect, or violates schema.", "MISSING_REQUIRED_PARAMETER", "A required field / parameter is missing.", "/purchase_units");
            for (const u of units) {
                const a = u.amount;
                if (!a?.currency_code || !/^\d+(\.\d{2})?$/.test(a.value ?? "")) return err(400, "INVALID_REQUEST", "Request is not well-formed, syntactically incorrect, or violates schema.", "INVALID_PARAMETER_SYNTAX", "The value of a field does not conform to the expected format.", "/purchase_units/@reference_id=='default'/amount/value");
            }
            const o = { id: pid("5O"), status: "CREATED", intent: json.intent, units };
            orders.set(o.id, o);
            return { status: 201, body: orderView(o) };
        }
        if (req.method === "GET" && (m = /^\/v2\/checkout\/orders\/([^/]+)$/.exec(path))) {
            const o = orders.get(m[1]);
            return o ? { status: 200, body: orderView(o) } : notFound();
        }
        if (req.method === "POST" && (m = /^\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(path))) {
            if ((req.headers["content-type"] ?? "") !== "application/json") return err(415, "UNSUPPORTED_MEDIA_TYPE", "The request payload is not supported.");
            const o = orders.get(m[1]);
            if (!o) return notFound();
            if (o.status === "CREATED") return err(422, "UNPROCESSABLE_ENTITY", "The requested action could not be performed, semantically incorrect, or failed business validation.", "ORDER_NOT_APPROVED", "Payer has not yet approved the Order for payment. Please redirect the payer to the 'rel':'approve' url that was returned as part of the HATEOAS links within the Create Order call or provide a valid payment_source in the request.");
            if (o.status === "COMPLETED") return err(422, "UNPROCESSABLE_ENTITY", "The requested action could not be performed, semantically incorrect, or failed business validation.", "ORDER_ALREADY_CAPTURED", "Order already captured.If 'intent=CAPTURE' only one capture per order is allowed.");
            if (!throttled) { throttled = true; return { status: 429, headers: { "retry-after": "1" }, body: { name: "RATE_LIMIT_REACHED", message: "Too many requests. Blocked due to rate limiting.", debug_id: "standin" } }; }
            stats.captures++;
            o.status = "COMPLETED";
            for (const u of o.units) {
                const c = { id: pid("3C"), status: "COMPLETED", amount: u.amount, final_capture: true, refunded: 0 };
                captures.set(c.id, c);
                u.payments = { captures: [{ id: c.id, status: c.status, amount: c.amount, final_capture: true }] };
            }
            return { status: 201, body: orderView(o) };
        }
        if (req.method === "GET" && (m = /^\/v2\/payments\/captures\/([^/]+)$/.exec(path))) {
            const c = captures.get(m[1]);
            return c ? { status: 200, body: { id: c.id, status: c.status, amount: c.amount, final_capture: true } } : notFound();
        }
        if (req.method === "POST" && (m = /^\/v2\/payments\/captures\/([^/]+)\/refund$/.exec(path))) {
            const c = captures.get(m[1]);
            if (!c) return notFound();
            const whole = Math.round(Number(c.amount.value) * 100);
            const cents = json?.amount ? Math.round(Number(json.amount.value) * 100) : whole - c.refunded;
            if (json?.amount && json.amount.currency_code !== c.amount.currency_code) return err(422, "UNPROCESSABLE_ENTITY", "The requested action could not be performed, semantically incorrect, or failed business validation.", "REFUND_CURRENCY_MISMATCH", "Refund must be in the same currency as the capture.");
            if (c.refunded >= whole) return err(422, "UNPROCESSABLE_ENTITY", "The requested action could not be performed, semantically incorrect, or failed business validation.", "CAPTURE_FULLY_REFUNDED", "The capture has already been fully refunded");
            if (cents + c.refunded > whole) return err(422, "UNPROCESSABLE_ENTITY", "The requested action could not be performed, semantically incorrect, or failed business validation.", "REFUND_AMOUNT_EXCEEDED", "The refund amount must be less than or equal to the capture amount that has not yet been refunded.");
            c.refunded += cents;
            c.status = c.refunded >= whole ? "REFUNDED" : "PARTIALLY_REFUNDED";
            const r = { id: pid("1R"), status: "COMPLETED", amount: { currency_code: c.amount.currency_code, value: (cents / 100).toFixed(2) }, note_to_payer: json?.note_to_payer };
            refunds.set(r.id, r);
            stats.refunds++;
            return { status: 201, body: { id: r.id, status: r.status, links: [{ href: `${base}/v2/payments/refunds/${r.id}`, rel: "self", method: "GET" }] } };
        }
        if (req.method === "GET" && (m = /^\/v2\/payments\/refunds\/([^/]+)$/.exec(path))) {
            const r = refunds.get(m[1]);
            return r ? { status: 200, body: r } : notFound();
        }
        if (req.method === "POST" && path === "/v1/notifications/verify-webhook-signature") {
            for (const f of ["auth_algo", "cert_url", "transmission_id", "transmission_sig", "transmission_time", "webhook_id", "webhook_event"]) {
                if (json?.[f] == null) return err(400, "VALIDATION_ERROR", "Invalid request - see details", "MISSING_REQUIRED_PARAMETER", `${f} is required`, f);
            }
            // The event exactly as it was sent: from `"webhook_event":` to the closing brace.
            const at = raw.indexOf('"webhook_event":');
            const event = raw.slice(at + 16, raw.lastIndexOf("}"));
            const ok = createVerify("RSA-SHA256").update(`${json.transmission_id}|${json.transmission_time}|${json.webhook_id}|${crc32(event)}`).verify(publicKey, json.transmission_sig, "base64");
            stats[ok ? "verified" : "refused"]++;
            return { status: 200, body: { verification_status: ok ? "SUCCESS" : "FAILURE" } };
        }
        if (req.method === "POST" && path === "/v1/notifications/simulate-event") {
            if (!json?.event_type) return err(400, "VALIDATION_ERROR", "Invalid request - see details", "MISSING_REQUIRED_PARAMETER", "event_type is required", "event_type");
            const event = { id: "WH-" + randomBytes(6).toString("hex"), event_version: "1.0", create_time: new Date().toISOString(), resource_type: "capture", event_type: json.event_type, summary: "Payment completed for EUR 59.9 EUR", resource: { amount: { currency_code: "EUR", value: "59.90" }, note: "café  €" } };
            const text = JSON.stringify(event, null, 1);
            return deliver(json.url, json.webhook_id ?? WEBHOOK, event, text);
        }
        return err(404, "NOT_FOUND", "Not found");
    }
    async function deliver(url, webhook, event, text) {
        const id = randomBytes(8).toString("hex"), time = new Date().toISOString();
        const sig = createSign("RSA-SHA256").update(`${id}|${time}|${webhook}|${crc32(text)}`).sign(privateKey, "base64");
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": `${base}/certs/standin`, "paypal-transmission-id": id, "paypal-transmission-sig": sig, "paypal-transmission-time": time }, body: text }).then(async (a) => ({ status: a.status, body: await a.text() }), (e) => ({ status: 0, body: String(e) }));
        return { status: 202, body: { ...event, delivery: r } };
    }

    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", async () => {
            const url = new URL(req.url, "http://x");
            const send = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(body == null ? "" : JSON.stringify(body)); };
            if (url.pathname === "/v1/oauth2/token") {
                const basic = Buffer.from(`${ID}:${SECRET}`).toString("base64");
                if (req.method !== "POST" || req.headers.authorization !== `Basic ${basic}`) return send(401, { error: "invalid_client", error_description: "Client Authentication failed" });
                if (new URLSearchParams(raw).get("grant_type") !== "client_credentials") return send(400, { error: "unsupported_grant_type", error_description: "Grant Type is NULL" });
                const token = "A21AA" + randomBytes(16).toString("hex");
                stats.tokens++;
                if (stats.revoked) stats.renewed++;
                live.set(token, revokedOnce ? 1000 : 5);
                return send(200, { scope: "https://uri.paypal.com/services/payments/payment", access_token: token, token_type: "Bearer", app_id: "APP-80W284485P519543T", expires_in: 32400, nonce: "2026-11-01T00:00:00Zstandin" });
            }
            if (url.pathname === "/checkoutnow") {
                const o = orders.get(url.searchParams.get("token"));
                if (!o) return send(404, { error: "no such order" });
                if (o.status === "CREATED") o.status = "APPROVED";
                res.writeHead(200, { "content-type": "text/html" });
                return res.end("<p>Approved</p>");
            }
            const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            const left = live.get(token);
            if (!left) { if (live.has(token)) stats.revoked++; return send(401, { error: "invalid_token", error_description: "Token signature verification failed" }); }
            stats.reused++;
            live.set(token, left - 1);
            if (left - 1 === 0) revokedOnce = true;
            let json = null;
            if (raw) { try { json = JSON.parse(raw); } catch { return send(400, { name: "INVALID_REQUEST", message: "Request is not well-formed, syntactically incorrect, or violates schema.", debug_id: "standin", details: [{ issue: "MALFORMED_REQUEST_JSON", description: "The request JSON is not well formed." }] }); } }
            const rid = req.headers["paypal-request-id"];
            const slot = rid ? `${url.pathname} ${rid}` : null;
            if (req.method === "POST" && url.pathname.startsWith("/v2/") && !rid) return send(400, { name: "INVALID_REQUEST", message: "PayPal-Request-Id is required here by this stand-in, as a client should always send one.", debug_id: "standin" });
            if (slot && seen.has(slot)) {
                stats.replays++;
                const r = seen.get(slot);
                return send(r.status === 201 ? 200 : r.status, r.body);
            }
            if (slot && seen.has("try " + slot)) stats.retried++;
            const r = await route(req, url.pathname, json, raw);
            if (slot) { if (r.status < 400) seen.set(slot, r); else seen.set("try " + slot, 1); }
            send(r.status, r.body, r.headers);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { PAYPAL_CLIENT_ID: ID, PAYPAL_CLIENT_SECRET: SECRET, PAYPAL_WEBHOOK_ID: WEBHOOK, PAYPAL_API_URL: base },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.captures) return "the PayPal stand-in saw no capture";
            if (!stats.refunds) return "the PayPal stand-in saw no refund";
            if (!stats.replays) return "the PayPal stand-in saw no replayed PayPal-Request-Id";
            if (!stats.retried) return "the client did not retry the capture answered 429 with the same PayPal-Request-Id";
            if (!stats.revoked || !stats.renewed) return "the client did not fetch a new token after a 401";
            if (stats.tokens > 3) return `the client fetched ${stats.tokens} tokens: it should reuse them`;
            if (!stats.verified) return "the PayPal stand-in verified no webhook";
            return null;
        },
    };
}
