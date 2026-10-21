# Phase 4 - OCR, history, and the Word conversions

**Status:** built and tested in a Linux sandbox. Not yet run on Windows.

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` (TypeScript and interface tests) | 184 pass |
| `npm run engine:test` (Python engine) | 161 pass, against real Tesseract 5.3.4 and LibreOffice 24.2 |
| `npm run build` | passes |
| Real window, dialogs, Tesseract and LibreOffice on Windows | **not run** (needs your check) |

## Fixes in 0.4.1 (after your first Windows test)

You reported two problems. Neither could be reproduced in my sandbox, so the fixes make the app
survive them and say exactly what is wrong.

**1. "The PDF engine stopped unexpectedly" on every operation, and files stuck on "Checking…".**
The most likely cause is a Python package that Phase 3 or 4 added (Pillow, mammoth, python-docx,
pdf2docx) not being installed in your `python-engine\.venv`: the engine imported every feature when
it started, so one missing package stopped everything. I reproduced that class of failure.
- The engine now loads each feature **only when it is used**. A missing package breaks only the
  feature that needs it; Merge, Split, Organize, Compress and the rest keep working. (Tested by
  running the real engine with the Word packages blocked.)
- If a package is missing, the message names it and says what to do.
- If the engine does crash, the message now includes its last error line, for example
  `(ImportError: DLL load failed while importing cv2)`.

**2. PDF to Word: "The operation failed unexpectedly".**
That message means an error escaped my handling. In my tests, realistic Word-made PDFs, including
single pages cut out by Split, convert fine, so the cause depends on your computer (the layout
converter needs OpenCV and NumPy, which can fail to load on some Windows setups).
- PDF to Word now **falls back to a simpler converter** (`PyMuPDF` + `python-docx`, no OpenCV) if the
  layout converter cannot be used, crashes on a file, or writes a file Word cannot open.
- The simple converter keeps text, bold, italic, size and color, bullet lists, centered lines,
  right-to-left text (Urdu, Arabic), pictures and page breaks. It does **not** detect tables or
  columns. The result always says which method was used, and why when it was the fallback, for
  example `(ModuleNotFoundError: No module named 'cv2')`.
- If both methods fail, the message includes the error type and text.
- Any unexpected engine error now reads `The operation failed unexpectedly. (ErrorType: message)`
  instead of hiding the cause.

**New tools**
- `npm run engine:check` lists every Python package and optional program and what each is for.
- `npm run dev` now warns in the terminal if the engine is not set up or is missing packages.
- `npm run engine:setup` no longer stops at the first package that cannot be installed: it installs
  the rest one at a time, then runs the check.

### If something still fails
1. Run `npm run engine:setup`, then `npm run engine:check`. Everything required should say `ok`.
2. Run `npm run dev` and try again. The message under the failed job now names the cause. If it is
   a PDF to Word fallback note, the reason is in brackets at the end.
3. Send me that message. The terminal running `npm run dev` also prints the engine's full error.

## Added at your request: Word conversions that need no extra software

Not every user has LibreOffice, and PDF to Word is something people really need.

**Word to PDF without LibreOffice.** `.docx` files now convert with a built-in converter
(`mammoth` + PyMuPDF's HTML layout). Checked visually and by tests on a document with a heading,
bold and italic, a bullet list, a table, a picture and Urdu text: all came through.
- Kept: text, headings, bold and italic, lists, tables, pictures, right-to-left text.
- **Not kept:** headers and footers, page numbers, columns, text boxes, exact fonts and page layout.
  The app says so under every result.
- If LibreOffice is installed it is used instead for `.docx` (closer layout), and it is the only way
  to convert `.doc`, `.odt` and `.rtf`. Without it those formats show a clear message: save the
  file as `.docx` in Word, or install LibreOffice.

**PDF to Word (`.docx`).** Uses `pdf2docx` (MIT). It rebuilds paragraphs, bold and italic, bullets
and pictures from where they sit on the page. Tested on a report with a heading, formatting, bullets
and a picture: all kept.
- **Tables are only kept as Word tables when they have visible lines.** In my test, a table drawn with
  borders was not detected and came out as aligned text. Check tables after converting.
- Scanned PDFs have no text to rebuild, so the app says so and points to OCR.
- Complex designed pages (brochures, forms, columns) may need touching up in Word.
- The layout converter cannot be interrupted part-way, so Cancel may wait on a large PDF.
- If the layout converter cannot be used on your computer, a simpler converter makes the file instead
  (text, formatting, lists and pictures; no tables or columns) and says so.

## What Phase 4 adds

### OCR & Text Extraction
- Reads scanned **PDFs** and **images** (PNG, JPEG, TIFF, GIF, BMP, WebP) with the free Tesseract,
  on this computer. Nothing is uploaded.
- **Result:** a `.txt` file with a preview in the app, or a **searchable PDF** (the page pictures with
  a hidden text layer). The searchable PDF can be larger than the original, because pages that
  needed recognition are re-rendered.
- **Languages:** you choose from the languages installed for Tesseract (up to 5 at once).
- **Scan detail:** 150, 200, 300 (default) or 400 dpi.
- **Pages that already have text** can be used as they are, so only picture pages are read. The result
  says how many pages were recognized and how many were reused.
- Missing Tesseract, a missing language, or a page with no recognizable text each give a clear
  message, and nothing is saved.
- Every result carries the reminder that recognition is never perfect.

### Recent Files (history)
- Every finished job (done, failed or cancelled) is listed with its time, input names, result name,
  size and location.
- **A history entry is a reference.** Before you open a result the app checks the file is still
  there. If it was moved or deleted, the entry says so instead of failing.
- **Privacy:** history stores file names and where results were saved. Never document contents, and
  never the text OCR recognized (the preview lives only in memory for the current session).
- Capped at 200 jobs. Damaged entries are ignored, and a damaged history file never stops the app.

### Settings
- **Keep a history** on or off (off stops new entries), and **Clear history** (asks first).
- **Clean up leftover temporary files** when the app starts: removes only DocuForge's own
  `.docuforge-*.tmp` files and `docuforge-lo-*` / `docuforge-ocr-*` work folders that are more than an
  hour old, in the folders you saved to and in the system temp folder.
- **Optional programs** panel: shows whether Tesseract (and which languages) and LibreOffice were
  found, with "Check again".

## How it works

- **OCR job:** same pipeline as before. The engine renders one page at a time to a private temporary
  folder, runs `tesseract` with an argument list (never a shell), and removes the folder afterwards.
  Language codes are checked against a strict pattern and against the installed list before
  anything runs. Cancel stops Tesseract and its helper processes.
- **Shared subprocess runner** (`subprocess_utils.py`): used by LibreOffice and Tesseract. It checks for
  cancel every 0.2 s, enforces a timeout, and stops the whole process tree.
- **History:** `onFinished` in `JobManager` fires once per finished job; `HistoryStore` saves it
  atomically. History is flushed before the app quits.
- **Tools status:** the engine's `tools_status` reports which optional programs exist and which
  languages are installed, never their paths.

## Connects to Phase 3

- New engine operations (`ocr`, `pdf_to_docx`) are registered in `operations.py`; the protocol,
  queue, progress and cancellation are unchanged.
- `JobResultSummary` gained `note` (how a result was made) and `preview` (OCR text, in memory only).
- `tools_status` gained Tesseract. The Phase 3 Word-to-PDF flow now chooses between the built-in
  converter and LibreOffice automatically.
- `settings.json` gained `saveHistory` and `cleanupTempFiles` (invalid values fall back to defaults).
- OCR and Recent Files are now `available`; no feature is "In development" any more.

## Handed to Phase 5 (packaging)

What the installer must contain or handle:
1. **The Python engine** as a standalone `.exe` (PyInstaller): PyMuPDF, Pillow, pdf2docx, mammoth,
   python-docx, and their dependencies, including numpy and opencv-python-headless. Expect hidden
   imports to need attention (`pdf2docx`, `mammoth`), and a large result.
2. **Tesseract with language data** (Apache-2.0): bundle it or keep it optional. Decide which
   languages ship, and check each language file's license.
3. **LibreOffice stays optional** (not bundled): `.docx` works without it.
4. Test everything on a clean Windows machine with no Python, Node.js, Tesseract or LibreOffice.

## Known limitations

- **Not run on Windows yet.** The Windows install locations for Tesseract and LibreOffice are
  searched but untested; dialogs, process stopping (`taskkill`) and the real UI need your check.
- **OCR accuracy is not measured.** It was tested only on clean, synthetic English text. Only English
  language data was available here, so Urdu, Arabic and other languages use the same code path but
  were not run. Accuracy varies by language, script and scan quality.
- **No benchmarks** for large or many-page scans. Reading a page takes seconds.
- **No drag and drop.** The installer still does not contain the engine (Phase 5).
- PDF to Word: tables without visible lines become aligned text (see above).
- Word to PDF (built-in): headers, footers, exact layout are not kept.
- History keeps result paths on your computer (never contents) and is capped at 200 jobs.

## Done when

- [x] Typecheck, lint, TypeScript tests, Python tests and build pass.
- [x] OCR works against real Tesseract, with tests for bad languages, missing Tesseract, blank pages,
      page ranges, images, searchable PDF output, and cancel (no temporary files left).
- [x] Word to PDF works with no LibreOffice, and PDF to Word works, both with tests.
- [ ] On Windows: install Tesseract, run `npm run engine:setup`, and OCR a scanned PDF and an image.
- [x] The engine keeps working, and names the problem, when a Python package is missing.
- [x] PDF to Word falls back to the simple method when the layout converter fails (tested).
- [ ] On Windows: `npm run engine:check` shows everything `ok`.
- [ ] On Windows: Word to PDF on a `.docx` without LibreOffice; PDF to Word on a real report, and
      the result note says which method was used.
- [ ] On Windows: Recent Files lists jobs; opening a moved file says it is gone; Clear history works.
- [ ] On Windows: Settings shows Tesseract and its languages correctly.
