// A clicked element whose title equals its text, and is unique on the page, is
// recorded by that title as its description instead of by its name:
//
//   <button aria-label="Close dialog" title="Close">Close</button>
//   role=button[name*="Close dialog"i]   becomes   role=button[description="Close"s]

const { role, nameOf } = require("../selector.js");

module.exports = {
  name: "title_description",
  actions: ["click"],
  skip: ({ target }) => target.engine !== "role" || !nameOf(target),
  candidates: ({ el }) =>
    el.role && el.title && el.title === el.text && !el.hasDescription
      ? [[role(el.role, { description: el.title })]]
      : [],
};
