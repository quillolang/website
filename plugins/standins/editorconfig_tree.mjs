// Not a server: a folder on disk with .editorconfig files, for editorconfig.qwe to climb. A file
// above `root = true` holds a setting that must not reach the example. Removed afterwards.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const FILES = {
    ".editorconfig": "[*]\nmax_line_length = 10\n",
    "repo/.editorconfig": "root = true\n[*]\nindent_style = space\nindent_size = 4\ninsert_final_newline = true\n",
    "repo/src/.editorconfig": "[*.js]\nindent_size = 2\n",
    "repo/src/deep/app.js": "function f() {\n   return 1;\n}",
};

export async function start() {
    const base = mkdtempSync(join(tmpdir(), "quillo-editorconfig-"));
    for (const [path, text] of Object.entries(FILES)) {
        mkdirSync(dirname(join(base, path)), { recursive: true });
        writeFileSync(join(base, path), text);
    }
    return { env: { EDITORCONFIG_ROOT: join(base, "repo") }, close() { rmSync(base, { recursive: true, force: true }); }, check() { return null; } };
}
