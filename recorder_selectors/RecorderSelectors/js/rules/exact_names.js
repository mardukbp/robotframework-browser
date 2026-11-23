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
const { foundByName, matchedLoosely } = require("../conditions.js");

module.exports = {
  name: "exact_names",
  when: {
    recorded: [foundByName, matchedLoosely],
  },
  tryInOrder: ({ recorded, element }) => {
    const { target, insideFrames, targetIndex } = recorded;
    return exactTargets(target, element).map((exact) =>
      replaceAt(insideFrames, targetIndex, exact),
    );
  },
};

// The target made exact, for every name the element may be found by.
function exactTargets(target, element) {
  const names = namesOf(target, element);
  if (target.engine === "role") {
    return names.flatMap((name) => exactRoles(target, name, element));
  }
  return exactTexts(target, names);
}

// The names to try: the one Playwright recorded, then the element's own.
function namesOf(target, element) {
  const names = [nameOf(target).value, element.name, element.text, ...element.texts]
    .map(normalizeSpace)
    .filter(Boolean);
  return [...new Set(names)];
}

// A `role` part with the exact name `name`: without a loose description, with
// it made exact, or with it as it was.
function exactRoles(target, name, element) {
  const named = withName(target, name, true);
  const description = attributeOf(target, "description");
  if (!description || description.exact) return [named];
  const forms = [withAttribute(named, "description", undefined)];
  if (element.description) {
    forms.push(withAttribute(named, "description", element.description, true));
  }
  forms.push(named);
  return forms;
}

// A `text` or `label` part with each exact name: `text="..."` first, for a text.
function exactTexts(target, names) {
  const exact = names.map((name) => withName(target, name, true));
  if (target.engine !== "text") return exact;
  return [...names.map(text), ...exact];
}

function normalizeSpace(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}
