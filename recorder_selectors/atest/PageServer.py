"""Serves the pages of the acceptance tests over HTTP, on a free port.

HTTP rather than file URLs, so that a test can put a page of another origin in
an iframe: the same server answers at ``localhost`` and at ``127.0.0.1``.
"""

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PAGES = Path(__file__).parent / "pages"


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass


class PageServer:
    ROBOT_LIBRARY_SCOPE = "GLOBAL"

    def __init__(self):
        self._server: ThreadingHTTPServer | None = None

    def start_page_server(self) -> str:
        """Starts serving the ``pages`` folder and returns its URL at ``localhost``."""
        handler = partial(_QuietHandler, directory=str(PAGES))
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return f"http://localhost:{self._server.server_address[1]}/"

    def stop_page_server(self):
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
