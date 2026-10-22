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
from .docx_quality import Coverage, coverage, right_to_left_share, tidy_text
from .pdf_to_docx_simple import build_simple_docx

# Pre-initialize OpenCV at module load time. On Windows, if cv2's C-extension DLLs are loaded
# lazily while another thread is blocked in a synchronous read on sys.stdin (such as the
# engine's cancel-watcher thread), the process deadlocks on the OS loader / handle lock.
try:
    import cv2  # noqa: F401
except Exception:
    pass

_NOTE = (
    "The layout was rebuilt automatically. Check pages with tables, columns or unusual fonts, "
    "and fix anything that looks wrong in Word."
)


_FALLBACK_NOTE = (
    "The layout converter was not used ({reason}), so a simpler method made this file. It keeps all "
    "the text, formatting, lists and pictures, but not tables or columns. Please check it carefully."
)


def _describe(exc: BaseException) -> str:
    text = " ".join(f"{type(exc).__name__}: {exc}".split())
    return text[:160]


# Chosen by measuring (tools/fidelity/tune.py): tighter rules for where lines and paragraphs break
# keep paragraphs closer to how the PDF shows them. Failing pages must raise instead of being skipped
# silently, because a skipped page is lost content.
LAYOUT_SETTINGS = {
    "ignore_page_error": False,
    "raw_exceptions": True,
    "line_break_free_space_ratio": 0.02,
    "new_paragraph_free_space_ratio": 0.6,
}

# A converted file must carry over at least this share of the PDF's words, or it is not trusted.
MIN_WORD_RECALL = 0.97


def _convert_with_layout(source_path: Path, temp: Path, page_numbers: list[int], ctx: JobContext) -> None:
    from pdf2docx import Converter  # heavy: needs NumPy and OpenCV

    logging.getLogger().setLevel(logging.WARNING)  # pdf2docx logs every page otherwise
    converter = Converter(str(source_path))
    try:
        ctx.progress(2, 4)
        # One call; it cannot be interrupted part-way, so a cancel waits for it.
        converter.convert(str(temp), pages=[number - 1 for number in page_numbers], **LAYOUT_SETTINGS)
    finally:
        try:
            converter.close()
        except Exception:  # noqa: BLE001 - closing must never hide the real result
            pass

    # A result Word cannot open counts as a failure of this method, so the fallback gets a turn.
    import docx

    docx.Document(str(temp))


def _simple(source_path: Path, temp: Path, page_numbers: list[int], ctx: JobContext) -> int:
    temp.unlink(missing_ok=True)  # remove anything an earlier attempt left behind
    ctx.check_cancelled()
    try:
        return build_simple_docx(source_path, page_numbers, temp, ctx)
    except EngineError:
        raise
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        raise EngineError(
            CONVERSION_FAILED,
            f"'{source_path.name}' could not be converted to Word. ({_describe(exc)})",
        ) from exc


def _checked_note(found: Coverage) -> str:
    if found.expected == 0:
        return ""
    if found.recall >= 0.999:
        return f" Checked: all {found.expected:,} words from the PDF are in the Word file."
    return f" Checked: {found.recall:.0%} of the PDF's {found.expected:,} words are in the Word file."


def convert_best(source_path: Path, temp: Path, page_numbers: list[int], ctx: JobContext) -> str:
    """Writes the .docx to `temp` with the best method that works, and returns the note to show.

    1. The layout converter (tuned). 2. A check that no text was lost. 3. If it failed, or lost text,
    the simple converter, which keeps all the text but not tables or columns.
    """
    reason: str | None = None
    try:
        _convert_with_layout(source_path, temp, page_numbers, ctx)
        tidy_text(temp)
        found = coverage(source_path, page_numbers, temp)
        if found.recall >= MIN_WORD_RECALL:
            note = _NOTE + _checked_note(found)
            if right_to_left_share(source_path, page_numbers) > 0.1:
                note += " It contains right-to-left text (Urdu, Arabic): check word order and letters."
            return note[:590]
        reason = f"it lost text ({found.recall:.0%} of the words were kept)"
    except EngineError:
        raise
    except Exception as exc:  # noqa: BLE001 - pdf2docx raises many kinds of errors, or may be unusable
        traceback.print_exc()  # to stderr, for the developer's terminal
        reason = _describe(exc)

    skipped = _simple(source_path, temp, page_numbers, ctx)
    tidy_text(temp)
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
        note = convert_best(source_path, temp, page_numbers, ctx)
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
