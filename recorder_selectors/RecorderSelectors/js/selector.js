// Selectors as data. `parse` splits a selector into parts, plain objects with an
// `engine`, and `print` writes parts back; rules read and build parts and never
// selector syntax. Everything here is a pure function. The parts:
//
//   role         { engine, prefix: "internal:role=" | "role=", role,
//                  attrs: [{ key, value, flag, quoted }] }
//   text, label  { engine, prefix: "internal:text=" | "text=" | ..., value, flag }
//   scope        { engine, text }
//   hasText      { engine, raw, tag, value }: CSS such as `label:has-text("Ja")`,
//                printed as it was
//   id, nth, other  { engine, raw }: printed as they were
//
// A `flag` is `s` for an exact match, `i` for a case-insensitive part, or "".

const { firstDefined } = require("./fp.js");
const { scopeTextOf, scopeSelector } = require("./scope.js");

const ENTER_FRAME = "internal:control=enter-frame";

// Playwright's ` >> ` chain separator outside a quoted string: an even number
// of quotes follows it.
const SEPARATOR = / >> (?=(?:[^"]*"(?:[^"\\]|\\.)*")*[^"]*$)/;
const ROLE = /^((?:internal:)?role=)([a-z]+)/;
const ATTRIBUTE = /\[([a-z-]+)(?:=(?:("(?:[^"\\]|\\.)*")([is]?)|([^\]"]*)))?\]/g;
const TEXT = /^(internal:(text|label)=)("(?:[^"\\]|\\.)*")([is]?)$/;
const NTH = /^nth=-?\d+$/;
const HAS_TEXT = /^(?:css=)?([a-z][a-z0-9-]*):has-text\(("(?:[^"\\]|\\.)*")\)$/;
const ID = /^(css=)?\s*(#|\[id[=~|^$*]?=)|^internal:attr=\[id=|^id=/;

// ------------------------------------------------------------------ parse

// The chain of `selector`:
//   parts        every part
//   frames       the parts up to the last frame it enters
//   afterFrames  the parts after them
//   target       the part of `afterFrames` the element is found by: the last
//                one before the `scope` and `nth` filters that end the chain
//   targetIndex  its index in `afterFrames`
//   nth          the `nth` filter after it, if any
function parse(selector) {
  const parts = selector.split(SEPARATOR).map(parsePart);
  const frames = parts.slice(0, parts.findLastIndex(entersFrame) + 1);
  const afterFrames = parts.slice(frames.length);
  const targetIndex = targetIndexIn(afterFrames);
  return {
    selector,
    parts,
    frames,
    afterFrames,
    target: afterFrames[targetIndex] ?? parsePart(""),
    targetIndex,
    nth: afterFrames.slice(targetIndex + 1).find(isNth),
  };
}

// The index of the last part that is no filter; the first part when all are
// filters, and -1 when there are no parts.
function targetIndexIn(parts) {
  if (parts.length === 0) return -1;
  const lastNoFilter = parts.findLastIndex((part) => !isFilter(part));
  return Math.max(lastNoFilter, 0);
}

function entersFrame(part) {
  return part.raw === ENTER_FRAME;
}

function isNth(part) {
  return part.engine === "nth";
}

function isFilter(part) {
  return isNth(part) || part.engine === "scope";
}

// One part of a chain, by the first parser that recognizes it.
function parsePart(raw) {
  return firstDefined(PARSERS, (parser) => parser(raw));
}

// A `role` part, when everything after the role is attributes.
function parseRole(raw) {
  const head = ROLE.exec(raw);
  if (!head) return undefined;
  const tail = raw.slice(head[0].length);
  const attributes = [...tail.matchAll(ATTRIBUTE)];
  const allAttributes = attributes.map(([all]) => all).join("") === tail;
  if (!allAttributes) return undefined;
  return {
    engine: "role",
    prefix: head[1],
    role: head[2],
    attrs: attributes.map(toAttribute),
  };
}

function parseText(raw) {
  const match = TEXT.exec(raw);
  if (!match) return undefined;
  const [, prefix, engine, quoted, flag] = match;
  return { engine, prefix, value: JSON.parse(quoted), flag };
}

function parseScope(raw) {
  const text = scopeTextOf(raw);
  if (text === undefined) return undefined;
  return { engine: "scope", text };
}

function parseId(raw) {
  if (!ID.test(raw)) return undefined;
  return { engine: "id", raw };
}

function parseHasText(raw) {
  const match = HAS_TEXT.exec(raw);
  if (!match) return undefined;
  const [, tag, quoted] = match;
  return { engine: "hasText", raw, tag, value: JSON.parse(quoted) };
}

function parseNth(raw) {
  if (!NTH.test(raw)) return undefined;
  return { engine: "nth", raw };
}

function parseOther(raw) {
  return { engine: "other", raw };
}

const PARSERS = [
  parseRole,
  parseText,
  parseScope,
  parseId,
  parseHasText,
  parseNth,
  parseOther,
];

function toAttribute([, key, quoted, flag, plain]) {
  if (quoted === undefined) return { key, value: plain, flag: "", quoted: false };
  return { key, value: decodeAttribute(quoted), flag, quoted: true };
}

// ------------------------------------------------------------------ print

function print(parts) {
  return parts.map(printPart).join(" >> ");
}

function printPart(part) {
  if (part.engine === "role") return printRole(part);
  if (part.engine === "text" || part.engine === "label") return printText(part);
  if (part.engine === "scope") return scopeSelector(part.text);
  return part.raw;
}

function printRole({ prefix, role, attrs }) {
  return prefix + role + attrs.map(printAttribute).join("");
}

function printText({ prefix, value, flag }) {
  return `${prefix}${JSON.stringify(value)}${flag}`;
}

function printAttribute({ key, value, flag, quoted }) {
  if (value === undefined) return `[${key}]`;
  if (!quoted) return `[${key}=${value}]`;
  return `[${key}=${encodeAttribute(value)}${flag}]`;
}

// Quoting of attribute values in `role` parts, as Playwright does it.
function encodeAttribute(value) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function decodeAttribute(quoted) {
  return quoted.slice(1, -1).replace(/\\(.)/g, "$1");
}

// ------------------------------------------------------ reading and changing

// `{ value, exact }`: the name of a `role` part, the text of a `text` or
// `label` part, or undefined.
function nameOf(part) {
  if (part.engine === "role") return attributeOf(part, "name");
  if (part.engine === "text" || part.engine === "label")
    return { value: part.value, exact: isExact(part.flag) };
  return undefined;
}

// `{ value, exact }` of the attribute `key` of a `role` part with a value.
function attributeOf(part, key) {
  const found = part.attrs?.find((a) => a.key === key && a.value !== undefined);
  if (!found) return undefined;
  return { value: found.value, exact: isExact(found.flag) };
}

// The part with another name, exact or not, or as exact as before.
function withName(part, value, exact) {
  if (part.engine === "role") return withAttribute(part, "name", value, exact);
  return { ...part, value, flag: flagFor(exact, part.flag) };
}

// The `role` part with its attribute `key` set to `value`, exact or not, or as
// exact as before; an undefined `value` removes it. Other attributes stay.
function withAttribute(part, key, value, exact) {
  const changed = (attribute) => {
    if (attribute.key !== key) return [attribute];
    if (value === undefined) return [];
    const flag = flagFor(exact, attribute.flag);
    return [{ key, value, flag, quoted: true }];
  };
  return { ...part, attrs: part.attrs.flatMap(changed) };
}

// The `role` part that also finds hidden elements.
function withHidden(part) {
  if (part.engine !== "role") return part;
  if (part.attrs.some((a) => a.key === "include-hidden")) return part;
  const includeHidden = {
    key: "include-hidden",
    value: "true",
    flag: "",
    quoted: false,
  };
  return { ...part, attrs: [includeHidden, ...part.attrs] };
}

function isExact(flag) {
  return flag === "s";
}

// The flag for `exact`, or `flag` when `exact` is undefined.
function flagFor(exact, flag) {
  if (exact === undefined) return flag || "";
  if (exact) return "s";
  return "i";
}

// ------------------------------------------------------------------ build

// A `role` part in Browser's syntax, by default with exact attributes.
function role(roleName, { name, description, exact = true } = {}) {
  const flag = flagFor(exact);
  const attrs = Object.entries({ name, description })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value, flag, quoted: true }));
  return { engine: "role", prefix: "role=", role: roleName, attrs };
}

// A `text` part in Browser's syntax, which compares the element's own text.
function text(value) {
  return { engine: "text", prefix: "text=", value, flag: "" };
}

// The `scope` filter keeping the elements whose scope is `text`.
function scope(text) {
  return { engine: "scope", text };
}

module.exports = {
  parse,
  parsePart,
  print,
  nameOf,
  attributeOf,
  withName,
  withAttribute,
  withHidden,
  role,
  text,
  scope,
};
