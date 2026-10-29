// A beanstalkd for the beanstalkd plugin's test, written from the protocol document
// (github.com/beanstalkd/beanstalkd/blob/master/doc/protocol.txt): tubes made on use, jobs ready,
// delayed, reserved and buried, ordered by priority then id; reserves that wait, time out, and
// say DEADLINE_SOON; time to run running out (the job goes back, a timeout counted); a closed
// connection's reserved jobs released; kick, kick-job, peeks, pause-tube, and the stats in YAML.
import { createServer } from "node:net";

const MAX_JOB = 65535;
const NAME = /^[A-Za-z0-9\-+/;.$_()]{1,200}$/;

export async function start({ port }) {
    let nextId = 1;
    const jobs = new Map();          // id -> job
    const tubes = new Map();         // name -> { name, pauseUntil, pauseDelay, deletes, pauses, total }
    const clients = new Set();
    const counts = {};               // command -> times
    const now = () => Date.now();
    const tube = (name) => {
        if (!tubes.has(name)) tubes.set(name, { name, pauseUntil: 0, pauseDelay: 0, deletes: 0, pauses: 0, total: 0 });
        return tubes.get(name);
    };
    tube("default");
    const byPriority = (a, b) => a.pri - b.pri || a.id - b.id;
    const ready = (tubeName) => [...jobs.values()].filter((j) => j.state === "ready" && j.tube === tubeName).sort(byPriority);

    // Delays ending, times to run running out, and waiting reserves served.
    function tick() {
        const t = now();
        for (const j of jobs.values()) {
            if (j.state === "delayed" && j.until <= t) { j.state = "ready"; }
            if (j.state === "reserved" && j.until <= t) { j.state = "ready"; j.timeouts++; j.client?.reserved.delete(j.id); j.client = null; }
        }
        for (const c of clients) if (c.waiting) serveWait(c);
    }
    const timer = setInterval(tick, 20);

    function pick(c) {
        const t = now();
        const candidates = [...c.watching].filter((n) => tube(n).pauseUntil <= t).flatMap((n) => ready(n)).sort(byPriority);
        return candidates[0];
    }
    function reserve(c, j) {
        j.state = "reserved"; j.client = c; j.reserves++; j.until = now() + j.ttr * 1000;
        c.reserved.add(j.id);
        c.send(`RESERVED ${j.id} ${j.body.length}\r\n`, j.body);
    }
    function deadlineSoon(c) {
        const t = now();
        return [...c.reserved].some((id) => { const j = jobs.get(id); return j && j.until - t <= 1000; });
    }
    function serveWait(c) {
        const j = pick(c);
        if (j) { c.waiting = null; reserve(c, j); return; }
        if (deadlineSoon(c)) { c.waiting = null; c.send("DEADLINE_SOON\r\n"); return; }
        if (c.waiting.until <= now()) { c.waiting = null; c.send("TIMED_OUT\r\n"); }
    }
    const yaml = (o) => "---\n" + Object.entries(o).map(([k, v]) => `${k}: ${typeof v === "string" && k !== "state" && k !== "version" ? `"${v}"` : v}`).join("\n") + "\n";
    const yamlList = (xs) => "---\n" + xs.map((x) => `- ${x}`).join("\n") + "\n";
    const ok = (c, text) => { const b = Buffer.from(text); c.send(`OK ${b.length}\r\n`, b); };
    const found = (c, j) => (j ? c.send(`FOUND ${j.id} ${j.body.length}\r\n`, j.body) : c.send("NOT_FOUND\r\n"));
    const int = (s) => (/^\d+$/.test(s ?? "") ? Number(s) : NaN);
    function jobStats(j) {
        const t = now();
        return {
            id: j.id, tube: j.tube, state: j.state, pri: j.pri, age: Math.floor((t - j.created) / 1000), delay: j.delay, ttr: j.ttr,
            "time-left": j.state === "reserved" || j.state === "delayed" ? Math.max(0, Math.floor((j.until - t) / 1000)) : 0,
            file: 0, reserves: j.reserves, timeouts: j.timeouts, releases: j.releases, buries: j.buries, kicks: j.kicks,
        };
    }
    function tubeStats(tb) {
        const js = [...jobs.values()].filter((j) => j.tube === tb.name);
        const n = (s) => js.filter((j) => j.state === s).length;
        const t = now();
        return {
            name: tb.name, "current-jobs-urgent": js.filter((j) => j.state === "ready" && j.pri < 1024).length,
            "current-jobs-ready": n("ready"), "current-jobs-reserved": n("reserved"), "current-jobs-delayed": n("delayed"), "current-jobs-buried": n("buried"),
            "total-jobs": tb.total, "current-using": [...clients].filter((c) => c.using === tb.name).length,
            "current-watching": [...clients].filter((c) => c.watching.has(tb.name)).length,
            "current-waiting": [...clients].filter((c) => c.waiting && c.watching.has(tb.name)).length,
            "cmd-delete": tb.deletes, "cmd-pause-tube": tb.pauses, pause: tb.pauseDelay, "pause-time-left": Math.max(0, Math.ceil((tb.pauseUntil - t) / 1000)),
        };
    }

    function command(c, line) {
        const w = line.split(" ");
        const cmd = w[0];
        counts[cmd] = (counts[cmd] ?? 0) + 1;
        const bad = () => c.send("BAD_FORMAT\r\n");
        const mine = (id) => { const j = jobs.get(id); return j && j.state === "reserved" && j.client === c ? j : null; };
        switch (cmd) {
            case "use": if (w.length !== 2 || !NAME.test(w[1]) || w[1].startsWith("-")) return bad(); tube(w[1]); c.using = w[1]; return c.send(`USING ${w[1]}\r\n`);
            case "watch": if (w.length !== 2 || !NAME.test(w[1]) || w[1].startsWith("-")) return bad(); tube(w[1]); c.watching.add(w[1]); return c.send(`WATCHING ${c.watching.size}\r\n`);
            case "ignore":
                if (w.length !== 2 || !NAME.test(w[1])) return bad();
                if (c.watching.has(w[1]) && c.watching.size === 1) return c.send("NOT_IGNORED\r\n");
                c.watching.delete(w[1]); return c.send(`WATCHING ${c.watching.size}\r\n`);
            case "reserve": case "reserve-with-timeout": {
                const secs = cmd === "reserve" ? Infinity : int(w[1]);
                if (cmd === "reserve-with-timeout" && (w.length !== 2 || Number.isNaN(secs))) return bad();
                c.waiting = { until: now() + secs * 1000 };
                return serveWait(c);
            }
            case "reserve-job": {
                const j = jobs.get(int(w[1]));
                if (!j || j.state === "reserved") return c.send("NOT_FOUND\r\n");
                return reserve(c, j);
            }
            case "delete": {
                const id = int(w[1]); const j = jobs.get(id);
                if (!j || (j.state === "reserved" && j.client !== c)) return c.send("NOT_FOUND\r\n");
                j.client?.reserved.delete(id); jobs.delete(id); tube(j.tube).deletes++;
                return c.send("DELETED\r\n");
            }
            case "release": {
                const j = mine(int(w[1])); const pri = int(w[2]); const delay = int(w[3]);
                if (w.length !== 4 || Number.isNaN(pri) || Number.isNaN(delay)) return bad();
                if (!j) return c.send("NOT_FOUND\r\n");
                c.reserved.delete(j.id); j.client = null; j.pri = pri; j.delay = delay; j.releases++;
                if (delay > 0) { j.state = "delayed"; j.until = now() + delay * 1000; } else j.state = "ready";
                return c.send("RELEASED\r\n");
            }
            case "bury": {
                const j = mine(int(w[1])); const pri = int(w[2]);
                if (w.length !== 3 || Number.isNaN(pri)) return bad();
                if (!j) return c.send("NOT_FOUND\r\n");
                c.reserved.delete(j.id); j.client = null; j.pri = pri; j.state = "buried"; j.buries++; j.buriedAt = now();
                return c.send("BURIED\r\n");
            }
            case "touch": {
                const j = mine(int(w[1]));
                if (!j) return c.send("NOT_FOUND\r\n");
                j.until = now() + j.ttr * 1000;
                return c.send("TOUCHED\r\n");
            }
            case "kick": {
                const bound = int(w[1]); if (Number.isNaN(bound)) return bad();
                const inTube = [...jobs.values()].filter((j) => j.tube === c.using);
                const buried = inTube.filter((j) => j.state === "buried").sort((a, b) => a.buriedAt - b.buriedAt || a.id - b.id);
                const list = (buried.length ? buried : inTube.filter((j) => j.state === "delayed").sort((a, b) => a.until - b.until)).slice(0, bound);
                for (const j of list) { j.state = "ready"; j.kicks++; }
                return c.send(`KICKED ${list.length}\r\n`);
            }
            case "kick-job": {
                const j = jobs.get(int(w[1]));
                if (!j || !["buried", "delayed"].includes(j.state)) return c.send("NOT_FOUND\r\n");
                j.state = "ready"; j.kicks++;
                return c.send("KICKED\r\n");
            }
            case "peek": return found(c, jobs.get(int(w[1])));
            case "peek-ready": return found(c, ready(c.using)[0]);
            case "peek-delayed": return found(c, [...jobs.values()].filter((j) => j.tube === c.using && j.state === "delayed").sort((a, b) => a.until - b.until)[0]);
            case "peek-buried": return found(c, [...jobs.values()].filter((j) => j.tube === c.using && j.state === "buried").sort((a, b) => a.buriedAt - b.buriedAt)[0]);
            case "stats-job": { const j = jobs.get(int(w[1])); return j ? ok(c, yaml(jobStats(j))) : c.send("NOT_FOUND\r\n"); }
            case "stats-tube": { const tb = tubes.get(w[1]); return tb ? ok(c, yaml(tubeStats(tb))) : c.send("NOT_FOUND\r\n"); }
            case "stats": {
                const n = (s) => [...jobs.values()].filter((j) => j.state === s).length;
                return ok(c, yaml({
                    "current-jobs-urgent": [...jobs.values()].filter((j) => j.state === "ready" && j.pri < 1024).length,
                    "current-jobs-ready": n("ready"), "current-jobs-reserved": n("reserved"), "current-jobs-delayed": n("delayed"), "current-jobs-buried": n("buried"),
                    "cmd-put": counts.put ?? 0, "cmd-reserve": counts.reserve ?? 0, "cmd-reserve-with-timeout": counts["reserve-with-timeout"] ?? 0, "cmd-delete": counts.delete ?? 0,
                    "job-timeouts": [...jobs.values()].reduce((a, j) => a + j.timeouts, 0), "total-jobs": nextId - 1, "max-job-size": MAX_JOB,
                    "current-tubes": tubes.size, "current-connections": clients.size, "current-workers": [...clients].filter((x) => x.worker).length,
                    "current-waiting": [...clients].filter((x) => x.waiting).length, pid: process.pid, version: "1.13-standin", uptime: Math.floor(process.uptime()),
                }));
            }
            case "list-tubes": return ok(c, yamlList([...tubes.keys()]));
            case "list-tube-used": return c.send(`USING ${c.using}\r\n`);
            case "list-tubes-watched": return ok(c, yamlList([...c.watching]));
            case "pause-tube": {
                const tb = tubes.get(w[1]); const d = int(w[2]);
                if (Number.isNaN(d)) return bad();
                if (!tb) return c.send("NOT_FOUND\r\n");
                tb.pauseDelay = d; tb.pauseUntil = now() + d * 1000; tb.pauses++;
                return c.send("PAUSED\r\n");
            }
            case "quit": return c.sock.end();
            default: return c.send("UNKNOWN_COMMAND\r\n");
        }
    }

    const server = createServer((sock) => {
        const c = {
            sock, using: "default", watching: new Set(["default"]), reserved: new Set(), waiting: null, worker: false,
            send: (head, body) => { if (!sock.writable) return; sock.write(head); if (body) { sock.write(body); sock.write("\r\n"); } },
        };
        clients.add(c);
        let buf = Buffer.alloc(0);
        let pending = null;  // a put waiting for its body: { pri, delay, ttr, bytes }
        sock.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            for (;;) {
                if (pending) {
                    if (buf.length < pending.bytes + 2) return;
                    const body = buf.subarray(0, pending.bytes); const end = buf.subarray(pending.bytes, pending.bytes + 2).toString();
                    buf = buf.subarray(pending.bytes + 2);
                    const p = pending; pending = null;
                    if (end !== "\r\n") { c.send("EXPECTED_CRLF\r\n"); continue; }
                    if (p.bytes > MAX_JOB) { c.send("JOB_TOO_BIG\r\n"); continue; }
                    const id = nextId++;
                    const ttr = Math.max(1, p.ttr);
                    jobs.set(id, { id, tube: c.using, pri: p.pri, delay: p.delay, ttr, body: Buffer.from(body), created: now(), until: now() + p.delay * 1000,
                        state: p.delay > 0 ? "delayed" : "ready", client: null, reserves: 0, timeouts: 0, releases: 0, buries: 0, kicks: 0 });
                    tube(c.using).total++;
                    c.send(`INSERTED ${id}\r\n`);
                    tick();
                    continue;
                }
                if (c.waiting) return;  // a reserve in progress: the next command waits for its answer
                const i = buf.indexOf("\r\n");
                if (i < 0) { if (buf.length > 224) { c.send("BAD_FORMAT\r\n"); buf = Buffer.alloc(0); } return; }
                const line = buf.subarray(0, i).toString(); buf = buf.subarray(i + 2);
                if (line.startsWith("put ")) {
                    counts.put = (counts.put ?? 0) + 1;
                    const [, pri, delay, ttr, bytes] = line.split(" ").map(Number);
                    if (line.split(" ").length !== 5 || [pri, delay, ttr, bytes].some((x) => !Number.isInteger(x) || x < 0)) { c.send("BAD_FORMAT\r\n"); continue; }
                    pending = { pri, delay, ttr, bytes };
                    continue;
                }
                if (line.startsWith("reserve")) c.worker = true;
                command(c, line);
            }
        });
        const gone = () => {
            clients.delete(c);
            for (const id of c.reserved) { const j = jobs.get(id); if (j) { j.state = "ready"; j.client = null; } }
            c.reserved.clear();
        };
        sock.on("close", gone);
        sock.on("error", () => {});
        // Commands that came while a reserve waited are read once it is answered.
        const send = c.send;
        c.send = (h, b) => { send(h, b); if (!c.waiting && buf.length) setImmediate(() => sock.emit("data", Buffer.alloc(0))); };
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { BEANSTALK_URL: `beanstalk://127.0.0.1:${port}` },
        close() { clearInterval(timer); for (const c of clients) c.sock.destroy(); server.close(); },
        check() {
            const need = ["put", "reserve-with-timeout", "delete", "release", "bury", "kick", "touch", "stats-tube"];
            const missing = need.filter((k) => !counts[k]);
            return missing.length ? `the beanstalkd stand-in never got: ${missing.join(", ")}` : null;
        },
    };
}
