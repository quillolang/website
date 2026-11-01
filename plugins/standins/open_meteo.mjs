// The Open-Meteo APIs for the open_meteo plugin's test, written from its documentation at
// open-meteo.com/en/docs (forecast), /historical-weather-api, /geocoding-api and
// /air-quality-api: GET /v1/forecast, /v1/archive, /v1/search and /v1/air-quality with their
// parameters checked, the real shape of an answer (`hourly_units`, `hourly` as parallel arrays,
// `daily`, `current`, ISO 8601 local times, `utc_offset_seconds`), units honoured, comma lists of
// places answered with a list, and errors as HTTP 400 with `{ "error": true, "reason": ... }`. Past
// 5 calls a second the free tier's 429 comes, once.
//
//   start({ port, ports }) -> { env, close(), check() }
import { createServer } from "node:http";

const HOURLY = new Set(["temperature_2m", "relative_humidity_2m", "precipitation", "weather_code", "wind_speed_10m", "wind_direction_10m", "surface_pressure", "pm10", "pm2_5"]);
const DAILY = new Set(["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "sunrise", "sunset", "wind_speed_10m_max"]);
const UNIT = {
    temperature_2m: "°C", temperature_2m_max: "°C", temperature_2m_min: "°C", relative_humidity_2m: "%", precipitation: "mm", precipitation_sum: "mm",
    weather_code: "wmo code", wind_speed_10m: "km/h", wind_speed_10m_max: "km/h", wind_direction_10m: "°", surface_pressure: "hPa", sunrise: "iso8601", sunset: "iso8601", pm10: "μg/m³", pm2_5: "μg/m³",
};
const pad = (n) => String(n).padStart(2, "0");
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

function value(name, i, q) {
    const f = q.get("temperature_unit") === "fahrenheit";
    const mm = q.get("precipitation_unit") === "inch";
    const wind = q.get("wind_speed_unit") ?? "kmh";
    const t = (c) => (f ? Math.round((c * 9) / 5 * 10 + 320) / 10 : c);
    switch (name) {
        case "temperature_2m": return t(10 + i % 12);
        case "temperature_2m_max": return t(20 + i);
        case "temperature_2m_min": return t(5 + i);
        case "relative_humidity_2m": return 60 + i % 30;
        case "precipitation": case "precipitation_sum": return i === 1 ? null : mm ? 0.04 : 1.0;
        case "weather_code": return [0, 3, 61, 95][i % 4];
        case "wind_speed_10m": case "wind_speed_10m_max": return wind === "ms" ? 3.0 : wind === "kn" ? 5.8 : wind === "mph" ? 6.7 : 10.8;
        case "wind_direction_10m": return 225;
        case "surface_pressure": return 1013.2;
        case "pm10": return 12.5;
        case "pm2_5": return null;
        default: return null;
    }
}

function unit(name, q) {
    if (UNIT[name] === "°C" && q.get("temperature_unit") === "fahrenheit") return "°F";
    if (UNIT[name] === "km/h") return { ms: "m/s", mph: "mp/h", kn: "kn" }[q.get("wind_speed_unit")] ?? "km/h";
    if (UNIT[name] === "mm" && q.get("precipitation_unit") === "inch") return "inch";
    return UNIT[name];
}

function one(lat, lon, q, allowed, days, start) {
    const o = { latitude: Math.round(lat * 100) / 100, longitude: Math.round(lon * 100) / 100, generationtime_ms: 0.2, utc_offset_seconds: 0, timezone: "GMT", timezone_abbreviation: "GMT", elevation: 8.0 };
    const tz = q.get("timezone");
    if (tz && tz !== "GMT" && tz !== "auto") { o.timezone = tz; o.utc_offset_seconds = 3600; o.timezone_abbreviation = "GMT+1"; }
    if (tz === "auto") { o.timezone = "Europe/Amsterdam"; o.utc_offset_seconds = 3600; o.timezone_abbreviation = "GMT+1"; }
    const hours = (q.get("hourly") ?? "").split(",").filter(Boolean);
    if (q.get("current")) {
        const vars = q.get("current").split(",");
        o.current_units = { time: "iso8601", interval: "seconds", ...Object.fromEntries(vars.map((v) => [v, unit(v, q)])) };
        o.current = { time: `${day(start)}T12:15`, interval: 900, ...Object.fromEntries(vars.map((v) => [v, value(v, 2, q)])) };
    }
    if (hours.length) {
        o.hourly_units = { time: "iso8601", ...Object.fromEntries(hours.map((v) => [v, unit(v, q)])) };
        const n = days * 24;
        o.hourly = { time: Array.from({ length: n }, (_, i) => `${day(start + Math.floor(i / 24) * 86400000)}T${pad(i % 24)}:00`) };
        for (const v of hours) o.hourly[v] = Array.from({ length: n }, (_, i) => value(v, i, q));
    }
    const dailies = (q.get("daily") ?? "").split(",").filter(Boolean);
    if (dailies.length) {
        if (!tz) return { error: "All API calls that use 'daily' need a 'timezone'" }; // Older behaviour kept by some servers.
        o.daily_units = { time: "iso8601", ...Object.fromEntries(dailies.map((v) => [v, unit(v, q)])) };
        const list = Array.from({ length: days }, (_, i) => day(start + i * 86400000));
        o.daily = { time: list };
        for (const v of dailies) o.daily[v] = list.map((d, i) => (v === "sunrise" ? `${d}T07:30` : v === "sunset" ? `${d}T17:10` : value(v, i, q)));
    }
    return o;
}

export async function start({ port }) {
    const stats = { forecast: 0, archive: 0, search: 0, air: 0, limited: 0, retried: 0, key: 0 };
    let burstUntil = 0, tripped = false;
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://x");
        const q = url.searchParams;
        const send = (code, v, h = {}) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...h }); res.end(JSON.stringify(v)); };
        const bad = (reason) => send(400, { error: true, reason });
        if (q.get("apikey")) stats.key++;
        if (url.pathname === "/v1/search") {
            stats.search++;
            const name = q.get("name") ?? "";
            if (name.length < 2) return send(200, { generationtime_ms: 0.1 });
            if (name === "Nowhereville") return send(200, { generationtime_ms: 0.1 });
            return send(200, { results: [
                { id: 2759794, name: "Amsterdam", latitude: 52.37403, longitude: 4.88969, elevation: 13, feature_code: "PPLC", country_code: "NL", admin1: "North Holland", timezone: "Europe/Amsterdam", population: 741636, country: "The Netherlands" },
                { id: 5120284, name: "Amsterdam", latitude: 42.93869, longitude: -74.18819, elevation: 87, feature_code: "PPL", country_code: "US", admin1: "New York", timezone: "America/New_York", population: 17958, country: "United States" },
            ].slice(0, Number(q.get("count") ?? 10)), generationtime_ms: 0.2 });
        }
        const paths = { "/v1/forecast": "forecast", "/v1/archive": "archive", "/v1/air-quality": "air" };
        const kind = paths[url.pathname];
        if (!kind) return send(404, { error: true, reason: "Not Found" });
        // One burst of the free tier's limit, so the plugin's waiting is seen.
        if (q.get("hourly") === "surface_pressure" && !tripped) {
            tripped = true; stats.limited++;
            return send(429, { error: true, reason: "Minutely API request limit exceeded. Please try again in one minute." }, { "retry-after": "1" });
        }
        if (q.get("hourly") === "surface_pressure") stats.retried++;
        stats[kind]++;
        const lats = (q.get("latitude") ?? "").split(",").map(Number), lons = (q.get("longitude") ?? "").split(",").map(Number);
        if (!q.get("latitude") || !q.get("longitude")) return bad("Parameter 'latitude' and 'longitude' must be set");
        if (lats.length !== lons.length) return bad("Parameter 'latitude' and 'longitude' must have the same number of elements");
        for (const l of lats) if (!(l >= -90 && l <= 90)) return bad(`Latitude must be in range of -90 to 90°. Given: ${l}.`);
        for (const l of lons) if (!(l >= -180 && l <= 180)) return bad(`Longitude must be in range of -180 to 180°. Given: ${l}.`);
        for (const v of (q.get("hourly") ?? "").split(",").filter(Boolean)) if (!HOURLY.has(v)) return bad(`Cannot initialize SurfaceAndPressureVariable from invalid String value ${v}.`);
        for (const v of (q.get("daily") ?? "").split(",").filter(Boolean)) if (!DAILY.has(v)) return bad(`Cannot initialize DailyVariable from invalid String value ${v}.`);
        if (q.get("temperature_unit") && !["celsius", "fahrenheit"].includes(q.get("temperature_unit"))) return bad(`Cannot initialize TemperatureUnit from invalid String value ${q.get("temperature_unit")}.`);
        let days = Number(q.get("forecast_days") ?? 7);
        let start_ms = Date.parse("2026-11-01T00:00:00Z");
        if (kind === "archive") {
            const a = Date.parse(q.get("start_date")), b = Date.parse(q.get("end_date"));
            if (!q.get("start_date") || !q.get("end_date")) return bad("Parameter 'start_date' and 'end_date' must be set");
            if (Number.isNaN(a) || Number.isNaN(b)) return bad("Invalid date");
            if (b < a) return bad("Parameter 'end_date' must not be earlier than 'start_date'");
            if (a < Date.parse("1940-01-01")) return bad(`Parameter 'start_date' is out of allowed range from 1940-01-01 to 2026-10-30`);
            days = Math.round((b - a) / 86400000) + 1;
            start_ms = a;
        } else if (!(days >= 0 && days <= 16)) return bad("Forecast days is invalid. Allowed range 0 to 16.");
        const list = lats.map((lat, i) => ({ ...one(lat, lons[i], q, null, days, start_ms), ...(lats.length > 1 ? { location_id: i } : {}) }));
        if (list.some((x) => x.error)) return bad(list[0].error);
        return send(200, lats.length > 1 ? list : list[0]);
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${port}`;
    return {
        env: { OPEN_METEO_API_URL: base, OPEN_METEO_ARCHIVE_URL: base, OPEN_METEO_GEOCODING_URL: base, OPEN_METEO_AIR_URL: base },
        stats,
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.forecast) return "the Open-Meteo stand-in got no forecast";
            if (!stats.archive) return "the Open-Meteo stand-in got no archive call";
            if (!stats.search) return "the Open-Meteo stand-in got no geocoding call";
            if (!stats.air) return "the Open-Meteo stand-in got no air quality call";
            if (!stats.limited || !stats.retried) return "the 429 was not waited out and retried";
            return null;
        },
    };
}
