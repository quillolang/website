# Installable apps, offline pages and notifications

A web app people keep is three things more than a site: it installs, with an icon and a
window of its own; its pages open with no network; and it can tell someone something
while the page is closed. Elsewhere that is a manifest written by hand, icons in five
sizes, a service worker in JavaScript, a push library, a key to keep and a table of
subscriptions. In Quillo it is a file, a word on a route and two calls, and Quillo writes
the rest: the manifest, the icons, the service worker, the encryption and the keys
*(since 0.8.7)*.

> **Try it on your machine.** Service workers and notifications need a page served over
> HTTPS, or from this machine: open the pages at `http://127.0.0.1:8080` or
> `http://localhost:8080`, in Chrome or Edge, which install apps from their menu. Sending
> a notification needs the internet, as the browser's push service is Google's, Mozilla's
> or Apple's.

### The shop

One program, with an `app.toml` beside it, does all three. Each part is taken apart below.

```toml
# app.toml
name = "Corner Shop"
icon = "icon.png"
theme_color = "#2e7d32"
description = "Groceries in ten minutes."
```

```quillo
// main.qwe: a corner shop that installs, opens offline, and says when an order ships
db.open("shop.db")
db.exec("create table if not exists orders (id integer primary key, customer text not null, item text not null, shipped int not null default 0)")

server fn todays() -> list = [{ name: "Bread", price: 3 }, { name: "Milk", price: 2 }]

component Menu() {
    state items = todays()
    <ul>{for i in items => <li>{i.name}: {i.price}</li>}</ul>
}

route offline GET / = <html><head><title>Corner Shop</title></head><body><h1>Today</h1><Menu/><a href="/orders">Your orders</a></body></html>

// Signing in, to try it: /in/ana. A real shop has a form and a password.
route GET /in/:who {
    set_session({ user: who })
    db.exec("insert into orders (customer, item) values (?, ?)", who, "Bread")
    redirect("/orders")
}

route offline GET /orders {
    let who = session().user
    if who == null {
        return redirect("/")
    }
    let mine = db.query("select id, item, shipped from orders where customer = ?", who)
    <html><head><title>Your orders</title></head><body>
        <h1>Your orders</h1>
        <ul>{for o in mine => <li>{o.item}: {o.shipped == 1 ? "shipped" : "packing"}</li>}</ul>
        <Alerts/>
    </body></html>
}

component Alerts() {
    state on = notification.state()
    <p>
        <button disabled={on == "granted"} @click={() => { on = notification.ask() }}>Tell me when my orders ship</button>
        <button @click={() => { on = str(ship_mine()) }}>Ship mine now</button>
        {on}
    </p>
}

// What the shop's staff page would do: here, for the visitor's own orders, to try it.
server fn ship_mine() -> map {
    let who = session().user
    if who == null {
        return { sent: 0, gone: 0 }
    }
    db.exec("update orders set shipped = 1 where customer = ?", who)
    notification.send(who, { title: "Shipped", body: "Your bread is on its way", url: "/orders", tag: "shipped" })
}
```

```sh
echo "QUILLO_SECRET=$(openssl rand -hex 32)" > .env     # the key that signs sessions and pushes
quillo run main.qwe
```

Open `http://127.0.0.1:8080/in/ana`. The page is your orders; the menu is at `/`.

### An app people can install

The `app.toml` is all it takes. With it, Quillo serves `/manifest.webmanifest`, makes the
icons from `icon` (192 and 512 pixels, a maskable 512 for Android's shapes, and Apple's
180 at `/apple-touch-icon.png`), and puts three tags at the end of each page's head:

