# Jump start

The whole picture first: one complete Quillo app, every part of it shown and explained,
before the guide takes each part on its own.

The app is a bookshelf, in five files. The home page lists books and has a form to add
one. Each book has five stars you can click; the rating is saved without a page reload,
and five stars throw confetti. A chart shows how the books are rated. An admin area
behind a password deletes books.

It uses the parts most apps need: [routes](/docs/routes/) for `GET`, `POST` and
`/`, a [route group](/docs/routes/#route-groups) with middleware, `use` and `import` to
[split the program into files](/docs/standard-library/#files-of-a-program), a
[`view`](/docs/language-tour/#variables-functions-views) and two
[components](/docs/components/), [HTML](/docs/language-tour/#html-literals) written in the
code, [CSS](/docs/components/#styling-a-component) in a file and in a component, SQL on a
[SQLite database](/docs/standard-library/#database), and three browser libraries loaded
with [`client`, `preload` and `preconnect`](/docs/components/#javascript-libraries).

Each file is shown whole, then explained line by line. Every word that has its own page
in the docs links to it.

### The files

```text
bookshelf/
├── main.qwe        the program: what it takes from the other files, the database, the routes
├── lib/
│   └── books.qwe   the data: a SQLite table and the SQL that reads and writes it
└── ui/
    ├── page.qwe    the frame every page is drawn in: a view
    ├── page.css    that frame's CSS
    └── shelf.qwe   what runs in the browser: two components and the libraries they call
```

### Run it

Put the five files in a folder, then:

```sh
quillo check main.qwe
ADMIN_PASSWORD=choose-one quillo run main.qwe --watch
```

[`quillo check`](/docs/checking/) reads the program and every file it uses, and says
`main.qwe: ok (6 routes, 8 functions, 2 components, in 4 files)`. `quillo run` starts it
on [http://localhost:8080](http://localhost:8080); [`--watch`](/docs/#options-of-quillo-run)
starts it again when a file changes. The admin pages are at `/admin`, with the password
you chose. Instead of typing it each time, put `ADMIN_PASSWORD=...` in a `.env` file
beside `main.qwe`, which Quillo reads as it starts (see
[Settings and the environment](/docs/#settings-and-the-environment)).

### main.qwe

The main file is the one `quillo run` is given. It takes what it needs from the other
files, opens the database, and declares the routes: which address answers what.

{{source jump-start/main.qwe}}

Line by line:

- `// main.qwe: the program. ...` is a comment: `//` to the end of the line is for people,
  and Quillo skips it.
- `use lib/books` brings `lib/books.qwe` into the program and takes every public name it
  defines: `create_tables`, `all_books`, `add_book`, `remove_book`, `star_counts` and
  `rate`. A path may leave out `.qwe`, and paths are from this file's folder. See
  [Files of a program](/docs/standard-library/#files-of-a-program).
- `import ui/page use Page` takes only `Page` from `ui/page.qwe`. The file comes first and
  the names after `use`, so the editor can offer the file's names as you type them. A
  name this file did not take is a warning (see
  [What a file sees](/docs/structure/#what-a-file-sees)).
- `import ui/shelf use Stars, Ratings` takes the two components. Several names are
  separated by commas.
- `db.open("books.db")` opens the database: a SQLite file next to `main.qwe`, made on the
  first run. A `postgres://` or `mysql://` address here would use that server instead,
  with the same functions (see [Database](/docs/standard-library/#database)).
- `create_tables()` calls a function from `lib/books.qwe`. Lines outside any function run
  once, in order, as the program starts, so the table exists before the first request.
- `route GET / {` declares a [route](/docs/routes/): the method `GET` (a browser opening
  the address) and the path `/` (the site's home page). The `{` starts a block body: its
  lines run for each request, and its last expression is the answer.
- `let books = all_books()` reads every book once for this request. `let` names a value
  (see [Variables, functions, views](/docs/language-tour/#variables-functions-views)).
  `all_books()` gives a list of maps, one per row: `{ id, title, author, stars }`.
- `<Page title="Bookshelf">` starts the answer, written as
  [HTML](/docs/language-tour/#html-literals) in the code. A tag with a capital letter is a
  view or a component: here the `Page` view, given `title` as an attribute. What is
  written between `<Page>` and `</Page>` is passed to it as `children`.
- `<h1>My bookshelf</h1>` is plain HTML, written as it is sent.
- `<Ratings counts={star_counts(books)}/>` shows the chart component. `{...}` in an
  attribute gives it a value from the code: here the list of how many books have 1 to 5
  stars. A tag with nothing inside ends with `/>`, as in JSX.
- `<ul>` and its `</ul>` hold the list of books.
- `{for b in books =>` makes one item per book: [`for ... =>`](/docs/language-tour/#control-flow)
  gives a list, and a list of markup shows each element in turn.
- `<li><b>{b.title}</b> by {b.author} <Stars id={b.id} stars={b.stars}/></li>}` is one
  book: its title and author, put in as text (a `<` in a title shows as `<`, never as a
  tag), and a `Stars` component given the book's id and rating. The `}` closes the `for`.
- `<form method="post" action="/books">` is an HTML form. When it is sent, the browser
  posts its fields to `/books`; no JavaScript is involved.
- `<input name="title" placeholder="Title" required/>` and the `author` line are the
  fields. Their `name` is the field's name in the request, and `required` makes the
  browser ask for a value before it sends the form.
- `<button>Add</button>` sends the form. `</form>`, `</Page>` and `}` close the form, the
  view and the route.
- `route POST /books { form: { title: str, author: str } } {` answers the form. `POST` is
  the method a form with `method="post"` uses. `{ form: { title: str, author: str } }` is
  a request pattern: the route matches only when the form has a `title` and an `author`,
  and each becomes a variable of that name. A request without them gets a 400 (see
  [Routes](/docs/routes/)).
- `if trim(title) == "" || trim(author) == "" { reply 400 "..." }`: a title of spaces
  passes the pattern, so the route checks for one. [`trim`](/docs/reference/trim/) takes
  the spaces off both ends, `||` is "or", and `reply 400 "..."` ends the request at once
  with that status and text (see [What a route returns](/docs/routes/#what-a-route-returns)).
- `add_book(trim(title), trim(author))` saves the book.
- `redirect("/")` sends the browser back to the home page with a 303, so reloading the
  page does not post the form again.
- `route GET /login =` declares a route whose answer is one expression, after `=`, rather
  than a block.
- The lines under it, `<Page title="Sign in">` to `</Page>`, are the sign-in page: a form
  with a password field (`type="password"` hides what is typed) that posts to `/login`.
- `route POST /login { form: { password: str } } {` takes that form's `password`.
- `let wanted = env("ADMIN_PASSWORD") ?? reply 503 "Set ADMIN_PASSWORD first"` reads the
  password from the environment. [`env`](/docs/reference/env/) gives `null` when the
  variable is not set, and [`??`](/docs/language-tour/#errors) then takes its right side,
  which answers 503 rather than letting anyone in with an empty password.
- `if !crypto.equal(password, wanted) { reply 401 "Wrong password" }` compares the two.
  [`crypto.equal`](/docs/reference/crypto.equal/) takes the same time wherever they
  differ, so the time an answer takes does not tell an attacker how much of a guess was
  right. `!` is "not".
- `set_session({ admin: true })` remembers that this visitor signed in.
  [`set_session`](/docs/reference/set_session/) sends the map in a cookie signed by the
  server, which the browser cannot change. Set `QUILLO_SECRET` so that sessions outlive a
  restart (see [Cookies and sessions](/docs/routes/#cookies-and-sessions)).
- `redirect("/admin")` takes the visitor to the admin page.
- `fn admin_only(r) = session().admin == true ? r : redirect("/login")` is a middleware: a
  function given the request before a route runs. [`session()`](/docs/reference/session/)
  is the map `set_session` stored, or `{}`. `a ? b : c` is `b` when `a` is true, else `c`.
  Giving back the request `r` lets the route go on; giving back a response, here a
  redirect to the sign-in page, answers in the route's place.
- `routes /admin | admin_only {` starts a [route group](/docs/routes/#route-groups): every
  route inside it has `/admin` before its own path, and `admin_only` runs before each
  one. More in the [Route groups](/docs/route-groups/) guide.
- `route GET / =` inside the group is `GET /admin`.
- `<h1>Remove books</h1>`, then `{for b in all_books() =>` makes one form per book.
- ``<form method="post" action={`/admin/books/${b.id}/delete`}>`` posts to that book's own
  address. A string between backticks is a template: `${...}` puts a value into it.
- `{b.title} <button>Delete</button>` shows the title and the button that sends the form;
  `</form>}` closes it and the `for`, and `</Page>` the page.
- `route POST /books/:id(int)/delete {` is `POST /admin/books/7/delete` and the like.
  `:id` is a path parameter, a variable named `id`, and `(int)` makes the route match only
  whole numbers, so `id` is an int.
- `remove_book(id)` deletes the row, and `redirect("/admin")` shows the list again. The
  two `}` close the route and the group.

A form on another site cannot post to these routes: Quillo refuses a form post the
browser marks as coming from another site with 403, before any route runs (see
[`allow_cross_site`](/docs/reference/allow_cross_site/) for the routes that need one).

### lib/books.qwe

Everything that touches the database is in one file, so the routes read as what the site
does, and the SQL is in one place.

{{source jump-start/lib/books.qwe}}

Line by line:

- `fn create_tables() with db =` defines a function. `with db` says what it may do
  besides compute a value: use the database, and nothing else, such as files or the
  network. `quillo check` holds it to that (see [Effects](/docs/language-tour/#effects)).
  After `=` comes its body, one expression.
- `` db.exec(sql`create table if not exists books ( `` runs a statement that gives no
  rows. [`db.exec`](/docs/reference/db.exec/) gives `{ changes, last_id }`. The
  [`sql`](/docs/reference/sql/) before the backticks marks the text as SQL, so editors
  colour it as SQL; the text itself is unchanged. `if not exists` makes the statement do
  nothing when the table is already there, so it can run at every start.
- `id integer primary key,` is the row's number, which SQLite gives each new row.
- `title text not null,` and `author text not null,` are the two texts a book needs.
- `stars integer not null default 0` is the rating, 0 until someone clicks.
- `` )`) `` closes the table's columns, the template and the call.
- `fn all_books() with db = db.query(...)`: [`db.query`](/docs/reference/db.query/) runs a
  `select` and gives a list of maps, one per row, with the columns as keys. `order by id
  desc` puts the newest book first.
- `fn add_book(title: str, author: str) with db =` takes two texts; `: str` is a type,
  checked on each call and by `quillo check`.
- `` db.exec(sql`insert into books (title, author) values (?, ?)`, title, author) `` adds a
  row. Each `?` is filled by the values after the SQL, in order, and the database keeps
  them apart from the SQL, so a title with a quote in it is stored as written and cannot
  change the statement. Build SQL with `${...}` and `quillo check` warns.
- `fn remove_book(id: int) with db = db.exec(sql`delete ...`, id)` deletes a book by id.
- `fn star_counts(books: list) = for s in range(1, 6) => count(books, (b) => b.stars == s)`
  counts the books for each rating. [`range(1, 6)`](/docs/reference/range/) is
  `[1, 2, 3, 4, 5]` (the end is left out), [`count`](/docs/reference/count/) gives how
  many items the function says yes to, and `(b) => ...` is a function written in place.
  It needs no `with`: it only computes.
- `server fn rate(id: int, stars: int) -> int ! str with db {` is a
  [server function](/docs/components/#server-functions): a function the browser can call.
  A component calls it by name, and the call is a request to the server. The types are
  checked on every call, so a call with text for `id` is refused before the body runs.
  `-> int ! str` says what it gives back: an int, or an error that carries text.
- `if stars < 1 || stars > 5 { return err("from 1 to 5 stars") }`: anyone can call a
  server function with any numbers, not only the page's buttons, so it checks.
  [`err`](/docs/reference/err/) makes an error value and `return` gives it back at once.
- `` db.exec(sql`update books set stars = ? where id = ?`, stars, id)? `` saves the
  rating. `?` after a call passes an error on: when the database fails, `rate` gives that
  error back (see [Errors](/docs/language-tour/#errors)).
- `stars` is the last expression, so it is what `rate` gives back. `}` ends it.

### ui/page.qwe

Every page of the app is drawn in the same frame: the `<html>`, the `<head>`, a bar of
links, and the page's own content in the middle.

{{source jump-start/ui/page.qwe}}

Line by line:

- `let page_css = read_file("ui/page.css")` reads the CSS file into a variable once, as
  the program starts. [`read_file`](/docs/reference/read_file/) takes a path from the
  program's folder (where `main.qwe` is), not from this file's.
- `view Page(title: str, children) {` defines a [view](/docs/language-tour/#variables-functions-views):
  a function that gives markup, used as a tag (`<Page title="...">`). Its name starts
  with a capital letter. `children` is what the tag has inside it. A view has no state,
  and a page made of views only loads no JavaScript.
- `style global page_css` gives the view its CSS. `style` goes at the start of the body,
  and its rules are sent in a stylesheet of their own, `/_quillo/s/<hash>.css`, which the
  page links to. `global` sends the rules as written: they style the whole page, the
  `<form>`s the routes put inside `<main>` included. Without `global`, they would apply
  only to the elements this view writes (see
  [Styling a component](/docs/components/#styling-a-component)).
- `<html lang="en">` starts the document. A route whose answer starts with `<html>` is
  sent as a web page, with `<!doctype html>` before it.
- `<head>` holds what the browser reads before it shows the page. Quillo adds the
  stylesheet's link at its end, and the `preload` and `preconnect` links from
  `ui/shelf.qwe` on the pages that need them.
- `<meta charset="utf-8"/>` and `<meta name="viewport" .../>` are the usual two: the
  text's encoding, and the page's width on a phone.
- `<title>{title}</title>` is the browser tab's title. `{title}` puts in the view's
  `title`, as text.
- `</head>` ends the head, and `<body>` starts what is shown.
- `<nav><a href="/">Bookshelf</a> <a href="/admin">Admin</a></nav>` is the bar of links
  at the top. Quillo fetches a page a moment before a link to it is clicked (see
  [Prefetching](/docs/prefetching/)).
- `<main>{children}</main>` is where each page's own content goes: what was written
  between `<Page ...>` and `</Page>`.
- `</body>`, `</html>` and `}` end the document and the view.

### ui/page.css

Plain CSS, in a file of its own so that an editor treats it as CSS. `ui/page.qwe` reads
it and sends it with `style global`.

{{source jump-start/ui/page.css}}

Line by line:

- `body { ... }` sets the page's margin, font and text colour.
- `nav { ... }` lays the bar of links out in a row, with a background.
- `nav a { ... }` makes those links bold, in the text's colour, without an underline.
- `main { ... }` keeps the content in a column 640 pixels wide, in the middle.
- `form { ... }` puts each form's fields and button side by side.

### ui/shelf.qwe

The parts of the page that run in the browser: the stars and the chart, and the three
JavaScript libraries they use.

{{source jump-start/ui/shelf.qwe}}

Line by line:

- `preload "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" use Chart`
  names a browser library. A line that starts with `client`, `preload` or `preconnect` is
  a script for the browser, given by its address, and `use Chart` is the name the script
  defines (as Chart.js's own documentation calls it). `preload` puts
  `<link rel="preload" as="script">` in the page's `<head>`, so the browser fetches the
  script with the page: the chart is drawn as soon as the page opens. The script goes only
  into pages that show `Ratings` (see [JavaScript libraries](/docs/components/#javascript-libraries)).
- `client "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"`
  and `use confetti` on the next line name the confetti library. `client` loads it
  without hurrying: when the browser has nothing else to do, or at the first touch of a
  component that uses it, which is early enough for something only a click needs. A long
  address may leave its `use` to the next line.
- `preconnect "https://unpkg.com/dayjs@1.11.13/dayjs.min.js" use dayjs` names Day.js,
  which formats the time a rating was saved. It loads as `client` does, and `preconnect`
  also puts `<link rel="preconnect" href="https://unpkg.com">` in the `<head>`, so the
  connection to that second host is open before a click needs the script. Pin each
  address to a version (`@1.11.13`), so the script never changes under the page.
- `import lib/books use rate` takes the server function `rate`. A component calls it like
  any function; the call goes to the server.
- `component Stars(id: int, stars: int) {` defines a [component](/docs/components/): a
  view with state. The server draws it into the page like a view, inside a
  `<quillo-island>` element that carries its values, and the browser picks it up from
  there, so it answers clicks without the page being drawn again.
- `` style css` `` to the closing `` ` `` is the component's own CSS.
  [`css`](/docs/reference/css/) before the backticks marks the text as CSS for editors.
  Without `global`, the rules are made to need the component's attribute
  (`button[data-q-2ef68b9f]`), so they style the stars and not the page's other buttons.
- `button { ... }` is how a star looks: no border or background, large, grey.
- `.on { color: #e8a317; }` is a lit star: gold.
- `state n = stars` is the component's [state](/docs/components/): set once from the
  `stars` it was given, and when the code assigns `n` a new value, what shows `n` is drawn
  again.
- `state saved = null` is the time of the last saved rating, none at first.
- `<span>` holds the stars.
- `{for s in range(1, 6) =>` makes five buttons, `s` from 1 to 5.
- ``<button class={s <= n && "on"} title={`${s} of 5`} onclick={() => {`` is one star.
  `s <= n && "on"` is `"on"` for the stars up to the rating and `false` for the rest, and
  a `false` class is no class. `title` is the text shown on hover. `onclick` is the
  function the browser runs when the star is clicked.
- `n = rate(id, s) ?? n` calls the server to save the rating, and shows what it gave back.
  If the call failed, `??` keeps the old value.
- `saved = dayjs().format("HH:mm")` calls Day.js as JavaScript would: the time on the
  visitor's own clock, such as `14:05`.
- `if s == 5 { confetti({ particleCount: 80 }) }` throws confetti for five stars. The map
  is passed to the library as a JavaScript object.
- `}}>★</button>}` closes the click function, the attribute, the button and the `for`.
- `{saved && <small>saved at {saved}</small>}` shows "saved at 14:05" once there is a
  time, and nothing before.
- `</span>` and `}` close the stars and the component.
- `component Ratings(counts: list) {` is the chart, given the five counts.
- `<canvas height="120" onmount={(el) => {` is the element Chart.js draws in. `onmount`
  runs in the browser once the canvas is on the page, given the element itself. It does
  not run on the server, where there is no Chart.js.
- `let chart = Chart.new(el, {` makes a chart: `Chart.new(...)` is JavaScript's
  `new Chart(...)`.
- `type: "bar",` and the `data:` line are Chart.js's own settings: bars, five labels,
  and the counts.
- `})` closes the settings and the call.
- `() => chart.destroy()`: a function that `onmount` gives back runs when the element
  leaves the page, which frees the chart.
- `}}></canvas>` and `}` close the function, the canvas and the component.

The chart is drawn from the counts the page was sent, so a new rating shows in it at the
next visit; [Live data](/docs/components/#live-data) is how a component follows changes
as they happen.

### What the browser gets

The home page's `<head>` ends with what Quillo added for `ui/shelf.qwe` and the two
styles:

```html
<link rel="preload" as="script" href="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js">
<link rel="preconnect" href="https://unpkg.com">
<link rel="stylesheet" href="/_quillo/s/25983b01326f3815.css">
```

Each `Stars` is sent drawn, inside the island that lets the browser pick it up:

```html
<quillo-island style="display:contents" data-c="Stars" data-p="{&quot;id&quot;:2,&quot;stars&quot;:0}" data-s="{&quot;n&quot;:0,&quot;saved&quot;:null}">
  <span data-q-2ef68b9f="true"><button title="1 of 5" data-q-2ef68b9f="true">★</button>...</span>
</quillo-island>
```

And the stylesheet holds both styles: the stars' rules, scoped to their attribute, and
the page's, as written:

```css
button[data-q-2ef68b9f] { border: 0; background: none; font-size: 20px; color: #bbb; cursor: pointer; }
.on[data-q-2ef68b9f] { color: #e8a317; }

body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #222; }
nav { display: flex; gap: 16px; padding: 12px 24px; background: #f4f1ea; }
```

The sheet's name comes from what is in it, so the browser keeps it until the CSS changes.

### Where each word is explained

| Word | In this app | Explained in |
|---|---|---|
| `route` | `route GET / { ... }` | [Routes](/docs/routes/) |
| `GET`, `POST` | the methods: open a page, send a form | [Routes](/docs/routes/) |
| `/` | the home page's path; `/admin`, `/books/:id(int)/delete` | [Routes](/docs/routes/) |
| `routes` | the `/admin` group and its middleware | [Route groups](/docs/routes/#route-groups), [the guide](/docs/route-groups/) |
| `use` | `use lib/books` | [Files of a program](/docs/standard-library/#files-of-a-program) |
| `import` | `import ui/page use Page` | [What a file sees](/docs/structure/#what-a-file-sees) |
| `client` | the confetti library | [JavaScript libraries](/docs/components/#javascript-libraries) |
| `preload` | Chart.js | [JavaScript libraries](/docs/components/#javascript-libraries) |
| `preconnect` | Day.js | [JavaScript libraries](/docs/components/#javascript-libraries) |
| HTML | `<html>`, `<form>`, `<li>`: markup in the code | [HTML literals](/docs/language-tour/#html-literals) |
| `view` | `Page` | [Variables, functions, views](/docs/language-tour/#variables-functions-views) |
| `component` | `Stars`, `Ratings` | [Components](/docs/components/) |
| `state` | the rating shown, the time it was saved | [Components](/docs/components/), [Reactivity](/docs/reactivity/) |
| `style`, `style global` | `Stars`' CSS, the page's CSS | [Styling a component](/docs/components/#styling-a-component) |
| CSS | `ui/page.css`, `` css`...` `` | [`css`](/docs/reference/css/), [Styling a component](/docs/components/#styling-a-component) |
| SQL | `` sql`select ...` `` | [`sql`](/docs/reference/sql/), [Database](/docs/standard-library/#database) |
| `db.open`, `db.exec`, `db.query` | the database | [`db.open`](/docs/reference/db.open/), [`db.exec`](/docs/reference/db.exec/), [`db.query`](/docs/reference/db.query/) |
| `server fn` | `rate` | [Server functions](/docs/components/#server-functions) |
| `with db` | the functions of `lib/books.qwe` | [Effects](/docs/language-tour/#effects) |
| `reply` | `reply 400 "..."` | [What a route returns](/docs/routes/#what-a-route-returns) |
| `err`, `?`, `??` | `rate`'s check, `env(...) ?? reply 503` | [`err`](/docs/reference/err/), [Errors](/docs/language-tour/#errors) |
| `redirect` | after each form | [`redirect`](/docs/reference/redirect/) |
| `session`, `set_session` | signing in | [`session`](/docs/reference/session/), [`set_session`](/docs/reference/set_session/), [Cookies and sessions](/docs/routes/#cookies-and-sessions) |
| `env`, `crypto.equal` | the admin password | [`env`](/docs/reference/env/), [`crypto.equal`](/docs/reference/crypto.equal/) |
| `read_file` | reading `ui/page.css` | [`read_file`](/docs/reference/read_file/) |
| `trim`, `range`, `count` | small helpers | [`trim`](/docs/reference/trim/), [`range`](/docs/reference/range/), [`count`](/docs/reference/count/) |
| `quillo check`, `quillo run` | checking and running it | [Checking](/docs/checking/), [Options of `quillo run`](/docs/#options-of-quillo-run) |

From here, the [Introduction](/docs/) covers installing and the commands, the
[Language tour](/docs/language-tour/) the language, and [Structuring a program](/docs/structure/)
how a larger program is split into files.
