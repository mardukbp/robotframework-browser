// Small functions over plain arrays, in the spirit of Clojure's core.

// A new array with `x` at index `i`.
function replaceAt(xs, i, x) {
  const copy = [...xs];
  copy[i] = x;
  return copy;
}

// The first result of `f(x)` that is not undefined; `f` is not called after it.
function firstDefined(xs, f) {
  for (const x of xs) {
    const result = f(x);
    if (result !== undefined) return result;
  }
  return undefined;
}

// `xs` without repeats, in their order.
function distinct(xs) {
  return [...new Set(xs)];
}

// The results of `f` on `xs`, one after the other, up to and including the
// first result for which `done` holds; `f` is not called after it.
function mapUntil(xs, f, done) {
  const results = [];
  for (const x of xs) {
    const result = f(x);
    results.push(result);
    if (done(result)) return results;
  }
  return results;
}

module.exports = {
  replaceAt,
  firstDefined,
  distinct,
  mapUntil,
};
