# about
about(str, map, str | null) -> str | null
group: Tools for AI clients

### What it does

In a tool (`fn mcp`), asks the person at the AI client to pick one of `choices`, a map from
a key to the text they see, and gives the key they picked. `default` is one of the keys, or
`null` for none, and is always written. The call stops at the question as at
[confirm](/docs/reference/confirm/): the client is sent a form with the choices, asks the
person, and calls the tool again with the answer, and the function runs again from the top,
this time getting the key. A client that cannot ask gets `default`, and the tool's result
says so, so the model can tell the person. Outside a tool's call (the program's own code, or
a page calling a `server fn mcp`) it gives `default` at once. See [Tools for AI
clients](/docs/mcp/#asking-the-person-first).

### Examples

```quillo noexec
/// Publishes a post. It is public at once.
fn mcp publish_post(title: str, body: str) -> int with db {
    let who = about("Who can see it?", { public: "Everyone", draft: "Only me, as a draft" }, "draft")
    if !confirm(`Publish "${title}" now?`) { return err("not published: the user said no") }
    db.one("insert into posts (title, body, draft) values (?, ?, ?) returning id", title, body, who == "draft").id
}
```

The client shows `Who can see it?` with the two texts, `Only me, as a draft` chosen to
start; then the box `Publish "..." now?`. With a client that cannot show a form, `about`
takes the default, and a tool that goes on to its answer adds the line `the user was not
asked "Who can see it?": the default "Only me, as a draft" was taken` to its result; this
one stops at `confirm` instead, which needs a yes (`this needs the user's yes, and this
client cannot ask`). Outside a tool's call the default is the answer:

```quillo
print(about("Who can see it?", { public: "Everyone", draft: "Only me, as a draft" }, "draft"))
print(about("Which colour?", { red: "Red", blue: "Blue" }, null))
```

```output
draft
null
```

### Edge cases

- `default` is one of the choices' keys, or `null` for none (then nothing is picked to
  start, and a client that cannot ask gets `null`). `quillo check` refuses a default that is
  not a key and choices that are empty, and the call stops on them as it runs.
- A person who declines or dismisses the question ends the call, with an `isError` saying
  so (`the user declined to answer: Who can see it?`).
- It never asks for free text, only for a choice, as MCP forbids asking for passwords, keys
  or payment details in a form.
- Ask first. A tool asks before it changes anything, as with `confirm`; the same rules hold:
  the signed state (10 minutes, once, for the same caller, tool and arguments), at most 100
  questions or rounds in a call, a question after a change refused.
- A question the checker does not see a tool ask, as in a function given to a builtin (a
  `locale_from` or `tenant_from` rule), is refused as it runs and the call stops: no one was
  asked, so no default is given.
- A component cannot use it: a page asks its visitor with [ask](/docs/reference/ask/), the
  page's dialog. `ask` with three arguments is an error that names `about`.
- A program's own function named `about` is warned of, as any that hides a builtin, and its
  own is used.

### See also

[confirm](/docs/reference/confirm/), [ask](/docs/reference/ask/), [mcp_token](/docs/reference/mcp_token/), [Tools for AI clients](/docs/mcp/)
