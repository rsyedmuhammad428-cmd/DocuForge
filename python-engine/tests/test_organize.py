from __future__ import annotations

import pymupdf
import pytest

from docuforge_engine import errors
from docuforge_engine.errors import EngineError
from docuforge_engine.pdf_tools.organize import organize_export

from .conftest import file_hash, leftover_temp_files, page_texts


@pytest.fixture
def source(make_pdf):
    return make_pdf("doc", 5)


def export(source, output, make_ctx, pages):
    return organize_export({"input": str(source), "output": str(output), "pages": pages}, make_ctx())


def test_reorder_rotate_and_delete(tmp_path, source, make_ctx):
    output = tmp_path / "result.pdf"
    # Keep pages 4, 1 and 3 (0-based 3, 0, 2). Rotate the first kept page by 90 degrees.
    result = export(
        source,
        output,
        make_ctx,
        [{"index": 3, "rotation": 90}, {"index": 0, "rotation": 0}, {"index": 2, "rotation": 0}],
    )
    assert page_texts(output) == ["doc-4", "doc-1", "doc-3"]
    assert result["pageCount"] == 3
    with pymupdf.open(output) as document:
        assert [page.rotation for page in document] == [90, 0, 0]


def test_rotation_adds_to_existing_rotation(tmp_path, make_ctx):
    path = tmp_path / "rotated.pdf"
    with pymupdf.open() as document:
        page = document.new_page()
        page.set_rotation(90)
        document.save(path)
    output = tmp_path / "out.pdf"
    export(path, output, make_ctx, [{"index": 0, "rotation": 270}])
    with pymupdf.open(output) as result:
        assert result[0].rotation == 0  # (90 + 270) % 360


def test_source_is_not_modified(tmp_path, source, make_ctx):
    before = file_hash(source)
    export(source, tmp_path / "o.pdf", make_ctx, [{"index": 1, "rotation": 180}])
    assert file_hash(source) == before


@pytest.mark.parametrize(
    ("pages", "code"),
    [
        ([], errors.INVALID_PAGE_RANGE),
        ([{"index": 5, "rotation": 0}], errors.INVALID_PAGE_RANGE),
        ([{"index": -1, "rotation": 0}], errors.INVALID_PAGE_RANGE),
        ([{"index": 1, "rotation": 0}, {"index": 1, "rotation": 0}], errors.INVALID_PAGE_RANGE),
        ([{"index": 1, "rotation": 45}], errors.INVALID_REQUEST),
        (["x"], errors.INVALID_REQUEST),
    ],
)
def test_invalid_page_lists_are_rejected(tmp_path, source, make_ctx, pages, code):
    output = tmp_path / "o.pdf"
    with pytest.raises(EngineError) as error:
        export(source, output, make_ctx, pages)
    assert error.value.code == code
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []


def test_output_cannot_be_the_source(source, make_ctx):
    with pytest.raises(EngineError) as error:
        export(source, source, make_ctx, [{"index": 0, "rotation": 0}])
    assert error.value.code == errors.OUTPUT_IS_INPUT
