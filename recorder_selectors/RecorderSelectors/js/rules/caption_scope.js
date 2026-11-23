// An element Playwright finds inside an ancestor, by the ancestor's id, often
// generated, or by its CSS, is scoped by the text the user sees before it
// instead:
//
//   [id="#category--12-content"] >> role=link[name*="RFCP® Robot Framework®"i]
//   becomes   role=link[name*="RFCP® Robot Framework®"i] >> scope="Robot Framework"
//
//   pnw-ami-zahlungsart >> internal:text="Nein"i
//   becomes   internal:text="Nein"i >> scope="Ist der Antragsteller auch der Kontoinhaber?*"

const { scope } = require("../selector.js");
const { hasScope } = require("../conditions.js");

module.exports = {
  name: "caption_scope",
  when: {
    recorded: [foundInsideAnAncestor],
    element: [hasScope],
  },
  tryInOrder: ({ recorded, element }) => [
    [...withoutTheAncestor(recorded), scope(element.scopeText)],
  ],
};

// A part before the one that finds the element finds an ancestor by its id or CSS.
function foundInsideAnAncestor(recorded) {
  const ancestor = lastAncestorPart(recorded);
  return ancestor !== -1 && ancestor < recorded.targetIndex;
}

// The parts inside the frames after that ancestor part.
function withoutTheAncestor(recorded) {
  return recorded.insideFrames.slice(lastAncestorPart(recorded) + 1);
}

function lastAncestorPart({ insideFrames }) {
  return insideFrames.findLastIndex(({ engine }) => engine === "id" || engine === "other");
}
