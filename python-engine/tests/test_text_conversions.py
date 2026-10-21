from __future__ import annotations

import codecs

import pymupdf
import pytest

from docuforge_engine import errors
from docuforge_engine.convert import text_to_pdf as text_to_pdf_module
from docuforge_engine.convert.pdf_to_text import pdf_to_text
from docuforge_engine.convert.text_to_pdf import read_text, text_to_pdf
from docuforge_engine.errors import EngineError

from .conftest import leftover_temp_files


# ---- PDF to text ----


def extract(source, output, make_ctx, **args):
    return pdf_to_text({"input": str(source), "output": str(output), **args}, make_ctx())


def test_text_is_extracted_with_page_markers(tmp_path, make_pdf, make_ctx):
    output = tmp_path / "out.txt"
    result = extract(make_pdf("doc", 2), output, make_ctx)
    text = output.read_text(encoding="utf-8")
    assert "----- Page 1 -----" in text and "doc-1" in text
    assert text.index("doc-1") < text.index("----- Page 2 -----") < text.index("doc-2")
    assert result["pageCount"] == 2


def test_markers_can_be_turned_off_and_pages_selected(tmp_path, make_pdf, make_ctx):
    output = tmp_path / "out.txt"
    extract(make_pdf("doc", 4), output, make_ctx, pageMarkers=False, ranges=[[2, 3]])
    text = output.read_text(encoding="utf-8")
    assert "Page" not in text and "doc-2" in text and "doc-3" in text and "doc-1" not in text


def test_non_english_text_survives(tmp_path, make_ctx):
    source = tmp_path / "ru.pdf"
    with pymupdf.open() as document:
        document.new_page().insert_text((72, 72), "Привет мир", fontname="helv")
        document.save(source)
    # The base-14 font cannot draw Cyrillic, so build the page with the HTML engine instead.
    story = pymupdf.Story("<p>Привет мир café</p>")
    writer = pymupdf.DocumentWriter(str(source))
    device = writer.begin_page(pymupdf.paper_rect("a4"))
    story.place(pymupdf.paper_rect("a4") + (54, 54, -54, -54))
    story.draw(device)
    writer.end_page()
    writer.close()
    output = tmp_path / "out.txt"
    extract(source, output, make_ctx, pageMarkers=False)
    assert "Привет мир café" in output.read_text(encoding="utf-8")


def test_a_scanned_pdf_has_no_text_and_nothing_is_saved(tmp_path, make_photo_pdf, make_ctx):
    # Remove the text layer: a page that is only a picture.
    source = tmp_path / "scan.pdf"
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_image(pymupdf.Rect(0, 0, 200, 200), pixmap=pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 50, 50), False))
        document.save(source)
    output = tmp_path / "out.txt"
    with pytest.raises(EngineError) as error:
        extract(source, output, make_ctx)
    assert error.value.code == errors.NO_TEXT_FOUND
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []


def test_pdf_to_text_validates_its_input(tmp_path, make_pdf, make_ctx):
    source = make_pdf("doc", 2)
    with pytest.raises(EngineError) as error:
        extract(source, tmp_path / "o.txt", make_ctx, ranges=[[1, 9]])
    assert error.value.code == errors.INVALID_PAGE_RANGE
    with pytest.raises(EngineError) as error:
        extract(source, source, make_ctx)
    assert error.value.code == errors.OUTPUT_IS_INPUT


# ---- text to PDF ----


def convert(source, output, make_ctx):
    return text_to_pdf({"input": str(source), "output": str(output)}, make_ctx())


def test_plain_text_becomes_a_pdf(tmp_path, make_ctx):
    source = tmp_path / "note.txt"
    source.write_text("First line\n\n    indented line\nLast line\n", encoding="utf-8")
    output = tmp_path / "note.pdf"
    result = convert(source, output, make_ctx)

    assert result["pageCount"] == 1
    with pymupdf.open(output) as document:
        text = document[0].get_text()
        assert "First line" in text and "indented line" in text and "Last line" in text
        assert document[0].rect.width == pytest.approx(595, abs=1)  # A4


def test_long_text_flows_onto_more_pages(tmp_path, make_ctx):
    source = tmp_path / "long.txt"
    source.write_text("\n".join(f"Line number {n}" for n in range(300)), encoding="utf-8")
    result = convert(source, tmp_path / "long.pdf", make_ctx)
    assert result["pageCount"] >= 4
    with pymupdf.open(tmp_path / "long.pdf") as document:
        assert "Line number 299" in document[document.page_count - 1].get_text()


def test_html_characters_are_shown_as_text(tmp_path, make_ctx):
    source = tmp_path / "code.txt"
    source.write_text("if a < b && c > d: <b>bold</b>", encoding="utf-8")
    convert(source, tmp_path / "code.pdf", make_ctx)
    with pymupdf.open(tmp_path / "code.pdf") as document:
        assert "a < b && c > d: <b>bold</b>" in document[0].get_text()


def test_urdu_text_is_drawn_with_an_arabic_font(tmp_path, make_ctx):
    source = tmp_path / "urdu.txt"
    source.write_text("اردو زبان میں لکھا ہوا متن\nEnglish line", encoding="utf-8")
    output = tmp_path / "urdu.pdf"
    convert(source, output, make_ctx)
    with pymupdf.open(output) as document:
        fonts = " ".join(font[3] for font in document[0].get_fonts())
        text = document[0].get_text()
    assert "Arabic" in fonts or "Naskh" in fonts
    assert any("\u0600" <= c <= "\u06ff" or "\ufb50" <= c <= "\ufeff" for c in text)
    assert "English line" in text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("café".encode("utf-8"), "café"),
        (codecs.BOM_UTF8 + "café".encode("utf-8"), "café"),
        ("café".encode("utf-16"), "café"),  # Notepad's "Unicode" format, with a BOM
        ("café".encode("cp1252"), "café"),  # an older Windows text file
    ],
)
def test_common_text_encodings_are_read(tmp_path, raw, expected):
    path = tmp_path / "t.txt"
    path.write_bytes(raw)
    assert read_text(path) == expected


def test_too_much_text_is_refused(tmp_path, make_ctx, monkeypatch):
    monkeypatch.setattr(text_to_pdf_module, "_MAX_CHARACTERS", 10)
    source = tmp_path / "big.txt"
    source.write_text("x" * 11)
    with pytest.raises(EngineError) as error:
        convert(source, tmp_path / "o.pdf", make_ctx)
    assert error.value.code == errors.TEXT_TOO_LARGE


def test_text_to_pdf_input_errors_and_cancel(tmp_path, make_ctx):
    source = tmp_path / "a.txt"
    source.write_text("hello")
    with pytest.raises(EngineError) as error:
        convert(tmp_path / "missing.txt", tmp_path / "o.pdf", make_ctx)
    assert error.value.code == errors.INPUT_NOT_FOUND
    with pytest.raises(EngineError) as error:
        convert(source, source, make_ctx)
    assert error.value.code == errors.OUTPUT_IS_INPUT

    output = tmp_path / "c.pdf"
    with pytest.raises(EngineError) as error:
        text_to_pdf({"input": str(source), "output": str(output)}, make_ctx(cancelled=True))
    assert error.value.code == errors.CANCELLED
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []
