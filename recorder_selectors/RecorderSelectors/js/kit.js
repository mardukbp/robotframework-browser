// What every rule of the plugin shares: selectors as data, the facts about the
// recorded element, the snapshot taken when it is pressed, and the runner that
// checks a rule's candidates in the page.
//
// A rule is an object:
//
//   name        for the log in playwright-log.txt.
//   actions     optional: the Action names (`click`, `fill`, ...) it rewrites;
//               a pick arrives as the Action `pick`.
//   skip        optional: `(chain) => boolean`, true leaves the selector alone.
//   candidates  `({ el, chain }) => [parts, ...]`: the selectors to try, in
//               order, each a list of parts (see Selectors) without the frames.
//               `el` holds the facts of `factsOf` about the recorded element.
//               Falsy entries are ignored.
//   includeHidden  optional: check `role` parts with `include-hidden=true`, for
//               a click that hides the page behind a dialog.
//   fallback    optional: "nth" uses the first candidate with `>> nth=<index>`
//               when no candidate finds only the element.
//   eachPart    instead of `candidates`: `({ part, el }) => [part, ...]`, the
//               replacements to try for one part of the chain, `el` holding the
//               facts of the element the chain up to that part finds; for a rule
//               that changes parts where they are rather than the whole selector.
//   skipPart    optional, with `eachPart`: `(part) => boolean`, true leaves the
//               part alone without looking it up in the page.
//
// Rules only compute with data; the kit does everything in the page.
//
// A candidate is used only when it finds exactly the recorded element. When the
// recorded selector no longer finds it, for example after a click navigated,
// the candidates are checked against the snapshot taken at the press instead.

const { scopeOf, scopeTextOf, scopeSelector } = require("./scope.js");

const TIMEOUT_MS = 500;
const PRESS_MAX_AGE_MS = 10000;
const ENTER_FRAME = "internal:control=enter-frame";
const BINDING = "__rfbRecorderSelectorsPress";
const CLICKABLE =
  "a, button, input, select, textarea, summary, [role=link], [role=button], " +
  "[role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option]";

// ---------------------------------------------------------------- selectors
//
// A selector is data. `parse` splits it into parts, plain objects with an
// `engine`, and `print` writes parts back as a selector; rules read and build
// parts and never selector syntax. The parts:
//
//   role         { engine, prefix: "internal:role=" | "role=", role,
//                  attrs: [{ key, value, flag, quoted }] }
//   text, label  { engine, prefix: "internal:text=" | "text=" | ..., value, flag }
//   scope        { engine, text }
//   id, nth, other  { engine, raw }: printed as they were
//
// A `flag` is `s` for an exact match, `i` for a case-insensitive part, or "".

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

const flat = (text) => (text || "").replace(/\s+/g, " ").trim();

// Quoting of attribute values in `role` parts, as Playwright does it.
const encodeAttribute = (value) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const decodeAttribute = (raw) => raw.slice(1, -1).replace(/\\(.)/g, "$1");

const ROLE = /^((?:internal:)?role=)([a-z]+)/;
const ATTRIBUTE =
  /\[([a-z-]+)(?:=(?:("(?:[^"\\]|\\.)*")([is]?)|([^\]"]*)))?\]/y;
const TEXT = /^(internal:(text|label)=)("(?:[^"\\]|\\.)*")([is]?)$/;
const NTH = /^nth=-?\d+$/;
const ID = /^(css=)?\s*(#|\[id[=~|^$*]?=)|^internal:attr=\[id=|^id=/;

function parseRole(raw) {
  const head = ROLE.exec(raw);
  if (!head) return undefined;
  const attrs = [];
  ATTRIBUTE.lastIndex = head[0].length;
  while (ATTRIBUTE.lastIndex < raw.length) {
    const match = ATTRIBUTE.exec(raw);
    if (!match) return undefined;
    const [, key, quoted, flag, plain] = match;
    attrs.push(
      quoted !== undefined
        ? { key, value: decodeAttribute(quoted), flag, quoted: true }
        : { key, value: plain, flag: "", quoted: false },
    );
  }
  return { engine: "role", prefix: head[1], role: head[2], attrs };
}

function parsePart(raw) {
  const role = parseRole(raw);
  if (role) return role;
  const text = TEXT.exec(raw);
  if (text) {
    const [, prefix, engine, quoted, flag] = text;
    return { engine, prefix, value: JSON.parse(quoted), flag };
  }
  const scopeText = scopeTextOf(raw);
  if (scopeText !== undefined) return { engine: "scope", text: scopeText };
  if (ID.test(raw)) return { engine: "id", raw };
  if (NTH.test(raw)) return { engine: "nth", raw };
  return { engine: "other", raw };
}

const printAttribute = ({ key, value, flag, quoted }) => {
  if (value === undefined) return `[${key}]`;
  return quoted ? `[${key}=${encodeAttribute(value)}${flag}]` : `[${key}=${value}]`;
};

function printPart(part) {
  switch (part.engine) {
    case "role":
      return part.prefix + part.role + part.attrs.map(printAttribute).join("");
    case "text":
    case "label":
      return `${part.prefix}${JSON.stringify(part.value)}${part.flag}`;
    case "scope":
      return scopeSelector(part.text);
    default:
      return part.raw;
  }
}

const print = (parts) => parts.map(printPart).join(" >> ");

// The chain of `selector`: `frames` up to the last frame it enters, `rest`
// after them, `target` the last part of `rest` before the `scope` and `nth`
// filters that end it, at `targetIndex` in `rest`, and `nth` the `nth` part
// among those filters.
function parse(selector) {
  const parts = splitChain(selector).map(parsePart);
  const frames = parts.slice(
    0,
    parts.findLastIndex((part) => part.raw === ENTER_FRAME) + 1,
  );
  const rest = parts.slice(frames.length);
  const isFilter = ({ engine }) => engine === "nth" || engine === "scope";
  let end = rest.length;
  while (end > 1 && isFilter(rest[end - 1])) end--;
  return {
    selector,
    parts,
    frames,
    rest,
    nth: rest.slice(end).find(({ engine }) => engine === "nth"),
    target: rest[end - 1] ?? parsePart(""),
    targetIndex: end - 1,
  };
}

const flagFor = (exact, flag) =>
  exact === undefined ? flag || "" : exact ? "s" : "i";

// `{ value, exact }` of the attribute `key` of a `role` part with a value.
function attributeOf(part, key) {
  const found = part.attrs?.find((a) => a.key === key && a.value !== undefined);
  return found && { value: found.value, exact: found.flag === "s" };
}

// `{ value, exact }`: the name of a `role` part, the text of a `text` or
// `label` part, or undefined.
function nameOf(part) {
  if (part.engine === "role") return attributeOf(part, "name");
  if (part.engine === "text" || part.engine === "label")
    return { value: part.value, exact: part.flag === "s" };
  return undefined;
}

// The `role` part with its attribute `key` set to `value`, exact or not, or as
// exact as before; an undefined `value` removes it. Other attributes stay.
function withAttribute(part, key, value, exact) {
  return {
    ...part,
    attrs: part.attrs.flatMap((a) => {
      if (a.key !== key) return [a];
      if (value === undefined) return [];
      return [{ key, value, flag: flagFor(exact, a.flag), quoted: true }];
    }),
  };
}

// The part with another name, exact or not, or as exact as before.
function withName(part, value, exact) {
  return part.engine === "role"
    ? withAttribute(part, "name", value, exact)
    : { ...part, value, flag: flagFor(exact, part.flag) };
}

// A `role` part in Browser's syntax, by default with exact attributes.
function role(roleName, { name, description, exact = true } = {}) {
  const flag = exact ? "s" : "i";
  const attrs = [
    ["name", name],
    ["description", description],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value, flag, quoted: true }));
  return { engine: "role", prefix: "role=", role: roleName, attrs };
}

// A `text` part in Browser's syntax, which compares the element's own text.
const text = (value) => ({ engine: "text", prefix: "text=", value, flag: "" });

