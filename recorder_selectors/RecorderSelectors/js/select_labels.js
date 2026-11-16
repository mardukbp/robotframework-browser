// A choice in a select is recorded by the labels of the chosen options instead
// of their values, which are often generated:
//
//   Select Options By    id=make    value    14: 6792    becomes
//   Select Options By    id=make    label    AMELUNG
//
// Playwright reports the choice only after the page has handled it, and a page
// may relabel an option when it is chosen. So the labels are noted in the page
// as the choice happens, by a capture listener at window that an init script
// adds before the page's own scripts run, in every frame. A value gets its
// label only when its option alone had that label then, and still has it, alone,
// when the Action arrives; when any value has no such label, the values stay.

const NOTED = "__rfbRecorderSelectorsChosenLabels";
const TIMEOUT_MS = 500;

// Runs in every frame: notes, on the select, the label of each chosen option
// that names it alone, or null.
function noteChosenLabels(noted) {
  if (window[`${noted}Installed`]) return;
  window[`${noted}Installed`] = true;
  window.addEventListener(
    "input",
    (event) => {
      const select = event.composedPath()[0];
      if (!select || select.localName !== "select") return;
      const options = Array.from(select.options);
      const alone = (label) =>
        label && options.filter((option) => option.label === label).length === 1;
      select[noted] = new Map(
        Array.from(select.selectedOptions, (option) => [
          option.value,
          alone(option.label) ? option.label : null,
        ]),
      );
    },
    true,
  );
}

// The page script that notes the chosen labels; see `install` in kit.js.
const CHOICES = { script: `(${noteChosenLabels})(${JSON.stringify(NOTED)});` };

// In the page: the label of each value, or null when it has none to record:
// its option alone has the value and the label, and had that label when chosen.
function labelsOf(select, [values, noted]) {
  const options = Array.from(select.options);
  const count = (key, value) => options.filter((o) => o[key] === value).length;
  const chosen = select[noted] instanceof Map ? select[noted] : new Map();
  const labelOf = (value) => {
    const label = options.find((o) => o.value === value)?.label;
    return label &&
      count("value", value) === 1 &&
      count("label", label) === 1 &&
      chosen.get(value) === label
      ? label
      : null;
  };
  return values.map(labelOf);
}

// A choice Playwright reports by value, in a page to look the labels up in.
const isChoice = ({ name, by, selector, options }, page) =>
  name === "select" &&
  by === undefined &&
  typeof selector === "string" &&
  Array.isArray(options) &&
  options.length > 0 &&
  typeof page?.locator === "function";

// The select Action by label, or undefined to keep it.
async function byLabel({ action, page }) {
  if (!isChoice(action, page)) return undefined;
  const labels = await page
    .locator(action.selector)
    .evaluate(labelsOf, [action.options, NOTED], { timeout: TIMEOUT_MS });
  if (labels.every((label) => typeof label === "string"))
    return { ...action, by: "label", options: labels };
  console.log(
    `recorder_selectors select_labels: ${action.selector} kept by value: an option has no label of its own`,
  );
  return undefined;
}

module.exports = {
  pageScript: CHOICES,
  step: { name: "select_labels", run: byLabel },
};
