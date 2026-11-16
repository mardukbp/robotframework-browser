// The JS extension the RecorderSelectors plugin loads. Its steps run in this
// order, each on the Action the one before gave: a choice in a select is first
// recorded by its labels, on Playwright's own selector; then the selector rules
// run, each on the selector the one before returned.

const { pipeline, selectorStep, installPresses } = require("./kit.js");
const scopeEngine = require("./scope.js");
const selectLabels = require("./select_labels.js");

module.exports.__recordedAction = pipeline([
  selectLabels.step,
  ...[
    require("./rules/number_widening.js"),
    require("./rules/title_description.js"),
    require("./rules/aria_label.js"),
    require("./rules/label_scope.js"),
    require("./rules/caption_scope.js"),
    require("./rules/exact_names.js"),
  ].map(selectorStep),
]);

module.exports.__recordingStarted = async ({ context }) => {
  await installPresses(context);
  await selectLabels.install(context);
};

// Called by the plugin when it is imported, so that recorded `scope=` selectors
// also work when the tests run.
module.exports.__registerScopeEngine = async function registerScopeEngine(
  playwright,
) {
  await scopeEngine.register(playwright);
};
