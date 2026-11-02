// An OpenID Connect provider for the oidc plugin's test, written from OpenID Connect Core 1.0 and
// Discovery 1.0, RFC 6749 (OAuth), RFC 7636 (PKCE) and RFC 7517 (JWK). It has
// /.well-known/openid-configuration, /authorize (redirects with a code and state, or with
// error=access_denied), /token (client_secret_basic, code single use and bound to redirect_uri, PKCE
// S256 checked, refresh_token grant, RFC 6749 error bodies), /userinfo (Bearer), /jwks and /logout.
// ID tokens are really signed, RS256 and ES256, by keys made at start, none of it from the plugin.
//
// login_hint picks the kind of answer, as a test needs a provider that misbehaves: es256 and ada are
// good tokens; expired, other-audience, other-issuer, wrong-nonce, forged, alg-none, hs256,
// wrong-at-hash, other-sub and unknown-kid give what they say; rotated signs with a key the JWKS publishes only once
// a client asks for it again; denied refuses the sign-in.
//
//   start({ port }) -> { env: { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI }, close(), check() }
import { createServer } from "node:http";
import { generateKeyPairSync, createHash, createHmac, sign, randomBytes } from "node:crypto";

const CLIENT = "quillo-demo", SECRET = "demo secret/with+signs";
const b64 = (x) => Buffer.from(x).toString("base64url");
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });
const late = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = (k, kid, alg) => ({ ...k.publicKey.export({ format: "jwk" }), kid, alg, use: "sig" });

