// An element Playwright finds by a has-text filter, which matches every such
// element containing the text anywhere, is found by its own whole text, scoped
// by the text before it when the text alone is not unique:
//
//   label >> internal:has-text="Ja"i, written label:has-text("Ja"),   becomes
//   text="Ja"                                                            when unique,
//   text="Ja" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"   else.

const { text, scope } = require("../selector.js");
const { foundByHasText, hasText } = require("../conditions.js");

module.exports = {
  name: "has_text",
  when: {
    recorded: [foundByHasText],
    element: [hasText],
  },
  tryInOrder: ({ element }) => {
    const byText = text(element.text);
    return [byText, [byText, scope(element.scopeText)]];
  },
};
