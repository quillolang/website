// A two-node rqlite cluster for the rqlite plugin's test, written from rqlite.io/docs/api: a follower
// that answers writes and strong reads with 301 and the leader's Location, and a leader running real
// SQL in node:sqlite. POST /db/execute, /db/query and /db/request take [["sql", params...]] or
// [["sql", { named }]]; answers are { results: [{ last_insert_id, rows_affected, time? }] or
// { columns, types, values } or { error } }. ?transaction runs all or nothing; without it a failing
// statement stops nothing. Levels none, weak, linearizable, strong, auto are checked, ?queue answers
// { results: [], sequence_number }, a level it does not know is a 400, as rqlite's is. Also /nodes,
// /readyz, /status and, for the "no leader" case, a 503 on one statement. /_redirects (not rqlite's)
// counts redirects followed.
//
//   start({ ports }) -> { env: { RQLITE_API_URL, RQLITE_STANDIN }, close(), check() }
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

export async function start({ ports }) {
    const [followerPort, leaderPort] = ports;
    const db = new DatabaseSync(":memory:");
    const stats = { redirects: 0, writes: 0, tx: 0, levels: new Set() };
    let noLeaderLeft = 8;
    const leaderUrl = `http://127.0.0.1:${leaderPort}`, followerUrl = `http://127.0.0.1:${followerPort}`;
    const typeName = (v) => (v === null ? "" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "real") : typeof v === "string" ? "text" : "blob");
    function run(stmt, read, timings) {
        const [sql, ...rest] = stmt;
        const params = rest.length === 1 && rest[0] && typeof rest[0] === "object" && !Array.isArray(rest[0]) ? [rest[0]] : rest;
        const s = db.prepare(sql);
        const time = timings ? { time: 0.0001 } : {};
        if (read || /^\s*(SELECT|WITH|PRAGMA)/i.test(sql)) {
            const rows = s.all(...params);
            const columns = s.columns().map((c) => c.name);
            const values = rows.map((r) => columns.map((c) => r[c]));
            return { columns, types: columns.map((c, i) => typeName(values[0]?.[i] ?? null)), values, ...time };
        }
        const r = s.run(...params);
        return { last_insert_id: Number(r.lastInsertRowid), rows_affected: Number(r.changes), ...time };
    }
    function batch(list, read, tx, timings) {
        const out = [];
        if (tx) { db.exec("BEGIN"); stats.tx++; }
        for (const st of list) {
            try { out.push(run(st, read, timings)); }
            catch (e) {
                out.push({ error: e.message });
                if (tx) { db.exec("ROLLBACK"); return out; }
            }
        }
        if (tx) db.exec("COMMIT");
        return out;
    }
    const answer = (res, s, v, heads = {}) => { res.writeHead(s, { "content-type": "application/json", "x-rqlite-version": "v9.1.0", ...heads }); res.end(typeof v === "string" ? v : JSON.stringify(v)); };
    function handler(isLeader) {
        return (req, res) => {
            let raw = "";
            req.on("data", (d) => (raw += d));
            req.on("end", () => {
                const url = new URL(req.url, "http://x"), p = url.pathname, q = url.searchParams;
                if (p === "/_redirects") return answer(res, 200, { redirects: stats.redirects });
                if (p === "/readyz") return answer(res, 200, "[+]node ok\n[+]leader ok\n[+]store ok");
                if (p === "/status") return answer(res, 200, { build: { version: "v9.1.0" }, store: { raft: { state: isLeader ? "Leader" : "Follower" } } });
                if (p === "/nodes") return answer(res, 200, { nodes: [{ id: "n1", api_addr: leaderUrl, addr: "127.0.0.1:4002", voter: true, reachable: true, leader: true, time: 0.001 }, { id: "n2", api_addr: followerUrl, addr: "127.0.0.1:4004", voter: true, reachable: true, leader: false, time: 0.001 }] });
                if (!p.startsWith("/db/")) return answer(res, 404, "not found");
                const level = q.get("level");
                if (level != null && !["none", "weak", "linearizable", "strong", "auto"].includes(level)) return answer(res, 400, `unknown level ${level}`);
                if (level) stats.levels.add(level);
                const needsLeader = p !== "/db/query" || (level !== "none" && level !== "auto");
                if (raw.includes("zed-no-leader")) { if (noLeaderLeft-- > 0) return answer(res, 503, "leader not found"); }
                if (!isLeader && needsLeader) { stats.redirects++; return answer(res, 301, "", { location: `${leaderUrl}${req.url}` }); }
                if (req.method !== "POST" || !raw) return answer(res, 400, "request body required");
                let list;
                try { list = JSON.parse(raw); } catch { return answer(res, 400, "invalid JSON"); }
                if (!Array.isArray(list) || !list.every(Array.isArray)) return answer(res, 400, "invalid request");
                if (p === "/db/execute" && q.has("queue")) { batch(list, false, false, false); return answer(res, 200, { results: [], sequence_number: 19 }); }
                if (p === "/db/execute") stats.writes++;
                answer(res, 200, { results: batch(list, p === "/db/query", q.has("transaction"), q.has("timings")) });
            });
        };
    }
    const follower = createServer(handler(false)), leader = createServer(handler(true));
    await Promise.all([new Promise((r) => follower.listen(followerPort, "127.0.0.1", r)), new Promise((r) => leader.listen(leaderPort, "127.0.0.1", r))]);
    return {
        env: { RQLITE_API_URL: followerUrl, RQLITE_STANDIN: leaderUrl },
        close() { for (const s of [follower, leader]) { s.close(); s.closeAllConnections?.(); } db.close(); },
        check: () => (!stats.writes ? "nothing was written" : !stats.redirects ? "no redirect was followed" : !stats.tx ? "no transaction came" : stats.levels.size < 4 ? `only levels ${[...stats.levels]} came` : null),
    };
}
