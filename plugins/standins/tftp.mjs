// A TFTP server for the tftp plugin's test, on node:dgram, written from RFC 1350 with the
// option extension (RFC 2347) and its blksize (2348), timeout and tsize (2349) options: each
// transfer from a port of its own (its transfer ID), lock-step DATA and ACK, a block shorter
// than the block size ending it, retransmission on its own timeout only (never on a
// duplicate ACK), and the errors of RFC 1350 (file not found, access violation, file exists).
//
// Its files, in memory: a phone's configuration, a 100,000-byte firmware image (block 5 of
// it is "lost" the first time, so the client must ask again) and a boot menu in text.
// Writes are taken under backups/ only. TFTP_HOST points the example at it; port + 1 is
// given as TFTP_SERVE_PORT for the example's own server.
import { createSocket } from "node:dgram";

const phone = `<?xml version="1.0" encoding="UTF-8"?>
<device>
  <deviceProtocol>SIP</deviceProtocol>
  <sshUserId>admin</sshUserId>
  <devicePool><name>Hall-2</name><dateTimeSetting><timeZone>W. Europe Standard/Daylight Time</timeZone></dateTimeSetting></devicePool>
  <sipProfile><sipProxies><backupProxy>10.0.0.6</backupProxy><backupProxyPort>5060</backupProxyPort></sipProxies>
  <sipLines><line button="1"><featureLabel>Line 3 office</featureLabel><name>4103</name><displayName>Line 3 office</displayName><proxy>10.0.0.5</proxy><port>5060</port><authName>4103</authName></line></sipLines></sipProfile>
  <loadInformation>sip78xx.14-2-1-0001-14</loadInformation>
  <vendorConfig><disableSpeaker>false</disableSpeaker><pcPort>0</pcPort><settingsAccess>1</settingsAccess><webAccess>0</webAccess></vendorConfig>
  <commonProfile><phonePassword></phonePassword><backgroundImageAccess>true</backgroundImageAccess><callLogBlfEnabled>2</callLogBlfEnabled></commonProfile>
  <directoryURL>http://10.0.0.5/directory.xml</directoryURL>
  <servicesURL>http://10.0.0.5/services.xml</servicesURL>
</device>
`;
const firmware = Buffer.alloc(100000);
for (let i = 0; i < firmware.length; i++) firmware[i] = (i * 7 + (i >> 8)) & 0xff;

// Binds a UDP socket, trying again for a few seconds while the port is still held (the
// previous example may not have let go of it yet).
function bindUdp(sock, port, host = "127.0.0.1") {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
            const onError = (e) => {
                sock.off("listening", onListening);
                if (e.code === "EADDRINUSE" && ++tries < 40) setTimeout(attempt, 100);
                else reject(e);
            };
            const onListening = () => { sock.off("error", onError); resolve(); };
            sock.once("error", onError);
            sock.once("listening", onListening);
            sock.bind(port, host);
        };
        attempt();
    });
}

