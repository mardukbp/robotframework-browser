// Unit tests of the chain of steps behind the extension's __rewriteAction,
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
  const args = { name: "click", selector, element, query, log: (m) => logged.push(m), ...more };
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

  it("keeps the selector a step got when the one it gives does not find exactly the element", () => {
    const other = { id: "other" };
    const queryOf = { "#late": [other], "#gone": [], "#c": [element] };
    const hook = pipeline([step("first", () => "#c"), step("wrong", () => "#late"), step("none", () => "#gone")]);
    const { args, logged } = hookArgs("#a", { query: (selector) => queryOf[selector] });
    assert.equal(hook(args), "#c");
    assert.deepEqual(logged, [
      "recorder_selectors wrong: #late finds another element, #c kept",
      "recorder_selectors none: #gone finds no element, #c kept",
    ]);
  });

  it("describes the element once for all steps", () => {
    const seen = [];
    const describing = (name) => step(name, ({ describe }) => seen.push(describe()) && undefined);
    const hook = pipeline([describing("first"), describing("second")]);
    const fakeElement = { matches: () => false, labels: [], getAttribute: () => null, hasAttribute: () => false };
    hook(hookArgs("#a", { element: fakeElement }).args);
    assert.equal(seen.length, 2);
    assert.equal(seen[0], seen[1]);
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
    assert.deepEqual(hooks, ["__rewriteAction"]);
  });

  it("gives Browser the page hook as one function expression, without require", () => {
    const hook = vm.runInNewContext(`(${extension.__rewriteAction})`, {});
    assert.equal(typeof hook, "function");
  });

  it("changes only the selector of the Action, and nothing when it keeps the selector", () => {
    const hook = vm.runInNewContext(`(${extension.__rewriteAction})`, {});
    const fill = { name: "fill", selector: "text=x", text: "a" };
    const logged = [];
    assert.equal(hook({ action: fill, element, query, log: (m) => logged.push(m) }), undefined);
  });

  it("writes a CSS id left after the rules with the id engine, in the page", () => {
    const hook = vm.runInNewContext(`(${extension.__rewriteAction})`, {});
    const button = {
      localName: "button",
      textContent: "",
      labels: [],
      parentElement: null,
      parentNode: null,
      previousSibling: null,
      previousElementSibling: null,
      getAttribute: () => null,
      hasAttribute: () => false,
      matches: () => false,
      getRootNode: () => ({}),
    };
    const logged = [];
    const action = { name: "fill", selector: "#APD_\\:\\:Note", text: "a" };
    const changes = hook({ action, element: button, query: () => [button], log: (m) => logged.push(m) });
    assert.equal(JSON.stringify(changes), JSON.stringify({ selector: "id=APD_::Note" }));
    assert.deepEqual(logged, []);
  });
});

describe("bundle", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { bundle } = require("../RecorderSelectors/js/bundle.js");

  function bundled(files, entry = "entry.js") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));
    for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(root, name), source);
    return () => vm.runInNewContext(bundle(entry, "value", root), {});
  }

  it("follows relative requires in either quote style", () => {
    const value = bundled({
      "entry.js": `module.exports.value = require('./a.js').a + require("./b.js").b;`,
      "a.js": "module.exports.a = 1;",
      "b.js": "module.exports.b = 2;",
    });
    assert.equal(value(), 3);
  });

  it("fails in the page, with its name, on a require it does not hold", () => {
    const value = bundled({ "entry.js": `module.exports.value = require("fs");` });
    assert.throws(value, /entry\.js requires fs, which the bundle does not hold/);
  });
});
