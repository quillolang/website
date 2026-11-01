// Cloudinary's Upload and Admin APIs for the cloudinary plugin's test, written from Cloudinary's
// "Upload API reference", "Generating authentication signatures" and "Admin API" pages. POST
// /v1_1/:cloud/:type/upload and /destroy take multipart/form-data, and the signature is checked as
// Cloudinary does: every field but file, cloud_name, resource_type and api_key, sorted, joined as
// a=1&b=2, the secret added, SHA-1 hex, the timestamp within an hour. A bad one gets Cloudinary's
// { error: { message } } with 401. Answers hold public_id, version, signature (SHA-1 of
// public_id=..&version=.. + secret), width, height, format, bytes and secure_url.
// GET /v1_1/:cloud/resources/image/upload takes basic auth, prefix, max_results and next_cursor.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const CLOUD = "quillo-demo", KEY = "614335564976464", SECRET = "standin-cloudinary-secret";
const sha1 = (t) => createHash("sha1").update(t).digest("hex");

function parseMultipart(buf, boundary) {
    const fields = {}, text = buf.toString("latin1");
    for (const part of text.split(`--${boundary}`).slice(1, -1)) {
        const i = part.indexOf("\r\n\r\n");
        const head = part.slice(0, i), body = part.slice(i + 4, -2);
        const name = /name="([^"]*)"/.exec(head)?.[1];
        fields[name] = /filename="/.test(head) ? { bytes: Buffer.from(body, "latin1"), filename: /filename="([^"]*)"/.exec(head)[1] } : Buffer.from(body, "latin1").toString();
    }
    return fields;
}

export async function start({ port, ports }) {
    const stats = { uploads: 0, signedOk: 0, files: 0, refused: [] };
    const assets = new Map();
    let version = 1730000000;
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const fail = (code, message) => { stats.refused.push(message); send(code, { error: { message } }); };
            const p = url.pathname.split("/").filter(Boolean);
            if (p[0] !== "v1_1" || p[1] !== CLOUD) return fail(404, `Invalid cloud name ${p[1]}`);
            if (p[2] === "resources") {
                if (req.headers.authorization !== "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64")) return fail(401, "Invalid API key or secret");
                const prefix = url.searchParams.get("prefix") ?? "", max = Number(url.searchParams.get("max_results") ?? 10), at = Number(url.searchParams.get("next_cursor") ?? 0);
                const all = [...assets.values()].filter((a) => a.public_id.startsWith(prefix)).sort((a, b) => (a.public_id < b.public_id ? -1 : 1));
                return send(200, { resources: all.slice(at, at + max), ...(at + max < all.length ? { next_cursor: String(at + max) } : {}) });
            }
            const boundary = /boundary=(.+)$/.exec(req.headers["content-type"] ?? "")?.[1];
            if (!boundary) return fail(400, "Missing required parameter - file");
            const f = parseMultipart(Buffer.concat(chunks), boundary);
            if (f.api_key !== KEY) return fail(401, `Unknown API key ${f.api_key}`);
            const signed = Object.keys(f).filter((k) => !["file", "cloud_name", "resource_type", "api_key", "signature"].includes(k)).sort().map((k) => `${k}=${f[k]}`).join("&");
            if (f.signature !== sha1(signed + SECRET)) return fail(401, `Invalid Signature ${f.signature}. String to sign - '${signed}'.`);
            if (Math.abs(Date.now() / 1000 - Number(f.timestamp)) > 3600) return fail(400, "Stale request - reported time is more than 1 hour from now");
            stats.signedOk++;
            if (p[3] === "destroy") return send(200, { result: assets.delete(f.public_id) ? "ok" : "not found" });
            if (p[3] !== "upload") return fail(404, "Unknown action");
            if (!f.file) return fail(400, "Missing required parameter - file");
            if (typeof f.file === "string" && /\.txt$/.test(f.file)) return fail(400, `Invalid image file`);
            if (typeof f.file !== "string") stats.files++;
            stats.uploads++;
            const id = f.public_id ?? (f.folder ? `${f.folder}/` : "") + (f.file.filename ?? "auto" + version);
            const v = version++;
            const asset = { public_id: id, version: v, signature: sha1(`public_id=${id}&version=${v}${SECRET}`), width: 864, height: 576, format: "jpg", resource_type: p[2], bytes: f.file.bytes?.length ?? 120253, url: `http://res.cloudinary.com/${CLOUD}/image/upload/v${v}/${id}.jpg`, secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/v${v}/${id}.jpg`, tags: (f.tags ?? "").split(",").filter(Boolean) };
            assets.set(id, asset);
            assets.set(id + "-thumb", { ...asset, public_id: id + "-thumb" });
            send(200, asset);
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    return {
        env: { CLOUDINARY_API_URL: `http://127.0.0.1:${port}`, CLOUDINARY_CLOUD_NAME: CLOUD, CLOUDINARY_API_KEY: KEY, CLOUDINARY_API_SECRET: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.signedOk) return `no signature was accepted: ${stats.refused[0] ?? "no request"}`;
            if (!stats.files) return "no file was uploaded from disk";
            if (stats.refused.some((r) => r.startsWith("Invalid Signature"))) return stats.refused.find((r) => r.startsWith("Invalid Signature"));
            return null;
        },
    };
}
