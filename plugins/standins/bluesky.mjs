// An AT Protocol PDS for the bluesky plugin's test, written from atproto.com's lexicons and the
// "Creating a post" guide: com.atproto.server.createSession and refreshSession (Bearer refreshJwt, a
// used one is refused), an ExpiredToken error for an old access token, com.atproto.identity.resolveHandle,
// com.atproto.repo.createRecord (repo must be the session's did, $type and createdAt in RFC 3339,
// 300 graphemes, facets with byteStart < byteEnd inside the UTF-8 text, and each facet's slice of
// the text must match what it claims), deleteRecord, uploadBlob, app.bsky.feed.getTimeline and
// getAuthorFeed with cursors. Errors are { error, message } with 4xx.
//
//   start({ port }) -> { env: { BLUESKY_API_URL, BLUESKY_HANDLE, BLUESKY_APP_PASSWORD }, close(), check() }
import { createServer } from "node:http";

const DID = "did:plc:qkbot", ADA = "did:plc:ada1234";
const POSTS = ["One", "Two", "Three"].map((text, i) => ({ post: { uri: `at://${ADA}/app.bsky.feed.post/3k${i}`, cid: `baf${i}`, author: { did: ADA, handle: "ada.bsky.social", displayName: "Ada" }, record: { $type: "app.bsky.feed.post", text, createdAt: "2026-11-01T10:00:00.000Z" }, likeCount: i, repostCount: 0, replyCount: 0 }, ...(i === 1 ? { reason: { $type: "app.bsky.feed.defs#reasonRepost", by: { handle: "bob.test" } } } : {}) }));

