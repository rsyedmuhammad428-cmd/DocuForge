================================================================================
                           DOCUFORGE DESKTOP
                  "DocuForge - Powered by RazaZaidi.AI"
================================================================================

Version:       0.5.0a
Target OS:     Windows 10 / Windows 11 (64-bit x64)
License:       GNU Affero General Public License v3.0 (AGPL-3.0-only)
Repository:    https://github.com/rsyedmuhammad428-cmd/DocuForge.git
Description:   Free, open-source, offline-first PDF and document manipulation
               suite for Windows with a high-performance native Python engine
               and a modern desktop UI.


--------------------------------------------------------------------------------
1. PROJECT OVERVIEW & CORE PHILOSOPHY
--------------------------------------------------------------------------------
DocuForge Desktop provides an all-in-one, privacy-focused alternative to cloud
document manipulation platforms (such as Smallpdf or iLovePDF). 

Key Principles:
- 100% Offline & Private: Documents never leave your computer. No telemetry,
  no cloud servers, no analytics, no network calls.
- Native Performance: PDF processing runs in an isolated Python engine powered
  by MuPDF (C library) for ultra-fast manipulation.
- Safe File Operations: Atomic operations, isolated temporary staging files,
  and cleanup on error/cancellation prevent data corruption.
- Zero-Setup End Users: Bundled via PyInstaller and electron-builder into a
  single Windows NSIS installer—end users do NOT need Python or Node.js.


--------------------------------------------------------------------------------
2. COMPLETE TECHNOLOGY STACK
--------------------------------------------------------------------------------

A. FRONTEND & UI (Renderer Process)
   - Framework:           React 19.3.1 (React 19)
   - Language:            TypeScript 6.0.3 (Strict mode, ESM)
   - Build Tool & Server: Vite 8.3.4 (@vitejs/plugin-react 6.1.2)
   - Styling:             Tailwind CSS 4.3.3 (@tailwindcss/vite)
   - Icons:               Lucide React 1.59.0
   - Routing:             React Router 8.4.0
   - Schema Validation:   Zod 4.6.7 (Runtime validation for IPC and settings)
   - Component Testing:   @testing-library/react 16.3.3, @testing-library/dom 10.4.2

B. DESKTOP SHELL & HARDWARE BRIDGE (Electron Process)
   - Runtime:             Electron 44.9.0
   - Code Bundler:        esbuild 0.28.2 (Fast TypeScript compilation for main & preload)
   - Security Model:
     * contextIsolation: true
     * sandbox: true
     * nodeIntegration: false
     * Context Bridge API: window.docuforge
     * Strict CSP (Content Security Policy) on production builds
     * Popups, arbitrary navigation, and permission prompts strictly blocked
   - Inter-Process Comm:  Typed IPC channels with strict Zod schema checking
   - Storage Layer:       Atomic JSON stores (SettingsStore, HistoryStore)

C. DOCUMENT PROCESSING ENGINE (Python Backend)
   - Core Runtime:        Python 3.12+ (isolated venv in dev; standalone in release)
   - Packaging Engine:    PyInstaller 6.22.3 (bundles engine into standalone executable)
   - IPC Mechanism:       JSON-lines protocol over standard input/output (stdin/stdout)
                          with streaming progress events and cooperative task cancellation

D. PACKAGING, INSTALLER & DEPLOYMENT
   - Installer Framework: electron-builder 26.15.3 (NSIS x64 Target)
   - Installer Script:    Custom NSIS script (build/installer.nsh)
                          * Welcome page with custom sidebar
                          * License agreement acceptance
                          * Custom installation folder selector
                          * Custom Desktop & Start Menu shortcut options
                          * Pre-flight engine self-check (docuforge-engine.exe --check)
                          * Clean uninstallation with app data cleanup option
   - Graphics:            Pillow script for installer bitmaps (installerHeader.bmp, installerSidebar.bmp)


--------------------------------------------------------------------------------
3. FULL PACKAGE & DEPENDENCY MANIFEST
--------------------------------------------------------------------------------

