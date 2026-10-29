// An XML-RPC server for the xml_rpc plugin's example, written from the XML-RPC specification
// (xmlrpc.com/spec, 1999, with its 2003 clarifications), the <nil/> and <i8> extensions, and the
// system.multicall convention.
//
// POST /RPC2 with a <methodCall> (Content-Type text/xml) answers a <methodResponse>: params or a
// fault. Methods: examples.getStateName(int) (the spec's own example), sample.sumAndDifference(int,
// int), echo(...) (gives its params back as an array), system.listMethods, system.methodHelp and
// system.multicall. Unknown methods and wrong params are faults with the codes of the "Specification
// for Fault Code Interoperability" (-32601, -32602), bad XML is -32700, and so on.
import { createServer } from "node:http";

const STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];

// A small XML reader: elements, text, CDATA, comments, processing instructions and entities.
function parseXml(src) {
    let i = 0;
    const root = { name: "#root", children: [] };
    const stack = [root];
    const decode = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) =>
        e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e]);
    while (i < src.length) {
        if (src.startsWith("<?", i)) { const e = src.indexOf("?>", i); if (e < 0) throw new Error("unclosed <?"); i = e + 2; continue; }
        if (src.startsWith("<!--", i)) { const e = src.indexOf("-->", i); if (e < 0) throw new Error("unclosed comment"); i = e + 3; continue; }
        if (src.startsWith("<![CDATA[", i)) { const e = src.indexOf("]]>", i); if (e < 0) throw new Error("unclosed CDATA"); stack.at(-1).children.push(src.slice(i + 9, e)); i = e + 3; continue; }
        if (src.startsWith("<!", i)) throw new Error("no DTDs");
        if (src.startsWith("</", i)) {
            const e = src.indexOf(">", i);
            const name = src.slice(i + 2, e).trim();
            const top = stack.pop();
            if (!top || top.name !== name) throw new Error(`</${name}> closes <${top?.name}>`);
            i = e + 1; continue;
        }
        if (src[i] === "<") {
            const e = src.indexOf(">", i);
            if (e < 0) throw new Error("unclosed tag");
            let tag = src.slice(i + 1, e);
            const selfClosing = tag.endsWith("/");
            if (selfClosing) tag = tag.slice(0, -1);
            const name = tag.trim().split(/\s+/)[0];
            if (!/^[A-Za-z_][\w.:-]*$/.test(name)) throw new Error(`bad tag <${name}>`);
            const el = { name: name.includes(":") ? name.split(":")[1] : name, children: [] };
            stack.at(-1).children.push(el);
            if (!selfClosing) stack.push(el);
            i = e + 1; continue;
        }
        const e = src.indexOf("<", i);
        const text = src.slice(i, e < 0 ? src.length : e);
        stack.at(-1).children.push(decode(text));
        i = e < 0 ? src.length : e;
    }
    if (stack.length !== 1) throw new Error(`<${stack.at(-1).name}> is not closed`);
    const els = root.children.filter((c) => typeof c !== "string");
    if (els.length !== 1) throw new Error("one root element");
    return els[0];
}

const kids = (el) => el.children.filter((c) => typeof c !== "string");
const text = (el) => el.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const kid = (el, name) => kids(el).find((k) => k.name === name);

class Fault extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// A <value> as a JS value; types kept where JS has none: { int }, { i8 }, { base64 }, { date }.
function readValue(v) {
    const t = kids(v)[0];
    if (!t) return text(v);
    const s = text(t).trim();
    switch (t.name) {
        case "i4": case "int": if (!/^[+-]?\d+$/.test(s) || Math.abs(Number(s)) > 2 ** 31) throw new Fault(-32602, `bad <${t.name}> ${s}`); return { int: Number(s) };
        case "i8": if (!/^[+-]?\d+$/.test(s)) throw new Fault(-32602, `bad <i8> ${s}`); return { i8: BigInt(s) };
        case "boolean": if (s !== "0" && s !== "1") throw new Fault(-32602, `bad <boolean> ${s}`); return s === "1";
        case "string": return text(t);
        case "double": if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) throw new Fault(-32602, `bad <double> ${s}`); return Number(s);
        case "dateTime.iso8601": if (!/^\d{8}T\d{2}:\d{2}:\d{2}$/.test(s)) throw new Fault(-32602, `bad <dateTime.iso8601> ${s}`); return { date: s };
        case "base64": if (!/^[A-Za-z0-9+/=\s]*$/.test(s)) throw new Fault(-32602, "bad <base64>"); return { base64: s.replace(/\s/g, "") };
        case "nil": return null;
        case "array": return kids(kid(t, "data") ?? { children: [] }).map(readValue);
        case "struct": {
            const o = {};
            for (const m of kids(t)) { if (m.name !== "member") continue; o[text(kid(m, "name"))] = readValue(kid(m, "value")); }
            return o;
        }
        default: throw new Fault(-32602, `unknown type <${t.name}>`);
    }
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function writeValue(v) {
    if (v === null || v === undefined) return "<value><nil/></value>";
    if (typeof v === "boolean") return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
    if (typeof v === "number") return `<value><double>${v}</double></value>`;
    if (typeof v === "string") return `<value><string>${esc(v)}</string></value>`;
    if (Array.isArray(v)) return `<value><array><data>${v.map(writeValue).join("")}</data></array></value>`;
    if ("int" in v) return `<value><int>${v.int}</int></value>`;
    if ("i8" in v) return `<value><i8>${v.i8}</i8></value>`;
    if ("date" in v) return `<value><dateTime.iso8601>${v.date}</dateTime.iso8601></value>`;
    if ("base64" in v) return `<value><base64>${v.base64}</base64></value>`;
    return `<value><struct>${Object.entries(v).map(([k, x]) => `<member><name>${esc(k)}</name>${writeValue(x)}</member>`).join("")}</struct></value>`;
}
const response = (v) => `<?xml version="1.0"?>\n<methodResponse><params><param>${writeValue(v)}</param></params></methodResponse>\n`;
const fault = (code, msg) => `<?xml version="1.0"?>\n<methodResponse><fault>${writeValue({ faultCode: { int: code }, faultString: msg })}</fault></methodResponse>\n`;

