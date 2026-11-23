// An element Playwright scopes by an ancestor's id, often generated, or by its
// CSS, is scoped by the text the user sees before it instead:
//
//   [id="#category--12-content"] >> role=link[name*="RFCP® Robot Framework®"i]
//   becomes   role=link[name*="RFCP® Robot Framework®"i] >> scope="Robot Framework"
//
//   pnw-ami-zahlungsart >> internal:text="Nein"i
//   becomes   internal:text="Nein"i >> scope="Ist der Antragsteller auch der Kontoinhaber?*"
//
// A link may navigate away before the selector is checked; run_rules.js then
// checks it against the snapshot taken when the link was pressed.

const { scope } = require("../selector.js");

// The index of the last part that finds an ancestor by its id or its CSS.
function lastAncestorPart({ afterFrames }) {
  return afterFrames.findLastIndex(({ engine }) => engine === "id" || engine === "other");
}

// Only a chain with such a part before the part that finds the element.
function skip(chain) {
  const index = lastAncestorPart(chain);
  if (index === -1) return true;
  return index >= chain.targetIndex;
}

function candidates({ facts, chain }) {
  if (!facts.scopeText) return [];
  const afterAncestor = chain.afterFrames.slice(lastAncestorPart(chain) + 1);
  return [[...afterAncestor, scope(facts.scopeText)]];
}

module.exports = { name: "caption_scope", skip, candidates };
