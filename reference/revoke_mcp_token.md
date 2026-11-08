# revoke_mcp_token
revoke_mcp_token(str, map | null=) -> bool
group: Tools for AI clients

### What it does

Ends an MCP token by its id, as [mcp_tokens](/docs/reference/mcp_tokens/) gives it: from
then on a call that carries it is a `401`. It looks among the session's tokens, as
`mcp_tokens()` finds them, or with `{ user }` among all of that user's, which also reaches a
token a session made for someone else. It gives whether there was one: `true` when a
token ended, `false` for an id it did not find (ended already, another user's, made up).

### Examples

```quillo noexec
route POST /settings/ai/revoke { form: { id: str } } {
    revoke_mcp_token(id)
    redirect("/settings/ai")
}
```

A token's id is not the token: a page can show ids, and a button to end each, without
showing anything an AI client could use.

Outside a request there is no session, so nothing is found:

```quillo
print(revoke_mcp_token("a111085996bb88a1"))
print(revoke_mcp_token("a111085996bb88a1", { user: "ana" }))
```

```output
false
false
```

### Edge cases

- Ending the same id twice gives `true`, then `false`.
- `end_session()` ends every token made in that session for its user; a token made in
  another session of the same user stays until it is revoked, or runs out.
- An administrator's page ends someone else's token with `{ user }`:
  `revoke_mcp_token(id, { user: target })`. Check who is asking before calling it.
- With a database that will not open, it fails rather than look in memory.

### Errors

An id that is not text stops the program, and `quillo check` refuses it first: ``
argument 1 of `revoke_mcp_token` must be str, got int ``.

```quillo error
print(revoke_mcp_token(42))
```

```output
line 1: `revoke_mcp_token` takes a token's id, as `mcp_tokens()` gives it, got int
```

### Chaining

Ending all of a user's tokens, say after a password change:

```quillo noexec
fn end_all_tokens(user: str) = mcp_tokens({ user }) | map((t) => revoke_mcp_token(t.id, { user }))
```

### See also

[mcp_token](/docs/reference/mcp_token/), [mcp_tokens](/docs/reference/mcp_tokens/), [end_session](/docs/reference/end_session/), [Tools for AI clients](/docs/mcp/)
