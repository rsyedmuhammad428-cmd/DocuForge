"""JSON-lines protocol between the app and the engine.

The app writes ONE request line to stdin, e.g. {"id": "...", "op": "merge", "args": {...}}.
The engine writes one message per line to stdout:
  {"type": "progress", "current": 2, "total": 5}
  {"type": "result", "data": {...}}            (final)
  {"type": "error", "code": "...", "message": "..."}   (final)
The app may later write {"type": "cancel"} to stdin to ask the engine to stop.
stdout is reserved for these messages. Anything else the engine prints goes to stderr.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, TextIO

from .errors import INVALID_REQUEST, EngineError

_JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class Protocol:
    def __init__(self, stream: TextIO) -> None:
        self._stream = stream

    def _send(self, message: dict[str, Any]) -> None:
        # ensure_ascii keeps the stream pure ASCII, so Windows code pages cannot corrupt it.
        self._stream.write(json.dumps(message, ensure_ascii=True, separators=(",", ":")) + "\n")
        self._stream.flush()

    def progress(self, current: int, total: int | None) -> None:
        self._send({"type": "progress", "current": current, "total": total})

    def result(self, data: dict[str, Any]) -> None:
        self._send({"type": "result", "data": data})

    def error(self, code: str, message: str) -> None:
        self._send({"type": "error", "code": code, "message": message})


@dataclass(frozen=True)
class Request:
    job_id: str
    op: str
    args: dict[str, Any]


def parse_request(line: str) -> Request:
    try:
        raw = json.loads(line)
    except json.JSONDecodeError as exc:
        raise EngineError(INVALID_REQUEST, "The request was not valid JSON.") from exc

    if not isinstance(raw, dict):
        raise EngineError(INVALID_REQUEST, "The request must be a JSON object.")

    job_id = raw.get("id")
    op = raw.get("op")
    args = raw.get("args")
    if not isinstance(job_id, str) or not _JOB_ID_PATTERN.match(job_id):
        raise EngineError(INVALID_REQUEST, "The request id is missing or invalid.")
    if not isinstance(op, str) or not op:
        raise EngineError(INVALID_REQUEST, "The request operation is missing.")
    if not isinstance(args, dict):
        raise EngineError(INVALID_REQUEST, "The request arguments must be an object.")
    return Request(job_id=job_id, op=op, args=args)
