from __future__ import annotations

import pymupdf
import pytest

from docuforge_engine import errors
from docuforge_engine.errors import EngineError
from docuforge_engine.pdf_tools.compress import compress

from .conftest import file_hash, leftover_temp_files, page_texts


def run(source, output, make_ctx, preset):
    return compress({"input": str(source), "output": str(output), "preset": preset}, make_ctx())


def test_balanced_makes_an_image_heavy_pdf_much_smaller(tmp_path, make_photo_pdf, make_ctx):
    source = make_photo_pdf()
    output = tmp_path / "small.pdf"
    result = run(source, output, make_ctx, "balanced")

    assert result["originalBytes"] == source.stat().st_size
    assert result["sizeBytes"] == output.stat().st_size
    assert result["sizeBytes"] < result["originalBytes"] * 0.7
    assert result["pageCount"] == 1


def test_smallest_is_no_larger_than_balanced(tmp_path, make_photo_pdf, make_ctx):
    source = make_photo_pdf()
    balanced = run(source, tmp_path / "b.pdf", make_ctx, "balanced")
    smallest = run(source, tmp_path / "s.pdf", make_ctx, "smallest")
    assert smallest["sizeBytes"] <= balanced["sizeBytes"]


def test_text_and_page_count_survive_compression(tmp_path, make_photo_pdf, make_ctx):
    source = make_photo_pdf()
    output = tmp_path / "small.pdf"
    run(source, output, make_ctx, "smallest")
    assert page_texts(output) == ["Quarterly report"]
    with pymupdf.open(output) as document:
        assert document.page_count == 1


def test_the_original_is_never_modified(tmp_path, make_photo_pdf, make_ctx):
    source = make_photo_pdf()
    before = file_hash(source)
    run(source, tmp_path / "small.pdf", make_ctx, "balanced")
    assert file_hash(source) == before


def test_an_already_compact_pdf_is_reported_not_saved(tmp_path, make_pdf, make_ctx):
    # The first pass tidies the file. A second pass has nothing left to save.
    first = tmp_path / "first.pdf"
    run(make_pdf("tiny", 1), first, make_ctx, "light")

    second = tmp_path / "second.pdf"
    with pytest.raises(EngineError) as error:
        run(first, second, make_ctx, "light")
    assert error.value.code == errors.NO_SIZE_GAIN
    assert "already compact" in error.value.message
    assert not second.exists()
    assert leftover_temp_files(tmp_path) == []


def test_unknown_preset_and_same_file_are_rejected(tmp_path, make_photo_pdf, make_ctx):
    source = make_photo_pdf()
    with pytest.raises(EngineError) as error:
        run(source, tmp_path / "o.pdf", make_ctx, "extreme")
    assert error.value.code == errors.INVALID_REQUEST
    with pytest.raises(EngineError) as error:
        run(source, source, make_ctx, "balanced")
    assert error.value.code == errors.OUTPUT_IS_INPUT


def test_cancel_leaves_nothing_behind(tmp_path, make_photo_pdf, make_ctx):
    source = make_photo_pdf()
    output = tmp_path / "o.pdf"
    with pytest.raises(EngineError) as error:
        compress(
            {"input": str(source), "output": str(output), "preset": "balanced"},
            make_ctx(cancelled=True),
        )
    assert error.value.code == errors.CANCELLED
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []
