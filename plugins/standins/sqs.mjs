// An Amazon SQS for the sqs plugin's test, written from the SQS API reference (JSON protocol:
// POST /, X-Amz-Target: AmazonSQS.<Action>, application/x-amz-json-1.0) and the Signature
// Version 4 document (docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html): every
// request's signature is computed again here from the canonical request and checked, with its
// credential scope, signed headers and date. Queues standard and FIFO (group ids, deduplication
// ids or content-based deduplication for 5 minutes, one message of a group in flight at a time),
// delays, visibility timeouts, receipt handles, long polling, receive counts, MD5s of bodies and
// attributes, batches and their per-entry errors, GetQueueUrl, CreateQueue, GetQueueAttributes,
// ChangeMessageVisibility, PurgeQueue, and errors as AWS sends them.
import { createServer } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";

const KEY = "AKIDSTANDIN000000001", SECRET = "standin/secret/key/0123456789abcdefgh", REGION = "eu-west-3", ACCOUNT = "000000000000";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s).digest();
const md5 = (b) => createHash("md5").update(b).digest("hex");

function attributesMd5(attrs) {
    const parts = [];
    const put = (b) => { const len = Buffer.alloc(4); len.writeUInt32BE(b.length); parts.push(len, b); };
    for (const name of Object.keys(attrs).sort()) {
        const a = attrs[name];
        put(Buffer.from(name)); put(Buffer.from(a.DataType));
        if (a.DataType.startsWith("Binary")) { parts.push(Buffer.from([2])); put(Buffer.from(a.BinaryValue, "base64")); }
        else { parts.push(Buffer.from([1])); put(Buffer.from(a.StringValue)); }
    }
    return md5(Buffer.concat(parts));
}

// The signature check: what AWS does with the Authorization header.
function verify(req, body) {
    const auth = req.headers.authorization ?? "";
    const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/.exec(auth);
    if (!m) return ["IncompleteSignature", "Authorization header requires Credential, SignedHeaders and Signature"];
    const [, key, day, region, service, signedHeaders, signature] = m;
    if (key !== KEY) return ["UnrecognizedClientException", "The security token included in the request is invalid."];
    if (service !== "sqs") return ["InvalidSignatureException", `Credential should be scoped to correct service: 'sqs'.`];
    if (region !== REGION) return ["InvalidSignatureException", `Credential should be scoped to a valid region, not '${region}'.`];
    const date = req.headers["x-amz-date"] ?? "";
    if (!/^\d{8}T\d{6}Z$/.test(date) || date.slice(0, 8) !== day) return ["IncompleteSignature", "X-Amz-Date is missing or does not match the credential's date"];
    const t = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +date.slice(9, 11), +date.slice(11, 13), +date.slice(13, 15));
    if (Math.abs(Date.now() - t) > 15 * 60 * 1000) return ["InvalidSignatureException", "Signature expired: the request time is more than 15 minutes from now"];
    const names = signedHeaders.split(";");
    for (const need of ["host", "x-amz-date"]) if (!names.includes(need)) return ["InvalidSignatureException", `'${need}' must be a signed header`];
    const canonicalHeaders = names.map((n) => `${n}:${String(req.headers[n] ?? "").trim().replace(/\s+/g, " ")}\n`).join("");
    const url = new URL(req.url, "http://x");
    const query = [...url.searchParams].map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)]).sort().map(([k, v]) => `${k}=${v}`).join("&");
    const canonical = [req.method, url.pathname || "/", query, canonicalHeaders, signedHeaders, sha256(body)].join("\n");
    const toSign = ["AWS4-HMAC-SHA256", date, `${day}/${region}/${service}/aws4_request`, sha256(canonical)].join("\n");
    const k = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, day), region), service), "aws4_request");
    const expected = createHmac("sha256", k).update(toSign).digest("hex");
    if (expected !== signature) return ["InvalidSignatureException", "The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method."];
    return null;
}

