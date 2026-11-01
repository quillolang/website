// A Wise Platform API for the wise plugin's test, written from docs.wise.com's API reference and its
// "Strong Customer Authentication" pages: Bearer token; GET /v2/profiles; POST and PATCH
// /v3/profiles/:id/quotes with paymentOptions (PATCH wants application/merge-patch+json);
// /v1/accounts with its NOT_VALID field errors; POST /v1/transfers (the same customerTransactionId
// gives the same transfer); GET /v1/transfers with limit (at most 100) and offset; PUT .../cancel.
// Funding and balances are protected: a 403 with x-2fa-approval-result: REJECTED and a one-time
// token in x-2fa-approval, and the call again with X-2FA-Approval and X-Signature, the token's
// RSA-SHA256 signature in base64, checked against the public key. Profile 222 holds a different key.
// A funding of transfer 777 is REJECTED for lack of funds.
//
//   start({ port }) -> { env: { WISE_API_URL, WISE_API_TOKEN, WISE_PRIVATE_KEY }, close(), check() }
import { createServer } from "node:http";
import { generateKeyPairSync, createVerify, randomUUID } from "node:crypto";

const TOKEN = "qk-test-wise";

export async function start({ port }) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
    const stats = { challenged: 0, signed: 0, wrongSignature: 0, funded: 0, transfers: 0, offsets: 0, tooBig: 0 };
    const quotes = new Map(), accounts = new Map(), transfers = new Map(), byKey = new Map(), otts = new Map();
    let n = 40000;
    const past = [];
    for (let i = 0; i < 145; i++) past.push({ id: ++n, status: "outgoing_payment_sent", user: 1, targetAccount: 1 });
    transfers.set(55, { id: 55, status: "outgoing_payment_sent" });
    transfers.set(777, { id: 777, status: "incoming_payment_waiting" });
    transfers.set(778, { id: 778, status: "incoming_payment_waiting" });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const errors = (code, list) => send(code, { errors: list });
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "invalid_token", error_description: "Invalid token" });
            const url = new URL(req.url, "http://x");
            const p = url.pathname, q = url.searchParams;
            const ctype = req.headers["content-type"] ?? "";
            const b = body ? JSON.parse(body) : {};
            // Protected calls need a signed one-time token; profile 222 was given another key.
            function protect(profile) {
                const ott = req.headers["x-2fa-approval"], sig = req.headers["x-signature"];
                if (ott && sig && otts.has(ott)) {
                    const v = createVerify("RSA-SHA256"); v.update(ott);
                    if (v.verify(Number(profile) === 222 ? other : publicKey, Buffer.from(sig, "base64"))) { otts.delete(ott); stats.signed++; return true; }
                    stats.wrongSignature++;
                }
                const t = randomUUID(); otts.set(t, true); stats.challenged++;
                send(403, { timestamp: new Date().toISOString(), status: 403, error: "Forbidden", message: "You are forbidden to send this request", path: p }, { "x-2fa-approval-result": "REJECTED", "x-2fa-approval": t });
                return false;
            }
            let m;
            if (req.method === "GET" && p === "/v2/profiles") return send(200, [{ id: 101, type: "PERSONAL", publicId: "p1" }, { id: 202, type: "BUSINESS", publicId: "b1" }]);
            if (req.method === "POST" && (m = /^\/v3\/profiles\/(\d+)\/quotes$/.exec(p))) {
                if (b.targetCurrency === "XXX") return errors(422, [{ code: "error.route.not.supported", message: "This route is not supported", path: "targetCurrency", arguments: ["GBP", "XXX"] }]);
                if ((b.sourceAmount == null) === (b.targetAmount == null)) return errors(422, [{ code: "NOT_VALID", message: "Give sourceAmount or targetAmount", path: "sourceAmount" }]);
                const rate = 1.15, fee = 4.5;
                const source = b.sourceAmount ?? Math.round((b.targetAmount / rate + fee) * 100) / 100;
                const target = b.targetAmount ?? Math.round((b.sourceAmount - fee) * rate * 100) / 100;
                const quote = { id: randomUUID(), sourceCurrency: b.sourceCurrency, targetCurrency: b.targetCurrency, rate, status: "PENDING", paymentOptions: [{ disabled: true, payIn: "SWIFT", payOut: "BANK_TRANSFER", fee: { total: 9 }, sourceAmount: source, targetAmount: target }, { disabled: false, payIn: "BALANCE", payOut: "BANK_TRANSFER", fee: { total: fee }, sourceAmount: source, targetAmount: target }] };
                quotes.set(quote.id, quote);
                return send(200, quote);
            }
            if (req.method === "PATCH" && (m = /^\/v3\/profiles\/(\d+)\/quotes\/([^/]+)$/.exec(p))) {
                if (ctype !== "application/merge-patch+json") return send(415, { status: 415, error: "Unsupported Media Type", path: p });
                const quote = quotes.get(m[2]);
                if (!quote) return errors(404, [{ code: "NOT_FOUND", message: "Quote not found" }]);
                quote.targetAccount = b.targetAccount;
                return send(200, quote);
            }
            if (req.method === "POST" && p === "/v1/accounts") {
                if (b.type === "iban" && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(b.details?.iban ?? "")) return errors(422, [{ code: "NOT_VALID", message: "Please specify a valid IBAN", path: "iban", arguments: ["iban", b.details?.iban] }]);
                const a = { id: ++n, profile: b.profile, currency: b.currency, type: b.type, accountHolderName: b.accountHolderName, details: b.details, active: true };
                accounts.set(a.id, a);
                return send(200, a);
            }
            if (req.method === "GET" && p === "/v1/accounts") return send(200, [...accounts.values()].filter((a) => String(a.profile) === q.get("profile") && (!q.get("currency") || a.currency === q.get("currency"))));
            if (req.method === "DELETE" && (m = /^\/v1\/accounts\/(\d+)$/.exec(p))) { accounts.delete(Number(m[1])); return send(200, undefined); }
            if (req.method === "POST" && p === "/v1/transfers") {
                if (byKey.has(b.customerTransactionId)) return send(200, byKey.get(b.customerTransactionId));
                if (!quotes.has(b.quoteUuid)) return errors(422, [{ code: "NOT_VALID", message: "Quote not found", path: "quoteUuid" }]);
                if (!accounts.has(b.targetAccount)) return errors(422, [{ code: "NOT_VALID", message: "Recipient not found", path: "targetAccount" }]);
                const t = { id: ++n, status: "incoming_payment_waiting", targetAccount: b.targetAccount, quoteUuid: b.quoteUuid, customerTransactionId: b.customerTransactionId, reference: b.details?.reference };
                transfers.set(t.id, t); byKey.set(b.customerTransactionId, t); stats.transfers++;
                return send(200, t);
            }
            if (req.method === "GET" && p === "/v1/transfers") {
                const limit = Number(q.get("limit") ?? 20), offset = Number(q.get("offset") ?? 0);
                if (limit > 100) { stats.tooBig++; return errors(400, [{ code: "NOT_VALID", message: "limit must be at most 100", path: "limit" }]); }
                if (offset) stats.offsets++;
                const st = q.get("status");
                return send(200, past.filter((t) => !st || t.status === st).slice(offset, offset + limit));
            }
            if (m = /^\/v1\/transfers\/(\d+)(\/cancel)?$/.exec(p)) {
                const t = transfers.get(Number(m[1]));
                if (!t) return errors(404, [{ code: "RESOURCE_NOT_FOUND", message: `Transfer ${m[1]} not found` }]);
                if (m[2]) { if (t.status !== "incoming_payment_waiting") return errors(409, [{ code: "transfer.cancellation.not.allowed", message: "This transfer can't be cancelled anymore" }]); t.status = "cancelled"; }
                return send(200, t);
            }
            if (req.method === "POST" && (m = /^\/v3\/profiles\/(\d+)\/transfers\/(\d+)\/payments$/.exec(p))) {
                if (!protect(m[1])) return;
                const t = transfers.get(Number(m[2]));
                if (!t) return errors(404, [{ code: "RESOURCE_NOT_FOUND", message: "Transfer not found" }]);
                if (b.type !== "BALANCE") return errors(422, [{ code: "NOT_VALID", message: "Unknown payment type", path: "type" }]);
                if (t.id === 777) return send(201, { type: "BALANCE", status: "REJECTED", errorCode: "balance.payment-option-unavailable" });
                t.status = "processing"; stats.funded++;
                return send(201, { type: "BALANCE", status: "COMPLETED", errorCode: null });
            }
            if (req.method === "GET" && (m = /^\/v4\/profiles\/(\d+)\/balances$/.exec(p))) {
                if (q.get("types") !== "STANDARD") return errors(400, [{ code: "NOT_VALID", message: "types is required", path: "types" }]);
                if (!protect(m[1])) return;
                return send(200, [{ id: 1, currency: "GBP", amount: { value: 5000, currency: "GBP" } }, { id: 2, currency: "EUR", amount: { value: 120, currency: "EUR" } }]);
            }
            return send(404, { timestamp: new Date().toISOString(), status: 404, error: "Not Found", path: p, message: "No message available" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { WISE_API_URL: `http://127.0.0.1:${port}`, WISE_API_TOKEN: TOKEN, WISE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }) },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.transfers) return "the Wise stand-in made no transfer";
            if (!stats.challenged || !stats.signed) return "the Wise stand-in never saw a one-time token signed";
            if (!stats.funded) return "the Wise stand-in funded nothing";
            if (!stats.offsets) return "the Wise stand-in was never asked for a second page";
            if (stats.tooBig) return "a list asked for more than 100";
            return null;
        },
    };
}
