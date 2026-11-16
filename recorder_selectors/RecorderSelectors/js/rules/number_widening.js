// Gives back the number Playwright's selector generator drops at the start or
// the end of a text, taking it for a count that changes: a radio labelled
// "46 km/h bis 60 km/h" is recorded as `internal:text="km/h bis 60 km/h"i`. The
// whole text is used when it still finds the same element and only it.

const { firstDefined } = require("../fp.js");
const { nameOf, withName } = require("../selector.js");

// Playwright keeps at most 80 characters of a text; a longer source was cut, not stripped.
const MAX_SOURCE_LENGTH = 200;

// Where Playwright drops a number, as its own patterns find it: the number,
// the text with the number stripped, and the name with the number restored,
// joined by `space`.
const DROPPED_NUMBERS = [
  {
    number: /^([\d.,]+)[^.,\w]/,
    strip: (full, number) => full.slice(number.length),
    restore: (name, number, space) => `${number}${space}${name}`,
  },
  {
    number: /[^.,\w]([\d.,]+)$/,
    strip: (full, number) => full.slice(0, -number.length),
    restore: (name, number, space) => `${name}${space}${number}`,
  },
];

// Only a chain with a name or text in it.
function skip({ parts }) {
  return !parts.some(nameOf);
}

function skipPart(part) {
  return !nameOf(part);
}

// The part with each name that gives back the number Playwright dropped.
function eachPart({ part, facts }) {
  const sources = facts.texts.filter((text) => text.length <= MAX_SOURCE_LENGTH);
  const names = sources.flatMap((source) => withNumber(nameOf(part).value, source));
  return [...new Set(names)].map((name) => withName(part, name));
}

// `name` with the number Playwright dropped from `source`, in every spelling of
// the space between them; none if it dropped none.
function withNumber(name, source) {
  const full = normalizeSpace(source);
  const wanted = normalizeSpace(name);
  if (!wanted || full === wanted) return [];
  const restored = firstDefined(DROPPED_NUMBERS, (dropped) =>
    restoreNumber(dropped, full, name, wanted),
  );
  return restored ?? [];
}

// The names with the number `dropped` finds in `full`, when stripping it leaves
// `wanted`; undefined otherwise.
function restoreNumber(dropped, full, name, wanted) {
  const number = dropped.number.exec(full)?.[1];
  if (!number) return undefined;
  const stripped = dropped.strip(full, number);
  if (!stripped || normalizeSpace(stripped) !== wanted) return undefined;
  return spacesAround(stripped).map((space) => dropped.restore(name, number, space));
}

// The spellings of the space between number and text that a match may need: a
// no-break space stays in an accessible name.
function spacesAround(text) {
  if (/^\s|\s$/.test(text)) return [" ", "\u00a0"];
  return [""];
}

function normalizeSpace(text) {
  return text.replace(/\s+/g, " ").trim();
}

module.exports = { name: "number_widening", skip, skipPart, eachPart };
