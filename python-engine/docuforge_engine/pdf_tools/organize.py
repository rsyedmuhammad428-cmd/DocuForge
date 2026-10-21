"""Export a PDF with its pages reordered, rotated, or removed.

One operation covers reorder, rotate, delete, and "extract selected pages":
the request lists the pages to keep, in the order they should appear, each with an extra
rotation. The source file is never modified; the result is always a new file.
"""

from __future__ import annotations

from typing import Any

from ..context import JobContext
from ..errors import INVALID_PAGE_RANGE, INVALID_REQUEST, OUTPUT_IS_INPUT, EngineError
from ..safe_output import OutputTransaction, PendingOutput
from .common import file_size, get_path, open_pdf, same_file

_ROTATIONS = (0, 90, 180, 270)


def _validate_pages(raw: object, page_count: int) -> list[tuple[int, int]]:
    if not isinstance(raw, list) or not raw:
        raise EngineError(INVALID_PAGE_RANGE, "Keep at least one page.")

    pages: list[tuple[int, int]] = []
    seen: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise EngineError(INVALID_REQUEST, "A page entry is not valid.")
        index = item.get("index")
        rotation = item.get("rotation", 0)
        if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < page_count:
            raise EngineError(INVALID_PAGE_RANGE, f"A page is outside the document ({page_count} pages).")
        if rotation not in _ROTATIONS or isinstance(rotation, bool):
            raise EngineError(INVALID_REQUEST, "Rotation must be 0, 90, 180 or 270 degrees.")
        if index in seen:
            raise EngineError(INVALID_PAGE_RANGE, "The same page cannot be used twice.")
        seen.add(index)
        pages.append((index, rotation))
    return pages


def organize_export(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    source_path = get_path(args, "input")
    output = get_path(args, "output")
    if same_file(source_path, output):
        raise EngineError(OUTPUT_IS_INPUT, "The output file must be different from the original PDF.")

    with OutputTransaction(ctx) as transaction, open_pdf(source_path) as document:
        pages = _validate_pages(args.get("pages"), document.page_count)
        ctx.progress(1, 3)
        ctx.check_cancelled()

        # select() reorders and drops pages in one pass over the page list (O(n) in kept pages).
        # It changes only this in-memory copy; the file on disk is untouched.
        document.select([index for index, _ in pages])
        for position, (_, extra_rotation) in enumerate(pages):
            if extra_rotation:
                page = document[position]
                page.set_rotation((page.rotation + extra_rotation) % 360)
        ctx.progress(2, 3)
        ctx.check_cancelled()

        temp = transaction.new_temp(output)
        document.save(temp, garbage=3, deflate=True)
        (final,) = transaction.commit([PendingOutput(temp, output, len(pages))], overwrite=True)
        ctx.progress(3, 3)

    return {"outputPaths": [str(final)], "pageCount": len(pages), "sizeBytes": file_size(final)}
