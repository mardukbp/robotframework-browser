// What every rule of the plugin shares: reading and building selectors, the
// facts about the recorded element, the snapshot taken when it is pressed, and
// the runner that checks a rule's candidate selectors in the page.
//
// A rule is an object:
//
//   name        for the log in playwright-log.txt.
//   actions     optional: the Action names (`click`, `fill`, ...) it rewrites;
//               a pick has no Action, so such a rule never sees one.
//   skip        optional: `(chain) => boolean`, true leaves the selector alone.
//   candidates  `({ el, chain }) => [parts, ...]`: the selectors to try, in
//               order, each a list of chain parts without the frames. `el` holds
//               the facts of `factsOf` about the recorded element. Falsy entries
//               are ignored.
//   includeHidden  optional: check `role=` parts with `include-hidden=true`, for
//               a click that hides the page behind a dialog.
//   fallback    optional: "nth" uses the first candidate with `>> nth=<index>`
//               when no candidate finds only the element.
//   rewrite     instead of `candidates`: `async ({ selector, action, page,
//               context, chain, log }) => selector | undefined`, for a rule that
//               transforms the selector rather than replacing it.
//
// A candidate is used only when it finds exactly the recorded element. When the
// recorded selector no longer finds it, for example after a click navigated,
// the candidates are checked against the snapshot taken at the press instead.

const { scopeOf, scope, scopeTextOf } = require("./scope.js");

const TIMEOUT_MS = 500;
const PRESS_MAX_AGE_MS = 10000;
const ENTER_FRAME = "internal:control=enter-frame";
const BINDING = "__rfbRecorderSelectorsPress";
const CLICKABLE =
  "a, button, input, select, textarea, summary, [role=link], [role=button], " +
  "[role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option]";

// ---------------------------------------------------------------- selectors

// Splits on Playwright's ` >> ` chain separator, never inside a quoted string.
function splitChain(selector) {
  const parts = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (quoted && c === "\\") i++;
    else if (c === '"') quoted = !quoted;
    else if (!quoted && selector.startsWith(" >> ", i)) {
      parts.push(selector.slice(start, i));
      start = i + 4;
      i += 3;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

const join = (parts) => parts.join(" >> ");
const flat = (text) => (text || "").replace(/\s+/g, " ").trim();

// Quoting of attribute values in `role=` parts, as Playwright does it.
const encodeAttribute = (value) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const decodeAttribute = (raw) =>
  raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : raw;

const ROLE = /^((?:internal:)?role=)([a-z]+)/;
const ATTRIBUTE =
  /\[([a-z-]+)(?:=(?:("(?:[^"\\]|\\.)*")([is]?)|([^\]"]*)))?\]/y;
const TEXT = /^(internal:(text|label)=)("(?:[^"\\]|\\.)*")([is]?)$/;
const NTH = /^nth=-?\d+$/;

function parseRole(part) {
  const head = ROLE.exec(part);
  if (!head) return undefined;
  const attributes = [];
  ATTRIBUTE.lastIndex = head[0].length;
  while (ATTRIBUTE.lastIndex < part.length) {
    const start = ATTRIBUTE.lastIndex;
    const match = ATTRIBUTE.exec(part);
    if (!match) return undefined;
    const [, key, quoted, flag, plain] = match;
    attributes.push({
      key,
      raw: part.slice(start, ATTRIBUTE.lastIndex),
      value: quoted !== undefined ? decodeAttribute(quoted) : plain,
      flag,
    });
  }
  const textOf = (key) => {
    const found = attributes.find(
      (a) => a.key === key && a.value !== undefined,
    );
    return found && { value: found.value, exact: found.flag === "s" };
  };
  return {
    engine: "role",
    raw: part,
    role: head[2],
    name: textOf("name"),
    description: textOf("description"),
    withName: (value, exact) => withAttribute("name", value, exact),
    // The part with the attribute `key` set to `value`, exact or not, or as
    // exact as before; an undefined `value` removes it.
    withAttribute,
  };

  function withAttribute(key, value, exact) {
    return (
      head[0] +
      attributes
        .map((a) => {
          if (a.key !== key) return a.raw;
          if (value === undefined) return "";
          return `[${key}=${encodeAttribute(value)}${flagOf(exact, a.flag)}]`;
        })
        .join("")
    );
  }
}

// The flag of a name: `s` when `exact`, `i` when not, `flag` when undefined.
function flagOf(exact, flag) {
  if (exact === undefined) return flag || "";
  return exact ? "s" : "i";
}

