// A Mailchimp Marketing API for the mailchimp plugin's test, written from mailchimp.com/developer: HTTP
// Basic with any user and the API key as password, /lists/{id}/members/{subscriber_hash} where the
// hash must be the MD5 of the lower-cased email (a mismatch with the body's address is refused, as
// the real one does), PUT with status_if_new, PATCH, DELETE, /actions/delete-permanent, list with
// count and offset (at most 1000), POST /lists/{id} batch subscribe (at most 500; total_created,
// total_updated, error_count, errors), /tags (204), /webhooks. Errors are RFC 7807 problems: { type,
// title, status, detail, instance, errors }.
//
//   start({ port }) -> { env: { MAILCHIMP_API_URL, MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID, MAILCHIMP_WEBHOOK_SECRET }, close(), check() }
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const KEY = "qktestmailchimp-us21", LIST = "a1b2c3d4e5";
const md5 = (s) => createHash("md5").update(s).digest("hex");

export async function start({ port }) {
    const stats = { upserts: 0, biggestBatch: 0, batches: 0, pages: 0, tagged: 0, limited: 0, forgotten: 0 };
    const members = new Map(), hooks = [];
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(v === undefined ? "" : JSON.stringify(v)); };
            const fail = (status, title, detail, errors) => { res.writeHead(status, { "content-type": "application/problem+json" }); res.end(JSON.stringify({ type: "https://mailchimp.com/developer/marketing/docs/errors/", title, status, detail, instance: "abc", ...(errors ? { errors } : {}) })); };
            const pass = Buffer.from((req.headers.authorization ?? "").replace("Basic ", ""), "base64").toString().split(":")[1];
            if (pass !== KEY) return fail(401, "API Key Invalid", "Your API key may be invalid, or you've attempted to access the wrong datacenter.");
            const url = new URL(req.url, "http://x");
            const p = url.pathname, b = body ? JSON.parse(body) : {};
            const m0 = /^\/lists\/([^/]+)(\/.*)?$/.exec(p);
            if (!m0 || m0[1] !== LIST) return fail(404, "Resource Not Found", "The requested resource could not be found.");
            const rest = m0[2] ?? "";
            const put = (email, f) => {
                const hash = md5(email.toLowerCase());
                const had = members.get(hash);
                const m = had ?? { id: hash, email_address: email.toLowerCase(), status: f.status_if_new ?? f.status, merge_fields: {}, tags: [] };
                if (had && f.status) m.status = f.status;
                Object.assign(m.merge_fields, f.merge_fields ?? {});
                members.set(hash, m);
                return had ? "updated" : "created";
            };
            if (req.method === "POST" && !rest) {
                if (b.members.length > 500) return fail(400, "Invalid Resource", "at most 500 members in one request");
                stats.batches++; stats.biggestBatch = Math.max(stats.biggestBatch, b.members.length);
                const out = { new_members: [], updated_members: [], errors: [], total_created: 0, total_updated: 0, error_count: 0 };
                for (const m of b.members) {
                    if (m.email_address.endsWith("@fake")) { out.errors.push({ email_address: m.email_address, error: `${m.email_address} looks fake or invalid, please enter a real email address.`, error_code: "ERROR_GENERIC" }); out.error_count++; continue; }
                    if (members.has(md5(m.email_address)) && !b.update_existing) { out.errors.push({ email_address: m.email_address, error: "already a list member", error_code: "ERROR_CONTACT_EXISTS" }); out.error_count++; continue; }
                    if (put(m.email_address, m) === "created") out.total_created++; else out.total_updated++;
                }
                return send(200, out);
            }
            if (rest === "/members") {
                const count = Number(url.searchParams.get("count") ?? 10), offset = Number(url.searchParams.get("offset") ?? 0);
                if (count > 1000) return fail(400, "Invalid Resource", "count must be at most 1000");
                if (offset) stats.pages++;
                const all = [...members.values()];
                return send(200, { members: all.slice(offset, offset + count), total_items: all.length });
            }
            if (rest === "/webhooks") {
                if (req.method === "POST") { if (!b.url?.startsWith("https://")) return fail(400, "Invalid Resource", "The resource submitted could not be validated."); const h = { id: "wh1", ...b }; hooks.push(h); return send(200, h); }
                return send(200, { webhooks: hooks, total_items: hooks.length });
            }
            const m = /^\/members\/([0-9a-f]{32})(\/.*)?$/.exec(rest);
            if (!m) return fail(404, "Resource Not Found", "The requested resource could not be found.");
            const [, hash, sub] = m;
            if (!sub && req.method === "PUT") {
                if (md5(b.email_address.toLowerCase()) !== hash) return fail(400, "Invalid Resource", "The subscriber hash does not match the email address");
                if (b.email_address === "fake@fake.example") return fail(400, "Invalid Resource", "fake@fake.example looks fake or invalid, please enter a real email address.");
                if (b.email_address === "rate@example.com" && !stats.limited++) return fail(429, "Too Many Requests", "You have more than 10 simultaneous connections.");
                if (!b.status_if_new && !members.has(hash)) return fail(400, "Invalid Resource", "The resource submitted could not be validated.", [{ field: "status", message: "The status field is required" }]);
                stats.upserts++;
                put(b.email_address, b);
                return send(200, members.get(hash));
            }
            if (sub === "/actions/delete-permanent") { members.delete(hash); stats.forgotten++; return send(204); }
            const member = members.get(hash);
            if (!member) return fail(404, "Resource Not Found", "The requested resource could not be found.");
            if (sub === "/tags") {
                if (req.method === "GET") return send(200, { tags: member.tags.map((name) => ({ id: 1, name })), total_items: member.tags.length });
                for (const t of b.tags) {
                    if (!["active", "inactive"].includes(t.status)) return fail(400, "Invalid Resource", "status must be active or inactive");
                    member.tags = member.tags.filter((x) => x !== t.name);
                    if (t.status === "active") member.tags.push(t.name);
                }
                stats.tagged++;
                return send(204);
            }
            if (req.method === "GET") return send(200, member);
            if (req.method === "PATCH") { Object.assign(member, b); return send(200, member); }
            if (req.method === "DELETE") { members.delete(hash); return send(204); }
            fail(405, "Method Not Allowed", "Not allowed");
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MAILCHIMP_API_URL: `http://127.0.0.1:${port}`, MAILCHIMP_API_KEY: KEY, MAILCHIMP_LIST_ID: LIST, MAILCHIMP_WEBHOOK_SECRET: "whsec-qk" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.upserts || !stats.batches || !stats.pages || !stats.tagged || !stats.forgotten) return `the Mailchimp stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.biggestBatch !== 500) return `the biggest batch was ${stats.biggestBatch}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
