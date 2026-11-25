// The JS side of HookProbe.py. It runs the __rewriteSelector hook of the
// RecorderSelectors extension the way `Record Keyword` documents it, for an
// Action given as Playwright reports it: in the page, taking its selector only
// when it finds exactly the element of the Action, as Browser does, after the
// frames Playwright found.

const plugin = require("../RecorderSelectors/js/index.js");

const FRAME_ENTRY = " >> internal:control=enter-frame >> ";
const HOOK = "__recorderSelectorsProbeHook";

// The selector the plugin records for the Action `name` on `selector`, before
// the Action has an effect on the page.
exports.recordedSelector = async (name, selector, page) => {
  // Browser gives the hook Playwright's selector engines in the page through
  // the console API; so does the probe.
  await page.context()._exposeConsoleApi();
  const entered = selector.lastIndexOf(FRAME_ENTRY);
  const frames = entered === -1 ? "" : selector.slice(0, entered + FRAME_ENTRY.length);
  const handle = await page.locator(selector).elementHandle({ timeout: 5000 });
  try {
    const frame = await handle.ownerFrame();
    await frame.evaluate(`window.${HOOK} = (${plugin.__rewriteSelector});`);
    const local = selector.slice(frames.length);
    const { rewritten, log } = await handle.evaluate(runHook, [HOOK, name, local]);
    log.forEach((line) => console.log(line));
    return frames + rewritten;
  } finally {
    await handle.dispose();
  }
};

// In the page: the selector the hook gives for `element`, and what it logged.
function runHook(element, [hookName, name, selector]) {
  const log = [];
  const query = (candidate) => window.playwright.$$(candidate);
  const given = window[hookName]({ name, selector, element, query, log: (message) => log.push(String(message)) });
  if (given === undefined) return { rewritten: selector, log };
  const found = query(given);
  if (found.length !== 1 || found[0] !== element) {
    log.push(`probe: ${given} does not find the element alone, it is not recorded`);
    return { rewritten: selector, log };
  }
  return { rewritten: given, log };
}
