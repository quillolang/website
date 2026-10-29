# highlight
highlight(str, str | null=) -> html
group: Markup

### What it does

Source code as HTML, escaped, with its keywords, strings, comments and so on wrapped in
spans: `hl-k` keywords, `hl-s` strings, `hl-c` comments, `hl-n` numbers and constants,
`hl-f` functions called, `hl-t` types and tags, `hl-a` attributes, properties and
keys. The languages are Quillo (`quillo`, `qwe`), JavaScript and TypeScript (`js`,
`ts`, `jsx`, `tsx`, `mjs`), Python, Rust, shell (`sh`, `bash`, `zsh`, `console`), SQL,
CSS, HTML and XML (`html`, `xml`, `svg`) and JSON. The result is an `html` value, shown
in markup as it is. No stylesheet comes with it: the page styles the classes.

### Examples

```quillo
print(highlight("let x = 1 // one", "quillo"))
print(highlight("select * from t where a = 1", "sql"))
print(highlight("<div class=\"x\">hi</div>", "html"))
```

```output
<span class="hl-k">let</span> x = <span class="hl-n">1</span> <span class="hl-c">// one</span>
<span class="hl-k">select</span> * <span class="hl-k">from</span> t <span class="hl-k">where</span> a = <span class="hl-n">1</span>
&lt;<span class="hl-t">div</span> <span class="hl-a">class</span>=<span class="hl-s">&quot;x&quot;</span>&gt;hi&lt;/<span class="hl-t">div</span>&gt;
```

### Edge cases

- A language it does not know, no language, or `null` gives the code as escaped text
  with no spans: `<`, `>`, `&` and `"` become entities either way.
- The language's name is matched without regard to case: `"PYTHON"` is Python.
- Empty code gives an empty `html` value.
- Lines are kept as they are; put the result in `<pre>` to show them.

```quillo
print(highlight("a < b & c", "cobol"))
print(highlight("a < b"))
print(highlight("x = 1", "PYTHON"))
print(len(str(highlight("", "js"))))
print(highlight("def f():\n    return 1", "python"))
```

```output
a &lt; b &amp; c
a &lt; b
x = <span class="hl-n">1</span>
0
<span class="hl-k">def</span> <span class="hl-f">f</span>():
    <span class="hl-k">return</span> <span class="hl-n">1</span>
```

### Errors

Code that is not a string is a runtime error, not an error value; so is a language
that is neither a string nor `null`.

```quillo error
print(highlight(42, "js"))
```

```output
line 1: `highlight` expects a str as argument 1, got int
```

### Chaining

The code comes first in a pipeline, so the language is the only argument written.
`markdown` calls it by itself for a fenced block that names its language.

```quillo
print("fn main() {}" | highlight("rust"))
print(".a { color: red }" | highlight("css") | str | len)
```

```output
<span class="hl-k">fn</span> <span class="hl-f">main</span>() {}
69
```

```quillo noexec
view Snippet(code) = <pre class="hl">{highlight(code, "quillo")}</pre>
```

### See also

[markdown](/docs/reference/markdown/), [escape](/docs/reference/escape/), [raw](/docs/reference/raw/)
