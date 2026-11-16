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

const { assoc } = require("../fp.js");
const {
  nameOf,
  attributeOf,
  withName,
  withAttribute,
  text,
} = require("../selector.js");

const flat = (text) => (text || "").replace(/\s+/g, " ").trim();
const isLoose = (text) => text && !text.exact;
const descriptionOf = (part) => attributeOf(part, "description");
const unique = (xs) => [...new Set(xs)];

// The exact forms of a `role` part with the exact name `name`.
function exactRoles(target, name, el) {
  const named = withName(target, name, true);
  if (!isLoose(descriptionOf(target))) return [named];
  return [
    withAttribute(named, "description", undefined),
    el.description &&
      withAttribute(named, "description", el.description, true),
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
  candidates: ({ el, chain: { target, rest, targetIndex } }) => {
    const names = unique(
      [nameOf(target).value, el.name, el.text, ...el.texts]
        .map(flat)
        .filter(Boolean),
    );
    const exactParts =
      target.engine === "role"
        ? names.flatMap((name) => exactRoles(target, name, el))
        : exactTexts(target, names);
    return exactParts.map((exact) => assoc(rest, targetIndex, exact));
  },
};
