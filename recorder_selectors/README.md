# RecorderSelectors

A [Browser](https://robotframework-browser.org/) plugin that makes `Record Keyword`,
`Record Keywords` and `Record Selector` record selectors a person can read, instead of the
ids, CSS and indexes Playwright falls back to.

```robotframework
*** Settings ***
Library    Browser    plugins=RecorderSelectors
```

The plugin has no keywords. It loads one JS extension that uses the recorder hook of
Browser (`__rewriteAction`; see `Record Keyword`) and registers
the `scope` selector engine, so the selectors it records also work when the tests run.
It changes only selectors: everything else in a recorded keyword, such as the values of
a choice in a select, is recorded as Playwright reports it.

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
| `id_engine` | `#APD_\:\:Note` | `id=APD_::Note` |

`exact_names` comes after the rules that choose a name: the name or text the selector finds its element by, after the
`scope=` and `nth=` filters, is made an exact match with the element's whole name, so the
other rules' results end up exact too, for example
`role=link[name="Details & Termine"s] >> scope="Robot Framework"`. A text becomes
`text="46 km/h bis 60 km/h"` when that finds the element, which holds the text in its own
text nodes; otherwise it stays the exact internal form, which Browser writes as an anchored
regular expression such as `text=/^\s*46\s+km\/h\s+bis\s+60\s+km\/h\s*$/`.

`id_engine` comes last and writes every part that is only a CSS id with the `id` engine and
without CSS escapes.

The rules change only the selector inside the frame the element is in. The frames before it,
such as `#oevd-iframe >> internal:control=enter-frame >> ...`, stay as Playwright recorded
them: the hook runs in the element's frame, which cannot reach the frame's element in the
page around it.

A rule's selector is used only when it finds exactly the recorded element; otherwise the
selector before that rule is kept and the reason is logged in `playwright-log.txt`,
prefixed with `recorder_selectors <rule>:`. So a rule whose selector Browser would reject
does not cost the selectors the rules before it gave.

`scope="Text"` keeps the elements found so far whose closest visible text before them is
`Text`. Text in links, buttons and form controls is skipped, and so is the label of a
radio button or checkbox, which names that option, and text before an
element with the same tag, role and name. A text beside the element in one of its
ancestors, as in `<label>Hersteller Ihres Fahrzeuges <a role="button">`, is a scope on
its own, without the rest of that ancestor's text.

## Layout

```
RecorderSelectors/
  __init__.py          the plugin: loads js/index.js, registers the scope engine
  js/index.js          the JS extension: Browser's recorder hook and the scope engine
  js/hook.js           the page hook: the rules in order, then the id engine
  js/bundle.js         puts the page hook and what it requires into one function
  js/rules/*.js        one rule per file
  js/id_engine.js      writes CSS ids with the id engine
  js/conditions.js     the named conditions the rules state in their `when`
  js/selector.js       selectors as data: parse, print, read and build parts (pure)
  js/run_rules.js      runs the rules on a selector and checks what they try in the page
  js/page.js           the description of the recorded element
  js/scope.js          the scope selector engine
  js/fp.js             a few Clojure-like helpers: replaceAt, distinct, firstDefined, mapUntil
tests/                 unit tests, for node --test
atest/                 acceptance tests, for robot, with their page and its server
```

## Writing a rule

A rule reads like a rule of [Clara Rules](https://www.clara-rules.org/): when its
conditions hold, it tries some selectors. The conditions test three facts:

- `name`: the name of the Action Playwright recorded, such as `click`,
- `recorded`: the selector Playwright recorded, as data (`parse` in `js/selector.js`),
- `element`: what the page tells about the recorded element (`describeElement` in `js/page.js`).

```js
const { role } = require("../selector.js");
const { isClick, foundByRoleAndName, hasRole, hasTitle, hasDescriptionOfItsOwn, not } =
  require("../conditions.js");

module.exports = {
  name: "title_description",
  when: {
    name: [isClick],
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

`js/run_rules.js` runs a rule: when the conditions on the Action's name and the recorded selector
hold, it describes the recorded element, checks the conditions on it, tries each selector
with Playwright's own engines (`query`) and records the first that finds only that element.
`otherwiseUseIndex` falls back to `nth=` when no selector finds only the element; the
comment at the top of `run_rules.js` documents every field. All of it runs in the page,
inside Browser's `__rewriteAction` hook, at the moment of the Action and before it has any
effect: a click that navigates, removes the element or opens a dialog has not done so yet,
so what the rule sees is the page replaying finds.

A rule that changes only the part the element is found by uses `withTarget(recorded, part)`
of `js/selector.js`, as `number_widening` and `exact_names` do. A step that is no rule, such
as `js/id_engine.js`, is a function from selector to selector in the pipeline of
`js/hook.js`.

Rules only compute with data, so they can be tested without a page: `selectorsToTry` of
`run_rules.js` gives what a rule tries for a recorded selector and a description of an
element.

Add the rule to the list in `js/hook.js`. Everything `js/hook.js` requires runs in the page:
`js/bundle.js` puts those modules into the one function Browser runs there: the extension
exports `__rewriteAction` as the source of an expression that evaluates to that function,
which `Record Keyword` accepts as "a string with the source of one". The bundle follows only
relative `require`s, in either quote style; any other `require` fails in the page with its
name, so the modules must not require Node modules, and the hook must give its result at
once.

## Limits

- The description of an element (`role`, `name`, `description`, ...) approximates what
  Playwright computes. It chooses the selectors to try; only the check in the page decides.
- The hook runs while the page waits for its click, so a rule must stay fast. The element
  is described once per Action, and a rule asks the page only for the selectors it tries.
- The hook runs before the click handlers of the page, but after its `pointerdown` and
  `mousedown` handlers: a control that changes the page on those already has.
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

The unit tests of the selector data, the rules, the chain of steps and the bundle are in
`tests/`, for Node's own test runner:

```
node --test "tests/*.test.js"
```

The acceptance tests are in `atest/`. `atest/__init__.robot` serves `atest/pages/` on a free
port with `atest/PageServer.py`, at `localhost` and `127.0.0.1`, so a test can put a page of
another origin in an iframe; each test adds the elements it records to that blank page.

They test the plugin's contract with Browser, its recorder hook as `Record Keyword`
documents it:

- Most suites go through `atest/HookProbe.py`, a test plugin imported after
  RecorderSelectors (`plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py`). A
  test gives the hook the name and the selector Playwright reports for a click or a
  choice, with Playwright's selector written into the test. The probe runs
  `__rewriteAction` in the page and takes its selector only when it finds exactly the
  element, as Browser does. The test checks the selector the plugin returns, then clicks
  or selects with Browser, as the user did. Like Browser, the probe gives the hook Playwright's selector
  engines through Playwright's console API. They run headless.
- `end_to_end.robot` records for real, so that a change in what Playwright reports shows. It
  waits until the toolbar shows that the recorder records, and stops the session through the
  toolbar's command channel once the toolbar shows the expected calls. The recorder needs a
  visible browser, so on a machine without a display run it under `xvfb-run`, or leave it
  out with `--exclude end-to-end`.

```
robot --outputdir atest/output atest
```
