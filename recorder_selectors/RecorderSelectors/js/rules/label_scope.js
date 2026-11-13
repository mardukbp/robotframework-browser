// A form control without an accessible name is recorded by the caption beside
// it, which older forms put in a plain element instead of a <label>:
//
//   <td><span>Mittelgeber*</span><br><select name="...">...</select></td>
//   css=select >> nth=3   becomes   role=combobox >> scope="Mittelgeber*"

const { role, scope } = require("../kit.js");

module.exports = {
  name: "label_scope",
  skip: ({ target, nth }) =>
    !nth &&
    (target.engine === "label" || (target.engine === "role" && target.name)),
  candidates: ({ el }) =>
    el.isControl && !el.hasName && el.scopeText
      ? [[role(el.role), scope(el.scopeText)]]
      : [],
};
