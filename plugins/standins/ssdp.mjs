// A UPnP router and media renderer for ssdp.qwe. Written from the UPnP Device Architecture 2.0:
// M-SEARCH needs HOST, MAN "ssdp:discover", MX and ST, answers are unicast with CACHE-CONTROL,
// LOCATION, ST and USN, descriptions are XML, and SOAP calls carry the SOAPACTION header, a fault
// being HTTP 500 with a UPnPError detail. WANIPConnection's actions as UPnP-gw-WANIPConnection-v1.
import { createSocket } from "node:dgram";
import { createServer } from "node:http";

function bindUdp(sock, port) {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
            const onError = (e) => { sock.off("listening", onListening); if (e.code === "EADDRINUSE" && ++tries < 40) setTimeout(attempt, 100); else reject(e); };
            const onListening = () => { sock.off("error", onError); resolve(); };
            sock.once("error", onError); sock.once("listening", onListening); sock.bind(port, "127.0.0.1");
        };
        attempt();
    });
}
const WAN = "urn:schemas-upnp-org:service:WANIPConnection:1";
const description = (base) => `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0"><specVersion><major>1</major><minor>1</minor></specVersion>
<URLBase>${base}/</URLBase>
<device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType><friendlyName>Stand-in Router</friendlyName><manufacturer>Example &amp; Sons</manufacturer><modelName>RT-1000</modelName><modelNumber>1</modelNumber><serialNumber>SN42</serialNumber><UDN>uuid:11111111-2222-3333-4444-555555555555</UDN>
<iconList><icon><mimetype>image/png</mimetype><width>48</width><height>48</height><depth>24</depth><url>/icon.png</url></icon></iconList>
<serviceList><service><serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType><serviceId>urn:upnp-org:serviceId:L3F</serviceId><SCPDURL>/l3f.xml</SCPDURL><controlURL>/ctl/l3f</controlURL><eventSubURL>/evt/l3f</eventSubURL></service></serviceList>
<deviceList><device><deviceType>urn:schemas-upnp-org:device:WANConnectionDevice:1</deviceType><friendlyName>WAN Connection</friendlyName><UDN>uuid:11111111-2222-3333-4444-666666666666</UDN>
<serviceList><service><serviceType>${WAN}</serviceType><serviceId>urn:upnp-org:serviceId:WANIPConn1</serviceId><SCPDURL>wan.xml</SCPDURL><controlURL>ctl/wan</controlURL><eventSubURL>evt/wan</eventSubURL></service></serviceList></device></deviceList>
</device></root>`;
const SCPD = `<?xml version="1.0"?><scpd xmlns="urn:schemas-upnp-org:service-1-0"><specVersion><major>1</major><minor>0</minor></specVersion>
<actionList><action><name>GetExternalIPAddress</name><argumentList><argument><name>NewExternalIPAddress</name><direction>out</direction><relatedStateVariable>ExternalIPAddress</relatedStateVariable></argument></argumentList></action>
<action><name>AddPortMapping</name><argumentList><argument><name>NewExternalPort</name><direction>in</direction><relatedStateVariable>ExternalPort</relatedStateVariable></argument></argumentList></action></actionList>
<serviceStateTable><stateVariable sendEvents="yes"><name>ConnectionStatus</name><dataType>string</dataType><allowedValueList><allowedValue>Connected</allowedValue><allowedValue>Disconnected</allowedValue></allowedValueList></stateVariable><stateVariable sendEvents="no"><name>ExternalPort</name><dataType>ui2</dataType></stateVariable></serviceStateTable></scpd>`;
const envelope = (inner) => `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>${inner}</s:Body></s:Envelope>`;
const fault = (code, text) => envelope(`<s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${text}</errorDescription></UPnPError></detail></s:Fault>`);

