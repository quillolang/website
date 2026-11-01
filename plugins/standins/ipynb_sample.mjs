// Makes the sample notebooks ipynb.qwe reads: `node standins/ipynb_sample.mjs` writes
// ipynb_sample.ipynb (nbformat 4.5, laid out as Jupyter saves it) and ipynb_v3_sample.ipynb
// (nbformat 3, as IPython 2 did) beside the plugins. Their cells are made up, and the PNG is one
// pixel. Not a stand-in: nothing starts it in a test.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501ffb0a0d6e70000000049454e44ae426082", "hex").toString("base64");
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;

const nb = {
    cells: [
        { cell_type: "markdown", id: "intro", metadata: {}, source: ["# Sales\n", "\n", "Two *quick* checks.\n"] },
        { cell_type: "code", id: "a1", execution_count: 1, metadata: { tags: ["setup"] }, source: ["%matplotlib inline\n", "import pandas as pd\n", "!pip install x\n", "print('hi')"],
          outputs: [{ output_type: "stream", name: "stdout", text: ["hi\n"] }] },
        { cell_type: "code", id: "a2", execution_count: 2, metadata: { tags: ["keep"] }, source: "df.plot()", outputs: [
            { output_type: "execute_result", execution_count: 2, metadata: {}, data: { "text/plain": ["<Axes>"] } },
            { output_type: "display_data", metadata: {}, data: { "image/png": png + "\n", "image/svg+xml": ['<svg xmlns="http://www.w3.org/2000/svg">\n', "</svg>"], "text/plain": ["<Figure>"] } },
        ] },
        { cell_type: "code", id: "a3", execution_count: 5, metadata: {}, source: ["1/0"], outputs: [{ output_type: "error", ename: "ZeroDivisionError", evalue: "division by zero", traceback: ["\u001b[0;31m---------\u001b[0m\n", "\u001b[0;31mZeroDivisionError\u001b[0m: division by zero"] }] },
        { cell_type: "code", id: "a4", execution_count: null, metadata: {}, source: ["s = '```'\n"], outputs: [] },
        { cell_type: "raw", id: "r1", metadata: {}, source: ["raw stuff"] },
    ],
    metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" }, language_info: { name: "python", version: "3.12.0" } },
    nbformat: 4, nbformat_minor: 5,
};
writeFileSync(join(here, "ipynb_sample.ipynb"), JSON.stringify(sorted(nb), null, 1) + "\n");

const v3 = { nbformat: 3, nbformat_minor: 0, metadata: { name: "old" }, worksheets: [{ cells: [
    { cell_type: "heading", level: 2, metadata: {}, source: ["Old one"] },
    { cell_type: "code", collapsed: false, input: ["1+1"], language: "python", metadata: {}, prompt_number: 3, outputs: [{ output_type: "pyout", prompt_number: 3, metadata: {}, text: ["2"] }] },
    { cell_type: "code", input: ["boom"], language: "python", metadata: {}, prompt_number: 4, outputs: [{ output_type: "pyerr", ename: "NameError", evalue: "boom", traceback: [] }, { output_type: "stream", stream: "stderr", text: ["warn\n"] }] },
] }] };
writeFileSync(join(here, "ipynb_v3_sample.ipynb"), JSON.stringify(v3, null, 1));
