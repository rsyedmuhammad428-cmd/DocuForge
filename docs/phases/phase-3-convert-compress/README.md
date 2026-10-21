# Phase 3 - Conversion and compression

**Status:** built and tested in a Linux sandbox. Not yet run on Windows.

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` (TypeScript and interface tests) | 138 pass |
| `npm run engine:test` (Python engine) | 107 pass (LibreOffice tests ran, LibreOffice 24.2) |
| `npm run build` | passes |
| Real window, dialogs, LibreOffice on Windows | **not run** (needs your check) |

## What changed since Phase 2

- **Fixed: Organize previews stuck on "Loading…" in `npm run dev`.** React runs effects twice in
  development, and the preview loader was shut down for good on the first cleanup. A test now
  reproduces it (it failed before the fix) and the loader can restart. Packaged builds were not
  affected.
- **New: Convert Files and Compress PDF** (both now `available`).

## What you can do now

| Conversion | Notes |
|---|---|
| PDF to images | PNG or JPEG, 72 to 300 dpi, all pages or a range. One file per page. |
| Images to PDF | PNG, JPEG, GIF, BMP, TIFF, WebP. One image per page, reorderable. A4 with margin, or each image's own size. |
| PDF to text | UTF-8 `.txt`, optional "Page N" lines, optional page range. |
| Text to PDF | A4, 11 pt. Latin, Cyrillic, Greek and Arabic-script text (including Urdu) works. |
| Word to PDF | `.docx`, `.doc`, `.odt`, `.rtf`. Needs the free LibreOffice. |
| Compress PDF | Three presets, below. |

**Saved on your computer:** every result goes where you choose in a normal Windows dialog. Nothing is
uploaded. Originals are never changed. Cancelled or failed jobs leave no half-finished files.

### Compression presets

| Preset | What it does | Quality |
|---|---|---|
| Light | Cleans up and repacks the file. Pictures untouched. | No loss |
| Balanced | Pictures sharper than 170 dpi go to 150 dpi, JPEG quality 75. | Slight picture loss |
| Smallest | Pictures sharper than 120 dpi go to 96 dpi, JPEG quality 50. | Softer pictures |

Text and drawings are never changed. If a result would save less than 1%, nothing is saved and the
app says the PDF is already compact.

**Measured, on one synthetic test file** (a 4.4 MB page with a large noisy photo; real PDFs will
differ): Balanced 39% smaller in 1.0 s, Smallest 94% smaller in 0.2 s, Light "already compact".
No benchmark on real-world or 300+ page PDFs yet.

## Not included, and why

- **PDF to Word or Excel.** Reliable results need tools DocuForge does not include, and a poor
  result would look like a success. The Convert page says so.
- **OCR.** Scanned PDFs have no text, so PDF to text reports that clearly. OCR is Phase 4.
- **Ghostscript.** The Phase 3 plan used it. PyMuPDF can recompress images itself, which is simpler
  to ship and was testable here, so Ghostscript was dropped.

## How it works

Same pipeline as Phase 2. Each conversion is one more engine operation and one more job type:

1. **Page** sends a job request with file ids (never paths). `shared/jobs.ts` validates it.
2. **`job-preparer.ts`** turns ids into paths and refuses any output that would overwrite an input.
3. **`JobManager`** queues and runs it; the engine runs it in its own process
   (`python-engine/docuforge_engine/convert/` and `pdf_tools/compress.py`).
4. **`OutputTransaction`** writes to a temp file, verifies it (PDF page count, image decodes, text
   not empty), then moves it into place. It now checks `pdf`, `image` and `text` outputs.

The list of conversions lives in one table, `src/features/convert/conversions.ts`, and the screen
reads it. A conversion is added there only when it is built and tested. A test checks that the
screen offers exactly that list.

### Details worth knowing

- **Images to PDF:** plain JPEGs are embedded as they are (no quality loss, checked by a test).
  Photos taken sideways are turned upright (EXIF). Transparency is placed on white.
- **Text to PDF:** encoding is detected (UTF-8, UTF-8 with BOM, UTF-16 with BOM, else
  Windows-1252). Urdu was checked visually once and by an automated font test.
- **Word to PDF:** the file's signature is checked first, because LibreOffice turns a damaged
  `.docx` into a PDF of garbage text. LibreOffice runs with its own private profile, so an open
  LibreOffice window does not interfere. Cancel stops it and its helper processes.
- **Missing LibreOffice:** the Word option explains what to install and has "Check again".
- **Limits:** one rendered page may not exceed 80 million pixels; text files may not exceed 10
  million characters or 5000 pages.

## Connects to Phase 2

- New engine operations are registered in `operations.py`; the protocol, progress, cancellation and
  job queue are unchanged.
- New job types are added to `JobRequestSchema` and `job-preparer.ts`.
- The single "open PDF" dialog became `files:select` with a kind (`pdf`, `image`, `text`,
  `document`), and the save dialog takes a kind (`pdf` or `text`). Merge, Split and Organize use
  the same calls with `pdf`.
- Compression results report the original size, so the panel can show the saving.
- `tools:status` asks the engine which optional programs exist.

## Handed to Phase 4

- The engine can render pages to images (needed as OCR input) and says when a PDF has no text.
- The pattern for an optional external program: locate it (`tools.py`), report it in
  `tools_status`, run it with an argument list, honour cancel, and show a clear message if missing.
  OCR will use it for Tesseract.
- Job results already carry what history needs: title, status, output name, location, size.

## Known limitations

- **Not run on Windows yet.** Dialogs, LibreOffice discovery under `Program Files`, and process
  stopping on Windows (`taskkill`) are untested there.
- **No drag and drop.** The installer still does not contain the engine (Phase 5).
- **Compression cannot be interrupted** while it recompresses images; cancel waits for it, or stops it
  after 5 seconds.
- Word to PDF layout can differ slightly from Microsoft Word.
- Chinese, Japanese, Korean and emoji may not display in Text to PDF.
- Images in other formats (HEIC, RAW) are not supported.

## Done when

- [x] Strict typecheck, lint, TypeScript tests, Python tests and build pass.
- [x] Every listed conversion has automated tests, including bad and missing input and cancel.
- [x] The Node launcher and the Python engine work together for the new operations.
- [ ] On Windows: Organize previews appear in `npm run dev`.
- [ ] On Windows: each conversion and each compression preset works on your own files.
- [ ] On Windows with LibreOffice installed: Word to PDF works; without it, the message appears.
- [ ] On Windows: cancelling a long PDF-to-images job leaves no files behind.
