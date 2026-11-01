// A Nominatim server for the nominatim plugin's test, written from nominatim.org/release-docs
// (API overview, Search, Reverse, Address lookup, Status) and the public server's usage policy:
// a request with no User-Agent, or a library's stock one, is refused with 403, and more than one
// request a second gets a 429. format=jsonv2 answers have strings for lat and lon, a `boundingbox`
// of strings, `address` when addressdetails=1; a reverse with nothing there is 200 with
// `{"error":"Unable to geocode"}`; a bad parameter is 400 with the XML-ish `{"error":{...}}` shape.
//
//   start({ port }) -> { env: { NOMINATIM_API_URL, NOMINATIM_USER_AGENT }, close(), check() }
import { createServer } from "node:http";

const LICENCE = "Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright";
const DAM = {
    place_id: 100, licence: LICENCE, osm_type: "way", osm_id: 95014, lat: "52.3731339", lon: "4.8932103", category: "tourism", type: "attraction",
    place_rank: 30, importance: 0.62, addresstype: "tourism", name: "Dam", display_name: "Dam, Burgwallen Oude Zijde, Amsterdam, Noord-Holland, Nederland, 1012 NP, Nederland",
    boundingbox: ["52.3726", "52.3736", "4.8926", "4.8938"],
};
const ADDRESS = { tourism: "Dam", road: "Dam", suburb: "Burgwallen Oude Zijde", city: "Amsterdam", state: "Noord-Holland", "ISO3166-2-lvl4": "NL-NH", postcode: "1012 NP", country: "Nederland", country_code: "nl" };
const VILLAGE = { ...DAM, place_id: 101, osm_type: "node", osm_id: 77, lat: "51.5", lon: "-0.1", name: "Kleindorp", display_name: "Kleindorp, Gemeente, Nederland", addresstype: "village" };
const VILLAGE_ADDR = { house_number: "7", road: "Dorpsstraat", village: "Kleindorp", municipality: "Gemeente", postcode: "9999 ZZ", country: "Nederland", country_code: "nl" };

export async function start({ port }) {
    const stats = { requests: 0, tooFast: 0, anonymous: 0, search: 0, reverse: 0, lookup: 0, status: 0, gaps: [] };
    let last = 0;
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://x");
        const q = url.searchParams;
        const send = (code, v) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(typeof v === "string" ? v : JSON.stringify(v)); };
        const ua = req.headers["user-agent"] ?? "";
        if (!ua || /^(ureq|python-requests|curl)\b/i.test(ua)) { stats.anonymous++; return send(403, "<html><body><h1>Access denied</h1>See https://operations.osmfoundation.org/policies/nominatim/</body></html>"); }
        const now = Date.now();
        if (last && now - last < 950) { stats.tooFast++; return send(429, "<html><body>Bandwidth limit exceeded</body></html>"); }
        if (last) stats.gaps.push(now - last);
        last = now;
        stats.requests++;
        const shaped = (place, addr) => ({ ...place, ...(q.get("addressdetails") === "1" ? { address: addr } : {}), ...(q.get("extratags") === "1" ? { extratags: { wikidata: "Q10" } } : {}) });
        if (url.pathname === "/status") { stats.status++; return send(200, { status: 0, message: "OK", data_updated: "2026-10-31T23:58:01+00:00", software_version: "4.5.0", database_version: "4.5.0-0" }); }
        if (q.get("format") !== "jsonv2") return send(400, { error: { code: 400, message: "Parameter 'format': must be jsonv2 here." } });
        if (url.pathname === "/search") {
            stats.search++;
            const free = q.get("q");
            const structured = ["street", "city", "county", "state", "country", "postalcode", "amenity"].some((k) => q.has(k));
            if (free && structured) return send(400, { error: { code: 400, message: "Structured query parameters (amenity, street, city, county, state, postalcode, country) cannot be used together with 'q' parameter." } });
            if (!free && !structured) return send(400, { error: { code: 400, message: "Parameter 'q' or structured parameters are required." } });
            const limit = Number(q.get("limit") ?? 10);
            if (limit < 1 || limit > 40) return send(400, { error: { code: 400, message: `Integer parameter 'limit' must be in range 1 to 40.` } });
            const text = free ?? [...q.values()].join(" ");
            if (/nowhere/i.test(text)) return send(200, []);
            if (q.get("countrycodes") && !q.get("countrycodes").split(",").includes("nl")) return send(200, []);
            const out = [shaped(DAM, ADDRESS)];
            if (/kleindorp|village/i.test(text)) out.unshift(shaped(VILLAGE, VILLAGE_ADDR));
            return send(200, out.slice(0, limit));
        }
        if (url.pathname === "/reverse") {
            stats.reverse++;
            const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
            if (!q.has("lat") || !q.has("lon")) return send(400, { error: { code: 400, message: "Need coordinates or OSM object to lookup." } });
            if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return send(400, { error: { code: 400, message: "Invalid coordinates." } });
            if (lat === 0 && lon === 0) return send(200, { error: "Unable to geocode" });
            return send(200, shaped(DAM, ADDRESS));
        }
        if (url.pathname === "/lookup") {
            stats.lookup++;
            const ids = (q.get("osm_ids") ?? "").split(",").filter(Boolean);
            if (ids.some((i) => !/^[NWR]\d+$/.test(i))) return send(400, { error: { code: 400, message: "OSM ID parameter badly formatted." } });
            return send(200, ids.filter((i) => i === "W95014").map(() => shaped(DAM, ADDRESS)));
        }
        send(404, "Not found");
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { NOMINATIM_API_URL: `http://127.0.0.1:${port}`, NOMINATIM_USER_AGENT: "quillo-plugin-test/1.0 (test@example.com)" },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.search) return "the Nominatim stand-in got no search";
            if (!stats.reverse) return "the Nominatim stand-in got no reverse lookup";
            if (stats.tooFast) return `the plugin broke the one-a-second rule ${stats.tooFast} times`;
            if (!stats.gaps.length) return "too few calls to see the rate kept";
            return null;
        },
    };
}
