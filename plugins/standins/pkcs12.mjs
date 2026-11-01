// Real .p12 files for the pkcs12 plugin's test, made here at start by the `openssl` command (none is
// kept in the repository): a root and an intermediate CA, a leaf with an RSA key and another with
// a P-256 key. /sample/modern is AES-256-CBC with PBKDF2 and a SHA-256 MAC, the leaf and both CAs;
// /sample/ec the P-256 leaf; /sample/nopass the same with an empty password; /sample/old uses
// RC2-40 and /sample/des3 3DES (OpenSSL's own legacy choices). POST /check takes { password, file }
// (base64), written by the plugin, and tries it two ways that are not the plugin: Node's TLS
// (OpenSSL in-process) and `openssl pkcs12 -noout`.
//
//   start({ port }) -> { env: { PKCS12_SAMPLES }, close(), check() }
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createSecureContext } from "node:tls";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function start({ port }) {
    const dir = mkdtempSync(join(tmpdir(), "p12-"));
    const f = (n) => join(dir, n);
    const ssl = (...a) => execFileSync("openssl", a, { stdio: ["ignore", "pipe", "pipe"] });
    const PASS = "pass:correct horse";
    ssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", f("root.key"), "-out", f("root.pem"), "-subj", "/O=Quillo Test/CN=Quillo Root", "-days", "3650");
    ssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", f("ica.key"), "-out", f("ica.csr"), "-subj", "/O=Quillo Test/CN=Quillo Issuing");
    writeFileSync(f("ca.ext"), "basicConstraints=critical,CA:TRUE\n");
    ssl("x509", "-req", "-in", f("ica.csr"), "-CA", f("root.pem"), "-CAkey", f("root.key"), "-CAcreateserial", "-out", f("ica.pem"), "-days", "3650", "-extfile", f("ca.ext"));
    ssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", f("leaf.key"), "-out", f("leaf.csr"), "-subj", "/CN=shop.example.com");
    ssl("x509", "-req", "-in", f("leaf.csr"), "-CA", f("ica.pem"), "-CAkey", f("ica.key"), "-CAcreateserial", "-out", f("leaf.pem"), "-days", "365");
    ssl("req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", f("ec.key"), "-out", f("ec.csr"), "-subj", "/CN=ec.example.com");
    ssl("x509", "-req", "-in", f("ec.csr"), "-CA", f("ica.pem"), "-CAkey", f("ica.key"), "-CAcreateserial", "-out", f("ec.pem"), "-days", "365");
    writeFileSync(f("chain.pem"), readFileSync(f("ica.pem")) + "" + readFileSync(f("root.pem")));
    const make = (name, cert, key, pass, ...extra) => { ssl("pkcs12", "-export", "-in", f(cert), "-inkey", f(key), "-certfile", f("chain.pem"), "-passout", pass, "-out", f(name), "-name", "Shop web", ...extra); return readFileSync(f(name)).toString("base64"); };
    const modern = ["-keypbe", "AES-256-CBC", "-certpbe", "AES-256-CBC", "-macalg", "sha256"];
    const samples = {
        modern: make("modern.p12", "leaf.pem", "leaf.key", PASS, ...modern),
        ec: make("ec.p12", "ec.pem", "ec.key", PASS, ...modern),
        nopass: make("nopass.p12", "ec.pem", "ec.key", "pass:", ...modern),
        des3: make("des3.p12", "leaf.pem", "leaf.key", PASS, "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1"),
    };
    try { samples.old = make("old.p12", "leaf.pem", "leaf.key", PASS, "-legacy"); } catch { samples.old = samples.des3; }
    const stats = { samples: 0, checks: 0, passed: 0 };
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const m = req.url.match(/^\/sample\/(\w+)$/);
            if (m && samples[m[1]]) { stats.samples++; res.writeHead(200, { "content-type": "text/plain" }); return res.end(samples[m[1]]); }
            if (req.url === "/check") {
                stats.checks++;
                const { password, file } = JSON.parse(raw);
                const out = { node: false, command: false };
                const der = Buffer.from(file, "base64");
                try { createSecureContext({ pfx: der, passphrase: password }); out.node = true; } catch (e) { out.nodeError = e.message; }
                try { writeFileSync(f("got.p12"), der); ssl("pkcs12", "-in", f("got.p12"), "-passin", `pass:${password}`, "-noout"); out.command = true; } catch (e) { out.commandError = String(e.stderr ?? e); }
                if (out.node && out.command) stats.passed++;
                res.writeHead(200, { "content-type": "application/json" });
                return res.end(JSON.stringify(out));
            }
            res.writeHead(404); res.end();
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { PKCS12_SAMPLES: `http://127.0.0.1:${port}` },
        close() { server.close(); server.closeAllConnections?.(); rmSync(dir, { recursive: true, force: true }); },
        check: () => (!stats.samples ? "no sample was fetched" : !stats.checks ? "no written file was checked" : !stats.passed ? "OpenSSL did not open the written file" : null),
    };
}
