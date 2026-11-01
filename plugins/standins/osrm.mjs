// An OSRM server for the osrm plugin's test, written from project-osrm.org/docs/v5.24.0/api: the
// URL form /{service}/v1/{profile}/{lon,lat;lon,lat}?..., `code: "Ok"` answers with `routes`,
// `waypoints`, `durations`, `distances`, `sources`, `destinations`, and the error codes InvalidUrl,
// InvalidOptions, InvalidValue, NoRoute, NoSegment, NoTable, TooBig with HTTP 400, and an unknown
// profile's 400. Geometries are encoded for the `geometries` asked (polyline at 1e5, polyline6 at
// 1e6, geojson), and each step has a maneuver as the guidance docs describe. Nothing routes for
// real: a route is a straight line, at 10 m/s, along a fixed pair of legs.
//
//   start({ port }) -> { env: { OSRM_API_URL }, close(), check() }
import { createServer } from "node:http";

function encode(points, precision) {
    let out = "", lastLat = 0, lastLon = 0;
    const put = (v) => {
        let x = v < 0 ? ~(v * 2) : v * 2;
        while (x >= 32) { out += String.fromCharCode((32 | (x & 31)) + 63); x = Math.floor(x / 32); }
        out += String.fromCharCode(x + 63);
    };
    const f = 10 ** precision;
    for (const [lat, lon] of points) {
        const a = Math.round(lat * f), b = Math.round(lon * f);
        put(a - lastLat); put(b - lastLon);
        lastLat = a; lastLon = b;
    }
    return out;
}

