# classes
classes() -> list
group: Markup

### What it does

The classes the program's markup writes, sorted, each once: the `.class` shorthand
(`<div.card.p-4>`), `class="..."` attributes, the text in `class={...}` (both sides of a
`? :`, for instance), the keys of a map written there (`class={{ active: on }}`, a map in a
list or a `? :` too) and `class:name={...}`, in every file of the program. It is for a CSS
engine the program runs itself, such as one written in Rust in a `.rs` file, which needs
the classes to make rules for: `build "/app.css" = engine(classes())`. `quillo classes
app.qwe` prints the same list, one class a line, for a tool beside the program
(Tailwind's `@source inline(...)` or a safelist file).

### Examples

```quillo
component Card(on: bool) {
    <div.card.p-4 class={on ? "ring-2 shadow" : "opacity-50"} class:active={on}>
        <span class="text-sm md:text-lg">hi</span>
    </div>
}
print(classes())
```

```output
["active", "card", "md:text-lg", "opacity-50", "p-4", "ring-2", "shadow", "text-sm"]
```

A map's keys are classes the markup may write, so they are listed, quoted ones too, and so
are those of a map inside a list:

```quillo
component Tab(on: bool, busy: bool) {
    <button.tab class={{ active: on, "is-busy": busy }} class:selected={on}>
        <span class={[on && "bold", { muted: !on }]}>x</span>
    </button>
}
print(classes())
```

```output
["active", "bold", "is-busy", "muted", "selected", "tab"]
```

```quillo noexec
use "tailwind.rs"
build "/app.css" = tailwind(css`@import "tailwindcss";`, classes())
```

### Edge cases

- Only whole words written out count. In a template, `` `chip bg-${color}` ``, the word
  `chip` is in the list and the class made from parts is not: name such classes in full
  somewhere, as Tailwind asks.
- A map held in a name is not read: `class={look}`, with `let look = { hidden: true }`
  elsewhere, adds nothing. Write the map in the markup, or name its classes in full
  somewhere.
- A program whose markup writes no class gives `[]`.

```quillo
let color = "red"
let look = { hidden: true }
component Chip() { <span class={`chip bg-${color}`}>x</span> }
component Box() { <div class={look}>x</div> }
print(classes(), contains(classes(), "bg-red"), contains(classes(), "hidden"))
```

```output
["chip"] false false
```

### Errors

None. It takes no arguments, and `quillo check` refuses one: `` `classes` takes 0
arguments, got 1 ``.

### Chaining

```quillo
component A() { <p.lead.text-lg>a</p> }
print(classes() | filter((c) => starts_with(c, "text-")))
```

```output
["text-lg"]
```

### See also

[style_with](/docs/reference/style_with/), [markdown](/docs/reference/markdown/), [raw](/docs/reference/raw/)
