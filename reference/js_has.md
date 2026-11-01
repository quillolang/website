# js_has
js_has(str) -> bool
group: Browser

### What it does

Whether the page has a feature, by its dotted name, without calling it: `true` if each
part of `"navigator.vibrate"` is there, `false` if any is not. `js("navigator.vibrate")`
would call it; this only looks. On the server, where there is no page, it is `false`.

### Examples

```quillo noexec
component Buzz() {
    state can = false
    can = js_has("navigator.vibrate")
    <button disabled={!can} @click={() => { js("navigator.vibrate", 200) }}>Buzz</button>
}
```

```quillo
print(js_has("navigator.vibrate"), js_has("no.such.thing"))
```

```output
false false
```

### Edge cases

- A property that is there with the value `undefined` counts as not there.
- A part that is `null` ends it: `js_has("a.b")` with `a` null is `false`, not an error.
- It reads only what is reached by name from the page's globals, as `js` does.

### Errors

The name must be text: anything else is an error.

### Chaining

`"Notification" | js_has` reads as `js_has("Notification")`.

### See also

[js](/docs/reference/js/), [js_new](/docs/reference/js_new/), [platform](/docs/reference/platform/)
