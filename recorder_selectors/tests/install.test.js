// Unit tests of install, which runs the page scripts in a browser context.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { install } = require("../RecorderSelectors/js/kit.js");

function fakeContext({ exposeError } = {}) {
  const calls = [];
  const frame = { evaluate: async (script) => calls.push(["frame", script]) };
  const context = {
    calls,
    pages: () => [{ frames: () => [frame] }],
    addInitScript: async (script) => calls.push(["init", script]),
    exposeBinding: async (name, callback) => {
      calls.push(["binding", name]);
      if (exposeError) throw new Error(exposeError);
      context.callback = callback;
    },
  };
  return context;
}

describe("install", () => {
  const plain = { script: "plain()" };
  const bound = { script: "bound()", binding: { name: "__b", receive: (page, data) => [page, data] } };

  it("runs each page script once per context, in open frames and as an init script", async () => {
    const context = fakeContext();
    await install(context, [plain, bound]);
    await install(context, [plain, bound]);
    assert.deepEqual(context.calls, [
      ["init", "plain()"],
      ["frame", "plain()"],
      ["binding", "__b"],
      ["init", "bound()"],
      ["frame", "bound()"],
    ]);
    assert.deepEqual(context.callback({ page: "p" }, 1), ["p", 1]);
  });

  it("takes a binding the context already has", async () => {
    const context = fakeContext({ exposeError: "Function \"__b\" has been already registered" });
    await install(context, [bound]);
    assert.deepEqual(context.calls.map(([kind]) => kind), ["binding", "init", "frame"]);
  });

  it("fails, and tries again next time, when the binding cannot be exposed", async () => {
    const context = fakeContext({ exposeError: "closed" });
    await assert.rejects(install(context, [bound]), /closed/);
    await assert.rejects(install(context, [bound]), /closed/);
  });
});
