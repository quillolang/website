// AWS Secrets Manager and Systems Manager for the aws_secrets plugin's test, written from their API
// References: POST / with X-Amz-Target secretsmanager.* or AmazonSSM.*, Content-Type
// application/x-amz-json-1.1, Signature V4 (service secretsmanager on one port, ssm on the other),
// and errors as { __type, Message }. Secrets Manager: GetSecretValue (VersionId, VersionStage),
// DescribeSecret, ListSecretVersionIds (paged), PutSecretValue (ClientRequestToken must be a
// 32 to 64 character token; AWSCURRENT moves, the old one becomes AWSPREVIOUS), RotateSecret.
// SSM: GetParameter (WithDecryption; a SecureString without it stays cipher text),
// GetParametersByPath (at most 10 a page, NextToken), GetParameterHistory, PutParameter (an
// existing name needs Overwrite). GET /_calls says how many GetSecretValue calls came, for the
// example's cache route; it is not AWS's.
//
//   start({ port, ports }) -> { env: { SECRETSMANAGER_API_URL, SSM_API_URL, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY }, close(), check() }
import { createServer } from "node:http";
import { sigv4Check } from "./aws_dynamodb_sigv4.mjs";

const ACCESS = "AKIDQUILLOTEST", SECRET = "quillo-test-secret-for-the-standin", REGION = "eu-west-1";
const NOW = 1730000000;

