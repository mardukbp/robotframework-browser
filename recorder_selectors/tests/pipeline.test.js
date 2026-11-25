// Unit tests of the chain of steps behind the extension's __rewriteSelector,
// and of the bundle that carries it into the page.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const { pipeline, selectorStep } = require("../RecorderSelectors/js/run_rules.js");
const extension = require("../RecorderSelectors/js/index.js");

const step = (name, run) => ({ name, run });
const element = { id: "a" };
const query = () => [element];

function hookArgs(selector, more = {}) {
  const logged = [];
  const args = { name: "click", selector, element, query, log: (m) => logged.push(m), timeLeft: () => 500, ...more };
  return { logged, args };
}

describe("pipeline", () => {
  it("runs each step on the selector the one before gave, and gives the last", () => {
    const seen = [];
    const hook = pipeline([
      step("first", () => "#b"),
      step("second", ({ selector }) => {
        seen.push(selector);
        return undefined;
      }),
      step("third", ({ selector }) => `${selector} >> nth=0`),
    ]);
    assert.equal(hook(hookArgs("#a").args), "#b >> nth=0");
    assert.deepEqual(seen, ["#b"]);
  });

  it("gives undefined when no step changes the selector", () => {
    assert.equal(pipeline([step("none", () => undefined)])(hookArgs("#a").args), undefined);
  });

  it("keeps the selector a failing step got, logs, and runs the next step", () => {
    const hook = pipeline([
      step("broken", () => {
        throw new Error("boom");
      }),
      step("next", () => "#c"),
    ]);
    const { args, logged } = hookArgs("#a");
    assert.equal(hook(args), "#c");
    assert.deepEqual(logged, ["recorder_selectors broken: #a kept: Error: boom"]);
  });

  it("skips the steps after Browser's time is up", () => {
    const hook = pipeline([step("late", () => "#late")]);
    const { args, logged } = hookArgs("#a", { timeLeft: () => 0 });
    assert.equal(hook(args), undefined);
    assert.deepEqual(logged, ["recorder_selectors late: skipped, out of time"]);
  });
});

describe("selectorStep", () => {
  it("keeps the selector when a condition of the rule does not hold", () => {
    const never = { name: "never", when: { recorded: [() => false] }, tryInOrder: () => [] };
    assert.equal(selectorStep(never).run(hookArgs("#a").args), undefined);
  });

  it("applies a rule only to the Actions its name conditions allow", () => {
    const clicksOnly = { name: "clicks", when: { name: [(name) => name === "click"] }, tryInOrder: () => [] };
    const fill = hookArgs("#a", { name: "fill" }).args;
    assert.equal(selectorStep(clicksOnly).run(fill), undefined);
  });
});

describe("the extension", () => {
  it("has the page hook as its only recorder hook", () => {
    const hooks = Object.keys(extension).filter((name) => name.startsWith("__") && name !== "__registerScopeEngine");
    assert.deepEqual(hooks, ["__rewriteSelector"]);
  });

  it("gives Browser the page hook as one function expression, without require", () => {
    const hook = vm.runInNewContext(`(${extension.__rewriteSelector})`, {});
    assert.equal(typeof hook, "function");
  });

  it("writes a CSS id left after the rules with the id engine, in the page", () => {
    const hook = vm.runInNewContext(`(${extension.__rewriteSelector})`, {});
    const button = { localName: "button", getAttribute: () => null, hasAttribute: () => false };
    const { args } = hookArgs("#APD_\\:\\:Note", { name: "fill", element: button, query: () => [button] });
    assert.equal(hook(args), "id=APD_::Note");
  });
});