export async function start({ port }) {
    const issuer = `http://127.0.0.1:${port}`;
    const stats = { discovery: 0, jwks: 0, codes: 0, exchanged: 0, userinfo: 0, refreshed: 0, pkce: 0, basic: 0, machine: 0, rotatedSeen: false };
    const codes = new Map(), tokens = new Map(), refresh = new Map();

    function idToken(c, accessToken) {
        const hint = c.hint, t = Math.floor(Date.now() / 1000);
        const claims = { iss: issuer, sub: "user-" + 1001, aud: CLIENT, exp: t + 300, iat: t, nonce: c.nonce, name: "Ada Lovelace", at_hash: b64(createHash("sha256").update(accessToken).digest().subarray(0, 16)) };
        if (hint === "expired") { claims.exp = t - 3600; claims.iat = t - 7200; }
        if (hint === "other-audience") claims.aud = "someone-else";
        if (hint === "other-issuer") claims.iss = "https://evil.example";
        if (hint === "wrong-nonce") claims.nonce = "not-the-one";
        if (hint === "wrong-at-hash") claims.at_hash = b64(randomBytes(16));
        const body = b64(JSON.stringify(claims));
        const es = hint === "es256";
        const head = (h) => b64(JSON.stringify(h)) + "." + body;
        if (hint === "alg-none") return head({ alg: "none", typ: "JWT" }) + ".";
        if (hint === "hs256") {
            const m = head({ alg: "HS256", typ: "JWT", kid: "rsa-1" });
            return m + "." + createHmac("sha256", rsa.publicKey.export({ format: "pem", type: "spki" })).update(m).digest("base64url");
        }
        if (es) { const m = head({ alg: "ES256", typ: "JWT", kid: "ec-1" }); return m + "." + sign("sha256", Buffer.from(m), { key: ec.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url"); }
        if (hint === "rotated") { stats.rotatedSeen = true; const m = head({ alg: "RS256", typ: "JWT", kid: "rsa-2" }); return m + "." + sign("sha256", Buffer.from(m), late.privateKey).toString("base64url"); }
        const m = head({ alg: "RS256", typ: "JWT", kid: hint === "unknown-kid" ? "rsa-9" : "rsa-1" });
        return m + "." + sign("sha256", Buffer.from(m), hint === "forged" ? stranger.privateKey : rsa.privateKey).toString("base64url");
    }
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const url = new URL(req.url, issuer);
            const send = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers }); res.end(JSON.stringify(body)); };
            const bad = (status, error, error_description) => send(status, { error, error_description });
            if (url.pathname === "/.well-known/openid-configuration") {
                stats.discovery++;
                return send(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`, jwks_uri: `${issuer}/jwks`, end_session_endpoint: `${issuer}/logout`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256", "ES256"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"], scopes_supported: ["openid", "profile", "email"] });
            }
            if (url.pathname === "/other/.well-known/openid-configuration") return send(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
            if (url.pathname === "/jwks") {
                stats.jwks++;
                const keys = [jwk(rsa, "rsa-1", "RS256"), jwk(ec, "ec-1", "ES256")];
                if (stats.rotatedSeen) keys.push(jwk(late, "rsa-2", "RS256"));
                return send(200, { keys });
            }
            if (url.pathname === "/authorize") {
                const q = url.searchParams;
                if (q.get("client_id") !== CLIENT) return bad(400, "unauthorized_client", "Unknown client_id");
                const redirect = q.get("redirect_uri");
                if (!redirect) return bad(400, "invalid_request", "redirect_uri is required");
                const back = new URL(redirect);
                back.searchParams.set("state", q.get("state") ?? "");
                const off = (error, d) => { back.searchParams.set("error", error); back.searchParams.set("error_description", d); res.writeHead(302, { location: back.href }); res.end(); };
                if (q.get("response_type") !== "code") return off("unsupported_response_type", "Only code is offered");
                if (!(q.get("scope") ?? "").split(" ").includes("openid")) return off("invalid_scope", "openid is required");
                if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) return off("invalid_request", "PKCE with S256 is required");
                if (!q.get("state") || !q.get("nonce")) return off("invalid_request", "state and nonce are required here");
                const hint = q.get("login_hint");
                if (hint === "denied") return off("access_denied", "The user said no");
                const code = randomBytes(16).toString("hex");
                codes.set(code, { redirect, challenge: q.get("code_challenge"), nonce: q.get("nonce"), hint });
                stats.codes++;
                back.searchParams.set("code", code);
                res.writeHead(302, { location: back.href });
                return res.end();
            }
            if (url.pathname === "/token" && req.method === "POST") {
                const f = new URLSearchParams(raw);
                const auth = (req.headers.authorization ?? "").replace(/^Basic /, "");
                const [id, secret] = Buffer.from(auth, "base64").toString().split(":").map((x) => decodeURIComponent(x.replace(/\+/g, " ")));
                if (id !== CLIENT || secret !== SECRET) { if (f.get("client_id") !== CLIENT || f.get("client_secret") !== SECRET) return bad(401, "invalid_client", "Client authentication failed"); } else stats.basic++;
                const issue = (c) => {
                    const access_token = randomBytes(16).toString("hex"), refresh_token = randomBytes(16).toString("hex");
                    tokens.set(access_token, c);
                    refresh.set(refresh_token, c);
                    return { access_token, refresh_token, token_type: "Bearer", expires_in: 300, scope: "openid profile email", id_token: idToken(c, access_token) };
                };
                if (f.get("grant_type") === "refresh_token") {
                    const c = refresh.get(f.get("refresh_token"));
                    if (!c) return bad(400, "invalid_grant", "Unknown refresh token");
                    refresh.delete(f.get("refresh_token"));
                    stats.refreshed++;
                    return send(200, issue(c));
                }
                // A program calling an API as itself: an RS256 access token for the audience it names (RFC 9068).
                if (f.get("grant_type") === "client_credentials") {
                    const t = Math.floor(Date.now() / 1000);
                    const claims = { iss: issuer, sub: CLIENT, client_id: CLIENT, aud: f.get("audience") ?? "api", scope: f.get("scope") ?? "", exp: t + 300, iat: t, jti: randomBytes(8).toString("hex") };
                    const m = b64(JSON.stringify({ alg: "RS256", typ: "at+jwt", kid: "rsa-1" })) + "." + b64(JSON.stringify(claims));
                    stats.machine++;
                    return send(200, { access_token: m + "." + sign("sha256", Buffer.from(m), rsa.privateKey).toString("base64url"), token_type: "Bearer", expires_in: 300, scope: claims.scope });
                }
                if (f.get("grant_type") !== "authorization_code") return bad(400, "unsupported_grant_type", "Only authorization_code, refresh_token and client_credentials");
                const c = codes.get(f.get("code"));
                if (!c) return bad(400, "invalid_grant", "The code is unknown or was used already");
                codes.delete(f.get("code"));
                if (c.redirect !== f.get("redirect_uri")) return bad(400, "invalid_grant", "redirect_uri differs");
                if (b64(createHash("sha256").update(f.get("code_verifier") ?? "").digest()) !== c.challenge) return bad(400, "invalid_grant", "PKCE verification failed");
                stats.pkce++;
                stats.exchanged++;
                return send(200, issue(c));
            }
            if (url.pathname === "/userinfo") {
                const c = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
                if (!c) return send(401, {}, { "www-authenticate": 'Bearer error="invalid_token"' });
                stats.userinfo++;
                return send(200, { sub: c.hint === "other-sub" ? "user-2" : "user-1001", name: "Ada Lovelace", email: "ada@example.com", email_verified: true });
            }
            send(404, { error: "not_found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: CLIENT, OIDC_CLIENT_SECRET: SECRET, OIDC_REDIRECT_URI: "http://localhost:8080/callback" },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.exchanged) return "the provider exchanged no code";
            if (!stats.pkce) return "the provider saw no good PKCE verifier";
            if (!stats.basic) return "the client never authenticated by Basic";
            if (!stats.userinfo) return "the provider got no userinfo call";
            if (!stats.refreshed) return "the provider got no refresh";
            if (stats.discovery > 3) return `discovery was fetched ${stats.discovery} times: it should be kept`;
            return null;
        },
    };
}
