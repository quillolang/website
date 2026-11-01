// A Mollie API (v2) for the mollie plugin's test, written from docs.mollie.com's reference: Bearer
// test_ keys, amounts with a text value and the currency's exact decimals, POST /payments (redirectUrl
// required unless a recurring payment), GET and DELETE, /payments/:id/refunds with the refundable
// amount checked, /customers, /customers/:id/mandates, sequenceType first and recurring (a recurring
// payment needs a valid mandate), Idempotency-Key, and lists under _embedded with a whole
// _links.next.href. Errors are application/hal+json with { status, title, detail, field, _links }.
// A payment made with `method: creditcard` is paid by the time it is next read, as if the customer
// had gone through checkout, and a first payment's mandate then appears. A first try of the
// description "busy" gets a 429.
//
//   start({ port }) -> { env: { MOLLIE_API_URL, MOLLIE_API_KEY }, close(), check() }
import { createServer } from "node:http";

const KEY = "test_qk-standin-mollie";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}/v2`;
    const stats = { payments: 0, next: 0, limited: 0, refunds: 0, repeated: 0 };
    const payments = new Map(), customers = new Map(), keys = new Map();
    let n = 7000;
    const id = (p) => `${p}_${(++n).toString(36)}Xq`;
    for (let i = 0; i < 620; i++) { const p = { resource: "payment", id: id("tr"), status: "paid", amount: { currency: "EUR", value: "1.00" }, description: `Old ${i}`, refunds: [] }; payments.set(p.id, p); }
    for (let i = 0; i < 310; i++) { const c = { resource: "customer", id: id("cst"), name: `C${i}`, mandates: [] }; customers.set(c.id, c); }
    const newest = (m) => [...m.values()].reverse();
    const shown = (p) => { const { refunds, chargedMandate, ...rest } = p; return rest; };
    const list = (res, field, all, url, show = (x) => x) => {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 250);
        if (url.searchParams.get("limit") > 250) return null;
        const from = url.searchParams.get("from");
        if (from) stats.next++;
        const at = from ? all.findIndex((x) => x.id === from) : 0;
        const next = all[at + limit];
        const href = `${base}${url.pathname.replace(/^\/v2/, "")}?from=${next?.id}&limit=${limit}`;
        const body = { count: Math.min(limit, all.length - at), _embedded: { [field]: all.slice(at, at + limit).map(show) }, _links: { self: { href: "x", type: "application/hal+json" }, previous: null, next: next ? { href, type: "application/hal+json" } : null, documentation: { href: "https://docs.mollie.com", type: "text/html" } } };
        res.writeHead(200, { "content-type": "application/hal+json" }); res.end(JSON.stringify(body));
        return true;
    };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/hal+json" }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (status, title, detail, field) => send(status, { status, title, detail, ...(field ? { field } : {}), _links: { documentation: { href: "https://docs.mollie.com/overview/handling-errors", type: "text/html" } } });
            if (req.headers.authorization !== `Bearer ${KEY}`) return fail(401, "Unauthorized Request", "Missing authentication, or failed to authenticate");
            const url = new URL(req.url, "http://x");
            const p = url.pathname.replace(/^\/v2/, "");
            const b = body ? JSON.parse(body) : {};
            let m;
            const amountOk = (a) => a && typeof a.value === "string" && (a.currency === "JPY" ? /^\d+$/ : /^\d+\.\d{2}$/).test(a.value);
            if (req.method === "POST" && p === "/payments") {
                const idem = req.headers["idempotency-key"];
                if (idem && keys.has(idem)) { stats.repeated++; return send(201, keys.get(idem)); }
                if (b.description === "busy" && !stats.limited) { stats.limited++; return fail(429, "Too Many Requests", "You have exceeded the rate limit"); }
                if (!amountOk(b.amount)) return fail(422, "Unprocessable Entity", "The amount contains an invalid value", "amount.value");
                if (Number(b.amount.value) <= 0) return fail(422, "Unprocessable Entity", "The amount is lower than the minimum", "amount");
                const recurring = b.sequenceType === "recurring";
                if (!recurring && !b.redirectUrl) return fail(422, "Unprocessable Entity", "The redirect URL is required", "redirectUrl");
                if (recurring) {
                    const c = customers.get(b.customerId);
                    const mandates = (c?.mandates ?? []).filter((x) => x.status === "valid");
                    if (!mandates.length) return fail(422, "Unprocessable Entity", "The customer has no valid mandates", "customerId");
                    if (b.mandateId && !mandates.some((x) => x.id === b.mandateId)) return fail(422, "Unprocessable Entity", "The mandate is invalid", "mandateId");
                }
                const pay = { resource: "payment", id: id("tr"), mode: "test", status: recurring ? "pending" : "open", isCancelable: !recurring, amount: b.amount, description: b.description, redirectUrl: b.redirectUrl ?? null, webhookUrl: b.webhookUrl ?? null, metadata: b.metadata ?? null, method: b.method ?? null, sequenceType: b.sequenceType ?? "oneoff", customerId: b.customerId ?? null, mandateId: b.mandateId ?? null, refunds: [], _links: recurring ? {} : {} };
                if (!recurring) pay._links.checkout = { href: `https://www.mollie.com/checkout/select-method/${pay.id}`, type: "text/html" };
                payments.set(pay.id, pay); stats.payments++;
                if (idem) keys.set(idem, shown(pay));
                return send(201, shown(pay));
            }
            if (req.method === "GET" && p === "/payments") return list(res, "payments", newest(payments), url, shown) ?? fail(400, "Bad Request", "The limit is too high");
            if (m = /^\/payments\/([^/]+)$/.exec(p)) {
                const pay = payments.get(m[1]);
                if (!pay) return fail(404, "Not Found", `No payment exists with token ${m[1]}.`);
                if (req.method === "DELETE") {
                    if (!pay.isCancelable) return fail(422, "Unprocessable Entity", "The payment cannot be canceled");
                    pay.status = "canceled"; pay.isCancelable = false;
                    return send(200, shown(pay));
                }
                if (pay.status === "open" && pay.method === "creditcard") {
                    pay.status = "paid"; pay.paidAt = new Date().toISOString(); pay.isCancelable = false;
                    if (pay.sequenceType === "first") { customers.get(pay.customerId)?.mandates.push({ resource: "mandate", id: id("mdt"), status: "valid", method: "creditcard", details: {} }); }
                }
                return send(200, shown(pay));
            }
            if (m = /^\/payments\/([^/]+)\/refunds(?:\/([^/]+))?$/.exec(p)) {
                const pay = payments.get(m[1]);
                if (!pay) return fail(404, "Not Found", `No payment exists with token ${m[1]}.`);
                if (req.method === "POST") {
                    if (pay.status !== "paid") return fail(422, "Unprocessable Entity", "The payment has not been paid", "amount");
                    const left = Number(pay.amount.value) - pay.refunds.reduce((a, r) => a + Number(r.amount.value), 0);
                    if (!amountOk(b.amount) || Number(b.amount.value) > left) return fail(422, "Unprocessable Entity", "The amount requested is higher than the remaining amount", "amount");
                    const r = { resource: "refund", id: id("re"), status: "pending", amount: b.amount, description: b.description ?? "", paymentId: pay.id };
                    pay.refunds.push(r); stats.refunds++;
                    return send(201, r);
                }
                if (req.method === "GET") return list(res, "refunds", pay.refunds, url);
                if (req.method === "DELETE") {
                    const at = pay.refunds.findIndex((r) => r.id === m[2]);
                    if (at < 0) return fail(404, "Not Found", "No refund exists with that id.");
                    pay.refunds.splice(at, 1);
                    return send(204);
                }
            }
            if (req.method === "POST" && p === "/customers") {
                const c = { resource: "customer", id: id("cst"), name: b.name, email: b.email, mandates: [] };
                customers.set(c.id, c);
                const { mandates, ...rest } = c;
                return send(201, rest);
            }
            if (req.method === "GET" && p === "/customers") return list(res, "customers", newest(customers), url, ({ mandates, ...c }) => c);
            if (m = /^\/customers\/([^/]+)$/.exec(p)) {
                const c = customers.get(m[1]);
                if (!c) return fail(404, "Not Found", `No customer exists with token ${m[1]}.`);
                const { mandates, ...rest } = c;
                return send(200, rest);
            }
            if (m = /^\/customers\/([^/]+)\/mandates(?:\/([^/]+))?$/.exec(p)) {
                const c = customers.get(m[1]);
                if (!c) return fail(404, "Not Found", `No customer exists with token ${m[1]}.`);
                if (req.method === "POST") {
                    if (b.method !== "directdebit" || !b.consumerName || !b.consumerAccount) return fail(422, "Unprocessable Entity", "The consumer name and account are required", "consumerAccount");
                    const d = { resource: "mandate", id: id("mdt"), status: "valid", method: b.method, details: { consumerName: b.consumerName, consumerAccount: b.consumerAccount } };
                    c.mandates.push(d);
                    return send(201, d);
                }
                if (req.method === "GET") return list(res, "mandates", c.mandates, url);
                if (req.method === "DELETE") { c.mandates = c.mandates.filter((x) => x.id !== m[2]); return send(204); }
            }
            return fail(404, "Not Found", `The resource ${p} does not exist.`);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MOLLIE_API_URL: base, MOLLIE_API_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.payments) return "the Mollie stand-in took no payment";
            if (!stats.next) return "the Mollie stand-in's next link was never followed";
            if (!stats.limited) return "the Mollie stand-in never saw a retry after a 429";
            if (!stats.repeated) return "the Mollie stand-in never saw a repeated Idempotency-Key";
            return null;
        },
    };
}
