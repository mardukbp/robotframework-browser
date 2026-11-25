// What the rules read of the recorded element. Runs in the page, inside the
// extension's hook (see bundle.js).

const { scopeOf } = require("./scope.js");

// What the rules read as `element`: a description of `element` that
// approximates what Playwright computes. It chooses the selectors to try;
// Playwright's own engines decide whether one finds the element.
function describeElement(element) {
  function normalizeSpace(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function attributeText(e, name) {
    return normalizeSpace(e.getAttribute(name));
  }

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

  function roleOf(e) {
    const explicit = explicitRoleOf(e);
    if (explicit) return explicit;
    return implicitRoleOf(e);
  }

  function explicitRoleOf(e) {
    return attributeText(e, "role").split(" ")[0];
  }

  function implicitRoleOf(e) {
    const tag = e.localName;
    if (tag === "a" || tag === "area") {
      if (e.hasAttribute("href")) return "link";
      return "";
    }
    if (tag === "button") return "button";
    if (tag === "textarea") return "textbox";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "select") {
      if (e.multiple || e.size > 1) return "listbox";
      return "combobox";
    }
    if (tag === "input") return inputRoleOf(e);
    return "";
  }

  function inputRoleOf(input) {
    const type = (input.getAttribute("type") || "text").toLowerCase();
    if (type in INPUT_ROLES) return INPUT_ROLES[type];
    if (input.hasAttribute("list")) return "combobox";
    return "textbox";
  }

  // --- names and descriptions

  function textsOfIdsIn(e, name) {
    const ids = (e.getAttribute(name) || "").split(/\s+/).filter(Boolean);
    return ids
      .map((id) => e.getRootNode().getElementById?.(id))
      .filter(Boolean)
      .map((referenced) => referenced.textContent);
  }

  function labelTextsOf(e) {
    return [...(e.labels || [])].map((label) => label.textContent);
  }

  function isFormField(e) {
    return ["input", "select", "textarea"].includes(e.localName);
  }

  // The name from everything but the title, which names an element only when
  // nothing else does.
  function nameBeforeTitleOf(e) {
    const labelledBy = normalizeSpace(textsOfIdsIn(e, "aria-labelledby").join(" "));
    if (labelledBy) return labelledBy;
    const ariaLabel = attributeText(e, "aria-label");
    if (ariaLabel) return ariaLabel;
    const labels = normalizeSpace(labelTextsOf(e).join(" "));
    if (labels) return labels;
    if (isFormField(e)) return "";
    return normalizeSpace(e.textContent);
  }

  function nameOf(e) {
    return (
      nameBeforeTitleOf(e) ||
      attributeText(e, "title") ||
      attributeText(e, "alt") ||
      attributeText(e, "placeholder")
    );
  }

  // The title describes an element whenever something else names it.
  function descriptionOf(e) {
    const describedBy = normalizeSpace(
      textsOfIdsIn(e, "aria-describedby").join(" "),
    );
    if (describedBy) return describedBy;
    const ariaDescription = attributeText(e, "aria-description");
    if (ariaDescription) return ariaDescription;
    if (nameBeforeTitleOf(e)) return attributeText(e, "title");
    return "";
  }

  // Every text the element may be found by, as it is in the page.
  function textsOf(e) {
    const labelledBy = textsOfIdsIn(e, "aria-labelledby");
    const attributes = ["aria-label", "title", "alt", "placeholder"].map(
      (name) => e.getAttribute(name),
    );
    const texts = [
      e.textContent,
      ...labelTextsOf(e),
      ...attributes,
      ...labelledBy,
      labelledBy.join(" "),
    ];
    return texts.filter((text) => typeof text === "string" && text.trim() !== "");
  }

  // --- the description

  const role = roleOf(element);
  const ariaLabel = attributeText(element, "aria-label");
  const hasLabelledBy = element.hasAttribute("aria-labelledby");
  const hasLabel = labelTextsOf(element).length > 0;
  const described = {
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
    texts: textsOf(element),
  };
  return described;
}

module.exports = { describeElement };
