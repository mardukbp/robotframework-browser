// The `__rewriteAction` hook of the plugin, which Browser runs in the page
// (bundle.js puts it and what it requires into one function). The plugin
// changes only the selector of an Action.

const { pipeline, selectorStep } = require("./run_rules.js");
const idEngine = require("./id_engine.js");

// Every step, in the order that makes sense, each on the selector the one before
// returned: the rules that choose what the element is found by, then
// exact_names, which makes the name they chose exact, and last the id engine,
// for the CSS ids left.
const STEPS = [
  require("./rules/number_widening.js"),
  require("./rules/has_text.js"),
  require("./rules/title_description.js"),
  require("./rules/aria_label.js"),
  require("./rules/label_scope.js"),
  require("./rules/caption_scope.js"),
  require("./rules/exact_names.js"),
]
  .map(selectorStep)
  .concat(idEngine.step);

const RULE_NAMES = STEPS.map((step) => step.name);

// Browser's hook running the steps named in `ruleNames`, in the order of STEPS.
function rewriteActionWith(ruleNames) {
  const rewriteSelector = pipeline(STEPS.filter((step) => ruleNames.includes(step.name)));
  return ({ action, element, query, log }) => {
    const selector = rewriteSelector({ name: action.name, selector: action.selector, element, query, log });
    if (selector === undefined) return undefined;
    return { selector };
  };
}

module.exports = { RULE_NAMES, rewriteActionWith };
