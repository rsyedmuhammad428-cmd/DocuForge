"""Renders small JPEG previews of chosen pages for the Organize screen."""

from __future__ import annotations

import base64
from typing import Any

import pymupdf

from ..context import JobContext
from ..errors import INVALID_PAGE_RANGE, INVALID_REQUEST, EngineError
from .common import get_path, open_pdf

_MIN_WIDTH = 80
_MAX_WIDTH = 400
_MAX_PAGES_PER_REQUEST = 60
_JPEG_QUALITY = 70


def thumbnails(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    source_path = get_path(args, "input")
    pages = args.get("pages")
    width = args.get("width", 160)
    if (
        not isinstance(pages, list)
        or not pages
        or len(pages) > _MAX_PAGES_PER_REQUEST
        or not all(isinstance(p, int) and not isinstance(p, bool) for p in pages)
    ):
        raise EngineError(
            INVALID_REQUEST, f"Request between 1 and {_MAX_PAGES_PER_REQUEST} page numbers at a time."
        )
    if isinstance(width, bool) or not isinstance(width, int):
        raise EngineError(INVALID_REQUEST, "'width' must be a whole number.")
    width = max(_MIN_WIDTH, min(_MAX_WIDTH, width))

    results: list[dict[str, Any]] = []
    with open_pdf(source_path) as document:
        for number, index in enumerate(pages, start=1):
            ctx.check_cancelled()
            if not 0 <= index < document.page_count:
                raise EngineError(INVALID_PAGE_RANGE, "A requested page is outside the document.")
            # Only the requested pages are rendered, one at a time, at thumbnail size.
            page = document.load_page(index)
            scale = width / page.rect.width
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
            encoded = base64.b64encode(pixmap.tobytes("jpeg", jpg_quality=_JPEG_QUALITY)).decode("ascii")
            results.append(
                {
                    "page": index,
                    "width": pixmap.width,
                    "height": pixmap.height,
                    "dataUrl": f"data:image/jpeg;base64,{encoded}",
                }
            )
            ctx.progress(number, len(pages))
    return {"thumbnails": results}
