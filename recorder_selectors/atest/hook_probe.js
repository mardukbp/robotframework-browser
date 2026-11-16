// The JS side of HookProbe.py. It calls the hooks of the RecorderSelectors
// extension the way Browser does, and, loaded after the plugin, sees in its own
// __recordedAction hook every Action the plugin gave a real recording.

const plugin = require("../RecorderSelectors/js/index.js");

let seen = [];

// Browser chains the hooks in load order, so this one gets the plugin's result.
exports.__recordedAction = ({ action }) => {
  seen.push(action);
  return undefined;
};

exports.startRecordingHooks = async (page) => {
  await plugin.__recordingStarted({ context: page.context() });
};

// The Action the plugin records for `action`: the one its hook gives, or
// `action` itself when the hook keeps it.
exports.recordedAction = async (action, page) => {
  const context = page.context();
  const changed = await plugin.__recordedAction({ action, page, context });
  if (changed === undefined) return action;
  return changed;
};

exports.actionsSeen = () => seen;

exports.forgetActionsSeen = () => {
  seen = [];
};
