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

const SCRIPT = `(${noteChosenLabels})(${JSON.stringify(NOTED)});`;

const prepared = new WeakSet();

async function install(context) {
  if (prepared.has(context)) return;
  prepared.add(context);
  await context.addInitScript(SCRIPT);
  for (const page of context.pages())
    for (const frame of page.frames())
      await frame.evaluate(SCRIPT).catch(() => undefined);
}

// In the page: the label of each value, or null when it has none to record.
function labelsOf(select, [values, noted]) {
  const chosen = select[noted];
  if (!(chosen instanceof Map)) return values.map(() => null);
  const options = Array.from(select.options);
  return values.map((value) => {
    const matches = options.filter((option) => option.value === value);
    if (matches.length !== 1) return null;
    const { label } = matches[0];
    if (!label || chosen.get(value) !== label) return null;
    return options.filter((option) => option.label === label).length === 1
      ? label
      : null;
  });
}

// The select Action by label, or undefined to keep it.
async function byLabel({ action, page }) {
  const { selector, options } = action;
  if (action.name !== "select" || action.by !== undefined) return undefined;
  if (typeof selector !== "string" || typeof page?.locator !== "function")
    return undefined;
  if (!Array.isArray(options) || options.length === 0) return undefined;
  const labels = await page
    .locator(selector)
    .evaluate(labelsOf, [options, NOTED], { timeout: TIMEOUT_MS });
  if (!labels.every((label) => typeof label === "string")) {
    console.log(
      `recorder_selectors select_labels: ${selector} kept by value: an option has no label of its own`,
    );
    return undefined;
  }
  return { ...action, by: "label", options: labels };
}

module.exports = { install, step: { name: "select_labels", run: byLabel } };
