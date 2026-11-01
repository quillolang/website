// The Mapbox web APIs for the mapbox plugin's test, written from docs.mapbox.com/api: Geocoding v6
// (GET /search/geocode/v6/forward and /reverse, a FeatureCollection whose features have
// `properties.mapbox_id, feature_type, name, place_formatted, full_address, coordinates, context`),
// Directions v5 (GET /directions/v5/mapbox/{profile}/{coords}, `code: "Ok"`, polyline6 by default
// for `geometries=polyline6`), the Matrix API (GET /directions-matrix/v1/mapbox/{profile}/{coords})
// and its limits. Every call needs `access_token`: none or a wrong one is 401 with Mapbox's
// `{"message":"Not Authorized - Invalid Token"}`; 422 has `{"message", "code"}`; a NoRoute is
// 200 for Directions with `code: "NoRoute"`; past a burst, 429 with `X-Rate-Limit-Reset`.
//
//   start({ port }) -> { env: { MAPBOX_API_URL, MAPBOX_TOKEN }, close(), check() }
import { createServer } from "node:http";

const TOKEN = "pk.standin-token-for-tests";

function encode6(points) {
    let out = "", la = 0, lo = 0;
    const put = (v) => {
        let x = v < 0 ? ~(v * 2) : v * 2;
        while (x >= 32) { out += String.fromCharCode((32 | (x & 31)) + 63); x = Math.floor(x / 32); }
        out += String.fromCharCode(x + 63);
    };
    for (const [lat, lon] of points) {
        const a = Math.round(lat * 1e6), b = Math.round(lon * 1e6);
        put(a - la); put(b - lo); la = a; lo = b;
    }
    return out;
}

function feature(name, lon, lat, type = "address") {
    return {
        type: "Feature", id: `dXJuOm1ieGFkcjo${name.length}`,
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
            mapbox_id: `dXJuOm1ieGFkcjo${name.length}`, feature_type: type, name, name_preferred: name, place_formatted: "Washington, District of Columbia 20500, United States",
            full_address: `${name}, Washington, District of Columbia 20500, United States`, coordinates: { longitude: lon, latitude: lat, accuracy: "rooftop" },
            context: { address: { name, address_number: "1600", street_name: "Pennsylvania Avenue Northwest" }, street: { name: "Pennsylvania Avenue Northwest" }, postcode: { name: "20500" }, place: { name: "Washington" }, region: { name: "District of Columbia", region_code: "DC" }, country: { name: "United States", country_code: "US" } },
        },
    };
}