[Node.js / npm Dependencies] (package.json)
--------------------------------------------------------------------------------
Package                       Version     Purpose / Role
--------------------------------------------------------------------------------
react                         19.3.1      Declarative UI library
react-dom                     19.3.1      React DOM renderer
react-router                  8.4.0       Client-side declarative routing
lucide-react                  1.59.0      Icon package for UI controls
tailwindcss                   4.3.3       Utility-first CSS styling framework
@tailwindcss/vite             4.3.3       Vite plugin for Tailwind CSS v4
zod                           4.6.7       Schema declaration and data validation
electron                      44.9.0      Chromium + Node.js desktop app framework
electron-builder              26.15.3     Windows packaging and NSIS installer creation
vite                          8.3.4       Next-generation frontend dev server & bundler
@vitejs/plugin-react          6.1.2       Vite plugin for React fast refresh
esbuild                       0.28.2      Extremely fast bundler used for Electron main/preload
typescript                    6.0.3       Typed JavaScript development
typescript-eslint             8.71.2      TypeScript linting rules for ESLint
eslint                        10.13.0     Linter for JS/TS codebases
@eslint/js                    10.0.1      ESLint recommended rules
eslint-plugin-react-hooks     7.1.1       React hooks rules enforcement
vitest                        5.0.5       High-speed unit test runner
jsdom                         30.1.3      DOM simulation for headless testing
@testing-library/react        16.3.3      React component testing utilities
@testing-library/dom          10.4.2      Core DOM testing utilities
@types/react                  19.3.0      TypeScript definitions for React
@types/react-dom              19.3.0      TypeScript definitions for React DOM
@types/node                   26.6.5      TypeScript definitions for Node.js
globals                       17.13.0     Global identifiers for ESLint


[Python Engine Runtime Dependencies] (python-engine/requirements.txt)
--------------------------------------------------------------------------------
Package                       Version     License         Purpose / Role
--------------------------------------------------------------------------------
PyMuPDF                       >=1.28,<2   AGPL-3.0        High-speed PDF manipulation:
                                                          merge, split, reorder, rotate,
                                                          delete pages, render thumbnails,
                                                          compression, extract text/images
Pillow                        >=13,<14    HPND            Image processing: format conversion,
                                                          rescaling, and Images-to-PDF
pdf2docx                      >=0.5.13    MIT             Converts PDF documents to editable
                                                          Word (.docx) files (layout parsing)
mammoth                       >=1.13,<2   BSD-2-Clause    Converts Word (.docx) to HTML/PDF
                                                          without needing LibreOffice
python-docx                   >=1.2,<2    MIT             Low-level reading and manipulating
                                                          Word .docx document trees
pytest                        >=9,<10     MIT             Test framework for Python engine


[Python Engine Build-Time Dependencies] (python-engine/requirements-build.txt)
--------------------------------------------------------------------------------
Package                       Version     License         Purpose / Role
--------------------------------------------------------------------------------
pyinstaller                   >=6.22,<7   GPL-2.0+        Compiles Python engine into a
                                          (Exception)     standalone binary (docuforge-engine.exe)
pip-licenses                  >=5.5,<6    MIT             Extracts and formats all 3rd-party
                                                          licenses for redistribution notices


[Optional System Dependencies]
--------------------------------------------------------------------------------
Software                      Status      Purpose / Role
--------------------------------------------------------------------------------
Tesseract OCR                 Optional    Enables Optical Character Recognition to
                                          extract text from scanned images and PDFs.
                                          Can be pre-bundled in build/bundled-tools/tesseract
                                          or detected from system PATH.
LibreOffice                   Optional    Provides pixel-perfect Word to PDF conversion
                                          and support for legacy .doc, .odt, and .rtf files.


--------------------------------------------------------------------------------
4. COMPLETE FEATURE SET & TOOLS
--------------------------------------------------------------------------------

1. PDF Merging:
   - Combine multiple PDF documents into a single document.
   - Reorder input files dynamically with live page count summaries.

2. PDF Splitting:
   - Split by custom page ranges (e.g., 1-5, 8, 11-14).
   - Split into individual single-page PDF files.
   - Split into fixed chunks of N pages.

3. PDF Page Organization:
   - Visual interactive thumbnail grid of all pages.
   - Reorder pages via drag-and-drop or positioning controls.
   - Rotate individual pages clockwise (90 deg), counter-clockwise, or 180 deg.
   - Delete unnecessary or blank pages before saving.

4. PDF Compression:
   - Multiple compression profiles (High, Medium, Low).
   - Downsamples high-resolution embedded images and cleans unused streams.

