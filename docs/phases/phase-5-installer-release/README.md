# Phase 5 - Installer and release

**Status:** built and tested in a Linux sandbox. The Windows installer itself could **not** be built or
run here (see "What I could not verify").

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | pass |
| `npm test` (TypeScript and interface tests) | 185 pass |
| `npm run engine:test` (Python engine) | 172 pass |
| Packaged engine (PyInstaller): every operation run against the built program | 15 of 15 pass (Linux build) |
| The real app run on a virtual screen, pages photographed and reviewed | done (Linux) |
| App assembled for Windows by electron-builder (`DocuForge.exe`, engine, license and notices files) | layout verified |
| NSIS installer compiled, installer run on Windows | **not done** (needs Windows) |

## 1. PDF to Word: better formatting, and measured

You asked for the best possible formatting. PDFs have no structure (just text and shapes placed on a
page), so no converter can be perfect. What I did instead of guessing was **measure**.

**A benchmark** (`python-engine/tools/fidelity`): it makes 8 realistic Word documents (a report with
headings, lists, table, picture, header and footer; a formatted letter; two columns; a table-heavy
price list; Urdu; a 14-chapter document; an image gallery; a résumé), turns each into a PDF, converts the
PDF back to Word, turns *that* back into a PDF, and compares pages as pictures. It also checks that no
word was lost.

| Document | Layout, old converter | Layout, now | Words kept, old / now |
|---|---|---|---|
| Report | 0.90 | 0.92 | 1.00 / 1.00 |
| Letter | 0.92 | 0.92 | 1.00 / 1.00 |
| Two columns | 0.33 | 0.41 | 1.00 / 1.00 |
| Table-heavy | 0.83 | 0.83 | 1.00 / 1.00 |
| Long document | 0.87 | **0.93** | 1.00 / 1.00 |
| Image gallery | 0.89 | 0.89 | 1.00 / 1.00 |
| Résumé | 0.89 | 0.89 | 1.00 / 1.00 |
| Urdu | 0.56 | 0.08 | **0.83 / 1.00** |

(1.0 = identical. The layout score is my own picture-similarity measure, so only compare it with
itself, not with other tools.)

**What changed**
- **Tuned the layout converter** by trying settings on the benchmark: tighter rules for where lines and
  paragraphs break. Best on long documents (0.87 to 0.93) and columns.
- **A page that fails now stops the conversion.** The converter used to skip a failing page silently,
  which silently loses content.
- **A text-loss check after every conversion.** It counts the PDF's words and the Word file's words
  (including tables, text boxes, headers and footers). If any are missing, the file is rebuilt with the
  simpler method that keeps all the text, and the result says so. A successful result says how many
  words were checked.
- **Cleaner text:** Arabic presentation forms and ligatures such as "ﬁ" become normal letters, so
  Word can search, shape and edit them.
- **Right-to-left text (Urdu, Arabic):** the simple method now rebuilds each line in reading order, as
  right-to-left paragraphs. The result warns you to check word order and letters.

**The honest limits**
- The two-column page is structurally right (two columns, headings, fonts), but Word balances columns
  differently from the PDF, so it scores lower.
- **Urdu from some PDFs is damaged inside the PDF itself:** in my sample, the letter "ہ" is missing from
  the PDF's text layer, so no converter can recover it. Nothing is lost *relative to the PDF*, but the
  layout score drops because the fallback is used.
- Lists may come out as a small table; tables without visible lines become aligned text; complex
  designed pages (brochures, forms) will need touching up. Commercial converters may do better on those.
- Fonts that are not installed on the reader's computer are replaced by Word.
- Making it better still means more tuning on more real documents. The benchmark is now there to measure
  every change. If you have PDFs that convert badly, send them and I will add them to it.

## 2. The installer, the way real software does it

Configured in `electron-builder.yml`. The installer is the classic step-by-step wizard:

1. **Welcome** page with the DocuForge picture on the left.
2. **License and Privacy Policy** page. You must click **I Agree**. It shows a plain-language privacy
   policy first, then the full AGPL-3.0 license. (Source: `installer/PRIVACY.txt` + `LICENSE`, built by
   `npm run notices`.) The policy is true: I searched the app and engine for any network code, auto-update
   or analytics, found none, and the production security policy blocks outside connections.
3. **Choose the install folder** (and, on Windows, whether to install for you only or for everyone).
4. **Install.** Creates a **desktop shortcut** and a **Start menu shortcut**.
5. **Finish** page with a "Run DocuForge" checkbox.
6. **Uninstall** from "Apps & features". It removes the program together with its settings and history. It
   never touches your documents or saved results.

