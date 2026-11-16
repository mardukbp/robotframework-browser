// Gives back the number Playwright's selector generator drops at the start or
// the end of a text, taking it for a count that changes: a radio labelled
// "46 km/h bis 60 km/h" is recorded as `internal:text="km/h bis 60 km/h"i`. The
// whole text is used when it still finds the same element and only it.

const { some } = require("../fp.js");
const { nameOf, withName } = require("../selector.js");

// Playwright keeps at most 80 characters of a text; a longer source was cut, not stripped.
const MAX_SOURCE_LENGTH = 200;

// Where Playwright drops a number, as its own patterns find it: the number,
// the text without it, and the name with it again, joined by `space`.
const ENDS = [
  {
    number: /^([\d.,]+)[^.,\w]/,
    without: (full, number) => full.slice(number.length),
    with: (name, number, space) => `${number}${space}${name}`,
  },
  {
    number: /[^.,\w]([\d.,]+)$/,
    without: (full, number) => full.slice(0, -number.length),
    with: (name, number, space) => `${name}${space}${number}`,
  },
];

const normalize = (text) => text.replace(/\s+/g, " ").trim();

// The spellings of the space between number and text that a match may need: a
// no-break space stays in an accessible name.
const spacesAround = (text) => (/^\s|\s$/.test(text) ? [" ", " "] : [""]);

// `name` with the number Playwright dropped from `source`, in every spelling of
// the space between them; none if it dropped none.
function withNumber(name, source) {
  const full = normalize(source);
  const wanted = normalize(name);
  if (!wanted || full === wanted) return [];
  const widened = (end) => {
    const number = end.number.exec(full)?.[1];
    const rest = number && end.without(full, number);
    return rest && normalize(rest) === wanted
      ? spacesAround(rest).map((space) => end.with(name, number, space))
      : undefined;
  };
  return some(ENDS, widened) ?? [];
}

const unique = (xs) => [...new Set(xs)];

module.exports = {
  name: "number_widening",
  skip: ({ parts }) => !parts.some(nameOf),
  skipPart: (part) => !nameOf(part),
  eachPart: ({ part, el }) =>
    unique(
      el.texts
        .filter((text) => text.length <= MAX_SOURCE_LENGTH)
        .flatMap((source) => withNumber(nameOf(part).value, source)),
    ).map((name) => withName(part, name)),
};
