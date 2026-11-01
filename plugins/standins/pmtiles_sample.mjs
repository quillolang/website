// Makes the PMTiles v3 archives the pmtiles plugin's example reads, from the specification
// (protomaps/PMTiles spec/v3/spec.md): a 127-byte header, a root directory within the first
// 16 KiB, metadata, leaf directories and tile data, directories varint-encoded by columns.
//   pmtiles_sample.pmtiles   gzip directories, a leaf directory, run-length tiles, PNG
//   pmtiles_plain.pmtiles    nothing compressed but the tiles (gzip), MVT
//   pmtiles_brotli.pmtiles   brotli directories
//   pmtiles_zstd.pmtiles     zstd directories
//
//   node standins/pmtiles_sample.mjs     from the plugins folder
import { writeFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, zstdCompressSync } from "node:zlib";

export function tileId(z, x, y) {
    let acc = 0;
    for (let i = 0; i < z; i++) acc += 4 ** i;
    let d = 0, n = 2 ** z;
    for (let s = n / 2; s >= 1; s /= 2) {
        const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry === 0) {
            if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
            [x, y] = [y, x];
        }
    }
    return acc + d;
}

function varint(out, v) {
    while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); }
    out.push(v);
}

// Entries sorted by id: { id, offset, length, run }.
function directory(entries) {
    const o = [];
    varint(o, entries.length);
    let last = 0;
    for (const e of entries) { varint(o, e.id - last); last = e.id; }
    for (const e of entries) varint(o, e.run);
    for (const e of entries) varint(o, e.length);
    entries.forEach((e, i) => {
        const prev = entries[i - 1];
        varint(o, prev && e.offset === prev.offset + prev.length ? 0 : e.offset + 1);
    });
    return Buffer.from(o);
}

function header(h) {
    const b = Buffer.alloc(127);
    b.write("PMTiles", 0, "latin1");
    b[7] = 3;
    [h.rootOffset, h.rootLength, h.metaOffset, h.metaLength, h.leafOffset, h.leafLength, h.dataOffset, h.dataLength, h.addressed, h.entries, h.contents]
        .forEach((v, i) => b.writeBigUInt64LE(BigInt(v), 8 + i * 8));
    b[96] = 1; // Clustered.
    b[97] = h.internal; b[98] = h.tileCompression; b[99] = h.tileType; b[100] = h.minZoom; b[101] = h.maxZoom;
    b.writeInt32LE(h.bounds[0] * 1e7, 102); b.writeInt32LE(h.bounds[1] * 1e7, 106); b.writeInt32LE(h.bounds[2] * 1e7, 110); b.writeInt32LE(h.bounds[3] * 1e7, 114);
    b[118] = h.center[0];
    b.writeInt32LE(h.center[1] * 1e7, 119); b.writeInt32LE(h.center[2] * 1e7, 123);
    return b;
}

const png = (text) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(text)]);

function archive(path, { internal, press, tileCompression, tileType, wrap }) {
    const data = [];
    let at = 0;
    const add = (b) => { data.push(b); const r = { offset: at, length: b.length }; at += b.length; return r; };
    const entries = [];
    for (let z = 0; z <= 2; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++)
        entries.push({ id: tileId(z, x, y), z, x, y });
    entries.sort((a, b) => a.id - b.id);
    const out = entries.map((e) => ({ id: e.id, run: 1, ...add(wrap(`tile ${e.z}/${e.x}/${e.y}`)) }));
    // Zoom 3's first eight tiles along the curve are all ocean: one blob, a run of eight.
    const ocean = add(wrap("ocean"));
    out.push({ id: tileId(3, 0, 0), run: 8, ...ocean });
    const addressed = out.reduce((a, e) => a + e.run, 0);
    // The first five tiles stay in the root; the rest live in a leaf, which the root points to.
    const leaf = press(directory(out.slice(5)));
    const root = press(directory([...out.slice(0, 5), { id: out[5].id, run: 0, offset: 0, length: leaf.length }]));
    const meta = press(Buffer.from(JSON.stringify({ name: "Sample", vector_layers: [{ id: "water" }], attribution: "made here" })));
    const rootOffset = 127, metaOffset = rootOffset + root.length, leafOffset = metaOffset + meta.length, dataOffset = leafOffset + leaf.length;
    const h = header({
        rootOffset, rootLength: root.length, metaOffset, metaLength: meta.length, leafOffset, leafLength: leaf.length, dataOffset, dataLength: at,
        addressed, entries: out.length, contents: out.length, internal, tileCompression, tileType, minZoom: 0, maxZoom: 3,
        bounds: [-180, -85, 180, 85], center: [1, 4.9, 52.37],
    });
    writeFileSync(path, Buffer.concat([h, root, meta, leaf, ...data]));
}

if (process.argv[1]?.endsWith("pmtiles_sample.mjs")) {
    archive("pmtiles_sample.pmtiles", { internal: 2, press: gzipSync, tileCompression: 1, tileType: 2, wrap: png });
    archive("pmtiles_plain.pmtiles", { internal: 1, press: (b) => b, tileCompression: 2, tileType: 1, wrap: (t) => gzipSync(Buffer.from(t)) });
    archive("pmtiles_brotli.pmtiles", { internal: 3, press: brotliCompressSync, tileCompression: 1, tileType: 2, wrap: png });
    archive("pmtiles_zstd.pmtiles", { internal: 4, press: zstdCompressSync, tileCompression: 1, tileType: 2, wrap: png });
    console.log("made the pmtiles samples");
}
