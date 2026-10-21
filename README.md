# DocuForge Desktop

Free, open-source, offline-first PDF and document tools for Windows 10 and 11.

> **Status: Phase 4 of 5 (OCR, history, Word conversions).** Every tool in the app is built. Phase 5
> (installer and release) is next.

## Phase documentation

Each phase has a README and a requirements file in `docs/phases/`, explaining how it works and how
it connects to the next phase. Current phase: `docs/phases/phase-4-ocr-history/`.

## Requirements

- Windows 10 or 11 (x64)
- Node.js 22 or newer
- Python 3.12 or newer (development only)
- Tesseract OCR (optional, free): only for OCR
- LibreOffice (optional, free): closer Word to PDF layout, and .doc/.odt/.rtf
- Git

## Setup

```powershell
npm install
npm run engine:setup
npm run dev
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the UI with hot reload and opens the desktop window. Changes under `electron/` or `shared/` need a restart. |
| `npm run typecheck` | Strict TypeScript check for the UI, Electron code and config. |
| `npm run lint` | ESLint. |
| `npm test` | TypeScript unit tests (Vitest). |
| `npm run engine:setup` | Creates `python-engine/.venv` and installs the engine requirements. |
| `npm run engine:test` | Python engine tests (pytest). |
| `npm run engine:check` | Shows which Python packages and optional programs the engine can use. |
| `npm run test:all` | Both test suites. |
| `npm run build` | Typecheck, then build the UI (`dist/`) and Electron code (`dist-electron/`). |
| `npm run start` | Runs the built app with `electron .` (run `npm run build` first). |
| `npm run dist` | Builds the Windows NSIS installer into `release/`. |

## Architecture

```
electron/    Main process: window, security, IPC handlers, settings storage
  ipc/       IPC handler registration (sender check, validation, error mapping)
  services/  Settings store, theme handling
shared/      Types and zod schemas used by both sides (IPC contract, settings)
src/         React UI (renderer)
  app/       Routes and layout
  features/  One folder per feature; registry.ts holds navigation and feature status
  components/, hooks/, lib/, styles/
python-engine/  Python engine: PDF operations, safe output, tests
scripts/     Dev runner, Electron bundling, engine setup
```

Key decisions:

- **Security.** Context isolation and sandbox are on, Node integration is off. The preload script
  exposes a small typed API (`window.docuforge`). Every IPC request is checked to come from the
  app's own page, validated with zod, and answered with a typed `IpcResult`. Navigation, pop-ups
  and permission prompts are blocked. Production builds add a Content Security Policy.
- **Theme.** The preference is applied with Electron's `nativeTheme`, and the CSS follows
  `prefers-color-scheme`. The correct theme is active from the first frame, so there is no flash.
- **Settings.** Stored as JSON in the user data folder, validated on load with safe defaults, and
  written atomically (temp file, then rename).
- **Engine.** Each job runs in its own Python process, talking JSON lines over stdin/stdout. Output is
  written to a temp file, verified, then moved into place; cancelled or failed jobs clean up.
- **Bundling.** `esbuild` bundles the Electron code, `vite` builds the UI. The preload script is a
  single file because it runs in a sandbox.

## Known limitations (Phase 4)

- Not yet run on Windows: dialogs, Tesseract/LibreOffice discovery and the real UI need a check.
- No drag and drop. The installer does not contain the engine yet, so installed builds cannot
  process PDFs until Phase 5. Password-protected PDFs are rejected.
- OCR accuracy is not measured; only English was tested. Built-in Word to PDF keeps content but not
  headers, footers or exact layout. PDF to Word keeps tables only when they have visible lines.
- Default Electron icon; installer is unsigned.

## License

GNU Affero General Public License v3.0 (AGPL-3.0-only). See `LICENSE`.
Third-party licenses will be listed in a notices file before the first release.
