// Small functions over plain arrays, in the spirit of Clojure's core.

// A new array with `x` at index `i`.
const replaceAt = (xs, i, x) => xs.map((y, j) => (j === i ? x : y));

// The first result of `f(x)` that is not undefined; `f` is not called after it.
const firstDefined = (xs, f) =>
  xs.reduce((found, x) => (found === undefined ? f(x) : found), undefined);

// `reduce` with an async `f`, applied to one element after the other.
const reduceAsync = (xs, f, init) =>
  xs.reduce(async (acc, x, i) => f(await acc, x, i), Promise.resolve(init));

// The first `x` for which the async `pred` holds, checked one after the other;
// `pred` is not called after it.
const findAsync = (xs, pred) =>
  reduceAsync(xs, async (found, x) => found ?? ((await pred(x)) ? x : undefined));

// The results of the async `f` on `xs`, one after the other, up to and
// including the first result for which `done` holds; `f` is not called after it.
const mapUntilAsync = async (xs, f, done) => {
  if (xs.length === 0) return [];
  const result = await f(xs[0]);
  return done(result)
    ? [result]
    : [result, ...(await mapUntilAsync(xs.slice(1), f, done))];
};

module.exports = {
  replaceAt,
  firstDefined,
  reduceAsync,
  findAsync,
  mapUntilAsync,
};
