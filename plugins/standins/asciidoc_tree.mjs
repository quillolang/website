// Not a server: a folder of AsciiDoc includes on disk, one of them outside the allowed folder and
// one including itself, for asciidoc.qwe. Removed afterwards.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const FILES = {
    "outside.adoc": "Secret text from outside.\n",
    "docs/chapters/one.adoc": "= Chapter one\n\nFrom a file, with a sibling:\n\ninclude::two.adoc[]\n",
    "docs/chapters/two.adoc": "Second file's text.\n",
    "docs/code.txt": "line 1\nline 2\nline 3\n// tag::main[]\nmain line\n// end::main[]\nline 7\n",
    "docs/loop.adoc": "again\n\ninclude::loop.adoc[]\n",
};

export async function start() {
    const base = mkdtempSync(join(tmpdir(), "quillo-asciidoc-"));
    for (const [path, text] of Object.entries(FILES)) {
        mkdirSync(dirname(join(base, path)), { recursive: true });
        writeFileSync(join(base, path), text);
    }
    return { env: { ASCIIDOC_ROOT: join(base, "docs") }, close() { rmSync(base, { recursive: true, force: true }); }, check() { return null; } };
}
