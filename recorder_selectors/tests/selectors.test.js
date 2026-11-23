// Unit tests of the selector data and the rules that only read and build it.
// Run with `node --test recorder_selectors/tests/`; utest runs them too.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const selector = require("../RecorderSelectors/js/selector.js");
const ariaLabel = require("../RecorderSelectors/js/rules/aria_label.js");
const captionScope = require("../RecorderSelectors/js/rules/caption_scope.js");
const exactNames = require("../RecorderSelectors/js/rules/exact_names.js");
const idEngine = require("../RecorderSelectors/js/rules/id_engine.js");
const hasText = require("../RecorderSelectors/js/rules/has_text.js");
const labelScope = require("../RecorderSelectors/js/rules/label_scope.js");
const numberWidening = require("../RecorderSelectors/js/rules/number_widening.js");
const titleDescription = require("../RecorderSelectors/js/rules/title_description.js");

const { parse, parsePart, print, nameOf, attributeOf, withName } = selector;
const { selectorsToTry, replacementsToTry } = require("../RecorderSelectors/js/run_rules.js");

describe("parse and print", () => {
  for (const selector of [
    'internal:role=button[name="Save file"i]',
    'role=button[description="Close"s]',
    'internal:role=checkbox[checked=true][include-hidden=true][name="A \\"q\\" \\\\ b"s]',
    "internal:role=button[disabled][expanded=false]",
    'internal:text="km/h bis 60 km/h"i',
    'internal:text="say \\"hi\\""s',
    'internal:label="Pin"i',
    '#APD_\\:\\:SalesOrderType-inner-vhi',
    "css=select >> nth=3",
    '[id="#category--12-content"] >> internal:role=link[name="Details"i]',
    'iframe[name="x"] >> internal:control=enter-frame >> internal:role=combobox',
    'role=link[name="Details & Termine"s] >> scope="Robot Framework"',
    'internal:text="a >> b"i >> nth=0',
  ]) {
    it(`gives back ${selector}`, () => {
      assert.equal(print(parse(selector).parts), selector);
    });
  }

  it("parses each part into data", () => {
    assert.deepEqual(parsePart('internal:role=link[name="RFCP"i][level=2]'), {
      engine: "role",
      prefix: "internal:role=",
      role: "link",
      attrs: [
        { key: "name", value: "RFCP", flag: "i", quoted: true },
        { key: "level", value: "2", flag: "", quoted: false },
      ],
    });
    assert.deepEqual(parsePart('internal:label="Pin"s'), {
      engine: "label",
      prefix: "internal:label=",
      value: "Pin",
      flag: "s",
    });
    assert.deepEqual(parsePart('scope="Robot Framework"'), {
      engine: "scope",
      text: "Robot Framework",
    });
    assert.equal(parsePart("internal:attr=[id=\"x\"s]").engine, "id");
    assert.equal(parsePart("nth=-1").engine, "nth");
    assert.deepEqual(parsePart("css=div"), { engine: "other", raw: "css=div" });
  });

  it("finds the frames, the target before the filters, and the nth", () => {
    const chain = parse(
      'iframe >> internal:control=enter-frame >> internal:role=link[name="A"i] >> scope="B" >> nth=1',
    );
    assert.equal(print(chain.frames), "iframe >> internal:control=enter-frame");
    assert.equal(print([chain.target]), 'internal:role=link[name="A"i]');
    assert.equal(chain.targetIndex, 0);
    assert.equal(print([chain.nth]), "nth=1");
  });
});

describe("reading and changing parts", () => {
  const link = parsePart('internal:role=link[name="RFCP"i][description="x"s]');

  it("reads names and attributes", () => {
    assert.deepEqual(nameOf(link), { value: "RFCP", exact: false });
    assert.deepEqual(attributeOf(link, "description"), { value: "x", exact: true });
    assert.deepEqual(nameOf(parsePart('internal:text="T"s')), { value: "T", exact: true });
    assert.equal(nameOf(parsePart("css=a")), undefined);
  });

  it("changes a name, exact or as exact as before, without changing the part", () => {
    assert.equal(
      print([withName(link, 'R "F"', true)]),
      'internal:role=link[name="R \\"F\\""s][description="x"s]',
    );
    assert.equal(print([withName(link, "Other")]), 'internal:role=link[name="Other"i][description="x"s]');
    assert.equal(print([withName(parsePart('internal:text="a"i'), "b", true)]), 'internal:text="b"s');
    assert.equal(print([link]), 'internal:role=link[name="RFCP"i][description="x"s]');
  });

  it("builds parts in Browser's syntax", () => {
    assert.equal(print([selector.role("button", { name: "Save" })]), 'role=button[name="Save"s]');
    assert.equal(print([selector.role("combobox"), selector.scope("Make*")]), 'role=combobox >> scope="Make*"');
    assert.equal(print([selector.text('a "b"')]), 'text="a \\"b\\""');
  });
});

