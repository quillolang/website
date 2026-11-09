# confirm
confirm(str) -> bool
group: Tools for AI clients

### What it does

In a tool (`fn mcp`), asks the person at the AI client a yes-or-no question and gives
their answer: `true` when they tick the box, `false` when they send it back unticked. The
call stops at the question: the client is sent a form (MCP's `input_required`), asks the
person, and calls the tool again with the answer, and the function then runs again from
the top, so this time `confirm` gives the answer and the code goes on. A tool therefore
asks before it changes anything. Outside a tool's call (the program's own code, or a page
calling a `server fn mcp`) it gives `true` at once: the page asks in its own way. See
[Tools for AI clients](/docs/mcp/#asking-the-person-first).

### Examples

```quillo noexec
db.open("notes.db")

/// Deletes every note, after asking the person.
fn mcp clear_notes() -> int ! str with db {
    let n = db.one("select count(*) as n from notes").n
    if !confirm(`Delete all ${n} notes?`) { return err("nothing was deleted: the user said no") }
    db.exec("delete from notes")
    n
}
```

The first call of `clear_notes` reads the count and stops at `confirm`: the client is
sent a form with one box, titled `Delete all 2 notes?` and unticked. Ticked and sent
back, the tool runs again, `confirm` is `true`, and the client gets `2`. Left unticked,
the model gets the tool's own error, `nothing was deleted: the user said no`, and
nothing is deleted.

Outside a tool's call there is no one to ask, so it is `true`:

```quillo
print(confirm("Delete all notes?"))
```

```output
true
```

### Edge cases

- The person can also decline the form or dismiss it: either is a no, `false`, as an
  unticked box is.
- A client that cannot ask (it does not say it can show a form): `confirm` refuses, and
  the call ends with an `isError` saying `this needs the user's yes, and this client
  cannot ask`. Nothing after it runs. `ask` takes its default there instead.
- Ask first. `quillo check` refuses a tool that it sees change something before a
  question (`` `confirm` comes after `db.exec`: ask before changing anything: the call runs
  again with the answer ``). As it runs, a question after any change (a database write, a
  file, a request out, a cookie or the session, the program's variables, a plugin, a
  service) is refused and the call stops: the model is told `internal error`, the message
  is in the log, and the change stands. `??` does not turn these refusals into a value.
- The answer comes back in a state Quillo signs: good for 10 minutes, once, for the same
  caller, tool and arguments. Anything else is refused (`-32602`) and the call starts
  over.
- A call asks at most 100 questions or rounds. A question whose text has `now()`,
  `random()` or `uuid()` in it is a new one each round, and ends the call there. The same
  text asked in two places in the code is two questions.
- A tool that asks and only reads stays read-only. A round that carries the answer to the
  question its state waits on does not count toward the caller's 60 tool calls a minute.
- In a call that may ask, `parallel` runs its functions one after another, so that a
  question is never answered by nobody.
- A service function a tool's call reaches asks through the program's door, in the same
  state. `billing.later.f(...)` from a tool has no one to ask: its question is refused
  and the job fails.

### Errors

An empty question stops the program (or the call), as nothing would be asked:

```quillo error
print(confirm(""))
```

```output
line 1: `confirm`'s question is empty: say what the user is asked
```

`quillo check` refuses a question that is not text: `` argument 1 of `confirm` must be
str, got int ``.

### Chaining

It reads as a condition, before the change it guards. Piped, the question is what comes
in:

```quillo
print("Send the newsletter now?" | confirm)
```

```output
true
```

```quillo noexec
/// Puts the newsletter in the outbox for every subscriber.
fn mcp send_newsletter(subject: str) -> int ! str with db {
    let n = db.one("select count(*) as n from subscribers").n
    if !confirm(`Send "${subject}" to ${n} people?`) { return err("not sent: the user said no") }
    db.exec("insert into outbox (subscriber, subject) select id, ? from subscribers", subject)
    n
}
```

### See also

[ask](/docs/reference/ask/), [mcp_token](/docs/reference/mcp_token/), [err](/docs/reference/err/), [Tools for AI clients](/docs/mcp/)
