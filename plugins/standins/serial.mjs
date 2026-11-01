// A scale on a pseudo-terminal for serial.qwe: python3's `pty` module holds the master end and
// the example opens the slave as its serial port, the bytes going through the kernel's tty layer
// as they do for a USB adapter. Written from a bench scale's manual for its `ST,GS,+  12.345kg`
// lines, and Mettler Toledo's MT-SICS reference for `SI` and `S S     100.00 g`.
import { spawn } from "node:child_process";

const SCALE = `
import os, pty, sys, termios, time, tty, select
master, slave = pty.openpty()
tty.setraw(slave)
print(os.ttyname(slave), flush=True)
buf = b""
while True:
    r, _, _ = select.select([master, 0], [], [], 0.2)
    if 0 in r:
        if os.read(0, 16) == b"":
            break
    if master not in r:
        continue
    try:
        buf += os.read(master, 1024)
    except OSError:
        continue
    while b"\\n" in buf:
        line, buf = buf.split(b"\\n", 1)
        cmd = line.rstrip(b"\\r").decode("latin1")
        print("got " + cmd, flush=True)
        if cmd == "W":
            os.write(master, b"ST,GS,+  12.345kg\\r\\n")
        elif cmd == "SI":
            os.write(master, b"S S     100.00 g\\r\\n")
        elif cmd == "CONF?":
            c = termios.tcgetattr(slave)[2]
            size = {termios.CS5: 5, termios.CS6: 6, termios.CS7: 7, termios.CS8: 8}[c & termios.CSIZE]
            even = bool(c & termios.PARENB) and not (c & termios.PARODD)
            os.write(master, ("bits=%d even=%d stop2=%d\\r\\n" % (size, even, bool(c & termios.CSTOPB))).encode())
        elif cmd == "SENSOR":
            os.write(master, b"T=21.5;H")
            time.sleep(0.1)
            os.write(master, b"=40;state=ok\\r\\n")
        elif cmd == "DUMP":
            os.write(master, b"10:00 12.1\\r\\n10:05 12.2\\r\\n10:10 12.4\\r\\nEND\\r\\n")
        elif cmd == "PROMPT":
            os.write(master, b"ready > ")
        elif cmd == "BIN":
            os.write(master, bytes([2, 0, 255, 126]))
        elif cmd == "HALF":
            os.write(master, b"no ending")
`;

export async function start() {
    const child = spawn("python3", ["-I", "-c", SCALE], { stdio: ["pipe", "pipe", "inherit"] });
    const got = [];
    const path = await new Promise((resolve, reject) => {
        let out = "";
        child.stdout.on("data", (d) => {
            out += d;
            let i;
            while ((i = out.indexOf("\n")) >= 0) {
                const line = out.slice(0, i); out = out.slice(i + 1);
                if (line.startsWith("/dev/")) resolve(line); else got.push(line.slice(4));
            }
        });
        child.on("exit", (c) => reject(new Error(`python3 left with ${c}`)));
    });
    child.removeAllListeners("exit");
    return {
        env: { SERIAL_PORT: path },
        close() { child.stdin.end(); setTimeout(() => child.kill(), 300); },
        check() {
            for (const c of ["W", "SI", "CONF?", "SENSOR", "BIN"]) if (!got.includes(c)) return `the scale never got ${c}`;
            return null;
        },
    };
}