const isInt = (x) => x && typeof x === "object" && "int" in x;
const METHODS = {
    "examples.getStateName": { help: "The name of the US state at position n (1 to 50), alphabetically.", run: (p) => {
        if (p.length !== 1 || !isInt(p[0])) throw new Fault(-32602, "examples.getStateName takes one int");
        const name = STATES[p[0].int - 1];
        if (!name) throw new Fault(4, `no state number ${p[0].int}`);
        return name;
    } },
    "sample.sumAndDifference": { help: "The sum and the difference of two ints.", run: (p) => {
        if (p.length !== 2 || !isInt(p[0]) || !isInt(p[1])) throw new Fault(-32602, "sample.sumAndDifference takes two ints");
        return { sum: { int: p[0].int + p[1].int }, difference: { int: p[0].int - p[1].int } };
    } },
    echo: { help: "Its params, given back as an array.", run: (p) => p },
    "system.listMethods": { help: "The methods this server has.", run: () => Object.keys(METHODS) },
    "system.methodHelp": { help: "What a method does.", run: (p) => { const m = METHODS[p[0]]; if (!m) throw new Fault(-32601, `no method ${p[0]}`); return m.help; } },
    "system.multicall": { help: "Several calls in one.", run: (p) => {
        if (p.length !== 1 || !Array.isArray(p[0])) throw new Fault(-32602, "system.multicall takes an array of structs");
        return p[0].map((c) => {
            try {
                if (c.methodName === "system.multicall") throw new Fault(-32600, "no recursive multicall");
                const m = METHODS[c.methodName];
                if (!m) throw new Fault(-32601, `server error. requested method ${c.methodName} not found`);
                return [m.run(c.params ?? [])];
            } catch (e) { return { faultCode: { int: e.code ?? -32500 }, faultString: e.message }; }
        });
    } },
};

export async function start({ port }) {
    const calls = [];
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (status, xml) => { res.writeHead(status, { "content-type": "text/xml" }); res.end(xml); };
            if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); res.end(); return; }
            if (!/^text\/xml\b/.test(req.headers["content-type"] ?? "")) { res.writeHead(400); res.end("XML-RPC requests are text/xml"); return; }
            let method;
            try {
                let doc;
                try { doc = parseXml(body); } catch (e) { throw new Fault(-32700, `parse error. not well formed: ${e.message}`); }
                if (doc.name !== "methodCall" || !kid(doc, "methodName")) throw new Fault(-32600, "server error. invalid xml-rpc. not conforming to spec.");
                method = text(kid(doc, "methodName")).trim();
                const params = kids(kid(doc, "params") ?? { children: [] }).filter((p) => p.name === "param").map((p) => readValue(kid(p, "value")));
                calls.push({ method, params });
                const m = METHODS[method];
                if (!m) throw new Fault(-32601, `server error. requested method ${method} not found`);
                send(200, response(m.run(params)));
            } catch (e) {
                calls.push({ method, fault: e.code ?? -32500 });
                send(200, fault(e.code ?? -32500, e.message));
            }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { XMLRPC_URL: `http://127.0.0.1:${port}/RPC2` },
        close() { server.close(); },
        check() {
            if (!calls.some((c) => c.method === "examples.getStateName" && !c.fault)) return "the XML-RPC server got no examples.getStateName call";
            if (!calls.some((c) => c.method === "system.multicall")) return "the XML-RPC server got no system.multicall";
            const echo = calls.find((c) => c.method === "echo");
            if (!echo) return "the XML-RPC server got no echo call";
            const kinds = JSON.stringify(echo.params, (k, v) => (typeof v === "bigint" ? `${v}n` : v));
            for (const want of ['{"int":42}', '{"i8":"9007199254740993n"}', '{"date":"20261030T12:00:00"}', '{"base64":"', "null", "true", "3.25"]) if (!kinds.includes(want)) return `the echo call's params lacked ${want}: ${kinds}`;
            return null;
        },
        calls,
    };
}
