from __future__ import annotations

import pytest

from docuforge_engine import errors
from docuforge_engine.errors import EngineError
from docuforge_engine.pdf_tools.merge import merge

from .conftest import file_hash, leftover_temp_files, page_texts


def test_merges_in_the_requested_order(tmp_path, make_pdf, make_ctx):
    a, b, c = make_pdf("a", 2), make_pdf("b", 1), make_pdf("c", 3)
    output = tmp_path / "out" / "merged.pdf"
    output.parent.mkdir()

    result = merge({"inputs": [str(c), str(a), str(b)], "output": str(output)}, make_ctx())

    assert page_texts(output) == ["c-1", "c-2", "c-3", "a-1", "a-2", "b-1"]
    assert result["pageCount"] == 6
    assert result["outputPaths"] == [str(output)]
    assert result["sizeBytes"] == output.stat().st_size


def test_inputs_are_not_modified(tmp_path, make_pdf, make_ctx):
    a, b = make_pdf("a", 2), make_pdf("b", 2)
    before = (file_hash(a), file_hash(b))
    merge({"inputs": [str(a), str(b)], "output": str(tmp_path / "m.pdf")}, make_ctx())
    assert (file_hash(a), file_hash(b)) == before


def test_rejects_output_that_is_an_input(make_pdf, make_ctx):
    a, b = make_pdf("a", 1), make_pdf("b", 1)
    with pytest.raises(EngineError) as error:
        merge({"inputs": [str(a), str(b)], "output": str(a)}, make_ctx())
    assert error.value.code == errors.OUTPUT_IS_INPUT


def test_needs_at_least_two_inputs(tmp_path, make_pdf, make_ctx):
    a = make_pdf("a", 1)
    with pytest.raises(EngineError) as error:
        merge({"inputs": [str(a)], "output": str(tmp_path / "m.pdf")}, make_ctx())
    assert error.value.code == errors.INVALID_REQUEST


@pytest.mark.parametrize(
    ("kind", "code"),
    [("encrypted", errors.PDF_ENCRYPTED), ("corrupt", errors.PDF_CORRUPT), ("missing", errors.INPUT_NOT_FOUND)],
)
def test_bad_inputs_fail_clearly_and_leave_nothing_behind(tmp_path, make_pdf, make_ctx, kind, code):
    good = make_pdf("good", 1)
    if kind == "encrypted":
        bad = make_pdf("locked", 1, password="secret")
    elif kind == "corrupt":
        bad = tmp_path / "broken.pdf"
        bad.write_bytes(b"this is not a pdf at all")
    else:
        bad = tmp_path / "missing.pdf"
    output = tmp_path / "merged.pdf"

    with pytest.raises(EngineError) as error:
        merge({"inputs": [str(good), str(bad)], "output": str(output)}, make_ctx())

    assert error.value.code == code
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []


def test_cancelled_job_leaves_nothing_behind(tmp_path, make_pdf, make_ctx):
    a, b = make_pdf("a", 1), make_pdf("b", 1)
    output = tmp_path / "merged.pdf"
    with pytest.raises(EngineError) as error:
        merge({"inputs": [str(a), str(b)], "output": str(output)}, make_ctx(cancelled=True))
    assert error.value.code == errors.CANCELLED
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []


def test_missing_output_folder_is_reported(tmp_path, make_pdf, make_ctx):
    a, b = make_pdf("a", 1), make_pdf("b", 1)
    with pytest.raises(EngineError) as error:
        merge({"inputs": [str(a), str(b)], "output": str(tmp_path / "nope" / "m.pdf")}, make_ctx())
    assert error.value.code == errors.OUTPUT_WRITE_FAILED
