"""A Browser plugin for the acceptance tests of RecorderSelectors.

It runs the plugin's ``__rewriteSelector`` hook in the page for an Action given
as Playwright reports it, the way `Record Keyword` documents the hook:

| Library    Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py

The suites that check the plugin in a real recording use Browser's recorder
instead (end_to_end.robot).
"""

from pathlib import Path

from robot.api.deco import keyword

from Browser import Browser
from Browser.base.librarycomponent import LibraryComponent


class HookProbe(LibraryComponent):
    def __init__(self, library: Browser):
        super().__init__(library)
        self.initialize_js_extension(Path(__file__).parent.resolve() / "hook_probe.js")

    @keyword
    def recorded_selector(self, name: str, selector: str) -> str:
        """The selector the plugin records for the Action ``name``, such as ``click``,
        on ``selector``, which is given as Playwright reports it. The hook runs on the
        page as it is now, as it does before the Action happens."""
        return self.call_js_keyword("recordedSelector", name=name, selector=selector)
