// A Kubernetes API server for the kubernetes plugin's test, written from the Kubernetes API reference
// and its "API concepts" page (limit and continue, 410 Expired, Status objects). It serves HTTPS with
// its own CA and asks for client certificates, as a real API server does; certificates are made with
// openssl when it starts. Requests pass with the kubeconfig's client certificate (CN
// kubernetes-admin, every namespace), a reader token (namespace shop only, 403 elsewhere, with the
// real message) or a pod's service-account token. Lists take labelSelector in all its forms
// (=, !=, in, notin, exists, !exists), fieldSelector, limit and continue. Deployments have spec,
// status with observedGeneration, and a scale subresource. PATCH needs a patch Content-Type (415
// otherwise). pods/:name/log takes container (400 when a pod has several and none is named),
// tailLines and previous.
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const READER = "standin-reader-token", POD_TOKEN = "standin-pod-token";

function certificates(dir) {
    const bin = existsSync("/opt/homebrew/bin/openssl") ? "/opt/homebrew/bin/openssl" : "/usr/bin/openssl";
    const run = (...a) => execFileSync(bin, a, { cwd: dir, stdio: "pipe" });
    const newKey = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];
    run("req", "-x509", ...newKey, "-keyout", "ca.key", "-out", "ca.crt", "-days", "2", "-subj", "/CN=standin-kube-ca");
    writeFileSync(join(dir, "san.cnf"), "subjectAltName=IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\n");
    run("req", "-new", ...newKey, "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=kube-apiserver");
    run("x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2", "-extfile", "san.cnf", "-out", "server.crt");
    writeFileSync(join(dir, "client.cnf"), "extendedKeyUsage=clientAuth\n");
    run("req", "-new", ...newKey, "-keyout", "client.key", "-out", "client.csr", "-subj", "/O=system:masters/CN=kubernetes-admin");
    run("x509", "-req", "-in", "client.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2", "-extfile", "client.cnf", "-out", "client.crt");
    const read = (f) => readFileSync(join(dir, f));
    return { ca: read("ca.crt"), key: read("server.key"), cert: read("server.crt"), clientCert: read("client.crt"), clientKey: read("client.key") };
}

function pod(ns, name, labels, o = {}) {
    return { metadata: { name, namespace: ns, labels, ...(o.deleting ? { deletionTimestamp: "2026-11-01T10:00:00Z" } : {}) }, spec: { nodeName: o.node ?? "node-a", containers: (o.containers ?? ["app"]).map((n) => ({ name: n, image: "x" })) }, status: { phase: o.phase ?? "Running", podIP: o.ip ?? "10.1.0.5", containerStatuses: (o.containers ?? ["app"]).map((n, i) => ({ name: n, ready: o.ready ?? true, restartCount: i === 0 ? (o.restarts ?? 0) : 0, state: o.waiting ? { waiting: { reason: o.waiting } } : { running: {} } })) } };
}

function matches(labels, sel) {
    // Splits at commas outside brackets.
    const parts = []; let depth = 0, cur = "";
    for (const c of sel) { if (c === "(") depth++; if (c === ")") depth--; if (c === "," && !depth) { parts.push(cur); cur = ""; } else cur += c; }
    if (cur) parts.push(cur);
    return parts.every((p) => {
        let m;
        p = p.trim();
        if ((m = /^(\S+) in \(([^)]*)\)$/.exec(p))) return m[2].split(",").includes(labels[m[1]]);
        if ((m = /^(\S+) notin \(([^)]*)\)$/.exec(p))) return !m[2].split(",").includes(labels[m[1]]);
        if ((m = /^(\S+?)!=(\S*)$/.exec(p))) return labels[m[1]] !== m[2];
        if ((m = /^(\S+?)==?(\S*)$/.exec(p))) return labels[m[1]] === m[2];
        if ((m = /^!(\S+)$/.exec(p))) return !(m[1] in labels);
        if ((m = /^(\S+)$/.exec(p))) return m[1] in labels;
        throw { code: 400, reason: "BadRequest", message: `unable to parse requirement: ${p}` };
    });
}

