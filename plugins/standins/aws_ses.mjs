// Amazon SES API v2 for the aws_ses plugin's test, written from the SESv2 API Reference: Signature V4
// (service ses), POST /v2/email/outbound-emails (Simple, Raw or Template content, an unverified
// sender is 400 MessageRejected, more than 50 recipients 400 BadRequestException),
// POST /v2/email/outbound-bulk-emails, POST/GET/PUT/DELETE /v2/email/templates (409
// AlreadyExistsException, 404 NotFoundException), POST .../render (a {{name}} left unfilled is
// 400 MissingRenderingAttributeException... as SES says it), GET /v2/email/account, and the
// suppression list. Errors carry x-amzn-ErrorType and { message }. A Raw message is parsed enough
// to check its headers and parts; /_last says what it saw (not SES's).
//
//   start({ port }) -> { env: { SES_API_URL, SES_FROM, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY }, close(), check() }
import { createServer } from "node:http";
import { sigv4Check } from "./aws_dynamodb_sigv4.mjs";

const ACCESS = "AKIDQUILLOTEST", SECRET = "quillo-test-secret-for-the-standin", REGION = "eu-west-1";
const VERIFIED = "@example.com";

function readRaw(b64) {
    const text = Buffer.from(b64, "base64").toString();
    const [head, ...rest] = text.split("\r\n\r\n");
    const heads = Object.fromEntries(head.replace(/\r\n /g, " ").split("\r\n").map((l) => { const i = l.indexOf(": "); return [l.slice(0, i).toLowerCase(), l.slice(i + 2)]; }));
    const subject = (heads.subject ?? "").split(" ").map((w) => { const m = w.match(/^=\?UTF-8\?B\?(.*)\?=$/); return m ? Buffer.from(m[1], "base64") : Buffer.from(w); });
    const boundary = heads["content-type"]?.match(/boundary="([^"]+)"/)?.[1];
    const body = rest.join("\r\n\r\n");
    const parts = boundary ? body.split(`--${boundary}`).slice(1, -1) : [];
    const att = parts.find((p) => p.includes("Content-Disposition: attachment"));
    return { subject: Buffer.concat(subject).toString(), parts: parts.length, closed: body.includes(`--${boundary}--`), attachment: att ? Buffer.from(att.split("\r\n\r\n")[1].replace(/\s/g, ""), "base64").toString() : null, filename: att?.match(/filename="([^"]+)"/)?.[1] ?? null, mime: heads["mime-version"] };
}

