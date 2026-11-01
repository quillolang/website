// Makes the GeoTIFF samples the geotiff plugin's example reads, written from the TIFF 6.0
// specification, the GeoTIFF 1.1 standard (OGC 19-008r4) and the BigTIFF design notes:
//   geotiff_dem.tif     little-endian, Int16, strips, uncompressed, EPSG:4326, GDAL_NODATA
//   geotiff_tiled.tif   big-endian, Float32, tiled, deflate, UTM 33N, PixelIsPoint
//   geotiff_lzw.tif     little-endian, UInt16, LZW with predictor 2, a ModelTransformation
//   geotiff_big.tif     BigTIFF, two bands of bytes, PackBits
//
//   node standins/geotiff_sample.mjs     from the plugins folder
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const TYPE = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, DOUBLE: 12, LONG8: 16 };
const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8, 16: 8 };

function pack(type, values, le) {
    if (type === TYPE.ASCII) return Buffer.from(values + "\0", "latin1");
    const b = Buffer.alloc(values.length * SIZE[type]);
    values.forEach((v, i) => {
        const at = i * SIZE[type];
        if (type === TYPE.BYTE) b[at] = v;
        else if (type === TYPE.SHORT) le ? b.writeUInt16LE(v, at) : b.writeUInt16BE(v, at);
        else if (type === TYPE.LONG) le ? b.writeUInt32LE(v, at) : b.writeUInt32BE(v, at);
        else if (type === TYPE.LONG8) le ? b.writeBigUInt64LE(BigInt(v), at) : b.writeBigUInt64BE(BigInt(v), at);
        else le ? b.writeDoubleLE(v, at) : b.writeDoubleBE(v, at);
    });
    return b;
}

// tags: [[id, type, values]]; chunks: buffers, whose offsets and counts go in `offsetTag` and `countTag`.
function tiff(path, { le = true, big = false, tags, chunks, offsetTag, countTag }) {
    const wordType = big ? TYPE.LONG8 : TYPE.LONG;
    const all = [...tags, [offsetTag, wordType, chunks.map(() => 0)], [countTag, wordType, chunks.map((c) => c.length)]].sort((a, b) => a[0] - b[0]);
    const headLen = big ? 16 : 8, entry = big ? 20 : 12, inline = big ? 8 : 4;
    const ifdLen = (big ? 8 : 2) + all.length * entry + (big ? 8 : 4);
    let at = headLen + ifdLen;
    // Values that do not fit in their entry go after the directory, then the image data.
    const packed = all.map(([id, type, v]) => ({ id, type, v, data: pack(type, v, le) }));
    for (const p of packed) if (p.data.length > inline) { p.at = at; at += p.data.length + (p.data.length & 1); }
    const offsets = [];
    for (const c of chunks) { offsets.push(at); at += c.length; }
    for (const p of packed) if (p.id === offsetTag) { p.v = offsets; p.data = pack(p.type, offsets, le); }
    const buf = Buffer.alloc(at);
    buf.write(le ? "II" : "MM", 0, "latin1");
    const u16 = (v, o) => le ? buf.writeUInt16LE(v, o) : buf.writeUInt16BE(v, o);
    const u32 = (v, o) => le ? buf.writeUInt32LE(v, o) : buf.writeUInt32BE(v, o);
    const u64 = (v, o) => le ? buf.writeBigUInt64LE(BigInt(v), o) : buf.writeBigUInt64BE(BigInt(v), o);
    u16(big ? 43 : 42, 2);
    if (big) { u16(8, 4); u16(0, 6); u64(headLen, 8); } else u32(headLen, 4);
    let o = headLen;
    if (big) { u64(packed.length, o); o += 8; } else { u16(packed.length, o); o += 2; }
    for (const p of packed) {
        u16(p.id, o); u16(p.type, o + 2);
        const count = p.type === TYPE.ASCII ? p.data.length : p.v.length;
        if (big) { u64(count, o + 4); } else { u32(count, o + 4); }
        const valueAt = o + (big ? 12 : 8);
        if (p.data.length <= inline) p.data.copy(buf, valueAt);
        else { big ? u64(p.at, valueAt) : u32(p.at, valueAt); p.data.copy(buf, p.at); }
        o += entry;
    }
    let d = at;
    for (let i = chunks.length - 1; i >= 0; i--) { d -= chunks[i].length; chunks[i].copy(buf, d); }
    writeFileSync(path, buf);
}

const S = TYPE.SHORT, L = TYPE.LONG, D = TYPE.DOUBLE, A = TYPE.ASCII;

// A hill: height at column c, row r, with no data in one corner.
{
    const w = 6, h = 5, perStrip = 2, cells = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) cells.push(c === 5 && r === 0 ? -32768 : 100 + 10 * c + r);
    const chunks = [];
    for (let r = 0; r < h; r += perStrip) {
        const rows = Math.min(perStrip, h - r), b = Buffer.alloc(rows * w * 2);
        for (let i = 0; i < rows * w; i++) b.writeInt16LE(cells[r * w + i], i * 2);
        chunks.push(b);
    }
    tiff("geotiff_dem.tif", {
        offsetTag: 273, countTag: 279, chunks,
        tags: [[256, S, [w]], [257, S, [h]], [258, S, [16]], [259, S, [1]], [262, S, [1]], [277, S, [1]], [278, S, [perStrip]], [339, S, [2]],
            [33550, D, [0.5, 0.5, 0]], [33922, D, [0, 0, 0, 10, 50, 0]],
            [34735, S, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]], [42113, A, "-32768"]],
    });
}

