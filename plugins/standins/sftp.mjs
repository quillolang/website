// Real OpenSSH for the sftp plugin's test, /usr/libexec/sftp-server behind it: see sftp_sshd.mjs. An
// RSA client key, so that rsa-sha2 signatures are tried; a symlink and a folder the user may not
// write to are made first.
import { startSshd } from "./sftp_sshd.mjs";
import { mkdirSync, symlinkSync, chmodSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function start({ ports }) {
    const s = await startSshd({ ports, clientKeyType: "rsa" });
    const root = join(s.home, "drop");
    mkdirSync(join(root, "out"), { recursive: true });
    writeFileSync(join(root, "target.txt"), "x");
    symlinkSync(join(root, "target.txt"), join(root, "link.txt"));
    const locked = join(s.home, "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    const downloads = join(s.dir, "downloads");
    mkdirSync(downloads);
    return {
        env: { SFTP_HOST: `127.0.0.1:${ports[0]}`, SFTP_USER: s.user, SFTP_KEY_FILE: s.clientKey, SFTP_HOST_KEY: s.fingerprint, SFTP_ROOT: root, SFTP_LOCKED: locked, SFTP_DOWNLOADS: downloads },
        close() { chmodSync(locked, 0o700); s.close(); },
        check() {
            if (!existsSync(join(root, "in", "b.csv"))) return "b.csv did not reach the server";
            if (readFileSync(join(root, "in", "b.csv"), "utf8") !== "id,total\n1,12\n") return "b.csv arrived changed";
            if (!existsSync(join(downloads, "copy.txt"))) return "the download did not reach the local path";
            return null;
        },
    };
}
