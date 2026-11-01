// Google Analytics 4's collection and Data API for the ga4 plugin's test, written from
// developers.google.com/analytics/devguides/collection/protocol/ga4 and .../reporting/data/v1: POST
// /mp/collect?measurement_id=&api_secret= answers 204 to everything, so the stand-in records what is
// right and counts the rest; POST /debug/mp/collect answers { validationMessages: [{ fieldPath,
// description, validationCode }] }. POST /v1beta/properties/:id:runReport and runRealtimeReport with
// a service account's token (the shared OAuth stand-in), dimensionHeaders, metricHeaders with types,
// rows of strings, rowCount, metadata, offset and limit, propertyQuota; no `rows` key when empty.
// Errors are { error: { code, message, status } }.
//
//   start({ port }) -> { env: { GA4_*, GOOGLE_SERVICE_ACCOUNT_JSON }, close(), check() }
import { createServer } from "node:http";
import { googleAuth } from "./google_drive_oauth.mjs";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly", ID = "G-QK12345678", SECRET = "standin-api-secret", PROPERTY = "123456789";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const auth = googleAuth({ scope: SCOPE, tokenUri: `${base}/token` });
    const stats = { collected: 0, wrong: 0, biggest: 0, offsets: 0, reports: 0, limited: 0, debugged: 0 };
    const quota = { tokensPerDay: { consumed: 3, remaining: 199997 }, tokensPerHour: { consumed: 3, remaining: 39997 } };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (code, status, message) => send(code, { error: { code, message, status } });
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            if (p === "/token") return auth.token(body, res);
            if (p === "/mp/collect" || p === "/debug/mp/collect") {
                const debug = p.startsWith("/debug");
                const messages = [];
                let b = {};
                try { b = JSON.parse(body); } catch { messages.push({ fieldPath: "", description: "Unable to parse Measurement Protocol JSON payload.", validationCode: "VALUE_INVALID" }); }
                if (q.get("measurement_id") !== ID || q.get("api_secret") !== SECRET) messages.push({ fieldPath: "api_secret", description: "Invalid api_secret", validationCode: "VALUE_INVALID" });
                if (!b.client_id) messages.push({ fieldPath: "client_id", description: "client_id is required", validationCode: "VALUE_REQUIRED" });
                const events = b.events ?? [];
                if (events.length > 25) messages.push({ fieldPath: "events", description: `Too many events: ${events.length}`, validationCode: "VALUE_OUT_OF_BOUNDS" });
                events.forEach((e, i) => { if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(e.name ?? "")) messages.push({ fieldPath: "events", description: `Event at index: [${i}] has invalid name [${e.name}]. Names must start with an alphabetic character.`, validationCode: "NAME_INVALID" }); });
                if (b.user_properties) for (const [k, v] of Object.entries(b.user_properties)) if (typeof v !== "object" || !("value" in v)) messages.push({ fieldPath: `user_properties.${k}`, description: "A user property needs a value", validationCode: "VALUE_REQUIRED" });
                if (debug) { stats.debugged++; return send(200, { validationMessages: messages }); }
                stats.biggest = Math.max(stats.biggest, events.length);
                if (messages.length) stats.wrong++; else stats.collected += events.length;
                return send(204);
            }
            if (!auth.valid(req.headers.authorization)) return fail(401, "UNAUTHENTICATED", "Request had invalid authentication credentials.");
            const m = /^\/v1beta\/properties\/(\d+):(runReport|runRealtimeReport)$/.exec(p);
            if (!m) return fail(404, "NOT_FOUND", "Not found");
            const b = JSON.parse(body);
            if (m[1] === "999") return fail(403, "PERMISSION_DENIED", "User does not have sufficient permissions for this property.");
            if (m[1] === "888") return fail(429, "RESOURCE_EXHAUSTED", "Exhausted property tokens per day for this property.");
            if (m[1] === "777" && !stats.limited) { stats.limited++; return fail(429, "RESOURCE_EXHAUSTED", "Too many concurrent requests for this property."); }
            if (!["123456789", "777"].includes(m[1])) return fail(404, "NOT_FOUND", "Property not found");
            const dims = (b.dimensions ?? []).map((d) => d.name), mets = (b.metrics ?? []).map((x) => x.name);
            for (const x of mets) if (x === "nonsense") return fail(400, "INVALID_ARGUMENT", `Field ${x} is not a valid metric. For a list of valid dimensions and metrics, see https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema`);
            if (m[2] === "runReport" && !b.dateRanges?.length) return fail(400, "INVALID_ARGUMENT", "dateRanges is required");
            if (m[2] === "runReport" && Number(b.limit) > 250000) return fail(400, "INVALID_ARGUMENT", "limit is at most 250000");
            stats.reports++;
            const types = { activeUsers: "TYPE_INTEGER", screenPageViews: "TYPE_INTEGER", sessions: "TYPE_INTEGER", bounceRate: "TYPE_FLOAT", totalRevenue: "TYPE_CURRENCY" };
            const meta = { metadata: { currencyCode: "EUR", timeZone: "Europe/Amsterdam" }, kind: "analyticsData#runReport" };
            const heads = { dimensionHeaders: dims.map((name) => ({ name })), metricHeaders: mets.map((name) => ({ name, type: types[name] })) };
            if (dims.includes("emptySet")) return send(200, { ...heads, ...meta, propertyQuota: quota });
            const total = dims.includes("pagePath") ? 1234 : m[1] === "777" ? 1 : dims.includes("unifiedScreenName") ? 2 : 3;
            const offset = Number(b.offset ?? 0), limit = Number(b.limit ?? 10000);
            if (offset) stats.offsets++;
            const rows = [];
            for (let i = offset; i < Math.min(total, offset + limit); i++) rows.push({ dimensionValues: dims.map((d) => ({ value: `${d} ${i}` })), metricValues: mets.map((x) => ({ value: x === "bounceRate" ? "0.25" : x === "totalRevenue" ? "1999.5" : String(1000 - i) })) });
            return send(200, { ...heads, rows, rowCount: total, ...meta, propertyQuota: quota });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GA4_MP_URL: base, GA4_DATA_API_URL: base, GA4_MEASUREMENT_ID: ID, GA4_API_SECRET: SECRET, GA4_PROPERTY_ID: PROPERTY, GOOGLE_SERVICE_ACCOUNT_JSON: auth.account },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.collected) return "the GA4 stand-in collected nothing";
            if (stats.wrong) return "the GA4 stand-in got a payload GA4 would silently drop";
            if (stats.biggest > 25) return "a request held more than 25 events";
            if (!stats.debugged) return "the validation endpoint was never asked";
            if (!stats.offsets) return "a report was never paged";
            if (!stats.limited) return "the GA4 stand-in never saw a 429 waited out";
            if (auth.stats.granted !== 1) return `a token was fetched ${auth.stats.granted} times, not kept`;
            return null;
        },
    };
}
