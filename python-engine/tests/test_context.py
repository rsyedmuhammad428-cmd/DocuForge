from __future__ import annotations

import io
import threading

import pytest

from docuforge_engine import errors
from docuforge_engine.context import JobContext, watch_for_cancel
from docuforge_engine.errors import EngineError
from docuforge_engine.protocol import Protocol


def watch(text: str) -> bool:
    event = threading.Event()
    watch_for_cancel(io.StringIO(text), event).join(timeout=5)
    return event.is_set()


def test_cancel_message_sets_the_event():
    assert watch('{"type":"cancel"}\n')


def test_end_of_input_counts_as_cancel_because_the_app_is_gone():
    assert watch("")


def test_other_messages_are_ignored_until_input_ends():
    event = threading.Event()
    thread = watch_for_cancel(io.StringIO('{"type":"noop"}\nnot json\n'), event)
    thread.join(timeout=5)
    assert event.is_set()  # set by EOF, not by the ignored messages


def test_check_cancelled_raises_once_set():
    event = threading.Event()
    ctx = JobContext("job", Protocol(io.StringIO()), event)
    ctx.check_cancelled()
    event.set()
    with pytest.raises(EngineError) as error:
        ctx.check_cancelled()
    assert error.value.code == errors.CANCELLED
