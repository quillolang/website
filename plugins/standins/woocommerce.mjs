// A WooCommerce REST API (wc/v3) for the woocommerce plugin's test, written from
// woocommerce.github.io/woocommerce-rest-api-docs and WC_REST_Authentication: over plain HTTP only
// OAuth 1.0a is accepted, checked as WordPress checks it (HMAC-SHA256 of METHOD&encoded URL&encoded
// sorted parameters, with the secret and a trailing &, timestamp within 15 minutes, a nonce used
// once); per_page at most 100 with X-WP-Total and X-WP-TotalPages; orders, notes, refunds (amount
// checked), products (a unique SKU, a non-string price ignored), products/batch (at most 100 items,
// each with an `error` of its own), customers (a taken email is refused; role defaults to customer).
// Errors are { code, message, data: { status } }.
//
//   start({ port }) -> { env: { WOOCOMMERCE_API_URL, WOOCOMMERCE_KEY, WOOCOMMERCE_SECRET }, close(), check() }
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const KEY = "ck_standinquillokey", SECRET = "cs_standinquillosecret";
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}/wp-json/wc/v3`;
    const stats = { signed: 0, pages: 0, batches: 0, biggestBatch: 0, refused: [], limited: 0 };
    const orders = new Map(), products = new Map(), customers = new Map(), nonces = new Set();
    let n = 2000;
    for (let i = 0; i < 145; i++) { const id = ++n; orders.set(id, { id, status: "processing", total: "1.00" }); }
    products.set(11, { id: 11, name: "Mug", sku: "MUG", regular_price: "12.50", price: "12.50" });
    for (let i = 0; i < 103; i++) { const id = ++n; customers.set(id, { id, email: `c${i}@example.com`, role: "subscriber" }); }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8", ...headers }); res.end(JSON.stringify(v)); };
            const fail = (status, code, message) => send(status, { code, message, data: { status } });
            const url = new URL(req.url, "http://x");
            const q = url.searchParams;
            const params = [...q.entries()];
            const auth = Object.fromEntries(params);
            if (!auth.oauth_signature) { stats.refused.push("no signature"); return fail(401, "woocommerce_rest_authentication_error", "Missing OAuth parameter oauth_signature"); }
            if (auth.oauth_consumer_key !== KEY) { stats.refused.push("key"); return fail(401, "woocommerce_rest_authentication_error", "Consumer key is invalid."); }
            if (Math.abs(Date.now() / 1000 - Number(auth.oauth_timestamp)) > 900) { stats.refused.push("time"); return fail(401, "woocommerce_rest_authentication_error", "Invalid timestamp."); }
            if (nonces.has(auth.oauth_nonce)) { stats.refused.push("nonce"); return fail(401, "woocommerce_rest_authentication_error", "Invalid nonce - nonce has already been used."); }
            nonces.add(auth.oauth_nonce);
            const signed = params.filter(([k]) => k !== "oauth_signature").map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
            const text = `${req.method}&${enc(`http://127.0.0.1:${port}${url.pathname}`)}&${enc(signed)}`;
            const want = createHmac("sha256", `${SECRET}&`).update(text).digest("base64");
            if (auth.oauth_signature !== want) { stats.refused.push(`signature of ${text}`); return fail(401, "woocommerce_rest_authentication_error", "Invalid signature - provided signature does not match."); }
            stats.signed++;
            const p = url.pathname.replace("/wp-json/wc/v3", "");
            const b = body ? JSON.parse(body) : {};
            const list = (all) => {
                const per = Number(q.get("per_page") ?? 10), page = Number(q.get("page") ?? 1);
                if (per > 100) return fail(400, "rest_invalid_param", "Invalid parameter(s): per_page");
                if (page > 1) stats.pages++;
                send(200, all.slice((page - 1) * per, page * per), { "x-wp-total": String(all.length), "x-wp-totalpages": String(Math.ceil(all.length / per)) });
            };
            const makeProduct = (x) => {
                if ([...products.values()].some((o) => o.sku && o.sku === x.sku)) return { error: { code: "product_invalid_sku", message: "Invalid or duplicated SKU.", data: { status: 400 } } };
                const price = typeof x.regular_price === "string" ? x.regular_price : "";
                const id = ++n; const r = { ...x, id, regular_price: price, price }; products.set(id, r); return r;
            };
            let m;
            if (p === "/busy") { if (!stats.limited) { stats.limited++; return fail(503, "server_busy", "Busy"); } return send(200, { ok: true }); }
            if (p === "/orders" && req.method === "POST") {
                const total = (b.line_items ?? []).reduce((a, l) => a + Number(products.get(l.product_id)?.price ?? 0) * l.quantity, 0);
                const o = { ...b, id: ++n, status: b.status ?? "pending", total: total.toFixed(2), refunded: 0 };
                orders.set(o.id, o);
                return send(201, o);
            }
            if (p === "/orders") return list([...orders.values()].filter((o) => !q.get("status") || o.status === q.get("status")));
            if (m = /^\/orders\/(\d+)$/.exec(p)) {
                const o = orders.get(Number(m[1]));
                if (!o) return fail(404, "woocommerce_rest_shop_order_invalid_id", "Invalid ID.");
                if (req.method === "PUT") Object.assign(o, b);
                return send(200, o);
            }
            if (m = /^\/orders\/(\d+)\/notes$/.exec(p)) return orders.has(Number(m[1])) ? send(201, { id: ++n, note: b.note, customer_note: b.customer_note }) : fail(404, "woocommerce_rest_order_invalid_id", "Invalid order ID.");
            if (m = /^\/orders\/(\d+)\/refunds$/.exec(p)) {
                const o = orders.get(Number(m[1]));
                if (!o) return fail(404, "woocommerce_rest_shop_order_invalid_id", "Invalid ID.");
                if (typeof b.amount !== "string" || Number(b.amount) > Number(o.total) - o.refunded) return fail(500, "woocommerce_rest_cannot_create_order_refund", "Invalid refund amount.");
                o.refunded += Number(b.amount);
                return send(201, { id: ++n, amount: b.amount, reason: b.reason, refunded_payment: b.api_refund === true });
            }
            if (p === "/products/batch") {
                const size = (b.create?.length ?? 0) + (b.update?.length ?? 0) + (b.delete?.length ?? 0);
                stats.batches++; stats.biggestBatch = Math.max(stats.biggestBatch, size);
                if (size > 100) return fail(413, "woocommerce_rest_request_entity_too_large", "Unable to accept more than 100 items for this request.");
                const out = {};
                if (b.create) out.create = b.create.map(makeProduct);
                if (b.update) out.update = b.update.map((x) => { const r = products.get(x.id); if (r) Object.assign(r, x); return r ?? { id: x.id, error: { code: "woocommerce_rest_product_invalid_id", message: "Invalid ID.", data: { status: 404 } } }; });
                if (b.delete) out.delete = b.delete.map((id) => { const r = products.get(id); products.delete(id); return r ?? { id, error: { code: "woocommerce_rest_product_invalid_id", message: "Invalid ID.", data: { status: 404 } } }; });
                return send(200, out);
            }
            if (p === "/products" && req.method === "POST") { const r = makeProduct(b); return r.error ? fail(400, r.error.code, r.error.message) : send(201, r); }
            if (p === "/products") return list([...products.values()].filter((o) => (!q.get("sku") || o.sku === q.get("sku")) && (!q.get("search") || o.name.includes(q.get("search")))));
            if (m = /^\/products\/(\d+)$/.exec(p)) {
                const o = products.get(Number(m[1]));
                if (!o) return fail(404, "woocommerce_rest_product_invalid_id", "Invalid ID.");
                if (req.method === "PUT") { Object.assign(o, b); if (b.regular_price) o.price = b.regular_price; }
                return send(200, o);
            }
            if (p === "/customers" && req.method === "POST") {
                if ([...customers.values()].some((c) => c.email === b.email)) return fail(400, "registration-error-email-exists", "An account is already registered with your email address.");
                const c = { ...b, id: ++n, role: "customer" }; customers.set(c.id, c);
                return send(201, c);
            }
            if (p === "/customers") {
                const role = q.get("role") ?? "customer";
                return list([...customers.values()].filter((c) => (role === "all" || c.role === role) && (!q.get("email") || c.email === q.get("email"))));
            }
            if (m = /^\/customers\/(\d+)$/.exec(p)) return customers.has(Number(m[1])) ? send(200, customers.get(Number(m[1]))) : fail(404, "woocommerce_rest_invalid_id", "Invalid resource ID.");
            return fail(404, "rest_no_route", "No route was found matching the URL and request method.");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { WOOCOMMERCE_API_URL: base, WOOCOMMERCE_KEY: KEY, WOOCOMMERCE_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.refused.length) return `the WooCommerce stand-in refused a signature: ${stats.refused[0]}`;
            if (!stats.signed) return "the WooCommerce stand-in got no signed request";
            if (!stats.pages) return "the WooCommerce stand-in was never asked for a second page";
            if (stats.batches < 3 || stats.biggestBatch > 100) return `batches were not split: ${stats.batches}, the biggest ${stats.biggestBatch}`;
            if (!stats.limited) return "the WooCommerce stand-in never saw a retry";
            return null;
        },
    };
}
