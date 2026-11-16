// A form control without an accessible name is recorded by the caption beside
// it, which older forms put in a plain element instead of a <label>:
//
//   <td><span>Mittelgeber*</span><br><select name="...">...</select></td>
//   css=select >> nth=3   becomes   role=combobox >> scope="Mittelgeber*"

const { role, scope, nameOf } = require("../selector.js");

// A selector by a label, or by a role and a name, is kept, unless it needed `nth=`.
function skip({ target, nth }) {
  if (nth) return false;
  if (target.engine === "label") return true;
  return target.engine === "role" && Boolean(nameOf(target));
}

function candidates({ facts }) {
  if (!facts.isControl || facts.hasName) return [];
  if (!facts.scopeText) return [];
  return [[role(facts.role), scope(facts.scopeText)]];
}

module.exports = { name: "label_scope", skip, candidates };
