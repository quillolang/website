// Two memcached servers for the memcached plugin's test, written from memcached's doc/protocol.txt:
// the text protocol with get, gets (unique cas tokens), set, add, replace, append, prepend, cas
// (STORED, EXISTS, NOT_FOUND), incr and decr (a value not a decimal number gives CLIENT_ERROR
// cannot increment or decrement non-numeric value; decr stops at 0), delete, touch, flush_all, stats,
// key and length checks with the real error words, and exptime read as the protocol says: 0 for
// never, seconds up to 30 days, a Unix time above that (a past time expires at once, which is what
// a 31-day lifetime sent as seconds would do).
import { createServer } from "node:net";

const MONTH = 60 * 60 * 24 * 30;

function serve(port, stats) {
    const kv = new Map();
    let unique = 1;
    const expires = (e) => { const n = Number(e); if (n === 0) return 0; if (n < 0) return 1; return n > MONTH ? n * 1000 : Date.now() + n * 1000; };
    const live = (k) => { const v = kv.get(k); if (v && v.exp && v.exp <= Date.now()) { kv.delete(k); return null; } return v ?? null; };
    const server = createServer((s) => {
        let buf = Buffer.alloc(0), want = null;
        s.on("error", () => {});
        s.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (want) {
                    if (buf.length < want.n + 2) return;
                    const data = buf.subarray(0, want.n);
                    const end = buf.subarray(want.n, want.n + 2).toString();
                    buf = buf.subarray(want.n + 2);
                    const w = want; want = null;
                    if (end !== "\r\n") { s.write("CLIENT_ERROR bad data chunk\r\n"); continue; }
                    s.write(apply(w, Buffer.from(data)));
                    continue;
                }
                const i = buf.indexOf("\r\n");
                if (i < 0) return;
                const line = buf.subarray(0, i).toString();
                buf = buf.subarray(i + 2);
                stats.lines.push(line);
                const a = line.split(" ");
                const c = a[0];
                if (["set", "add", "replace", "append", "prepend", "cas"].includes(c)) {
                    if (a.length < (c === "cas" ? 6 : 5) || a[1].length > 250) { s.write("CLIENT_ERROR bad command line format\r\n"); continue; }
                    want = { c, key: a[1], flags: a[2], exp: a[3], n: Number(a[4]), cas: a[5] };
                    continue;
                }
                stats.count[port] = (stats.count[port] ?? 0) + 1;
                if (c === "get" || c === "gets") {
                    let out = "";
                    for (const k of a.slice(1)) {
                        const v = live(k);
                        if (v) { const head = `VALUE ${k} ${v.flags} ${v.data.length}${c === "gets" ? ` ${v.cas}` : ""}\r\n`; s.write(head); s.write(v.data); s.write("\r\n"); }
                    }
                    s.write(out + "END\r\n");
                } else if (c === "incr" || c === "decr") {
                    const v = live(a[1]);
                    if (!v) { s.write("NOT_FOUND\r\n"); continue; }
                    if (!/^\d+$/.test(v.data.toString())) { s.write("CLIENT_ERROR cannot increment or decrement non-numeric value\r\n"); continue; }
                    let n = BigInt(v.data.toString());
                    n = c === "incr" ? n + BigInt(a[2]) : (n > BigInt(a[2]) ? n - BigInt(a[2]) : 0n);
                    v.data = Buffer.from(String(n)); v.cas = unique++;
                    s.write(`${n}\r\n`);
                } else if (c === "delete") {
                    s.write(live(a[1]) && kv.delete(a[1]) ? "DELETED\r\n" : "NOT_FOUND\r\n");
                } else if (c === "touch") {
                    const v = live(a[1]);
                    if (!v) { s.write("NOT_FOUND\r\n"); continue; }
                    v.exp = expires(a[2]); s.write("TOUCHED\r\n");
                } else if (c === "flush_all") { kv.clear(); s.write("OK\r\n"); }
                else if (c === "stats") s.write(`STAT pid 1\r\nSTAT curr_items ${kv.size}\r\nSTAT version 1.6.22\r\nEND\r\n`);
                else if (c === "version") s.write("VERSION 1.6.22\r\n");
                else s.write("ERROR\r\n");
            }
        });
    });
    function apply(w, data) {
        if (w.n > 1024 * 1024) return "SERVER_ERROR object too large for cache\r\n";
        const have = live(w.key);
        const put = () => { const exp = expires(w.exp); kv.set(w.key, { data, flags: w.flags, exp, cas: unique++ }); if (exp && exp <= Date.now()) { stats.expiredOnArrival++; } return "STORED\r\n"; };
        if (w.c === "set") return put();
        if (w.c === "add") return have ? "NOT_STORED\r\n" : put();
        if (w.c === "replace") return have ? put() : "NOT_STORED\r\n";
        if (w.c === "append") { if (!have) return "NOT_STORED\r\n"; have.data = Buffer.concat([have.data, data]); have.cas = unique++; return "STORED\r\n"; }
        if (w.c === "prepend") { if (!have) return "NOT_STORED\r\n"; have.data = Buffer.concat([data, have.data]); have.cas = unique++; return "STORED\r\n"; }
        if (w.c === "cas") { if (!have) return "NOT_FOUND\r\n"; if (String(have.cas) !== w.cas) return "EXISTS\r\n"; return put(); }
        return "ERROR\r\n";
    }
    return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

export async function start({ ports }) {
    const stats = { count: {}, lines: [], expiredOnArrival: 0 };
    const a = await serve(ports[0], stats), b = await serve(ports[1], stats);
    return {
        env: { MEMCACHED_HOST: `127.0.0.1:${ports[0]},127.0.0.1:${ports[1]}` },
        close() { a.close(); b.close(); },
        check() {
            if (Object.keys(stats.count).length < 2) return "the memcached stand-ins did not both get keys";
            if (stats.expiredOnArrival) return "a long lifetime reached the server as a past date";
            if (!stats.lines.some((l) => l.startsWith("gets "))) return "no gets was sent";
            if (!stats.lines.some((l) => l.startsWith("cas "))) return "no cas was sent";
            return null;
        },
    };
}