// The `scope` filter keeping the elements whose scope is `text`.
const scope = (text) => ({ engine: "scope", text });

const withHidden = (part) =>
  part.engine === "role" && !part.attrs.some((a) => a.key === "include-hidden")
    ? {
        ...part,
        attrs: [
          { key: "include-hidden", value: "true", flag: "", quoted: false },
          ...part.attrs,
        ],
      }
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
  const [rolePart, scopePart, ...more] = parts;
  if (rolePart?.engine !== "role" || more.length) return null;
  if (scopePart && scopePart.engine !== "scope") return null;
  const found = peers.filter(
    (peer) =>
      peer.role === rolePart.role &&
      textMatches(peer.name, nameOf(rolePart)) &&
      textMatches(peer.description, attributeOf(rolePart, "description")) &&
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

// The recorded element: in the page, or at the press when the page changed and
// the press was on what the selector names. Playwright makes the selector find
// only the element, so finding none or several means the page changed, for
// example a click navigated to a page with more such elements.
async function subjectOf({ page, selector }, chain, log) {
  const recorded = page.locator(selector);
  const count = await recorded.count();
  if (count === 1) {
    const handle = await recorded.elementHandle({ timeout: TIMEOUT_MS });
    return { el: await handle.evaluate(FACTS, false), handle };
  }
  const press = recentPress(page);
  const { target } = chain;
  const name = nameOf(target);
  const pressed =
    target.engine === "role" &&
    name &&
    target.role === press?.role &&
    textMatches(press.name, name);
  if (pressed && press.peers) return { el: press, peers: press.peers };
  log(`${selector} finds ${count} elements, kept`);
  return undefined;
}

async function matchOf(subject, page, frames, parts, includeHidden) {
  if (!subject.handle) return matchPeers(subject.peers, parts);
  const checked = print([
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

// The chain with each part replaced by the first replacement of `eachPart`
// that finds only the element the chain finds, part after part.
async function replaceParts(rule, { page }, chain) {
  const parts = [...chain.parts];
  let changed = false;
  for (let i = 0; i < parts.length; i++) {
    if (rule.skipPart?.(parts[i])) continue;
    const el = await factsOf(page, print(parts.slice(0, i + 1)));
    if (!el) continue;
    for (const part of rule.eachPart({ part: parts[i], el }).filter(Boolean)) {
      const candidate = [...parts.slice(0, i), part, ...parts.slice(i + 1)];
      if (await findsSame(page, print(candidate), print(parts))) {
        parts[i] = part;
        changed = true;
        break;
      }
    }
  }
  return changed ? print(parts) : undefined;
}

async function applyRule(rule, ctx) {
  if (rule.actions && !rule.actions.includes(ctx.action?.name))
    return undefined;
  const chain = parse(ctx.selector);
  if (rule.skip?.(chain)) return undefined;
  const log = (message) =>
    console.log(`recorder_selectors ${rule.name}: ${message}`);
  if (rule.eachPart) return replaceParts(rule, ctx, chain);

  const subject = await subjectOf(ctx, chain, log);
  if (!subject) return undefined;
  try {
    const candidates = (
      rule.candidates({ el: subject.el, chain }) || []
    ).filter(Boolean);
    let first;
    for (const parts of candidates) {
      const selector = print([...chain.frames, ...parts]);
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
// the previous one returned. A rule that fails keeps the selector it got. Only
// the selector of the Action changes; an Action without one is left alone.
function pipeline(rules) {
  return {
    __recordingStarted: ({ context }) => installPresses(context),
    __recordedAction: async ({ action, page, context }) => {
      const { selector } = action;
      if (typeof selector !== "string" || typeof page?.locator !== "function")
        return undefined;
      let current = selector;
      for (const rule of rules) {
        try {
          const result = await applyRule(rule, {
            selector: current,
            action: { ...action, selector: current },
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
      return current === selector
        ? undefined
        : { ...action, selector: current };
    },
  };
}

module.exports = {
  pipeline,
  parse,
  parsePart,
  print,
  nameOf,
  attributeOf,
  withName,
  withAttribute,
  role,
  text,
  scope,
};
