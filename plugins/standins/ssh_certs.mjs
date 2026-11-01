// Real OpenSSH certificates for the ssh_certs plugin's test, made here at start by `ssh-keygen -s`,
// keys and all (nothing stored): an Ed25519 CA, a passphrase-locked CA, an RSA CA, user and host
// certificates, one that ended, one not begun, one limited by force-command and source-address, one
// with no principals, one with a critical option sshd does not know, and one with a flipped byte.
// POST /inspect runs `ssh-keygen -L` over what the plugin signed, which refuses a bad signature, and
// says what it printed.
//
//   start({ port }) -> { env: { SSH_CERT_SAMPLES }, close(), check() }
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function start({ port }) {
    const dir = mkdtempSync(join(tmpdir(), "sshcert-"));
    const f = (n) => join(dir, n);
    const kg = (...a) => execFileSync("ssh-keygen", a, { stdio: ["ignore", "pipe", "pipe"] }).toString();
    kg("-t", "ed25519", "-N", "", "-C", "ca", "-f", f("ca"));
    kg("-t", "ed25519", "-N", "open sesame", "-C", "locked", "-f", f("locked"));
    kg("-t", "rsa", "-b", "2048", "-N", "", "-C", "rsa ca", "-f", f("rsaca"));
    kg("-t", "ed25519", "-N", "", "-C", "ada@laptop", "-f", f("user"));
    const sign = (name, ca, ...opts) => {
        writeFileSync(f(`${name}.pub`), readFileSync(f("user.pub")));
        kg("-s", f(ca), ...opts, f(`${name}.pub`));
        return readFileSync(f(`${name}-cert.pub`), "utf8");
    };
    const user = sign("c1", "ca", "-I", "ada@laptop", "-n", "ada,deploy", "-z", "1001", "-V", "-5m:+1h");
    const flipped = user.split(" ");
    const b = Buffer.from(flipped[1], "base64"); b[b.length - 200] ^= 1; flipped[1] = b.toString("base64");
    const samples = {
        user,
        host: sign("c2", "ca", "-h", "-I", "web1", "-n", "web1.example.com", "-V", "-5m:+1h"),
        limited: sign("c3", "ca", "-I", "backup", "-n", "backup", "-V", "-5m:+1h", "-O", "force-command=/usr/local/bin/backup", "-O", "source-address=10.0.0.0/8"),
        forever: sign("c4", "ca", "-I", "forever", "-n", "ada"),
        rsa_ca: sign("c5", "rsaca", "-I", "rsa", "-n", "ada", "-V", "-5m:+1h"),
        expired: sign("c6", "ca", "-I", "old", "-n", "ada", "-V", "20200101:20200201"),
        future: sign("c7", "ca", "-I", "soon", "-n", "ada", "-V", "+1d:+2d"),
        anyone: sign("c8", "ca", "-I", "anyone", "-V", "-5m:+1h"),
        strange: sign("c9", "ca", "-I", "odd", "-n", "ada", "-V", "-5m:+1h", "-O", "critical:quillo-custom@example.com=yes"),
        tampered: flipped.join(" "),
        user_key: readFileSync(f("user.pub"), "utf8"),
        ca_public: readFileSync(f("ca.pub"), "utf8"),
        ca_fingerprint: kg("-l", "-E", "sha256", "-f", f("ca.pub")).split(" ")[1],
        rsa_public: readFileSync(f("rsaca.pub"), "utf8"),
        locked_ca: readFileSync(f("locked"), "utf8"),
    };
    const stats = { samples: 0, inspected: 0, accepted: 0 };
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            res.writeHead(200, { "content-type": "application/json" });
            if (req.url === "/sample") { stats.samples++; return res.end(JSON.stringify(samples)); }
            if (req.url === "/inspect") {
                stats.inspected++;
                writeFileSync(f("got-cert.pub"), JSON.parse(raw).cert + "\n");
                try {
                    const text = kg("-L", "-f", f("got-cert.pub"));
                    stats.accepted++;
                    const want = /Type: \S+ (user|host) certificate|Key ID: .*|Serial: \d+|force-command .*|source-address .*/g;
                    return res.end(JSON.stringify({ ok: true, lines: (text.match(want) ?? []).map((l) => l.trim()) }));
                } catch (e) { return res.end(JSON.stringify({ ok: false, error: String(e.stderr ?? e) })); }
            }
            res.end("{}");
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { SSH_CERT_SAMPLES: `http://127.0.0.1:${port}` },
        close() { server.close(); server.closeAllConnections?.(); rmSync(dir, { recursive: true, force: true }); },
        check: () => (!stats.samples ? "no sample was fetched" : !stats.accepted ? "ssh-keygen accepted nothing the plugin signed" : null),
    };
}
