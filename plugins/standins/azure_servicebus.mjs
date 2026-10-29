// An Azure Service Bus namespace for the azure_servicebus plugin's test, written from the REST
// reference (learn.microsoft.com/rest/api/servicebus: Send Message, Send Message Batch, Receive
// and Delete, Peek-Lock, Unlock, Delete (complete), Renew Lock) and the SAS document
// (learn.microsoft.com/azure/service-bus-messaging/service-bus-sas): every request's
// SharedAccessSignature is checked (key name, expiry, resource prefix, and the HMAC-SHA256 of
// "<sr>\n<se>" with the key). A queue, and a topic whose subscriptions each get a copy;
// BrokerProperties in and out, user properties as headers (text quoted), batches as
// application/vnd.microsoft.servicebus.json, scheduled messages, time to live, locks that run out
// (DeliveryCount goes up), long polling with ?timeout=, and errors as <Error><Code>..</Code><Detail>..</Detail></Error>.
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const KEY_NAME = "RootManageSharedAccessKey", KEY = "c3RhbmRpbi1zZXJ2aWNlYnVzLWtleS0wMTIzNDU2Nzg5YWI=";
const LOCK_SECONDS = 30;

function rfc1123(ms) { return new Date(ms).toUTCString(); }

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const queues = new Map([["orders", []], ["payments", []]]);
    const topics = new Map([["events", new Map([["audit", []], ["mail", []]])]]);
    const seen = { send: 0, batch: 0, receiveDelete: 0, peekLock: 0, complete: 0, unlock: 0, renew: 0, refused: 0, userProps: 0 };
    let seq = 0;

    const xmlError = (res, code, detail) => { res.writeHead(code, { "content-type": "application/xml; charset=utf-8" }); res.end(`<Error><Code>${code}</Code><Detail>${detail}</Detail></Error>`); };

    function checkSas(req) {
        const h = req.headers.authorization ?? "";
        if (!h.startsWith("SharedAccessSignature ")) return "MissingToken: The request has no SharedAccessSignature authorization header.";
        const fields = Object.fromEntries(h.slice(22).split("&").map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }));
        const { sr, sig, se, skn } = fields;
        if (!sr || !sig || !se || !skn) return "InvalidSignature: The token has a missing sr, sig, se or skn.";
        if (skn !== KEY_NAME) return `InvalidSignature: The key name ${skn} is not known.`;
        if (Number(se) < Date.now() / 1000) return "ExpiredToken: The token is expired.";
        const expected = createHmac("sha256", KEY).update(`${sr}\n${se}`).digest("base64");
        if (decodeURIComponent(sig) !== expected) return "InvalidSignature: The token has an invalid signature.";
        const resource = decodeURIComponent(sr).toLowerCase().replace(/\/+$/, "");
        const target = `${base}${new URL(req.url, "http://x").pathname}`.toLowerCase();
        if (!target.startsWith(resource)) return `InvalidAudience: The token is for ${resource}, not ${target}.`;
        return null;
    }

    // Which list a path's messages are in: a queue, or a topic's subscription; for a send to a topic, all of them.
    function target(parts, sending) {
        if (parts.length >= 1 && queues.has(parts[0]) && !(parts[1] === "subscriptions")) return { lists: [queues.get(parts[0])], rest: parts.slice(1) };
        if (topics.has(parts[0])) {
            const subs = topics.get(parts[0]);
            if (sending && parts[1] === "messages") return { lists: [...subs.values()], rest: parts.slice(1) };
            if (parts[1] === "subscriptions" && subs.has(parts[2])) return { lists: [subs.get(parts[2])], rest: parts.slice(3) };
        }
        return null;
    }

    function enqueue(lists, body, bp, props) {
        const now = Date.now();
        for (const list of lists) {
            seq++;
            list.push({
                body: Buffer.from(body), props, seq,
                bp: { ...bp, MessageId: bp.MessageId ?? randomUUID().replace(/-/g, ""), SequenceNumber: seq, EnqueuedSequenceNumber: seq, EnqueuedTimeUtc: rfc1123(now), State: "Active", DeliveryCount: 0 },
                visibleAt: bp.ScheduledEnqueueTimeUtc ? Date.parse(bp.ScheduledEnqueueTimeUtc) : now,
                expiresAt: bp.TimeToLive ? now + bp.TimeToLive * 1000 : Infinity, lock: null, lockedUntil: 0,
            });
        }
    }
    function next(list) {
        const now = Date.now();
        for (let i = list.length - 1; i >= 0; i--) if (list[i].expiresAt <= now) list.splice(i, 1);
        return list.find((m) => m.visibleAt <= now && (!m.lock || m.lockedUntil <= now));
    }
    function reply(res, code, m, extra = {}) {
        const headers = { "content-type": "text/plain; charset=utf-8", BrokerProperties: JSON.stringify(m.bp), ...extra };
        for (const [k, v] of Object.entries(m.props)) headers[k] = v;
        res.writeHead(code, headers);
        res.end(m.body);
    }
    const STANDARD = new Set(["host", "authorization", "content-type", "content-length", "brokerproperties", "connection", "accept", "accept-encoding", "user-agent", "transfer-encoding"]);

    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", async () => {
            const body = Buffer.concat(chunks);
            const bad = checkSas(req);
            if (bad) { seen.refused++; return xmlError(res, 401, bad); }
            const u = new URL(req.url, "http://x");
            const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            const t = target(parts, req.method === "POST" && parts.at(-1) === "messages");
            if (!t) return xmlError(res, 404, `The messaging entity '${base}${u.pathname}' could not be found.`);
            const [what, a, b] = t.rest;
            if (what !== "messages") return xmlError(res, 404, "Unknown path.");
            const timeout = Math.min(Number(u.searchParams.get("timeout") ?? 60), 230);
            if (req.method === "POST" && !a) {
                const ct = String(req.headers["content-type"] ?? "");
                if (ct.startsWith("application/vnd.microsoft.servicebus.json")) {
                    let list;
                    try { list = JSON.parse(body.toString()); } catch { return xmlError(res, 400, "The batch is not valid JSON."); }
                    if (!Array.isArray(list) || !list.length) return xmlError(res, 400, "A batch is a non-empty JSON array.");
                    for (const m of list) {
                        const props = Object.fromEntries(Object.entries(m.UserProperties ?? {}).map(([k, v]) => [k, typeof v === "string" ? JSON.stringify(v) : String(v)]));
                        if (Object.keys(props).length) seen.userProps++;
                        enqueue(t.lists, m.Body ?? "", m.BrokerProperties ?? {}, props);
                    }
                    seen.batch++;
                } else {
                    let bp = {};
                    if (req.headers.brokerproperties) { try { bp = JSON.parse(req.headers.brokerproperties); } catch { return xmlError(res, 400, "BrokerProperties is not valid JSON."); } }
                    const props = {};
                    for (const [k, v] of Object.entries(req.headers)) if (!STANDARD.has(k)) props[k] = v;
                    if (Object.keys(props).length) seen.userProps++;
                    enqueue(t.lists, body, bp, props);
                    seen.send++;
                }
                res.writeHead(201); return res.end();
            }
            if (a === "head" && (req.method === "DELETE" || req.method === "POST")) {
                const list = t.lists[0];
                const until = Date.now() + timeout * 1000;
                let m;
                while (!(m = next(list)) && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
                if (!m) { res.writeHead(204); return res.end(); }
                m.bp.DeliveryCount++;
                if (req.method === "DELETE") { list.splice(list.indexOf(m), 1); seen.receiveDelete++; return reply(res, 200, m); }
                m.lock = randomUUID(); m.lockedUntil = Date.now() + LOCK_SECONDS * 1000;
                m.bp.LockToken = m.lock; m.bp.LockedUntilUtc = rfc1123(m.lockedUntil);
                seen.peekLock++;
                const path = parts.slice(0, parts.length - 2).join("/");
                return reply(res, 201, m, { Location: `${base}/${path}/messages/${encodeURIComponent(m.bp.MessageId)}/${m.lock}` });
            }
            if (a && b) {
                const list = t.lists[0];
                const m = list.find((x) => x.bp.MessageId === a && x.lock === b);
                if (!m || m.lockedUntil <= Date.now()) return xmlError(res, 404, "The lock supplied is invalid. Either the lock expired, or the message has already been removed from the queue.");
                if (req.method === "DELETE") { list.splice(list.indexOf(m), 1); seen.complete++; res.writeHead(200); return res.end(); }
                if (req.method === "PUT") { m.lock = null; m.lockedUntil = 0; delete m.bp.LockToken; delete m.bp.LockedUntilUtc; seen.unlock++; res.writeHead(200); return res.end(); }
                if (req.method === "POST") { m.lockedUntil = Date.now() + LOCK_SECONDS * 1000; m.bp.LockedUntilUtc = rfc1123(m.lockedUntil); seen.renew++; res.writeHead(200); return res.end(); }
            }
            xmlError(res, 405, "The method is not allowed here.");
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { SERVICEBUS_CONNECTION_STRING: `Endpoint=sb://127.0.0.1:${port}/;SharedAccessKeyName=${KEY_NAME};SharedAccessKey=${KEY};UseDevelopmentEmulator=true` },
        close() { server.close(); },
        check() {
            const missing = ["send", "batch", "receiveDelete", "peekLock", "complete", "unlock", "renew", "userProps"].filter((k) => !seen[k]);
            if (missing.length) return `the Service Bus stand-in never got: ${missing.join(", ")}`;
            return null;
        },
    };
}
