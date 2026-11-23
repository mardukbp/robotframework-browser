// An element Playwright records by CSS with `:has-text()`, which matches every
// such element that contains the text anywhere, is recorded by its own whole
// text, scoped by the text before it when the text alone is not unique:
//
//   label:has-text("Ja")   becomes   text="Ja"                     when unique,
//   text="Ja" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"   else.

const { text, scope } = require("../selector.js");

// Only a selector whose element is found by `:has-text()`.
function skip({ target }) {
  return target.engine !== "hasText";
}

function candidates({ facts }) {
  if (!facts.text) return [];
  const byText = text(facts.text);
  if (!facts.scopeText) return [[byText]];
  return [[byText], [byText, scope(facts.scopeText)]];
}

module.exports = { name: "has_text", skip, candidates };