export async function start({ ports }) {
    const seen = { searches: 0, soap: [], problems: [], description: 0 };
    const base = `http://127.0.0.1:${ports[1]}`;
    const web = createServer((req, res) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
            const send = (code, text, type = "text/xml") => { res.writeHead(code, { "content-type": type }); res.end(text); };
            if (req.url === "/desc.xml") { seen.description++; return send(200, description(base)); }
            if (req.url === "/wan.xml") return send(200, SCPD);
            if (req.url === "/garbage.xml") return send(200, "<html><body>Welcome!", "text/html");
            if (req.url === "/wrong.xml") return send(200, "<rss version=\"2.0\"></rss>");
            if (req.url === "/ctl/wan" && req.method === "POST") {
                const action = (req.headers.soapaction ?? "").replace(/"/g, "").split("#");
                if (action[0] !== WAN) { seen.problems.push(`SOAPACTION ${req.headers.soapaction}`); return send(500, fault(401, "Invalid Action")); }
                if (!(req.headers["content-type"] ?? "").startsWith("text/xml")) seen.problems.push("a SOAP call that is not text/xml");
                if (!body.includes(`<u:${action[1]} xmlns:u="${WAN}">`)) seen.problems.push(`the body does not hold ${action[1]}`);
                seen.soap.push(action[1]);
                if (action[1] === "GetExternalIPAddress") return send(200, envelope(`<u:GetExternalIPAddressResponse xmlns:u="${WAN}"><NewExternalIPAddress>203.0.113.7</NewExternalIPAddress></u:GetExternalIPAddressResponse>`));
                if (action[1] === "AddPortMapping") {
                    if (!body.includes("<NewPortMappingDescription>a &lt;test&gt; &amp; more</NewPortMappingDescription>")) seen.problems.push("an argument was not escaped");
                    return send(200, envelope(`<u:AddPortMappingResponse xmlns:u="${WAN}"></u:AddPortMappingResponse>`));
                }
                if (action[1] === "DeletePortMapping") return send(500, fault(714, "NoSuchEntryInArray"));
                return send(500, fault(401, "Invalid Action"));
            }
            send(404, "not found", "text/plain");
        });
    });
    await new Promise((r) => web.listen(ports[1], "127.0.0.1", r));
    const sock = createSocket("udp4");
    sock.on("message", (m, from) => {
        const text = m.toString();
        const h = Object.fromEntries(text.split("\r\n").slice(1).filter((l) => l.includes(":")).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).toUpperCase(), l.slice(i + 1).trim()]; }));
        if (!text.startsWith("M-SEARCH * HTTP/1.1\r\n") || h.HOST !== "239.255.255.250:1900" || h.MAN !== '"ssdp:discover"' || !h.MX || !h.ST || !text.endsWith("\r\n\r\n")) return seen.problems.push(`a bad M-SEARCH: ${text}`);
        seen.searches++;
        const say = (st, uuid, location, server) => sock.send(`HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age = 1800\r\nDATE: Sun, 01 Nov 2026 00:00:00 GMT\r\nEXT:\r\nLOCATION: ${location}\r\nSERVER: ${server}\r\nST: ${st}\r\nUSN: uuid:${uuid}::${st}\r\n\r\n`, from.port, from.address);
        const igd = "urn:schemas-upnp-org:device:InternetGatewayDevice:1", render = "urn:schemas-upnp-org:device:MediaRenderer:1";
        if (h.ST === "ssdp:all" || h.ST === igd) say(igd, "11111111-2222-3333-4444-555555555555", `${base}/desc.xml`, "Linux/5.4 UPnP/1.1 Stand-in/1.0");
        if (h.ST === "ssdp:all") { say(render, "aaaaaaaa-0000-0000-0000-000000000001", "http://192.0.2.200/render.xml", "Sonos/1.0 UPnP/1.0"); say(render, "aaaaaaaa-0000-0000-0000-000000000001", "http://192.0.2.200/render.xml", "Sonos/1.0 UPnP/1.0"); }
    });
    await bindUdp(sock, ports[0]);
    return {
        env: { SSDP_TO: `127.0.0.1:${ports[0]}`, SSDP_LISTEN_PORT: String(ports[2]), SSDP_HTTP: base },
        close() { setTimeout(() => sock.close(), 50); web.closeAllConnections?.(); web.close(); },
        check() {
            if (seen.problems.length) return seen.problems[0];
            if (seen.searches === 0) return "no M-SEARCH came";
            if (!seen.soap.includes("GetExternalIPAddress")) return "the SOAP call never came";
            return null;
        },
    };
}
