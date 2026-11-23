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
  if (rule.actions && !rule.actions.includes(action.name)) return undefined;
  const chain = parse(action.selector);
  if (rule.skip?.(chain)) return undefined;
  if (rule.eachPart) return replaceParts(rule, page, chain);
  return tryCandidates(rule, page, chain);
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
    if (!selector && candidates.length > 0) log(`${chain.selector} kept`);
    return selector;
  } finally {
    await element.handle?.dispose();
  }
}

// `{ parts, selector }` for each candidate of `rule`, the selector with the frames.
function candidateSelectors(rule, facts, chain) {
  const candidates = rule.candidates({ facts, chain }) || [];
  return candidates.filter(Boolean).map((parts) => ({
    parts,
    selector: print([...chain.frames, ...parts]),
  }));
}

// The candidate with `match`: how many elements it finds, and where the
// recorded element is among them.
async function checkCandidate(page, element, chain, candidate, rule) {
  let parts = candidate.parts;
  if (rule.includeHidden) parts = parts.map(withHidden);
  const match = await countMatches(page, element, chain.frames, parts);
  return { ...candidate, match };
}

function findsOnlyTheElement({ match }) {
  if (!match) return false;
  return match.count === 1 && match.index === 0;
}

// `{ selector, rejected }`: the candidate that finds only the element, or the
// first one with `nth=` when the rule falls back to that, and the candidates
// rejected before it.
function pickSelector(rule, element, checked) {
  const found = checked.find(findsOnlyTheElement);
  if (found) {
    const rejected = checked.slice(0, checked.indexOf(found));
    return { selector: found.selector, rejected };
  }
  return { selector: nthFallback(rule, element, checked), rejected: checked };
}

// The first checked candidate with `>> nth=<index>` of the recorded element,
// when the rule falls back to that and the element is in the page.
function nthFallback(rule, element, checked) {
  if (rule.fallback !== "nth") return undefined;
  if (!element.handle) return undefined;
  const first = checked.find(({ match }) => match);
  if (!first || first.match.index < 0) return undefined;
  return `${first.selector} >> nth=${first.match.index}`;
}

function whyRejected({ selector, match }) {
  if (!match) return `${selector} cannot be checked after the page changed`;
  return `${selector} finds ${match.count} elements`;
}

// ---------------------------------------------- a rule's part replacements

// The chain with each part replaced by the first replacement of `eachPart`
// that finds only the element the chain finds, part after part.
async function replaceParts(rule, page, chain) {
  const replaceNext = (parts, _, i) => replacePart(rule, page, parts, i);
  const replaced = await reduceAsync(chain.parts, replaceNext, chain.parts);
  if (replaced === chain.parts) return undefined;
  return print(replaced);
}

async function replacePart(rule, page, parts, i) {
  const part = parts[i];
  if (rule.skipPart?.(part)) return parts;
  const facts = await factsOf(page, print(parts.slice(0, i + 1)));
  if (!facts) return parts;
  const replacements = rule.eachPart({ part, facts }).filter(Boolean);
  const findsTheSame = (replacement) => {
    const candidate = print(replaceAt(parts, i, replacement));
    return findsSameElement(page, candidate, print(parts));
  };
  const replacement = await findAsync(replacements, findsTheSame);
  if (!replacement) return parts;
  return replaceAt(parts, i, replacement);
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
    const facts = await handle.evaluate(ELEMENT_FACTS, false);
    return { facts, handle };
  }
  const press = recentPress(page);
  if (wasPressed(press, chain.target) && press.peers)
    return { facts: press, peers: press.peers };
  return { count };
}

// Whether `press` is on what the `role` part `target` names.
function wasPressed(press, target) {
  if (!press) return false;
  if (target.engine !== "role") return false;
  const name = nameOf(target);
  if (!name) return false;
  return target.role === press.role && textMatches(press.name, name);
}

// `{ count, index }`: how many elements `parts` finds after `frames`, and the
// index of the recorded element among them; from its peers at the press when
// the page changed, or undefined when that cannot tell.
async function countMatches(page, element, frames, parts) {
  if (!element.handle) return countPeers(element.peers, parts);
  return findElement(page, print([...frames, ...parts]), element.handle);
}

// Like `countMatches`, for a candidate of the form `role=...` or
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
  const found = peers.filter(isFound);
  return { count: found.length, index: found.findIndex((p) => p.isTarget) };
}

// ------------------------------------------------------ asking the page
//
// Selectors are only counted or turned into element handles, never evaluated
// on a locator: Playwright evaluates a locator in the page's main world, whose
// selector engines may lack `scope`. A page that logs elements to the console
// makes Playwright set up that world while Connect To Browser attaches over
// CDP, before Browser can register the engine there. Counting and element
// handles query in the engine's own world.

// The facts of the element `selector` finds, if it finds only one.
async function factsOf(page, selector) {
  const locator = page.locator(selector);
  if ((await locator.count()) !== 1) return undefined;
  const handle = await locator.elementHandle({ timeout: TIMEOUT_MS });
  try {
    return await handle.evaluate(ELEMENT_FACTS, false);
  } finally {
    await handle.dispose();
  }
}

// Whether `candidate` finds only the element `selector` finds.
async function findsSameElement(page, candidate, selector) {
  if ((await page.locator(candidate).count()) !== 1) return false;
  const recorded = await page.locator(selector).elementHandle({ timeout: TIMEOUT_MS });
  try {
    const { index } = await findElement(page, candidate, recorded);
    return index === 0;
  } finally {
    await recorded.dispose();
  }
}

// `{ count, index }`: how many elements `selector` finds, and the index of
// `target` among them.
async function findElement(page, selector, target) {
  const found = await page.locator(selector).elementHandles();
  try {
    const index = await target.evaluate((element, all) => all.indexOf(element), found);
    return { count: found.length, index };
  } finally {
    await Promise.all(found.map((handle) => handle.dispose()));
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

module.exports = { pipeline, selectorStep };
