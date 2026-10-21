"""PDF pages to PNG or JPEG images, one file per page."""

from __future__ import annotations

import re
from typing import Any

from ..context import JobContext
from ..errors import IMAGE_TOO_LARGE, INVALID_REQUEST, EngineError
from ..safe_output import OutputTransaction, PendingOutput
from ..pdf_tools.common import file_size, get_int, get_path, normalize_ranges, open_pdf

_FORMATS = {"png": ("png", "png"), "jpeg": ("jpeg", "jpg")}
_MIN_DPI, _MAX_DPI = 72, 300
_MAX_PIXELS = 80_000_000  # one rendered page, about 320 MB of memory at 4 bytes per pixel
_JPEG_QUALITY = 90
_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def pdf_to_images(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    image_format = args.get("format")
    if image_format not in _FORMATS:
        raise EngineError(INVALID_REQUEST, "The image format is not supported.")
    pillow_name, extension = _FORMATS[image_format]
    dpi = get_int(args, "dpi", minimum=_MIN_DPI)
    if dpi > _MAX_DPI:
        raise EngineError(INVALID_REQUEST, f"The resolution must be between {_MIN_DPI} and {_MAX_DPI} dpi.")

    source_path = get_path(args, "input")
    output_dir = get_path(args, "outputDir")
    base = (_INVALID_FILENAME_CHARS.sub("_", str(args.get("baseName") or source_path.stem)).strip(" .") or "document")[:120]

    with OutputTransaction(ctx) as transaction, open_pdf(source_path) as document:
        if args.get("ranges") is None:
            pages = list(range(1, document.page_count + 1))
        else:
            ranges = normalize_ranges(args["ranges"], document.page_count)
            pages = [number for start, end in ranges for number in range(start, end + 1)]

        width = len(str(document.page_count))
        pending: list[PendingOutput] = []
        for step, number in enumerate(pages, start=1):
            ctx.check_cancelled()
            page = document.load_page(number - 1)
            pixels = (page.rect.width * dpi / 72) * (page.rect.height * dpi / 72)
            if pixels > _MAX_PIXELS:
                raise EngineError(
                    IMAGE_TOO_LARGE,
                    f"Page {number} would be too large at {dpi} dpi. Choose a lower resolution.",
                )
            destination = output_dir / f"{base}_page_{number:0{width}d}.{extension}"
            temp = transaction.new_temp(destination)
            # Render, save and free one page at a time, so memory does not grow with page count.
            pixmap = page.get_pixmap(dpi=dpi, alpha=False)
            if image_format == "jpeg":
                pixmap.save(temp, output=pillow_name, jpg_quality=_JPEG_QUALITY)
            else:
                pixmap.save(temp, output=pillow_name)
            del pixmap
            pending.append(PendingOutput(temp, destination, kind="image"))
            ctx.progress(step, len(pages) + 1)

        finals = transaction.commit(pending, overwrite=False)
        ctx.progress(len(pages) + 1, len(pages) + 1)

    return {
        "outputPaths": [str(path) for path in finals],
        "outputDirectory": str(output_dir),
        "sizeBytes": sum(file_size(path) for path in finals),
    }
