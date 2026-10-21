from __future__ import annotations

import hashlib
import io
import threading
from collections.abc import Callable
from pathlib import Path

import pymupdf
import pytest

from docuforge_engine.context import JobContext
from docuforge_engine.protocol import Protocol


@pytest.fixture
def make_pdf(tmp_path: Path) -> Callable[..., Path]:
    """Creates a PDF whose pages say 'name-1', 'name-2', ... so page order can be checked."""

    def create(name: str, pages: int, *, password: str | None = None) -> Path:
        path = tmp_path / f"{name}.pdf"
        with pymupdf.open() as document:
            for number in range(1, pages + 1):
                page = document.new_page()
                page.insert_text((72, 72), f"{name}-{number}")
            if password:
                document.save(
                    path,
                    encryption=pymupdf.PDF_ENCRYPT_AES_256,
                    user_pw=password,
                    owner_pw=password + "-owner",
                )
            else:
                document.save(path)
        return path

    return create


@pytest.fixture
def make_ctx() -> Callable[..., JobContext]:
    def create(job_id: str = "testjob", *, cancelled: bool = False) -> JobContext:
        event = threading.Event()
        if cancelled:
            event.set()
        return JobContext(job_id, Protocol(io.StringIO()), event)

    return create


def page_texts(path: Path) -> list[str]:
    with pymupdf.open(path) as document:
        return [page.get_text().strip() for page in document]


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def leftover_temp_files(directory: Path) -> list[Path]:
    return list(directory.glob(".docuforge-*.tmp"))


@pytest.fixture
def make_photo_pdf(tmp_path: Path) -> Callable[..., Path]:
    """A one-page PDF holding a large, noisy JPEG (about 290 dpi on the page) plus a line of text."""
    import io

    from PIL import Image

    def create(name: str = "photo") -> Path:
        noise = [Image.effect_noise((1800, 2400), 60) for _ in range(3)]
        picture = Image.merge("RGB", noise)
        buffer = io.BytesIO()
        picture.save(buffer, format="JPEG", quality=95)

        path = tmp_path / f"{name}.pdf"
        with pymupdf.open() as document:
            page = document.new_page()
            page.insert_image(pymupdf.Rect(0, 100, 595, 842), stream=buffer.getvalue())
            page.insert_text((72, 72), "Quarterly report")
            document.save(path)
        return path

    return create


@pytest.fixture
def report_pdf(tmp_path: Path) -> Path:
    """A text PDF with a heading, formatting, bullets, a bordered table and a picture."""
    from PIL import Image

    picture = io.BytesIO()
    Image.new("RGB", (300, 120), (30, 90, 200)).save(picture, "PNG")
    archive = pymupdf.Archive()
    archive.add(picture.getvalue(), "pic.png")
    html = (
        "<h1>Quarterly Report</h1><p>This is a <b>bold</b> and <i>italic</i> paragraph.</p>"
        "<ul><li>First point</li><li>Second point</li></ul>"
        '<table border="1" cellpadding="4"><tr><th>Region</th><th>Sales</th></tr>'
        "<tr><td>North</td><td>120</td></tr></table>"
        '<p>Closing paragraph.</p><img src="pic.png" width="200"/>'
    )
    path = tmp_path / "report.pdf"
    story = pymupdf.Story(html, archive=archive)
    writer = pymupdf.DocumentWriter(str(path))
    more = True
    while more:
        device = writer.begin_page(pymupdf.paper_rect("a4"))
        more, _ = story.place(pymupdf.paper_rect("a4") + (54, 54, -54, -54))
        story.draw(device)
        writer.end_page()
    writer.close()
    return path


