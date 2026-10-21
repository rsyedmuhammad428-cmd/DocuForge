"""`python -m docuforge_engine --check`: tells you what is installed and what each part is for."""

from __future__ import annotations

import importlib
import importlib.metadata
import sys

from . import __version__
from .tools import find_libreoffice, find_tesseract, tesseract_languages

# (module, distribution, what it is for, required?)
_PACKAGES = (
    ("pymupdf", "PyMuPDF", "everything with PDFs", True),
    ("PIL", "pillow", "images to PDF, OCR on images", True),
    ("docx", "python-docx", "PDF to Word (simple method), checking Word files", True),
    ("mammoth", "mammoth", "Word to PDF without LibreOffice", True),
    ("pdf2docx", "pdf2docx", "PDF to Word with layout (a simpler method is used without it)", False),
)


def run_check() -> int:
    print(f"DocuForge engine {__version__}, Python {sys.version.split()[0]}\n")
    problems = 0
    for module, distribution, purpose, required in _PACKAGES:
        try:
            importlib.import_module(module)
            version = importlib.metadata.version(distribution)
            print(f"  ok       {distribution} {version}  ({purpose})")
        except Exception as exc:  # noqa: BLE001 - report any reason a package cannot be used
            label = "MISSING " if required else "optional"
            print(f"  {label} {distribution}: {type(exc).__name__}: {exc}  ({purpose})")
            problems += 1 if required else 0

    tesseract = find_tesseract()
    languages = ", ".join(tesseract_languages(tesseract)) if tesseract else ""
    print(f"\n  OCR (Tesseract):  {'found, languages: ' + (languages or 'none') if tesseract else 'not found (optional)'}")
    print(f"  LibreOffice:      {'found' if find_libreoffice() else 'not found (optional)'}")

    if problems:
        print('\nSome required packages are missing. Run "npm run engine:setup".')
        return 1
    print("\nThe engine is ready.")
    return 0
