// The name or text a selector finds its element by is matched exactly, with
// the element's whole name, instead of case-insensitively by a part of it:
//
//   role=link[name*="RFCP® Robot Framework®"i]   becomes
//   role=link[name="RFCP® Robot Framework® Certified Professional"s]

const flat = (text) => (text || "").replace(/\s+/g, " ").trim();

module.exports = {
  name: "exact_names",
  skip: ({ target }) => !target.name || target.name.exact,
  candidates: ({ el, chain }) => {
    const { target, rest } = chain;
    const index = rest.lastIndexOf(target.raw);
    const names = new Set(
      [target.name.value, el.name, el.text, ...el.texts]
        .map(flat)
        .filter(Boolean),
    );
    return [...names].map((name) =>
      rest.map((part, i) => (i === index ? target.withName(name, true) : part)),
    );
  },
};
