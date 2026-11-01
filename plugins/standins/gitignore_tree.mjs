// Not a server: a small repository on disk for gitignore.qwe to walk, made in a temporary folder
// and removed afterwards. Its .gitignore files and .git/info/exclude are laid out as git reads them.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const FILES = {
    ".gitignore": "*.log\n/logs/\nbuild/\n!important.log\n",
    ".git/info/exclude": "local-notes.txt\n*.log\n",
    ".git/config": "[core]\n",
    "README.md": "x",
    "important.log": "x",
    "debug.log": "x",
    "local-notes.txt": "x",
    "logs/app.log": "x",
    "src/main.rs": "x",
    "src/.gitignore": "generated.rs\n!debug.log\n",
    "src/generated.rs": "x",
    "src/debug.log": "x",
    "src/build/out.o": "x",
};

export async function start() {
    const root = mkdtempSync(join(tmpdir(), "quillo-gitignore-"));
    for (const [path, text] of Object.entries(FILES)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
    }
    return { env: { GITIGNORE_ROOT: root }, close() { rmSync(root, { recursive: true, force: true }); }, check() { return null; } };
}
