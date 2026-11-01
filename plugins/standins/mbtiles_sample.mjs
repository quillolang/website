// Makes the sample files the mbtiles plugin's example reads, with Node's own SQLite:
//   mbtiles_sample.mbtiles    the common layout: a `tiles` table with a unique index
//   mbtiles_dedupe.mbtiles    mbutil's layout: `map` and `images`, with `tiles` a view
//   mbtiles_plain.mbtiles     a `tiles` table with no index, which must still be read
//
//   node standins/mbtiles_sample.mjs     from the plugins folder
import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { gzipSync } from "node:zlib";

// A tile's bytes: a PNG signature, then text saying which tile it is, then padding, which makes
// the zoom 3 tiles long enough to run onto overflow pages.
function tile(z, x, y) {
    const body = Buffer.from(`tile ${z}/${x}/${y}|` + ".".repeat(z === 3 ? 6000 : 40));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), body]);
}

function metadata(db) {
    db.exec("CREATE TABLE metadata (name text, value text); CREATE UNIQUE INDEX name ON metadata (name)");
    const put = db.prepare("INSERT INTO metadata VALUES (?, ?)");
    for (const [k, v] of Object.entries({
        name: "Sample", format: "png", type: "baselayer", version: "1.1", description: "A tiny tileset, made by a script",
        bounds: "-180.0,-85.0511,180.0,85.0511", center: "0,0,1", minzoom: "0", maxzoom: "3", attribution: "made here",
    })) put.run(k, v);
}

function make(path, f) {
    rmSync(path, { force: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = DELETE; PRAGMA page_size = 4096");
    db.exec("BEGIN");
    f(db);
    db.exec("COMMIT");
    db.close();
}

// In MBTiles, rows count up from the south (TMS): row = 2^z - 1 - y.
function* tiles() {
    for (let z = 0; z <= 3; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) yield [z, x, y, 2 ** z - 1 - y];
}

make("mbtiles_sample.mbtiles", (db) => {
    metadata(db);
    db.exec("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob); CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)");
    const put = db.prepare("INSERT INTO tiles VALUES (?, ?, ?, ?)");
    for (const [z, x, y, row] of tiles()) put.run(z, x, row, tile(z, x, y));
});

make("mbtiles_dedupe.mbtiles", (db) => {
    metadata(db);
    db.exec(`CREATE TABLE map (zoom_level integer, tile_column integer, tile_row integer, tile_id text);
             CREATE UNIQUE INDEX map_index ON map (zoom_level, tile_column, tile_row);
             CREATE TABLE images (tile_data blob, tile_id text);
             CREATE UNIQUE INDEX images_id ON images (tile_id);
             CREATE VIEW tiles AS SELECT map.zoom_level AS zoom_level, map.tile_column AS tile_column, map.tile_row AS tile_row, images.tile_data AS tile_data
                                  FROM map JOIN images ON images.tile_id = map.tile_id`);
    const m = db.prepare("INSERT INTO map VALUES (?, ?, ?, ?)"), i = db.prepare("INSERT INTO images VALUES (?, ?)");
    const seen = new Set();
    for (const [z, x, y, row] of tiles()) {
        // All of zoom 3 is ocean: one image, many squares.
        const id = z === 3 ? "ocean" : `${z}-${x}-${y}`;
        m.run(z, x, row, id);
        if (!seen.has(id)) { seen.add(id); i.run(z === 3 ? tile(3, 0, 0) : tile(z, x, y), id); }
    }
});

make("mbtiles_plain.mbtiles", (db) => {
    db.exec("CREATE TABLE metadata (name text, value text); INSERT INTO metadata VALUES ('name', 'No index'), ('format', 'pbf'), ('json', '{\"vector_layers\":[{\"id\":\"roads\"}]}')");
    db.exec("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)");
    const put = db.prepare("INSERT INTO tiles VALUES (?, ?, ?, ?)");
    put.run(2, 1, 1, gzipSync(Buffer.from("a vector tile")));
    put.run(2, 3, 0, Buffer.from("a"));
});
console.log("made mbtiles_sample, mbtiles_dedupe and mbtiles_plain");
