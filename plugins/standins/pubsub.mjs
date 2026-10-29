// Google Cloud Pub/Sub for the pubsub plugin's test, written from the REST reference
// (cloud.google.com/pubsub/docs/reference/rest) and Google's OAuth 2.0 for service accounts
// (developers.google.com/identity/protocols/oauth2/service-account): a token endpoint that checks
// the RS256 JWT against the public half of pubsub_sample.json's key (header, issuer, audience,
// scope, times) and gives a bearer token; topics and subscriptions made with PUT (409 when there),
// publish with base64 data, attributes and ordering keys (each subscription gets a copy), pull,
// ack deadlines (a message not acked in time comes again), acknowledge, modifyAckDeadline (0 sends
// it again now), ordering (with enableMessageOrdering, one message of a key out at a time), and
// errors as {"error": {code, message, status}}.
import { createServer } from "node:http";
import { createPublicKey, verify, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const sample = JSON.parse(readFileSync(new URL("../pubsub_sample.json", import.meta.url), "utf8"));
const publicKey = createPublicKey(sample.private_key);
const PROJECT = sample.project_id;

const b64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const tokens = new Map();      // token -> expiry
    const topics = new Map();      // full name -> { subs: Set }
    const subs = new Map();        // full name -> { topic, deadline, ordering, queue: [], out: Map(ackId -> {m, until, key}) }
    const issued = new Set();
    const seen = { token: 0, publish: 0, attributes: 0, ordering: 0, pull: 0, acknowledge: 0, modifyAckDeadline: 0, unsigned: 0 };
    let nextId = 1000;

    const json = (res, code, v) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8" }); res.end(JSON.stringify(v)); };
    const gerr = (res, code, status, message) => json(res, code, { error: { code, message, status } });

    function tokenEndpoint(body, res) {
        const form = new URLSearchParams(body);
        if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") return json(res, 400, { error: "unsupported_grant_type", error_description: "Invalid grant_type" });
        const parts = (form.get("assertion") ?? "").split(".");
        if (parts.length !== 3) return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT: Token must be a short-lived token and in a reasonable timeframe" });
        let head, claims;
        try { head = JSON.parse(b64url(parts[0])); claims = JSON.parse(b64url(parts[1])); } catch { return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT" }); }
        if (head.alg !== "RS256") return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT: alg must be RS256" });
        if (!verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, b64url(parts[2]))) return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT Signature." });
        if (head.kid && head.kid !== sample.private_key_id) return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT Signature." });
        if (claims.iss !== sample.client_email) return json(res, 400, { error: "invalid_grant", error_description: "Invalid email or User ID" });
        if (claims.aud !== `${base}/token`) return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT: aud is not the token endpoint" });
        if (!String(claims.scope ?? "").split(" ").includes("https://www.googleapis.com/auth/pubsub")) return json(res, 400, { error: "invalid_scope", error_description: "the scope does not include Pub/Sub" });
        const t = Math.floor(Date.now() / 1000);
        if (Math.abs(claims.iat - t) > 300 || claims.exp - claims.iat > 3600 || claims.exp < t) return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe. Check your iat and exp values in the JWT claim." });
        const token = `ya29.standin-${randomUUID()}`;
        tokens.set(token, Date.now() + 3600_000);
        seen.token++;
        json(res, 200, { access_token: token, expires_in: 3599, token_type: "Bearer" });
    }

    function deliverable(s) {
        const t = Date.now();
        for (const [ack, o] of s.out) if (o.until <= t) { s.out.delete(ack); s.queue.unshift(o.m); }
        if (s.ordering) s.queue.sort((a, b) => a.seq - b.seq);
        const busy = new Set([...s.out.values()].map((o) => o.m.orderingKey).filter(Boolean));
        const picked = [];
        for (const m of s.queue) {
            if (s.ordering && m.orderingKey) { if (busy.has(m.orderingKey)) continue; busy.add(m.orderingKey); }
            picked.push(m);
        }
        return picked;
    }

    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString();
            const u = new URL(req.url, "http://x");
            if (u.pathname === "/token" && req.method === "POST") return tokenEndpoint(body, res);
            const auth = req.headers.authorization ?? "";
            const tok = auth.startsWith("Bearer ") ? auth.slice(7) : null;
            if (!tok || !tokens.has(tok) || tokens.get(tok) < Date.now()) { seen.unsigned++; return gerr(res, 401, "UNAUTHENTICATED", "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential."); }
            let b = {};
            try { if (body) b = JSON.parse(body); } catch { return gerr(res, 400, "INVALID_ARGUMENT", "Invalid JSON payload received."); }
            const m = /^\/v1\/(projects\/([^/]+)\/(topics|subscriptions)\/([^/:]+))(?::(\w+))?$/.exec(u.pathname);
            if (!m) return gerr(res, 404, "NOT_FOUND", "The requested URL was not found on this server.");
            const [, full, project, kind, short, verb] = m;
            if (project !== PROJECT) return gerr(res, 403, "PERMISSION_DENIED", `User not authorized to perform this action (project ${project}).`);
            if (!/^[A-Za-z][A-Za-z0-9\-_.~+%]{2,254}$/.test(short) || short.startsWith("goog")) return gerr(res, 400, "INVALID_ARGUMENT", `Invalid resource name given (name=${full}). Refer to https://cloud.google.com/pubsub/docs/pubsub-basics#resource_names for more information.`);
            if (kind === "topics" && req.method === "PUT" && !verb) {
                if (topics.has(full)) return gerr(res, 409, "ALREADY_EXISTS", "Resource already exists in the project (resource=" + short + ").");
                topics.set(full, { subs: new Set() });
                return json(res, 200, { name: full });
            }
            if (kind === "subscriptions" && req.method === "PUT" && !verb) {
                if (subs.has(full)) return gerr(res, 409, "ALREADY_EXISTS", "Resource already exists in the project (resource=" + short + ").");
                const t = topics.get(b.topic);
                if (!t) return gerr(res, 404, "NOT_FOUND", `Resource not found (resource=${String(b.topic).split("/").pop()}).`);
                const deadline = b.ackDeadlineSeconds ?? 10;
                if (deadline < 10 || deadline > 600) return gerr(res, 400, "INVALID_ARGUMENT", "The value for ack_deadline_seconds is out of range [10, 600].");
                subs.set(full, { topic: b.topic, deadline, ordering: !!b.enableMessageOrdering, queue: [], out: new Map() });
                t.subs.add(full);
                return json(res, 200, { name: full, topic: b.topic, pushConfig: {}, ackDeadlineSeconds: deadline, messageRetentionDuration: "604800s", enableMessageOrdering: !!b.enableMessageOrdering });
            }
            if (kind === "topics" && verb === "publish" && req.method === "POST") {
                const t = topics.get(full);
                if (!t) return gerr(res, 404, "NOT_FOUND", `Resource not found (resource=${short}).`);
                const msgs = b.messages ?? [];
                if (!msgs.length) return gerr(res, 400, "INVALID_ARGUMENT", "The value for message_count is too small. You passed 0 in the request, but the minimum value is 1.");
                const ids = [];
                for (const msg of msgs) {
                    if (msg.data != null && !/^[A-Za-z0-9+/]*={0,2}$/.test(msg.data)) return gerr(res, 400, "INVALID_ARGUMENT", "Invalid value at 'messages[0].data' (TYPE_BYTES), Base64 decoding failed.");
                    if (!msg.data && !Object.keys(msg.attributes ?? {}).length) return gerr(res, 400, "INVALID_ARGUMENT", "Some messages are empty: each message needs data or attributes.");
                    if (Object.keys(msg.attributes ?? {}).length) seen.attributes++;
                    if (msg.orderingKey) seen.ordering++;
                    const id = String(nextId++);
                    const out = { data: msg.data ?? "", attributes: msg.attributes, messageId: id, publishTime: new Date().toISOString(), ...(msg.orderingKey ? { orderingKey: msg.orderingKey } : {}), seq: nextId };
                    for (const s of t.subs) subs.get(s)?.queue.push(out);
                    ids.push(id);
                }
                seen.publish++;
                return json(res, 200, { messageIds: ids });
            }
            const s = kind === "subscriptions" ? subs.get(full) : null;
            if (kind === "subscriptions" && verb && !s) return gerr(res, 404, "NOT_FOUND", `Resource not found (resource=${short}).`);
            if (verb === "pull" && req.method === "POST") {
                seen.pull++;
                const max = b.maxMessages ?? 0;
                if (max < 1) return gerr(res, 400, "INVALID_ARGUMENT", "The value for max_messages is too small. You passed 0 in the request, but the minimum value is 1.");
                const picked = deliverable(s).slice(0, max);
                const receivedMessages = picked.map((msg) => {
                    s.queue.splice(s.queue.indexOf(msg), 1);
                    const ackId = `ack-${randomUUID()}`;
                    issued.add(ackId);
                    s.out.set(ackId, { m: msg, until: Date.now() + s.deadline * 1000 });
                    const { seq, ...message } = msg;
                    return { ackId, message };
                });
                return json(res, 200, receivedMessages.length ? { receivedMessages } : {});
            }
            if ((verb === "acknowledge" || verb === "modifyAckDeadline") && req.method === "POST") {
                const ids = b.ackIds ?? [];
                if (!ids.length) return gerr(res, 400, "INVALID_ARGUMENT", "No ack ids specified.");
                for (const id of ids) if (!issued.has(id)) return gerr(res, 400, "INVALID_ARGUMENT", `You have passed an invalid ack ID to the service (ack_id=${id}).`);
                if (verb === "modifyAckDeadline") {
                    const d = b.ackDeadlineSeconds;
                    if (!(d >= 0 && d <= 600)) return gerr(res, 400, "INVALID_ARGUMENT", "The value for ack_deadline_seconds is out of range [0, 600].");
                    for (const id of ids) { const o = s.out.get(id); if (o) o.until = Date.now() + d * 1000; }
                    seen.modifyAckDeadline++;
                } else {
                    for (const id of ids) s.out.delete(id);  // expired ids are taken without an error, as Pub/Sub does
                    seen.acknowledge++;
                }
                return json(res, 200, {});
            }
            gerr(res, 404, "NOT_FOUND", "The requested URL was not found on this server.");
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { PUBSUB_ENDPOINT: base, PUBSUB_TOKEN_URL: `${base}/token`, PUBSUB_CREDENTIALS: "pubsub_sample.json" },
        close() { server.close(); },
        check() {
            const missing = ["token", "publish", "attributes", "ordering", "pull", "acknowledge", "modifyAckDeadline"].filter((k) => !seen[k]);
            if (missing.length) return `the Pub/Sub stand-in never got: ${missing.join(", ")}`;
            return seen.unsigned ? `the Pub/Sub stand-in got ${seen.unsigned} request(s) without a valid token` : null;
        },
    };
}
