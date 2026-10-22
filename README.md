# DocuForge Desktop

**Powered by RazaZaidi.AI**

A privacy-focused, offline-first Windows application for PDF and document management.

![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue)
![License](https://img.shields.io/badge/License-AGPL--3.0-orange)
![Version](https://img.shields.io/badge/Version-0.5.0a-purple)

## Overview

DocuForge Desktop is a free, open-source document utility designed to simplify everyday PDF and document workflows. It combines a modern desktop interface with a Python-powered processing engine to handle document conversion, PDF organization, OCR, and more.

Unlike cloud-based document tools, DocuForge is designed to process files locally on your computer, helping keep your documents private.

## Features

- **PDF Merge:** Combine multiple PDF files into one document.
- **PDF Split:** Extract custom page ranges, individual pages, or fixed-size chunks.
- **Page Organizer:** Reorder, rotate, and delete PDF pages.
- **PDF Compression:** Reduce file sizes using configurable compression profiles.
- **Document Conversion:** Convert PDF to Word, Word to PDF, images to PDF, PDF pages to images, and text to PDF.
- **Text Extraction:** Extract readable PDF text into TXT files.
- **OCR:** Extract searchable text from scanned PDFs and images using Tesseract OCR.
- **Job History:** Review previous operations, their status, and output locations.
- **Theme Customization:** Switch between Light, Dark, and System themes.

## Privacy & Security

- Local-first document processing.
- No cloud upload required for core document operations.
- Sandboxed Electron environment with context isolation.
- Disabled Node.js integration in the renderer.
- Validated inter-process communication.
- Safe output handling with temporary staging and error recovery.

## Technology Stack

| Technology | Purpose |
|---|---|
| Electron | Windows desktop application |
| React 19 | User interface |
| TypeScript | Type-safe application development |
| Tailwind CSS | UI styling |
| Python | Document processing engine |
| PyMuPDF | PDF manipulation and text extraction |
| Pillow | Image processing |
| pdf2docx | PDF-to-Word conversion |
| python-docx | Word document processing |
| Tesseract OCR | Scanned document text recognition |
| PyInstaller | Standalone Python engine packaging |
| electron-builder | Windows installer generation |

## System Requirements

**For development:**
- Windows 10 or Windows 11 (64-bit)
- Node.js 22 or newer
- Python 3.12 or newer
- Git

Tesseract OCR and LibreOffice are optional dependencies for additional functionality.

## Installation & Development

### 1. Clone the repository

```bash
git clone https://github.com/rsyedmuhammad428-cmd/DocuForge.git
cd DocuForge
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Set up the Python engine

```bash
npm run engine:setup
```

### 4. Launch the application

```bash
npm run dev
```

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the development application |
| `npm run build` | Build the frontend and Electron backend |
| `npm run start` | Run the compiled application |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm test` | Run frontend and shared-code tests |
| `npm run engine:check` | Check Python engine dependencies |
| `npm run engine:test` | Run Python engine tests |
| `npm run test:all` | Run all configured test suites |
| `npm run dist` | Build the Windows installer |

## Build a Windows Installer

Generate a distributable Windows installer with:

```bash
npm run dist
```

The production build is configured to package the Electron application and Python engine into a Windows installer. End users do not need to install Node.js or Python separately.

## Project Structure

```text
DocuForge/
├── electron/          # Electron main process and security
├── src/               # React frontend and feature pages
├── shared/            # Shared types and validation schemas
├── python-engine/     # Python document processing engine
├── scripts/           # Development and build automation
├── docs/              # Architecture and project documentation
├── build/             # Installer assets and scripts
├── package.json
├── electron-builder.yml
└── vite.config.ts
```

## Supported Platforms

Currently targeting **Windows 10 and Windows 11 (64-bit x64)**.

## License

DocuForge Desktop is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**.

See [LICENSE](LICENSE) for the full license text.

## Author

**Syed Muhammad Raza Zaidi**

- GitHub: [@rsyedmuhammad428-cmd](https://github.com/rsyedmuhammad428-cmd)
- Portfolio: [Visit Portfolio](https://rsyedmuhammad428-cmd.github.io/Portfolio/#home)

---

*DocuForge Desktop — Your documents, your device, your privacy.*