```html
<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#2e7d32"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

Chrome and Edge then offer **Install Corner Shop** in their menu, and the app opens in a
window of its own, with the theme colour as its title bar. Safari's **Add to Dock** (on a
Mac) and **Add to Home Screen** (on an iPhone) take the same name and icon. No service
worker is needed for that.

- **The keys**: `name` (1 to 30 characters), `icon` (PNG, JPEG or WebP, 512 × 512 or
  more), and for the web `short_name` (left out, the name cut at a word to 12 characters),
  `theme_color`, `background_color`, `display` (`standalone` by default), `start_url` and
  `description`. It is the file the [phone apps](/docs/phone-apps/) read, so the app on a
  phone and the one installed from a browser have one name and one icon. Its `id` is the
  phone's bundle id: the manifest's `id` is the app's scope, so that a `start_url` changed
  later is still the same app.
- **`quillo check` reads it**, and says a mistake at its line before the program runs:

  ```text
  app.toml:4: error: theme_color "green-ish" is not a CSS colour: #rgb, #rrggbb, #rrggbbaa or a name such as teal
  ```

  An icon under 512 pixels, `display = "browser"` (a tab, which browsers do not offer to
  install) and a key no one reads (`theme_colour`) are warnings.
- **Routes of your own win.** A route at `/manifest.webmanifest` is the manifest, and
  Quillo adds no tags. A route that takes any path (a last `route ANY /*rest` for a 404
  page, a React app's `route GET /*path = file("dist/index.html")`) keeps those addresses
  only with a real answer (a `2xx` that is not HTML, or a `3xx`): anything else there, a
  404 page, a front end's `index.html` or a guard's `401`, is Quillo's, so the app stays
  installable.
- **Nothing changes without the file**: no tags, no manifest, nothing a request pays for.

The rest of the rules (where the tags go and where not, `--base`, `--watch`) are in
[Installable apps](/docs/#installable-apps).

### Pages that open with no network

`offline` after `route` keeps a page on the device. In the shop, `/` and `/orders` are
tagged; after `routes`, the word tags every `GET` route of a group.

> **Try it.** Signed in, open `/`, then `/orders` again (the worker keeps what it sees once
> it is there). Stop the server (Ctrl-C) and reload: both still open. A page never tagged, such as `/in/ana`, gets a page saying there is no connection,
> named with the app's name, and a button to try again.

What Quillo does for it:

- **A service worker it writes.** An offline route's page carries a 280-byte script that
  registers `/_quillo/sw.js`. A program with no offline route has none.
- **The network first.** Online, every page comes from the server, as with no worker;
  each one of an offline route is kept as it comes. Only when the network fails, or a proxy
  in front answers `502` to `504` for a server that is down, does the worker give the kept
  copy. So what a visitor reads is never older than it has to be.
- **A kept page says so.** It comes with `<html data-kept="...">`, when it was kept, so a
  sheet can tell the visitor:

  ```css
  html[data-kept] body::before { content: "Offline: this page may be out of date"; display: block; padding: 8px; background: #fff3cd; }
  ```
- **Pages kept ahead.** As the worker installs, it keeps each offline route with no
  parameter (here `/`), with the runtime and the bundles its page loads, so a page never
  opened opens offline with its components working. A page with a parameter is kept once it
  is opened. A route that would write is not run for this: the worker asks as a
  [prefetch](/docs/prefetching/), which changes nothing. A page Quillo is too busy to
  prefetch (others' requests are waiting) is asked again within 5 seconds.
- **A deploy is a new worker.** Its text names the build, the program's files, its base
  and its offline routes, so the browser installs the new one at its next check and the old copies serve
  until the new pages are kept.
- **Calls still go to the server.** A `server fn` called offline gives its error value, as
  with no worker, and live data comes back as soon as the browser is online again.

#### A person's own pages

`/orders` reads `session()`, so it is that person's. It is kept all the same, for that
session alone:

- The browser holds the session's name in a cookie, `quillo_tag`, and a kept page is shown
  only where that cookie names its session. Signed out, or signed in as someone else, the
  visitor gets the offline page, and the pages kept for the session before are dropped.
- Any change to the session (a sign-out, a sign-in, a cart written into it) drops that
  session's pages; they are kept again as they are opened.
- A page that reads the visitor another way (a cookie of the program's own, a header) is
  not kept, and `quillo check` says which route. Nor is a page holding a form that must
  not be sent twice, one with waiting parts (`defer`), or an answer that changed the
  session (a sign-in, a sign-out).

The whole of it, signed-in pages, bounds and what is never kept, is in [Pages that work
offline](/docs/#pages-that-work-offline).

### Notifications

The button on `/orders` turns notifications on for the device, and the server sends.
It is not `notify`, which shows a note on a page that is open: `quillo check` refuses
`notify` and `ask` where the code surely runs on the server (a route, a `server fn`, a job),
and names `notification.send` for someone who is not on the page *(since 0.8.7: they passed
the check, and every call was a 500)*.

- **`notification.ask()`**, in a click's handler, asks the person, subscribes the device
  with the server's key, and binds the subscription to `session().user`. It gives
  `"granted"`, `"denied"`, `"default"` (the prompt closed) or `"unsupported"`. Ask before
  anything that waits in the handler: browsers show the prompt only close to the click,
  and `quillo check` warns of an `ask` that comes after a `server fn` call.
- **`notification.state()`** gives the same without asking, as the page starts;
  **`notification.stop()`** turns it off.
- **`notification.send(user, { title, body, url })`** reaches each of that person's
  devices, the page open or not, and gives `{ sent, gone }`: how many push services took
  it, and how many subscriptions had ended, which are dropped. A click on the notification
  opens `url` in the app. `tag`, `badge`, `silent`, `ttl` and `urgency` say the rest.

> **Try it.** Signed in at `/in/ana`, click **Tell me when my orders ship** and allow
> notifications, then **Ship mine now**: `{ sent: 1, gone: 0 }`, and the notification
> comes. Close the tab and send again from another browser signed in as `ana`: it still
> comes.

- **One message holds 3,800 bytes**; a longer one is an error value, and nothing is sent.
  `send` waits as `http.post` does, and the server goes on meanwhile. It goes to 8 devices
  at a time over kept connections, all of them within 30 seconds.
- **At most 20 devices a person**, the oldest replaced by a new one. Push services are
  reached over https on port 443, on the public internet; a subscription to anything else
  is refused when the page sends it.
- **Sign-out stops them.** `end_session()` unbinds every device subscribed in that
  session, and so does signing in as another person, so the next person on a shared
  computer gets nothing meant for the one before. A page that finds its device bound to
  someone else (after a cookie that simply ran out, say) unbinds it there and then.
- **The key is `QUILLO_SECRET`.** The push key is derived from it, so every instance and
  every server that shares it signs alike, with nothing to store. Changing it ends every
  subscription; without it, a restart does, which Quillo says as it starts.
- **Subscriptions are kept for you**, in `_quillo_push`, where Quillo keeps its own tables
  (see [Quillo's own tables](/docs/standard-library/#quillos-own-tables)).

#### Someone who is not signed in

A guest who placed an order has a session but no `user`. The server names them, sealed so
that no page can name someone else:

```quillo
component Track(ticket: str) {
    state on = notification.state()
    <button disabled={on == "granted"} @click={() => { on = notification.ask({ user: ticket }) }}>Tell me when it ships</button>
}

route GET /thanks {
    let order = session().order                  // set at checkout, for a guest who is no user
    <html><body><h1>Order {order} is placed</h1><Track ticket={notification.user(`order-${order}`)}/></body></html>
}

fn staff(r) = session().role == "staff" ? r : respond(403, "staff only")

routes /staff | staff {
    route POST /orders/:id(int)/ship = notification.send(`order-${id}`, { title: "Shipped", url: "/thanks" })
}
```

`notification.user(x)` is good for 30 days and for the session it was made in. A plain
value given to `ask` is refused.

#### Telling many people

`send` is for one person's few devices. For everyone, loop in a job, not in a visitor's
request, which would wait for every send:

```quillo
db.open("shop.db")
db.exec("create table if not exists customers (id integer primary key, name text not null)")
db.exec("create table if not exists news (id integer primary key, text text not null, sent int not null default 0)")

fn send_news() {
    for n in db.query("select id, text from news where sent = 0") {
        for c in db.query("select id from customers") {
            notification.send(c.id, { title: "News from the shop", body: n.text, url: "/news" })
        }
        db.exec("update news set sent = 1 where id = ?", n.id)
    }
}

schedule("1m", send_news)

route POST /news { form: { text: str } } {
    db.exec("insert into news (text) values (?)", text)
    redirect("/news")
}
```

The user is compared as JSON: the int `7` and the text `"7"` are two people, so send what
`session().user` holds. Every rule is in [Notifications](/docs/#notifications).

### A service worker of your own

A program can serve its own worker instead (a game's assets from the cache first, say),
with a route such as `route GET /sw.js = file("public/sw.js")`. Two workers cannot share
a scope, so such a program tags no route `offline`, and it follows Quillo's rules itself:
its files named by their content (`/_quillo/b/`, `r/`, `s/`, `t/`, `i/`) may be kept for
good, and every other `/_quillo/` address must go to the network; pages go to the network
first; and a page marked `cache-control: private` is someone's, which the Cache API keeps
all the same unless the worker reads that header itself. `notification.ask` on a page
whose scope has such a worker gives an error value, rather than have Quillo's replace it.
Under `--watch`, a page a worker answers from its cache cannot be refreshed: it reloads
once, then says so in the page's error overlay and the console *(since 0.8.7: it reloaded
without end, or never showed the change)*. The table of addresses and an example worker are in [A service worker of
your own](/docs/#a-service-worker-of-your-own).

### Where it does not work yet

- **Under `--watch`** there is no worker: pages are always fresh while you work, and one
  installed from an earlier run takes itself away. Notifications still work.
- **An iPhone or iPad** gives push only to a web app added to the Home Screen; in a Safari
  tab, `ask` says `"unsupported"`.
- **The phone apps and `quillo app`** say `"unsupported"` for now: push through Apple's and
  Google's services is to come. The phone apps' pages work offline already, as the program
  runs on the phone.
- **Firefox** does not install web apps (but for Windows' taskbar tabs, an experiment),
  and it takes notifications.
- **A `server fn` called offline** is not kept to be sent later: it gives its error value.

### Before going live

- `QUILLO_SECRET` is set, long and random, and the same on every server: it signs sessions,
  and the push key comes from it.
- The site is served over HTTPS (see [Hosting](/docs/hosting/)): browsers give service
  workers and notifications to no other site but this machine. Behind a proxy, name it with
  `--trust-proxy`, so its `X-Forwarded-Proto` is believed: a notification opens the site
  the page was on, over https only where that proxy (or, under `quillo fcgi`, the web
  server) says so, and `http://` otherwise.
- `quillo check main.qwe` says nothing of `app.toml`, and the icon is 512 × 512 or more.
- Every page tagged `offline` that is someone's reads them through `session()` alone.
- A sign-out calls `end_session()`, so the device's notifications and kept pages go with it.
