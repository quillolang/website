// Apple's APNs for the apns plugin's test, written from "Sending notification requests to APNs" and
// "Handling notification responses from APNs": HTTP/2 only, over TLS with ALPN h2 (node:http2 with
// proto_tls.mjs's test certificate), POST /3/device/<token>. Each request is checked as Apple does:
// authorization `bearer` with an ES256 JWT (kid and iss known, iat within the hour, signature checked
// with the key's public half), apns-topic, apns-push-type, apns-priority (10, 5 or 1; 10 refused on
// background), apns-collapse-id of 64 bytes at most, a payload of 4096 bytes (5120 for voip). Answers:
// 200 with apns-id and apns-unique-id, or { reason }: 400 BadDeviceToken, BadTopic, DeviceTokenNotForTopic,
// BadCollapseId, PayloadTooLarge; 403 InvalidProviderToken, ExpiredProviderToken; 410 Unregistered
// with a timestamp; 429 TooManyRequests; 503 ServiceUnavailable.
//
//   start({ port }) -> { env: { APNS_HOST, APNS_CA, APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC, DEVICE_TOKEN }, close(), check() }
import { createSecureServer } from "node:http2";
import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { ca, cert, key } from "./proto_tls.mjs";

const KEY_ID = "ABC1234567", TEAM = "DEF1234567", TOPIC = "com.example.app", DEVICE = "a1".repeat(32);

export async function start({ port }) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const stats = { accepted: 0, sessions: 0, collapse: 0, background: 0, voip: 0, renewed: 0, retried: 0, tokens: new Set(), badJwt: 0 };
    let expireOnce = true, failOnce = true;
    const server = createSecureServer({ key, cert, allowHTTP1: false });
    server.on("session", () => stats.sessions++);
    server.on("stream", (stream, h) => {
        const chunks = [];
        stream.on("data", (d) => chunks.push(d));
        stream.on("end", () => {
            const id = h["apns-id"] ?? randomUUID();
            const answer = (status, body) => {
                stream.respond({ ":status": status, "apns-id": id, ...(status === 200 ? { "apns-unique-id": randomUUID() } : {}), ...(body ? { "content-type": "application/json" } : {}) });
                stream.end(body ? JSON.stringify(body) : undefined);
            };
            const no = (status, reason, extra = {}) => answer(status, { reason, ...extra });
            const m = /^\/3\/device\/(.+)$/.exec(h[":path"]);
            if (h[":method"] !== "POST") return no(405, "MethodNotAllowed");
            if (!m) return no(404, "BadPath");
            const auth = (h.authorization ?? "").replace(/^bearer /, "");
            const parts = auth.split(".");
            if (parts.length !== 3) return no(403, "MissingProviderToken");
            const head = JSON.parse(Buffer.from(parts[0], "base64url")), claims = JSON.parse(Buffer.from(parts[1], "base64url"));
            const good = head.alg === "ES256" && head.kid === KEY_ID && claims.iss === TEAM && verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"));
            if (!good) { stats.badJwt++; return no(403, "InvalidProviderToken"); }
            if (Math.abs(Date.now() / 1000 - claims.iat) > 3600) return no(403, "ExpiredProviderToken");
            stats.tokens.add(auth);
            const raw = Buffer.concat(chunks), type = h["apns-push-type"], topic = h["apns-topic"], prio = h["apns-priority"];
            if (!raw.length) return no(400, "PayloadEmpty");
            if (raw.length > (type === "voip" ? 5120 : 4096)) return no(413, "PayloadTooLarge");
            const device = m[1];
            if (device === "dead".repeat(16)) return no(410, "Unregistered", { timestamp: 1790000000000 });
            if (device === "0bad".repeat(16)) return no(400, "BadDeviceToken");
            if (device !== DEVICE) return no(400, "BadDeviceToken");
            if (!topic) return no(400, "MissingTopic");
            if (topic === "com.example.other") return no(400, "DeviceTokenNotForTopic");
            if (topic !== (type === "voip" ? `${TOPIC}.voip` : TOPIC)) return no(400, "BadTopic");
            if (!["alert", "background", "voip"].includes(type)) return no(400, "InvalidPushType");
            if (!["10", "5", "1", undefined].includes(prio)) return no(400, "BadPriority");
            if (type === "background" && prio === "10") return no(400, "BadPriority");
            if ((h["apns-collapse-id"] ?? "").length > 64) return no(400, "BadCollapseId");
            const payload = JSON.parse(raw.toString());
            if (!payload.aps) return no(400, "BadMessage");
            const title = payload.aps.alert?.title;
            if (title === "expire my token" && expireOnce) { expireOnce = false; return no(403, "ExpiredProviderToken"); }
            if (title === "expire my token") stats.renewed++;
            if (title === "retry me" && failOnce) { failOnce = false; return no(503, "ServiceUnavailable"); }
            if (title === "retry me") stats.retried++;
            if (h["apns-collapse-id"]) stats.collapse++;
            if (type === "background") stats.background++;
            if (type === "voip") stats.voip++;
            stats.accepted++;
            answer(200);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { APNS_HOST: `localhost:${port}`, APNS_CA: ca, APNS_KEY: privateKey.export({ type: "pkcs8", format: "pem" }), APNS_KEY_ID: KEY_ID, APNS_TEAM_ID: TEAM, APNS_TOPIC: TOPIC, DEVICE_TOKEN: DEVICE },
        close() { server.close(); for (const s of server._sessions ?? []) s.destroy(); },
        check() {
            if (!stats.accepted || !stats.collapse || !stats.background || !stats.voip) return `the APNs stand-in was not reached by everything: ${JSON.stringify({ ...stats, tokens: stats.tokens.size })}`;
            if (stats.badJwt) return `${stats.badJwt} requests had a provider token that failed its signature`;
            if (stats.sessions !== 1) return `${stats.sessions} connections were opened; Apple wants one kept`;
            if (!stats.renewed) return "the expired token was not renewed";
            if (!stats.retried) return "the 503 was not tried again";
            return null;
        },
    };
}