export async function start({ port }) {
    const base = `http://127.0.0.1:${port}`;
    const queues = new Map();  // name -> queue
    const seen = { signed: 0, refused: 0, actions: {} };
    const now = () => Date.now();
    class SqsError extends Error { constructor(type, message, code = 400, query) { super(message); this.type = type; this.code = code; this.query = query; } }
    const queueOf = (url) => {
        const name = String(url ?? "").split("/").pop();
        const q = queues.get(name);
        if (!q || !String(url).startsWith(base)) throw new SqsError("QueueDoesNotExist", "The specified queue does not exist.", 400, "AWS.SimpleQueueService.NonExistentQueue;Sender");
        return q;
    };
    function makeQueue(name, attrs = {}) {
        if (!/^[A-Za-z0-9_-]{1,80}(\.fifo)?$/.test(name)) throw new SqsError("InvalidParameterValueException", "Can only include alphanumeric characters, hyphens, or underscores. 1 to 80 in length");
        const fifo = name.endsWith(".fifo");
        if (fifo !== (attrs.FifoQueue === "true")) throw new SqsError("InvalidParameterValueException", "The name of a FIFO queue can only include alphanumeric characters, hyphens, or underscores, must end with .fifo suffix");
        const q = { name, fifo, messages: [], dedup: new Map(), seq: 0n, created: Math.floor(now() / 1000),
            attrs: { VisibilityTimeout: "30", DelaySeconds: "0", MessageRetentionPeriod: "345600", ReceiveMessageWaitTimeSeconds: "0", ...attrs } };
        queues.set(name, q);
        return q;
    }
    function validMessage(e, q) {
        if (!e.MessageBody) throw new SqsError("MissingParameter", "The request must contain the parameter MessageBody.");
        if (Buffer.byteLength(e.MessageBody) > 262144) throw new SqsError("InvalidParameterValueException", "One or more parameters are invalid. Reason: Message must be shorter than 262144 bytes.");
        if (q.fifo && !e.MessageGroupId) throw new SqsError("MissingParameter", "The request must contain the parameter MessageGroupId.");
        if (!q.fifo && e.MessageDeduplicationId) throw new SqsError("InvalidParameterValueException", "The request include parameter that is not valid for this queue type");
        if (q.fifo && !e.MessageDeduplicationId && q.attrs.ContentBasedDeduplication !== "true") throw new SqsError("InvalidParameterValueException", "The queue should either have ContentBasedDeduplication enabled or MessageDeduplicationId provided explicitly");
        if (q.fifo && e.DelaySeconds) throw new SqsError("InvalidParameterValueException", "Value " + e.DelaySeconds + " for parameter DelaySeconds is invalid. Reason: The request include parameter that is not valid for this queue type.");
    }
    function send(q, e) {
        validMessage(e, q);
        const attrs = e.MessageAttributes ?? {};
        const out = { MessageId: randomUUID(), MD5OfMessageBody: md5(e.MessageBody) };
        if (Object.keys(attrs).length) out.MD5OfMessageAttributes = attributesMd5(attrs);
        if (q.fifo) {
            const dedup = e.MessageDeduplicationId ?? sha256(e.MessageBody);
            for (const [k, at] of q.dedup) if (now() - at > 300000) q.dedup.delete(k);
            q.seq += 1n;
            out.SequenceNumber = String(q.seq).padStart(20, "0");
            if (q.dedup.has(dedup)) return out;  // taken, not queued again
            q.dedup.set(dedup, now());
        }
        const delay = (e.DelaySeconds ?? Number(q.attrs.DelaySeconds)) * 1000;
        q.messages.push({ id: out.MessageId, body: e.MessageBody, attrs, group: e.MessageGroupId, sent: now(), visibleAt: now() + delay, receipt: null, receives: 0, seq: out.SequenceNumber, firstReceive: null });
        return out;
    }
    function receive(q, n, visibility) {
        const t = now(), out = [];
        const busyGroups = new Set(q.messages.filter((m) => m.visibleAt > t && m.receipt).map((m) => m.group));
        for (const m of q.messages) {
            if (out.length >= n) break;
            if (m.visibleAt > t) continue;
            if (q.fifo) {
                if (busyGroups.has(m.group)) continue;
                // Only the first message of a group, in order.
                const first = q.messages.find((x) => x.group === m.group);
                if (first !== m && !out.includes(first)) continue;
            }
            m.receives++; m.firstReceive ??= t;
            m.receipt = `${m.id}#${randomUUID()}`;
            m.visibleAt = t + visibility * 1000;
            out.push(m);
        }
        if (q.fifo) for (const m of out) busyGroups.add(m.group);
        return out.map((m) => {
            const r = { MessageId: m.id, ReceiptHandle: m.receipt, MD5OfBody: md5(m.body), Body: m.body,
                Attributes: { SenderId: KEY, SentTimestamp: String(m.sent), ApproximateReceiveCount: String(m.receives), ApproximateFirstReceiveTimestamp: String(m.firstReceive), ...(q.fifo ? { MessageGroupId: m.group, SequenceNumber: m.seq } : {}) } };
            if (Object.keys(m.attrs).length) { r.MessageAttributes = m.attrs; r.MD5OfMessageAttributes = attributesMd5(m.attrs); }
            return r;
        });
    }
    const byReceipt = (q, h) => {
        const m = q.messages.find((x) => x.receipt === h);
        if (!m) throw new SqsError("ReceiptHandleIsInvalid", `The input receipt handle "${h}" is not a valid receipt handle.`);
        return m;
    };
    function batch(entries, fn) {
        if (!Array.isArray(entries) || !entries.length) throw new SqsError("EmptyBatchRequest", "There should be at least one SendMessageBatchRequestEntry in the request.");
        if (entries.length > 10) throw new SqsError("TooManyEntriesInBatchRequest", `Maximum number of entries per request are 10. You have sent ${entries.length}.`);
        const ids = entries.map((e) => e.Id);
        if (new Set(ids).size !== ids.length) throw new SqsError("BatchEntryIdsNotDistinct", "Id " + ids.find((x, i) => ids.indexOf(x) !== i) + " repeated.");
        const Successful = [], Failed = [];
        for (const e of entries) {
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(e.Id ?? "")) throw new SqsError("InvalidBatchEntryId", "A batch entry id can only contain alphanumeric characters, hyphens and underscores. It can be at most 80 letters long.");
            try { Successful.push({ Id: e.Id, ...fn(e) }); } catch (err) { if (!(err instanceof SqsError)) throw err; Failed.push({ Id: e.Id, SenderFault: true, Code: err.type, Message: err.message }); }
        }
        return { Successful, Failed };
    }

    const actions = {
        CreateQueue: (b) => { const q = queues.get(b.QueueName) ?? makeQueue(b.QueueName, b.Attributes ?? {}); return { QueueUrl: `${base}/${ACCOUNT}/${q.name}` }; },
        GetQueueUrl: (b) => { if (!queues.has(b.QueueName)) throw new SqsError("QueueDoesNotExist", "The specified queue does not exist.", 400, "AWS.SimpleQueueService.NonExistentQueue;Sender"); return { QueueUrl: `${base}/${ACCOUNT}/${b.QueueName}` }; },
        SendMessage: (b) => send(queueOf(b.QueueUrl), b),
        SendMessageBatch: (b) => { const q = queueOf(b.QueueUrl); return batch(b.Entries, (e) => send(q, e)); },
        ReceiveMessage: async (b) => {
            const q = queueOf(b.QueueUrl);
            const n = b.MaxNumberOfMessages ?? 1;
            if (n < 1 || n > 10) throw new SqsError("InvalidParameterValueException", `Value ${n} for parameter MaxNumberOfMessages is invalid. Reason: Must be between 1 and 10, if provided.`);
            const wait = b.WaitTimeSeconds ?? Number(q.attrs.ReceiveMessageWaitTimeSeconds);
            if (wait < 0 || wait > 20) throw new SqsError("InvalidParameterValueException", `Value ${wait} for parameter WaitTimeSeconds is invalid. Reason: Must be >= 0 and <= 20, if provided.`);
            const vis = b.VisibilityTimeout ?? Number(q.attrs.VisibilityTimeout);
            const until = now() + wait * 1000;
            for (;;) {
                const got = receive(q, n, vis);
                if (got.length || now() >= until) return got.length ? { Messages: got } : {};
                await new Promise((r) => setTimeout(r, 25));
            }
        },
        DeleteMessage: (b) => { const q = queueOf(b.QueueUrl); const m = byReceipt(q, b.ReceiptHandle); q.messages.splice(q.messages.indexOf(m), 1); return {}; },
        DeleteMessageBatch: (b) => { const q = queueOf(b.QueueUrl); return batch(b.Entries, (e) => { const m = byReceipt(q, e.ReceiptHandle); q.messages.splice(q.messages.indexOf(m), 1); return {}; }); },
        ChangeMessageVisibility: (b) => {
            const q = queueOf(b.QueueUrl); const m = byReceipt(q, b.ReceiptHandle);
            if (m.visibleAt <= now()) throw new SqsError("MessageNotInflight", "The message referred to isn't in flight.");
            m.visibleAt = now() + b.VisibilityTimeout * 1000; return {};
        },
        GetQueueAttributes: (b) => {
            const q = queueOf(b.QueueUrl); const t = now();
            const inflight = q.messages.filter((m) => m.visibleAt > t && m.receipt).length;
            const delayed = q.messages.filter((m) => m.visibleAt > t && !m.receipt).length;
            return { Attributes: { ...q.attrs, QueueArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:${q.name}`, ApproximateNumberOfMessages: String(q.messages.length - inflight - delayed),
                ApproximateNumberOfMessagesNotVisible: String(inflight), ApproximateNumberOfMessagesDelayed: String(delayed), CreatedTimestamp: String(q.created), ...(q.fifo ? { FifoQueue: "true" } : {}) } };
        },
        PurgeQueue: (b) => { queueOf(b.QueueUrl).messages.length = 0; return {}; },
    };

    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", async () => {
            const body = Buffer.concat(chunks).toString();
            const fail = (e) => {
                const h = { "content-type": "application/x-amz-json-1.0", "x-amzn-requestid": randomUUID() };
                if (e.query) h["x-amzn-query-error"] = e.query;
                res.writeHead(e.code, h);
                res.end(JSON.stringify({ __type: `com.amazonaws.sqs#${e.type}`, message: e.message }));
            };
            const target = String(req.headers["x-amz-target"] ?? "");
            if (req.method !== "POST" || !target.startsWith("AmazonSQS.")) return fail(new SqsError("UnknownOperationException", "this stand-in takes the JSON protocol only"));
            const problem = verify(req, body);
            if (problem) { seen.refused++; return fail(new SqsError(problem[0], problem[1], problem[0] === "UnrecognizedClientException" ? 400 : 403)); }
            seen.signed++;
            const action = target.slice("AmazonSQS.".length);
            seen.actions[action] = (seen.actions[action] ?? 0) + 1;
            if (!actions[action]) return fail(new SqsError("UnknownOperationException", `${action} is not an action this stand-in has`));
            if (req.headers["content-type"] !== "application/x-amz-json-1.0") return fail(new SqsError("InvalidParameterValueException", "Content-Type must be application/x-amz-json-1.0"));
            try {
                const out = await actions[action](JSON.parse(body || "{}"));
                res.writeHead(200, { "content-type": "application/x-amz-json-1.0", "x-amzn-requestid": randomUUID() });
                res.end(JSON.stringify(out));
            } catch (e) { if (e instanceof SqsError) fail(e); else fail(new SqsError("InternalError", String(e), 500)); }
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { SQS_ENDPOINT: base, AWS_REGION: REGION, AWS_ACCESS_KEY_ID: KEY, AWS_SECRET_ACCESS_KEY: SECRET },
        close() { server.close(); },
        check() {
            const need = ["CreateQueue", "SendMessage", "SendMessageBatch", "ReceiveMessage", "DeleteMessage", "ChangeMessageVisibility", "GetQueueAttributes"];
            const missing = need.filter((a) => !seen.actions[a]);
            if (missing.length) return `the SQS stand-in never got: ${missing.join(", ")}`;
            return seen.signed ? null : "the SQS stand-in got no signed request";
        },
    };
}
