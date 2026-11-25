// Runs the rules on the selector of a recorded Action, in the page, at the
// moment of the Action, and checks there what they propose. It reads from the
// top down: the hook, a step, a rule, and last the questions asked of the page.
//
// Browser runs the hook in the page before the Action has any effect on it
// (see `Record Keyword`, *Changing the recorded selectors*), so the element and
// its page are as the user saw them, as replaying the recording finds them.
//
// A step is `{ name, run }`: `run({ name, selector, element, query, log })`
// gives the selector to record, or undefined to keep it.
//
// A rule says when it applies and which selectors to try then, in the manner
// of Clara Rules. It tests three facts with the conditions of conditions.js:
//
//   name      the name of the Action Playwright recorded, such as "click"
//   recorded  the selector Playwright recorded, as data (`parse` in selector.js)
//   element   the description of the recorded element (`describeElement` in page.js)
//
// A rule:
//
//   name        for the log in playwright-log.txt.
//   when        `{ name, recorded, element }`, each a list of conditions on
//               that fact; the rule applies when all of them hold.
//   tryInOrder  `({ recorded, element }) => [selector, ...]`: the selectors to
//               try, each a part or a list of parts (see selector.js) without
//               the frames. The first that finds only the recorded element is
//               recorded. A selector with a missing part is left out, so
//               `[part, scope(element.scopeText)]` needs no scope to be there.
//   checkHiddenElementsToo  optional: look for `role` parts among hidden
//               elements too, for an element on a page a dialog hides.
//   otherwiseUseIndex  optional: when no selector finds only the element, the
//               first one with `>> nth=<index>` of the element.

const { mapUntil } = require("./fp.js");
const { describeElement } = require("./page.js");
const { parse, print, withHidden } = require("./selector.js");

// ---------------------------------------------------------------- the hook

// Browser's `__rewriteSelector` hook made of the steps: each runs on the
// selector the one before gave. Gives the selector when it changed, or undefined.
function pipeline(steps) {
  return function rewriteSelector({ name, selector, element, query, log, timeLeft }) {
    const ask = { name, element, query, log, described: undefined };
    let current = selector;
    for (const step of steps) {
      if (timeLeft && timeLeft() === 0) {
        log(`recorder_selectors ${step.name}: skipped, out of time`);
        continue;
      }
      current = runStep(step, current, ask);
    }
    if (current === selector) return undefined;
    return current;
  };
}

// One step on `selector`; a step that fails keeps the selector it got.
function runStep(step, selector, ask) {
  try {
    return step.run({ ...ask, selector }) ?? selector;
  } catch (error) {
    ask.log(`recorder_selectors ${step.name}: ${selector} kept: ${error}`);
    return selector;
  }
}

// A rule as a step.
function selectorStep(rule) {
  return { name: rule.name, run: (ask) => applyRule(rule, ask) };
}

// ---------------------------------------------------------------- a rule

// The selector `rule` records for the selector of `ask`, or undefined to keep it.
function applyRule(rule, ask) {
  const when = rule.when ?? {};
  if (!allHold(when.name, ask.name)) return undefined;
  const recorded = parse(ask.selector);
  if (!allHold(when.recorded, recorded)) return undefined;
  ask.described ??= describeElement(ask.element);
  return trySelectors(rule, ask, recorded);
}

function allHold(conditions, fact) {
  return (conditions ?? []).every((condition) => condition(fact));
}

// ------------------------------------------------------ trying its selectors

// The first selector of `rule` that finds only the recorded element.
function trySelectors(rule, ask, recorded) {
  const log = (message) => ask.log(`recorder_selectors ${rule.name}: ${message}`);
  const proposed = selectorsToTry(rule, { recorded, element: ask.described });
  const checked = mapUntil(
    proposed,
    (selector) => checkSelector(ask, selector, rule),
    findsOnlyTheElement,
  );
  const { selector, rejected } = pickSelector(rule, checked);
  rejected.map(whyRejected).forEach(log);
  if (!selector && proposed.length > 0) log(`${recorded.selector} kept`);
  return selector;
}

// `{ parts, selector }` for each selector `rule` tries, the selector with the
// frames; none when one of its conditions does not hold. It asks nothing of
// the page.
function selectorsToTry(rule, { name, recorded, element }) {
  const when = rule.when ?? {};
  if (name && !allHold(when.name, name)) return [];
  if (!allHold(when.recorded, recorded)) return [];
  if (!allHold(when.element, element)) return [];
  return rule
    .tryInOrder({ recorded, element })
    .map((selector) => [selector].flat())
    .filter((parts) => parts.length > 0 && parts.every(Boolean))
    .map((parts) => ({ parts, selector: print([...recorded.frames, ...parts]) }));
}

// The selector with `match`: how many elements it finds, and where the
// recorded element is among them; no `match` when it cannot be checked.
function checkSelector(ask, proposed, rule) {
  let parts = proposed.parts;
  if (rule.checkHiddenElementsToo) parts = parts.map(withHidden);
  const checked = print(parts);
  try {
    const found = ask.query(checked);
    return { ...proposed, match: { count: found.length, index: found.indexOf(ask.element) } };
  } catch (error) {
    return { ...proposed, error: String(error).split("\n")[0] };
  }
}

function findsOnlyTheElement({ match }) {
  if (!match) return false;
  return match.count === 1 && match.index === 0;
}

// `{ selector, rejected }`: the selector that finds only the element, or the
// first one with `nth=` when the rule falls back to that, and the selectors
// rejected before it.
function pickSelector(rule, checked) {
  const unique = checked.find(findsOnlyTheElement);
  if (unique) {
    const rejected = checked.slice(0, checked.indexOf(unique));
    return { selector: unique.selector, rejected };
  }
  return { selector: withIndex(rule, checked), rejected: checked };
}

// The first checked selector with `>> nth=<index>` of the recorded element,
// when the rule falls back to that.
function withIndex(rule, checked) {
  if (!rule.otherwiseUseIndex) return undefined;
  const first = checked.find(({ match }) => match);
  if (!first || first.match.index < 0) return undefined;
  return `${first.selector} >> nth=${first.match.index}`;
}

function whyRejected({ selector, match, error }) {
  if (!match) return `${selector} cannot be checked: ${error}`;
  return `${selector} finds ${match.count} elements`;
}

module.exports = { pipeline, selectorStep, selectorsToTry };
