// Makes asn1_der_sample.pem, the certificate asn1_der.qwe reads: `node standins/asn1_der_sample.mjs`.
// A self-signed test certificate for a made-up name, with its key thrown away. Each run gives a new
// serial, key and dates, so the `try` lines of asn1_der in the catalog then need those three
// changed. Not a stand-in: nothing starts it in a test.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "asn1-sample-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "ed25519", "-nodes", "-keyout", join(scratch, "key.pem"), "-out", join(here, "asn1_der_sample.pem"), "-days", "3650",
    "-subj", "/C=NO/O=Quillo Test/CN=sample.example",
    "-addext", "subjectAltName=DNS:sample.example,DNS:www.sample.example,IP:192.0.2.1",
    "-addext", "keyUsage=digitalSignature", "-addext", "extendedKeyUsage=serverAuth"], { stdio: "ignore" });
rmSync(scratch, { recursive: true, force: true });
