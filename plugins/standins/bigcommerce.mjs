// A BigCommerce API for the bigcommerce plugin's test, written from developer.bigcommerce.com's
// reference and "API rate limits": X-Auth-Token under /stores/:hash; V3 catalog with { data, meta:
// { pagination } }, limit at most 250, include=variants, a batch PUT of at most 10 answering 207 with
// `errors` when part fails, V3 errors { status, title, type, errors }; V2 orders as bare lists, a
// 204 with no body past the end, errors as [{ status, message }]. Every answer has the
// X-Rate-Limit-* headers, and /v3/busy gives a 429 once, with X-Rate-Limit-Time-Reset-Ms.
//
//   start({ port }) -> { env: { BIGCOMMERCE_API_URL, BIGCOMMERCE_STORE_HASH, BIGCOMMERCE_ACCESS_TOKEN }, close(), check() }
import { createServer } from "node:http";

const HASH = "abc123", TOKEN = "qk-test-bigcommerce";

export async function start({ port }) {
    const stats = { pages: 0, v2pages: 0, empty204: 0, limited: 0, biggest: 0, partly: 0 };
    const products = new Map(), orders = new Map();
    let n = 100, left = 150;
    for (let i = 0; i < 520; i++) { const id = ++n; products.set(id, { id, name: `Item ${i}`, type: "physical", weight: 1, price: 5, is_visible: true, variants: [] }); }
    for (let i = 0; i < 265; i++) { const id = ++n; orders.set(id, { id, status_id: 11, status: "Awaiting Fulfillment" }); }
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            left = Math.max(left - 1, 1);
            const rate = { "x-rate-limit-requests-left": String(left), "x-rate-limit-requests-quota": "150", "x-rate-limit-time-reset-ms": "300", "x-rate-limit-time-window-ms": "30000" };
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json", ...rate }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            if (req.headers["x-auth-token"] !== TOKEN) return send(401, { status: 401, title: "Unauthorized", type: "https://developer.bigcommerce.com/api-docs/getting-started/api-status-codes" });
            const url = new URL(req.url, "http://x");
            const m0 = /^\/stores\/([^/]+)(\/.*)$/.exec(url.pathname);
            if (!m0 || m0[1] !== HASH) return send(404, { status: 404, title: "Store not found" });
            const p = m0[2], q = url.searchParams;
            const b = body ? JSON.parse(body) : {};
            const v3err = (status, title, errors = {}) => send(status, { status, title, type: "https://developer.bigcommerce.com/api-docs/getting-started/api-status-codes", errors });
            const v2err = (status, message, details) => send(status, [{ status, message, ...(details ? { details } : {}) }]);
            const v3list = (all) => {
                const limit = Number(q.get("limit") ?? 50), page = Number(q.get("page") ?? 1);
                if (limit > 250) return v3err(422, "Invalid limit", { limit: "must be at most 250" });
                if (page > 1) stats.pages++;
                const slice = all.slice((page - 1) * limit, page * limit), total_pages = Math.ceil(all.length / limit) || 1;
                send(200, { data: slice, meta: { pagination: { total: all.length, count: slice.length, per_page: limit, current_page: page, total_pages, links: { current: `?page=${page}&limit=${limit}`, next: page < total_pages ? `?page=${page + 1}&limit=${limit}` : undefined } } } });
            };
            const v2list = (all) => {
                const limit = Number(q.get("limit") ?? 50), page = Number(q.get("page") ?? 1);
                if (limit > 250) return v2err(400, "The field 'limit' is invalid.");
                if (page > 1) stats.v2pages++;
                const slice = all.slice((page - 1) * limit, page * limit);
                if (!slice.length) { stats.empty204++; return send(204); }
                send(200, slice);
            };
            let m;
            if (p === "/v3/busy") { if (!stats.limited) { stats.limited++; return v3err(429, "Too many requests"); } return send(200, { data: "after the wait", meta: {} }); }
            if (p === "/v3/catalog/summary") return send(200, { data: { variant_count: products.size }, meta: {} });
            if (p === "/v3/catalog/categories") return v3list([{ id: 1, name: "Mugs" }, { id: 2, name: "Plates" }]);
            if (p === "/v3/catalog/products" && req.method === "POST") {
                const missing = ["name", "type", "weight", "price"].filter((k) => b[k] == null);
                if (missing.length) return v3err(422, "The product was not valid.", Object.fromEntries(missing.map((k) => [k, `${k} is required`])));
                if ([...products.values()].some((x) => x.name === b.name)) return v3err(409, "The product name is a duplicate", { name: "The product name is a duplicate" });
                const r = { ...b, id: ++n, is_visible: false, variants: [{ id: ++n, sku: b.sku }] };
                products.set(r.id, r);
                return send(200, { data: r, meta: {} });
            }
            if (p === "/v3/catalog/products" && req.method === "PUT") {
                stats.biggest = Math.max(stats.biggest, b.length);
                if (b.length > 10) return v3err(413, "The request payload is too large. The maximum items allowed in the array is 10");
                const data = [], errors = [];
                for (const x of b) { const r = products.get(x.id); if (r) { Object.assign(r, x); data.push(r); } else errors.push({ status: 404, title: `Product ${x.id} does not exist`, type: "x", errors: {} }); }
                if (errors.length) { stats.partly++; return send(207, { data, errors, meta: {} }); }
                return send(200, { data, meta: {} });
            }
            if (p === "/v3/catalog/products") {
                const like = q.get("name:like");
                return v3list([...products.values()].filter((x) => (!like || x.name.includes(like)) && (!q.has("is_visible") || x.is_visible === (q.get("is_visible") === "true"))).map(({ variants, ...x }) => (q.get("include")?.includes("variants") ? { ...x, variants } : x)));
            }
            if (m = /^\/v3\/catalog\/products\/(\d+)(\/variants)?$/.exec(p)) {
                const r = products.get(Number(m[1]));
                if (!r) return v3err(404, "The requested resource was not found");
                if (m[2]) return v3list(r.variants);
                if (req.method === "DELETE") { products.delete(r.id); return send(204); }
                if (req.method === "PUT") Object.assign(r, b);
                const { variants, ...x } = r;
                return send(200, { data: q.get("include")?.includes("variants") ? r : x, meta: {} });
            }
            if (p === "/v2/orders" && req.method === "POST") {
                if (!b.products?.length) return v2err(400, "The required field 'products' was not supplied.", { invalid_reason: "products" });
                const total = b.products.reduce((a, x) => a + x.price_inc_tax * x.quantity, 0).toFixed(4);
                const o = { id: ++n, status_id: 1, status: "Pending", total_inc_tax: total, lines: b.products };
                orders.set(o.id, o);
                return send(201, o);
            }
            if (p === "/v2/orders") return v2list([...orders.values()].filter((o) => !q.get("status_id") || o.status_id === Number(q.get("status_id"))));
            if (m = /^\/v2\/orders\/(\d+)(\/products)?$/.exec(p)) {
                const o = orders.get(Number(m[1]));
                if (!o) return v2err(404, "The requested resource was not found.");
                if (m[2]) return v2list(o.lines ?? []);
                if (req.method === "PUT") { Object.assign(o, b); if (b.status_id === 10) o.status = "Completed"; }
                return send(200, o);
            }
            return send(404, [{ status: 404, message: "The requested resource was not found." }]);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { BIGCOMMERCE_API_URL: `http://127.0.0.1:${port}`, BIGCOMMERCE_STORE_HASH: HASH, BIGCOMMERCE_ACCESS_TOKEN: TOKEN },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.pages || !stats.v2pages) return `the BigCommerce stand-in was not walked on both versions: ${JSON.stringify(stats)}`;
            if (!stats.limited) return "the BigCommerce stand-in never saw a 429 waited out";
            if (stats.biggest > 10) return "a batch held more than 10";
            if (!stats.partly) return "the BigCommerce stand-in gave no 207";
            return null;
        },
    };
}
