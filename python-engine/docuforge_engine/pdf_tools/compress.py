"""Make a PDF smaller.

Three presets, from safest to smallest:
  light     lossless. Cleans up and recompresses the file structure. Images are not touched.
  balanced  lossy for images. Images sharper than 170 dpi are reduced to 150 dpi, JPEG quality 75.
  smallest  lossy for images. Images sharper than 120 dpi are reduced to 96 dpi, JPEG quality 50.
Text and vector graphics are never changed. The original file is never modified.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..context import JobContext
from ..errors import INVALID_REQUEST, NO_SIZE_GAIN, OUTPUT_IS_INPUT, EngineError
from ..safe_output import OutputTransaction, PendingOutput
from .common import file_size, get_path, open_pdf, same_file

# A result that saves less than this is reported as "already compact" instead of as a success.
MIN_SAVING_RATIO = 0.01


@dataclass(frozen=True)
class Preset:
    rewrite_images: bool
    dpi_threshold: int = 0
    dpi_target: int = 0
    quality: int = 0


PRESETS: dict[str, Preset] = {
    "light": Preset(rewrite_images=False),
    "balanced": Preset(rewrite_images=True, dpi_threshold=170, dpi_target=150, quality=75),
    "smallest": Preset(rewrite_images=True, dpi_threshold=120, dpi_target=96, quality=50),
}


def compress(args: dict[str, Any], ctx: JobContext) -> dict[str, Any]:
    preset_name = args.get("preset")
    preset = PRESETS.get(preset_name) if isinstance(preset_name, str) else None
    if preset is None:
        raise EngineError(INVALID_REQUEST, "The compression preset is not supported.")
    source_path = get_path(args, "input")
    output = get_path(args, "output")
    if same_file(source_path, output):
        raise EngineError(OUTPUT_IS_INPUT, "The output file must be different from the original PDF.")

    original_size = file_size(source_path)

    with OutputTransaction(ctx) as transaction, open_pdf(source_path) as document:
        page_count = document.page_count
        ctx.progress(1, 4)
        ctx.check_cancelled()

        if preset.rewrite_images:
            # Works on this in-memory copy only. Not interruptible, so cancel waits for it.
            document.rewrite_images(
                dpi_threshold=preset.dpi_threshold,
                dpi_target=preset.dpi_target,
                quality=preset.quality,
            )
        ctx.progress(2, 4)
        ctx.check_cancelled()

        temp = transaction.new_temp(output)
        document.save(temp, garbage=4, deflate=True, clean=True, use_objstms=1)
        ctx.progress(3, 4)

        new_size = temp.stat().st_size
        if new_size > original_size * (1 - MIN_SAVING_RATIO):
            raise EngineError(
                NO_SIZE_GAIN,
                "This PDF is already compact. Compressing it would save less than 1%, "
                "so no file was created.",
            )

        (final,) = transaction.commit([PendingOutput(temp, output, page_count)], overwrite=True)
        ctx.progress(4, 4)

    return {
        "outputPaths": [str(final)],
        "pageCount": page_count,
        "sizeBytes": file_size(final),
        "originalBytes": original_size,
    }
