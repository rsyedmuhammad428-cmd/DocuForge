"""Merge several PDFs, in the given order, into one new PDF."""

from __future__ import annotations

from typing import Any

import pymupdf

from ..context import JobContext
from ..errors import INVALID_REQUEST, OUTPUT_IS_INPUT, EngineError
from ..safe_output import OutputTransaction, PendingOutput
from .common import file_size, get_path, open_pdf, same_file
from pathlib import Path


def merge(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    raw_inputs = args.get("inputs")
    if not isinstance(raw_inputs, list) or len(raw_inputs) < 2:
        raise EngineError(INVALID_REQUEST, "Merging needs at least two PDF files.")
    inputs = [get_path({"p": value}, "p") for value in raw_inputs]
    output = get_path(args, "output")

    if any(same_file(output, source) for source in inputs):
        raise EngineError(OUTPUT_IS_INPUT, "The output file must be different from the input files.")

    total_steps = len(inputs) + 1  # one per input, plus saving
    total_pages = 0

    with OutputTransaction(ctx) as transaction:
        temp = transaction.new_temp(output)
        with pymupdf.open() as merged:
            for number, source_path in enumerate(inputs, start=1):
                ctx.check_cancelled()
                # Each input is opened, copied, and closed before the next one is read,
                # so memory use does not grow with the number of inputs.
                with open_pdf(source_path) as source:
                    merged.insert_pdf(source)
                    total_pages += source.page_count
                ctx.progress(number, total_steps)
            ctx.check_cancelled()
            merged.save(temp, garbage=3, deflate=True)
        ctx.progress(total_steps, total_steps)

        (final,) = transaction.commit([PendingOutput(temp, output, total_pages)], overwrite=True)

    return {"outputPaths": [str(final)], "pageCount": total_pages, "sizeBytes": file_size(final)}
