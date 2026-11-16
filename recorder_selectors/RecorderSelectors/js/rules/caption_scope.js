// An element Playwright scopes by the id of an ancestor, often generated, is
// scoped by the text the user sees before it instead:
//
//   [id="#category--12-content"] >> role=link[name*="RFCP® Robot Framework®"i]
//   becomes   role=link[name*="RFCP® Robot Framework®"i] >> scope="Robot Framework"
//
// A link may navigate away before the selector is checked; run_rules.js then
// checks it against the snapshot taken when the link was pressed.

const { scope } = require("../selector.js");

// The index of the last part that finds an element by its id.
function lastIdPart({ afterFrames }) {
  return afterFrames.findLastIndex(({ engine }) => engine === "id");
}

// Only a chain with an id part before the part that finds the element.
function skip(chain) {
  const index = lastIdPart(chain);
  if (index === -1) return true;
  return index === chain.afterFrames.length - 1;
}

function candidates({ facts, chain }) {
  if (!facts.scopeText) return [];
  const afterId = chain.afterFrames.slice(lastIdPart(chain) + 1);
  return [[...afterId, scope(facts.scopeText)]];
}

module.exports = { name: "caption_scope", skip, candidates };
