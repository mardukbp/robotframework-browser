// Runs the rules on a recorded Action and checks in the page what they propose.
// It reads from the top down: the hook, a step, a rule, the two kinds of rule,
// and last the questions asked of the page.
//
// A step is `{ name, run }`: `run({ action, page, context })` gives the Action
// to record, or undefined to keep it, as Browser's `__recordedAction` does.
//
// A rule says when it applies and which selectors to try then, in the manner
// of Clara Rules. It tests three facts with the conditions of conditions.js:
//
//   action    the Action Playwright recorded
//   recorded  the selector Playwright recorded, as data (`parse` in selector.js)
//   element   the description of the recorded element (`describeElement` in page.js)
//
// A rule:
//
//   name        for the log in playwright-log.txt.
//   when        `{ action, recorded, element }`, each a list of conditions on
//               that fact; the rule applies when all of them hold.
//   tryInOrder  `({ recorded, element }) => [selector, ...]`: the selectors to
//               try, each a part or a list of parts (see selector.js) without
//               the frames. The first that finds only the recorded element is
//               recorded. A selector with a missing part is left out, so
//               `[part, scope(element.scopeText)]` needs no scope to be there.
//   checkHiddenElementsToo  optional: look for `role` parts among hidden
//               elements too, for a click that hides the page behind a dialog.
//   otherwiseUseIndex  optional: when no selector finds only the element, the
//               first one with `>> nth=<index>` of the element.
//
// When the recorded selector no longer finds the element, for example after a
// click navigated, the selectors are checked against the snapshot taken at the
// press.

const { reduceAsync, mapUntilAsync } = require("./fp.js");
const { DESCRIBE_ELEMENT } = require("./page.js");
const { recentPress } = require("./page_scripts.js");
const {
  parse,
  print,
  nameOf,
  attributeOf,
  withHidden,
} = require("./selector.js");

const TIMEOUT_MS = 500;

// ---------------------------------------------------------------- the hook

// The `__recordedAction` hook of the steps: each runs on the Action the one
// before gave.
function pipeline(steps) {
  return async function recordedAction({ action, page, context }) {
    const runNext = (current, step) => runStep(step, current, page, context);
    const recorded = await reduceAsync(steps, runNext, action);
    if (recorded === action) return undefined;
    return recorded;
  };
}

// One step on `action`; a step that fails keeps the Action it got.
async function runStep(step, action, page, context) {
  try {
    const changed = await step.run({ action, page, context });
    if (!changed) return action;
    return changed;
  } catch (error) {
    const what = action.selector ?? action.name;
    logFor(step.name)(`${what} kept: ${error}`);
    return action;
  }
}

// A rule as a step: it changes the selector of an Action that has one.
function selectorStep(rule) {
  async function run({ action, page }) {
    if (!hasSelector(action)) return undefined;
    if (!canAsk(page)) return undefined;
    const selector = await applyRule(rule, action, page);
    if (!selector) return undefined;
    return { ...action, selector };
  }
  return { name: rule.name, run };
}

// ---------------------------------------------------------------- a rule

// The selector `rule` records for `action`, or undefined to keep it.
function applyRule(rule, action, page) {
  const when = rule.when ?? {};
  if (!allHold(when.action, action)) return undefined;
  const recorded = parse(action.selector);
  if (!allHold(when.recorded, recorded)) return undefined;
  return trySelectors(rule, page, recorded);
}

function allHold(conditions, fact) {
  return (conditions ?? []).every((condition) => condition(fact));
}

// ------------------------------------------------------ trying its selectors

// The first selector of `rule` that finds only the recorded element.
async function trySelectors(rule, page, recorded) {
  const log = logFor(rule.name);
  const found = await findRecordedElement(page, recorded);
  if (!found.element) {
    log(`${recorded.selector} finds ${found.count} elements, kept`);
    return undefined;
  }
  try {
    const proposed = selectorsToTry(rule, { recorded, element: found.element });
    const checked = await mapUntilAsync(
      proposed,
      (selector) => checkSelector(page, found, recorded, selector, rule),
      findsOnlyTheElement,
    );
    const { selector, rejected } = pickSelector(rule, found, checked);
    rejected.map(whyRejected).forEach(log);
    if (!selector && proposed.length > 0) log(`${recorded.selector} kept`);
    return selector;
  } finally {
    await found.handle?.dispose();
  }
}

// `{ parts, selector }` for each selector `rule` tries, the selector with the
// frames; none when one of its conditions does not hold. It asks nothing of
// the page.
function selectorsToTry(rule, { action, recorded, element }) {
  const when = rule.when ?? {};
  if (action && !allHold(when.action, action)) return [];
  if (!allHold(when.recorded, recorded)) return [];
  if (!allHold(when.element, element)) return [];
  return rule
    .tryInOrder({ recorded, element })
    .map((selector) => [selector].flat())
    .filter((parts) => parts.length > 0 && parts.every(Boolean))
    .map((parts) => ({ parts, selector: print([...recorded.frames, ...parts]) }));
}

