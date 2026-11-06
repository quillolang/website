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
in markup as it is, the same on the server and in the browser. It reads each line once,
so it takes time in proportion to the text. No stylesheet comes with it: the page
styles the classes.

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
- Strings are coloured as each language reads them: Python's triple-quoted and Rust's
  strings run over lines, Rust's raw strings `r#"..."#` have no escapes, a Rust
  character such as `'"'` is a string and a lifetime `'a` is not, a JavaScript regex
  literal is one token, a shell's `it's` or a `#` inside a word starts nothing, and a
  range's `..` ends the number before it (`0..10` is two numbers). A word is Unicode
  letters and digits on both sides.
- Under `--max-compute` (`quillo run main.qwe --max-compute 2s`; see [the
  options](/docs/)), or a policy's `max_compute`, a highlight of a long text ends there
  as a loop does: the request is a 500, not an error value a `??` takes
  (`highlight(x) ?? x` too).
- In the browser, `str(highlight(...))` is the markup, as on the server, and only its
  own languages are known: `"constructor"` and `"__proto__"` are escaped text.

```quillo
print(highlight("a < b & c", "cobol"))
print(highlight("a < b"))
print(highlight("x = 1", "PYTHON"))
print(len(str(highlight("", "js"))))
print(highlight("def f():\n    return 1", "python"))
print(highlight("for i in 0..10 {}", "rust"))
print(highlight("let c = '\"'; let s = r#\"a\\\"#;", "rust"))
print(highlight("echo it's # done", "sh"))
```

```output
a &lt; b &amp; c
a &lt; b
x = <span class="hl-n">1</span>
0
<span class="hl-k">def</span> <span class="hl-f">f</span>():
    <span class="hl-k">return</span> <span class="hl-n">1</span>
<span class="hl-k">for</span> i <span class="hl-k">in</span> <span class="hl-n">0</span>..<span class="hl-n">10</span> {}
<span class="hl-k">let</span> c = <span class="hl-s">'&quot;'</span>; <span class="hl-k">let</span> s = <span class="hl-s">r#&quot;a\&quot;#</span>;
<span class="hl-k">echo</span> it's <span class="hl-c"># done</span>
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

On a page, the classes need a stylesheet of the page's own, here in a `<style>`:

```quillo noexec
let sheet = css`
  .hl { background: #f6f8fa; padding: 1rem; overflow-x: auto }
  .hl-k { color: #cf222e } .hl-s { color: #0a3069 } .hl-c { color: #6e7781; font-style: italic }
  .hl-n { color: #0550ae } .hl-f { color: #8250df } .hl-t { color: #116329 } .hl-a { color: #953800 }
`

view Snippet(code: str, lang: str) = <pre class="hl"><code>{highlight(code, lang)}</code></pre>

route GET /snippet =
    <html><head><style>{sheet}</style></head><body>
        <Snippet code={"let total = sum(prices) // dollars"} lang="quillo"/>
        <Snippet code={read_file("schema.sql") ?? ""} lang="sql"/>
    </body></html>
```

The page carries the spans as they are, not escaped again:
`<pre class="hl"><code><span class="hl-k">let</span> total = <span class="hl-f">sum</span>(prices) ...`.

### See also

[markdown](/docs/reference/markdown/), [escape](/docs/reference/escape/), [raw](/docs/reference/raw/)
