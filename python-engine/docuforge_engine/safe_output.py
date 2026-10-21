"""Safe output writing.

Every output is written to a temporary file next to its destination, checked, and only then
moved into place. A failed or cancelled job removes its temporary files and anything it already
created, so a partial result never looks like a finished one.

Temporary files are named `.docuforge-<job id>-<n>.tmp` so the app can also clean them up if the
engine is killed before it can do so itself.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from types import TracebackType

import pymupdf

from .context import JobContext
from .errors import OUTPUT_INVALID, OUTPUT_WRITE_FAILED, EngineError, from_os_error


@dataclass(frozen=True)
class PendingOutput:
    temp: Path
    destination: Path
    expected_pages: int | None = None  # PDFs: the page count the file must have
    kind: str = "pdf"  # "pdf", "docx", "image" or "text": decides how the file is checked


def unique_path(path: Path) -> Path:
    """Returns `path`, or `name (2).ext`, `name (3).ext`, ... if it already exists."""
    if not path.exists():
        return path
    for number in range(2, 10_000):
        candidate = path.with_name(f"{path.stem} ({number}){path.suffix}")
        if not candidate.exists():
            return candidate
    raise EngineError(OUTPUT_WRITE_FAILED, "Could not find an unused file name.")


class OutputTransaction:
    def __init__(self, ctx: JobContext) -> None:
        self._ctx = ctx
        self._temps: list[Path] = []
        self._created: list[Path] = []
        self._counter = 0

    def __enter__(self) -> OutputTransaction:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        # Temp files are always removed. Created outputs are removed only if the job failed.
        self._remove_temps()
        if exc_type is not None:
            self._remove_created()

    def new_temp(self, destination: Path) -> Path:
        if not destination.parent.is_dir():
            raise EngineError(OUTPUT_WRITE_FAILED, "The output folder does not exist.")
        self._counter += 1
        temp = destination.parent / f".docuforge-{self._ctx.job_id}-{self._counter}.tmp"
        self._temps.append(temp)
        return temp

    def commit(self, items: list[PendingOutput], *, overwrite: bool) -> list[Path]:
        """Checks every temp file, then moves them all into place.

        overwrite=True replaces the destination (used when the user chose an exact file name).
        overwrite=False never replaces anything and picks a free name instead.
        """
        for item in items:
            self._validate(item)
        self._ctx.check_cancelled()

        finals: list[Path] = []
        try:
            for item in items:
                final = item.destination if overwrite else unique_path(item.destination)
                existed = final.exists()
                os.replace(item.temp, final)
                if not existed:
                    self._created.append(final)
                finals.append(final)
        except OSError as exc:
            raise from_os_error(exc) from exc
        return finals

    def _validate(self, item: PendingOutput) -> None:
        try:
            if item.kind == "pdf":
                with pymupdf.open(item.temp) as check:
                    valid = check.is_pdf and check.page_count == item.expected_pages
            elif item.kind == "docx":
                import docx  # python-docx

                docx.Document(str(item.temp))  # raises if it is not a readable Word file
                valid = True
            elif item.kind == "image":
                pymupdf.Pixmap(str(item.temp))  # raises if the image cannot be decoded
                valid = True
            else:
                valid = item.temp.stat().st_size > 0
        except Exception:  # noqa: BLE001 - any failure to read the result means it is not valid
            valid = False
        if not valid:
            raise EngineError(OUTPUT_INVALID, "The result could not be verified, so it was not saved.")

    def _remove_temps(self) -> None:
        for temp in self._temps:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass  # Best effort; the app also sweeps leftover temp files.

    def _remove_created(self) -> None:
        for created in self._created:
            try:
                created.unlink(missing_ok=True)
            except OSError:
                pass
