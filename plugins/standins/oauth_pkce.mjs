// GitHub's OAuth web flow for the oauth_pkce example's test, written from GitHub's documentation
// ("Authorizing OAuth apps", with PKCE) and RFC 7636. GET /login/oauth/authorize takes client_id,
// redirect_uri, state and an S256 code_challenge, and sends the visitor back to redirect_uri with a
// code and the state; POST /login/oauth/access_token takes the form (the code once, for the same
// redirect_uri, its code_verifier checked, the client secret) and answers JSON when asked; GET /user
// and GET /user/repos take the token as a Bearer. Nothing of it comes from the plugin's code.
//
//   start({ port }) -> { env: { GITHUB_URL, GITHUB_API_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET }, close(), check() }
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

const CLIENT = "Iv1.quillo-example", SECRET = "a-client-secret-for-tests";

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const codes = new Map(), tokens = new Map();
    const stats = { authorized: 0, exchanged: 0, user: 0, repos: 0, refused: [] };
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            const url = new URL(req.url, base);
            const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
            if (url.pathname === "/login/oauth/authorize") {
                const q = url.searchParams;
                if (q.get("client_id") !== CLIENT) return send(400, { error: "unknown client" });
                if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge") || !q.get("state")) return send(400, { error: "PKCE with S256 and a state are asked for here" });
                const code = randomBytes(10).toString("hex");
                codes.set(code, { redirect: q.get("redirect_uri"), challenge: q.get("code_challenge") });
                stats.authorized++;
                const back = new URL(q.get("redirect_uri"));
                back.searchParams.set("code", code);
                back.searchParams.set("state", q.get("state"));
                res.writeHead(302, { location: back.href });
                return res.end();
            }
            if (url.pathname === "/login/oauth/access_token" && req.method === "POST") {
                const f = new URLSearchParams(raw);
                const c = codes.get(f.get("code") ?? "");
                const no = (why) => { stats.refused.push(why); send(200, { error: "bad_verification_code", error_description: why }); };
                if (!c) return no("the code is unknown or was used");
                codes.delete(f.get("code"));
                if (f.get("client_id") !== CLIENT || f.get("client_secret") !== SECRET) return no("the client is not known");
                if (f.get("redirect_uri") !== c.redirect) return no("redirect_uri differs");
                if (createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") !== c.challenge) return no("the code_verifier does not match");
                if (!(req.headers.accept ?? "").includes("application/json")) return no("this test answers JSON only");
                const token = "gho_" + randomBytes(18).toString("hex");
                tokens.set(token, { id: 583231, login: "octocat" });
                stats.exchanged++;
                return send(200, { access_token: token, token_type: "bearer", scope: "read:user,user:email" });
            }
            const who = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
            if (url.pathname === "/user") {
                if (!who) return send(401, { message: "Bad credentials" });
                stats.user++;
                return send(200, { id: who.id, login: who.login, name: "The Octocat" });
            }
            if (url.pathname === "/user/repos") {
                if (!who) return send(401, { message: "Bad credentials" });
                stats.repos++;
                return send(200, [{ id: 1296269, full_name: "octocat/Hello-World" }, { id: 1300192, full_name: "octocat/Spoon-Knife" }]);
            }
            send(404, { message: "Not Found" });
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GITHUB_URL: base, GITHUB_API_URL: base, GITHUB_CLIENT_ID: CLIENT, GITHUB_CLIENT_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.exchanged) return `GitHub's stand-in exchanged no code (${stats.refused.join("; ") || "none was asked for"})`;
            if (!stats.user) return "GitHub's stand-in was never asked who the user is";
            if (!stats.repos) return "the token kept on the server was never used";
            return null;
        },
    };
}
