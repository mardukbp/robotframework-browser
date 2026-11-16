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

const { parsePart } = require("../kit.js");

const flat = (text) => (text || "").replace(/\s+/g, " ").trim();
const isLoose = (text) => text && !text.exact;

// The exact forms of a `role=` part with the exact name `name`.
function exactRoles(target, name, el) {
  const named = parsePart(target.withName(name, true));
  if (!isLoose(target.description)) return [named.raw];
  return [
    named.withAttribute("description", undefined),
    el.description && named.withAttribute("description", el.description, true),
    named.raw,
  ].filter(Boolean);
}

module.exports = {
  name: "exact_names",
  skip: ({ target }) =>
    !target.name || (!isLoose(target.name) && !isLoose(target.description)),
  candidates: ({ el, chain }) => {
    const { target, rest } = chain;
    const index = rest.lastIndexOf(target.raw);
    const names = [
      ...new Set(
        [target.name.value, el.name, el.text, ...el.texts]
          .map(flat)
          .filter(Boolean),
      ),
    ];
    const exactParts =
      target.engine === "role"
        ? names.flatMap((name) => exactRoles(target, name, el))
        : [
            ...(target.engine === "text"
              ? names.map((name) => `text=${JSON.stringify(name)}`)
              : []),
            ...names.map((name) => target.withName(name, true)),
          ];
    return exactParts.map((exact) =>
      rest.map((part, i) => (i === index ? exact : part)),
    );
  },
};
