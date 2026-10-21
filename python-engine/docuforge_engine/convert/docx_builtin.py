"""Word (.docx) to PDF without any other program, using `mammoth` and PyMuPDF's HTML layout.

What is kept: headings, bold and italic, lists, tables, pictures, and right-to-left text.
What is NOT kept: headers and footers, page numbers, columns, text boxes, exact fonts, margins and
page breaks. It is a readable copy of the content, not a pixel-exact one.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import mammoth
import pymupdf

from ..context import JobContext
from ..errors import CONVERSION_FAILED, TEXT_TOO_LARGE, EngineError

_MAX_PAGES = 5000
_MAX_FILE_BYTES = 100 * 1024 * 1024
_PAGE = pymupdf.paper_rect("a4")
_CONTENT = _PAGE + (54, 54, -54, -54)
_STYLE = (
    "<style>body{font-size:11pt} p{margin:0 0 6pt 0} table{border-collapse:collapse} "
    "td,th{border:1px solid black;padding:3pt} img{max-width:400pt}</style>"
)
# Lets each paragraph choose its own direction, so Urdu and Arabic lines align correctly.
_TAGS_WITHOUT_ATTRIBUTES = re.compile(r"<(p|li|h[1-6])>")


def docx_to_pdf_bytes(path: Path, ctx: JobContext) -> tuple[bytes, int, list[str]]:
    """Returns the PDF bytes, the page count, and any warnings from reading the document."""
    if path.stat().st_size > _MAX_FILE_BYTES:
        raise EngineError(CONVERSION_FAILED, f"'{path.name}' is too large for the built-in converter.")

    archive = pymupdf.Archive()
    image_count = 0

    def store_image(image: mammoth.documents.Image) -> dict[str, str]:
        nonlocal image_count
        image_count += 1
        name = f"image{image_count}"
        with image.open() as handle:
            archive.add(handle.read(), name)
        return {"src": name}

    try:
        with open(path, "rb") as handle:
            result = mammoth.convert_to_html(handle, convert_image=mammoth.images.img_element(store_image))
    except Exception as exc:  # noqa: BLE001 - the library raises many kinds of errors on bad input
        raise EngineError(CONVERSION_FAILED, f"'{path.name}' could not be read as a Word document.") from exc

    body = _TAGS_WITHOUT_ATTRIBUTES.sub(lambda m: f'<{m.group(1)} dir="auto">', result.value)
    story = pymupdf.Story(f"{_STYLE}{body}", archive=archive)

    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer)
    pages = 0
    more = True
    while more:
        ctx.check_cancelled()
        if pages >= _MAX_PAGES:
            raise EngineError(TEXT_TOO_LARGE, "This document would make too many pages to convert.")
        device = writer.begin_page(_PAGE)
        more, _ = story.place(_CONTENT)
        story.draw(device)
        writer.end_page()
        pages += 1
        ctx.progress(1 + pages, None)
    writer.close()

    return buffer.getvalue(), pages, [message.message for message in result.messages]
