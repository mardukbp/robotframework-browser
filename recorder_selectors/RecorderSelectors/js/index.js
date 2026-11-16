// The JS extension the RecorderSelectors plugin loads. A choice in a select is
// first recorded by its labels, on Playwright's own selector; then the selector
// rules run in this order, each on the selector the previous one returned.

const { pipeline } = require("./kit.js");
const scopeEngine = require("./scope.js");
const selectLabels = require("./select_labels.js");

const selectors = pipeline([
  require("./rules/number_widening.js"),
  require("./rules/title_description.js"),
  require("./rules/aria_label.js"),
  require("./rules/label_scope.js"),
  require("./rules/caption_scope.js"),
  require("./rules/exact_names.js"),
]);

module.exports.__recordingStarted = async ({ context }) => {
  await selectors.__recordingStarted({ context });
  await selectLabels.install(context);
};

// Each step gets the Action the one before returned; undefined keeps it.
module.exports.__recordedAction = async (args) => {
  let action = args.action;
  for (const step of [selectLabels.byLabel, selectors.__recordedAction]) {
    action = (await step({ ...args, action })) ?? action;
  }
  return action === args.action ? undefined : action;
};

// Called by the plugin when it is imported, so that recorded `scope=` selectors
// also work when the tests run.
module.exports.__registerScopeEngine = async function registerScopeEngine(
  playwright,
) {
  await scopeEngine.register(playwright);
};
