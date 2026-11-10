// Quillo for CodeMirror 6, as a stream language: the words, strings, comments, routes and
// markup the site's own highlighter knows (the builtins and modules are the Prism
// highlighter's in quillo-editors/highlighters, kept in step by hand). Only colours and
// indentation come from here, so a guess that is wrong on odd code costs a colour, not text.

import { StreamLanguage } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const KEYWORDS = [
  "let", "fn", "view", "component", "route", "routes", "mount", "service", "use", "import", "as", "with",
  "from", "if", "else", "match", "for", "in", "while", "return", "reply", "state", "server", "private",
  "public", "type", "style", "site", "client", "preload", "preconnect", "module", "build",
];
export const ATOMS = ["true", "false", "null"];
export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY"];
export const BUILTINS = [
  "print", "str", "int", "float", "dec", "len", "type_of", "upper", "lower", "trim", "split",
  "join", "contains", "starts_with", "ends_with", "replace", "slice", "map", "filter", "find",
  "any", "all", "reduce", "sum", "min", "max", "sort", "sort_by", "reverse", "first", "last",
  "push", "range", "enumerate", "keys", "values", "get", "has", "set", "remove", "merge", "err",
  "is_err", "unwrap", "raw", "escape", "url_encode", "env", "now", "sleep", "file", "redirect",
  "respond", "read_file", "write_file", "random", "random_int", "uuid", "abs", "round", "floor",
  "ceil", "sqrt", "pow", "unique", "flatten", "zip", "take", "drop", "count", "group_by",
  "index_of", "repeat", "format_number", "live", "publish", "watch", "unwatched", "delete_file",
  "check_program", "join_on", "markdown", "highlight", "run_script", "sql_name", "sql_param",
  "ask", "notify", "translations", "locale_from", "locale", "with_locale", "t", "schedule",
  "allow_cross_site", "tenant", "tenant_from", "with_tenant", "save_upload", "read_upload", "js",
  "js_new", "parallel", "every", "stream", "events", "listen", "receive", "url", "css", "sql",
  "navigate", "set_cookie", "delete_cookie", "session", "set_session", "end_session", "sessions",
  "renew_session", "end_sessions", "user_sessions", "rate_limit", "rate_limit_reset",
  "security_headers", "csp", "csp_nonce", "idempotent", "args", "cookie", "cursor_index",
  "defer", "error", "exit", "filled", "js_has", "local_path", "new_tenant", "normalize",
  "page_updated", "platform", "read_line", "ready", "run_after", "site_headers", "stdin",
  "style_with", "waiting", "accept_calls", "classes", "files", "markdown_page", "confirm",
  "mcp_token", "mcp_tokens", "revoke_mcp_token", "about",
];
export const MODULES = ["json", "db", "http", "udp", "channel", "media", "crypto", "image", "math", "stats", "vec", "date", "money", "re", "bit", "later"];

const keywords = new Set(KEYWORDS), atoms = new Set(ATOMS), methods = new Set(METHODS);
const builtins = new Set(BUILTINS), modules = new Set(MODULES);
// Elements that have no end tag, so markup after one is not inside it.
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// The state: `stack` holds what the text is inside, innermost last:
//   "tpl"   a `template string`        "interp"  its ${ ... }
//   "brace" a { } ( ) or [ ] of code    "tagexpr" a { } in a tag's attributes
//   "elem"  an element's content       "tag"     a tag being read (< ... >)
// `last` says whether the token before was a value, which tells `a < b` from `<b>`.
function startState() {
  return { stack: [], comment: null, last: false, route: 0 };
}
function copyState(s) {
  return { stack: s.stack.slice(), comment: s.comment, last: s.last, route: s.route };
}
const top = (s) => s.stack[s.stack.length - 1];

function readString(stream, quote) {
  let escaped = false, ch;
  while ((ch = stream.next()) != null) {
    if (ch === quote && !escaped) return true;
    escaped = !escaped && ch === "\\";
  }
  return false;
}

