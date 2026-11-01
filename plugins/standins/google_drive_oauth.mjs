// Google's OAuth token endpoint for service accounts, shared by the google_drive, google_sheets,
// firestore and bigquery stand-ins, written from "Using OAuth 2.0 for Server to Server
// Applications": POST with grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer and an RS256 JWT
// assertion whose signature, iss, aud, scope, iat and exp are checked (at most 60 minutes), with
// Google's { error, error_description } on refusal. The key pair is made when the stand-in starts.
import { generateKeyPairSync, createVerify, randomBytes } from "node:crypto";

export function googleAuth({ scope, tokenUri }) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const email = "standin@quillo-test.iam.gserviceaccount.com";
    const account = JSON.stringify({
        type: "service_account", project_id: "quillo-test", private_key_id: "standin1",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }), client_email: email, token_uri: tokenUri,
    });
    const tokens = new Set();
    const stats = { granted: 0, refused: [] };
    function token(body, res) {
        const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
        const fail = (error, error_description) => { stats.refused.push(error_description); send(400, { error, error_description }); };
        const f = new URLSearchParams(body);
        if (f.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") return fail("unsupported_grant_type", "Invalid grant_type: " + f.get("grant_type"));
        const [h, p, s] = (f.get("assertion") ?? "").split(".");
        if (!s) return fail("invalid_request", "Invalid JWT");
        const head = JSON.parse(Buffer.from(h, "base64url")), c = JSON.parse(Buffer.from(p, "base64url"));
        if (head.alg !== "RS256") return fail("invalid_grant", "Invalid JWT: alg must be RS256");
        const v = createVerify("RSA-SHA256"); v.update(`${h}.${p}`);
        if (!v.verify(publicKey, Buffer.from(s, "base64url"))) return fail("invalid_grant", "Invalid JWT Signature.");
        if (c.iss !== email) return fail("invalid_grant", "Invalid issuer");
        if (c.aud !== tokenUri) return fail("invalid_grant", `Invalid JWT audience: ${c.aud}`);
        if (!String(c.scope ?? "").split(" ").includes(scope)) return fail("invalid_scope", `Missing scope ${scope}`);
        const now = Math.floor(Date.now() / 1000);
        if (c.exp - c.iat > 3600 || c.exp < now || c.iat > now + 60) return fail("invalid_grant", "Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe.");
        const t = "qa29.standin-" + randomBytes(12).toString("hex");
        tokens.add(t); stats.granted++;
        send(200, { access_token: t, expires_in: 3599, token_type: "Bearer" });
    }
    return { account, token, stats, valid: (header) => tokens.has((header ?? "").replace(/^Bearer /, "")) };
}
