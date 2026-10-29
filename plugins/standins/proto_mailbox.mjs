// Three messages for the POP3 and IMAP stand-ins: a customer's reply (plain text), an order with
// a PDF attached (multipart/mixed, with text and HTML), and a newsletter. RFC 5322 text, CRLF.
const crlf = (lines) => lines.join("\r\n") + "\r\n";

export function messages() {
    return [
        {
            uid: 101, flags: [], date: "28-Oct-2026 09:12:00 +0000", text: crlf([
                "From: Ada Lovelace <ada@example.com>",
                "To: Support <support@quillo.test>",
                "Subject: Re: Your order #1042",
                "Date: Wed, 28 Oct 2026 09:12:00 +0000",
                "Message-ID: <reply-1042@example.com>",
                "In-Reply-To: <order-1042@quillo.test>",
                "Content-Type: text/plain; charset=utf-8",
                "",
                "Thanks! Could you deliver it on Friday instead?",
                ". and please ring the bell twice.",
                "",
                "Ada",
            ]),
        },
        {
            uid: 102, flags: ["\\Seen"], date: "29-Oct-2026 14:30:00 +0000", text: crlf([
                "From: Billing <billing@supplier.test>",
                "To: Accounts <accounts@quillo.test>",
                "Subject: Invoice INV-2207",
                "Date: Thu, 29 Oct 2026 14:30:00 +0000",
                "Message-ID: <inv-2207@supplier.test>",
                "MIME-Version: 1.0",
                "Content-Type: multipart/mixed; boundary=\"b1\"",
                "",
                "--b1",
                "Content-Type: multipart/alternative; boundary=\"b2\"",
                "",
                "--b2",
                "Content-Type: text/plain; charset=utf-8",
                "",
                "Please find invoice INV-2207 attached: 1,250.00 EUR, due 30 November.",
                "--b2",
                "Content-Type: text/html; charset=utf-8",
                "",
                "<p>Please find invoice <b>INV-2207</b> attached: 1,250.00 EUR, due 30 November.</p>",
                "--b2--",
                "--b1",
                "Content-Type: application/pdf; name=\"INV-2207.pdf\"",
                "Content-Disposition: attachment; filename=\"INV-2207.pdf\"",
                "Content-Transfer-Encoding: base64",
                "",
                "JVBERi0xLjQKJcfsj6IKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoKdHJhaWxlcgo8PC9Sb290IDEgMCBSPj4KJSVFT0YK",
                "--b1--",
            ]),
        },
        {
            uid: 103, flags: [], date: "30-Oct-2026 07:00:00 +0000", text: crlf([
                "From: Grace Hopper <grace@navy.example>",
                "To: Support <support@quillo.test>",
                "Subject: Bug report: the moth is back",
                "Date: Fri, 30 Oct 2026 07:00:00 +0000",
                "Message-ID: <moth@navy.example>",
                "Content-Type: text/plain; charset=utf-8",
                "",
                "Relay 70, panel F. Taped into the log book.",
            ]),
        },
    ];
}
