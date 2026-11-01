// Makes the sample DMARC aggregate reports dmarc_report.qwe reads, from RFC 7489's appendix C schema:
// dmarc_report_sample.xml (plain), .xml.gz (gzip) and .zip (one deflated entry, as Google sends them).
//
//   node standins/dmarc_report_sample.mjs
import { writeFileSync } from "node:fs";
import { deflateRawSync, gzipSync, crc32 } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const record = (ip, count, disposition, dkim, spf, from, authDkim, authSpf, reason = "") => `  <record>
    <row><source_ip>${ip}</source_ip><count>${count}</count>
      <policy_evaluated><disposition>${disposition}</disposition><dkim>${dkim}</dkim><spf>${spf}</spf>${reason}</policy_evaluated>
    </row>
    <identifiers><header_from>${from}</header_from><envelope_from>${authSpf[0]}</envelope_from></identifiers>
    <auth_results>${authDkim.map(([d, s, r]) => `<dkim><domain>${d}</domain><selector>${s}</selector><result>${r}</result></dkim>`).join("")}<spf><domain>${authSpf[0]}</domain><scope>mfrom</scope><result>${authSpf[1]}</result></spf></auth_results>
  </record>`;
const report = (org, id, begin, records) => `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <version>1.0</version>
  <report_metadata>
    <org_name>${org}</org_name><email>noreply-dmarc-support@${org}</email>
    <extra_contact_info>https://${org}/dmarc</extra_contact_info>
    <report_id>${id}</report_id>
    <date_range><begin>${begin}</begin><end>${begin + 86399}</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain><adkim>r</adkim><aspf>s</aspf><p>quarantine</p><sp>none</sp><pct>100</pct><fo>1</fo>
  </policy_published>
${records.join("\n")}
</feedback>
`;
const first = report("google.com", "1730000000123456789", 1730000000, [
    record("198.51.100.10", 120, "none", "pass", "pass", "example.com", [["example.com", "s1", "pass"]], ["example.com", "pass"]),
    record("198.51.100.11", 30, "none", "pass", "fail", "example.com", [["mail.example.com", "s1", "pass"]], ["bounces.esp.example", "pass"]),
    record("203.0.113.66", 7, "quarantine", "fail", "fail", "example.com", [["evil.example", "x", "pass"]], ["evil.example", "fail"]),
    record("203.0.113.66", 2, "none", "fail", "fail", "example.com", [], ["evil.example", "softfail"], "<reason><type>forwarded</type><comment>looks forwarded</comment></reason>"),
]);
const second = report("outlook.com", "ms-77", 1730086400, [
    record("198.51.100.10", 40, "none", "pass", "pass", "example.com", [["example.com", "s1", "pass"]], ["example.com", "pass"]),
    record("192.0.2.200", 5, "reject", "fail", "fail", "example.com", [], ["spoof.example", "none"]),
]);
writeFileSync(join(here, "dmarc_report_sample.xml"), first);
writeFileSync(join(here, "dmarc_report_sample.xml.gz"), gzipSync(first));
function zip(name, text) {
    const raw = Buffer.from(text), body = deflateRawSync(raw), n = Buffer.from(name), crc = crc32(raw);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(body.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(n.length, 28);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + body.length, 16);
    return Buffer.concat([local, n, body, dir, n, end]);
}
writeFileSync(join(here, "dmarc_report_sample.zip"), zip("outlook.com!example.com!1730086400!1730172799.xml", second));
