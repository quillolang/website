// An Adyen Checkout API (v71) for the adyen plugin's test, written from docs.adyen.com's Checkout
// API reference: X-API-Key, POST /sessions (merchantAccount, amount, reference, returnUrl required),
// GET /sessions/:id?sessionResult=, POST /payments with resultCode Authorised, Refused (a 200, with
// refusalReason) or RedirectShopper (with `action`), POST /payments/details, and the modifications
// /payments/:psp/captures, refunds, cancels, reversals, each answering 201 with status "received"
// and paymentPspReference. Idempotency-Key gives back the first answer with a transaction, and a
// changed body with a used key is a 422. Errors are { status, errorCode, message, errorType }, with
// a pspReference. A first try of the reference "busy" gets a 503.
//
//   start({ port }) -> { env: { ADYEN_API_URL, ADYEN_API_KEY, ADYEN_MERCHANT_ACCOUNT }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk-test-adyen", MERCHANT = "QuilloDemoECOM";

export async function start({ port }) {
    const stats = { sessions: 0, payments: 0, details: 0, modifications: 0, busy: 0, repeated: 0 };
    const payments = new Map(), sessions = new Map(), keys = new Map(), pending = new Set();
    let n = 8816000000000000;
    const psp = () => `${++n}`;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (status, errorCode, message, errorType = "validation") => send(status, { status, errorCode, message, errorType, pspReference: psp() });
            if (req.headers["x-api-key"] !== KEY) return fail(401, "000", "HTTP Status Response - Unauthorized", "security");
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace(/^\/v71/, "");
            let b = {};
            if (body) { try { b = JSON.parse(body); } catch { return fail(400, "702", "Structure of request is invalid"); } }
            if (req.method === "POST" && p !== "/payments/details" && b.merchantAccount !== MERCHANT) return fail(403, "901", "Invalid Merchant Account", "security");
            const idem = req.headers["idempotency-key"];
            if (idem) {
                const seen = keys.get(idem);
                if (seen) {
                    if (seen.body !== body) return fail(422, "704", "request already processed or in progress");
                    stats.repeated++;
                    return send(seen.code, seen.answer);
                }
            }
            const keep = (code, answer) => { if (idem) keys.set(idem, { body, code, answer }); send(code, answer); };
            let m;
            if (req.method === "POST" && p === "/sessions") {
                if (!Number.isInteger(b.amount?.value) || !b.amount?.currency) return fail(422, "100", "Required field 'amount' is not provided.");
                if (!b.reference) return fail(422, "130", "Required field 'reference' is not provided.");
                if (!b.returnUrl) return fail(422, "14_012", "Required field 'returnUrl' is not provided.");
                const s = { id: `CS${psp()}`, sessionData: Buffer.from(JSON.stringify(b)).toString("base64"), amount: b.amount, reference: b.reference, returnUrl: b.returnUrl, expiresAt: new Date(Date.now() + 3600e3).toISOString(), merchantAccount: b.merchantAccount, mode: "embedded" };
                sessions.set(s.id, s); stats.sessions++;
                return keep(201, s);
            }
            if (req.method === "GET" && (m = /^\/sessions\/([^/]+)$/.exec(p))) {
                if (!sessions.has(m[1])) return fail(404, "000", "Session not found");
                return send(200, { id: m[1], status: url.searchParams.get("sessionResult") === "res-completed" ? "completed" : "paymentPending" });
            }
            if (req.method === "POST" && p === "/payments") {
                if (!Number.isInteger(b.amount?.value)) return fail(422, "100", "Required field 'amount' is not provided.");
                if (!b.reference) return fail(422, "130", "Required field 'reference' is not provided.");
                if (b.paymentMethod?.type !== "scheme") return fail(422, "905_1", "Could not find an acquirer account for the provided txvariant.", "configuration");
                if (b.reference === "busy" && !stats.busy) { stats.busy++; return fail(503, "905", "Payment details are not supported", "internal"); }
                stats.payments++;
                const number = b.paymentMethod.encryptedCardNumber;
                const pay = { pspReference: psp(), value: b.amount.value, captured: 0, refunded: 0, currency: b.amount.currency };
                payments.set(pay.pspReference, pay);
                if (number === "test_declined") return keep(200, { pspReference: pay.pspReference, resultCode: "Refused", refusalReason: "Refused", refusalReasonCode: "2", merchantReference: b.reference });
                if (number === "test_3ds") {
                    if (!b.returnUrl) return fail(422, "14_012", "Required field 'returnUrl' is not provided.");
                    const token = `Ab02b4c0!${psp()}`; pending.add(token);
                    return keep(200, { resultCode: "RedirectShopper", action: { type: "redirect", method: "GET", paymentMethodType: "scheme", url: token } });
                }
                return keep(200, { pspReference: pay.pspReference, resultCode: "Authorised", merchantReference: b.reference, amount: b.amount });
            }
            if (req.method === "POST" && p === "/payments/details") {
                stats.details++;
                const t = b.details?.redirectResult;
                if (!pending.delete(t)) return fail(422, "101", "Invalid card number");
                return send(200, { pspReference: psp(), resultCode: "Authorised" });
            }
            if (req.method === "POST" && (m = /^\/payments\/([^/]+)\/(captures|refunds|cancels|reversals)$/.exec(p))) {
                const pay = payments.get(m[1]);
                if (!pay) return fail(422, "167", "Original pspReference required for this operation");
                if (m[2] === "captures") { if (b.amount.value > pay.value - pay.captured) return fail(422, "137", "Invalid amount specified"); pay.captured += b.amount.value; }
                if (m[2] === "refunds") { if (b.amount.value > pay.captured - pay.refunded) return fail(422, "137", "Invalid amount specified"); pay.refunded += b.amount.value; }
                stats.modifications++;
                return keep(201, { merchantAccount: MERCHANT, paymentPspReference: pay.pspReference, pspReference: psp(), reference: b.reference, status: "received", ...(b.amount ? { amount: b.amount } : {}) });
            }
            return fail(404, "000", "Not found");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { ADYEN_API_URL: `http://127.0.0.1:${port}/v71`, ADYEN_API_KEY: KEY, ADYEN_MERCHANT_ACCOUNT: MERCHANT },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.sessions || !stats.payments || !stats.details || !stats.modifications) return `the Adyen stand-in missed part of the flow: ${JSON.stringify(stats)}`;
            if (!stats.busy) return "the Adyen stand-in never saw a retry after a 503";
            if (!stats.repeated) return "the Adyen stand-in never saw an Idempotency-Key repeated";
            return null;
        },
    };
}
