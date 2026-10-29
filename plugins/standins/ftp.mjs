// An FTP server for ftp.qwe, after RFC 959 with FTPS (AUTH TLS, PBSZ, PROT; RFC 4217), MLSD, SIZE
// and MDTM (RFC 3659) and EPSV (RFC 2428). As servers set to force TLS do, it refuses USER before
// AUTH TLS and data connections before PROT P. Passive data connections come on ports of their own
// and are TLS too (the test certificate of proto_tls.mjs). It takes USER and PASS (partner /
// s3cret), SYST, FEAT, OPTS, TYPE, PWD, CWD, CDUP, MKD, RMD, DELE, RNFR and RNTO, SIZE, MDTM, PASV,
// EPSV, LIST, NLST, MLSD, RETR, STOR, APPE, NOOP and QUIT, over files in memory.
import { createServer } from "node:net";
import { TLSSocket, createSecureContext } from "node:tls";
import { ca, cert, key } from "./proto_tls.mjs";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n) => String(n).padStart(2, "0");
const mdtm = (d) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;

export async function start({ port, ports }) {
    const ctx = createSecureContext({ key, cert });
    const files = new Map([
        ["/outbox/orders-2026-10-30.csv", { data: Buffer.from("order,sku,qty\n1042,SKU-7,3\n1043,SKU-9,1\n"), mtime: new Date("2026-10-30T06:00:00Z") }],
        ["/readme.txt", { data: Buffer.from("Drop invoices in /inbox. Orders appear in /outbox each morning.\n"), mtime: new Date("2026-01-05T09:30:00Z") }],
    ]);
    const dirs = new Set(["/", "/outbox", "/inbox"]);
    const log = { logins: 0, tls: 0, stored: [], retrieved: 0, listed: 0, renamed: 0, deleted: 0 };
    let nextData = 0;

    const server = createServer((raw) => {
        let sock = raw, buf = "", user = null, authed = false, tls = false, prot = false, cwd = "/", rnfr = null, data = null;
        const w = (s) => sock.write(s + "\r\n");
        const abs = (p) => {
            const parts = (p?.startsWith("/") ? p : `${cwd}/${p ?? ""}`).split("/");
            const out = [];
            for (const x of parts) { if (x === "" || x === ".") continue; if (x === "..") out.pop(); else out.push(x); }
            return "/" + out.join("/");
        };
        const children = (d) => {
            const pre = d === "/" ? "/" : d + "/";
            const names = new Map();
            for (const f of files.keys()) if (f.startsWith(pre) && !f.slice(pre.length).includes("/")) names.set(f.slice(pre.length), { file: files.get(f) });
            for (const x of dirs) if (x !== d && x.startsWith(pre) && !x.slice(pre.length).includes("/")) names.set(x.slice(pre.length), { dir: true });
            return [...names].sort();
        };
        // A passive listener; the transfer waits for the client's connection on it.
        const passive = () => new Promise((resolve, reject) => {
            data?.server.close();
            const d = { server: null, sock: null, waiters: [] };
            data = d;
            let tries = 0;
            const listen = () => {
                const p = ports[1 + (nextData++ % 3)];
                d.server = createServer((s) => { d.sock = s; s.on("error", () => {}); d.waiters.forEach((f) => f(s)); d.waiters = []; d.server.close(); });
                d.server.once("error", () => (++tries < 6 ? listen() : reject(new Error("no free data port"))));
                d.server.listen(p, "127.0.0.1", () => resolve(p));
            };
            listen();
        });
        const transfer = async (fn) => {
            if (!data) return w("425 use PASV or EPSV first");
            if (!prot) return w("522 data connections must be encrypted: send PROT P");
            const d = data; data = null;
            const s = d.sock ?? (await new Promise((r) => { d.waiters.push(r); setTimeout(() => r(null), 5000); }));
            if (!s) return w("425 no data connection came");
            w("150 opening data connection");
            // The client starts TLS on the data connection once it has read the 150.
            const t = new TLSSocket(s, { isServer: true, secureContext: ctx });
            t.on("error", () => {});
            await new Promise((r) => t.once("secure", r));
            await fn(t);
        };
        // Ended at once after the handshake, Node's TLS socket can close before its close_notify
        // is out, and the client rightly takes the transfer as cut short: end a moment later.
        const send = (t, body) => new Promise((r) => { t.write(body); setTimeout(() => t.end(() => r()), 50); t.once("close", r); });

        const onData = (chunk) => {
            buf += chunk.toString("utf8");
            let i;
            while ((i = buf.indexOf("\r\n")) >= 0) {
                const line = buf.slice(0, i); buf = buf.slice(i + 2);
                const sp = line.indexOf(" ");
                const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase(), arg = sp < 0 ? "" : line.slice(sp + 1);
                if (cmd === "AUTH") {
                    if (!/^TLS|SSL$/i.test(arg)) { w("504 AUTH TLS only"); continue; }
                    w("234 AUTH TLS ok, begin the handshake");
                    sock.removeListener("data", onData);
                    const t = new TLSSocket(sock, { isServer: true, secureContext: ctx });
                    t.on("error", () => {});
                    t.on("data", onData);
                    sock = t; tls = true; log.tls++; buf = "";
                    return;
                }
                if (cmd === "QUIT") { w("221 goodbye"); sock.end(); return; }
                if (cmd === "FEAT") { w("211-Features:"); for (const f of [" MLST type*;size*;modify*;", " SIZE", " MDTM", " UTF8", " EPSV", " PASV", " AUTH TLS", " PBSZ", " PROT"]) w(f); w("211 End"); continue; }
                if (cmd === "SYST") { w("215 UNIX Type: L8"); continue; }
                if (cmd === "NOOP") { w("200 ok"); continue; }
                if (cmd === "PBSZ") { w(tls ? "200 PBSZ=0" : "503 AUTH TLS first"); continue; }
                if (cmd === "PROT") { if (!tls) { w("503 AUTH TLS first"); continue; } prot = arg.toUpperCase() === "P"; w(prot ? "200 data connections are private" : "536 only PROT P here"); continue; }
                if (cmd === "USER") { if (!tls) { w("530 this server takes passwords only over TLS: send AUTH TLS first"); continue; } user = arg; w("331 password, please"); continue; }
                if (cmd === "PASS") { if (user === "partner" && arg === "s3cret") { authed = true; log.logins++; w("230 signed in"); } else { user = null; w("530 Login incorrect."); } continue; }
                if (!authed) { w("530 sign in first"); continue; }
                const target = abs(arg);
                switch (cmd) {
                    case "OPTS": w("200 ok"); break;
                    case "TYPE": w(/^[AI]/i.test(arg) ? `200 type set to ${arg[0].toUpperCase()}` : "504 type not served"); break;
                    case "PWD": w(`257 "${cwd}" is the current directory`); break;
                    case "CWD": if (dirs.has(target)) { cwd = target; w("250 ok"); } else w(`550 ${arg}: no such directory`); break;
                    case "CDUP": cwd = abs(".."); w("250 ok"); break;
                    case "MKD": if (dirs.has(target) || files.has(target)) w(`550 ${arg}: already there`); else if (!dirs.has(abs(target + "/.."))) w(`550 ${arg}: the folder above is missing`); else { dirs.add(target); w(`257 "${target}" created`); } break;
                    case "RMD": if (!dirs.has(target)) w(`550 ${arg}: no such directory`); else if (children(target).length) w(`550 ${arg}: not empty`); else { dirs.delete(target); w("250 removed"); } break;
                    case "DELE": if (!files.has(target)) w(`550 ${arg}: no such file`); else { files.delete(target); log.deleted++; w("250 deleted"); } break;
                    case "RNFR": if (!files.has(target) && !dirs.has(target)) w(`550 ${arg}: no such file`); else { rnfr = target; w("350 ready for RNTO"); } break;
                    case "RNTO": if (!rnfr) { w("503 RNFR first"); break; } if (files.has(rnfr)) { files.set(target, files.get(rnfr)); files.delete(rnfr); } else { dirs.add(target); dirs.delete(rnfr); } rnfr = null; log.renamed++; w("250 renamed"); break;
                    case "SIZE": if (files.has(target)) w(`213 ${files.get(target).data.length}`); else w(`550 ${arg}: no such file`); break;
                    case "MDTM": if (files.has(target)) w(`213 ${mdtm(files.get(target).mtime)}`); else w(`550 ${arg}: no such file`); break;
                    case "PASV": passive().then((p) => w(`227 Entering Passive Mode (127,0,0,1,${p >> 8},${p & 255})`), () => w("425 no data port free")); break;
                    case "EPSV": passive().then((p) => w(`229 Entering Extended Passive Mode (|||${p}|)`), () => w("425 no data port free")); break;
                    case "LIST": case "NLST": case "MLSD": {
                        const dir = arg && !arg.startsWith("-") ? target : cwd;
                        if (!dirs.has(dir)) { w(`550 ${arg}: no such directory`); break; }
                        transfer(async (t) => {
                            const lines = children(dir).map(([name, e]) => {
                                if (cmd === "NLST") return name;
                                const size = e.dir ? 0 : e.file.data.length, when = e.dir ? new Date("2026-10-01T00:00:00Z") : e.file.mtime;
                                if (cmd === "MLSD") return `type=${e.dir ? "dir" : "file"};size=${size};modify=${mdtm(when)}; ${name}`;
                                return `${e.dir ? "d" : "-"}rw-r--r--   1 partner  partner  ${String(size).padStart(8)} ${MON[when.getUTCMonth()]} ${p2(when.getUTCDate())} ${p2(when.getUTCHours())}:${p2(when.getUTCMinutes())} ${name}`;
                            });
                            await send(t, lines.map((l) => l + "\r\n").join(""));
                            log.listed++; w("226 listing sent");
                        });
                        break;
                    }
                    case "RETR": {
                        const f = files.get(target);
                        if (!f) { w(`550 ${arg}: no such file`); break; }
                        transfer(async (t) => { await send(t, f.data); log.retrieved++; w("226 transfer complete"); });
                        break;
                    }
                    case "STOR": case "APPE": {
                        if (!dirs.has(abs(target + "/.."))) { w(`553 ${arg}: no such folder`); break; }
                        transfer(async (t) => {
                            const got = [];
                            t.on("data", (c) => got.push(c));
                            await new Promise((r) => { t.once("end", r); t.once("close", r); });
                            const body = Buffer.concat(got);
                            const old = cmd === "APPE" ? files.get(target)?.data ?? Buffer.alloc(0) : Buffer.alloc(0);
                            files.set(target, { data: Buffer.concat([old, body]), mtime: new Date() });
                            log.stored.push(target);
                            t.end();
                            w("226 stored");
                        });
                        break;
                    }
                    default: w(`502 ${cmd} not implemented`);
                }
            }
        };
        raw.on("error", () => {});
        raw.on("data", onData);
        w("220 FTP stand-in ready");
    }).listen(port, "127.0.0.1");

    return {
        env: { FTP_URL: `ftpes://partner:s3cret@127.0.0.1:${port}/`, FTP_CA: ca },
        close: () => server.close(),
        check: () => {
            if (!log.tls) return "the FTP server saw no AUTH TLS";
            if (!log.logins) return "nobody signed in to the FTP server";
            if (!log.listed) return "no listing was sent";
            if (!log.stored.length) return "no file was uploaded";
            if (!log.retrieved) return "no file was downloaded";
            return null;
        },
    };
}
