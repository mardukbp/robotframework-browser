// The JS extension the RecorderSelectors plugin loads: Browser's recorder
// hook, and the scope selector engine.

const { bundle } = require("./bundle.js");
const { RULE_NAMES } = require("./hook.js");
const scopeEngine = require("./scope.js");

// Browser's hook running the rules named in `ruleNames`, in the plugin's order.
// Browser runs a hook's source in the page and names it in the log by its
// name, so the hook is a function named `recorderSelectors` whose source
// holds the bundle of hook.js and everything it requires.
function hookFor(ruleNames) {
  const rewriteActionWith = bundle("hook.js", "rewriteActionWith");
  const source = `function recorderSelectors(args) {
  return ${rewriteActionWith}(${JSON.stringify(ruleNames)})(args);
}`;
  return new Function(`return ${source}`)();
}

module.exports.__rewriteAction = hookFor(RULE_NAMES);

// Called by the plugin when it is imported with rules: only those run.
module.exports.__useRules = (ruleNames) => {
  const unknown = ruleNames.filter((name) => !RULE_NAMES.includes(name));
  if (unknown.length > 0) {
    throw new Error(`RecorderSelectors has no rule ${unknown.join(", ")}; its rules are ${RULE_NAMES.join(", ")}`);
  }
  module.exports.__rewriteAction = hookFor(ruleNames);
};

// Called by the plugin when it is imported, so that recorded `scope=` selectors
// also work when the tests run.
module.exports.__registerScopeEngine = (playwright) =>
  scopeEngine.register(playwright);
