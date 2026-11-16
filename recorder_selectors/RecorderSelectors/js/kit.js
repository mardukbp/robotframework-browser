// The Node side of the plugin: it runs the rules on a recorded Action, checks
// their candidates in the page, and installs the scripts the page runs. Rules
// only compute with data (see selector.js); everything that touches the page or
// keeps state is here.
//
// A rule is an object:
//
//   name        for the log in playwright-log.txt.
//   actions     optional: the Action names (`click`, `fill`, ...) it rewrites;
//               a pick arrives as the Action `pick`.
//   skip        optional: `(chain) => boolean`, true leaves the selector alone.
//   candidates  `({ el, chain }) => [parts, ...]`: the selectors to try, in
//               order, each a list of parts without the frames. `el` holds the
//               facts of page.js about the recorded element. Falsy entries are
//               ignored.
//   includeHidden  optional: check `role` parts with `include-hidden=true`, for
//               a click that hides the page behind a dialog.
//   fallback    optional: "nth" uses the first candidate with `>> nth=<index>`
//               when no candidate finds only the element.
//   eachPart    instead of `candidates`: `({ part, el }) => [part, ...]`, the
//               replacements to try for one part of the chain, `el` holding the
//               facts of the element the chain up to that part finds.
//   skipPart    optional, with `eachPart`: `(part) => boolean`, true leaves the
//               part alone without looking it up in the page.
//
// A candidate is used only when it finds exactly the recorded element. When the
// recorded selector no longer finds it, for example after a click navigated,
// the candidates are checked against the snapshot taken at the press instead.
//
// A step is `{ name, run }`: `run({ action, page, context })` gives the Action
// to record, or undefined to keep it, as Browser's `__recordedAction` does.

const { assoc, reduceAsync, findAsync, mapUntilAsync } = require("./fp.js");
const { FACTS, pressScript } = require("./page.js");
const {
  parse,
  print,
  nameOf,
  attributeOf,
  withHidden,
} = require("./selector.js");

const TIMEOUT_MS = 500;
const PRESS_MAX_AGE_MS = 10000;

const log = (name) => (message) =>
  console.log(`recorder_selectors ${name}: ${message}`);

const flat = (text) => (text || "").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------ page scripts
//
// A page script is data: `{ script, binding? }`, `script` the source that runs
// in every frame, `binding` an optional `{ name, receive(page, data) }` it calls.

const presses = new WeakMap();

// The page script that takes a snapshot of the element at every press.
const PRESSES = {
  script: pressScript("__rfbRecorderSelectorsPress"),
  binding: {
    name: "__rfbRecorderSelectorsPress",
    receive: (page, facts) => {
      if (facts && typeof facts === "object")
        presses.set(page, { facts, at: Date.now() });
    },
  },
};

const recentPress = (page) => {
  const press = presses.get(page);
  return press && Date.now() - press.at <= PRESS_MAX_AGE_MS
    ? press.facts
    : undefined;
};

async function expose(context, { name, receive }) {
  try {
    await context.exposeBinding(name, ({ page }, data) => receive(page, data));
  } catch (error) {
    // Bindings stay with the context, which a new recording session reuses.
    if (!String(error).includes("has been already registered")) throw error;
  }
}

const framesOf = (context) =>
  context.pages().flatMap((page) => page.frames());

// Runs a page script in the frames already open, and as an init script, before
// the page's own scripts, in every frame opened later.
async function installOne(context, { script, binding }) {
  if (binding) await expose(context, binding);
  await context.addInitScript(script);
  await Promise.all(
    framesOf(context).map((frame) =>
      frame.evaluate(script).catch(() => undefined),
    ),
  );
}

const installed = new WeakMap();

// Runs each page script once per context, in order; a failed one and those
// after it are tried again next time.
function install(context, pageScripts) {
  const done = installed.get(context) ?? new Set();
  installed.set(context, done);
  const fresh = pageScripts.filter((pageScript) => !done.has(pageScript));
  fresh.forEach((pageScript) => done.add(pageScript));
  return reduceAsync(fresh, (_, pageScript, i) =>
    installOne(context, pageScript).catch((error) => {
      fresh.slice(i).forEach((each) => done.delete(each));
      throw error;
    }),
  );
}

// ------------------------------------------------------------ in the page

// The facts of the element `selector` finds, if it finds only one.
async function factsOf(page, selector) {
  const locator = page.locator(selector);
  return (await locator.count()) === 1
    ? locator.evaluate(FACTS, false, { timeout: TIMEOUT_MS })
    : undefined;
}

// Whether `candidate` finds only the element `selector` finds.
async function findsSame(page, candidate, selector) {
  const locator = page.locator(candidate);
  return (
    (await locator.count()) === 1 &&
    (await locator.and(page.locator(selector)).count()) === 1
  );
}

const textMatches = (actual, wanted) =>
  !wanted ||
  (wanted.exact
    ? flat(actual) === flat(wanted.value)
    : flat(actual).toLowerCase().includes(flat(wanted.value).toLowerCase()));

// Whether a snapshot of the press is on what the `role` part `target` names.
const pressedOn = (press, target) =>
  target.engine === "role" &&
  Boolean(nameOf(target)) &&
  target.role === press?.role &&
  textMatches(press.name, nameOf(target));

