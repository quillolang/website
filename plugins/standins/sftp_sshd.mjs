// This Mac's own OpenSSH server as a stand-in, shared by the sftp and ssh_exec tests: /usr/sbin/sshd
// run as the current user on a high port, with a throwaway host key, client key and authorized_keys
// in a temporary folder, password login off (a server not run as root cannot check passwords), and
// /usr/libexec/sftp-server for the sftp subsystem. So those two plugins are tried against real
// OpenSSH, not a written-up copy of it. Also a second listener that is a wrong host, with another
// host key, to see pinning refuse it.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, mkdirSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keygen = (file, type) => execFileSync("/usr/bin/ssh-keygen", ["-q", "-t", type, ...(type === "rsa" ? ["-b", "2048"] : []), "-N", "", "-f", file], { stdio: "pipe" });
const fingerprint = (file) => execFileSync("/usr/bin/ssh-keygen", ["-l", "-E", "sha256", "-f", file]).toString().split(" ")[1];

export async function startSshd({ ports, clientKeyType }) {
    const dir = mkdtempSync(join(tmpdir(), "sshd-standin-"));
    chmodSync(dir, 0o700);
    const hostKey = join(dir, "host_key"), clientKey = join(dir, "client_key");
    keygen(hostKey, "ed25519");
    keygen(clientKey, clientKeyType);
    const allowed = join(dir, "authorized_keys");
    writeFileSync(allowed, readFileSync(clientKey + ".pub"));
    chmodSync(allowed, 0o600);
    const home = join(dir, "home");
    mkdirSync(home);
    const config = (port, key, name) => {
        const f = join(dir, `${name}.conf`);
        writeFileSync(f, [`Port ${port}`, "ListenAddress 127.0.0.1", `HostKey ${key}`, `PidFile ${join(dir, name + ".pid")}`, `AuthorizedKeysFile ${allowed}`, "StrictModes no", "UsePAM no", "PasswordAuthentication no", "KbdInteractiveAuthentication no", "PubkeyAuthentication yes", `AllowUsers ${userInfo().username}`, "Subsystem sftp /usr/libexec/sftp-server", "LogLevel ERROR", ""].join("\n"));
        return f;
    };
    const otherKey = join(dir, "other_host_key");
    keygen(otherKey, "ed25519");
    const log = [];
    const run = (conf) => {
        const p = spawn("/usr/sbin/sshd", ["-D", "-e", "-f", conf], { stdio: ["ignore", "pipe", "pipe"] });
        p.stderr.on("data", (d) => log.push(String(d)));
        p.stdout.on("data", (d) => log.push(String(d)));
        return p;
    };
    const main = run(config(ports[0], hostKey, "main")), other = run(config(ports[1], otherKey, "other"));
    const up = (port) => new Promise((ok) => { const s = connect(port, "127.0.0.1"); s.on("connect", () => { s.destroy(); ok(true); }); s.on("error", () => ok(false)); });
    for (let i = 0; i < 100 && !(await up(ports[0]) && await up(ports[1])); i++) await sleep(50);
    return {
        dir, home, clientKey, log,
        user: userInfo().username,
        fingerprint: fingerprint(hostKey + ".pub"),
        otherFingerprint: fingerprint(otherKey + ".pub"),
        close() { main.kill("SIGKILL"); other.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); },
    };
}
