// A Docker Engine for the docker plugin's test, written from the Engine API reference (v1.43): an
// HTTP server on a Unix socket file, as the daemon is. GET /version, /containers/json (all, filters
// as JSON of name to list: status, label, name), /containers/:id/json, /containers/:id/logs (chunked,
// and in the multiplexed stream format for a container without a TTY, raw with one), /containers/:id
// /stats, POST .../start (204, 304 when running), .../stop (204, 304), .../restart, DELETE
// /containers/:id (409 while running unless force), /images/json, POST /images/create (a stream of
// JSON lines, with a 200 and an `error` line for an image that does not exist), DELETE /images/:name.
// Errors are { message }.
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const frame = (kind, text) => { const b = Buffer.from(text); const h = Buffer.alloc(8); h[0] = kind; h.writeUInt32BE(b.length, 4); return Buffer.concat([h, b]); };

export async function start() {
    const dir = mkdtempSync(join(tmpdir(), "docker-standin-"));
    const sock = join(dir, "docker.sock");
    const stats = { requests: 0, chunked: 0, pulls: 0 };
    const make = (name, image, state, labels, tty = false) => ({ Id: (name.padEnd(12, "0") + "f".repeat(52)).slice(0, 64), Names: [`/${name}`], Image: image, ImageID: "sha256:abc", Command: "run", Created: 1793000000, State: state, Status: state === "running" ? "Up 2 hours" : "Exited (0) 3 hours ago", Ports: [], Labels: labels, tty });
    const containers = new Map([
        ["web-1", make("web-1", "nginx:1.27", "running", { app: "web" })],
        ["worker", make("worker", "busybox", "exited", { app: "jobs" })],
        ["console", make("console", "alpine", "running", {}, true)],
        ["chatty", make("chatty", "alpine", "running", {})],
        ["cut-off", make("cut-off", "alpine", "running", {})],
    ]);
    const images = new Map([
        ["nginx:1.27", { Id: "sha256:aaa", RepoTags: ["nginx:1.27"], RepoDigests: ["nginx@sha256:aaa"], Size: 187000000, Created: 1790000000 }],
        ["busybox:latest", { Id: "sha256:bbb", RepoTags: ["busybox:latest"], RepoDigests: [], Size: 4000000, Created: 1780000000 }],
    ]);
    const findC = (id) => [...containers.values()].find((c) => c.Names[0] === `/${id}` || c.Id.startsWith(id));
    const server = createServer((req, res) => {
        req.on("data", () => {});
        req.on("end", () => {
            stats.requests++;
            const url = new URL(req.url, "http://docker");
            const send = (code, v) => { res.writeHead(code, { "content-type": "application/json", "api-version": "1.43" }); res.end(v === undefined ? "" : JSON.stringify(v) + "\n"); };
            const msg = (code, message) => send(code, { message });
            const p = url.pathname.replace(/^\/v\d\.\d+/, "").split("/").filter(Boolean).map(decodeURIComponent);
            const q = url.searchParams;
            if (p[0] === "version") return send(200, { Version: "24.0.7", ApiVersion: "1.43", Os: "linux", Arch: "arm64" });
            if (p[0] === "containers" && p[1] === "json") {
                let list = [...containers.values()];
                if (q.get("all") !== "true") list = list.filter((c) => c.State === "running");
                const f = JSON.parse(q.get("filters") ?? "{}");
                for (const [k, vs] of Object.entries(f)) {
                    if (!Array.isArray(vs)) return msg(400, `invalid filter ${k}`);
                    if (k === "status") list = list.filter((c) => vs.includes(c.State));
                    else if (k === "label") list = list.filter((c) => vs.every((v) => { const [a, b] = v.split("="); return c.Labels[a] === b; }));
                    else if (k === "name") list = list.filter((c) => vs.some((v) => c.Names[0].includes(v)));
                    else return msg(400, `invalid filter '${k}'`);
                }
                return send(200, list.map(({ tty, ...c }) => c));
            }
            if (p[0] === "containers") {
                const c = findC(p[1]);
                if (!c) return msg(404, `No such container: ${p[1]}`);
                const act = p[2];
                if (req.method === "DELETE") {
                    if (c.State === "running" && q.get("force") !== "true") return msg(409, `You cannot remove a running container ${c.Id}. Stop the container before attempting removal or force remove`);
                    containers.delete(c.Names[0].slice(1));
                    return send(204);
                }
                if (act === "json") return send(200, { Id: c.Id, Name: c.Names[0], State: { Status: c.State, Running: c.State === "running", ExitCode: 0 }, Config: { Image: c.Image, Tty: c.tty, Labels: c.Labels } });
                if (act === "start") { if (c.State === "running") return send(304); c.State = "running"; return send(204); }
                if (act === "stop") { if (c.State !== "running") return send(304); c.State = "exited"; return send(204); }
                if (act === "restart") { c.State = "running"; return send(204); }
                if (act === "stats") return send(200, { pids_stats: { current: 5 }, cpu_stats: { cpu_usage: { total_usage: 2000 }, system_cpu_usage: 20000, online_cpus: 2 }, precpu_stats: { cpu_usage: { total_usage: 1000 }, system_cpu_usage: 10000 }, memory_stats: { usage: 1200, limit: 4000, stats: { inactive_file: 200 } } });
                if (act === "logs") {
                    if (q.get("stdout") !== "true" && q.get("stderr") !== "true") return msg(400, "you must choose at least one stream");
                    const want = (k) => (k === 1 ? q.get("stdout") === "true" : q.get("stderr") === "true");
                    res.writeHead(200, { "content-type": c.tty ? "application/vnd.docker.raw-stream" : "application/vnd.docker.multiplexed-stream", "transfer-encoding": "chunked" });
                    stats.chunked++;
                    if (c.tty) return res.end("plain tty line\n");
                    if (c.Names[0] === "/cut-off") return res.end(Buffer.concat([frame(1, "whole\n"), frame(1, "half a frame").subarray(0, 10)]));
                    if (c.Names[0] === "/chatty") { const big = frame(1, "x".repeat(70000)); res.write(big.subarray(0, 30000)); return setTimeout(() => res.end(big.subarray(30000)), 5); }
                    const frames = [[1, "listening on :80\n"], [2, "warn: no cert\n"], [1, "GET / 200\n"], [2, "error: boom\n"]].filter(([k]) => want(k));
                    res.write(frames[0] ? frame(frames[0][0], frames[0][1]).subarray(0, 3) : ""); // split across chunks on purpose
                    return setTimeout(() => res.end(Buffer.concat([...(frames[0] ? [frame(frames[0][0], frames[0][1]).subarray(3)] : []), ...frames.slice(1).map(([k, t]) => frame(k, t))])), 5);
                }
            }
            if (p[0] === "images" && p[1] === "json") {
                let list = [...images.values()];
                const f = JSON.parse(q.get("filters") ?? "{}");
                if (f.reference) list = list.filter((i) => i.RepoTags.some((t) => f.reference.some((r) => new RegExp("^" + r.replace(/\*/g, ".*") + "$").test(t))));
                return send(200, list);
            }
            if (p[0] === "images" && p[1] === "create") {
                stats.pulls++;
                res.writeHead(200, { "content-type": "application/json", "transfer-encoding": "chunked" });
                const image = q.get("fromImage"), tag = q.get("tag");
                if (image.startsWith("no/")) {
                    res.write(JSON.stringify({ status: `Pulling from ${image}`, id: tag }) + "\r\n");
                    return res.end(JSON.stringify({ errorDetail: { message: `pull access denied for ${image}, repository does not exist` }, error: `pull access denied for ${image}, repository does not exist` }) + "\r\n");
                }
                images.set(`${image}:${tag}`, { Id: "sha256:ccc", RepoTags: [`${image}:${tag}`], RepoDigests: [], Size: 7000000, Created: 1790000000 });
                res.write(JSON.stringify({ status: `Pulling from library/${image}`, id: tag }) + "\r\n");
                return res.end(JSON.stringify({ status: `Status: Downloaded newer image for ${image}:${tag}` }) + "\r\n");
            }
            if (p[0] === "images" && req.method === "DELETE") {
                const i = images.get(p[1]);
                if (!i) return msg(404, `No such image: ${p[1]}`);
                if ([...containers.values()].some((c) => c.Image === p[1]) && q.get("force") !== "true") return msg(409, `conflict: unable to remove repository reference "${p[1]}" (must force) - container is using its referenced image`);
                images.delete(p[1]);
                return send(200, [{ Untagged: p[1] }]);
            }
            msg(404, "page not found");
        });
    });
    await new Promise((ok) => server.listen(sock, ok));
    return {
        env: { DOCKER_HOST: `unix://${sock}` },
        close() { server.close(); server.closeAllConnections?.(); rmSync(dir, { recursive: true, force: true }); },
        check() {
            if (!stats.requests) return "the Docker stand-in got no request";
            if (!stats.chunked) return "no logs were read";
            if (!stats.pulls) return "no image was pulled";
            return null;
        },
    };
}
