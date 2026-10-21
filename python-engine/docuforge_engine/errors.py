"""Structured errors. The `code` is stable and is what the app maps to user-facing messages."""

from __future__ import annotations

import errno

# Codes the engine can report. Keep in sync with shared/engine-protocol.ts.
INVALID_REQUEST = "INVALID_REQUEST"
UNKNOWN_OPERATION = "UNKNOWN_OPERATION"
INPUT_NOT_FOUND = "INPUT_NOT_FOUND"
INPUT_UNREADABLE = "INPUT_UNREADABLE"
NOT_A_PDF = "NOT_A_PDF"
PDF_ENCRYPTED = "PDF_ENCRYPTED"
PDF_CORRUPT = "PDF_CORRUPT"
INVALID_PAGE_RANGE = "INVALID_PAGE_RANGE"
OUTPUT_IS_INPUT = "OUTPUT_IS_INPUT"
OUTPUT_PERMISSION = "OUTPUT_PERMISSION"
OUTPUT_WRITE_FAILED = "OUTPUT_WRITE_FAILED"
OUTPUT_INVALID = "OUTPUT_INVALID"
DISK_FULL = "DISK_FULL"
NO_SIZE_GAIN = "NO_SIZE_GAIN"
NO_TEXT_FOUND = "NO_TEXT_FOUND"
UNSUPPORTED_IMAGE = "UNSUPPORTED_IMAGE"
IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE"
TEXT_TOO_LARGE = "TEXT_TOO_LARGE"
TOOL_NOT_FOUND = "TOOL_NOT_FOUND"
LANGUAGE_NOT_INSTALLED = "LANGUAGE_NOT_INSTALLED"
CONVERSION_FAILED = "CONVERSION_FAILED"
PACKAGE_MISSING = "PACKAGE_MISSING"
CANCELLED = "CANCELLED"
INTERNAL = "INTERNAL"


class EngineError(Exception):
    """An expected failure with a code and a message that is safe to show to the user."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def from_os_error(exc: OSError) -> EngineError:
    """Translate a file-system error into an EngineError without leaking paths or internals."""
    if exc.errno == errno.ENOSPC:
        return EngineError(DISK_FULL, "There is not enough free disk space to save the result.")
    if isinstance(exc, PermissionError):
        return EngineError(
            OUTPUT_PERMISSION,
            "The output could not be written. The file may be open in another program, "
            "or you may not have permission to save there.",
        )
    return EngineError(OUTPUT_WRITE_FAILED, "The output could not be written.")


def describe_exception(exc: BaseException, limit: int = 160) -> str:
    """One short line such as "ImportError: DLL load failed", for messages and diagnostics."""
    return " ".join(f"{type(exc).__name__}: {exc}".split())[:limit]
