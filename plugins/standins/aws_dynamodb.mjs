// A DynamoDB for the aws_dynamodb plugin's test, written from the Amazon DynamoDB API Reference:
// POST / with X-Amz-Target DynamoDB_20120810.*, Content-Type application/x-amz-json-1.0, Signature
// V4 checked; GetItem, PutItem, UpdateItem (SET, REMOVE, ADD), DeleteItem, Query (a key condition
// of `pk = :x` with `AND begins_with(sk, :y)`, Limit, ExclusiveStartKey, ScanIndexForward,
// LastEvaluatedKey), Scan, BatchWriteItem (at most 25, no duplicate keys, the first answer of each
// large batch leaves part in UnprocessedItems), BatchGetItem (at most 100, some UnprocessedKeys
// the first time), ConditionExpression of attribute_not_exists(...) and `#x > :y`, every answer
// with its X-Amz-Crc32 and errors in the { __type, message } shape with their real status codes.
// The item `garbled` is sent once with a wrong CRC32.
//
//   start({ port }) -> { env: { DYNAMODB_API_URL, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY }, close(), check() }
import { createServer } from "node:http";
import { crc32 } from "node:zlib";
import { sigv4Check } from "./aws_dynamodb_sigv4.mjs";

const ACCESS = "AKIDQUILLOTEST", SECRET = "quillo-test-secret-for-the-standin", REGION = "eu-west-1";
const keyOf = (k) => `${k.pk?.S}\u0000${k.sk?.S}`;
const num = (v) => Number(v.N);

