from __future__ import annotations

import pytest

from docuforge_engine import errors
from docuforge_engine.errors import EngineError
from docuforge_engine.pdf_tools.split import split

from .conftest import file_hash, leftover_temp_files, page_texts


@pytest.fixture
def source(make_pdf):
    return make_pdf("doc", 7)


@pytest.fixture
def out(tmp_path):
    folder = tmp_path / "out"
    folder.mkdir()
    return folder


def run(source, out, make_ctx, **args):
    return split({"input": str(source), "outputDir": str(out), **args}, make_ctx())


def test_extract_keeps_the_typed_order(source, out, make_ctx):
    result = run(source, out, make_ctx, mode="extract", ranges=[[5, 6], [1, 2]])
    assert result["fileCount"] == 1
    assert page_texts(result["outputPaths"][0]) == ["doc-5", "doc-6", "doc-1", "doc-2"]


def test_ranges_create_one_file_per_range(source, out, make_ctx):
    result = run(source, out, make_ctx, mode="ranges", ranges=[[1, 3], [5, 5]])
    names = sorted(p.rsplit("/", 1)[-1] for p in result["outputPaths"])
    assert names == ["doc_page_5.pdf", "doc_pages_1-3.pdf"]
    by_name = {p.rsplit("/", 1)[-1]: p for p in result["outputPaths"]}
    assert page_texts(by_name["doc_pages_1-3.pdf"]) == ["doc-1", "doc-2", "doc-3"]
    assert page_texts(by_name["doc_page_5.pdf"]) == ["doc-5"]


def test_each_page_gets_its_own_file(source, out, make_ctx):
    result = run(source, out, make_ctx, mode="each")
    assert result["fileCount"] == 7
    assert len(list(out.glob("*.pdf"))) == 7


def test_chunks_handle_a_short_last_chunk(source, out, make_ctx):
    result = run(source, out, make_ctx, mode="chunks", chunkSize=3)
    assert result["fileCount"] == 3
    last = [p for p in result["outputPaths"] if p.endswith("doc_page_7.pdf")]
    assert len(last) == 1 and page_texts(last[0]) == ["doc-7"]


@pytest.mark.parametrize(
    "ranges",
    [[], [[0, 2]], [[3, 2]], [[6, 9]], [[1, 4], [4, 5]], "1-3", [[1]], [["a", 2]]],
)
def test_invalid_ranges_are_rejected(source, out, make_ctx, ranges):
    with pytest.raises(EngineError) as error:
        run(source, out, make_ctx, mode="ranges", ranges=ranges)
    assert error.value.code == errors.INVALID_PAGE_RANGE
    assert list(out.iterdir()) == []


def test_existing_files_are_never_overwritten(source, out, make_ctx):
    existing = out / "doc_page_5.pdf"
    existing.write_bytes(b"keep me")
    result = run(source, out, make_ctx, mode="ranges", ranges=[[5, 5]])
    assert existing.read_bytes() == b"keep me"
    assert result["outputPaths"][0].endswith("doc_page_5 (2).pdf")


def test_source_is_not_modified(source, out, make_ctx):
    before = file_hash(source)
    run(source, out, make_ctx, mode="each")
    assert file_hash(source) == before


def test_cancel_removes_everything(source, out, make_ctx):
    with pytest.raises(EngineError) as error:
        split(
            {"input": str(source), "outputDir": str(out), "mode": "each"},
            make_ctx(cancelled=True),
        )
    assert error.value.code == errors.CANCELLED
    assert list(out.iterdir()) == []


def test_chunk_size_must_be_positive(source, out, make_ctx):
    with pytest.raises(EngineError) as error:
        run(source, out, make_ctx, mode="chunks", chunkSize=0)
    assert error.value.code == errors.INVALID_REQUEST


def test_unknown_mode_is_rejected(source, out, make_ctx):
    with pytest.raises(EngineError) as error:
        run(source, out, make_ctx, mode="shred")
    assert error.value.code == errors.INVALID_REQUEST


def test_unsafe_base_name_is_cleaned(source, out, make_ctx):
    result = run(source, out, make_ctx, mode="extract", ranges=[[1, 1]], baseName='a<b>:c"?')
    assert result["outputPaths"][0].rsplit("/", 1)[-1] == "a_b__c___pages_1.pdf"
    assert leftover_temp_files(out) == []