export async function start({ ports }) {
    const port = ports[0];
    const dir = mkdtempSync(join(tmpdir(), "kube-standin-"));
    const c = certificates(dir);
    const stats = { byCert: 0, byToken: 0, byPod: 0, pages: 0, patches: 0 };
    let pods = [
        pod("shop", "web-1", { app: "web", tier: "front" }, { ip: "10.1.0.5" }),
        pod("shop", "web-2", { app: "web", tier: "edge", canary: "yes" }, { ready: false, waiting: "CrashLoopBackOff", restarts: 7, node: "node-b" }),
        pod("shop", "db-0", { app: "db", tier: "data" }, { node: "node-b" }),
        pod("shop", "pair", { app: "sidecars" }, { containers: ["app", "proxy"] }),
        pod("kube-system", "dns", { app: "dns" }),
    ];
    for (let i = 0; i < 25; i++) pods.push(pod("big", `p-${String(i).padStart(2, "0")}`, { n: String(i) }));
    pods.push(pod("stale", "s-1", {}), pod("stale", "s-2", {}));
    const deployments = new Map([
        ["web", { metadata: { name: "web", namespace: "shop", generation: 3 }, spec: { replicas: 2, template: { metadata: {}, spec: { containers: [{ name: "app", image: "web:1.4" }] } } }, status: { observedGeneration: 3, replicas: 2, updatedReplicas: 2, readyReplicas: 2, availableReplicas: 2 } }],
        ["api", { metadata: { name: "api", namespace: "shop", generation: 8 }, spec: { replicas: 3, template: { metadata: {}, spec: { containers: [{ name: "app", image: "api:2.0" }] } } }, status: { observedGeneration: 7, replicas: 3, updatedReplicas: 1, readyReplicas: 2, availableReplicas: 2 } }],
    ]);
    const status = (res, code, reason, message) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify({ kind: "Status", apiVersion: "v1", metadata: {}, status: "Failure", message, reason, code })); };
    const server = createServer({ key: c.key, cert: c.cert, ca: c.ca, requestCert: true, rejectUnauthorized: false }, (req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const url = new URL(req.url, "http://x");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
            const peer = req.socket.getPeerCertificate?.();
            const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
            let who;
            if (req.socket.authorized && peer?.subject?.CN === "kubernetes-admin") { who = "admin"; stats.byCert++; }
            else if (token === READER) { who = "reader"; stats.byToken++; }
            else if (token === POD_TOKEN) { who = "pod"; stats.byPod++; }
            else return status(res, 401, "Unauthorized", "Unauthorized");
            const p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
            const m = /^\/api\/v1\/(?:namespaces\/([^/]+)\/)?(pods)(?:\/([^/]+))?(?:\/(log))?$/.exec(url.pathname) ?? /^\/apis\/apps\/v1\/(?:namespaces\/([^/]+)\/)?(deployments)(?:\/([^/]+))?(?:\/(scale))?$/.exec(url.pathname);
            if (!m) return status(res, 404, "NotFound", `the server could not find the requested resource`);
            const [, ns, kind, name, sub] = m;
            if (who !== "admin" && ns && ns !== "shop") return status(res, 403, "Forbidden", `${kind} is forbidden: User "reader" cannot list resource "${kind}" in API group "" in the namespace "${ns}"`);
            const q = url.searchParams;
            try {
                if (kind === "pods") {
                    const one = name ? pods.find((x) => x.metadata.namespace === ns && x.metadata.name === name) : null;
                    if (name && !one) return status(res, 404, "NotFound", `pods "${name}" not found`);
                    if (sub === "log") {
                        const containers = one.spec.containers.map((x) => x.name);
                        if (containers.length > 1 && !q.get("container")) return status(res, 400, "BadRequest", `a container name must be specified for pod ${name}, choose one of: [${containers.join(" ")}]`);
                        const lines = q.get("previous") === "true" ? ["old proxy line"] : ["starting", "GET /health 200", "ready"];
                        const tail = q.get("tailLines") ? lines.slice(-Number(q.get("tailLines"))) : lines;
                        res.writeHead(200, { "content-type": "text/plain" });
                        return res.end(tail.join("\n") + "\n");
                    }
                    if (req.method === "DELETE") { pods = pods.filter((x) => x !== one); return send(200, one); }
                    if (name) return send(200, { kind: "Pod", apiVersion: "v1", ...one });
                    let list = pods.filter((x) => !ns || x.metadata.namespace === ns);
                    if (q.get("labelSelector")) list = list.filter((x) => matches(x.metadata.labels, q.get("labelSelector")));
                    if (q.get("fieldSelector")) { const [k, v] = q.get("fieldSelector").split("="); if (k !== "spec.nodeName") return status(res, 400, "BadRequest", `field label "${k}" not supported for Pod`); list = list.filter((x) => x.spec.nodeName === v); }
                    const at = q.get("continue") ? Number(Buffer.from(q.get("continue"), "base64").toString()) : 0;
                    if (at) stats.pages++;
                    if (at && ns === "stale") return status(res, 410, "Expired", "The provided continue parameter is too old to display a consistent list result. You can start a new list without the continue parameter.");
                    const limit = Number(q.get("limit") ?? 0) || list.length;
                    const page = list.slice(at, at + limit), next = at + limit < list.length ? Buffer.from(String(at + limit)).toString("base64") : "";
                    return send(200, { kind: "PodList", apiVersion: "v1", metadata: { resourceVersion: "123", ...(next ? { continue: next, remainingItemCount: list.length - at - limit } : {}) }, items: page });
                }
                const d = name ? deployments.get(name) : null;
                if (name && !d) return status(res, 404, "NotFound", `deployments.apps "${name}" not found`);
                if (!name) return send(200, { kind: "DeploymentList", apiVersion: "apps/v1", metadata: {}, items: [...deployments.values()] });
                if (req.method === "PATCH") {
                    if (!/merge-patch\+json|strategic-merge-patch\+json/.test(req.headers["content-type"] ?? "")) return status(res, 415, "UnsupportedMediaType", `the body of the request was in an unknown format`);
                    stats.patches++;
                    const j = JSON.parse(body);
                    if (sub === "scale") { d.spec.replicas = j.spec.replicas; d.metadata.generation++; }
                    else d.spec.template.metadata = { ...d.spec.template.metadata, ...j.spec.template.metadata };
                }
                if (sub === "scale") return send(200, { kind: "Scale", apiVersion: "autoscaling/v1", metadata: { name, namespace: ns }, spec: { replicas: d.spec.replicas }, status: { replicas: d.status.replicas } });
                return send(200, { kind: "Deployment", apiVersion: "apps/v1", ...d });
            } catch (e) {
                if (e.code) return status(res, e.code, e.reason, e.message);
                status(res, 500, "InternalError", String(e));
            }
        });
    });
    await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
    const server_url = `https://127.0.0.1:${port}`;
    const b64 = (b) => Buffer.from(b).toString("base64");
    const kubeconfig = join(dir, "config");
    writeFileSync(kubeconfig, `apiVersion: v1
kind: Config
current-context: admin
clusters:
- name: standin
  cluster:
    server: ${server_url}
    certificate-authority-data: ${b64(c.ca)}
contexts:
- name: admin
  context:
    cluster: standin
    user: admin
    namespace: shop
- name: reader
  context:
    cluster: standin
    user: reader
    namespace: shop
users:
- name: admin
  user:
    client-certificate-data: ${b64(c.clientCert)}
    client-key-data: ${b64(c.clientKey)}
- name: reader
  user:
    token: ${READER}
`);
    const sa = join(dir, "sa");
    execFileSync("mkdir", ["-p", sa]);
    writeFileSync(join(sa, "token"), POD_TOKEN + "\n");
    writeFileSync(join(sa, "namespace"), "shop");
    writeFileSync(join(sa, "ca.crt"), c.ca);
    return {
        env: { KUBECONFIG: kubeconfig, KUBERNETES_SA_DIR: sa, KUBERNETES_SERVICE_HOST: "127.0.0.1", KUBERNETES_SERVICE_PORT: String(port) },
        close() { server.close(); server.closeAllConnections?.(); rmSync(dir, { recursive: true, force: true }); },
        check() {
            if (!stats.byCert) return "no request came with the client certificate";
            if (!stats.byToken) return "no request came with the kubeconfig's token";
            if (!stats.byPod) return "no request came with the pod's token";
            if (!stats.pages) return "no continue token was followed";
            if (!stats.patches) return "no patch reached the stand-in";
            return null;
        },
    };
}
