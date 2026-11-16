// A clicked element whose title equals its text, and is unique on the page, is
// recorded by that title as its description instead of by its name:
//
//   <button aria-label="Close dialog" title="Close">Close</button>
//   role=button[name*="Close dialog"i]   becomes   role=button[description="Close"s]

const { role, nameOf } = require("../selector.js");

// Only a selector by a role and a name.
function skip({ target }) {
  if (target.engine !== "role") return true;
  return !nameOf(target);
}

function candidates({ facts }) {
  if (!facts.role || !facts.title) return [];
  if (facts.title !== facts.text) return [];
  if (facts.hasDescription) return [];
  return [[role(facts.role, { description: facts.title })]];
}

module.exports = {
  name: "title_description",
  actions: ["click"],
  skip,
  candidates,
};
