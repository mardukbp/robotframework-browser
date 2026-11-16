// An element Playwright scopes by the id of an ancestor, often generated, is
// scoped by the text the user sees before it instead:
//
//   [id="#category--12-content"] >> role=link[name*="RFCP® Robot Framework®"i]
//   becomes   role=link[name*="RFCP® Robot Framework®"i] >> scope="Robot Framework"
//
// A link may navigate away before the selector is checked; the kit then checks
// it against the snapshot taken when the link was pressed.

const { scope } = require("../selector.js");

const lastIdPart = ({ rest }) => rest.findLastIndex(({ engine }) => engine === "id");

module.exports = {
  name: "caption_scope",
  skip: (chain) => {
    const index = lastIdPart(chain);
    return index === -1 || index === chain.rest.length - 1;
  },
  candidates: ({ el, chain }) =>
    el.scopeText
      ? [[...chain.rest.slice(lastIdPart(chain) + 1), scope(el.scopeText)]]
      : [],
};
