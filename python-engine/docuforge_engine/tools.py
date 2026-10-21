"""Finds optional programs the engine can use. Nothing here is required for the core tools."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from .subprocess_utils import program_output


def find_libreoffice() -> Path | None:
    """Looks for LibreOffice: DOCUFORGE_LIBREOFFICE, then the PATH, then the usual Windows folders."""
    candidates: list[Path] = []

    override = os.environ.get("DOCUFORGE_LIBREOFFICE")
    if override:
        candidates.append(Path(override))

    for name in ("soffice", "soffice.exe", "libreoffice"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))

    for variable in ("ProgramFiles", "ProgramFiles(x86)"):
        root = os.environ.get(variable)
        if root:
            candidates.append(Path(root) / "LibreOffice" / "program" / "soffice.exe")

    return next((path for path in candidates if path.is_file()), None)


def find_tesseract() -> Path | None:
    """Looks for Tesseract OCR: DOCUFORGE_TESSERACT, then the PATH, then the usual Windows folders."""
    candidates: list[Path] = []

    override = os.environ.get("DOCUFORGE_TESSERACT")
    if override:
        candidates.append(Path(override))

    for name in ("tesseract", "tesseract.exe"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))

    for variable in ("ProgramFiles", "ProgramFiles(x86)"):
        root = os.environ.get(variable)
        if root:
            candidates.append(Path(root) / "Tesseract-OCR" / "tesseract.exe")

    return next((path for path in candidates if path.is_file()), None)


def tesseract_languages(tesseract: Path) -> list[str]:
    """The language packs that are installed, for example ['eng', 'urd']. 'osd' is not a language."""
    output = program_output([str(tesseract), "--list-langs"])
    if output is None:
        return []
    languages: list[str] = []
    for line in output.splitlines():
        name = line.strip()
        if name and not name.lower().startswith("list of") and name != "osd" and " " not in name:
            languages.append(name)
    return sorted(set(languages))
