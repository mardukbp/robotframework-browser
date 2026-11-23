// The scripts the plugin runs in the page, and what they report back.
//
// A page script is data: `{ script, binding? }`, `script` the source that runs
// in every frame, `binding` an optional `{ name, receive(page, data) }` that the
// script calls to send `data` to Node.

const { pressScript } = require("./page.js");

const PRESS_BINDING = "__rfbRecorderSelectorsPress";
const PRESS_MAX_AGE_MS = 10000;

// The description of the element last pressed on each page, with its time.
const lastPressByPage = new WeakMap();

// The page script that takes a snapshot of the element at every press.
const PRESSES = {
  script: pressScript(PRESS_BINDING),
  binding: { name: PRESS_BINDING, receive: rememberPress },
};

// The description of the element pressed on `page` in the last ten seconds, if any.
function recentPress(page) {
  const press = lastPressByPage.get(page);
  if (!press) return undefined;
  if (Date.now() - press.at > PRESS_MAX_AGE_MS) return undefined;
  return press.element;
}

function rememberPress(page, element) {
  if (!element || typeof element !== "object") return;
  lastPressByPage.set(page, { element, at: Date.now() });
}

// The page scripts already installed, by context.
const installedByContext = new WeakMap();

// Runs each page script once per context, in order. One that fails, and those
// after it, are tried again the next time.
async function install(context, pageScripts) {
  const installed = installedScriptsOf(context);
  const notYetInstalled = pageScripts.filter((each) => !installed.has(each));
  // Marked before the first await, so a second call meanwhile skips them.
  notYetInstalled.forEach((each) => installed.add(each));
  for (const [i, pageScript] of notYetInstalled.entries()) {
    try {
      await installScript(context, pageScript);
    } catch (error) {
      notYetInstalled.slice(i).forEach((each) => installed.delete(each));
      throw error;
    }
  }
}

function installedScriptsOf(context) {
  if (!installedByContext.has(context))
    installedByContext.set(context, new Set());
  return installedByContext.get(context);
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

function framesOf(context) {
  return context.pages().flatMap((page) => page.frames());
}

module.exports = { PRESSES, recentPress, install };
