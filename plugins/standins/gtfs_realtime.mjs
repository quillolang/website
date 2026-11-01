// A transit agency's GTFS-Realtime feed for the gtfs plugin's test, written from gtfs-realtime.proto
// and the GTFS Realtime reference: FeedMessage protobuf, encoded here by hand, as any agency's would
// be, behind an API key, answering 401 without it. It holds a delayed trip with stop updates, a
// cancelled trip, a skipped stop, a vehicle position and a service alert.
//
//   start({ port }) -> { env: { GTFS_RT_URL, GTFS_RT_KEY }, close(), check() }
import { createServer } from "node:http";

const KEY = "qk_test_transit";
function varint(n) { const o = []; n = BigInt.asUintN(64, BigInt(n)); do { let b = Number(n & 127n); n >>= 7n; if (n) b |= 128; o.push(b); } while (n); return Buffer.from(o); }
const tag = (f, w) => varint(f * 8 + w);
const int = (f, v) => Buffer.concat([tag(f, 0), varint(v)]);
const bytes = (f, b) => Buffer.concat([tag(f, 2), varint(b.length), b]);
const str = (f, s) => bytes(f, Buffer.from(s));
const msg = (f, ...parts) => bytes(f, Buffer.concat(parts));
const float = (f, v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return Buffer.concat([tag(f, 5), b]); };
const dbl = (f, v) => { const b = Buffer.alloc(8); b.writeDoubleLE(v); return Buffer.concat([tag(f, 1), b]); };
const text = (f, s, lang) => msg(f, msg(1, str(1, s), str(2, lang)));

function feed() {
    const header = msg(1, str(1, "2.0"), int(2, 0), int(3, 1793606400));
    const delayed = msg(2, str(1, "e1"), msg(3,
        msg(1, str(1, "T1-0800"), str(3, "20261102"), int(4, 0), str(5, "T1")),
        msg(2, int(1, 1), msg(3, int(1, 240), int(3, 30)), str(4, "CEN1")),
        msg(2, int(1, 2), msg(2, int(1, 300)), msg(3, int(1, 300)), str(4, "MUS")),
        int(4, 1793606390), msg(3, str(1, "bus-17"), str(2, "17"))));
    const cancelled = msg(2, str(1, "e2"), msg(3, msg(1, str(1, "T1-0830"), int(4, 3))));
    const early = msg(2, str(1, "e3"), msg(3, msg(1, str(1, "S2-FREQ")), int(5, -120)));
    const bus = msg(2, str(1, "e4"), msg(4,
        msg(1, str(1, "T1-0800"), str(5, "T1")), msg(2, float(1, 52.37), float(2, 4.9), float(3, 215.5), dbl(4, 12345.5), float(5, 8.25)),
        int(3, 2), int(4, 2), int(5, 1793606395), str(7, "MUS"), msg(8, str(1, "bus-17"), str(3, "XX-123-Y"))));
    const notice = msg(2, str(1, "e5"), msg(5,
        msg(1, int(1, 1793600000), int(2, 1793700000)), msg(5, str(2, "T1")), msg(5, str(5, "MUS"), int(3, 0)), int(6, 9), int(7, 3),
        text(8, "https://transit.example/works", "en"), text(10, "Track works", "en"), text(11, "Trams run slowly past the Museum.", "en")));
    return Buffer.concat([header, delayed, cancelled, early, bus, notice]);
}

export async function start({ port }) {
    const stats = { served: 0, refused: 0 };
    const server = createServer((req, res) => {
        if (req.url !== "/tripupdates.pb") { res.writeHead(404); return res.end("no such feed"); }
        if (req.headers["x-api-key"] !== KEY) { stats.refused++; res.writeHead(401, { "content-type": "text/plain" }); return res.end("invalid API key"); }
        stats.served++;
        res.writeHead(200, { "content-type": "application/x-protobuf" });
        res.end(feed());
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { GTFS_RT_URL: `http://127.0.0.1:${port}/tripupdates.pb`, GTFS_RT_KEY: KEY },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.served) return "the realtime feed was never fetched";
            if (!stats.refused) return "the wrong key was never tried";
            return null;
        },
    };
}
