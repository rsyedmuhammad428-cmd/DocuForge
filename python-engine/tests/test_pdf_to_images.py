from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from docuforge_engine import errors
from docuforge_engine.convert.pdf_to_images import pdf_to_images
from docuforge_engine.errors import EngineError

from .conftest import leftover_temp_files


@pytest.fixture
def out(tmp_path):
    folder = tmp_path / "out"
    folder.mkdir()
    return folder


def run(source, out, make_ctx, **args):
    base = {"input": str(source), "outputDir": str(out), "format": "png", "dpi": 100}
    return pdf_to_images({**base, **args}, make_ctx())


def test_one_numbered_png_per_page(make_pdf, out, make_ctx):
    result = run(make_pdf("doc", 3), out, make_ctx)
    names = sorted(Path(p).name for p in result["outputPaths"])
    assert names == ["doc_page_1.png", "doc_page_2.png", "doc_page_3.png"]
    with Image.open(result["outputPaths"][0]) as image:
        assert image.format == "PNG"
        assert abs(image.width - round(595 * 100 / 72)) <= 1  # A4 width at 100 dpi


def test_page_numbers_are_padded_for_long_documents(make_pdf, out, make_ctx):
    result = run(make_pdf("long", 10), out, make_ctx, ranges=[[2, 2], [10, 10]])
    assert sorted(Path(p).name for p in result["outputPaths"]) == ["long_page_02.png", "long_page_10.png"]


def test_jpeg_output(make_pdf, out, make_ctx):
    result = run(make_pdf("doc", 1), out, make_ctx, format="jpeg")
    assert result["outputPaths"][0].endswith(".jpg")
    with Image.open(result["outputPaths"][0]) as image:
        assert image.format == "JPEG"


def test_a_page_range_limits_the_output(make_pdf, out, make_ctx):
    result = run(make_pdf("doc", 5), out, make_ctx, ranges=[[2, 3]])
    assert len(result["outputPaths"]) == 2


@pytest.mark.parametrize(
    ("args", "code"),
    [
        ({"dpi": 71}, errors.INVALID_REQUEST),
        ({"dpi": 301}, errors.INVALID_REQUEST),
        ({"format": "bmp"}, errors.INVALID_REQUEST),
        ({"ranges": [[1, 9]]}, errors.INVALID_PAGE_RANGE),
        ({"ranges": [[1, 2], [2, 3]]}, errors.INVALID_PAGE_RANGE),
    ],
)
def test_invalid_options_are_rejected(make_pdf, out, make_ctx, args, code):
    with pytest.raises(EngineError) as error:
        run(make_pdf("doc", 3), out, make_ctx, **args)
    assert error.value.code == code
    assert list(out.iterdir()) == []


def test_existing_images_are_never_overwritten(make_pdf, out, make_ctx):
    (out / "doc_page_1.png").write_bytes(b"keep me")
    result = run(make_pdf("doc", 1), out, make_ctx)
    assert (out / "doc_page_1.png").read_bytes() == b"keep me"
    assert result["outputPaths"][0].endswith("doc_page_1 (2).png")


def test_cancel_removes_everything(make_pdf, out, make_ctx):
    with pytest.raises(EngineError) as error:
        pdf_to_images(
            {"input": str(make_pdf("doc", 3)), "outputDir": str(out), "format": "png", "dpi": 100},
            make_ctx(cancelled=True),
        )
    assert error.value.code == errors.CANCELLED
    assert list(out.iterdir()) == []
    assert leftover_temp_files(out) == []


def test_a_page_that_would_be_enormous_is_refused(tmp_path, out, make_ctx):
    import pymupdf

    path = tmp_path / "poster.pdf"
    with pymupdf.open() as document:
        document.new_page(width=14400, height=14400)
        document.save(path)
    with pytest.raises(EngineError) as error:
        run(path, out, make_ctx, dpi=300)
    assert error.value.code == errors.IMAGE_TOO_LARGE
    assert list(out.iterdir()) == []
