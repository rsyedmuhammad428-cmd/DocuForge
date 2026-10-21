"""Runs the real engine as a subprocess, exactly as the app does."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent


def run_engine(request_line: str) -> tuple[list[dict], int]:
    """Like the app: write one request line and keep stdin open until the engine finishes.

    The engine treats a closed stdin as "the app went away" and cancels the job, so closing
    stdin right after the request would cancel it.
    """
    process = subprocess.Popen(
        [sys.executable, "-m", "docuforge_engine"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        cwd=ENGINE_DIR,
    )
    assert process.stdin is not None and process.stdout is not None
    process.stdin.write(request_line + "\n")
    process.stdin.flush()
    output = process.stdout.read()
    process.stdin.close()
    code = process.wait(timeout=60)
    messages = [json.loads(line) for line in output.splitlines() if line.strip()]
    return messages, code


def test_merge_over_the_protocol(tmp_path, make_pdf):
    a, b = make_pdf("a", 1), make_pdf("b", 2)
    output = tmp_path / "merged.pdf"
    request = {"id": "job-1", "op": "merge", "args": {"inputs": [str(a), str(b)], "output": str(output)}}

    messages, code = run_engine(json.dumps(request))

    assert code == 0
    assert messages[-1]["type"] == "result"
    assert messages[-1]["data"]["pageCount"] == 3
    assert all(m["type"] in {"progress", "result"} for m in messages)
    assert output.exists()


def test_errors_come_back_as_a_final_error_message(tmp_path):
    request = {"id": "job-2", "op": "inspect", "args": {"paths": [str(tmp_path / "x.pdf")]}}
    messages, _ = run_engine(json.dumps(request))
    # inspect reports per-file errors in the result, not as a job failure
    assert messages[-1]["type"] == "result"
    assert messages[-1]["data"]["files"][0]["error"]["code"] == "INPUT_NOT_FOUND"


def test_unknown_operation(tmp_path):
    messages, code = run_engine(json.dumps({"id": "job-3", "op": "explode", "args": {}}))
    assert code == 1
    assert messages == [
        {"type": "error", "code": "UNKNOWN_OPERATION", "message": "The requested operation is not supported."}
    ]


def test_malformed_requests(tmp_path):
    for line in ["not json", "[]", json.dumps({"id": "bad id!", "op": "merge", "args": {}})]:
        messages, code = run_engine(line)
        assert code == 1
        assert messages[-1]["type"] == "error"
        assert messages[-1]["code"] == "INVALID_REQUEST"


def test_non_ascii_paths_survive_the_protocol(tmp_path, make_pdf):
    folder = tmp_path / "résumé ñ 文档"
    folder.mkdir()
    source = make_pdf("doc", 2)
    request = {
        "id": "job-4",
        "op": "split",
        "args": {"input": str(source), "outputDir": str(folder), "mode": "each"},
    }
    messages, code = run_engine(json.dumps(request, ensure_ascii=False))
    assert code == 0
    assert messages[-1]["data"]["fileCount"] == 2
    assert len(list(folder.glob("*.pdf"))) == 2
