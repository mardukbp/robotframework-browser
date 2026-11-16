// Runs the rules on a recorded Action and checks what they propose in the page.
// It reads from the top down: the hook, a step, a rule, the two ways a rule
// proposes selectors, and last the questions asked of the page.
//
// A step is `{ name, run }`: `run({ action, page, context })` gives the Action
// to record, or undefined to keep it, as Browser's `__recordedAction` does.
//
// A rule is an object:
//
//   name        for the log in playwright-log.txt.
//   actions     optional: the Action names (`click`, `fill`, ...) it rewrites;
//               a pick arrives as the Action `pick`.
//   skip        optional: `(chain) => boolean`, true leaves the selector alone.
//   candidates  `({ facts, chain }) => [parts, ...]`: the selectors to try, in
//               order, each a list of parts (see selector.js) without the
//               frames. `facts` describe the recorded element (see page.js).
//               Falsy entries are ignored.
//   includeHidden  optional: check `role` parts with `include-hidden=true`, for
//               a click that hides the page behind a dialog.
//   fallback    optional: "nth" uses the first candidate with `>> nth=<index>`
//               when no candidate finds only the element.
//   eachPart    instead of `candidates`: `({ part, facts }) => [part, ...]`, the
//               replacements to try for one part of the chain, `facts`
//               describing the element the chain up to that part finds.
//   skipPart    optional, with `eachPart`: `(part) => boolean`, true leaves the
//               part alone without looking it up in the page.
//
// Rules only compute with data; everything that asks the page is here. A
// candidate is used only when it finds exactly the recorded element. When the
// recorded selector no longer finds it, for example after a click navigated,
// the candidates are checked against the snapshot taken at the press.

const {
  replaceAt,
  reduceAsync,
  findAsync,
  mapUntilAsync,
} = require("./fp.js");
const { ELEMENT_FACTS } = require("./page.js");
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
  return async ({ action, page, context }) => {
    const recorded = await reduceAsync(
      steps,
      (current, step) => runStep(step, current, page, context),
      action,
    );
    return recorded === action ? undefined : recorded;
  };
}

// One step on `action`; a step that fails keeps the Action it got.
async function runStep(step, action, page, context) {
  try {
    return (await step.run({ action, page, context })) ?? action;
  } catch (error) {
    logFor(step.name)(`${action.selector ?? action.name} kept: ${error}`);
    return action;
  }
}

// A rule as a step: it changes the selector of an Action that has one.
function selectorStep(rule) {
  return {
    name: rule.name,
    run: async ({ action, page }) => {
      if (!hasSelector(action) || !canAsk(page)) return undefined;
      const selector = await applyRule(rule, action, page);
      return selector ? { ...action, selector } : undefined;
    },
  };
}

// ---------------------------------------------------------------- a rule

// The selector `rule` records for `action`, or undefined to keep it.
function applyRule(rule, action, page) {
  if (rule.actions && !rule.actions.includes(action.name)) return undefined;
  const chain = parse(action.selector);
  if (rule.skip?.(chain)) return undefined;
  return rule.eachPart
    ? replaceParts(rule, page, chain)
    : tryCandidates(rule, page, chain);
}

// ---------------------------------------------------- a rule's candidates

// The first candidate of `rule` that finds only the recorded element.
async function tryCandidates(rule, page, chain) {
  const log = logFor(rule.name);
  const element = await findRecordedElement(page, chain);
  if (!element.facts) {
    log(`${chain.selector} finds ${element.count} elements, kept`);
    return undefined;
  }
  try {
    const candidates = candidateSelectors(rule, element.facts, chain);
    const checked = await mapUntilAsync(
      candidates,
      (candidate) => checkCandidate(page, element, chain, candidate, rule),
      findsOnlyTheElement,
    );
    const { selector, rejected } = pickSelector(rule, element, checked);
    rejected.map(whyRejected).forEach(log);
    if (!selector && candidates.length) log(`${chain.selector} kept`);
    return selector;
  } finally {
    await element.handle?.dispose();
  }
}

// `{ parts, selector }` for each candidate of `rule`, the selector with the frames.
const candidateSelectors = (rule, facts, chain) =>
  (rule.candidates({ facts, chain }) || [])
    .filter(Boolean)
    .map((parts) => ({ parts, selector: print([...chain.frames, ...parts]) }));

// The candidate with `match`: how many elements it finds, and where the
// recorded element is among them.
async function checkCandidate(page, element, chain, candidate, rule) {
  const parts = rule.includeHidden
    ? candidate.parts.map(withHidden)
    : candidate.parts;
  return {
    ...candidate,
    match: await countMatches(page, element, chain.frames, parts),
  };
}

const findsOnlyTheElement = ({ match }) =>
  match?.count === 1 && match.index === 0;

// `{ selector, rejected }`: the candidate that finds only the element, or the
// first one with `nth=` when the rule falls back to that, and the candidates
// rejected before it.
function pickSelector(rule, element, checked) {
  const found = checked.find(findsOnlyTheElement);
  if (found)
    return {
      selector: found.selector,
      rejected: checked.slice(0, checked.indexOf(found)),
    };
  const first = checked.find(({ match }) => match);
  const withNth =
    rule.fallback === "nth" && element.handle && first?.match.index >= 0
      ? `${first.selector} >> nth=${first.match.index}`
      : undefined;
  return { selector: withNth, rejected: checked };
}

