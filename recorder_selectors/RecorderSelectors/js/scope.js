// The `scope` selector engine. `scope="Text"` is a filter: it keeps the
// elements found so far whose scope is `Text`, for example
//
//   role=link[name*="RFCP® Robot Framework®"i] >> scope="Robot Framework"
//
// The scope of an element is the last visible text before it in its closest
// ancestor that has such a text. Text inside links, buttons and form controls
// is skipped, so the names of sibling links are never a scope. Only text after
// the last lookalike before the element counts, a lookalike being an element
// with the same tag, role and name, since a text before it would not tell the
// two apart. The scope is looked up whenever the selector is used, so the
// selector depends neither on ids nor on how deep the element is nested.

const ENGINE_NAME = "scope";

// Runs in the page: the scope text of `element`, or null.
function scopeOf(element) {
  const SKIPPED =
    "a, button, input, select, textarea, option, summary, " +
    "[role=link], [role=button], [role=checkbox], [role=radio], [role=tab], " +
    "[role=menuitem], [role=option], [role=combobox], [role=textbox], " +
    "script, style, template, noscript";
  const flat = (text) => (text || "").replace(/\s+/g, " ").trim();
  const visible = (e) => (e.checkVisibility ? e.checkVisibility() : true);
  const keyOf = (e) =>
    [
      e.localName,
      e.getAttribute("role") || "",
      flat(e.getAttribute("aria-label")) ||
        flat(e.textContent) ||
        flat(e.getAttribute("title")),
    ].join("\u0000");
  const key = keyOf(element);
  const isLookalike = (e) =>
    e !== element &&
    !e.contains(element) &&
    !element.contains(e) &&
    keyOf(e) === key;
  const isText = (e) =>
    e &&
    !e.contains(element) &&
    !e.closest(SKIPPED) &&
    !e.querySelector(SKIPPED) &&
    flat(e.textContent) !== "" &&
    visible(e);

  const precedes = (a, b) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  for (
    let ancestor = element.parentElement;
    ancestor && ancestor !== element.ownerDocument.documentElement;
    ancestor = ancestor.parentElement
  ) {
    const lookalike = [...ancestor.getElementsByTagName(element.localName)]
      .filter((e) => isLookalike(e) && precedes(e, element))
      .at(-1);
    const walker = element.ownerDocument.createTreeWalker(
      ancestor,
      NodeFilter.SHOW_TEXT,
    );
    let scope = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!precedes(node, element)) break;
      if (lookalike && !precedes(lookalike, node)) continue;
      if (flat(node.textContent) && isText(node.parentElement))
        scope = node.parentElement;
    }
    if (scope) return flat(scope.textContent);
    // Any text further up comes before the lookalike too.
    if (lookalike) return null;
  }
  return null;
}

// Runs in the page: the text a `scope=` selector asks for, quoted or not.
function wantedScope(body) {
  const trimmed = body.trim();
  return trimmed.startsWith('"')
    ? JSON.parse(trimmed)
    : trimmed.replace(/\s+/g, " ");
}

const ENGINE = `(() => {
  const scopeOf = ${scopeOf};
  const wantedScope = ${wantedScope};
  const queryAll = (root, body) =>
    root && root.nodeType === 1 && scopeOf(root) === wantedScope(body)
      ? [root]
      : [];
  return { query: (root, body) => queryAll(root, body)[0] || null, queryAll };
})()`;

async function register(playwright) {
  try {
    await playwright.selectors.register(
      ENGINE_NAME,
      { content: ENGINE },
      { contentScript: true },
    );
  } catch (error) {
    // Browser instances may share one Node process, which keeps the engine.
    if (!String(error).includes("already registered")) throw error;
  }
}

module.exports = {
  scopeOf,
  register,
  // The `scope=` selector part that keeps the elements whose scope is `text`.
  scopeSelector: (text) => `${ENGINE_NAME}=${JSON.stringify(text)}`,
  // The text of a `scope=` part, or undefined for any other part.
  scopeTextOf: (part) =>
    part.startsWith(`${ENGINE_NAME}=`)
      ? wantedScope(part.slice(ENGINE_NAME.length + 1))
      : undefined,
};
