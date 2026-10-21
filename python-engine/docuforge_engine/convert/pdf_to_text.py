"""Extract the text of a PDF into a UTF-8 .txt file.

Only text that is actually in the PDF can be extracted. A scanned PDF is a picture of text and
has none; it needs OCR, which DocuForge does not have yet.
"""

from __future__ import annotations

from typing import Any

from ..context import JobContext
from ..errors import INVALID_REQUEST, NO_TEXT_FOUND, OUTPUT_IS_INPUT, EngineError
from ..pdf_tools.common import file_size, get_path, normalize_ranges, open_pdf, same_file
from ..safe_output import OutputTransaction, PendingOutput


def pdf_to_text(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    source_path = get_path(args, "input")
    output = get_path(args, "output")
    markers = args.get("pageMarkers", True)
    if not isinstance(markers, bool):
        raise EngineError(INVALID_REQUEST, "'pageMarkers' must be true or false.")
    if same_file(source_path, output):
        raise EngineError(OUTPUT_IS_INPUT, "The text file must not replace the PDF.")

    with OutputTransaction(ctx) as transaction, open_pdf(source_path) as document:
        if args.get("ranges") is None:
            pages = list(range(1, document.page_count + 1))
        else:
            ranges = normalize_ranges(args["ranges"], document.page_count)
            pages = [number for start, end in ranges for number in range(start, end + 1)]

        temp = transaction.new_temp(output)
        found_text = False
        # Written page by page, so memory use does not depend on the size of the document.
        with open(temp, "w", encoding="utf-8") as handle:
            for step, number in enumerate(pages, start=1):
                ctx.check_cancelled()
                text = document.load_page(number - 1).get_text("text", sort=True).strip()
                found_text = found_text or text != ""
                if markers:
                    handle.write(f"----- Page {number} -----\n")
                handle.write(f"{text}\n\n")
                ctx.progress(step, len(pages) + 1)

        if not found_text:
            raise EngineError(
                NO_TEXT_FOUND,
                "This PDF has no selectable text. It may be a scan or a set of pictures, "
                "which needs OCR. OCR is not available yet.",
            )

        (final,) = transaction.commit([PendingOutput(temp, output, kind="text")], overwrite=True)
        ctx.progress(len(pages) + 1, len(pages) + 1)

    return {"outputPaths": [str(final)], "pageCount": len(pages), "sizeBytes": file_size(final)}
