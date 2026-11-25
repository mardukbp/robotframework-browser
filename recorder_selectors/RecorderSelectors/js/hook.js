// The `__rewriteSelector` hook of the plugin, which Browser runs in the page
// (bundle.js puts it and what it requires into one function).

const { pipeline, selectorStep } = require("./run_rules.js");
const idEngine = require("./id_engine.js");

// The selector rules, in order, each on the selector the one before returned.
const SELECTOR_RULES = [
  require("./rules/number_widening.js"),
  require("./rules/has_text.js"),
  require("./rules/title_description.js"),
  require("./rules/aria_label.js"),
  require("./rules/label_scope.js"),
  require("./rules/caption_scope.js"),
  require("./rules/exact_names.js"),
];

// The selector rules run first; last, the CSS ids left are written with the
// id engine.
module.exports.rewriteSelector = pipeline([...SELECTOR_RULES.map(selectorStep), idEngine.step]);
