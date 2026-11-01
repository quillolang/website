// An HTTP file server for the pmtiles plugin's test, as S3 or a CDN answers for a PMTiles archive,
// written from RFC 7233 and the PMTiles specification's "Range requests": GET with one `Range:
// bytes=a-b` gets a 206 with `Content-Range` and an `ETag`; no Range gets the whole file as 200; a
// range past the end gets a 416; `If-Match` with a stale ETag gets a 412. /moved.pmtiles changes
// its ETag once part way, as an archive replaced under a reader would. /plain.pmtiles ignores Range
// altogether, as a misconfigured proxy does.
//
//   start({ port }) -> { env: { PMTILES_URL }, close(), check() }
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

export async function start({ port }) {
    const file = readFileSync(new URL("../pmtiles_sample.pmtiles", import.meta.url));
    const stats = { ranges: 0, whole: 0, refused: 0, stale: 0 };
    let movedVersion = 1, movedHits = 0;
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://x");
        if (!["/sample.pmtiles", "/moved.pmtiles", "/plain.pmtiles"].includes(url.pathname)) { res.writeHead(404); return res.end("not found"); }
        if (url.pathname === "/plain.pmtiles") { res.writeHead(200, { "content-length": file.length }); return res.end(file); }
        const moved = url.pathname === "/moved.pmtiles";
        const etag = moved ? `"v${movedVersion}"` : '"sample-1"';
        const cond = req.headers["if-match"];
        if (cond && cond !== etag) { stats.stale++; res.writeHead(412, { etag }); return res.end(); }
        const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? "");
        if (!m) { stats.whole++; res.writeHead(200, { etag, "content-length": file.length }); return res.end(file); }
        const a = Number(m[1]), b = Math.min(Number(m[2]), file.length - 1);
        if (a >= file.length) { stats.refused++; res.writeHead(416, { "content-range": `bytes */${file.length}` }); return res.end(); }
        stats.ranges++;
        if (moved && ++movedHits === 2) movedVersion = 2;
        res.writeHead(206, { etag, "content-range": `bytes ${a}-${b}/${file.length}`, "content-length": b - a + 1, "accept-ranges": "bytes" });
        res.end(file.subarray(a, b + 1));
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { PMTILES_URL: `http://127.0.0.1:${port}` },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.ranges) return "the PMTiles stand-in got no range request";
            if (stats.whole > 2) return `the whole archive was fetched ${stats.whole} times`;
            if (!stats.stale) return "the plugin never saw the archive change";
            return null;
        },
    };
}
