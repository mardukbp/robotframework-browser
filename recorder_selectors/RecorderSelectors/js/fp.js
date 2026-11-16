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

// `reduce` with an async `f`, applied to one element after the other.
function reduceAsync(xs, f, init) {
  return xs.reduce(
    async (acc, x, i) => f(await acc, x, i),
    Promise.resolve(init),
  );
}

// The first `x` for which the async `pred` holds, checked one after the other;
// `pred` is not called after it.
async function findAsync(xs, pred) {
  for (const x of xs) {
    if (await pred(x)) return x;
  }
  return undefined;
}

// The results of the async `f` on `xs`, one after the other, up to and
// including the first result for which `done` holds; `f` is not called after it.
async function mapUntilAsync(xs, f, done) {
  const results = [];
  for (const x of xs) {
    const result = await f(x);
    results.push(result);
    if (done(result)) return results;
  }
  return results;
}

module.exports = {
  replaceAt,
  firstDefined,
  reduceAsync,
  findAsync,
  mapUntilAsync,
};
