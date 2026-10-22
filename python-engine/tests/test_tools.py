from __future__ import annotations

import os
import stat

from docuforge_engine import tools


def fake_tesseract(folder):
    folder.mkdir(parents=True)
    program = folder / ("tesseract.exe" if os.name == "nt" else "tesseract")
    program.write_text("#!/bin/sh\necho 'List of available languages (1):'\necho \"$TESSDATA_PREFIX\"\n")
    program.chmod(program.stat().st_mode | stat.S_IEXEC)
    return program


def test_a_tesseract_shipped_with_the_app_is_found_and_uses_its_own_language_data(tmp_path, monkeypatch):
    program = fake_tesseract(tmp_path / "tools" / "tesseract")
    (program.parent / "tessdata").mkdir()
    monkeypatch.setenv("DOCUFORGE_TOOLS_DIR", str(tmp_path / "tools"))
    monkeypatch.delenv("DOCUFORGE_TESSERACT", raising=False)
    monkeypatch.setattr(tools.shutil, "which", lambda name: None)

    assert tools.find_tesseract() == program
    environment = tools.tesseract_environment(program)
    assert environment["TESSDATA_PREFIX"] == str(program.parent / "tessdata")
    assert tools.tesseract_languages(program) == [str(program.parent / "tessdata")]  # the fake prints it


def test_no_language_data_folder_means_the_environment_is_left_alone(tmp_path, monkeypatch):
    program = fake_tesseract(tmp_path / "t")
    monkeypatch.setenv("TESSDATA_PREFIX", "/somewhere")
    assert tools.tesseract_environment(program)["TESSDATA_PREFIX"] == "/somewhere"
