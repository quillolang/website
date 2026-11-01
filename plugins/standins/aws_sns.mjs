// Amazon SNS for the aws_sns plugin's test, written from the Amazon SNS API Reference and "Verifying
// the signatures of Amazon SNS messages": POST / as a form with Action and Version=2010-03-31,
// Signature V4 (service sns), XML answers, <ErrorResponse> errors; Publish, PublishBatch (at most
// 10, unique Ids, a message "REFUSE" fails with SenderFault=true and one fails once with
// SenderFault=false), CreateTopic, ListTopics (paged), Subscribe, Unsubscribe,
// ListSubscriptionsByTopic (paged), ConfirmSubscription through a SubscribeURL. It holds an RSA key
// made at start and a certificate for it at /SimpleNotificationService-test.pem, and signs real
// messages at /_sample (not AWS's) over the canonical fields, with RSA-SHA1 for SignatureVersion 1
// and RSA-SHA256 for 2.
//
//   start({ port }) -> { env: { SNS_API_URL, SNS_CERT_HOSTS, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY }, close(), check() }
import { createServer } from "node:http";
import { createSign, generateKeyPairSync } from "node:crypto";
import { sigv4Check } from "./aws_dynamodb_sigv4.mjs";
import { makeCert, name } from "./ocsp_der.mjs";

