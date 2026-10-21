"""Helpers shared by the PDF operations: opening files and validating arguments."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pymupdf

from ..errors import (
    INPUT_NOT_FOUND,
    INPUT_UNREADABLE,
    INVALID_PAGE_RANGE,
    INVALID_REQUEST,
    NOT_A_PDF,
    PDF_CORRUPT,
    PDF_ENCRYPTED,
    EngineError,
)


def get_path(args: dict[str, Any], key: str) -> Path:
    value = args.get(key)
    if not isinstance(value, str) or not value or not os.path.isabs(value):
        raise EngineError(INVALID_REQUEST, f"'{key}' must be an absolute path.")
    return Path(value)


def get_int(args: dict[str, Any], key: str, minimum: int = 1) -> int:
    value = args.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise EngineError(INVALID_REQUEST, f"'{key}' must be a whole number of at least {minimum}.")
    return value


def same_file(first: Path, second: Path) -> bool:
    """True if both paths point to the same file, even through different spellings."""
    try:
        if first.exists() and second.exists():
            return os.path.samefile(first, second)
    except OSError:
        pass
    return os.path.normcase(os.path.abspath(first)) == os.path.normcase(os.path.abspath(second))


def open_pdf(path: Path) -> pymupdf.Document:
    """Opens a readable, unencrypted PDF or raises an EngineError that explains what is wrong."""
    if not path.is_file():
        raise EngineError(INPUT_NOT_FOUND, f"The file '{path.name}' was not found.")
    try:
        document = pymupdf.open(path)
    except PermissionError as exc:
        raise EngineError(INPUT_UNREADABLE, f"The file '{path.name}' cannot be read.") from exc
    except (pymupdf.FileDataError, RuntimeError, ValueError) as exc:
        raise EngineError(PDF_CORRUPT, f"'{path.name}' is damaged or is not a valid PDF.") from exc
    except OSError as exc:
        raise EngineError(INPUT_UNREADABLE, f"The file '{path.name}' cannot be read.") from exc

    if not document.is_pdf:
        document.close()
        raise EngineError(NOT_A_PDF, f"'{path.name}' is not a PDF file.")
    if document.needs_pass:
        document.close()
        raise EngineError(
            PDF_ENCRYPTED,
            f"'{path.name}' is password protected. Remove the password first, then try again.",
        )
    if document.page_count == 0:
        document.close()
        raise EngineError(PDF_CORRUPT, f"'{path.name}' has no pages.")
    return document


def normalize_ranges(raw: object, page_count: int) -> list[tuple[int, int]]:
    """Validates one-based inclusive [start, end] pairs against the real page count.

    Ranges must be inside the document and must not overlap. Order is kept as given.
    """
    if not isinstance(raw, list) or not raw:
        raise EngineError(INVALID_PAGE_RANGE, "Enter at least one page or page range.")

    ranges: list[tuple[int, int]] = []
    used: set[int] = set()
    for item in raw:
        if (
            not isinstance(item, list)
            or len(item) != 2
            or not all(isinstance(n, int) and not isinstance(n, bool) for n in item)
        ):
            raise EngineError(INVALID_PAGE_RANGE, "A page range is not valid.")
        start, end = item
        if start < 1 or end < start:
            raise EngineError(INVALID_PAGE_RANGE, f"Page range {start}-{end} is not valid.")
        if end > page_count:
            raise EngineError(
                INVALID_PAGE_RANGE, f"Page {end} is outside the document, which has {page_count} pages."
            )
        pages = set(range(start, end + 1))
        if pages & used:
            raise EngineError(INVALID_PAGE_RANGE, "Page ranges must not overlap.")
        used |= pages
        ranges.append((start, end))
    return ranges


def file_size(path: Path) -> int:
    return path.stat().st_size
