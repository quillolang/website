// Makes osm_pbf_sample.osm.pbf, a tiny OpenStreetMap extract, written from the OSM PBF format's
// fileformat.proto and osmformat.proto: an OSMHeader blob, a data blob of dense nodes (zlib), one
// of plain nodes (raw), one of ways and one of relations, with its own string tables, a granularity
// other than the default, and offsets.
//
//   node standins/osm_pbf_sample.mjs     from the plugins folder
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const varint = (v) => {
    const o = [];
    let x = BigInt(v);
    if (x < 0n) x += 1n << 64n;
    while (x >= 128n) { o.push(Number(x & 127n) | 128); x >>= 7n; }
    o.push(Number(x));
    return Buffer.from(o);
};
const zig = (v) => { const x = BigInt(v); return x < 0n ? -2n * x - 1n : 2n * x; };
const key = (f, wire) => varint((f << 3) | wire);
const int = (f, v) => Buffer.concat([key(f, 0), varint(v)]);
const sint = (f, v) => int(f, zig(v));
const bytes = (f, b) => { const d = Buffer.isBuffer(b) ? b : Buffer.from(b); return Buffer.concat([key(f, 2), varint(d.length), d]); };
const msg = (f, ...parts) => bytes(f, Buffer.concat(parts));
const packed = (f, list) => bytes(f, Buffer.concat(list.map(varint)));
const packedSint = (f, list) => bytes(f, Buffer.concat(list.map((v) => varint(zig(v)))));
const deltas = (list) => list.map((v, i) => (i ? v - list[i - 1] : v));

function fileBlock(type, payload, compress) {
    const blob = compress
        ? Buffer.concat([int(2, payload.length), bytes(3, deflateSync(payload))])
        : bytes(1, payload);
    const header = Buffer.concat([bytes(1, type), int(3, blob.length)]);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(header.length);
    return Buffer.concat([size, header, blob]);
}

class Strings {
    constructor() { this.list = [""]; }
    id(s) { let i = this.list.indexOf(s); if (i < 0) { i = this.list.length; this.list.push(s); } return i; }
    table() { return Buffer.concat(this.list.map((s) => bytes(1, s))); }
}

const header = Buffer.concat([
    msg(1, sint(1, 4_880_000_000), sint(2, 4_910_000_000), sint(3, 52_380_000_000), sint(4, 52_360_000_000)),
    bytes(4, "OsmSchema-V0.6"), bytes(4, "DenseNodes"), bytes(5, "Sort.Type_then_ID"),
    bytes(16, "osm_pbf_sample.mjs"), bytes(17, "made by hand"), int(32, 1_790_000_000), int(33, 4242), bytes(34, "https://example.com/replication"),
]);

// Dense nodes of a small town, in a block with granularity 100 and an offset.
const G = 100, LAT0 = 52_000_000_000n, LON0 = 4_000_000_000n;
const dense = () => {
    const st = new Strings();
    const nodes = [
        { id: 1, lat: 52.37, lon: 4.89, tags: { amenity: "cafe", name: "De Eerste" } },
        { id: 2, lat: 52.371, lon: 4.891, tags: { amenity: "pub", name: "Tweede Kamer" } },
        { id: 3, lat: 52.372, lon: 4.892, tags: { shop: "bakery" } },
        { id: 4, lat: 52.3725, lon: 4.8925, tags: {} },
        { id: 10, lat: 52.36, lon: 4.88, tags: {} },
        { id: 11, lat: 52.361, lon: 4.88, tags: {} },
        { id: 12, lat: 52.361, lon: 4.881, tags: {} },
        { id: 13, lat: 52.36, lon: 4.881, tags: {} },
    ];
    const ns = (d) => (BigInt(Math.round(d * 1e7)) * 100n - (d > 10 ? LAT0 : LON0)) / BigInt(G);
    const ids = nodes.map((n) => BigInt(n.id));
    const lats = nodes.map((n) => ns(n.lat)), lons = nodes.map((n) => ns(n.lon));
    const kv = [];
    for (const n of nodes) { for (const [k, v] of Object.entries(n.tags)) kv.push(st.id(k), st.id(v)); kv.push(0); }
    const user = st.id("ada");
    const n = nodes.length;
    const info = Buffer.concat([
        packed(1, Array(n).fill(3)),
        packedSint(2, deltas(Array(n).fill(1_700_000n))),
        packedSint(3, deltas(Array(n).fill(77n))),
        packedSint(4, deltas(Array(n).fill(5n))),
        packedSint(5, deltas(Array(n).fill(BigInt(user)))),
    ]);
    const body = msg(2, packedSint(1, deltas(ids)), msg(5, info), packedSint(8, deltas(lats)), packedSint(9, deltas(lons)), packed(10, kv));
    return Buffer.concat([msg(1, st.table()), msg(2, body), int(17, G), int(18, 1000), int(19, LAT0), int(20, LON0)]);
};

// Two plain nodes, with the default granularity of 100 and no offset.
const plain = () => {
    const st = new Strings();
    const node = (id, lat, lon, tags) => msg(1, sint(1, id), packed(2, Object.keys(tags).map((k) => st.id(k))), packed(3, Object.values(tags).map((v) => st.id(v))), sint(8, Math.round(lat * 1e7)), sint(9, Math.round(lon * 1e7)));
    const group = Buffer.concat([node(20, 52.375, 4.895, { tourism: "museum", name: "Oud" }), node(21, 10.0, 20.0, { amenity: "cafe", name: "Far away" })]);
    return Buffer.concat([msg(1, st.table()), msg(2, group)]);
};

const ways = () => {
    const st = new Strings();
    const way = (id, refs, tags) => msg(3, int(1, id), packed(2, Object.keys(tags).map((k) => st.id(k))), packed(3, Object.values(tags).map((v) => st.id(v))), packedSint(8, deltas(refs.map(BigInt))));
    const group = Buffer.concat([
        way(100, [1, 2, 3], { highway: "residential", name: "Eerste Straat" }),
        way(101, [3, 4], { highway: "footway" }),
        way(102, [10, 11, 12, 13, 10], { building: "yes", name: "Blok" }),
    ]);
    return Buffer.concat([msg(1, st.table()), msg(2, group)]);
};

const relations = () => {
    const st = new Strings();
    const rel = (id, members, tags) => msg(4, int(1, id), packed(2, Object.keys(tags).map((k) => st.id(k))), packed(3, Object.values(tags).map((v) => st.id(v))),
        packed(8, members.map((m) => st.id(m.role))), packedSint(9, deltas(members.map((m) => BigInt(m.id)))), packed(10, members.map((m) => ({ node: 0, way: 1, relation: 2 })[m.type])));
    const group = Buffer.concat([
        rel(200, [{ id: 100, type: "way", role: "" }, { id: 101, type: "way", role: "" }, { id: 1, type: "node", role: "stop" }], { type: "route", route: "bicycle", name: "Stadsroute" }),
        rel(201, [{ id: 102, type: "way", role: "outer" }, { id: 200, type: "relation", role: "subarea" }], { type: "multipolygon", landuse: "retail" }),
    ]);
    return Buffer.concat([msg(1, st.table()), msg(2, group)]);
};

writeFileSync("osm_pbf_sample.osm.pbf", Buffer.concat([
    fileBlock("OSMHeader", header, true), fileBlock("OSMData", dense(), true), fileBlock("OSMData", plain(), false), fileBlock("OSMData", ways(), true), fileBlock("OSMData", relations(), true),
]));
console.log("made osm_pbf_sample.osm.pbf");
