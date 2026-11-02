// Writes tool-icons.json: the logos the tools page (tools.qwe) shows, from Simple Icons
// (https://simpleicons.org, CC0), each with its title, colour and SVG path. The products
// Simple Icons has no logo for (VS Code, Visual Studio and Edge, which Microsoft asked it to
// take out, and tree-sitter, Shiki, highlight.js and Prism) get the page's own line icons.
//
//   npm install --prefix /tmp/si simple-icons && node tools/tool-icons.mjs /tmp/si/node_modules/simple-icons

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SLUGS = [
  "vscodium", "cursor", "windsurf", "gitpod", "jetbrains", "intellijidea", "webstorm", "pycharm",
  "androidstudio", "zedindustries", "neovim", "helix", "gnuemacs", "sublimetext", "vim", "eclipseide",
  "googlechrome", "pandoc", "kde",
];

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "data/simple-icons.json"))) {
  console.error("usage: node tools/tool-icons.mjs <simple-icons package folder>");
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
const data = JSON.parse(readFileSync(join(dir, "data/simple-icons.json"), "utf8"));
const list = Array.isArray(data) ? data : data.icons;
const slugOf = (title) => title.toLowerCase().replace(/\+/g, "plus").replace(/^\./, "dot-").replace(/\./g, "dot").replace(/&/g, "and").normalize("NFD").replace(/[^a-z0-9]/g, "");

const icons = {};
for (const slug of SLUGS) {
  const meta = list.find((i) => (i.slug ?? slugOf(i.title)) === slug);
  if (!meta) throw new Error(`Simple Icons has no ${slug}`);
  const svg = readFileSync(join(dir, "icons", `${slug}.svg`), "utf8");
  const path = svg.match(/<path d="([^"]+)"/)[1];
  // The glyph goes on a tile of the brand's colour: white on a dark one, black on a light one.
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(meta.hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  icons[slug] = { title: meta.title, hex: meta.hex, path, on: lum > 0.6 ? "#0b0a12" : "#ffffff" };
}
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "tool-icons.json");
writeFileSync(out, JSON.stringify({ source: `Simple Icons ${pkg.version}`, license: "CC0-1.0", icons }, null, 1) + "\n");
console.log(`tool-icons.json: ${SLUGS.length} logos from Simple Icons ${pkg.version}`);
