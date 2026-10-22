"""Checks a converted Word file against its PDF, and tidies text that Word cannot use as is.

Used by PDF to Word to make sure no text is silently lost, and shared with the fidelity benchmark
in tools/fidelity so the app and the benchmark measure the same thing.
"""

from __future__ import annotations

import collections
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import docx
import pymupdf

# Arabic presentation forms (shaped letters stored as separate characters) and Latin ligatures
# such as "ﬁ". PDFs produce them; Word should get the plain letters, which it shapes itself.
_FOLD_TARGETS = re.compile(r"[\ufb00-\ufb06\ufb50-\ufdff\ufe70-\ufefc]")
_WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def fold_text(text: str) -> str:
    """Replaces presentation forms and ligatures by plain letters. Everything else is untouched."""
    return _FOLD_TARGETS.sub(lambda m: unicodedata.normalize("NFKC", m.group()), text)


_SYMBOL_EDGES = re.compile(r"^[\uf000-\uf8ff•·▪◦‣○●■□*|]+|[\uf000-\uf8ff•·▪◦‣○●■□*|]+$")


def _key(word: str) -> str:
    """The form of a word used for comparing: folded, lower case, without bullet symbols at the edges."""
    return _SYMBOL_EDGES.sub("", unicodedata.normalize("NFKC", word).casefold())


def pdf_words(path: Path, page_numbers: list[int]) -> list[str]:
    with pymupdf.open(path) as document:
        tokens = (
            word[4]
            for number in page_numbers
            for word in document.load_page(number - 1).get_text("words")
        )
        return [key for key in (_key(t) for t in tokens if t.strip()) if key]


_SPACING_ELEMENTS = {f"{_WORD_NS}tab", f"{_WORD_NS}br", f"{_WORD_NS}cr"}


def _paragraph_texts(root) -> list[str]:
    """Text of every paragraph. Tabs and line breaks count as spaces, as they do for a reader."""
    paragraphs = []
    for paragraph in root.iter(f"{_WORD_NS}p"):
        parts = []
        for element in paragraph.iter():
            if element.tag == f"{_WORD_NS}t":
                parts.append(element.text or "")
            elif element.tag in _SPACING_ELEMENTS:
                parts.append(" ")
        text = "".join(parts)
        if text.strip():
            paragraphs.append(text)
    return paragraphs


def docx_words(path: Path) -> list[str]:
    """Every word in the body, tables, text boxes, headers and footers."""
    document = docx.Document(str(path))
    texts = _paragraph_texts(document.element)
    seen: set[int] = set()
    for section in document.sections:
        for part in (section.header, section.footer):
            if id(part._element) not in seen:  # noqa: SLF001
                seen.add(id(part._element))  # noqa: SLF001
                texts += _paragraph_texts(part._element)  # noqa: SLF001
    return [key for key in (_key(w) for text in texts for w in text.split()) if key]


@dataclass(frozen=True)
class Coverage:
    expected: int  # words in the PDF
    found: int  # of those, words that are in the Word file
    recall: float  # share of the PDF's words that were carried over (1.0 = none lost)
    precision: float  # share of the Word file's words that really came from the PDF


def coverage(pdf_path: Path, page_numbers: list[int], docx_path: Path) -> Coverage:
    reference = collections.Counter(pdf_words(pdf_path, page_numbers))
    words = docx_words(docx_path)
    candidate = collections.Counter(words)
    expected = sum(reference.values())
    found = sum((reference & candidate).values())

    # A converter sometimes glues two neighbouring words together ("RegionSales"). The text is all
    # there, so that is not a loss. Count a missing word as found if it still appears inside the text.
    joined = "".join(words)
    for word, wanted in (reference - candidate).items():
        if len(word) >= 4 and joined.count(word) >= reference[word]:
            found += wanted

    total = sum(candidate.values())
    return Coverage(
        expected=expected,
        found=min(found, expected),
        recall=min(found, expected) / expected if expected else 1.0,
        precision=min(found, total) / total if total else 1.0,
    )


def tidy_text(docx_path: Path) -> None:
    """Folds presentation forms and ligatures in every piece of text in the file, then saves it."""
    document = docx.Document(str(docx_path))
    roots = [document.element]
    for section in document.sections:
        roots += [section.header._element, section.footer._element]  # noqa: SLF001
    changed = False
    for root in roots:
        for element in root.iter(f"{_WORD_NS}t"):
            if element.text and _FOLD_TARGETS.search(element.text):
                element.text = fold_text(element.text)
                changed = True
    if changed:
        document.save(str(docx_path))


def right_to_left_share(pdf_path: Path, page_numbers: list[int]) -> float:
    """Share of letters that are Arabic, Hebrew and similar scripts."""
    letters = rtl = 0
    with pymupdf.open(pdf_path) as document:
        for number in page_numbers:
            for ch in document.load_page(number - 1).get_text("text"):
                if ch.isalpha():
                    letters += 1
                    rtl += 1 if "\u0590" <= ch <= "\u08ff" or "\ufb1d" <= ch <= "\ufefc" else 0
    return rtl / letters if letters else 0.0