export async function start({ port }) {
    const stats = { signed: 0, refused: 0, unprocessed: 0, crcBad: 0, ops: {} };
    const table = new Map();
    table.set(keyOf({ pk: { S: "garbled" }, sk: { S: "1" } }), { pk: { S: "garbled" }, sk: { S: "1" }, fine: { BOOL: true } });
    let garble = true, firstBatch = true, firstGet = true;
    const sorted = () => [...table.values()].sort((a, b) => (a.sk.S < b.sk.S ? -1 : 1));
    class Err { constructor(status, type, message) { Object.assign(this, { status, type, message }); } }
    const need = (b) => { if (b.TableName !== "orders") throw new Err(400, "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException", "Requested resource not found"); };
    const name = (b, n) => (n.startsWith("#") ? (b.ExpressionAttributeNames?.[n] ?? (() => { throw new Err(400, "com.amazon.coral.validate#ValidationException", `An expression attribute name used in the document path is not defined; attribute name: ${n}`); })()) : n);
    const value = (b, v) => b.ExpressionAttributeValues?.[v] ?? (() => { throw new Err(400, "com.amazon.coral.validate#ValidationException", `An expression attribute value used in expression is not defined; attribute value: ${v}`); })();
    function condition(b, old) {
        const c = b.ConditionExpression;
        if (!c) return;
        let ok;
        const absent = c.match(/^attribute_not_exists\((.+)\)$/), gt = c.match(/^(\S+) > (\S+)$/);
        if (absent) ok = !old || old[name(b, absent[1])] == null;
        else if (gt) ok = old && num(old[name(b, gt[1])] ?? { N: "0" }) > num(value(b, gt[2]));
        else throw new Err(400, "com.amazon.coral.validate#ValidationException", `Invalid ConditionExpression: ${c}`);
        if (!ok) throw new Err(400, "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException", "The conditional request failed");
    }
    function setPath(item, path, v) {
        const parts = path.split(".");
        if (parts.length === 1) { item[parts[0]] = v; return; }
        item[parts[0]] ??= { M: {} };
        item[parts[0]].M[parts[1]] = v;
    }
    function update(b, old) {
        const item = old ? structuredClone(old) : structuredClone(b.Key);
        const re = /(SET|REMOVE|ADD|DELETE) (.*?)(?= (?:SET|REMOVE|ADD|DELETE) |$)/g;
        for (const [, verb, list] of b.UpdateExpression.matchAll(re)) for (const part of list.split(", ")) {
            if (verb === "SET") { const [p, v] = part.split(" = "); setPath(item, p.split(".").map((x) => name(b, x)).join("."), value(b, v)); }
            if (verb === "REMOVE") delete item[name(b, part)];
            if (verb === "ADD") { const [p, v] = part.split(" "); const f = name(b, p); item[f] = { N: String(num(item[f] ?? { N: "0" }) + num(value(b, v))) }; }
        }
        return item;
    }
    function query(b) {
        let items = sorted();
        if (b.KeyConditionExpression) {
            const m = b.KeyConditionExpression.match(/^(\S+) = (\S+)(?: AND begins_with\((\S+), (\S+)\))?$/);
            if (!m) throw new Err(400, "com.amazon.coral.validate#ValidationException", "Invalid KeyConditionExpression");
            items = items.filter((i) => i[name(b, m[1])]?.S === value(b, m[2]).S && (!m[3] || i[name(b, m[3])]?.S.startsWith(value(b, m[4]).S)));
        }
        if (b.ScanIndexForward === false) items.reverse();
        if (b.ExclusiveStartKey) { const at = items.findIndex((i) => keyOf(i) === keyOf(b.ExclusiveStartKey)); items = items.slice(at + 1); }
        const page = items.slice(0, b.Limit ?? 1000);
        const out = { Items: page, Count: page.length, ScannedCount: page.length };
        if (page.length < items.length) { const l = page[page.length - 1]; out.LastEvaluatedKey = { pk: l.pk, sk: l.sk }; }
        return out;
    }
    const ops = {
        GetItem(b) { need(b); const Item = table.get(keyOf(b.Key)); return Item ? { Item } : {}; },
        PutItem(b) {
            need(b);
            if (!b.Item.pk?.S || !b.Item.sk?.S) throw new Err(400, "com.amazon.coral.validate#ValidationException", "One or more parameter values were invalid: Missing the key pk or sk in the item");
            const old = table.get(keyOf(b.Item)); condition(b, old); table.set(keyOf(b.Item), b.Item);
            return b.ReturnValues === "ALL_OLD" && old ? { Attributes: old } : {};
        },
        UpdateItem(b) { need(b); const old = table.get(keyOf(b.Key)); condition(b, old); const item = update(b, old); table.set(keyOf(b.Key), item); return b.ReturnValues === "ALL_NEW" ? { Attributes: item } : {}; },
        DeleteItem(b) { need(b); const old = table.get(keyOf(b.Key)); condition(b, old); table.delete(keyOf(b.Key)); return old && b.ReturnValues === "ALL_OLD" ? { Attributes: old } : {}; },
        Query(b) { need(b); return query(b); },
        Scan(b) { need(b); return query(b); },
        BatchWriteItem(b) {
            const writes = b.RequestItems.orders ?? [];
            if (writes.length > 25) throw new Err(400, "com.amazon.coral.validate#ValidationException", "Too many items requested for the BatchWriteItem call");
            const seen = new Set();
            for (const w of writes) { const k = keyOf(w.PutRequest?.Item ?? w.DeleteRequest.Key); if (seen.has(k)) throw new Err(400, "com.amazon.coral.validate#ValidationException", "Provided list of item keys contains duplicates"); seen.add(k); }
            const left = firstBatch && writes.length > 10 ? writes.slice(10) : [];
            if (left.length) { firstBatch = false; stats.unprocessed += left.length; }
            for (const w of left.length ? writes.slice(0, 10) : writes) { if (w.PutRequest) table.set(keyOf(w.PutRequest.Item), w.PutRequest.Item); else table.delete(keyOf(w.DeleteRequest.Key)); }
            return { UnprocessedItems: left.length ? { orders: left } : {} };
        },
        BatchGetItem(b) {
            const keys = b.RequestItems.orders?.Keys ?? [];
            if (keys.length > 100) throw new Err(400, "com.amazon.coral.validate#ValidationException", "Too many items requested for the BatchGetItem call");
            const left = firstGet && keys.length > 20 ? keys.slice(20) : [];
            if (left.length) firstGet = false;
            const take = left.length ? keys.slice(0, 20) : keys;
            return { Responses: { orders: take.map((k) => table.get(keyOf(k))).filter(Boolean) }, UnprocessedKeys: left.length ? { orders: { Keys: left } } : {} };
        },
    };
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks);
            const answer = (status, v, badCrc) => {
                const text = JSON.stringify(v);
                res.writeHead(status, { "content-type": "application/x-amz-json-1.0", "x-amz-crc32": String(badCrc ? 12345 : crc32(text)), "x-amzn-requestid": "QUILLOREQ" });
                res.end(text);
            };
            const refused = sigv4Check(req, raw, { access: ACCESS, secret: SECRET, region: REGION, service: "dynamodb" });
            if (refused) { stats.refused++; return answer(refused.code === "UnrecognizedClientException" ? 400 : 403, { __type: `com.amazon.coral.service#${refused.code}`, message: refused.message }); }
            stats.signed++;
            const target = req.headers["x-amz-target"] ?? "";
            const [prefix, op] = target.split(".");
            if (prefix !== "DynamoDB_20120810" || !ops[op] || req.headers["content-type"] !== "application/x-amz-json-1.0") return answer(400, { __type: "com.amazon.coral.service#UnknownOperationException" });
            stats.ops[op] = (stats.ops[op] ?? 0) + 1;
            try {
                const b = JSON.parse(raw.toString());
                const out = ops[op](b);
                if (op === "GetItem" && b.Key.pk?.S === "garbled" && garble) { garble = false; stats.crcBad++; return answer(200, out, true); }
                answer(200, out);
            } catch (e) {
                if (e instanceof Err) answer(e.status, { __type: e.type, message: e.message });
                else answer(500, { __type: "com.amazon.coral.service#InternalServerError", message: String(e) });
            }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { DYNAMODB_API_URL: `http://127.0.0.1:${port}`, AWS_REGION: REGION, AWS_ACCESS_KEY_ID: ACCESS, AWS_SECRET_ACCESS_KEY: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check() {
            if (!stats.signed) return "the DynamoDB stand-in got no signed request";
            if (stats.refused) return `the DynamoDB stand-in refused ${stats.refused} signatures`;
            if (!stats.unprocessed) return "no UnprocessedItems were handed back";
            if (stats.ops.GetItem && !stats.crcBad) return "the garbled answer was never sent";
            return null;
        },
    };
}
