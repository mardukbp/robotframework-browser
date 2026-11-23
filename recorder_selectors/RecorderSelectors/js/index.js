// The JS extension the RecorderSelectors plugin loads: Browser's recorder hooks,
// and the scope selector engine.

const { pipeline, selectorStep } = require("./run_rules.js");
const { install, PRESSES } = require("./page_scripts.js");
const scopeEngine = require("./scope.js");
const selectLabels = require("./select_labels.js");

// The selector rules, in order, each on the selector the one before returned.
const SELECTOR_RULES = [
  require("./rules/number_widening.js"),
  require("./rules/title_description.js"),
  require("./rules/aria_label.js"),
  require("./rules/label_scope.js"),
  require("./rules/caption_scope.js"),
  require("./rules/exact_names.js"),
  require("./rules/id_engine.js"),
];

// A choice in a select is first recorded by its labels, on Playwright's own
// selector; then the selector rules run.
module.exports.__recordedAction = pipeline([
  selectLabels.step,
  ...SELECTOR_RULES.map(selectorStep),
]);

// Before the first recording in a context: the press snapshot and the chosen
// labels are taken in the page.
module.exports.__recordingStarted = ({ context }) =>
  install(context, [PRESSES, selectLabels.pageScript]);

// Called by the plugin when it is imported, so that recorded `scope=` selectors
// also work when the tests run.
module.exports.__registerScopeEngine = (playwright) =>
  scopeEngine.register(playwright);
