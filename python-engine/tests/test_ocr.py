from __future__ import annotations

import tempfile
from pathlib import Path

import pymupdf
import pytest

from docuforge_engine import errors
from docuforge_engine.convert import ocr as ocr_module
from docuforge_engine.convert.document_to_pdf import tools_status
from docuforge_engine.convert.ocr import ocr
from docuforge_engine.errors import EngineError
from docuforge_engine.tools import find_tesseract, tesseract_languages

from .conftest import leftover_temp_files

needs_tesseract = pytest.mark.skipif(find_tesseract() is None, reason="Tesseract is not installed")

INVOICE = "Invoice 2026-0412\nTotal due: 1,250.00 USD\nThank you for your business."


def render_text_page(text: str) -> pymupdf.Pixmap:
    with pymupdf.open() as source:
        page = source.new_page()
        page.insert_textbox(pymupdf.Rect(72, 72, 520, 400), text, fontsize=16)
        return page.get_pixmap(dpi=200)


@pytest.fixture
def scanned_pdf(tmp_path):
    """A PDF that is only a picture of a page of text: it has no selectable text at all."""
    path = tmp_path / "scan.pdf"
    with pymupdf.open() as scan:
        page = scan.new_page(width=595, height=842)
        page.insert_image(page.rect, pixmap=render_text_page(INVOICE))
        scan.save(path)
    return path


def run(source, output, make_ctx, **args):
    base = {"input": str(source), "output": str(output), "format": "text", "languages": ["eng"], "dpi": 300}
    return ocr({**base, **args}, make_ctx())


@needs_tesseract
def test_a_scanned_pdf_becomes_text(tmp_path, scanned_pdf, make_ctx):
    output = tmp_path / "scan.txt"
    result = run(scanned_pdf, output, make_ctx)

    text = output.read_text(encoding="utf-8")
    assert "Invoice 2026-0412" in text and "1,250.00" in text and "Thank you" in text
    assert "----- Page 1 -----" in text
    assert "Invoice 2026-0412" in result["preview"]
    assert result["pageCount"] == 1
    assert "Recognized 1 page" in result["note"] and "check the result" in result["note"].lower()
    assert leftover_temp_files(tmp_path) == []


@needs_tesseract
def test_pages_that_already_have_text_are_not_recognized_again(tmp_path, make_ctx):
    path = tmp_path / "mixed.pdf"
    with pymupdf.open() as document:
        document.new_page().insert_text((72, 72), "This page already has real selectable text on it.")
        page = document.new_page(width=595, height=842)
        page.insert_image(page.rect, pixmap=render_text_page(INVOICE))
        document.save(path)

    result = run(path, tmp_path / "mixed.txt", make_ctx, pageMarkers=False)
    text = (tmp_path / "mixed.txt").read_text(encoding="utf-8")
    assert "already has real selectable text" in text and "Invoice 2026-0412" in text
    assert "Recognized 1 page" in result["note"] and "text already in 1 page" in result["note"]

    result = run(path, tmp_path / "all.txt", make_ctx, useExistingText=False)
    assert "Recognized 2 pages" in result["note"]


@needs_tesseract
def test_a_searchable_pdf_keeps_the_picture_and_gains_a_text_layer(tmp_path, scanned_pdf, make_ctx):
    output = tmp_path / "searchable.pdf"
    result = run(scanned_pdf, output, make_ctx, format="pdf")

    with pymupdf.open(output) as document:
        assert document.page_count == 1
        assert "Invoice 2026-0412" in document[0].get_text()
        assert len(document[0].get_images()) >= 1
        assert (round(document[0].rect.width), round(document[0].rect.height)) == (595, 842)
    assert "preview" not in result
    assert leftover_temp_files(tmp_path) == []


@needs_tesseract
def test_a_pdf_page_range_is_respected(tmp_path, make_ctx):
    path = tmp_path / "three.pdf"
    with pymupdf.open() as document:
        for number in (1, 2, 3):
            page = document.new_page(width=595, height=842)
            page.insert_image(page.rect, pixmap=render_text_page(f"Page marker {number}\nSecond line here."))
        document.save(path)
    result = run(path, tmp_path / "out.txt", make_ctx, ranges=[[2, 2]])
    text = (tmp_path / "out.txt").read_text(encoding="utf-8")
    assert "marker 2" in text and "marker 1" not in text and "marker 3" not in text
    assert result["pageCount"] == 1


