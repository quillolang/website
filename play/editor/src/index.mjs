// The editor of quillolang.org/play/, one ES module: `createEditor(el, options)` puts a
// CodeMirror 6 editor in `el` and gives an object the page's Quillo component calls. Nothing is
// put on `window`; the page takes `createEditor` with
//   client module /play/editor.mjs use createEditor
//
// Each file has an editor state of its own, so its undo history and selection stay while
// another file is open.

import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { setDiagnostics, lintGutter } from "@codemirror/lint";
import { completeFromList } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { quilloLanguage, KEYWORDS, BUILTINS, MODULES, ATOMS } from "./quillo.mjs";

// The site's own code colours (style.css .hl-*), on its dark surface.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword], color: "#c9a3ff" },
  { tag: [t.string, t.attributeValue, t.special(t.string)], color: "#a8d99a" },
  { tag: [t.url], color: "#a8d99a", textDecoration: "none" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.meta], color: "#8b88a0", fontStyle: "italic" },
  { tag: [t.number, t.atom, t.bool, t.null], color: "#f7a26c" },
  { tag: [t.function(t.variableName), t.standard(t.variableName), t.attributeName], color: "#8fb4ff" },
  { tag: [t.tagName, t.angleBracket], color: "#7fd6cb" },
  { tag: [t.typeName, t.namespace], color: "#f3b54a" },
  { tag: [t.operator, t.brace], color: "#a3a0b7" },
]);

