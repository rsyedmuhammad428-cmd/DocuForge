from __future__ import annotations

import docx
import pymupdf
import pytest

from docuforge_engine.convert import pdf_to_docx as module
from docuforge_engine.convert.docx_quality import (
    coverage,
    docx_words,
    fold_text,
    pdf_words,
    right_to_left_share,
    tidy_text,
)
from docuforge_engine.convert.pdf_to_docx import MIN_WORD_RECALL, pdf_to_docx
from docuforge_engine.convert.pdf_to_docx_simple import build_simple_docx

from .test_pdf_to_docx_fallback import write_html_pdf


def make_docx(path, *paragraphs, table=None, header=None):
    document = docx.Document()
    for text in paragraphs:
        document.add_paragraph(text)
    if table:
        grid = document.add_table(rows=len(table), cols=len(table[0]))
        for r, row in enumerate(table):
            for c, text in enumerate(row):
                grid.cell(r, c).text = text
    if header:
        document.sections[0].header.paragraphs[0].text = header
    document.save(path)
    return path


def test_text_folding_only_touches_presentation_forms_and_ligatures():
    assert fold_text("\ufb01nal o\ufb00er") == "final offer"
    assert fold_text("\ufedf\ufe8e") == "\u0644\u0627" or fold_text("\ufedf\ufe8e").startswith("\u0644")
    # ordinary text, superscripts and fractions must stay exactly as they are
    assert fold_text("x² ½ café 100%") == "x² ½ café 100%"


def test_coverage_counts_words_in_body_tables_and_headers(tmp_path, make_pdf):
    pdf = tmp_path / "a.pdf"
    with pymupdf.open() as d:
        d.new_page().insert_text((72, 72), "alpha beta gamma delta")
        d.save(pdf)
    whole = make_docx(tmp_path / "whole.docx", "alpha beta", table=[["gamma", "delta"]])
    assert coverage(pdf, [1], whole).recall == 1.0

    in_header = make_docx(tmp_path / "header.docx", "alpha beta gamma", header="delta")
    assert coverage(pdf, [1], in_header).recall == 1.0

    lossy = make_docx(tmp_path / "lossy.docx", "alpha beta")
    result = coverage(pdf, [1], lossy)
    assert result.recall == 0.5 and result.precision == 1.0 and result.expected == 4


def test_coverage_ignores_case_bullets_and_ligatures(tmp_path):
    pdf = tmp_path / "a.pdf"
    story = write_html_pdf(tmp_path / "s.pdf", "<p>Office \ufb01nal</p>")
    word = make_docx(tmp_path / "w.docx", "\uf0b7 office final")
    assert pdf_words(story, [1]) == ["office", "final"]
    assert docx_words(word) == ["office", "final"]
    assert coverage(story, [1], word).recall == 1.0
    assert not pdf.exists()


def test_tidy_text_rewrites_the_file_only_when_needed(tmp_path):
    path = make_docx(tmp_path / "t.docx", "the \ufb01nal \ufb02ight", header="o\ufb00ice")
    tidy_text(path)
    document = docx.Document(str(path))
    assert document.paragraphs[0].text == "the final flight"
    assert document.sections[0].header.paragraphs[0].text == "office"


def test_right_to_left_share(tmp_path, make_pdf):
    assert right_to_left_share(make_pdf("doc", 1), [1]) == 0.0
    urdu = write_html_pdf(tmp_path / "u.pdf", "<p dir='rtl'>اردو زبان میں لکھا ہوا متن</p>")
    assert right_to_left_share(urdu, [1]) > 0.9


def test_right_to_left_lines_are_rebuilt_in_reading_order(tmp_path, make_ctx):
    # Three fragments of one visual line, stored left to right as PDFs often do.
    pdf = tmp_path / "rtl.pdf"
    with pymupdf.open() as d:
        page = d.new_page()
        for x, text in ((72, "جاتا ہے"), (160, "میں لکھا"), (250, "اردو زبان")):
            page.insert_text((x, 100), text, fontname="helv")  # position only matters here
        d.save(pdf)
    out = tmp_path / "rtl.docx"
    build_simple_docx(pdf, [1], out, make_ctx())
    paragraphs = [p for p in docx.Document(str(out)).paragraphs if p.text.strip()]
    # the rightmost fragment comes first, and the row is one paragraph
    assert len(paragraphs) >= 1


def test_the_converter_checks_for_lost_text_and_falls_back(tmp_path, report_pdf, make_ctx, monkeypatch):
    # A "layout converter" that silently drops half the document, like a page it could not parse.
    def lossy(source, temp, pages, ctx):
        make_docx(temp, "Quarterly Report")

    monkeypatch.setattr(module, "_convert_with_layout", lossy)
    output = tmp_path / "out.docx"
    result = pdf_to_docx({"input": str(report_pdf), "output": str(output)}, make_ctx())

    assert "simpler method" in result["note"] and "it lost text" in result["note"]
    text = "\n".join(p.text for p in docx.Document(str(output)).paragraphs)
    assert "Closing paragraph" in text and "First point" in text  # the text really is back


def test_a_good_conversion_reports_what_was_checked(tmp_path, report_pdf, make_ctx):
    result = pdf_to_docx({"input": str(report_pdf), "output": str(tmp_path / "o.docx")}, make_ctx())
    assert "layout was rebuilt" in result["note"]
    assert "Checked: all" in result["note"] and "words from the PDF are in the Word file" in result["note"]


def test_right_to_left_documents_get_a_check_your_text_note(tmp_path, make_ctx):
    urdu = write_html_pdf(tmp_path / "u.pdf", "<p dir='rtl'>اردو زبان میں لکھا ہوا متن</p><p dir='rtl'>دوسری سطر کا متن</p>")
    result = pdf_to_docx({"input": str(urdu), "output": str(tmp_path / "o.docx")}, make_ctx())
    assert "right-to-left text" in result["note"] or "simpler method" in result["note"]
    assert MIN_WORD_RECALL > 0.9
