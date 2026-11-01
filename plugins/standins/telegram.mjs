// A Telegram Bot API for the telegram plugin's test, written from core.telegram.org/bots/api:
// /bot<token>/<method>, answers { ok, result } or { ok: false, error_code, description, parameters }.
// sendMessage (text 1 to 4096 UTF-16 units, "chat not found", 403 "bot was blocked by the user"),
// sendPhoto as JSON and as multipart/form-data, editMessageText ("message is not modified"),
// answerCallbackQuery, setWebhook (secret_token's characters checked), getUpdates, and a 429 with
// retry_after. A reply_markup is stored with the message and comes back with it.
//
//   start({ port }) -> { env: { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_API_URL }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "123456:qk-test-telegram-token", CHAT = "777", SECRET = "hook-secret_1";

export async function start({ port }) {
    const stats = { sent: 0, photos: 0, uploads: 0, flood: 0, webhook: 0, keyboards: 0 };
    let nextId = 100;
    const texts = new Map();
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks);
            const answer = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const ok = (result) => answer(200, { ok: true, result });
            const bad = (error_code, description, parameters) => answer(error_code, { ok: false, error_code, description, ...(parameters ? { parameters } : {}) });
            const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url);
            if (!m) return bad(404, "Not Found");
            if (m[1] !== TOKEN) return bad(401, "Unauthorized");
            const method = m[2];
            let p = {}, file = null;
            const ctype = req.headers["content-type"] ?? "";
            if (ctype.startsWith("multipart/form-data")) {
                const boundary = /boundary=(.+)$/.exec(ctype)[1];
                for (const part of raw.toString("latin1").split(`--${boundary}`).slice(1, -1)) {
                    const [head, ...rest] = part.split("\r\n\r\n");
                    const value = rest.join("\r\n\r\n").replace(/\r\n$/, "");
                    const name = /name="([^"]+)"/.exec(head)[1];
                    if (/filename="/.test(head)) file = { name, filename: /filename="([^"]+)"/.exec(head)[1], size: value.length }; else p[name] = value;
                }
            } else if (raw.length) p = JSON.parse(raw.toString());
            const chat = (id) => ({ id: Number(id), type: "private" });
            const message = (extra) => ({ message_id: ++nextId, date: 1790000000, chat: chat(p.chat_id), ...extra });
            switch (method) {
                case "sendMessage": {
                    if (String(p.chat_id) === "-1") return bad(400, "Bad Request: chat not found");
                    if (String(p.chat_id) === "403") return bad(403, "Forbidden: bot was blocked by the user");
                    const units = Buffer.from(String(p.text ?? ""), "utf16le").length / 2;
                    if (!units) return bad(400, "Bad Request: message text is empty");
                    if (units > 4096) return bad(400, "Bad Request: message is too long");
                    if (p.text === "flood" && !stats.flood++) return bad(429, "Too Many Requests: retry after 1", { retry_after: 1 });
                    if (p.reply_markup) stats.keyboards++;
                    stats.sent++;
                    const msg = message({ text: p.text, ...(p.reply_markup ? { reply_markup: p.reply_markup } : {}) });
                    texts.set(msg.message_id, p.text);
                    return ok(msg);
                }
                case "sendPhoto":
                    if (file) { if (file.name !== "photo" || !file.size) return bad(400, "Bad Request: there is no photo in the request"); stats.uploads++; }
                    else if (typeof p.photo !== "string") return bad(400, "Bad Request: there is no photo in the request");
                    if ((p.caption ?? "").length > 1024) return bad(400, "Bad Request: message caption is too long");
                    stats.photos++;
                    return ok(message({ photo: [{ file_id: "f1", width: 90, height: 90 }], caption: p.caption }));
                case "editMessageText":
                    if (!texts.has(p.message_id)) return bad(400, "Bad Request: message to edit not found");
                    if (texts.get(p.message_id) === p.text) return bad(400, "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message");
                    texts.set(p.message_id, p.text);
                    return ok(message({ text: p.text }));
                case "answerCallbackQuery":
                    return p.callback_query_id ? ok(true) : bad(400, "Bad Request: query is too old and response timeout expired or query ID is invalid");
                case "setWebhook":
                    if (!/^[A-Za-z0-9_-]{1,256}$/.test(p.secret_token ?? "x")) return bad(400, "Bad Request: secret token contains unallowed characters");
                    if (!p.url?.startsWith("https://")) return bad(400, "Bad Request: bad webhook: An HTTPS URL must be provided for webhook");
                    stats.webhook++;
                    return ok(true);
                case "getUpdates":
                    return ok([
                        { update_id: 9001, message: { message_id: 5, from: { id: 42, first_name: "Ada" }, chat: chat(42), date: 1790000000, text: "/start@my_bot now" } },
                        { update_id: 9002, callback_query: { id: "cb1", from: { id: 42 }, message: { message_id: 6, chat: chat(42) }, data: "approve:1001" } },
                    ]);
                default: return bad(404, "Not Found: method not found");
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: CHAT, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_URL: `http://127.0.0.1:${port}` },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.sent || !stats.photos || !stats.uploads || !stats.webhook || !stats.keyboards) return `the Telegram stand-in was not reached by everything: ${JSON.stringify(stats)}`;
            if (stats.flood < 2) return "the plugin did not wait out the 429";
            return null;
        },
    };
}