// The selector with `match`: how many elements it finds, and where the
// recorded element is among them.
async function checkSelector(page, found, recorded, proposed, rule) {
  let parts = proposed.parts;
  if (rule.checkHiddenElementsToo) parts = parts.map(withHidden);
  const match = await countMatches(page, found, recorded.frames, parts);
  return { ...proposed, match };
}

function findsOnlyTheElement({ match }) {
  if (!match) return false;
  return match.count === 1 && match.index === 0;
}

// `{ selector, rejected }`: the selector that finds only the element, or the
// first one with `nth=` when the rule falls back to that, and the selectors
// rejected before it.
function pickSelector(rule, found, checked) {
  const unique = checked.find(findsOnlyTheElement);
  if (unique) {
    const rejected = checked.slice(0, checked.indexOf(unique));
    return { selector: unique.selector, rejected };
  }
  return { selector: withIndex(rule, found, checked), rejected: checked };
}

// The first checked selector with `>> nth=<index>` of the recorded element,
// when the rule falls back to that and the element is in the page.
function withIndex(rule, found, checked) {
  if (!rule.otherwiseUseIndex) return undefined;
  if (!found.handle) return undefined;
  const first = checked.find(({ match }) => match);
  if (!first || first.match.index < 0) return undefined;
  return `${first.selector} >> nth=${first.match.index}`;
}

function whyRejected({ selector, match }) {
  if (!match) return `${selector} cannot be checked after the page changed`;
  return `${selector} finds ${match.count} elements`;
}

// ---------------------------------------------------- the recorded element

// The recorded element: `{ element, handle }` in the page, `{ element, peers }`
// from the press when the page changed and the press was on what the selector
// names, or else `{ count }`. Playwright makes the selector find only the
// element, so finding none or several means the page changed, for example a
// click navigated to a page with more such elements.
async function findRecordedElement(page, recorded) {
  const locator = page.locator(recorded.selector);
  const count = await locator.count();
  if (count === 1) {
    const handle = await locator.elementHandle({ timeout: TIMEOUT_MS });
    const element = await handle.evaluate(DESCRIBE_ELEMENT, false);
    return { element, handle };
  }
  const pressed = recentPress(page);
  if (wasPressed(pressed, recorded.target) && pressed.peers)
    return { element: pressed, peers: pressed.peers };
  return { count };
}

// Whether `pressed` is what the `role` part `target` names.
function wasPressed(pressed, target) {
  if (!pressed) return false;
  if (target.engine !== "role") return false;
  const name = nameOf(target);
  if (!name) return false;
  return target.role === pressed.role && textMatches(pressed.name, name);
}

// `{ count, index }`: how many elements `parts` finds after `frames`, and the
// index of the recorded element among them; from its peers at the press when
// the page changed, or undefined when that cannot tell.
async function countMatches(page, found, frames, parts) {
  if (!found.handle) return countPeers(found.peers, parts);
  return findElement(page, print([...frames, ...parts]), found.handle);
}

// Like `countMatches`, for a selector of the form `role=...` or
// `role=... >> scope=...`, the only ones the peers can answer for.
function countPeers(peers, [rolePart, scopePart, ...more]) {
  if (rolePart?.engine !== "role") return undefined;
  if (more.length > 0) return undefined;
  if (scopePart && scopePart.engine !== "scope") return undefined;
  const isFound = (peer) => {
    if (peer.role !== rolePart.role) return false;
    if (!textMatches(peer.name, nameOf(rolePart))) return false;
    const description = attributeOf(rolePart, "description");
    if (!textMatches(peer.description, description)) return false;
    if (scopePart && peer.scopeText !== scopePart.text) return false;
    return true;
  };
  const matching = peers.filter(isFound);
  return { count: matching.length, index: matching.findIndex((p) => p.isTarget) };
}

// ------------------------------------------------------ asking the page
//
// Selectors are only counted or turned into element handles, never evaluated
// on a locator: Playwright evaluates a locator in the page's main world, whose
// selector engines may lack `scope`. A page that logs elements to the console
// makes Playwright set up that world while Connect To Browser attaches over
// CDP, before Browser can register the engine there. Counting and element
// handles query in the engine's own world.

// `{ count, index }`: how many elements `selector` finds, and the index of
// `target` among them.
async function findElement(page, selector, target) {
  const all = await page.locator(selector).elementHandles();
  try {
    const index = await target.evaluate((element, found) => found.indexOf(element), all);
    return { count: all.length, index };
  } finally {
    await Promise.all(all.map((handle) => handle.dispose()));
  }
}

// ---------------------------------------------------------------- helpers

function hasSelector({ selector }) {
  return typeof selector === "string" && selector.trim() !== "";
}

function canAsk(page) {
  return typeof page?.locator === "function";
}

// Whether `actual` matches `wanted`, `{ value, exact }`: equal when exact, else
// containing it in any case. An undefined `wanted` matches anything.
function textMatches(actual, wanted) {
  if (!wanted) return true;
  const have = normalizeSpace(actual);
  const want = normalizeSpace(wanted.value);
  if (wanted.exact) return have === want;
  return have.toLowerCase().includes(want.toLowerCase());
}

function normalizeSpace(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function logFor(name) {
  return (message) => console.log(`recorder_selectors ${name}: ${message}`);
}

module.exports = { pipeline, selectorStep, selectorsToTry };
