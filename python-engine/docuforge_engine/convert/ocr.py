"""OCR: read the text of scanned PDFs and images with Tesseract (free, runs on this computer).

Two outputs:
  text  a UTF-8 .txt file
  pdf   a searchable PDF: the page pictures with an invisible text layer on top

For PDFs, pages that already contain real text can be used as they are (useExistingText), so only
pages that are pictures are recognized. Recognition is never perfect: it depends on the scan
quality, the language, and the script. Tesseract is called with an argument list, never a shell.
"""

from __future__ import annotations

import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

import pymupdf

from ..context import JobContext
from ..errors import (
    CONVERSION_FAILED,
    IMAGE_TOO_LARGE,
    INVALID_REQUEST,
    LANGUAGE_NOT_INSTALLED,
    NO_TEXT_FOUND,
    OUTPUT_IS_INPUT,
    TOOL_NOT_FOUND,
    EngineError,
)
from ..pdf_tools.common import file_size, get_path, normalize_ranges, open_pdf, same_file
from ..safe_output import OutputTransaction, PendingOutput
from ..subprocess_utils import run_cancellable
from ..tools import find_tesseract, tesseract_environment, tesseract_languages
from .images_to_pdf import _prepare

_LANGUAGE = re.compile(r"^[A-Za-z0-9_]{2,30}$")
_MIN_DPI, _MAX_DPI = 150, 400
_MAX_PIXELS = 80_000_000
_MIN_EXISTING_TEXT = 20  # a page with at least this many characters counts as "has text"
_PAGE_TIMEOUT = 180
_PREVIEW_CHARACTERS = 3000
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp"}

_NOT_FOUND = (
    "Tesseract OCR was not found. It is free: install it (the Tesseract documentation lists "
    "Windows installers), choose the languages you need, then try again."
)
_NOTE = (
    "Recognition is never perfect, especially with poor scans, small print or unusual fonts. "
    "Please check the result."
)


def _validated_languages(raw: object, installed: list[str]) -> list[str]:
    if not isinstance(raw, list) or not raw or len(raw) > 5:
        raise EngineError(INVALID_REQUEST, "Choose between 1 and 5 languages.")
    languages: list[str] = []
    for item in raw:
        if not isinstance(item, str) or not _LANGUAGE.match(item):
            raise EngineError(INVALID_REQUEST, "A language code is not valid.")
        if item not in installed:
            raise EngineError(
                LANGUAGE_NOT_INSTALLED,
                f"The language '{item}' is not installed for Tesseract. Install its language data, "
                "then try again.",
            )
        if item not in languages:
            languages.append(item)
    return languages


def _recognize(
    tesseract: Path, image: Path, languages: list[str], dpi: int, ctx: JobContext
) -> str:
    code, output = run_cancellable(
        [str(tesseract), str(image), "stdout", "-l", "+".join(languages), "--dpi", str(dpi), "--psm", "3"],
        ctx,
        timeout=_PAGE_TIMEOUT,
        capture_stdout=True,
        env=tesseract_environment(tesseract),
    )
    if code != 0:
        raise EngineError(CONVERSION_FAILED, "Tesseract could not read one of the pages.")
    return output.decode("utf-8", errors="replace").strip()


def _recognize_to_pdf(
    tesseract: Path, image: Path, base: Path, languages: list[str], dpi: int, ctx: JobContext
) -> Path:
    code, _ = run_cancellable(
        [str(tesseract), str(image), str(base), "-l", "+".join(languages), "--dpi", str(dpi), "--psm", "3", "pdf"],
        ctx,
        timeout=_PAGE_TIMEOUT,
        env=tesseract_environment(tesseract),
    )
    produced = base.with_suffix(".pdf")
    if code != 0 or not produced.is_file():
        raise EngineError(CONVERSION_FAILED, "Tesseract could not read one of the pages.")
    return produced


