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
| `has_text` | `label:has-text("Ja")` | `text="Ja" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"` |
| `title_description` (clicks only) | `role=button[name="t"s]` | `role=button[description="Suche löschen"s]` |
| `aria_label` | `#APD_\:\:SalesOrderType-inner-vhi` | `role=button[name="Wertehilfe einblenden"s] >> scope="Kundenauftragsart"` |
| `label_scope` | `css=select >> nth=3` | `role=combobox >> scope="Mittelgeber*"` |
| `caption_scope` | `[id="#category--12-content"] >> role=link[name*="Details"i]` | `role=link[name*="Details"i] >> scope="Robot Framework"` |
| `caption_scope` | `pnw-ami-zahlungsart >> internal:text="Nein"i` | `text="Nein" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"` |
| `exact_names` | `role=link[name*="RFCP® Robot"i]` | `role=link[name="RFCP® Robot Framework® Certified Professional"s]` |
| `id_engine` | `#oevd-iframe >> internal:control=enter-frame >> ...` | `id=oevd-iframe >> internal:control=enter-frame >> ...` |

`exact_names` comes after the rules that choose a name: the name or text the selector finds its element by, after the
`scope=` and `nth=` filters, is made an exact match with the element's whole name, so the
other rules' results end up exact too, for example
`role=link[name="Details & Termine"s] >> scope="Robot Framework"`. A text becomes
`text="46 km/h bis 60 km/h"` when that finds the element, which holds the text in its own
text nodes; otherwise it stays the exact internal form, which Browser writes as an anchored
regular expression such as `text=/^\s*46\s+km\/h\s+bis\s+60\s+km\/h\s*$/`.

`id_engine` writes every part that is only a CSS id, of a frame or of an element, with the
`id` engine and without CSS escapes: `#APD_\:\:Note` becomes `id=APD_::Note`.

A rewritten selector is used only when it finds exactly the recorded element; otherwise the
selector is kept and the reason is logged in `playwright-log.txt`, prefixed with
`recorder_selectors <rule>:`.

`scope="Text"` keeps the elements found so far whose closest visible text before them is
`Text`. Text in links, buttons and form controls is skipped, and so is the label of a
radio button or checkbox, which names that option, and text before an
element with the same tag, role and name. A text beside the element in one of its
ancestors, as in `<label>Hersteller Ihres Fahrzeuges <a role="button">`, is a scope on
its own, without the rest of that ancestor's text.

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
  js/rules/*.js        one rule per file
  js/conditions.js     the named conditions the rules state in their `when`
  js/selector.js       selectors as data: parse, print, read and build parts (pure)
  js/run_rules.js      runs the rules on an Action and checks what they try in the page
  js/page.js           what runs in the page: the description of an element, the press snapshot
  js/page_scripts.js   installs the scripts that run in the page, keeps what they report
  js/scope.js          the scope selector engine
  js/select_labels.js  records a select by the labels of the chosen options
  js/fp.js             a few Clojure-like helpers: replaceAt, firstDefined, reduceAsync, ...
tests/                 unit tests, for node --test
atest/                 acceptance tests, for robot, with their page and its server
```

## Writing a rule

A rule reads like a rule of [Clara Rules](https://www.clara-rules.org/): when its
conditions hold, it tries some selectors. The conditions test three facts:

- `action`: the Action Playwright recorded, such as a click,
- `recorded`: the selector Playwright recorded, as data (`parse` in `js/selector.js`),
- `element`: what the page tells about the recorded element (`describeElement` in `js/page.js`).

```js
const { role } = require("../selector.js");
const { isClick, foundByRoleAndName, hasRole, hasTitle, hasDescriptionOfItsOwn, not } =
  require("../conditions.js");

module.exports = {
  name: "title_description",
  when: {
    action: [isClick],
    recorded: [foundByRoleAndName],
    element: [hasRole, hasTitle, not(hasDescriptionOfItsOwn)],
  },
  tryInOrder: ({ element }) => [role(element.role, { description: element.title })],
};
```

Each condition is a function with a name that says what it asks; `js/conditions.js` holds
those the rules share, and a rule defines its own below its `module.exports`. `tryInOrder`
gives the selectors to try, each a part or a list of parts. A rule never writes selector
syntax: `js/selector.js` parses a selector into parts, plain objects such as
`{engine: "role", role: "link", attrs: [{key: "name", value: "Details", flag: "i", ...}]}`,
builds them (`role`, `text`, `scope`) and prints them. A selector with a missing part is
left out, so `[byText, scope(element.scopeText)]` is tried only when there is a scope.

`js/run_rules.js` runs a rule: when the conditions on the Action and the recorded selector
hold, it finds the recorded element, describes it in the page, checks the conditions on it,
tries each selector there and records the first that finds only that element.
`checkHiddenElementsToo` and `otherwiseUseIndex` change how the selectors are tried; the
comment at the top of `run_rules.js` documents every field. When the recorded selector finds
nothing any more, because the click navigated or removed the element, the description and
the check come from a snapshot taken when the element was pressed; only selectors of the
form `role=...` or `role=... >> scope=...` can be checked that way.

A rule that rewrites each part where it is, like `id_engine` and `number_widening`, gives
`forEachPart` instead: `{ when: [conditions on a part], tryInOrder: ({ part, element }) =>
[part, ...] }`, where `element` describes the element the selector up to that part finds.

Rules only compute with data, so they can be tested without a page: `selectorsToTry` and
`replacementsToTry` of `run_rules.js` give what a rule tries for a recorded selector and a
description of an element.

Add the rule to the list in `js/index.js`. Functions that run in the page must use nothing
from outside their own body, since Playwright sends them there as source text; `page.js`
puts the helpers of `describeElement` inside its body for that reason.

## Limits

- The description of an element (`role`, `name`, `description`, ...) approximates what
  Playwright computes. It chooses the selectors to try; only the check in the page, or
  against the snapshot, decides.
- All rules share the 2 seconds Browser waits for the hooks of one selector.
- With `Connect To Browser    use_cdp=True`, a page that logged elements to the console
  before the connection lacks the `scope` engine in its main world: Playwright sets that
  world up while it attaches, before the engine can be registered in it. The plugin
  checks the selectors it tries only with counts and element handles, which query in the
  engine's own world, and so do Browser's actions; `Evaluate JavaScript` with a
  `scope=` selector fails on such a page until it is reloaded.
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