@needs_tesseract
def test_an_image_file_can_be_recognized(tmp_path, make_ctx):
    image = tmp_path / "receipt.png"
    render_text_page(INVOICE).save(image)

    result = run(image, tmp_path / "receipt.txt", make_ctx)
    assert "Invoice 2026-0412" in (tmp_path / "receipt.txt").read_text(encoding="utf-8")
    assert result["pageCount"] == 1

    searchable = tmp_path / "receipt.pdf"
    run(image, searchable, make_ctx, format="pdf")
    with pymupdf.open(searchable) as document:
        assert "Invoice" in document[0].get_text()


@needs_tesseract
def test_a_blank_page_reports_no_text_and_saves_nothing(tmp_path, make_ctx):
    blank = tmp_path / "blank.pdf"
    with pymupdf.open() as document:
        page = document.new_page(width=595, height=842)
        page.insert_image(page.rect, pixmap=pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 400, 560), False))
        document.save(blank)
    output = tmp_path / "blank.txt"
    with pytest.raises(EngineError) as error:
        run(blank, output, make_ctx)
    assert error.value.code == errors.NO_TEXT_FOUND
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []


@needs_tesseract
@pytest.mark.parametrize(
    ("languages", "code"),
    [
        (["xx_not_installed"], errors.LANGUAGE_NOT_INSTALLED),
        (["eng", "zzz"], errors.LANGUAGE_NOT_INSTALLED),
        (["eng; rm -rf /"], errors.INVALID_REQUEST),
        (["--help"], errors.INVALID_REQUEST),
        ([], errors.INVALID_REQUEST),
        (["eng"] * 6, errors.INVALID_REQUEST),
        ("eng", errors.INVALID_REQUEST),
    ],
)
def test_languages_are_validated_before_anything_runs(tmp_path, scanned_pdf, make_ctx, languages, code):
    with pytest.raises(EngineError) as error:
        run(scanned_pdf, tmp_path / "o.txt", make_ctx, languages=languages)
    assert error.value.code == code


@pytest.mark.parametrize(
    "args", [{"dpi": 149}, {"dpi": 401}, {"format": "docx"}, {"useExistingText": "yes"}]
)
def test_options_are_validated(tmp_path, scanned_pdf, make_ctx, args):
    with pytest.raises(EngineError) as error:
        run(scanned_pdf, tmp_path / "o.txt", make_ctx, **args)
    assert error.value.code == errors.INVALID_REQUEST


def test_a_missing_tesseract_is_explained(tmp_path, scanned_pdf, make_ctx, monkeypatch):
    monkeypatch.setattr(ocr_module, "find_tesseract", lambda: None)
    with pytest.raises(EngineError) as error:
        run(scanned_pdf, tmp_path / "o.txt", make_ctx)
    assert error.value.code == errors.TOOL_NOT_FOUND
    assert "Tesseract" in error.value.message


@needs_tesseract
def test_the_original_is_protected_and_cancel_cleans_up(tmp_path, scanned_pdf, make_ctx):
    with pytest.raises(EngineError) as error:
        run(scanned_pdf, scanned_pdf, make_ctx)
    assert error.value.code == errors.OUTPUT_IS_INPUT

    before = set(Path(tempfile.gettempdir()).glob("docuforge-ocr-*"))
    output = tmp_path / "o.txt"
    with pytest.raises(EngineError) as error:
        ocr(
            {"input": str(scanned_pdf), "output": str(output), "format": "text", "languages": ["eng"]},
            make_ctx(cancelled=True),
        )
    assert error.value.code == errors.CANCELLED
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []
    assert set(Path(tempfile.gettempdir()).glob("docuforge-ocr-*")) == before


@needs_tesseract
def test_tools_status_lists_the_installed_languages(make_ctx):
    status = tools_status({}, make_ctx())
    assert status["tesseract"]["found"] is True
    assert "eng" in status["tesseract"]["languages"]
    assert "osd" not in status["tesseract"]["languages"]
    assert "eng" in tesseract_languages(find_tesseract())


def test_tools_status_when_tesseract_is_missing(make_ctx, monkeypatch):
    from docuforge_engine.convert import document_to_pdf as module

    monkeypatch.setattr(module, "find_tesseract", lambda: None)
    assert tools_status({}, make_ctx())["tesseract"] == {"found": False, "languages": []}
