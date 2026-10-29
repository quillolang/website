// A FIX acceptor for fix_protocol.qwe, following the FIX 4.2/4.4 session rules: each message is
// checked (BeginString, BodyLength, CheckSum, CompIDs, MsgSeqNum in order), a Logon is answered with
// a Logon (141=Y starts the numbers again), a TestRequest with a Heartbeat, a Logout with a Logout.
// Right after logon it sends its own TestRequest and a ResendRequest, as counterparties do, and
// checks the answers (a Heartbeat with the TestReqID, a SequenceReset). Orders (35=D) get an
// ExecutionReport New, then a fill: a market order at 100.25, a limit order at its price; a
// quantity over 10000 is rejected. An OrderCancelRequest (35=F) for an unknown order gets an
// OrderCancelReject.
import { createServer } from "node:net";

const SOH = "\x01";
const sum = (s) => { let n = 0; for (const b of Buffer.from(s, "latin1")) n = (n + b) % 256; return n; };
const ts = () => new Date().toISOString().replace(/-/g, "").replace("T", "-").replace("Z", "");

function encode(begin, type, fields) {
    const body = [["35", type], ...fields].map(([t, v]) => `${t}=${v}${SOH}`).join("");
    const head = `8=${begin}${SOH}9=${Buffer.byteLength(body, "latin1")}${SOH}`;
    return head + body + `10=${String(sum(head + body)).padStart(3, "0")}${SOH}`;
}

// Whole messages off the front of a buffer, checked as a FIX engine checks them.
function take(state) {
    const out = [];
    for (;;) {
        const s = state.buf.indexOf("8=");
        if (s < 0) { state.buf = ""; return out; }
        state.buf = state.buf.slice(s);
        const m = /^8=([^\x01]*)\x019=(\d+)\x01/.exec(state.buf);
        if (!m) return out;
        const start = m[0].length, len = Number(m[2]);
        if (state.buf.length < start + len + 7) return out;
        const tail = state.buf.slice(start + len);
        const e = /^10=(\d{3})\x01/.exec(tail);
        if (!e) { out.push({ bad: "BodyLength does not reach 10=" }); state.buf = state.buf.slice(2); continue; }
        const raw = state.buf.slice(0, start + len + e[0].length);
        state.buf = state.buf.slice(raw.length);
        const pairs = raw.split(SOH).filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; });
        const f = {};
        for (const [t, v] of pairs) if (!(t in f)) f[t] = v;
        const bad = sum(raw.slice(0, start + len)) !== Number(e[1]) ? "CheckSum" : null;
        out.push({ raw, pairs, f, begin: m[1], bad });
    }
}

