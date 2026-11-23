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

    Every recorded or picked selector passes these rules, in this order:

    - A number Playwright drops at the start or end of a text is given back:
      ``text="km/h bis 60 km/h"`` becomes ``text="46 km/h bis 60 km/h"``.
    - A clicked element whose title is its description, and is unique on the
      page, is recorded by it: ``role=button[description="Close"s]``.
    - An element with an explicit role and aria-label is recorded by both,
      scoped by the text before it or with ``nth=`` when they are not unique:
      ``role=button[name="Wertehilfe einblenden"s] >> scope="Kundenauftragsart"``.
    - A form control without an accessible name is recorded by the caption
      beside it: ``role=combobox >> scope="Mittelgeber*"``.
    - An element scoped by the id or CSS of an ancestor is scoped by the text before
      it: ``role=link[name*="Details"i] >> scope="Robot Framework"``.
    - Last, the name or text the selector finds its element by is matched
      exactly, with the element's whole name:
      ``role=link[name="Details & Termine"s] >> scope="Robot Framework"``.

    A rewritten selector is used only when it finds exactly the recorded
    element; otherwise Playwright's is kept and the reason is logged in
    ``playwright-log.txt``.

    A choice in a select is recorded by the labels of the chosen options
    instead of their values, which are often generated:
    ``Select Options By    id=make    label    AMELUNG`` instead of
    ``value    14: 6792``. The labels are noted in the page as the choice
    happens, before the page's own scripts can relabel the options. The values
    stay when an option has no label, shares it with another option, or its
    label changed by the time Playwright reported the choice.

    The plugin registers the ``scope`` selector engine, so the recorded
    selectors work in any test that imports Browser with this plugin.
    ``scope="Text"`` keeps the elements found so far whose closest visible
    text before them is ``Text``. Text in links, buttons and form controls is
    skipped, and so is the label of a radio button or checkbox, and text before
    an element with the same tag, role and name.
    """

    def __init__(self, library: Browser):
        super().__init__(library)
        self.initialize_js_extension(JS_EXTENSION)
        self._register_scope_engine()

    def _register_scope_engine(self):
        # Not call_js_keyword: it reads the library timeout, which Browser sets
        # only after it has created its plugins.
        with self.playwright.grpc_channel() as stub:
            for _ in stub.CallExtensionKeyword(
                Request().KeywordCall(
                    name="__registerScopeEngine",
                    arguments=json.dumps({"arguments": []}),
                )
            ):
                pass
