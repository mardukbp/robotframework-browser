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

const normalizeSpace = (text) => (text || "").replace(/\s+/g, " ").trim();
const isLoose = (text) => text && !text.exact;
const descriptionOf = (part) => attributeOf(part, "description");
const unique = (xs) => [...new Set(xs)];

// The exact forms of a `role` part with the exact name `name`.
function exactRoles(target, name, facts) {
  const named = withName(target, name, true);
  if (!isLoose(descriptionOf(target))) return [named];
  return [
    withAttribute(named, "description", undefined),
    facts.description &&
      withAttribute(named, "description", facts.description, true),
    named,
  ].filter(Boolean);
}

// The exact forms of a `text` or `label` part: `text="..."` first, for a text.
const exactTexts = (target, names) => [
  ...(target.engine === "text" ? names.map(text) : []),
  ...names.map((name) => withName(target, name, true)),
];

module.exports = {
  name: "exact_names",
  skip: ({ target }) => {
    const name = nameOf(target);
    return !name || (!isLoose(name) && !isLoose(descriptionOf(target)));
  },
  candidates: ({ facts, chain: { target, afterFrames, targetIndex } }) => {
    const names = unique(
      [nameOf(target).value, facts.name, facts.text, ...facts.texts]
        .map(normalizeSpace)
        .filter(Boolean),
    );
    const exactParts =
      target.engine === "role"
        ? names.flatMap((name) => exactRoles(target, name, facts))
        : exactTexts(target, names);
    return exactParts.map((exact) => replaceAt(afterFrames, targetIndex, exact));
  },
};
