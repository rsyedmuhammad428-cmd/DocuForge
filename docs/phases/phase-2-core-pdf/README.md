# Phase 2 - Core PDF operations

**Status:** built and tested in a Linux sandbox. Not yet run on Windows. See "Done when".

| Check | Result |
|---|---|
| `npm run typecheck` (strict, 3 projects) | passes |
| `npm run lint` | passes |
| `npm test` (TypeScript) | 115 tests pass |
| `npm run engine:test` (Python engine) | 54 tests pass |
| `npm run build` | passes |
| Opening the window, native dialogs, the real UI | **not run** (needs your Windows check) |

## Goal

Make the first three tools really work: **Merge PDF**, **Split PDF** and **Organize PDF**. This
phase also builds the machinery every later tool reuses: the Python engine, the job system, and
safe file handling.

## What you can do now

- **Merge:** add several PDFs, reorder them, remove any, merge into one new PDF.
- **Split:** extract pages into one PDF, split by ranges, one file per page, or every N pages.
- **Organize:** see page previews, select pages, turn them, move them earlier or later, delete
  them, then save all pages or only the selected ones as a new PDF.
- Cancel any running job, open the result, or show it in its folder.
- Choose a default folder for save dialogs in Settings.

Your original files are never modified.

## Setup (new in this phase)

```powershell
npm install
npm run engine:setup     # once: creates python-engine\.venv and installs PyMuPDF
npm run dev
```

If Python is missing, `engine:setup` says so. If the engine is not set up, jobs fail with a message
telling you to run `npm run engine:setup`. To use a different Python, set `DOCUFORGE_PYTHON`.

## How it works

1. **Choosing files.** The main process opens the native dialogs. It keeps the real paths and gives
   the page only opaque ids (`FileRegistry`). A job can name a file only through an id a dialog
   issued, so the page cannot make the app read or write an arbitrary location.
2. **Starting a job.** The page sends a small request (operation, ids, options). The main process
   validates it with zod, turns ids into paths (`job-preparer.ts`), and refuses any output that is
   one of the inputs.
3. **Queue.** `JobManager` runs at most 2 jobs at once; the rest wait. A job moves through
   `queued, running, then succeeded / failed / cancelled` (`shared/job-state.ts`). Updates are pushed
   to the page, with progress throttled to about 10 per second.
4. **The engine.** Each job starts its own Python process (`engine-process.ts`). One JSON request
   goes in on stdin; one JSON message per line comes back on stdout: `progress`, then a final
   `result` or `error`. No local web server. Every message is validated before it is trusted.
5. **Safe output.** The engine writes to a hidden temp file next to the destination, checks it opens
   and has the expected page count, and only then moves it into place. If anything fails or the job
   is cancelled, temp files and anything the job already created are removed.
6. **Cancel.** The app sends a cancel message; the engine stops between steps and cleans up. If it
   has not stopped after 5 seconds it is killed, and the app sweeps leftover `.docuforge-*.tmp`
   files itself.
7. **Quit while working.** Quitting cancels running jobs and waits for them to clean up first.

Page numbers are one-based and ranges are inclusive everywhere except the Organize page model,
which uses zero-based source indexes and converts at the edge.

### Engine operations

| Operation | What it does |
|---|---|
| `inspect` | Page count or a clear error for each file |
| `merge` | Several PDFs, in order, into one new PDF |
| `split` | Modes `extract`, `ranges`, `each`, `chunks` |
| `organize_export` | Keep, order and rotate pages into a new PDF |
| `thumbnails` | Small JPEG previews of chosen pages |

### Rules worth knowing

- Split never overwrites: an existing name gets `(2)`, `(3)`, and so on.
- Merge and Organize replace only the exact file you chose in the save dialog, which Windows
  confirms with you first, and never an input file.
- Page ranges must stay inside the document and must not overlap. Ranges keep the order you type.
- Password-protected and damaged PDFs fail with a clear message naming the file.
- Previews are rendered only for pages on screen, 160 px wide, at most 60 per request, and at most
  300 are kept in memory. Scrolled-away previews reload when needed.

## Connects to Phase 1

- New channels reuse the Phase 1 pattern: a name in `shared/ipc.ts`, a method on `DocuForgeApi`,
  exposure in `electron/preload.ts`, and registration through the same helper, so every channel gets
  the sender check and validation. The helper moved to `electron/ipc/handler.ts` and gained a
  context (the sending window, for dialogs) and `UserFacingError`.
- `SettingsSchema` gained `defaultOutputFolder`. The page may only clear it; setting it requires the
  native folder dialog.
- Merge, Split and Organize are `available` in `src/features/registry.ts`, with explicit routes in
  `src/app/App.tsx`, as the Phase 1 README required.
- The status bar and Home now read live job state.

## Handed to Phase 3

- **Engine:** add an operation to `python-engine/docuforge_engine/operations.py`. The protocol,
  progress, cancellation and `OutputTransaction` (safe output) are reused as they are.
- **App:** add the operation to `shared/jobs.ts` (`JobRequestSchema`), a case in
  `electron/services/job-preparer.ts`, and the page. The job manager, queue and status panel need no
  changes.
- **Engine can already render pages to images** (`thumbnails.py`), which OCR will need.
- New dependencies go into `python-engine/requirements.txt`. External programs (Ghostscript) must be
  located and checked the way `engine-locator.ts` handles Python.

## Files added

```
python-engine/                  docuforge_engine/ (protocol, context, safe_output, pdf_tools/), tests/
shared/                         jobs, job-state, page-ranges, files, engine-protocol (+ tests)
electron/ipc/                   handler, files, pdf, jobs, register
electron/services/              file-registry, job-preparer, job-manager, engine-process,
                                engine-locator, line-splitter, pdf-service, temp-cleanup, limiter
src/features/                   merge/, split/, organize/ (page model, thumbnail loader, cards)
src/hooks/, src/components/     useJobs, useInView, JobStatusPanel, Button, Notice
scripts/                        setup-engine.mjs, test-engine.mjs
```

## Known limitations

- **Not run on Windows yet.** Dialogs, file locking when a PDF is open in another program, long
  paths, and the real UI have not been exercised. Expect some small fixes.
- **No drag and drop.** Use the buttons. (Safe drag and drop needs a separate design, because dropped
  paths come from the page.)
- **The installer does not contain the engine yet.** An installed build cannot process PDFs until
  Phase 5 bundles it; it reports that clearly. Development (`npm run dev`) works.
- **Password-protected PDFs are rejected**, not unlocked.
- **No benchmarks yet.** Behavior on very large PDFs (300+ pages) is designed for (one page at a
  time, lazy previews) but not measured.
- **A cancel that arrives while the engine is moving the finished file into place** may come too late.
  The job then reports success, because the output really exists.
- **Job history is in memory only** (last 50). Saved history is a later phase.
- Previews are approximate: a turned page is shown scaled to fit its card.

## Done when

- [x] Strict typecheck, lint, TypeScript tests, Python tests and build pass.
- [x] The Node launcher and the Python engine work together (integration test, including cancel).
- [ ] `npm run engine:setup` then `npm run dev` opens the app on Windows.
- [ ] Merge, Split (all four modes) and Organize work on your own PDFs, including a password-protected
      one and a damaged one, which must fail with clear messages.
- [ ] Cancelling a long split leaves no files behind.
- [ ] A 300+ page PDF stays responsive in Organize.
