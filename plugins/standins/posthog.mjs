// A PostHog ingestion API for the posthog plugin's test, written from posthog.com/docs/api
// (capture, batch, flags and decide): POST /capture/ with api_key, event and distinct_id, or
// properties.distinct_id; POST /batch/ with api_key and `batch`, at most 20 MB; POST /decide/?v=3
// with api_key, distinct_id, groups, person_properties, answering featureFlags,
// featureFlagPayloads (JSON inside strings), errorsWhileComputingFlags and quotaLimited. A wrong key
// is a 401 { type: "authentication_error", code, detail }. It keeps what came and checks the forms of
// $identify, $create_alias, $groupidentify and $feature_flag_called.
//
//   start({ port }) -> { env: { POSTHOG_HOST, POSTHOG_API_KEY }, close(), check() }
import { createServer } from "node:http";

const KEY = "phc_qkStandinProjectKey";

export async function start({ port }) {
    const stats = { events: 0, batches: 0, biggest: 0, decide: 0, limited: 0, shapes: [] };
    const seen = new Set();
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const raw = Buffer.concat(chunks);
            const url = new URL(req.url, "http://x");
            if (raw.length > 20 * 1024 * 1024) return send(413, { type: "validation_error", code: "too_large", detail: "Payload too large" });
            let b;
            try { b = JSON.parse(raw); } catch { return send(400, { type: "validation_error", code: "invalid_payload", detail: "Malformed request data" }); }
            if (b.api_key !== KEY) return send(401, { type: "authentication_error", code: "invalid_api_key", detail: "Project API key invalid. You can find your project API key in PostHog project settings." });
            const check = (e) => {
                if (!e.event) return "No event name";
                const id = e.distinct_id ?? e.properties?.distinct_id;
                if (!id) return "Invalid payload: distinct_id required";
                if (e.event === "$identify" && !e.properties?.$set && !e.properties?.$set_once) stats.shapes.push("$identify without $set");
                if (e.event === "$create_alias" && !e.properties?.alias) stats.shapes.push("$create_alias without alias");
                if (e.event === "$groupidentify" && (id !== `$${e.properties?.$group_type}_${e.properties?.$group_key}` || !e.properties?.$group_set)) stats.shapes.push(`$groupidentify as ${id}`);
                if (e.event === "$feature_flag_called" && !("$feature_flag_response" in (e.properties ?? {}))) stats.shapes.push("$feature_flag_called without a response");
                seen.add(e.event);
                return null;
            };
            if (url.pathname === "/capture/") {
                if (b.event === "refused") return send(400, { type: "validation_error", code: "invalid_payload", detail: "Event was refused" });
                if (b.event === "busy" && !stats.limited) { stats.limited++; res.writeHead(503); return res.end(); }
                const bad = check(b);
                if (bad) return send(400, { type: "validation_error", code: "invalid_payload", detail: bad });
                stats.events++;
                return send(200, { status: 1 });
            }
            if (url.pathname === "/batch/") {
                if (!Array.isArray(b.batch)) return send(400, { type: "validation_error", code: "invalid_payload", detail: "batch must be a list" });
                for (const e of b.batch) { const bad = check(e); if (bad) return send(400, { type: "validation_error", code: "invalid_payload", detail: bad }); }
                stats.batches++; stats.biggest = Math.max(stats.biggest, b.batch.length); stats.events += b.batch.length;
                return send(200, { status: 1 });
            }
            if (url.pathname === "/decide/" && url.searchParams.get("v") === "3") {
                stats.decide++;
                if (!b.distinct_id) return send(400, { type: "validation_error", code: "invalid_payload", detail: "distinct_id required" });
                if (b.distinct_id === "over-quota") return send(200, { featureFlags: {}, featureFlagPayloads: {}, errorsWhileComputingFlags: false, quotaLimited: ["feature_flags"] });
                if (b.distinct_id === "partial") return send(200, { featureFlags: { "new-checkout": true }, featureFlagPayloads: {}, errorsWhileComputingFlags: true });
                const pro = b.distinct_id === "user-1";
                return send(200, { config: { enable_collect_everything: false }, featureFlags: { "new-checkout": pro, "colour-test": pro ? "blue" : "control" }, featureFlagPayloads: pro ? { "new-checkout": "{\"limit\":3,\"label\":\"Try it\"}" } : {}, errorsWhileComputingFlags: false });
            }
            return send(404, { type: "invalid_request", code: "not_found", detail: "Not found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { POSTHOG_HOST: `http://127.0.0.1:${port}`, POSTHOG_API_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.shapes.length) return `an event had the wrong form: ${stats.shapes[0]}`;
            for (const e of ["$identify", "$create_alias", "$groupidentify", "$feature_flag_called"]) if (!seen.has(e)) return `the PostHog stand-in never saw ${e}`;
            if (stats.batches < 3 || stats.biggest > 1000) return `events were not split into batches: ${stats.batches}, the biggest ${stats.biggest}`;
            if (!stats.limited) return "the PostHog stand-in never saw a retry";
            return null;
        },
    };
}
