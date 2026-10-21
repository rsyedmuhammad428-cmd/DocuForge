"""Images to one PDF, one image per page, in the order given.

JPEGs that need no changes are embedded as they are (no quality loss). Other images are converted
to RGB or grayscale first; transparency is placed on white. Animated images and multi-page TIFFs
use their first frame. EXIF rotation (photos taken sideways) is applied.
"""

from __future__ import annotations

import io
import warnings
from pathlib import Path
from typing import Any

import pymupdf
from PIL import Image, ImageOps, UnidentifiedImageError

from ..context import JobContext
from ..errors import (
    IMAGE_TOO_LARGE,
    INPUT_NOT_FOUND,
    INVALID_REQUEST,
    OUTPUT_IS_INPUT,
    UNSUPPORTED_IMAGE,
    EngineError,
)
from ..pdf_tools.common import file_size, get_path, same_file
from ..safe_output import OutputTransaction, PendingOutput

_A4 = (595.0, 842.0)
_MARGIN = 36.0
_MATCH_DPI = 150
_MAX_PAGE_POINTS = 14_400.0  # the PDF limit (200 inches)


def _prepare(path: Path) -> tuple[bytes, int, int]:
    """Returns the bytes to embed and the image size in pixels."""
    if not path.is_file():
        raise EngineError(INPUT_NOT_FOUND, f"The image '{path.name}' was not found.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as opened:
                original_format = opened.format
                exif_orientation = opened.getexif().get(0x0112, 1)
                image = ImageOps.exif_transpose(opened)
                image.load()
    except Image.DecompressionBombError as exc:
        raise EngineError(IMAGE_TOO_LARGE, f"The image '{path.name}' is too large to convert.") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise EngineError(UNSUPPORTED_IMAGE, f"'{path.name}' is not a readable image.") from exc
    except Image.DecompressionBombWarning as exc:
        raise EngineError(IMAGE_TOO_LARGE, f"The image '{path.name}' is too large to convert.") from exc

    width, height = image.size
    if original_format == "JPEG" and exif_orientation in (0, 1) and image.mode in ("RGB", "L"):
        return path.read_bytes(), width, height

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        flattened = Image.new("RGB", rgba.size, (255, 255, 255))
        flattened.paste(rgba, mask=rgba.getchannel("A"))
        image = flattened
    elif image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue(), width, height


def _page_and_image_rects(width: int, height: int, page_size: str) -> tuple[pymupdf.Rect, pymupdf.Rect]:
    if page_size == "match":
        scale = 72 / _MATCH_DPI
        page_w, page_h = width * scale, height * scale
        shrink = min(1.0, _MAX_PAGE_POINTS / max(page_w, page_h))
        page_w, page_h = page_w * shrink, page_h * shrink
        rect = pymupdf.Rect(0, 0, page_w, page_h)
        return rect, rect

    page_w, page_h = _A4 if height >= width else (_A4[1], _A4[0])
    page = pymupdf.Rect(0, 0, page_w, page_h)
    box_w, box_h = page_w - 2 * _MARGIN, page_h - 2 * _MARGIN
    scale = min(box_w / width, box_h / height)
    draw_w, draw_h = width * scale, height * scale
    left, top = (page_w - draw_w) / 2, (page_h - draw_h) / 2
    return page, pymupdf.Rect(left, top, left + draw_w, top + draw_h)


def images_to_pdf(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    raw_inputs = args.get("inputs")
    if not isinstance(raw_inputs, list) or not raw_inputs:
        raise EngineError(INVALID_REQUEST, "Choose at least one image.")
    inputs = [get_path({"p": value}, "p") for value in raw_inputs]
    output = get_path(args, "output")
    page_size = args.get("pageSize", "a4")
    if page_size not in ("a4", "match"):
        raise EngineError(INVALID_REQUEST, "The page size is not supported.")
    if any(same_file(output, source) for source in inputs):
        raise EngineError(OUTPUT_IS_INPUT, "The PDF must be saved under a different name than the images.")

    with OutputTransaction(ctx) as transaction:
        temp = transaction.new_temp(output)
        with pymupdf.open() as document:
            for number, path in enumerate(inputs, start=1):
                ctx.check_cancelled()
                data, width, height = _prepare(path)
                page_rect, image_rect = _page_and_image_rects(width, height, page_size)
                page = document.new_page(width=page_rect.width, height=page_rect.height)
                page.insert_image(image_rect, stream=data)
                ctx.progress(number, len(inputs) + 1)
            document.save(temp, garbage=3, deflate=True)

        (final,) = transaction.commit([PendingOutput(temp, output, len(inputs))], overwrite=True)
        ctx.progress(len(inputs) + 1, len(inputs) + 1)

    return {"outputPaths": [str(final)], "pageCount": len(inputs), "sizeBytes": file_size(final)}
