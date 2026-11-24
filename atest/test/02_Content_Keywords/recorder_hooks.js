// A JS extension whose recorder hooks the Recorder Hooks suite drives: every
// recorded or picked selector is narrowed to the first element it finds.

exports.__recordedAction = async ({ action }) => {
  if (!action.selector) return undefined;
  return { ...action, selector: `${action.selector} >> nth=0` };
};
