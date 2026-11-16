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
const lastIdPart = ({ afterFrames }) =>
  afterFrames.findLastIndex(({ engine }) => engine === "id");

module.exports = {
  name: "caption_scope",
  skip: (chain) => {
    const index = lastIdPart(chain);
    return index === -1 || index === chain.afterFrames.length - 1;
  },
  candidates: ({ facts, chain }) =>
    facts.scopeText
      ? [[...chain.afterFrames.slice(lastIdPart(chain) + 1), scope(facts.scopeText)]]
      : [],
};
