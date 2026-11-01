// A Shopify Admin GraphQL API for the shopify plugin's test, written from shopify.dev's "API rate
// limits" and GraphQL Admin pages: POST /admin/api/{version}/graphql.json with X-Shopify-Access-Token,
// a real leaky bucket (100 points, restoring 400 a second here so tests stay quick): each query costs
// points, the answer's extensions.cost holds requestedQueryCost, actualQueryCost and throttleStatus,
// and an empty bucket gives a 200 with errors[].extensions.code THROTTLED. Mutations answer userErrors
// with a 200, products page by cursor, and a bad field is a GraphQL error. POST
// /admin/oauth/access_token swaps a code once.
//
//   start({ port }) -> { env: { SHOPIFY_API_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_CLIENT_SECRET }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk_test_shopify";
const MAX = 100, RATE = 400;

export async function start({ port }) {
    const stats = { queries: 0, throttled: 0, pages: 0, created: 0, tokens: 0, version: null };
    let available = MAX, at = Date.now(), n = 8000;
    const refill = () => { const now = Date.now(); available = Math.min(MAX, available + (now - at) / 1000 * RATE); at = now; };
    const products = Array.from({ length: 130 }, (_, i) => ({ id: `gid://shopify/Product/${i + 1}`, title: `Mug ${i + 1}` }));
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            if (req.url === "/admin/oauth/access_token") {
                const b = JSON.parse(body);
                if (b.code !== "good-code" || b.client_secret !== "shpss-test") return send(400, { error: "invalid_request", error_description: "The authorization code was not found or was already used" });
                stats.tokens++;
                return send(200, { access_token: "qk-offline-token", scope: "read_orders,write_products" });
            }
            const m = /^\/admin\/api\/([\d-]+)\/graphql\.json$/.exec(req.url);
            if (!m) return send(404, { errors: "Not Found" });
            stats.version = m[1];
            if (req.headers["x-shopify-access-token"] !== TOKEN) return send(401, { errors: "[API] Invalid API key or access token (unrecognized login or wrong password)" });
            const { query, variables } = JSON.parse(body);
            const q = query ?? "";
            const cost = q.includes("products(first: 50") ? 60 : q.startsWith("mutation") ? 10 : 2;
            refill();
            const status = () => ({ maximumAvailable: MAX, currentlyAvailable: Math.floor(available), restoreRate: RATE });
            if (cost > available) { stats.throttled++; return send(200, { errors: [{ message: "Throttled", extensions: { code: "THROTTLED", documentation: "https://shopify.dev/api/usage/limits" } }], extensions: { cost: { requestedQueryCost: cost, actualQueryCost: null, throttleStatus: status() } } }); }
            available -= cost;
            const done = (data) => send(200, { data, extensions: { cost: { requestedQueryCost: cost, actualQueryCost: cost, throttleStatus: status() } } });
            stats.queries++;
            if (q.includes("nope")) return send(200, { errors: [{ message: "Field 'nope' doesn't exist on type 'QueryRoot'", locations: [{ line: 1, column: 3 }], path: ["query", "nope"] }] });
            if (q.includes("shop {")) return done({ shop: { name: "Quillo Demo", currencyCode: "EUR" } });
            if (q.includes("productCreate")) {
                const t = variables?.input?.title;
                if (!t) return done({ productCreate: { product: null, userErrors: [{ field: ["title"], message: "Title can't be blank" }] } });
                stats.created++;
                return done({ productCreate: { product: { id: `gid://shopify/Product/${++n}`, title: t }, userErrors: [] } });
            }
            if (q.includes("products(")) {
                const size = /first: (\d+)/.exec(q)[1] | 0, after = variables?.cursor ? Number(variables.cursor) : 0;
                if (after) stats.pages++;
                const page = products.slice(after, after + size);
                return done({ products: { nodes: page, ...(q.includes("pageInfo") ? { pageInfo: { hasNextPage: after + size < products.length, endCursor: String(after + size) } } : {}) } });
            }
            send(200, { errors: [{ message: "unknown query" }] });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { SHOPIFY_API_URL: `http://127.0.0.1:${port}`, SHOPIFY_ACCESS_TOKEN: TOKEN, SHOPIFY_CLIENT_SECRET: "shpss-test" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.queries || !stats.pages || !stats.created || !stats.tokens) return `the Shopify stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (!stats.throttled) return "no query was throttled, so waiting it out was not tried";
            if (stats.version !== "2025-10") return `the API version was ${stats.version}`;
            return null;
        },
    };
}