export async function start({ port }) {
    const files = new Map([
        ["SEP001122334455.cnf.xml", Buffer.from(phone)],
        ["firmware/phone-9.4.bin", firmware],
        ["boot/menu.txt", Buffer.from("default linux\nlabel linux\n  kernel vmlinuz\n  append initrd=initrd.img\n")],
    ]);
    const seen = { rrq: 0, wrq: 0, oack: 0, lost: false, recovered: false, done: [], problems: [] };
    const main = createSocket("udp4");
    const err = (sock, to, code, msg) => { const b = Buffer.alloc(5 + msg.length); b.writeUInt16BE(5, 0); b.writeUInt16BE(code, 2); b.write(msg, 4); sock.send(b, to.port, to.address); };
    main.on("message", (m, client) => {
        const opcode = m.readUInt16BE(0);
        if (opcode !== 1 && opcode !== 2) { err(main, client, 4, "illegal TFTP operation"); return; }
        const f = m.subarray(2).toString("latin1").split("\0");
        const [name, modeRaw, ...rest] = f; const mode = (modeRaw ?? "").toLowerCase();
        if (f[f.length - 1] !== "") seen.problems.push("a request whose strings are not each ended by a zero byte");
        const opts = {}; for (let i = 0; i + 1 < rest.length; i += 2) if (rest[i]) opts[rest[i].toLowerCase()] = rest[i + 1];
        const sock = createSocket("udp4"); // the transfer ID
        sock.bind(0, "127.0.0.1", () => transfer(sock, opcode, name, mode, opts, client));
    });
    function transfer(sock, opcode, name, mode, opts, client) {
        // closed a moment later, so the last packet sent is on its way first
        const close = () => { clearTimeout(timer); setTimeout(() => { try { sock.close(); } catch {} }, 100); };
        let timer = null, last = null, tries = 0;
        let blksize = 512, timeout = 2000;
        const reply = [];
        if (opts.blksize) { const b = Math.min(Number(opts.blksize), 1468); if (b >= 8) { blksize = b; reply.push(["blksize", String(b)]); } }
        if (opts.timeout) { const t = Number(opts.timeout); if (t >= 1 && t <= 255) { timeout = t * 1000; reply.push(["timeout", String(t)]); } }
        const send = (b) => { last = b; tries = 0; sock.send(b, client.port, client.address); arm(); };
        const arm = () => { clearTimeout(timer); timer = setTimeout(() => { if (++tries > 5) { close(); return; } sock.send(last, client.port, client.address); arm(); }, timeout); };
        const oack = () => Buffer.concat([Buffer.from([0, 6]), ...reply.map(([k, v]) => Buffer.from(`${k}\0${v}\0`))]);
        if (mode !== "octet" && mode !== "netascii") { err(sock, client, 4, "unknown mode"); return close(); }
        if (opcode === 1) {
            seen.rrq++;
            let data = files.get(name);
            if (!data) { err(sock, client, 1, "File not found"); return close(); }
            if (mode === "netascii") data = Buffer.from(data.toString("latin1").replace(/\r/g, "\r\0").replace(/\n/g, "\r\n"), "latin1");
            if ("tsize" in opts) reply.push(["tsize", String(data.length)]);
            let blockNo = 0, lostOnce = false;
            const dataBlock = (n) => { const start = (n - 1) * blksize; const b = Buffer.alloc(4 + Math.max(0, Math.min(blksize, data.length - start))); b.writeUInt16BE(3, 0); b.writeUInt16BE(n & 0xffff, 2); data.copy(b, 4, start, start + blksize); return b; };
            const next = () => {
                blockNo++;
                const b = dataBlock(blockNo);
                if (name.startsWith("firmware/") && blockNo === 5 && !seen.lost) { seen.lost = true; lostOnce = true; last = b; tries = 0; arm(); return; } // "lost" on the wire
                send(b);
            };
            sock.on("message", (m, from) => {
                if (from.port !== client.port || from.address !== client.address) { err(sock, from, 5, "Unknown transfer ID"); return; }
                const op = m.readUInt16BE(0);
                if (op === 5) return close();
                if (op !== 4) { err(sock, client, 4, "expected an ACK"); return close(); }
                const n = m.readUInt16BE(2);
                if (n !== (blockNo & 0xffff)) return; // a duplicate: wait for our own timeout
                if (lostOnce && blockNo === 5) { seen.recovered = true; lostOnce = false; }
                if (blockNo > 0 && (blockNo - 1) * blksize + blksize > data.length) { seen.done.push(`get ${name}`); return close(); }
                next();
            });
            if (reply.length) { seen.oack++; send(oack()); } else next();
            return;
        }
        seen.wrq++;
        if (!name.startsWith("backups/") || name.includes("..")) { err(sock, client, 2, "Access violation"); return close(); }
        if (files.has(name)) { err(sock, client, 6, "File already exists"); return close(); }
        if ("tsize" in opts) reply.push(["tsize", opts.tsize]);
        const parts = []; let want = 1;
        const ack = (n) => { const b = Buffer.alloc(4); b.writeUInt16BE(4, 0); b.writeUInt16BE(n & 0xffff, 2); return b; };
        sock.on("message", (m, from) => {
            if (from.port !== client.port || from.address !== client.address) { err(sock, from, 5, "Unknown transfer ID"); return; }
            const op = m.readUInt16BE(0);
            if (op === 5) return close();
            if (op !== 3) { err(sock, client, 4, "expected DATA"); return close(); }
            const n = m.readUInt16BE(2);
            if (n === ((want - 1) & 0xffff)) { sock.send(ack(n), client.port, client.address); return; } // our ACK was lost
            if (n !== (want & 0xffff)) return;
            const d = m.subarray(4);
            if (d.length > blksize) { err(sock, client, 4, "block larger than agreed"); return close(); }
            parts.push(Buffer.from(d)); want++;
            if (d.length < blksize) {
                let body = Buffer.concat(parts);
                if (mode === "netascii") body = Buffer.from(body.toString("latin1").replace(/\r\n/g, "\n").replace(/\r\0/g, "\r"), "latin1");
                if (opts.tsize && Number(opts.tsize) !== Buffer.concat(parts).length) seen.problems.push(`a write that announced ${opts.tsize} bytes and sent ${Buffer.concat(parts).length}`);
                files.set(name, body); seen.done.push(`put ${name}`);
                sock.send(ack(n), client.port, client.address);
                return close();
            }
            send(ack(n));
        });
        if (reply.length) { seen.oack++; send(oack()); } else send(ack(0));
    }
    await bindUdp(main, port);
    return {
        env: { TFTP_HOST: `127.0.0.1:${port}`, TFTP_SERVE_PORT: String(port + 1) },
        close: () => main.close(),
        files,
        check: () => {
            if (seen.problems.length) return `the TFTP stand-in saw: ${[...new Set(seen.problems)].join("; ")}`;
            if (!seen.oack) return "no request to the TFTP stand-in had options";
            if (!seen.done.some((d) => d.startsWith("put backups/"))) return `no file was written to the TFTP stand-in (${seen.done.join(", ")})`;
            if (!seen.recovered) return "the firmware's lost block was never asked for again";
            return null;
        },
    };
}
