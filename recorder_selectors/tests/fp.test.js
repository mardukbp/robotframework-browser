// Unit tests of the Clojure-like helpers.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  assoc,
  some,
  reduceAsync,
  findAsync,
  mapUntilAsync,
} = require("../RecorderSelectors/js/fp.js");

describe("fp", () => {
  it("assoc gives a new array with one element replaced", () => {
    const xs = [1, 2, 3];
    assert.deepEqual(assoc(xs, 1, 9), [1, 9, 3]);
    assert.deepEqual(xs, [1, 2, 3]);
  });

  it("some gives the first defined result and calls nothing after it", () => {
    const called = [];
    const f = (x) => (called.push(x), x > 1 ? x * 10 : undefined);
    assert.equal(some([1, 2, 3], f), 20);
    assert.deepEqual(called, [1, 2]);
    assert.equal(some([1], f), undefined);
    assert.equal(some([0], () => null), null);
  });

  it("reduceAsync runs the steps one after the other", async () => {
    const order = [];
    const total = await reduceAsync(
      [30, 10, 20],
      async (sum, ms, i) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        order.push(i);
        return sum + ms;
      },
      0,
    );
    assert.equal(total, 60);
    assert.deepEqual(order, [0, 1, 2]);
  });

  it("mapUntilAsync maps one after the other and stops after the first done", async () => {
    const called = [];
    const f = async (x) => (called.push(x), x * 10);
    assert.deepEqual(await mapUntilAsync([1, 2, 3, 4], f, (y) => y === 20), [10, 20]);
    assert.deepEqual(called, [1, 2]);
    assert.deepEqual(await mapUntilAsync([1, 3], f, (y) => y === 20), [10, 30]);
    assert.deepEqual(await mapUntilAsync([], f, () => true), []);
  });

  it("findAsync gives the first match and checks nothing after it", async () => {
    const checked = [];
    const pred = async (x) => (checked.push(x), x % 2 === 0);
    assert.equal(await findAsync([1, 4, 6], pred), 4);
    assert.deepEqual(checked, [1, 4]);
    assert.equal(await findAsync([1, 3], pred), undefined);
  });
});
