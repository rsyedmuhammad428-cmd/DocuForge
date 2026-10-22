# Phase 6 - Branded installer wizard

**Status:** written, **not yet built or run.** The wizard was prepared on a Linux machine with no Windows and no
NSIS, so the installer has never been compiled. Build it on Windows (steps below) and walk through the checklist
before you share it.

**Branding:** DocuForge - *Powered by RazaZaidi.AI*

## What this phase changes

DocuForge already had a step-by-step Windows installer (Phase 5). This phase gives it its own look and one more
page. The app, the Python engine and all tools are untouched.

| Page | What the user sees |
|---|---|
| Welcome | "Welcome to DocuForge", "Powered by RazaZaidi.AI", new sidebar picture with the logo |
| License | Privacy policy and license; must be accepted (unchanged) |
| Install folder | Choose the folder, and for you only / for everyone (unchanged) |
| **Choose shortcuts** (new) | Checkboxes: desktop shortcut, Start Menu shortcut (both on by default) |
| Installing | Progress bar with status lines: "Creating shortcuts ...", "Checking the PDF engine ...", "Finishing the installation ..." |
| Finish | "DocuForge is ready", Finish button, **Launch DocuForge** checkbox |

Also: the uninstaller removes both shortcuts, and after the files are copied the installer runs the bundled
engine's own check (`docuforge-engine.exe --check`). That check is informational: if it reports a problem the
install still completes and the message appears in the progress log.

A silent install (`DocuForge-Setup-0.5.0.exe /S`) skips the shortcuts page and creates both shortcuts, as before.

## Files in this phase

| File | Change |
|---|---|
| `build/installer.nsh` | **New.** All wizard wording, the shortcuts page, status messages, engine check, shortcut removal |
| `build/installerHeader.bmp` | **New.** 150 x 57 header picture for the inner pages |
| `build/installerSidebar.bmp` | Redrawn: logo, name, "Powered by RazaZaidi.AI" |
| `electron-builder.yml` | Uses the new header picture; electron-builder's automatic shortcuts are switched off (the wizard page creates them) |
| `scripts/make-icons.py` | Draws the sidebar and header pictures (run `npm run icons` only if you want to redraw them) |

electron-builder picks up `build/installer.nsh` by itself. The installer is still named
`DocuForge-Setup-<version>.exe`, and the version comes from `package.json` (currently 0.5.0).

## Install the dependencies (on Windows 10/11 x64)

Install these once: **Node.js 22 or newer**, **Python 3.12 or newer** (tick "Add python.exe to PATH"), and **Git**.
Then, in the DocuForge folder, in PowerShell or Command Prompt:

```
npm ci
npm run engine:setup
```

* `npm ci` installs the app's packages (Electron, electron-builder, React, Vite and so on) from `package-lock.json`.
* `npm run engine:setup` creates `python-engine\.venv` and installs the Python packages from
  `python-engine\requirements.txt`: PyMuPDF, Pillow, pdf2docx, mammoth, python-docx (and pytest for tests).

The build tools PyInstaller and pip-licenses are installed automatically by `npm run engine:build` (part of
`npm run dist`). electron-builder downloads Electron and the NSIS tools the first time it runs, so the first
build needs internet.

## Build the installer

```
npm run dist
```

That runs, in order: typecheck, renderer build, Electron build, the Python engine build (PyInstaller, a few
minutes), the license and notices files, then electron-builder. The result is:

```
release\DocuForge-Setup-0.5.0.exe
```

Optional checks before you build: `npm run typecheck`, `npm run lint`, `npm test`, `npm run engine:test`.

**No Windows machine?** Push the project to GitHub, open **Actions > Build Windows installer > Run workflow**, and
download `DocuForge-Setup` from the finished run. The workflow already installs everything above.

**Optional OCR in the installer:** copy Tesseract to `build\bundled-tools\tesseract\` first (see
`build\bundled-tools\README.txt`). The GitHub workflow does this for you.

## Test checklist (do this on a clean Windows machine or VM)

- [ ] Welcome page shows "Welcome to DocuForge" and "Powered by RazaZaidi.AI", with the new sidebar
- [ ] License page must be accepted before Next works
- [ ] Install-folder page lets you change the folder
- [ ] "Choose shortcuts" page appears after it; unticking a box skips that shortcut
- [ ] Progress bar fills and shows the status lines
- [ ] Finish page shows "Launch DocuForge"; ticked, the app starts; unticked, it does not
- [ ] DocuForge opens and one PDF tool works (this proves the Python engine was installed)
- [ ] Uninstall (Settings > Apps) removes the program and both shortcuts

## What I could not verify

- **The installer was never built, and the app never launched after installing.** No Windows, no NSIS, and no
  access to the npm registry in the sandbox where this was written.
- `build/installer.nsh` uses electron-builder's documented hook names (`customHeader`,
  `customPageAfterChangeDir`, `customInstall`, `customUnInstall`) but was not compiled against them. If
  `npm run dist` fails with an error mentioning `installer.nsh`, send the error text and it can be fixed quickly.
- The look is a branded classic NSIS wizard, not Windows 11 Fluent styling (NSIS cannot do that).
- Still unsigned: Windows SmartScreen will warn the first time ("More info" > "Run anyway").

## Done when

- [ ] `npm run dist` (or the GitHub workflow) produces `DocuForge-Setup-0.5.0.exe`
- [ ] Every item in the test checklist passes
