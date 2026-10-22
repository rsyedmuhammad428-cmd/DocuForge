"""Tries different pdf2docx settings on the corpus and prints the mean scores. Development tool."""

from __future__ import annotations

import collections
import logging
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import measure  # noqa: E402

CONFIGS = {
    "default": {},
    "strict": {"ignore_page_error": False, "raw_exceptions": True},
    "margin0": {"ignore_page_error": False, "raw_exceptions": True, "page_margin_factor_top": 0.0, "page_margin_factor_bottom": 0.0},
    "margin1": {"ignore_page_error": False, "raw_exceptions": True, "page_margin_factor_top": 1.0, "page_margin_factor_bottom": 1.0},
    "tightlines": {"ignore_page_error": False, "raw_exceptions": True, "line_break_free_space_ratio": 0.05, "new_paragraph_free_space_ratio": 0.7},
    "looselines": {"ignore_page_error": False, "raw_exceptions": True, "line_break_free_space_ratio": 0.2, "line_break_width_ratio": 0.7},
    "borders": {"ignore_page_error": False, "raw_exceptions": True, "connected_border_tolerance": 1.5, "min_border_clearance": 1.0, "max_border_width": 8.0},
    "tight2": {"ignore_page_error": False, "raw_exceptions": True, "line_break_free_space_ratio": 0.02, "new_paragraph_free_space_ratio": 0.6},
    "tight3": {"ignore_page_error": False, "raw_exceptions": True, "line_break_free_space_ratio": 0.05, "new_paragraph_free_space_ratio": 0.5, "line_break_width_ratio": 0.4},
    "tightm0": {"ignore_page_error": False, "raw_exceptions": True, "line_break_free_space_ratio": 0.05, "new_paragraph_free_space_ratio": 0.7, "page_margin_factor_top": 0.0, "page_margin_factor_bottom": 0.0},
    "tightsep": {"ignore_page_error": False, "raw_exceptions": True, "line_break_free_space_ratio": 0.05, "new_paragraph_free_space_ratio": 0.7, "line_separate_threshold": 2.5, "min_section_height": 60.0},
    "spacing": {"ignore_page_error": False, "raw_exceptions": True, "max_line_spacing_ratio": 2.0, "line_overlap_threshold": 0.8},
}


def make_variant(settings):
    def run(pdf, out):
        from pdf2docx import Converter

        logging.getLogger().setLevel(logging.ERROR)
        c = Converter(str(pdf))
        try:
            c.convert(str(out), **settings)
        finally:
            c.close()

    return run


def main():
    corpus = Path(sys.argv[1])
    names = sys.argv[2:] or list(CONFIGS)
    work = Path(tempfile.mkdtemp(prefix="tune-"))
    docs = sorted(corpus.glob("*.pdf"))
    print(f"{'config':12} {'words':>6} {'pages':>6} {'layout':>6}   per-document layout")
    for name in names:
        measure.VARIANTS[name] = make_variant(CONFIGS[name])
        totals = collections.defaultdict(float)
        per_doc = []
        for pdf in docs:
            try:
                r = measure.measure(pdf, name, work)
            except Exception as exc:  # noqa: BLE001
                per_doc.append(f"{pdf.stem}:ERR({type(exc).__name__})")
                continue
            for k in ("words", "pages", "layout"):
                totals[k] += r[k]
            per_doc.append(f"{pdf.stem}:{r['layout']:.2f}")
        n = len(docs)
        print(f"{name:12} {totals['words']/n:6.2f} {totals['pages']/n:6.2f} {totals['layout']/n:6.2f}   {' '.join(per_doc)}", flush=True)


if __name__ == "__main__":
    main()
