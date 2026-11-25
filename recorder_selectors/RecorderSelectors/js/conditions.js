// The conditions rules state in their `when`, each a question with a name.
// As in Clara Rules, a rule tests facts of three kinds, and each condition
// takes the one it is about:
//
//   name      the name of the Action Playwright recorded, such as "click"
//   recorded  the selector it recorded, as data (see `parse` in selector.js)
//   element   what the page tells about the recorded element (see page.js)

const { nameOf, attributeOf } = require("./selector.js");

// ------------------------------------------------------------------- not

function not(condition) {
  return (fact) => !condition(fact);
}

// ----------------------------------------------------------- Action name

function isClick(name) {
  return name === "click";
}

// ------------------------------------------------------- recorded selector

// Found by a name: a role with a name, a text, or a label.
function foundByName({ target }) {
  return Boolean(nameOf(target));
}

function foundByRoleAndName({ target }) {
  return target.engine === "role" && Boolean(nameOf(target));
}

function foundByLabel({ target }) {
  return target.engine === "label";
}

// Found by `label >> internal:has-text="Ja"i` or `label:has-text("Ja")`.
function foundByHasText({ target }) {
  return target.engine === "hasText";
}

// Playwright needed `nth=` to tell the element from others.
function foundByIndex({ nth }) {
  return Boolean(nth);
}

// Playwright found no role and name that tells the element alone: it used
// something else, or needed `nth=`.
function notFoundByUniqueRoleAndName(recorded) {
  return foundByIndex(recorded) || !foundByRoleAndName(recorded);
}

// Like `notFoundByUniqueRoleAndName`, and not by a label either.
function notFoundByUniqueName(recorded) {
  if (foundByIndex(recorded)) return true;
  return !foundByRoleAndName(recorded) && !foundByLabel(recorded);
}

// The name, or the description, matches part of a text in any case.
function matchedLoosely({ target }) {
  return isLoose(nameOf(target)) || isLoose(attributeOf(target, "description"));
}

function isLoose(text) {
  return Boolean(text) && !text.exact;
}

// --------------------------------------------------------------- element

// There is a visible text before the element that `scope=` can name.
function hasScope(element) {
  return Boolean(element.scopeText);
}

function hasRole(element) {
  return Boolean(element.role);
}

function hasExplicitRole(element) {
  return Boolean(element.explicitRole);
}

function hasAriaLabel(element) {
  return Boolean(element.ariaLabel);
}

function isLabelledByOthers(element) {
  return element.hasLabelledBy;
}

function hasTitle(element) {
  return Boolean(element.title);
}

// A description from aria-describedby or aria-description, which outranks the title.
function hasDescriptionOfItsOwn(element) {
  return element.hasDescription;
}

function hasText(element) {
  return Boolean(element.text);
}

function isFormControl(element) {
  return element.isControl;
}

// Named by aria-label, aria-labelledby or a <label>.
function isNamedByLabel(element) {
  return element.hasName;
}

module.exports = {
  not,
  isClick,
  foundByName,
  foundByRoleAndName,
  foundByLabel,
  foundByHasText,
  foundByIndex,
  notFoundByUniqueRoleAndName,
  notFoundByUniqueName,
  matchedLoosely,
  hasScope,
  hasRole,
  hasExplicitRole,
  hasAriaLabel,
  isLabelledByOthers,
  hasTitle,
  hasDescriptionOfItsOwn,
  hasText,
  isFormControl,
  isNamedByLabel,
};