export async function start({ port }) {
    const stats = { geocode: 0, reverse: 0, directions: 0, matrix: 0, unauthorized: 0, limited: 0, retried: 0, tokenInErrors: 0 };
    let burst = false;
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://x");
        const q = url.searchParams;
        const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...h }); res.end(JSON.stringify(v)); };
        if (q.get("access_token") !== TOKEN) { stats.unauthorized++; return send(401, { message: "Not Authorized - Invalid Token" }); }
        if (url.pathname === "/search/geocode/v6/forward") {
            if (!q.get("q")) return send(422, { message: "q parameter is required", code: "InvalidInput" });
            if (q.get("q") === "busy" && !burst) { burst = true; stats.limited++; return send(429, { message: "Too Many Requests" }, { "x-rate-limit-limit": "1000", "x-rate-limit-interval": "60", "x-rate-limit-reset": String(Math.floor(Date.now() / 1000) + 1) }); }
            if (q.get("q") === "busy") stats.retried++;
            stats.geocode++;
            const lim = Number(q.get("limit") ?? 5);
            if (lim > 10) return send(422, { message: "limit must be between 1 and 10", code: "InvalidInput" });
            if (q.get("q") === "nowhere") return send(200, { type: "FeatureCollection", features: [], attribution: "NOTICE: © 2026 Mapbox and its suppliers. All rights reserved." });
            return send(200, { type: "FeatureCollection", features: [feature("1600 Pennsylvania Avenue Northwest", -77.0365, 38.8977), feature("Pennsylvania Avenue", -77.03, 38.89, "street")].slice(0, lim), attribution: "NOTICE: © 2026 Mapbox and its suppliers. All rights reserved." });
        }
        if (url.pathname === "/search/geocode/v6/reverse") {
            stats.reverse++;
            const lon = Number(q.get("longitude")), lat = Number(q.get("latitude"));
            if (!q.has("longitude") || !q.has("latitude")) return send(422, { message: "longitude and latitude are required", code: "InvalidInput" });
            if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return send(422, { message: "Coordinates are out of range", code: "InvalidInput" });
            return send(200, { type: "FeatureCollection", features: [feature("1600 Pennsylvania Avenue Northwest", lon, lat)], attribution: "NOTICE" });
        }
        let m;
        if ((m = /^\/directions\/v5\/mapbox\/([^/]+)\/([^/]+)$/.exec(url.pathname))) {
            const [, profile, text] = m;
            if (!["driving", "driving-traffic", "walking", "cycling"].includes(profile)) return send(404, { message: "Not Found" });
            const coords = decodeURIComponent(text).split(";").map((c) => c.split(",").map(Number));
            if (coords.length < 2 || coords.length > 25) return send(422, { message: "Too many coordinates; maximum number of coordinates is 25.", code: "InvalidInput" });
            stats.directions++;
            if (coords.some(([lon]) => lon === 170)) return send(200, { code: "NoRoute", message: "No route found", routes: [] });
            const points = coords.map(([lon, lat]) => [lat, lon]);
            const geometry = q.get("geometries") === "geojson" ? { type: "LineString", coordinates: coords } : q.get("geometries") === "polyline6" ? encode6(points) : "invalid";
            const steps = q.get("steps") === "true" ? [
                { distance: 800.5, duration: 90.2, name: "Main Street", mode: "driving", maneuver: { type: "depart", instruction: "Drive east on Main Street.", location: coords[0], bearing_before: 0, bearing_after: 90 }, geometry },
                { distance: 0, duration: 0, name: "", mode: "driving", maneuver: { type: "arrive", instruction: "You have arrived at your destination.", location: coords.at(-1), bearing_before: 90, bearing_after: 0 }, geometry },
            ] : [];
            return send(200, { code: "Ok", uuid: "abc", routes: [{ distance: 1234.5, duration: 200.1, weight: 240, weight_name: "auto", geometry, legs: [{ distance: 1234.5, duration: 200.1, summary: "Main Street", steps, annotation: q.get("annotations") ? { congestion: ["low", "moderate"] } : undefined }] }], waypoints: coords.map((c) => ({ name: "Main Street", location: c, distance: 3.1 })) });
        }
        if ((m = /^\/directions-matrix\/v1\/mapbox\/([^/]+)\/([^/]+)$/.exec(url.pathname))) {
            const coords = decodeURIComponent(m[2]).split(";").map((c) => c.split(",").map(Number));
            if (coords.length > 25) return send(422, { message: "Too many coordinates", code: "ProfileNotFound" });
            stats.matrix++;
            const n = coords.length;
            return send(200, { code: "Ok", durations: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : (coords[j][0] === 170 ? null : 100 + i + j)))), destinations: coords.map((c) => ({ name: "D", location: c })), sources: coords.map((c) => ({ name: "S", location: c })) });
        }
        send(404, { message: "Not Found" });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { MAPBOX_API_URL: `http://127.0.0.1:${port}`, MAPBOX_TOKEN: TOKEN },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.geocode) return "the Mapbox stand-in got no geocoding call";
            if (!stats.directions) return "the Mapbox stand-in got no directions";
            if (!stats.matrix) return "the Mapbox stand-in got no matrix";
            if (!stats.limited || !stats.retried) return "the 429 was not waited out";
            return null;
        },
    };
}
