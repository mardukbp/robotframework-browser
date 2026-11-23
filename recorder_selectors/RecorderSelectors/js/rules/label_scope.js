// A form control without a name is found by its role, scoped by the caption
// before it, which older forms put in a plain element instead of a <label>:
//
//   <td><span>Mittelgeber*</span><br><select name="...">...</select></td>
//   css=select >> nth=3   becomes   role=combobox >> scope="Mittelgeber*"
//
// A selector by a label, or by a role and a name, stays, unless it needed `nth=`.

const { role, scope } = require("../selector.js");
const {
  notFoundByUniqueName,
  isFormControl,
  isNamedByLabel,
  hasScope,
  not,
} = require("../conditions.js");

module.exports = {
  name: "label_scope",
  when: {
    recorded: [notFoundByUniqueName],
    element: [isFormControl, not(isNamedByLabel), hasScope],
  },
  tryInOrder: ({ element }) => [[role(element.role), scope(element.scopeText)]],
};
