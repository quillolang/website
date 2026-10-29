// A POP3 server for pop3.qwe, after RFC 1939 with CAPA (RFC 2449) and STLS (RFC 2595): the
// AUTHORIZATION state takes CAPA, STLS (TLS with the test certificate of proto_tls.mjs), USER and
// PASS (desk / s3cret, refused in clear text before STLS) and QUIT; TRANSACTION takes STAT, LIST,
// UIDL, RETR, TOP, DELE, NOOP, RSET and QUIT, which deletes the marked messages (UPDATE). Lines
// that start with "." are dot-stuffed. The maildrop is locked while a session holds it.
import { createServer } from "node:net";
import { TLSSocket, createSecureContext } from "node:tls";
import { messages } from "./proto_mailbox.mjs";
import { ca, cert, key } from "./proto_tls.mjs";

export async function start({ port }) {
    let box = messages();
    const log = { logins: 0, retr: 0, deleted: 0, stls: 0 };
    let locked = false;
    const ctx = createSecureContext({ key, cert });

    const server = createServer((raw) => {
        let sock = raw, buf = "", state = "auth", user = null, tls = false, mine = false;
        const marked = new Set();
        const w = (s) => sock.write(s + "\r\n");
        const live = () => box.map((m, i) => ({ ...m, n: i + 1 })).filter((m) => !marked.has(m.n));
        const find = (arg) => { const n = Number(arg); const m = box[n - 1]; return m && !marked.has(n) ? { m, n } : null; };
        const stuff = (text) => text.split("\r\n").slice(0, -1).map((l) => (l.startsWith(".") ? "." + l : l)).join("\r\n");
        const onData = (d) => {
            buf += d.toString("latin1");
            let i;
            while ((i = buf.indexOf("\r\n")) >= 0) {
                const line = buf.slice(0, i); buf = buf.slice(i + 2);
                const [cmd0, ...args] = line.split(" ");
                const cmd = cmd0.toUpperCase();
                if (cmd === "CAPA") { w("+OK capabilities follow"); w("USER"); w("UIDL"); w("TOP"); if (!tls) w("STLS"); w("."); continue; }
                if (cmd === "QUIT") {
                    if (state === "trans") { const before = box.length; box = box.filter((_, k) => !marked.has(k + 1)); log.deleted += before - box.length; }
                    if (mine) locked = false;
                    w(`+OK bye, ${box.length} messages left`); sock.end(); return;
                }
                if (cmd === "NOOP" && state === "trans") { w("+OK"); continue; }
                if (state === "auth") {
                    if (cmd === "STLS") {
                        if (tls) { w("-ERR already in TLS"); continue; }
                        w("+OK begin TLS");
                        sock.removeListener("data", onData);
                        const t = new TLSSocket(sock, { isServer: true, secureContext: ctx });
                        t.on("error", () => {});
                        t.on("data", onData);
                        sock = t; tls = true; log.stls++; buf = "";
                        return;
                    }
                    if (cmd === "USER") { if (!tls) { w("-ERR use STLS first: no passwords in clear text"); continue; } user = args[0]; w("+OK"); continue; }
                    if (cmd === "PASS") {
                        if (user !== "desk" || args.join(" ") !== "s3cret") { user = null; w("-ERR [AUTH] invalid user name or password"); continue; }
                        if (locked) { w("-ERR [IN-USE] maildrop already locked"); continue; }
                        locked = true; mine = true; state = "trans"; log.logins++; w("+OK maildrop locked and ready"); continue;
                    }
                    w("-ERR sign in first"); continue;
                }
                if (cmd === "STAT") { const l = live(); w(`+OK ${l.length} ${l.reduce((a, m) => a + Buffer.byteLength(m.text), 0)}`); }
                else if (cmd === "LIST" || cmd === "UIDL") {
                    const val = (m) => (cmd === "LIST" ? Buffer.byteLength(m.text) : `uid-${m.uid}`);
                    if (args[0]) { const f = find(args[0]); if (!f) w("-ERR no such message"); else w(`+OK ${f.n} ${val(f.m)}`); continue; }
                    w("+OK"); for (const m of live()) w(`${m.n} ${val(m)}`); w(".");
                } else if (cmd === "RETR") {
                    const f = find(args[0]); if (!f) { w("-ERR no such message"); continue; }
                    log.retr++; w(`+OK ${Buffer.byteLength(f.m.text)} octets`); w(stuff(f.m.text)); w(".");
                } else if (cmd === "TOP") {
                    const f = find(args[0]), n = Number(args[1]);
                    if (!f || !(n >= 0)) { w("-ERR no such message or bad line count"); continue; }
                    const lines = f.m.text.split("\r\n"); const blank = lines.indexOf("");
                    w("+OK"); w(stuff(lines.slice(0, blank + 1 + n).join("\r\n") + "\r\n")); w(".");
                } else if (cmd === "DELE") {
                    const f = find(args[0]); if (!f) { w("-ERR no such message"); continue; }
                    marked.add(f.n); w(`+OK message ${f.n} deleted`);
                } else if (cmd === "RSET") { marked.clear(); w(`+OK ${live().length} messages`); }
                else w("-ERR unknown command");
            }
        };
        raw.on("error", () => {});
        raw.on("close", () => { if (mine) locked = false; });
        raw.on("data", onData);
        w("+OK POP3 stand-in ready");
    }).listen(port, "127.0.0.1");

    return {
        env: { POP3_URL: `pop3://desk:s3cret@127.0.0.1:${port}`, POP3_CA: ca },
        close: () => server.close(),
        check: () => {
            if (!log.stls) return "the POP3 server saw no STLS";
            if (!log.logins) return "nobody signed in to the POP3 server";
            if (!log.retr) return "no message was downloaded (RETR)";
            if (!log.deleted) return "no deletion was committed by QUIT";
            return null;
        },
    };
}
