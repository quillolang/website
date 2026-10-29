// A certificate for the stand-ins that speak TLS (syslog over TLS, wss://, gRPC over TLS):
// a test CA and a certificate for localhost and 127.0.0.1 that it signed, made with openssl and
// valid until 2126. The key is public: it is for tests on this machine only.
//
// `caFile()` writes the CA to a temporary file and gives its path, for the `*_CA` variable an
// example passes to its plugin (`ca_file` in the options).
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ca = `-----BEGIN CERTIFICATE-----
MIIBeDCCAR6gAwIBAgIUIVOEzbyDA4n1XsoDTArLC9oCihUwCgYIKoZIzj0EAwIw
ITEfMB0GA1UEAwwWUXVpbGxvIHBsdWdpbiB0ZXN0cyBDQTAgFw0yNjEwMjkyMDQ2
MTZaGA8yMTI2MTAwNTIwNDYxNlowITEfMB0GA1UEAwwWUXVpbGxvIHBsdWdpbiB0
ZXN0cyBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABKlxihQClu1eRziB2VO8
4drkmof/SyJyqyQqHreHMk6JAybORO8ZvAOj/5ncAAJXBp0RtDfiYUPjB4w3395o
raOjMjAwMB0GA1UdDgQWBBTSPcfTT6lIBp9M4QQroR66hvarBDAPBgNVHRMBAf8E
BTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQCr69G4ADI3zX7BuB1kE03UOaaPYqIF
HJ5SRylCkDWGWQIgIkb8+0Kh4Kz4lsVSvrgcPM5GLiN+ehf7BBg2cEMSScE=
-----END CERTIFICATE-----
`;
export const cert = `-----BEGIN CERTIFICATE-----
MIIBijCCATCgAwIBAgIUDWkIzh83exqWBCU0XDhEm/LNdxkwCgYIKoZIzj0EAwIw
ITEfMB0GA1UEAwwWUXVpbGxvIHBsdWdpbiB0ZXN0cyBDQTAgFw0yNjEwMjkyMDQ2
MTZaGA8yMTI2MTAwNTIwNDYxNlowFDESMBAGA1UEAwwJbG9jYWxob3N0MFkwEwYH
KoZIzj0CAQYIKoZIzj0DAQcDQgAEe29XapWG+3vSHWFEhFCBqM8CUXCuuxiCl6ou
LwbmKyfjPF9I3CrnpISeHw9ZChB10vRyILhEvRa2mHADXpn+8KNRME8wGgYDVR0R
BBMwEYIJbG9jYWxob3N0hwR/AAABMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQD
AgeAMBMGA1UdJQQMMAoGCCsGAQUFBwMBMAoGCCqGSM49BAMCA0gAMEUCIDy7sZU/
TL43Sn/wDya4QGMwF0x5Lhh+tkyBhZdUCl22AiEAytqW+l0dFI4AFPzcpj9/4R8i
bfSrTPiys7Vteot2SeY=
-----END CERTIFICATE-----
`;
export const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgB6Tep3WLeU2Lo3wm
EgwpBL9ZmlimnrmHxR+Uj73yA6WhRANCAAR7b1dqlYb7e9IdYUSEUIGozwJRcK67
GIKXqi4vBuYrJ+M8X0jcKuekhJ4fD1kKEHXS9HIguES9FraYcANemf7w
-----END PRIVATE KEY-----
`;

let file = null;
export function caFile() {
    if (!file) {
        file = join(mkdtempSync(join(tmpdir(), "quillo-test-ca-")), "ca.pem");
        writeFileSync(file, ca);
    }
    return file;
}
