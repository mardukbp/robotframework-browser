# RecorderSelectors

A [Browser](https://robotframework-browser.org/) plugin that makes `Record Keyword`,
`Record Keywords` and `Record Selector` record selectors a person can read, instead of the
ids, CSS and indexes Playwright falls back to.

```robotframework
*** Settings ***
Library    Browser    plugins=RecorderSelectors
```

The plugin has no keywords. It loads one JS extension that uses the recorder hooks of
Browser (`__recordedAction`, `__recordingStarted`; see `Record Keyword`) and registers
the `scope` selector engine, so the selectors it records also work when the tests run.

## Rules

Every recorded or picked selector passes these rules, in this order, each on the result of
the one before:

| Rule | Playwright records | The plugin records |
| --- | --- | --- |
| `number_widening` | `internal:text="km/h bis 60 km/h"i` | `text="46 km/h bis 60 km/h"i` |
| `title_description` (clicks only) | `role=button[name*="Close dialog"i]` | `role=button[description="Close"s]` |
| `aria_label` | `#APD_\:\:SalesOrderType-inner-vhi` | `role=button[name="Wertehilfe einblenden"s] >> scope="Kundenauftragsart"` |
| `label_scope` | `css=select >> nth=3` | `role=combobox >> scope="Mittelgeber*"` |
| `caption_scope` | `[id="#category--12-content"] >> role=link[name*="Details"i]` | `role=link[name*="Details"i] >> scope="Robot Framework"` |
| `exact_names` | `role=link[name*="RFCP® Robot"i]` | `role=link[name="RFCP® Robot Framework® Certified Professional"s]` |

`exact_names` comes last: the name or text the selector finds its element by, after the
`scope=` and `nth=` filters, is made an exact match with the element's whole name, so the
other rules' results end up exact too, for example
`role=link[name="Details & Termine"s] >> scope="Robot Framework"`. A text becomes
`text="46 km/h bis 60 km/h"` when that finds the element, which holds the text in its own
text nodes; otherwise it stays the exact internal form, which Browser writes as an anchored
regular expression such as `text=/^\s*46\s+km\/h\s+bis\s+60\s+km\/h\s*$/`.

A rewritten selector is used only when it finds exactly the recorded element; otherwise the
selector is kept and the reason is logged in `playwright-log.txt`, prefixed with
`recorder_selectors <rule>:`.

`scope="Text"` keeps the elements found so far whose closest visible text before them is
`Text`. Text in links, buttons and form controls is skipped, and so is text before an
element with the same tag, role and name.

## Select options by label

Before the selector rules run, `js/select_labels.js` records a choice in a select by the
labels of the chosen options instead of their values, which are often generated:

| Playwright records | The plugin records |
| --- | --- |
| `Select Options By    id=make    value    14: 6792` | `Select Options By    id=make    label    AMELUNG` |

Playwright reports the choice only after the page has handled it, and a page may relabel an
option when it is chosen. So an init script, which runs in every frame before the page's
own scripts, adds a capture listener for `input` at `window` that notes the label of each
chosen option on the select. A value gets its label only when its option alone had that
label then, and still has it, alone, when the Action arrives. When any value has no such
label, all values stay, and the reason is logged with `recorder_selectors select_labels:`.
In a page already open when the recording starts, the listener comes after the page's
scripts, so a page listener at `window` in the capture phase could relabel unnoticed.

## Layout

```
RecorderSelectors/
  __init__.py          the plugin: loads js/index.js, registers the scope engine
  js/index.js          the JS extension: select labels, then the rules, in order
  js/kit.js            what the rules share
  js/select_labels.js  records a select by the labels of the chosen options
  js/scope.js          the scope selector engine
  js/rules/*.js        one rule per file
```

## Writing a rule

A rule is a plain object; `js/kit.js` documents every field. A rule never writes selector
syntax: the kit parses a selector into parts, plain objects such as
`{engine: "role", role: "link", attrs: [{key: "name", value: "Details", flag: "i", ...}]}`,
and prints the parts a rule returns. Most rules only say which parts to try, given the facts
about the recorded element:

```js
const { role, scope, nameOf } = require("../kit.js");

module.exports = {
  name: "label_scope",
  skip: ({ target, nth }) =>
    !nth && (target.engine === "label" || (target.engine === "role" && nameOf(target))),
  candidates: ({ el }) =>
    el.isControl && !el.hasName && el.scopeText
      ? [[role(el.role), scope(el.scopeText)]]
      : [],
};
```

The kit runs it: it parses the selector into its chain, finds the recorded element, gathers
its facts in the page, checks each candidate there and uses the first that finds only that
element. When the recorded selector finds nothing any more, because the click navigated or
removed the element, the facts and the check come from a snapshot taken when the element
was pressed; only candidates of the form `role=...` or `role=... >> scope=...` can be
checked that way. A rule that changes parts where they are instead, like `number_widening`,
gives `eachPart`, the replacements for one part given the facts of the element the chain up
to that part finds; the kit tries them part after part. Rules only compute with data, so
they can be tested without a page; the kit does everything in the page.

Add the rule to the list in `js/index.js`. Functions that run in the page must use nothing
from outside their own body, since Playwright sends them there as source text; `kit.js`
puts the helpers of `elementFacts` inside its body for that reason.

## Limits

- The facts (`role`, `name`, `description`, ...) approximate what Playwright computes. They
  choose the candidates; only the check in the page, or against the snapshot, decides.
- All rules share the 2 seconds Browser waits for the hooks of one selector.
- Browser instances that share one Node process, as in pabot, keep their JS extensions
  apart, but share its selector engines: once one of them imports the plugin, `scope=` works
  in all of them.

## Tests

The unit tests of the selector data and of the rules are in `tests/`, for `node --test`;
`utest/test_recorder_selectors_js.py` runs them with the Python unit tests:

```
node --test "recorder_selectors/tests/*.test.js"
```

The acceptance tests are in `atest/test/09_Plugins/recorder_selectors/`:

```
inv atest --suite "Recorder Selectors"
```
