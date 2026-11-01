// Neo4j's HTTP API for the neo4j plugin's test, written from the "HTTP API" manual: POST
// /db/:db/tx/commit, POST /db/:db/tx (201 with a Location header, `commit` and transaction.expires),
// POST /db/:db/tx/:id, POST /db/:db/tx/:id/commit and DELETE /db/:db/tx/:id, basic auth, and answers
// as { results: [{ columns, data: [{ row, meta }], stats }], errors: [{ code, message }] } with a
// 200 even when the statement failed, the transaction then rolled back. Unknown databases,
// wrong passwords and missing parameters give the real codes. A very small
// Cypher reader handles the statements the example runs; anything else is a SyntaxError. One count
// query reports a deadlock (Neo.TransientError) the first time, to see it retried.
import { createServer } from "node:http";

const USER = "neo4j", PASS = "standin-neo4j-pass";

export async function start({ port }) {
    const stats = { commits: 0, explicit: 0, deadlocks: 0, statements: 0 };
    let graph = { nodes: [], rels: [], nextId: 0 };
    const txs = new Map();
    let nextTx = 1;
    const clone = (g) => ({ nodes: g.nodes.map((n) => ({ ...n, props: { ...n.props } })), rels: [...g.rels], nextId: g.nextId });
    const errorOf = (code, message) => { const e = new Error(message); e.code = code; return e; };
    function propsOf(text, params) {
        const out = {};
        for (const m of (text ?? "").matchAll(/(\w+):\s*\$(\w+)/g)) {
            if (!(m[2] in params)) throw errorOf("Neo.ClientError.Statement.ParameterMissing", `Expected parameter(s): ${m[2]}`);
            out[m[1]] = params[m[2]];
        }
        return out;
    }
    const nodeMeta = (n) => ({ id: n.id, elementId: `4:standin:${n.id}`, type: "node", deleted: false });
    const empty = () => ({ contains_updates: false, nodes_created: 0, nodes_deleted: 0, properties_set: 0, relationships_created: 0, relationship_deleted: 0, labels_added: 0, labels_removed: 0, indexes_added: 0, indexes_removed: 0, constraints_added: 0, constraints_removed: 0, contains_system_updates: false, system_updates: 0 });

    function run(g, s) {
        stats.statements++;
        const c = s.statement.trim(), params = s.parameters ?? {}, st = empty();
        const find = (label, props) => g.nodes.filter((n) => n.label === label && Object.entries(props).every(([k, v]) => n.props[k] === v));
        const finish = (columns, data) => ({ columns, data, ...(s.includeStats ? { stats: st } : {}) });
        let m;
        if ((m = /^CREATE \((\w+):(\w+) \{([^}]*)\}\) RETURN (\w+)$/.exec(c))) {
            const n = { id: g.nextId++, label: m[2], props: propsOf(m[3], params) };
            g.nodes.push(n);
            st.contains_updates = true; st.nodes_created = 1; st.labels_added = 1; st.properties_set = Object.keys(n.props).length;
            return finish([m[4]], [{ row: [n.props], meta: [nodeMeta(n)] }]);
        }
        if ((m = /^MATCH \(a:(\w+) \{([^}]*)\}\), \(b:(\w+) \{([^}]*)\}\) CREATE \(a\)-\[r:(\w+)\]->\(b\) RETURN type\(r\) AS (\w+)$/.exec(c))) {
            const data = [];
            for (const a of find(m[1], propsOf(m[2], params))) for (const b of find(m[3], propsOf(m[4], params))) { g.rels.push({ from: a.id, to: b.id, type: m[5] }); st.relationships_created++; st.contains_updates = true; data.push({ row: [m[5]], meta: [null] }); }
            return finish([m[6]], data);
        }
        if ((m = /^MATCH \(a:(\w+) \{([^}]*)\}\)-\[:(\w+)\]->\(b\) RETURN b\.(\w+) AS (\w+), b\.(\w+) AS (\w+) ORDER BY (\w+)$/.exec(c))) {
            const rows = [];
            for (const a of find(m[1], propsOf(m[2], params))) for (const r of g.rels.filter((x) => x.from === a.id && x.type === m[3])) { const b = g.nodes.find((n) => n.id === r.to); rows.push([b.props[m[4]], b.props[m[6]]]); }
            rows.sort((x, y) => (x[0] < y[0] ? -1 : 1));
            return finish([m[5], m[7]], rows.map((row) => ({ row, meta: [null, null] })));
        }
        if ((m = /^MATCH \(n:(\w+) \{([^}]*)\}\) RETURN n\.(\w+) AS (\w+)$/.exec(c)))
            return finish([m[4]], find(m[1], propsOf(m[2], params)).map((n) => ({ row: [n.props[m[3]]], meta: [null] })));
        if ((m = /^MATCH \(n:(\w+)\) RETURN count\(n\) AS (\w+)$/.exec(c))) {
            if (!stats.deadlocks) { stats.deadlocks++; throw errorOf("Neo.TransientError.Transaction.DeadlockDetected", "ForsetiClient[transactionId=7] can't acquire ExclusiveLock"); }
            return finish([m[2]], [{ row: [g.nodes.filter((n) => n.label === m[1]).length], meta: [null] }]);
        }
        throw errorOf("Neo.ClientError.Statement.SyntaxError", `Invalid input '${c.slice(0, 12)}': expected a clause (line 1, column 1 (offset: 0))`);
    }

    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json;charset=utf-8", ...h }); res.end(JSON.stringify(v)); };
            const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
            if (req.headers.authorization !== auth) return send(401, { errors: [{ code: "Neo.ClientError.Security.Unauthorized", message: "Invalid username or password." }] });
            const p = new URL(req.url, "http://x").pathname.split("/").filter(Boolean);
            if (p[0] !== "db" || p[2] !== "tx") return send(404, { errors: [{ code: "Neo.ClientError.Request.Invalid", message: "Not found" }] });
            if (p[1] !== "neo4j") return send(404, { results: [], errors: [{ code: "Neo.ClientError.Database.DatabaseNotFound", message: `Database does not exist. Database name: '${p[1]}'.` }] });
            const statements = (body ? JSON.parse(body) : {}).statements ?? [];
            const exec = (g) => {
                const results = [];
                for (const s of statements) results.push(run(g, s));
                return results;
            };
            const base = `http://127.0.0.1:${port}/db/neo4j/tx`;
            const expires = new Date(Date.now() + 60000).toUTCString();
            if (p[3] === "commit" || (!p[3] && req.method === "POST")) {
                const auto = p[3] === "commit";
                if (auto) {
                    const g = clone(graph);
                    try { const results = exec(g); graph = g; stats.commits++; return send(200, { results, errors: [] }); }
                    catch (e) { if (!e.code) throw e; return send(200, { results: [], errors: [{ code: e.code, message: e.message }] }); }
                }
                const id = nextTx++;
                const g = clone(graph);
                txs.set(String(id), g);
                stats.explicit++;
                try { const results = exec(g); return send(201, { results, errors: [], commit: `${base}/${id}/commit`, transaction: { expires } }, { location: `${base}/${id}` }); }
                catch (e) { txs.delete(String(id)); return send(200, { results: [], errors: [{ code: e.code, message: e.message }] }); }
            }
            const g = txs.get(p[3]);
            if (!g) return send(404, { results: [], errors: [{ code: "Neo.ClientError.Transaction.TransactionNotFound", message: `Unrecognized transaction id. Transaction may have timed out and been rolled back.` }] });
            if (req.method === "DELETE") { txs.delete(p[3]); return send(200, { results: [], errors: [] }); }
            try {
                const results = exec(g);
                if (p[4] === "commit") { graph = g; txs.delete(p[3]); stats.commits++; return send(200, { results, errors: [] }); }
                send(200, { results, errors: [], commit: `${base}/${p[3]}/commit`, transaction: { expires } });
            } catch (e) { txs.delete(p[3]); send(200, { results: [], errors: [{ code: e.code, message: e.message }] }); }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { NEO4J_API_URL: `http://127.0.0.1:${port}`, NEO4J_USER: USER, NEO4J_PASSWORD: PASS },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.statements) return "the Neo4j stand-in got no statement";
            if (!stats.explicit) return "the Neo4j stand-in saw no open transaction";
            if (!stats.deadlocks) return "the deadlock was not met";
            if (txs.size) return `${txs.size} transaction left open`;
            return null;
        },
    };
}
