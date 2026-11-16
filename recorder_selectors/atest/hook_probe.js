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

exports.recordedAction = async (action, page) =>
  (await plugin.__recordedAction({ action, page, context: page.context() })) ??
  action;

exports.actionsSeen = () => seen;

exports.forgetActionsSeen = () => {
  seen = [];
};