5. Document & File Conversion:
   - PDF to Word (.docx): Converts PDF layouts into editable Word files.
   - Word (.docx) to PDF: Converts documents to PDF using built-in Mammoth engine
     or optional LibreOffice for advanced formatting.
   - PDF to Images: Extracts pages as standalone PNG or JPEG images.
   - Images to PDF: Merges image sets (PNG, JPEG, WebP, TIFF, BMP) into a clean PDF.
   - PDF to Text: Extracts all readable text into UTF-8 .txt files.
   - Text to PDF: Generates formatted PDFs from plain text files.
   - Legacy Office Support: Converts .doc, .odt, and .rtf when LibreOffice is present.

6. OCR (Optical Character Recognition):
   - Extracts selectable and searchable text from scanned PDFs and raster images.
   - Auto-detects local Tesseract installations or bundled OCR runtimes.

7. Recent Jobs & Execution History:
   - Full history log tracking input files, output files, duration, and status.
   - Direct shortcuts to open destination folders or launch output files in Windows.

8. Customization & Settings:
   - Complete Light, Dark, and System theme synchronisation with zero flicker.
   - Configurable default output directories and file collision handling.


--------------------------------------------------------------------------------
5. PROJECT DIRECTORY STRUCTURE
--------------------------------------------------------------------------------

