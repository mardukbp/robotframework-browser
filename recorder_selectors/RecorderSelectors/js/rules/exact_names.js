// The name or text a selector finds its element by is matched exactly, with
// the element's whole name, instead of case-insensitively by a part of it:
//
//   role=link[name*="RFCP® Robot Framework®"i]   becomes
//   role=link[name="RFCP® Robot Framework® Certified Professional"s]
//
// A text is tried first as `text="..."`, which compares only the element's
// own text nodes; when that does not find the element, the exact internal
// form is used, which Browser writes as an anchored regular expression.

const flat = (text) => (text || "").replace(/\s+/g, " ").trim();

module.exports = {
  name: "exact_names",
  skip: ({ target }) => !target.name || target.name.exact,
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
    const exactParts = [
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
