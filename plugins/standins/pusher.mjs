// A Pusher Channels HTTP API for the pusher plugin's test, written from Pusher's REST API
// reference and its "Generating authentication signatures" page: every request is checked as
// Pusher checks it (auth_key known, auth_version 1.0, auth_timestamp within 600 s, body_md5 of the
// body, auth_signature = HMAC-SHA256 hex of "METHOD\nPATH\nsorted query" with the app's secret),
// with Pusher's error texts and codes; POST /apps/:id/events (1 to 100 channels, names and 10 KB
// data checked, socket_id, info), POST /apps/:id/batch_events (at most 10), GET /apps/:id/channels
// (filter_by_prefix, info=user_count for presence only), GET /apps/:id/channels/:name (occupied,
// user_count, subscription_count), GET /apps/:id/channels/:name/users (presence only) and
// POST /apps/:id/users/:id/terminate_connections. Some channels have subscribers already, as if
// browsers were on them.
//
//   start({ port }) -> { env: { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_HOST }, close(), check() }
import { createServer } from "node:http";
import { createHash, createHmac } from "node:crypto";

const APP = "1840071", KEY = "c0ffee5a1t", SECRET = "s3cr3t-for-the-standin";
const CHANNEL = /^[-a-zA-Z0-9_=@,.;]+$/;

