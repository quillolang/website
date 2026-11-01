// WHOIS servers for whois.qwe, on node:net, written from RFC 3912 (a line in, text back, the
// server closes) and the shape of what IANA, Verisign, a registrar, ARIN and RIPE send.
//
//   port      IANA: `refer:` to the registry for a TLD or the RIR for an address
//   port + 1  a thin registry, which wants `domain name`: sends the `Registrar WHOIS Server`, or
//             "No match for"; for rate.example it says the limit is exceeded
//   port + 2  a registrar, in Latin-1, with the registrant
//   port + 3  ARIN: wants `n + address`, and refers on with `ReferralServer: whois://`
//   port + 4  RIPE, in its own format
import { createServer } from "node:net";

const LAST = ">>> Last update of WHOIS database: 2026-11-01T00:00:00Z <<<\r\nRegistrar: terms of use text that is not a field\r\n";
export async function start({ port, ports }) {
    const seen = { iana: [], registry: [], registrar: [], arin: [], ripe: [], problems: [] };
    const reg = ports[1], rar = ports[2], arin = ports[3], ripe = ports[4];
    const servers = [
        (q) => {
            seen.iana.push(q);
            if (/^\d+\.|^as\d+/i.test(q)) return `% IANA WHOIS server\r\n\r\nrefer:        whois.arin.net\r\n\r\ninetnum:      8.0.0.0 - 8.255.255.255\r\n`;
            if (q.endsWith(".invalidtld")) return "% IANA WHOIS server\r\n\r\n% This query returned 0 objects.\r\n";
            return `% IANA WHOIS server\r\n\r\nrefer:        whois.verisign-grs.com\r\n\r\ndomain:       COM\r\nstatus:       ACTIVE\r\ncreated:      1985-01-01\r\n`;
        },
        (q) => {
            seen.registry.push(q);
            if (!q.startsWith("domain ")) { seen.problems.push(`the registry got \`${q}\`, without \`domain \``); return "No match\r\n"; }
            const name = q.slice(7);
            if (name === "free-name.com") return `No match for "FREE-NAME.COM".\r\n${LAST}`;
            if (name === "rate.example") return "Your connection limit exceeded. Please slow down and try again later.\r\n";
            return [
                `   Domain Name: ${name.toUpperCase()}`, "   Registry Domain ID: 2336799_DOMAIN_COM-VRSN", `   Registrar WHOIS Server: ${name === "down.com" ? "whois.down-registrar.test" : "whois.example-registrar.test"}`,
                "   Registrar URL: http://www.example-registrar.test", "   Updated Date: 2026-08-14T07:01:31Z", "   Creation Date: 1995-08-14T04:00:00Z",
                "   Registry Expiry Date: 2026-11-20T04:00:00Z", "   Registrar: Example Registrar, Inc.", "   Registrar IANA ID: 376",
                "   Registrar Abuse Contact Email: ABUSE@example-registrar.test", "   Domain Status: clientDeleteProhibited https://icann.org/epp#clientDeleteProhibited",
                "   Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited", "   Name Server: A.IANA-SERVERS.NET", "   Name Server: B.IANA-SERVERS.NET", "   DNSSEC: signedDelegation", LAST,
            ].join("\r\n");
        },
        (q) => { seen.registrar.push(q); return Buffer.from(`Domain Name: ${q.toUpperCase()}\r\nRegistrant Organization: Société Exemple\r\nRegistrant Country: fr\r\nRegistry Expiry Date: 2026-11-20T04:00:00Z\r\n`, "latin1"); },
        (q) => {
            seen.arin.push(q);
            if (q === "a + 15169") return "ASNumber: 15169\r\nASName: GOOGLE\r\nOrganization: Google LLC (GOGL)\r\nOrgAbuseEmail: network-abuse@google.com\r\n";
            if (!q.startsWith("n + ")) { seen.problems.push(`ARIN got \`${q}\`, without \`n + \``); return "#\r\n"; }
            if (q.startsWith("n + 8.")) return "# ARIN WHOIS data\r\n\r\nNetRange:       8.8.8.0 - 8.8.8.255\r\nCIDR:           8.8.8.0/24\r\nNetName:        GOGL\r\nOriginAS:       AS15169\r\nOrganization:   Google LLC (GOGL)\r\nCountry:        US\r\nOrgAbuseEmail:  network-abuse@google.com\r\n";
            return `# ARIN WHOIS data\r\n\r\nNetRange:       193.0.0.0 - 193.255.255.255\r\nNetName:        RIPE-ERX-193\r\nReferralServer: whois://whois.ripe.net:43\r\nResourceLink:   https://apps.db.ripe.net\r\n`;
        },
        (q) => { seen.ripe.push(q); return "% This is the RIPE Database query service.\r\n\r\ninetnum:        193.0.0.0 - 193.0.7.255\r\nnetname:        RIPE-NCC\r\ndescr:          RIPE Network Coordination Centre\r\ncountry:        NL\r\nabuse-mailbox:  Abuse@ripe.net\r\norigin:         AS3333\r\n"; },
    ];
    const list = servers.map((f, i) => {
        const srv = createServer((s) => {
            s.on("error", () => {});
            let buf = "";
            s.on("data", (d) => {
                buf += d.toString("latin1");
                const at = buf.indexOf("\r\n");
                if (at < 0) return;
                s.end(f(buf.slice(0, at)));
            });
        });
        return new Promise((r) => srv.listen(ports[i], "127.0.0.1", () => r(srv)));
    });
    const up = await Promise.all(list);
    return {
        env: {
            WHOIS_HOST: `127.0.0.1:${port}`,
            WHOIS_ROUTES: `whois.verisign-grs.com=127.0.0.1:${reg},whois.example-registrar.test=127.0.0.1:${rar},whois.arin.net=127.0.0.1:${arin},whois.ripe.net=127.0.0.1:${ripe},whois.down-registrar.test=127.0.0.1:1`,
        },
        close() { up.forEach((s) => s.close()); },
        check() {
            if (seen.problems.length) return seen.problems[0];
            if (!seen.registrar.length || !seen.ripe.length) return "referrals were not followed to the end";
            return null;
        },
    };
}
