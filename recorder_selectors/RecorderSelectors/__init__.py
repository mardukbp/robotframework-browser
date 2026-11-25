import json
from pathlib import Path

from Browser import Browser
from Browser.base.librarycomponent import LibraryComponent
from Browser.generated.playwright_pb2 import Request

__version__ = "0.1.0"

JS_EXTENSION = Path(__file__).parent.resolve() / "js" / "index.js"


class RecorderSelectors(LibraryComponent):
    """A Browser plugin that makes `Record Keyword`, `Record Keywords` and
    `Record Selector` record selectors a person can read, instead of the ids,
    CSS and indexes Playwright falls back to.

    Import it with the ``plugins`` argument of Browser:
    | Library    Browser    plugins=RecorderSelectors

    Only some of its rules run when they are named after the plugin, each after
    a ``;``. They still run in the order below, whatever order they are named in:
    | Library    Browser    plugins=RecorderSelectors;aria_label;exact_names;id_engine

    The rules are ``number_widening``, ``has_text``, ``title_description``,
    ``aria_label``, ``label_scope``, ``caption_scope``, ``exact_names`` and
    ``id_engine``. Every recorded or picked selector passes them in this order:

    - A number Playwright drops at the start or end of a text is given back:
      ``text="km/h bis 60 km/h"`` becomes ``text="46 km/h bis 60 km/h"``.
    - An element found by CSS with ``:has-text()`` is recorded by its own
      text, scoped by the text before it when the text is not unique:
      ``text="Ja" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"``.
    - A clicked element whose title is its description, and is unique on the
      page, is recorded by it: ``role=button[description="Close"s]``.
    - An element with an explicit role and aria-label is recorded by both,
      scoped by the text before it or with ``nth=`` when they are not unique:
      ``role=button[name="Wertehilfe einblenden"s] >> scope="Kundenauftragsart"``.
    - A form control without an accessible name is recorded by the caption
      beside it: ``role=combobox >> scope="Mittelgeber*"``.
    - An element scoped by the id or CSS of an ancestor is scoped by the text before
      it: ``role=link[name*="Details"i] >> scope="Robot Framework"``.
    - The name or text the selector finds its element by is matched
      exactly, with the element's whole name:
      ``role=link[name="Details & Termine"s] >> scope="Robot Framework"``.
    - Last, a part that is only a CSS id is written with the ``id`` engine,
      without CSS escapes: ``#APD_\\:\\:Note`` becomes ``id=APD_::Note``.

    A rule's selector is used only when it finds exactly the recorded
    element; otherwise the selector before that rule is kept and the reason is
    logged in ``playwright-log.txt``.

    The rules change only selectors: everything else in a recorded keyword,
    such as the values of a choice in a select, is recorded as Playwright
    reports it.

    The rules run in the page as each Action happens, before it has any
    effect, so a click that navigates or changes the page is recorded by the
    page the user clicked on.

    The plugin registers the ``scope`` selector engine, so the recorded
    selectors work in any test that imports Browser with this plugin.
    ``scope="Text"`` keeps the elements found so far whose closest visible
    text before them is ``Text``. Text in links, buttons and form controls is
    skipped, and so is the label of a radio button or checkbox, and text before
    an element with the same tag, role and name.
    """

    def __init__(self, library: Browser, *rules: str):
        super().__init__(library)
        self.initialize_js_extension(JS_EXTENSION)
        self._call_extension("__registerScopeEngine")
        if rules:
            self._call_extension("__useRules", ruleNames=list(rules))

    def _call_extension(self, name: str, **arguments: object):
        # Not call_js_keyword: it reads the library timeout, which Browser sets
        # only after it has created its plugins.
        with self.playwright.grpc_channel() as stub:
            for _ in stub.CallExtensionKeyword(
                Request().KeywordCall(
                    name=name,
                    arguments=json.dumps({"arguments": list(arguments.items())}),
                )
            ):
                pass
