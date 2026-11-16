"""A Browser plugin for the acceptance tests of RecorderSelectors.

Import it after RecorderSelectors, so that its JS extension comes after the
plugin's in Browser's chain of ``__recordedAction`` hooks:

| Library    Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py

It uses only what Browser offers every plugin: a JS extension, its hooks and
``call_js_keyword``.
"""

from pathlib import Path
from typing import Any

from robot.api.deco import keyword

from Browser import Browser
from Browser.base.librarycomponent import LibraryComponent


class HookProbe(LibraryComponent):
    def __init__(self, library: Browser):
        super().__init__(library)
        self.initialize_js_extension(Path(__file__).parent.resolve() / "hook_probe.js")

    @keyword
    def start_recording_hooks(self):
        """Runs the plugin's ``__recordingStarted`` in the active context, as Browser
        does before the first recording there."""
        self.call_js_keyword("startRecordingHooks")

    @keyword
    def recorded_action(self, action: dict[str, Any]) -> dict[str, Any]:
        """The Action the plugin records for ``action``, which is given as Playwright
        reports it: ``{"name": "click", "selector": "internal:role=..."}``."""
        return self.call_js_keyword("recordedAction", action=action)

    @keyword
    def recorded_selector(self, name: str, selector: str) -> str:
        """The selector the plugin records for the Action ``name`` on ``selector``."""
        return self.recorded_action({"name": name, "selector": selector})["selector"]

    @keyword
    def actions_seen(self) -> list[dict[str, Any]]:
        """Every Action the plugin gave a real recording, in order."""
        return self.call_js_keyword("actionsSeen") or []

    @keyword
    def forget_actions_seen(self):
        self.call_js_keyword("forgetActionsSeen")
