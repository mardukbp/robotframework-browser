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

const { some } = require("./fp.js");
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

// Quoting of attribute values in `role` parts, as Playwright does it.
const encodeAttribute = (value) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const decodeAttribute = (raw) => raw.slice(1, -1).replace(/\\(.)/g, "$1");

const toAttribute = ([, key, quoted, flag, plain]) =>
  quoted === undefined
    ? { key, value: plain, flag: "", quoted: false }
    : { key, value: decodeAttribute(quoted), flag, quoted: true };

// ------------------------------------------------------------------ parse

// A `role` part, when every character after the role is an attribute.
function parseRole(raw) {
  const head = ROLE.exec(raw);
  if (!head) return undefined;
  const tail = raw.slice(head[0].length);
  const matches = [...tail.matchAll(ATTRIBUTE)];
  if (matches.map(([all]) => all).join("") !== tail) return undefined;
  return {
    engine: "role",
    prefix: head[1],
    role: head[2],
    attrs: matches.map(toAttribute),
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

const parseAs = (engine, pattern) => (raw) =>
  pattern.test(raw) ? { engine, raw } : undefined;

const PARSERS = [
  parseRole,
  parseText,
  parseScope,
  parseAs("id", ID),
  parseAs("nth", NTH),
  (raw) => ({ engine: "other", raw }),
];

const parsePart = (raw) => some(PARSERS, (parsePart) => parsePart(raw));

const isFilter = ({ engine }) => engine === "nth" || engine === "scope";

// The chain of `selector`: `frames` up to the last frame it enters, `rest`
// after them, `target` the last part of `rest` before the `scope` and `nth`
// filters that end it, at `targetIndex` in `rest`, and `nth` the `nth` part
// among those filters.
function parse(selector) {
  const parts = selector.split(SEPARATOR).map(parsePart);
  const frames = parts.slice(
    0,
    parts.findLastIndex(({ raw }) => raw === ENTER_FRAME) + 1,
  );
  const rest = parts.slice(frames.length);
  const targetIndex = rest.length
    ? Math.max(rest.findLastIndex((part) => !isFilter(part)), 0)
    : -1;
  return {
    selector,
    parts,
    frames,
    rest,
    nth: rest.slice(targetIndex + 1).find(({ engine }) => engine === "nth"),
    target: rest[targetIndex] ?? parsePart(""),
    targetIndex,
  };
}

// ------------------------------------------------------------------ print

const printAttribute = ({ key, value, flag, quoted }) => {
  if (value === undefined) return `[${key}]`;
  return quoted
    ? `[${key}=${encodeAttribute(value)}${flag}]`
    : `[${key}=${value}]`;
};

const printText = ({ prefix, value, flag }) =>
  `${prefix}${JSON.stringify(value)}${flag}`;

const PRINTERS = {
  role: ({ prefix, role, attrs }) =>
    prefix + role + attrs.map(printAttribute).join(""),
  text: printText,
  label: printText,
  scope: ({ text }) => scopeSelector(text),
};

const printPart = (part) => (PRINTERS[part.engine] ?? (({ raw }) => raw))(part);

const print = (parts) => parts.map(printPart).join(" >> ");

// ------------------------------------------------------ reading and changing

const flagFor = (exact, flag) =>
  exact === undefined ? flag || "" : exact ? "s" : "i";

const isExact = (flag) => flag === "s";

// `{ value, exact }` of the attribute `key` of a `role` part with a value.
function attributeOf(part, key) {
  const found = part.attrs?.find((a) => a.key === key && a.value !== undefined);
  return found && { value: found.value, exact: isExact(found.flag) };
}

const NAMES = {
  role: (part) => attributeOf(part, "name"),
  text: ({ value, flag }) => ({ value, exact: isExact(flag) }),
  label: ({ value, flag }) => ({ value, exact: isExact(flag) }),
};

// `{ value, exact }`: the name of a `role` part, the text of a `text` or
// `label` part, or undefined.
const nameOf = (part) => NAMES[part.engine]?.(part);

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

// The part with another name, exact or not, or as exact as before.
const withName = (part, value, exact) =>
  part.engine === "role"
    ? withAttribute(part, "name", value, exact)
    : { ...part, value, flag: flagFor(exact, part.flag) };

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
