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

// Runs in the page: the scope text of `element`, or null. The closest ancestor
// with a text before the element decides; a lookalike before the element ends
// the search, since a text before it would not tell the two apart.
function scopeOf(element) {
  // Elements whose text is never a scope: they are named by it themselves.
  const NAMED_BY_THEIR_TEXT =
    "a, button, input, select, textarea, option, summary, " +
    "[role=link], [role=button], [role=checkbox], [role=radio], [role=tab], " +
    "[role=menuitem], [role=option], [role=combobox], [role=textbox], " +
    "script, style, template, noscript";
  const document = element.ownerDocument;
  const normalizeSpace = (text) => (text || "").replace(/\s+/g, " ").trim();
  const precedes = (a, b) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  // --- lookalikes: elements with the same tag, role and name
  const lookalikeKey = (e) =>
    [
      e.localName,
      e.getAttribute("role") || "",
      normalizeSpace(e.getAttribute("aria-label")) ||
        normalizeSpace(e.textContent) ||
        normalizeSpace(e.getAttribute("title")),
    ].join("\u0000");
  const elementKey = lookalikeKey(element);
  const isLookalike = (e) =>
    e !== element &&
    !e.contains(element) &&
    !element.contains(e) &&
    lookalikeKey(e) === elementKey;
  const lastLookalikeBefore = (ancestor) =>
    [...ancestor.getElementsByTagName(element.localName)]
      .filter((e) => isLookalike(e) && precedes(e, element))
      .at(-1);

  // --- texts that can be a scope
  const isVisible = (e) => (e.checkVisibility ? e.checkVisibility() : true);
  const isScopeElement = (e) =>
    e &&
    !e.contains(element) &&
    !e.closest(NAMED_BY_THEIR_TEXT) &&
    !e.querySelector(NAMED_BY_THEIR_TEXT) &&
    normalizeSpace(e.textContent) !== "" &&
    isVisible(e);
  // The text nodes of `root` before the element, in document order.
  function* textNodesBefore(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode()) && precedes(node, element); )
      yield node;
  }

  // --- the search, from the closest ancestor up
  const ancestorsOf = (e) => {
    const parent = e.parentElement;
    return parent && parent !== document.documentElement
      ? [parent, ...ancestorsOf(parent)]
      : [];
  };
  // In `ancestor`: the scope text, null to stop the search, or undefined to
  // look further up.
  const scopeIn = (ancestor) => {
    const lookalike = lastLookalikeBefore(ancestor);
    const scopeElement = [...textNodesBefore(ancestor)]
      .filter((node) => !lookalike || precedes(lookalike, node))
      .filter(
        (node) =>
          normalizeSpace(node.textContent) && isScopeElement(node.parentElement),
      )
      .at(-1)?.parentElement;
    if (scopeElement) return normalizeSpace(scopeElement.textContent);
    // Any text further up comes before the lookalike too.
    return lookalike ? null : undefined;
  };
  const firstAnswer = (ancestors) =>
    ancestors.reduce(
      (found, ancestor) => (found === undefined ? scopeIn(ancestor) : found),
      undefined,
    );

  return firstAnswer(ancestorsOf(element)) ?? null;
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
