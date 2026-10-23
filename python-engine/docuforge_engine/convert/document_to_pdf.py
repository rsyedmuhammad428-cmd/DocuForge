"""Word, OpenDocument and RTF files to PDF.

.docx files can be converted with no other program, using the built-in converter (basic layout).
If the free LibreOffice is installed it is used instead for .docx, because its layout is closer to
Word's, and it is the only way to convert .doc, .odt and .rtf files.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import pymupdf

from ..context import JobContext
from ..errors import (
    CONVERSION_FAILED,
    INPUT_NOT_FOUND,
    OUTPUT_IS_INPUT,
    TOOL_NOT_FOUND,
    EngineError,
)
from ..pdf_tools.common import file_size, get_path, same_file
from ..safe_output import OutputTransaction, PendingOutput
from ..subprocess_utils import run_cancellable
from ..tools import find_libreoffice, find_tesseract, find_word, tesseract_languages

_TIMEOUT_SECONDS = 300
_SUPPORTED_EXTENSIONS = {".docx", ".doc", ".odt", ".rtf"}


_OLE_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")  # classic .doc


def looks_like_document(path: Path) -> bool:
    """Checks the file really is what its extension says.

    LibreOffice opens an unrecognized file as plain text, so a damaged .docx would otherwise
    "convert" into a PDF full of garbage.
    """
    try:
        with open(path, "rb") as handle:
            head = handle.read(8)
    except OSError:
        return False

    extension = path.suffix.lower()
    if extension in (".docx", ".odt"):
        required = "word/document.xml" if extension == ".docx" else "content.xml"
        try:
            with zipfile.ZipFile(path) as archive:
                return required in archive.namelist()
        except (zipfile.BadZipFile, OSError):
            return False
    if extension == ".rtf":
        return head.startswith(b"{\\rtf")
    # .doc files are usually OLE files, but some are RTF or Word 2007+ files with the wrong name.
    return head.startswith(_OLE_SIGNATURE) or head.startswith(b"{\\rtf") or head.startswith(b"PK")


_BUILTIN_NOTE = (
    "Converted with DocuForge's built-in converter. Text, headings, lists, tables and pictures are "
    "kept; headers, footers, page numbers and exact page layout are not."
)
_LIBREOFFICE_NOTE = "Converted with LibreOffice. Layout can differ slightly from Microsoft Word."
_WORD_NOTE = "Converted with Microsoft Word for exact layout and formatting."


def document_to_pdf(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    source_path = get_path(args, "input")
    output = get_path(args, "output")
    method = args.get("method", "auto")
    if method not in ("auto", "basic"):
        raise EngineError(CONVERSION_FAILED, "The conversion method is not supported.")
    if same_file(source_path, output):
        raise EngineError(OUTPUT_IS_INPUT, "The PDF must be saved under a different name than the document.")
    if not source_path.is_file():
        raise EngineError(INPUT_NOT_FOUND, f"The file '{source_path.name}' was not found.")
    extension = source_path.suffix.lower()
    if extension not in _SUPPORTED_EXTENSIONS:
        raise EngineError(CONVERSION_FAILED, f"'{source_path.name}' is not a supported document type.")
    if not looks_like_document(source_path):
        raise EngineError(
            CONVERSION_FAILED,
            f"'{source_path.name}' is damaged or is not really a {extension} document.",
        )

    word = find_word()
    office = find_libreoffice()

    if method == "auto":
        if word is not None:
            return _convert_with_word(word, source_path, output, ctx)
        if office is not None:
            return _convert_with_libreoffice(office, source_path, output, ctx)
        if extension == ".docx":
            return _convert_builtin(source_path, output, ctx)
        raise EngineError(
            TOOL_NOT_FOUND,
            f"{extension} files need Microsoft Word or LibreOffice, which was not found. Save the file as .docx in "
            "Word and convert that, or install Microsoft Word or the free LibreOffice from libreoffice.org.",
        )

    # method == "basic"
    if extension != ".docx":
        raise EngineError(
            TOOL_NOT_FOUND,
            f"{extension} files cannot be converted with basic mode. Use Microsoft Word or LibreOffice.",
        )
    return _convert_builtin(source_path, output, ctx)


def _convert_builtin(source_path: Path, output: Path, ctx: JobContext) -> dict[str, Any]:
    from .docx_builtin import docx_to_pdf_bytes  # needs `mammoth`, so it is imported only when used

    ctx.progress(1, None)
    pdf_bytes, page_count, warnings = docx_to_pdf_bytes(source_path, ctx)

    with OutputTransaction(ctx) as transaction:
        temp = transaction.new_temp(output)
        temp.write_bytes(pdf_bytes)
        (final,) = transaction.commit([PendingOutput(temp, output, page_count)], overwrite=True)

    note = _BUILTIN_NOTE
    if warnings:
        note += f" The document used {len(warnings)} feature(s) that could not be converted."
    return {
        "outputPaths": [str(final)],
        "pageCount": page_count,
        "sizeBytes": file_size(final),
        "note": note,
    }


def _convert_with_libreoffice(
    office: Path, source_path: Path, output: Path, ctx: JobContext
) -> dict[str, Any]:
    work = Path(tempfile.mkdtemp(prefix="docuforge-lo-"))
    try:
        out_dir = work / "out"
        out_dir.mkdir()
        # A private profile folder avoids clashes with a LibreOffice window the user may have open.
        command = [
            str(office),
            f"-env:UserInstallation={(work / 'profile').as_uri()}",
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--convert-to",
            "pdf",
            "--outdir",
            str(out_dir),
            str(source_path),
        ]
        ctx.progress(1, 3)
        exit_code, _ = run_cancellable(command, ctx, timeout=_TIMEOUT_SECONDS)

        converted = out_dir / f"{source_path.stem}.pdf"
        if exit_code != 0 or not converted.is_file():
            raise EngineError(
                CONVERSION_FAILED,
                f"LibreOffice could not convert '{source_path.name}'. The file may be damaged "
                "or password protected.",
            )
        ctx.progress(2, 3)

        with pymupdf.open(converted) as check:
            page_count = check.page_count

        with OutputTransaction(ctx) as transaction:
            temp = transaction.new_temp(output)
            shutil.copyfile(converted, temp)
            (final,) = transaction.commit([PendingOutput(temp, output, page_count)], overwrite=True)
        ctx.progress(3, 3)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return {
        "outputPaths": [str(final)],
        "pageCount": page_count,
        "sizeBytes": file_size(final),
        "note": _LIBREOFFICE_NOTE,
    }


_WORD_SCRIPT = """param([string]$InputPath, [string]$OutputPath, [string]$PidPath)
$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
    $pidsBefore = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $pidsAfter = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $myPid = ($pidsAfter | Where-Object { $pidsBefore -notcontains $_ }) | Select-Object -First 1
    if ($myPid -and $PidPath) {
        [System.IO.File]::WriteAllText($PidPath, "$myPid")
    }
    $doc = $word.Documents.Open($InputPath, $false, $true)
    $doc.ExportAsFixedFormat($OutputPath, 17)
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if ($doc -ne $null) {
        try { $doc.Close(0) } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    }
    if ($word -ne $null) {
        try { $word.Quit(0) } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
    if ($PidPath -and (Test-Path $PidPath)) {
        Remove-Item -Force $PidPath -ErrorAction SilentlyContinue
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
"""


def _convert_with_word(
    _word_bin: Path, source_path: Path, output: Path, ctx: JobContext
) -> dict[str, Any]:
    work = Path(tempfile.mkdtemp(prefix="docuforge-word-"))
    pid_file = work / "word.pid"
    script_path = work / "convert.ps1"
    temp_pdf = work / f"{source_path.stem}.pdf"

    try:
        script_path.write_text(_WORD_SCRIPT, encoding="utf-8")
        powershell = shutil.which("powershell.exe") or shutil.which("powershell") or "powershell.exe"
        command = [
            powershell,
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            str(source_path.resolve()),
            str(temp_pdf.resolve()),
            str(pid_file.resolve()),
        ]

        ctx.progress(1, 3)
        exit_code, _ = run_cancellable(command, ctx, timeout=_TIMEOUT_SECONDS)

        if exit_code != 0 or not temp_pdf.is_file():
            raise EngineError(
                CONVERSION_FAILED,
                f"Microsoft Word could not convert '{source_path.name}'. The file may be damaged "
                "or password protected.",
            )
        ctx.progress(2, 3)

        with pymupdf.open(temp_pdf) as check:
            page_count = check.page_count

        with OutputTransaction(ctx) as transaction:
            temp = transaction.new_temp(output)
            shutil.copyfile(temp_pdf, temp)
            (final,) = transaction.commit([PendingOutput(temp, output, page_count)], overwrite=True)
        ctx.progress(3, 3)
    finally:
        if pid_file.is_file():
            try:
                raw_pid = pid_file.read_text(encoding="utf-8").strip()
                if raw_pid.isdigit() and os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", raw_pid, "/F"],
                        capture_output=True,
                        check=False,
                    )
            except Exception:
                pass
        shutil.rmtree(work, ignore_errors=True)

    return {
        "outputPaths": [str(final)],
        "pageCount": page_count,
        "sizeBytes": file_size(final),
        "note": _WORD_NOTE,
    }


def tools_status(_args: dict[str, Any], _ctx: JobContext) -> dict[str, Any]:
    """Which optional programs were found. Never includes their paths."""
    tesseract = find_tesseract()
    return {
        "word": find_word() is not None,
        "libreoffice": find_libreoffice() is not None,
        "tesseract": {
            "found": tesseract is not None,
            "languages": tesseract_languages(tesseract) if tesseract is not None else [],
        },
    }
