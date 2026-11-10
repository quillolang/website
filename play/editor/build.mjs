// Builds src/index.mjs into ../../public/play/editor.mjs, one minified ES module with
// CodeMirror's MIT notices kept at its end. `npm run build` after a change; the built file
// is committed, so the server needs no Node.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.mjs"],
  outfile: "../../public/play/editor.mjs",
  bundle: true,
  format: "esm",
  minify: true,
  target: ["es2020"],
  legalComments: "eof",
  logLevel: "info",
});