Also included: the app icon (`build/icon.ico`, drawn by `scripts/make-icons.py`) and
`THIRD_PARTY_NOTICES.txt` (licenses of all bundled software), installed next to the program along with
Electron's own license files.

## 3. How the installer is put together

- **The Python engine** is packaged with PyInstaller (`npm run engine:build`, about 40 seconds): a folder
  with `docuforge-engine.exe`, so users need no Python. It is built as a folder (not one file), so each job
  starts faster. **It must be built on Windows to get a Windows engine.**
- **`npm run engine:smoke`** runs every operation against the packaged engine. This caught nothing broken,
  but a packaged program can fail in ways the normal one does not (missing data files), so it must pass
  before a release.
- **Tesseract (OCR) can be bundled.** Put Tesseract in `build\bundled-tools\tesseract\` (see the README in
  that folder). DocuForge looks there first and uses its own language data. Without it, OCR works if the
  user installs Tesseract themselves, as before.
- **Your repository** is set in `app.config.json`
  (`https://github.com/rsyedmuhammad428-cmd/DocuForge`). The license page points to it as the source
  code, as the AGPL requires.
- **GitHub Actions** (`.github/workflows`): `ci.yml` runs the tests on every push; `release.yml` builds the
  installer on GitHub's Windows machines when you push a tag, runs the tests and the engine smoke test, and
  attaches `DocuForge-Setup-<version>.exe` to a release. **Both were written without being able to run
  them**, so expect to fix a thing or two on the first run.

## 4. Also in this phase

- Removed the large "Drag and drop is not available yet" box from Home. It looked unfinished. Home now
  just asks "What do you want to do?" and shows the tools.
- `npm run engine:check`, `engine:setup` (installs packages one at a time if one fails), and a startup
  warning in `npm run dev` if the engine is not set up.

## How to release (step by step)

1. Copy the files from this zip into your clone of `DocuForge`, then:
   ```powershell
   git add .
   git commit -m "Phase 5: installer, PDF to Word fidelity"
   git push
   ```
   (I can read your public repo but cannot push to it. You need to do this step.)
2. On GitHub, open **Actions** and check that **Tests** passes.
3. Build the installer: either push a tag (`git tag v0.5.0` then `git push origin v0.5.0`), or open
   **Actions > Build Windows installer > Run workflow**.
4. Download `DocuForge-Setup-0.5.0.exe` (from the release, or from the run's artifacts).
5. **Test it on a clean Windows machine or VM** (no Python, no Node, no Tesseract): walk through every
   installer page, open the app, run each tool, then uninstall.

## What I could not verify

- **The Windows installer was never built or run.** electron-builder needs Wine to build the uninstaller
  on Linux, which my sandbox does not have. I verified everything up to that step (the app layout, files,
  license and notices), the configuration parses, and the packaged engine works, but not the installer's
  pages, shortcuts or uninstaller.
- The Windows engine and the GitHub Actions workflows are untested. The Tesseract-bundling step downloads
  Tesseract with Chocolatey and language data from GitHub; it is allowed to fail.
- **Unsigned:** Windows will show "Windows protected your PC" (SmartScreen) the first time. Click "More
  info", then "Run anyway". A code-signing certificate (paid) removes this; the free SignPath Foundation
  program for open-source projects is worth applying to.
- Size: the Linux engine is 314 MB. The Windows installer should be roughly 250 to 300 MB.
- OCR accuracy is still unmeasured beyond English, and Urdu OCR has not been run.

## Done when

- [x] All tests pass; the packaged engine passes its smoke test; the app layout for Windows is assembled.
- [x] PDF to Word is measured, tuned, and never silently loses text.
- [ ] `Tests` and `Build Windows installer` workflows pass on GitHub.
- [ ] The installer runs on a clean Windows machine: license page requires agreement, desktop shortcut
      appears, app launches from the finish page, every tool works offline, uninstall is clean.
- [ ] You compare PDF to Word on your own PDFs and send me any that look wrong.

## Handed to Phase 6 (website and your dashboard)

- Download website: it will find the latest installer from your repo's releases, show real screenshots
  (`scripts/screenshots.mjs` photographs the running app), privacy statement, install steps, SmartScreen
  help and FAQ.
- Your dashboard: download counts per version from GitHub's public release data, with a daily snapshot
  saved by a workflow so you can see a trend. It cannot count visitors or users, because the app does not
  track anyone.