export async function start({ port }) {
    const log = { logons: 0, orders: 0, testHeartbeat: false, gapFill: false, problems: [] };
    const server = createServer((sock) => {
        const st = { buf: "" };
        let begin = "FIX.4.4", us = "", them = "", out = 1, expect = 1, logged = false, orderNo = 0;
        const known = new Set();
        const send = (type, fields) => sock.write(encode(begin, type, [["49", us], ["56", them], ["34", out++], ["52", ts()], ...fields]), "latin1");
        sock.setEncoding("latin1");
        sock.on("error", () => {});
        sock.on("data", (d) => {
            st.buf += d;
            for (const m of take(st)) {
                if (m.bad) { log.problems.push(`bad ${m.bad}`); continue; } // garbled: ignored, as the rules say
                const f = m.f, type = f["35"], seq = Number(f["34"]);
                if (m.pairs[0][0] !== "8" || m.pairs[1][0] !== "9" || m.pairs[2][0] !== "35") { log.problems.push("header order"); continue; }
                if (!logged) {
                    if (type !== "A") { sock.destroy(); return; }
                    begin = m.begin; us = f["56"]; them = f["49"];
                    if (!/^FIX\.4\.[24]$/.test(begin)) { send("5", [["58", `${begin} is not served here`]]); sock.end(); return; }
                    if (us !== "BROKER") { send("5", [["58", `TargetCompID ${us} unknown`]]); sock.end(); return; }
                    if (f["141"] === "Y") { expect = 1; out = 1; }
                    if (seq !== expect) { send("5", [["58", `MsgSeqNum too low, expecting ${expect} but received ${seq}`]]); sock.end(); return; }
                    expect = seq + 1; logged = true; log.logons++;
                    const back = [["98", "0"], ["108", f["108"] ?? "30"]];
                    if (f["141"] === "Y") back.push(["141", "Y"]);
                    send("A", back);
                    send("1", [["112", "PING-1"]]);
                    send("2", [["7", "1"], ["16", "0"]]);
                    continue;
                }
                if (f["49"] !== them || f["56"] !== us) { send("3", [["45", seq], ["373", "9"], ["58", "CompID problem"]]); continue; }
                if (type === "4") { if (f["123"] === "Y") log.gapFill = true; expect = Number(f["36"]); continue; }
                if (seq < expect && f["43"] !== "Y") { send("5", [["58", `MsgSeqNum too low, expecting ${expect} but received ${seq}`]]); sock.end(); return; }
                if (seq > expect) { send("2", [["7", expect], ["16", "0"]]); continue; }
                expect = seq + 1;
                if (type === "0") { if (f["112"] === "PING-1") log.testHeartbeat = true; }
                else if (type === "1") send("0", [["112", f["112"] ?? ""]]);
                else if (type === "5") { send("5", []); sock.end(); return; }
                else if (type === "D") {
                    log.orders++;
                    const id = `ORD${++orderNo}`, qty = Number(f["38"]), px = f["40"] === "2" ? f["44"] : "100.25";
                    const common = [["37", id], ["11", f["11"]], ["55", f["55"]], ["54", f["54"]], ["38", f["38"]], ["40", f["40"]]];
                    if (begin === "FIX.4.2") common.push(["20", "0"]);
                    if (!(qty > 0) || qty > 10000 || !f["55"]) {
                        send("8", [...common, ["17", `X${id}`], ["150", "8"], ["39", "8"], ["103", "3"], ["151", "0"], ["14", "0"], ["6", "0"], ["58", "quantity over the 10000 allowed"]]);
                        continue;
                    }
                    known.add(f["11"]);
                    send("8", [...common, ["17", `N${id}`], ["150", "0"], ["39", "0"], ["151", f["38"]], ["14", "0"], ["6", "0"]]);
                    send("8", [...common, ["17", `F${id}`], ["150", begin === "FIX.4.2" ? "2" : "F"], ["39", "2"], ["32", f["38"]], ["31", px], ["151", "0"], ["14", f["38"]], ["6", px]]);
                } else if (type === "F") {
                    if (!known.has(f["41"])) send("9", [["37", "NONE"], ["11", f["11"]], ["41", f["41"]], ["39", "8"], ["434", "1"], ["102", "1"], ["58", "unknown order"]]);
                    else send("9", [["37", "NONE"], ["11", f["11"]], ["41", f["41"]], ["39", "2"], ["434", "1"], ["102", "0"], ["58", "too late to cancel: filled"]]);
                } else send("j", [["45", seq], ["372", type], ["380", "3"], ["58", `MsgType ${type} not supported`]]);
            }
        });
    }).listen(port, "127.0.0.1");
    return {
        env: { FIX_HOST: `127.0.0.1:${port}` },
        close: () => server.close(),
        check: () => {
            if (!log.logons) return "the FIX acceptor got no Logon";
            if (!log.orders) return "the FIX acceptor got no order";
            if (!log.testHeartbeat) return "the acceptor's TestRequest got no Heartbeat with its TestReqID";
            if (!log.gapFill) return "the acceptor's ResendRequest got no SequenceReset-GapFill";
            if (log.problems.length) return `garbled messages: ${log.problems.join(", ")}`;
            return null;
        },
    };
}
