// Unit tests of the Clojure-like helpers.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  replaceAt,
  firstDefined,
  distinct,
  mapUntil,
} = require("../RecorderSelectors/js/fp.js");

describe("fp", () => {
  it("replaceAt gives a new array with one element replaced", () => {
    const xs = [1, 2, 3];
    assert.deepEqual(replaceAt(xs, 1, 9), [1, 9, 3]);
    assert.deepEqual(xs, [1, 2, 3]);
  });

  it("firstDefined gives the first defined result and calls nothing after it", () => {
    const called = [];
    const f = (x) => {
      called.push(x);
      if (x > 1) return x * 10;
      return undefined;
    };
    assert.equal(firstDefined([1, 2, 3], f), 20);
    assert.deepEqual(called, [1, 2]);
    assert.equal(firstDefined([1], f), undefined);
    assert.equal(firstDefined([0], () => null), null);
  });

  it("mapUntil maps one after the other and stops after the first done", () => {
    const called = [];
    const f = (x) => (called.push(x), x * 10);
    assert.deepEqual(mapUntil([1, 2, 3, 4], f, (y) => y === 20), [10, 20]);
    assert.deepEqual(called, [1, 2]);
    assert.deepEqual(mapUntil([1, 3], f, (y) => y === 20), [10, 30]);
    assert.deepEqual(mapUntil([], f, () => true), []);
  });

  it("distinct drops repeats and keeps the order", () => {
    assert.deepEqual(distinct(["b", "a", "b", "c", "a"]), ["b", "a", "c"]);
  });
});
