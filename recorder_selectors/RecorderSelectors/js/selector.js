// Selectors as data. `parse` splits a selector into parts, plain objects with an
// `engine`, and `print` writes parts back; rules read and build parts and never
// selector syntax. Everything here is a pure function. The parts:
//
//   role         { engine, prefix: "internal:role=" | "role=", role,
//                  attrs: [{ key, value, flag, quoted }] }
//   text, label  { engine, prefix: "internal:text=" | "text=" | ..., value, flag }
//   scope        { engine, text }
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
  const targetIndex = afterFrames.length
    ? Math.max(afterFrames.findLastIndex((part) => !isFilter(part)), 0)
    : -1;
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

const entersFrame = ({ raw }) => raw === ENTER_FRAME;
const isNth = ({ engine }) => engine === "nth";
const isFilter = (part) => isNth(part) || part.engine === "scope";

// One part of a chain, by the first parser that recognizes it.
const parsePart = (raw) => firstDefined(PARSERS, (parser) => parser(raw));

// A `role` part, when everything after the role is attributes.
function parseRole(raw) {
  const head = ROLE.exec(raw);
  if (!head) return undefined;
  const tail = raw.slice(head[0].length);
  const attributes = [...tail.matchAll(ATTRIBUTE)];
  if (attributes.map(([all]) => all).join("") !== tail) return undefined;
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
  return text === undefined ? undefined : { engine: "scope", text };
}

// A part kept as it was, as `engine`, when it matches `pattern`.
const parseByPattern = (engine, pattern) => (raw) =>
  pattern.test(raw) ? { engine, raw } : undefined;

const PARSERS = [
  parseRole,
  parseText,
  parseScope,
  parseByPattern("id", ID),
  parseByPattern("nth", NTH),
  (raw) => ({ engine: "other", raw }),
];

const toAttribute = ([, key, quoted, flag, plain]) =>
  quoted === undefined
    ? { key, value: plain, flag: "", quoted: false }
    : { key, value: decodeAttribute(quoted), flag, quoted: true };

// ------------------------------------------------------------------ print

const print = (parts) => parts.map(printPart).join(" >> ");

const printPart = (part) => (PRINTERS[part.engine] ?? printRaw)(part);

const printRaw = ({ raw }) => raw;

const printText = ({ prefix, value, flag }) =>
  `${prefix}${JSON.stringify(value)}${flag}`;

const printAttribute = ({ key, value, flag, quoted }) => {
  if (value === undefined) return `[${key}]`;
  return quoted
    ? `[${key}=${encodeAttribute(value)}${flag}]`
    : `[${key}=${value}]`;
};

const PRINTERS = {
  role: ({ prefix, role, attrs }) =>
    prefix + role + attrs.map(printAttribute).join(""),
  text: printText,
  label: printText,
  scope: ({ text }) => scopeSelector(text),
};

// Quoting of attribute values in `role` parts, as Playwright does it.
const encodeAttribute = (value) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const decodeAttribute = (quoted) =>
  quoted.slice(1, -1).replace(/\\(.)/g, "$1");

// ------------------------------------------------------ reading and changing

// `{ value, exact }`: the name of a `role` part, the text of a `text` or
// `label` part, or undefined.
const nameOf = (part) => NAME_READERS[part.engine]?.(part);

// `{ value, exact }` of the attribute `key` of a `role` part with a value.
function attributeOf(part, key) {
  const found = part.attrs?.find((a) => a.key === key && a.value !== undefined);
  return found && { value: found.value, exact: isExact(found.flag) };
}

const textOf = ({ value, flag }) => ({ value, exact: isExact(flag) });

const NAME_READERS = {
  role: (part) => attributeOf(part, "name"),
  text: textOf,
  label: textOf,
};

// The part with another name, exact or not, or as exact as before.
const withName = (part, value, exact) =>
  part.engine === "role"
    ? withAttribute(part, "name", value, exact)
    : { ...part, value, flag: flagFor(exact, part.flag) };

// The `role` part with its attribute `key` set to `value`, exact or not, or as
// exact as before; an undefined `value` removes it. Other attributes stay.
const withAttribute = (part, key, value, exact) => ({
  ...part,
  attrs: part.attrs.flatMap((a) => {
    if (a.key !== key) return [a];
    if (value === undefined) return [];
    return [{ key, value, flag: flagFor(exact, a.flag), quoted: true }];
  }),
});

// The `role` part that also finds hidden elements.
const withHidden = (part) =>
  part.engine !== "role" || part.attrs.some((a) => a.key === "include-hidden")
    ? part
    : {
        ...part,
        attrs: [
          { key: "include-hidden", value: "true", flag: "", quoted: false },
          ...part.attrs,
        ],
      };

const isExact = (flag) => flag === "s";

// The flag for `exact`, or `flag` when `exact` is undefined.
const flagFor = (exact, flag) =>
  exact === undefined ? flag || "" : exact ? "s" : "i";

// ------------------------------------------------------------------ build

// A `role` part in Browser's syntax, by default with exact attributes.
const role = (roleName, { name, description, exact = true } = {}) => ({
  engine: "role",
  prefix: "role=",
  role: roleName,
  attrs: Object.entries({ name, description })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value, flag: flagFor(exact), quoted: true })),
});

// A `text` part in Browser's syntax, which compares the element's own text.
const text = (value) => ({ engine: "text", prefix: "text=", value, flag: "" });

// The `scope` filter keeping the elements whose scope is `text`.
const scope = (text) => ({ engine: "scope", text });

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