const whyRejected = ({ selector, match }) =>
  match
    ? `${selector} finds ${match.count} elements`
    : `${selector} cannot be checked after the page changed`;

// ---------------------------------------------- a rule's part replacements

// The chain with each part replaced by the first replacement of `eachPart`
// that finds only the element the chain finds, part after part.
async function replaceParts(rule, page, chain) {
  const replaced = await reduceAsync(
    chain.parts,
    (parts, _, i) => replacePart(rule, page, parts, i),
    chain.parts,
  );
  return replaced === chain.parts ? undefined : print(replaced);
}

async function replacePart(rule, page, parts, i) {
  const part = parts[i];
  if (rule.skipPart?.(part)) return parts;
  const facts = await factsOf(page, print(parts.slice(0, i + 1)));
  if (!facts) return parts;
  const replacement = await findAsync(
    rule.eachPart({ part, facts }).filter(Boolean),
    (candidate) =>
      findsSameElement(page, print(replaceAt(parts, i, candidate)), print(parts)),
  );
  return replacement ? replaceAt(parts, i, replacement) : parts;
}

// ---------------------------------------------------- the recorded element

// The recorded element: `{ facts, handle }` in the page, `{ facts, peers }`
// from the press when the page changed and the press was on what the selector
// names, or else `{ count }`. Playwright makes the selector find only the
// element, so finding none or several means the page changed, for example a
// click navigated to a page with more such elements.
async function findRecordedElement(page, chain) {
  const recorded = page.locator(chain.selector);
  const count = await recorded.count();
  if (count === 1) {
    const handle = await recorded.elementHandle({ timeout: TIMEOUT_MS });
    return { facts: await handle.evaluate(ELEMENT_FACTS, false), handle };
  }
  const press = recentPress(page);
  return wasPressed(press, chain.target) && press.peers
    ? { facts: press, peers: press.peers }
    : { count };
}

// Whether `press` is on what the `role` part `target` names.
const wasPressed = (press, target) =>
  target.engine === "role" &&
  Boolean(nameOf(target)) &&
  target.role === press?.role &&
  textMatches(press.name, nameOf(target));

// `{ count, index }`: how many elements `parts` finds after `frames`, and the
// index of the recorded element among them; from its peers at the press when
// the page changed, or undefined when that cannot tell.
async function countMatches(page, element, frames, parts) {
  if (!element.handle) return countPeers(element.peers, parts);
  const [count, index] = await page
    .locator(print([...frames, ...parts]))
    .evaluateAll(
      (found, target) => [found.length, found.indexOf(target)],
      element.handle,
    );
  return { count, index };
}

// Like `countMatches`, for a candidate of the form `role=...` or
// `role=... >> scope=...`, the only ones the peers can answer for.
function countPeers(peers, [rolePart, scopePart, ...more]) {
  if (rolePart?.engine !== "role" || more.length) return undefined;
  if (scopePart && scopePart.engine !== "scope") return undefined;
  const found = peers.filter(
    (peer) =>
      peer.role === rolePart.role &&
      textMatches(peer.name, nameOf(rolePart)) &&
      textMatches(peer.description, attributeOf(rolePart, "description")) &&
      (!scopePart || peer.scopeText === scopePart.text),
  );
  return { count: found.length, index: found.findIndex((p) => p.isTarget) };
}

// ------------------------------------------------------ asking the page

// The facts of the element `selector` finds, if it finds only one.
async function factsOf(page, selector) {
  const locator = page.locator(selector);
  return (await locator.count()) === 1
    ? locator.evaluate(ELEMENT_FACTS, false, { timeout: TIMEOUT_MS })
    : undefined;
}

// Whether `candidate` finds only the element `selector` finds.
async function findsSameElement(page, candidate, selector) {
  const locator = page.locator(candidate);
  return (
    (await locator.count()) === 1 &&
    (await locator.and(page.locator(selector)).count()) === 1
  );
}

// ---------------------------------------------------------------- helpers

const hasSelector = ({ selector }) =>
  typeof selector === "string" && selector.trim() !== "";

const canAsk = (page) => typeof page?.locator === "function";

// Whether `actual` matches `wanted`, `{ value, exact }`: equal when exact, else
// containing it in any case. An undefined `wanted` matches anything.
const textMatches = (actual, wanted) =>
  !wanted ||
  (wanted.exact
    ? normalizeSpace(actual) === normalizeSpace(wanted.value)
    : normalizeSpace(actual)
        .toLowerCase()
        .includes(normalizeSpace(wanted.value).toLowerCase()));

const normalizeSpace = (text) => (text || "").replace(/\s+/g, " ").trim();

const logFor = (name) => (message) =>
  console.log(`recorder_selectors ${name}: ${message}`);

module.exports = { pipeline, selectorStep };
