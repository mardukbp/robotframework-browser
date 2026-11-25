// The JS extension the RecorderSelectors plugin loads: Browser's recorder
// hook, and the scope selector engine.

const { bundle } = require("./bundle.js");
const scopeEngine = require("./scope.js");

// Browser runs it in the page, at the moment of each Action: see hook.js.
module.exports.__rewriteAction = bundle("hook.js", "rewriteAction");

// Called by the plugin when it is imported, so that recorded `scope=` selectors
// also work when the tests run.
module.exports.__registerScopeEngine = (playwright) =>
  scopeEngine.register(playwright);
