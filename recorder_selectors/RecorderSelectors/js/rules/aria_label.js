// An element with an explicit role and aria-label, such as the value help icon
// of a SAP Fiori input, is found by both instead of by its generated id:
//
//   #APD_\:\:SalesOrderType-inner-vhi   becomes
//   role=button[name="Wertehilfe einblenden"s]                               when unique,
//   role=button[name="Wertehilfe einblenden"s] >> scope="Kundenauftragsart"  else,
//   role=button[name="Wertehilfe einblenden"s] >> nth=2                      else.
//
// A selector Playwright already made from a role and a name stays, unless it
// needed `nth=`. The click may open a dialog that hides the form with
// aria-hidden, so the selectors are checked among hidden elements too.

const { role, scope } = require("../selector.js");
const {
  notFoundByUniqueRoleAndName,
  hasExplicitRole,
  hasAriaLabel,
  isLabelledByOthers,
  not,
} = require("../conditions.js");

module.exports = {
  name: "aria_label",
  when: {
    recorded: [notFoundByUniqueRoleAndName],
    element: [hasExplicitRole, hasAriaLabel, not(isLabelledByOthers)],
  },
  tryInOrder: ({ element }) => {
    const byAriaLabel = role(element.explicitRole, { name: element.ariaLabel });
    return [byAriaLabel, [byAriaLabel, scope(element.scopeText)]];
  },
  checkHiddenElementsToo: true,
  otherwiseUseIndex: true,
};
