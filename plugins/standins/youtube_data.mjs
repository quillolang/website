// YouTube's Data API v3 for the youtube_data plugin's test, written from
// developers.google.com/youtube/v3/docs and "Quota": an API key in the query, `part` required,
// maxResults at most 50, pageToken and nextPageToken, /search with id.{videoId,channelId,playlistId},
// /videos with id (at most 50), contentDetails.duration, statistics as strings and hidden likes left
// out, /channels by id or forHandle, hiddenSubscriberCount, /playlists, /playlistItems. Errors are
// { error: { code, message, errors: [{ message, domain, reason }] } }: quotaExceeded is a 403,
// rateLimitExceeded a 403 given once, playlistNotFound a 404.
//
//   start({ port }) -> { env: { YOUTUBE_API_URL, YOUTUBE_API_KEY }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk-test-youtube";

export async function start({ port }) {
    const stats = { pages: 0, tooMany: 0, idsTooMany: 0, limited: 0 };
    const server = createServer((req, res) => {
        const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
        const fail = (code, reason, message, domain = "youtube.quota") => send(code, { error: { code, message, errors: [{ message, domain, reason }] } });
        const url = new URL(req.url, "http://x");
        const p = url.pathname.replace("/youtube/v3", ""), q = url.searchParams;
        if (q.get("key") !== KEY) return fail(400, "keyInvalid", "API key not valid. Please pass a valid API key.", "global");
        if (!q.get("part")) return fail(400, "required", "Required parameter: part", "global");
        const paged = (all, kind) => {
            const max = Number(q.get("maxResults") ?? 5);
            if (max > 50) { stats.tooMany++; return fail(400, "invalidValue", "Invalid value for maxResults", "youtube.parameter"); }
            const at = q.get("pageToken") ? Number(q.get("pageToken").slice(1)) : 0;
            if (at) stats.pages++;
            const more = at + max < all.length;
            send(200, { kind, etag: "e", ...(more ? { nextPageToken: `C${at + max}` } : {}), pageInfo: { totalResults: all.length, resultsPerPage: max }, items: all.slice(at, at + max) });
        };
        if (p === "/search") return paged(Array.from({ length: 180 }, (_, i) => ({ kind: "youtube#searchResult", id: i % 2 ? { kind: "youtube#channel", channelId: `UC${i}` } : { kind: "youtube#video", videoId: `vid${i}` }, snippet: { title: `Result ${i}`, channelTitle: "Quillo", publishedAt: "2026-01-01T00:00:00Z", description: "d" } })), "youtube#searchListResponse");
        if (p === "/videos") {
            const ids = (q.get("id") ?? "").split(",").filter(Boolean);
            if (ids.length > 50) { stats.idsTooMany++; return fail(400, "invalidValue", "Too many ids", "youtube.parameter"); }
            return send(200, { items: ids.filter((i) => i !== "nosuchvideo").map((id) => ({ id, snippet: { title: `Video ${id}`, channelTitle: "Quillo", publishedAt: "2026-01-01T00:00:00Z", liveBroadcastContent: id === "hiddenstats" ? "live" : "none", ...(id === "hiddenstats" ? {} : { tags: ["a", "b"] }) }, contentDetails: { duration: id === "hiddenstats" ? "P0D" : "PT1H2M3S" }, statistics: id === "hiddenstats" ? { viewCount: "5" } : { viewCount: "1234567", likeCount: "4321", commentCount: "99" } })) });
        }
        if (p === "/channels") {
            const id = q.get("id"), handle = q.get("forHandle");
            if (id === "UCquota") return fail(403, "quotaExceeded", "The request cannot be completed because you have exceeded your quota.");
            if (id === "UCkeyinvalid") return fail(400, "keyInvalid", "API key not valid. Please pass a valid API key.", "global");
            if (id === "UCbusy" && !stats.limited) { stats.limited++; return fail(403, "rateLimitExceeded", "Too many requests", "youtube.quota"); }
            if (handle === "@nobody") return send(200, { items: [] });
            return send(200, { items: [{ id: handle ? "UCquillo" : id, snippet: { title: id === "UCbusy" ? "After the wait" : "Quillo", customUrl: "@quillo" }, statistics: id === "UChidden" ? { hiddenSubscriberCount: true, viewCount: "1", videoCount: "1" } : { hiddenSubscriberCount: false, subscriberCount: "1200", viewCount: "99000", videoCount: "130" }, contentDetails: { relatedPlaylists: { uploads: "UUquillo" } } }] });
        }
        if (p === "/playlists") return paged(Array.from({ length: 62 }, (_, i) => ({ id: `PL${i}`, snippet: { title: `List ${i}` }, contentDetails: { itemCount: i } })), "youtube#playlistListResponse");
        if (p === "/playlistItems") {
            if (q.get("playlistId") !== "UUquillo") return fail(404, "playlistNotFound", "The playlist identified with the request's playlistId parameter cannot be found.", "youtube.playlistItem");
            return paged(Array.from({ length: 130 }, (_, i) => ({ snippet: { title: i === 129 ? "Deleted video" : `Video ${i}`, position: i }, contentDetails: { videoId: `vid${i}`, ...(i === 129 ? {} : { videoPublishedAt: "2026-01-01T00:00:00Z" }) } })), "youtube#playlistItemListResponse");
        }
        return fail(404, "notFound", "Not found", "global");
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { YOUTUBE_API_URL: `http://127.0.0.1:${port}/youtube/v3`, YOUTUBE_API_KEY: KEY },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.pages) return "pageToken was never followed";
            if (stats.tooMany) return "a list asked for more than 50";
            if (stats.idsTooMany) return "more than 50 ids went in one request";
            if (!stats.limited) return "the YouTube stand-in never saw a burst waited out";
            return null;
        },
    };
}
