---
title: Talking in real time
date: 2026-03-21
summary: Cursors, game moves and chat need messages both ways as they happen. A channel opened by a component, and handled on the server in a few lines.
tags: features, realtime
---
Live data covers pages that follow the database. Some things never touch the database: a cursor moving, a move in a game, a reading from a device. They need messages both ways, now, and gone a second later.

### A channel

```quillo
channel.on("game", (msg, peer) => {
    // Everyone else in the channel sees the move.
    channel.broadcast("game", { id: peer.id, pos: msg.pos }, { except: peer })
})

component Board() {
    state others = {}
    let game = channel.open("game", (m) => { others = set(others, m.id, m.pos) })
    <canvas @pointermove={(e) => game.send({ pos: [e.clientX, e.clientY] })}/>
}
```

In the browser, `channel.open` opens a channel for as long as the component is on the page, and `.send` sends a message to the server. On the server, `channel.on` handles each message, with `peer` saying who sent it, and answers one page, all of them, or none.

### Who may join

Anyone who can open a page can ask to join a channel, so a channel for a private room needs a door. `channel.on(name, f, { join })` decides: `join(peer)` sees the page's session, as it was when it connected, and says yes or no.

### One connection

Channels share the page's single connection with live data and `--watch` reloads, so a page with a chat, a live list and a shared cursor still holds one socket. Messages to a handler arrive in order, one at a time, and a slow handler holds up no one else.

> **Read more:** [Real time](/docs/realtime/) in the docs.
