### See it run

The demos below are Quillo components, running in your browser beside their code.

> **Watch it happen.** Right-click a demo and choose **Inspect** (or press F12, ⌥⌘I on a
> Mac) to open the Elements panel, then use the demo's buttons. The panel briefly
> highlights each node as it changes: only the numbers and words that changed light up,
> never the whole demo. (The first click in a demo can light up a few more, once: that is
> the browser taking over the HTML the server sent.)

#### A state and a let that follows it

`state` declares a value the component keeps; `let double = count * 2` follows it. In the
markup, `{count}` and `{double}` are the only places that change.

{{demo counter}}

- **Only what reads a value follows it.** The sentence that reads no state is never
  touched, and neither are the buttons.
- **Assigning the value a state already has does nothing.** "Assign the same value" sets
  `count` to itself: nothing lights up in the inspector.
- **Work things out with `let`, rather than keeping copies in state.** A `let` is always
  in step with what it reads; a second `state` would have to be kept in step by hand.

#### A statement that starts a timer

`if running { every(...) }` reads `running` and `speed`. Start sets `running`, so the
statement runs and the timer starts. Changing the speed runs it again, and the timer
starts over at the new speed. Stop makes the `if` false, and the timer is gone.

{{demo timer}}

#### Rows that move

Type a note into a row, then reverse the list:

{{demo rows}}

- **Rows move, they are not made again.** Reversing moves the three rows, and each takes
  what you typed in it along. In the inspector, the list's children are reordered and
  nothing inside them changes.
- **A changed item changes only where it shows what changed.** "Change Bread" changes one
  piece of text.
- **Adding puts one new row in**, and leaves the others alone.
- **Without a `key`**, rows are kept by place: after a reverse the first row shows the
  last item, and what was typed stays where it was typed.

#### A branch

{{demo branch}}

- Sign in, then change the name: only the name changes, and what you typed in the box
  stays.
- Sign out and in again: the branch is made afresh, so the box is empty.

#### Props passed live

{{demo props}}

- "Parent: add one" changes `n`: both badges show it, and each keeps its own click count.
- "New key for the second" resets the second badge's clicks and leaves the first alone:
  a new `key` makes a component afresh.
