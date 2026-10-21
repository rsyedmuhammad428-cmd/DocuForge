from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from docuforge_engine import errors, operations
from docuforge_engine.errors import EngineError, describe_exception
from docuforge_engine.selfcheck import run_check

ENGINE_DIR = Path(__file__).resolve().parent.parent


def run_engine_with(setup: str, request: dict) -> tuple[list[dict], str]:
    """Starts the real engine after running `setup` (Python code) in the same process."""
    script = f"import sys, runpy\n{setup}\nrunpy.run_module('docuforge_engine', run_name='__main__')"
    process = subprocess.Popen(
        [sys.executable, "-c", script],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        cwd=ENGINE_DIR,
    )
    assert process.stdin is not None and process.stdout is not None and process.stderr is not None
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    output = process.stdout.read()
    stderr = process.stderr.read()
    process.stdin.close()
    process.wait(timeout=60)
    return [json.loads(line) for line in output.splitlines() if line.strip()], stderr


def test_unknown_operations_are_not_resolved():
    assert operations.resolve_operation("explode") is None


def test_every_registered_operation_can_be_imported_here():
    for name in operations.OPERATION_NAMES:
        assert callable(operations.resolve_operation(name)), name


def test_a_missing_package_is_explained(monkeypatch):
    def fake_import(name):
        raise ModuleNotFoundError("No module named 'mammoth'", name="mammoth")

    monkeypatch.setattr(operations.importlib, "import_module", fake_import)
    with pytest.raises(EngineError) as error:
        operations.resolve_operation("document_to_pdf")
    assert error.value.code == errors.PACKAGE_MISSING
    assert "'mammoth'" in error.value.message and "npm run engine:setup" in error.value.message


def test_a_package_that_cannot_load_is_explained_with_its_error(monkeypatch):
    def fake_import(name):
        raise ImportError("DLL load failed while importing cv2")

    monkeypatch.setattr(operations.importlib, "import_module", fake_import)
    with pytest.raises(EngineError) as error:
        operations.resolve_operation("pdf_to_docx")
    assert error.value.code == errors.PACKAGE_MISSING
    assert "DLL load failed while importing cv2" in error.value.message


def test_other_operations_keep_working_when_the_word_packages_are_missing(tmp_path, make_pdf):
    """The crash a user reported: new packages not installed. Basic tools must still run."""
    blocked = "for m in ('mammoth', 'docx', 'pdf2docx'): sys.modules[m] = None"
    source = make_pdf("doc", 2)

    messages, _ = run_engine_with(blocked, {"id": "a1", "op": "inspect", "args": {"paths": [str(source)]}})
    assert messages[-1]["type"] == "result" and messages[-1]["data"]["files"][0]["pageCount"] == 2

    messages, _ = run_engine_with(blocked, {"id": "a2", "op": "tools_status", "args": {}})
    assert messages[-1]["type"] == "result"

    messages, _ = run_engine_with(
        blocked,
        {"id": "a3", "op": "split", "args": {"input": str(source), "outputDir": str(tmp_path), "mode": "each"}},
    )
    assert messages[-1]["type"] == "result"


def test_the_feature_that_needs_a_missing_package_says_which_one(tmp_path):
    import docx as python_docx

    document = python_docx.Document()
    document.add_paragraph("Hello")
    word = tmp_path / "a.docx"
    document.save(word)

    messages, _ = run_engine_with(
        "sys.modules['mammoth'] = None",
        {"id": "b1", "op": "document_to_pdf", "args": {"input": str(word), "output": str(tmp_path / "o.pdf"), "method": "basic"}},
    )
    assert messages[-1]["type"] == "error"
    assert messages[-1]["code"] == errors.PACKAGE_MISSING
    assert "'mammoth'" in messages[-1]["message"]


def test_an_unexpected_error_names_its_type_and_keeps_the_traceback_on_stderr():
    messages, stderr = run_engine_with(
        "import docuforge_engine.operations as o\no._OPERATIONS['inspect'] = ('math', 'sqrt')",
        {"id": "c1", "op": "inspect", "args": {}},
    )
    assert messages[-1]["code"] == errors.INTERNAL
    assert messages[-1]["message"].startswith("The operation failed unexpectedly. (TypeError:")
    assert "Traceback" in stderr


def test_describe_exception_is_one_short_line():
    text = describe_exception(RuntimeError("line one\nline two   spaced"), limit=40)
    assert text == "RuntimeError: line one line two spaced"[:40]
    assert "\n" not in text


def test_the_self_check_reports_what_is_installed(capsys):
    assert run_check() == 0
    output = capsys.readouterr().out
    assert "PyMuPDF" in output and "mammoth" in output and "The engine is ready." in output
