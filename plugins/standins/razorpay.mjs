// A Razorpay API for the razorpay plugin's test, written from razorpay.com/docs/api (Orders, Payments,
// Refunds) and the errors reference: HTTP Basic with the key pair, POST /orders (amount at least 100
// paise, receipt up to 40 characters), GET /orders with count (at most 100), skip and receipt,
// GET /orders/:id/payments, GET /payments, POST /payments/:id/capture (the amount must be the amount
// authorized, and only once), POST /payments/:id/refund (amount optional: the rest), GET /refunds/:id
// and GET /payments/:id/refunds. Errors are { error: { code, description, source, step, reason,
// metadata, field } }. `pay_seed` waits authorized on `order_seed`, as if a customer had paid;
// `pay_captured` is captured. A first read of order_busy gets a 429.
//
//   start({ port }) -> { env: { RAZORPAY_API_URL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_SAMPLE_* }, close(), check() }
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const ID = "rzp_test_qkStandin", SECRET = "standin-razorpay-secret";

export async function start({ port }) {
    const stats = { orders: 0, skips: 0, captures: 0, refunds: 0, limited: 0, badCount: 0 };
    const orders = new Map(), payments = new Map(), refunds = new Map();
    let n = 9000;
    const id = (p) => `${p}_${(++n).toString(36).padStart(14, "Q")}`;
    for (let i = 0; i < 230; i++) { const o = { id: id("order"), entity: "order", amount: 1000 + i, amount_paid: 0, amount_due: 1000 + i, currency: "INR", receipt: `old-${i}`, status: "created", attempts: 0, notes: [], created_at: 1730000000 + i }; orders.set(o.id, o); }
    orders.set("order_seed", { id: "order_seed", entity: "order", amount: 49950, amount_paid: 0, amount_due: 49950, currency: "INR", receipt: "seed", status: "attempted", attempts: 1, notes: [], created_at: 1730000000 });
    orders.set("order_busy", { id: "order_busy", entity: "order", amount: 100, amount_paid: 0, amount_due: 100, currency: "INR", status: "created", attempts: 0, notes: [], created_at: 1730000000 });
    payments.set("pay_seed", { id: "pay_seed", entity: "payment", amount: 49950, currency: "INR", status: "authorized", order_id: "order_seed", method: "upi", captured: false, amount_refunded: 0, refund_status: null, created_at: 1730000000 });
    payments.set("pay_captured", { id: "pay_captured", entity: "payment", amount: 10000, currency: "INR", status: "captured", order_id: null, method: "card", captured: true, amount_refunded: 0, refund_status: null, created_at: 1730000000 });
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (code, description, field = null, ecode = "BAD_REQUEST_ERROR", reason = "input_validation_failed") => send(code, { error: { code: ecode, description, source: "business", step: "payment_initiation", reason, metadata: {}, field: field ?? "NA" } });
            if (req.headers.authorization !== `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`) return fail(401, "Authentication failed");
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace(/^\/v1/, ""), q = url.searchParams;
            const b = body ? JSON.parse(body) : {};
            let m;
            const collection = (all) => {
                const count = Number(q.get("count") ?? 10), skip = Number(q.get("skip") ?? 0);
                if (count > 100) { stats.badCount++; return fail(400, "The count may not be greater than 100.", "count"); }
                if (skip) stats.skips++;
                const items = all.slice(skip, skip + count);
                send(200, { entity: "collection", count: items.length, items });
            };
            if (req.method === "POST" && p === "/orders") {
                if (!Number.isInteger(b.amount) || b.amount < 100) return fail(400, "The amount must be atleast INR 1.00", "amount");
                if (!b.currency) return fail(400, "The currency field is required.", "currency");
                if ((b.receipt ?? "").length > 40) return fail(400, "The receipt may not be greater than 40 characters.", "receipt");
                const o = { id: id("order"), entity: "order", amount: b.amount, amount_paid: 0, amount_due: b.amount, currency: b.currency, receipt: b.receipt ?? null, status: "created", attempts: 0, notes: b.notes ?? [], created_at: Math.floor(Date.now() / 1000) };
                orders.set(o.id, o); stats.orders++;
                return send(200, o);
            }
            if (req.method === "GET" && p === "/orders") {
                const r = q.get("receipt");
                return collection([...orders.values()].filter((o) => !r || o.receipt === r));
            }
            if (m = /^\/orders\/([^/]+)(\/payments)?$/.exec(p)) {
                const o = orders.get(m[1]);
                if (m[1] === "order_busy" && !stats.limited) { stats.limited++; return send(429, { error: { code: "BAD_REQUEST_ERROR", description: "Too many requests", source: "NA", step: "NA", reason: "NA", metadata: {} } }); }
                if (!o) return fail(400, "The id provided does not exist", null, "BAD_REQUEST_ERROR", "NA");
                if (m[2]) return collection([...payments.values()].filter((x) => x.order_id === o.id));
                return send(200, o);
            }
            if (req.method === "GET" && p === "/payments") return collection([...payments.values()]);
            if (m = /^\/payments\/([^/]+)(?:\/(capture|refund|refunds))?$/.exec(p)) {
                const pay = payments.get(m[1]);
                if (!pay) return fail(400, "The id provided does not exist", null, "BAD_REQUEST_ERROR", "NA");
                if (!m[2]) return send(200, pay);
                if (m[2] === "capture") {
                    if (pay.status !== "authorized") return fail(400, "This payment has already been captured");
                    if (b.amount !== pay.amount) return fail(400, "Capture amount must be equal to the amount authorized", "amount");
                    if (b.currency !== pay.currency) return fail(400, "The currency should be same as the payment", "currency");
                    pay.status = "captured"; pay.captured = true; stats.captures++;
                    const o = orders.get(pay.order_id);
                    if (o) { o.status = "paid"; o.amount_paid = o.amount; o.amount_due = 0; }
                    return send(200, pay);
                }
                if (m[2] === "refunds") return collection([...refunds.values()].filter((r) => r.payment_id === pay.id));
                if (pay.status !== "captured" && pay.status !== "refunded") return fail(400, "Only captured payments can be refunded");
                const left = pay.amount - pay.amount_refunded, amount = b.amount ?? left;
                if (left === 0) return fail(400, "The payment has been fully refunded already");
                if (amount > left) return fail(400, "The refund amount provided is greater than amount captured", "amount");
                pay.amount_refunded += amount;
                pay.refund_status = pay.amount_refunded === pay.amount ? "full" : "partial";
                if (pay.refund_status === "full") pay.status = "refunded";
                const r = { id: id("rfnd"), entity: "refund", amount, currency: pay.currency, payment_id: pay.id, status: "processed", speed_requested: b.speed ?? "normal", speed_processed: "normal", notes: b.notes ?? [] };
                refunds.set(r.id, r); stats.refunds++;
                return send(200, r);
            }
            if (m = /^\/refunds\/([^/]+)$/.exec(p)) return refunds.has(m[1]) ? send(200, refunds.get(m[1])) : fail(400, "The id provided does not exist");
            return fail(404, "The requested URL was not found on the server.", null, "BAD_REQUEST_ERROR", "NA");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const sign = (t) => createHmac("sha256", SECRET).update(t).digest("hex");
    return {
        env: { RAZORPAY_API_URL: `http://127.0.0.1:${port}/v1`, RAZORPAY_KEY_ID: ID, RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_SAMPLE_SIGNATURE: sign("order_seed|pay_seed"), RAZORPAY_SAMPLE_SUBSCRIPTION: sign("pay_seed|sub_1") },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.orders || !stats.captures || !stats.refunds) return `the Razorpay stand-in missed part of the flow: ${JSON.stringify(stats)}`;
            if (!stats.skips) return "the Razorpay stand-in was never asked for a second page";
            if (stats.badCount) return "a list asked for more than 100 at once";
            if (!stats.limited) return "the Razorpay stand-in never saw a retry after a 429";
            return null;
        },
    };
}
