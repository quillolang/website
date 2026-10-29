// An SMSC for smpp.qwer, speaking SMPP 3.4: bind_transmitter, bind_receiver and bind_transceiver
// (system_id "quillo", password "secret"; else ESME_RINVPASWD or ESME_RINVSYSID), submit_sm
// answered with a message ID (ESME_RINVDSTADR for an empty destination), enquire_link, unbind, and
// generic_nack for what it does not know. When registered_delivery asks for it, a delivery receipt
// follows each part as a deliver_sm (esm_class 0x04, the text "id:... stat:DELIVRD ..." and the
// receipted_message_id and message_state TLVs) to a session that can receive. A message ending
// with "?" gets an answer from the phone, in UCS-2 with an emoji. Concatenated parts (UDH 00 03)
// are put together to check they arrive whole.
import { createServer } from "node:net";

const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXT = { 0x0a: "\f", 0x14: "^", 0x28: "{", 0x29: "}", 0x2f: "\\", 0x3c: "[", 0x3d: "~", 0x3e: "]", 0x40: "|", 0x65: "€" };
const gsm = (b) => { let s = "", esc = false; for (const x of b) { if (esc) { s += EXT[x] ?? " "; esc = false; } else if (x === 0x1b) esc = true; else s += [...GSM][x & 0x7f]; } return s; };
const ucs2 = (b) => { let s = ""; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; };

function pdu(id, status, seq, body = Buffer.alloc(0)) {
    const h = Buffer.alloc(16);
    h.writeUInt32BE(16 + body.length, 0); h.writeUInt32BE(id >>> 0, 4); h.writeUInt32BE(status >>> 0, 8); h.writeUInt32BE(seq >>> 0, 12);
    return Buffer.concat([h, body]);
}
const cstr = (s) => Buffer.concat([Buffer.from(s, "latin1"), Buffer.from([0])]);

function readSubmit(b) {
    let at = 0;
    const c = () => { const e = b.indexOf(0, at); const s = b.subarray(at, e).toString("latin1"); at = e + 1; return s; };
    const u = () => b[at++];
    const m = { service: c(), sTon: u(), sNpi: u(), from: c(), dTon: u(), dNpi: u(), to: c(), esm: u(), pid: u(), prio: u(), sched: c(), valid: c(), reg: u(), rep: u(), dc: u(), def: u() };
    const len = u();
    m.sm = b.subarray(at, at + len); at += len;
    while (at + 4 <= b.length) { const tag = b.readUInt16BE(at), l = b.readUInt16BE(at + 2); if (tag === 0x0424) m.sm = b.subarray(at + 4, at + 4 + l); at += 4 + l; }
    m.udh = null;
    if (m.esm & 0x40) { const ul = m.sm[0] + 1; m.udh = m.sm.subarray(1, ul); m.sm = m.sm.subarray(ul); }
    m.text = m.dc === 8 ? ucs2(m.sm) : m.dc === 3 ? m.sm.toString("latin1") : gsm(m.sm);
    return m;
}

