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
const candidates = (rule, recorded, facts) =>
  rule.candidates({ facts, chain: parse(recorded) }).filter(Boolean).map(print);

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
  it("exact_names makes the name exact and drops a loose description", () => {
    const facts = { name: "Details & Termine", text: "Details & Termine", texts: [], description: "" };
    const selector = 'internal:role=link[name="Details"i][description="x"i] >> scope="Robot Framework"';
    assert.equal(exactNames.skip(parse(selector)), false);
    assert.deepEqual(candidates(exactNames, selector, facts), [
      'role=link[name="Details"s] >> scope="Robot Framework"',
      'role=link[name="Details"s][description="x"i] >> scope="Robot Framework"',
      'role=link[name="Details & Termine"s] >> scope="Robot Framework"',
      'role=link[name="Details & Termine"s][description="x"i] >> scope="Robot Framework"',
    ].map((s) => s.replace(/^role=/, "internal:role=")));
  });

  it("exact_names tries a text as text= first", () => {
    const facts = { name: "46 km/h", text: "46 km/h", texts: [] };
    assert.deepEqual(candidates(exactNames, 'internal:text="km/h"i', facts), [
      'text="km/h"',
      'text="46 km/h"',
      'internal:text="km/h"s',
      'internal:text="46 km/h"s',
    ]);
    assert.equal(exactNames.skip(parse('internal:text="km/h"s')), true);
  });

  it("label_scope scopes a control without a name by its caption", () => {
    const facts = { isControl: true, hasName: false, scopeText: "Mittelgeber*", role: "combobox" };
    assert.deepEqual(candidates(labelScope, "css=select >> nth=3", facts), [
      'role=combobox >> scope="Mittelgeber*"',
    ]);
    assert.ok(labelScope.skip(parse('internal:role=combobox[name="A"i]')));
  });

  it("caption_scope replaces the id of an ancestor by the text before the element", () => {
    const selector = '[id="#c-12"] >> internal:role=link[name="Details"i]';
    assert.deepEqual(candidates(captionScope, selector, { scopeText: "Robot Framework" }), [
      'internal:role=link[name="Details"i] >> scope="Robot Framework"',
    ]);
    assert.equal(captionScope.skip(parse('internal:role=link >> [id="x"]')), true);
    assert.equal(captionScope.skip(parse('pnw-ami-zahlungsart >> internal:text="Nein"i')), false);
    assert.equal(captionScope.skip(parse("css=select >> nth=3")), true);
  });

  it("aria_label records an explicit role by its aria-label, then scoped", () => {
    const facts = { explicitRole: "button", ariaLabel: "Wertehilfe", hasLabelledBy: false, scopeText: "Art" };
    assert.deepEqual(candidates(ariaLabel, "#vhi", facts), [
      'role=button[name="Wertehilfe"s]',
      'role=button[name="Wertehilfe"s] >> scope="Art"',
    ]);
  });

  it("number_widening gives a text back the number Playwright dropped", () => {
    const part = parsePart('internal:text="km/h bis 60 km/h"i');
    const facts = { texts: ["46 km/h bis 60 km/h", "x".repeat(300)] };
    // Both spellings of the space after the number: a no-break space stays in a name.
    assert.deepEqual(numberWidening.eachPart({ part, facts }).map((p) => print([p])), [
      'internal:text="46 km/h bis 60 km/h"i',
      'internal:text="46 km/h bis 60 km/h"i',
    ]);
    assert.deepEqual(numberWidening.eachPart({ part, facts: { texts: ["km/h bis 60 km/h"] } }), []);
    assert.ok(numberWidening.skipPart(parsePart("css=div")));
  });

  it("id_engine writes a CSS id, of a frame or an element, with the id engine", () => {
    const replaced = (raw) => idEngine.eachPart({ part: parsePart(raw), facts: {} }).map((p) => print([p]));
    assert.deepEqual(replaced("#oevd-iframe"), ["id=oevd-iframe"]);
    assert.deepEqual(replaced("#APD_\\:\\:SalesOrderType-inner-vhi"), ["id=APD_::SalesOrderType-inner-vhi"]);
    assert.deepEqual(replaced("#\\31 23"), ["id=123"]);
    assert.equal(idEngine.skip(parse("#oevd-iframe >> internal:control=enter-frame >> internal:text=\"A\"i")), false);
    for (const raw of ["#order select", "css=#x", '[id="x"]', "id=x", "#a\\ b", "div"]) {
      assert.ok(idEngine.skipPart(parsePart(raw)) || replaced(raw).length === 0, raw);
    }
  });

  it("has_text records CSS with :has-text by the element's text, then scoped", () => {
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
    assert.equal(hasText.skip(parse("css=label")), true);
    const facts = { text: "Ja", scopeText: "Kontoinhaber?*" };
    for (const recorded of ['label:has-text("Ja")', internal]) {
      assert.deepEqual(candidates(hasText, recorded, facts), [
        'text="Ja"',
        'text="Ja" >> scope="Kontoinhaber?*"',
      ]);
    }
  });

  it("title_description records a clicked element by its title", () => {
    const selector = 'internal:role=button[name="t"s]';
    const facts = { role: "button", title: "Suche löschen", text: "", hasDescription: false };
    assert.deepEqual(titleDescription.actions, ["click"]);
    assert.deepEqual(candidates(titleDescription, selector, facts), ['role=button[description="Suche löschen"s]']);
    assert.deepEqual(candidates(titleDescription, selector, { ...facts, hasDescription: true }), []);
    assert.deepEqual(candidates(titleDescription, selector, { ...facts, title: "" }), []);
  });
});
