// An element with an explicit role and aria-label, such as the value help icon
// of a SAP Fiori input, is recorded by both instead of by its generated id:
//
//   #APD_\:\:SalesOrderType-inner-vhi   becomes
//   role=button[name="Wertehilfe einblenden"s]                            when unique,
//   role=button[name="Wertehilfe einblenden"s] >> scope="Kundenauftragsart"  else,
//   role=button[name="Wertehilfe einblenden"s] >> nth=2                   else.
//
// The click may open a dialog that hides the form with aria-hidden, so the
// candidates are checked with include-hidden.

const { role, scope, nameOf } = require("../selector.js");

module.exports = {
  name: "aria_label",
  skip: ({ target, nth }) =>
    !nth && target.engine === "role" && Boolean(nameOf(target)),
  includeHidden: true,
  fallback: "nth",
  candidates: ({ facts }) => {
    if (!facts.explicitRole || !facts.ariaLabel || facts.hasLabelledBy) return [];
    const named = role(facts.explicitRole, { name: facts.ariaLabel });
    return [[named], facts.scopeText && [named, scope(facts.scopeText)]];
  },
};
