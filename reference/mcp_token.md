# mcp_token
mcp_token(map | null=) -> str
group: Tools for AI clients

### What it does

Makes a token for the program's MCP door over HTTP, `/_quillo/mcp`, and gives it once. The
person signed in pastes it into their AI client, which sends it with each call as
`Authorization: Bearer <token>`. It is called in a route, where someone is signed in, and
the token is tied to that session: in a tool called with it, `session()` and `tenant()` are
those of the session it was made in, as they were then. It lasts as long as the session
has left when the program gave the session a `max_age`, else 30 days; the option `max_age`
(seconds, or a duration such as `"7d"`) says otherwise, up to a year. The option `user`
names the caller for a program that does not keep it as `session().user`. It ends with
[revoke_mcp_token](/docs/reference/revoke_mcp_token/), or with `end_session()` in the
session that made it. See [Tools for AI clients](/docs/mcp/#over-http-with-a-token).

### Examples

```quillo noexec
/// The caller's notes, newest first.
fn mcp my_notes() -> list with db =
    db.query("select id, text from notes where owner = ? order by id desc", session().user)

route POST /settings/ai/token {
    if session().user == null { reply 401 "Sign in first" }
    let token = mcp_token({ max_age: "7d" })
    <p>Paste this into your AI client. It is shown only now: <code>{token}</code></p>
}
```

The page shows a token such as `qmcp_aa1WdmIllJrQsAomA-gEYfOsTRJcK_jjUZ83ydloPpY`, and a
client that sends it calls `my_notes` as the person who made it. The route is a `POST`, a
button in a form, so that no link or prefetch makes a token.

Outside a request there is no session to tie a token to:

```quillo error
print(mcp_token())
```

```output
line 1: `mcp_token` is made while a request is answered, where someone is signed in: the token stands for that session
```

### Edge cases

- Quillo keeps only the token's signature, under the session key (`QUILLO_SECRET`), in a
  table of the program's database, `_quillo_mcp_tokens`, which the first `mcp_token()`
  makes; it fails, saying so, where the database user may not create one. A row changed
  in the database is no token.
- A program with no database keeps its tokens in that process's memory: at most 100 a user
  and 10,000 in all (`mcp_token()` is refused past either), lost at a restart and unknown
  to other processes, so run such a program as one process.
- A database the program has that will not open is an error, never memory: `mcp_token`
  fails, and a call with a token is a `503`.
- A `max_age` over a year is cut to a year (366 days). One that is not a positive number
  of seconds or a duration is an error.
- A session cookie made before this version of Quillo does not say whether it was given a
  `max_age`, so a token made from it lasts 30 days.
- A token's calls count toward its user's 60 tool calls a minute, with their cookie's,
  per tenant. Cookies a tool sets in a call made with a token are dropped.
- `quillo run --watch` on 127.0.0.1 prints a token of its own for trying the door, with the
  line that adds it to Claude Code; its calls have no one signed in.

### Errors

Each of these stops the request, with its message in the log:

- outside a request: `` `mcp_token` is made while a request is answered, where someone is
  signed in: the token stands for that session ``;
- no one signed in: `` `mcp_token`: no one is signed in (`session().user` is null): sign in
  first, or say who it is for with `{ user: ... }` ``;
- `{ user }` with no session at all: `` `mcp_token`: there is no session to tie the token
  to: `set_session` first ``;
- in a tool's call: `` `mcp_token` is not for a tool: a token is made where the user is
  signed in, on a page of the program's, and pasted into the AI client ``;
- in a program with no tools: `` `mcp_token`: this program has no tools (`fn mcp
  name(...)`), so there is no door to make a token for ``.

### Chaining

A settings page usually makes one, lists them with `mcp_tokens()`, and ends one with
`revoke_mcp_token`:

```quillo noexec
route GET /settings/ai {
    if session().user == null { reply 401 "Sign in first" }
    <div>
        <form method="post" action="/settings/ai/token"><button>Make a token</button></form>
        <ul>{for t in mcp_tokens() =>
            <li key={t.id}>Good until {date.format(date.from_ms(t.expires), "YYYY-MM-DD")}
                <form method="post" action="/settings/ai/revoke">
                    <input type="hidden" name="id" value={t.id}/><button>End it</button>
                </form>
            </li>}</ul>
    </div>
}

route POST /settings/ai/revoke { form: { id: str } } {
    revoke_mcp_token(id)
    redirect("/settings/ai")
}
```

### See also

[mcp_tokens](/docs/reference/mcp_tokens/), [revoke_mcp_token](/docs/reference/revoke_mcp_token/), [end_session](/docs/reference/end_session/), [session](/docs/reference/session/), [Tools for AI clients](/docs/mcp/)
