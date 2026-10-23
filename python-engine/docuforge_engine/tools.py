"""Finds optional programs the engine can use. Nothing here is required for the core tools."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from .subprocess_utils import program_output


def find_word() -> Path | None:
    """Looks for Microsoft Word: DOCUFORGE_WORD, registry App Paths, the PATH, then standard Office folders."""
    candidates: list[Path] = []

    override = os.environ.get("DOCUFORGE_WORD")
    if override:
        candidates.append(Path(override))

    if os.name == "nt":
        try:
            import winreg

            for root_key in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                for subkey in (
                    r"Software\Microsoft\Windows\CurrentVersion\App Paths\Winword.exe",
                    r"Software\Microsoft\Windows\CurrentVersion\App Paths\winword.exe",
                ):
                    try:
                        with winreg.OpenKey(root_key, subkey) as key:
                            val, _ = winreg.QueryValueEx(key, "")
                            if val:
                                candidates.append(Path(val))
                    except OSError:
                        pass
        except ImportError:
            pass

    for name in ("winword", "winword.exe", "WINWORD.EXE"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))

    for variable in ("ProgramFiles", "ProgramFiles(x86)"):
        root = os.environ.get(variable)
        if root:
            root_path = Path(root) / "Microsoft Office"
            if root_path.is_dir():
                for match in root_path.glob("**/WINWORD.EXE"):
                    candidates.append(match)

    return next((path for path in candidates if path.is_file()), None)


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

    # Tesseract shipped inside the installer: <tools folder>/tesseract/tesseract.exe
    bundled = os.environ.get("DOCUFORGE_TOOLS_DIR")
    if bundled:
        for name in ("tesseract.exe", "tesseract"):
            candidates.append(Path(bundled) / "tesseract" / name)

    for name in ("tesseract", "tesseract.exe"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))

    for variable in ("ProgramFiles", "ProgramFiles(x86)"):
        root = os.environ.get(variable)
        if root:
            candidates.append(Path(root) / "Tesseract-OCR" / "tesseract.exe")

    return next((path for path in candidates if path.is_file()), None)


def tesseract_environment(tesseract: Path) -> dict[str, str]:
    """The environment to run Tesseract in. A copy that ships with DocuForge keeps its language data
    in a `tessdata` folder next to the program; pointing Tesseract at it makes it independent of
    where Windows installed things."""
    environment = dict(os.environ)
    tessdata = tesseract.parent / "tessdata"
    if tessdata.is_dir():
        environment["TESSDATA_PREFIX"] = str(tessdata)
    return environment


def tesseract_languages(tesseract: Path) -> list[str]:
    """The language packs that are installed, for example ['eng', 'urd']. 'osd' is not a language."""
    output = program_output([str(tesseract), "--list-langs"], env=tesseract_environment(tesseract))
    if output is None:
        return []
    languages: list[str] = []
    for line in output.splitlines():
        name = line.strip()
        if name and not name.lower().startswith("list of") and name != "osd" and " " not in name:
            languages.append(name)
    return sorted(set(languages))
