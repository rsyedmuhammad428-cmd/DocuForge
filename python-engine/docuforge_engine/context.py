"""Per-job context: progress reporting and cooperative cancellation."""

from __future__ import annotations

import json
import threading
from typing import TextIO

from .errors import CANCELLED, EngineError
from .protocol import Protocol


class JobContext:
    def __init__(self, job_id: str, protocol: Protocol, cancel_event: threading.Event) -> None:
        self.job_id = job_id
        self._protocol = protocol
        self._cancel_event = cancel_event

    def progress(self, current: int, total: int | None = None) -> None:
        self._protocol.progress(current, total)

    def check_cancelled(self) -> None:
        """Call between steps. Raises CANCELLED so the job unwinds and cleans up."""
        if self._cancel_event.is_set():
            raise EngineError(CANCELLED, "The job was cancelled.")


def watch_for_cancel(stream: TextIO, cancel_event: threading.Event) -> threading.Thread:
    """Sets the event when the app sends a cancel message, or when the app goes away (EOF)."""

    def run() -> None:
        for line in stream:
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict) and message.get("type") == "cancel":
                break
        cancel_event.set()

    thread = threading.Thread(target=run, name="cancel-watcher", daemon=True)
    thread.start()
    return thread
