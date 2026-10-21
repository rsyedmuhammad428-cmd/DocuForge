from __future__ import annotations

import pymupdf
import pytest
from PIL import Image

from docuforge_engine import errors
from docuforge_engine.convert.images_to_pdf import images_to_pdf
from docuforge_engine.errors import EngineError

from .conftest import leftover_temp_files


def make_image(path, size=(400, 300), mode="RGB", color=(200, 30, 30), fmt=None, **save_args):
    Image.new(mode, size, color).save(path, format=fmt, **save_args)
    return path


def run(inputs, output, make_ctx, **args):
    return images_to_pdf({"inputs": [str(p) for p in inputs], "output": str(output), **args}, make_ctx())


def test_one_page_per_image_in_order(tmp_path, make_ctx):
    a = make_image(tmp_path / "a.png", (400, 300))
    b = make_image(tmp_path / "b.jpg", (300, 400))
    output = tmp_path / "out.pdf"
    result = run([b, a], output, make_ctx)

    assert result["pageCount"] == 2
    with pymupdf.open(output) as document:
        assert document[0].rect.height > document[0].rect.width  # b is portrait
        assert document[1].rect.width > document[1].rect.height  # a is landscape


def test_a4_pages_have_a_margin_and_keep_the_aspect_ratio(tmp_path, make_ctx):
    image = make_image(tmp_path / "wide.png", (800, 200))
    output = tmp_path / "out.pdf"
    run([image], output, make_ctx, pageSize="a4")
    with pymupdf.open(output) as document:
        page = document[0]
        assert (round(page.rect.width), round(page.rect.height)) == (842, 595)  # landscape A4
        (info,) = page.get_image_info()
        box = pymupdf.Rect(info["bbox"])
        assert box.x0 >= 35.9 and box.x1 <= page.rect.width - 35.9
        assert abs(box.width / box.height - 4.0) < 0.05


def test_match_size_uses_the_image_size_at_150_dpi(tmp_path, make_ctx):
    image = make_image(tmp_path / "p.png", (1500, 750))
    output = tmp_path / "out.pdf"
    run([image], output, make_ctx, pageSize="match")
    with pymupdf.open(output) as document:
        assert (round(document[0].rect.width), round(document[0].rect.height)) == (720, 360)


def test_plain_jpegs_are_embedded_without_re_encoding(tmp_path, make_ctx):
    image = make_image(tmp_path / "photo.jpg", (600, 400), fmt="JPEG", quality=88)
    output = tmp_path / "out.pdf"
    run([image], output, make_ctx)
    with pymupdf.open(output) as document:
        (xref, *_) = document[0].get_images()[0]
        assert document.extract_image(xref)["image"] == image.read_bytes()


def test_transparency_is_placed_on_white(tmp_path, make_ctx):
    image = make_image(tmp_path / "clear.png", (100, 100), mode="RGBA", color=(0, 0, 0, 0))
    output = tmp_path / "out.pdf"
    run([image], output, make_ctx)
    with pymupdf.open(output) as document:
        pixmap = document[0].get_pixmap(dpi=50)
        assert pixmap.pixel(pixmap.width // 2, pixmap.height // 2) == (255, 255, 255)


@pytest.mark.parametrize(("mode", "name"), [("P", "p.gif"), ("L", "gray.png"), ("1", "bw.png"), ("CMYK", "cmyk.jpg")])
def test_other_color_modes_convert(tmp_path, make_ctx, mode, name):
    color = 128 if mode in ("P", "L") else (1 if mode == "1" else (10, 20, 30, 40))
    image = make_image(tmp_path / name, (50, 50), mode=mode, color=color)
    result = run([image], tmp_path / "out.pdf", make_ctx)
    assert result["pageCount"] == 1


def test_exif_rotation_is_applied(tmp_path, make_ctx):
    exif = Image.Exif()
    exif[0x0112] = 6  # the camera was turned: the picture must be rotated to display upright
    image = make_image(tmp_path / "sideways.jpg", (400, 200), fmt="JPEG", exif=exif)
    output = tmp_path / "out.pdf"
    run([image], output, make_ctx)
    with pymupdf.open(output) as document:
        assert document[0].rect.height > document[0].rect.width  # now portrait


def test_bad_inputs_fail_clearly_and_leave_nothing(tmp_path, make_ctx):
    good = make_image(tmp_path / "good.png")
    broken = tmp_path / "broken.png"
    broken.write_bytes(b"not an image")
    output = tmp_path / "out.pdf"

    with pytest.raises(EngineError) as error:
        run([good, broken], output, make_ctx)
    assert error.value.code == errors.UNSUPPORTED_IMAGE
    assert "broken.png" in error.value.message

    with pytest.raises(EngineError) as error:
        run([good, tmp_path / "missing.png"], output, make_ctx)
    assert error.value.code == errors.INPUT_NOT_FOUND
    assert not output.exists()
    assert leftover_temp_files(tmp_path) == []


def test_rejects_an_output_that_is_an_input_and_bad_options(tmp_path, make_ctx):
    image = make_image(tmp_path / "a.png")
    with pytest.raises(EngineError) as error:
        run([image], image, make_ctx)
    assert error.value.code == errors.OUTPUT_IS_INPUT
    with pytest.raises(EngineError) as error:
        run([image], tmp_path / "o.pdf", make_ctx, pageSize="huge")
    assert error.value.code == errors.INVALID_REQUEST
    with pytest.raises(EngineError):
        run([], tmp_path / "o.pdf", make_ctx)


def test_cancel_leaves_nothing_behind(tmp_path, make_ctx):
    image = make_image(tmp_path / "a.png")
    output = tmp_path / "o.pdf"
    with pytest.raises(EngineError) as error:
        images_to_pdf({"inputs": [str(image)], "output": str(output)}, make_ctx(cancelled=True))
    assert error.value.code == errors.CANCELLED
    assert not output.exists()
