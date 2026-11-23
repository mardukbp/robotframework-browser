// A clicked element with a title is found by that title as its description,
// instead of by its name:
//
//   <button aria-label="Close dialog" title="Close">Close</button>
//   role=button[name*="Close dialog"i]   becomes   role=button[description="Close"s]
//
//   <button title="Suche löschen"><i class="fo fo-delete"></i></button>, named
//   by the glyph of its icon font:
//   role=button[name="t"s]   becomes   role=button[description="Suche löschen"s]
//
// A title that several elements share finds none of them alone, so the name stays.

const { role } = require("../selector.js");
const {
  isClick,
  foundByRoleAndName,
  hasRole,
  hasTitle,
  hasDescriptionOfItsOwn,
  not,
} = require("../conditions.js");

module.exports = {
  name: "title_description",
  when: {
    action: [isClick],
    recorded: [foundByRoleAndName],
    element: [hasRole, hasTitle, not(hasDescriptionOfItsOwn)],
  },
  tryInOrder: ({ element }) => [role(element.role, { description: element.title })],
};