// Inside a tag: its name came first; then attributes, `{...}`, and its end.
function tokenTag(stream, state) {
  if (stream.eatSpace()) return null;
  if (stream.match("/>")) {
    state.stack.pop();
    state.last = true;
    return "angleBracket";
  }
  if (stream.eat(">")) {
    const t = state.stack.pop();
    if (state.closing) state.closing = false;
    else if (!state.voidTag) state.stack.push("elem");
    state.voidTag = false;
    state.last = false;
    return "angleBracket";
  }
  if (stream.eat("{")) {
    state.stack.push("tagexpr");
    state.last = false;
    return "brace";
  }
  if (stream.eat("=")) return "operator";
  const q = stream.peek();
  if (q === '"' || q === "'") {
    stream.next();
    readString(stream, q);
    return "attributeValue";
  }
  if (stream.match(/^[@:]?[A-Za-z_][\w\-:@.]*/)) return "attributeName";
  if (stream.match(/^[^\s"'=<>`{}\/]+/)) return "attributeValue";
  stream.next();
  return null;
}

// An element's content: text, until a tag or a `{`.
function tokenContent(stream, state) {
  if (stream.match("<!--")) {
    state.comment = "html";
    return tokenComment(stream, state);
  }
  if (stream.match(/^<\/(?=[A-Za-z])/)) {
    state.stack.pop(); // the element ends
    stream.match(/^[A-Za-z][\w\-]*/);
    state.stack.push("tag");
    state.closing = true;
    return "tagName";
  }
  if (stream.peek() === "<" && /[A-Za-z]/.test(stream.string.charAt(stream.pos + 1))) return openTag(stream, state);
  if (stream.eat("{")) {
    state.stack.push("brace");
    state.last = false;
    return "brace";
  }
  stream.eatWhile(/[^<{]/);
  return "content";
}

function openTag(stream, state) {
  stream.next(); // <
  const name = stream.match(/^[A-Za-z][\w\-]*/)[0];
  stream.match(/^(?:[.#][\w\-:]+)*/); // <div.card#main>
  state.stack.push("tag");
  state.voidTag = VOID.has(name.toLowerCase());
  return /^[A-Z]/.test(name) ? "typeName" : "tagName";
}

function tokenComment(stream, state) {
  const end = state.comment === "html" ? "-->" : "*/";
  const at = stream.string.indexOf(end, stream.pos);
  if (at < 0) stream.skipToEnd();
  else {
    stream.pos = at + end.length;
    state.comment = null;
  }
  return "comment";
}

function tokenTemplate(stream, state) {
  if (stream.match("${")) {
    state.stack.push("interp");
    state.last = false;
    return "brace";
  }
  if (stream.eat("`")) {
    state.stack.pop();
    state.last = true;
    return "string";
  }
  while (!stream.eol()) {
    if (stream.peek() === "`" || stream.match("${", false)) break;
    if (stream.next() === "\\") stream.next();
  }
  return "string";
}

function tokenCode(stream, state) {
  if (stream.sol()) state.route = 0;
  if (stream.eatSpace()) return null;
  if (stream.sol() && stream.match(/^#!.*/)) return "meta";
  // A route's path, before comments: `route GET /todos/:id`, `mount /admin`, `route ANY /*rest`.
  if (state.route !== 0 && stream.match(/^\/[^\s{=?|]*/)) {
    state.route = 0;
    state.last = true;
    return "url";
  }
  if (stream.match("//")) {
    stream.skipToEnd();
    return "lineComment";
  }
  if (stream.match("/*")) {
    state.comment = "block";
    return tokenComment(stream, state);
  }
  if (stream.match("<!--")) {
    state.comment = "html";
    return tokenComment(stream, state);
  }
  const ch = stream.peek();
  if (ch === '"' || ch === "'") {
    stream.next();
    readString(stream, ch);
    state.last = true;
    return "string";
  }
  if (ch === "`") {
    stream.next();
    state.stack.push("tpl");
    return "string";
  }
  if (ch === "<" && !state.last && /[A-Za-z]/.test(stream.string.charAt(stream.pos + 1))) {
    state.last = false;
    return openTag(stream, state);
  }
  if (ch === "{" || ch === "(" || ch === "[") {
    stream.next();
    state.stack.push("brace");
    state.last = false;
    return "brace";
  }
  if (ch === "}" || ch === ")" || ch === "]") {
    stream.next();
    const t = state.stack.pop();
    state.last = ch !== "}" || t === "interp" || t === "tagexpr";
    return "brace";
  }
  if (stream.match(/^(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/)) {
    stream.match(/^(?:px|em|rem|ms|s|m|h|d|%)\b/);
    state.last = true;
    return "number";
  }
  const word = stream.match(/^[A-Za-z_]\w*/);
  if (word) {
    const w = word[0];
    state.last = true;
    // `route` at a line's start may name a method before its path; `routes`, `mount` and
    // `service` give the path at once.
    if (state.route === 1 && methods.has(w)) {
      state.route = 2;
      state.last = false;
      return "keyword";
    }
    const atStart = stream.string.slice(0, stream.start).trim() === "";
    state.route = atStart && w === "route" ? 1 : atStart && (w === "routes" || w === "mount" || w === "service") ? 2 : 0;
    if (keywords.has(w)) {
      state.last = false;
      return "keyword";
    }
    if (atoms.has(w)) return "atom";
    if (modules.has(w) && stream.peek() === ".") return "namespace";
    if (/^[A-Z]/.test(w)) return "typeName";
    if (stream.match(/^\s*\(/, false)) return builtins.has(w) ? "standard" : "function";
    return "variableName";
  }
  if (stream.match(/^(?:=>|->|\?\?|\|\||&&|==|!=|<=|>=|\.\.\.|[+\-*\/%=!<>&|?:.,;^~])/)) {
    state.last = false;
    return "operator";
  }
  stream.next();
  return null;
}

function token(stream, state) {
  if (state.comment) return tokenComment(stream, state);
  switch (top(state)) {
    case "tpl": return tokenTemplate(stream, state);
    case "tag": return tokenTag(stream, state);
    case "elem": return tokenContent(stream, state);
    default: return tokenCode(stream, state);
  }
}

// Indentation: four spaces for each open brace and element, one fewer on a line that
// starts by closing one.
function indent(state, textAfter, cx) {
  if (state.comment) return null;
  let depth = state.stack.filter((t) => t === "brace" || t === "elem" || t === "tagexpr" || t === "interp").length;
  if (/^\s*(?:[}\])]|<\/)/.test(textAfter)) depth -= 1;
  return Math.max(0, depth) * cx.unit;
}

export const quilloParser = {
  name: "quillo",
  startState,
  copyState,
  token,
  indent,
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"', "'", "`"] },
    indentOnInput: /^\s*(?:[}\])]|<\/)$/,
  },
  // Token names that are not a highlighting tag's own name, to the tag they stand for.
  tokenTable: {
    lineComment: tags.lineComment,
    angleBracket: tags.angleBracket,
    content: tags.content,
    standard: tags.standard(tags.variableName),
    namespace: tags.namespace,
    function: tags.function(tags.variableName),
  },
};

export const quilloLanguage = StreamLanguage.define(quilloParser);