describe("rules", () => {
  // The selectors `rule` tries for a click Playwright recorded as `recorded`
  // on the element `element`; none when the rule does not apply.
  const tried = (rule, recorded, element, action = { name: "click" }) =>
    selectorsToTry(rule, { action, recorded: parse(recorded), element }).map(({ selector }) => selector);
  // The replacements a rule for each part tries for the part `raw`.
  const replacements = (rule, raw, element = {}) =>
    replacementsToTry(rule.forEachPart, { part: parsePart(raw), element }).map((part) => print([part]));

  it("exact_names makes the name exact and drops a loose description", () => {
    const element = { name: "Details & Termine", text: "Details & Termine", texts: [], description: "" };
    const recorded = 'internal:role=link[name="Details"i][description="x"i] >> scope="Robot Framework"';
    assert.deepEqual(tried(exactNames, recorded, element), [
      'role=link[name="Details"s] >> scope="Robot Framework"',
      'role=link[name="Details"s][description="x"i] >> scope="Robot Framework"',
      'role=link[name="Details & Termine"s] >> scope="Robot Framework"',
      'role=link[name="Details & Termine"s][description="x"i] >> scope="Robot Framework"',
    ].map((s) => s.replace(/^role=/, "internal:role=")));
  });

  it("exact_names tries a text as text= first, and leaves an exact text alone", () => {
    const element = { name: "46 km/h", text: "46 km/h", texts: [] };
    assert.deepEqual(tried(exactNames, 'internal:text="km/h"i', element), [
      'text="km/h"',
      'text="46 km/h"',
      'internal:text="km/h"s',
      'internal:text="46 km/h"s',
    ]);
    assert.deepEqual(tried(exactNames, 'internal:text="km/h"s', element), []);
  });

  it("label_scope scopes a form control without a name by its caption", () => {
    const element = { isControl: true, hasName: false, scopeText: "Mittelgeber*", role: "combobox" };
    assert.deepEqual(tried(labelScope, "css=select >> nth=3", element), ['role=combobox >> scope="Mittelgeber*"']);
    assert.deepEqual(tried(labelScope, 'internal:role=combobox[name="A"i]', element), []);
    assert.deepEqual(tried(labelScope, "css=select", { ...element, hasName: true }), []);
  });

  it("caption_scope replaces an ancestor's id or CSS by the text before the element", () => {
    const element = { scopeText: "Robot Framework" };
    assert.deepEqual(tried(captionScope, '[id="#c-12"] >> internal:role=link[name="Details"i]', element), [
      'internal:role=link[name="Details"i] >> scope="Robot Framework"',
    ]);
    assert.deepEqual(tried(captionScope, 'pnw-ami-zahlungsart >> internal:text="Nein"i', element), [
      'internal:text="Nein"i >> scope="Robot Framework"',
    ]);
    assert.deepEqual(tried(captionScope, 'internal:role=link >> [id="x"]', element), []);
    assert.deepEqual(tried(captionScope, "css=select >> nth=3", element), []);
  });

  it("aria_label finds an explicit role by its aria-label, then scoped", () => {
    const element = { explicitRole: "button", ariaLabel: "Wertehilfe", hasLabelledBy: false, scopeText: "Art" };
    assert.deepEqual(tried(ariaLabel, "#vhi", element), [
      'role=button[name="Wertehilfe"s]',
      'role=button[name="Wertehilfe"s] >> scope="Art"',
    ]);
    assert.deepEqual(tried(ariaLabel, "#vhi", { ...element, scopeText: null }), ['role=button[name="Wertehilfe"s]']);
    assert.deepEqual(tried(ariaLabel, 'internal:role=button[name="Wertehilfe"i]', element), []);
  });

  it("number_widening gives a text back the number Playwright dropped", () => {
    const element = { texts: ["46 km/h bis 60 km/h", "x".repeat(300)] };
    // Both spellings of the space after the number: a no-break space stays in a name.
    assert.deepEqual(replacements(numberWidening, 'internal:text="km/h bis 60 km/h"i', element), [
      'internal:text="46 km/h bis 60 km/h"i',
      'internal:text="46 km/h bis 60 km/h"i',
    ]);
    assert.deepEqual(replacements(numberWidening, 'internal:text="km/h bis 60 km/h"i', { texts: ["km/h bis 60 km/h"] }), []);
    assert.deepEqual(replacements(numberWidening, "css=div", element), []);
  });

  it("id_engine writes a CSS id, of a frame or an element, with the id engine", () => {
    assert.deepEqual(replacements(idEngine, "#oevd-iframe"), ["id=oevd-iframe"]);
    assert.deepEqual(replacements(idEngine, "#APD_\\:\\:SalesOrderType-inner-vhi"), ["id=APD_::SalesOrderType-inner-vhi"]);
    assert.deepEqual(replacements(idEngine, "#\\31 23"), ["id=123"]);
    for (const raw of ["#order select", "css=#x", '[id="x"]', "id=x", "#a\\ b", "div"]) {
      assert.deepEqual(replacements(idEngine, raw), [], raw);
    }
  });

  it("has_text finds a has-text filter by the element's text, then scoped", () => {
    assert.deepEqual(parsePart('label:has-text("Ja")'), {
      engine: "hasText",
      raw: 'label:has-text("Ja")',
      tag: "label",
      value: "Ja",
    });
    assert.equal(print(parse('label:has-text("Ja")').parts), 'label:has-text("Ja")');
    const internal = 'label >> internal:has-text="Ja"i';
    assert.equal(print(parse(internal).parts), internal);
    assert.equal(parse(internal).target.engine, "hasText");
    const element = { text: "Ja", scopeText: "Kontoinhaber?*" };
    for (const recorded of ['label:has-text("Ja")', internal]) {
      assert.deepEqual(tried(hasText, recorded, element), ['text="Ja"', 'text="Ja" >> scope="Kontoinhaber?*"']);
    }
    assert.deepEqual(tried(hasText, "css=label", element), []);
  });

  it("title_description finds a clicked element by its title", () => {
    const recorded = 'internal:role=button[name="t"s]';
    const element = { role: "button", title: "Suche löschen", text: "", hasDescription: false };
    assert.deepEqual(tried(titleDescription, recorded, element), ['role=button[description="Suche löschen"s]']);
    assert.deepEqual(tried(titleDescription, recorded, { ...element, hasDescription: true }), []);
    assert.deepEqual(tried(titleDescription, recorded, { ...element, title: "" }), []);
    assert.deepEqual(tried(titleDescription, recorded, element, { name: "pick" }), []);
  });
});
