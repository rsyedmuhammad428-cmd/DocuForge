from __future__ import annotations

import base64

import pytest

from docuforge_engine import errors
from docuforge_engine.errors import EngineError
from docuforge_engine.pdf_tools.inspect_pdf import inspect_pdfs
from docuforge_engine.pdf_tools.thumbnails import thumbnails


def test_thumbnails_are_small_jpegs(make_pdf, make_ctx):
    source = make_pdf("doc", 4)
    result = thumbnails({"input": str(source), "pages": [3, 0], "width": 120}, make_ctx())
    assert [t["page"] for t in result["thumbnails"]] == [3, 0]
    for thumb in result["thumbnails"]:
        assert thumb["width"] == 120
        header, encoded = thumb["dataUrl"].split(",", 1)
        assert header == "data:image/jpeg;base64"
        assert base64.b64decode(encoded)[:3] == b"\xff\xd8\xff"


def test_thumbnail_width_is_clamped(make_pdf, make_ctx):
    source = make_pdf("doc", 1)
    result = thumbnails({"input": str(source), "pages": [0], "width": 5000}, make_ctx())
    assert result["thumbnails"][0]["width"] == 400


@pytest.mark.parametrize("pages", [[], [9], [-1], ["a"], list(range(61))])
def test_thumbnail_page_requests_are_validated(make_pdf, make_ctx, pages):
    source = make_pdf("doc", 2)
    with pytest.raises(EngineError):
        thumbnails({"input": str(source), "pages": pages}, make_ctx())


def test_inspect_reports_each_file_separately(tmp_path, make_pdf, make_ctx):
    good = make_pdf("good", 3)
    locked = make_pdf("locked", 1, password="pw")
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"nope")
    missing = tmp_path / "missing.pdf"

    result = inspect_pdfs({"paths": [str(good), str(locked), str(broken), str(missing)]}, make_ctx())
    files = result["files"]

    assert files[0] == {"path": str(good), "ok": True, "pageCount": 3}
    assert [f["error"]["code"] for f in files[1:]] == [
        errors.PDF_ENCRYPTED,
        errors.PDF_CORRUPT,
        errors.INPUT_NOT_FOUND,
    ]
