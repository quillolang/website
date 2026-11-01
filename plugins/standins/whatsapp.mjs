// A WhatsApp Cloud API for the whatsapp plugin's test, written from Meta's Cloud API reference and
// its error codes page: Bearer token (190 OAuthException when wrong), POST /v23.0/{phone}/messages
// with messaging_product "whatsapp", `to` as digits only, `type` with its matching part; templates
// must exist and take as many parameters as they have variables (132000, 132001); a number out of
// its 24-hour window gets 131047, and 130429 is the rate limit. Read receipts answer { success: true }.
// Errors have Meta's { error: { message, type, code, error_data: { details }, fbtrace_id } }.
//
//   start({ port }) -> { env: { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_URL, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "qk-test-whatsapp", PHONE = "106540352242922";
const TEMPLATES = { hello_world: 0, order_update: 2 };

export async function start({ port }) {
    const stats = { texts: 0, templates: 0, other: 0, limited: 0, components: null };
    let n = 0;
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const fail = (status, code, message, details, type = "OAuthException") => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message, type, code, ...(details ? { error_data: { messaging_product: "whatsapp", details } } : {}), fbtrace_id: "AbCdEf" } })); };
            const ok = (v) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(401, 190, "Error validating access token: Session has expired");
            if (req.method !== "POST" || req.url !== `/v23.0/${PHONE}/messages`) return fail(400, 100, "Unsupported post request.");
            const p = JSON.parse(body);
            if (p.messaging_product !== "whatsapp") return fail(400, 100, "(#100) The parameter messaging_product is required.");
            if (p.status === "read") return p.message_id ? ok({ success: true }) : fail(400, 100, "(#100) message_id is required");
            if (!/^\d+$/.test(p.to ?? "")) return fail(400, 100, "(#100) Invalid parameter", "to must hold digits only");
            if (!p.type || !p[p.type]) return fail(400, 100, `(#100) The parameter ${p.type} is required.`);
            if (p.to === "15550000001") return fail(400, 131047, "(#131047) Re-engagement message", "Message failed to send because more than 24 hours have passed since the customer last replied to this number.");
            if (p.to === "15550000002" && !stats.limited++) return fail(400, 130429, "(#130429) Rate limit hit", "Cloud API message throughput has been reached.");
            let status;
            if (p.type === "template") {
                const t = p.template, want = TEMPLATES[t.name];
                if (want === undefined) return fail(404, 132001, "(#132001) Template name does not exist in the translation", `template name (${t.name}) does not exist in ${t.language?.code}`);
                if (!t.language?.code) return fail(400, 100, "(#100) language is required");
                const bodyParams = t.components?.find((c) => c.type === "body")?.parameters ?? [];
                if (bodyParams.length !== want) return fail(400, 132000, "(#132000) Number of parameters does not match the expected number of params", `body: number of localizable_params (${bodyParams.length}) does not match the expected number of params (${want})`);
                if (want) stats.components = t.components;
                status = "accepted";
                stats.templates++;
            } else if (p.type === "text") { if (typeof p.text.body !== "string") return fail(400, 100, "(#100) text.body is required"); stats.texts++; } else stats.other++;
            ok({ messaging_product: "whatsapp", contacts: [{ input: p.to, wa_id: p.to }], messages: [{ id: `wamid.HBg${++n}`, ...(status ? { message_status: status } : {}) }] });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { WHATSAPP_TOKEN: TOKEN, WHATSAPP_PHONE_NUMBER_ID: PHONE, WHATSAPP_API_URL: `http://127.0.0.1:${port}`, WHATSAPP_APP_SECRET: "app-secret", WHATSAPP_VERIFY_TOKEN: "verify-me" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.texts || !stats.templates || !stats.other) return `the WhatsApp stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.limited < 2) return "the plugin did not retry 130429";
            const types = stats.components?.map((c) => c.type).join();
            if (types !== "header,body,button") return `the template's components came as ${types}`;
            return null;
        },
    };
}
