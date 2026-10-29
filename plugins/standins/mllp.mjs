// An HL7 interface engine on MLLP, for mllp.qwe: it receives messages in MLLP blocks (0x0B, the
// message, 0x1C 0x0D), and answers each with an ACK as HL7 v2.5 describes it: MSH with sender and
// receiver swapped, MSA with AA, AE (with an ERR segment) when an ADT message has no PID segment,
// or AR when the version is not 2.x. Once it has had a message, it sends a lab result (ORU^R01)
// to the program's own listener (MLLP_LISTEN_PORT) and checks the ACK that comes back.
import { createServer, connect } from "node:net";

const SB = 0x0b, EB = 0x1c, CR = 0x0d;
const frame = (text) => Buffer.concat([Buffer.from([SB]), Buffer.from(text, "utf8"), Buffer.from([EB, CR])]);

// Whole blocks off the front of a buffer; what is left waits for more bytes.
function unframe(state) {
    const out = [];
    for (;;) {
        const s = state.buf.indexOf(SB);
        if (s < 0) { state.buf = Buffer.alloc(0); return out; }
        let e = -1;
        for (let i = s + 1; i + 1 < state.buf.length; i++) if (state.buf[i] === EB && state.buf[i + 1] === CR) { e = i; break; }
        if (e < 0) { state.buf = state.buf.subarray(s); return out; }
        out.push(state.buf.subarray(s + 1, e).toString("utf8"));
        state.buf = state.buf.subarray(e + 2);
    }
}

function stamp() {
    return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

let ackCount = 0;
function ack(message, code, text, err) {
    const segs = message.split("\r").filter(Boolean);
    const msh = segs[0];
    const fs = msh[3], cs = msh[4];
    const f = msh.split(fs); // f[1] is MSH-2, f[n-1] is MSH-n
    const trigger = (f[8] ?? "").split(cs)[1] ?? "";
    const head = ["MSH", f[1], f[4] ?? "", f[5] ?? "", f[2] ?? "", f[3] ?? "", stamp(), "", `ACK${cs}${trigger}${cs}ACK`, `ENG${++ackCount}`, f[10] ?? "P", f[11] ?? "2.5"].join(fs);
    let out = `${head}\rMSA${fs}${code}${fs}${f[9] ?? ""}${fs}${text}\r`;
    if (err) out += `ERR${fs}${fs}${err.loc}${fs}${err.code}${cs}${err.label}${cs}HL70357${fs}E${fs}${fs}${fs}${fs}${text}\r`;
    return out;
}

export async function start({ port, ports }) {
    const got = [];
    const listenPort = ports[1];
    let sentResult = false, resultAck = null;

    function sendResult() {
        if (sentResult) return;
        sentResult = true;
        const oru = [
            `MSH|^~\\&|LAB|CITYLAB|CLINIC|QUILLO|${stamp()}||ORU^R01^ORU_R01|LAB-555|P|2.5.1`,
            "PID|1||PAT-2207^^^QUILLO^MR||Hopper^Grace",
            "OBR|1||R-88|GLU^Glucose",
            "OBX|1|NM|GLU^Glucose||5.4|mmol/L|3.9-5.6|N|||F",
        ].join("\r") + "\r";
        let tries = 0;
        const attempt = () => {
            const c = connect(listenPort, "127.0.0.1");
            const st = { buf: Buffer.alloc(0) };
            c.on("connect", () => c.write(frame(oru)));
            c.on("data", (d) => {
                st.buf = Buffer.concat([st.buf, d]);
                for (const m of unframe(st)) { resultAck = m; c.end(); }
            });
            c.on("error", () => { if (++tries < 20) setTimeout(attempt, 250); });
        };
        attempt();
    }

    const server = createServer((sock) => {
        const st = { buf: Buffer.alloc(0) };
        sock.on("error", () => {});
        sock.on("data", (d) => {
            st.buf = Buffer.concat([st.buf, d]);
            for (const m of unframe(st)) {
                got.push(m);
                if (!m.startsWith("MSH")) { sock.write(frame(`MSH|^~\\&|ENGINE|HOSPITAL|||${stamp()}||ACK|ENG0|P|2.5\rMSA|AR||not HL7\r`)); continue; }
                const segs = m.split("\r").filter(Boolean);
                const f = segs[0].split(segs[0][3]);
                const version = f[11] ?? "";
                const type = (f[8] ?? "").split(segs[0][4])[0];
                let reply;
                if (!version.startsWith("2.")) reply = ack(m, "AR", "Unsupported version", { loc: "MSH^1^12", code: "203", label: "Unsupported version id" });
                else if (type === "ADT" && !segs.some((s) => s.startsWith("PID|"))) reply = ack(m, "AE", "PID segment missing", { loc: "PID", code: "100", label: "Segment sequence error" });
                else reply = ack(m, "AA", "");
                sock.write(frame(reply));
                sendResult();
            }
        });
    }).listen(port, "127.0.0.1");

    return {
        env: { MLLP_HOST: `127.0.0.1:${port}`, MLLP_LISTEN_PORT: String(listenPort) },
        close: () => server.close(),
        check: () => {
            if (got.length === 0) return "the MLLP stand-in got no message";
            if (!resultAck) return "the program's listener did not acknowledge the lab result";
            if (!/\rMSA\|AA\|LAB-555/.test(resultAck)) return `the listener's ACK is not an AA for LAB-555: ${JSON.stringify(resultAck)}`;
            return null;
        },
    };
}