const theme = EditorView.theme(
  {
    "&": { color: "var(--text, #ecebf3)", backgroundColor: "var(--surface, #13121c)", height: "100%", fontSize: "13.5px" },
    // No ligatures: `->` and `=>` stay two characters, as the cursor counts them.
    ".cm-scroller": { fontFamily: "var(--mono, ui-monospace, monospace)", lineHeight: "1.55", fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' },
    ".cm-content": { caretColor: "var(--gold, #f3b54a)", padding: "10px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--gold, #f3b54a)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(185, 168, 255, 0.28)" },
    ".cm-gutters": { backgroundColor: "var(--ink, #0b0a12)", color: "var(--faint, #8b88a0)", border: "none", borderRight: "1px solid var(--line, #262435)" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255, 255, 255, 0.05)", color: "var(--text, #ecebf3)" },
    ".cm-matchingBracket": { backgroundColor: "rgba(243, 181, 74, 0.18)", outline: "none" },
    ".cm-tooltip": { backgroundColor: "var(--raised, #191826)", border: "1px solid var(--line, #262435)", color: "var(--text, #ecebf3)" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "rgba(185, 168, 255, 0.25)", color: "var(--text, #ecebf3)" },
    ".cm-panels": { backgroundColor: "var(--raised, #191826)", color: "var(--text, #ecebf3)" },
    ".cm-searchMatch": { backgroundColor: "rgba(243, 181, 74, 0.25)" },
    ".cm-diagnostic-error": { borderLeftColor: "#ff7a7a" },
    ".cm-diagnostic-warning": { borderLeftColor: "var(--gold, #f3b54a)" },
  },
  { dark: true },
);

const words = [
  ...KEYWORDS.map((label) => ({ label, type: "keyword" })),
  ...ATOMS.map((label) => ({ label, type: "constant" })),
  ...BUILTINS.map((label) => ({ label, type: "function" })),
  ...MODULES.map((label) => ({ label, type: "namespace" })),
];

// `line` counts from 1; a line past the end is the last one.
function rangeOf(doc, line) {
  const n = Math.min(Math.max(1, line | 0), doc.lines);
  const l = doc.line(n);
  return { from: l.from, to: Math.max(l.from, l.to) };
}

export function createEditor(el, options = {}) {
  const states = new Map(); // file name -> EditorState
  const marks = new Map(); // file name -> [{ line, severity, message }]
  const changed = [];
  const runs = [];
  let current = null;
  const readOnly = new Compartment();

  const extensions = () => [
    basicSetup,
    quilloLanguage,
    quilloLanguage.data.of({ autocomplete: completeFromList(words) }),
    syntaxHighlighting(highlight),
    theme,
    lintGutter(),
    indentUnit.of("    "),
    EditorState.tabSize.of(4),
    readOnly.of(EditorState.readOnly.of(!!options.readOnly)),
    keymap.of([
      { key: "Mod-Enter", preventDefault: true, run: () => { runs.forEach((f) => f()); return true; } },
      { key: "Mod-s", preventDefault: true, run: () => { runs.forEach((f) => f("save")); return true; } },
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && current != null) {
        const name = current;
        changed.forEach((f) => f(name));
      }
    }),
    EditorView.contentAttributes.of({ "aria-label": "Code", spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
  ];

  const make = (text) => EditorState.create({ doc: text ?? "", extensions: extensions() });
  const view = new EditorView({ state: make(""), parent: el });

  // Every file's text, by name. (No method here uses `this`: the page calls them unbound.)
  function files() {
    if (current != null) states.set(current, view.state);
    const out = {};
    for (const [name, st] of states) out[name] = st.doc.toString();
    return out;
  }

  function applyMarks(name) {
    const list = marks.get(name) ?? [];
    const doc = view.state.doc;
    const diagnostics = list.map((m) => ({ ...rangeOf(doc, m.line), severity: m.severity === "warning" ? "warning" : "error", message: String(m.message) }));
    view.dispatch(setDiagnostics(view.state, diagnostics));
  }

  return {
    // Shows the file `name`; `text` makes it when it is new (a file already open keeps its own text).
    open(name, text) {
      if (current != null) states.set(current, view.state);
      if (!states.has(name)) states.set(name, make(text));
      current = name;
      view.setState(states.get(name));
      applyMarks(name);
      return name;
    },
    // Replaces a file's text, as when an example is loaded; its undo history starts again.
    replace(name, text) {
      states.set(name, make(text));
      if (current === name) {
        view.setState(states.get(name));
        applyMarks(name);
      }
    },
    current: () => current,
    text(name) {
      if (name == null || name === current) return view.state.doc.toString();
      const s = states.get(name);
      return s == null ? null : s.doc.toString();
    },
    // Every file's text, by name.
    files,
    // The same as JSON text, which Quillo reads with json.parse.
    filesJson: () => JSON.stringify(files()),
    rename(from, to) {
      if (!states.has(from) || states.has(to)) return false;
      if (current === from) {
        states.set(from, view.state);
        current = to;
      }
      states.set(to, states.get(from));
      states.delete(from);
      if (marks.has(from)) {
        marks.set(to, marks.get(from));
        marks.delete(from);
      }
      return true;
    },
    remove(name) {
      states.delete(name);
      marks.delete(name);
      if (current === name) current = null;
    },
    // Forgets every file (a project loaded in place of this one).
    reset() {
      states.clear();
      marks.clear();
      current = null;
      view.setState(make(""));
    },
    // The checker's findings, by file: { "main.qwe": [{ line, severity, message }] }.
    diagnostics(byFile) {
      marks.clear();
      for (const name of Object.keys(byFile ?? {})) marks.set(name, byFile[name] ?? []);
      if (current != null) applyMarks(current);
    },
    setReadOnly(on) {
      view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(!!on)) });
    },
    goto(line) {
      const r = rangeOf(view.state.doc, line);
      view.dispatch({ selection: { anchor: r.from }, scrollIntoView: true });
      view.focus();
    },
    // `f(name)` after each edit of the open file.
    onChange(f) { changed.push(f); },
    // `f()` on Ctrl/Cmd-Enter, `f("save")` on Ctrl/Cmd-S.
    onKey(f) { runs.push(f); },
    focus() { view.focus(); },
    destroy() { view.destroy(); },
  };
}

// For the tests: the tokens of a text, as [style, text] pairs.
export { quilloLanguage };
