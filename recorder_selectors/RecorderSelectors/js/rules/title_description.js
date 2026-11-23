// A clicked element with a title, unique on the page, is recorded by that title
// as its description instead of by its name:
//
//   <button aria-label="Close dialog" title="Close">Close</button>
//   role=button[name*="Close dialog"i]   becomes   role=button[description="Close"s]
//
//   <button title="Suche löschen"><i class="fo fo-delete"></i></button>, named
//   by the glyph of its icon font:
//   role=button[name="t"s]   becomes   role=button[description="Suche löschen"s]
//
// The check in the page decides whether the title finds the element as its
// description; a title used by several elements keeps the name.

const { role, nameOf } = require("../selector.js");

// Only a selector by a role and a name.
function skip({ target }) {
  if (target.engine !== "role") return true;
  return !nameOf(target);
}

function candidates({ facts }) {
  if (!facts.role || !facts.title) return [];
  if (facts.hasDescription) return [];
  return [[role(facts.role, { description: facts.title })]];
}

module.exports = {
  name: "title_description",
  actions: ["click"],
  skip,
  candidates,
};