function deliverBody({ from, to, esm, dc, sm, tlvs = [] }) {
    const parts = [cstr(""), Buffer.from([1, 1]), cstr(from), Buffer.from([1, 1]), cstr(to), Buffer.from([esm, 0, 0]), cstr(""), cstr(""), Buffer.from([0, 0, dc, 0, sm.length]), sm];
    for (const [tag, v] of tlvs) { const h = Buffer.alloc(4); h.writeUInt16BE(tag); h.writeUInt16BE(v.length, 2); parts.push(h, v); }
    return Buffer.concat(parts);
}

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`; };

export async function start({ port }) {
    const log = { binds: 0, submits: 0, receiptsAcked: 0, whole: [], refusedBind: 0 };
    const receivers = new Set();
    const pending = [];
    let msgId = 0x5a000, seqOut = 1;
    const partsOf = new Map();

    const push = (body) => {
        const to = [...receivers][0];
        if (!to) { pending.push(body); return; }
        to.write(pdu(0x05, 0, seqOut++, body));
    };

    const server = createServer((sock) => {
        let buf = Buffer.alloc(0), bound = null;
        sock.on("error", () => {});
        sock.on("close", () => receivers.delete(sock));
        sock.on("data", (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 16) {
                const len = buf.readUInt32BE(0);
                if (len < 16 || len > 65536) { sock.destroy(); return; }
                if (buf.length < len) return;
                const id = buf.readUInt32BE(4), status = buf.readUInt32BE(8), seq = buf.readUInt32BE(12), body = buf.subarray(16, len);
                buf = buf.subarray(len);
                if (id === 0x01 || id === 0x02 || id === 0x09) {
                    let at = 0;
                    const c = () => { const e = body.indexOf(0, at); const s = body.subarray(at, e).toString("latin1"); at = e + 1; return s; };
                    const sys = c(), pw = c();
                    const refusal = sys !== "quillo" ? 0x0f : pw !== "secret" ? 0x0e : bound ? 0x05 : 0;
                    sock.write(pdu(id | 0x80000000, refusal, seq, refusal ? Buffer.alloc(0) : cstr("STANDIN-SMSC")));
                    if (refusal) { log.refusedBind++; continue; }
                    bound = id; log.binds++;
                    if (id !== 0x02) { receivers.add(sock); while (pending.length) push(pending.shift()); }
                } else if (!bound && id !== 0x80000000) {
                    sock.write(pdu(id | 0x80000000, 0x04, seq)); // ESME_RINVBNDSTS
                } else if (id === 0x04) {
                    if (bound === 0x01) { sock.write(pdu(0x80000004, 0x04, seq)); continue; }
                    const m = readSubmit(body);
                    if (!m.to) { sock.write(pdu(0x80000004, 0x0b, seq)); continue; }
                    log.submits++;
                    const mid = (++msgId).toString(16).toUpperCase();
                    sock.write(pdu(0x80000004, 0, seq, cstr(mid)));
                    let whole = null;
                    if (m.udh && m.udh[0] === 0 && m.udh[1] === 3) {
                        const key = `${m.from}|${m.udh[2]}`, total = m.udh[3];
                        const got = partsOf.get(key) ?? []; got[m.udh[4] - 1] = m.text; partsOf.set(key, got);
                        if (got.filter((x) => x != null).length === total) { whole = { text: got.join(""), parts: total }; partsOf.delete(key); }
                    } else whole = { text: m.text, parts: 1 };
                    if (whole) log.whole.push({ ...whole, dc: m.dc });
                    if (m.reg & 1) {
                        const text = `id:${mid} sub:001 dlvrd:001 submit date:${stamp()} done date:${stamp()} stat:DELIVRD err:000 text:${m.text.slice(0, 20)}`;
                        setTimeout(() => push(deliverBody({ from: m.to, to: m.from, esm: 0x04, dc: 0, sm: Buffer.from(text, "latin1"), tlvs: [[0x001e, cstr(mid)], [0x0427, Buffer.from([2])]] })), 50);
                    }
                    if (whole && whole.text.trim().endsWith("?")) {
                        const reply = "Yes, see you then 👍";
                        const b = Buffer.alloc(reply.length * 2);
                        for (let i = 0; i < reply.length; i++) b.writeUInt16BE(reply.charCodeAt(i), i * 2);
                        setTimeout(() => push(deliverBody({ from: m.to, to: m.from, esm: 0, dc: 8, sm: b })), 80);
                    }
                } else if (id === 0x80000005) {
                    if (status === 0) log.receiptsAcked++;
                } else if (id === 0x15) sock.write(pdu(0x80000015, 0, seq));
                else if (id === 0x80000015) { /* our enquire_link answered */ }
                else if (id === 0x06) { sock.write(pdu(0x80000006, 0, seq)); receivers.delete(sock); sock.end(); }
                else sock.write(pdu(0x80000000, 0x03, seq)); // generic_nack: invalid command ID
            }
        });
    }).listen(port, "127.0.0.1");

    return {
        env: { SMPP_HOST: `127.0.0.1:${port}`, SMPP_SYSTEM_ID: "quillo", SMPP_PASSWORD: "secret" },
        close: () => server.close(),
        check: () => {
            if (!log.binds) return "the SMSC got no bind";
            if (!log.submits) return "the SMSC got no submit_sm";
            if (!log.receiptsAcked) return "no deliver_sm was answered with deliver_sm_resp";
            if (!log.whole.some((w) => w.parts > 1)) return "no long message arrived whole from its parts";
            return null;
        },
    };
}
