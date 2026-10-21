"""A plain-text file to a PDF (A4, 11 pt).

Uses PyMuPDF's built-in HTML layout engine, which includes fonts and shaping for Latin, Cyrillic,
Greek and Arabic-script text (including Urdu). Direction is chosen per line. Scripts without a
built-in font (for example Chinese, Japanese, Korean, emoji) may show as missing glyphs.
"""

from __future__ import annotations

import codecs
import html
import io
from pathlib import Path
from typing import Any

import pymupdf

from ..context import JobContext
from ..errors import (
    INPUT_NOT_FOUND,
    INPUT_UNREADABLE,
    OUTPUT_IS_INPUT,
    TEXT_TOO_LARGE,
    EngineError,
)
from ..pdf_tools.common import file_size, get_path, same_file
from ..safe_output import OutputTransaction, PendingOutput

_MAX_CHARACTERS = 10_000_000
_MAX_PAGES = 5000
_PAGE = pymupdf.paper_rect("a4")
_CONTENT = _PAGE + (54, 54, -54, -54)

_STYLE = "<style>body{font-size:11pt;} p{margin:0;white-space:pre-wrap;}</style>"


def read_text(path: Path) -> str:
    """Reads a text file, trying UTF-8 (with or without BOM), UTF-16 with BOM, then Windows-1252."""
    if not path.is_file():
        raise EngineError(INPUT_NOT_FOUND, f"The file '{path.name}' was not found.")
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise EngineError(INPUT_UNREADABLE, f"The file '{path.name}' cannot be read.") from exc

    if raw.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return raw.decode("utf-16")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def _to_html(text: str) -> str:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", "    ").split("\n")
    body = "".join(
        f'<p dir="auto">{html.escape(line) if line.strip() else "&nbsp;"}</p>' for line in lines
    )
    return f"{_STYLE}{body}"


def text_to_pdf(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    source_path = get_path(args, "input")
    output = get_path(args, "output")
    if same_file(source_path, output):
        raise EngineError(OUTPUT_IS_INPUT, "The PDF must be saved under a different name than the text file.")

    text = read_text(source_path)
    if len(text) > _MAX_CHARACTERS:
        raise EngineError(TEXT_TOO_LARGE, "This text file is too large to convert.")
    ctx.progress(1, None)

    with OutputTransaction(ctx) as transaction:
        buffer = io.BytesIO()
        writer = pymupdf.DocumentWriter(buffer)
        story = pymupdf.Story(_to_html(text))
        pages = 0
        more = True
        while more:
            ctx.check_cancelled()
            if pages >= _MAX_PAGES:
                raise EngineError(TEXT_TOO_LARGE, "This text would make too many pages to convert.")
            device = writer.begin_page(_PAGE)
            more, _ = story.place(_CONTENT)
            story.draw(device)
            writer.end_page()
            pages += 1
            ctx.progress(pages + 1, None)
        writer.close()

        temp = transaction.new_temp(output)
        temp.write_bytes(buffer.getvalue())
        (final,) = transaction.commit([PendingOutput(temp, output, pages)], overwrite=True)

    return {"outputPaths": [str(final)], "pageCount": pages, "sizeBytes": file_size(final)}