// One part of a chain: `{ engine, raw, name?, description?, withName? }`. `name`
// is `{ value, exact }` for a `role=` part with a name and for the text of an
// `internal:text=` or `internal:label=` part; `withName(value, exact)` gives the
// part with another name, exact or not, or as exact as before.
function parsePart(part) {
  const role = parseRole(part);
  if (role) return role;
  const text = TEXT.exec(part);
  if (text) {
    const [, head, engine, quoted, flag] = text;
    return {
      engine,
      raw: part,
      name: { value: JSON.parse(quoted), exact: flag === "s" },
      withName: (value, exact) =>
        `${head}${JSON.stringify(value)}${flagOf(exact, flag)}`,
    };
  }
  const scopeText = scopeTextOf(part);
  if (scopeText !== undefined)
    return { engine: "scope", raw: part, text: scopeText };
  if (isIdPart(part)) return { engine: "id", raw: part };
  if (NTH.test(part)) return { engine: "nth", raw: part };
  return { engine: "other", raw: part };
}

// A part that finds an element by its id.
function isIdPart(part) {
  return /^(css=)?\s*(#|\[id[=~|^$*]?=)|^internal:attr=\[id=|^id=/.test(part);
}

// The chain of `selector`: `frames` up to the last frame it enters, `rest`
// after them, `target` the last part of `rest` before the `scope=` and `nth=`
// filters that end it, parsed, and `nth` the `nth=` among those filters.
function parse(selector) {
  const parts = splitChain(selector);
  const frames = parts.slice(0, parts.lastIndexOf(ENTER_FRAME) + 1);
  const rest = parts.slice(frames.length);
  const isFilter = (part) => NTH.test(part) || scopeTextOf(part) !== undefined;
  let end = rest.length;
  while (end > 1 && isFilter(rest[end - 1])) end--;
  return {
    selector,
    parts,
    frames,
    rest,
    nth: rest.slice(end).find((part) => NTH.test(part)),
    target: parsePart(rest[end - 1] ?? ""),
  };
}

// `role=<role>[name="..."s][description="..."s]`, in Browser's syntax.
function role(roleName, { name, description, exact = true } = {}) {
  const flag = exact ? "s" : "i";
  const attribute = (key, value) =>
    value === undefined ? "" : `[${key}=${encodeAttribute(value)}${flag}]`;
  return `role=${roleName}${attribute("name", name)}${attribute("description", description)}`;
}

const withHidden = (part) =>
  ROLE.test(part) && !part.includes("[include-hidden=")
    ? part.replace(ROLE, "$&[include-hidden=true]")
    : part;

// ------------------------------------------------------------- in the page

// Playwright sends a function to the page as its source text, so it may use
// nothing from this module. This gives `fn` the `helpers` inside its own body.
function inPage(fn, helpers) {
  const definitions = Object.entries(helpers)
    .map(([name, helper]) => `const ${name} = ${helper};`)
    .join("\n");
  return new Function(
    `return function (...args) {\n${definitions}\nreturn (${fn})(...args);\n}`,
  )();
}

// Runs in the page: what the rules know about `element`. An approximation of
// what Playwright computes, used to choose candidates; the page decides whether
// a candidate finds the element. With `withPeers`, also the elements with the
// same role, to check candidates against when the page is gone.
function elementFacts(element, withPeers) {
  const CONTROLS =
    "input:not([type=hidden]), textarea, select, [role=combobox], " +
    "[role=textbox], [role=searchbox], [role=spinbutton], [role=listbox], " +
    "[role=checkbox], [role=radio], [role=switch], [role=slider]";
  const flat = (text) => (text || "").replace(/\s+/g, " ").trim();
  const explicitRoleOf = (e) =>
    (e.getAttribute("role") || "").trim().split(/\s+/)[0];
  const roleOf = (e) => {
    const explicit = explicitRoleOf(e);
    if (explicit) return explicit;
    const tag = e.localName;
    if (tag === "a" || tag === "area")
      return e.hasAttribute("href") ? "link" : "";
    if (tag === "button") return "button";
    if (tag === "select")
      return e.multiple || e.size > 1 ? "listbox" : "combobox";
    if (tag === "textarea") return "textbox";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag !== "input") return "";
    const type = (e.getAttribute("type") || "text").toLowerCase();
    const byType = {
      button: "button",
      submit: "button",
      reset: "button",
      image: "button",
      checkbox: "checkbox",
      radio: "radio",
      number: "spinbutton",
      range: "slider",
      search: "searchbox",
      hidden: "",
    };
    if (type in byType) return byType[type];
    return e.hasAttribute("list") ? "combobox" : "textbox";
  };
  const byIds = (e, attribute) =>
    (e.getAttribute(attribute) || "")
      .split(/\s+/)
      .map((id) => id && e.getRootNode().getElementById?.(id))
      .filter(Boolean)
      .map((ref) => ref.textContent);
  const labelsOf = (e) =>
    [...(e.labels || [])].map((label) => label.textContent);
  const isFormField = (e) =>
    ["input", "select", "textarea"].includes(e.localName);
  // The name from everything but the title, which names an element only when
  // nothing else does.
  const nameBeforeTitleOf = (e) =>
    flat(byIds(e, "aria-labelledby").join(" ")) ||
    flat(e.getAttribute("aria-label")) ||
    flat(labelsOf(e).join(" ")) ||
    (isFormField(e) ? "" : flat(e.textContent));
  const nameOf = (e) =>
    nameBeforeTitleOf(e) ||
    flat(e.getAttribute("title")) ||
    flat(e.getAttribute("alt")) ||
    flat(e.getAttribute("placeholder"));
  // The title describes an element whenever something else names it.
  const descriptionOf = (e) =>
    flat(byIds(e, "aria-describedby").join(" ")) ||
    flat(e.getAttribute("aria-description")) ||
    (nameBeforeTitleOf(e) ? flat(e.getAttribute("title")) : "");
  const everyElement = (root, found = []) => {
    for (const e of root.querySelectorAll("*")) {
      found.push(e);
      if (e.shadowRoot) everyElement(e.shadowRoot, found);
    }
    return found;
  };

  const role = roleOf(element);
  const labelledBy = byIds(element, "aria-labelledby");
  const facts = {
    tag: element.localName,
    role,
    explicitRole: explicitRoleOf(element),
    name: nameOf(element),
    description: descriptionOf(element),
    ariaLabel: flat(element.getAttribute("aria-label")),
    title: flat(element.getAttribute("title")),
    text: flat(element.textContent),
    hasLabelledBy: element.hasAttribute("aria-labelledby"),
    hasLabel: labelsOf(element).length > 0,
    hasDescription:
      element.hasAttribute("aria-describedby") ||
      element.hasAttribute("aria-description"),
    isControl: element.matches(CONTROLS),
    scopeText: scopeOf(element),
    // Every text the element may be found by, as it is in the page.
    texts: [
      element.textContent,
      ...labelsOf(element),
      ...["aria-label", "title", "alt", "placeholder"].map((a) =>
        element.getAttribute(a),
      ),
      ...labelledBy,
      labelledBy.join(" "),
    ].filter((text) => typeof text === "string" && text.trim() !== ""),
  };
  facts.hasName = Boolean(
    facts.ariaLabel || facts.hasLabelledBy || facts.hasLabel,
  );
  if (withPeers && role)
    facts.peers = everyElement(element.ownerDocument)
      .filter((e) => roleOf(e) === role)
      .map((e) => ({
        role,
        name: nameOf(e),
        description: descriptionOf(e),
        scopeText: scopeOf(e),
        isTarget: e === element,
      }));
  return facts;
}

