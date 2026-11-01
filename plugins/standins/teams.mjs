// Teams incoming webhooks for the teams plugin's test, written from Microsoft's "Create incoming
// webhooks" and "Send Adaptive Cards using an incoming webhook" pages and the Adaptive Card schema.
// /workflows/... acts as a Workflows trigger (202 with an empty body), /webhookb2/... as the classic
// connector (200 "1", and a 200 with words when delivery failed), /gone is a webhook that was
// removed (404). A message must be { type: "message", attachments: [ one with contentType
// application/vnd.microsoft.card.adaptive and a content of type AdaptiveCard, a version, a body ] }.
//
//   start({ port }) -> { env: { TEAMS_WEBHOOK_URL, TEAMS_CLASSIC_URL, TEAMS_GONE_URL }, close(), check() }
import { createServer } from "node:http";

export async function start({ port }) {
    const cards = [];
    const stats = { workflows: 0, classic: 0, limited: 0 };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, text = "", headers = {}) => { res.writeHead(code, { "content-type": "text/plain", ...headers }); res.end(text); };
            if (req.method !== "POST") return send(405);
            if (req.url.startsWith("/gone")) return send(404, "The webhook no longer exists.");
            let m;
            try { m = JSON.parse(body); } catch { return send(400, "Summary or Text is required."); }
            const a = m.attachments?.[0];
            if (m.type !== "message" || a?.contentType !== "application/vnd.microsoft.card.adaptive") return send(400, "the message must hold an Adaptive Card attachment");
            const c = a.content;
            if (c?.type !== "AdaptiveCard" || !c.version || !Array.isArray(c.body) || !c.body.length) return send(400, "the Adaptive Card is not valid");
            const text = c.body[0].text;
            if (text === "rate me" && !stats.limited++) return send(429, "Too many requests", { "retry-after": "1" });
            cards.push(c);
            if (req.url.startsWith("/webhookb2/")) {
                if (text === "undeliverable") return send(200, "Webhook message delivery failed with error: Microsoft Teams endpoint returned HTTP error 413 with ContextId tcid=0.");
                stats.classic++;
                return send(200, "1");
            }
            stats.workflows++;
            send(202);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${port}`;
    return {
        env: { TEAMS_WEBHOOK_URL: `${base}/workflows/abc/triggers/manual/paths/invoke?sig=qk-test`, TEAMS_CLASSIC_URL: `${base}/webhookb2/abc/IncomingWebhook/def`, TEAMS_GONE_URL: `${base}/gone/abc` },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.workflows || !stats.classic) return `the Teams stand-in was not reached by both kinds of webhook: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not retry a 429";
            if (!cards.some((c) => c.body.some((b) => b.type === "FactSet") && c.actions?.[0]?.type === "Action.OpenUrl")) return "no card with facts and a button arrived";
            return null;
        },
    };
}
