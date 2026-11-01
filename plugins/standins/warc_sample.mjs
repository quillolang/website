// Makes the sample archives warc.qwe reads: `node standins/warc_sample.mjs` writes warc_sample.warc.gz
// (gzip per record) and warc_sample.warc (plain) beside the plugins. The pages are made up; the
// layout and digests follow the WARC 1.1 specification, worked out here apart from the plugin.
// Not a stand-in: nothing starts it in a test.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(buf) {
    let bits = 0, acc = 0, out = "";
    for (const x of buf) {
        acc = ((acc << 8) | x) & 0xffff; bits += 8;
        while (bits >= 5) { bits -= 5; out += A[(acc >> bits) & 31]; }
    }
    if (bits > 0) out += A[(acc << (5 - bits)) & 31];
    return out;
}
const sha1 = (b) => "sha1:" + b32(createHash("sha1").update(b).digest());
function record(type, id, uri, date, ctype, block, payload) {
    const h = ["WARC/1.1", `WARC-Type: ${type}`, `WARC-Record-ID: <urn:uuid:${id}>`, `WARC-Date: ${date}`];
    if (uri) h.push(`WARC-Target-URI: ${uri}`);
    h.push(`WARC-Block-Digest: ${sha1(block)}`);
    if (payload != null) h.push(`WARC-Payload-Digest: ${sha1(payload)}`);
    h.push(`Content-Type: ${ctype}`, `Content-Length: ${block.length}`, "", "");
    return Buffer.concat([Buffer.from(h.join("\r\n")), block, Buffer.from("\r\n\r\n")]);
}
function http(head, body) { return Buffer.concat([Buffer.from(head.join("\r\n") + "\r\n\r\n"), body]); }

const page = Buffer.from("<html><body>Hello from an archive</body></html>");
const gz = gzipSync(Buffer.from("squeezed text ".repeat(20)));
const chunked = Buffer.from("5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff]);
const r = [
    record("warcinfo", "11111111-1111-4111-8111-111111111111", null, "2026-11-01T09:00:00Z", "application/warc-fields", Buffer.from("software: sample\r\nformat: WARC File Format 1.1\r\n")),
    record("request", "22222222-2222-4222-8222-222222222222", "https://www.example.org/", "2026-11-01T09:00:01Z", "application/http;msgtype=request", http(["GET / HTTP/1.1", "Host: www.example.org"], Buffer.alloc(0))),
    record("response", "33333333-3333-4333-8333-333333333333", "https://www.example.org/", "2026-11-01T09:00:02Z", "application/http;msgtype=response", http(["HTTP/1.1 200 OK", "Content-Type: text/html; charset=utf-8", `Content-Length: ${page.length}`], page), page),
    record("response", "44444444-4444-4444-8444-444444444444", "https://example.org/old?b=2&a=1", "2026-11-01T09:00:03Z", "application/http;msgtype=response", http(["HTTP/1.1 301 Moved Permanently", "Location: https://example.org/new", "Content-Type: text/plain"], Buffer.alloc(0)), Buffer.alloc(0)),
    record("response", "55555555-5555-4555-8555-555555555555", "https://example.org/z.txt", "2026-11-01T09:00:04Z", "application/http;msgtype=response", http(["HTTP/1.1 200 OK", "Content-Type: text/plain", "Content-Encoding: gzip"], gz), gz),
    record("response", "66666666-6666-4666-8666-666666666666", "http://example.org:8080/chunk", "2026-11-01T09:00:05Z", "application/http;msgtype=response", http(["HTTP/1.1 200 OK", "Content-Type: text/plain", "Transfer-Encoding: chunked"], chunked), chunked),
    record("resource", "77777777-7777-4777-8777-777777777777", "https://example.org/pic.png", "2026-11-01T09:00:06Z", "image/png", png),
    record("metadata", "88888888-8888-4888-8888-888888888888", "https://www.example.org/", "2026-11-01T09:00:07Z", "application/warc-fields", Buffer.from("via: https://example.org/start\r\n")),
];
writeFileSync(join(here, "warc_sample.warc.gz"), Buffer.concat(r.map((x) => gzipSync(x, { level: 9 }))));
writeFileSync(join(here, "warc_sample.warc"), Buffer.concat(r));