const FACTS = inPage(elementFacts, { scopeOf });

// Runs in every frame: at each trusted press, outside Browser's toolbar and
// Playwright's overlay, sends the facts of the pressed element to Node.
function reportPresses(binding, clickable, facts) {
  if (window.__rfbRecorderSelectorsInstalled) return;
  window.__rfbRecorderSelectorsInstalled = true;
  window.addEventListener(
    "pointerdown",
    (event) => {
      const path = event
        .composedPath()
        .filter((node) => node instanceof Element);
      if (!event.isTrusted || path.some((e) => e.localName === "x-pw-glass"))
        return;
      const element = path.find((e) => e.matches(clickable)) || path[0];
      if (!element) return;
      try {
        window[binding](facts(element, true));
      } catch {
        // A page that blocks the binding records without the snapshot.
      }
    },
    true,
  );
}

const PRESS_SCRIPT = `(${reportPresses})(${JSON.stringify(BINDING)}, ${JSON.stringify(CLICKABLE)}, ${FACTS});`;

// ------------------------------------------------------------- in Node

const prepared = new WeakSet();
const presses = new WeakMap();

// Before the first recording in a context: take a snapshot at every press, in
// pages opened later and in the pages already open.
async function installPresses(context) {
  if (prepared.has(context)) return;
  prepared.add(context);
  try {
    await context.exposeBinding(BINDING, ({ page }, facts) => {
      if (facts && typeof facts === "object")
        presses.set(page, { facts, at: Date.now() });
    });
  } catch (error) {
    if (!String(error).includes("has been already registered")) {
      prepared.delete(context);
      throw error;
    }
  }
  await context.addInitScript(PRESS_SCRIPT);
  for (const page of context.pages())
    for (const frame of page.frames())
      await frame.evaluate(PRESS_SCRIPT).catch(() => undefined);
}

function recentPress(page) {
  const press = presses.get(page);
  return press && Date.now() - press.at <= PRESS_MAX_AGE_MS
    ? press.facts
    : undefined;
}

function textMatches(actual, wanted) {
  if (!wanted) return true;
  return wanted.exact
    ? flat(actual) === flat(wanted.value)
    : flat(actual).toLowerCase().includes(flat(wanted.value).toLowerCase());
}