export async function start({ port }) {
    const stats = { sessions: 0, refreshed: 0, posts: 0, blobs: 0, facetKinds: new Set(), limited: 0, badOffset: null };
    let access = new Set(), refresh = new Set(), n = 0, firstToken = null, expiredOnce = false;
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks);
            const send = (code, v, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(v)); };
            const fail = (code, error, message, headers) => send(code, { error, message }, headers);
            const url = new URL(req.url, "http://x");
            const nsid = url.pathname.replace("/xrpc/", "");
            const token = (req.headers.authorization ?? "").replace("Bearer ", "");
            if (nsid === "com.atproto.identity.resolveHandle") {
                const h = url.searchParams.get("handle");
                return h === "ada.bsky.social" ? send(200, { did: ADA }) : fail(400, "InvalidRequest", "Unable to resolve handle");
            }
            if (nsid === "com.atproto.server.createSession") {
                const b = JSON.parse(raw.toString());
                if (b.identifier !== "bot.test" || b.password !== "abcd-efgh-ijkl-mnop") return fail(401, "AuthenticationRequired", "Invalid identifier or password");
                stats.sessions++;
                const a = `access-${++n}`, r = `refresh-${n}`;
                access.add(a); refresh.add(r); firstToken ??= a;
                return send(200, { did: DID, handle: "bot.test", accessJwt: a, refreshJwt: r, active: true });
            }
            if (nsid === "com.atproto.server.refreshSession") {
                if (!refresh.delete(token)) return fail(400, "ExpiredToken", "Token has been revoked");
                stats.refreshed++;
                const a = `access-${++n}`, r = `refresh-${n}`;
                access.add(a); refresh.add(r);
                return send(200, { did: DID, handle: "bot.test", accessJwt: a, refreshJwt: r });
            }
            if (!access.has(token)) return fail(401, "AuthenticationRequired", "Invalid token");
            if (nsid === "com.atproto.repo.uploadBlob") {
                if (!/^image\//.test(req.headers["content-type"] ?? "") || !raw.length) return fail(400, "InvalidRequest", "not an image");
                stats.blobs++;
                return send(200, { blob: { $type: "blob", ref: { $link: "bafkreiblob" }, mimeType: req.headers["content-type"], size: raw.length } });
            }
            if (nsid === "com.atproto.repo.createRecord") {
                const b = JSON.parse(raw.toString()), r = b.record ?? {};
                if (b.repo !== DID) return fail(400, "InvalidRequest", "Input/repo must be the session's did");
                if (r.text === "after renewal" && !expiredOnce) { expiredOnce = true; access.delete(token); return fail(400, "ExpiredToken", "Token has expired"); }
                if (r.text === "rate me" && !stats.limited++) return fail(429, "RateLimitExceeded", "Rate Limit Exceeded", { "retry-after": "1" });
                if (r.text === "invalid record") return fail(400, "InvalidRequest", "Invalid app.bsky.feed.post record: Record/text must not be longer than 300 graphemes");
                if (b.collection !== "app.bsky.feed.post" || r.$type !== b.collection) return fail(400, "InvalidRequest", "Invalid collection or $type");
                if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(r.createdAt ?? "")) return fail(400, "InvalidRequest", "Record/createdAt must be an iso8601 datetime");
                const graphemes = [...segmenter.segment(r.text ?? "")].length;
                if (graphemes > 300) return fail(400, "InvalidRequest", "Record/text must not be longer than 300 graphemes");
                const bytes = Buffer.from(r.text ?? "");
                for (const f of r.facets ?? []) {
                    const { byteStart: s, byteEnd: e } = f.index;
                    if (!(s >= 0 && s < e && e <= bytes.length)) return fail(400, "InvalidRequest", "facet index out of range");
                    const slice = bytes.subarray(s, e).toString();
                    const feat = f.features[0];
                    const kind = feat.$type.split("#")[1];
                    stats.facetKinds.add(kind);
                    const good = kind === "mention" ? slice.startsWith("@") && feat.did === ADA : kind === "tag" ? slice === `#${feat.tag}` : kind === "link" && feat.uri.endsWith(slice);
                    if (!good) { stats.badOffset = `${kind} facet covers ${JSON.stringify(slice)}`; return fail(400, "InvalidRequest", stats.badOffset); }
                }
                if (r.reply && !(r.reply.root?.cid && r.reply.parent?.uri)) return fail(400, "InvalidRequest", "Record/reply needs root and parent");
                stats.posts++;
                const rkey = `3l${++n}`;
                return send(200, { uri: `at://${DID}/app.bsky.feed.post/${rkey}`, cid: `bafy${n}`, commit: { cid: "c", rev: "r" }, validationStatus: "valid" });
            }
            if (nsid === "com.atproto.repo.deleteRecord") { const b = JSON.parse(raw.toString()); return b.rkey ? send(200, { commit: { cid: "c", rev: "r" } }) : fail(400, "InvalidRequest", "rkey is required"); }
            if (nsid === "app.bsky.feed.getTimeline" || nsid === "app.bsky.feed.getAuthorFeed") {
                if (nsid.endsWith("AuthorFeed") && url.searchParams.get("actor") !== "ada.bsky.social") return fail(400, "InvalidRequest", "Profile not found");
                const limit = Number(url.searchParams.get("limit") ?? 50), at = Number(url.searchParams.get("cursor") ?? 0);
                const feed = POSTS.slice(at, at + limit);
                return send(200, { feed, ...(at + limit < POSTS.length ? { cursor: String(at + limit) } : {}) });
            }
            fail(501, "MethodNotImplemented", `Method Not Implemented: ${nsid}`);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { BLUESKY_API_URL: `http://127.0.0.1:${port}`, BLUESKY_HANDLE: "bot.test", BLUESKY_APP_PASSWORD: "abcd-efgh-ijkl-mnop" },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (stats.badOffset) return stats.badOffset;
            if (!stats.posts || !stats.blobs || !stats.refreshed) return `the Bluesky stand-in was not reached by everything: ${JSON.stringify({ ...stats, facetKinds: [...stats.facetKinds] })}`;
            if (stats.limited < 2) return "the plugin did not wait out the 429";
            for (const k of ["link", "mention", "tag"]) if (!stats.facetKinds.has(k)) return `no ${k} facet reached the stand-in`;
            return null;
        },
    };
}
