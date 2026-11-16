// What runs in the page. Playwright sends a function there as its source text,
// so each function here uses nothing from outside its own body; `inPage` puts
// the helpers a function needs inside it.

const { scopeOf } = require("./scope.js");

const CLICKABLE =
  "a, button, input, select, textarea, summary, [role=link], [role=button], " +
  "[role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option]";

// `fn` with `helpers` defined inside its body.
function inPage(fn, helpers) {
  const definitions = Object.entries(helpers)
    .map(([name, helper]) => `const ${name} = ${helper};`)
    .join("\n");
  return new Function(
    `return function (...args) {\n${definitions}\nreturn (${fn})(...args);\n}`,
  )();
}

// What the rules know about `element`: an approximation of what Playwright
// computes, used to choose candidates; the page decides whether a candidate
// finds the element. With `withPeers`, also the elements with the same role, to
// check candidates against when the page is gone.
function elementFacts(element, withPeers) {
  const CONTROLS =
    "input:not([type=hidden]), textarea, select, [role=combobox], " +
    "[role=textbox], [role=searchbox], [role=spinbutton], [role=listbox], " +
    "[role=checkbox], [role=radio], [role=switch], [role=slider]";
  const INPUT_ROLES = {
    button: "button",
    submit: "button",
    reset: "button",
    image: "button",
    checkbox: "checkbox",
    radio: "radio",
    number: "spinbutton",
    range: "slider",
    search: "searchbox",
    hidden: "",
  };
  const link = (e) => (e.hasAttribute("href") ? "link" : "");
  const heading = () => "heading";
  const IMPLICIT_ROLES = {
    a: link,
    area: link,
    button: () => "button",
    select: (e) => (e.multiple || e.size > 1 ? "listbox" : "combobox"),
    textarea: () => "textbox",
    h1: heading,
    h2: heading,
    h3: heading,
    h4: heading,
    h5: heading,
    h6: heading,
    input: (e) =>
      INPUT_ROLES[(e.getAttribute("type") || "text").toLowerCase()] ??
      (e.hasAttribute("list") ? "combobox" : "textbox"),
  };

  const flat = (text) => (text || "").replace(/\s+/g, " ").trim();
  const attribute = (e, name) => flat(e.getAttribute(name));
  const explicitRoleOf = (e) => attribute(e, "role").split(" ")[0];
  const roleOf = (e) =>
    explicitRoleOf(e) || IMPLICIT_ROLES[e.localName]?.(e) || "";
  const textsByIds = (e, name) =>
    (e.getAttribute(name) || "")
      .split(/\s+/)
      .map((id) => id && e.getRootNode().getElementById?.(id))
      .filter(Boolean)
      .map((ref) => ref.textContent);
  const labelsOf = (e) => [...(e.labels || [])].map((l) => l.textContent);
  const isFormField = (e) =>
    ["input", "select", "textarea"].includes(e.localName);
  // The name from everything but the title, which names an element only when
  // nothing else does.
  const nameBeforeTitleOf = (e) =>
    flat(textsByIds(e, "aria-labelledby").join(" ")) ||
    attribute(e, "aria-label") ||
    flat(labelsOf(e).join(" ")) ||
    (isFormField(e) ? "" : flat(e.textContent));
  const nameOf = (e) =>
    nameBeforeTitleOf(e) ||
    attribute(e, "title") ||
    attribute(e, "alt") ||
    attribute(e, "placeholder");
  // The title describes an element whenever something else names it.
  const descriptionOf = (e) =>
    flat(textsByIds(e, "aria-describedby").join(" ")) ||
    attribute(e, "aria-description") ||
    (nameBeforeTitleOf(e) ? attribute(e, "title") : "");
  const everyElement = (root) =>
    [...root.querySelectorAll("*")].flatMap((e) => [
      e,
      ...(e.shadowRoot ? everyElement(e.shadowRoot) : []),
    ]);
  // A peer has the element's role, so it is not computed again.
  const peerOf = (e) => ({
    role,
    name: nameOf(e),
    description: descriptionOf(e),
    scopeText: scopeOf(e),
    isTarget: e === element,
  });

  const role = roleOf(element);
  const labelledBy = textsByIds(element, "aria-labelledby");
  const ariaLabel = attribute(element, "aria-label");
  const hasLabelledBy = element.hasAttribute("aria-labelledby");
  const hasLabel = labelsOf(element).length > 0;
  return {
    tag: element.localName,
    role,
    explicitRole: explicitRoleOf(element),
    name: nameOf(element),
    description: descriptionOf(element),
    ariaLabel,
    title: attribute(element, "title"),
    text: flat(element.textContent),
    hasLabelledBy,
    hasLabel,
    hasName: Boolean(ariaLabel || hasLabelledBy || hasLabel),
    hasDescription:
      element.hasAttribute("aria-describedby") ||
      element.hasAttribute("aria-description"),
    isControl: element.matches(CONTROLS),
    scopeText: scopeOf(element),
    // Every text the element may be found by, as it is in the page.
    texts: [
      element.textContent,
      ...labelsOf(element),
      ...["aria-label", "title", "alt", "placeholder"].map((name) =>
        element.getAttribute(name),
      ),
      ...labelledBy,
      labelledBy.join(" "),
    ].filter((text) => typeof text === "string" && text.trim() !== ""),
    ...(withPeers && role
      ? {
          peers: everyElement(element.ownerDocument)
            .filter((e) => roleOf(e) === role)
            .map(peerOf),
        }
      : {}),
  };
}

const FACTS = inPage(elementFacts, { scopeOf });

// At each trusted press, outside Browser's toolbar and Playwright's overlay,
// sends the facts of the pressed element to Node through `binding`.
function reportPresses(binding, clickable, facts) {
  if (window.__rfbRecorderSelectorsInstalled) return;
  window.__rfbRecorderSelectorsInstalled = true;
  const pressed = (event) => {
    const path = event.composedPath().filter((node) => node instanceof Element);
    const outside = !path.some((e) => e.localName === "x-pw-glass");
    return event.isTrusted && outside
      ? path.find((e) => e.matches(clickable)) || path[0]
      : undefined;
  };
  const report = (event) => {
    const element = pressed(event);
    try {
      if (element) window[binding](facts(element, true));
    } catch {
      // A page that blocks the binding records without the snapshot.
    }
  };
  window.addEventListener("pointerdown", report, true);
}

// The source that reports every press through the binding `binding`.
const pressScript = (binding) =>
  `(${reportPresses})(${JSON.stringify(binding)}, ${JSON.stringify(CLICKABLE)}, ${FACTS});`;

module.exports = { FACTS, pressScript };