export async function start({ port }) {
    const stats = { refused: 0, sent: 0, raw: 0, bulk: 0, templates: 0 };
    const templates = new Map(), suppressed = new Map();
    let last = null;
    class Err { constructor(status, type, message) { Object.assign(this, { status, type, message }); } }
    function checkSend(b) {
        if (b.FromEmailAddress && !b.FromEmailAddress.endsWith(VERIFIED)) throw new Err(400, "MessageRejected", `Email address is not verified. The following identities failed the check in region EU-WEST-1: ${b.FromEmailAddress}`);
        const d = b.Destination ?? {};
        if ((d.ToAddresses?.length ?? 0) + (d.CcAddresses?.length ?? 0) + (d.BccAddresses?.length ?? 0) > 50) throw new Err(400, "BadRequestException", "Recipient count exceeds 50.");
    }
    const fill = (t, data) => t.replace(/\{\{(\w+)\}\}/g, (_, n) => { if (data[n] == null) throw new Err(400, "BadRequestException", `Attribute '${n}' is not present in the rendering data.`); return String(data[n]); });
    function route(req, url, b) {
        const p = url.pathname, m = req.method;
        if (m === "POST" && p === "/v2/email/outbound-emails") {
            checkSend(b);
            const c = b.Content ?? {};
            if (c.Raw) { stats.raw++; last = readRaw(c.Raw.Data); }
            else if (c.Template) { if (!templates.has(c.Template.TemplateName)) throw new Err(404, "NotFoundException", `Template ${c.Template.TemplateName} does not exist.`); }
            else if (!c.Simple?.Subject?.Data || !(c.Simple.Body?.Text || c.Simple.Body?.Html)) throw new Err(400, "BadRequestException", "Content is required.");
            if (!c.Raw && !b.FromEmailAddress) throw new Err(400, "BadRequestException", "FromEmailAddress is required");
            stats.sent++;
            return [200, { MessageId: `0100018f-${stats.sent}-quillo` }];
        }
        if (m === "POST" && p === "/v2/email/outbound-bulk-emails") {
            checkSend(b);
            if (!templates.has(b.DefaultContent?.Template?.TemplateName)) throw new Err(404, "NotFoundException", "Template does not exist.");
            if (b.BulkEmailEntries.length > 50) throw new Err(400, "BadRequestException", "Too many entries");
            stats.bulk++;
            return [200, { BulkEmailEntryResults: b.BulkEmailEntries.map((e, i) => { const to = e.Destination.ToAddresses[0]; return to.startsWith("bounced") ? { Status: "ACCOUNT_SUPPRESSED", Error: "Address on the suppression list" } : { Status: "SUCCESS", MessageId: `bulk-${i}` }; }) }];
        }
        if (m === "POST" && p === "/v2/email/templates") {
            if (templates.has(b.TemplateName)) throw new Err(400, "AlreadyExistsException", `Template ${b.TemplateName} already exists for account.`);
            stats.templates++; templates.set(b.TemplateName, b.TemplateContent); return [200, {}];
        }
        const tm = p.match(/^\/v2\/email\/templates\/([^/]+)(\/render)?$/);
        if (tm) {
            const n = decodeURIComponent(tm[1]);
            if (!templates.has(n)) throw new Err(404, "NotFoundException", `Template ${n} does not exist.`);
            if (m === "GET") return [200, { TemplateName: n, TemplateContent: templates.get(n) }];
            if (m === "PUT") { templates.set(n, b.TemplateContent); return [200, {}]; }
            if (m === "DELETE") { templates.delete(n); return [200, {}]; }
            if (m === "POST" && tm[2]) { const t = templates.get(n), d = JSON.parse(b.TemplateData); return [200, { RenderedTemplate: `Subject: ${fill(t.Subject, d)}\r\n\r\n${fill(t.Text, d)}` }]; }
        }
        if (m === "GET" && p === "/v2/email/account") return [200, { ProductionAccessEnabled: true, SendingEnabled: true, EnforcementStatus: "HEALTHY", SendQuota: { Max24HourSend: 50000, MaxSendRate: 14, SentLast24Hours: 1200 }, SuppressionAttributes: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] } }];
        if (m === "PUT" && p === "/v2/email/suppression/addresses") { suppressed.set(b.EmailAddress, { EmailAddress: b.EmailAddress, Reason: b.Reason, LastUpdateTime: 1730000000 }); return [200, {}]; }
        const sm = p.match(/^\/v2\/email\/suppression\/addresses\/(.+)$/);
        if (sm) {
            const e = decodeURIComponent(sm[1]);
            if (!suppressed.has(e)) throw new Err(404, "NotFoundException", `${e} is not on the suppression list.`);
            if (m === "GET") return [200, { SuppressedDestination: suppressed.get(e) }];
            if (m === "DELETE") { suppressed.delete(e); return [200, {}]; }
        }
        throw new Err(404, "NotFoundException", `No route ${m} ${p}`);
    }
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks), url = new URL(req.url, "http://x");
            const send = (status, v, heads = {}) => { res.writeHead(status, { "content-type": "application/json", ...heads }); res.end(JSON.stringify(v)); };
            if (url.pathname === "/_last") return send(200, last);
            const bad = sigv4Check(req, raw, { access: ACCESS, secret: SECRET, region: REGION, service: "ses" });
            if (bad) { stats.refused++; return send(403, { message: bad.message }, { "x-amzn-errortype": bad.code }); }
            try { const [s, v] = route(req, url, raw.length ? JSON.parse(raw.toString()) : {}); send(s, v); }
            catch (e) { if (e instanceof Err) send(e.status, { message: e.message }, { "x-amzn-errortype": e.type }); else send(500, { message: String(e) }, { "x-amzn-errortype": "InternalFailure" }); }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { SES_API_URL: `http://127.0.0.1:${port}`, SES_FROM: "shop@example.com", AWS_REGION: REGION, AWS_ACCESS_KEY_ID: ACCESS, AWS_SECRET_ACCESS_KEY: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (stats.refused ? `${stats.refused} signatures refused` : !stats.sent ? "nothing was sent" : !stats.raw ? "no raw message came" : !stats.bulk ? "no bulk send came" : null),
    };
}