export async function start({ port }) {
    const stats = { requests: 0, signed: 0, refused: 0, events: 0, batches: 0, queries: 0, refusals: [] };
    const received = [];
    // Who is on which channel: presence channels have users, the others a subscription count.
    const occupied = {
        "presence-lobby": { users: ["7", "9", "12"] },
        "private-orders": { subscriptions: 2 },
        "news": { subscriptions: 5 },
    };
    const count = (name) => occupied[name]?.users?.length ?? occupied[name]?.subscriptions ?? 0;

    function verify(method, path, query, body) {
        const p = Object.fromEntries(query);
        if (p.auth_key !== KEY) return [401, "Unknown auth_key"];
        if (p.auth_version !== "1.0") return [401, "Invalid auth_version: must be 1.0"];
        const ts = Number(p.auth_timestamp), now = Math.floor(Date.now() / 1000);
        if (!Number.isInteger(ts) || Math.abs(now - ts) > 600) return [401, `Timestamp expired: Given timestamp (${p.auth_timestamp}) not within 600s of server time (${now})`];
        if (body.length) {
            const md5 = createHash("md5").update(body).digest("hex");
            if (p.body_md5 !== md5) return [401, `Invalid body_md5: expected ${md5}`];
        }
        const signed = [...query].filter(([k]) => k !== "auth_signature").map(([k, v]) => [k.toLowerCase(), v]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&");
        const want = createHmac("sha256", SECRET).update(`${method}\n${path}\n${signed}`).digest("hex");
        if (p.auth_signature !== want) return [401, `Invalid signature: Expected HMAC SHA256 hex digest of ${method}\n${path}\n${signed}, but got ${p.auth_signature}`];
        return null;
    }
    function infoFor(name, info) {
        const out = {};
        for (const f of info) {
            if (f === "user_count") { if (!name.startsWith("presence-")) return [400, "Cannot retrieve the user count unless the channel is a presence channel"]; out.user_count = count(name); }
            else if (f === "subscription_count") out.subscription_count = count(name);
            else if (f) return [400, `Unknown info attribute: ${f}`];
        }
        return out;
    }
    function event(e) {
        const chans = e.channels ?? (e.channel != null ? [e.channel] : null);
        if (typeof e.name !== "string" || !e.name || e.name.length > 200) return [400, "Event name must be a string of 1 to 200 characters"];
        if (!Array.isArray(chans) || !chans.length) return [400, "Missing channels"];
        if (chans.length > 100) return [400, "Too many channels: at most 100 per event"];
        for (const c of chans) if (typeof c !== "string" || !CHANNEL.test(c) || c.length > 200) return [400, `Invalid channel name: ${c}`];
        if (typeof e.data !== "string") return [400, "Event data must be a string"];
        if (Buffer.byteLength(e.data) > 10240) return [413, "Event data too large: at most 10240 bytes"];
        if (e.socket_id != null && !/^\d+\.\d+$/.test(e.socket_id)) return [400, `Invalid socket id: ${e.socket_id}`];
        received.push({ name: e.name, channels: chans, data: e.data, socket_id: e.socket_id ?? null });
        stats.events++;
        if (!e.info) return null;
        const channels = {};
        for (const c of chans) { const r = infoFor(c, e.info.split(",")); if (Array.isArray(r)) return r; channels[c] = r; }
        return { channels };
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            stats.requests++;
            const url = new URL(req.url, "http://x");
            const send = (code, v) => {
                if (code >= 400) { stats.refused++; stats.refusals.push(`${code} ${v}`); }
                res.writeHead(code, { "content-type": code < 300 ? "application/json" : "text/plain" });
                res.end(code < 300 ? JSON.stringify(v) : String(v));
            };
            const m = /^\/apps\/([^/]+)(\/.*)$/.exec(url.pathname);
            if (!m) return send(404, "Not found");
            const bad = verify(req.method, url.pathname, url.searchParams, body);
            if (bad) return send(...bad);
            stats.signed++;
            if (m[1] !== APP) return send(404, `Unknown app ${m[1]}`);
            const rest = m[2];
            let json = null;
            if (body) { try { json = JSON.parse(body); } catch { return send(400, "Request body is not valid JSON"); } }
            if (req.method === "POST" && rest === "/events") {
                const r = event(json ?? {});
                return Array.isArray(r) ? send(...r) : send(200, r ?? {});
            }
            if (req.method === "POST" && rest === "/batch_events") {
                const batch = json?.batch;
                if (!Array.isArray(batch) || !batch.length) return send(400, "Missing batch");
                if (batch.length > 10) return send(400, "Batch too large: at most 10 events");
                const out = [];
                for (const e of batch) { const r = event(e); if (Array.isArray(r)) return send(...r); out.push(r ? r.channels[e.channel] : {}); }
                stats.batches++;
                return send(200, batch.some((e) => e.info) ? { batch: out } : {});
            }
            if (req.method === "GET" && rest === "/channels") {
                stats.queries++;
                const prefix = url.searchParams.get("filter_by_prefix") ?? "";
                const info = (url.searchParams.get("info") ?? "").split(",").filter(Boolean);
                if (info.includes("user_count") && prefix !== "presence-") return send(400, "Cannot retrieve the user count unless the channel is a presence channel: filter_by_prefix=presence-");
                const channels = {};
                for (const name of Object.keys(occupied).filter((n) => n.startsWith(prefix) && count(n) > 0).sort()) channels[name] = infoFor(name, info);
                return send(200, { channels });
            }
            let c;
            if (req.method === "GET" && (c = /^\/channels\/([^/]+)$/.exec(rest))) {
                stats.queries++;
                const name = decodeURIComponent(c[1]);
                if (!CHANNEL.test(name)) return send(400, `Invalid channel name: ${name}`);
                const r = infoFor(name, (url.searchParams.get("info") ?? "").split(",").filter(Boolean));
                return Array.isArray(r) ? send(...r) : send(200, { occupied: count(name) > 0, ...r });
            }
            if (req.method === "GET" && (c = /^\/channels\/([^/]+)\/users$/.exec(rest))) {
                stats.queries++;
                const name = decodeURIComponent(c[1]);
                if (!name.startsWith("presence-")) return send(400, "Users can only be retrieved for presence channels");
                return send(200, { users: (occupied[name]?.users ?? []).map((id) => ({ id })) });
            }
            if (req.method === "POST" && /^\/users\/[^/]+\/terminate_connections$/.test(rest)) return send(200, {});
            return send(404, "Not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { PUSHER_APP_ID: APP, PUSHER_KEY: KEY, PUSHER_SECRET: SECRET, PUSHER_HOST: `http://127.0.0.1:${port}` },
        stats, received,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.signed) return "the Pusher stand-in got no correctly signed request";
            if (!stats.events) return "the Pusher stand-in got no event";
            if (!stats.batches) return "the Pusher stand-in got no batch";
            if (stats.refusals.some((r) => r.startsWith("401"))) return `the Pusher stand-in refused a signature: ${stats.refusals.find((r) => r.startsWith("401"))}`;
            return null;
        },
    };
}
