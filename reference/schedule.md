# schedule
schedule(str | int, fn, map | null=) -> null
group: Jobs and services

### What it does

Runs a function on the server on a timetable: every so often, given as a duration
(seconds, or `"30s"`, `"5m"`, `"1h"`, `"1d"`, `"2w"`, `"1y"`, counted from 1970 in UTC
so that `"5m"` runs at :00, :05, ...), or at the times of a cron line (`minute hour
day month weekday`, in UTC, with `*`, `1-5`, `*/15` and lists, or `@hourly`, `@daily`,
`@weekly`, `@monthly`, `@yearly`). Written at the top of a program, which `quillo run`
then serves. A job is named after its function, or by `{ name }`; no two alike. It
gives null. See [Scheduled jobs](/docs/operations/#scheduled-jobs).

### Examples

```quillo noexec
fn clean_sessions() = db.exec("delete from sessions where expires < ?", now())
fn nightly_report() { for t in db.tenants() { with_tenant(t, report) } }

schedule("5m", clean_sessions)                  // every 5 minutes, on the clock
schedule("0 3 * * *", nightly_report)           // cron: 03:00 UTC
schedule("@daily", () => db.exec("delete from tokens where expires < ?", now()), { name: "expire-tokens" })
schedule(60, ping, { name: "ping-minute" })      // seconds
```

### Edge cases

- A job first seen (at start, or after a reload) waits for its next time; it never
  runs at once. The clock is looked at once a second.
- A job runs like a request: waiting on the database holds up no request, its errors
  are printed, and it is logged (`POST /_quillo/job/clean_sessions?at=... -> 200`). One
  still running when it is due again is skipped that time.
- Names are letters, digits, `_`, `-` and `.`, at most 64: a lambda is `job-<line>`
  unless `{ name }` says, and the same function twice needs a name for the second.
- Weekdays in a cron line are numbers 0 to 7 (0 and 7 are Sunday), not names: `"0 9 *
  * 1-5"`, not `mon-fri`. A duration must be more than 0.
- Several servers on one database run each job once per due time; with a database per
  tenant, each server runs its jobs, and the job loops over the tenants with
  `with_tenant`. `--no-jobs` turns them off on a server.
- A program with a `schedule` in it is a server: `quillo run` serves it and keeps
  running, which is why the examples here are not run.

### Errors

A first argument that is neither a duration nor a cron line (a wrong unit, 0, a cron
line without 5 fields, a field out of range, an unknown `@name`), a second that is not
a function, a bad or repeated name, and options that are not a map are runtime errors
when the program loads, not error values.

```quillo error
schedule("soon", () => 1)
```

```output
line 1: `schedule` takes a duration such as "5m" or a cron line such as "0 3 * * *", got "soon"
```

```quillo error
schedule("0 9 * * mon-fri", () => 1)
```

```output
line 1: `schedule`: the weekday field "mon-fri" is not a number from 0 to 7, a range, a list or a step
```

```quillo error
fn clean() = 1
schedule("5m", clean)
schedule("1h", clean)
```

```output
line 3: `schedule`: there is already a job named "clean"; give this one another with { name: ... }
```

### Chaining

A job's function takes no arguments; give it what it needs by closing over it, and
keep the work in a named function so the log names it:

```quillo noexec
fn remind(days: int) = () => db.query("select * from invoices where due < ?", now() + days * 86400000) | map(send_reminder)

schedule("@daily", remind(3), { name: "remind-3d" })
schedule("@daily", remind(7), { name: "remind-7d" })
```

### See also

[every](/docs/reference/every/), [with_tenant](/docs/reference/with_tenant/), [db.tenants](/docs/reference/db.tenants/), [sleep](/docs/reference/sleep/), [ready](/docs/reference/ready/)