const metres = (a, b) => {
    const r = 6371008.8, t = Math.PI / 180;
    const h = Math.sin(((b[1] - a[1]) * t) / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(((b[0] - a[0]) * t) / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(h));
};

export async function start({ port }) {
    const stats = { route: 0, table: 0, nearest: 0, trip: 0, match: 0, refused: 0 };
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://x");
        const q = url.searchParams;
        const send = (code, v) => { res.writeHead(code, { "content-type": "application/json; charset=UTF-8" }); res.end(JSON.stringify(v)); };
        const bad = (code, message, status = 400) => { stats.refused++; send(status, { code, message }); };
        const m = /^\/(route|table|nearest|trip|match)\/v1\/([^/]+)\/([^/?]+)$/.exec(decodeURIComponent(url.pathname));
        if (!m) return bad("InvalidUrl", "URL string malformed close to position 1");
        const [, service, profile, text] = m;
        if (!["driving", "car", "bike", "foot"].includes(profile)) return bad("InvalidOptions", "Profile not found");
        const coords = text.split(";").map((p) => p.split(",").map(Number));
        for (const c of coords) if (c.length !== 2 || c.some(Number.isNaN)) return bad("InvalidUrl", `URL string malformed close to position ${text.indexOf(";") + 1}`);
        for (const [lon, lat] of coords) if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return bad("InvalidValue", "Invalid coordinate value.");
        if (coords.some(([lon, lat]) => lon === 0 && lat === 0)) return bad("NoSegment", "Could not find a matching segment for coordinate 0");
        stats[service]++;
        const wp = (c, name) => ({ hint: "AAAA", distance: 4.2, name, location: c });
        const geometry = (points) => {
            const g = q.get("geometries") ?? "polyline";
            if (g === "geojson") return { type: "LineString", coordinates: points.map(([lat, lon]) => [lon, lat]) };
            if (g === "polyline6") return encode(points, 6);
            if (g === "polyline") return encode(points, 5);
            return null;
        };
        if (!["polyline", "polyline6", "geojson", null].includes(q.get("geometries"))) return bad("InvalidOptions", "Options are invalid");
        if (service === "nearest") {
            const n = Number(q.get("number") ?? 1);
            return send(200, { code: "Ok", waypoints: Array.from({ length: n }, (_, i) => ({ nodes: [100 + i, 200 + i], hint: "BBBB", distance: 5.5 + i, name: i ? "Side Street" : "Main Street", location: coords[0] })) });
        }
        if (service === "table") {
            const sources = (q.get("sources") ?? "all") === "all" ? coords.map((_, i) => i) : q.get("sources").split(";").map(Number);
            const dests = (q.get("destinations") ?? "all") === "all" ? coords.map((_, i) => i) : q.get("destinations").split(";").map(Number);
            if ([...sources, ...dests].some((i) => i >= coords.length)) return bad("InvalidOptions", "Options are invalid");
            const ann = (q.get("annotations") ?? "duration").split(",");
            const cell = (a, b) => (coords[b][0] === 170 ? null : Math.round(metres(coords[a], coords[b]) * 10) / 10);
            const o = { code: "Ok", sources: sources.map((i) => wp(coords[i], "Src")), destinations: dests.map((i) => wp(coords[i], "Dst")) };
            if (ann.includes("duration")) o.durations = sources.map((a) => dests.map((b) => { const d = cell(a, b); return d == null ? null : Math.round(d) / 10; }));
            if (ann.includes("distance")) o.distances = sources.map((a) => dests.map((b) => cell(a, b)));
            return send(200, o);
        }
        if (coords.length < 2) return bad("InvalidOptions", "Number of coordinates needs to be at least two.");
        if (coords.some(([lon]) => lon === 170)) return bad("NoRoute", "Impossible route");
        const points = coords.map(([lon, lat]) => [lat, lon]);
        const leg = (a, b, last) => {
            const d = Math.round(metres(a, b) * 10) / 10, t = Math.round(d) / 10;
            const steps = q.get("steps") === "true" ? [
                { distance: d, duration: t, name: "Main Street", mode: "driving", weight: t, geometry: geometry([[a[1], a[0]], [b[1], b[0]]]), driving_side: "right",
                  maneuver: { type: "depart", modifier: "right", location: a, bearing_before: 0, bearing_after: 90 }, intersections: [{ location: a, out: 0, bearings: [90], entry: [true] }] },
                { distance: 0, duration: 0, name: "Second Avenue", ref: "N1", mode: "driving", weight: 0, geometry: geometry([[b[1], b[0]]]), driving_side: "right",
                  maneuver: { type: "turn", modifier: "left", location: b, bearing_before: 90, bearing_after: 0 }, intersections: [] },
                { distance: 0, duration: 0, name: "", mode: "driving", weight: 0, geometry: geometry([[b[1], b[0]]]), driving_side: "right",
                  maneuver: { type: "roundabout", modifier: "right", exit: 2, location: b, bearing_before: 0, bearing_after: 90 }, intersections: [] },
                ...(last ? [{ distance: 0, duration: 0, name: "Second Avenue", mode: "driving", weight: 0, geometry: geometry([[b[1], b[0]]]), driving_side: "right",
                  maneuver: { type: "arrive", location: b, bearing_before: 90, bearing_after: 0 }, intersections: [] }] : []),
            ] : [];
            const l = { distance: d, duration: t, weight: t, summary: "Main Street, Second Avenue", steps };
            if (q.get("annotations")) l.annotation = { nodes: [1, 2], speed: [10.0] };
            return l;
        };
        const legs = coords.slice(1).map((c, i) => leg(coords[i], c, i === coords.length - 2));
        const route = { geometry: q.get("overview") === "false" ? undefined : geometry(points), legs, weight_name: "routability", weight: 1, duration: legs.reduce((a, l) => a + l.duration, 0), distance: legs.reduce((a, l) => a + l.distance, 0) };
        if (service === "trip") return send(200, { code: "Ok", trips: [route], waypoints: coords.map((c, i) => ({ ...wp(c, "Stop"), waypoint_index: coords.length - 1 - i, trips_index: 0 })) });
        if (service === "match") return send(200, { code: "Ok", matchings: [{ ...route, confidence: 0.92 }], tracepoints: coords.map((c, i) => (i === 1 && coords.length > 2 ? null : { ...wp(c, "Road"), matchings_index: 0, waypoint_index: i, alternatives_count: 0 })) });
        const routes = [route];
        if (q.get("alternatives") === "true") routes.push({ ...route, distance: route.distance * 1.2, duration: route.duration * 1.2 });
        send(200, { code: "Ok", routes, waypoints: coords.map((c) => wp(c, "Main Street")) });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { OSRM_API_URL: `http://127.0.0.1:${port}` },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.route) return "the OSRM stand-in got no route";
            if (!stats.table) return "the OSRM stand-in got no table";
            if (!stats.nearest) return "the OSRM stand-in got no nearest";
            return null;
        },
    };
}