// The recorded element: in the page, or at the press when the page changed and
// the press was on what the selector names. Playwright makes the selector find
// only the element, so finding none or several means the page changed, for
// example a click navigated to a page with more such elements.
async function subjectOf(page, chain) {
  const recorded = page.locator(chain.selector);
  const count = await recorded.count();
  if (count === 1) {
    const handle = await recorded.elementHandle({ timeout: TIMEOUT_MS });
    return { el: await handle.evaluate(FACTS, false), handle };
  }
  const press = recentPress(page);
  return pressedOn(press, chain.target) && press.peers
    ? { el: press, peers: press.peers }
    : { count };
}

// How many peers a candidate of the form `role=...` or `role=... >> scope=...`
// finds, and the index of the pressed element among them; undefined for any
// other candidate, which cannot be checked without the page.
function matchPeers(peers, [rolePart, scopePart, ...more]) {
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

// `{ count, index }`: how many elements `parts` finds after the frames, and
// where the recorded element is among them.
async function matchOf(page, subject, frames, parts) {
  if (!subject.handle) return matchPeers(subject.peers, parts);
  const [count, index] = await page
    .locator(print([...frames, ...parts]))
    .evaluateAll(
      (found, target) => [found.length, found.indexOf(target)],
      subject.handle,
    );
  return { count, index };
}

// ------------------------------------------------------------ the rules

const isExactMatch = ({ match }) => match?.count === 1 && match.index === 0;

const describe = ({ selector, match }) =>
  match
    ? `${selector} finds ${match.count} elements`
    : `${selector} cannot be checked after the page changed`;

// The selector a `candidates` rule records: the first candidate that finds only
// the recorded element, its first candidate with `nth=` as a fallback, or none.
function chosen(rule, subject, tried) {
  const exact = tried.find(isExactMatch);
  const first = tried.find(({ match }) => match);
  if (exact) return { selector: exact.selector, notes: tried.slice(0, tried.indexOf(exact)) };
  const nth =
    rule.fallback === "nth" && subject.handle && first?.match.index >= 0
      ? `${first.selector} >> nth=${first.match.index}`
      : undefined;
  return { selector: nth, notes: tried };
}

async function applyCandidates(rule, page, chain) {
  const say = log(rule.name);
  const subject = await subjectOf(page, chain);
  if (!subject.el) {
    say(`${chain.selector} finds ${subject.count} elements, kept`);
    return undefined;
  }
  try {
    const candidates = (rule.candidates({ el: subject.el, chain }) || [])
      .filter(Boolean)
      .map((parts) => ({ parts, selector: print([...chain.frames, ...parts]) }));
    const check = async (candidate) => ({
      ...candidate,
      match: await matchOf(
        page,
        subject,
        chain.frames,
        rule.includeHidden ? candidate.parts.map(withHidden) : candidate.parts,
      ),
    });
    // One after the other, and none after the first that finds only the element.
    const tried = await mapUntilAsync(candidates, check, isExactMatch);
    const { selector, notes } = chosen(rule, subject, tried);
    notes.map(describe).forEach(say);
    if (!selector && candidates.length) say(`${chain.selector} kept`);
    return selector;
  } finally {
    await subject.handle?.dispose();
  }
}

// The chain with each part replaced by the first replacement of `eachPart`
// that finds only the element the chain finds, part after part.
async function applyEachPart(rule, page, chain) {
  const replaced = await reduceAsync(
    chain.parts,
    async (parts, part, i) => {
      if (rule.skipPart?.(part)) return parts;
      const el = await factsOf(page, print(parts.slice(0, i + 1)));
      if (!el) return parts;
      const replacement = await findAsync(
        rule.eachPart({ part, el }).filter(Boolean),
        (candidate) =>
          findsSame(page, print(assoc(parts, i, candidate)), print(parts)),
      );
      return replacement ? assoc(parts, i, replacement) : parts;
    },
    chain.parts,
  );
  return replaced === chain.parts ? undefined : print(replaced);
}

// The selector `rule` records for `action`, or undefined to keep it.
function applyRule(rule, action, page) {
  if (rule.actions && !rule.actions.includes(action.name)) return undefined;
  const chain = parse(action.selector);
  if (rule.skip?.(chain)) return undefined;
  return rule.eachPart
    ? applyEachPart(rule, page, chain)
    : applyCandidates(rule, page, chain);
}

// ------------------------------------------------------------ the hook

const hasSelector = ({ selector }) =>
  typeof selector === "string" && selector.trim() !== "";

// A rule as a step: it changes the selector of an Action that has one.
const selectorStep = (rule) => ({
  name: rule.name,
  run: async ({ action, page }) => {
    if (!hasSelector(action) || typeof page?.locator !== "function")
      return undefined;
    const selector = await applyRule(rule, action, page);
    return hasSelector({ selector }) ? { ...action, selector } : undefined;
  },
});

// One step on `action`; a step that fails keeps the Action it got.
async function runStep(step, action, page, context) {
  try {
    return (await step.run({ action, page, context })) ?? action;
  } catch (error) {
    log(step.name)(`${action.selector ?? action.name} kept: ${error}`);
    return action;
  }
}

// The `__recordedAction` hook of the steps: each runs on the Action the one
// before gave.
const pipeline = (steps) => async ({ action, page, context }) => {
  const recorded = await reduceAsync(
    steps,
    (current, step) => runStep(step, current, page, context),
    action,
  );
  return recorded === action ? undefined : recorded;
};

module.exports = { pipeline, selectorStep, install, PRESSES };
