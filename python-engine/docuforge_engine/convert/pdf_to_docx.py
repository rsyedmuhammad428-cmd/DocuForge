"""PDF to an editable Word (.docx) file, using `pdf2docx`.

pdf2docx rebuilds paragraphs, bold and italic, bullets, pictures and tables from where things sit
on the page. It works well for text-based PDFs with a simple layout. It cannot do magic:
scanned PDFs have no text to rebuild, tables without visible lines become aligned text, and complex
or designed pages (brochures, forms, columns) may need touching up in Word.
"""

from __future__ import annotations

import logging
import traceback
from pathlib import Path
from typing import Any

from ..context import JobContext
from ..errors import CONVERSION_FAILED, NO_TEXT_FOUND, OUTPUT_IS_INPUT, EngineError
from ..pdf_tools.common import file_size, get_path, normalize_ranges, open_pdf, same_file
from ..safe_output import OutputTransaction, PendingOutput
from .pdf_to_docx_simple import build_simple_docx

_NOTE = (
    "The layout was rebuilt automatically. Check pages with tables, columns or unusual fonts, "
    "and fix anything that looks wrong in Word."
)


_FALLBACK_NOTE = (
    "The layout converter could not be used ({reason}), so a simpler method made this file. It keeps "
    "text, formatting, lists and pictures, but not tables or columns. Please check it carefully."
)


def _describe(exc: BaseException) -> str:
    text = " ".join(f"{type(exc).__name__}: {exc}".split())
    return text[:160]


def _convert_with_layout(source_path: Path, temp: Path, page_numbers: list[int], ctx: JobContext) -> None:
    from pdf2docx import Converter  # heavy: needs NumPy and OpenCV, so it is imported only here

    logging.getLogger().setLevel(logging.WARNING)  # pdf2docx logs every page otherwise
    converter = Converter(str(source_path))
    try:
        ctx.progress(2, 4)
        # One call; it cannot be interrupted part-way, so a cancel waits for it.
        converter.convert(str(temp), pages=[number - 1 for number in page_numbers])
    finally:
        try:
            converter.close()
        except Exception:  # noqa: BLE001 - closing must never hide the real result
            pass

    # A result Word cannot open counts as a failure of this method, so the fallback gets a turn.
    import docx

    docx.Document(str(temp))


def _convert(source_path: Path, temp: Path, page_numbers: list[int], ctx: JobContext) -> str:
    """Returns the note to show with the result."""
    try:
        _convert_with_layout(source_path, temp, page_numbers, ctx)
        return _NOTE
    except EngineError:
        raise
    except Exception as exc:  # noqa: BLE001 - pdf2docx raises many kinds of errors, or may be unusable
        traceback.print_exc()  # to stderr, for the developer's terminal
        reason = _describe(exc)

    temp.unlink(missing_ok=True)  # remove anything the failed attempt left behind
    ctx.check_cancelled()
    try:
        skipped = build_simple_docx(source_path, page_numbers, temp, ctx)
    except EngineError:
        raise
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        raise EngineError(
            CONVERSION_FAILED,
            f"'{source_path.name}' could not be converted to Word. ({_describe(exc)})",
        ) from exc

    note = _FALLBACK_NOTE.format(reason=reason)
    if skipped:
        note += f" {skipped} picture(s) could not be copied."
    return note[:590]


def pdf_to_docx(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    source_path = get_path(args, "input")
    output = get_path(args, "output")
    if same_file(source_path, output):
        raise EngineError(OUTPUT_IS_INPUT, "The Word file must not replace the PDF.")

    with open_pdf(source_path) as document:
        if args.get("ranges") is None:
            page_numbers = list(range(1, document.page_count + 1))
        else:
            ranges = normalize_ranges(args["ranges"], document.page_count)
            page_numbers = [n for start, end in ranges for n in range(start, end + 1)]
        has_text = any(
            document.load_page(number - 1).get_text("text").strip() for number in page_numbers
        )
    if not has_text:
        raise EngineError(
            NO_TEXT_FOUND,
            "This PDF has no selectable text, so there is nothing to put into a Word file. It may "
            "be a scan. Run OCR on it first.",
        )
    ctx.progress(1, 4)
    ctx.check_cancelled()

    with OutputTransaction(ctx) as transaction:
        temp = transaction.new_temp(output)
        note = _convert(source_path, temp, page_numbers, ctx)
        ctx.progress(3, 4)
        ctx.check_cancelled()

        (final,) = transaction.commit([PendingOutput(temp, output, kind="docx")], overwrite=True)
        ctx.progress(4, 4)

    return {
        "outputPaths": [str(final)],
        "pageCount": len(page_numbers),
        "sizeBytes": file_size(final),
        "note": note,
    }
