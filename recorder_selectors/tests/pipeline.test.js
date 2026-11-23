// Unit tests of the chain of steps behind the extension's __recordedAction.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { pipeline, selectorStep } = require("../RecorderSelectors/js/run_rules.js");

const step = (name, run) => ({ name, run });
const click = { name: "click", selector: "#a" };

describe("pipeline", () => {
  it("runs each step on the Action the one before gave", async () => {
    const seen = [];
    const hook = pipeline([
      step("first", ({ action }) => ({ ...action, selector: "#b" })),
      step("second", ({ action }) => {
        seen.push(action.selector);
        return undefined;
      }),
      step("third", async ({ action }) => ({ ...action, options: [{ label: "A" }] })),
    ]);
    assert.deepEqual(await hook({ action: click }), { ...click, selector: "#b", options: [{ label: "A" }] });
    assert.deepEqual(seen, ["#b"]);
  });

  it("gives undefined when no step changes the Action", async () => {
    assert.equal(await pipeline([step("none", () => undefined)])({ action: click }), undefined);
  });

  it("keeps the Action a failing step got, logs, and runs the next step", async (t) => {
    const log = t.mock.method(console, "log", () => undefined);
    const hook = pipeline([
      step("broken", () => {
        throw new Error("boom");
      }),
      step("next", ({ action }) => ({ ...action, selector: "#c" })),
    ]);
    assert.deepEqual(await hook({ action: click }), { ...click, selector: "#c" });
    assert.match(log.mock.calls[0].arguments[0], /recorder_selectors broken: #a kept: Error: boom/);
  });
});

describe("selectorStep", () => {
  const rule = { name: "never", when: { recorded: [() => false] }, tryInOrder: () => [] };

  it("leaves an Action without a selector, or without a page, alone", async () => {
    const { run } = selectorStep(rule);
    assert.equal(await run({ action: { name: "navigate", url: "x" }, page: { locator() {} } }), undefined);
    assert.equal(await run({ action: click, page: undefined }), undefined);
  });

  it("keeps the selector when a condition of the rule does not hold", async () => {
    const { run } = selectorStep(rule);
    assert.equal(await run({ action: click, page: { locator() {} } }), undefined);
  });
});