export async function start({ ports }) {
    const stats = { refused: 0, gets: 0, params: 0, pages: 0 };
    let nextVersion = 100;
    const secret = (name, versions, extra = {}) => ({ name, arn: `arn:aws:secretsmanager:${REGION}:123456789012:secret:${name}-AbCdEf`, versions, ...extra });
    const secrets = {
        "prod/db": secret("prod/db", [
            { id: "v-previous-0000000000000000000001", text: JSON.stringify({ username: "app", password: "old-one", port: 5432 }), stages: ["AWSPREVIOUS"], created: NOW - 86400 },
            { id: "v-current-00000000000000000000002", text: JSON.stringify({ username: "app", password: "first-one", port: 5432 }), stages: ["AWSCURRENT"], created: NOW },
        ], { RotationEnabled: true, RotationRules: { AutomaticallyAfterDays: 30 }, LastRotatedDate: NOW, NextRotationDate: NOW + 30 * 86400 }),
        "prod/rotating": secret("prod/rotating", [
            { id: "v-a-000000000000000000000000000003", text: "a", stages: ["AWSCURRENT"], created: NOW },
            { id: "v-b-000000000000000000000000000004", text: "b", stages: ["AWSPENDING"], created: NOW },
        ], { RotationEnabled: true, RotationRules: { AutomaticallyAfterDays: 7 } }),
        "prod/api-key": secret("prod/api-key", [{ id: "v-k-000000000000000000000000000005", text: "plain-text-key", stages: ["AWSCURRENT"], created: NOW }]),
    };
    const params = new Map();
    const addParam = (Name, Value, Type = "String") => { const p = params.get(Name); params.set(Name, { Name, Value, Type, Version: (p?.Version ?? 0) + 1, LastModifiedDate: NOW, ARN: `arn:aws:ssm:${REGION}:123456789012:parameter${Name}`, history: [...(p?.history ?? []), { Name, Value, Type, Version: (p?.Version ?? 0) + 1, LastModifiedDate: NOW, LastModifiedUser: "arn:aws:iam::123456789012:user/ada" }] }); };
    addParam("/app/prod/db/host", "db.internal"); addParam("/app/prod/db/port", "5432"); addParam("/app/prod/banner", "Welcome");
    addParam("/app/prod/token", "open-sesame", "SecureString");
    for (let i = 0; i < 12; i++) addParam(`/app/prod/flag/${i}`, String(i % 2 === 0));
    class Err { constructor(type, Message, status = 400) { Object.assign(this, { type, Message, status }); } }
    const find = (id) => secrets[id] ?? (() => { throw new Err("ResourceNotFoundException", "Secrets Manager can't find the specified secret."); })();
    const sm = {
        GetSecretValue(b) {
            stats.gets++;
            const s = find(b.SecretId);
            const stage = b.VersionStage ?? (b.VersionId ? null : "AWSCURRENT");
            const v = s.versions.find((x) => (b.VersionId ? x.id === b.VersionId : x.stages.includes(stage)));
            if (!v) throw new Err("ResourceNotFoundException", "Secrets Manager can't find the specified secret value for staging label: " + stage);
            return { ARN: s.arn, Name: s.name, VersionId: v.id, SecretString: v.text, VersionStages: v.stages, CreatedDate: v.created };
        },
        DescribeSecret(b) {
            const s = find(b.SecretId);
            const { name, arn, versions, ...rest } = s;
            return { ARN: arn, Name: name, VersionIdsToStages: Object.fromEntries(versions.map((v) => [v.id, v.stages])), ...rest };
        },
        ListSecretVersionIds(b) {
            stats.pages++;
            const s = find(b.SecretId), from = Number(b.NextToken ?? 0);
            const page = s.versions.slice(from, from + 1);
            return { Name: s.name, ARN: s.arn, Versions: page.map((v) => ({ VersionId: v.id, VersionStages: v.stages, CreatedDate: v.created })), ...(from + 1 < s.versions.length ? { NextToken: String(from + 1) } : {}) };
        },
        PutSecretValue(b) {
            const s = find(b.SecretId);
            if (!/^[a-zA-Z0-9-]{32,64}$/.test(b.ClientRequestToken ?? "")) throw new Err("InvalidParameterException", "ClientRequestToken must be 32 to 64 characters");
            for (const v of s.versions) { v.stages = v.stages.filter((x) => x !== "AWSPREVIOUS"); if (v.stages.includes("AWSCURRENT")) v.stages = ["AWSPREVIOUS"]; }
            const v = { id: b.ClientRequestToken, text: b.SecretString, stages: ["AWSCURRENT"], created: NOW };
            s.versions.push(v);
            return { ARN: s.arn, Name: s.name, VersionId: v.id, VersionStages: v.stages };
        },
        RotateSecret(b) { const s = find(b.SecretId); return { ARN: s.arn, Name: s.name, VersionId: `rotated-${++nextVersion}` }; },
    };
    const notParam = (n) => new Err("ParameterNotFound", `Parameter ${n} not found`);
    const shown = (p, decrypt) => { const { history, ...q } = p; return p.Type === "SecureString" && !decrypt ? { ...q, Value: "AQICAHg-cipher-text" } : q; };
    const ssm = {
        GetParameter(b) { stats.params++; const p = params.get(b.Name); if (!p) throw notParam(b.Name); return { Parameter: shown(p, b.WithDecryption) }; },
        GetParametersByPath(b) {
            stats.params++;
            if ((b.MaxResults ?? 10) > 10) throw new Err("ValidationException", "1 validation error detected: Value at 'maxResults' failed to satisfy constraint: Member must have value less than or equal to 10");
            const all = [...params.values()].filter((p) => p.Name.startsWith(b.Path)).filter((p) => b.Recursive || !p.Name.slice(b.Path.length).includes("/"));
            const from = Number(b.NextToken ?? 0);
            return { Parameters: all.slice(from, from + (b.MaxResults ?? 10)).map((p) => shown(p, b.WithDecryption)), ...(from + 10 < all.length ? { NextToken: String(from + 10) } : {}) };
        },
        GetParameterHistory(b) { const p = params.get(b.Name); if (!p) throw notParam(b.Name); return { Parameters: p.history }; },
        PutParameter(b) {
            if (params.has(b.Name) && !b.Overwrite) throw new Err("ParameterAlreadyExists", "The parameter already exists. To overwrite this value, set the overwrite option in the request to true.");
            addParam(b.Name, b.Value, b.Type); return { Version: params.get(b.Name).Version, Tier: "Standard" };
        },
    };
    const make = (service, prefix, ops, port) => {
        const server = createServer((req, res) => {
            const chunks = [];
            req.on("data", (d) => chunks.push(d));
            req.on("end", () => {
                const raw = Buffer.concat(chunks);
                const send = (status, v) => { res.writeHead(status, { "content-type": "application/x-amz-json-1.1" }); res.end(JSON.stringify(v)); };
                if (req.url === "/_calls") return send(200, { calls: stats.gets });
                const bad = sigv4Check(req, raw, { access: ACCESS, secret: SECRET, region: REGION, service });
                if (bad) { stats.refused++; return send(403, { __type: bad.code, Message: bad.message }); }
                const [p, op] = (req.headers["x-amz-target"] ?? "").split(".");
                if (p !== prefix || !ops[op] || req.headers["content-type"] !== "application/x-amz-json-1.1") return send(400, { __type: "UnknownOperationException" });
                try { send(200, ops[op](JSON.parse(raw.toString()))); }
                catch (e) { if (e instanceof Err) send(e.status, { __type: e.type, Message: e.Message }); else send(500, { __type: "InternalServiceError", Message: String(e) }); }
            });
        });
        return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
    };
    const a = await make("secretsmanager", "secretsmanager", sm, ports[0]), b = await make("ssm", "AmazonSSM", ssm, ports[1]);
    return {
        env: { SECRETSMANAGER_API_URL: `http://127.0.0.1:${ports[0]}`, SSM_API_URL: `http://127.0.0.1:${ports[1]}`, AWS_REGION: REGION, AWS_ACCESS_KEY_ID: ACCESS, AWS_SECRET_ACCESS_KEY: SECRET },
        close() { for (const s of [a, b]) { s.close(); s.closeAllConnections?.(); } },
        check: () => (!stats.gets ? "no secret was read" : !stats.params ? "no parameter was read" : stats.refused ? `${stats.refused} signatures refused` : stats.pages < 2 ? "versions were not paged" : null),
    };
}
