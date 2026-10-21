"""The operations the engine can run. Add new ones to _OPERATIONS.

Each operation's module is imported only when it is first used. A missing or broken Python
package then affects only the feature that needs it; every other operation keeps working.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from typing import Any

from .context import JobContext
from .errors import PACKAGE_MISSING, EngineError, describe_exception

Operation = Callable[[dict[str, Any], JobContext], dict[str, Any]]

_PDF = "docuforge_engine.pdf_tools"
_CONVERT = "docuforge_engine.convert"

# operation name -> (module, function)
_OPERATIONS: dict[str, tuple[str, str]] = {
    # Phase 2
    "inspect": (f"{_PDF}.inspect_pdf", "inspect_pdfs"),
    "merge": (f"{_PDF}.merge", "merge"),
    "split": (f"{_PDF}.split", "split"),
    "organize_export": (f"{_PDF}.organize", "organize_export"),
    "thumbnails": (f"{_PDF}.thumbnails", "thumbnails"),
    # Phase 3
    "compress": (f"{_PDF}.compress", "compress"),
    "pdf_to_images": (f"{_CONVERT}.pdf_to_images", "pdf_to_images"),
    "images_to_pdf": (f"{_CONVERT}.images_to_pdf", "images_to_pdf"),
    "pdf_to_text": (f"{_CONVERT}.pdf_to_text", "pdf_to_text"),
    "text_to_pdf": (f"{_CONVERT}.text_to_pdf", "text_to_pdf"),
    "document_to_pdf": (f"{_CONVERT}.document_to_pdf", "document_to_pdf"),
    "tools_status": (f"{_CONVERT}.document_to_pdf", "tools_status"),
    # Phase 4
    "pdf_to_docx": (f"{_CONVERT}.pdf_to_docx", "pdf_to_docx"),
    "ocr": (f"{_CONVERT}.ocr", "ocr"),
}

OPERATION_NAMES = frozenset(_OPERATIONS)


def package_problem(exc: ImportError) -> EngineError:
    """Turns a failed import into a message that says which package, and what to do."""
    if isinstance(exc, ModuleNotFoundError):
        return EngineError(
            PACKAGE_MISSING,
            f"A Python package this feature needs is missing ('{exc.name or 'unknown'}'). Close "
            'DocuForge, run "npm run engine:setup", then start it again.',
        )
    return EngineError(
        PACKAGE_MISSING,
        f"A Python package this feature needs could not be loaded ({describe_exception(exc)}). "
        'Try running "npm run engine:setup" again.',
    )


def resolve_operation(name: str) -> Operation | None:
    """Returns the operation, or None if the name is unknown. Raises EngineError if a package is missing."""
    target = _OPERATIONS.get(name)
    if target is None:
        return None
    module_name, function_name = target
    try:
        module = importlib.import_module(module_name)
    except ImportError as exc:
        raise package_problem(exc) from exc
    operation: Operation = getattr(module, function_name)
    return operation
