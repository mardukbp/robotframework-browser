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
  js/selector.js       selectors as data: parse, print, read and build parts (pure)
  js/page.js           what runs in the page: the facts about an element, the press snapshot
  js/kit.js            runs the rules, checks their candidates in the page, installs page scripts
  js/fp.js             a few Clojure-like helpers: assoc, some, reduceAsync, findAsync
  js/select_labels.js  records a select by the labels of the chosen options
  js/scope.js          the scope selector engine
  js/rules/*.js        one rule per file
tests/                 unit tests, for node --test
atest/                 acceptance tests, for robot, with their page and its server
```

## Writing a rule

A rule is a plain object; `js/kit.js` documents every field. A rule never writes selector
syntax: `js/selector.js` parses a selector into parts, plain objects such as
`{engine: "role", role: "link", attrs: [{key: "name", value: "Details", flag: "i", ...}]}`,
and prints the parts a rule returns. Most rules only say which parts to try, given the facts
about the recorded element:

```js
const { role, scope, nameOf } = require("../selector.js");

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
from outside their own body, since Playwright sends them there as source text; `page.js`
puts the helpers of `elementFacts` inside its body for that reason.

## Limits

- The facts (`role`, `name`, `description`, ...) approximate what Playwright computes. They
  choose the candidates; only the check in the page, or against the snapshot, decides.
- All rules share the 2 seconds Browser waits for the hooks of one selector.
- Browser instances that share one Node process, as in pabot, keep their JS extensions
  apart, but share its selector engines: once one of them imports the plugin, `scope=` works
  in all of them.

## Tests

Everything the tests need is in this folder; they need only Browser installed, with its
browsers (`rfbrowser init`), and Node.js. Run them from this folder.

The unit tests of the selector data, the rules, the chain of steps and the installer are in
`tests/`, for Node's own test runner:

```
node --test "tests/*.test.js"
```

The acceptance tests are in `atest/`. `atest/__init__.robot` serves `atest/pages/` on a free
port with `atest/PageServer.py`, at `localhost` and `127.0.0.1`, so a test can put a page of
another origin in an iframe; each test adds the elements it records to that blank page.

They use only what Browser documents for plugins, never its internals, through
`atest/HookProbe.py`, a test plugin imported after RecorderSelectors
(`plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py`):

- Most suites test the plugin's contract with Browser, the `__recordedAction` hook. A test
  clicks or selects with Browser, as the user would, then gives the hook the Action
  Playwright reports for that, with Playwright's selector written into the test, and checks
  the Action the plugin returns and that its selector finds the element. They run headless.
- `end_to_end.robot` records for real, so that a change in what Playwright reports shows. Its
  JS extension, loaded after the plugin's, sees in its own `__recordedAction` the Actions the
  plugin gave; the test clicks a probe until that happens, so it knows the recorder records.
  `Record Keyword` ends after a short `idle_timeout` and returns the keyword Browser wrote.
  The recorder needs a visible browser, so on a machine without a display run it under
  `xvfb-run`, or leave it out with `--exclude end-to-end`.

```
robot --outputdir atest/output atest
```
