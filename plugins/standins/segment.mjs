// Segment's HTTP Tracking API for the segment plugin's test, written from segment.com/docs/connections/
// sources/catalog/libraries/server/http-api: HTTP Basic with the write key as the user and no
// password, POST /v1/track, identify, group, page, screen, alias and batch. Each message needs a userId
// or anonymousId, and what its type needs (event, groupId, previousId); at most 32 KB a message and
// 500 KB a batch, a 400 past that; a 200 { success: true } otherwise. It keeps message ids and counts
// a repeat. `Busy` gets a 503 once, and `Refused` a 400.
//
//   start({ port }) -> { env: { SEGMENT_API_URL, SEGMENT_WRITE_KEY }, close(), check() }
import { createServer } from "node:http";

const KEY = "qkstandinwritekey";

export async function start({ port }) {
    const stats = { messages: 0, types: new Set(), batches: 0, biggest: 0, limited: 0, ids: new Set(), repeats: 0, noId: 0 };
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            if (req.headers.authorization !== `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`) return send(401, { success: false, message: "Unauthorized" });
            const raw = Buffer.concat(chunks);
            const p = new URL(req.url, "http://x").pathname.replace(/^\/v1/, "");
            let b;
            try { b = JSON.parse(raw); } catch { return send(400, { success: false, message: "Invalid JSON" }); }
            const check = (m, type) => {
                if (!m.userId && !m.anonymousId) return "userId or anonymousId is required";
                if (type === "track" && !m.event) return "event is required";
                if (type === "group" && !m.groupId) return "groupId is required";
                if (type === "alias" && !m.previousId) return "previousId is required";
                if (JSON.stringify(m).length > 32 * 1024) return "Message too large";
                if (!m.messageId) stats.noId++;
                if (stats.ids.has(m.messageId)) stats.repeats++;
                stats.ids.add(m.messageId);
                stats.messages++; stats.types.add(type);
                return null;
            };
            if (p === "/batch") {
                if (raw.length > 500 * 1024) { stats.biggest = raw.length; return send(400, { success: false, message: "Batch too large" }); }
                stats.batches++; stats.biggest = Math.max(stats.biggest, raw.length);
                for (const m of b.batch) { const bad = check(m, m.type); if (bad) return send(400, { success: false, message: bad }); }
                return send(200, { success: true });
            }
            const type = p.slice(1);
            if (!["track", "identify", "group", "page", "screen", "alias"].includes(type)) return send(404, { success: false, message: "Not found" });
            if (b.event === "Busy" && !stats.limited) { stats.limited++; res.writeHead(503); return res.end(); }
            if (b.event === "Refused") return send(400, { success: false, message: "Event refused" });
            const bad = check(b, type);
            return bad ? send(400, { success: false, message: bad }) : send(200, { success: true });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { SEGMENT_API_URL: `http://127.0.0.1:${port}/v1`, SEGMENT_WRITE_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            for (const t of ["track", "identify", "group", "page", "screen", "alias"]) if (!stats.types.has(t)) return `the Segment stand-in never saw a ${t}`;
            if (stats.biggest > 500 * 1024) return "a batch was over 500 KB";
            if (stats.batches < 3) return "a big batch was not cut";
            if (stats.noId) return "a message came without a messageId";
            if (!stats.limited) return "the Segment stand-in never saw a retry";
            return null;
        },
    };
}