// A big-endian tiled float grid in metres: one value per cell, cell centres on the tie point.
{
    const w = 8, h = 8, tile = 4, chunks = [];
    for (let ty = 0; ty < h; ty += tile) for (let tx = 0; tx < w; tx += tile) {
        const b = Buffer.alloc(tile * tile * 4);
        for (let r = 0; r < tile; r++) for (let c = 0; c < tile; c++) {
            const v = ty + r === 7 && tx + c === 7 ? -9999 : (tx + c) + (ty + r) * 0.25;
            b.writeFloatBE(v, (r * tile + c) * 4);
        }
        chunks.push(deflateSync(b));
    }
    tiff("geotiff_tiled.tif", {
        le: false, offsetTag: 324, countTag: 325, chunks,
        tags: [[256, S, [w]], [257, S, [h]], [258, S, [32]], [259, S, [8]], [262, S, [1]], [277, S, [1]], [322, S, [tile]], [323, S, [tile]], [339, S, [3]],
            [33550, D, [30, 30, 0]], [33922, D, [0, 0, 0, 500000, 5000000, 0]],
            [34735, S, [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 2, 3072, 0, 1, 32633]], [42113, A, "-9999"]],
    });
}

// TIFF 6.0's LZW, section 13: codes start at 9 bits, MSB first, and widen as libtiff widens them.
function lzw(input) {
    const out = [];
    let acc = 0, bits = 0;
    const put = (code, width) => {
        acc = (acc * 2 ** width) + code; bits += width;
        while (bits >= 8) { bits -= 8; out.push(Math.floor(acc / 2 ** bits) & 255); acc %= 2 ** bits; }
    };
    let table = new Map(), next = 258, width = 9;
    const reset = () => { table = new Map(); for (let i = 0; i < 256; i++) table.set(String.fromCharCode(i), i); next = 258; width = 9; };
    reset();
    put(256, 9);
    let w = "";
    for (const b of input) {
        const c = String.fromCharCode(b);
        if (table.has(w + c)) { w += c; continue; }
        put(table.get(w), width);
        table.set(w + c, next++);
        if (next === 512) width = 10; else if (next === 1024) width = 11; else if (next === 2048) width = 12;
        else if (next === 4094) { put(256, width); reset(); }
        w = c;
    }
    if (w) put(table.get(w), width);
    next++;
    if (next === 512 || next === 1024 || next === 2048) width++;
    put(257, width);
    if (bits) put(0, 8 - bits);
    return Buffer.from(out);
}

// Rows of a ramp, differenced as predictor 2 does, so LZW has runs to find.
{
    const w = 10, h = 4, row = Buffer.alloc(w * h * 2);
    for (let r = 0; r < h; r++) {
        let last = 0;
        for (let c = 0; c < w; c++) {
            const v = 1000 + 5 * c + 100 * r;
            row.writeUInt16LE((v - last) & 0xffff, (r * w + c) * 2);
            last = v;
        }
    }
    tiff("geotiff_lzw.tif", {
        offsetTag: 273, countTag: 279, chunks: [lzw(row)],
        tags: [[256, S, [w]], [257, S, [h]], [258, S, [16]], [259, S, [5]], [262, S, [1]], [277, S, [1]], [278, S, [h]], [317, S, [2]], [339, S, [1]],
            // Metres, 2 m cells, turned 90 degrees from the usual north-up.
            [34264, D, [0, 2, 0, 1000, 2, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 1]],
            [34735, S, [1, 1, 0, 2, 1024, 0, 1, 1, 3072, 0, 1, 3857]]],
    });
}

// PackBits, section 9: runs and literals, on two interleaved bands.
function packbits(b) {
    const out = [];
    let i = 0;
    while (i < b.length) {
        let run = 1;
        while (i + run < b.length && run < 128 && b[i + run] === b[i]) run++;
        if (run > 1) { out.push(257 - run, b[i]); i += run; continue; }
        let lit = 1;
        while (i + lit < b.length && lit < 128 && b[i + lit] !== b[i + lit - 1]) lit++;
        out.push(lit - 1, ...b.subarray(i, i + lit));
        i += lit;
    }
    return Buffer.from(out);
}

{
    const w = 4, h = 3, row = Buffer.alloc(w * h * 2);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { row[(r * w + c) * 2] = 7; row[(r * w + c) * 2 + 1] = 10 * r + c; }
    tiff("geotiff_big.tif", {
        big: true, offsetTag: 273, countTag: 279, chunks: [packbits(row)],
        tags: [[256, S, [w]], [257, S, [h]], [258, S, [8, 8]], [259, S, [32773]], [262, S, [1]], [277, S, [2]], [278, S, [h]], [284, S, [1]], [339, S, [1, 1]],
            [33550, D, [1, 1, 0]], [33922, D, [0, 0, 0, -3, 2, 0]], [34735, S, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]]],
    });
}
console.log("made the geotiff samples");
