// Gives back the number Playwright's selector generator drops at the start or
// the end of a text, taking it for a count that changes: a radio labelled
// "46 km/h bis 60 km/h" is recorded as `internal:text="km/h bis 60 km/h"i`. The
// whole text is used when it still finds the same element and only it.

const { parsePart, join, factsOf, findsSame } = require("../kit.js");

// Playwright keeps at most 80 characters of a text; a longer source was cut, not stripped.
const MAX_SOURCE_LENGTH = 200;
// The number Playwright strips, as its own patterns find it.
const LEADING_NUMBER = /^([\d.,]+)[^.,\w]/;
const TRAILING_NUMBER = /[^.,\w]([\d.,]+)$/;

const normalize = (text) => text.replace(/\s+/g, " ").trim();

// `name` with the number Playwright dropped from `source`, in every spelling of
// the space between them that a match may need; none if it dropped none.
function withNumber(name, source) {
  const full = normalize(source);
  const wanted = normalize(name);
  if (!wanted || full === wanted) return [];
  // A no-break space between number and text stays in an accessible name.
  const joined = (rest, glue) =>
    /^\s|\s$/.test(rest) ? [glue(" "), glue(" ")] : [glue("")];
  const leading = LEADING_NUMBER.exec(full);
  if (leading) {
    const rest = full.slice(leading[1].length);
    if (normalize(rest) === wanted)
      return joined(rest, (s) => `${leading[1]}${s}${name}`);
  }
  const trailing = TRAILING_NUMBER.exec(full);
  if (trailing) {
    const rest = full.slice(0, full.length - trailing[1].length);
    if (normalize(rest) === wanted)
      return joined(rest, (s) => `${name}${s}${trailing[1]}`);
  }
  return [];
}

module.exports = {
  name: "number_widening",
  skip: ({ parts }) => !parts.some((part) => parsePart(part).name),
  rewrite: async ({ page, chain }) => {
    const parts = [...chain.parts];
    let result = chain.selector;
    for (let i = 0; i < parts.length; i++) {
      const part = parsePart(parts[i]);
      if (!part.name) continue;
      const facts = await factsOf(page, join(parts.slice(0, i + 1)));
      const sources = (facts?.texts ?? []).filter(
        (text) => text.length <= MAX_SOURCE_LENGTH,
      );
      const names = new Set(
        sources.flatMap((source) => withNumber(part.name.value, source)),
      );
      for (const name of names) {
        const widened = part.withName(name);
        const candidate = join([
          ...parts.slice(0, i),
          widened,
          ...parts.slice(i + 1),
        ]);
        if (await findsSame(page, candidate, result)) {
          parts[i] = widened;
          result = candidate;
          break;
        }
      }
    }
    return result === chain.selector ? undefined : result;
  },
};
