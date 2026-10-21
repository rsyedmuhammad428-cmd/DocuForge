"""Reads page counts so the app can show them and catch bad files before a job starts."""

from __future__ import annotations

from typing import Any

from ..context import JobContext
from ..errors import INVALID_REQUEST, EngineError
from .common import open_pdf
from pathlib import Path


def inspect_pdfs(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    paths = args.get("paths")
    if not isinstance(paths, list) or not all(isinstance(p, str) for p in paths):
        raise EngineError(INVALID_REQUEST, "'paths' must be a list of paths.")

    files: list[dict[str, Any]] = []
    for number, raw_path in enumerate(paths, start=1):
        ctx.check_cancelled()
        try:
            with open_pdf(Path(raw_path)) as document:
                files.append({"path": raw_path, "ok": True, "pageCount": document.page_count})
        except EngineError as error:
            files.append(
                {"path": raw_path, "ok": False, "error": {"code": error.code, "message": error.message}}
            )
        ctx.progress(number, len(paths))
    return {"files": files}
