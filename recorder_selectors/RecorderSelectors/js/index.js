// The JS extension the RecorderSelectors plugin loads. The rules run in this
// order, each on the selector the previous one returned.

const { pipeline } = require("./kit.js");
const scopeEngine = require("./scope.js");

module.exports = pipeline([
  require("./rules/number_widening.js"),
  require("./rules/title_description.js"),
  require("./rules/aria_label.js"),
  require("./rules/label_scope.js"),
  require("./rules/caption_scope.js"),
]);

// Called by the plugin when it is imported, so that recorded `scope=` selectors
// also work when the tests run.
module.exports.__registerScopeEngine = async function registerScopeEngine(
  playwright,
) {
  await scopeEngine.register(playwright);
};
