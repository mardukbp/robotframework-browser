// The scripts the plugin runs in the page, and what they report back.
//
// A page script is data: `{ script, binding? }`, `script` the source that runs
// in every frame, `binding` an optional `{ name, receive(page, data) }` that the
// script calls to send `data` to Node.

const { reduceAsync } = require("./fp.js");
const { pressScript } = require("./page.js");

const PRESS_BINDING = "__rfbRecorderSelectorsPress";
const PRESS_MAX_AGE_MS = 10000;

// The facts of the element last pressed on each page, with their time.
const lastPressByPage = new WeakMap();

// The page script that takes a snapshot of the element at every press.
const PRESSES = {
  script: pressScript(PRESS_BINDING),
  binding: { name: PRESS_BINDING, receive: rememberPress },
};

// The facts of the element pressed on `page` in the last ten seconds, if any.
function recentPress(page) {
  const press = lastPressByPage.get(page);
  return press && Date.now() - press.at <= PRESS_MAX_AGE_MS
    ? press.facts
    : undefined;
}

function rememberPress(page, facts) {
  if (facts && typeof facts === "object")
    lastPressByPage.set(page, { facts, at: Date.now() });
}

// The page scripts already installed, by context.
const installedByContext = new WeakMap();

// Runs each page script once per context, in order. One that fails, and those
// after it, are tried again the next time.
function install(context, pageScripts) {
  const installed = installedByContext.get(context) ?? new Set();
  installedByContext.set(context, installed);
  const notYetInstalled = pageScripts.filter((each) => !installed.has(each));
  notYetInstalled.forEach((each) => installed.add(each));
  return reduceAsync(notYetInstalled, (_, pageScript, i) =>
    installScript(context, pageScript).catch((error) => {
      notYetInstalled.slice(i).forEach((each) => installed.delete(each));
      throw error;
    }),
  );
}

// Runs `pageScript` in the frames already open, and as an init script, before
// the page's own scripts, in every frame opened later.
async function installScript(context, { script, binding }) {
  if (binding) await exposeBinding(context, binding);
  await context.addInitScript(script);
  await Promise.all(
    framesOf(context).map((frame) =>
      frame.evaluate(script).catch(() => undefined),
    ),
  );
}

async function exposeBinding(context, { name, receive }) {
  try {
    await context.exposeBinding(name, ({ page }, data) => receive(page, data));
  } catch (error) {
    // Bindings stay with the context, which a new recording session reuses.
    if (!String(error).includes("has been already registered")) throw error;
  }
}

const framesOf = (context) =>
  context.pages().flatMap((page) => page.frames());

module.exports = { PRESSES, recentPress, install };