// How many peers a candidate of the form `role=...` or `role=... >> scope=...`
// finds, and the index of the pressed element among them; null for any other
// candidate, which cannot be checked without the page.
function matchPeers(peers, parts) {
  const [rolePart, scopePart, ...more] = parts.map(parsePart);
  if (rolePart?.engine !== "role" || more.length) return null;
  if (scopePart && scopePart.engine !== "scope") return null;
  const found = peers.filter(
    (peer) =>
      peer.role === rolePart.role &&
      textMatches(peer.name, rolePart.name) &&
      textMatches(peer.description, rolePart.description) &&
      (!scopePart || peer.scopeText === scopePart.text),
  );
  return {
    count: found.length,
    index: found.findIndex((peer) => peer.isTarget),
  };
}

// The facts of the element `selector` finds, if it finds only one.
async function factsOf(page, selector) {
  const locator = page.locator(selector);
  if ((await locator.count()) !== 1) return undefined;
  return locator.evaluate(FACTS, false, { timeout: TIMEOUT_MS });
}

// Whether `candidate` finds only the element `selector` finds.
async function findsSame(page, candidate, selector) {
  const locator = page.locator(candidate);
  return (
    (await locator.count()) === 1 &&
    (await locator.and(page.locator(selector)).count()) === 1
  );
}

// The recorded element: in the page, or at the press when the page lost it and
// the press was on what the selector names.
async function subjectOf({ page, selector }, chain, log) {
  const recorded = page.locator(selector);
  const count = await recorded.count();
  if (count === 1) {
    const handle = await recorded.elementHandle({ timeout: TIMEOUT_MS });
    return { el: await handle.evaluate(FACTS, false), handle };
  }
  const press = count === 0 ? recentPress(page) : undefined;
  const { target } = chain;
  const pressed =
    target.engine === "role" &&
    target.name &&
    target.role === press?.role &&
    textMatches(press.name, target.name);
  if (pressed && press.peers) return { el: press, peers: press.peers };
  log(`${selector} finds ${count} elements, kept`);
  return undefined;
}

async function matchOf(subject, page, frames, parts, includeHidden) {
  if (!subject.handle) return matchPeers(subject.peers, parts);
  const checked = join([
    ...frames,
    ...(includeHidden ? parts.map(withHidden) : parts),
  ]);
  const [count, index] = await page
    .locator(checked)
    .evaluateAll(
      (found, target) => [found.length, found.indexOf(target)],
      subject.handle,
    );
  return { count, index };
}

async function applyRule(rule, ctx) {
  if (rule.actions && !rule.actions.includes(ctx.action?.name))
    return undefined;
  const chain = parse(ctx.selector);
  if (rule.skip?.(chain)) return undefined;
  const log = (message) =>
    console.log(`recorder_selectors ${rule.name}: ${message}`);
  if (rule.rewrite) return rule.rewrite({ ...ctx, chain, log });

  const subject = await subjectOf(ctx, chain, log);
  if (!subject) return undefined;
  try {
    const candidates = (
      rule.candidates({ el: subject.el, chain }) || []
    ).filter(Boolean);
    let first;
    for (const parts of candidates) {
      const selector = join([...chain.frames, ...parts]);
      const match = await matchOf(
        subject,
        ctx.page,
        chain.frames,
        parts,
        rule.includeHidden,
      );
      if (!match) {
        log(`${selector} cannot be checked after the page changed`);
        continue;
      }
      first ??= { selector, match };
      if (match.count === 1 && match.index === 0) return selector;
      log(`${selector} finds ${match.count} elements`);
    }
    if (rule.fallback === "nth" && subject.handle && first?.match.index >= 0)
      return `${first.selector} >> nth=${first.match.index}`;
    if (candidates.length) log(`${ctx.selector} kept`);
    return undefined;
  } finally {
    await subject.handle?.dispose();
  }
}

// The hooks of the JS extension: the rules run in order, each on the selector
// the previous one returned. A rule that fails keeps the selector it got.
function pipeline(rules) {
  return {
    __recordingStarted: ({ context }) => installPresses(context),
    __recordedSelector: async ({ selector, action, page, context }) => {
      if (typeof page?.locator !== "function") return undefined;
      let current = selector;
      for (const rule of rules) {
        try {
          const result = await applyRule(rule, {
            selector: current,
            action,
            page,
            context,
          });
          if (typeof result === "string" && result.trim()) current = result;
        } catch (error) {
          console.log(
            `recorder_selectors ${rule.name}: ${current} kept: ${error}`,
          );
        }
      }
      return current === selector ? undefined : current;
    },
  };
}

module.exports = {
  pipeline,
  parse,
  parsePart,
  isIdPart,
  join,
  role,
  scope,
  factsOf,
  findsSame,
};
