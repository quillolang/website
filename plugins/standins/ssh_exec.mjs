// Real OpenSSH for the ssh_exec plugin's test: see sftp_sshd.mjs. An ed25519 client key.
import { startSshd } from "./sftp_sshd.mjs";

export async function start({ ports }) {
    const s = await startSshd({ ports, clientKeyType: "ed25519" });
    return {
        env: { SSH_EXEC_HOST: `127.0.0.1:${ports[0]}`, SSH_EXEC_OTHER_HOST: `127.0.0.1:${ports[1]}`, SSH_EXEC_USER: s.user, SSH_EXEC_KEY_FILE: s.clientKey, SSH_EXEC_HOST_KEY: s.fingerprint, STANDIN_FINGERPRINT: s.fingerprint, STANDIN_OTHER_FINGERPRINT: s.otherFingerprint },
        close() { s.close(); },
        check() { return null; },
    };
}
