"""Split a PDF. Four modes:

extract  one new PDF containing the chosen pages, in the order given
ranges   one new PDF per chosen range
each     one new PDF per page
chunks   one new PDF per N pages

Page numbers in requests are one-based and inclusive.
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

import pymupdf

from ..context import JobContext
from ..errors import INVALID_REQUEST, EngineError
from ..safe_output import OutputTransaction, PendingOutput
from .common import file_size, get_int, get_path, normalize_ranges, open_pdf

_MODES = ("extract", "ranges", "each", "chunks")
_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_MAX_STEM_LENGTH = 120


def _clean_stem(name: str) -> str:
    cleaned = _INVALID_FILENAME_CHARS.sub("_", name).strip(" .")
    return (cleaned or "document")[:_MAX_STEM_LENGTH]


def _range_label(start: int, end: int) -> str:
    return f"page_{start}" if start == end else f"pages_{start}-{end}"


# Each planned output is (file name suffix, list of (start, end) one-based ranges to copy).
Plan = list[tuple[str, list[tuple[int, int]]]]


def _plan(mode: str, args: dict[str, Any], page_count: int) -> Plan:
    if mode == "extract":
        ranges = normalize_ranges(args.get("ranges"), page_count)
        label = "_".join(f"{s}-{e}" if s != e else str(s) for s, e in ranges)
        suffix = f"pages_{label}" if len(label) <= 60 else "selected_pages"
        return [(suffix, ranges)]

    if mode == "ranges":
        ranges = normalize_ranges(args.get("ranges"), page_count)
        return [(_range_label(s, e), [(s, e)]) for s, e in ranges]

    if mode == "each":
        width = len(str(page_count))
        return [(f"page_{number:0{width}d}", [(number, number)]) for number in range(1, page_count + 1)]

    chunk_size = get_int(args, "chunkSize")
    plan: Plan = []
    for start in range(1, page_count + 1, chunk_size):
        end = min(start + chunk_size - 1, page_count)
        plan.append((_range_label(start, end), [(start, end)]))
    return plan


def split(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    mode = args.get("mode")
    if mode not in _MODES:
        raise EngineError(INVALID_REQUEST, "The split mode is not supported.")
    source_path = get_path(args, "input")
    output_dir = get_path(args, "outputDir")
    base = _clean_stem(args["baseName"] if isinstance(args.get("baseName"), str) else source_path.stem)

    with OutputTransaction(ctx) as transaction, open_pdf(source_path) as source:
        plan = _plan(mode, args, source.page_count)
        pending: list[PendingOutput] = []

        for number, (suffix, ranges) in enumerate(plan, start=1):
            ctx.check_cancelled()
            destination = output_dir / f"{base}_{suffix}.pdf"
            temp = transaction.new_temp(destination)
            page_total = 0
            with pymupdf.open() as part:
                for start, end in ranges:
                    part.insert_pdf(source, from_page=start - 1, to_page=end - 1)
                    page_total += end - start + 1
                part.save(temp, garbage=3, deflate=True)
            pending.append(PendingOutput(temp, destination, page_total))
            ctx.progress(number, len(plan) + 1)

        finals = transaction.commit(pending, overwrite=False)
        ctx.progress(len(plan) + 1, len(plan) + 1)

    return {
        "outputPaths": [str(path) for path in finals],
        "outputDirectory": str(output_dir),
        "fileCount": len(finals),
        "sizeBytes": sum(file_size(path) for path in finals),
    }


def expected_chunk_count(page_count: int, chunk_size: int) -> int:
    """Number of files the 'chunks' mode produces. Exposed for tests and UI previews."""
    return math.ceil(page_count / chunk_size)