const ACCESS = "AKIDQUILLOTEST", SECRET = "quillo-test-secret-for-the-standin", REGION = "eu-west-1";
const TOPIC = `arn:aws:sns:${REGION}:123456789012:shipping`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function start({ port }) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const cert = makeCert({ subject: name("sns.amazonaws.com", "Amazon"), issuer: name("Quillo test CA"), spki: publicKey.export({ type: "spki", format: "der" }), key: privateKey });
    const stats = { refused: 0, published: 0, batches: 0, confirmed: 0, certs: 0, samples: 0, topicPages: 0, subPages: 0 };
    const seen = new Set();
    let retryOnce = true;
    const base = `http://127.0.0.1:${port}`;
    const topics = [TOPIC, ...Array.from({ length: 4 }, (_, i) => `arn:aws:sns:${REGION}:123456789012:other-${i}`)];
    const fail = (status, type, code, message) => [status, `<ErrorResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/"><Error><Type>${type}</Type><Code>${code}</Code><Message>${esc(message)}</Message></Error><RequestId>r-1</RequestId></ErrorResponse>`];
    const ok = (action, inner) => [200, `<${action}Response xmlns="http://sns.amazonaws.com/doc/2010-03-31/"><${action}Result>${inner}</${action}Result><ResponseMetadata><RequestId>r-1</RequestId></ResponseMetadata></${action}Response>`];
    const noTopic = (a) => (topics.includes(a) ? null : fail(404, "Sender", "NotFound", "Topic does not exist"));
    function act(f) {
        const a = f.get("Action");
        if (f.get("Version") !== "2010-03-31") return fail(400, "Sender", "InvalidParameter", "Invalid parameter: Version");
        if (a === "Publish") {
            const e = noTopic(f.get("TopicArn")); if (e) return e;
            const subject = f.get("Subject");
            if (!f.get("Message")) return fail(400, "Sender", "InvalidParameter", "Invalid parameter: Empty message");
            if (f.get("MessageAttributes.entry.2.Value.DataType") !== "Number" || f.get("MessageAttributes.entry.3.Value.DataType") !== "String.Array" || subject !== "Order shipped") return fail(400, "Sender", "InvalidParameter", "Invalid parameter: MessageAttributes");
            stats.published++;
            return ok("Publish", "<MessageId>95df01b4-ee98-5cb9-9903-4c221d41eb5e</MessageId>");
        }
        if (a === "PublishBatch") {
            const e = noTopic(f.get("TopicArn")); if (e) return e;
            let ids = [], i = 1;
            while (f.has(`PublishBatchRequestEntries.member.${i}.Id`)) ids.push(i++);
            if (ids.length > 10) return fail(400, "Sender", "TooManyEntriesInBatchRequest", "The batch request contains more entries than permissible.");
            stats.batches++;
            let good = "", bad = "";
            for (const n of ids) {
                const p = `PublishBatchRequestEntries.member.${n}.`, id = f.get(p + "Id"), m = f.get(p + "Message");
                if (m === "REFUSE") bad += `<member><Id>${id}</Id><Code>InvalidParameter</Code><Message>Invalid parameter: Message</Message><SenderFault>true</SenderFault></member>`;
                else if (id === "m3" && retryOnce) { retryOnce = false; bad += `<member><Id>${id}</Id><Code>InternalError</Code><Message>try again</Message><SenderFault>false</SenderFault></member>`; }
                else { seen.add(id); good += `<member><Id>${id}</Id><MessageId>mid-${id}</MessageId></member>`; }
            }
            return ok("PublishBatch", `<Successful>${good}</Successful><Failed>${bad}</Failed>`);
        }
        if (a === "CreateTopic") return ok("CreateTopic", `<TopicArn>arn:aws:sns:${REGION}:123456789012:${esc(f.get("Name"))}</TopicArn>`);
        if (a === "ListTopics") {
            stats.topicPages++;
            const from = Number(f.get("NextToken") ?? 0), page = topics.slice(from, from + 2);
            return ok("ListTopics", `<Topics>${page.map((t) => `<member><TopicArn>${t}</TopicArn></member>`).join("")}</Topics>${from + 2 < topics.length ? `<NextToken>${from + 2}</NextToken>` : ""}`);
        }
        if (a === "Subscribe") {
            if (f.get("Attributes.entry.1.key") !== "RawMessageDelivery") return fail(400, "Sender", "InvalidParameter", "Invalid parameter: Attributes");
            return ok("Subscribe", "<SubscriptionArn>pending confirmation</SubscriptionArn>");
        }
        if (a === "Unsubscribe") return ok("Unsubscribe", "");
        if (a === "ListSubscriptionsByTopic") {
            stats.subPages++;
            const from = Number(f.get("NextToken") ?? 0);
            const list = Array.from({ length: 3 }, (_, i) => `<member><Owner>123456789012</Owner><Protocol>https</Protocol><SubscriptionArn>${TOPIC}:${i}</SubscriptionArn><Endpoint>https://a${i}.example.com/</Endpoint><TopicArn>${TOPIC}</TopicArn></member>`);
            return ok("ListSubscriptionsByTopic", `<Subscriptions>${list.slice(from, from + 1).join("")}</Subscriptions>${from + 1 < 3 ? `<NextToken>${from + 1}</NextToken>` : ""}`);
        }
        return fail(400, "Sender", "InvalidAction", `The action ${a} is not valid for this web service.`);
    }
    function sample(kind, version) {
        stats.samples++;
        const now = kind === "old" ? new Date(Date.now() - 7200000) : new Date();
        const m = { Type: kind === "confirm" ? "SubscriptionConfirmation" : "Notification", MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324", TopicArn: kind === "other-topic" ? `arn:aws:sns:${REGION}:123456789012:else` : TOPIC, Timestamp: now.toISOString() };
        if (kind === "confirm") Object.assign(m, { Message: "You have chosen to subscribe to the topic. To confirm the subscription, visit the SubscribeURL included in this message.", Token: "2336412f37f", SubscribeURL: `${base}/_confirm?Action=ConfirmSubscription&Token=2336412f37f` });
        else Object.assign(m, { Subject: "Order shipped", Message: JSON.stringify({ order: 1001, status: "shipped" }) });
        const fields = kind === "confirm" ? ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] : ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];
        const text = fields.map((f) => `${f}\n${m[f]}\n`).join("");
        m.SignatureVersion = version;
        m.Signature = createSign(version === "2" ? "sha256" : "sha1").update(text).sign(privateKey).toString("base64");
        m.SigningCertURL = kind === "evil-cert" ? "https://sns.eu-west-1.amazonaws.com.evil.example/key.pem" : `${base}/SimpleNotificationService-test.pem`;
        m.UnsubscribeURL = `${base}/?Action=Unsubscribe`;
        m.MessageAttributes = { kind: { Type: "String", Value: "shipped" } };
        return JSON.stringify(m);
    }
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (d) => chunks.push(d));
        req.on("end", () => {
            const raw = Buffer.concat(chunks), url = new URL(req.url, base);
            const out = (s, b, type = "text/xml") => { res.writeHead(s, { "content-type": type }); res.end(b); };
            if (url.pathname === "/SimpleNotificationService-test.pem") { stats.certs++; return out(200, cert.pem, "application/x-pem-file"); }
            if (url.pathname === "/_sample") return out(200, sample(url.searchParams.get("kind"), url.searchParams.get("version")), "application/json");
            if (url.pathname === "/_confirm") { if (url.searchParams.get("Token") !== "2336412f37f") return out(...fail(400, "Sender", "InvalidParameter", "Invalid token")); stats.confirmed++; return out(200, `<ConfirmSubscriptionResponse><ConfirmSubscriptionResult><SubscriptionArn>${TOPIC}:confirmed-1</SubscriptionArn></ConfirmSubscriptionResult></ConfirmSubscriptionResponse>`); }
            const bad = sigv4Check(req, raw, { access: ACCESS, secret: SECRET, region: REGION, service: "sns" });
            if (bad) { stats.refused++; return out(...fail(403, "Sender", bad.code, bad.message)); }
            if (!(req.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded")) return out(...fail(400, "Sender", "MalformedInput", "form needed"));
            out(...act(new URLSearchParams(raw.toString())));
        });
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return {
        env: { SNS_API_URL: base, SNS_CERT_HOSTS: `127.0.0.1:${port}`, AWS_REGION: REGION, AWS_ACCESS_KEY_ID: ACCESS, AWS_SECRET_ACCESS_KEY: SECRET },
        close() { server.close(); server.closeAllConnections?.(); },
        check: () => (stats.refused ? `${stats.refused} signatures refused` : !stats.published ? "nothing was published" : stats.batches < 2 ? "the batch was not split" : !stats.confirmed ? "the subscription was not confirmed" : !stats.certs ? "the certificate was never fetched" : stats.certs > 1 ? "the certificate was fetched more than once" : null),
    };
}
