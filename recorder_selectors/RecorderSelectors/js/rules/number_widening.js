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

const normalizeSpace = (text) => text.replace(/\s+/g, " ").trim();

// The spellings of the space between number and text that a match may need: a
// no-break space stays in an accessible name.
const spacesAround = (text) => (/^\s|\s$/.test(text) ? [" ", " "] : [""]);

// `name` with the number Playwright dropped from `source`, in every spelling of
// the space between them; none if it dropped none.
function withNumber(name, source) {
  const full = normalizeSpace(source);
  const wanted = normalizeSpace(name);
  if (!wanted || full === wanted) return [];
  const restored = (dropped) => {
    const number = dropped.number.exec(full)?.[1];
    const stripped = number && dropped.strip(full, number);
    return stripped && normalizeSpace(stripped) === wanted
      ? spacesAround(stripped).map((space) =>
          dropped.restore(name, number, space),
        )
      : undefined;
  };
  return firstDefined(DROPPED_NUMBERS, restored) ?? [];
}

const unique = (xs) => [...new Set(xs)];

module.exports = {
  name: "number_widening",
  skip: ({ parts }) => !parts.some(nameOf),
  skipPart: (part) => !nameOf(part),
  eachPart: ({ part, facts }) =>
    unique(
      facts.texts
        .filter((text) => text.length <= MAX_SOURCE_LENGTH)
        .flatMap((source) => withNumber(nameOf(part).value, source)),
    ).map((name) => withName(part, name)),
};