DocuForge-Desktop1/
|-- .github/                      GitHub Actions CI/CD workflows (release builds)
|-- build/                        Installer assets, graphics, and NSIS scripts
|   |-- bundled-tools/            Drop-in directory for optional tools (e.g. Tesseract)
|   |-- icon.ico                  Application Windows icon
|   |-- installer.nsh             Custom NSIS script defining installer wizard pages
|   |-- installerHeader.bmp       Wizard header branding banner
|   |-- installerSidebar.bmp      Wizard left-hand branding panel
|   |-- license.txt               License text displayed in the installer wizard
|   `-- THIRD_PARTY_NOTICES.txt   Combined legal notices of all included libraries
|-- dist/                         Compiled React renderer output (HTML, JS, CSS)
|-- dist-electron/                Compiled Electron main and preload scripts
|-- docs/                         Full project phase specifications and documentation
|   `-- phases/                   Phases 1 through 6 architectural documentation
|-- electron/                     Electron process backend
|   |-- ipc/                      IPC registration, security boundaries, and handlers
|   |-- services/                 JobManager, EngineProcess, Stores, Settings, TempSweep
|   |-- main.ts                   Electron main entry point (window lifecycle, CSP)
|   |-- preload.ts                ContextBridge sandboxed preload script
|   `-- security.ts               Security rules and policy enforcements
|-- python-engine/                Native Python processing engine
|   |-- docuforge_engine/         Core engine package
|   |   |-- convert/              Conversion modules (pdf_to_docx, ocr, images, text)
|   |   |-- pdf_tools/            PDF manipulation modules (merge, split, organize, etc.)
|   |   |-- operations.py         Engine operation router and execution dispatch
|   |   |-- safe_output.py        Atomic output writer with temp staging and rollback
|   |   `-- tools.py              Detection for Tesseract OCR and LibreOffice
|   |-- tests/                    Pytest test suite for engine verification
|   |-- docuforge-engine.spec     PyInstaller build specification
|   |-- engine_main.py            Engine CLI entry point
|   |-- requirements.txt          Python runtime dependencies
|   `-- requirements-build.txt    Python build-only dependencies
|-- release/                      Output directory for generated NSIS installer (.exe)
|-- scripts/                      Node.js and Python automation scripts
|   |-- build-electron.mjs        Builds Electron main and preload with esbuild
|   |-- build-engine.mjs          Builds standalone Python engine via PyInstaller
|   |-- dev.mjs                   Development runner with hot-reloading
|   |-- generate-notices.mjs      Aggregates licenses into THIRD_PARTY_NOTICES.txt
|   |-- make-icons.py             Generates BMP wizard images from source icon
|   |-- setup-engine.mjs          Initializes python-engine virtual environment
|   `-- smoke-engine.mjs          Verification script for bundled engine
|-- shared/                       Shared TypeScript contracts, types, and Zod schemas
|   |-- engine-protocol.ts        Engine stdin/stdout protocol message schemas
|   |-- ipc.ts                    Typed IPC request and response interfaces
|   |-- jobs.ts                   Job request specifications and schemas
|   `-- settings.ts               Settings structure and defaults
|-- src/                          Frontend React application
|   |-- app/                      App root, routing, and layout wrappers
|   |-- components/               Shared reusable UI components (Buttons, Badges, Modals)
|   |-- features/                 Feature pages (merge, split, organize, convert, ocr, settings)
|   |-- hooks/                    Custom React hooks (useJobs, useSettings, useSingleFile)
|   |-- lib/                      Bridge helpers, formatting utilities
|   |-- styles/                   Tailwind CSS root stylesheets
|   `-- main.tsx                  React entry point
|-- electron-builder.yml          Electron-builder NSIS packaging configuration
|-- package.json                  Node.js configuration, scripts, and dependencies
|-- tsconfig.json                 TypeScript root configuration
`-- vite.config.ts                Vite build configuration with Tailwind and React


--------------------------------------------------------------------------------
6. PREREQUISITES & DEVELOPMENT SETUP
--------------------------------------------------------------------------------

System Requirements for Developers:
- Windows 10 or 11 (64-bit x64)
- Node.js version 22 or newer (includes npm)
- Python version 3.12 or newer (ensure "Add python.exe to PATH" is checked)
- Git

Step-by-Step Installation:
1. Clone the repository:
   git clone https://github.com/rsyedmuhammad428-cmd/DocuForge.git
   cd DocuForge

2. Install Node.js packages:
   npm ci
   (or npm install)

3. Set up the Python engine environment:
   npm run engine:setup
   This creates python-engine/.venv and installs all runtime requirements.

4. Start development mode:
   npm run dev
   This launches the Vite development server with hot-reloading and starts
   Electron with the sandboxed window.


--------------------------------------------------------------------------------
7. AVAILABLE CLI SCRIPTS & COMMANDS
--------------------------------------------------------------------------------

Command                 Description
--------------------------------------------------------------------------------
npm run dev             Starts the Vite development server and launches Electron.
npm run build           Compiles React frontend (Vite) and Electron backend (esbuild).
npm run start           Runs the compiled desktop app using Electron.
npm run typecheck       Executes strict TypeScript checking across app, electron & node.
npm run lint            Runs ESLint across the codebase.
npm test                Runs the frontend and shared TypeScript test suite with Vitest.
npm run engine:setup    Sets up the Python virtual environment and installs dependencies.
npm run engine:check    Checks and reports status of Python packages, OCR & LibreOffice.
npm run engine:test     Executes Python engine unit and integration tests with pytest.
npm run engine:smoke    Performs a quick smoke check on the compiled Python engine.
npm run engine:build    Compiles the Python engine into a standalone Windows binary via PyInstaller.
npm run test:all        Runs both Vitest (TypeScript) and Pytest (Python) test suites.
npm run notices         Generates third-party license notices file.
npm run icons           Regenerates installer branding images from source icon assets.
npm run dist            Full production pipeline: builds UI, builds Electron, compiles
                        the Python engine, generates legal notices, and creates the
                        final Windows NSIS installer in release/ folder.


--------------------------------------------------------------------------------
8. PRODUCTION BUILD & RELEASE ARTIFACTS
--------------------------------------------------------------------------------

To generate the standalone Windows installer:
   npm run dist

Generated Outputs:
- Installer Executable: release/DocuForge-Setup-0.5.0.exe
- Standalone Engine:    python-engine/dist/docuforge-engine/docuforge-engine.exe
- Packaged App ASAR:    release/win-unpacked/resources/app.asar

End-User Experience:
- Users download and run DocuForge-Setup-0.5.0.exe.
- The branded installer installs DocuForge, writes Start Menu / Desktop shortcuts,
  validates the engine, and allows immediate launch.
- No Python, Node.js, or external runtimes are required on the client machine.


--------------------------------------------------------------------------------
9. LICENSING & LEGAL NOTICES
--------------------------------------------------------------------------------
DocuForge Desktop is released under the GNU Affero General Public License v3.0
(AGPL-3.0-only). 

All third-party open-source components, including Electron (MIT), React (MIT),
PyMuPDF (AGPL-3.0), Pillow (HPND), pdf2docx (MIT), mammoth (BSD-2-Clause),
python-docx (MIT), and others are documented in full within THIRD_PARTY_NOTICES.txt.
================================================================================
