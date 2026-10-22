"""Measures how faithfully PDF to Word conversion reproduces a PDF.

For each PDF it converts to .docx, converts that .docx back to PDF with LibreOffice, and compares:
  words   bag-of-words F1 between the PDF text and the .docx text (1.0 = nothing lost or invented)
  pages   page count of the round trip vs the original (1.0 = same)
  layout  page-by-page picture similarity of the round trip vs the original (1.0 = identical)
  tables  tables found vs tables the document really has
  images  pictures found vs pictures the document really has
Development tool, not shipped. Usage: python tools/fidelity/measure.py CORPUS_DIR VARIANT [VARIANT...]
"""

from __future__ import annotations

import collections
import logging
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import docx
import numpy as np
import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

EXPECTED_TABLES = {"report": 1, "tables": 2, "resume": 1}
EXPECTED_IMAGES = {"report": 1, "images": 3}


from docuforge_engine.convert.docx_quality import docx_words as _docx_words, pdf_words as _pdf_words


def pdf_words(path: Path) -> list[str]:
    with pymupdf.open(path) as document:
        return _pdf_words(path, list(range(1, document.page_count + 1)))


def docx_words(path: Path) -> list[str]:
    return _docx_words(path)


def word_f1(reference: list[str], candidate: list[str]) -> float:
    ref, cand = collections.Counter(reference), collections.Counter(candidate)
    overlap = sum((ref & cand).values())
    if not overlap:
        return 0.0
    precision, recall = overlap / sum(cand.values()), overlap / sum(ref.values())
    return 2 * precision * recall / (precision + recall)


def raster(page, dpi=40) -> np.ndarray:
    pixmap = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY, alpha=False)
    return np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width).astype(float)


def blur(a: np.ndarray, k=3) -> np.ndarray:
    h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
    return a[:h, :w].reshape(h // k, k, w // k, k).mean(axis=(1, 3))


def layout_score(original: Path, rebuilt: Path) -> tuple[float, float]:
    """Returns (page-count ratio, mean picture similarity over the pages both have)."""
    with pymupdf.open(original) as a, pymupdf.open(rebuilt) as b:
        pages = min(a.page_count, b.page_count)
        scores = []
        for i in range(pages):
            x, y = blur(raster(a[i])), blur(raster(b[i]))
            h, w = min(x.shape[0], y.shape[0]), min(x.shape[1], y.shape[1])
            x, y = x[:h, :w], y[:h, :w]
            ink = np.mean(255 - x) + 1e-6
            scores.append(max(0.0, 1 - np.mean(np.abs(x - y)) / (2 * ink)))
        # pages missing from the rebuilt document count as zero
        scores += [0.0] * (a.page_count - pages)
        return min(a.page_count, b.page_count) / max(a.page_count, b.page_count), float(np.mean(scores))


def count_images(path: Path) -> int:
    return len(docx.Document(str(path)).element.xpath("//pic:pic"))


# ---- variants ----


def variant_default(pdf: Path, out: Path) -> None:
    from pdf2docx import Converter

    logging.getLogger().setLevel(logging.ERROR)
    c = Converter(str(pdf))
    try:
        c.convert(str(out))
    finally:
        c.close()


def variant_simple(pdf: Path, out: Path) -> None:
    import io, threading
    from docuforge_engine.context import JobContext
    from docuforge_engine.convert.pdf_to_docx_simple import build_simple_docx
    from docuforge_engine.protocol import Protocol

    with pymupdf.open(pdf) as d:
        pages = list(range(1, d.page_count + 1))
    build_simple_docx(pdf, pages, out, JobContext("m", Protocol(io.StringIO()), threading.Event()))


def variant_pipeline(pdf: Path, out: Path) -> None:
    import io, threading
    from docuforge_engine.context import JobContext
    from docuforge_engine.convert.pdf_to_docx import convert_best
    from docuforge_engine.protocol import Protocol

    with pymupdf.open(pdf) as d:
        pages = list(range(1, d.page_count + 1))
    convert_best(pdf, out, pages, JobContext("m", Protocol(io.StringIO()), threading.Event()))


VARIANTS = {"default": variant_default, "simple": variant_simple, "pipeline": variant_pipeline}


def measure(pdf: Path, variant: str, work: Path) -> dict[str, float]:
    name = pdf.stem
    out = work / f"{name}_{variant}.docx"
    started = time.time()
    VARIANTS[variant](pdf, out)
    seconds = time.time() - started
    subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(work), str(out)],
                   capture_output=True, timeout=240, check=True)
    pages, layout = layout_score(pdf, work / f"{name}_{variant}.pdf")
    tables = len(docx.Document(str(out)).tables)
    wanted_tables = EXPECTED_TABLES.get(name, 0)
    images = count_images(out)
    wanted_images = EXPECTED_IMAGES.get(name, 0)
    return {
        "words": word_f1(pdf_words(pdf), docx_words(out)),
        "pages": pages,
        "layout": layout,
        "tables": 1.0 if tables == wanted_tables else 0.0,
        "images": 1.0 if images == wanted_images else 0.0,
        "seconds": seconds,
        "_tables": tables,
        "_images": images,
    }


def main() -> None:
    corpus, variants = Path(sys.argv[1]), sys.argv[2:] or ["default", "simple"]
    work = Path(tempfile.mkdtemp(prefix="fidelity-"))
    header = f"{'document':10}" + "".join(f"| {v:^38}" for v in variants)
    print(header)
    print(f"{'':10}" + "".join("| words pages layout tbl img  secs  " for _ in variants))
    totals = {v: collections.defaultdict(float) for v in variants}
    pdfs = sorted(corpus.glob("*.pdf"))
    for pdf in pdfs:
        row = f"{pdf.stem:10}"
        for v in variants:
            try:
                r = measure(pdf, v, work)
            except Exception as exc:  # noqa: BLE001 - a failing variant must not stop the comparison
                row += f"| FAILED {type(exc).__name__}: {str(exc)[:24]:24} "
                continue
            for k, val in r.items():
                totals[v][k] += val
            row += f"| {r['words']:.2f}  {r['pages']:.2f}  {r['layout']:.2f}   {r['_tables']}/{EXPECTED_TABLES.get(pdf.stem, 0)} {r['_images']}/{EXPECTED_IMAGES.get(pdf.stem, 0)} {r['seconds']:5.1f}  "
        print(row)
    n = len(pdfs)
    print(f"{'MEAN':10}" + "".join(
        f"| {totals[v]['words']/n:.2f}  {totals[v]['pages']/n:.2f}  {totals[v]['layout']/n:.2f}   {totals[v]['tables']/n:.2f} {totals[v]['images']/n:.2f}  {totals[v]['seconds']/n:5.1f}  " for v in variants))
    print("work dir:", work)


if __name__ == "__main__":
    main()
