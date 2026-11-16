// The name or text a selector finds its element by is matched exactly, with
// the element's whole name, instead of case-insensitively by a part of it:
//
//   role=link[name*="RFCP® Robot Framework®"i]   becomes
//   role=link[name="RFCP® Robot Framework® Certified Professional"s]
//
// A description that is not exact is left out when the exact name is enough,
// and made exact otherwise: role=link[name*="Akademie"i][description*="Akademie"i]
// becomes role=link[name="Akademie"s].
//
// A text is tried first as `text="..."`, which compares only the element's
// own text nodes; when that does not find the element, the exact internal
// form is used, which Browser writes as an anchored regular expression.

const { replaceAt } = require("../fp.js");
const {
  nameOf,
  attributeOf,
  withName,
  withAttribute,
  text,
} = require("../selector.js");

// Only a selector whose name, or description, is not matched exactly yet.
function skip({ target }) {
  const name = nameOf(target);
  if (!name) return true;
  return !isLoose(name) && !isLoose(descriptionOf(target));
}

// The chain with the target part made exact, for every name the element may
// be found by.
function candidates({ facts, chain }) {
  const { target, afterFrames, targetIndex } = chain;
  const names = namesOf(target, facts);
  let exactParts;
  if (target.engine === "role") {
    exactParts = names.flatMap((name) => exactRoles(target, name, facts));
  } else {
    exactParts = exactTexts(target, names);
  }
  return exactParts.map((exact) => replaceAt(afterFrames, targetIndex, exact));
}

// The names to try: the one Playwright recorded, then the element's own.
function namesOf(target, facts) {
  const names = [nameOf(target).value, facts.name, facts.text, ...facts.texts]
    .map(normalizeSpace)
    .filter(Boolean);
  return [...new Set(names)];
}

// The exact forms of a `role` part with the exact name `name`: without a loose
// description, with it made exact, or with it as it was.
function exactRoles(target, name, facts) {
  const named = withName(target, name, true);
  if (!isLoose(descriptionOf(target))) return [named];
  const forms = [withAttribute(named, "description", undefined)];
  if (facts.description) {
    forms.push(withAttribute(named, "description", facts.description, true));
  }
  forms.push(named);
  return forms;
}

// The exact forms of a `text` or `label` part: `text="..."` first, for a text.
function exactTexts(target, names) {
  const exact = names.map((name) => withName(target, name, true));
  if (target.engine !== "text") return exact;
  return [...names.map(text), ...exact];
}

function isLoose(text) {
  return Boolean(text) && !text.exact;
}

function descriptionOf(part) {
  return attributeOf(part, "description");
}

function normalizeSpace(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

module.exports = { name: "exact_names", skip, candidates };
