// Each name or text gets back the number Playwright's selector generator drops
// at its start or end, taking it for a count that changes:
//
//   a radio labelled "46 km/h bis 60 km/h"
//   internal:text="km/h bis 60 km/h"i   becomes   internal:text="46 km/h bis 60 km/h"i

const { firstDefined } = require("../fp.js");
const { nameOf, withName } = require("../selector.js");
const { findsByName } = require("../conditions.js");

module.exports = {
  name: "number_widening",
  forEachPart: {
    when: [findsByName],
    tryInOrder: ({ part, element }) => {
      const names = textsOfElement(element).flatMap((text) =>
        withDroppedNumber(nameOf(part).value, text),
      );
      return [...new Set(names)].map((name) => withName(part, name));
    },
  },
};

// Playwright keeps at most 80 characters of a text; a longer one was cut, not stripped.
const MAX_TEXT_LENGTH = 200;

function textsOfElement(element) {
  return element.texts.filter((text) => text.length <= MAX_TEXT_LENGTH);
}

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

// `name` with the number Playwright dropped from `text`, in every spelling of
// the space between them; none if it dropped none.
function withDroppedNumber(name, text) {
  const full = normalizeSpace(text);
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
  if (/^\s|\s$/.test(text)) return [" ", " "];
  return [""];
}

function normalizeSpace(text) {
  return text.replace(/\s+/g, " ").trim();
}
