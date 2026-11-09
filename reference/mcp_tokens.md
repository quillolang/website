# mcp_tokens
mcp_tokens(map | null=) -> list
group: Tools for AI clients

### What it does

The visitor's MCP tokens that are still good, oldest first. Those are the ones
[mcp_token](/docs/reference/mcp_token/) made in this session, and those made for the user
it is signed in as, so a new sign-in, or one after the first cookie has gone, lists them
too. With `{ user }` it lists every token made for that user, whichever session made it.
Each is `{ id, user, made, expires }`: the token's id, which
[revoke_mcp_token](/docs/reference/revoke_mcp_token/) takes, who it is for, and when it
was made and ends, in milliseconds as `now()` gives them. Never the token itself, which
only its holder has.

### Examples

```quillo noexec
route GET /settings/ai/tokens = mcp_tokens()
```

Signed in as `ana` with two tokens, one made with `{ max_age: 3600 }`, the route answers:

```
[{"id":"e657b145d3fc8fe0","user":"ana","made":1794151725793,"expires":1796743725793},
 {"id":"a3b4a2d9db86d934","user":"ana","made":1794151725799,"expires":1794155325799}]
```

Outside a request there is no session, and so no tokens:

```quillo
print(mcp_tokens())
print(mcp_tokens({ user: "ana" }))
```

```output
[]
[]
```

### Edge cases

- A token that was revoked, ended with its session or ran out is not listed.
- A token made in this session for someone else, with `mcp_token({ user })`, is that
  user's: `mcp_tokens({ user: "bob" })` lists it, and `mcp_tokens()` does not.
- A program with no database keeps tokens in memory, so after a restart the list is
  empty; with a database that will not open, `mcp_tokens` fails rather than read memory.

### Errors

An option other than `user` stops the program: `` `mcp_tokens` has no option `who`: it
takes `user` ``. Tokens it could not read (the database failing) stop the request too,
saying so.

```quillo error
print(mcp_tokens({ who: 1 }))
```

```output
line 1: `mcp_tokens` has no option `who`: it takes `user`
```

### Chaining

```quillo noexec
route GET /settings/ai/count = len(mcp_tokens() | filter((t) => t.expires > now() + 86400 * 1000))
```

### See also

[mcp_token](/docs/reference/mcp_token/), [revoke_mcp_token](/docs/reference/revoke_mcp_token/), [end_session](/docs/reference/end_session/), [Tools for AI clients](/docs/mcp/)
