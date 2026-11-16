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

// The property of a select where the page notes the labels chosen in it.
const CHOSEN_LABELS = "__rfbRecorderSelectorsChosenLabels";
const TIMEOUT_MS = 500;

// The select Action by label, or undefined to keep it.
async function recordByLabel({ action, page }) {
  if (!isChoiceByValue(action, page)) return undefined;
  const labels = await page
    .locator(action.selector)
    .evaluate(recordableLabels, [action.options, CHOSEN_LABELS], {
      timeout: TIMEOUT_MS,
    });
  if (labels.every((label) => typeof label === "string"))
    return { ...action, by: "label", options: labels };
  console.log(
    `recorder_selectors select_labels: ${action.selector} kept by value: an option has no label of its own`,
  );
  return undefined;
}

// A choice Playwright reports by value, in a page to look the labels up in.
const isChoiceByValue = ({ name, by, selector, options }, page) =>
  name === "select" &&
  by === undefined &&
  typeof selector === "string" &&
  Array.isArray(options) &&
  options.length > 0 &&
  typeof page?.locator === "function";

// In the page: the label to record for each value, or null when it has none:
// only its option has the value and the label, and it had that label when chosen.
function recordableLabels(select, [values, chosenLabels]) {
  const options = Array.from(select.options);
  const optionsWith = (key, value) =>
    options.filter((option) => option[key] === value).length;
  const chosen =
    select[chosenLabels] instanceof Map ? select[chosenLabels] : new Map();
  const labelOf = (value) => {
    const label = options.find((option) => option.value === value)?.label;
    return label &&
      optionsWith("value", value) === 1 &&
      optionsWith("label", label) === 1 &&
      chosen.get(value) === label
      ? label
      : null;
  };
  return values.map(labelOf);
}

// In every frame: at each choice, notes on the select the label of each chosen
// option that no other option has, or null.
function noteChosenLabels(chosenLabels) {
  if (window[`${chosenLabels}Installed`]) return;
  window[`${chosenLabels}Installed`] = true;
  const note = (event) => {
    const select = event.composedPath()[0];
    if (!select || select.localName !== "select") return;
    const options = Array.from(select.options);
    const isOwnLabel = (label) =>
      label && options.filter((option) => option.label === label).length === 1;
    select[chosenLabels] = new Map(
      Array.from(select.selectedOptions, (option) => [
        option.value,
        isOwnLabel(option.label) ? option.label : null,
      ]),
    );
  };
  window.addEventListener("input", note, true);
}

// The page script that notes the chosen labels; see page_scripts.js.
const NOTE_CHOSEN_LABELS = {
  script: `(${noteChosenLabels})(${JSON.stringify(CHOSEN_LABELS)});`,
};

module.exports = {
  pageScript: NOTE_CHOSEN_LABELS,
  step: { name: "select_labels", run: recordByLabel },
};