def ocr(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    source_path = get_path(args, "input")
    output = get_path(args, "output")
    output_format = args.get("format")
    if output_format not in ("text", "pdf"):
        raise EngineError(INVALID_REQUEST, "The output type must be text or pdf.")
    dpi = args.get("dpi", 300)
    if isinstance(dpi, bool) or not isinstance(dpi, int) or not _MIN_DPI <= dpi <= _MAX_DPI:
        raise EngineError(INVALID_REQUEST, f"The resolution must be between {_MIN_DPI} and {_MAX_DPI} dpi.")
    use_existing = args.get("useExistingText", True)
    markers = args.get("pageMarkers", True)
    if not isinstance(use_existing, bool) or not isinstance(markers, bool):
        raise EngineError(INVALID_REQUEST, "The options are not valid.")
    if same_file(source_path, output):
        raise EngineError(OUTPUT_IS_INPUT, "The result must be saved under a different name than the original.")

    tesseract = find_tesseract()
    if tesseract is None:
        raise EngineError(TOOL_NOT_FOUND, _NOT_FOUND)
    languages = _validated_languages(args.get("languages"), tesseract_languages(tesseract))

    work = Path(tempfile.mkdtemp(prefix="docuforge-ocr-"))
    try:
        if source_path.suffix.lower() in _IMAGE_SUFFIXES:
            return _ocr_image(tesseract, source_path, output, output_format, languages, dpi, markers, ctx, work)
        return _ocr_pdf(
            tesseract, source_path, output, output_format, languages, dpi, use_existing, markers,
            args.get("ranges"), ctx, work,
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _summary(
    final: Path, pages: int, recognized: int, existing: int, preview: str | None
) -> dict[str, Any]:
    parts = [f"Recognized {recognized} {'page' if recognized == 1 else 'pages'}"]
    if existing:
        parts.append(f"used the text already in {existing} {'page' if existing == 1 else 'pages'}")
    result: dict[str, Any] = {
        "outputPaths": [str(final)],
        "pageCount": pages,
        "sizeBytes": file_size(final),
        "note": f"{', '.join(parts)}. {_NOTE}",
    }
    if preview is not None:
        result["preview"] = preview[:_PREVIEW_CHARACTERS]
    return result


def _ocr_image(
    tesseract: Path, source: Path, output: Path, output_format: str, languages: list[str],
    dpi: int, markers: bool, ctx: JobContext, work: Path,
) -> dict[str, Any]:
    data, _, _ = _prepare(source)  # checks it is a readable image, applies EXIF rotation, flattens
    image = work / "image.png"
    image.write_bytes(data)
    ctx.progress(1, 3)
    ctx.check_cancelled()

    with OutputTransaction(ctx) as transaction:
        temp = transaction.new_temp(output)
        if output_format == "text":
            text = _recognize(tesseract, image, languages, dpi, ctx)
            if not text:
                raise EngineError(NO_TEXT_FOUND, "No text could be recognized in this image.")
            temp.write_text(f"{text}\n", encoding="utf-8")
            pending = PendingOutput(temp, output, kind="text")
            preview: str | None = text
        else:
            produced = _recognize_to_pdf(tesseract, image, work / "result", languages, dpi, ctx)
            with pymupdf.open(produced) as check:
                if not any(page.get_text().strip() for page in check):
                    raise EngineError(NO_TEXT_FOUND, "No text could be recognized in this image.")
            shutil.copyfile(produced, temp)
            pending = PendingOutput(temp, output, 1)
            preview = None
        ctx.progress(2, 3)
        (final,) = transaction.commit([pending], overwrite=True)
        ctx.progress(3, 3)
    return _summary(final, 1, 1, 0, preview)


def _ocr_pdf(
    tesseract: Path, source_path: Path, output: Path, output_format: str, languages: list[str],
    dpi: int, use_existing: bool, markers: bool, raw_ranges: object, ctx: JobContext, work: Path,
) -> dict[str, Any]:
    with OutputTransaction(ctx) as transaction, open_pdf(source_path) as document:
        if raw_ranges is None:
            pages = list(range(1, document.page_count + 1))
        else:
            ranges = normalize_ranges(raw_ranges, document.page_count)
            pages = [n for start, end in ranges for n in range(start, end + 1)]

        temp = transaction.new_temp(output)
        recognized = existing = 0
        found_text = False
        preview_parts: list[str] = []
        merged = pymupdf.open() if output_format == "pdf" else None
        handle = open(temp, "w", encoding="utf-8") if output_format == "text" else None

        try:
            for step, number in enumerate(pages, start=1):
                ctx.check_cancelled()
                page = document.load_page(number - 1)
                own_text = page.get_text("text", sort=True).strip()
                has_text = use_existing and len(own_text.replace(" ", "")) >= _MIN_EXISTING_TEXT

                if has_text:
                    existing += 1
                    page_text = own_text
                    if merged is not None:
                        merged.insert_pdf(document, from_page=number - 1, to_page=number - 1)
                else:
                    pixels = (page.rect.width * dpi / 72) * (page.rect.height * dpi / 72)
                    if pixels > _MAX_PIXELS:
                        raise EngineError(
                            IMAGE_TOO_LARGE,
                            f"Page {number} would be too large at {dpi} dpi. Choose a lower resolution.",
                        )
                    image = work / f"page{number}.png"
                    pixmap = page.get_pixmap(dpi=dpi, alpha=False)
                    pixmap.save(image, output="png")
                    del pixmap
                    recognized += 1
                    if merged is not None:
                        produced = _recognize_to_pdf(tesseract, image, work / f"out{number}", languages, dpi, ctx)
                        with pymupdf.open(produced) as part:
                            page_text = "".join(p.get_text() for p in part).strip()
                            merged.insert_pdf(part)
                        produced.unlink(missing_ok=True)
                    else:
                        page_text = _recognize(tesseract, image, languages, dpi, ctx)
                    image.unlink(missing_ok=True)

                found_text = found_text or page_text != ""
                if handle is not None:
                    if markers:
                        handle.write(f"----- Page {number} -----\n")
                    handle.write(f"{page_text}\n\n")
                    if sum(len(part) for part in preview_parts) < _PREVIEW_CHARACTERS:
                        preview_parts.append(f"{page_text}\n\n")
                ctx.progress(step, len(pages) + 1)

            if not found_text:
                raise EngineError(
                    NO_TEXT_FOUND,
                    "No text could be recognized. Check that you chose the right language and that the "
                    "scan is readable.",
                )
            if handle is not None:
                handle.close()
                handle = None
                pending = PendingOutput(temp, output, kind="text")
            else:
                assert merged is not None
                merged.save(temp, garbage=3, deflate=True)
                pending = PendingOutput(temp, output, len(pages))
        finally:
            if handle is not None:
                handle.close()
            if merged is not None:
                merged.close()

        (final,) = transaction.commit([pending], overwrite=True)
        ctx.progress(len(pages) + 1, len(pages) + 1)

    preview = "".join(preview_parts).strip() if output_format == "text" else None
    return _summary(final, len(pages), recognized, existing, preview)
