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

  function normalizeSpace(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function precedes(a, b) {
    return Boolean(
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }

  // --- lookalikes: elements with the same tag, role and name

  function lookalikeKey(e) {
    const name =
      normalizeSpace(e.getAttribute("aria-label")) ||
      normalizeSpace(e.textContent) ||
      normalizeSpace(e.getAttribute("title"));
    return [e.localName, e.getAttribute("role") || "", name].join("\u0000");
  }

  const elementKey = lookalikeKey(element);

  function isLookalike(e) {
    if (e === element) return false;
    if (e.contains(element) || element.contains(e)) return false;
    return lookalikeKey(e) === elementKey;
  }

  function lastLookalikeBefore(ancestor) {
    const sameTag = [...ancestor.getElementsByTagName(element.localName)];
    return sameTag.filter((e) => isLookalike(e) && precedes(e, element)).at(-1);
  }

  // --- texts that can be a scope

  function isVisible(e) {
    if (!e.checkVisibility) return true;
    return e.checkVisibility();
  }

  function isScopeElement(e) {
    if (!e) return false;
    if (e.contains(element)) return false;
    if (e.closest(NAMED_BY_THEIR_TEXT)) return false;
    if (e.querySelector(NAMED_BY_THEIR_TEXT)) return false;
    if (normalizeSpace(e.textContent) === "") return false;
    return isVisible(e);
  }

  // The text nodes of `root` before the element, in document order.
  function textNodesBefore(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!precedes(node, element)) break;
      nodes.push(node);
    }
    return nodes;
  }

  // --- the search, from the closest ancestor up

  // The ancestors of the element below the document element, the closest first.
  function ancestors() {
    const found = [];
    for (let e = element.parentElement; e; e = e.parentElement) {
      if (e === document.documentElement) break;
      found.push(e);
    }
    return found;
  }

  // In `ancestor`: the scope text, null to stop the search, or undefined to
  // look further up.
  function scopeIn(ancestor) {
    const lookalike = lastLookalikeBefore(ancestor);
    const afterLookalike = (node) => !lookalike || precedes(lookalike, node);
    const isScopeText = (node) =>
      normalizeSpace(node.textContent) !== "" && isScopeElement(node.parentElement);
    const lastText = textNodesBefore(ancestor)
      .filter(afterLookalike)
      .filter(isScopeText)
      .at(-1);
    if (lastText) return normalizeSpace(lastText.parentElement.textContent);
    // Any text further up comes before the lookalike too.
    if (lookalike) return null;
    return undefined;
  }

  for (const ancestor of ancestors()) {
    const scope = scopeIn(ancestor);
    if (scope !== undefined) return scope;
  }
  return null;
}

// Runs in the page: the text a `scope=` selector asks for, quoted or not.
function wantedScope(body) {
  const trimmed = body.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  return trimmed.replace(/\s+/g, " ");
}

const ENGINE = `(() => {
  const scopeOf = ${scopeOf};
  const wantedScope = ${wantedScope};
  function queryAll(root, body) {
    if (!root || root.nodeType !== 1) return [];
    if (scopeOf(root) !== wantedScope(body)) return [];
    return [root];
  }
  function query(root, body) {
    return queryAll(root, body)[0] || null;
  }
  return { query, queryAll };
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

// The `scope=` selector part that keeps the elements whose scope is `text`.
function scopeSelector(text) {
  return `${ENGINE_NAME}=${JSON.stringify(text)}`;
}

// The text of a `scope=` part, or undefined for any other part.
function scopeTextOf(part) {
  const prefix = `${ENGINE_NAME}=`;
  if (!part.startsWith(prefix)) return undefined;
  return wantedScope(part.slice(prefix.length));
}

module.exports = { scopeOf, register, scopeSelector, scopeTextOf };
