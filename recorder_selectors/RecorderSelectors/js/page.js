// What runs in the page. Playwright sends a function there as its source text,
// so each function here uses nothing from outside its own body;
// `withHelpersInside` puts the helpers a function needs inside it.

const { scopeOf } = require("./scope.js");

const CLICKABLE =
  "a, button, input, select, textarea, summary, [role=link], [role=button], " +
  "[role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option]";

// What the rules know about `element`: an approximation of what Playwright
// computes, used to choose candidates; the page decides whether a candidate
// finds the element. With `withPeers`, also the elements with the same role, to
// check candidates against when the page is gone.
function elementFacts(element, withPeers) {
  const normalizeSpace = (text) => (text || "").replace(/\s+/g, " ").trim();
  const attributeText = (e, name) => normalizeSpace(e.getAttribute(name));

  // --- roles
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
  const linkRole = (e) => (e.hasAttribute("href") ? "link" : "");
  const headingRole = () => "heading";
  const IMPLICIT_ROLES = {
    a: linkRole,
    area: linkRole,
    button: () => "button",
    select: (e) => (e.multiple || e.size > 1 ? "listbox" : "combobox"),
    textarea: () => "textbox",
    h1: headingRole,
    h2: headingRole,
    h3: headingRole,
    h4: headingRole,
    h5: headingRole,
    h6: headingRole,
    input: (e) =>
      INPUT_ROLES[(e.getAttribute("type") || "text").toLowerCase()] ??
      (e.hasAttribute("list") ? "combobox" : "textbox"),
  };
  const explicitRoleOf = (e) => attributeText(e, "role").split(" ")[0];
  const roleOf = (e) =>
    explicitRoleOf(e) || IMPLICIT_ROLES[e.localName]?.(e) || "";

  // --- names and descriptions
  const textsOfIdsIn = (e, name) =>
    (e.getAttribute(name) || "")
      .split(/\s+/)
      .map((id) => id && e.getRootNode().getElementById?.(id))
      .filter(Boolean)
      .map((referenced) => referenced.textContent);
  const labelTextsOf = (e) =>
    [...(e.labels || [])].map((label) => label.textContent);
  const isFormField = (e) =>
    ["input", "select", "textarea"].includes(e.localName);
  // The name from everything but the title, which names an element only when
  // nothing else does.
  const nameBeforeTitleOf = (e) =>
    normalizeSpace(textsOfIdsIn(e, "aria-labelledby").join(" ")) ||
    attributeText(e, "aria-label") ||
    normalizeSpace(labelTextsOf(e).join(" ")) ||
    (isFormField(e) ? "" : normalizeSpace(e.textContent));
  const nameOf = (e) =>
    nameBeforeTitleOf(e) ||
    attributeText(e, "title") ||
    attributeText(e, "alt") ||
    attributeText(e, "placeholder");
  // The title describes an element whenever something else names it.
  const descriptionOf = (e) =>
    normalizeSpace(textsOfIdsIn(e, "aria-describedby").join(" ")) ||
    attributeText(e, "aria-description") ||
    (nameBeforeTitleOf(e) ? attributeText(e, "title") : "");

  // --- peers: the elements with the element's role, also in shadow roots
  const allElementsIn = (root) =>
    [...root.querySelectorAll("*")].flatMap((e) => [
      e,
      ...(e.shadowRoot ? allElementsIn(e.shadowRoot) : []),
    ]);
  const peersWithRole = (role) =>
    allElementsIn(element.ownerDocument)
      .filter((e) => roleOf(e) === role)
      .map((e) => ({
        role,
        name: nameOf(e),
        description: descriptionOf(e),
        scopeText: scopeOf(e),
        isTarget: e === element,
      }));

  // --- the facts
  const role = roleOf(element);
  const labelledBy = textsOfIdsIn(element, "aria-labelledby");
  const ariaLabel = attributeText(element, "aria-label");
  const hasLabelledBy = element.hasAttribute("aria-labelledby");
  const hasLabel = labelTextsOf(element).length > 0;
  return {
    tag: element.localName,
    role,
    explicitRole: explicitRoleOf(element),
    name: nameOf(element),
    description: descriptionOf(element),
    ariaLabel,
    title: attributeText(element, "title"),
    text: normalizeSpace(element.textContent),
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
      ...labelTextsOf(element),
      ...["aria-label", "title", "alt", "placeholder"].map((name) =>
        element.getAttribute(name),
      ),
      ...labelledBy,
      labelledBy.join(" "),
    ].filter((text) => typeof text === "string" && text.trim() !== ""),
    ...(withPeers && role ? { peers: peersWithRole(role) } : {}),
  };
}

// `fn` with `helpers` defined inside its body, so it can run in the page.
function withHelpersInside(fn, helpers) {
  const definitions = Object.entries(helpers)
    .map(([name, helper]) => `const ${name} = ${helper};`)
    .join("\n");
  return new Function(
    `return function (...args) {\n${definitions}\nreturn (${fn})(...args);\n}`,
  )();
}

// `elementFacts` as Playwright can run it in the page.
const ELEMENT_FACTS = withHelpersInside(elementFacts, { scopeOf });

// At each trusted press, outside Browser's toolbar and Playwright's overlay,
// sends the facts of the pressed element, with its peers, through `binding`.
function reportPresses(binding, clickable, elementFacts) {
  if (window.__rfbRecorderSelectorsInstalled) return;
  window.__rfbRecorderSelectorsInstalled = true;
  const pressedElement = (event) => {
    const path = event.composedPath().filter((node) => node instanceof Element);
    const onOverlay = path.some((e) => e.localName === "x-pw-glass");
    return event.isTrusted && !onOverlay
      ? path.find((e) => e.matches(clickable)) || path[0]
      : undefined;
  };
  const report = (event) => {
    const element = pressedElement(event);
    try {
      if (element) window[binding](elementFacts(element, true));
    } catch {
      // A page that blocks the binding records without the snapshot.
    }
  };
  window.addEventListener("pointerdown", report, true);
}

// The source that reports every press through the binding `binding`.
const pressScript = (binding) =>
  `(${reportPresses})(${JSON.stringify(binding)}, ${JSON.stringify(CLICKABLE)}, ${ELEMENT_FACTS});`;

module.exports = { ELEMENT_FACTS, pressScript };
